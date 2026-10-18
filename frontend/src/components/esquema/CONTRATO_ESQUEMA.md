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
| C-2D-09 | Comandos de la barra: un clic activa, segundo clic sobre el mismo desactiva y vuelve a selección; activar otro desactiva el anterior; el botón refleja el estado activo. Nunca queda un comando activo que impida seleccionar, mover u otro comando. Unir/Sustraer/Cortar se desactivan con el segundo clic o al elegir otra herramienta. |
| C-2D-10 | Paneo/zoom/gestos sobre el área de dibujo no desplazan la página de atrás; el dibujo se mueve en el mismo sentido del arrastre (2D, vistas 3D, con cualquier comando). **Panel lateral ampliable desde su borde derecho** (línea visible; cursor `col-resize`; mouse y dedo); se reduce hasta el ancho mínimo de contrato; el área de dibujo se ajusta sin superposiciones. |
| C-2D-11 | **Zoom extendido:** botón con ícono y etiqueta; ajusta la vista para mostrar todo lo dibujado (2D + sólidos 3D) con margen proporcionado, sin cambiar dimensiones ni cotas. Funciona en 2D, seis vistas planas, isométricas y giro libre. |
| C-2D-12 | **Zoom ventana:** botón con ícono y etiqueta; trazar un rectángulo (mouse o dedo); al soltar, la vista se ajusta a esa zona y el comando se desactiva solo (modo selección). Mismas vistas que C-2D-11; no altera geometría. |

## 3D

| ID | Comportamiento |
|----|----------------|
| C-3D-01 | Botón modo 3D; en 3D no se ve el mapa; al salir, el 2D queda igual. |
| C-3D-02 | Seis vistas de dibujo (íconos de cara), isométricas NE/NO/SE/SO y giro libre. |
| C-3D-03 | Un solo espacio 3D con coordenadas reales para todas las vistas. |
| C-3D-04 | **Contorno y sólido = una sola entidad** en todas las vistas y acciones. Tras extruir, el contorno fuente no aparece separado del sólido (iso, giro libre, perfiles). Solo manijas en planta superior ortográfica si está seleccionado. |
| C-3D-05 | Extruir por cotas en superior/inferior (altura calculada visible en popup); por longitud (profundidad) en las demás vistas, sin alterar la figura. |
| C-3D-06 | Dibujo adherido a las caras; OSNAP 3D al dibujar y al mover (vértices, medios, centros de cara/círculo y de cilindro). Enganche fiable en las 6 vistas, isométricas y giro libre, también sobre resultados de Unir/Sustraer/Cortar; distancia de enganche constante en pantalla (independiente del zoom); resalte antes de soltar; mouse y dedo. |
| C-3D-07 | Mover libre de cualquier sólido (incluidos resultados de operaciones) sin cambiar dimensiones ni cotas; Dimensionar actualiza el volumen de inmediato. |
| C-3D-08 | Color aplicable a cualquier sólido. Cada sólido conserva el color elegido; sus seis caras se muestran con tonos distintos fijos (superior la más clara, inferior la más oscura; frontal, posterior, izquierda y derecha intermedios distintos). En cilindros y caras curvas el tono varía de forma gradual según la normal. Tonos visibles en vistas planas, isométricas, giro libre e imagen de memoria, también en resultados de Unir/Sustraer/Cortar. |
| C-3D-09 | Unir, Sustraer y Cortar con geometría y volumen exactos. Sustraer funciona en cadena sobre resultados previos (incl. Unir/Cortar) y admite varios operandos a la vez; el resultado conserva color y nombre del base. Los huecos se ven en todas las vistas. El desglose de memoria acumula todos los operandos sustraídos desde el exterior. Tras Sustraer el comando se desactiva. |
| C-3D-10 | Selección de sólidos internos. |
| C-3D-11 | Deshacer y Rehacer exactos, sin acciones que se repitan solas. |
| C-3D-12 | **Render limpio:** caras lisas y continuas (sin rayas, tramas ni patrones densos); solo aristas reales (bordes de caras y contornos de huecos); huecos cilíndricos como contornos circulares/elípticos limpios; aristas visibles continuas finas; ocultas punteadas finas; caras semitransparentes con tonos por cara. Editor e imagen de memoria se ven igual. Losas Z internas de teselación no aportan aristas (ni generatrices densas de cilindro). |
| C-3D-14 | Al seleccionar un sólido (dibujo o fila del cálculo) se resalta con contorno luminoso (halo + trazo claro) para confirmar cuál se está nombrando o agregando. |
| C-3D-15 | **Color pastel por vista plana:** inferior verde, frontal naranja, superior azul, posterior morado, lateral izquierda amarillo, lateral derecha rosa (suaves). El ícono del botón resalta la cara en ese color; al activar la vista el fondo del lienzo toma el mismo pastel. En isométricas, giro libre y 2D el lienzo conserva el fondo del tema. Memoria PNG y esquema PNG siguen con fondo blanco. |
| C-3D-16 | **Solevar:** botón con ícono y etiqueta. Al oprimir, el panel lateral abre la sección «Solevar» (tabla tipo Excel: Contorno, Forma, Dimensiones, Área, Base, Tapa; cotas; altura |Δcota|; Solevar/Cancelar). Resalte del contorno al pasar sobre la fila. Une dos contornos en planta (o contorno + nodo/vértice → pirámide/cono). Tras solevar, los contornos dejan de existir como entidades 2D independientes (base/tapa del sólido = una sola entidad; sin contornos sueltos en ninguna vista ni giro libre). Deshacer restituye los contornos originales. Volumen exacto; sólidos normales (mover, color, unir, sustraer, cortar, cálculo). |

