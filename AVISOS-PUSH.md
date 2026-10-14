# Nube de "Mi horario": avisos con la app cerrada y calendario conectado

**Importante:** esta parte no se ha podido probar de extremo a extremo (necesita tu proyecto real de Firebase).
La lógica y las pantallas están probadas con Firebase simulado, pero puede que haya que ajustar algo al desplegar.

Incluye dos funciones en la nube (carpeta `functions`):
- `sendDueReminders`: envía los avisos con la app cerrada (iPhone con iOS 16.4+ y la app en la pantalla de inicio).
- `calendarFeed`: sirve un calendario por enlace secreto para suscribirlo en el Calendario del iPhone o en Google Calendar.

## 1. Plan Blaze
Ya activado. Pon una **alerta de presupuesto** de 1 € en Google Cloud → Facturación → Presupuestos y alertas
(solo avisa, no corta el gasto). Mira Facturación los primeros días: debe poner 0,00 €.

## 2. Clave web push (solo para los avisos con la app cerrada)
Firebase → ⚙ Configuración del proyecto → **Cloud Messaging** → *Certificados push web* → **Generar par de claves**.
Pégala en `src/config.js`:
```js
export const PUSH = Object.freeze({ vapidKey: 'AQUÍ_TU_CLAVE', horizonDays: 3, maxItems: 40 });
```

## 3. Publicar reglas y funciones (en tu PC, en la carpeta del proyecto)
```
npm install -g firebase-tools
firebase login
firebase use mi-horario-5e8b1
cd functions
npm install
cd ..
firebase deploy --only firestore:rules,functions
```
- Si pregunta si activar APIs (Cloud Build, Cloud Scheduler, Artifact Registry, Cloud Run), di **sí**.
- Si pregunta por la política de limpieza de imágenes, escribe **1** (borrar las antiguas tras 1 día).
- Debe acabar con **Deploy complete!** (hay dos funciones: `sendDueReminders` y `calendarFeed`).

## 4. Subir la app a GitHub como siempre
(sin la carpeta `functions/node_modules`).

## 5. Activar en el iPhone
- **Avisos con la app cerrada:** Ajustes → *Avisos con la app cerrada*.
- **Calendario conectado:** ☰ → *Conectar con mi calendario* → *Crear mi enlace* → *Añadir al Calendario del iPhone*
  (o *Añadir a Google Calendar*). Se añade una sola vez y después se actualiza solo.

## Cómo funciona el calendario conectado
El enlace es secreto (32 caracteres al azar). La función lee tus actividades y las publica como calendario de solo lectura.
Apple Calendar lo actualiza cada pocos minutos; Google Calendar cada 12-24 horas (no se puede acelerar).
Con *Crear un enlace nuevo* el anterior deja de funcionar; con *Desactivar* se borra.
Los avisos del calendario se eligen en la pantalla del enlace. Google Calendar ignora los avisos del archivo:
en Google hay que ponerlos en los ajustes de ese calendario.

## Medidas de seguridad de gasto
- Las funciones limitan `maxInstances` (1 para avisos, 3 para el calendario).
- Alerta de presupuesto de 1 € (50 %, 90 %, 100 %).
- Política de limpieza de imágenes de 1 día.

## Si algo falla
- No aparece el ajuste de avisos: falta la clave (paso 2), o no has iniciado sesión.
- "No se pudo leer/crear tu enlace": publica las reglas (paso 3) y comprueba la conexión.
- El enlace da error 404: las funciones no están desplegadas, o el enlace se regeneró.
- Mira Firebase → Functions → Registros y envía el texto de los errores.
