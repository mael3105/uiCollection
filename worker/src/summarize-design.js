// Synthèse de la collecte faite dans la page (collect-design.js) : rôles de couleurs,
// échelles et composants au format des tokens DESIGN.md (spec Google Labs, alpha).

const ANALYSIS_VERSION = 1;
const SCALE_NAMES = {
  1: ['md'],
  2: ['sm', 'md'],
  3: ['sm', 'md', 'lg'],
  4: ['sm', 'md', 'lg', 'xl'],
};
const SPACING_NAMES = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];
const HEADER_HEIGHT = 120;
const MIN_MUTED_CONTRAST = 0.2;
const MIN_DISPLAY_RATIO = 1.25;
const ICON_FONTS = /awesome|icon|icomoon|material symbols|glyph|fallback/i;

export function summarizeDesign(raw) {
  const colors = colorRoles(raw);
  const typography = typographyRoles(raw.typography);
  const rounded = roundedScale(raw.radii);
  const spacing = spacingScale(raw.spacings);
  return {
    version: ANALYSIS_VERSION,
    meta: raw.meta,
    tech: raw.tech,
    colors,
    palette: palette(raw),
    typography,
    fonts: [...new Set(raw.fontsLoaded)].filter((f) => !ICON_FONTS.test(f)),
    rounded,
    spacing,
    shadows: raw.shadows.slice(0, 3).map(([value]) => value),
    components: components(raw, { colors, typography, rounded }),
    layout: {
      ...raw.layout,
      theme: luminance(rgbOf(colors.background) ?? [255, 255, 255]) < 0.4 ? 'sombre' : 'clair',
      heroMedia: mediaShare(raw.surfaces) >= 0.4,
    },
    headings: raw.headings,
  };
}

/** Couleur calculée → hex (#rrggbb ou #rrggbbaa) ; transparente → null ; autre syntaxe CSS gardée telle quelle. */
export function toHex(css) {
  const rgb = rgbaOf(css);
  if (!rgb) return css?.trim() || null;
  const [r, g, b, a] = rgb;
  if (a === 0) return null;
  const hex = '#' + [r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');
  return a < 1 ? hex + Math.round(a * 255).toString(16).padStart(2, '0') : hex;
}

function colorRoles(raw) {
  // Le fond est ce qu'on voit (échantillonnage de l'écran), pas ce que le CSS déclare
  // Sur un haut de page en image ou vidéo, les rares points restants ne disent rien du fond
  const visible = mediaShare(raw.surfaces) >= 0.4 ? [] : weighted(raw.surfaces.filter(([c]) => c !== 'media'));
  const background = opaque(visible[0] ?? weighted(raw.backgrounds)[0]);
  const flat = (hex) => blend(hex, background);
  const surfaces = [...visible, ...weighted(raw.backgrounds)].map(flat);
  const texts = weighted(raw.texts).map(flat);
  const neutral = (hex) => !isSaturated(hex);

  // Des deux textes neutres dominants, le plus contrasté est le texte principal
  const contrast = (hex) => Math.abs(luminance(rgbOf(hex) ?? [0, 0, 0]) - luminance(rgbOf(background) ?? [255, 255, 255]));
  const mainTexts = texts.filter(neutral).slice(0, 2).sort((x, y) => contrast(y) - contrast(x));
  const text = mainTexts[0] ?? texts[0];
  const primary = primaryColor(raw, surfaces, texts, background);
  const accent = [...surfaces, ...texts].find((c) => isSaturated(c) && c !== primary && distance(c, primary) > 80);

  return compact({
    background,
    surface: surfaces.find((c) => c !== background && neutral(c)),
    text,
    // Secondaire : moins contrasté que le texte, mais lisible sur ce même fond (pas le blanc d'un bandeau noir)
    'text-muted': texts.find((c) => c !== text && neutral(c) && contrast(c) >= MIN_MUTED_CONTRAST && contrast(c) < contrast(text)),
    primary,
    accent,
    border: weighted(raw.borders).map(flat)[0],
  });
}

// Couleur de marque : le bouton d'action vif le plus visible, sinon le bouton plein
// de l'en-tête (« Start free », souvent noir), sinon le plus grand bouton plein,
// sinon la couleur vive dominante.
function primaryColor(raw, surfaces, texts, background) {
  const filled = raw.actions
    .map((a) => ({ hex: toHex(a.bg), area: a.area, top: a.top ?? Infinity }))
    .filter((a) => a.hex && alphaOf(a.hex) >= 0.9 && a.hex !== background)
    .sort((a, b) => b.area - a.area);
  const cta = filled.find((a) => isSaturated(a.hex)) ?? filled.find((a) => a.top < HEADER_HEIGHT) ?? filled[0];
  return opaque(cta?.hex) ?? surfaces.find(isSaturated) ?? texts.find(isSaturated);
}

function mediaShare(surfaces) {
  const total = surfaces.reduce((sum, [, n]) => sum + n, 0);
  const media = surfaces.find(([c]) => c === 'media')?.[1] ?? 0;
  return total ? media / total : 0;
}

function palette(raw) {
  const actionBgs = raw.actions.map((a) => toHex(a.bg)).filter(Boolean);
  return [...new Set([...weighted(raw.backgrounds), ...actionBgs, ...weighted(raw.texts), ...weighted(raw.borders)])].slice(0, 8);
}

function typographyRoles(roles) {
  const out = {};
  for (const [role, style] of Object.entries(roles)) {
    if (style) out[role] = typographyToken(style);
  }
  // Une page sans grand titre (catalogue, fil d'Ariane en h1) n'a pas de style « display »
  const bodySize = parseFloat(out.body?.fontSize);
  if (out.display && parseFloat(out.display.fontSize) < bodySize * MIN_DISPLAY_RATIO) delete out.display;
  return out;
}

function typographyToken({ fontFamily, fontSize, fontWeight, lineHeight, letterSpacing }) {
  const size = parseFloat(fontSize);
  return compact({
    fontFamily: fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, ''),
    fontSize,
    fontWeight: Number(fontWeight),
    lineHeight: lineHeight.endsWith('px') ? round(parseFloat(lineHeight) / size, 2) : undefined,
    letterSpacing: letterSpacing.endsWith('px') && parseFloat(letterSpacing) !== 0
      ? `${round(parseFloat(letterSpacing) / size, 3)}em`
      : undefined,
  });
}

