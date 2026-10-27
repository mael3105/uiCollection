// Compte les requêtes en cours d'une page, pour attendre les images que les
// carrousels et le chargement paresseux ne demandent qu'au dernier moment.
export function trackRequests(page) {
  const inFlight = new Set();
  let lastChange = Date.now();
  const add = (r) => { inFlight.add(r); lastChange = Date.now(); };
  const remove = (r) => { inFlight.delete(r); lastChange = Date.now(); };
  page.on('request', add);
  page.on('requestfinished', remove);
  page.on('requestfailed', remove);

  return {
    async waitForQuiet({ idleMs = 500, timeoutMs = 5000 } = {}) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (inFlight.size === 0 && Date.now() - lastChange >= idleMs) return;
        await new Promise((r) => setTimeout(r, 50));
      }
    },
  };
}
