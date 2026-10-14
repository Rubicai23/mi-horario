import test from 'node:test';
import assert from 'node:assert/strict';
import { alarmOptions, feedUrl, googleUrl, webcalUrl } from '../src/calendar-link.js';

const cfg = { projectId: 'mi-horario-5e8b1', region: 'europe-west1', name: 'calendarFeed' };
const token = 'Ab_-1234567890123456789012345678';

test('direcciones del calendario', () => {
  const url = feedUrl(cfg, token);
  assert.equal(url, `https://europe-west1-mi-horario-5e8b1.cloudfunctions.net/calendarFeed?t=${token}`);
  assert.equal(webcalUrl(url), `webcal://europe-west1-mi-horario-5e8b1.cloudfunctions.net/calendarFeed?t=${token}`);
  const g = googleUrl(url);
  assert.match(g, /^https:\/\/calendar\.google\.com\/calendar\/r\?cid=webcal%3A%2F%2F/);
  assert.equal(decodeURIComponent(g.split('cid=')[1]), webcalUrl(url));
});

test('opciones de aviso: -1 es "sin aviso"', () => {
  assert.deepEqual(alarmOptions([0, 5, 10]), [-1, 0, 5, 10]);
});
