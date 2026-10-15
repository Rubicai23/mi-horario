import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStorage, createStateManager, findFreeSlot, sanitizeBlock, summarizeWeek } from '../src/state-manager.js';
import { fold, highlightRanges, matchBlock, parseQuery, searchDays } from '../src/search.js';
import { createTracker, elapsedSeconds, formatStopwatch, formatTracked, isCapped, sanitizeTracker } from '../src/tracker.js';
import { axisTicks, barGeometry, busyMinutes, longestGap, nowPosition, weekRange } from '../src/weekview.js';

const NOW = new Date(2026, 9, 7, 12, 0, 0);   // miércoles 2026-10-07
const setup = (clock = () => NOW) => {
  const sync = { push: () => Promise.resolve(true), remove: () => Promise.resolve(true), pushProfile: () => Promise.resolve(true) };
  return createStateManager({ storage: createMemoryStorage(), sync, clock });
};
const add = (state, key, t, s, e, extra = {}) => state.addBlock(key, { t, s, e, c: 'estudio', ...extra }).block;

/* ───────── Tiempo real en la actividad ───────── */

test('w (segundos medidos) se conserva, se redondea y se limita a un día', () => {
  assert.equal(sanitizeBlock({ id: 'a', s: 60, e: 120, t: 'X', w: 125.4 }).w, 125);
  assert.equal(sanitizeBlock({ id: 'a', s: 60, e: 120, t: 'X', w: 999999 }).w, 86400);
  assert.equal('w' in sanitizeBlock({ id: 'a', s: 60, e: 120, t: 'X', w: 0 }), false);
  assert.equal('w' in sanitizeBlock({ id: 'a', s: 60, e: 120, t: 'X', w: 'abc' }), false);
  assert.equal('w' in sanitizeBlock({ id: 'a', s: 60, e: 120, t: 'X', w: -5 }), false);
});

test('addTracked suma tiempo, se puede deshacer y se guarda en el día', () => {
  const state = setup();
  const b = add(state, '2026-10-07', 'Estudiar', 600, 660);
  const r1 = state.addTracked('2026-10-07', b.id, 1500);
  assert.equal(r1.total, 1500);
  const r2 = state.addTracked('2026-10-07', b.id, 600);
  assert.equal(r2.total, 2100);
  assert.equal(state.getDay('2026-10-07')[0].w, 2100);
  r2.undo();
  assert.equal(state.getDay('2026-10-07')[0].w, 1500);
  r1.undo();
  assert.equal('w' in state.getDay('2026-10-07')[0], false);
  assert.equal(state.addTracked('2026-10-07', 'nope', 10).ok, false);
  assert.equal(state.addTracked('2026-10-07', b.id, 0).ok, false);
});

test('el tiempo real se puede corregir a mano con updateBlock y a 0 desaparece', () => {
  const state = setup();
  const b = add(state, '2026-10-07', 'Estudiar', 600, 660);
  assert.equal(state.updateBlock('2026-10-07', b.id, { w: 3000 }).block.w, 3000);
  assert.equal('w' in state.updateBlock('2026-10-07', b.id, { w: 0 }).block, false);
});

test('copiar un día no copia el tiempo medido', () => {
  const state = setup();
  const b = add(state, '2026-10-07', 'Estudiar', 600, 660);
  state.addTracked('2026-10-07', b.id, 900);
  state.copyDay('2026-10-07', ['2026-10-08']);
  assert.equal('w' in state.getDay('2026-10-08')[0], false);
});

test('el resumen suma el tiempo real por categoría solo si existe', () => {
  const state = setup();
  const a = add(state, '2026-10-07', 'A', 600, 660);
  add(state, '2026-10-08', 'B', 600, 660, { c: 'gym' });
  state.addTracked('2026-10-07', a.id, 45 * 60);
  const summary = summarizeWeek([state.getDay('2026-10-07'), state.getDay('2026-10-08')]);
  assert.equal(summary.estudio.real, 45);
  assert.equal(summary.estudio.realPlan, 60);
  assert.equal('real' in summary.gym, false);
  assert.deepEqual(summary.gym, { planned: 60, done: 0 });
});

