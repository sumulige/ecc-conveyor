function sortedById(arr) {
  return [...arr].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export function flattenModules(registry) {
  const groups = (registry && registry.modules) || {};
  return [
    ...(groups.agents || []),
    ...(groups.commands || []),
    ...(groups.skills || []),
    ...(groups.rules || [])
  ];
}

export function indexById(items) {
  const m = new Map();
  for (const it of items || []) {
    if (!it || !it.id) continue;
    m.set(it.id, it);
  }
  return m;
}

export function diffMapsByDigest(baseMap, headMap) {
  const added = [];
  const removed = [];
  const changed = [];

  for (const [id, b] of baseMap.entries()) {
    if (!headMap.has(id)) {
      removed.push(b);
      continue;
    }
    const h = headMap.get(id);
    if ((b && b.digest) !== (h && h.digest)) {
      changed.push({ id, before: b, after: h });
    }
  }

  for (const [id, h] of headMap.entries()) {
    if (!baseMap.has(id)) added.push(h);
  }

  return {
    added: sortedById(added),
    removed: sortedById(removed),
    changed: [...changed].sort((a, b) => String(a.id).localeCompare(String(b.id)))
  };
}

export function diffRegistries(baseRegistry, headRegistry) {
  const baseModules = indexById(flattenModules(baseRegistry));
  const headModules = indexById(flattenModules(headRegistry));

  const basePacks = indexById((baseRegistry && baseRegistry.packs) || []);
  const headPacks = indexById((headRegistry && headRegistry.packs) || []);

  return {
    modules: diffMapsByDigest(baseModules, headModules),
    packs: diffMapsByDigest(basePacks, headPacks)
  };
}

