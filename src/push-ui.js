/**
 * push-ui.js — Avisos con la app cerrada (Web Push). Se activan junto al interruptor "Avisos de actividad"
 * cuando hay sesión iniciada y la clave VAPID está configurada. La app guarda en la nube los próximos avisos
 * (título y hora de cada actividad) y una función programada los envía a su hora.
 */
import { PUSH } from './config.js';
import { reminderTitle } from './platform.js';
import { toHHMM } from './utils.js';

const debounce = (fn, ms) => {
  let timer = null;
  return () => { clearTimeout(timer); timer = setTimeout(fn, ms); };
};

export const pushAvailable = ctx => Boolean(
  PUSH.vapidKey && !ctx.native && typeof Notification !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
);

export function setupPush(ctx) {
  const { state, cloud, toast } = ctx;
  const signedIn = () => ctx.account.status === 'signedIn';
  const active = () => pushAvailable(ctx) && state.settings.getFlag('push') && Notification.permission === 'granted' && signedIn();
  ctx.pushActive = active;
  ctx.pushPossible = () => pushAvailable(ctx);

  ctx.syncPush = debounce(() => {
    if (!active()) return;
    const lead = Number(state.settings.get('lead')) || 0;
    const items = state.upcomingStarts(ctx.clock(), PUSH.horizonDays, PUSH.maxItems, lead).map(({ block, at }) => ({
      at: at.getTime(), t: reminderTitle(block, lead), b: `${toHHMM(block.s)} – ${toHHMM(block.e)}`
    }));
    cloud.pushSchedule(items);
  }, 1500);

  /** Activa los avisos con la app cerrada. Con `quiet` no muestra avisos si falla (se prueba sola al iniciar sesión). */
  ctx.enablePush = async ({ quiet = false } = {}) => {
    if (!pushAvailable(ctx) || !signedIn()) return false;
    try {
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission !== 'granted') {
        if (!quiet) toast.show('Permiso de notificaciones denegado.', { duration: 5000 });
        return false;
      }
      const registration = await navigator.serviceWorker.ready;
      await cloud.enablePush(PUSH.vapidKey, registration);
      state.settings.setFlag('push', true);
      ctx.syncPush();
      return true;
    } catch (_) {
      if (!quiet) toast.show('No se pudo activar. Comprueba la conexión e inténtalo de nuevo.', { duration: 6000 });
      return false;
    }
  };

  ctx.disablePush = async () => {
    if (!state.settings.getFlag('push')) return;
    state.settings.setFlag('push', false);
    try { await cloud.disablePush(); } catch (_) { /* sin conexión: ya no se programarán más */ }
  };

  /** Al iniciar sesión con los avisos ya activados en este dispositivo, se completan con los de la app cerrada. */
  ctx.autoEnablePush = () => {
    if (!pushAvailable(ctx) || !signedIn() || state.settings.getFlag('push')) return;
    if (!ctx.notifier.status().enabled) return;
    ctx.enablePush({ quiet: true }).then(ok => { if (ok) ctx.refreshSettings(); });
  };
}
