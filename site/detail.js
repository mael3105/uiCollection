// Fiche d'une page : capture, infos éditables, analyse de design, DESIGN.md.
// Panneau <dialog> modal ; l'adresse (#page=<id>) est gérée par app.js.
import { orderedAnalysis, renderDesignMd } from './lib/design-md.js';
import { hasUnsavedChanges, statusLabel } from './lib/page-state.js';
import { domainOf } from './lib/stacks.js';
import { icon } from './lib/icons.js';
import { PAGE_TYPES, SITE_TYPES, STYLES } from './lib/taxonomy.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * @param {{ db: object, thumbnails: object, getPage: (id: string) => object | undefined,
 *   retry: (id: string) => Promise<boolean>, reanalyze: (id: string) => Promise<boolean>,
 *   remove: (id: string) => Promise<boolean>, toast: (message: string, kind?: string) => void,
 *   onClose: () => void }} deps
 */
export function createDetail({ db, thumbnails, getPage, retry, reanalyze, remove, toast, onClose }) {
  const dialog = document.getElementById('detail');
  const discard = document.getElementById('discard');
  for (const [id, values] of [['site-types', SITE_TYPES], ['page-types', PAGE_TYPES]]) {
    document.getElementById(id).innerHTML = values.map((v) => `<option value="${esc(v)}"></option>`).join('');
  }
  let currentId = null;
  let isConfirmingDelete = false;
  let isDirty = false;

  dialog.addEventListener('close', () => {
    currentId = null;
    isDirty = false;
    onClose();
  });
  // Clic sur le voile autour du panneau
  dialog.addEventListener('mousedown', (e) => { if (e.target === dialog) requestClose(); });
  // Échap passe par la même confirmation que ✕ (sauf dans le champ « Ajouter un style »)
  dialog.addEventListener('keydown', onKeydown);
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    requestClose();
  });
  dialog.addEventListener('click', onClick);
  dialog.addEventListener('submit', onSubmit);
  dialog.addEventListener('input', onFormChange);
  dialog.addEventListener('focusout', onStyleEditorBlur);
  window.addEventListener('beforeunload', (e) => { if (isDirty) e.preventDefault(); });

  return {
    open(id) {
      const page = getPage(id);
      if (!page) return false;
      currentId = id;
      isConfirmingDelete = false;
      dialog.innerHTML = shellHtml(page);
      renderView(page);
      onFormChange();
      if (!dialog.open) dialog.showModal();
      dialog.querySelector('.detail-body').scrollTop = 0;
      return true;
    },
    /** Ferme sans rien demander (page supprimée). */
    close() {
      if (dialog.open) dialog.close();
    },
    /** Ferme, après confirmation si des modifications ne sont pas enregistrées. Vrai si la fiche est fermée. */
    requestClose,
    /** Une capture terminée ou une modification ailleurs : rafraîchit la fiche sans toucher au formulaire. */
    update(page) {
      if (page.id !== currentId) return;
      renderView(page);
      onFormChange();
    },
    get openId() {
      return currentId;
    },
  };

  async function requestClose() {
    if (!dialog.open) return true;
    if (!isDirty) {
      dialog.close();
      return true;
    }
    const choice = await askDiscard();
    if (choice === 'save' && !(await save())) return false;
    if (choice !== 'save' && choice !== 'discard') return false;
    dialog.close();
    return true;
  }

  function askDiscard() {
    return new Promise((resolve) => {
      discard.returnValue = '';
      discard.addEventListener('close', () => resolve(discard.returnValue), { once: true });
      discard.showModal();
    });
  }

  function renderView(page) {
    const name = page.display_name || page.site_name || domainOf(page.url);
    const type = page.page_type || page.site_type;
    dialog.querySelector('#detail-title').innerHTML = esc(name) + (type ? ` <sup>${esc(type)}</sup>` : '');
    const thumb = thumbnails.urlFor(page);
    const label = statusLabel(page);
    const chip = label ? `<span class="chip chip-${page.status}">${label}</span>` : '';
    dialog.querySelector('#detail-shot').innerHTML = (thumb
      ? `<img src="${esc(thumb)}" alt="Haut de la page ${esc(name)}">`
      : `<span class="shot-placeholder">${esc(domainOf(page.url))}</span>`) + chip;
    dialog.querySelector('#detail-tools').innerHTML = toolsHtml(page);
    dialog.querySelector('#detail-analysis').innerHTML = analysisHtml(page);
    dialog.querySelector('#detail-actions').innerHTML = actionsHtml();
  }

  function onFormChange() {
    const page = getPage(currentId);
    if (!page) return;
    const values = formValues();
    isDirty = hasUnsavedChanges(page, values);
    dialog.querySelector('#detail-foot').hidden = !isDirty;
    dialog.querySelector('#detail-md').textContent = renderDesignMd({ ...page, ...values });
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
    await save();
  }

  /** @returns {Promise<boolean>} vrai si la fiche est enregistrée */
  async function save() {
    const button = dialog.querySelector('#detail-save');
    button.disabled = true;
    const values = formValues();
    const { error } = await db.from('pages').update(values).eq('id', currentId);
    button.disabled = false;
    if (error) {
      toast(`Enregistrement impossible : ${error.message}`, 'error');
      return false;
    }
    const page = getPage(currentId);
    if (page) Object.assign(page, values);
    onFormChange();
    toast('Fiche enregistrée', 'success');
    return true;
  }

  async function onClick(e) {
    const chip = e.target.closest('.style-chip');
    if (chip) {
      chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true'));
      onFormChange();
      return;
    }
    const action = e.target.closest('[data-detail]')?.dataset.detail;
    if (!action) return;
    const page = getPage(currentId);
    if (action === 'close') {
      requestClose();
    } else if (action === 'reset') {
      const body = dialog.querySelector('.detail-body');
      const scroll = body.scrollTop;
      dialog.innerHTML = shellHtml(page);
      renderView(page);
      onFormChange();
      dialog.querySelector('.detail-body').scrollTop = scroll;
    } else if (action === 'style-open') {
      toggleStyleEditor(true);
    } else if (action === 'style-add') {
      addStyle();
    } else if (action === 'copy') {
      try {
        await navigator.clipboard.writeText(dialog.querySelector('#detail-md').textContent);
        toast('DESIGN.md copié', 'success');
      } catch {
        toast('Copie impossible : sélectionne le texte à la main.', 'error');
      }
    } else if (action === 'copy-url') {
      try {
        await navigator.clipboard.writeText(page.url);
        toast('URL copiée', 'success');
      } catch {
        toast("Copie impossible : sélectionne l'adresse à la main.", 'error');
      }
    } else if (action === 'download') {
      const filename = `${slug(page)}.DESIGN.md`;
      const blob = new Blob([dialog.querySelector('#detail-md').textContent], { type: 'text/markdown' });
      const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
      link.click();
      URL.revokeObjectURL(link.href);
      toast(`${filename} téléchargé`, 'success');
    } else if (action === 'retry') {
      if (await retry(currentId)) toast('Capture relancée');
    } else if (action === 'reanalyze') {
      if (await reanalyze(currentId)) toast('Analyse relancée');
    } else if (action === 'ask-delete' || action === 'cancel-delete') {
      isConfirmingDelete = action === 'ask-delete';
      dialog.querySelector('#detail-actions').innerHTML = actionsHtml();
    } else if (action === 'delete') {
      if (await remove(currentId)) dialog.close();
    }
  }

  function onKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (e.target.id === 'detail-style-new') toggleStyleEditor(false);
      else requestClose();
    } else if (e.key === 'Enter' && e.target.id === 'detail-style-new') {
      e.preventDefault();
      addStyle();
    }
  }

  function toggleStyleEditor(isOpen) {
    const editor = dialog.querySelector('#detail-style-editor');
    const opener = dialog.querySelector('[data-detail="style-open"]');
    const input = editor.querySelector('input');
    input.value = '';
    // Montrer et focaliser avant de masquer l'autre : masquer l'élément focalisé déclencherait onStyleEditorBlur
    const [shown, hidden] = isOpen ? [editor, opener] : [opener, editor];
    shown.hidden = false;
    (isOpen ? input : opener).focus();
    hidden.hidden = true;
  }

  // Le champ se replie quand on le quitte vide
  function onStyleEditorBlur(e) {
    const editor = dialog.querySelector('#detail-style-editor');
    if (!editor || editor.hidden || editor.contains(e.relatedTarget)) return;
    if (!editor.querySelector('input').value.trim()) {
      editor.hidden = true;
      dialog.querySelector('[data-detail="style-open"]').hidden = false;
    }
  }

  // Ajoute une puce cochée ; le champ reste ouvert pour en saisir une autre
  function addStyle() {
    const input = dialog.querySelector('#detail-style-new');
    const value = input.value.trim();
    input.focus();
    if (!value) return;
    const existing = [...dialog.querySelectorAll('.style-chip')].find((b) => b.dataset.style.toLowerCase() === value.toLowerCase());
    if (existing) {
      existing.setAttribute('aria-pressed', 'true');
    } else {
      dialog.querySelector('[data-detail="style-open"]').insertAdjacentHTML('beforebegin', styleChipHtml(value, true));
    }
    input.value = '';
    onFormChange();
  }

  function actionsHtml() {
    return isConfirmingDelete
      ? `<span class="confirm-text">Supprimer définitivement cette page ?</span>
         <button type="button" class="danger-solid" data-detail="delete">Oui, supprimer</button>
         <button type="button" class="btn-quiet" data-detail="cancel-delete">Annuler</button>`
      : '<button type="button" class="btn-quiet danger" data-detail="ask-delete">Supprimer la page</button>';
  }
}

