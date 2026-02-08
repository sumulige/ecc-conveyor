#!/usr/bin/env node
/**
 * Validate pack JSON files against basic structural rules and module references.
 *
 * This is dependency-free and runs in CI.
 */

const {
  buildPacks,
  buildAgents,
  buildCommands,
  buildSkills,
  buildRules,
  assertPackModuleReferences
} = require('../studio/registry-lib');

function main() {
  const packs = buildPacks();

  const ids = new Set();
  const dups = new Set();
  for (const p of packs) {
    if (ids.has(p.id)) dups.add(p.id);
    ids.add(p.id);
  }
  if (dups.size) {
    throw new Error(`Duplicate pack ids: ${Array.from(dups).sort().join(', ')}`);
  }

  const agents = buildAgents();
  const commands = buildCommands();
  const skills = buildSkills();
  const rules = buildRules();

  const moduleIndex = new Set([
    ...agents.map(m => m.id),
    ...commands.map(m => m.id),
    ...skills.map(m => m.id),
    ...rules.map(m => m.id)
  ]);

  assertPackModuleReferences(packs, moduleIndex);

  console.log(`OK: packs validated (${packs.length} packs)`);
}

main();
