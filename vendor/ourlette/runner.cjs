"use strict";

// Authorized local adapter for the captured Ourlette browser drafting bundle.
// The bundle is executed inside a VM with a file-only fake script loader; it is
// never allowed to resolve a chunk over the network.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const CHUNK_DIR = path.join(__dirname, "chunks");
const BUILD = "09b408d4c34bf907fb334f7b09c9a4695e5ad89f60eb79436f116e0e5f7b7d69";
const CHUNKS = [
  ["turbopack-09h7xzk04n98-.js", "84324b478ca8645d41540cbab4e99e92120bed769ec612a75fa7edcdceb40c28"],
  ["2aos7m4zex64_.js", "2fcfbee52a0a72a496120caa456f5424c57a54d6581293cc04706a7d96a61d89"],
  ["2fm_rhppxfl88.js", "c772d6a693541c286f16195bbc51451ec51413811f34121eb651b142a6973760"],
  ["3bsjd3e78ios7.js", "53e79fdd8d4ad57efad98a85a6ef5be1f7d063b5ae0978f1193480de4359543e"],
  ["1n7k__mot7als.js", "bdd4329873e488e8c88b51a548a3d16d4e08d09a1ea6aceff8876f2ac5523bb3"],
  ["1zw79tud79w2h.js", "c5743c88bbf07d6fed9ed65395506c8dc65220aa5c815316454f6c00b3d122f1"],
  ["1d4pjs2gl9pex.js", "6f9ceafc03f4027cbe61628244358f0852b211dec5d374097ca473a0e023242e"],
];
const ALLOWED_CHUNKS = new Map(CHUNKS.map(([name, digest]) => [name, digest]));

function readVerifiedChunk(name) {
  const expected = ALLOWED_CHUNKS.get(name);
  if (!expected) throw new Error(`Blocked non-vendored chunk request: ${name}`);
  const file = path.join(CHUNK_DIR, name);
  const bytes = fs.readFileSync(file);
  const actual = crypto.createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected) throw new Error(`Vendor chunk checksum mismatch: ${name}`);
  return bytes.toString("utf8");
}

function scriptElement(src) {
  return {
    src,
    getAttribute(name) { return name === "src" ? this.src : null; },
    addEventListener(name, handler) { this[`on${name}`] = handler; },
    remove() {},
  };
}

