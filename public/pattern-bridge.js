try {
  globalThis.TURBOPACK.push([document.currentScript, 989909, (module) => {
    const reactModule = module.i(271645);
    const reactDomModule = module.i(146480);
    globalThis.__OurlettePatternView = module.i(561973).PatternView;
    globalThis.__OurlettePatternPlanner = module.i(905917);
    globalThis.__OurlettePatternGeometry = module.i(951358);
    globalThis.__OurletteReact = reactModule.default || reactModule;
    globalThis.__OurletteReactDOM = reactDomModule.default || reactDomModule;
  }]);
  globalThis.__OurlettePatternBridgeReady = Promise.resolve(globalThis.TURBOPACK.push([
    document.currentScript,
    {otherChunks: [], runtimeModuleIds: [989909]},
  ])).catch((error) => {
    globalThis.__OurlettePatternBridgeError = error?.message || String(error);
  });
} catch (error) {
  globalThis.__OurlettePatternBridgeError = error?.message || String(error);
  globalThis.__OurlettePatternBridgeReady = Promise.resolve();
}
