# ARGOS

Consola de operaciones con visión por computadora. Demo de alta fidelidad.

![status](https://img.shields.io/badge/estado-demo-76B900) ![stack](https://img.shields.io/badge/Next.js-15-000)

---

## Qué es

ARGOS es una consola que muestra cómo una empresa usa detección visual zero-shot en toda
su operación: contar stock que entra, verificar EPP, seguir personas y montacargas,
inspeccionar activos y leer remitos — describiendo en lenguaje natural qué buscar, sin
entrenar un modelo por cada caso.

La empresa del ejemplo es **Vantor Group**, un operador logístico ficticio con cuatro
sitios.

## Datos simulados

**Esta demo no ejecuta ningún modelo ni procesa cámaras reales.** Las escenas y las
detecciones se generan proceduralmente en el navegador, con semilla fija para que cada
corrida sea idéntica.

La arquitectura está preparada para inferencia real: `lib/inference/` define una interfaz
`InferenceProvider` con dos implementaciones — `SimulatedProvider` (activa) y
`LocateAnythingProvider` (stub documentado). Conectar el modelo real es cambiar una
implementación, no reescribir la app.

El badge `DATOS SIMULADOS` está visible por defecto en el header.

## Referencia técnica

El diseño del producto se apoya en [NVIDIA LocateAnything-3B](https://huggingface.co/nvidia/LocateAnything-3B),
un modelo de visión-lenguaje open source que genera todas las cajas de una imagen en una
sola pasada (*Parallel Box Decoding*) en lugar de token por token — alrededor de 10x el
throughput de Qwen3-VL sin pérdida de precisión. Eso es lo que hace viable la detección
por prompt en tiempo real que muestra esta consola.

## Módulos

| Ruta | Módulo | Qué demuestra |
|---|---|---|
| `/` | Torre de control | KPIs agregados de los 4 sitios, feed de eventos |
| `/recepcion` | Conteo de recepción | Conteo por SKU vs. remito esperado |
| `/seguridad` | EPP y zonas de riesgo | Pose + detección de casco/chaleco, alertas |
| `/flujo` | Flujo de personas | Tracking con ID, heatmap, aforo por zona |
| `/patio` | Yard y autoelevadores | Vista cenital, trayectorias, dársenas |
| `/inspeccion` | Inspección de activos | Segmentación de defectos, severidad |
| `/documentos` | OCR y remitos | Extracción de campos, cruce con recepción |
| `/arena` | Model bench | Comparación head-to-head de modelos |

## Correr

```bash
pnpm install
pnpm dev

Stack
Next.js 15 · TypeScript · Tailwind v4 · shadcn/ui · Canvas 2D · motion

Sin backend, sin base de datos. Todo corre en el cliente.

Documentación
docs/DEMO-SCRIPT.md — guion de 90 segundos para grabar
docs/QA.md — registro de las revisiones de calidad

---

Tres cosas para cuando lo corras:

**El detalle que decide si la demo convence** es que las detecciones fallen un poco. Está en la pasada 2 del bucle — si Fable te entrega cajas perfectas y estables, mandalo a agregar jitter y falsos negativos. Un detector impecable se lee como falso en dos segundos.

**El toggle de raw feed** (sacar las anotaciones) es tu mejor plano para el video: mostrás la escena cruda, apretás, aparecen las cajas. Eso solo ya vende.

**Si se lo mostrás a un cliente**, dejá el badge de datos simulados prendido y explicá que la conexión al modelo real es cambiar el provider. Es más fuerte como pitch que fingir que hay una GPU atrás, y no te deja expuesto.

Sources: [nvidia/LocateAnything-3B](https://huggingface.co/nvidia/LocateAnything-3B) · [LocateAnything (NVIDIA Research)](https://research.nvidia.com/labs/lpr/locate-anything/) · [roboflow/supervision](https://github.com/roboflow/supervision)
