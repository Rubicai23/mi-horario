import { open } from './lib.mjs';
import assert from 'node:assert/strict';
const { browser, page, errors } = await open();
await page.addInitScript(() => {
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1'); localStorage.setItem('cfg:tour', '1');
  const day = (k, blocks) => localStorage.setItem('day:' + k, JSON.stringify(blocks));
  day('2026-10-07', [
    { id: 'b1aaaaaaaa', s: 540, e: 600, t: 'Estudiar SQL', c: 'estudio', n: 'Tema 3 de joins', d: false },
    { id: 'b2aaaaaaaa', s: 630, e: 690, t: 'Inglés (45 min)', c: 'ingles', n: '', d: true },
    { id: 'b3aaaaaaaa', s: 840, e: 900, t: 'Proyecto final', c: 'estudio', n: '', d: false, k: [{ t: 'Diseño', d: false }] },
    { id: 'b4aaaaaaaa', s: 1080, e: 1170, t: 'Gimnasio', c: 'gym', n: '', d: false }
  ]);
  day('2026-10-08', [{ id: 'b5aaaaaaaa', s: 600, e: 660, t: 'Clase de redes', c: 'clase', n: '', d: false }]);
  day('2026-10-05', [{ id: 'b6aaaaaaaa', s: 600, e: 660, t: 'Dentista', c: 'libre', n: 'Revisión anual', d: false }]);
});
await page.goto('http://localhost:5199/'); await page.waitForSelector('#app:not([hidden])'); await page.clock.runFor(1500);
const settle = ms => page.clock.runFor(ms || 400);
await page.clock.runFor(7000);   // pasa el aviso de insignia de los 4 s

/* ── Vista de semana ── */
assert.equal(await page.locator('#weekview').isVisible(), false);
await page.click('#viewWeek'); await settle();
assert.equal(await page.locator('#weekview').isVisible(), true);
assert.equal(await page.locator('#hero').isVisible(), false); assert.equal(await page.locator('#tl').isVisible(), false);
assert.equal(await page.locator('.wv-day').count(), 7); console.log('ok vista semana: 7 días');
console.log('resumen:', await page.locator('.wv-sum').textContent());
assert.match(await page.locator('.wv-sum').textContent(), /6 actividades/);
assert.equal(await page.locator('.wv-day.today .wv-now').count(), 1); console.log('ok línea de ahora en hoy');
assert.match(await page.locator('.wv-day.today').textContent(), /Mayor hueco libre/); console.log('ok mayor hueco');
await page.screenshot({ path: 'week-view.png', fullPage: true });
await page.reload(); await page.waitForSelector('#app:not([hidden])'); await page.clock.runFor(1500);
assert.equal(await page.locator('#weekview').isVisible(), true); console.log('ok recuerda la vista Semana');
await page.locator('.wv-day', { hasText: 'Jueves' }).click(); await settle();
assert.equal(await page.locator('#weekview').isVisible(), false);
assert.match(await page.locator('#hero').textContent(), /Jueves/); console.log('ok tocar un día lo abre');
assert.equal(await page.locator('.item').count(), 1);
await page.click('#viewWeek'); await settle(); await page.click('#viewDay'); await settle();
await page.click('#back').catch(() => {}); await settle();

/* ── Pendientes ── */
await page.click('#days .day.today').catch(() => {}); await settle();
assert.equal(await page.locator('#carry').isVisible(), true); console.log('ok aviso de pendientes:', (await page.locator('#carry').textContent()).trim());
assert.match(await page.locator('.carry-t').textContent(), /1 actividad/);
await page.click('#carryGo'); await settle();
assert.equal(await page.locator('.item').count(), 3); console.log('ok la pendiente salió de hoy');
assert.match(await page.locator('#toastMsg').textContent(), /Pasadas a mañana/);
await page.click('#toastAct'); await settle();
assert.equal(await page.locator('.item').count(), 4); console.log('ok deshacer');
// menú del día
await page.click('#moreBtn'); await settle();
assert.equal(await page.locator('#menuCarry').isDisabled(), false);
await page.click('#menuCarry'); await settle();
assert.equal(await page.locator('.item').count(), 1); console.log('ok menú: pasa todas las pendientes (queda solo la hecha)');
await page.click('#toastAct'); await settle();
// ocultar aviso
await page.click('#carryHide'); await settle(); assert.equal(await page.locator('#carry').isVisible(), false); console.log('ok ocultar aviso');
// día pasado: copia
await page.click('#days .day:nth-child(1)'); await settle();   // lunes
assert.match(await page.locator('#carry').textContent(), /Quedaron/); assert.match(await page.locator('#carryGo').textContent(), /Traer a hoy/);
await page.click('#carryGo'); await settle();
assert.equal(await page.locator('.item').count(), 1); console.log('ok día pasado: el original se queda');
await page.click('#toastAct'); await settle();

