'use strict';
/**
 * feed.js — Calcula las actividades que se publican en el calendario suscrito. Lógica pura (sin Firebase).
 * Un día guardado manda sobre las repeticiones; si no hay día guardado, se generan las actividades de las reglas.
 */
const { buildIcs } = require('./ics');

const DEFAULT_CATEGORY_NAMES = Object.freeze({
  clase: 'Clase', gym: 'Gimnasio', estudio: 'Estudio', ingles: 'Inglés', libre: 'Libre', rutina: 'Rutina'
});
const KEY_RE = /^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const ID_RE = /^[\w-]{1,40}$/;

const pad = n => String(n).padStart(2, '0');
const toKey = date => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
const addDaysUtc = (date, n) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + n));
const dowOf = key => new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10))).getUTCDay();

const minute = n => Number.isInteger(n) && n >= 0 && n <= 1439;

/** Una actividad válida o null (nunca se fía de lo guardado). */
function cleanBlock(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.t !== 'string' || !raw.t.trim()) return null;
  if (!minute(raw.s) || !minute(raw.e) || raw.e <= raw.s) return null;
  const block = {
    id: typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : `x${raw.s}${raw.e}`,
    s: raw.s, e: raw.e, t: raw.t.trim().slice(0, 80), c: typeof raw.c === 'string' ? raw.c : 'rutina',
    n: typeof raw.n === 'string' ? raw.n.slice(0, 300) : ''
  };
  if (Array.isArray(raw.k)) {
    const k = raw.k.filter(i => i && typeof i.t === 'string' && i.t.trim()).slice(0, 15).map(i => ({ t: i.t.trim().slice(0, 60), d: i.d === true }));
    if (k.length) block.k = k;
  }
  return block;
}

/** Actividades que generan las reglas semanales para un día. */
function expandRules(rules, key) {
  const dow = dowOf(key);
  return (Array.isArray(rules) ? rules : []).flatMap(rule => {
    if (!rule || !KEY_RE.test(rule.from || '') || key < rule.from || (rule.until && key > rule.until)) return [];
    if (!Array.isArray(rule.dows) || !rule.dows.includes(dow) || typeof rule.id !== 'string') return [];
    const block = cleanBlock({ id: `${rule.id}-${key.replace(/-/g, '')}`, s: rule.s, e: rule.e, t: rule.t, c: rule.c, k: rule.k });
    return block ? [block] : [];
  });
}

/** Nombres de categorías: las del usuario sobre las iniciales. */
function categoryNamer(cats) {
  const own = cats && typeof cats === 'object' ? cats : {};
  return key => {
    const item = own[key];
    if (item && typeof item.l === 'string' && item.l) return item.l;
    if (item && item.x === 1) return '';
    return DEFAULT_CATEGORY_NAMES[key] || '';
  };
}

/**
 * @param {object} p
 * @param {Record<string,Array>} p.stored  días guardados: { 'AAAA-MM-DD': [bloques] }
 * @param {Array} p.rules                  repeticiones del perfil
 * @param {object} p.cats                  categorías del perfil
 * @param {Date} p.today                   hoy (UTC, solo la fecha importa)
 * @param {number} p.past                  días hacia atrás
 * @param {number} p.future                días hacia delante
 * @param {number|null} p.alarm            minutos de antelación o null
 */
function buildFeed({ stored, rules, cats, today, past = 14, future = 120, alarm = null, now = new Date() }) {
  const days = [];
  for (let i = -past; i <= future; i++) {
    const key = toKey(addDaysUtc(today, i));
    const raw = Object.prototype.hasOwnProperty.call(stored, key) ? stored[key] : expandRules(rules, key);
    const blocks = (Array.isArray(raw) ? raw : []).map(cleanBlock).filter(Boolean).sort((a, b) => a.s - b.s || a.e - b.e);
    if (blocks.length) days.push({ key, blocks });
  }
  return buildIcs({ days, now, alarm, categoryName: categoryNamer(cats), refresh: 'PT15M' });
}

module.exports = { buildFeed, expandRules, cleanBlock, categoryNamer, toKey, addDaysUtc };
