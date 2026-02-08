const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const TEXT_EXTS = new Set([
  '.c',
  '.cc',
  '.cfg',
  '.cpp',
  '.css',
  '.csv',
  '.go',
  '.h',
  '.html',
  '.java',
  '.js',
  '.json',
  '.jsx',
  '.lock',
  '.md',
  '.mdx',
  '.mjs',
  '.rs',
  '.sh',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml'
]);

function toPosixPath(p) {
  return p.split(path.sep).join('/');
}

function relFromRepo(absPath) {
  return toPosixPath(path.relative(REPO_ROOT, absPath));
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function tryReadText(filePath) {
  try {
    return readText(filePath);
  } catch {
    return null;
  }
}

function listDir(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function extractFrontmatterMap(markdown) {
  const clean = markdown.replace(/^\uFEFF/, ''); // Strip UTF-8 BOM if present
  const match = clean.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) return null;

  const map = {};
  const lines = match[1].split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx <= 0) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key) map[key] = value;
  }
  return map;
}

function firstMarkdownHeading(markdown) {
  const clean = markdown.replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^#\s+(.*)\s*$/);
    if (m) return m[1].trim();
  }
  return null;
}

function safeJsonParse(jsonText, contextLabel) {
  try {
    return JSON.parse(jsonText);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    throw new Error(`Invalid JSON in ${contextLabel}: ${msg}`);
  }
}

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function readForDigest(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  if (!TEXT_EXTS.has(ext)) return fs.readFileSync(absPath);
  const s = fs.readFileSync(absPath, 'utf8').replace(/\r\n/g, '\n');
  return Buffer.from(s, 'utf8');
}

function hashFile(absPath) {
  return sha256Hex(readForDigest(absPath));
}

function walkFiles(absDir, { ignoreDirs = [] } = {}) {
  const out = [];
  const ignore = new Set(ignoreDirs);

  function rec(dirAbs) {
    for (const ent of listDir(dirAbs)) {
      const abs = path.join(dirAbs, ent.name);
      if (ent.isDirectory()) {
        if (ignore.has(ent.name)) continue;
        rec(abs);
        continue;
      }
      if (ent.isFile()) out.push(abs);
    }
  }

  rec(absDir);
  return out;
}

function hashDirTree(absDir) {
  const h = crypto.createHash('sha256');
  const files = walkFiles(absDir, { ignoreDirs: ['node_modules', '.git', '.cache', 'dist', 'build'] })
    .map(f => ({ abs: f, rel: toPosixPath(path.relative(absDir, f)) }))
    .filter(f => f.rel && !f.rel.startsWith('../'))
    .sort((a, b) => a.rel.localeCompare(b.rel));

  for (const f of files) {
    h.update(f.rel);
    h.update('\0');
    h.update(readForDigest(f.abs));
    h.update('\0');
  }

  return h.digest('hex');
}

function git(args, { cwd = REPO_ROOT } = {}) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    const stderr = (res.stderr || '').trim();
    throw new Error(`git ${args.join(' ')} failed (${res.status}): ${stderr || 'unknown error'}`);
  }
  return (res.stdout || '').trim();
}

