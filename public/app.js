const $ = (selector) => document.querySelector(selector);
const engineStatus = $('#engine-status');
const optionGroups = $('#option-groups');
const measurementFields = $('#measurement-fields');
const garmentSelect = $('#garment-select');
const bodySelect = $('#body-select');
const sizeSelect = $('#size-select');
const paperSelect = $('#paper-select');
const pdfButton = $('#pdf-button');
const printDialog = $('#print-dialog');
const draftForm = $('#draft-form');
const draftButton = $('.draft-button');
const draftState = $('#draft-state');
const patternView = $('#pattern-view');
const patternMount = $('#native-pattern-view');
const modelStage = $('#model-stage');
const modelMessage = $('#model-message');
const resultMeta = $('#result-meta');
const inspector = $('#output-inspector');
const outputJson = $('#output-json');

let schema;
let selectedMeasurements = {};
let lastDraft;
let draftIsDirty = false;
let threePromise;
let threePreview;
let patternPromise;
let patternRoot;
let chunkManifest;
let currentTab = 'design';
const measurementNames = {
  height: 'Height', bust: 'Bust / chest', underbust: 'Underbust', waist: 'Waist', highHip: 'High hip', hip: 'Hip',
  neck: 'Neck', shoulder: 'Shoulder width', backWaistLength: 'Back waist length', frontWaistLength: 'Front waist length',
  bustHeight: 'Bust height', bustSpan: 'Bust span', armLength: 'Arm length', upperArm: 'Upper arm', wrist: 'Wrist',
  waistToHip: 'Waist to hip', waistToKnee: 'Waist to knee', waistToFloor: 'Waist to floor', inseam: 'Inseam',
  crotchDepth: 'Crotch depth', thigh: 'Thigh', knee: 'Knee', ankle: 'Ankle', head: 'Head',
};
const groupNames = {fit: 'Fit and ease', style: 'Shape and construction', length: 'Length and proportions', details: 'Closures and details'};

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function integrityFor(sha256Hex) {
  const bytes = new Uint8Array(sha256Hex.match(/.{2}/g).map((pair) => Number.parseInt(pair, 16)));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `sha256-${btoa(binary)}`;
}

function loadScript(src, sha256Hex = null) {
  return new Promise((resolve, reject) => {
    const existing = [...document.scripts].find((script) => script.src === new URL(src, location.href).href);
    if (existing?.dataset.loaded === 'true') return resolve();
    const script = existing || document.createElement('script');
    script.src = src;
    script.async = false;
    if (sha256Hex) {
      script.integrity = integrityFor(sha256Hex);
      script.crossOrigin = 'anonymous';
    }
    script.onload = () => { script.dataset.loaded = 'true'; resolve(); };
    script.onerror = () => reject(new Error(`Could not load local renderer script: ${src}`));
    if (!existing) document.head.append(script);
  });
}

function capturedChunkUrl(name) {
  return `/_next/static/immutable/chunks/${name}`;
}

async function loadNative3D() {
  if (!threePromise) {
    threePromise = (async () => {
      if (!chunkManifest) {
        const response = await fetch('/vendor/chunk-manifest.json');
        if (!response.ok) throw new Error('Could not read the local chunk integrity manifest.');
        chunkManifest = await response.json();
      }
      window.TURBOPACK_CHUNK_BASE_PATH = '/_next/';
      if (!Array.isArray(window.TURBOPACK)) window.TURBOPACK = [];
      for (const name of ['2aos7m4zex64_.js','2fm_rhppxfl88.js','3bsjd3e78ios7.js','1n7k__mot7als.js','0btqv4_a86_fu.js']) {
        await loadScript(capturedChunkUrl(name), chunkManifest.files[name]);
      }
      await loadScript(capturedChunkUrl('turbopack-09h7xzk04n98-.js'), chunkManifest.files['turbopack-09h7xzk04n98-.js']);
      await loadScript(capturedChunkUrl('3jpooibqppp4y.js'), chunkManifest.files['3jpooibqppp4y.js']);
      await loadScript('/three-bridge.js');
      await window.__OurletteBridgeReady;
      if (window.__OurletteBridgeError) throw new Error(window.__OurletteBridgeError);
      if (typeof window.__OurletteGarmentPreview !== 'function') throw new Error('The local 3D class was not exposed by the captured chunk runtime.');
      return window.__OurletteGarmentPreview;
    })();
  }
  return threePromise;
}

