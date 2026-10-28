import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config.js';
import { isHttpUrl, readAddParam, stripAddParam } from './lib/add-param.js';
import { clearPendingAdd, readPendingAdd, savePendingAdd } from './lib/pending-add.js';
import { createThumbnails } from './lib/thumbnails.js';
import { filterPages } from './lib/filter-pages.js';
import { domainOf, groupBySite } from './lib/stacks.js';
import { activityLabel, statusLabel } from './lib/page-state.js';
import { FACETS, FAMILY_SWATCH, applyFacets, facetOptions } from './lib/facets.js';
import { icon } from './lib/icons.js';
import { createDetail } from './detail.js';

const SIGNED_URL_TTL = 3600;
const DENSITY_KEY = 'uic-density';
const THEME_KEY = 'uic-theme';

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);
const thumbnails = createThumbnails({
  ttlMs: SIGNED_URL_TTL * 1000,
  sign: async (paths) => {
    const { data, error } = await db.storage.from('thumbnails').createSignedUrls(paths, SIGNED_URL_TTL);
    if (error) throw error;
    return data;
  },
});
const state = {
  pages: [],
  query: '',
  filters: {}, // { site_type: 'SaaS', color: 'bleu', … } : une valeur par filtre
  density: readDensity(),
  confirmDeleteId: null,
  highlightId: null,
  started: false,
  channel: null,
  site: null, // domaine affiché seul quand on ouvre une pile
  detailPushed: false, // fiche ouverte depuis l'appli : la fermer revient en arrière
};
const detail = createDetail({
  db,
  thumbnails,
  getPage: (id) => state.pages.find((p) => p.id === id),
  getPages: () => state.pages,
  retry: retryPage,
  reanalyze: reanalyzePage,
  remove: deletePage,
  toast,
  onClose: () => {
    // Fermée par Échap ou ✕ : revenir à l'entrée d'historique d'avant la fiche si c'est la nôtre
    if (!readRoute().page) return;
    if (state.detailPushed) {
      state.detailPushed = false;
      history.back();
    } else {
      history.replaceState(null, '', routeHash({ site: state.site }) || location.pathname);
      applyRoute();
    }
  },
});

// Une URL partagée (favori, Raccourci) est mise de côté avant toute vérification
// de session, puis retirée de l'adresse pour qu'un rechargement ne la réajoute pas.
// `shared` reste en mémoire si le stockage du navigateur est bloqué.
let shared = readAddParam(location.href);
if (shared) {
  savePendingAdd(sessionStorage, shared);
  history.replaceState(null, '', stripAddParam(location.href));
}

// supabase-js déconseille d'appeler le client dans ce rappel : on sort de la pile d'abord.
db.auth.onAuthStateChange((event, session) => {
  setTimeout(() => (session ? start(session) : showLogin()), 0);
});

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = e.submitter;
  button.disabled = true;
  $('login-error').hidden = true;
  const { error } = await db.auth.signInWithPassword({
    email: $('login-email').value.trim(),
    password: $('login-password').value,
  });
  button.disabled = false;
  if (error) {
    $('login-error').textContent = error.status === 400
      ? 'E-mail ou mot de passe incorrect.'
      : `Connexion impossible : ${error.message}`;
    $('login-error').hidden = false;
  }
});

$('logout').addEventListener('click', () => db.auth.signOut());

