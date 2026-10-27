import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config.js';
import { isHttpUrl, readAddParam, stripAddParam } from './lib/add-param.js';
import { clearPendingAdd, readPendingAdd, savePendingAdd } from './lib/pending-add.js';
import { createThumbnails } from './lib/thumbnails.js';
import { filterPages } from './lib/filter-pages.js';

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
};

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

// Raccourcis : « / » pour rechercher, « A » pour ajouter une URL, Échap pour sortir.
const hasKeyboard = matchMedia('(hover: hover) and (pointer: fine)').matches;
if (hasKeyboard) {
  $('search').placeholder = 'Rechercher un site, une URL   /';
  $('add-url').placeholder = 'Coller une URL   A';
}

document.addEventListener('keydown', (e) => {
  if ($('app').hidden) return;
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
  render();
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
      if (eventType === 'DELETE') removePage(old.id);
      else upsertPage(row);
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
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const id = target.closest('[data-id]').dataset.id;
  const action = target.dataset.action;

  if (action === 'retry') {
    target.closest('details').open = false;
    const { error } = await db.from('pages').update({ status: 'pending', error: null }).eq('id', id);
    if (error) toast(`Relance impossible : ${error.message}`, 'error');
    else toast('Capture relancée');
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
    return;
  }
  removePage(id);
  render();
  toast('Site supprimé');
}

async function refreshThumbnails() {
  if (await thumbnails.refresh(state.pages)) render();
}

// Une page restée ouverte (icône sur l'écran d'accueil) renouvelle ses vignettes au retour
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.started) refreshThumbnails();
});

function render() {
  const visible = filterPages(state.pages, state.query);
  const total = state.pages.length;
  $('count').textContent = total
    ? (visible.length === total ? `${total} page${total > 1 ? 's' : ''}` : `${visible.length} sur ${total} pages`)
    : '';
  $('empty').hidden = total > 0;
  $('no-match').hidden = !(total > 0 && visible.length === 0);

  const open = new Set([...document.querySelectorAll('#grid details[open]')].map((d) => d.closest('[data-id]').dataset.id));
  $('grid').innerHTML = visible.map((p) => cardHtml(p, open.has(p.id))).join('');
  refreshThumbnails();
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const hostOf = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function cardHtml(p, isMenuOpen) {
  const thumb = thumbnails.urlFor(p);
  const host = hostOf(p.url);
  const name = p.site_name || host;
  const chip = p.status === 'ready' ? '' : `<span class="chip chip-${p.status}">${STATUS_LABELS[p.status]}</span>`;
  const image = thumb
    ? `<img src="${esc(thumb)}" alt="Haut de la page ${esc(p.page_title || host)}" loading="lazy">`
    : `<span class="shot-placeholder">${esc(host)}</span>`;
  const menu = state.confirmDeleteId === p.id
    ? `<div class="confirm">
         <p>Supprimer définitivement ?</p>
         <div><button type="button" class="danger-solid" data-action="delete">Oui</button>
         <button type="button" data-action="cancel-delete">Annuler</button></div>
       </div>`
    : `<a href="${esc(p.url)}" target="_blank" rel="noopener">Ouvrir le site</a>
       <button type="button" data-action="retry">Refaire la capture</button>
       <button type="button" class="danger" data-action="ask-delete">Supprimer</button>`;

  return `<li class="card${state.highlightId === p.id ? ' is-highlighted' : ''}" data-id="${esc(p.id)}">
    <a class="shot" href="${esc(p.url)}" target="_blank" rel="noopener" tabindex="-1">${image}${chip}</a>
    <div class="caption">
      <h2 class="site-name" title="${esc(p.page_title || name)}">${esc(name)}</h2>
      <details class="menu"${isMenuOpen || state.confirmDeleteId === p.id ? ' open' : ''}>
        <summary aria-label="Actions pour ${esc(name)}">⋯</summary>
        <div class="menu-panel">${menu}</div>
      </details>
      <a class="site-url" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.url.replace(/^https?:\/\//, ''))}</a>
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
