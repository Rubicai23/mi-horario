/**
 * move-ui.js — Mover o copiar una actividad a otro día, desde el editor.
 */
import { WEEK_RANGE } from './config.js';
import { findOverlaps } from './state-manager.js';
import { t } from './i18n.js';
import * as ui from './ui-components.js';
import {
  addDays, formatLongDate, isDateKey, mondayOf, parseDateKey, plural, startOfDay, toDateKey, toHHMM, weekDates
} from './utils.js';

const { $ } = ui;

export function setupMove(ctx) {
  const { state, toast } = ctx;
  const move = { key: '', id: '', mode: 'move', date: '', copyTargets: new Set() };

  const showError = message => { $('moveErr').textContent = message || ''; $('moveErr').hidden = !message; };
  const dayName = key => formatLongDate(parseDateKey(key)).toLowerCase();
  const block = () => state.getDay(move.key).find(b => b.id === move.id);

  function limits() {
    const today = startOfDay(ctx.clock());
    return {
      min: toDateKey(mondayOf(addDays(today, -7 * WEEK_RANGE.back))),
      max: toDateKey(addDays(mondayOf(addDays(today, 7 * WEEK_RANGE.forward)), 6))
    };
  }

  function paintQuick() {
    const today = startOfDay(ctx.clock());
    const options = [
      [t('Hoy'), toDateKey(today)],
      [t('Mañana'), toDateKey(addDays(today, 1))],
      [t('Pasado mañana'), toDateKey(addDays(today, 2))],
      [t('Próximo lunes'), toDateKey(addDays(mondayOf(today), 7))]
    ];
    $('moveQuick').innerHTML = options.map(([label, key]) => (
      `<button type="button" class="chip${move.date === key ? ' sel' : ''}" data-d="${key}" aria-pressed="${move.date === key}"${key === move.key ? ' disabled' : ''}><span>${label}</span></button>`
    )).join('');
  }

  function paintWarn() {
    const target = block();
    let warn = '';
    if (target && move.mode === 'move' && isDateKey(move.date) && move.date !== move.key) {
      const clash = findOverlaps(state.getDay(move.date), target);
      if (clash.length) {
        const named = clash.slice(0, 2).map(b => `«${b.t}» (${toHHMM(b.s)}–${toHHMM(b.e)})`).join(t(' y '));
        warn = t('Ese día ya hay {0} a esas horas. Se solaparán; luego puedes cambiar la hora.', named);
      }
    }
    $('moveWarn').textContent = warn;
    $('moveWarn').hidden = !warn;
  }

  function paintMode() {
    const copy = move.mode === 'copy';
    $('moveTabMove').setAttribute('aria-selected', String(!copy));
    $('moveTabCopy').setAttribute('aria-selected', String(copy));
    $('movePanelMove').hidden = copy;
    $('movePanelCopy').hidden = !copy;
    $('moveGo').textContent = copy ? t('Copiar') : t('Mover');
    $('smvTitle').textContent = copy ? t('Copiar actividad') : t('Mover actividad');
    showError('');
    paintWarn();
  }

  function open(key, id) {
    const target = state.getDay(key).find(b => b.id === id);
    if (!target) return;
    const today = startOfDay(ctx.clock());
    const todayKey = toDateKey(today);
    const first = key >= todayKey ? toDateKey(addDays(parseDateKey(key), 1)) : todayKey;
    Object.assign(move, { key, id, mode: 'move', date: first, copyTargets: new Set() });
    const { min, max } = limits();
    $('moveDate').min = min;
    $('moveDate').max = max;
    $('moveDate').value = move.date;
    $('moveWhat').textContent = `«${target.t}» · ${toHHMM(target.s)}–${toHHMM(target.e)} · ${dayName(key)}`;
    const anchor = addDays(parseDateKey(key), 0);
    const weeks = [0, 7, 14].map((offset, i) => {
      const dates = weekDates(addDays(anchor, offset));
      return { label: `${i === 0 ? t('Semana de la actividad') : i === 1 ? t('Semana siguiente') : t('Dentro de dos semanas')}: ${ui.weekRangeLabel(dates)}`, dates };
    });
    $('moveTargets').innerHTML = ui.copyTargetsMarkup({ weeks, sourceKey: key, selected: move.copyTargets, todayKey: toDateKey(today) });
    paintQuick();
    paintMode();
    ctx.moveSheet.open();
  }
  ctx.openMove = open;

  $('moveTabMove').addEventListener('click', () => { move.mode = 'move'; paintMode(); });
  $('moveTabCopy').addEventListener('click', () => { move.mode = 'copy'; paintMode(); });
  $('moveQuick').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip || chip.disabled) return;
    move.date = chip.dataset.d;
    $('moveDate').value = move.date;
    showError('');
    paintQuick();
    paintWarn();
  });
  $('moveDate').addEventListener('input', () => {
    move.date = $('moveDate').value;
    showError('');
    paintQuick();
    paintWarn();
  });
  $('moveTargets').addEventListener('click', e => {
    const button = e.target.closest('.cday');
    if (!button || button.disabled) return;
    const on = !move.copyTargets.has(button.dataset.key);
    if (on) move.copyTargets.add(button.dataset.key); else move.copyTargets.delete(button.dataset.key);
    button.classList.toggle('sel', on);
    button.setAttribute('aria-pressed', String(on));
    showError('');
  });
  $('moveCancel').addEventListener('click', ctx.moveSheet.close);

  $('moveGo').addEventListener('click', () => {
    if (!block()) { showError(t('La actividad ya no existe.')); return; }
    if (move.mode === 'move') {
      const { min, max } = limits();
      if (!isDateKey(move.date)) { showError(t('Elige una fecha.')); return; }
      if (move.date < min || move.date > max) { showError(t('Esa fecha queda fuera del calendario.')); return; }
      const result = state.moveBlock(move.key, move.id, move.date);
      if (!result.ok) { showError(t(result.error)); return; }
      ctx.cloud.track('activity_moved');
      ctx.moveSheet.close();
      const clash = result.overlaps ? t(' Se solapa con {0}.', plural(result.overlaps, 'actividad', 'actividades')) : '';
      toast.show(t('Movida a {0}.', dayName(move.date)) + clash, { label: 'Deshacer', duration: 7000, onAction: result.undo });
      return;
    }
    const targets = Array.from(move.copyTargets);
    if (!targets.length) { showError(t('Elige al menos un día.')); return; }
    const undos = [];
    let failed = '';
    targets.forEach(key => {
      const result = state.moveBlock(move.key, move.id, key, { copy: true });
      if (result.ok) undos.push(result.undo); else failed = result.error;
    });
    if (!undos.length) { showError(t(failed || 'No se pudo copiar.')); return; }
    ctx.cloud.track('activity_copied', { days: undos.length });
    ctx.moveSheet.close();
    toast.show(t('Copiada a {0}.', plural(undos.length, 'día', 'días')), {
      label: 'Deshacer', duration: 7000, onAction: () => undos.slice().reverse().forEach(undo => undo())
    });
  });
}
