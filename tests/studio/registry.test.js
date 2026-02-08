/**
 * Tests for Paradigm Studio registry generator + contract basics.
 *
 * Run with: node tests/studio/registry.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    return false;
  }
}

function run() {
  console.log('\n=== Testing Studio registry ===\n');

  let passed = 0;
  let failed = 0;

  const repoRoot = path.resolve(__dirname, '..', '..');
  const generator = path.join(repoRoot, 'scripts', 'studio', 'build-registry.js');
  const committed = path.join(repoRoot, 'apps', 'studio', 'data', 'registry.json');

  if (test('apps/studio/data/registry.json exists', () => {
    assert.ok(fs.existsSync(committed), `missing: ${committed}`);
  })) passed++; else failed++;

  const tmpOut = path.join(os.tmpdir(), `ecc-studio-registry-${Date.now()}.json`);

  if (test('generator produces valid JSON', () => {
    execSync(`node "${generator}" --out "${tmpOut}"`, { cwd: repoRoot, stdio: 'pipe' });
    const raw = fs.readFileSync(tmpOut, 'utf8');
    assert.doesNotThrow(() => JSON.parse(raw), 'generated registry JSON invalid');
  })) passed++; else failed++;

  const reg = JSON.parse(fs.readFileSync(tmpOut, 'utf8'));

  if (test('registry has version=1 and repo metadata', () => {
    assert.strictEqual(reg.version, 1);
    assert.ok(reg.repo && typeof reg.repo === 'object', 'missing repo');
    assert.ok(reg.repo.owner && reg.repo.name, 'missing repo.owner/repo.name');
    assert.ok(reg.repo.sha && String(reg.repo.sha).length >= 7, 'missing repo.sha');
  })) passed++; else failed++;

  if (test('packs include digest and modules reference existing module IDs', () => {
    assert.ok(Array.isArray(reg.packs) && reg.packs.length > 0, 'packs empty');
    const mods = reg.modules || {};
    const all = [
      ...(mods.agents || []),
      ...(mods.commands || []),
      ...(mods.skills || []),
      ...(mods.rules || [])
    ];
    const index = new Set(all.map(m => m.id));
    for (const p of reg.packs) {
      assert.ok(p.digest && /^[a-f0-9]{64}$/.test(p.digest), `bad pack digest: ${p.id}`);
      assert.ok(Array.isArray(p.modules) && p.modules.length > 0, `pack modules empty: ${p.id}`);
      for (const mid of p.modules) {
        assert.ok(index.has(mid), `unknown module id referenced by pack ${p.id}: ${mid}`);
      }
    }
  })) passed++; else failed++;

  if (test('module IDs are unique across all module types', () => {
    const mods = reg.modules || {};
    const all = [
      ...(mods.agents || []),
      ...(mods.commands || []),
      ...(mods.skills || []),
      ...(mods.rules || [])
    ];
    const seen = new Set();
    for (const m of all) {
      assert.ok(m.digest && /^[a-f0-9]{64}$/.test(m.digest), `bad module digest: ${m.id}`);
      assert.ok(!seen.has(m.id), `duplicate module id: ${m.id}`);
      seen.add(m.id);
    }
  })) passed++; else failed++;

  console.log('\n=== Test Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);

  process.exit(failed > 0 ? 1 : 0);
}

run();