/* ───────── Cronómetro ───────── */

test('sanitizeTracker valida fecha, id y hora de inicio', () => {
  assert.deepEqual(sanitizeTracker({ key: '2026-10-07', id: 'b1', startedAt: 5 }), { key: '2026-10-07', id: 'b1', startedAt: 5 });
  assert.deepEqual(sanitizeTracker('{"key":"2026-10-07","id":"b1","startedAt":5}'), { key: '2026-10-07', id: 'b1', startedAt: 5 });
  assert.equal(sanitizeTracker({ key: '2026-13-07', id: 'b1', startedAt: 5 }), null);
  assert.equal(sanitizeTracker({ key: '2026-10-07', id: '', startedAt: 5 }), null);
  assert.equal(sanitizeTracker({ key: '2026-10-07', id: 'b1', startedAt: 'x' }), null);
  assert.equal(sanitizeTracker('no json'), null);
  assert.equal(sanitizeTracker(null), null);
});

test('el tiempo no pasa de la medianoche del día de inicio', () => {
  const start = new Date(2026, 9, 7, 23, 30).getTime();
  const tracker = { key: '2026-10-07', id: 'b', startedAt: start };
  assert.equal(elapsedSeconds(tracker, start + 10 * 60000), 600);
  assert.equal(isCapped(tracker, start + 10 * 60000), false);
  const next = new Date(2026, 9, 8, 9, 0).getTime();
  assert.equal(elapsedSeconds(tracker, next), 30 * 60);
  assert.equal(isCapped(tracker, next), true);
  assert.equal(elapsedSeconds(null, next), 0);
  assert.equal(elapsedSeconds(tracker, start - 5000), 0);
});

test('formatos del cronómetro', () => {
  assert.equal(formatStopwatch(0), '00:00');
  assert.equal(formatStopwatch(125), '02:05');
  assert.equal(formatStopwatch(3725), '1:02:05');
  assert.equal(formatTracked(0), '0 min');
  assert.equal(formatTracked(20), '< 1 min');
  assert.equal(formatTracked(45 * 60), '45 min');
  assert.equal(formatTracked(3600), '1 h');
  assert.equal(formatTracked(3900), '1 h 05 min');
});

const trackerSetup = () => {
  const state = setup();
  const store = { value: null };
  const make = () => createTracker({
    load: () => store.value, save: v => { store.value = v; },
    getDay: key => state.getDay(key), addTracked: (k, id, s) => state.addTracked(k, id, s)
  });
  return { state, store, make, tracker: make() };
};

test('empezar y parar guarda el tiempo en la actividad', () => {
  const { state, tracker } = trackerSetup();
  const b = add(state, '2026-10-07', 'Estudiar', 600, 660);
  const t0 = NOW.getTime();
  assert.equal(tracker.start('2026-10-07', b.id, t0).ok, true);
  assert.equal(tracker.isRunning('2026-10-07', b.id), true);
  assert.equal(tracker.elapsed(t0 + 90000), 90);
  const stop = tracker.stop(t0 + 25 * 60000);
  assert.equal(stop.seconds, 1500);
  assert.equal(stop.title, 'Estudiar');
  assert.equal(state.getDay('2026-10-07')[0].w, 1500);
  assert.equal(tracker.current(), null);
  assert.equal(tracker.stop(t0).ok, false);
});

test('empezar otra actividad guarda la anterior; sesiones sumadas', () => {
  const { state, tracker } = trackerSetup();
  const a = add(state, '2026-10-07', 'A', 600, 660);
  const b = add(state, '2026-10-07', 'B', 700, 760);
  const t0 = NOW.getTime();
  tracker.start('2026-10-07', a.id, t0);
  const r = tracker.start('2026-10-07', b.id, t0 + 600000);
  assert.equal(r.stopped.seconds, 600);
  tracker.stop(t0 + 900000);
  tracker.start('2026-10-07', a.id, t0 + 1000000);
  tracker.stop(t0 + 1000000 + 300000);
  const day = state.getDay('2026-10-07');
  assert.equal(day.find(x => x.id === a.id).w, 900);
  assert.equal(day.find(x => x.id === b.id).w, 300);
});

