import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildIcs, escapeText, foldLine } = require('../functions/ics.js');
const { buildFeed, expandRules, cleanBlock } = require('../functions/feed.js');

const NOW = new Date(Date.UTC(2026, 9, 7, 10, 0, 0));
const TODAY = new Date(Date.UTC(2026, 9, 7));
const block = (over = {}) => ({ id: 'b1', s: 540, e: 600, t: 'Estudio', c: 'estudio', n: '', d: false, ...over });

test('ics: escapa comas, punto y coma, barras y saltos de línea', () => {
  assert.equal(escapeText('a,b;c\\d\ne'), 'a\\,b\;c\\\\d\\ne');
});

test('ics: dobla líneas largas a 75 octetos sin partir caracteres', () => {
  const parts = foldLine(`SUMMARY:${'é'.repeat(80)}`).split('\r\n');
  assert.ok(parts.length > 1);
  parts.forEach((part, i) => {
    assert.ok(Buffer.byteLength(part) <= 75, `línea ${i}`);
    if (i > 0) assert.ok(part.startsWith(' '));
  });
  assert.equal(parts.map((p, i) => (i ? p.slice(1) : p)).join(''), `SUMMARY:${'é'.repeat(80)}`);
});

test('ics: evento con hora local, título, categoría, subtareas y aviso', () => {
  const ics = buildIcs({ days: [{ key: '2026-10-07', blocks: [block({ n: 'Tema 3', k: [{ t: 'Leer', d: true }, { t: 'Resumen', d: false }] })] }], now: NOW, alarm: 10, categoryName: () => 'Estudio', refresh: 'PT15M' });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /\r\nEND:VCALENDAR\r\n$/);
  assert.match(ics, /REFRESH-INTERVAL;VALUE=DURATION:PT15M\r\n/);
  assert.match(ics, /DTSTART:20261007T090000\r\n/);
  assert.match(ics, /DTEND:20261007T100000\r\n/);
  assert.match(ics, /UID:b1-20261007@mi-horario\r\n/);
  assert.match(ics, /DESCRIPTION:Tema 3\\n\[x\] Leer\\n\[ \] Resumen\r\n/);
  assert.match(ics, /CATEGORIES:Estudio\r\n/);
  assert.match(ics, /TRIGGER:-PT10M\r\n/);
});

test('ics: aviso al empezar y sin aviso', () => {
  const day = [{ key: '2026-10-07', blocks: [block()] }];
  assert.match(buildIcs({ days: day, now: NOW, alarm: 0 }), /TRIGGER:PT0S/);
  assert.doesNotMatch(buildIcs({ days: day, now: NOW, alarm: null }), /VALARM/);
});

test('feed: un día guardado manda sobre las repeticiones; sin día guardado se generan', () => {
  const rule = { id: 'r1', t: 'Clases', c: 'clase', s: 480, e: 540, dows: [3, 4], from: '2026-10-01' };
  const stored = { '2026-10-07': [block({ t: 'Cambio puntual' })] };
  const ics = buildFeed({ stored, rules: [rule], cats: {}, today: TODAY, past: 0, future: 0, now: NOW });
  assert.match(ics, /SUMMARY:Cambio puntual/);
  assert.doesNotMatch(ics, /SUMMARY:Clases/);
  const next = buildFeed({ stored: {}, rules: [rule], cats: {}, today: TODAY, past: 0, future: 1, now: NOW });
  assert.match(next, /SUMMARY:Clases/);
  assert.match(next, /DTSTART:20261007T080000/);
  assert.match(next, /DTSTART:20261008T080000/);
});

test('feed: día guardado vacío = sin eventos (no se generan repeticiones)', () => {
  const rule = { id: 'r1', t: 'Clases', c: 'clase', s: 480, e: 540, dows: [3], from: '2026-10-01' };
  const ics = buildFeed({ stored: { '2026-10-07': [] }, rules: [rule], cats: {}, today: TODAY, past: 0, future: 0, now: NOW });
  assert.doesNotMatch(ics, /VEVENT/);
});

test('feed: reglas respetan from/until y los nombres de categoría propios', () => {
  const rule = { id: 'r1', t: 'Guitarra', c: 'uabc', s: 600, e: 660, dows: [3], from: '2026-10-14', until: '2026-10-21' };
  assert.equal(expandRules([rule], '2026-10-07').length, 0);
  assert.equal(expandRules([rule], '2026-10-14').length, 1);
  assert.equal(expandRules([rule], '2026-10-28').length, 0);
  const ics = buildFeed({ stored: {}, rules: [rule], cats: { uabc: { l: 'Música' }, gym: { x: 1 } }, today: new Date(Date.UTC(2026, 9, 14)), past: 0, future: 0, now: NOW });
  assert.match(ics, /CATEGORIES:Música/);
});

test('feed: ignora datos corruptos', () => {
  assert.equal(cleanBlock({ t: '', s: 1, e: 2 }), null);
  assert.equal(cleanBlock({ t: 'x', s: 600, e: 500 }), null);
  assert.equal(cleanBlock({ t: 'x', s: -1, e: 500 }), null);
  const ics = buildFeed({ stored: { '2026-10-07': [{ t: 'ok', s: 1, e: 0 }, null, 5] }, rules: 'mal', cats: null, today: TODAY, past: 0, future: 0, now: NOW });
  assert.doesNotMatch(ics, /VEVENT/);
});
