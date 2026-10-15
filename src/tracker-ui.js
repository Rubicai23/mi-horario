/**
 * tracker-ui.js — Cronómetro de tiempo real en cada actividad: botón en la lista, reloj en vivo y chip de la cabecera.
 */
import { t } from './i18n.js';
import { formatStopwatch, formatTracked, isCapped } from './tracker.js';
import * as ui from './ui-components.js';
import { shortTitle } from './utils.js';

const { $ } = ui;
const vibrate = ms => { if (navigator.vibrate) navigator.vibrate(ms); };

export function setupTracker(ctx) {
  const { tracker, toast, state } = ctx;
  const now = () => ctx.clock().getTime();

  /** Mensaje al guardar el tiempo de una sesión. */
  function announceStop(stop) {
    if (!stop || !stop.ok || stop.gone) return;
    if (!stop.seconds) { toast.show(t('El cronómetro duró menos de un segundo; no se guardó nada.')); return; }
    const text = stop.capped
      ? t('El cronómetro se quedó en marcha: se guardó hasta la medianoche ({0}). Puedes corregirlo al editar la actividad.', formatTracked(stop.seconds))
      : t('Guardado: {0} en «{1}».', formatTracked(stop.seconds), shortTitle(stop.title));
    toast.show(text, { label: 'Deshacer', duration: 7000, onAction: stop.undo });
  }

  /** Para el cronómetro si está en marcha sobre esa actividad (la usa "marcar como hecha"). */
  ctx.stopTrackerFor = (key, id) => {
    if (!tracker.isRunning(key, id)) return null;
    return tracker.stop(now());
  };

  function toggle(key, id) {
    vibrate(15);
    if (tracker.isRunning(key, id)) {
      const stop = tracker.stop(now());
      ctx.cloud.track('tracker_stop');
      announceStop(stop);
    } else {
      const result = tracker.start(key, id, now());
      if (!result.ok) return;
      ctx.cloud.track('tracker_start');
      if (result.stopped && result.stopped.seconds) announceStop(result.stopped);
    }
    ctx.render();
    paintPill();
  }
  ctx.toggleTracker = toggle;

  function paintPill() {
    const pill = $('trackPill');
    const current = tracker.current();
    pill.hidden = !current;
    if (!current) return;
    const block = state.getDay(current.key).find(b => b.id === current.id);
    const clock = formatStopwatch(tracker.elapsed(now()));
    pill.textContent = `${block ? shortTitle(block.t).slice(0, 12) : ''} ${clock}`.trim();
    pill.setAttribute('aria-label', t('Cronómetro en marcha: {0}, {1}. Ir a la actividad', block ? block.t : '', clock));
  }

  $('trackPill').addEventListener('click', () => {
    const current = tracker.current();
    if (current) ctx.goToDay(current.key, current.id);
  });

  /** Cada segundo: reloj en vivo, chip y parada automática si se olvidó el cronómetro hasta pasada la medianoche. */
  ctx.trackerTick = () => {
    const current = tracker.current();
    if (!current) { if (!$('trackPill').hidden) paintPill(); return; }
    if (isCapped(current, now())) {
      announceStop(tracker.stop(now()));
      ctx.requestRender();
      paintPill();
      return;
    }
    const clock = formatStopwatch(tracker.elapsed(now()));
    document.querySelectorAll('#tl [data-live]').forEach(el => { el.textContent = clock; });
    paintPill();
  };

  // Si la actividad medida desaparece (borrada o cambiada desde otro dispositivo), el cronómetro se descarta.
  state.subscribe(() => {
    const gone = tracker.check();
    paintPill();
    if (gone) ctx.requestRender();
  });
  paintPill();
}