async function loadNativePatternView() {
  if (!patternPromise) {
    patternPromise = (async () => {
      if (!chunkManifest) {
        const response = await fetch('/vendor/chunk-manifest.json');
        if (!response.ok) throw new Error('Could not read the local chunk integrity manifest.');
        chunkManifest = await response.json();
      }
      window.TURBOPACK_CHUNK_BASE_PATH = '/_next/';
      if (!Array.isArray(window.TURBOPACK)) window.TURBOPACK = [];
      const runtimeName = 'turbopack-09h7xzk04n98-.js';
      for (const name of Object.keys(chunkManifest.files).filter((entry) => entry !== runtimeName)) {
        await loadScript(capturedChunkUrl(name), chunkManifest.files[name]);
      }
      await loadScript(capturedChunkUrl(runtimeName), chunkManifest.files[runtimeName]);
      await loadScript('/pattern-bridge.js');
      await window.__OurlettePatternBridgeReady;
      if (window.__OurlettePatternBridgeError) throw new Error(window.__OurlettePatternBridgeError);
      if (typeof window.__OurlettePatternView !== 'function') throw new Error('The captured React PatternView was not exposed.');
      if (typeof window.__OurletteReact?.createElement !== 'function') throw new Error('Captured React createElement was not exposed.');
      if (typeof window.__OurletteReactDOM?.createRoot !== 'function') throw new Error('Captured React createRoot was not exposed.');
      return {PatternView:window.__OurlettePatternView, React:window.__OurletteReact, ReactDOM:window.__OurletteReactDOM};
    })();
  }
  return patternPromise;
}

function allOptions() {
  return Object.fromEntries([...optionGroups.querySelectorAll('[data-option]')].map((input) => [
    input.dataset.option,
    input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value,
  ]));
}

function updateConditionalOptions() {
  const values = allOptions();
  for (const field of optionGroups.querySelectorAll('[data-option-key]')) {
    const option = schema.garment.options.find((entry) => entry.key === field.dataset.optionKey);
    const condition = option?.showIf;
    const visible = !condition || (condition.in ? condition.in.includes(values[condition.key]) : values[condition.key] === condition.equals);
    field.hidden = !visible;
  }
}

function createOptionField(option) {
  const wrapper = document.createElement(option.type === 'boolean' ? 'label' : 'div');
  wrapper.dataset.optionKey = option.key;
  if (option.type === 'boolean') {
    wrapper.className = 'toggle-field';
    wrapper.innerHTML = `<span>${esc(option.label)}</span><input type="checkbox" data-option="${esc(option.key)}" ${option.default ? 'checked' : ''}>`;
  } else {
    wrapper.className = 'field';
    let control;
    if (option.type === 'enum') {
      control = `<select data-option="${esc(option.key)}">${(option.choices || []).map((choice) => `<option value="${esc(choice.value)}" ${choice.value === option.default ? 'selected' : ''}>${esc(choice.label)}</option>`).join('')}</select>`;
    } else {
      control = `<span class="unit-input"><input data-option="${esc(option.key)}" type="number" min="${option.min ?? ''}" max="${option.max ?? ''}" step="${option.step ?? 1}" value="${option.default ?? 0}"><i>${esc(option.unit || '')}</i></span>`;
    }
    wrapper.innerHTML = `${esc(option.label)}${option.help ? `<small>${esc(option.help)}</small>` : ''}${control}`;
  }
  wrapper.addEventListener('change', updateConditionalOptions);
  return wrapper;
}

