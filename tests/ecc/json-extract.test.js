/**
 * Tests for streaming JSON patch extraction (codex provider optimization)
 *
 * Run with: node tests/ecc/json-extract.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { extractJsonStringFieldToFileSync } = require('../../scripts/ecc/json-extract');

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

function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

function runTests() {
  console.log('\n=== Testing JSON patch extraction ===\n');

  let passed = 0;
  let failed = 0;

  if (test('extracts patch field to file without JSON.parse and enforces trailing newline', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-json-extract-'));
    try {
      const jsonPath = path.join(tmp, 'out.json');
      const outPath = path.join(tmp, 'patch.diff');

      const patch = [
        'diff --git a/src/hello.txt b/src/hello.txt',
        'new file mode 100644',
        'index 0000000..e69de29',
        '--- /dev/null',
        '+++ b/src/hello.txt',
        '@@ -0,0 +1,2 @@',
        '+console.log("hi\\\\there")',
        '+path: C:\\\\tmp\\\\file'
      ].join('\n'); // intentionally no trailing newline

      const obj = { version: 1, patch, meta: { note: 'x', reason: '', provider: 'codex' } };
      fs.writeFileSync(jsonPath, JSON.stringify(obj, null, 2) + '\n', 'utf8');

      extractJsonStringFieldToFileSync({ jsonPath, fieldName: 'patch', outPath });

      const extracted = readText(outPath);
      assert.strictEqual(extracted, patch + '\n');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  if (test('supports JSON unicode escapes (including surrogate pairs)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-json-extract-'));
    try {
      const jsonPath = path.join(tmp, 'out.json');
      const outPath = path.join(tmp, 'patch.diff');

      // Note: this JSON string intentionally contains JSON escapes (\n, \u263A, surrogate pair).
      const json = [
        '{',
        '  "version": 1,',
        '  "patch": "hello\\nsmile: \\u263A\\nemoji: \\uD83D\\uDE00",',
        '  "meta": { "note": "x", "reason": "", "provider": "codex" }',
        '}'
      ].join('\n');

      fs.writeFileSync(jsonPath, json + '\n', 'utf8');

      extractJsonStringFieldToFileSync({ jsonPath, fieldName: 'patch', outPath });

      const extracted = readText(outPath);
      assert.strictEqual(extracted, `hello\nsmile: ☺\nemoji: 😀\n`);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  if (test('throws when field is missing', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-json-extract-'));
    try {
      const jsonPath = path.join(tmp, 'out.json');
      const outPath = path.join(tmp, 'patch.diff');
      fs.writeFileSync(jsonPath, '{"version":1,"meta":{}}', 'utf8');
      assert.throws(() => extractJsonStringFieldToFileSync({ jsonPath, fieldName: 'patch', outPath }));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  })) passed++; else failed++;

  console.log('\n=== Test Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
