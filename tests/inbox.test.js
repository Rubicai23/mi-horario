import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStorage, createStateManager, sanitizeProfile } from '../src/state-manager.js';
import { LIMITS } from '../src/config.js';

const NOW = new Date(2026, 9, 7, 12, 3, 0);   // miércoles 2026-10-07 12:03
const pushed = [];
const setup = (storage = createMemoryStorage()) => {
  const sync = { push: () => Promise.resolve(true), remove: () => Promise.resolve(true), pushProfile: p => { pushed.push(p); return Promise.resolve(true); } };
  return createStateManager({ storage, sync, clock: () => NOW });
};

test('addInbox añade, recorta y rechaza títulos vacíos', () => {
  const s = setup();
  assert.equal(s.addInbox({ t: '   ' }).ok, false);
  const r = s.addInbox({ t: ' Llamar al banco ', c: 'libre', m: 30, n: 'Pedir cita' });
  assert.equal(r.ok, true);
  assert.deepEqual(s.listInbox().map(i => [i.t, i.c, i.m, i.n]), [['Llamar al banco', 'libre', 30, 'Pedir cita']]);
  assert.match(r.item.id, /^i[a-z0-9]{1,20}$/);
});

test('updateInbox cambia campos y permite quitar categoría y minutos', () => {
  const s = setup();
  const { item } = s.addInbox({ t: 'A', c: 'libre', m: 30 });
  const r = s.updateInbox(item.id, { t: 'B', c: '', m: 0 });
  assert.equal(r.ok, true);
  const now = s.listInbox()[0];
  assert.equal(now.t, 'B'); assert.equal('c' in now, false); assert.equal('m' in now, false);
  assert.equal(s.updateInbox(item.id, { t: '' }).ok, false);
  assert.equal(s.updateInbox('inada', { t: 'x' }).ok, false);
});

test('removeInbox y restoreInbox devuelven la tarea a su sitio', () => {
  const s = setup();
  const a = s.addInbox({ t: 'A' }).item, b = s.addInbox({ t: 'B' }).item, c = s.addInbox({ t: 'C' }).item;
  const r = s.removeInbox(b.id);
  assert.equal(r.index, 1);
  assert.deepEqual(s.listInbox().map(i => i.t), ['A', 'C']);
  assert.equal(s.restoreInbox(r.removed, r.index).ok, true);
  assert.deepEqual(s.listInbox().map(i => i.id), [a.id, b.id, c.id]);
  assert.equal(s.restoreInbox(r.removed, 0).ok, false);   // ya está
  assert.equal(s.removeInbox('nope').ok, false);
});

test('el límite de tareas sin hora se respeta', () => {
  const s = setup();
  for (let i = 0; i < LIMITS.inbox; i += 1) assert.equal(s.addInbox({ t: `T${i}` }).ok, true);
  assert.equal(s.addInbox({ t: 'una más' }).ok, false);
});

test('sanitizeProfile limpia la bandeja: ids inválidos, repetidos y exceso', () => {
  const raw = { templates: [], inbox: [{ id: 'iabc', t: 'Ok' }, { id: 'iabc', t: 'Repetida' }, { id: 'MAL ID', t: 'x' }, { id: 'ixyz', t: '' }, 5] };
  const p = sanitizeProfile(raw);
  assert.deepEqual(p.inbox.map(i => i.t), ['Ok']);
  assert.equal('inbox' in sanitizeProfile({ templates: [] }), false);
});

test('la bandeja se guarda, se sincroniza y sobrevive a recargar', () => {
  const storage = createMemoryStorage();
  const s = setup(storage);
  s.addInbox({ t: 'Persistente' });
  assert.ok(pushed.at(-1).inbox.some(i => i.t === 'Persistente'));
  assert.equal(setup(storage).listInbox()[0].t, 'Persistente');
});

test('suggestSlot: desde ahora hoy, desde las 9:00 otros días, y esquiva lo ocupado', () => {
  const s = setup();
  const today = s.suggestSlot('2026-10-07', 30);
  assert.equal(today.s, 12 * 60 + 5); assert.equal(today.e - today.s, 30);
  const other = s.suggestSlot('2026-10-08', 45);
  assert.deepEqual(other, { s: 540, e: 585 });
  s.addBlock('2026-10-08', { t: 'Clase', s: 540, e: 600, c: 'clase' });
  assert.equal(s.suggestSlot('2026-10-08', 45).s, 600);
});

test('importar una copia de seguridad junta la bandeja sin duplicar', () => {
  const a = setup();
  a.addInbox({ t: 'De la copia' });
  const backup = JSON.stringify(a.exportBackup());
  const b = setup();
  b.addInbox({ t: 'Local' });
  b.importBackup(backup);
  assert.deepEqual(b.listInbox().map(i => i.t).sort(), ['De la copia', 'Local']);
  b.importBackup(backup);
  assert.equal(b.listInbox().length, 2);
});