// Thème : Auto suit le système ; Clair et Sombre sont gardés dans ce navigateur (lus aussi par index.html)
document.querySelector('.theme-choice').addEventListener('click', (e) => {
  const choice = e.target.closest('[data-theme-choice]')?.dataset.themeChoice;
  if (!choice) return;
  if (choice === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
  try {
    if (choice === 'auto') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch { /* choix perdu au rechargement */ }
  showThemeChoice();
});
showThemeChoice();

function showThemeChoice() {
  const current = document.documentElement.dataset.theme ?? 'auto';
  for (const button of document.querySelectorAll('[data-theme-choice]')) {
    button.setAttribute('aria-pressed', String(button.dataset.themeChoice === current));
  }
}

$('add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('add-url');
  if (await addUrl(input.value)) input.value = '';
});

$('search').addEventListener('input', (e) => {
  state.query = e.target.value;
  render();
});

$('grid').addEventListener('click', onGridClick);
$('back-all').addEventListener('click', () => setRoute({}));
$('facets').addEventListener('click', onFacetClick);
$('reset-filters').addEventListener('click', () => {
  state.filters = {};
  state.query = '';
  $('search').value = '';
  render();
});
document.querySelector('.density').addEventListener('click', (e) => {
  const button = e.target.closest('[data-density]');
  if (!button) return;
  state.density = button.dataset.density;
  try { localStorage.setItem(DENSITY_KEY, state.density); } catch { /* préférence perdue au rechargement */ }
  render();
});
$('search-icon').innerHTML = icon('search', 16);
$('back-all').innerHTML = icon('arrow-left', 18);
document.querySelector('[data-density="large"]').innerHTML = icon('layout-grid', 16);
document.querySelector('[data-density="compact"]').innerHTML = icon('grid-3x3', 16);

// Favicon introuvable ou bloqué : l'initiale dessous reste visible
document.addEventListener('error', (e) => {
  if (e.target.matches?.('.site-icon img')) e.target.remove();
}, true);

function readDensity() {
  try { return localStorage.getItem(DENSITY_KEY) === 'compact' ? 'compact' : 'large'; } catch { return 'large'; }
}

// Adresse : #site=<domaine> pour une pile ouverte, #page=<id> pour une fiche ;
// le bouton retour du navigateur referme la fiche ou la pile.
window.addEventListener('hashchange', applyRoute);

function readRoute() {
  const params = new URLSearchParams(location.hash.slice(1));
  return { site: params.get('site'), page: params.get('page') };
}

function routeHash({ site, page }) {
  const params = new URLSearchParams();
  if (site) params.set('site', site);
  if (page) params.set('page', page);
  const hash = params.toString();
  return hash ? `#${hash}` : '';
}

function setRoute(route) {
  const hash = routeHash(route);
  if (hash === location.hash) {
    applyRoute();
    return;
  }
  state.detailPushed = Boolean(route.page);
  if (hash) {
    location.hash = hash;
  } else {
    // Assigner un hash vide laisserait un « # » dans l'adresse
    history.pushState(null, '', location.pathname);
    applyRoute();
  }
}

async function applyRoute() {
  if (!state.started) return;
  const { site, page } = readRoute();
  state.site = site;
  render();
  if (page && detail.openId !== page && !detail.open(page)) setRoute({ site });
  if (!page && detail.openId) {
    // Retour arrière du navigateur avec des modifications non enregistrées : la fiche reste si on annule
    const openId = detail.openId;
    if (!(await detail.requestClose())) {
      state.detailPushed = true;
      history.pushState(null, '', routeHash({ site, page: openId }));
    }
  }
}

// Un seul menu ouvert à la fois ; un clic ailleurs ou Échap le referme.
document.addEventListener('toggle', (e) => {
  const menu = e.target;
  if (!menu.matches?.('details.menu')) return;
  if (menu.open) {
    closeMenus(menu);
  } else if (state.confirmDeleteId && menu.closest(`[data-id="${state.confirmDeleteId}"]`)) {
    state.confirmDeleteId = null;
    render();
  }
}, true);

document.addEventListener('click', (e) => {
  if (!e.target.closest('details.menu') || e.target.closest('.menu-panel a')) closeMenus();
});

// Raccourcis (rappelés par les <kbd> des champs) : « / » pour rechercher,
// « A » pour ajouter une URL, Échap pour sortir.
document.addEventListener('keydown', (e) => {
  if ($('app').hidden || $('detail').open) return;
  if (e.key === 'Escape') {
    const open = document.querySelector('details.menu[open]');
    if (open) {
      closeMenus();
      open.querySelector('summary').focus();
    } else if (document.activeElement?.matches('#search, #add-url')) {
      document.activeElement.blur();
    }
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest('input, textarea, select, [contenteditable]')) return;
  if (e.key === '/') {
    e.preventDefault();
    $('search').focus();
  } else if (e.key === 'a' || e.key === 'A') {
    e.preventDefault();
    $('add-url').focus();
  }
});

function showLogin() {
  state.started = false;
  state.pages = [];
  if (state.channel) db.removeChannel(state.channel);
  state.channel = null;
  $('app').hidden = true;
  $('login').hidden = false;
  if (shared) {
    $('login-hint').textContent = 'Connecte-toi : la page partagée sera ajoutée juste après.';
  }
}

async function start(session) {
  if (state.started) return;
  state.started = true;
  const email = session.user.email ?? '';
  $('account-email').textContent = email;
  $('account-initial').textContent = email.charAt(0);
  $('login').hidden = true;
  $('app').hidden = false;

  const { data, error } = await db.from('pages').select('*').order('created_at', { ascending: false });
  if (error) {
    toast(`Chargement impossible : ${error.message}`, 'error');
  } else {
    state.pages = data;
  }
  applyRoute();
  subscribe();

  const pending = readPendingAdd(sessionStorage) ?? shared;
  if (pending && !(await addUrl(pending))) {
    $('add-url').value = pending; // un appui sur Ajouter suffit pour réessayer
  }
}

function subscribe() {
  state.channel = db
    .channel('pages')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pages' }, ({ eventType, new: row, old }) => {
      if (eventType === 'DELETE') {
        removePage(old.id);
        if (detail.openId === old.id) detail.close();
      } else {
        upsertPage(row);
        detail.update(row);
      }
      render();
    })
    .subscribe();
}

