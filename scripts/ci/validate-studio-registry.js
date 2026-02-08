#!/usr/bin/env node
/**
 * Validate that apps/studio/data/registry.json is present and matches the generator output.
 */

const { spawnSync } = require('child_process');

function main() {
  const res = spawnSync(process.execPath, ['scripts/studio/build-registry.js', '--check'], {
    stdio: 'inherit'
  });
  process.exit(res.status || 0);
}

main();

