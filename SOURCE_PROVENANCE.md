# Source provenance and reuse scope

- Source: user-provided local REA browser capture in `../ourlette-editor-web-scripts`.
- Captured editor build identifier: `09b408d4c34bf907fb334f7b09c9a4695e5ad89f60eb79436f116e0e5f7b7d69`.
- Captured JavaScript directory contained 19 `.js` chunks totaling approximately 2.7 MiB; all 19 are copied under `vendor/ourlette/chunks/` without source edits.
- User stated in the conversation that permission to reuse the mentor-owned Ourlette code had been granted. This project records that statement; it does not independently verify the license or grant.
- The static capture and earlier REA analysis had partial semantic coverage for minified assets. The local drafting adapter uses a seven-chunk allowlist with SHA-256 checks before execution.
- Captured `1zw79tud79w2h.js` exports `GARMENTS`, `CATEGORY_ORDER`, and `getGarment`; this build exposes the 36 entries returned by that catalog and uses their native option schemas.
- Captured `1d4pjs2gl9pex.js` exports React `PatternView` (module 561973), which is mounted with the React runtime in captured chunks. The local export wrapper uses native `planPrint` from module 905917, but PDF encoding and browser print integration are local code.
- Captured editor code calls `/api/patterns/{id}/pdf` for PDF download. That authenticated/backend route is not implemented in the captured frontend source; this project does not call it. The local print wrapper does not reproduce backend guide/PDF composition or account behavior.
- 3D class `GarmentPreview` is in `3jpooibqppp4y.js` (module 812538). The React editor wrapper and sewing worker are separate; worker chunks referenced by the editor were not present in this capture.
- No AI backend source, model weights, authenticated server implementation, or complete worker set is included. No credentials or backend endpoints are queried by this application.

This is a local reuse prototype based on available captured artifacts. It must not be described as a complete or identical Ourlette system.
