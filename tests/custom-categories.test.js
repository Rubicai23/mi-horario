import test from 'node:test';
import assert from 'node:assert/strict';
import { activeCategories, createMemoryStorage, createStateManager, sanitizeBlock, sanitizeCategories } from '../src/state-manager.js';
import { LIMITS } from '../src/config.js';

const NOW = new Date(2026, 9, 7, 12, 0, 0);
const setup = () => {
  const calls = [];
  const sync = { push: () => Promise.resolve(true), remove: () => Promise.resolve(true), pushProfile: p => { calls.push(JSON.parse(JSON.stringify(p))); return Promise.resolve(true); } };
  return { calls, state: createStateManager({ storage: createMemoryStorage(), sync, clock: () => NOW }) };
};

test('por defecto hay 6 categorías iniciales', () => {
  const { state } = setup();
  assert.deepEqual(state.listCategories().map(c => c.key), ['clase', 'gym', 'estudio', 'ingles', 'libre', 'rutina']);
});

test('crear una categoría propia: se guarda, se lista y las actividades la aceptan', () => {
  const { state, calls } = setup();
  const r = state.addCategory('  Guitarra ');
  assert.equal(r.ok, true);
  assert.match(r.category.key, /^u[a-z0-9]+$/);
  assert.equal(state.listCategories().at(-1).label, 'Guitarra');
  assert.equal(calls.at(-1).cats[r.category.key].l, 'Guitarra');
  const b = state.addBlock('2026-10-07', { t: 'Ensayo', c: r.category.key, s: 600, e: 660 });
  assert.equal(b.block.c, r.category.key);
});

test('nombres: vacíos, repetidos (sin distinguir mayúsculas) y límite', () => {
  const { state } = setup();
  assert.equal(state.addCategory('  ').ok, false);
  assert.equal(state.addCategory('gimnasio').ok, false);
  assert.equal(state.addCategory('Guitarra').ok, true);
  assert.equal(state.addCategory('GUITARRA').ok, false);
  for (let i = 0; state.listCategories().length < LIMITS.categories; i++) {
    if (!state.addCategory(`C${i}`).ok) break;
  }
  assert.equal(state.addCategory('Una más').ok, false);
});

test('renombrar y cambiar color de una propia; no se puede dejar sin nombre', () => {
  const { state } = setup();
  const { category } = state.addCategory('Guitarra');
  assert.equal(state.setCategory(category.key, { label: 'Música', color: 'rojo' }).ok, true);
  const found = state.listCategories().find(c => c.key === category.key);
  assert.equal(found.label, 'Música');
  assert.equal(found.color, 'rojo');
  assert.equal(state.setCategory(category.key, { label: '' }).ok, false);
  assert.equal(state.setCategory(category.key, { label: 'Estudio' }).ok, false);
  assert.equal(state.setCategory('unoexiste', { label: 'X' }).ok, false);
});

test('eliminar: las iniciales también, nunca la última, con deshacer', () => {
  const { state } = setup();
  const r = state.removeCategory('gym');
  assert.equal(r.ok, true);
  assert.equal(state.listCategories().some(c => c.key === 'gym'), false);
  r.undo();
  assert.equal(state.listCategories().some(c => c.key === 'gym'), true);
  const { category } = state.addCategory('Guitarra');
  assert.equal(state.removeCategory(category.key).ok, true);
  assert.equal(state.listCategories().some(c => c.key === category.key), false);
  ['clase', 'gym', 'estudio', 'ingles', 'libre'].forEach(k => state.removeCategory(k));
  const last = state.removeCategory('rutina');
  assert.equal(last.ok, false);
  assert.equal(state.listCategories().length, 1);
});

test('una actividad con categoría eliminada se conserva (id válido)', () => {
  const { state } = setup();
  const { category } = state.addCategory('Guitarra');
  state.addBlock('2026-10-07', { t: 'Ensayo', c: category.key, s: 600, e: 660 });
  state.removeCategory(category.key);
  assert.equal(state.getDay('2026-10-07')[0].c, category.key);
});

test('resetCategories devuelve las iniciales pero conserva las propias', () => {
  const { state } = setup();
  const { category } = state.addCategory('Guitarra');
  state.removeCategory('gym');
  state.setCategory('clase', { label: 'Mates' });
  const r = state.resetCategories();
  assert.equal(r.changed, true);
  assert.equal(state.listCategories().find(c => c.key === 'clase').label, 'Clase');
  assert.equal(state.listCategories().some(c => c.key === 'gym'), true);
  assert.equal(state.listCategories().some(c => c.key === category.key), true);
});

test('sanitize: ids y colores inválidos se descartan', () => {
  assert.deepEqual(sanitizeCategories({ uabc: { l: 'Ok', c: 'rojo' }, 'x!': { l: 'Mal' }, ucero: { c: 'rojo' }, gym: { x: 1 }, clase: { l: 'Mates', c: 'javascript:1' } }),
    { uabc: { l: 'Ok', c: 'rojo' }, gym: { x: 1 }, clase: { l: 'Mates' } });
  assert.equal(sanitizeBlock({ id: 'b1', s: 1, e: 2, t: 'x', c: 'uabc123' }).c, 'uabc123');
  assert.equal(sanitizeBlock({ id: 'b1', s: 1, e: 2, t: 'x', c: 'raro!' }).c, 'rutina');
  assert.equal(activeCategories({ gym: { x: 1 } }).some(c => c.key === 'gym'), false);
});

test('toggleSubtask marca y desmarca una subtarea sin tocar el resto', () => {
  const { state } = setup();
  const r = state.addBlock('2026-10-07', { t: 'Estudiar', c: 'estudio', s: 600, e: 660, k: [{ t: 'A', d: false }, { t: 'B', d: false }] });
  assert.equal(state.toggleSubtask('2026-10-07', r.block.id, 1).ok, true);
  assert.deepEqual(state.getDay('2026-10-07')[0].k.map(i => i.d), [false, true]);
  state.toggleSubtask('2026-10-07', r.block.id, 1);
  assert.deepEqual(state.getDay('2026-10-07')[0].k.map(i => i.d), [false, false]);
  assert.equal(state.toggleSubtask('2026-10-07', r.block.id, 9).ok, false);
});
