/**
 * carry-ui.js — Pasar las actividades pendientes a otro día: aviso en la pantalla principal y opción del menú del día.
 */
import { t } from './i18n.js';
import * as ui from './ui-components.js';
import { addDays, formatLongDate, minutesOfDay, parseDateKey, plural, toDateKey } from './utils.js';

const { $ } = ui;

export function setupCarry(ctx) {
  const { state, toast, view } = ctx;
  const todayKey = () => toDateKey(ctx.clock());

  /** A qué día se pasan las pendientes de `key`: el siguiente (hoy o futuro) o hoy (días pasados). */
  const targetOf = key => (key < todayKey() ? todayKey() : toDateKey(addDays(parseDateKey(key), 1)));

  const targetName = key => {
    const today = parseDateKey(todayKey());
    if (key === todayKey()) return t('hoy');
    if (key === toDateKey(addDays(today, 1))) return t('mañana');
    return formatLongDate(parseDateKey(key)).toLowerCase();
  };

  /** Actividades sin hacer del día mostrado que el aviso ofrece pasar. */
  function pendingFor(key, blocks, nowMin) {
    if (key === todayKey()) return blocks.filter(b => !b.d && nowMin >= b.e);
    if (key < todayKey()) return blocks.filter(b => !b.d);
    return [];
  }

  /** Repinta el aviso (lo llama el render con el día que se está viendo). */
  ctx.paintCarry = ({ key, blocks, nowMin }) => {
    const pending = pendingFor(key, blocks, nowMin);
    const hide = !pending.length || view.carryHidden.has(key) || view.sorting;
    $('carry').hidden = hide;
    if (hide) return;
    $('carry').innerHTML = ui.carryMarkup({ count: pending.length, past: key < todayKey(), target: targetName(targetOf(key)) });
  };

  function run(key, { onlyOver = null } = {}) {
    const toKey = targetOf(key);
    const result = state.carryOver(key, toKey, { onlyOver });
    if (!result.ok) { toast.show(t(result.error)); return; }
    ctx.cloud.track('carry_over', { count: result.moved, copy: result.copy });
    const name = targetName(toKey);
    let text = result.copy
      ? t('Copiadas a {0}: {1}.', name, plural(result.moved, 'actividad', 'actividades'))
      : t('Pasadas a {0}: {1}.', name, plural(result.moved, 'actividad', 'actividades'));
    if (result.shifted) text += t(' {0} cambiaron de hora para no solaparse.', result.shifted);
    if (result.overlapped) text += t(' {0} se solapan.', result.overlapped);
    if (result.left) text += t(' {0} no cupieron.', result.left);
    toast.show(text, { label: 'Deshacer', duration: 8000, onAction: result.undo });
  }

  $('carry').addEventListener('click', e => {
    const key = ctx.selectedKey();
    if (e.target.closest('#carryGo')) {
      run(key, { onlyOver: key === todayKey() ? Math.floor(minutesOfDay(ctx.clock())) : null });
    } else if (e.target.closest('#carryHide')) {
      view.carryHidden.add(key);
      $('carry').hidden = true;
    }
  });

  /** Opción del menú del día: todas las pendientes del día elegido. */
  ctx.refreshCarryButton = () => {
    const key = ctx.selectedKey();
    const pending = state.getDay(key).filter(b => !b.d);
    const past = key < todayKey();
    $('menuCarryT').textContent = past ? t('Traer pendientes a hoy') : t('Pasar pendientes a {0}', targetName(targetOf(key)));
    $('menuCarryS').textContent = !pending.length
      ? t('Este día no tiene actividades pendientes.')
      : past ? t('Se copian a hoy; el día original se queda como estaba.') : t('Lo que no has hecho se reprograma al día siguiente.');
    $('menuCarry').disabled = !pending.length;
  };
  $('menuCarry').addEventListener('click', () => {
    ctx.daySheet.close();
    run(ctx.selectedKey());
  });
}
