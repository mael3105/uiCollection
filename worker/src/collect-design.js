// Exécutée dans la page (page.evaluate) : relève les styles calculés du haut de page.
// Autonome : aucune variable extérieure, le navigateur ne reçoit que ce texte.
export function collectDesign() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const scopeBottom = vh * 1.5;
  const tally = () => new Map();
  const add = (map, key, weight = 1) => map.set(key, (map.get(key) ?? 0) + weight);
  const sorted = (map) => [...map].sort((a, b) => b[1] - a[1]);
  const isTransparent = (c) => !c || c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c);
  const visibleArea = (r) => Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0))
    * Math.max(0, Math.min(r.bottom, scopeBottom) - Math.max(r.top, 0));
  const typo = (s) => ({ fontFamily: s.fontFamily, fontSize: s.fontSize, fontWeight: s.fontWeight, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing });
  const isShown = (el, s = getComputedStyle(el)) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0;
  };
  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();

  const backgrounds = tally();
  const texts = tally();
  const borders = tally();
  const radii = tally();
  const spacings = tally();
  const shadows = tally();
  const actions = [];
  const bodyStyles = tally();
  let input = null;
  let caption = null;

  const pageBg = [document.body, document.documentElement]
    .map((el) => getComputedStyle(el).backgroundColor)
    .find((c) => !isTransparent(c)) ?? 'rgb(255, 255, 255)';
  add(backgrounds, pageBg, vw * Math.min(scopeBottom, document.documentElement.scrollHeight));

  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > scopeBottom) continue;
    const s = getComputedStyle(el);
    if (!isShown(el, s)) continue;
    const area = visibleArea(r);

    if (!isTransparent(s.backgroundColor) && area > 0) add(backgrounds, s.backgroundColor, area);
    const text = ownText(el);
    if (text) add(texts, s.color, Math.min(text.length, 200));
    const hasBorder = parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none';
    if (hasBorder) add(borders, s.borderTopColor);
    else if (parseFloat(s.borderBottomWidth) > 0 && s.borderBottomStyle !== 'none') add(borders, s.borderBottomColor);
    if (s.borderTopLeftRadius !== '0px' && (!isTransparent(s.backgroundColor) || hasBorder)) add(radii, s.borderTopLeftRadius);
    for (const v of [s.paddingTop, s.paddingLeft, s.marginTop, s.marginBottom, s.rowGap, s.columnGap]) {
      if (v && v.endsWith('px') && parseFloat(v) > 0) add(spacings, `${Math.round(parseFloat(v))}px`);
    }
    if (s.boxShadow !== 'none') add(shadows, s.boxShadow);

    if (el.matches('a, button, [role=button], input[type=submit], input[type=button]')) {
      const looksLikeButton = (!isTransparent(s.backgroundColor) || hasBorder)
        && parseFloat(s.paddingLeft) >= 6 && r.height >= 24 && r.height <= 96
        && (el.innerText || el.value || '').trim();
      if (looksLikeButton) {
        actions.push({
          text: (el.innerText || el.value || '').trim().slice(0, 40),
          bg: s.backgroundColor,
          color: s.color,
          border: hasBorder ? `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}` : 'none',
          radius: s.borderTopLeftRadius,
          padding: `${s.paddingTop} ${s.paddingRight}`.replace(/^(\S+) \1$/, '$1'),
          ...typo(s),
          area: r.width * r.height,
          top: Math.round(r.top),
        });
      }
    }
    if (!input && el.matches('input:not([type]), input[type=text], input[type=email], input[type=search], input[type=tel], input[type=url], textarea')) {
      input = {
        bg: s.backgroundColor,
        color: s.color,
        border: hasBorder ? `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}` : 'none',
        radius: s.borderTopLeftRadius,
        padding: `${s.paddingTop} ${s.paddingLeft}`.replace(/^(\S+) \1$/, '$1'),
        ...typo(s),
      };
    }
    if (el.matches('p, li') && text) {
      add(bodyStyles, JSON.stringify(typo(s)), text.length * (el.tagName === 'P' ? 3 : 1));
    }
  }

  // Corps de texte : le style qui porte le plus de texte ; légende : un texte nettement plus petit
  const body = sorted(bodyStyles)[0]?.[0];
  const bodySize = body ? parseFloat(JSON.parse(body).fontSize) : 16;
  for (const el of document.body.querySelectorAll('small, figcaption, p, li, span')) {
    const s = getComputedStyle(el);
    if (ownText(el) && parseFloat(s.fontSize) <= bodySize - 2 && isShown(el, s)) { caption = typo(s); break; }
  }
  const firstShown = (selector) => [...document.querySelectorAll(selector)].find((el) => isShown(el));
  const styleOf = (el) => el && typo(getComputedStyle(el));
  const labelAction = actions.find((a) => !isTransparent(a.bg)) ?? actions[0];

  const meta = (selector, attr = 'content') => document.querySelector(selector)?.getAttribute(attr) || null;

  const generator = meta('meta[name=generator]') ?? '';
  // Icône du site : SVG, sinon la plus grande déclarée ; /favicon.ico en dernier recours
  const favicon = () => {
    const size = (link) => {
      if (/svg/.test(link.type) || /\.svg(\?|$)/.test(link.href) || link.sizes?.value === 'any') return 1000;
      const sizes = (link.sizes?.value ?? '').split(/\s+/).map((v) => parseInt(v, 10)).filter(Boolean);
      return sizes.length ? Math.max(...sizes) : link.rel.includes('apple') ? 180 : 16;
    };
    const best = [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')]
      .filter((link) => link.href)
      .sort((a, b) => size(b) - size(a))[0];
    if (best) return best.href;
    return /^https?:$/.test(location.protocol) ? `${location.origin}/favicon.ico` : null;
  };
  const has = (selector) => !!document.querySelector(selector);
  const tech = [
    ['Next.js', () => !!window.__NEXT_DATA__ || has('#__next, script[src*="/_next/"]')],
    ['Nuxt', () => !!window.__NUXT__ || has('#__nuxt')],
    ['Astro', () => has('astro-island, [data-astro-cid]') || /astro/i.test(generator)],
    ['Gatsby', () => has('#___gatsby')],
    ['WordPress', () => /wordpress/i.test(generator) || has('link[href*="wp-content"], script[src*="wp-content"]')],
    ['Webflow', () => has('html[data-wf-site]') || /webflow/i.test(generator)],
    ['Framer', () => /framer/i.test(generator) || has('[data-framer-name], #__framer-badge-container')],
    ['Wix', () => /wix/i.test(generator)],
    ['Squarespace', () => /squarespace/i.test(generator) || !!window.Static?.SQUARESPACE_CONTEXT],
    ['Shopify', () => !!window.Shopify],
    ['HubSpot', () => has('script[src*="hs-scripts"], script[src*="hubspot"]')],
    ['React', () => has('[data-reactroot]') || [...document.querySelectorAll('body > *')].some((el) => Object.keys(el).some((k) => k.startsWith('__react')))],
    ['Vue', () => !!window.__VUE__ || [...document.querySelectorAll('body *')].slice(0, 300).some((el) => [...el.attributes].some((a) => a.name.startsWith('data-v-')))],
    ['Svelte', () => has('[class*="svelte-"]')],
    ['GSAP', () => !!window.gsap],
    ['Lenis', () => document.documentElement.classList.contains('lenis')],
    ['Three.js', () => !!window.THREE || has('canvas[data-engine*="three"]')],
    ['Lottie', () => !!window.lottie || has('lottie-player, dotlottie-player')],
    ['Tailwind', () => getComputedStyle(document.body).getPropertyValue('--tw-ring-offset-width') !== ''],
  ].filter(([, test]) => { try { return test(); } catch { return false; } }).map(([name]) => name);

  // Ce que l'œil voit : grille de points sur le premier écran, fond du premier ancêtre opaque
  const surfaces = tally();
  const isMedia = (el, st) => el.matches('img, video, canvas, picture, svg') || st.backgroundImage !== 'none';
  // Grands médias visibles, même ceux qui ignorent le pointeur (vidéo de fond)
  const bigMedia = [...document.body.querySelectorAll('video, canvas, img, picture, [style*="background"]')]
    .filter((el) => {
      const st = getComputedStyle(el);
      if (!isShown(el, st) || !(el.matches('video, canvas, img, picture') || st.backgroundImage !== 'none')) return false;
      const r = el.getBoundingClientRect();
      return r.top < vh && visibleArea(r) >= vw * vh * 0.25;
    })
    .map((el) => el.getBoundingClientRect());
  for (let y = vh / 28; y < vh; y += vh / 14) {
    for (let x = vw / 40; x < vw; x += vw / 20) {
      // Toute la pile sous le point : une vidéo de fond est une voisine du texte, pas son parent
      let found = bigMedia.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) ? 'media' : null;
      for (const el of found ? [] : document.elementsFromPoint(x, y)) {
        if (el === document.documentElement || el === document.body) break;
        const st = getComputedStyle(el);
        if (isMedia(el, st)) { found = 'media'; break; }
        if (!isTransparent(st.backgroundColor) && Number(st.opacity) > 0.5) { found = st.backgroundColor; break; }
      }
      add(surfaces, found ?? pageBg);
    }
  }

  // Titre principal : le plus grand texte du premier écran, le h1 s'il est presque aussi grand
  let largest = null;
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.top > vh || r.bottom < 0 || !ownText(el)) continue;
    const st = getComputedStyle(el);
    if (!isShown(el, st)) continue;
    if (!largest || parseFloat(st.fontSize) > parseFloat(largest.fontSize)) largest = typo(st);
  }
  const h1 = firstShown('h1');
  const h1Style = styleOf(h1);
  const display = h1Style && (!largest || parseFloat(h1Style.fontSize) >= parseFloat(largest.fontSize) * 0.8) ? h1Style : largest;

  const widths = tally();
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.top > scopeBottom || r.width < 320 || r.width > vw - 20) continue;
    if (Math.abs(r.left - (vw - r.right)) > 2) continue;
    const s = getComputedStyle(el);
    add(widths, Math.round(r.width - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)), r.height);
  }

  return {
    viewport: { width: vw, height: vh },
    backgrounds: sorted(backgrounds),
    surfaces: sorted(surfaces),
    texts: sorted(texts),
    borders: sorted(borders),
    radii: sorted(radii),
    spacings: sorted(spacings),
    shadows: sorted(shadows),
    actions: actions.slice(0, 12),
    input,
    typography: {
      display,
      headline: styleOf(firstShown('h2')),
      title: styleOf(firstShown('h3')),
      body: body ? JSON.parse(body) : null,
      label: labelAction ? typo(labelAction) : null,
      caption,
    },
    fontsLoaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/^["']|["']$/g, '')),
    meta: {
      description: meta('meta[name=description]') ?? meta('meta[property="og:description"]'),
      lang: document.documentElement.lang || null,
      themeColor: meta('meta[name=theme-color]'),
      ogImage: meta('meta[property="og:image"]'),
      canonical: meta('link[rel=canonical]', 'href'),
      generator: generator || null,
      favicon: favicon(),
    },
    tech,
    layout: {
      pageHeight: document.documentElement.scrollHeight,
      contentWidth: sorted(widths)[0]?.[0] ?? null,
      hasVideo: [...document.querySelectorAll('video')].some((v) => v.getBoundingClientRect().top < vh && isShown(v)),
      hasCanvas: [...document.querySelectorAll('canvas')].some((c) => { const r = c.getBoundingClientRect(); return r.width * r.height > vw * vh * 0.2 && r.top < vh; }),
    },
    headings: [...document.querySelectorAll('h1, h2, h3')]
      .filter((h) => isShown(h) && h.innerText.trim())
      .slice(0, 20)
      .map((h) => ({ level: Number(h.tagName[1]), text: h.innerText.trim().replace(/\s+/g, ' ').slice(0, 120) })),
  };
}
