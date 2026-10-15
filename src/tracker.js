/**
 * tracker.js — Cronómetro de tiempo real por actividad (sin DOM).
 *
 * Solo hay un cronómetro a la vez. Se guarda { key, id, startedAt } en el dispositivo, así que sigue contando
 * aunque se cierre la app. Al parar, los segundos se suman a la actividad (campo `w`).
 * El tiempo no cuenta más allá de la medianoche del día en que empezó: si te olvidas de parar, no se dispara.
 */
import { DATE_KEY_RE, parseDateKey } from './utils.js';

/** Cronómetro guardado válido o null. */
export function sanitizeTracker(raw) {
  let data = raw;
  if (typeof raw === 'string') { try { data = JSON.parse(raw); } catch (_) { return null; } }
  if (!data || typeof data !== 'object') return null;
  if (!DATE_KEY_RE.test(String(data.key)) || !parseDateKey(data.key)) return null;
  if (typeof data.id !== 'string' || !/^[\w-]{1,40}$/.test(data.id)) return null;
  if (!Number.isFinite(data.startedAt) || data.startedAt <= 0) return null;
  return { key: data.key, id: data.id, startedAt: Math.round(data.startedAt) };
}

/** Segundos transcurridos, sin pasar de la medianoche del día de inicio. */
export function elapsedSeconds(tracker, nowMs) {
  if (!tracker) return 0;
  const start = new Date(tracker.startedAt);
  const midnight = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1).getTime();
  const end = Math.min(nowMs, midnight);
  return Math.max(0, Math.floor((end - tracker.startedAt) / 1000));
}

/** ¿Ha pasado ya la medianoche del día de inicio? (el cronómetro se ha quedado olvidado) */
export function isCapped(tracker, nowMs) {
  if (!tracker) return false;
  const start = new Date(tracker.startedAt);
  return nowMs >= new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1).getTime();
}

/** Reloj de cronómetro: "05:09" o "1:05:09". */
export function formatStopwatch(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = n => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(sec)}` : `${two(m)}:${two(sec)}`;
}

/** Tiempo medido en texto corto: "45 min", "1 h 05 min", "menos de 1 min". */
export function formatTracked(totalSeconds) {
  const minutes = Math.round(totalSeconds / 60);
  if (totalSeconds > 0 && minutes < 1) return '< 1 min';
  const h = Math.floor(minutes / 60);
  const r = minutes % 60;
  if (h && r) return `${h} h ${String(r).padStart(2, '0')} min`;
  return h ? `${h} h` : `${r} min`;
}

/**
 * @param {object} deps
 * @param {() => (string|null)} deps.load
 * @param {(text: (string|null)) => void} deps.save
 * @param {(key: string) => Array} deps.getDay
 * @param {(key: string, id: string, seconds: number) => object} deps.addTracked
 */
export function createTracker({ load, save, getDay, addTracked }) {
  let current = sanitizeTracker(load());
  const persist = () => { try { save(current ? JSON.stringify(current) : null); } catch (_) { /* sin almacenamiento */ } };
  const exists = tracker => Boolean(tracker && getDay(tracker.key).some(b => b.id === tracker.id));
  if (current && !exists(current)) { current = null; persist(); }

  return {
    current: () => current,
    isRunning: (key, id) => Boolean(current && current.key === key && current.id === id),
    elapsed: nowMs => elapsedSeconds(current, nowMs),

    /** Empieza a medir una actividad. Si había otra midiéndose, se para y se guarda. */
    start(key, id, nowMs) {
      if (!getDay(key).some(b => b.id === id)) return { ok: false };
      if (current && current.key === key && current.id === id) return { ok: true, stopped: null };
      const stopped = current ? this.stop(nowMs) : null;
      current = { key, id, startedAt: nowMs };
      persist();
      return { ok: true, stopped };
    },

    /** Para el cronómetro y suma el tiempo a la actividad. */
    stop(nowMs) {
      if (!current) return { ok: false };
      const tracker = current;
      const seconds = elapsedSeconds(tracker, nowMs);
      const capped = isCapped(tracker, nowMs);
      current = null;
      persist();
      const block = getDay(tracker.key).find(b => b.id === tracker.id);
      if (!block) return { ok: false, gone: true };
      if (seconds < 1) return { ok: true, seconds: 0, key: tracker.key, id: tracker.id, title: block.t, capped };
      const result = addTracked(tracker.key, tracker.id, seconds);
      return {
        ok: result.ok, seconds, key: tracker.key, id: tracker.id, title: block.t, capped,
        undo: result.undo
      };
    },

    /** Descarta el cronómetro sin guardar nada (la actividad se eliminó, por ejemplo). */
    discard() { current = null; persist(); },
    /** Si la actividad medida ya no existe, se descarta. */
    check() { if (current && !exists(current)) { current = null; persist(); return true; } return false; }
  };
}
