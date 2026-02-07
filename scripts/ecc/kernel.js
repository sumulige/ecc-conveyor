const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { EXPECTED_PROTOCOL, validateProtocolVersionOutput } = require('./kernel-contract');

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch (_err) {
    return false;
  }
}

function getKernelMode() {
  // ECC_KERNEL:
  // - "auto" (default): use ecc-kernel if available, else fallback to JS
  // - "rust": require ecc-kernel, error if missing
  // - "node": force JS implementation
  const raw = process.env.ECC_KERNEL ? String(process.env.ECC_KERNEL).trim().toLowerCase() : 'auto';
  if (!raw || raw === 'auto') return 'auto';
  if (raw === 'rust' || raw === 'kernel') return 'rust';
  if (raw === 'node' || raw === 'js' || raw === 'off' || raw === 'disable') return 'node';
  return 'auto';
}

function binName() {
  return process.platform === 'win32' ? 'ecc-kernel.exe' : 'ecc-kernel';
}

function platformArchKey() {
  const platform = process.platform;
  const arch = process.arch;
  const os =
    platform === 'darwin' ? 'darwin' :
      platform === 'linux' ? 'linux' :
        platform === 'win32' ? 'windows' :
          null;
  const cpu =
    arch === 'x64' ? 'x64' :
      arch === 'arm64' ? 'arm64' :
        null;
  if (!os || !cpu) return null;
  return `${os}-${cpu}`;
}

