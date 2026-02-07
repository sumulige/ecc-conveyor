function isObj(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isInt(v) {
  return Number.isInteger(v);
}

const EXPECTED_PROTOCOL = 1;

// Commands that the Node engine expects the Rust kernel to support.
const REQUIRED_COMMANDS = [
  'worktree.ensure',
  'worktree.remove',
  'patch.apply',
  'git.commit_all',
  'verify.run',
  'protocol.version',
  'repo.info'
];

function validateProtocolVersionOutput(obj, { expectedProtocol = EXPECTED_PROTOCOL } = {}) {
  const errors = [];
  if (!isObj(obj)) return ['expected object'];

  if (obj.version !== 1) errors.push('expected version: 1');

  if (!isInt(obj.protocol)) errors.push('expected protocol: integer');
  else if (obj.protocol !== expectedProtocol) errors.push(`protocol mismatch: expected ${expectedProtocol}, got ${obj.protocol}`);

  if (typeof obj.kernelVersion !== 'string' || !obj.kernelVersion.trim()) errors.push('expected kernelVersion: non-empty string');

  if (!Array.isArray(obj.commands)) {
    errors.push('expected commands: array');
  } else {
    const missing = REQUIRED_COMMANDS.filter(c => !obj.commands.includes(c));
    if (missing.length) errors.push(`missing commands: ${missing.join(', ')}`);
  }

  return errors;
}

function validateRepoInfoOutput(obj) {
  const errors = [];
  if (!isObj(obj)) return ['expected object'];

  if (obj.version !== 1) errors.push('expected version: 1');

  if (obj.repoRoot !== null && typeof obj.repoRoot !== 'string') errors.push('expected repoRoot: string|null');
  if (typeof obj.branch !== 'string') errors.push('expected branch: string');
  if (typeof obj.sha !== 'string') errors.push('expected sha: string');
  if (typeof obj.clean !== 'boolean') errors.push('expected clean: boolean');

  return errors;
}

module.exports = {
  EXPECTED_PROTOCOL,
  REQUIRED_COMMANDS,
  validateProtocolVersionOutput,
  validateRepoInfoOutput
};

