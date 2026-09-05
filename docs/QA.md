# Bucle de calidad · 10 pasadas

Registro de las diez revisiones sobre la implementación terminada. Cada pasada
tiene un foco, lista lo que se buscó, lo que apareció y lo que se cambió.

Tres scripts sostienen las pasadas y se pueden volver a correr:

```bash
pnpm sim:check        # determinismo, seek, invariantes del mundo
pnpm realism:check    # ruido del detector medido sobre 240 s por módulo
pnpm coherence:check  # torre vs. módulos, documentos vs. recepción
pnpm reel:check       # el guion de 90 s contra los eventos reales
```

---

## 1 · Compila

**Qué se buscó** — `pnpm build` sin errores ni warnings, cero `any`, cero
`console.log`, TypeScript en modo estricto con `noUncheckedIndexedAccess`.

**Qué apareció**

- `eslint` marcó `@next/next/no-assign-module-variable` en `AppShell` y
  `DemoReel`: ambos usaban una variable local llamada `module`, que Next
  reserva.
- Dos variables sin usar en `lib/sim/scene.ts`. Una era inocua (`t` en
  `paintInspeccion`); la otra tapaba un bug real, ver pasada 4.
- `pnpm` abortaba por scripts de instalación no aprobados (`esbuild`,
  `unrs-resolver`).

**Qué se cambió** — Variables renombradas a `mod`. Parámetro sin uso eliminado.
`pnpm-workspace.yaml` declara qué paquetes pueden correr scripts. La regla
`no-console` queda activa con `warn`/`error` permitidos; los scripts de
verificación escriben por `console.warn` a propósito.

**Estado** — `pnpm build`, `pnpm lint` y `pnpm typecheck` limpios.

---

## 2 · Realismo

**Qué se buscó** — Que las detecciones fallen. Un detector perfecto se lee como
falso en dos segundos.

**Qué apareció** — La primera medición con `realism:check` dio una tasa de
no-detección del **10,6 %** en recepción y **9,8 %** en flujo. Las cajas
parpadeaban tanto que parecía un bug, no ruido. La causa era el término de
oclusión: `FN_BASE + oclusión × 0,35`, y en una cinta las cajas se tapan entre
sí casi siempre.

También apareció que la métrica de jitter estaba mal planteada: comparaba cada
caja contra su posición en el frame anterior, así que medía el movimiento real
del objeto, no el error del detector. En inspección daba 23 px, que era la
velocidad del dron.

**Qué se cambió**

- Oclusión pesa `× 0,10` en vez de `× 0,35`, penalización por distancia y por
  baja confianza reducidas, y tope duro del 7 % de probabilidad de fallo.
- El jitter se mide contra la caja verdadera del observable, no contra el frame
  anterior.

**Medición final** (240 s por módulo, semilla `20260904`)

| módulo | no-detecta | reaparece | confianza media | jitter | flicker de ID | falsos + | latencia |
|---|---|---|---|---|---|---|---|
| recepción | 3,83 % | 791 | 0,796 | 1,03 px | 26 | 28 | 108 ± 11 ms |
| seguridad | 2,82 % | 846 | 0,802 | 1,34 px | 23 | 28 | 93 ± 11 ms |
| flujo | 3,60 % | 584 | 0,792 | 1,62 px | 25 | 40 | 85 ± 10 ms |
| patio | 2,01 % | 391 | 0,848 | 1,66 px | 9 | 24 | 111 ± 13 ms |
| inspección | 1,69 % | 17 | 0,844 | 1,95 px | 0 | 7 | 155 ± 20 ms |
| documentos | 1,95 % | 379 | 0,855 | 2,19 px | 0 | 10 | 313 ± 23 ms |

Confianza declarada 0,72–0,98; observada 0,720–0,970. El flicker de ID sólo
afecta a entidades que se mueven, por eso inspección y documentos están en cero.

---

## 3 · Coherencia

**Qué se buscó** — Que los KPI de la torre sean la suma real de los módulos y
que `/documentos` y `/recepcion` hablen del mismo remito.

**Qué apareció**

- **Doble conteo de unidades.** `unitsReceivedToday` sumaba el historial de
  remitos cerrados *y* el conteo del remito activo. Entre que un camión termina
  de descargar y arranca el siguiente hay 26 s en los que el remito ya está en
  el historial pero sigue siendo el activo: durante esa ventana las unidades del
  turno se contaban dos veces y después bajaban. El KPI no era monótono.
- **La primera versión del chequeo era tautológica.** Comparaba la torre contra
  los mismos helpers que la torre usa, así que no podía fallar.
