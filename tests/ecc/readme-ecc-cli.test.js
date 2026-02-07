/**
 * Tests for README ECC CLI install instructions.
 *
 * Run with: node tests/ecc/readme-ecc-cli.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

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

function runTests() {
  console.log('\n=== Testing README ECC CLI install instructions ===\n');

  let passed = 0;
  let failed = 0;

  const repoRoot = path.resolve(__dirname, '..', '..');
  const readmes = [
    'README.md',
    'README.zh-CN.md',
    path.join('docs', 'zh-TW', 'README.md')
  ];

  for (const rel of readmes) {
    const filePath = path.join(repoRoot, rel);

    if (test(`${rel} exists`, () => {
      assert.ok(fs.existsSync(filePath), `missing: ${filePath}`);
    })) passed++; else failed++;

    const doc = fs.readFileSync(filePath, 'utf8');

    if (test(`${rel} mentions npm package ecc-conveyor`, () => {
      assert.ok(/ecc-conveyor/.test(doc), 'expected ecc-conveyor to be mentioned');
    })) passed++; else failed++;

    if (test(`${rel} includes project-local install via npm -D and npx ecc`, () => {
      assert.ok(/npm\s+(i|install)\s+-D\s+ecc-conveyor\b/.test(doc), 'missing: npm install -D ecc-conveyor');
      assert.ok(/\bnpx\s+ecc\b/.test(doc), 'missing: npx ecc');
    })) passed++; else failed++;

    if (test(`${rel} includes global install via npm -g`, () => {
      assert.ok(/npm\s+(i|install)\s+-g\s+ecc-conveyor\b/.test(doc), 'missing: npm install -g ecc-conveyor');
    })) passed++; else failed++;
  }

  console.log('\n=== Test Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests();

