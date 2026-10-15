import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = path.join(ROOT, 'vendor', 'ourlette');
const MANIFEST = JSON.parse(readFileSync(path.join(VENDOR, 'chunk-manifest.json'), 'utf8'));
const runner = (payload) => {
  const result = spawnSync(process.execPath, [path.join(VENDOR, 'runner.cjs')], {
    input: JSON.stringify(payload), encoding: 'utf8', timeout: 30_000, maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};

test('all 19 captured chunks match the recorded SHA-256 manifest', () => {
  const directory = path.join(VENDOR, 'chunks');
  const actualNames = readdirSync(directory).filter((name) => name.endsWith('.js')).sort();
  assert.equal(actualNames.length, 19);
  assert.deepEqual(actualNames, Object.keys(MANIFEST.files).sort());
  for (const name of actualNames) {
    const digest = createHash('sha256').update(readFileSync(path.join(directory, name))).digest('hex');
    assert.equal(digest, MANIFEST.files[name], `hash mismatch: ${name}`);
  }
});

test('schema exposes the captured button-up-shirt controls and size charts', () => {
  const schema = runner({action:'capabilities'});
  assert.equal(schema.build, MANIFEST.build);
  assert.equal(schema.garment.id, 'button-up-shirt');
  assert.ok(schema.garment.options.length >= 40);
  assert.deepEqual(new Set(schema.standardSizes.map((entry) => entry.body)), new Set(['women','men','kids']));
  assert.ok(schema.standardSizes.some((entry) => entry.id === 'm-m'));
  assert.equal(schema.garments.length, 36);
  assert.deepEqual(schema.categories, ['dresses','skirts','tops','trousers','outerwear','accessories','home']);
  assert.ok(schema.papers.some((paper) => paper.id === 'a4'));
});

test('every entry in the captured 36-item garment catalog drafts non-empty native geometry', () => {
  const schema = runner({action:'capabilities'});
  const measurements = schema.standardSizes.find((entry) => entry.id === 'm-m').m;
  for (const garment of schema.garments) {
    const options = Object.fromEntries(garment.options.map((entry) => [entry.key, entry.default]));
    const result = runner({
      spec:{garment:garment.id,options,fabric:{kind:garment.fabrics[0] || 'woven'}},
      measurements,
      settings:{units:'metric',body:'men',seam:1,hem:3},
    });
    assert.ok(result.output.pieces.length > 0, `${garment.id} returned no pieces`);
    assert.ok(result.output.pieces.every((piece) => Array.isArray(piece.cutLine) && Array.isArray(piece.seamLine)), `${garment.id} has incomplete boundary arrays`);
  }
});

test('native default options draft geometry and a packed preview', () => {
  const schema = runner({action:'capabilities'});
  const options = Object.fromEntries(schema.garment.options.map((entry) => [entry.key, entry.default]));
  const measurements = schema.standardSizes.find((entry) => entry.id === 'm-m').m;
  const draft = runner({
    spec:{garment:schema.garment.id,options,fabric:{kind:'woven'}},
    measurements,
    settings:{units:'metric',body:'men',seam:1,hem:3},
  });
  assert.ok(draft.output.pieces.length > 0);
  assert.ok(draft.output.pieces.every((piece) => Array.isArray(piece.seamLine) && Array.isArray(piece.cutLine)));
  assert.ok(draft.preview.pieces.length > 0);
  assert.ok(draft.preview.width_cm > 0 && draft.preview.height_cm > 0);
});

test('native A4 and A0 print plans contain usable tiled sheets', () => {
  const schema = runner({action:'capabilities'});
  const options = Object.fromEntries(schema.garment.options.map((entry) => [entry.key, entry.default]));
  const measurements = schema.standardSizes.find((entry) => entry.id === 'm-m').m;
  for (const paper of ['a4','a0']) {
    const result = runner({
      spec:{garment:schema.garment.id,options,fabric:{kind:'woven'}},
      measurements,
      settings:{units:'metric',body:'men',seam:1,hem:3},
      paper,
    });
    assert.equal(result.printPlan.paper.id, paper);
    assert.ok(result.printPlan.pages > 0);
    assert.ok(result.printPlan.placedPieces > 0);
    assert.equal(result.printPlan.tiles.filter((tile) => tile.used).length, result.printPlan.pages);
  }
});

test('changing native sleeve and collar choices changes returned pattern topology', () => {
  const schema = runner({action:'capabilities'});
  const options = Object.fromEntries(schema.garment.options.map((entry) => [entry.key, entry.default]));
  const measurements = schema.standardSizes.find((entry) => entry.id === 'm-m').m;
  const draft = (nativeOptions) => runner({
    spec:{garment:schema.garment.id,options:nativeOptions,fabric:{kind:'woven'}},
    measurements,
    settings:{units:'metric',body:'men',seam:1,hem:3},
  }).output;
  const base = draft(options);
  const sleeveless = draft({...options,sleeves:'none',cuff:'none'});
  const collarless = draft({...options,collar:'none',neckline:'crew'});
  assert.notDeepEqual(sleeveless.pieces.map((piece) => piece.id), base.pieces.map((piece) => piece.id));
  assert.ok(!sleeveless.pieces.some((piece) => piece.id === 'sleeve'));
  assert.ok(collarless.pieces.length < base.pieces.length);
});

test('native S, M, L, and XL measurements change front-piece geometry', () => {
  const schema = runner({action:'capabilities'});
  const options = Object.fromEntries(schema.garment.options.map((entry) => [entry.key, entry.default]));
  const signatures = ['m-s','m-m','m-l','m-xl'].map((id) => {
    const measurements = schema.standardSizes.find((entry) => entry.id === id).m;
    const output = runner({
      spec:{garment:schema.garment.id,options,fabric:{kind:'woven'}},
      measurements,
      settings:{units:'metric',body:'men',seam:1,hem:3},
    }).output;
    return JSON.stringify(output.pieces.find((piece) => piece.id === 'front').seamLine);
  });
  assert.equal(new Set(signatures).size, 4);
});