- **483 boxes/s contra 12,7 del paper.** La torre suma el throughput de los seis
  feeds y da un número diez veces mayor que la cifra publicada que muestra el
  Model bench. Leído junto, se contradice.

**Qué se cambió**

- El remito activo sólo se suma si todavía no cerró. El KPI ahora es monótono y
  el chequeo lo verifica.
- `coherence:check` compara la torre contra la lista de KPI que renderiza cada
  pantalla de módulo, más los helpers, más la monotonía de unidades.
- Se declaró el despliegue simulado (`RUNTIME` en `lib/data/company.ts`): cuatro
  H100 con batching entre cámaras. Aparece en el panel "Runtime de inferencia"
  de la torre y en la nota al pie del Model bench, que aclara que las cifras del
  paper son de una H100 con batch 1.

**Estado** — Trece comprobaciones en cinco instantes distintos (12, 47, 88, 140
y 220 s), incluyendo el cambio de remito. Todas en verde.

---

## 4 · Diseño

**Qué se buscó** — Abrir cada pantalla y preguntar si se ve cara.

**Qué apareció**

- **Las tres cámaras en perspectiva estaban mal.** El horizonte caía en
  `y = −94` con `cy = 330`: fuera del cuadro por arriba. Se veía sólo piso, la
  gente amontonada en una banda delgada arriba y el 60 % inferior vacío.
- **La banda superior era un vacío gris.** Sin techo, la mitad de arriba del
  encuadre era pared plana.
- **Saturación de etiquetas.** Cada persona llevaba tres chips (persona, casco,
  chaleco) y cada caja de la cinta uno ancho con clase, SKU, confianza e ID. En
  la cinta formaban una escalera ilegible.
- **`backRack` dibujaba todos los niveles al ras del piso.** Calculaba la altura
  de cada nivel en una variable que nunca usaba: era el warning de la pasada 1.
- **Camiones casi blancos.** `hsl(210 6% 88%)` los volvía lo más brillante de la
  pantalla, por encima del acento.
- **Ocho chips de dársena** duplicaban los números ya pintados en el asfalto.
- **Las luminarias eran losas grises** de 285 px de ancho en primer plano.
- **La prensa era un bloque plano** sin lectura de máquina.
- **El fondo de inspección tenía horizonte**, así que parecía un paisaje con una
  franja blanca en vez de una pala vista desde un dron.
- **La columna derecha de los módulos quedaba vacía** debajo de los KPI.

**Qué se cambió**

- Cámaras recalculadas para que el horizonte caiga entre `y = 146` y `y = 190`:
  recepción `cy 322 → 560`, seguridad `330 → 614`, flujo reencuadrada a
  `h 4,6 m · pitch 0,36 · focal 820 · cy 459`. La geometría de flujo se corrió
  hacia el fondo para que la línea de conteo siga entrando en cuadro.
- `ceilingRig()` y `backRack()`: cerchas, correas, luminarias con halo y una
  corrida de estanterías contra la pared del fondo, en los tres escenarios.
- Chips: casco, chaleco y etiqueta ya no llevan chip propio (`chip: false`), y
  las clases con más de cinco instancias en el frame pasan a formato compacto
  (identificador + confianza, sin el nombre de la clase, que ya lo dice el
  color). Los chips se apilan evitando superponerse.
- `box3()` acepta altura de base; `backRack` apila de verdad.
- Camiones a `hsl(… 48–60 %)` con degradé de chapa.
- Los chips de dársena se sacaron; la ocupación se muestra como barra verde
  sobre la dársena.
- Luminarias de 1 m con halo radial y barra emisiva.
- Prensa con columnas hidráulicas, franja de seguridad amarilla y más contraste.
- Fondo de inspección sin horizonte: parcelas agrícolas con bordes rectos y la
  sombra de la pala proyectada sobre el campo.
- Layout de módulo reestructurado: izquierda feed + timeline, derecha KPI en dos
  columnas + panel del módulo, sin huecos.
- La cinta de recepción se reorientó para que las cajas salgan por el borde
  inferior y no por el derecho, encima del área de pallets.

---

## 5 · Movimiento

**Qué se buscó** — Nada abrupto, nada por encima de 300 ms, todo interrumpible,
`prefers-reduced-motion` funcionando de verdad.

**Qué apareció** — Las transiciones de UI ya estaban entre 150 y 250 ms. Dos
cosas para revisar: los números saltaban al re-renderizar y las cajas de
detección se movían a saltos entre pasadas de inferencia.