test('pulsar empezar dos veces sobre la misma actividad no reinicia', () => {
  const { state, tracker } = trackerSetup();
  const a = add(state, '2026-10-07', 'A', 600, 660);
  const t0 = NOW.getTime();
  tracker.start('2026-10-07', a.id, t0);
  tracker.start('2026-10-07', a.id, t0 + 50000);
  assert.equal(tracker.elapsed(t0 + 60000), 60);
});

test('el cronómetro sobrevive a recargar la app y se descarta si la actividad ya no existe', () => {
  const { state, make, tracker } = trackerSetup();
  const a = add(state, '2026-10-07', 'A', 600, 660);
  const t0 = NOW.getTime();
  tracker.start('2026-10-07', a.id, t0);
  const reloaded = make();
  assert.equal(reloaded.isRunning('2026-10-07', a.id), true);
  state.removeBlock('2026-10-07', a.id);
  assert.equal(reloaded.check(), true);
  assert.equal(reloaded.current(), null);
  assert.equal(make().current(), null);
  assert.equal(tracker.start('2026-10-07', 'inexistente', t0).ok, false);
});

test('parar tras olvidarlo guarda solo hasta medianoche y lo indica', () => {
  const { state, tracker } = trackerSetup();
  const a = add(state, '2026-10-07', 'A', 600, 660);
  const t0 = new Date(2026, 9, 7, 23, 0).getTime();
  tracker.start('2026-10-07', a.id, t0);
  const stop = tracker.stop(new Date(2026, 9, 8, 12, 0).getTime());
  assert.equal(stop.capped, true);
  assert.equal(stop.seconds, 3600);
});

/* ───────── Mover y copiar una actividad ───────── */

test('mover una actividad a otro día: sale del origen, conserva sus datos y se puede deshacer', () => {
  const state = setup();
  const b = add(state, '2026-10-07', 'Inglés', 600, 660, { n: 'unit 4', k: [{ t: 'Verbos', d: true }] });
  state.toggleDone('2026-10-07', b.id);
  const r = state.moveBlock('2026-10-07', b.id, '2026-10-09');
  assert.equal(r.ok, true);
  assert.equal(r.overlaps, 0);
  assert.equal(state.getDay('2026-10-07').length, 0);
  const moved = state.getDay('2026-10-09')[0];
  assert.equal(moved.t, 'Inglés');
  assert.equal(moved.d, true);
  assert.equal(moved.n, 'unit 4');
  assert.notEqual(moved.id, b.id);
  r.undo();
  assert.equal(state.getDay('2026-10-09').length, 0);
  assert.equal(state.getDay('2026-10-07').length, 1);
  assert.equal(state.getDay('2026-10-07')[0].id, b.id);
});

test('copiar una actividad: el original se queda y la copia nace sin marcar, sin nota y sin tiempo', () => {
  const state = setup();
  const b = add(state, '2026-10-07', 'Inglés', 600, 660, { n: 'unit 4', k: [{ t: 'Verbos', d: true }] });
  state.toggleDone('2026-10-07', b.id);
  state.addTracked('2026-10-07', b.id, 600);
  const r = state.moveBlock('2026-10-07', b.id, '2026-10-08', { copy: true });
  assert.equal(r.ok, true);
  assert.equal(state.getDay('2026-10-07').length, 1);
  const copy = state.getDay('2026-10-08')[0];
  assert.equal(copy.d, false);
  assert.equal(copy.n, '');
  assert.equal('w' in copy, false);
  assert.equal(copy.k[0].d, false);
  r.undo();
  assert.equal(state.getDay('2026-10-08').length, 0);
  assert.equal(state.getDay('2026-10-07').length, 1);
});

test('mover avisa si choca, rechaza el mismo día y las actividades que no existen', () => {
  const state = setup();
  const b = add(state, '2026-10-07', 'A', 600, 660);
  add(state, '2026-10-08', 'B', 630, 700);
  assert.equal(state.moveBlock('2026-10-07', b.id, '2026-10-08').overlaps, 1);
  assert.equal(state.moveBlock('2026-10-07', 'nope', '2026-10-08').ok, false);
  const c = add(state, '2026-10-07', 'C', 800, 860);
  assert.equal(state.moveBlock('2026-10-07', c.id, '2026-10-07').ok, false);
  assert.throws(() => state.moveBlock('2026-10-07', c.id, 'mal'), TypeError);
});

