// Fiche d'une page : capture, infos éditables, analyse de design, DESIGN.md.
// Panneau <dialog> modal ; l'adresse (#page=<id>) est gérée par app.js.
import { orderedAnalysis, renderDesignMd } from './lib/design-md.js';
import { domainOf } from './lib/stacks.js';
import { PAGE_TYPES, SITE_TYPES, STYLES } from './lib/taxonomy.js';

const STATUS_LABELS = { pending: 'en attente', processing: 'capture en cours', ready: 'prête', failed: 'échec' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * @param {{ db: object, thumbnails: object, getPage: (id: string) => object | undefined,
 *   retry: (id: string) => Promise<void>, remove: (id: string) => Promise<boolean>, onClose: () => void }} deps
 */
export function createDetail({ db, thumbnails, getPage, retry, remove, onClose }) {
  const dialog = document.getElementById('detail');
  for (const [id, values] of [['site-types', SITE_TYPES], ['page-types', PAGE_TYPES]]) {
    document.getElementById(id).innerHTML = values.map((v) => `<option value="${esc(v)}"></option>`).join('');
  }
  let currentId = null;
  let isConfirmingDelete = false;
  let statusTimer;

  dialog.addEventListener('close', () => {
    currentId = null;
    onClose();
  });
  // Clic sur le voile autour du panneau
  dialog.addEventListener('mousedown', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('click', onClick);
  dialog.addEventListener('submit', onSubmit);
  dialog.addEventListener('input', () => renderDesignPreview());
  dialog.addEventListener('keydown', onStyleKeydown);

  return {
    open(id) {
      const page = getPage(id);
      if (!page) return false;
      currentId = id;
      isConfirmingDelete = false;
      dialog.innerHTML = shellHtml(page);
      renderView(page);
      if (!dialog.open) dialog.showModal();
      dialog.querySelector('.detail-body').scrollTop = 0;
      return true;
    },
    close() {
      if (dialog.open) dialog.close();
    },
    /** Une capture terminée ou une modification ailleurs : rafraîchit la fiche sans toucher au formulaire. */
    update(page) {
      if (page.id === currentId) renderView(page);
    },
    get openId() {
      return currentId;
    },
  };

  function renderView(page) {
    const name = page.display_name || page.site_name || domainOf(page.url);
    dialog.querySelector('#detail-title').textContent = name;
    const thumb = thumbnails.urlFor(page);
    const chip = page.status === 'ready' ? '' : `<span class="chip chip-${page.status}">${STATUS_LABELS[page.status]}</span>`;
    dialog.querySelector('#detail-shot').innerHTML = (thumb
      ? `<img src="${esc(thumb)}" alt="Haut de la page ${esc(name)}">`
      : `<span class="shot-placeholder">${esc(domainOf(page.url))}</span>`) + chip;
    dialog.querySelector('#detail-analysis').innerHTML = analysisHtml(page);
    dialog.querySelector('#detail-actions').innerHTML = actionsHtml();
    renderDesignPreview();
  }

  function renderDesignPreview() {
    const page = getPage(currentId);
    if (!page) return;
    dialog.querySelector('#detail-md').textContent = renderDesignMd({ ...page, ...formValues() });
  }

  function formValues() {
    const form = dialog.querySelector('#detail-form');
    return {
      display_name: form.elements.display_name.value.trim() || null,
      site_type: form.elements.site_type.value.trim() || null,
      page_type: form.elements.page_type.value.trim() || null,
      styles: [...form.querySelectorAll('.style-chip[aria-pressed="true"]')].map((b) => b.dataset.style),
      notes: form.elements.notes.value.trim() || null,
    };
  }

  async function onSubmit(e) {
    if (e.target.id !== 'detail-form') return;
    e.preventDefault();
    const button = e.submitter;
    button.disabled = true;
    const values = formValues();
    const { error } = await db.from('pages').update(values).eq('id', currentId);
    button.disabled = false;
    if (error) {
      status(`Enregistrement impossible : ${error.message}`, true);
      return;
    }
    const page = getPage(currentId);
    if (page) Object.assign(page, values);
    status('Fiche enregistrée');
  }

  async function onClick(e) {
    const chip = e.target.closest('.style-chip');
    if (chip) {
      chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true'));
      renderDesignPreview();
      return;
    }
    const action = e.target.closest('[data-detail]')?.dataset.detail;
    if (!action) return;
    const page = getPage(currentId);
    if (action === 'close') {
      dialog.close();
    } else if (action === 'copy') {
      try {
        await navigator.clipboard.writeText(dialog.querySelector('#detail-md').textContent);
        status('DESIGN.md copié');
      } catch {
        status('Copie impossible : sélectionne le texte à la main.', true);
      }
    } else if (action === 'download') {
      const blob = new Blob([dialog.querySelector('#detail-md').textContent], { type: 'text/markdown' });
      const link = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(blob),
        download: `${slug(page)}.DESIGN.md`,
      });
      link.click();
      URL.revokeObjectURL(link.href);
    } else if (action === 'retry') {
      await retry(currentId);
      status('Capture relancée');
    } else if (action === 'ask-delete' || action === 'cancel-delete') {
      isConfirmingDelete = action === 'ask-delete';
      dialog.querySelector('#detail-actions').innerHTML = actionsHtml();
    } else if (action === 'delete') {
      if (await remove(currentId)) dialog.close();
    }
  }

  // « Autre style » + Entrée : ajoute une puce cochée
  function onStyleKeydown(e) {
    if (e.target.id !== 'detail-style-new' || e.key !== 'Enter') return;
    e.preventDefault();
    const value = e.target.value.trim();
    if (!value) return;
    const existing = [...dialog.querySelectorAll('.style-chip')].find((b) => b.dataset.style.toLowerCase() === value.toLowerCase());
    if (existing) {
      existing.setAttribute('aria-pressed', 'true');
    } else {
      e.target.insertAdjacentHTML('beforebegin', styleChipHtml(value, true));
    }
    e.target.value = '';
    renderDesignPreview();
  }

  function status(message, isError = false) {
    const el = dialog.querySelector('#detail-status');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('is-error', isError);
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { el.textContent = ''; }, isError ? 6000 : 3000);
  }

  function actionsHtml() {
    return isConfirmingDelete
      ? `<span class="confirm-text">Supprimer définitivement cette page ?</span>
         <button type="button" class="danger-solid" data-detail="delete">Oui, supprimer</button>
         <button type="button" class="btn-quiet" data-detail="cancel-delete">Annuler</button>`
      : `<button type="button" class="btn-secondary" data-detail="retry">Refaire la capture</button>
         <button type="button" class="btn-quiet danger" data-detail="ask-delete">Supprimer</button>`;
  }
}