**Qué se cambió y cómo quedó**

- `useTween` interpola con `easeOutCubic` en 380 ms y se reinicia desde el valor
  actual si llega un objetivo nuevo: es interruptible por construcción.
  Con `prefers-reduced-motion` asigna el valor directo, sin `requestAnimationFrame`.
- Las cajas interpolan entre las dos últimas pasadas del detector
  (`displayDetections`), así que se deslizan a 60 fps aunque la inferencia
  entregue a 8–12 fps. Una caja nueva entra con opacidad creciente en 90 ms.
- Transiciones de página con `motion`: 220 ms, `cubic-bezier(0.22, 1, 0.36, 1)`,
  desactivadas con `useReducedMotion`.
- El bloque `@media (prefers-reduced-motion: reduce)` de `globals.css` anula
  animaciones y transiciones globalmente, incluido el punto que pulsa.

---

## 6 · Densidad

**Qué se buscó** — Números monoespaciados y alineados, unidades siempre
visibles, nada por debajo de 12 px, tablas escaneables.

**Qué apareció** — En la torre, nueve KPI en nueve columnas a 1288 px dejaban
118 px por tarjeta y las etiquetas se cortaban: `ALERTAS ACTIVA…`,
`UNIDADES RECIBID…`, `DÁRSENAS OCUPA…`.

**Qué se cambió**

- La grilla de KPI pasó a `2 → 3 → 5 → 9` columnas según ancho. A 1440 quedan
  cinco por fila y las etiquetas entran completas.
- Los previews de la torre ya no se estiran a la altura de la fila
  (`auto-rows-min` + `h-fit`).
- Todo número usa la clase `.num`: Geist Mono con `tabular-nums`, alineado a la
  derecha. Las unidades van al lado del número en color secundario, nunca
  implícitas.
- El texto más chico de la interfaz es de 10 px y sólo se usa en etiquetas de
  eje y notas al pie; el contenido de tabla no baja de 12 px.

---

## 7 · Estados

**Qué se buscó** — Que ninguna pantalla quede en blanco: carga, vacío, error,
sin detecciones, feed pausado, prompt sin resultados.

**Qué apareció y cómo quedó**

- **Prompt sin resultados**: escribir "tractor amarillo" en seguridad devuelve
  un aviso ámbar, *Sin resultados para "tractor amarillo" en esta escena*, con
  botón de cierre. Verificado en pantalla.
- **Clase recién agregada**: el chip muestra un spinner durante 420 ms
  (`GROUNDING_WARMUP`) hasta que llega la primera pasada, y después el contador.
- **Clase sin instancias**: el chip queda en `0` en color apagado, no
  desaparece. Se distingue de "todavía no respondió".
- **Timeline vacío**: `EventList` tiene estado propio con explicación, no una
  lista vacía. Se veía en documentos, que sólo emitía eventos al cambiar de
  remito, y en seguridad entre incidentes.
- **Feed pausado**: el testigo `LIVE` rojo pasa a `PAUSA` gris dentro del propio
  canvas, además del botón.
- **Telemetría antes de la primera pasada**: se muestra `—` en vez de ceros.
- **Antes de dibujar**: `prepareSurface` devuelve `null` si el contenedor mide
  menos de 2 px, en lugar de escribir con una transformación degenerada.

Además se agregaron eventos de pipeline en documentos (encolado, cabecera
extraída, verificación campo por campo cada 10,5 s) y un control periódico de
EPP en seguridad cada 26 s, para que ningún timeline quede mudo.

---

## 8 · Responsive

**Qué se buscó** — 1440 como objetivo, sin romper en 1024 ni en 768.

**Qué apareció** — El header apilaba título, chip de alertas, reloj y cuatro
controles en una fila que sólo cabía por encima de 1100 px.

**Qué se cambió**

- El chip de alertas aparece a partir de `lg`, el reloj a partir de `sm`, y el
  botón de atajos a partir de `sm`. El botón de demo reel deja sólo la tecla en
  pantallas chicas. El bloque de controles ya no se oculta entero.
- Grillas: sitios `2 → 4`, KPI de torre `2 → 3 → 5 → 9`, previews `2 → 3`,
  módulos apilados por debajo de `xl` y a `8 / 4` por encima.
- La tabla del Model bench tiene ancho mínimo con scroll horizontal propio; el
  cuerpo de la página nunca hace scroll lateral.
- Verificado a 1432 px sin desborde horizontal
  (`scrollWidth === clientWidth`). Los anchos menores se revisaron por código:
  la ventana del navegador de la sesión de revisión estaba fijada y no permitió
  reducir el viewport.