function tryKernelFromPath() {
  const res = spawnSync('ecc-kernel', ['--version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (res.error) {
    // ENOENT means not on PATH; treat as no candidate.
    if (res.error && res.error.code === 'ENOENT') return null;
    // Other spawn errors still indicate an attemptable candidate (will be probed for a better error).
    return 'ecc-kernel';
  }
  return 'ecc-kernel';
}

function runKernelJson(bin, command, inputObj) {
  const res = spawnSync(bin, [command], {
    encoding: 'utf8',
    input: JSON.stringify(inputObj || {}),
    stdio: ['pipe', 'pipe', 'pipe']
  });

  if (res.error) return { ok: false, error: `spawn failed: ${res.error.message}` };
  const stdout = (res.stdout || '').trim();
  const stderr = (res.stderr || '').trim();

  if (res.status !== 0) {
    const detail = stderr ? `stderr: ${stderr}` : (stdout ? `stdout: ${stdout}` : '');
    return { ok: false, error: `exit ${res.status}${detail ? ` (${detail})` : ''}` };
  }

  if (!stdout) return { ok: false, error: 'empty stdout' };
  try {
    return { ok: true, value: JSON.parse(stdout) };
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    return { ok: false, error: `non-JSON stdout (${msg})` };
  }
}

function probeKernel(bin) {
  const res = runKernelJson(bin, 'protocol.version', {});
  if (!res.ok) return { ok: false, error: `protocol.version failed: ${res.error}` };

  const errors = validateProtocolVersionOutput(res.value, { expectedProtocol: EXPECTED_PROTOCOL });
  if (errors.length) {
    return { ok: false, error: `invalid protocol.version output: ${errors.join('; ')}` };
  }

  return {
    ok: true,
    protocol: res.value.protocol,
    kernelVersion: res.value.kernelVersion,
    commands: res.value.commands
  };
}

function candidateList() {
  const candidates = [];

  if (process.env.ECC_KERNEL_PATH) {
    candidates.push({
      label: 'ECC_KERNEL_PATH',
      bin: path.resolve(String(process.env.ECC_KERNEL_PATH)),
      requiresFile: true,
      explicit: true
    });
  }

  // Preferred location for prebuilt binaries installed via postinstall.
  const key = platformArchKey();
  if (key) {
    candidates.push({
      label: 'package',
      bin: path.join(__dirname, 'bin', key, binName()),
      requiresFile: true,
      explicit: false
    });
  }

  // PATH lookup.
  const fromPath = tryKernelFromPath();
  if (fromPath) {
    candidates.push({ label: 'PATH', bin: fromPath, requiresFile: false, explicit: false });
  }

  // Local dev build (repo).
  const root = path.resolve(__dirname, '..', '..');
  candidates.push({
    label: 'repo-release',
    bin: path.join(root, 'crates', 'ecc-kernel', 'target', 'release', binName()),
    requiresFile: true,
    explicit: false
  });
  candidates.push({
    label: 'repo-debug',
    bin: path.join(root, 'crates', 'ecc-kernel', 'target', 'debug', binName()),
    requiresFile: true,
    explicit: false
  });

  const seen = new Set();
  return candidates.filter(c => {
    if (seen.has(c.bin)) return false;
    seen.add(c.bin);
    return true;
  });
}

function selectCompatibleKernel({ mode }) {
  const candidates = candidateList();
  const errors = [];

  for (const c of candidates) {
    if (c.requiresFile && !isFile(c.bin)) {
      if (c.explicit && mode === 'rust') {
        throw new Error(`ECC kernel required but ECC_KERNEL_PATH is not a file: ${c.bin}`);
      }
      continue;
    }

    const probe = probeKernel(c.bin);
    if (probe.ok) return { enabled: true, bin: c.bin, ...probe };

    errors.push(`${c.label}: ${probe.error}`);
    if (c.explicit && mode === 'rust') break;
  }

  if (mode === 'rust') {
    const detail = errors.length ? `\n\nHandshake errors:\n- ${errors.join('\n- ')}` : '';
    throw new Error(
      'ECC kernel required but not found or incompatible.\n' +
        'Install or build a compatible ecc-kernel, then re-run, or set ECC_KERNEL=node to force JS fallback.' +
        detail
    );
  }

  // mode=auto: fall back to JS. If we saw a kernel but it was incompatible, keep the reason for doctor output.
  return { enabled: false, bin: null, reason: errors.length ? errors[0] : null };
}

let _cached = null;

function getKernel() {
  if (_cached) return _cached;

  const mode = getKernelMode();
  if (mode === 'node') {
    _cached = { mode, enabled: false, bin: null, reason: null };
    return _cached;
  }

  const selected = selectCompatibleKernel({ mode });
  if (!selected.enabled) {
    _cached = { mode, enabled: false, bin: null, reason: selected.reason };
    return _cached;
  }

  _cached = {
    mode,
    enabled: true,
    bin: selected.bin,
    protocol: selected.protocol,
    kernelVersion: selected.kernelVersion,
    commands: selected.commands,
    reason: null
  };
  return _cached;
}

function runKernel(command, inputObj) {
  const kernel = getKernel();
  if (!kernel.enabled) return null;

  const res = spawnSync(kernel.bin, [command], {
    encoding: 'utf8',
    input: JSON.stringify(inputObj),
    stdio: ['pipe', 'pipe', 'pipe']
  });

  if (res.error) {
    throw new Error(`ecc-kernel spawn failed: ${res.error.message}`);
  }
  const stdout = (res.stdout || '').trim();
  const stderr = (res.stderr || '').trim();
  if (res.status !== 0) {
    const msg = [
      `ecc-kernel ${command} failed (exit ${res.status})`,
      stderr ? `stderr:\n${stderr}` : null,
      stdout ? `stdout:\n${stdout}` : null
    ]
      .filter(Boolean)
      .join('\n\n');
    throw new Error(msg);
  }

  if (!stdout) return {};
  try {
    return JSON.parse(stdout);
  } catch (err) {
    const detail = err && err.message ? err.message : String(err);
    throw new Error(`ecc-kernel returned non-JSON output (${detail}). Raw:\n${stdout.slice(0, 2000)}`);
  }
}

module.exports = {
  getKernel,
  runKernel,
  validateProtocolVersionOutput
};
