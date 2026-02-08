/**
 * Tests for Studio version diff algorithm (digest-based).
 *
 * Run with: node tests/studio/version-diff.test.js
 */

const assert = require('assert');
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
  console.log('\n=== Testing Studio diff ===\n');

  let passed = 0;
  let failed = 0;

  const repoRoot = path.resolve(__dirname, '..', '..');
  const diffPath = path.join(repoRoot, 'apps', 'studio', 'lib', 'diff.mjs');
  const mod = await import(pathToFileURL(diffPath).href);
  const { diffRegistries } = mod;

  const base = {
    version: 1,
    packs: [{ id: 'p1', name: 'P1', description: 'x', modules: ['command:a'], tags: [], path: 'packs/p1.json', digest: 'a'.repeat(64) }],
    modules: {
      agents: [],
      commands: [{ id: 'command:a', type: 'command', name: 'a', description: null, path: 'commands/a.md', digest: 'b'.repeat(64) }],
      skills: [],
      rules: []
    }
  };

  const head = {
    version: 1,
    packs: [{ id: 'p1', name: 'P1', description: 'x', modules: ['command:a'], tags: [], path: 'packs/p1.json', digest: 'c'.repeat(64) }],
    modules: {
      agents: [],
      commands: [
        { id: 'command:a', type: 'command', name: 'a', description: null, path: 'commands/a.md', digest: 'd'.repeat(64) },
        { id: 'command:b', type: 'command', name: 'b', description: null, path: 'commands/b.md', digest: 'e'.repeat(64) }
      ],
      skills: [],
      rules: []
    }
  };

  const diff = diffRegistries(base, head);

  if (test('detects changed module digests', () => {
    assert.strictEqual(diff.modules.changed.length, 1);
    assert.strictEqual(diff.modules.changed[0].id, 'command:a');
  })) passed++; else failed++;

  if (test('detects added modules', () => {
    assert.strictEqual(diff.modules.added.length, 1);
    assert.strictEqual(diff.modules.added[0].id, 'command:b');
  })) passed++; else failed++;

  if (test('detects changed packs', () => {
    assert.strictEqual(diff.packs.changed.length, 1);
    assert.strictEqual(diff.packs.changed[0].id, 'p1');
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