---

## 9 · Recorrido

**Qué se buscó** — Correr el demo reel completo y cronometrarlo. ¿Cuenta una
historia en 90 segundos?

**Qué apareció** — `reel:check` recorre el guion contra los eventos que la
simulación produce de verdad. La primera corrida dejó **tres tramos sin ningún
evento destacado**: flujo, inspección y documentos. Diez segundos mirando una
pantalla donde no pasa nada.

- Flujo: el pico de ingreso estaba en `t = 49` y el aforo se excedía recién a
  los 56,9 s, un segundo después de que el reel cambiara de pantalla.
- Inspección: la pasada de la pala arrancaba con `passT = 6` y con pasadas de
  68 s, así que la ventana 55–66 caía en el tramo final de la pala, sin defectos.
- Documentos: sólo emitía eventos en los primeros 4,6 s y al cambiar de remito
  a los 130 s.

**Qué se cambió**

- El pico de flujo pasó a `t = 45` y ahora las cinco personas van todas a
  Picking B, así que el aforo se excede a los 52 s, dentro de la ventana.
- `PASS_SECONDS` de 68 → 48 y fase inicial en 0: durante 57–69 corre la pala B
  y la grieta transversal aparece a los 59 s.
- Documentos emite etapas de pipeline y verificaciones cada 10,5 s.
- Los tramos se recortaron: torre 0, seguridad 7, recepción 19, patio 32,
  flujo 44, inspección 57, documentos 69, bench 79, cierre 87.

**Estado** — Cero tramos sin evento destacado. Duración total 90 s.

---

## 10 · Poda

**Qué se buscó** — Sacar lo que no aporta.

**Qué apareció y qué se sacó**

- Los feeds de la torre corrían a 60 fps los seis: 360 repintados completos por
  segundo. Ahora los previews van a 15 fps, se cachean a 1× en lugar de 2× y su
  primer dibujo se escalona 55 ms entre sí, para que la torre no gaste un cuadro
  de 185 ms construyendo seis fondos a la vez.
- El heatmap proyectaba 960 celdas por cuadro. La geometría se proyecta una sola
  vez (la cámara y la grilla son fijas) y el mapa se rasteriza a un buffer que
  se refresca cada 0,4 s y se dibuja con desenfoque.
- La textura de la pala se generaba a 512², con dos octavas de ruido por píxel:
  unos 8,4 M de operaciones en el primer dibujo. Bajó a 256².
- Las trayectorias de vehículos y personas detenidos se consumen en vez de
  quedar dibujadas: los camiones en dársena arrastraban una línea celeste
  permanente sobre el patio.
- Se eliminó el chip por dársena y el texto duplicado de los niveles de rack.
- `LayerKey` incluye `heat`, que sólo usa flujo; la lista de capas por módulo
  (`LAYERS_BY_MODULE`) muestra únicamente las que ese módulo dibuja.

**Costo de render final** — Un feed a tamaño completo tarda **0,8 ms** por
cuadro una vez que el fondo está cacheado; los seis previews de la torre,
**4,6 ms** en conjunto.

**Lo que quedó fuera a propósito** — El stub `LocateAnythingProvider` no se
implementa: existe para documentar la superficie de integración. Los tres
scripts de verificación no se borran; son la evidencia de este documento.

---

## Nota sobre la revisión visual

La revisión se hizo con el navegador conducido por herramientas. La ventana
quedó en segundo plano, de modo que `requestAnimationFrame` no dispara y el
canvas se pausa a propósito, tal como se pidió. Para poder mirar cuadros reales
se agregó un enganche de desarrollo que registra la función de repintado de cada
feed en `window.__argosFeeds` y expone el motor en `window.argos`. Ambos se
compilan fuera de la build de producción (`process.env.NODE_ENV !== "production"`).

Un efecto de esa limitación: los KPI de las capturas aparecen a mitad de camino
de su interpolación, porque el tween también depende de `requestAnimationFrame`.
Los valores se verificaron leyendo el estado del motor, no la pantalla.

---

# Adenda · incorporación de video real

Pedido posterior al bucle de calidad: *"me gustaría que tenga videos reales para
realmente mostrar"*. Esto cambia la primera regla del brief original (cero
assets externos), así que queda registrado aparte.

## El problema que había que resolver primero

Poner video real detrás de detecciones simuladas no funciona: las cajas flotan
sobre píxeles que no les corresponden y se nota de inmediato. Quedaría peor que
la escena procedural. Así que el video real sólo entra junto con **detecciones
reales sobre ese mismo video**.

