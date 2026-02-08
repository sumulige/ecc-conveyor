/**
 * Compat tests for Studio registry contract (v1).
 *
 * Run with: node tests/studio/registry-compat.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

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

async function run() {
  console.log('\n=== Testing Studio registry compat (v1) ===\n');

  let passed = 0;
  let failed = 0;

  const repoRoot = path.resolve(__dirname, '..', '..');
  const fixturePath = path.join(repoRoot, 'compat', 'registry', 'v1', 'registry.fixture.json');

  if (test('fixture exists', () => {
    assert.ok(fs.existsSync(fixturePath), `missing: ${fixturePath}`);
  })) passed++; else failed++;

  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

  if (test('fixture has required top-level fields', () => {
    assert.strictEqual(fixture.version, 1);
    assert.ok(fixture.repo && fixture.repo.owner && fixture.repo.name, 'missing repo meta');
    assert.ok(fixture.modules && fixture.packs, 'missing modules/packs');
  })) passed++; else failed++;

  const diffPath = path.join(repoRoot, 'apps', 'studio', 'lib', 'diff.mjs');
  const mod = await import(pathToFileURL(diffPath).href);
  const { diffRegistries, flattenModules } = mod;

  if (test('flattenModules works on v1 fixture', () => {
    const mods = flattenModules(fixture);
    assert.ok(Array.isArray(mods));
    assert.ok(mods.length > 0, 'expected some modules');
  })) passed++; else failed++;

  if (test('diff is stable when comparing fixture to itself', () => {
    const diff = diffRegistries(fixture, fixture);
    assert.strictEqual(diff.modules.added.length, 0);
    assert.strictEqual(diff.modules.removed.length, 0);
    assert.strictEqual(diff.modules.changed.length, 0);
    assert.strictEqual(diff.packs.added.length, 0);
    assert.strictEqual(diff.packs.removed.length, 0);
    assert.strictEqual(diff.packs.changed.length, 0);
  })) passed++; else failed++;

  console.log('\n=== Test Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.log('  ✗ Unhandled error');
  console.log(`    Error: ${err.message}`);
  console.log('\n=== Test Results ===');
  console.log('Passed: 0');
  console.log('Failed: 1');
  console.log('Total:  1');
  process.exit(1);
});