async function addUrl(raw) {
  const url = raw.trim();
  if (!isHttpUrl(url)) {
    toast("Cette adresse n'est pas une URL web (http ou https).", 'error');
    return false;
  }
  const { data, error } = await db.rpc('add_page', { p_url: url });
  if (error) {
    toast(`Ajout impossible : ${error.message}`, 'error');
    return false;
  }
  // L'URL partagée n'est oubliée qu'une fois enregistrée, quel que soit le chemin de l'essai
  if (readPendingAdd(sessionStorage) === url) clearPendingAdd(sessionStorage);
  if (shared === url) shared = null;
  const [{ id, is_duplicate: isDuplicate }] = data;
  const { data: row } = await db.from('pages').select('*').eq('id', id).single();
  if (row) upsertPage(row);
  highlight(id);
  if (isDuplicate) toast('Déjà dans la collection');
  else toast('Site ajouté', 'success');
  return true;
}

function upsertPage(row) {
  const i = state.pages.findIndex((p) => p.id === row.id);
  if (i === -1) state.pages.unshift(row);
  else state.pages[i] = row;
  state.pages.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function removePage(id) {
  state.pages = state.pages.filter((p) => p.id !== id);
}

function highlight(id) {
  state.highlightId = id;
  render();
  document.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => {
    if (state.highlightId === id) {
      state.highlightId = null;
      render();
    }
  }, 4000);
}

