'use strict';
/**
 * ics.js — Genera el texto de un calendario .ics (iCalendar, RFC 5545). Función pura, sin Firebase.
 * Las horas son "flotantes" (sin zona): cada calendario las interpreta en la zona horaria del dispositivo.
 */
const CRLF = '\r\n';
const pad = n => String(n).padStart(2, '0');

/** Escapa un texto de valor (RFC 5545 §3.3.11). */
const escapeText = text => String(text)
  .replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Dobla las líneas a 75 octetos UTF-8 como máximo, sin partir caracteres. */
function foldLine(line) {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;
  const parts = [];
  let current = '';
  let size = 0;
  let limit = 75;
  for (const ch of line) {
    const bytes = Buffer.byteLength(ch, 'utf8');
    if (size + bytes > limit) { parts.push(current); current = ''; size = 0; limit = 74; }
    current += ch;
    size += bytes;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

const stamp = date => `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
const local = (key, minutes) => `${key.replace(/-/g, '')}T${pad(Math.floor(minutes / 60))}${pad(minutes % 60)}00`;

/**
 * @param {object} p
 * @param {Array<{key:string, blocks:Array}>} p.days  días (AAAA-MM-DD) con sus actividades
 * @param {Date} p.now                                para DTSTAMP
 * @param {number|null} [p.alarm]                     minutos de antelación del aviso (null = sin aviso)
 * @param {(id:string)=>string} [p.categoryName]
 * @param {string} [p.calendarName]
 * @param {string|null} [p.refresh]                   intervalo de actualización sugerido, p. ej. "PT15M"
 */
function buildIcs({ days, now, alarm = null, categoryName = k => k, calendarName = 'Mi horario', refresh = null }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mi horario//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`
  ];
  if (refresh) lines.push(`REFRESH-INTERVAL;VALUE=DURATION:${refresh}`, `X-PUBLISHED-TTL:${refresh}`);
  days.forEach(({ key, blocks }) => {
    blocks.forEach(block => {
      const details = [];
      if (block.n) details.push(block.n);
      if (block.k && block.k.length) details.push(block.k.map(item => `${item.d ? '[x]' : '[ ]'} ${item.t}`).join('\n'));
      const category = categoryName(block.c);
      lines.push(
        'BEGIN:VEVENT',
        `UID:${block.id}-${key.replace(/-/g, '')}@mi-horario`,
        `DTSTAMP:${stamp(now)}`,
        `DTSTART:${local(key, block.s)}`,
        `DTEND:${local(key, block.e)}`,
        `SUMMARY:${escapeText(block.t)}`
      );
      if (details.length) lines.push(`DESCRIPTION:${escapeText(details.join('\n'))}`);
      if (category) lines.push(`CATEGORIES:${escapeText(category)}`);
      if (alarm !== null && alarm >= 0) {
        lines.push(
          'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(block.t)}`,
          alarm === 0 ? 'TRIGGER:PT0S' : `TRIGGER:-PT${alarm}M`, 'END:VALARM'
        );
      }
      lines.push('END:VEVENT');
    });
  });
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join(CRLF) + CRLF;
}

module.exports = { buildIcs, escapeText, foldLine };