function shellHtml(page) {
  const selected = new Set(page.styles ?? []);
  const styles = [...STYLES, ...[...selected].filter((s) => !STYLES.includes(s))];
  return `<div class="detail-inner">
    <header class="detail-head">
      <div class="detail-heading">
        <h2 id="detail-title"></h2>
        <div class="detail-link">
          <a class="detail-url" href="${esc(page.url)}" target="_blank" rel="noopener">${esc(page.url.replace(/^https?:\/\//, ''))}</a>
          <button type="button" class="icon-btn" data-detail="copy-url" aria-label="Copier l'URL" title="Copier l'URL">${icon('copy', 14)}</button>
        </div>
      </div>
      <div id="detail-tools" class="detail-tools"></div>
      <button type="button" class="icon-btn detail-close" data-detail="close" aria-label="Fermer la fiche">${icon('x', 18)}</button>
    </header>
    <div class="detail-body">
      <figure class="detail-shot" id="detail-shot"></figure>

      <form id="detail-form" class="detail-form">
        <div class="form-field">
          <label for="detail-name">Nom affiché</label>
          <input id="detail-name" name="display_name" maxlength="200" value="${esc(page.display_name)}" placeholder="${esc(page.site_name || domainOf(page.url))}">
        </div>
        <div class="field-pair">
          <div class="form-field">
            <label for="detail-site-type">Type de site</label>
            <input id="detail-site-type" name="site_type" list="site-types" maxlength="60" value="${esc(page.site_type)}" autocomplete="off">
          </div>
          <div class="form-field">
            <label for="detail-page-type">Type de page</label>
            <input id="detail-page-type" name="page_type" list="page-types" maxlength="60" value="${esc(page.page_type)}" autocomplete="off">
          </div>
        </div>
        <fieldset class="styles-field">
          <legend>Styles</legend>
          ${styles.map((s) => styleChipHtml(s, selected.has(s))).join('')}
          <button type="button" class="style-open" data-detail="style-open">+ Ajouter un style</button>
          <span id="detail-style-editor" class="style-editor" hidden>
            <label class="visually-hidden" for="detail-style-new">Nouveau style</label>
            <input id="detail-style-new" class="style-new" placeholder="Nom du style" maxlength="40" autocomplete="off">
            <button type="button" class="style-confirm" data-detail="style-add">Ajouter</button>
          </span>
        </fieldset>
        <div class="form-field is-wide">
          <label for="detail-notes">Notes</label>
          <textarea id="detail-notes" name="notes" rows="3" maxlength="10000" placeholder="Ce qui t'inspire dans cette page">${esc(page.notes)}</textarea>
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
    <footer id="detail-foot" class="detail-foot" hidden>
      <span class="dot" aria-hidden="true"></span>
      <p>Modifications non enregistrées</p>
      <button type="button" class="btn-secondary" data-detail="reset">Annuler</button>
      <button type="submit" id="detail-save" class="btn-primary" form="detail-form">Enregistrer</button>
    </footer>
  </div>`;
}