async function onGridClick(e) {
  // Un clic sur la carte ouvre la fiche (ou la pile), sauf sur ses liens et son menu
  const card = e.target.closest('.card');
  if (!card) return;
  const target = e.target.closest('[data-action]');
  if (!target) {
    if (!e.target.closest('a, details, button')) {
      if (card.dataset.domain) setRoute({ site: card.dataset.domain });
      else setRoute({ site: state.site, page: card.dataset.id });
    }
    return;
  }
  const action = target.dataset.action;
  if (action === 'open-stack') {
    setRoute({ site: card.dataset.domain });
    return;
  }
  const id = card.dataset.id;

  if (action === 'open') {
    setRoute({ site: state.site, page: id });
  } else if (action === 'retry') {
    target.closest('details').open = false;
    if (await retryPage(id)) toast('Capture relancée');
  } else if (action === 'ask-delete') {
    state.confirmDeleteId = id;
    render();
    document.querySelector(`[data-id="${id}"] details`)?.setAttribute('open', '');
  } else if (action === 'cancel-delete') {
    state.confirmDeleteId = null;
    render();
  } else if (action === 'delete') {
    await deletePage(id);
  }
}

/** @returns {Promise<boolean>} vrai si la capture est relancée */
async function retryPage(id) {
  const { error } = await db.from('pages').update({ status: 'pending', job: 'capture', error: null }).eq('id', id);
  if (error) toast(`Relance impossible : ${error.message}`, 'error');
  return !error;
}

/** Recalcule l'analyse sans remplacer la vignette. @returns {Promise<boolean>} */
async function reanalyzePage(id) {
  const { error } = await db.from('pages').update({ status: 'pending', job: 'analysis', error: null }).eq('id', id);
  if (error) toast(`Relance impossible : ${error.message}`, 'error');
  return !error;
}

/** @returns {Promise<boolean>} vrai si la page est supprimée */
async function deletePage(id) {
  const page = state.pages.find((p) => p.id === id);
  if (page?.thumbnail_path) {
    await db.storage.from('thumbnails').remove([page.thumbnail_path]);
  }
  const { error } = await db.from('pages').delete().eq('id', id);
  state.confirmDeleteId = null;
  closeMenus();
  if (error) {
    render();
    toast(`Suppression impossible : ${error.message}`, 'error');
    return false;
  }
  removePage(id);
  render();
  toast('Site supprimé');
  return true;
}

async function refreshThumbnails() {
  if (await thumbnails.refresh(state.pages)) {
    render();
    const open = state.pages.find((p) => p.id === detail.openId);
    if (open) detail.update(open);
  }
}

// Une page restée ouverte (icône sur l'écran d'accueil) renouvelle ses vignettes au retour
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.started) refreshThumbnails();
});

function render() {
  const sitePages = state.site ? state.pages.filter((p) => domainOf(p.url) === state.site) : state.pages;
  if (state.site && sitePages.length === 0) {
    setRoute({}); // dernière page du site supprimée
    return;
  }
  const visible = applyFacets(filterPages(sitePages, state.query), state.filters);
  const total = sitePages.length;
  const isFiltered = Boolean(state.query.trim()) || Object.values(state.filters).some(Boolean);
  const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
  const sites = new Set(sitePages.map((p) => domainOf(p.url))).size;
  $('count').textContent = !total ? ''
    : isFiltered ? `${visible.length} sur ${plural(total, 'page')}`
    : state.site ? `${plural(total, 'page')}, les plus récentes d'abord`
    : `${plural(total, 'page')} de ${plural(sites, 'site')}`;
  $('count-badge').textContent = total ? visible.length : '';
  $('count-badge').hidden = !total;
  $('collection-title').textContent = state.site ?? 'Collection';
  $('back-all').hidden = !state.site;
  $('empty').hidden = state.pages.length > 0;
  $('no-match').hidden = !(total > 0 && visible.length === 0);
  for (const button of document.querySelectorAll('[data-density]')) {
    button.setAttribute('aria-pressed', String(button.dataset.density === state.density));
  }
  $('grid').classList.toggle('is-compact', state.density === 'compact');

  const activity = activityLabel(state.pages);
  $('activity').hidden = !activity;
  $('activity-title').textContent = activity?.title ?? '';
  $('activity-detail').textContent = activity?.detail ?? '';

  renderFacets(sitePages);

  // Recherche, filtre ou site ouvert : résultats à plat ; sinon, une pile par site
  const items = isFiltered || state.site
    ? visible.map((page) => ({ kind: 'page', page }))
    : groupBySite(visible);
  const open = new Set([...document.querySelectorAll('#grid details[open]')].map((d) => d.closest('[data-id]').dataset.id));
  $('grid').innerHTML = items
    .map((item) => (item.kind === 'stack' ? stackHtml(item) : cardHtml(item.page, open.has(item.page.id))))
    .join('');
  refreshThumbnails();
}

