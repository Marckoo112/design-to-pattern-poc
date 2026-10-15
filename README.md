# Threadform — Ourlette JS Studio

A separate local prototype that calls the captured Ourlette browser drafting bundle directly. The interface is original; the garment catalog, option schemas, standard-size charts, drafting call, native React `PatternView`, and sheet packing planner are read from the captured JavaScript artifacts.

## Run locally

Requires Node.js 20+ and a browser with WebGL for the optional 3D view. No npm install is needed.

```sh
node server.mjs
```

Open <http://127.0.0.1:8767>. Drafting is performed by `vendor/ourlette/runner.cjs`, which executes an allowlisted subset of local captured chunks in a restricted VM. The server does not contact Ourlette. The 3D view loads the captured local `GarmentPreview` module in the browser. For a one-click offline sample draft plus 3D preview, open <http://127.0.0.1:8767/?demo=3d>.

Run the local checks with:

```sh
node --test tests/engine.test.mjs
```

The catalog selector exposes all 36 templates present in the captured engine, grouped by its seven native categories. Every catalog entry was smoke-tested to return pattern pieces using its captured default options. The UI is intentionally different from Ourlette.

## Scope and known limits

- The catalog means all 36 entries found in this specific captured build, not every garment Ourlette may offer in other releases or accounts.
- The 2D preview mounts the captured React `PatternView` module from `1d4pjs2gl9pex.js` with React/ReactDOM from the captured runtime chunks. The native `planPrint` function supplies tiled sheet placement.
- Local print sheets use that captured planner, then a small local vector-to-print wrapper and the browser's “Print / Save as PDF” facility. This is not Ourlette's own downloadable PDF: the editor source calls `/api/patterns/<id>/pdf`, whose server-side implementation, guide composition, account checks, and response generation are not present in the capture. Print at 100%; validate the calibration page before cutting.
- The captured `GarmentPreview` can render its procedural silhouette from native measurements and silhouette data. The editor's sewing worker chunks were excluded from the web capture, so this does not reproduce the worker-generated sewn garment mesh or fabric drape.
- AI image understanding, authenticated APIs, saving, purchases/credits, and Ourlette's backend PDF export are not included or called.
- Passing the same captured drafting function is evidence of shared code for that path, not proof of full product parity, exact output parity across every feature, or physical fit.

See `SOURCE_PROVENANCE.md` for artifact identity and capture limits.