## Cuadro de despiece de acero

| ID | Comportamiento |
|----|----------------|
| C-DES-01 | Botón con ícono y etiqueta «Cuadro de despiece» (2D y 3D). Abre sección del panel lateral tipo Excel. Nombre del cuadro obligatorio; varios cuadros por esquema. |
| C-DES-02 | «Agregar posición» abre popup: Posición (obligatoria), Diámetro (lista NTC 2289 / #3,#4,…; peso kg/m automático de la tabla de plataforma), N° piezas, Forma (biblioteca con miniaturas). Al elegir forma: dibujo grande, un campo por segmento (cm); resalte del segmento activo; al confirmar pasa al siguiente. Segmentos Única o Variable (mín/máx → promedio). Live: longitud parcial, total y peso. Editar al tocar fila; se puede eliminar. |
| C-DES-03 | Long. parcial (m) = Σ segmentos cm (promedio si variable) / 100. Long. total = parcial × N° piezas. Peso kg = total × kg/m de la tabla. kg/m con la precisión de la tabla; longitudes y pesos a 2 decimales; Total = suma de pesos mostrados. |
| C-DES-04 | Columnas: Posición \| N° \| N° piezas \| Long. parcial \| Forma L=(cm) \| Long. total \| Peso kg/m \| Peso kg \| Total (celda combinada). Forma muestra dibujo y cotas; variables como «Var. mín a máx» + «Prom. valor». Sin subtotales por grupo. |
| C-DES-05 | Biblioteca de plataforma: recta, L, doble gancho (U), gancho 180°, **doble gancho a 180°** (gancho–tramo–gancho), **fleje comercial 135°** (cerrado; ganchos en la misma esquina hacia el interior; popup Lado A, Lado B, longitud de cada gancho; L = 2A+2B+2G; posiciones legadas migran conservando valores), aro, espiral (Ø, paso, vueltas; L = n×√((π·Ø)²+paso²)), escalonada Z. El usuario crea formas con polilínea (segmentos nombrados); quedan disponibles para todos los usuarios del contrato. |
| C-DES-06 | Al guardar el esquema, cada cuadro genera PNG hi-res (fondo blanco, encabezado con nombre/fecha/marca, cuadro legible) y se adjunta al registro (miniatura, vista previa, descarga), igual que la memoria de volúmenes. Los cuadros viven en el borrador y se editan al continuar. |

## Cálculo de volúmenes

| ID | Comportamiento |
|----|----------------|
| C-CALC-01 | Varios cálculos por esquema; elementos con nombre obligatorio (sin «Sólido N» automático), Suma/Descuenta y «Descuenta de». No se guarda el cálculo con nombres vacíos. |
| C-CALC-02 | Solo se descuenta el volumen común con el sólido indicado. |
| C-CALC-03 | **Popup de datos (estilo Excel):** al oprimir «+ Sólidos seleccionados» se abre un popup amplio con una fila por sólido (color, forma, volumen, Nombre vacío obligatorio, Op +/−, Descuenta de). No se confirma sin nombres. En el panel lateral la lista muestra solo el nombre de cada sólido y el total al final. Hover/mantener sobre un nombre muestra etiqueta (operación, descuenta de, forma, volumen) y resalta el sólido; clic abre el mismo popup para editar. |
| C-CALC-04 | Cálculo dinámico con el esquema abierto; fijo al cerrarlo. |
| C-CALC-05 | Al seleccionar un sólido en el dibujo para el cálculo se carga exactamente la información de ese sólido. Al tocar un nombre de la lista, el sólido se resalta (C-3D-14). |

## Salidas

| ID | Comportamiento |
|----|----------------|
| C-OUT-01 | Esquema guardado como PNG hi-res con fondo blanco. |
| C-OUT-02 | Memoria = una sola PNG vertical: encabezado, isométrico y tabla; textos proporcionales y legibles; iso ≤ ~½ altura. |
| C-OUT-03 | Tabla de memoria: #, color, nombre, operación, Descuenta de, **Dimensiones**, **Fórmula**, volumen. Dimensiones y Fórmula usan la fórmula natural de la figura (prisma: L×A×H; cilindro: π×r²×L con Ø y L; tronco de pirámide: h/3×(A₁+A₂+√(A₁·A₂)); tronco de cono: π×h/3×(R²+R·r+r²); pirámide: A×h/3; cono: π×r²×h/3; transición: h/6×(A₁+4·Aₘ+A₂); base irregular: área×altura; etc.). Si un sólido descontado atraviesa a otro, L es la longitud efectiva dentro del sólido **y la fórmula usa exactamente esos valores (resultado = volumen de la fila)**. Ningún texto se corta ni se solapan encabezados (columnas ajustadas / hasta 2 líneas). Desglose completo de booleanos: N exterior, N.1… descuentos, N.k neto (sin dimensiones; operación entre filas). Total = suma de valores mostrados. |
| C-OUT-04 | Adjunto con miniatura, vista previa y descarga. |
| C-OUT-05 | Guardar borrador y continuarlo con todo funcionando igual. |
| C-OUT-06 | En la PNG, la tabla de memoria ocupa ~½ del ancho del isométrico, centrada debajo, legible al ver la imagen completa. |

## Transversal

| ID | Comportamiento |
|----|----------------|
| C-TX-01 | Mismo comportamiento en todos los módulos que invocan la herramienta (iPad, portátil, celular). |
| C-TX-02 | **Se puede dibujar** en 2D y en 3D: los eventos pointer/touch llegan al canvas. Prohibido `stopPropagation` en fase *capture* del contenedor padre del lienzo. Extruir: popup de cotas (sup/inf) y de longitud (otras vistas). |

## Casos de verificación obligatorios

1. Excavación 1,90 × 2,30 m, cotas 2,60 → 0,00 → **11,36 m³**.
2. Poceta 1,50³ con vacío 1,10 × 1,10 × 1,30 → neto **1,81 m³**; total con excavación/placa según desglose.
3. Muro con pase de tubería dibujado desde vista frontal (adherido a la cara).
4. Contorno y sólido se mueven juntos; en giro libre no hay contorno 2D plano separado.
5. **Regresión:** en las seis vistas planas un círculo se ve como círculo (ambos ejes), no como línea.
6. **Regresión:** OSNAP al dibujar y al mover (vértices, medios, centros).
7. **Regresión:** Extruir abre popup de cotas (altura calculada) en superior/inferior; por longitud en frontal/laterales/posterior.
8. Cubo de un color: vista frontal y posterior con tonos distintos; en NE se distinguen las tres caras visibles.
9. OSNAP en las 6 vistas y NE sobre cubo y cilindro (vértices, medios, centros de cara), con zoom alejado y cercano: engancha siempre.
10. Cubo 1,50³ − interior 1,10×1,10×1,30; al resultado restar dos cilindros: huecos visibles, render limpio (sin rayas densas), volumen exacto.
11. Activar y desactivar con dos clics cada comando de la barra (y Unir/Sustraer/Cortar) → modo selección.
12. Paneo en el área de dibujo (dedo/mouse) en 2D, superior y NE.
13. Popup de cálculo con nombres; lista de nombres; panel lateral ampliable por su borde.
14. **Regresión:** pointer/touch llegan al canvas; se puede dibujar en 2D y 3D.
15. Selección correcta en cálculo + resalte.
16. Zoom extendido / Zoom ventana.
17. Memoria de poceta perforada: filas 1, 1.1, 1.2, 1.3, 1.4 con fórmulas naturales y total neto.
18. Tabla PNG ~½ ancho, columnas Dimensiones y Fórmula; textos completos sin solapes.
19. Poceta perforada en editor (NE / giro libre) y memoria: caras lisas, solo aristas reales, huecos limpios.
20. Cada vista plana pinta el lienzo con su pastel; al volver a NE el fondo es el del tema.
21. Solevar: tronco 2×2→1,5×1,5 = 6,17 m³ (centrado y desplazado); tronco de cono 3,67; pirámide 2,67; cono 2,09; transición con Aₘ; sustraer cilindro conserva fórmulas; vistas 6+iso+órbita.
22. Solevar en panel lateral con áreas; tras solevar no hay contornos sueltos (giro libre / iso / vistas); Deshacer restituye contornos.
23. Despiece: As1 20+155+20 ×16 → 1,95 / 31,20 m; As1a var. 40–118; As2 var. 160–236; total = suma de pesos (tabla NTC #4=0,99 kg/m); fleje/espiral/forma usuario; PNG adjunto; borrador.
24. Despiece formas: doble gancho 180° 15+150+15 ×10 → 1,80 / 18,00 m; fleje comercial 22×22 ganchos 6 ×50 → 1,00 / 50,00 m; fleje legado migra conservando valores; Ø 1/4" en lista NTC.

Las pruebas de `esquema3dRegresionPreSketchup.scenario.test.js`, `esquema3dTonosOsnapSustraer.scenario.test.js`, `esquemaComandosPaneoNombres.scenario.test.js`, `esquemaDibujoPointer.regression.test.js`, `esquemaCorreccionesZoomExcel.scenario.test.js`, `esquemaRenderMemoriaPopup.scenario.test.js`, `esquemaPastelRenderTabla.scenario.test.js`, `esquemaSolevar.scenario.test.js`, `esquemaSolevarPanel.scenario.test.js`, `esquemaDespiece.scenario.test.js` y `esquemaDespieceFleje180.scenario.test.js` bloquean el despliegue si se rompe 5–24.

## Mantenimiento

1. Leer este contrato completo antes de editar código del esquema.
2. Añadir o actualizar una prueba automática por cada comportamiento tocado.
3. Ejecutar `npm run test:esquema` (y el job CI de esquema) antes de desplegar.
4. Actualizar este documento si el comportamiento aprobado cambia.