function renderOptionControls() {
  const groups = new Map();
  for (const option of schema.garment.options) {
    const group = groups.get(option.group) || [];
    group.push(option);
    groups.set(option.group, group);
  }
  optionGroups.replaceChildren();
  for (const [key, options] of groups) {
    const section = document.createElement('section');
    section.className = 'option-group';
    const heading = document.createElement('h2');
    heading.textContent = groupNames[key] || key;
    section.append(heading);
    options.forEach((option) => section.append(createOptionField(option)));
    optionGroups.append(section);
  }
  updateConditionalOptions();
}

function renderBodyChoices() {
  const bodies = [...new Set(schema.standardSizes.map((size) => size.body))];
  const preferredBody = bodies.includes(bodySelect.value) ? bodySelect.value : bodies.includes('men') ? 'men' : bodies[0];
  bodySelect.innerHTML = bodies.map((body) => `<option value="${esc(body)}" ${body === preferredBody ? 'selected' : ''}>${esc(body[0].toUpperCase() + body.slice(1))} chart</option>`).join('');
  renderSizeChoices();
}

function renderSizeChoices() {
  const sizes = schema.standardSizes.filter((size) => size.body === bodySelect.value);
  const previousSize = sizeSelect.value;
  sizeSelect.innerHTML = sizes.map((size) => {
    const label = size.labels?.intl || size.labels?.age || size.id;
    const preferred = sizes.some((entry) => entry.id === previousSize) ? previousSize : sizes.some((entry) => entry.id === 'm-m') ? 'm-m' : sizes[0]?.id;
    return `<option value="${esc(size.id)}" ${size.id === preferred ? 'selected' : ''}>${esc(label)}${size.labels?.eu ? ` · EU ${esc(size.labels.eu)}` : ''}</option>`;
  }).join('');
}

function renderCatalogChoices() {
  const groups = schema.categories.map((category) => {
    const garments = schema.garments.filter((entry) => entry.category === category);
    if (!garments.length) return '';
    return `<optgroup label="${esc(category[0].toUpperCase() + category.slice(1))}">${garments.map((entry) => `<option value="${esc(entry.id)}" ${entry.id === schema.garment.id ? 'selected' : ''}>${esc(entry.name)}</option>`).join('')}</optgroup>`;
  }).join('');
  garmentSelect.innerHTML = groups;
}

function markDraftDirty() {
  if (!lastDraft || draftIsDirty) return;
  draftIsDirty = true;
  pdfButton.disabled = true;
  draftState.textContent = 'Settings changed. Redraft before printing this pattern.';
}

function renderPaperChoices() {
  paperSelect.innerHTML = schema.papers.map((paper) => `<option value="${esc(paper.id)}">${esc(paper.label)}</option>`).join('');
  paperSelect.value = schema.papers.some((paper) => paper.id === 'a4') ? 'a4' : schema.papers[0]?.id || '';
}

function renderFabricChoices() {
  const labels = {woven:'Woven',knit:'Knit'};
  const options = schema.garment.fabrics.map((fabric) => `<option value="${esc(fabric)}">${esc(labels[fabric] || fabric)}</option>`).join('');
  $('#fabric-select').innerHTML = options;
  $('#fabric-select').disabled = schema.garment.fabrics.length < 2;
}

async function loadGarment(garmentId) {
  garmentSelect.disabled = true;
  draftButton.disabled = true;
  pdfButton.disabled = true;
  draftState.textContent = 'Loading this native catalog entry…';
  try {
    const response = await fetch(`/api/schema?garment=${encodeURIComponent(garmentId)}`);
    const next = await response.json();
    if (!response.ok || !next.garment) throw new Error(next.error || `Schema endpoint returned ${response.status}`);
    schema = next;
    lastDraft = null;
    draftIsDirty = false;
    patternRoot?.render(null);
    patternView.classList.remove('is-active');
    $('#model-view').classList.remove('is-active');
    $('#empty-state').hidden = false;
    resultMeta.hidden = true;
    inspector.hidden = true;
    renderCatalogChoices();
    renderOptionControls();
    renderBodyChoices();
    renderPaperChoices();
    renderFabricChoices();
    draftButton.disabled = false;
    applySelectedSize();
    $('#garment-title').textContent = schema.garment.name;
    engineStatus.textContent = `${schema.garment.name} · captured native engine`;
    draftState.textContent = `${schema.garment.options.length} native options · ${schema.standardSizes.length} standard chart entries`;
  } catch (error) {
    draftState.textContent = `Catalog entry unavailable: ${error.message}`;
    garmentSelect.value = schema?.garment?.id || '';
  } finally {
    garmentSelect.disabled = false;
    draftButton.disabled = false;
  }
}