async function runLocalScript(context, element) {
  const name = decodeURIComponent(String(element.src).split(/[?#]/, 1)[0].split("/").pop());
  const source = readVerifiedChunk(name);
  context.document.currentScript = element;
  try {
    const result = vm.runInContext(source, context, { filename: name, timeout: 15000 });
    await Promise.resolve(result);
    element.onload?.();
  } finally {
    context.document.currentScript = null;
  }
}

async function createEngine() {
  const context = {
    console: { log() {}, info() {}, warn() {}, error() {} },
    URL,
    Promise,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Object,
    Array,
    Number,
    Math,
    String,
    RegExp,
    Error,
    TypeError,
    Date,
    JSON,
    Symbol,
    Reflect,
    Proxy,
    DOMException: class DOMException extends Error {},
    setTimeout,
    clearTimeout,
    queueMicrotask,
  };
  context.globalThis = context;
  context.self = context;
  context.TURBOPACK = [];
  context.document = {
    currentScript: null,
    createElement(tag) {
      return {
        tagName: String(tag).toUpperCase(),
        setAttribute(name, value) { this[name] = value; },
        getAttribute(name) { return this[name] ?? null; },
        addEventListener(name, handler) { this[`on${name}`] = handler; },
        remove() {},
      };
    },
    querySelectorAll() { return []; },
    head: {
      appendChild(element) {
        runLocalScript(context, element).catch((error) => {
          element.onerror?.(error);
        });
        return element;
      },
    },
  };
  vm.createContext(context);

  const [runtimeName] = CHUNKS[0];
  const runtime = scriptElement(`https://app.ourlette.com/_next/static/immutable/chunks/${runtimeName}`);
  context.document.currentScript = runtime;
  vm.runInContext(readVerifiedChunk(runtimeName), context, { filename: runtimeName, timeout: 15000 });
  context.document.currentScript = null;

  for (const [name] of CHUNKS.slice(1)) {
    await runLocalScript(
      context,
      scriptElement(`https://app.ourlette.com/_next/static/immutable/chunks/${name}`),
    );
  }

  const bridgeId = 989901;
  const bridgeSource = `globalThis.TURBOPACK.push([document.currentScript, ${bridgeId}, m => {
    globalThis.__ourletteApi = {
      draftPattern: m.i(979946).draftPattern,
      geometry: m.i(951358),
      planner: m.i(905917),
      measurements: m.i(113662),
      catalog: m.i(893530),
      normalizeSpec: m.i(905).normalizeSpec,
    };
  }]);`;
  const bridgeScript = scriptElement("file:///ourlette-local-bridge.js");
  context.document.currentScript = bridgeScript;
  vm.runInContext(bridgeSource, context, { filename: "ourlette-local-bridge.js", timeout: 5000 });
  context.document.currentScript = null;
  await context.TURBOPACK.push([
    scriptElement("file:///ourlette-local-runtime.js"),
    { otherChunks: [], runtimeModuleIds: [bridgeId] },
  ]);
  return context.__ourletteApi;
}

async function main() {
  const request = JSON.parse(fs.readFileSync(0, "utf8"));
  const api = await createEngine();
  if (request.action === "capabilities") {
    const garmentId = request.garmentId || "button-up-shirt";
    const garment = api.catalog.getGarment(garmentId);
    if (!garment) throw new Error(`Unknown captured garment template: ${garmentId}`);
    process.stdout.write(JSON.stringify({
      engine: "Ourlette captured browser drafting engine",
      build: BUILD,
      categories: api.catalog.CATEGORY_ORDER,
      garments: api.catalog.GARMENTS.map(({ id, name, category, description, difficulty, fabrics, usesBody, options }) => ({
        id, name, category, description, difficulty, fabrics, usesBody, options,
      })),
      papers: api.planner.PAPERS,
      garment: {
        id: garment.id,
        name: garment.name,
        category: garment.category,
        usesBody: garment.usesBody,
        fabrics: garment.fabrics,
        options: garment.options,
      },
      standardSizes: api.measurements.STANDARD_SIZES,
    }));
    return;
  }

  if (!request.spec || typeof request.spec !== "object") throw new Error("spec must be an object");
  if (!request.measurements || typeof request.measurements !== "object") {
    throw new Error("measurements must be an object");
  }
  const settings = request.settings && typeof request.settings === "object" ? request.settings : {};
  const output = api.draftPattern(request.spec, request.measurements, settings);
  if (!output || !Array.isArray(output.pieces) || output.pieces.length === 0) {
    throw new Error("Ourlette engine returned no pattern pieces");
  }
  const serializable = JSON.parse(JSON.stringify(output));
  const previewPlan = api.planner.planPrint(output.pieces, "projector");
  const paperPlan = api.planner.planPrint(output.pieces, request.paper || "projector", Boolean(request.includeDimensions));
  const preview = {
    width_cm: previewPlan.sheet.width,
    height_cm: previewPlan.sheet.height,
    pieces: previewPlan.sheet.placed.map(({ piece, t }) => {
      const apply = (point) => api.planner.applyTransform(point, t);
      return {
        id: piece.id,
        name: piece.name,
        cut: piece.cut,
        material: piece.material,
        note: piece.note ?? null,
        cutLine: piece.cutLine.map(apply),
        seamLine: piece.seamLine.map(apply),
        grain: piece.grain.map(apply),
        labelAt: apply(piece.labelAt ?? api.geometry.centroid(piece.seamLine)),
        notches: piece.notchMarks.map((notch) => ({ ...notch, at: apply(notch.at), onSeam: apply(notch.onSeam) })),
        foldSegments: piece.foldSegments.map((segment) => segment.map(apply)),
        marks: (piece.marks ?? []).map((mark) => ({ ...mark, at: apply(mark.at) })),
      };
    }),
  };
  process.stdout.write(JSON.stringify({
    engine: "Ourlette captured browser drafting engine",
    build: BUILD,
    units: "cm",
    output: serializable,
    preview,
    printPlan: {
      paper: paperPlan.paper,
      landscape: paperPlan.landscape,
      cols: paperPlan.cols,
      rows: paperPlan.rows,
      pages: paperPlan.pages,
      tiles: paperPlan.tiles,
      placedPieces: paperPlan.sheet.placed.length,
    },
  }));
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
