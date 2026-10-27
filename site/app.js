import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config.js';
import { isHttpUrl, readAddParam, stripAddParam } from './lib/add-param.js';
import { clearPendingAdd, readPendingAdd, savePendingAdd } from './lib/pending-add.js';
import { createThumbnails } from './lib/thumbnails.js';
import { filterPages } from './lib/filter-pages.js';
import { domainOf, groupBySite } from './lib/stacks.js';
import { createDetail } from './detail.js';

const STATUS_LABELS = {
  pending: 'en attente',
  processing: 'capture en cours',
  ready: 'prête',
  failed: 'échec',
};
const SIGNED_URL_TTL = 3600;

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
  retry: retryPage,
  remove: deletePage,
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

function applyRoute() {
  if (!state.started) return;
  const { site, page } = readRoute();
  state.site = site;
  render();
  if (page && detail.openId !== page && !detail.open(page)) setRoute({ site });
  if (!page) detail.close();
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
    await retryPage(id);
    toast('Capture relancée');
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

async function retryPage(id) {
  const { error } = await db.from('pages').update({ status: 'pending', error: null }).eq('id', id);
  if (error) toast(`Relance impossible : ${error.message}`, 'error');
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
  const visible = filterPages(sitePages, state.query);
  const total = sitePages.length;
  const plural = (n) => `${n} page${n > 1 ? 's' : ''}`;
  $('count').textContent = total
    ? (visible.length === total ? plural(total) : `${visible.length} sur ${plural(total)}`)
    : '';
  $('site-bar').hidden = !state.site;
  $('site-title').textContent = state.site ?? '';
  $('empty').hidden = state.pages.length > 0;
  $('no-match').hidden = !(total > 0 && visible.length === 0);

  // Recherche ou site ouvert : résultats à plat ; sinon, une pile par site
  const items = state.query.trim() || state.site
    ? visible.map((page) => ({ kind: 'page', page }))
    : groupBySite(visible);
  const open = new Set([...document.querySelectorAll('#grid details[open]')].map((d) => d.closest('[data-id]').dataset.id));
  $('grid').innerHTML = items
    .map((item) => (item.kind === 'stack' ? stackHtml(item) : cardHtml(item.page, open.has(item.page.id))))
    .join('');
  refreshThumbnails();
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const hostOf = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const nameOf = (p) => p.display_name || p.site_name || hostOf(p.url);

function shotHtml(p, { action, label }) {
  const thumb = thumbnails.urlFor(p);
  const host = hostOf(p.url);
  const chip = p.status === 'ready' ? '' : `<span class="chip chip-${p.status}">${STATUS_LABELS[p.status]}</span>`;
  const image = thumb
    ? `<img src="${esc(thumb)}" alt="" loading="lazy">`
    : `<span class="shot-placeholder">${esc(host)}</span>`;
  return `<div class="shot-wrap">
      <button type="button" class="shot" data-action="${action}" aria-label="${esc(label)}">${image}${chip}</button>
      <a class="open-site" href="${esc(p.url)}" target="_blank" rel="noopener" aria-label="Ouvrir ${esc(host)} dans un nouvel onglet" title="Ouvrir le site">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M6 3h7v7M13 3 6.5 9.5M11 9v4H3V5h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </a>
    </div>`;
}

function stackHtml({ domain, pages }) {
  const latest = pages[0];
  return `<li class="card stack" data-domain="${esc(domain)}">
    ${shotHtml(latest, { action: 'open-stack', label: `Voir les ${pages.length} pages de ${domain}` })}
    <span class="stack-count" aria-hidden="true">${pages.length} pages</span>
    <div class="caption">
      <h2 class="site-name">${esc(nameOf(latest))}</h2>
      <span class="site-url">${esc(domain)}</span>
      <span class="added">${dateFormat.format(new Date(latest.created_at))}</span>
    </div>
  </li>`;
}

function cardHtml(p, isMenuOpen) {
  const host = hostOf(p.url);
  const name = nameOf(p);
  const menu = state.confirmDeleteId === p.id
    ? `<div class="confirm">
         <p>Supprimer définitivement ?</p>
         <div><button type="button" class="danger-solid" data-action="delete">Oui</button>
         <button type="button" data-action="cancel-delete">Annuler</button></div>
       </div>`
    : `<button type="button" data-action="open">Voir la fiche</button>
       <a href="${esc(p.url)}" target="_blank" rel="noopener">Ouvrir le site</a>
       <button type="button" data-action="retry">Refaire la capture</button>
       <button type="button" class="danger" data-action="ask-delete">Supprimer</button>`;

  return `<li class="card${state.highlightId === p.id ? ' is-highlighted' : ''}" data-id="${esc(p.id)}">
    ${shotHtml(p, { action: 'open', label: `Voir la fiche de ${name}` })}
    <div class="caption">
      <h2 class="site-name" title="${esc(p.page_title || name)}">${esc(name)}</h2>
      <details class="menu"${isMenuOpen || state.confirmDeleteId === p.id ? ' open' : ''}>
        <summary aria-label="Actions pour ${esc(name)}">⋯</summary>
        <div class="menu-panel">${menu}</div>
      </details>
      <span class="site-url">${esc(p.url.replace(/^https?:\/\//, ''))}</span>
      <span class="added">${dateFormat.format(new Date(p.created_at))}</span>
      ${p.status === 'failed' && p.error ? `<p class="error-msg">${esc(p.error)}</p>` : ''}
    </div>
  </li>`;
}

function closeMenus(except) {
  for (const menu of document.querySelectorAll('details.menu[open]')) {
    if (menu !== except) menu.open = false;
  }
}

let toastTimer;
/** @param {'info' | 'success' | 'error'} kind */
function toast(message, kind = 'info') {
  const el = $('toast');
  el.textContent = message;
  el.classList.toggle('is-success', kind === 'success');
  el.classList.toggle('is-error', kind === 'error');
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, kind === 'error' ? 6000 : 3000);
}