function renderMeasurements(values) {
  selectedMeasurements = {...values};
  measurementFields.replaceChildren();
  for (const [key, value] of Object.entries(values)) {
    const label = document.createElement('label');
    label.className = 'field';
    label.innerHTML = `${esc(measurementNames[key] || key)}<span class="unit-input"><input type="number" step="0.1" min="0" data-measurement="${esc(key)}" value="${Number(value)}"><i>cm</i></span>`;
    label.querySelector('input').addEventListener('input', (event) => { selectedMeasurements[key] = Number(event.target.value); });
    measurementFields.append(label);
  }
}

function applySelectedSize() {
  const size = schema.standardSizes.find((entry) => entry.id === sizeSelect.value);
  if (size) renderMeasurements(size.m);
}

function activateTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach((button) => button.classList.toggle('is-active', button.dataset.tab === tab));
  document.querySelectorAll('.tab-page').forEach((page) => page.classList.toggle('is-active', page.dataset.page === tab));
}

function pathFor(points, closed = false) {
  const valid = (points || []).filter((point) => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y)));
  if (!valid.length) return '';
  return `M ${valid.map((point) => `${Number(point.x).toFixed(3)} ${Number(point.y).toFixed(3)}`).join(' L ')}${closed ? ' Z' : ''}`;
}

async function renderPattern(data) {
  const preview = data.preview;
  if (!Number.isFinite(Number(preview?.width_cm)) || !Array.isArray(data.output?.pieces) || !data.output.pieces.length) {
    throw new Error('The captured engine returned incomplete preview geometry.');
  }
  const {PatternView, React, ReactDOM} = await loadNativePatternView();
  if (!patternRoot) patternRoot = ReactDOM.createRoot(patternMount);
  patternRoot.render(React.createElement(PatternView, {
    pieces: data.output.pieces,
    names: Object.fromEntries(data.output.pieces.map((piece) => [piece.id, piece.name])),
    cuts: {},
    notes: {},
    highlight: null,
    labels: {zoomIn:'Zoom in',zoomOut:'Zoom out',fit:'Fit pattern',fold:'PLACE ON FOLD'},
    top: 0,
  }));
  $('#empty-state').hidden = true;
  patternView.classList.add('is-active');
  $('#garment-title').textContent = data.output?.spec?.title || schema.garment.name;
  resultMeta.hidden = false;
  resultMeta.innerHTML = `<span>${data.output.pieces.length} pieces · captured React PatternView</span><span>Native planner preview ${Number(preview.width_cm).toFixed(1)} × ${Number(preview.height_cm).toFixed(1)} cm</span><span>${esc(schema.garment.name)} · ${esc(sizeSelect.selectedOptions[0]?.textContent || '')} · ${esc(bodySelect.value)}</span>`;
  inspector.hidden = false;
  outputJson.textContent = JSON.stringify({spec:data.output.spec, measurements:data.output.measurements, settings:data.output.settings, pieces:data.output.pieces, seams:data.output.seams}, null, 2);
}

async function renderNative3D(data) {
  modelMessage.textContent = 'Loading captured 3D renderer and building a silhouette preview…';
  try {
    const GarmentPreview = await loadNative3D();
    threePreview?.dispose?.();
    modelStage.replaceChildren();
    threePreview = new GarmentPreview(modelStage);
    threePreview.update({
      measurements: data.output.measurements,
      body: data.output.settings?.body || bodySelect.value,
      silhouette: data.output.silhouette,
      look: data.output.spec?.look || {motif:'solid'},
      fabric: data.output.spec?.fabric || {kind:'woven'},
      image: null,
    });
    modelMessage.textContent = 'Native GarmentPreview · procedural silhouette. The captured sewn-mesh worker is not included in this capture.';
  } catch (error) {
    modelMessage.textContent = `3D preview unavailable here: ${error.message}`;
  }
}