test('mover una actividad de una repetición semanal la saca de la serie solo ese día', () => {
  const state = setup();
  const created = state.addRecurring('2026-10-07', { t: 'Gimnasio', s: 1000, e: 1060, c: 'gym' }, [3]);
  assert.equal(created.ok, true);
  const day = state.getDay('2026-10-07');
  const r = state.moveBlock('2026-10-07', day[0].id, '2026-10-08');
  assert.equal(r.ok, true);
  assert.equal(state.getDay('2026-10-07').length, 0);
  assert.equal('r' in state.getDay('2026-10-08')[0], false);
  assert.equal(state.getDay('2026-10-14').length, 1);   // la semana siguiente sigue
});

/* ───────── Pasar pendientes ───────── */

test('findFreeSlot: misma hora si está libre, si no el primer hueco, si no cabe null', () => {
  const day = [{ id: 'a', s: 600, e: 660 }, { id: 'b', s: 660, e: 720 }];
  assert.equal(findFreeSlot(day, 60, 800), 800);
  assert.equal(findFreeSlot(day, 60, 600), 720);
  assert.equal(findFreeSlot(day, 60, 1400), 0);
  assert.equal(findFreeSlot([{ id: 'x', s: 0, e: 1439 }], 30, 100), null);
});

test('pasar pendientes de hoy a mañana: se mueven, lo hecho se queda y se puede deshacer', () => {
  const state = setup();
  const a = add(state, '2026-10-07', 'A', 600, 660);
  add(state, '2026-10-07', 'B', 700, 760);
  state.toggleDone('2026-10-07', a.id);
  const r = state.carryOver('2026-10-07', '2026-10-08');
  assert.equal(r.ok, true);
  assert.equal(r.copy, false);
  assert.equal(r.moved, 1);
  assert.deepEqual(state.getDay('2026-10-07').map(b => b.t), ['A']);
  assert.deepEqual(state.getDay('2026-10-08').map(b => b.t), ['B']);
  r.undo();
  assert.equal(state.getDay('2026-10-07').length, 2);
  assert.equal(state.getDay('2026-10-08').length, 0);
});

test('pasar pendientes: si la hora está ocupada va al primer hueco', () => {
  const state = setup();
  add(state, '2026-10-07', 'B', 700, 760);
  add(state, '2026-10-08', 'X', 690, 800);
  const r = state.carryOver('2026-10-07', '2026-10-08');
  assert.equal(r.shifted, 1);
  const moved = state.getDay('2026-10-08').find(b => b.t === 'B');
  assert.equal(moved.s, 800);
  assert.equal(moved.e, 860);
});

test('pasar pendientes desde un día pasado COPIA y deja el original (la racha no cambia)', () => {
  const state = setup();
  const past = '2026-10-05';
  add(state, past, 'Tarea', 600, 660, { n: 'nota', k: [{ t: 's', d: true }] });
  const before = state.streakView(NOW);
  const r = state.carryOver(past, '2026-10-07');
  assert.equal(r.copy, true);
  assert.equal(state.getDay(past).length, 1);
  const copy = state.getDay('2026-10-07')[0];
  assert.equal(copy.n, '');
  assert.equal(copy.k[0].d, false);
  // El día pasado sigue igual (hoy cambia porque ahora tiene una actividad).
  assert.deepEqual(state.streakView(NOW).week.slice(0, 2).map(d => d.status), before.week.slice(0, 2).map(d => d.status));
  assert.equal(before.week[0].status, 'missed');
});