const EMPTY_FACET = {
  tech: "Rien de relevé par l'analyse pour l'instant.",
  color: "Rien de relevé par l'analyse pour l'instant.",
  tag: 'Aucun tag pour l’instant : ajoute-en depuis une fiche.',
};

function renderFacets(pages) {
  const openKey = document.querySelector('#facets details[open]')?.dataset.facet;
  $('facets').innerHTML = FACETS.map(({ key, label }) => {
    const value = state.filters[key];
    const options = facetOptions(pages, key);
    const items = options.length
      ? options.map((o) => `<button type="button" class="facet-option" data-facet-value="${esc(o.value)}" aria-pressed="${o.value === value}">
          ${key === 'color' ? `<span class="facet-swatch" style="background:${FAMILY_SWATCH[o.value]}"></span>` : ''}
          <span class="facet-value">${esc(o.value)}</span><span class="facet-count">${o.count}</span>
        </button>`).join('')
      : `<p class="facet-empty">${esc(EMPTY_FACET[key] ?? 'Aucune page renseignée : complète-les depuis leur fiche.')}</p>`;
    const colors = key === 'color' && !value
      ? `<span class="facet-bars" aria-hidden="true">${['bleu', 'orange', 'vert'].map((f) => `<span style="background:${FAMILY_SWATCH[f]}"></span>`).join('')}</span>`
      : '';
    return `<div class="facet${value ? ' is-active' : ''}">
      <details class="menu facet-menu" data-facet="${key}"${openKey === key ? ' open' : ''}>
        <summary class="facet-btn">${esc(label)}${value ? ` : <b>${esc(value)}</b>` : ''}${colors}${icon('chevron-down', 14)}</summary>
        <div class="menu-panel facet-panel">${items}</div>
      </details>
      ${value ? `<button type="button" class="facet-clear" data-facet-clear="${key}" aria-label="Retirer le filtre ${esc(label)}">${icon('x', 14)}</button>` : ''}
    </div>`;
  }).join('');
}

