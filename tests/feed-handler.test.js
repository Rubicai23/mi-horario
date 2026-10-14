import test from 'node:test';
import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

/* La función se prueba con Firebase simulado: solo se comprueba la lógica de la petición. */
const TOKEN = 'A'.repeat(32);
const db = {
  calendarFeeds: { [TOKEN]: { uid: 'u1', alarm: 10 } },
  days: { '2026-10-07': { blocks: [{ id: 'b1', s: 540, e: 600, t: 'Estudio', c: 'estudio', n: '' }] } },
  profile: { recurring: [], cats: {} }
};
const fakeFirestore = {
  getFirestore: () => ({
    collection: name => ({
      doc: id => ({
        get: async () => ({ exists: name === 'calendarFeeds' ? Boolean(db.calendarFeeds[id]) : true, data: () => db.calendarFeeds[id] }),
        collection: sub => (sub === 'days'
          ? { where: () => ({ where: () => ({ get: async () => ({ forEach: fn => Object.entries(db.days).forEach(([id2, data]) => fn({ id: id2, data: () => data })) }) }) }) }
          : { doc: () => ({ get: async () => ({ exists: true, data: () => db.profile }) }) })
      })
    })
  }),
  FieldValue: { arrayRemove: () => null },
  FieldPath: { documentId: () => '__name__' }
};
const fakes = {
  'firebase-functions/v2/scheduler': { onSchedule: (_o, fn) => fn },
  'firebase-functions/v2/https': { onRequest: (_o, fn) => fn },
  'firebase-admin/app': { initializeApp: () => {} },
  'firebase-admin/firestore': fakeFirestore,
  'firebase-admin/messaging': { getMessaging: () => ({}) }
};
const originalLoad = Module._load;
Module._load = function (request, ...rest) { return fakes[request] || originalLoad.call(this, request, ...rest); };
const { calendarFeed } = require('../functions/index.js');
Module._load = originalLoad;

const call = async (query, method = 'GET') => {
  const out = { headers: {}, status: 200, body: '' };
  const res = {
    status(code) { out.status = code; return this; }, set(h, v) { Object.assign(out.headers, typeof h === 'string' ? { [h]: v } : h); return this; },
    send(body) { out.body = body; return this; }
  };
  await calendarFeed({ query, method }, res);
  return out;
};

test('token válido: devuelve un .ics con la actividad y el aviso', async () => {
  const r = await call({ t: TOKEN });
  assert.equal(r.status, 200);
  assert.match(r.headers['Content-Type'], /text\/calendar/);
  assert.match(r.body, /BEGIN:VCALENDAR/);
});

test('token con formato inválido o inexistente: 404 sin pistas', async () => {
  assert.equal((await call({ t: 'corto' })).status, 404);
  assert.equal((await call({})).status, 404);
  assert.equal((await call({ t: 'B'.repeat(32) })).status, 404);
});

test('solo GET/HEAD', async () => {
  assert.equal((await call({ t: TOKEN }, 'POST')).status, 405);
});
