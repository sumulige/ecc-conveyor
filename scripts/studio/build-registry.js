#!/usr/bin/env node
/**
 * Build a deterministic JSON registry for Paradigm Studio.
 *
 * Usage:
 *   node scripts/studio/build-registry.js
 *   node scripts/studio/build-registry.js --out apps/studio/data/registry.json
 *   node scripts/studio/build-registry.js --check
 */

const fs = require('fs');
const path = require('path');

const { REPO_ROOT, buildRegistryObject, ensureParentDir } = require('./registry-lib');

function canonicalize(v) {
  if (Array.isArray(v)) return v.map(canonicalize);
  if (!v || typeof v !== 'object') return v;
  const out = {};
  for (const k of Object.keys(v).sort()) out[k] = canonicalize(v[k]);
  return out;
}

function normalizeForCheck(registry) {
  const r = JSON.parse(JSON.stringify(registry));
  // Useful metadata, but commit-self-consistent values would require amend workflows.
  // Drift checks should focus on the contract content: packs/modules/digests.
  r.generatedAt = '__IGNORED__';
  if (r.repo && typeof r.repo === 'object') r.repo.sha = '__IGNORED__';
  return r;
}

function parseArgs(argv) {
  const args = {
    out: path.join(REPO_ROOT, 'apps/studio/data/registry.json'),
    check: false
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') {
      const v = argv[i + 1];
      if (!v) throw new Error('Missing value for --out');
      args.out = path.isAbsolute(v) ? v : path.join(REPO_ROOT, v);
      i++;
      continue;
    }
    if (a === '--check') {
      args.check = true;
      continue;
    }
    if (a === '--help' || a === '-h') {
      console.log('Usage: node scripts/studio/build-registry.js [--out <path>] [--check]');
      process.exit(0);
    }
    throw new Error(`Unknown arg: ${a}`);
  }

  return args;
}

function main() {
  const args = parseArgs(process.argv);

  const registry = buildRegistryObject();
  const json = JSON.stringify(registry, null, 2) + '\n';

  if (args.check) {
    if (!fs.existsSync(args.out)) {
      throw new Error(`Missing registry file: ${args.out}`);
    }
    const current = fs.readFileSync(args.out, 'utf8');
    let currentObj;
    try {
      currentObj = JSON.parse(current);
    } catch (err) {
      throw new Error(`Invalid JSON in registry file: ${path.relative(REPO_ROOT, args.out)} (${err.message})`);
    }

    const a = JSON.stringify(canonicalize(normalizeForCheck(currentObj)));
    const b = JSON.stringify(canonicalize(normalizeForCheck(registry)));

    if (a !== b) {
      throw new Error(
        `Studio registry drift detected: ${path.relative(REPO_ROOT, args.out)}\n` +
          `Run: npm run studio:build-registry`
      );
    }

    console.log(`OK: registry is up-to-date (${path.relative(REPO_ROOT, args.out)})`);
    return;
  }

  ensureParentDir(args.out);
  fs.writeFileSync(args.out, json, 'utf8');

  console.log(`Wrote registry: ${path.relative(REPO_ROOT, args.out)}`);
}

main();
