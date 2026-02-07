/**
 * Tests for ecc-kernel <-> Node protocol contract (pure validators)
 *
 * Run with: node tests/ecc/kernel-protocol.test.js
 */

const assert = require('assert');

const contract = require('../../scripts/ecc/kernel-contract');

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
  console.log('\n=== Testing ecc-kernel protocol contract ===\n');

  let passed = 0;
  let failed = 0;

  if (test('validateProtocolVersionOutput accepts minimal valid output', () => {
    const obj = {
      version: 1,
      protocol: contract.EXPECTED_PROTOCOL,
      kernelVersion: '0.1.0',
      commands: [...contract.REQUIRED_COMMANDS]
    };
    const errors = contract.validateProtocolVersionOutput(obj);
    assert.deepStrictEqual(errors, []);
  })) passed++; else failed++;

  if (test('validateProtocolVersionOutput rejects protocol mismatch', () => {
    const obj = {
      version: 1,
      protocol: contract.EXPECTED_PROTOCOL + 1,
      kernelVersion: '0.1.0',
      commands: [...contract.REQUIRED_COMMANDS]
    };
    const errors = contract.validateProtocolVersionOutput(obj);
    assert.ok(errors.some(e => e.includes('protocol mismatch')));
  })) passed++; else failed++;

  if (test('validateProtocolVersionOutput rejects missing required commands', () => {
    const obj = {
      version: 1,
      protocol: contract.EXPECTED_PROTOCOL,
      kernelVersion: '0.1.0',
      commands: contract.REQUIRED_COMMANDS.filter(c => c !== 'verify.run')
    };
    const errors = contract.validateProtocolVersionOutput(obj);
    assert.ok(errors.some(e => e.includes('missing commands')));
  })) passed++; else failed++;

  if (test('validateRepoInfoOutput accepts repo output', () => {
    const obj = { version: 1, repoRoot: '/tmp/repo', branch: 'main', sha: 'abc', clean: true };
    const errors = contract.validateRepoInfoOutput(obj);
    assert.deepStrictEqual(errors, []);
  })) passed++; else failed++;

  if (test('validateRepoInfoOutput accepts no-repo output', () => {
    const obj = { version: 1, repoRoot: null, branch: '', sha: '', clean: false };
    const errors = contract.validateRepoInfoOutput(obj);
    assert.deepStrictEqual(errors, []);
  })) passed++; else failed++;

  console.log('\n=== Test Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests();