// Refaire la capture remplace la vignette ; relancer l'analyse la garde
function toolsHtml(page) {
  const isBusy = page.status === 'pending' || page.status === 'processing';
  const disabled = isBusy ? ' disabled' : '';
  const reanalyze = page.thumbnail_path
    ? `<button type="button" class="btn-secondary" data-detail="reanalyze"${disabled}>Relancer l'analyse</button>`
    : '';
  return `${reanalyze}<button type="button" class="btn-secondary" data-detail="retry"${disabled}>Refaire la capture</button>`;
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
    const note = {
      ready: "Pas encore d'analyse pour cette page : « Relancer l'analyse », en haut, la calcule sans changer la capture.",
      failed: "La capture a échoué : « Refaire la capture », en haut, relance la capture et l'analyse.",
    }[page.status] ?? "L'analyse sera disponible à la fin de la capture.";
    return `<h3>Analyse de design</h3><p class="detail-note">${esc(note)}</p>${warnings}`;
  }
  const colors = Object.entries(a.colors).map(([role, hex]) => `<li>
      <span class="swatch" style="background:${esc(hex)}"></span>
      <span class="swatch-role">${esc(role)}</span><code>${esc(hex)}</code></li>`).join('');
  const type = [
    ['Polices', a.fonts.join(', '), true],
    ...Object.entries(a.typography).map(([role, t]) => [role, `${t.fontFamily}, ${t.fontSize}, ${t.fontWeight}`]),
  ];
  const facts = [
    ['Technologies', a.tech.join(', ')],
    ['Arrondis', Object.values(a.rounded).join(', ')],
    ['Espacements', Object.values(a.spacing).join(', ')],
    ['Contenu', a.layout.contentWidth && `${a.layout.contentWidth}px de large`],
    ['Haut de page', a.layout.heroMedia && 'sur image ou vidéo'],
  ];
  const outline = a.headings.slice(0, 12).map((h) => `<li class="h${h.level}">${esc(h.text)}</li>`).join('');
  return `<h3>Analyse de design <span class="badge">${esc(a.layout.theme)}</span></h3>
    <ul class="swatches">${colors}</ul>
    <div class="analysis-grid">
      ${factsHtml(type)}
      ${factsHtml(facts)}
    </div>
    ${outline ? `<div><h4>Plan de la page</h4><ul class="outline">${outline}</ul></div>` : ''}
    ${warnings}`;
}

function factsHtml(rows) {
  const items = rows.filter(([, v]) => v)
    .map(([k, v, isStrong]) => `<dt>${esc(k)}</dt><dd${isStrong ? ' class="is-strong"' : ''}>${esc(v)}</dd>`).join('');
  return items ? `<dl class="facts">${items}</dl>` : '<div></div>';
}

function slug(page) {
  const name = page.display_name || page.site_name || domainOf(page.url);
  const path = new URL(page.url).pathname.replace(/\/$/, '');
  return `${name}${path}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
