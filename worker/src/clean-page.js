// Nettoyage avant capture : bannières cookies, popups commerciales, widgets de chat.
// Logique cookies reprise de -sandbox/capture/capture.mjs.

// Le nom entier du bouton doit correspondre : « Acceptez les paiements » n'est pas un bouton cookies.
const REFUSE = /^\s*(tout refuser|refuser tout|continuer sans accepter|refuser|reject all|decline all|decline|only necessary|necessary only)\s*$/i;
const ACCEPT = /^\s*(tout accepter|accepter et fermer|accepter tout|j'accepte|accepter|accept all|allow all|accept|agree|i agree)\s*$/i;
// Ancré au début du nom : « Close dialog » oui, « Disclosures » ou « Collateral » non.
const CLOSE = /^\s*(fermer|close|×|✕|non merci|no thanks|plus tard|maybe later|dismiss)(?![\p{L}\p{N}]).{0,20}$/iu;

// Filet de sécurité : masque les conteneurs de CMP et de chat les plus répandus
const HIDE_CSS = `
#onetrust-consent-sdk, #didomi-host, #CybotCookiebotDialog, #tarteaucitronRoot,
#axeptio_overlay, #usercentrics-root, .cky-consent-container, #cmpbox, #cmpbox2,
.qc-cmp2-container, #intercom-container, .intercom-lightweight-app, #crisp-chatbox,
#hubspot-messages-iframe-container, .drift-frame-controller, #tidio-chat, .zsiq_floatmain
{ display: none !important; }`;

export async function dismissConsent(page) {
  for (const [label, re] of [['refus', REFUSE], ['acceptation', ACCEPT]]) {
    for (const frame of page.frames()) {
      // Certaines CMP (Stripe…) utilisent des liens stylés en boutons
      for (const role of ['button', 'link']) {
        try {
          const btn = frame.getByRole(role, { name: re }).first();
          if (await btn.isVisible({ timeout: 500 })) {
            await btn.click({ timeout: 2000 });
            await page.waitForTimeout(800);
            return label;
          }
        } catch { /* bouton absent ou non cliquable : on continue */ }
      }
    }
  }
  return null;
}

export async function dismissPopups(page) {
  const warnings = [];
  await page.keyboard.press('Escape').catch(() => {});

  for (const frame of page.frames()) {
    for (const role of ['button', 'link']) {
      const candidates = frame.getByRole(role, { name: CLOSE });
      const count = await candidates.count().catch(() => 0);
      for (let i = 0; i < count; i++) {
        const el = candidates.nth(i);
        try {
          if (await el.isVisible() && await isDismissControl(el)) {
            await el.click({ timeout: 2000 });
            await page.waitForTimeout(400);
          }
        } catch { /* élément détaché ou masqué entre-temps */ }
      }
    }
  }

  const hidden = await page.evaluate(hideCoveringOverlays);
  if (hidden > 0) warnings.push(`${hidden} popup(s) masquée(s) sans bouton de fermeture`);
  return warnings;
}

export async function cleanPage(page) {
  let consent = await dismissConsent(page);
  await page.addStyleTag({ content: HIDE_CSS }).catch(() => {});
  const warnings = await dismissPopups(page);

  await page.evaluate(async () => {
    window.scrollTo(0, Math.round(window.innerHeight * 1.5));
    await new Promise((r) => setTimeout(r, 600));
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() => document.fonts?.ready);

  consent ??= await dismissConsent(page); // bannières qui apparaissent tard
  warnings.push(...await dismissPopups(page));
  return { consent, warnings: [...new Set(warnings)] };
}

// Un bouton « Fermer » n'est cliqué que s'il appartient à une couche flottante hors
// en-tête, et un lien seulement s'il ne mène nulle part : on ne quitte jamais la page.
async function isDismissControl(locator) {
  return locator.evaluate((el) => {
    if (el.closest('header, nav, [role=banner]')) return false;
    const href = el.getAttribute('href');
    if (href && !href.startsWith('#') && !href.startsWith('javascript:')) return false;
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const pos = getComputedStyle(n).position;
      if (pos === 'fixed' || n.getAttribute('role') === 'dialog' || n.tagName === 'DIALOG') return true;
    }
    return false;
  });
}

// Exécutée dans la page : masque les couches fixes qui recouvrent la fenêtre,
// épargne l'en-tête du site, puis débloque le défilement.
function hideCoveringOverlays() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let hidden = 0;
  for (const el of document.body.querySelectorAll('*')) {
    const style = getComputedStyle(el);
    if (style.position !== 'fixed' && style.position !== 'sticky') continue;
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (el.matches('header, nav, [role=banner]') || el.closest('header, nav, [role=banner]')) continue;
    const zIndex = Number.parseInt(style.zIndex, 10);
    if (!(zIndex > 0)) continue;
    const r = el.getBoundingClientRect();
    const visibleW = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
    const visibleH = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    if ((visibleW * visibleH) / (vw * vh) < 0.3) continue;
    if (r.top <= 0 && r.height <= vh * 0.25) continue;
    // Conteneur de défilement (parallaxe) : il porte la page elle-même, pas une popup
    if (r.height > vh * 1.5 || el.querySelector('main, [role=main]')) continue;
    el.style.setProperty('display', 'none', 'important');
    hidden++;
  }
  // Panneau de dialogue frère de son fond (Radix, Headless UI) : trop petit pour le seuil de surface
  for (const el of document.body.querySelectorAll('[role=dialog], [aria-modal=true], dialog[open]')) {
    const style = getComputedStyle(el);
    if (style.position !== 'fixed' || style.display === 'none' || el.closest('header, nav, [role=banner]')) continue;
    el.style.setProperty('display', 'none', 'important');
    hidden++;
  }
  for (const root of [document.documentElement, document.body]) {
    if (getComputedStyle(root).overflow === 'hidden' || getComputedStyle(root).overflowY === 'hidden') {
      root.style.setProperty('overflow', 'auto', 'important');
    }
  }
  return hidden;
}