function onFacetClick(e) {
  const clear = e.target.closest('[data-facet-clear]');
  const option = e.target.closest('[data-facet-value]');
  if (clear) {
    delete state.filters[clear.dataset.facetClear];
  } else if (option) {
    const key = option.closest('[data-facet]').dataset.facet;
    const value = option.dataset.facetValue;
    state.filters[key] = state.filters[key] === value ? undefined : value;
    option.closest('details').open = false;
  } else {
    return;
  }
  render();
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const hostOf = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const nameOf = (p) => p.display_name || p.site_name || hostOf(p.url);

// Icône relevée par l'analyse, sinon /favicon.ico ; l'initiale reste dessous si l'image manque
function siteIconHtml(p) {
  let src = p.analysis?.meta?.favicon;
  if (!src) {
    try { src = `${new URL(p.url).origin}/favicon.ico`; } catch { src = null; }
  }
  const image = src ? `<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '';
  return `<span class="site-icon" aria-hidden="true">${esc(nameOf(p).charAt(0).toUpperCase())}${image}</span>`;
}

function shotHtml(p, { action, label }) {
  const thumb = thumbnails.urlFor(p);
  const host = hostOf(p.url);
  const status = statusLabel(p);
  const chip = status ? `<span class="chip chip-${p.status}">${status}</span>` : '';
  const image = thumb
    ? `<img src="${esc(thumb)}" alt="" loading="lazy">`
    : `<span class="shot-placeholder">${esc(host)}</span>`;
  return `<div class="shot-wrap">
      <button type="button" class="shot" data-action="${action}" aria-label="${esc(label)}">${image}${chip}</button>
      <a class="open-site" href="${esc(p.url)}" target="_blank" rel="noopener" aria-label="Ouvrir ${esc(host)} dans un nouvel onglet" title="Ouvrir le site">${icon('arrow-up-right', 18)}</a>
    </div>`;
}

function captionHtml(p, { name, type, url, menu = '' }) {
  return `<div class="caption">
      <div class="caption-row">
        ${siteIconHtml(p)}
        <h2 class="site-name" title="${esc(p.page_title || name)}">${esc(name)}</h2>
        ${type ? `<sup class="type">${esc(type)}</sup>` : ''}
        <span class="added">${dateFormat.format(new Date(p.created_at))}</span>
        ${menu}
      </div>
      <p class="site-url">${esc(url)}</p>
      ${p.status === 'failed' && p.error ? `<p class="error-msg">${esc(p.error)}</p>` : ''}
    </div>`;
}

function stackHtml({ domain, pages }) {
  const latest = pages[0];
  return `<li class="card stack" data-domain="${esc(domain)}">
    ${shotHtml(latest, { action: 'open-stack', label: `Voir les ${pages.length} pages de ${domain}` })}
    <span class="stack-count" aria-hidden="true">${pages.length} pages</span>
    ${captionHtml(latest, { name: nameOf(latest), type: latest.site_type, url: domain })}
  </li>`;
}

function cardHtml(p, isMenuOpen) {
  const name = nameOf(p);
  const actions = state.confirmDeleteId === p.id
    ? `<div class="confirm">
         <p>Supprimer définitivement ?</p>
         <div><button type="button" class="danger-solid" data-action="delete">Oui</button>
         <button type="button" data-action="cancel-delete">Annuler</button></div>
       </div>`
    : `<button type="button" data-action="open">Voir la fiche</button>
       <a href="${esc(p.url)}" target="_blank" rel="noopener">Ouvrir le site</a>
       <button type="button" data-action="retry">Refaire la capture</button>
       <button type="button" class="danger" data-action="ask-delete">Supprimer</button>`;
  const menu = `<details class="menu card-menu"${isMenuOpen || state.confirmDeleteId === p.id ? ' open' : ''}>
      <summary aria-label="Actions pour ${esc(name)}">${icon('more-horizontal', 18)}</summary>
      <div class="menu-panel">${actions}</div>
    </details>`;

  return `<li class="card${state.highlightId === p.id ? ' is-highlighted' : ''}" data-id="${esc(p.id)}">
    ${shotHtml(p, { action: 'open', label: `Voir la fiche de ${name}` })}
    ${captionHtml(p, { name, type: p.page_type || p.site_type, url: p.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''), menu })}
  </li>`;
}

function closeMenus(except) {
  for (const menu of document.querySelectorAll('details.menu[open]')) {
    if (menu !== except) menu.open = false;
  }
}

let toastTimer;
/**
 * Le toast est un popover : il passe au-dessus de la fiche ouverte, sous son en-tête.
 * @param {'info' | 'success' | 'error'} kind
 */
function toast(message, kind = 'info') {
  const el = $('toast');
  const anchor = $('detail').open ? $('detail').querySelector('.detail-head') : document.querySelector('.bar');
  const box = anchor.getBoundingClientRect();
  el.style.top = `${box.bottom + 12}px`;
  el.style.left = `${box.left + box.width / 2}px`;
  el.classList.toggle('is-success', kind === 'success');
  el.classList.toggle('is-error', kind === 'error');
  // Remontré à chaque fois pour rester au-dessus d'une fenêtre ouverte entre-temps
  if (el.matches(':popover-open')) el.hidePopover();
  el.showPopover();
  el.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.hidePopover(), kind === 'error' ? 6000 : 3000);
}
