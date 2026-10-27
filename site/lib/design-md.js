// DESIGN.md (spec Google Labs, alpha) : tokens mesurés par le robot en front matter YAML,
// puis les sections dans l'ordre imposé. La prose ne décrit que ce qui a été mesuré
// ou saisi : rien n'est inventé, « Do's and Don'ts » est déclaré absent.

const COLOR_ROLES = {
  background: 'fond de page',
  surface: 'surfaces (cartes, bandeaux)',
  text: 'texte principal',
  'text-muted': 'texte secondaire',
  primary: "couleur d'action (bouton principal)",
  accent: "couleur d'accent",
  border: 'bordures et séparateurs',
};
const TYPE_ROLES = {
  display: 'grand titre du premier écran',
  headline: 'titres de section, h2',
  title: 'sous-titres, h3',
  body: 'texte courant',
  label: 'boutons',
  caption: 'petits textes, légendes',
};

const SCALE_ORDER = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', 'full'];
const COMPONENT_ORDER = ['button-primary', 'button-secondary', 'input'];

/** Clés dans l'ordre voulu ; Postgres (jsonb) les range par longueur puis alphabet. */
export function ordered(obj = {}, order) {
  const known = order.filter((k) => k in obj);
  const rest = Object.keys(obj).filter((k) => !order.includes(k));
  return Object.fromEntries([...known, ...rest].map((k) => [k, obj[k]]));
}

/** Analyse aux clés réordonnées, pour la fiche comme pour le fichier. */
export function orderedAnalysis(a) {
  return a && {
    ...a,
    colors: ordered(a.colors, Object.keys(COLOR_ROLES)),
    typography: ordered(a.typography, Object.keys(TYPE_ROLES)),
    rounded: ordered(a.rounded, SCALE_ORDER),
    spacing: ordered(a.spacing, SCALE_ORDER),
    components: ordered(a.components, COMPONENT_ORDER),
  };
}

/** @param {object} page ligne de `pages` (avec `analysis` et les champs édités) */
export function renderDesignMd(page) {
  const a = orderedAnalysis(page.analysis);
  const name = page.display_name || page.site_name || hostOf(page.url);
  const front = {
    version: 'alpha',
    name,
    description: a?.meta?.description || page.page_title || undefined,
  };
  if (!a) {
    return [yamlBlock(front), `# ${name}`, '', overview(page, null), ''].join('\n');
  }
  Object.assign(front, {
    colors: a.colors,
    typography: a.typography,
    rounded: a.rounded,
    spacing: a.spacing,
    components: a.components,
    omitted: [{ section: "Do's and Don'ts", reason: 'Non mesurable sur une capture : à rédiger.' }],
  });

  return [
    yamlBlock(front),
    `# ${name}`,
    '',
    overview(page, a),
    colorsSection(a),
    typographySection(a),
    layoutSection(a),
    elevationSection(a),
    shapesSection(a),
    componentsSection(a),
  ].join('\n');
}

function overview(page, a) {
  const lines = ['## Overview', ''];
  const facts = [
    ['Source', page.url],
    ['Capturée le', page.captured_at && new Date(page.captured_at).toISOString().slice(0, 10)],
    ['Type de site', page.site_type],
    ['Type de page', page.page_type],
    ['Styles', page.styles?.length ? page.styles.join(', ') : null],
    ['Thème', a && `${a.layout.theme}${a.layout.heroMedia ? ', haut de page sur image ou vidéo' : ''}`],
    ['Polices chargées', a?.fonts?.length ? a.fonts.join(', ') : null],
    ['Technologies détectées', a?.tech?.length ? a.tech.join(', ') : null],
  ];
  for (const [label, value] of facts) if (value) lines.push(`- **${label}** : ${value}`);
  if (page.notes) lines.push('', page.notes);
  if (!a) lines.push('', "Analyse de design indisponible : utiliser « Refaire la capture » pour la calculer.");
  return lines.join('\n') + '\n';
}