function shellHtml(page) {
  const selected = new Set(page.styles ?? []);
  const styles = [...STYLES, ...[...selected].filter((s) => !STYLES.includes(s))];
  return `<div class="detail-inner">
    <header class="detail-head">
      <div class="detail-heading">
        <h2 id="detail-title"></h2>
        <a class="detail-url" href="${esc(page.url)}" target="_blank" rel="noopener">${esc(page.url.replace(/^https?:\/\//, ''))}<span aria-hidden="true"> ↗</span></a>
      </div>
      <button type="button" class="icon-btn" data-detail="close" aria-label="Fermer la fiche">✕</button>
    </header>
    <div class="detail-body">
      <figure class="detail-shot" id="detail-shot"></figure>

      <form id="detail-form" class="detail-form">
        <label for="detail-name">Nom affiché</label>
        <input id="detail-name" name="display_name" maxlength="200" value="${esc(page.display_name)}" placeholder="${esc(page.site_name || domainOf(page.url))}">
        <div class="field-pair">
          <div>
            <label for="detail-site-type">Type de site</label>
            <input id="detail-site-type" name="site_type" list="site-types" maxlength="60" value="${esc(page.site_type)}" autocomplete="off">
          </div>
          <div>
            <label for="detail-page-type">Type de page</label>
            <input id="detail-page-type" name="page_type" list="page-types" maxlength="60" value="${esc(page.page_type)}" autocomplete="off">
          </div>
        </div>
        <fieldset class="styles-field">
          <legend>Styles</legend>
          ${styles.map((s) => styleChipHtml(s, selected.has(s))).join('')}
          <input id="detail-style-new" class="style-new" placeholder="Autre style + Entrée" maxlength="40" autocomplete="off">
        </fieldset>
        <label for="detail-notes">Notes</label>
        <textarea id="detail-notes" name="notes" rows="3" maxlength="10000" placeholder="Ce qui t'inspire dans cette page">${esc(page.notes)}</textarea>
        <div class="form-actions">
          <button type="submit" class="btn-primary">Enregistrer</button>
          <span id="detail-status" class="detail-status" role="status"></span>
        </div>
      </form>

      <section id="detail-analysis" class="detail-analysis" aria-label="Analyse de design"></section>

      <section class="detail-designmd" aria-labelledby="detail-md-title">
        <div class="section-head">
          <h3 id="detail-md-title">DESIGN.md</h3>
          <div class="section-tools">
            <button type="button" class="btn-secondary" data-detail="copy">Copier</button>
            <button type="button" class="btn-secondary" data-detail="download">Télécharger</button>
          </div>
        </div>
        <pre id="detail-md" class="design-md" tabindex="0"></pre>
      </section>

      <div id="detail-actions" class="detail-actions"></div>
    </div>
  </div>`;
}

