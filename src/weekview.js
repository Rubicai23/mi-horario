/**
 * weekview.js — Cálculos de la vista de semana (sin DOM).
 */
import { MAX_MIN } from './config.js';

const clampHour = h => Math.min(24, Math.max(0, h));

/**
 * Tramo horario que se dibuja, común a toda la semana para poder comparar días.
 * Va de la hora entera anterior a la primera actividad a la hora entera posterior a la última,
 * con un mínimo de 10 horas. Sin actividades: de 7 a 22.
 */
export function weekRange(days) {
  const all = days.flat();
  if (!all.length) return { from: 7 * 60, to: 22 * 60 };
  let from = clampHour(Math.floor(Math.min(...all.map(b => b.s)) / 60));
  let to = clampHour(Math.ceil(Math.max(...all.map(b => b.e)) / 60));
  while (to - from < 10) {
    if (from > 0) from -= 1;
    if (to - from < 10 && to < 24) to += 1;
    if (from === 0 && to === 24) break;
  }
  return { from: from * 60, to: Math.min(to * 60, MAX_MIN + 1) };
}

/** Posición y anchura (en %) de una actividad dentro del tramo dibujado. */
export function barGeometry(block, range) {
  const span = range.to - range.from;
  const left = Math.max(0, (block.s - range.from) / span) * 100;
  const right = Math.min(1, (block.e - range.from) / span) * 100;
  return { left, width: Math.max(0.8, right - left) };
}

/** Posición (en %) de un instante dentro del tramo, o null si queda fuera. */
export function nowPosition(nowMin, range) {
  if (nowMin < range.from || nowMin > range.to) return null;
  return ((nowMin - range.from) / (range.to - range.from)) * 100;
}

/** Hueco libre más largo entre actividades de un día: { from, to, length } o null (menos de 2 actividades). */
export function longestGap(blocks) {
  if (blocks.length < 2) return null;
  const sorted = blocks.slice().sort((a, b) => a.s - b.s);
  let reach = sorted[0].e;
  let best = null;
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = sorted[i].s - reach;
    if (gap > 0 && (!best || gap > best.length)) best = { from: reach, to: sorted[i].s, length: gap };
    reach = Math.max(reach, sorted[i].e);
  }
  return best;
}

/** Minutos ocupados de un día (sin contar dos veces lo que se solapa). */
export function busyMinutes(blocks) {
  const sorted = blocks.slice().sort((a, b) => a.s - b.s);
  let total = 0;
  let reach = -1;
  sorted.forEach(b => {
    const start = Math.max(b.s, reach);
    if (b.e > start) total += b.e - start;
    reach = Math.max(reach, b.e);
  });
  return total;
}

/** Marcas de hora para el eje: cada 2, 3 o 4 horas según la anchura del tramo. */
export function axisTicks(range) {
  const hours = (range.to - range.from) / 60;
  const step = hours <= 12 ? 2 : hours <= 18 ? 3 : 4;
  const ticks = [];
  for (let h = Math.ceil(range.from / 60 / step) * step; h * 60 <= range.to; h += step) ticks.push(h * 60);
  return ticks;
}
