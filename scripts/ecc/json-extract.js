const fs = require('fs');
const { StringDecoder } = require('string_decoder');

function isHex(ch) {
  return /^[0-9a-fA-F]$/.test(ch);
}

function extractJsonStringFieldToFileSync({ jsonPath, fieldName, outPath }) {
  const fd = fs.openSync(jsonPath, 'r');
  let outFd = null;

  const decoder = new StringDecoder('utf8');
  const buf = Buffer.alloc(64 * 1024);

  // Parser state
  let depth = 0;
  let expectingKey = false;
  let state = 'idle'; // idle|skipString|readKey|afterKey|seekValue|readValue

  let lastKey = '';
  let keyBuf = '';

  let strEscape = false;
  let unicodeDigitsLeft = 0;
  let unicodeHex = '';

  // Patch output state
  let outBuf = '';
  let found = false;
  let endedWithNewline = false;
  let pendingHighSurrogate = null;

  function flushOut() {
    if (!outBuf) return;
    fs.writeSync(outFd, outBuf, null, 'utf8');
    outBuf = '';
  }

  function writeOut(s) {
    if (!s) return;
    outBuf += s;
    if (s.endsWith('\n')) endedWithNewline = true;
    else endedWithNewline = false;
    if (outBuf.length >= 16 * 1024) flushOut();
  }

  function resetStringState() {
    strEscape = false;
    unicodeDigitsLeft = 0;
    unicodeHex = '';
  }

  function decodeUnicodeHex(hex) {
    return String.fromCharCode(parseInt(hex, 16));
  }

  function handleDecodedCharForPatch(ch) {
    // Handle surrogate pairs from \uXXXX.
    if (pendingHighSurrogate !== null) {
      const hi = pendingHighSurrogate;
      pendingHighSurrogate = null;

      const loCode = ch.charCodeAt(0);
      if (loCode >= 0xdc00 && loCode <= 0xdfff) {
        const hiCode = hi;
        const codePoint = 0x10000 + ((hiCode - 0xd800) << 10) + (loCode - 0xdc00);
        writeOut(String.fromCodePoint(codePoint));
        return;
      }

      // Not a low surrogate; emit hi surrogate as-is then continue with current.
      writeOut(String.fromCharCode(hi));
    }

    const code = ch.charCodeAt(0);
    if (code >= 0xd800 && code <= 0xdbff) {
      pendingHighSurrogate = code;
      return;
    }

    writeOut(ch);
  }

  function finishPatch() {
    if (pendingHighSurrogate !== null) {
      writeOut(String.fromCharCode(pendingHighSurrogate));
      pendingHighSurrogate = null;
    }
    if (!endedWithNewline) writeOut('\n');
    flushOut();
    found = true;
  }

  try {
    function processChunkText(chunk) {
      for (let i = 0; i < chunk.length; i++) {
        const ch = chunk[i];

        if (state === 'readValue') {
          if (unicodeDigitsLeft > 0) {
            if (!isHex(ch)) throw new Error('invalid unicode escape in patch string');
            unicodeHex += ch;
            unicodeDigitsLeft--;
            if (unicodeDigitsLeft === 0) {
              const decoded = decodeUnicodeHex(unicodeHex);
              unicodeHex = '';
              handleDecodedCharForPatch(decoded);
            }
            continue;
          }

          if (strEscape) {
            strEscape = false;
            if (ch === '"' || ch === '\\' || ch === '/') handleDecodedCharForPatch(ch);
            else if (ch === 'b') handleDecodedCharForPatch('\b');
            else if (ch === 'f') handleDecodedCharForPatch('\f');
            else if (ch === 'n') handleDecodedCharForPatch('\n');
            else if (ch === 'r') handleDecodedCharForPatch('\r');
            else if (ch === 't') handleDecodedCharForPatch('\t');
            else if (ch === 'u') {
              unicodeDigitsLeft = 4;
              unicodeHex = '';
            } else {
              throw new Error('invalid escape in patch string');
            }
            continue;
          }

          if (ch === '\\') {
            strEscape = true;
            continue;
          }
          if (ch === '"') {
            finishPatch();
            state = 'idle';
            return true;
          }

          handleDecodedCharForPatch(ch);
          continue;
        }

        if (state === 'readKey') {
          if (unicodeDigitsLeft > 0) {
            if (!isHex(ch)) throw new Error('invalid unicode escape in key string');
            unicodeHex += ch;
            unicodeDigitsLeft--;
            if (unicodeDigitsLeft === 0) {
              keyBuf += decodeUnicodeHex(unicodeHex);
              unicodeHex = '';
            }
            continue;
          }
          if (strEscape) {
            strEscape = false;
            if (ch === '"' || ch === '\\' || ch === '/') keyBuf += ch;
            else if (ch === 'b') keyBuf += '\b';
            else if (ch === 'f') keyBuf += '\f';
            else if (ch === 'n') keyBuf += '\n';
            else if (ch === 'r') keyBuf += '\r';
            else if (ch === 't') keyBuf += '\t';
            else if (ch === 'u') {
              unicodeDigitsLeft = 4;
              unicodeHex = '';
            } else {
              throw new Error('invalid escape in key string');
            }
            continue;
          }
          if (ch === '\\') {
            strEscape = true;
            continue;
          }
          if (ch === '"') {
            lastKey = keyBuf;
            keyBuf = '';
            resetStringState();
            state = 'afterKey';
            continue;
          }
          keyBuf += ch;
          continue;
        }

        if (state === 'skipString') {
          if (unicodeDigitsLeft > 0) {
            if (!isHex(ch)) throw new Error('invalid unicode escape in string');
            unicodeHex += ch;
            unicodeDigitsLeft--;
            if (unicodeDigitsLeft === 0) {
              unicodeHex = '';
            }
            continue;
          }
          if (strEscape) {
            strEscape = false;
            if (ch === 'u') {
              unicodeDigitsLeft = 4;
              unicodeHex = '';
            }
            continue;
          }
          if (ch === '\\') {
            strEscape = true;
            continue;
          }
          if (ch === '"') {
            resetStringState();
            state = 'idle';
            continue;
          }
          continue;
        }

        if (state === 'afterKey') {
          if (/\s/.test(ch)) continue;
          if (ch !== ':') throw new Error('malformed JSON: expected ":" after key');
          if (depth === 1 && lastKey === fieldName) {
            state = 'seekValue';
          } else {
            state = 'idle';
          }
          continue;
        }

        if (state === 'seekValue') {
          if (/\s/.test(ch)) continue;
          if (ch !== '"') throw new Error(`field "${fieldName}" is not a JSON string`);
          // Begin patch value. Lazily open outFd here so failures don't create empty files.
          if (!outFd) outFd = fs.openSync(outPath, 'w');
          resetStringState();
          endedWithNewline = false;
          pendingHighSurrogate = null;
          state = 'readValue';
          continue;
        }

        // idle
        if (ch === '"') {
          resetStringState();
          if (depth === 1 && expectingKey) {
            expectingKey = false;
            state = 'readKey';
          } else {
            state = 'skipString';
          }
          continue;
        }

        if (ch === '{' || ch === '[') {
          depth++;
          if (ch === '{' && depth === 1) expectingKey = true;
          continue;
        }
        if (ch === '}' || ch === ']') {
          depth = Math.max(0, depth - 1);
          continue;
        }
        if (ch === ',' && depth === 1) {
          expectingKey = true;
          continue;
        }
      }
      return false;
    }

    while (true) {
      const bytes = fs.readSync(fd, buf, 0, buf.length, null);
      if (bytes <= 0) break;
      const chunk = decoder.write(buf.subarray(0, bytes));
      if (!chunk) continue;

      if (processChunkText(chunk)) break;
    }

    if (!found) {
      const tail = decoder.end();
      if (tail) processChunkText(tail);
    }

    if (!found) throw new Error(`field "${fieldName}" not found`);
  } finally {
    try {
      if (outFd) {
        flushOut();
        fs.closeSync(outFd);
      }
    } catch (_err) {
      // ignore
    }
    try {
      fs.closeSync(fd);
    } catch (_err) {
      // ignore
    }
  }
}

module.exports = {
  extractJsonStringFieldToFileSync
};