function styleChipHtml(style, isPressed) {
  return `<button type="button" class="style-chip" data-style="${esc(style)}" aria-pressed="${isPressed}">${esc(style)}</button>`;
}

function analysisHtml(page) {
  const a = orderedAnalysis(page.analysis);
  const warnings = page.capture_warnings?.length
    ? `<p class="detail-note">Capture : ${page.capture_warnings.map(esc).join(' ; ')}</p>`
    : '';
  if (!a) {
    return `<h3>Analyse de design</h3>
      <p class="detail-note">${page.status === 'ready'
        ? "Cette page a été capturée avant l'analyse de design : refais la capture pour la calculer."
        : "L'analyse sera disponible à la fin de la capture."}</p>${warnings}`;
  }
  const colors = Object.entries(a.colors).map(([role, hex]) => `<li>
      <span class="swatch" style="background:${esc(hex)}"></span>
      <span class="swatch-role">${esc(role)}</span><code>${esc(hex)}</code></li>`).join('');
  const type = Object.entries(a.typography).map(([role, t]) => `<li>
      <span class="type-role">${esc(role)}</span>
      <span>${esc(t.fontFamily)}, ${esc(t.fontSize)}, ${esc(t.fontWeight)}</span></li>`).join('');
  const facts = [
    ['Thème', `${a.layout.theme}${a.layout.heroMedia ? ', haut de page sur image ou vidéo' : ''}`],
    ['Polices', a.fonts.join(', ')],
    ['Technologies', a.tech.join(', ')],
    ['Arrondis', Object.values(a.rounded).join(', ')],
    ['Espacements', Object.values(a.spacing).join(', ')],
    ['Largeur de contenu', a.layout.contentWidth && `${a.layout.contentWidth}px`],
  ].filter(([, v]) => v);
  const outline = a.headings.slice(0, 12).map((h) => `<li class="h${h.level}">${esc(h.text)}</li>`).join('');
  return `<h3>Analyse de design</h3>
    <div class="analysis-grid">
      <div><h4>Couleurs</h4><ul class="swatches">${colors}</ul></div>
      <div><h4>Typographie</h4><ul class="type-list">${type}</ul></div>
    </div>
    <dl class="facts">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    ${outline ? `<h4>Plan de la page</h4><ul class="outline">${outline}</ul>` : ''}
    ${warnings}`;
}

function slug(page) {
  const name = page.display_name || page.site_name || domainOf(page.url);
  const path = new URL(page.url).pathname.replace(/\/$/, '');
  return `${name}${path}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
