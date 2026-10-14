/**
 * calendar-link.js — Direcciones del calendario suscrito. Funciones puras (sin DOM ni Firebase).
 */

/** Dirección https del calendario (la que lee la función de la nube). */
export const feedUrl = ({ projectId, region, name }, token) => `https://${region}-${projectId}.cloudfunctions.net/${name}?t=${encodeURIComponent(token)}`;

/** Misma dirección con webcal:// (en iPhone y Mac abre directamente "Suscribirse al calendario"). */
export const webcalUrl = url => url.replace(/^https?:\/\//, 'webcal://');

/** Enlace que abre Google Calendar con la suscripción lista para confirmar. */
export const googleUrl = url => `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl(url))}`;

/** Opciones del aviso del calendario: -1 = sin aviso. */
export const alarmOptions = leads => [-1, ...leads];
