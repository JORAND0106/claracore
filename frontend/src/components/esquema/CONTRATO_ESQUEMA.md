# Contrato de comportamiento — Herramienta de esquema

Documento único y obligatorio. Antes de cualquier cambio en `frontend/src/components/esquema/`, léelo completo. Después de cada cambio aprobado, actualízalo si el comportamiento cambió.

Las pruebas en `esquemaContrato.behavior.test.js` y el resto de `test:esquema` verifican este contrato. Si fallan, no se despliega.

Ámbito: Bitácora, Actas, SicoeObra, Topografía, Presupuesto y cualquier módulo que invoque la herramienta. Mismo comportamiento en iPad, portátil y celular.

---

## 2D

| ID | Comportamiento |
|----|----------------|
| C-2D-01 | Tipos de línea aplican a líneas y contornos. |
| C-2D-02 | Texto editable, contenedor invisible, reglas de tema. |
| C-2D-03 | Imagen de fondo con Ctrl+V; escala con manijas y con «Escalar imagen» (2 puntos + distancia real). |
| C-2D-04 | Giro con elección de punto; ortho suave; redimensión de entidades rotadas sin deformarlas. |
| C-2D-05 | Achurado hasta el contorno real. |
| C-2D-06 | Acotado con área integrada y exacta, también en figuras rotadas. |
| C-2D-07 | Mapa de fondo: capas y opacidad, polígonos PK, PK de contexto en ámbar, escala real = mapa, zoom nunca bloqueado, GPS. |
| C-2D-08 | Ventana: altura actual y ancho del panel lateral izquierdo; panel por secciones sin superposición; etiquetas al pasar el mouse. |

## 3D

| ID | Comportamiento |
|----|----------------|
| C-3D-01 | Botón modo 3D; en 3D no se ve el mapa; al salir, el 2D queda igual. |
| C-3D-02 | Seis vistas de dibujo (íconos de cara), isométricas NE/NO/SE/SO y giro libre. En isométricas y giro libre también se dibuja (estilo SketchUp). |
| C-3D-03 | Un solo espacio 3D con coordenadas reales para todas las vistas. |
| C-3D-04 | **Contorno y sólido = una sola entidad** en todas las vistas y acciones. Tras extruir, el contorno fuente no aparece separado del sólido (iso, giro libre, perfiles). Solo manijas en planta superior ortográfica si está seleccionado. |
| C-3D-05 | Extruir por cotas en superior/inferior (altura calculada visible en popup; se conserva); por longitud desde la cara (arrastre adentro/afuera + longitud exacta en popup). El sólido nace pegado a la cara. |
| C-3D-06 | Dibujo sobre la cara tocada (resaltada al pasar el cursor). En vistas planas: siempre la cara más cercana a quien mira (nunca la de atrás). OSNAP de esa cara: medio, esquinas, medios de arista, centros de círculo. Sin sólido: plano de la cota más baja. |
| C-3D-13 | Lo dibujado y lo extruido sobre una cara permanece pegado al cambiar de vista, girar y mover el conjunto. |
| C-3D-07 | Mover libre de cualquier sólido (incluidos resultados de operaciones) sin cambiar dimensiones ni cotas; Dimensionar actualiza el volumen de inmediato. |
| C-3D-08 | Color aplicable a cualquier sólido. |
| C-3D-09 | Unir, Sustraer y Cortar con geometría y volumen exactos. |
| C-3D-10 | Selección de sólidos internos. |
| C-3D-11 | Deshacer y Rehacer exactos, sin acciones que se repitan solas. |
| C-3D-12 | Representación: aristas visibles continuas finas; ocultas punteadas finas; caras semitransparentes; internos legibles; igual en editor e imagen. |

## Cálculo de volúmenes

| ID | Comportamiento |
|----|----------------|
| C-CALC-01 | Varios cálculos por esquema; elementos con nombre, Suma/Descuenta y «Descuenta de». |
| C-CALC-02 | Solo se descuenta el volumen común con el sólido indicado. |
| C-CALC-03 | Lista con todos los elementos visibles y desplazamiento. |
| C-CALC-04 | Cálculo dinámico con el esquema abierto; fijo al cerrarlo. |

## Salidas

| ID | Comportamiento |
|----|----------------|
| C-OUT-01 | Esquema guardado como PNG hi-res con fondo blanco. |
| C-OUT-02 | Memoria = una sola PNG vertical: encabezado, isométrico y tabla del mismo ancho; textos proporcionales y legibles sin ampliar; iso ≤ ~½ altura. |
| C-OUT-03 | Tabla: #, color, nombre, operación, Descuenta de, medidas, volumen; desglose de operaciones; fila neto sin medidas; total = suma de valores mostrados. |
| C-OUT-04 | Adjunto con miniatura, vista previa y descarga. |
| C-OUT-05 | Guardar borrador y continuarlo con todo funcionando igual. |

## Transversal

| ID | Comportamiento |
|----|----------------|
| C-TX-01 | Mismo comportamiento en todos los módulos que invocan la herramienta (iPad, portátil, celular). |

## Casos de verificación obligatorios

1. Excavación 1,90 × 2,30 m, cotas 2,60 → 0,00 → **11,36 m³**.
2. Poceta 1,50³ con vacío 1,10 × 1,10 × 1,30 → neto **1,81 m³**; total con excavación/placa según desglose.
3. Muro con pase de tubería dibujado desde vista frontal (adherido a la cara).
4. Contorno y sólido se mueven juntos; en giro libre no hay contorno 2D plano separado.
5. **SketchUp a)** Muro izq. + caja der.; en NE dibujar Ø0,30 en cara del muro hacia la caja (OSNAP medio), extruir 0,30 adentro, sustraer → pase en esa cara (no la opuesta) en todas las vistas.
6. **SketchUp b)** En SO, rectángulo en cara superior de la caja, extruir 0,50 afuera → pedestal pegado encima.
7. **SketchUp c)** En frontal, círculo sobre la caja → cara frontal (más cercana), nunca la de atrás.
8. **SketchUp d–e)** Al girar/cambiar vistas y al mover el conjunto, lo dibujado/extruido permanece pegado.

## Mantenimiento

1. Leer este contrato completo antes de editar código del esquema.
2. Añadir o actualizar una prueba automática por cada comportamiento tocado.
3. Ejecutar `npm run test:esquema` (y el job CI de esquema) antes de desplegar.
4. Actualizar este documento si el comportamiento aprobado cambia.
