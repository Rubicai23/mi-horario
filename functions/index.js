'use strict';
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, FieldPath } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { splitDue } = require('./logic');
const { buildFeed } = require('./feed');

initializeApp();

const DEAD_TOKEN = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);

/** Cada minuto: envía los avisos que ya tocan y deja solo los futuros. */
exports.sendDueReminders = onSchedule({ schedule: 'every 1 minutes', region: 'europe-west1', timeoutSeconds: 60, maxInstances: 1, memory: '256MiB' }, async () => {
  const db = getFirestore();
  const now = Date.now();
  const snap = await db.collection('pushQueue').where('nextAt', '>', 0).where('nextAt', '<=', now).limit(200).get();
  await Promise.all(snap.docs.map(async docSnap => {
    const data = docSnap.data();
    const { due, keep, nextAt } = splitDue(data.items, now);
    const tokens = Array.isArray(data.tokens) ? data.tokens : [];
    const dead = new Set();
    for (const item of due) {
      await Promise.all(tokens.map(token => getMessaging().send({
        token,
        data: { title: String(item.t || 'Mi horario').slice(0, 120), body: String(item.b || '').slice(0, 200), tag: `r-${item.at}` },
        webpush: { headers: { Urgency: 'high', TTL: '600' } }
      }).catch(err => { if (DEAD_TOKEN.has(err && err.code)) dead.add(token); })));
    }
    const update = { items: keep, nextAt };
    if (dead.size) update.tokens = FieldValue.arrayRemove(...dead);
    await docSnap.ref.update(update);
  }));
});

/* ───────── Calendario suscrito ─────────
 * Apple Calendar / Google Calendar piden esta dirección cada cierto tiempo:
 *   https://europe-west1-<proyecto>.cloudfunctions.net/calendarFeed?t=<token>
 * El token (32 caracteres al azar) es el "permiso": apunta a calendarFeeds/{token} → { uid, alarm }.
 * Solo lectura: nunca se escribe nada en los datos del usuario. */
const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
const cache = new Map();           // token → { at, body }  (evita lecturas repetidas en el mismo minuto)
const CACHE_MS = 60 * 1000;

exports.calendarFeed = onRequest({ region: 'europe-west1', maxInstances: 3, memory: '256MiB', timeoutSeconds: 30, cors: false }, async (req, res) => {
  const token = String(req.query.t || '');
  const notFound = () => res.status(404).set('Cache-Control', 'no-store').send('No encontrado');
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.status(405).send('Método no permitido'); return; }
  if (!TOKEN_RE.test(token)) { notFound(); return; }
  const hit = cache.get(token);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    res.set({ 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=60' }).send(hit.body);
    return;
  }
  try {
    const db = getFirestore();
    const feed = await db.collection('calendarFeeds').doc(token).get();
    if (!feed.exists || typeof feed.data().uid !== 'string') { notFound(); return; }
    const { uid } = feed.data();
    const alarmRaw = feed.data().alarm;
    const alarm = Number.isInteger(alarmRaw) && alarmRaw >= 0 && alarmRaw <= 120 ? alarmRaw : null;
    const today = new Date();
    const base = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const key = n => {
      const d = new Date(base.getTime() + n * 86400000);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    };
    const [daysSnap, profileSnap] = await Promise.all([
      db.collection('users').doc(uid).collection('days')
        .where(FieldPath.documentId(), '>=', key(-14))
        .where(FieldPath.documentId(), '<=', key(120)).get(),
      db.collection('users').doc(uid).collection('profile').doc('main').get()
    ]);
    const stored = {};
    daysSnap.forEach(d => { const blocks = d.data().blocks; stored[d.id] = Array.isArray(blocks) ? blocks : []; });
    const profile = profileSnap.exists ? profileSnap.data() : {};
    const body = buildFeed({ stored, rules: profile.recurring, cats: profile.cats, today: base, alarm, now: new Date() });
    cache.set(token, { at: Date.now(), body });
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    res.set({ 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=60' }).send(body);
  } catch (error) {
    console.error('calendarFeed', error);
    res.status(500).set('Cache-Control', 'no-store').send('Error');
  }
});