function tryParseRepoFromUrl(url) {
  const u = String(url || '').trim();
  if (!u) return null;

  // Examples:
  // - https://github.com/sumulige/ecc-conveyor.git
  // - git+https://github.com/sumulige/ecc-conveyor.git
  // - git@github.com:sumulige/ecc-conveyor.git
  // - ssh://git@github.com/sumulige/ecc-conveyor.git
  const m = u.match(/github\.com[:/]+([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (!m) return null;
  return { owner: m[1], name: m[2] };
}

function getRepoMeta() {
  const sha = git(['rev-parse', 'HEAD']);
  const generatedAt = git(['log', '-1', '--format=%cI', 'HEAD']);

  // Deterministic source for owner/name: prefer package.json (tracked).
  let owner = null;
  let name = null;
  try {
    const pkg = safeJsonParse(readText(path.join(REPO_ROOT, 'package.json')), 'package.json');
    const repoUrl = (pkg && pkg.repository && pkg.repository.url) || '';
    const parsed = tryParseRepoFromUrl(repoUrl);
    if (parsed) ({ owner, name } = parsed);
  } catch {
    // ignore
  }

  if (!owner || !name) {
    try {
      const origin = git(['remote', 'get-url', 'origin']);
      const parsed = tryParseRepoFromUrl(origin);
      if (parsed) ({ owner, name } = parsed);
    } catch {
      // ignore
    }
  }

  owner = owner || process.env.STUDIO_REPO_OWNER || 'sumulige';
  name = name || process.env.STUDIO_REPO_NAME || 'ecc-conveyor';

  const defaultBranch = process.env.STUDIO_DEFAULT_BRANCH || 'main';
  const tag = process.env.STUDIO_REGISTRY_TAG || null;

  return {
    generatedAt,
    repo: { owner, name, defaultBranch, sha, tag }
  };
}

function buildAgents() {
  const agentsDir = path.join(REPO_ROOT, 'agents');
  const entries = listDir(agentsDir).filter(e => e.isFile() && e.name.endsWith('.md'));

  const agents = [];
  for (const entry of entries) {
    const absPath = path.join(agentsDir, entry.name);
    const markdown = readText(absPath);
    const fm = extractFrontmatterMap(markdown) || {};

    const name = (fm.name || path.basename(entry.name, '.md')).trim();
    const description = (fm.description || '').trim() || null;

    agents.push({
      id: `agent:${name}`,
      type: 'agent',
      name,
      description,
      model: (fm.model || '').trim() || null,
      tools: (fm.tools || '').trim() || null,
      path: relFromRepo(absPath),
      digest: hashFile(absPath)
    });
  }

  agents.sort((a, b) => a.id.localeCompare(b.id));
  return agents;
}

function buildCommands() {
  const commandsDir = path.join(REPO_ROOT, 'commands');
  const entries = listDir(commandsDir).filter(e => e.isFile() && e.name.endsWith('.md'));

  const commands = [];
  for (const entry of entries) {
    const absPath = path.join(commandsDir, entry.name);
    const markdown = readText(absPath);
    const fm = extractFrontmatterMap(markdown) || {};

    const name = path.basename(entry.name, '.md');
    const description = (fm.description || '').trim() || null;

    commands.push({
      id: `command:${name}`,
      type: 'command',
      name,
      description,
      path: relFromRepo(absPath),
      digest: hashFile(absPath)
    });
  }

  commands.sort((a, b) => a.id.localeCompare(b.id));
  return commands;
}

function buildSkills() {
  const skillsDir = path.join(REPO_ROOT, 'skills');
  const entries = listDir(skillsDir).filter(e => e.isDirectory());

  const skills = [];
  for (const entry of entries) {
    const skillDir = path.join(skillsDir, entry.name);
    const skillMd = path.join(skillDir, 'SKILL.md');
    const markdown = tryReadText(skillMd);
    if (!markdown) continue;

    const fm = extractFrontmatterMap(markdown) || {};
    const name = (fm.name || entry.name).trim();
    const description = (fm.description || '').trim() || null;

    skills.push({
      id: `skill:${name}`,
      type: 'skill',
      name,
      description,
      path: relFromRepo(skillDir),
      entrypoint: relFromRepo(skillMd),
      digest: hashDirTree(skillDir)
    });
  }

  skills.sort((a, b) => a.id.localeCompare(b.id));
  return skills;
}

function buildRules() {
  const rulesDir = path.join(REPO_ROOT, 'rules');
  const entries = [];

  function walk(dirAbs) {
    for (const ent of listDir(dirAbs)) {
      const absPath = path.join(dirAbs, ent.name);
      if (ent.isDirectory()) {
        walk(absPath);
        continue;
      }
      if (ent.isFile() && ent.name.endsWith('.md')) entries.push(absPath);
    }
  }

  walk(rulesDir);

  const rules = [];
  for (const absPath of entries) {
    const markdown = readText(absPath);
    const title = firstMarkdownHeading(markdown) || path.basename(absPath, '.md');
    const rel = relFromRepo(absPath);

    // Normalize rule id as rule:<category>/<name>
    const parts = rel.split('/');
    const idx = parts.indexOf('rules');
    const tail = idx >= 0 ? parts.slice(idx + 1) : parts;
    const slug = tail.join('/').replace(/\.md$/, '');

    rules.push({
      id: `rule:${slug}`,
      type: 'rule',
      name: title,
      description: null,
      path: rel,
      digest: hashFile(absPath)
    });
  }

  rules.sort((a, b) => a.id.localeCompare(b.id));
  return rules;
}

function buildPacks() {
  const packsDir = path.join(REPO_ROOT, 'packs');
  const entries = listDir(packsDir).filter(e => e.isFile() && e.name.endsWith('.json'));

  const packs = [];
  for (const entry of entries) {
    const absPath = path.join(packsDir, entry.name);
    const raw = readText(absPath);
    const data = safeJsonParse(raw, relFromRepo(absPath));

    const id = typeof data.id === 'string' ? data.id.trim() : '';
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    const description = typeof data.description === 'string' ? data.description.trim() : '';
    const modules = Array.isArray(data.modules) ? data.modules.filter(m => typeof m === 'string') : [];
    const tags = Array.isArray(data.tags) ? data.tags.filter(t => typeof t === 'string') : [];

    if (!id || !name || !description || modules.length === 0) {
      throw new Error(`Invalid pack: ${relFromRepo(absPath)} (expected id/name/description/modules[])`);
    }

    // Canonical digest to avoid platform whitespace/EOL diffs.
    const digest = sha256Hex(
      Buffer.from(JSON.stringify({ id, name, description, tags, modules }), 'utf8')
    );

    packs.push({
      id,
      name,
      description,
      modules,
      tags,
      path: relFromRepo(absPath),
      digest
    });
  }

  packs.sort((a, b) => a.id.localeCompare(b.id));
  return packs;
}

function assertPackModuleReferences(packs, moduleIndex) {
  const missing = [];
  for (const pack of packs) {
    for (const mod of pack.modules) {
      if (!moduleIndex.has(mod)) missing.push({ pack: pack.id, module: mod });
    }
  }

  if (missing.length) {
    const lines = missing.map(m => `- ${m.pack}: ${m.module}`).join('\n');
    throw new Error(`Pack references unknown module ids:\n${lines}`);
  }
}

function buildRegistryObject() {
  const { generatedAt, repo } = getRepoMeta();

  const agents = buildAgents();
  const commands = buildCommands();
  const skills = buildSkills();
  const rules = buildRules();
  const packs = buildPacks();

  const moduleIndex = new Set([
    ...agents.map(m => m.id),
    ...commands.map(m => m.id),
    ...skills.map(m => m.id),
    ...rules.map(m => m.id)
  ]);

  assertPackModuleReferences(packs, moduleIndex);

  return {
    version: 1,
    generatedAt,
    repo,
    stats: {
      agents: agents.length,
      commands: commands.length,
      skills: skills.length,
      rules: rules.length,
      packs: packs.length
    },
    packs,
    modules: { agents, commands, skills, rules }
  };
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

module.exports = {
  REPO_ROOT,
  relFromRepo,
  safeJsonParse,
  buildRegistryObject,
  ensureParentDir,
  buildPacks,
  buildAgents,
  buildCommands,
  buildSkills,
  buildRules,
  assertPackModuleReferences
};