function roundedScale(radii) {
  const full = radii.some(([v]) => parseFloat(v) >= 999 || v.endsWith('%'));
  const values = radii
    .filter(([v]) => v.endsWith('px') && parseFloat(v) > 0 && parseFloat(v) < 999)
    .slice(0, 3)
    .map(([v]) => v)
    .sort((a, b) => parseFloat(a) - parseFloat(b));
  const scale = Object.fromEntries(values.map((v, i) => [SCALE_NAMES[values.length][i], v]));
  return full ? { ...scale, full: '9999px' } : scale;
}

function spacingScale(spacings) {
  const values = spacings
    .filter(([v, count]) => count >= 2 && parseFloat(v) > 0)
    .slice(0, SPACING_NAMES.length)
    .map(([v]) => v)
    .sort((a, b) => parseFloat(a) - parseFloat(b));
  return Object.fromEntries(values.map((v, i) => [SPACING_NAMES[i], v]));
}

function components(raw, { colors, typography, rounded }) {
  const color = (css) => {
    const hex = toHex(css) && (alphaOf(toHex(css)) >= 0.9 ? opaque(toHex(css)) : toHex(css));
    if (!hex) return 'transparent';
    if (hex === colors.primary) return '{colors.primary}';
    if (hex === colors.text) return '{colors.text}';
    return hex;
  };
  const radius = (v) => {
    const level = Object.entries(rounded).find(([, value]) => value === v)?.[0];
    return level ? `{rounded.${level}}` : v;
  };
  const border = (b) => (!b || b === 'none' || b.startsWith('0px') ? undefined : b.replace(/rgba?\([^)]*\)/, (c) => toHex(c) ?? 'transparent'));
  const label = typography.label ? '{typography.label}' : undefined;

  const filled = raw.actions.filter((a) => toHex(a.bg));
  const primary = filled.find((a) => opaque(toHex(a.bg)) === colors.primary) ?? filled[0];
  const secondary = raw.actions.find((a) => a !== primary && (toHex(a.bg) !== toHex(primary?.bg) || border(a.border)));

  const button = (a) => compact({
    backgroundColor: color(a.bg),
    textColor: color(a.color),
    border: border(a.border),
    rounded: radius(a.radius),
    padding: a.padding,
    typography: label,
  });

  return compact({
    'button-primary': primary && button(primary),
    'button-secondary': secondary && button(secondary),
    input: raw.input && compact({
      backgroundColor: color(raw.input.bg),
      textColor: color(raw.input.color),
      border: border(raw.input.border),
      rounded: radius(raw.input.radius),
      padding: raw.input.padding,
    }),
  });
}

// Couleurs ---------------------------------------------------------------------

function weighted(entries) {
  const totals = new Map();
  for (const [css, weight] of entries) {
    const hex = toHex(css);
    if (hex) totals.set(hex, (totals.get(hex) ?? 0) + weight);
  }
  return [...totals].sort((a, b) => b[1] - a[1]).map(([hex]) => hex);
}

function rgbaOf(css) {
  const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/.exec(css?.trim() ?? '');
  if (!m) return null;
  const alpha = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return [Number(m[1]), Number(m[2]), Number(m[3]), alpha];
}

function rgbOf(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex ?? '');
  return m && [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function alphaOf(hex) {
  return /^#[0-9a-f]{8}$/i.test(hex) ? parseInt(hex.slice(7), 16) / 255 : 1;
}

// #rrggbbaa presque opaque → #rrggbb
function opaque(hex) {
  return hex && /^#[0-9a-f]{8}$/i.test(hex) && alphaOf(hex) >= 0.9 ? hex.slice(0, 7) : hex;
}

// Couleur translucide → teinte réellement perçue sur le fond
function blend(hex, background) {
  const fg = rgbOf(hex);
  const bg = rgbOf(background);
  const a = alphaOf(hex);
  if (!fg || !bg || a === 1) return hex;
  return '#' + fg.map((c, i) => Math.round(bg[i] + (c - bg[i]) * a).toString(16).padStart(2, '0')).join('');
}

function isSaturated(hex) {
  const rgb = rgbOf(hex);
  if (!rgb) return false;
  const [r, g, b] = rgb.map((n) => n / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  return s > 0.25 && l > 0.15 && l < 0.85;
}

function luminance([r, g, b]) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function distance(a, b) {
  const x = rgbOf(a);
  const y = rgbOf(b);
  if (!x || !y) return Infinity;
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

const round = (n, digits) => Math.round(n * 10 ** digits) / 10 ** digits;

function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== false));
}