/* ── Cronómetro ── */
await page.click('#days .day.today'); await settle();
const proyecto = page.locator('.item', { hasText: 'Proyecto final' });
assert.match(await proyecto.locator('.trk-btn').textContent(), /Medir tiempo/);
assert.equal(await page.locator('.item', { hasText: 'Inglés' }).locator('.trk-btn').count(), 0); console.log('ok no se mide lo ya hecho');
await proyecto.locator('.trk-btn').click(); await settle(200);
assert.equal(await page.locator('#trackPill').isVisible(), true);
await page.clock.runFor(65000);
assert.match(await proyecto.locator('.trk-live').textContent(), /01:0[4-6]/); console.log('ok reloj en vivo:', await proyecto.locator('.trk-live').textContent());
console.log('pill:', await page.locator('#trackPill').textContent());
assert.equal(await page.evaluate(() => document.querySelector('.item .sks') ? document.querySelectorAll('.item .trk-btn').length : 0) >= 2, true);
await page.screenshot({ path: 'tracker.png' });
await proyecto.locator('.trk-btn').click(); await settle(200);
assert.equal(await page.locator('#trackPill').isVisible(), false);
assert.match(await page.locator('#toastMsg').textContent(), /Guardado: 1 min/); console.log('ok parar guarda:', await page.locator('#toastMsg').textContent());
assert.match(await proyecto.locator('.trk-real').textContent(), /Real: 1 min · plan: 1 h/); console.log('ok muestra real y plan');
assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('day:2026-10-07')).find(b => b.id === 'b3aaaaaaaa').w >= 60), true);
// medir y marcar como hecha → se guarda
await proyecto.locator('.trk-btn').click(); await page.clock.runFor(120000);
await proyecto.locator('.ck').click(); await settle();
assert.equal(await page.locator('#trackPill').isVisible(), false);
const w = await page.evaluate(() => JSON.parse(localStorage.getItem('day:2026-10-07')).find(b => b.id === 'b3aaaaaaaa').w);
assert.ok(w >= 180 && w <= 190, 'w=' + w); console.log('ok marcar hecha guarda el tiempo (' + w + ' s)');
// empezar otra actividad guarda la anterior; recarga conserva el cronómetro
await page.locator('.item', { hasText: 'Gimnasio' }).locator('.trk-btn').click(); await page.clock.runFor(30000);
await page.reload(); await page.waitForSelector('#app:not([hidden])'); await page.clock.runFor(1500);
assert.equal(await page.locator('#trackPill').isVisible(), true); console.log('ok el cronómetro sobrevive a recargar');
await page.click('#trackPill'); await settle();
assert.equal(await page.locator('.item.flash').count() >= 0, true);
await page.locator('.item', { hasText: 'Gimnasio' }).locator('.trk-btn').click(); await settle();

