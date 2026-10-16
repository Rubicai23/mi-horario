import { open } from './lib.mjs';
import assert from 'node:assert/strict';
const { browser, page, errors } = await open();
await page.addInitScript(() => {
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1'); localStorage.setItem('cfg:tour', '1');
  localStorage.setItem('day:2026-10-07', JSON.stringify([{ id: 'b1aaaaaaaa', s: 540, e: 600, t: 'Estudiar', c: 'estudio', n: '', d: false }]));
});
await page.goto('http://localhost:5199/'); await page.waitForSelector('#app:not([hidden])'); await page.clock.runFor(1500);
const settle = () => page.clock.runFor(400);
// sin hora de fin
await page.click('#addBtn'); await settle();
await page.fill('#fT', 'Gimnasio'); await page.fill('#fS', '11:30');
await page.click('#fOpen'); await settle();
assert.equal(await page.locator('#fE').isVisible(), false);
await page.click('#saveBtn'); await settle();
assert.match(await page.locator('.item', { hasText: 'Gimnasio' }).textContent(), /sin hora de fin/); console.log('ok creada sin fin');
await page.screenshot({ path: 'open-end.png' });
await page.locator('.item', { hasText: 'Gimnasio' }).locator('.ck').click(); await settle();
assert.match(await page.locator('#toastMsg').textContent(), /Terminada a las 12:00/);
assert.match(await page.locator('.item', { hasText: 'Gimnasio' }).textContent(), /hasta las 12:00/); console.log('ok al terminar se cierra a las 12:00');
// editar la hecha: el interruptor está apagado
await page.locator('.item', { hasText: 'Gimnasio' }).locator('.tx').click(); await settle();
assert.equal(await page.locator('#fE').isVisible(), true); console.log('edit open?', await page.locator('#sheetEdit.open').count()); await page.click('#cancelBtn'); await page.clock.runFor(1500); console.log('after cancel', await page.locator('#sheetEdit.open').count(), await page.locator('.sheet.open').evaluateAll(a=>a.map(e=>e.id)));
// pomodoro
await page.waitForTimeout(600); await page.click('#openMenu'); await settle(); await page.waitForTimeout(600);
console.log('open sheets', await page.locator('.sheet.open').evaluateAll(a=>a.map(e=>e.id)), await page.locator('#menuPomo').count(), await page.locator('#menuPomo').evaluate(e=>[getComputedStyle(e).display, e.hidden, e.getBoundingClientRect().height])); console.log(await page.locator('#menuPomo').evaluate(e=>{const o=[];for(let n=e;n;n=n.parentElement){const c=getComputedStyle(n);o.push(n.tagName+'#'+n.id+' v='+c.visibility+' d='+c.display+' op='+c.opacity)}return o.join(' | ')})); await page.screenshot({ path: 'dbg-menu.png' }); await page.click('#menuPomo', { timeout: 3000 }); await settle();
assert.match(await page.locator('#pomoTime').textContent(), /25:00/);
await page.click('#pomoToggle'); await page.clock.runFor(3000);
assert.match(await page.locator('#pomoTime').textContent(), /24:5\d/); console.log('ok pomodoro corre:', await page.locator('#pomoTime').textContent());
await page.click('#closePomo'); await settle();
assert.equal(await page.locator('#pomoPill').isVisible(), true); console.log('ok pastilla del pomodoro');
console.log('errores:', errors.length ? errors : 'ninguno');
await browser.close();
