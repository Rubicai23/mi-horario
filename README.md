# Mi horario v2

PWA en JavaScript puro (módulos ES) + Firebase, lista para empaquetarse con Capacitor.

## Estructura

```
mi-horario-v2/
├── index.html              Marcado limpio, sin CSS ni JS en línea
├── firestore.rules         Reglas de seguridad de Firestore
├── firebase.json
├── capacitor.config.json
├── vite.config.js
├── package.json
├── public/                 Se copia tal cual a dist/
│   ├── manifest.json
│   ├── sw.js               Service worker (el build sustituye __BUILD_ID__)
│   └── icons/
├── scripts/stamp-sw.js     Plugin de Vite: versiona la caché del SW
├── src/
│   ├── app.js              Raíz de composición: cablea todo
│   ├── state-manager.js    Estado, reglas de negocio, rachas, copiar día y plantillas (sin DOM ni Firebase)
│   ├── firebase-service.js Auth, Firestore y Analytics
│   ├── ui-components.js    Vistas (HTML), toast, hojas, deslizar y arrastrar
│   ├── platform.js         Web vs nativo: notificaciones, archivos, instalación
│   ├── config.js           Constantes, plantillas y configuración de Firebase
│   ├── utils.js            Funciones puras
│   ├── pomodoro.js         Temporizador Pomodoro (puro) · pomodoro-ui.js: menú ☰ y pantalla
│   ├── tour.js             Tutorial de 3 pantallas
│   ├── summary.js          Texto del resumen semanal para compartir
│   ├── i18n.js · lang-en.js  Idioma: traductor y diccionario español → inglés
│   └── style.css
├── tests/                  state-manager, templates-copy, recurring-subtasks, streak-badges, categories-month, pomodoro, summary, i18n
├── e2e/                    Pruebas en navegador (Playwright) con servidor y Firebase simulados
└── .github/workflows/deploy.yml
```

## Comandos

```
npm install
npm run dev        # desarrollo
npm test           # tests del núcleo (node --test)
npm run build      # genera dist/
npm run preview
```

## Firebase (consola)

1. Authentication → Sign-in method → activar **Correo/contraseña** (pulsa "Comenzar" si aparece).
2. Authentication → Settings → Dominios autorizados: `rubicai23.github.io` y `localhost`.
3. Firestore → Reglas: pega `firestore.rules` y publica (o `firebase deploy --only firestore:rules`).
4. Prueba las reglas en el Rules Playground:
   - Propietario lee/escribe `users/UID/days/2026-10-07` → permitido.
   - Otro uid sobre esa ruta → denegado.
   - Sin sesión → denegado.
   - Escritura con un campo extra, o `updatedAt` que no sea `serverTimestamp()` → denegado.
   - Id de documento `hoy` → denegado.
   - `users/UID/profile/main` con `templates` (lista) y `updatedAt` = `request.time` → permitido solo al propietario.
   - Igual, añadiendo `recurring` (lista de ≤ 40) → permitido; con `recurring` que no sea una lista → denegado.
   - Igual, añadiendo `rest` (lista ≤ 400), `streak` (mapa `{goal, days}`) `badges` (mapa ≤ 40) y `cats` (mapa ≤ 6) → permitido; con `streak` que no sea un mapa → denegado.
   - `users/UID/profile/otro` o con un campo extra → denegado.

Modelo de datos: `users/{uid}/days/{YYYY-MM-DD}` (actividades de cada día) y `users/{uid}/profile/main` (plantillas propias y repeticiones semanales: `{ templates, recurring, rest, streak, badges, cats, updatedAt }`). **Si actualizas la app y no republicas `firestore.rules`, las plantillas y repeticiones funcionan en el dispositivo pero no se sincronizan.**

Racha: la meta (50–100 %) y los días de la semana que cuentan van en `streak`; los días de descanso manuales (solo hoy o futuros) en `rest`; las insignias conseguidas, con su fecha, en `badges` (solo se ganan: al sincronizar se unen, nunca se pierden). Los días de descanso y los días que no cuentan no suman ni rompen la racha ni cuentan como hueco.

Categorías: `cats` guarda, por categoría, un nombre propio (`l`, máx. 20 caracteres) y un color elegido de una paleta fija (`c`, el nombre del color, nunca un valor libre). El tema (claro/oscuro/automático) y el color de acento son de cada dispositivo y no se sincronizan.

