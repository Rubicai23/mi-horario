import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStorage, createStateManager, sanitizeBlock, occurrenceBlock, sanitizeRule } from '../src/state-manager.js';

const setup = now => createStateManager({
  storage: createMemoryStorage(), clock: () => now,
  sync: { push: () => Promise.resolve(true), remove: () => Promise.resolve(true), pushProfile: () => Promise.resolve(true) }
});
const TODAY = '2026-10-07';

test('o se conserva solo si es true', () => {
  assert.equal(sanitizeBlock({ id: 'a', s: 60, e: 120, t: 'X', o: true }).o, true);
  assert.equal('o' in sanitizeBlock({ id: 'a', s: 60, e: 120, t: 'X', o: 'si' }), false);
  assert.equal('o' in sanitizeBlock({ id: 'a', s: 60, e: 120, t: 'X', o: false }), false);
});

test('al marcar hecha hoy, la actividad sin fin termina a la hora actual', () => {
  const s = setup(new Date(2026, 9, 7, 19, 12));
  const b = s.addBlock(TODAY, { t: 'Gimnasio', s: 18 * 60, e: 19 * 60, c: 'gym', o: true }).block;
  const r = s.toggleDone(TODAY, b.id);
  assert.equal(r.closedAt, 19 * 60 + 12);
  const now = s.getDay(TODAY)[0];
  assert.equal(now.e, 19 * 60 + 12); assert.equal(now.d, true); assert.equal('o' in now, false);
});

test('el fin nunca queda a menos de 5 min del inicio y otro día se queda la provisional', () => {
  const s = setup(new Date(2026, 9, 7, 18, 2));
  const a = s.addBlock(TODAY, { t: 'A', s: 18 * 60, e: 19 * 60, c: 'gym', o: true }).block;
  assert.equal(s.toggleDone(TODAY, a.id).closedAt, 18 * 60 + 5);
  const b = s.addBlock('2026-10-09', { t: 'B', s: 600, e: 660, c: 'gym', o: true }).block;
  const r = s.toggleDone('2026-10-09', b.id);
  assert.equal(r.closedAt, null);
  assert.equal(s.getDay('2026-10-09')[0].e, 660);
  assert.equal('o' in s.getDay('2026-10-09')[0], false);
});

test('una actividad normal no cambia al marcarla y editar puede quitar o poner o', () => {
  const s = setup(new Date(2026, 9, 7, 19, 12));
  const b = s.addBlock(TODAY, { t: 'N', s: 600, e: 660, c: 'gym' }).block;
  assert.equal(s.toggleDone(TODAY, b.id).closedAt, null);
  assert.equal(s.getDay(TODAY)[0].e, 660);
  const c = s.addBlock(TODAY, { t: 'C', s: 700, e: 760, c: 'gym', o: true }).block;
  assert.equal(s.updateBlock(TODAY, c.id, { o: false }).block.o, undefined);
  assert.equal(s.updateBlock(TODAY, c.id, { o: true }).block.o, true);
});

test('las repeticiones conservan «sin hora de fin»', () => {
  const rule = sanitizeRule({ id: 'r1234', t: 'Gym', c: 'gym', s: 1080, e: 1140, o: true, dows: [1, 3], from: TODAY });
  assert.equal(rule.o, true);
  assert.equal(occurrenceBlock(rule, TODAY).o, true);
  const s = setup(new Date(2026, 9, 7, 12, 0));
  const res = s.addRecurring(TODAY, { t: 'Gym', c: 'gym', s: 1080, e: 1140, o: true }, [1]);
  assert.equal(res.ok, true);
  assert.equal(s.getDay('2026-10-12').find(b => b.t === 'Gym').o, true);
});