test('pasar pendientes: sin pendientes, mismo día, y solo hasta una hora', () => {
  const state = setup();
  const a = add(state, '2026-10-07', 'A', 600, 660);
  add(state, '2026-10-07', 'B', 900, 960);
  assert.equal(state.carryOver('2026-10-07', '2026-10-07').ok, false);
  assert.equal(state.carryOver('2026-10-08', '2026-10-09').ok, false);
  const r = state.carryOver('2026-10-07', '2026-10-08', { onlyOver: 720 });
  assert.equal(r.moved, 1);
  assert.deepEqual(state.getDay('2026-10-07').map(b => b.t), ['B']);
  assert.equal(a.id !== undefined, true);
});

test('pasar pendientes: un pendiente con tiempo medido lo conserva al moverlo', () => {
  const state = setup();
  const a = add(state, '2026-10-07', 'A', 600, 660);
  state.addTracked('2026-10-07', a.id, 900);
  state.carryOver('2026-10-07', '2026-10-08');
  assert.equal(state.getDay('2026-10-08')[0].w, 900);
});

/* ───────── Búsqueda ───────── */

test('fold y parseQuery ignoran mayúsculas y acentos', () => {
  assert.equal(fold('Inglés Ñandú'), 'ingles nandu');
  assert.deepEqual(parseQuery('  Inglés  GYM ingles '), ['ingles', 'gym']);
  assert.deepEqual(parseQuery('   '), []);
  assert.equal(parseQuery('a b c d e f g h').length, 6);
});

test('highlightRanges marca las coincidencias en el texto original (con acentos)', () => {
  assert.deepEqual(highlightRanges('Clase de Inglés', ['ingles']), [[9, 15]]);
  assert.deepEqual(highlightRanges('ana y ANA', ['ana']), [[0, 3], [6, 9]]);
  assert.deepEqual(highlightRanges('abc', ['a', 'ab']), [[0, 2]]);
  assert.deepEqual(highlightRanges('abc', []), []);
});

test('matchBlock busca en título, nota, subtareas y categoría; todas las palabras', () => {
  const b = { t: 'Repaso', n: 'Examen de mates', k: [{ t: 'Derivadas', d: false }], c: 'estudio' };
  assert.deepEqual(matchBlock(b, ['derivadas'], 'Estudio'), ['k']);
  assert.deepEqual(matchBlock(b, ['examen', 'mates'], 'Estudio'), ['n']);
  assert.ok(matchBlock(b, ['repaso', 'estudio'], 'Estudio'));
  assert.equal(matchBlock(b, ['repaso', 'gym'], 'Estudio'), null);
});

test('searchDays: lo próximo primero y ordenado por fecha; lo pasado, de más reciente a más antiguo', () => {
  const days = [
    ['2026-10-01', [{ id: 'a', s: 600, e: 660, t: 'Dentista', c: 'libre', d: true }]],
    ['2026-10-20', [{ id: 'b', s: 600, e: 660, t: 'Dentista revisión', c: 'libre', d: false }]],
    ['2026-10-05', [{ id: 'c', s: 600, e: 660, t: 'dentista', c: 'libre', d: true }]],
    ['2026-10-09', [{ id: 'd', s: 600, e: 660, t: 'Dentista', c: 'libre', d: false }]]
  ];
  const r = searchDays({ days, query: 'DENTISTA', today: '2026-10-07' });
  assert.deepEqual(r.results.map(h => h.block.id), ['d', 'b', 'c', 'a']);
  assert.equal(r.upcomingCount, 2);
  assert.equal(r.total, 4);
});

test('searchDays: filtros por categoría y estado, sin texto', () => {
  const days = [['2026-10-09', [
    { id: 'a', s: 1, e: 2, t: 'A', c: 'gym', d: true },
    { id: 'b', s: 3, e: 4, t: 'B', c: 'gym', d: false },
    { id: 'c', s: 5, e: 6, t: 'C', c: 'clase', d: false }
  ]]];
  const base = { days, query: '', today: '2026-10-07' };
  assert.equal(searchDays({ ...base }).total, 0);
  assert.deepEqual(searchDays({ ...base, filters: { category: 'gym' } }).results.map(h => h.block.id), ['a', 'b']);
  assert.deepEqual(searchDays({ ...base, filters: { status: 'pending' } }).results.map(h => h.block.id), ['b', 'c']);
  assert.deepEqual(searchDays({ ...base, filters: { category: 'gym', status: 'done' } }).results.map(h => h.block.id), ['a']);
});

