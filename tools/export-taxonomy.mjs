import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNNER = path.join(ROOT, 'vendor', 'ourlette', 'runner.cjs');

// Curated "can this be read from a photo?" flags. The captured engine does not
// record visibility, so these sets encode the annotation guidance for the handoff.
const NON_VISUAL_ENUM = new Set(['darts', 'pleatStitch', 'topstitch']);
const NON_VISUAL_BOOLEAN = new Set(['lining', 'reversible', 'stretch']);
const SEMI_VISUAL_NUMBER = new Set(['buttons', 'tiers', 'flare', 'fullness', 'sideSlits', 'neckDepth']);

function fromPhoto(key, type) {
  if (type === 'enum') return NON_VISUAL_ENUM.has(key) ? 'no' : 'yes';
  if (type === 'boolean') return NON_VISUAL_BOOLEAN.has(key) ? 'no' : 'yes';
  return SEMI_VISUAL_NUMBER.has(key) ? 'semi' : 'no';
}

export function buildTaxonomy(capabilities) {
  const garments = capabilities.garments.map((garment) => ({
    id: garment.id,
    name: garment.name,
    category: garment.category,
    fabrics: garment.fabrics ?? [],
    usesBody: garment.usesBody,
  }));

  const collected = new Map();
  for (const garment of capabilities.garments) {
    for (const option of garment.options) {
      if (!collected.has(option.key)) {
        collected.set(option.key, {
          types: new Set(),
          groups: new Set(),
          choices: new Set(),
          choiceVariants: new Set(),
          min: undefined,
          max: undefined,
          categories: new Set(),
          garmentCount: 0,
        });
      }
      const entry = collected.get(option.key);
      entry.types.add(option.type);
      entry.groups.add(option.group);
      entry.categories.add(garment.category);
      entry.garmentCount += 1;
      if (typeof option.min === 'number') entry.min = entry.min === undefined ? option.min : Math.min(entry.min, option.min);
      if (typeof option.max === 'number') entry.max = entry.max === undefined ? option.max : Math.max(entry.max, option.max);
      if (option.choices) {
        const values = option.choices.map((choice) => choice.value);
        values.forEach((value) => entry.choices.add(value));
        entry.choiceVariants.add([...values].sort().join('|'));
      }
    }
  }

  const optionRegistry = {};
  for (const [key, entry] of [...collected].sort((a, b) => a[0].localeCompare(b[0]))) {
    const types = [...entry.types].sort();
    optionRegistry[key] = {
      type: types[0],
      types,
      polymorphic: types.length > 1,
      group: [...entry.groups][0],
      groups: [...entry.groups],
      ...(entry.choices.size
        ? { choices: [...entry.choices].sort(), choicesVaryByGarment: entry.choiceVariants.size > 1 }
        : {}),
      ...(entry.min !== undefined ? { min: entry.min, max: entry.max } : {}),
      fromPhoto: fromPhoto(key, types[0]),
      garmentCount: entry.garmentCount,
      categories: [...entry.categories],
    };
  }

  const slotsByGarment = {};
  for (const garment of capabilities.garments) {
    slotsByGarment[garment.id] = garment.options.map((option) => ({
      key: option.key,
      type: option.type,
      ...(option.choices ? { choices: option.choices.map((choice) => choice.value) } : {}),
      ...(typeof option.min === 'number' ? { min: option.min, max: option.max } : {}),
      fromPhoto: fromPhoto(option.key, option.type),
    }));
  }

  const fabricSet = new Set(capabilities.garments.flatMap((garment) => garment.fabrics ?? []));
  const fabricKinds = ['woven', 'knit'].filter((kind) => fabricSet.has(kind));

  return {
    meta: {
      build: capabilities.build,
      engine: capabilities.engine,
      source: 'runner.cjs capabilities',
      note: 'Body measurements, draft settings, and paper sizes are excluded by design; this file is the annotation target set only.',
    },
    categories: capabilities.categories,
    fabricKinds,
    garments,
    optionRegistry,
    slotsByGarment,
  };
}

function csvCell(value) {
  const text = value === undefined || value === null ? '' : Array.isArray(value) ? value.join('|') : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(header, rows) {
  return [header, ...rows.map((row) => row.map(csvCell).join(','))].join('\n') + '\n';
}

export function writeArtifacts(taxonomy, outDir) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'annotation-taxonomy.json'), JSON.stringify(taxonomy, null, 2) + '\n');

  const registryRows = Object.entries(taxonomy.optionRegistry).map(([key, entry]) => [
    key,
    entry.types.join('|'),
    entry.group,
    entry.choices ?? '',
    entry.min ?? '',
    entry.max ?? '',
    entry.fromPhoto,
    entry.garmentCount,
    entry.categories,
  ]);
  writeFileSync(
    path.join(outDir, 'option-registry.csv'),
    toCsv(['key', 'types', 'group', 'choices', 'min', 'max', 'from_photo', 'garment_count', 'categories'], registryRows),
  );

  const classRows = taxonomy.garments.map((garment) => [
    garment.id,
    garment.name,
    garment.category,
    garment.fabrics,
    garment.usesBody,
  ]);
  writeFileSync(
    path.join(outDir, 'garment-classes.csv'),
    toCsv(['garment_id', 'name', 'category', 'fabrics', 'uses_body'], classRows),
  );

  const slotRows = [];
  for (const garment of taxonomy.garments) {
    for (const slot of taxonomy.slotsByGarment[garment.id]) {
      slotRows.push([
        garment.id,
        garment.category,
        garment.fabrics,
        slot.key,
        slot.type,
        slot.choices ?? '',
        slot.min ?? '',
        slot.max ?? '',
        slot.fromPhoto,
      ]);
    }
  }
  writeFileSync(
    path.join(outDir, 'garment-slots.csv'),
    toCsv(['garment_id', 'category', 'fabric', 'slot_key', 'type', 'choices', 'min', 'max', 'from_photo'], slotRows),
  );

  return outDir;
}

function readCapabilities() {
  const result = spawnSync(process.execPath, [RUNNER], {
    input: JSON.stringify({ action: 'capabilities' }),
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim() || `runner exited with status ${result.status}`);
  return JSON.parse(result.stdout);
}

function main() {
  const outIndex = process.argv.indexOf('--out');
  const outDir = outIndex !== -1 && process.argv[outIndex + 1]
    ? path.resolve(process.argv[outIndex + 1])
    : path.join(ROOT, 'taxonomy');
  const taxonomy = buildTaxonomy(readCapabilities());
  writeArtifacts(taxonomy, outDir);
  const slots = Object.values(taxonomy.slotsByGarment).reduce((total, list) => total + list.length, 0);
  console.log(`Wrote taxonomy artifacts to ${outDir}`);
  console.log(`  garments=${taxonomy.garments.length} options=${Object.keys(taxonomy.optionRegistry).length} slots=${slots}`);
}

const invokedDirectly = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
