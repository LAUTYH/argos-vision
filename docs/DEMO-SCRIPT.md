# Guion de grabación · 90 segundos

Demo reel automático. Arranca con `D` y recorre los ocho módulos solo, con las
transiciones y los prompts guionados. **No hace falta tocar el mouse.**

## Antes de grabar

| | |
|---|---|
| Ventana | 1440 × 900, zoom del navegador al 100 % |
| Pestaña | Una sola. El motor se pausa si la pestaña queda oculta |
| Preparación | Cargá `/`, esperá a que los seis previews estén dibujados |
| Limpieza | `H` oculta sidebar y header si querés capturas sin chrome |
| Badge | `DATOS SIMULADOS` visible. `S` lo saca solo si el cliente ya sabe |
| Semilla | `20260904`, fija. Dos grabaciones salen idénticas |

Apretá `D` y no toques nada. El reel termina solo a los 90 s y se apaga.

## Minuto a minuto

**0:00 – 0:07 · Torre de control**
Cuatro sitios, una consola.
> "Vantor opera cuatro sitios. Esto es todo lo que las cámaras están viendo
> ahora mismo: sesenta cámaras, seis modelos de uso, un solo tablero. Los
> números de arriba son la suma real de lo que pasa abajo, no un resumen aparte."

**0:07 – 0:19 · Seguridad · EPP y zonas de riesgo**
A los 8,9 s entra M. Ledesma sin casco y salta la alerta alta.
A los 11,5 s el reel activa **raw feed**: desaparecen todas las anotaciones.
A los 14 s vuelven.
> "Pose, casco y chaleco sobre cada persona. Este operario entra sin casco y el
> incidente queda registrado con nombre, puesto y hora. Miren la escena cruda…
> y ahora con las detecciones. Eso es lo único que agrega el modelo."

> Nota: recepción, patio y flujo corren sobre **video real** con cajas que un
> detector produjo sobre esos mismos clips. Seguridad, inspección y documentos
> son escenas procedurales. Cada feed lo dice en su encabezado.

**0:19 – 0:32 · Recepción · conteo contra remito**
A los 22,7 s cruza la línea de conteo un SKU que no figura en el remito.
A los 25 s el reel escribe **"caja dañada"** en la barra de prompt.
> "Esto es video real de una descarga, y esas cajas las puso un detector sobre
> este mismo clip: veintiún bultos por cuadro, cada uno con su ID. Al costado,
> el remito que el sistema tiene cargado. La cámara cuenta, el ERP declara, y el
> cruce es el que dispara la discrepancia."

**0:32 – 0:44 · Patio · yard y autoelevadores**
A los 38 s escribe **"montacarga en zona peatonal"**.
A los 41,5 s salta riesgo de cruce entre MC-03 y un peatón.
> "Dron sobre el patio, video real. Los camiones y los autos salen detectados
> del propio clip, con ID persistente entre cuadros. Le puedo pedir otra clase
> escribiéndola: si el clip no la tiene, lo dice en vez de inventarla."

**0:44 – 0:57 · Flujo · personas**
A los 45 s entran cinco personas hacia Picking B.
A los 47 s el reel enciende la capa **tracks**.
A los 52 s salta aforo excedido.
> "Nave de picking, también video real. Personas, bultos y pallets detectados
> cuadro a cuadro con ID propio. Acá el valor es el conteo: cuántos hay, dónde y
> por cuánto tiempo."

**0:57 – 1:09 · Inspección · palas de aerogenerador**
A los 59 s aparece una grieta transversal en la pala B del WTG-07.
A los 62 s escribe **"grieta"**.
> "Pasada de dron sobre la pala. Segmentación de defectos con severidad y
> porcentaje de área. Si sólo me interesan las grietas, lo pido y filtra."

**1:09 – 1:19 · Documentos · OCR y remitos**
A los 72 s escribe **"cantidad"** y a los 72,6 s marca la patente para revisión.
> "El mismo modelo sobre el remito escaneado: todos los campos localizados en
> una sola pasada. Y acá se cierra el círculo: lo que dice el papel contra lo
> que contó la cinta, línea por línea."

**1:19 – 1:27 · Model bench**
> "Por qué esto corre en vivo: LocateAnything decodifica la caja entera en un
> paso en lugar de token por token. Doce coma siete cajas por segundo contra
> cinco de Rex-Omni y uno coma uno de Qwen3-VL, en la misma H100."

**1:27 – 1:30 · Cierre en la torre**
> "Un prompt, cualquier clase, sin reentrenar. Estos datos son simulados; el
> proveedor de inferencia es una interfaz: conectar el modelo real es cambiar
> una implementación."

## Planos que más venden

1. **El toggle de raw feed** en seguridad (0:11–0:14). Escena cruda, luego
   anotada. Es el plano que explica el producto sin decir una palabra.
2. **Escribir en la barra de prompt** (0:25 y 0:38). La clase aparece como chip,
   arranca con un spinner y a los 400 ms empieza a contar detecciones.
3. **El cruce documento ↔ cinta** (1:09). Dos módulos distintos mostrando el
   mismo remito con números que cierran.

## Atajos durante la grabación

| Tecla | Qué hace |
|---|---|
| `D` | Arranca o corta el demo reel |
| `H` | Oculta el chrome (sidebar, header) |
| `S` | Muestra u oculta el badge de datos simulados |
| `R` | Raw feed del módulo abierto |
| `Espacio` | Pausa o reanuda la simulación |
| `←` `→` | ±5 s (con `Shift`, ±30 s) |
| `⌘K` | Paleta de comandos |
| `Esc` | Corta el reel |

## Si algo sale mal

- **El reel se desincroniza**: `Esc`, recargá y volvé a apretar `D`. La semilla
  es fija, el recorrido se repite igual.
- **Los feeds se congelan**: la pestaña perdió foco. El canvas se pausa a
  propósito cuando la pestaña está oculta. Volvé a la pestaña y sigue.
- **Un módulo arranca vacío**: apretá `←` para retroceder unos segundos; las
  entidades entran por los bordes de la escena.
