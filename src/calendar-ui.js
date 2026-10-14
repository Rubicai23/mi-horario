/**
 * calendar-ui.js — Calendario conectado: enlace secreto que Apple Calendar o Google Calendar leen solos.
 * El enlace lo sirve la función de la nube `calendarFeed` (solo lectura). Es opcional y empieza desactivado.
 */
import { CALENDAR_FEED, FIREBASE_CONFIG, LEAD_OPTIONS } from './config.js';
import { alarmOptions, feedUrl, googleUrl, webcalUrl } from './calendar-link.js';
import { t } from './i18n.js';

const $ = id => document.getElementById(id);

export function setupCalendar(ctx) {
  const { cloud, state, toast } = ctx;
  let feed = null;          // { token, alarm } | null
  let url = '';

  const showError = message => { $('calErr').textContent = message || ''; $('calErr').hidden = !message; };
  const alarmLabel = minutes => (minutes < 0 ? t('Sin aviso') : minutes === 0 ? t('Al empezar') : t('{0} min antes', minutes));

  const paint = () => {
    const signedIn = ctx.account.status === 'signedIn';
    $('calOff').hidden = !signedIn || Boolean(feed);
    $('calOn').hidden = !feed;
    $('calStatus').textContent = signedIn ? '' : t('Inicia sesión para conectar tu calendario.');
    if (!feed) return;
    url = feedUrl({ projectId: FIREBASE_CONFIG.projectId, ...CALENDAR_FEED }, feed.token);
    $('calApple').setAttribute('href', webcalUrl(url));
    $('calGoogle').setAttribute('href', googleUrl(url));
    $('calAlarm').innerHTML = alarmOptions(LEAD_OPTIONS).map(m => `<option value="${m}">${alarmLabel(m)}</option>`).join('');
    $('calAlarm').value = String(feed.alarm);
  };

  const load = async () => {
    showError('');
    feed = null;
    paint();
    if (ctx.account.status !== 'signedIn') return;
    $('calStatus').textContent = t('Cargando…');
    try { feed = await cloud.getFeed(); } catch (_) { showError(t('No se pudo leer tu enlace. Comprueba la conexión y que las reglas de Firestore estén publicadas.')); }
    paint();
    if (ctx.account.status === 'signedIn') $('calStatus').textContent = '';
  };

  $('menuCalendar').addEventListener('click', () => { ctx.calendarSheet.open(); load(); });
  $('closeCalendar').addEventListener('click', ctx.calendarSheet.close);

  const create = async () => {
    showError('');
    const lead = Number(state.settings.get('lead'));
    const alarm = LEAD_OPTIONS.includes(lead) ? lead : 10;
    try {
      const token = await cloud.createFeed(alarm);
      feed = { token, alarm };
      paint();
      cloud.track('calendar_feed_created');
    } catch (_) { showError(t('No se pudo crear el enlace. Comprueba la conexión y que las reglas de Firestore estén publicadas.')); }
  };
  $('calCreate').addEventListener('click', create);
  $('calRegen').addEventListener('click', async () => {
    if (!feed) return;
    await create();
    if (feed) toast.show(t('Enlace nuevo creado. El anterior ya no funciona: vuelve a añadirlo en tu calendario.'), { duration: 7000 });
  });
  $('calDisable').addEventListener('click', async () => {
    if (!(await cloud.deleteFeed())) { showError(t('No se pudo desactivar. Inténtalo de nuevo.')); return; }
    feed = null;
    paint();
    toast.show(t('Calendario desconectado. El enlace ya no funciona.'));
  });
  $('calAlarm').addEventListener('change', async e => {
    if (!feed) return;
    const alarm = Number(e.target.value);
    if (await cloud.setFeedAlarm(feed.token, alarm)) feed.alarm = alarm;
    else { showError(t('No se pudo guardar el aviso.')); paint(); }
  });
  $('calCopy').addEventListener('click', async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(url);
      else {
        const input = document.createElement('input');
        input.value = url; document.body.appendChild(input); input.select(); document.execCommand('copy'); input.remove();
      }
      toast.show(t('Enlace copiado. Pégalo en tu calendario.'));
    } catch (_) { showError(t('No se pudo copiar. Mantén pulsado el botón del iPhone o Google para añadirlo.')); }
  });
}
