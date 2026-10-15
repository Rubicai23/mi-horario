/**
 * search.js — Búsqueda de actividades (sin DOM ni estado).
 *
 * - Ignora mayúsculas y acentos ("ingles" encuentra "Inglés").
 * - Varias palabras: todas tienen que aparecer (en el título, la nota, las subtareas o la categoría).
 * - Devuelve primero lo que viene (de la fecha más cercana a la más lejana) y después lo pasado (de lo más reciente a lo más antiguo).
 */
const MARKS_G = /[\u0300-\u036f]/g;

/** Texto en minúsculas y sin acentos. */
export const fold = text => String(text).normalize('NFD').replace(MARKS_G, '').toLowerCase();

/** Palabras de la búsqueda, ya plegadas (máximo 6, sin repetidas). */
export function parseQuery(query) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return Array.from(new Set(words)).slice(0, 6);
}

/**
 * Tramos [inicio, fin) del texto original donde aparece alguna palabra (para resaltarlas).
 * Funciona letra a letra para que los índices coincidan con el texto original aunque haya acentos.
 */
export function highlightRanges(text, terms) {
  if (!terms.length) return [];
  const chars = Array.from(String(text));
  const offsets = [];            // posición (en unidades UTF-16) donde empieza cada letra original
  let folded = '';
  const owner = [];              // por cada letra plegada, a qué letra original pertenece
  let at = 0;
  chars.forEach((char, index) => {
    offsets.push(at);
    at += char.length;
    const plain = fold(char);
    for (let i = 0; i < plain.length; i += 1) owner.push(index);
    folded += plain;
  });
  offsets.push(at);
  const raw = [];
  terms.forEach(term => {
    if (!term) return;
    let from = 0;
    for (;;) {
      const found = folded.indexOf(term, from);
      if (found < 0) break;
      const first = owner[found];
      const last = owner[found + term.length - 1];
      raw.push([offsets[first], offsets[last + 1]]);
      from = found + term.length;
    }
  });
  raw.sort((a, b) => a[0] - b[0]);
  return raw.reduce((merged, range) => {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([range[0], range[1]]);
    return merged;
  }, []);
}

/** ¿La actividad cumple todas las palabras? Devuelve en qué campos aparecen, o null. */
export function matchBlock(block, terms, categoryLabel = '') {
  const fields = {
    t: fold(block.t),
    n: fold(block.n || ''),
    k: fold((block.k || []).map(item => item.t).join(' \n ')),
    c: fold(categoryLabel)
  };
  const hay = Object.values(fields).join(' \n ');
  if (!terms.every(term => hay.includes(term))) return null;
  return Object.keys(fields).filter(f => terms.some(term => fields[f].includes(term)));
}

/**
 * @param {object} p
 * @param {Array<[string, Array]>} p.days        pares [fecha, actividades]
 * @param {Array} [p.rules]                      repeticiones semanales (se muestran aparte)
 * @param {string} p.query
 * @param {(key:string)=>string} [p.categoryLabel]
 * @param {{category?:string, status?:'all'|'done'|'pending'}} [p.filters]
 * @param {string} p.today                       AAAA-MM-DD
 * @param {number} [p.limit]
 */
export function searchDays({ days, rules = [], query, categoryLabel = () => '', filters = {}, today, limit = 80 }) {
  const terms = parseQuery(query);
  const category = filters.category || '';
  const status = filters.status || 'all';
  if (!terms.length && !category && status === 'all') return { terms, results: [], rules: [], total: 0, truncated: false };
  const hits = [];
  days.forEach(([key, blocks]) => {
    blocks.forEach(block => {
      if (category && block.c !== category) return;
      if (status === 'done' && !block.d) return;
      if (status === 'pending' && block.d) return;
      const fields = terms.length ? matchBlock(block, terms, categoryLabel(block.c)) : [];
      if (!fields) return;
      hits.push({ key, block, fields });
    });
  });
  const upcoming = hits.filter(h => h.key >= today)
    .sort((a, b) => a.key.localeCompare(b.key) || a.block.s - b.block.s);
  const past = hits.filter(h => h.key < today)
    .sort((a, b) => b.key.localeCompare(a.key) || a.block.s - b.block.s);
  const all = [...upcoming, ...past];
  const ruleHits = status === 'all' && terms.length
    ? rules.filter(rule => (!rule.until || rule.until >= today)
      && (!category || rule.c === category)
      && matchBlock({ t: rule.t, n: '', k: rule.k }, terms, categoryLabel(rule.c)))
    : [];
  return {
    terms,
    results: all.slice(0, limit),
    rules: ruleHits,
    total: all.length,
    truncated: all.length > limit,
    upcomingCount: Math.min(upcoming.length, limit)
  };
}