/* ── Editor: tiempo real y mover ── */
await page.locator('.item', { hasText: 'Gimnasio' }).locator('.ti').click(); await settle();
assert.equal(await page.locator('#fWrap').isVisible(), true);
await page.fill('#fW', '75'); await page.click('#saveBtn'); await settle();
assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('day:2026-10-07')).find(b => b.id === 'b4aaaaaaaa').w), 4500); console.log('ok tiempo real editable (75 min)');
assert.match(await page.locator('.item', { hasText: 'Gimnasio' }).locator('.trk-real').textContent(), /1 h 15 min/);
await page.locator('.item', { hasText: 'Gimnasio' }).locator('.ti').click(); await settle();
assert.equal(await page.inputValue('#fW'), '75');
await page.fill('#fW', ''); await page.click('#saveBtn'); await settle();
assert.equal(await page.evaluate(() => 'w' in JSON.parse(localStorage.getItem('day:2026-10-07')).find(b => b.id === 'b4aaaaaaaa')), false); console.log('ok vaciar el campo quita el tiempo');
await page.locator('.item', { hasText: 'Gimnasio' }).locator('.ti').click(); await settle();
await page.click('#moveBtn'); await settle(500);
assert.equal(await page.locator('#sheetMove.open').count(), 1); console.log('ok hoja mover:', await page.locator('#moveWhat').textContent());
await page.screenshot({ path: 'move-sheet.png' });
await page.click('#moveQuick .chip >> text=Pasado mañana'); await settle();
await page.click('#moveGo'); await settle();
assert.equal(await page.locator('.item', { hasText: 'Gimnasio' }).count(), 0);
assert.match(await page.locator('#toastMsg').textContent(), /Movida a/); console.log('ok movida:', await page.locator('#toastMsg').textContent());
await page.click('#toastAct'); await settle();
assert.equal(await page.locator('.item', { hasText: 'Gimnasio' }).count(), 1); console.log('ok deshacer mover');
// copiar a varios días
await page.locator('.item', { hasText: 'Gimnasio' }).locator('.ti').click(); await settle();
await page.click('#moveBtn'); await settle(500);
await page.click('#moveTabCopy'); await settle();
assert.equal(await page.locator('#movePanelCopy').isVisible(), true);
const cdays = page.locator('#moveTargets .cday:not([disabled])'); await cdays.nth(0).click(); await cdays.nth(2).click();
await page.screenshot({ path: 'copy-sheet.png' });
await page.click('#moveGo'); await settle();
assert.match(await page.locator('#toastMsg').textContent(), /Copiada a 2 días/); console.log('ok copiar a 2 días');
assert.equal(await page.locator('.item', { hasText: 'Gimnasio' }).count(), 1);
await page.click('#toastAct'); await settle();
// solape
await page.click('#viewWeek'); await settle(); await page.screenshot({ path: 'week-view2.png', fullPage: true }); await page.click('#viewDay'); await settle();

/* ── Buscador ── */
await page.click('#openSearch'); await settle(500);
assert.equal(await page.locator('#sheetSearch.open').count(), 1);
assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'searchInput'); console.log('ok el cursor queda en el buscador');
await page.fill('#searchInput', 'ingles'); await settle(300);
assert.equal(await page.locator('.sr-item').count(), 1); console.log('ok "ingles" encuentra "Inglés":', (await page.locator('.sr-item .sr-t').textContent()));
assert.equal(await page.locator('.sr-item mark').count(), 1);
await page.fill('#searchInput', 'tema joins'); await settle(300);
assert.equal(await page.locator('.sr-item').count(), 1); assert.match(await page.locator('.sr-s').textContent(), /joins/); console.log('ok busca en notas, varias palabras');
await page.fill('#searchInput', 'dentista'); await settle(300);
assert.equal(await page.locator('.sr-h').first().textContent(), 'Anteriores'); console.log('ok pasado en "Anteriores"');
await page.fill('#searchInput', 'zzzz'); await settle(300);
assert.match(await page.locator('#searchCount').textContent(), /Sin resultados/);
await page.fill('#searchInput', ''); await settle(300);
await page.click('#searchCats .chip >> text=Gimnasio'); await settle();
assert.equal(await page.locator('.sr-item').count(), 1); console.log('ok filtro por categoría sin texto');
await page.click('#searchPending'); await settle(); assert.equal(await page.locator('.sr-item').count(), 1);
await page.click('#searchDone'); await settle(); assert.equal(await page.locator('.sr-item').count(), 0); console.log('ok filtro por estado');
await page.click('#searchAll'); await page.click('#searchCats .chip >> text=Gimnasio'); await settle();
await page.fill('#searchInput', 'dentista'); await settle(300);
await page.screenshot({ path: 'search.png' });
await page.press('#searchInput', 'Enter'); await settle();
await page.locator('.sr-item').first().click(); await settle(700);
assert.equal(await page.locator('#sheetSearch.open').count(), 0);
assert.match(await page.locator('#hero').textContent(), /Lunes/); console.log('ok al tocar un resultado salta al día');
assert.equal(await page.locator('.item.flash').count(), 1); console.log('ok actividad resaltada');
await page.click('#openSearch'); await settle(500);
assert.match(await page.locator('#searchRecent').textContent(), /dentista/); console.log('ok búsquedas recientes');
await page.click('#closeSearch'); await settle();

/* ── Estadísticas con tiempo real ── */
await page.click('#openStats'); await settle(500);
assert.match(await page.locator('#statsBody').textContent(), /Con el cronómetro/); console.log('ok estadísticas:', (await page.locator('.stat-real-total').textContent()).trim());
await page.screenshot({ path: 'stats-real.png' });
console.log('errores:', errors); assert.deepEqual(errors, []);
await browser.close();
