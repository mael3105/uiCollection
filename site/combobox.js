// Champs à suggestions de la fiche : type de site, type de page (une valeur, saisie libre)
// et tags (plusieurs valeurs, nouveau tag ajouté depuis la liste). Liste maison plutôt qu'un
// <datalist> : celui-ci s'affiche décalé dans le panneau.
// Écoute par délégation sur la fiche, dont le contenu est régénéré à chaque ouverture.
import { icon } from './lib/icons.js';
import { suggest } from './lib/suggest.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fold = (s) => (s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/**
 * À appeler avant d'installer les autres écouteurs de la fiche : Échap et Entrée dans une liste ouverte
 * ne doivent ni fermer la fiche ni envoyer le formulaire.
 * @param {HTMLElement} root
 * @param {{ optionsFor: (key: string) => string[], onChange: () => void }} deps
 */
export function createCombos(root, { optionsFor, onChange }) {
  root.addEventListener('focusin', (e) => { if (inputOf(e.target)) open(e.target); });
  root.addEventListener('input', (e) => { if (inputOf(e.target)) open(e.target); });
  root.addEventListener('focusout', (e) => {
    const combo = inputOf(e.target);
    if (combo && !combo.contains(e.relatedTarget)) close(combo);
  });
  // Garder le focus dans le champ pendant le clic sur une suggestion
  root.addEventListener('mousedown', (e) => { if (e.target.closest('.combo-option')) e.preventDefault(); });
  root.addEventListener('click', (e) => {
    const option = e.target.closest('.combo-option');
    if (option) {
      pick(option.closest('[data-combo]'), option.dataset.value);
      return;
    }
    const remove = e.target.closest('[data-tag-remove]');
    if (remove) {
      const combo = remove.closest('[data-combo]');
      remove.closest('.tag-chip').remove();
      combo.querySelector('input').focus();
      onChange();
    }
  });
  root.addEventListener('keydown', onKeydown);

  function onKeydown(e) {
    const combo = inputOf(e.target);
    if (!combo) return;
    const input = e.target;
    const list = combo.querySelector('.combo-list');
    const active = list.querySelector('.combo-option.is-active');
    const isMulti = combo.dataset.combo === 'tags';

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.hidden) open(input);
      const items = [...list.querySelectorAll('.combo-option')];
      if (!items.length) return;
      const i = items.indexOf(list.querySelector('.combo-option.is-active'));
      const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1);
      setActive(input, items[next]);
    } else if (e.key === 'Enter') {
      if (active) {
        e.preventDefault();
        pick(combo, active.dataset.value);
      } else if (isMulti) {
        e.preventDefault();
        if (input.value.trim()) pick(combo, input.value.trim());
      }
    } else if (e.key === 'Escape' && !list.hidden) {
      e.preventDefault();
      e.stopImmediatePropagation();
      close(combo);
    } else if (e.key === 'Backspace' && isMulti && !input.value) {
      const last = [...combo.querySelectorAll('.tag-chip')].pop();
      if (last) {
        last.remove();
        open(input);
        onChange();
      }
    } else if (e.key === 'Tab') {
      close(combo);
    }
  }

  function open(input) {
    const combo = inputOf(input);
    const key = combo.dataset.combo;
    const list = combo.querySelector('.combo-list');
    const query = input.value;
    const chosen = key === 'tags' ? selectedTags(combo) : [];
    const typed = query.trim();
    const all = optionsFor(key);
    // Type déjà choisi : toute la liste pour en changer ; sinon les valeurs proches de la saisie
    const showAll = key !== 'tags' && all.some((o) => fold(o) === fold(typed));
    const ordered = suggest(all, showAll ? '' : query, { exclude: chosen, limit: key === 'tags' ? 8 : 40 });
    const isNewTag = key === 'tags' && typed
      && !optionsFor(key).some((o) => fold(o) === fold(typed))
      && !chosen.some((t) => fold(t) === fold(typed));
    const items = ordered.map((v) => ({ value: v, label: esc(v), isCurrent: key !== 'tags' && fold(v) === fold(typed) }));
    if (isNewTag) items.push({ value: typed, label: `Ajouter le tag « ${esc(typed)} »`, isNew: true });
    list.innerHTML = items.map((item, i) => `<li id="${list.id}-${i}" class="combo-option${item.isNew ? ' is-new' : ''}" role="option"
        data-value="${esc(item.value)}" aria-selected="${item.isCurrent}">${item.isNew ? icon('plus', 14) : ''}<span>${item.label}</span>${item.isCurrent ? icon('check', 14) : ''}</li>`).join('');
    list.hidden = !items.length;
    input.setAttribute('aria-expanded', String(!list.hidden));
    input.removeAttribute('aria-activedescendant');
    // Saisie de tag : la première suggestion est prête pour Entrée
    if (key === 'tags' && typed) setActive(input, list.querySelector('.combo-option'));
    else list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }

  function close(combo) {
    const list = combo.querySelector('.combo-list');
    list.hidden = true;
    combo.querySelector('input').setAttribute('aria-expanded', 'false');
  }

  function setActive(input, option) {
    const list = inputOf(input).querySelector('.combo-list');
    list.querySelector('.is-active')?.classList.remove('is-active');
    if (!option) return;
    option.classList.add('is-active');
    option.scrollIntoView({ block: 'nearest' });
    input.setAttribute('aria-activedescendant', option.id);
  }

  function pick(combo, value) {
    const input = combo.querySelector('input');
    if (combo.dataset.combo === 'tags') {
      if (!selectedTags(combo).some((t) => fold(t) === fold(value))) {
        combo.querySelector('.tag-list').insertAdjacentHTML('beforeend', tagChipHtml(value));
      }
      input.value = '';
      input.focus();
      open(input);
    } else {
      input.value = value;
      close(combo);
    }
    onChange();
  }
}

export function tagChipHtml(tag) {
  return `<span class="tag-chip" data-tag="${esc(tag)}">${esc(tag)}<button type="button" data-tag-remove aria-label="Retirer le tag ${esc(tag)}">${icon('x', 12)}</button></span>`;
}

export function selectedTags(root) {
  return [...root.querySelectorAll('.tag-chip')].map((chip) => chip.dataset.tag);
}

function inputOf(el) {
  return el?.matches?.('[data-combo] input') ? el.closest('[data-combo]') : null;
}