Eliminar cuenta (Ajustes → Cuenta): pide la contraseña, borra de Firestore todos los días y el perfil y, por último, el usuario de Authentication. Si falla a medias se puede repetir.

Textos legales: `public/privacidad.html` (política de privacidad y términos). **Antes de publicar en una tienda, añade tu correo de contacto** en el comentario que hay al principio del archivo.

Repeticiones: los días sin registro se calculan al vuelo a partir de las reglas; un día guardado (aunque esté vacío) nunca se vuelve a rellenar. «Dejar de repetir» y «cambiar la serie» solo afectan de hoy en adelante.

Limitación: las reglas no tienen bucles, así que no pueden validar el contenido de cada bloque, solo la forma del documento y `blocks.size() <= 60`. Cada cliente sanea los bloques; el aislamiento entre usuarios sí es total.

## GitHub Pages

Settings → Pages → Source: **GitHub Actions**. Cada push a `main` ejecuta tests, build y despliegue.

## Capacitor y APK de Android

**Sin instalar nada (recomendado):** en GitHub, pestaña **Actions → «Crear APK de Android» → Run workflow**. Al terminar (unos 10 min) el APK está en el resumen de la ejecución, en «Artifacts → mi-horario-apk». El flujo (`.github/workflows/android.yml`) corre los tests, compila la web, genera el proyecto Android con `npx cap add android`, añade los permisos (`scripts/android-prepare.mjs`), genera los iconos desde `assets/` y compila un APK de depuración, que se puede instalar directamente en el móvil.

**En tu ordenador (opcional, con Android Studio):**

```
npm run build
npx cap add android
npm run android:prepare
npx capacitor-assets generate --android --iconBackgroundColor '#3F6B5A' --iconBackgroundColorDark '#3F6B5A'
npm run cap:android      # build + sync + abrir Android Studio
```

- Permisos: avisos (Android 13+), alarmas exactas (`USE_EXACT_ALARM`, y `SCHEDULE_EXACT_ALARM` hasta Android 12) y reinicio del móvil, para que los avisos suenen con la app cerrada.
- Botón «atrás» de Android: cierra el tutorial o la hoja abierta y, si no hay nada, minimiza la app.
- En la app nativa, la política de privacidad se abre desde la web publicada (`WEB_HOME` en `src/app.js`).
- El APK de depuración sirve para uso personal. Para Google Play haría falta un APK/AAB firmado (release) y una cuenta de desarrollador.
- iOS limita a 64 notificaciones locales pendientes; la app programa como máximo 60 de los próximos 7 días. Analytics no se usa en el contenedor nativo.

## Tanda 5: menú, Pomodoro, tutorial, resumen e inglés

- **Menú ☰** (arriba): Pomodoro, Insignias y Ver tutorial. Con el Pomodoro en marcha aparece un contador en la barra superior.
- **Pomodoro**: usa la hora de fin (`endAt`), así que no se descuadra si el móvil congela la pestaña. Al acabar una fase avisa (mensaje, vibración, pitido y, si los avisos están activados, notificación; en la app nativa se programa una notificación con id fijo `POMO_ID` que la reprogramación de actividades no toca). Guarda su estado en `cfg:pomo` (solo este dispositivo).
- **Tutorial**: sale una vez a quien estrena la app (sin días guardados). Quien ya tenía datos no lo ve, pero puede abrirlo desde el menú.
- **Resumen semanal**: desactivado de fábrica (`cfg:share`). Si se activa en Ajustes, Estadísticas muestra «Compartir resumen»: texto con totales por categoría y racha, nunca títulos ni notas.
- **Inglés**: el idioma (`cfg:lang`) se lee al cargar y cambiarlo recarga la app. Los textos en español son la clave del diccionario `lang-en.js`; una clave con huecos `{0}` sirve también de patrón para traducir textos ya montados. El traductor del DOM solo se activa en inglés y respeta `translate="no"` (contenido del usuario). Hay una política de privacidad en inglés (`privacy-en.html`). El horario DAM de ejemplo solo existe en español. `tests/i18n.test.js` comprueba que todo texto fijo y todo `t('…')` tiene traducción.
- **Reglas de Firestore**: sin cambios en esta tanda.
- **Pruebas en navegador** (`e2e/`): `node e2e/server.mjs` con `APP_ROOT` apuntando al proyecto y `node e2e/t5.mjs`; necesitan Playwright instalado.