function showView(view) {
  document.querySelectorAll('.view-button').forEach((button) => button.classList.toggle('is-active', button.dataset.view === view));
  patternView.classList.toggle('is-active', view === 'pattern' && Boolean(lastDraft));
  $('#model-view').classList.toggle('is-active', view === 'model' && Boolean(lastDraft));
  if (view === 'model' && lastDraft) renderNative3D(lastDraft);
}

async function draft(event) {
  event.preventDefault();
  draftButton.disabled = true;
  draftState.textContent = 'Drafting with the captured native JavaScript…';
  const input = {
    spec: {
      garment: schema.garment.id,
      title: schema.garment.name,
      options: allOptions(),
      fabric: {kind: $('#fabric-select').value},
    },
    measurements: Object.fromEntries([...measurementFields.querySelectorAll('[data-measurement]')].map((input) => [input.dataset.measurement, Number(input.value)])),
    settings: {units:'metric', body:bodySelect.value, seam:Number($('#seam-input').value), hem:Number($('#hem-input').value)},
  };
  try {
    const response = await fetch('/api/draft', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
    const data = await response.json();
    if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`);
    lastDraft = data;
    draftIsDirty = false;
    await renderPattern(data);
    pdfButton.disabled = false;
    if (document.querySelector('.view-button.is-active')?.dataset.view === 'model') {
      patternView.classList.remove('is-active');
      $('#model-view').classList.add('is-active');
      await renderNative3D(data);
    }
    draftState.textContent = 'Draft completed locally. No Ourlette account or service was contacted.';
  } catch (error) {
    draftState.textContent = `Draft failed: ${error.message}`;
  } finally {
    draftButton.disabled = false;
  }
}

async function openPrintPdf() {
  if (!lastDraft || draftIsDirty) return;
  pdfButton.disabled = true;
  draftState.textContent = 'Preparing print sheets with the captured native planner…';
  try {
    await loadNativePatternView();
    window.openNativePatternPdf({
      draft:lastDraft,
      paperId:paperSelect.value,
      planner:window.__OurlettePatternPlanner,
      geometry:window.__OurlettePatternGeometry,
    });
    draftState.textContent = 'Local print preview is open. Choose “Print / Save as PDF” there and use 100% scale.';
  } catch (error) {
    draftState.textContent = `Local PDF preparation failed: ${error.message}`;
  } finally {
    pdfButton.disabled = false;
  }
}

async function initialize() {
  document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => activateTab(button.dataset.tab)));
  document.querySelectorAll('.view-button').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));
  garmentSelect.addEventListener('change', () => void loadGarment(garmentSelect.value));
  bodySelect.addEventListener('change', () => { renderSizeChoices(); applySelectedSize(); markDraftDirty(); });
  sizeSelect.addEventListener('change', () => { applySelectedSize(); markDraftDirty(); });
  pdfButton.addEventListener('click', () => void openPrintPdf());
  $('#close-print').addEventListener('click', () => printDialog.close());
  optionGroups.addEventListener('change', markDraftDirty);
  draftForm.addEventListener('input', markDraftDirty);
  draftForm.addEventListener('submit', draft);
  try {
    const response = await fetch('/api/schema');
    if (!response.ok) throw new Error(`Schema endpoint returned ${response.status}`);
    schema = await response.json();
    renderCatalogChoices();
    renderPaperChoices();
    renderOptionControls();
    renderBodyChoices();
    renderFabricChoices();
    draftButton.disabled = false;
    engineStatus.textContent = `${schema.garment.name} · native local engine ready`;
    draftState.textContent = `${schema.garment.options.length} native options · ${schema.standardSizes.length} native base sizes`;
    if (new URLSearchParams(location.search).get('demo') === '3d') {
      await draft({preventDefault(){}});
      showView('model');
    }
  } catch (error) {
    engineStatus.textContent = 'Engine schema unavailable';
    draftState.textContent = error.message;
    draftButton.disabled = true;
  }
}

initialize();