test('searchDays: límite y repeticiones vigentes aparte', () => {
  const blocks = Array.from({ length: 10 }, (_, i) => ({ id: `b${i}`, s: i * 10, e: i * 10 + 5, t: 'Tarea', c: 'libre', d: false }));
  const r = searchDays({ days: [['2026-10-09', blocks]], query: 'tarea', today: '2026-10-07', limit: 3 });
  assert.equal(r.results.length, 3);
  assert.equal(r.truncated, true);
  const rules = [
    { id: 'r1', t: 'Tarea semanal', c: 'libre', s: 1, e: 2, dows: [1], from: '2026-10-01' },
    { id: 'r2', t: 'Tarea vieja', c: 'libre', s: 1, e: 2, dows: [1], from: '2026-09-01', until: '2026-09-30' }
  ];
  const withRules = searchDays({ days: [], rules, query: 'tarea', today: '2026-10-07' });
  assert.deepEqual(withRules.rules.map(x => x.id), ['r1']);
});

test('state.search usa las categorías del usuario y los días guardados', () => {
  const state = setup();
  const cat = state.addCategory('Guitarra').category;
  add(state, '2026-10-08', 'Ensayo', 600, 660, { c: cat.key });
  add(state, '2026-10-09', 'Otra cosa', 600, 660);
  assert.equal(state.search('guitarra').total, 1);
  assert.equal(state.search('ensayo').results[0].key, '2026-10-08');
  assert.equal(state.search('', { category: cat.key }).total, 1);
  assert.equal(state.search('zzz').total, 0);
});

/* ───────── Vista de semana ───────── */

test('weekRange: horas enteras comunes con mínimo de 10 horas', () => {
  assert.deepEqual(weekRange([]), { from: 420, to: 1320 });
  const r = weekRange([[{ s: 9 * 60 + 15, e: 10 * 60 + 40 }], [{ s: 18 * 60, e: 20 * 60 }]]);
  assert.equal(r.from % 60, 0);
  assert.equal(r.to % 60, 0);
  assert.ok(r.from <= 9 * 60 && r.to >= 20 * 60);
  assert.ok(r.to - r.from >= 600);
  const wide = weekRange([[{ s: 0, e: 1439 }]]);
  assert.deepEqual(wide, { from: 0, to: 1440 });
});

test('barGeometry y nowPosition en porcentajes', () => {
  const range = { from: 600, to: 1200 };
  assert.deepEqual(barGeometry({ s: 600, e: 900 }, range), { left: 0, width: 50 });
  const g = barGeometry({ s: 900, e: 1500 }, range);
  assert.equal(g.left, 50);
  assert.equal(g.width, 50);
  assert.equal(nowPosition(900, range), 50);
  assert.equal(nowPosition(500, range), null);
  assert.ok(barGeometry({ s: 700, e: 701 }, range).width >= 0.8);
});

test('longestGap y busyMinutes', () => {
  assert.equal(longestGap([{ s: 0, e: 60 }]), null);
  assert.deepEqual(longestGap([{ s: 600, e: 660 }, { s: 700, e: 760 }, { s: 900, e: 960 }]), { from: 760, to: 900, length: 140 });
  assert.equal(longestGap([{ s: 600, e: 700 }, { s: 650, e: 720 }]), null);
  assert.equal(busyMinutes([{ s: 600, e: 700 }, { s: 650, e: 720 }, { s: 800, e: 830 }]), 150);
  assert.equal(busyMinutes([]), 0);
});

test('axisTicks cada 2, 3 o 4 horas según el ancho', () => {
  assert.deepEqual(axisTicks({ from: 480, to: 1200 }), [480, 600, 720, 840, 960, 1080, 1200]);
  assert.equal(axisTicks({ from: 360, to: 1380 })[1] - axisTicks({ from: 360, to: 1380 })[0], 180);
  assert.equal(axisTicks({ from: 0, to: 1440 })[1] - axisTicks({ from: 0, to: 1440 })[0], 240);
});
