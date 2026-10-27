// Un Chromium qui plante (page WebGL trop lourde…) ne doit pas faire échouer le reste du lot.
export function createBrowserProvider(launch) {
  let browser = null;
  return {
    async get() {
      if (!browser?.isConnected()) browser = await launch();
      return browser;
    },
    async close() {
      await browser?.close();
    },
  };
}
