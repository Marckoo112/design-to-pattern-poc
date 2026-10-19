import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { buildTaxonomy, writeArtifacts } from '../tools/export-taxonomy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNNER = path.join(ROOT, 'vendor', 'ourlette', 'runner.cjs');

const CAPS = (() => {
  const result = spawnSync(process.execPath, [RUNNER], {
    input: JSON.stringify({ action: 'capabilities' }),
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
})();

test('taxonomy covers all 36 captured garments across the 7 categories', () => {
  const tax = buildTaxonomy(CAPS);
  assert.equal(tax.garments.length, 36);
  assert.deepEqual(tax.categories, ['dresses', 'skirts', 'tops', 'trousers', 'outerwear', 'accessories', 'home']);
  assert.deepEqual(tax.fabricKinds, ['woven', 'knit']);
  assert.equal(tax.meta.build, CAPS.build);
  assert.deepEqual([...new Set(tax.garments.map((g) => g.category))].sort(), [...tax.categories].sort());
});

test('option registry holds all 97 keys split into enum, boolean, and number types', () => {
  const reg = buildTaxonomy(CAPS).optionRegistry;
  const keys = Object.keys(reg);
  const entries = keys.map((key) => reg[key]);
  assert.equal(keys.length, 97);
  const isEnum = (r) => r.types.includes('enum');
  const isBool = (r) => r.types.includes('boolean');
  const isNum = (r) => r.types.includes('number');
  // `pockets` is polymorphic (enum in some garments, boolean in others) so it is
  // counted in both the enum and boolean totals; unique keys remain 97.
  assert.equal(entries.filter(isEnum).length, 48);
  assert.equal(entries.filter(isBool).length, 19);
  assert.equal(entries.filter(isNum).length, 31);
  assert.equal(entries.filter((r) => !r.polymorphic).length, 96);
  assert.equal(reg.pockets.types.sort().join('|'), 'boolean|enum');
  assert.equal(reg.pockets.polymorphic, true);
});

test('non-photo options are flagged and body measurements are excluded', () => {
  const tax = buildTaxonomy(CAPS);
  const reg = tax.optionRegistry;
  assert.equal(reg.lining.fromPhoto, 'no');
  assert.equal(reg.reversible.fromPhoto, 'no');
  assert.equal(reg.darts.fromPhoto, 'no');
  assert.equal(reg.ease.fromPhoto, 'no');
  assert.equal(reg.sleeves.fromPhoto, 'yes');
  assert.equal(reg.collar.fromPhoto, 'yes');
  assert.equal(reg.buttons.fromPhoto, 'semi');
  for (const measurementOnly of ['bust', 'underbust', 'inseam', 'backWaistLength', 'bustSpan']) {
    assert.equal(measurementOnly in reg, false, measurementOnly);
  }
  assert.equal('measurements' in tax, false);
  assert.equal('settings' in tax, false);
});

test('per-garment slots mirror each garment option with garment-valid choices', () => {
  const tax = buildTaxonomy(CAPS);
  for (const garment of CAPS.garments) {
    const slots = tax.slotsByGarment[garment.id];
    assert.equal(slots.length, garment.options.length, garment.id);
    garment.options.forEach((option, index) => {
      const slot = slots[index];
      assert.equal(slot.key, option.key, `${garment.id}/${option.key}`);
      assert.ok(slot.key in tax.optionRegistry, `${slot.key} missing from registry`);
      if (option.choices) {
        assert.deepEqual(slot.choices, option.choices.map((choice) => choice.value));
      } else {
        assert.equal('choices' in slot, false);
      }
    });
  }
});

test('enum choices vary by garment and are flagged as such', () => {
  const reg = buildTaxonomy(CAPS).optionRegistry;
  for (const key of ['length', 'closure', 'sleeves', 'neckline', 'fit']) {
    assert.equal(reg[key].choicesVaryByGarment, true, key);
  }
  for (const key of ['collar', 'cuff']) {
    assert.equal(reg[key].choicesVaryByGarment ?? false, false, key);
  }
  assert.equal(reg.pockets.polymorphic, true);
  const lengthSets = new Set(
    CAPS.garments
      .map((g) => g.options.find((o) => o.key === 'length'))
      .filter(Boolean)
      .map((o) => [...o.choices.map((c) => c.value)].sort().join('|')),
  );
  assert.ok(lengthSets.size > 1);
});

test('writeArtifacts emits parseable JSON and CSVs with every row', () => {
  const tax = buildTaxonomy(CAPS);
  const dir = mkdtempSync(path.join(os.tmpdir(), 'threadform-taxonomy-'));
  try {
    writeArtifacts(tax, dir);
    const json = JSON.parse(readFileSync(path.join(dir, 'annotation-taxonomy.json'), 'utf8'));
    assert.deepEqual(json.categories, tax.categories);
    assert.equal(Object.keys(json.slotsByGarment).length, 36);

    const countRows = (file) =>
      readFileSync(path.join(dir, file), 'utf8').split('\n').filter((line) => line.length > 0).length - 1;
    assert.equal(countRows('garment-classes.csv'), 36);
    assert.equal(countRows('option-registry.csv'), 97);
    const slotTotal = CAPS.garments.reduce((total, g) => total + g.options.length, 0);
    assert.equal(countRows('garment-slots.csv'), slotTotal);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