function colorsSection(a) {
  const lines = ['## Colors', ''];
  for (const [role, hex] of Object.entries(a.colors)) {
    lines.push(`- **${role}** \`${hex}\` : ${COLOR_ROLES[role] ?? role}`);
  }
  if (a.palette?.length) lines.push('', `Palette relevée (par surface décroissante) : ${a.palette.map((c) => `\`${c}\``).join(' ')}`);
  return lines.join('\n') + '\n';
}

function typographySection(a) {
  const lines = ['## Typography', ''];
  for (const [role, t] of Object.entries(a.typography)) {
    const details = [t.fontFamily, t.fontSize, `graisse ${t.fontWeight}`, t.lineHeight && `interligne ${t.lineHeight}`, t.letterSpacing && `approche ${t.letterSpacing}`];
    lines.push(`- **${role}** (${TYPE_ROLES[role] ?? role}) : ${details.filter(Boolean).join(', ')}`);
  }
  return lines.join('\n') + '\n';
}

function layoutSection(a) {
  const lines = ['## Layout', ''];
  if (a.layout.contentWidth) lines.push(`- Largeur de contenu : ${a.layout.contentWidth}px (mesurée à 1440px de large)`);
  lines.push(`- Hauteur de page : ${a.layout.pageHeight}px`);
  if (Object.keys(a.spacing).length) lines.push(`- Espacements les plus fréquents : ${Object.values(a.spacing).join(', ')}`);
  if (a.layout.hasVideo) lines.push('- Vidéo dans le premier écran');
  if (a.layout.hasCanvas) lines.push('- Grand canvas (animation ou WebGL)');
  if (a.headings?.length) {
    lines.push('', 'Plan de la page :', '');
    for (const h of a.headings) lines.push(`- h${h.level} : ${h.text}`);
  }
  return lines.join('\n') + '\n';
}

function elevationSection(a) {
  const lines = ['## Elevation & Depth', ''];
  if (a.shadows?.length) {
    lines.push('Ombres relevées :', '');
    for (const s of a.shadows) lines.push(`- \`${s}\``);
  } else {
    lines.push('Aucune ombre relevée : la hiérarchie passe par les couleurs de fond et les bordures.');
  }
  return lines.join('\n') + '\n';
}

function shapesSection(a) {
  const entries = Object.entries(a.rounded);
  const lines = ['## Shapes', ''];
  lines.push(entries.length
    ? entries.map(([k, v]) => `- **${k}** : ${v}`).join('\n')
    : 'Angles droits : aucun arrondi relevé.');
  return lines.join('\n') + '\n';
}

function componentsSection(a) {
  const lines = ['## Components', ''];
  const entries = Object.entries(a.components);
  if (!entries.length) lines.push('Aucun bouton ni champ reconnaissable dans le haut de page.');
  for (const [name, tokens] of entries) {
    lines.push(`- **${name}** : ${Object.entries(tokens).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  }
  return lines.join('\n') + '\n';
}

// YAML ---------------------------------------------------------------------------

function yamlBlock(obj) {
  return `---\n${yaml(obj, 0)}---\n`;
}

function yaml(value, indent) {
  const pad = '  '.repeat(indent);
  let out = '';
  if (Array.isArray(value)) {
    for (const item of value) {
      if (isObject(item)) {
        const [first, ...rest] = yaml(item, indent + 1).split('\n');
        out += `${pad}- ${first.trimStart()}\n${rest.filter(Boolean).map((l) => l + '\n').join('')}`;
      } else {
        out += `${pad}- ${scalar(item)}\n`;
      }
    }
    return out;
  }
  for (const [key, v] of Object.entries(value)) {
    if (v === undefined || v === null) continue;
    if (isObject(v) || Array.isArray(v)) {
      if (Object.keys(v).length === 0) continue;
      out += `${pad}${key}:\n${yaml(v, indent + 1)}`;
    } else {
      out += `${pad}${key}: ${scalar(v)}\n`;
    }
  }
  return out;
}

const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

// Toute chaîne entre guillemets : « yes », « #1 », « a: b » ou « {colors.x} » restent du texte
function scalar(v) {
  return typeof v === 'number' ? String(v) : JSON.stringify(String(v));
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}
