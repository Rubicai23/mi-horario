/**
 * inbox-ui.js — Actividades sin hora: lista de tareas por hacer que luego se pueden colocar en un día y una hora.
 */
import { INBOX_MINUTES } from './config.js';
import { t } from './i18n.js';
import * as ui from './ui-components.js';
import { addDays, formatDuration, startOfDay, toDateKey } from './utils.js';

const { $ } = ui;

export function setupInbox(ctx) {
  const { state, toast } = ctx;
  const edit = { id: '', cat: '', day: '' };

  const showError = message => { $('inboxErr').textContent = message ? t(message) : ''; $('inboxErr').hidden = !message; };

  function paintButton() {
    const count = state.listInbox().length;
    $('inboxBtn').textContent = count ? t('Sin hora · {0}', count) : t('Sin hora');
  }
  ctx.paintInbox = paintButton;

  function paintQuick() {
    const today = startOfDay(ctx.clock());
    const options = [[t('Hoy'), toDateKey(today)], [t('Mañana'), toDateKey(addDays(today, 1))]];
    $('inboxQuick').innerHTML = options.map(([label, key]) => (
      `<button type="button" class="chip${edit.day === key ? ' sel' : ''}" data-d="${key}" aria-pressed="${edit.day === key}"><span>${label}</span></button>`
    )).join('');
  }

  function paintCats() {
    $('ibC').innerHTML = ui.categoryChipsMarkup();
    Array.from($('ibC').children).forEach(el => {
      const on = el.dataset.c === edit.cat;
      el.classList.toggle('sel', on);
      el.setAttribute('aria-pressed', String(on));
    });
  }

  function paint() {
    $('inboxList').innerHTML = ui.inboxMarkup(state.listInbox());
    paintButton();
  }

  function closeEdit() { edit.id = ''; $('inboxEdit').hidden = true; }

  function openEdit(id) {
    const item = state.listInbox().find(x => x.id === id);
    if (!item) return;
    edit.id = id;
    edit.cat = item.c || '';
    edit.day = ctx.selectedKey();
    $('ibT').value = item.t;
    $('ibN').value = item.n || '';
    $('ibM').innerHTML = `<option value="0">${t('Sin duración')}</option>` + INBOX_MINUTES.map(m => `<option value="${m}">${formatDuration(m)}</option>`).join('');
    $('ibM').value = String(item.m || 0);
    if ($('ibM').value !== String(item.m || 0)) {
      $('ibM').insertAdjacentHTML('beforeend', `<option value="${item.m}">${formatDuration(item.m)}</option>`);
      $('ibM').value = String(item.m);
    }
    $('inboxDay').value = edit.day;
    paintCats();
    paintQuick();
    $('inboxEdit').hidden = false;
    $('inboxEdit').scrollIntoView({ block: 'nearest' });
  }

  ctx.openInbox = () => {
    showError('');
    closeEdit();
    $('inboxNew').value = '';
    paint();
    ctx.inboxSheet.open();
  };

  function add() {
    const result = state.addInbox({ t: $('inboxNew').value });
    if (!result.ok) { showError(result.error); return; }
    showError('');
    $('inboxNew').value = '';
    ctx.cloud.track('inbox_added');
    paint();
  }

  $('inboxBtn').addEventListener('click', () => ctx.openInbox());
  $('inboxAdd').addEventListener('click', add);
  $('inboxNew').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  $('closeInbox').addEventListener('click', ctx.inboxSheet.close);

  $('inboxList').addEventListener('click', e => {
    const li = e.target.closest('.ib-item');
    if (!li) return;
    if (e.target.closest('.ck')) {
      const result = state.removeInbox(li.dataset.id);
      if (!result.ok) return;
      closeEdit();
      paint();
      ctx.cloud.track('inbox_done');
      toast.show(t('Tarea hecha.'), {
        label: 'Deshacer', duration: 6000,
        onAction: () => { state.restoreInbox(result.removed, result.index); paint(); }
      });
      return;
    }
    openEdit(li.dataset.id);
  });

  $('ibC').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    edit.cat = edit.cat === chip.dataset.c ? '' : chip.dataset.c;
    paintCats();
  });
  $('inboxQuick').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    edit.day = chip.dataset.d;
    $('inboxDay').value = edit.day;
    paintQuick();
  });
  $('inboxDay').addEventListener('input', () => { edit.day = $('inboxDay').value; paintQuick(); });

  const patch = () => ({ t: $('ibT').value, c: edit.cat, m: Number($('ibM').value) || 0, n: $('ibN').value.trim() });

  $('ibSave').addEventListener('click', () => {
    const result = state.updateInbox(edit.id, patch());
    if (!result.ok) { showError(result.error); return; }
    showError('');
    closeEdit();
    paint();
  });
  $('ibCancel').addEventListener('click', () => { closeEdit(); showError(''); });
  $('ibDel').addEventListener('click', () => {
    const result = state.removeInbox(edit.id);
    if (!result.ok) return;
    closeEdit();
    paint();
    toast.show(t('Tarea eliminada.'), {
      label: 'Deshacer', duration: 6000,
      onAction: () => { state.restoreInbox(result.removed, result.index); paint(); }
    });
  });

  $('ibSet').addEventListener('click', () => {
    const saved = state.updateInbox(edit.id, patch());
    if (!saved.ok) { showError(saved.error); return; }
    if (!edit.day || !ctx.dateInRange(edit.day)) { showError('Esa fecha queda fuera del calendario.'); return; }
    const item = saved.item;
    const slot = state.suggestSlot(edit.day, item.m || undefined);
    ctx.inboxSheet.close();
    ctx.goToDay(edit.day);
    ctx.openEditor(null, { t: item.t, c: item.c, n: item.n, slot, inboxId: item.id });
    closeEdit();
  });
}
