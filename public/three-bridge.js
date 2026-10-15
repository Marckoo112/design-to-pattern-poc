try {
  globalThis.TURBOPACK.push([document.currentScript, 989908, (module) => {
    globalThis.__OurletteGarmentPreview = module.i(812538).GarmentPreview;
  }]);
  globalThis.__OurletteBridgeReady = Promise.resolve(globalThis.TURBOPACK.push([
    document.currentScript,
    {otherChunks: [], runtimeModuleIds: [989908]},
  ])).catch((error) => {
    globalThis.__OurletteBridgeError = error?.message || String(error);
  });
} catch (error) {
  globalThis.__OurletteBridgeError = error?.message || String(error);
  globalThis.__OurletteBridgeReady = Promise.resolve();
}