## Qué se probó

| Fuente | Resultado |
|---|---|
| Pexels | Bloqueado por Cloudflare para descarga directa, pero el CDN responde conociendo el id: `videos.pexels.com/video-files/{id}/{id}-hd_1920_1080_30fps.mp4` |
| Coverr | Accesible, enlaces directos, pero la búsqueda devuelve material genérico: para "warehouse" trae baños y bananas |
| Mixkit | Accesible; pocas variantes en 720p |

Sobre la viabilidad de detectar de verdad: `Xenova/owlvit-base-patch32` en
transformers.js corre en Node a **0,2–0,4 s por frame** en CPU. Un clip de 16 s
muestreado a 5 fps se anota entero en 15 s.

## Calibración

Los scores de OWL-ViT no son comparables entre prompts, así que un umbral único
no sirve. Medido sobre un frame de cada clip:

| Frase | ≥0,10 | ≥0,15 | ≥0,20 |
|---|---|---|---|
| `a cardboard box` (cinta) | 37 | 24 | 21 |
| `a semi truck trailer seen from above` (patio) | 15 | 7 | 1 |
| `a person` (nave) | 3 | 3 | 3 |
| `a hard hat` (nave) | 0 | 0 | 0 |

De ahí salen los umbrales por frase del script y el NMS más laxo del patio
(0,68): los tráilers estacionados en paralelo se solapan de verdad y con el
valor por defecto se fusionaban entre sí.

## Qué se decidió y por qué

**Tres módulos pasan a video real**: `/patio` (dron cenital sobre patio de
camiones), `/recepcion` (cinta de descarga con bultos) y `/flujo` (nave de
picking desde altura). En los tres el ángulo y el contenido coinciden con lo que
el módulo dice hacer.

**Tres se quedan procedurales**:

- `/seguridad` — El clip de nave disponible muestra tres personas identificables,
  ninguna con casco. Etiquetar trabajadores reales como infractores de seguridad,
  con nombres y roles inventados, no es algo que esta demo vaya a hacer. El clip
  se reasignó a `/flujo`, donde detectar personas es el objetivo y no hay
  acusación asociada.
- `/inspeccion` — Necesita defectos que segmentar; el footage de turbinas no
  tiene ninguno.
- `/documentos` — Necesita el remito cuyos números cruza `/recepcion`.

## Cómo quedó la coherencia

El riesgo era repetir el problema de la pasada 3: números en pantalla que se
contradicen. La separación es explícita:

- Los KPI de un módulo con video se cuentan **sobre las cajas del clip**
  (`lib/feeds/stats.ts`): cuántas de cada clase hay en el frame, tracks únicos
  desde el inicio, confianza media del detector.
- El registro operativo — remito, dársenas, patentes, nombres — es lo que una
  cámara no puede leer. Sigue en su panel, con un aviso encima que dice que son
  datos de ejemplo y no salen del video.
- El pie de cada feed real nombra el clip, su fuente y el modelo que lo anotó.

## Verificación

Chrome no carga video en una pestaña en segundo plano, que es donde corre el
navegador de la sesión de revisión, así que la reproducción no se pudo mirar en
pantalla. La geometría del overlay sí: `pnpm preview:tracks` compone las cajas
del track file sobre el frame real del clip usando las mismas coordenadas
normalizadas que usa el canvas. Las cajas caen sobre los bultos, las personas y
los tráilers.

| Clip | frames | cajas | por frame | tracks |
|---|---|---|---|---|
| patio | 80 | 606 | 7,6 | 125 |
| recepción | 85 | 1797 | 21,1 | 93 |
| flujo | 45 | 323 | 7,2 | 43 |

## Lo que queda pendiente

- El registro operativo no se deriva de las detecciones reales. Un producto de
  verdad ataría el conteo de bultos del clip al remito; hoy conviven señalados
  como fuentes distintas.
- La reproducción del video no está verificada en pantalla por la limitación del
  navegador en segundo plano.
- El patio detecta 7,6 cajas por frame donde un humano cuenta unos veinte
  tráilers. Es el techo de OWL-ViT base en tomas aéreas; OWLv2 subiría el
  recall a costa de tiempo de anotación.
- Licencias: los clips son de Pexels, de uso libre y sin atribución obligatoria,
  pero su licencia no permite redistribuirlos como material de archivo. Si el
  repositorio se hace público conviene dejarlos fuera del control de versiones y
  bajarlos con un script.
