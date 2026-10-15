/**
 * search-ui.js — Hoja del buscador: texto, filtro por categoría y estado, búsquedas recientes y salto al día.
 */
import { t } from './i18n.js';
import * as ui from './ui-components.js';
import { plural, startOfDay } from './utils.js';

const { $ } = ui;
const RECENT_MAX = 6;
const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function setupSearch(ctx) {
  const { state, toast } = ctx;
  const q = { text: '', cat: '', status: 'all' };
  let timer = 0;

  const readRecent = () => {
    try {
      const list = JSON.parse(state.settings.get('recent'));
      return Array.isArray(list) ? list.filter(x => typeof x === 'string' && x.trim()).slice(0, RECENT_MAX) : [];
    } catch (_) { return []; }
  };
  const remember = text => {
    const clean = text.trim().slice(0, 40);
    if (clean.length < 2) return;
    const list = [clean, ...readRecent().filter(x => x.toLowerCase() !== clean.toLowerCase())].slice(0, RECENT_MAX);
    state.settings.set('recent', JSON.stringify(list));
  };

  const recentMarkup = () => {
    const list = readRecent();
    const tip = `<p class="set-s">${t('Busca por título, nota, subtarea o categoría. No importan las mayúsculas ni los acentos.')}</p>`;
    if (!list.length) return tip;
    return `${tip}<p class="sr-h">${t('Búsquedas recientes')}</p><div class="chips">${list.map(text => (
      `<button type="button" class="chip" data-q="${escape(text)}"><span translate="no">${escape(text)}</span></button>`)).join('')}</div>`;
  };

  function paint() {
    const active = Boolean(q.text.trim() || q.cat || q.status !== 'all');
    $('searchClear').hidden = !q.text;
    ['searchAll', 'searchPending', 'searchDone'].forEach(id => {
      const status = { searchAll: 'all', searchPending: 'pending', searchDone: 'done' }[id];
      $(id).setAttribute('aria-selected', String(q.status === status));
    });
    Array.from($('searchCats').children).forEach(chip => {
      const on = chip.dataset.c === q.cat;
      chip.classList.toggle('sel', on);
      chip.setAttribute('aria-pressed', String(on));
    });
    $('searchRecent').innerHTML = active ? '' : recentMarkup();
    if (!active) { $('searchCount').textContent = ''; $('searchResults').innerHTML = ''; return; }
    const found = state.search(q.text, { category: q.cat, status: q.status });
    const total = found.total + found.rules.length;
    $('searchCount').textContent = !total ? t('Sin resultados.')
      : found.truncated ? t('Mostrando {0} de {1}.', found.results.length, found.total)
        : plural(total, 'resultado', 'resultados');
    $('searchResults').innerHTML = ui.searchResultsMarkup({ found, today: startOfDay(ctx.clock()), inRange: key => ctx.dateInRange(key) });
  }

  const reset = () => {
    Object.assign(q, { text: '', cat: '', status: 'all' });
    $('searchInput').value = '';
    $('searchCats').innerHTML = ui.categoryChipsMarkup();
  };

  $('openSearch').addEventListener('click', () => {
    reset();
    paint();
    ctx.searchSheet.open();
    $('searchInput').focus();
    ctx.cloud.track('search_open');
  });
  $('closeSearch').addEventListener('click', ctx.searchSheet.close);

  $('searchInput').addEventListener('input', () => {
    q.text = $('searchInput').value;
    clearTimeout(timer);
    timer = setTimeout(paint, 120);
    $('searchClear').hidden = !q.text;
  });
  $('searchInput').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    clearTimeout(timer);
    q.text = $('searchInput').value;
    remember(q.text);
    paint();
    $('searchInput').blur();      // esconde el teclado para ver todos los resultados
  });
  $('searchClear').addEventListener('click', () => {
    q.text = '';
    $('searchInput').value = '';
    paint();
    $('searchInput').focus();
  });
  $('searchCats').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    q.cat = q.cat === chip.dataset.c ? '' : chip.dataset.c;
    paint();
  });
  [['searchAll', 'all'], ['searchPending', 'pending'], ['searchDone', 'done']].forEach(([id, status]) => {
    $(id).addEventListener('click', () => { q.status = status; paint(); });
  });
  $('searchRecent').addEventListener('click', e => {
    const chip = e.target.closest('[data-q]');
    if (!chip) return;
    q.text = chip.dataset.q;
    $('searchInput').value = q.text;
    paint();
  });
  $('searchResults').addEventListener('click', e => {
    const item = e.target.closest('.sr-item');
    if (!item || item.disabled || item.classList.contains('static')) return;
    remember(q.text);
    ctx.searchSheet.close();
    if (!ctx.goToDay(item.dataset.key, item.dataset.id)) toast.show('Esa fecha queda fuera del calendario.');
    ctx.cloud.track('search_open_result');
  });

  // Un cambio llegado de otro dispositivo (o hecho aquí) mientras la hoja está abierta.
  state.subscribe(() => { if ($('sheetSearch').classList.contains('open')) paint(); });
}
