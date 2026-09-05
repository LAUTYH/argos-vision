# ARGOS

Consola de operaciones con visión por computadora. Demo comercial de alta
fidelidad.

![estado](https://img.shields.io/badge/estado-demo-76B900) ![Next.js](https://img.shields.io/badge/Next.js-15-000) ![datos](https://img.shields.io/badge/datos-simulados-F5A524)

---

## Qué es

ARGOS es la consola con la que **Vantor Group**, un operador logístico e
industrial ficticio, mira sus cuatro sitios. Muestra cómo se usa detección
visual *zero-shot* en toda una operación: contar lo que entra, verificar EPP,
seguir personas y autoelevadores, inspeccionar activos y leer remitos —
describiendo en lenguaje natural qué buscar, sin entrenar un modelo por caso.

La barra de prompt es el centro de la interfaz. Escribís *"caja dañada"*,
*"montacarga en zona peatonal"* o *"persona sin casco"* y esa clase se agrega a
la escena y empieza a detectarse en la pasada siguiente.

## Qué es real y qué está simulado

La consola mezcla dos fuentes y lo dice en pantalla en cada feed.

**Tres módulos corren sobre video real con detecciones reales.**
`/patio`, `/recepcion` y `/flujo` reproducen clips de archivo y muestran cajas
que produjo un detector open-vocabulary de verdad (OWL-ViT) sobre esos mismos
clips. La inferencia se corrió **fuera de línea** con `pnpm annotate:feeds`, que
escribe las cajas a JSON; el navegador sólo las lee. Ningún modelo se descarga
ni se ejecuta en el cliente. Estos feeds llevan el badge `VIDEO REAL` y el pie
indica el clip, la fuente y el modelo.

**Tres módulos siguen siendo procedurales**, y por razones concretas:

| Módulo | Por qué no usa video real |
|---|---|
| `/seguridad` | Necesita eventos de EPP faltante. El material disponible muestra personas identificables sin casco, y esta demo no etiqueta trabajadores reales como infractores con nombres y roles inventados |
| `/inspeccion` | Necesita defectos que segmentar. El footage de turbinas de archivo no tiene ninguno |
| `/documentos` | Necesita el remito cuyos números cruza el resto de la app |

**Nada de esto ejecuta un modelo en el navegador.** Las escenas procedurales y
toda la lógica de negocio se generan sobre un PRNG con semilla (`mulberry32`,
semilla `20260904`), así que **dos grabaciones de la misma corrida salen
idénticas**. El badge `DATOS SIMULADOS` está visible por defecto en el header.

En los módulos con video real, los KPI de arriba se cuentan sobre las cajas del
clip; el registro operativo de al lado — remitos, dársenas, patentes — son datos
de ejemplo y la pantalla lo aclara, porque una cámara no puede leerlos.

La arquitectura está preparada para inferencia real. `lib/inference/` define la
interfaz `InferenceProvider` con dos implementaciones:

| Implementación | Estado | Qué hace |
|---|---|---|
| `SimulatedProvider` | activa en los 3 módulos procedurales | Convierte el estado del mundo simulado en detecciones, con el ruido descrito abajo |
| `PrecomputedProvider` | activa en los 3 módulos con video | Sirve las cajas que OWL-ViT produjo fuera de línea sobre el clip, interpoladas entre muestras |
| `LocateAnythingProvider` | stub tipado | Documenta cómo se conectaría el modelo en vivo: endpoint, plantilla de prompt, parseo de `<box>` en \[0,1000\], tracker para los IDs |

Conectar un modelo real es cambiar una implementación, no reescribir la app.

## Referencia técnica

El producto se diseñó alrededor de [NVIDIA LocateAnything-3B](https://huggingface.co/nvidia/LocateAnything-3B)
y del paper [*LocateAnything: Fast and High-Quality Vision-Language Grounding
with Parallel Box Decoding*](https://arxiv.org/abs/2605.27365) (arXiv 2605.27365).

Su diferencia con un VLM generalista es **Parallel Box Decoding**: cada caja es
un bloque atómico de seis tokens que se decodifica en un solo paso, en vez de
coordenada por coordenada. Sobre una H100 con batch 1 eso da 12,7 cajas por
segundo contra 5,0 de Rex-Omni y 1,1 de Qwen3-VL, con mejor F1 a IoU alto
(31,1 contra 20,7 en LVIS a IoU 0,95). Ese throughput es lo que hace viable la
detección por prompt en tiempo real que muestra la consola.

`/arena` reproduce esas cifras lado a lado. Son las publicadas: la pantalla no
mide nada.

## Módulos

| Ruta | Módulo | Sitio | Qué demuestra |
|---|---|---|---|
| `/` | Torre de control | los 4 | KPI agregados, feed de eventos, preview de cada módulo |
| `/recepcion` | Conteo de recepción | CD Norte | **Video real** · cajas detectadas en la cinta, contra remito |
| `/seguridad` | EPP y zonas de riesgo | Planta Rosario | Pose, casco y chaleco, ingreso a zona restringida |
| `/flujo` | Flujo de personas | CD Norte | **Video real** · personas, bultos y pallets con ID persistente |
| `/patio` | Yard y autoelevadores | Terminal Sur | **Video real** · camiones y autos desde dron cenital |
| `/inspeccion` | Inspección de activos | Parque Vega | Segmentación de defectos en palas, severidad, historial |
| `/documentos` | OCR y remitos | CD Norte | Grounding de campos y cruce con lo contado en recepción |
| `/arena` | Model bench | — | LocateAnything vs. Qwen3-VL vs. Rex-Omni |

Los KPI de la torre son la **suma real** de los módulos, no números aparte.
`pnpm coherence:check` lo verifica en cinco instantes distintos de la corrida.

## Correr

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

```bash
pnpm build        # build de producción
pnpm lint         # eslint
pnpm typecheck    # tsc --noEmit
```

### Verificación de la simulación

```bash
pnpm sim:check        # determinismo, seek hacia adelante y atrás, invariantes
pnpm realism:check    # ruido del detector medido sobre 240 s por módulo
pnpm coherence:check  # torre vs. módulos, documentos vs. recepción
pnpm reel:check       # el guion de 90 s contra los eventos reales
```

### Anotación de los clips reales

```bash
pnpm annotate:feeds              # corre OWL-ViT sobre los tres clips
pnpm annotate:feeds patio        # sólo uno
pnpm preview:tracks patio 6      # imagen de control: cajas sobre el frame real
```

`annotate:feeds` extrae frames con ffmpeg, los pasa por
`Xenova/owlvit-base-patch32`, aplica NMS por clase y un tracker por IoU, y
escribe `public/feeds/{modulo}.tracks.json`. Tarda unos 15 s por clip en CPU.
Requiere `ffmpeg` en el PATH.

Los umbrales están calibrados por frase, no globalmente: los scores de OWL-ViT
no son comparables entre prompts, y un corte único inunda la toma aérea o vacía
la cercana.

## Atajos

| Tecla | Qué hace |
|---|---|
| `D` | Demo reel: recorre los módulos solo durante 90 s |
| `H` | Oculta el chrome para capturas limpias |
| `S` | Muestra u oculta el badge de datos simulados |
| `R` | Raw feed: saca todas las anotaciones del módulo abierto |
| `Espacio` | Pausa o reanuda |
| `←` `→` | ±5 s (con `Shift`, ±30 s) |
| `⌘K` | Paleta de comandos |
| `?` | Ayuda de atajos |

## Cómo está armado

```
lib/sim/          motor de simulación
  rng.ts          mulberry32, hash determinista, ruido de valor
  types.ts        entidades, observables, detecciones
  camera.ts       cámara pinhole y proyección
  world.ts        reloj fijo de 60 Hz, snapshots cada 15 s, seek
  classes.ts      catálogo de clases y resolución del prompt
  detector.ts     observables → detecciones, con sus imperfecciones
  telemetry.ts    latencia, fps, boxes/s, GPU
  timeline.ts     guion de eventos y del demo reel
  scene.ts        fondos procedurales por módulo
  engine.ts       orquesta los seis mundos y el proveedor
  modules/        un mundo por módulo
lib/feeds/        clips reales: catálogo, tracks precomputados, KPI derivados
lib/render/       canvas: superficie, video, agentes, capa de anotación
lib/inference/    InferenceProvider y sus dos implementaciones
lib/data/         datos canónicos de Vantor: sitios, SKU, remitos, activos
components/       shell, feed, KPI, timeline
app/              una ruta por módulo
public/feeds/     clips .mp4 y sus .tracks.json
scripts/          verificaciones de simulación y anotación de clips
```

### El motor primero

Cada módulo es un mundo independiente que avanza a paso fijo de 1/60 s. El
render nunca afecta la simulación: cambiar de velocidad o de tamaño de ventana
no cambia lo que pasa. Cada mundo guarda un snapshot cada 15 segundos, así que
arrastrar la barra de tiempo a cualquier punto del clip de 10 minutos es
instantáneo y determinista.

### El detector falla a propósito

Un detector perfecto se lee como falso. Este tiene jitter sub-pixel en cada
borde, confianza que deriva en el tiempo entre 0,72 y 0,98, entre 1,7 % y 3,8 %
de falsos negativos según el módulo, algún falso positivo de baja confianza que
no sobrevive al cuadro siguiente, y cerca de 1 % de cambios de ID en el
tracking. Todo derivado de `(semilla, tick, entidad, clase)`, así que moverse en
el tiempo reproduce exactamente el mismo ruido.

Las cifras medidas están en [`docs/QA.md`](docs/QA.md), pasada 2.

### Sobre el throughput

Los feeds simulan un despliegue con varias GPU y batching entre cámaras; por eso
la torre suma bastante más que las 12,7 cajas por segundo del paper, que son de
**una** H100 con batch 1. La consola lo declara en el panel "Runtime de
inferencia" y en la nota al pie del Model bench, en vez de dejar dos números que
se contradicen.

## Stack

Next.js 15 · React 19 · TypeScript estricto · Tailwind v4 · Radix · `motion` ·
Canvas 2D. Sin backend, sin base de datos, sin autenticación: todo corre en el
cliente. Deploy en Vercel.

## Documentación

- [`docs/DEMO-SCRIPT.md`](docs/DEMO-SCRIPT.md) — guion de 90 segundos para grabar
- [`docs/QA.md`](docs/QA.md) — las diez pasadas de calidad, con lo que se encontró y se cambió

---

Fuentes: [nvidia/LocateAnything-3B](https://huggingface.co/nvidia/LocateAnything-3B) ·
[LocateAnything (arXiv 2605.27365)](https://arxiv.org/abs/2605.27365) ·
[NVIDIA Research](https://research.nvidia.com/labs/lpr/locate-anything/)