## Tanda 6

- **Categorías propias** (Ajustes → Categorías, o *Nueva categoría* al crear una actividad): se crean, renombran, colorean y borran; las 6 iniciales también se pueden borrar. Se sincronizan en el perfil (`cats`; hay que republicar `firestore.rules`).
- **Subtareas visibles** bajo cada actividad en la lista; se marcan sin abrirla.
- **Calendario conectado** (☰ → Conectar con mi calendario): enlace secreto servido por la función `calendarFeed`. Sustituye al antiguo "Exportar .ics".
- **Resumen semanal automático** (Ajustes → Resumen cada semana): opcional, apagado por defecto.
- **Avisos con la app cerrada**: ver `AVISOS-PUSH.md` (necesita plan Blaze y desplegar `functions/`).
- Se eliminaron las etiquetas y la exportación a `.ics`.

## Tanda 8

- **Vista de semana** (interruptor *Día | Semana* bajo la cabecera): las 7 jornadas en tarjetas, con una barra de colores por categoría (más clara si está pendiente), la línea de "ahora", los primeros apuntes del día y el mayor hueco libre. Tocar un día lo abre. La app recuerda la vista elegida (`cfg:mode`). Cálculos puros en `src/weekview.js`.
- **Pasar pendientes**: aviso sobre la lista cuando hay actividades sin hacer (hoy: las que ya terminaron; días pasados: todas) y opción en *Más → Pasar pendientes a mañana*. Desde hoy o un día futuro se **mueven**; desde un día pasado se **copian**, para no cambiar la racha de ese día. Si la hora está ocupada, la actividad va al primer hueco libre. Todo con *Deshacer*. Lógica en `state.carryOver` y `findFreeSlot`.
- **Buscador** (lupa de la cabecera): ignora mayúsculas y acentos, acepta varias palabras (todas deben aparecer) y mira en título, nota, subtareas y categoría. Filtros por categoría y estado, resultados separados en *Próximas* y *Anteriores* con las coincidencias resaltadas, repeticiones semanales aparte, búsquedas recientes y salto al día con la actividad resaltada. Motor puro en `src/search.js`; `state.search`.
- **Mover o copiar una actividad** (editor → *Mover o copiar a otro día…*): mover a una fecha (atajos o selector) o copiar a varios días; avisa si choca con otra actividad. La copia nace sin marcar, sin nota y sin tiempo medido. `state.moveBlock`.
- **Tiempo real**: botón *Medir tiempo* en las actividades de hoy. Un solo cronómetro a la vez (`src/tracker.js`, se guarda en el dispositivo y sobrevive a cerrar la app), chip en la cabecera, se para al marcar la actividad como hecha, no cuenta más allá de la medianoche del día en que empezó y se puede corregir a mano en el editor. Se guarda en el campo `w` (segundos) de la actividad, que viaja con el día a Firestore (las reglas no cambian). Las estadísticas muestran el tiempo real frente al planificado de las actividades medidas.
- **Reglas de Firestore y funciones**: sin cambios en esta tanda.
- Pruebas: `tests/planner.test.js` (lógica) y `e2e/t11.mjs` (navegador).


## Tanda 9 — limpieza y actividades sin hora de fin

**Quitado:** Compartir resumen semanal, colores de acento e Insignias (el Pomodoro se mantiene).
**Juntado:** los 3 avisos en un solo interruptor «Avisos» (más cuánto antes); meta y días de racha en «Racha».
**Movido:** Categorías al menú ☰; «Estadísticas de uso» a «Cuenta y datos»; «Ver tutorial» al final de Ajustes.
Ajustes tiene 4 bloques plegables: Avisos, Aspecto e idioma, Racha, Cuenta y datos.

**Nuevo — «No sé a qué hora termina»:** en el editor, un interruptor deja la actividad solo con hora de inicio
(campo `o` en la actividad; `e` es una hora provisional = inicio + 60 min para que el resto de la app siga funcionando).
Al marcarla como hecha, hoy se guarda como fin la hora de ese momento (mínimo 5 min); en otro día se queda la provisional.
También vale en repeticiones semanales. No hace falta republicar las reglas de Firestore.

**Borra en GitHub** los archivos viejos: `tests/tags.test.js`, `tests/ics.test.js`, `src/export-ui.js`, `src/ics.js`.
