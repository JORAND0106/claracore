using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;

namespace SicoePresupuestoNET8
{
    // Panel doble buffer para scroll suave
    internal sealed class DoubleBufferedPanel : Panel
    {
        public DoubleBufferedPanel()
        {
            DoubleBuffered = true;
            ResizeRedraw = true;
        }
    }

    public sealed class FrmAyuda : Form
    {
        // --- UI ---
        private TextBox txtBuscar;
        private Button btnBuscar;
        private TreeView tvIndice;
        private DoubleBufferedPanel pnlContenido;   // scroll + doble buffer
        private Label lblTitulo;

        // Documento (layout manual)
        private Panel doc;          // donde pintamos todo
        private int _y;             // cursor vertical

        // Mapa: clave de sección -> control “ancla” en el panel
        private readonly Dictionary<string, Control> _anchors = new(StringComparer.OrdinalIgnoreCase);

        public FrmAyuda()
        {
            BuildUI();
            BuildContent();   // Carga el manual
        }

        private void BuildUI()
        {
            Text = "Ayuda SicoeCAD — Manual de Usuario";
            StartPosition = FormStartPosition.CenterParent;
            Font = new Font("Segoe UI", 9F);
            Size = new Size(1050, 700);
            MinimumSize = new Size(900, 600);

            var main = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
            };
            main.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 300f));
            main.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            Controls.Add(main);

            // Panel izquierdo (búsqueda + índice)
            var left = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                RowCount = 3,
                Padding = new Padding(10),
            };
            left.RowStyles.Add(new RowStyle(SizeType.AutoSize));     // título
            left.RowStyles.Add(new RowStyle(SizeType.AutoSize));     // búsqueda
            left.RowStyles.Add(new RowStyle(SizeType.Percent, 100)); // árbol
            main.Controls.Add(left, 0, 0);

            var lblIndice = new Label
            {
                Text = "Índice",
                Font = new Font(Font, FontStyle.Bold),
                AutoSize = true,
                Margin = new Padding(0, 0, 0, 8)
            };
            left.Controls.Add(lblIndice);

            var buscarRow = new TableLayoutPanel
            {
                Dock = DockStyle.Top,
                ColumnCount = 2,
            };
            buscarRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            buscarRow.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 90));
            left.Controls.Add(buscarRow);

            txtBuscar = new TextBox { Text = "" };
            btnBuscar = new Button { Text = "Buscar" };
            btnBuscar.Click += (s, e) => BuscarTexto(txtBuscar.Text);
            buscarRow.Controls.Add(txtBuscar, 0, 0);
            buscarRow.Controls.Add(btnBuscar, 1, 0);

            tvIndice = new TreeView
            {
                Dock = DockStyle.Fill,
                HideSelection = false,
                Scrollable = true
            };
            tvIndice.NodeMouseDoubleClick += (s, e) =>
            {
                if (e.Node?.Tag is string id) GoTo(id);
            };
            left.Controls.Add(tvIndice);

            // Panel derecho (contenido)
            var right = new Panel
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(10),
                BackColor = Color.White
            };
            main.Controls.Add(right, 1, 0);

            lblTitulo = new Label
            {
                Text = "Manual de Usuario — SicoeCAD (SICOE)",
                Font = new Font("Segoe UI", 14F, FontStyle.Bold),
                AutoSize = true
            };
            right.Controls.Add(lblTitulo);

            pnlContenido = new DoubleBufferedPanel
            {
                Dock = DockStyle.Fill,
                AutoScroll = true,
                Location = new Point(0, 40)
            };
            right.Controls.Add(pnlContenido);
            pnlContenido.BringToFront();

            // Documento interno (layout manual)
            doc = new Panel
            {
                Left = 0,
                Top = 0,
                Width = pnlContenido.ClientSize.Width - 20,   // margen por scrollbar
                Height = 10,
                BackColor = Color.White
            };
            pnlContenido.Controls.Add(doc);

            // Reajustar anchos en resize
            pnlContenido.Resize += (s, e) => UpdateWrapWidths();
        }

        // =========================
        // C O N T E N I D O
        // =========================
        private void BuildContent()
        {
            pnlContenido.SuspendLayout();
            doc.SuspendLayout();

            doc.Controls.Clear();
            _anchors.Clear();
            _y = 10;

            AddToc();                  // Índice interno con hipervínculos
            AddHr();

            // Secciones (id, título, párrafos / tablas)
            AddSectionHeader("que-es", "¿Qué es SICOE y qué es SicoeCAD?");
            AddPara("SICOE es un sistema de control de cantidades. SicoeCAD es el plugin para AutoCAD que permite cargar catálogos, definir el eje y abscisado, seleccionar entidades con reglas claras y exportar a Excel.");
            AddList(new[]
            {
                "Cargar Catálogo de precios (capítulo → competencia → ítem).",
                "Cargar Catálogo PK_ID (la clave/código de tramo o sector).",
                "Definir eje y 0+000.00 para el abscisado.",
                "Seleccionar entidades (área/longitud/nodo), filtrar por ordenadas y etiquetar.",
                "Exportar a Excel con encabezados fijos."
            });

            AddSectionHeader("compat", "Compatibilidad y requisitos");
            AddList(new[]
            {
                "Windows 10/11 64-bit.",
                "AutoCAD (no LT), recomendado 2019 o superior.",
                "Excel 2016 o superior / Microsoft 365.",
                ".NET 8 instalado."
            });

            AddSectionHeader("archivos", "Archivos de entrada");
            AddPara("Se cargan dos CSV: (1) Catálogo de precios y (2) Catálogo PK_ID (CAPA). Los encabezados deben coincidir exactamente.");

            AddSubHeader("cat-precios", "3.1. Catálogo de precios (CSV)");
            AddPara("Encabezados obligatorios (exactos):");
            AddTable(new[] { "Capitulo", "Competencia", "Item", "Descripcion", "Und", "ValorUnitario" },
                new[]
                {
                    new[] {"Espacio Público","IDU","4.01","Demolición de andén en concreto","m2","32000"},
                    new[] {"Espacio Público","IDU","4.04","Sardineles prefabricados","ml","18000"}
                });
            AddPara("Reglas: los encabezados deben ser textuales; ValorUnitario soporta coma o punto; puedes tener más columnas, pero estas 6 deben existir.");

            AddSubHeader("cat-pkid", "3.2. Catálogo PK_ID / CAPA (CSV)");
            AddPara("En SicoeCAD el PK_ID es la misma clave que CAPA en el CSV. Es un código de tramo/sector que eliges en el formulario.");
            AddTable(new[] { "CAPA (PK_ID)", "CIV", "TRAMO", "INFRAESTRUCTURA", "CALZADA", "UBICACION", "ABS_INICIO", "ABS_FINAL" },
                new[]
                {
                    new[] {"10000","CIV-001","Tramo 1","CALZ","ORIENTE","CALZ-ORIENTE-CL25-CR30-33","",""},
                    new[] {"10001","CIV-014","Tramo 2","ANDEN","OCC","ANDEN-OCC-CL45-CR20-22","",""},
                    new[] {"10002","CIV-107","Tramo 3","CICLO","NORTE","CICLO-NORTE-AV68-CL12-CL22","",""},
                    new[] {"10003","CIV-215","Tramo 4","ZBANDA","SUR","ZBANDA-SUR-CL100-AV19-AV15","",""}
                });
            AddPara("¿Por qué PK_ID? Evita descripciones repetitivas y garantiza trazabilidad. Si tu obra no maneja PK_ID institucional, puedes crearlo (10010, 10011, …) con una UBICACION clara.");

            AddSectionHeader("preparar", "Preparar el dibujo antes de empezar");
            AddList(new[]
            {
                "Limpia/congela capas innecesarias.",
                "Verifica el sentido del eje que vas a cargar.",
                "Ten a mano patrones de hatch si usarás Área.",
                "Asegura que no haya selecciones previas si es tu primera corrida."
            });

            AddSectionHeader("eje", "Cargar el eje y definir el abscisado");
            AddList(new[]
            {
                "Pulsa CargueEje.",
                "Calzada Única: elige un eje y el punto 0+000.00.",
                "Doble Calzada: elige eje de Calzada A y B, y el 0+000.00 en cada uno.",
                "Define orientación (NS u EO). Esto controla izquierda/derecha para filtros.",
                "Define el intervalo de abscisado (p. ej., 10 m)."
            });
            AddTip("Si eliges por error un eje contrario a la orientación declarada, el sistema mostrará alertas de consistencia.");

            AddSectionHeader("form", "Llenar el formulario: paso a paso");
            AddList(new[]
            {
                "Capítulo → Competencia → Ítem (Ítem depende de los dos anteriores; al elegirlo se cargan Und y Valor Unitario).",
                "Capa / PK_ID (OBLIGATORIO): selecciona el código de tramo del CSV (columna CAPA).",
                "Tipo de entidad: Área (PL cerrada) / Longitud (línea/PL/PL3D) / Nodo (punto/bloque).",
                "Parámetros geométricos: Altura de texto > 0; Ancho y Espesor ≠ 0 (permiten negativos para descuentos).",
                "Campos adicionales: No. Inicio / No. Final (si aplica), Observación (opcional).",
                "Color: obligatorio (permite trazar y apagar capas de clones etiquetados).",
                "Tipo de ejecución: Presupuesto / Ejecutada / (Reportada, no operativo)."
            });
            AddPara("Ejemplos:");
            AddList(new[]
            {
                "Volumen (longitud): ml × ancho × espesor = m³",
                "Volumen (área): m² × espesor = m³",
                "Nodo: si un nodo representa 2 unidades (p. ej., dos protectores), regístralo en Observación."
            });

            AddSectionHeader("seleccion", "Seleccionar entidades y agregar (botón “+”)");
            AddList(new[]
            {
                "Pulsa Sel. dibujo, selecciona y ENTER. El sistema filtra según el tipo.",
                "Si hay válidas, se habilita “+”.",
                "Al pulsar “+”: se calculan abscisas por proyección, se aplican filtros por ordenadas, se clonan y etiquetan entidades en capas apagadas y se agrega UNA FILA POR ENTIDAD a la tabla.",
                "Si respondes NO a “¿agregar otro ítem?”, se eliminan los originales (quedan los clones con capa y etiqueta)."
            });
            AddPara("Ventajas: validación inmediata en la tabla (ítem, und, abs. inicio/fin, cantidades, costo). Puedes borrar filas desde el formulario cuando sea necesario.");

            AddSectionHeader("ordenadas", "Abscisas y filtros por ordenadas (izquierda/derecha)");
            AddPara("Cada entidad se proyecta al eje (A o B) y se mide su offset con signo (+ izquierda, − derecha). Se compara con límites definidos por calzada. Si excede, no se agrega.");
            AddTip("Evita errores: verifica el eje y 0+000.00, confirma orientación (NS/EO) y usa el PK_ID correcto por calzada.");

            AddSectionHeader("ejec", "Tipo de ejecución: qué significa cada opción");
            AddList(new[]
            {
                "Presupuesto de Obra: cantidades contractuales/preliminares.",
                "Obra Ejecutada: lo realmente construido (según levantamientos/dibujo).",
                "Obra Reportada: radicado para facturación (aún no operativo como módulo, pero SicoeCAD genera la data para comparativos)."
            });

            AddSectionHeader("absc-dibujo", "Dibujar abscisado sobre el eje (opcional)");
            AddList(new[]
            {
                "Textos a cada intervalo (incluye extremos y 0+000.00).",
                "Orientación automática en sentido del avance.",
                "Capas separadas para A/B o Única."
            });

            AddSectionHeader("excel", "Exportar a Excel");
            AddList(new[]
            {
                "Crear nuevo o abrir existente (mantienes trazabilidad).",
                "Hoja fija: “ResumenPresupuesto”.",
                "Encabezados fijos con formatos coherentes.",
                "Buenas prácticas: conserva copias por fecha/lote."
            });
            AddTable(
                new[] { "Pk_Id", "Capitulo", "Competencia", "Item", "Descripción", "Und", "Costado", "Tramo", "Abs. Inicio", "Abs. Final", "Vlr Unitario", "No. Inicio", "No. Final", "Area/Long/Nod", "Ancho", "Espesor", "Cant.Total", "Costo Directo", "Tipo de Ejecución", "Tipo de Entidad", "ID_Pol", "Observación" },
                rows: Array.Empty<string[]>());

            AddSectionHeader("casos", "Casos típicos y soluciones rápidas");
            AddList(new[]
            {
                "Mi área salió como perímetro: verifica Tipo de entidad = Área y que la PL esté CERRADA.",
                "Se coló algo de la calzada contraria: revisa orientación y límites de ordenadas; confirma eje y 0+000.00.",
                "Ítem incorrecto al agregar: elige Capítulo y Competencia antes de Ítem.",
                "Excel bloqueado: ciérralo y vuelve a exportar.",
                "Contador cambiado: no modificar salvo fuerza mayor; garantiza IDs únicos."
            });

            AddSectionHeader("buenas", "Buenas prácticas de uso");
            AddList(new[]
            {
                "Carga CSV de precios y PK_ID al inicio.",
                "Usa un color por ítem para identificar clones.",
                "Una Capa/PK_ID por conjunto coherente de entidades.",
                "En doble calzada, mide por calzada, no mezcles en un mismo “+”.",
                "Exporta con regularidad y versiona tus archivos."
            });

            AddSectionHeader("glosario", "Glosario");
            AddList(new[]
            {
                "Capítulo / Competencia / Ítem: estructura del catálogo de precios.",
                "Competencia: quién asume costos (IDU, EAB, CODENSA, ETB, etc.); si no aplica, usa la entidad contratante.",
                "Und: unidad del ítem (m², ml, u, etc.).",
                "PK_ID (CAPA): código del tramo que eliges en el formulario; es la clave de clasificación.",
                "CIV / TRAMO / INFRAESTRUCTURA / CALZADA / UBICACION: metadatos del PK_ID.",
                "Abscisa: distancia acumulada al 0+000.00.",
                "0+000.00: inicio del tramo (punto de referencia del abscisado).",
                "Ordenada: distancia perpendicular con signo respecto al eje.",
                "Tipo de entidad: Área / Longitud / Nodo.",
                "Altura de texto: tamaño de rotulación.",
                "Ancho / Espesor: parámetros geométricos (≠ 0).",
                "Tipo de ejecución: Presupuesto / Ejecutada / (Reportada).",
                "ID_Pol: etiqueta única de cada clon para trazabilidad."
            });

            AddSectionHeader("anexos", "Anexos: ejemplos de PK_ID");
            AddTable(new[] { "CAPA (PK_ID)", "UBICACION" },
                new[]
                {
                    new[] {"10000","CALZ-ORIENTE-CL25-CR30-33"},
                    new[] {"10001","ANDEN-OCC-CL45-CR20-22"},
                    new[] {"10002","CICLO-NORTE-AV68-CL12-CL22"},
                    new[] {"10003","ZBANDA-SUR-CL100-AV19-AV15"}
                });

            AddSectionHeader("chequeo", "Lista de chequeo rápida");
            AddList(new[]
            {
                "Cargué CSV de precios y CSV PK_ID.",
                "Cargué eje y punto 0+000.00 (y orientación si aplica).",
                "Elegí Capítulo → Competencia → Ítem; verifiqué Und/Valor.",
                "Seleccioné Capa/PK_ID (obligatorio).",
                "Definí Tipo de entidad, Altura, Ancho, Espesor; elegí Color.",
                "Seleccioné en dibujo, pulsé “+” y revisé la tabla.",
                "Exporté a Excel (nuevo o existente)."
            });

            // Construir el árbol (índice izquierdo)
            BuildTreeIndex();
                    // =============== NUEVAS SECCIONES 2025-10-11 — NO BORRAR ===============
                    // Actualizaciones del Módulo de Presupuesto (v9.x)
                    AddHr();
                    AddSectionHeader("presupuesto-actualizaciones", "Actualizaciones del Módulo de Presupuesto (v9.x)");

                    AddPara("Este capítulo enriquece el manual original sin eliminar nada de lo ya documentado. Resume y detalla las mejoras introducidas recientemente: buscador de entidades, ayuda contextual, carga de eje, cascada de información presupuestal, carga de PK_ID desde CSV, Tipo de ejecución, flujo de selección con clonación y adición múltiple de ítems sobre una misma entidad, y edición por doble clic en el grid.");

                    AddSubHeader("presupuesto-buscador", "1) Buscador de entidades (botón Buscar)");
                    AddList(new[]{
            "Ubicación: Formulario de Presupuesto → botón “Buscar”.",
            "Función: Permite localizar entidades ya trabajadas por SICOE (líneas, polilíneas, áreas) filtrando por PK_ID, Ítem, Capa o por selección directa en el dibujo.",
            "Flujo: (1) Presiona “Buscar” → (2) define el criterio → (3) ejecutar. El estado de capas se respeta; al finalizar, el plano retorna a su estado previo (no enciende todo).",
            "Buenas prácticas: realiza búsquedas por PK_ID cuando existan muchos ítems; usa filtro por tipo de entidad para acelerar."
        });

                    AddSubHeader("presupuesto-ayuda", "2) Botón de Ayuda (este formulario)");
                    AddList(new[]{
            "Índice con hipervínculos a cada sección.",
            "Contenido ampliado: incluye ahora Presupuesto v9.x y Topografía.",
            "Se recomienda leer “Flujos recomendados” antes de usar la función de clonación/encadenamiento de ítems."
        });

                    AddSubHeader("presupuesto-cargar-eje", "3) Cargar el Eje");
                    AddPara("Permite seleccionar/definir el eje de referencia (PK_ID, progresivas) y sincronizarlo con el formulario. El eje es la base para: (a) rotulación coherente, (b) cálculo por tramos, (c) consistencia de PK_ID al exportar.");

                    AddSubHeader("presupuesto-cascada", "4) Cascada de la Info Presupuestal");
                    AddList(new[]{
            "Cascada Capítulo → Competencia → Ítem (combo dependiente).",
            "La unidad (Und) y el Valor Unitario se cargan automáticamente según el Ítem.",
            "El combo Ítem muestra código + descripción (sin exponer precio en el formulario).",
            "Validaciones: no permite continuar si faltan Capítulo/Competencia/Ítem obligatorios."
        });

                    AddSubHeader("presupuesto-pkid-csv", "5) Carga de PK_ID desde CSV");
                    AddPara("Estructura mínima sugerida: CAPA(PK_ID), CIV, TRAMO, ESTRUCTURA, CALZADA, UBICACION, ABS_INICIO, ABS_FINAL. El PK_ID se usa para etiquetar y agrupar entidades. Si el CSV incluye ColorHex o metadatos adicionales (Costado/Tramo), el sistema puede utilizarlos para el DataGrid y la exportación a Excel.");
                    AddList(new[]{
            "El nombre de columnas debe coincidir con lo que se configuró en el módulo.",
            "Se admiten más columnas; las obligatorias deben existir y estar bien escritas.",
            "Codificación: UTF-8 (con BOM recomendado) para soportar tildes y ñ."
        });

                    AddSubHeader("presupuesto-tipo-ejecucion", "6) Tipo de ejecución (Obra ejecutada / Obra proyectada)");
                    AddPara("“Obra ejecutada” indica cantidades medidas en campo sobre lo realmente construido. “Obra proyectada” corresponde a cantidades previstas o de diseño. Este campo se exporta al XML/XLSX para distinguir claramente entre lo ejecutado y lo proyectado, útil en comparativos, cortes e informes.");
                    AddList(new[]{
            "Elige el tipo antes de seleccionar entidades para que quede asociado a cada registro.",
            "Puedes mezclar tipos en un mismo proyecto; cada registro conserva su etiqueta."
        });

                    AddSubHeader("presupuesto-flujo-multiitem", "7) Flujo de selección avanzada: múltiples ítems sobre la misma entidad + clonación");
                    AddList(new[]{
            "Tras seleccionar una entidad (línea, polilínea, área), el sistema permite:",
            "• Agregar más de un Ítem sobre esa misma geometría (ej.: andén + sardineles sobre la misma polilínea).",
            "• Clonar la entidad al tipo requerido (ej.: copiar una polilínea de eje y mover la copia a la capa compuesta por prefijo + Ítem).",
            "• Aplicar color/capa/rotulación/hatch según reglas vigentes y metadatos del CSV.",
            "Al responder “No” a la pregunta de “¿Agregar más ítems sobre la misma entidad?”, el sistema exporta los datos acumulados para esa ronda y reinicia el ciclo para una nueva selección."
        });
                    AddPara("Recomendación: define el Tipo de Entidad correcto (línea, polilínea, área) antes de empezar, y ten el PK_ID activo. Si usas hatch, selecciona el patrón (o el sólido) y confirme que la escala automática es legible.");

                    AddSubHeader("presupuesto-dgv-edicion", "8) Edición en DataGrid por doble clic");
                    AddList(new[]{
            "Doble clic sobre la fila precargada abre la edición puntual.",
            "Puedes corregir Ancho/Espesor/Altura/Observación, etc., y el registro se sincroniza con el cálculo y con la exportación.",
            "Atajo: usa TAB para navegar entre campos; si hay validaciones pendientes, el sistema informará qué falta completar."
        });

                    AddHr();
                    AddSubHeader("presupuesto-flujos", "Flujos recomendados");
                    AddList(new[]{
            "Flujo 1 (rápido): Cargar CSV de PK_ID → Cargar catálogo → Seleccionar entidad → Asignar Ítem → Exportar.",
            "Flujo 2 (multi-ítem): Seleccionar entidad → Agregar varios Ítems encadenados → Al finalizar, responder “No” → Exportar → Repetir.",
            "Flujo 3 (búsqueda): Usar “Buscar” para revisar entidades previas sin alterar el estado de capas; útil para auditoría."
        });

                    // Manual del Módulo de Topografía
                    AddHr();
                    AddSectionHeader("topografia", "Manual del Módulo de Topografía");

                    AddSubHeader("topo-importacion", "1) Importación de datos");
                    AddPara("El módulo permite importar nubes de puntos y referencias desde archivos CSV. Se insertan bloques predefinidos automáticamente (si existen en el dibujo) usando como nombre el valor de la columna “Bloque”. Se asignan coordenadas (Norte/Este/Cota) y descripción.");
                    AddTable(new[] { "Norte", "Este", "Cota", "Descripción", "Bloque" }, new[]{
            new []{"N (m)","E (m)","Z (m)","Texto libre","NombreExactoDelBloque"},
        });
                    AddList(new[]{
            "Si el bloque está cargado en el DWG y el nombre coincide exactamente, se inserta en la coordenada correspondiente.",
            "Si el bloque no existe, puedes definir un bloque por defecto o detener la importación para corregir.",
            "Contador automático: el sistema lleva consecutivo de inserciones para control y trazabilidad."
        });

                    AddSubHeader("topo-arquitectura-csv", "2) Arquitectura del CSV para Topografía");
                    AddList(new[]{
            "Encabezados recomendados: ID, Norte, Este, Cota, Descripción, Bloque.",
            "Separador: coma “,” (o el definido por tu configuración regional).",
            "Codificación: UTF-8 (con BOM) para compatibilidad de caracteres.",
            "Bloques compuestos (p.ej. “Caja” con varios puntos): el sistema ajusta los puntos al levantamiento, manteniendo consistencia geométrica."
        });
                    AddPara("Sugerencia: mantén una biblioteca de bloques estandarizados (nombres únicos y consistentes). Evita espacios y tildes en los nombres de bloque para mayor robustez.");

                    AddSubHeader("topo-unir-puntos", "3) Unir puntos + Vista previa + Etiquetado/Corte");
                    AddList(new[]{
            "Función “Unir Puntos”: permite seleccionar un conjunto de puntos insertados para generar geometrías (líneas/polilíneas).",
            "Vista previa: la ventana muestra el resultado antes de confirmar (útil para validar orden y dirección).",
            "Etiquetado: puede rotular automáticamente según reglas (altura de texto, estilo, prefijos).",
            "Corte automático: opción para segmentar la entidad de una vez, dejando etiquetas en tramos separados."
        });
                    AddPara("Consejo: define altura de texto desde el formulario antes de generar; verifica que la unidad de dibujo sea consistente con las alturas.");

                    AddSubHeader("topo-nombrar-entidades", "4) Nombrar entidades + asociación a Capítulo/Competencia");
                    AddList(new[]{
            "Mientras dibujas o confirmas la geometría, puedes asignar un nombre (alias) a cada entidad.",
            "Esa entidad puede asociarse a Capítulo y Competencia, preparando la trazabilidad para el módulo de Presupuesto.",
            "Esta asociación facilita filtros posteriores y la explotación de datos en informes o exportación a Excel/XML."
        });

                    AddHr();
                    AddSubHeader("topo-buenas-practicas", "Buenas prácticas Topografía");
                    AddList(new[]{
            "Establecer Sistema de Coordenadas del proyecto antes de importar.",
            "Mantener capas por tipo de elemento (puntos, ejes, bordes, etc.).",
            "Usar bloques con punto base correcto (0,0) y atributos claros.",
            "Verificar alturas de texto/escala de anotación en el formulario.",
            "Guardar una plantilla DWG con la biblioteca de bloques más usados."
        });
                    // =============== FIN NUEVAS SECCIONES 2025-10-11 ========================

            // Ajustar tamaño total del doc (alto) y wraps
            doc.Height = _y + 20;
            UpdateWrapWidths();

            doc.ResumeLayout(true);
            pnlContenido.ResumeLayout(true);
        }

        // =========================
        //   B L O Q U E S   U I
        // =========================

        private int WrapWidth => Math.Max(200, pnlContenido.ClientSize.Width - 60);

        private void AddToc()
        {
            var gb = AddGroup("Índice del Manual");
            var x = 10; var y = 24;

            void Link(string text, string id)
            {
                var l = new LinkLabel
                {
                    Text = "• " + text,
                    AutoSize = true,
                    Left = x,
                    Top = y,
                    LinkColor = Color.RoyalBlue
                };
                l.Click += (s, e) => GoTo(id);
                gb.Controls.Add(l);
                y = l.Bottom + 4;
            }

            // Índice original (se conserva)
            Link("¿Qué es SICOE y qué es SicoeCAD?", "que-es");
            Link("Compatibilidad y requisitos", "compat");
            Link("Archivos de entrada", "archivos");
            Link("3.1. Catálogo de precios (CSV)", "cat-precios");
            Link("3.2. Catálogo PK_ID / CAPA (CSV)", "cat-pkid");
            Link("Preparar el dibujo antes de empezar", "preparar");
            Link("Cargar el eje y definir el abscisado", "eje");
            Link("Llenar el formulario: paso a paso", "form");
            Link("Seleccionar entidades y agregar (botón “+”)", "seleccion");
            Link("Abscisas y filtros por ordenadas", "ordenadas");
            Link("Tipo de ejecución", "ejec");
            Link("Dibujar abscisado (opcional)", "absc");
            Link("Exportar a Excel", "excel");
            Link("Casos típicos y soluciones rápidas", "casos");
            Link("Buenas prácticas de uso", "buenas");
            Link("Glosario", "glosario");
            Link("Anexos: ejemplos de PK_ID", "anexos");
            Link("Lista de chequeo rápida", "check");

            // NUEVAS ENTRADAS – Presupuesto (v9.x)
            Link("Actualizaciones del Módulo de Presupuesto (v9.x)", "presupuesto-actualizaciones");
            Link("1) Buscador de entidades (botón Buscar)", "presupuesto-buscador");
            Link("2) Botón de Ayuda (contenido ampliado)", "presupuesto-ayuda");
            Link("3) Cargar el eje", "presupuesto-cargar-eje");
            Link("4) Cascada Capítulo → Competencia → Ítem", "presupuesto-cascada");
            Link("5) Carga de PK_ID desde CSV", "presupuesto-pkid-csv");
            Link("6) Tipo de ejecución: Ejecutada/Proyectada", "presupuesto-tipo-ejecucion");
            Link("7) Multi-Ítem sobre una misma entidad + Clonación", "presupuesto-flujo-multiitem");
            Link("8) Edición por doble clic en el DataGrid", "presupuesto-dgv-edicion");
            Link("Flujos recomendados", "presupuesto-flujos");

            // NUEVAS ENTRADAS – Topografía
            Link("Módulo de Topografía", "topografia");
            Link("1) Importación de datos", "topo-importacion");
            Link("2) Arquitectura del CSV (bloques por nombre exacto)", "topo-arquitectura-csv");
            Link("3) Unir puntos + Vista previa + Etiquetado/Corte", "topo-unir-puntos");
            Link("4) Nombrar entidades y asociar a Capítulo/Competencia", "topo-nombrar-entidades");
            Link("Buenas prácticas Topografía", "topo-buenas-practicas");
        }


        private void AddHr()
        {
            var sep = new Panel
            {
                BackColor = Color.Gainsboro,
                Height = 1,
                Width = WrapWidth,
                Left = 10,
                Top = _y + 8
            };
            Push(sep, heightAfter: 16);
        }

        private void AddSectionHeader(string id, string title)
        {
            var lbl = new Label
            {
                Text = title,
                Font = new Font("Segoe UI", 11F, FontStyle.Bold),
                AutoSize = true,
                Left = 10,
                Top = _y
            };
            _anchors[id] = lbl;
            Push(lbl, 8);
        }

        private void AddSubHeader(string id, string title)
        {
            var lbl = new Label
            {
                Text = title,
                Font = new Font("Segoe UI", 10F, FontStyle.Bold),
                AutoSize = true,
                Left = 18,
                Top = _y
            };
            _anchors[id] = lbl;
            Push(lbl, 6);
        }

        private void AddPara(string text)
        {
            var lbl = new Label
            {
                Text = text,
                AutoSize = true,
                MaximumSize = new Size(WrapWidth, 0),
                Left = 18,
                Top = _y,
                UseMnemonic = false
            };
            // Forzamos a calcular su tamaño ideal
            lbl.Size = lbl.PreferredSize;
            Push(lbl, 4);
        }

        private void AddList(IEnumerable<string> items)
        {
            foreach (var it in items)
            {
                var lbl = new Label
                {
                    Text = "• " + it,
                    AutoSize = true,
                    MaximumSize = new Size(WrapWidth, 0),
                    Left = 18,
                    Top = _y
                };
                lbl.Size = lbl.PreferredSize;
                Push(lbl, 2);
            }
            _y += 2;
        }

        private void AddTip(string text)
        {
            var pnl = new Panel
            {
                Left = 18,
                Top = _y,
                Width = WrapWidth,
                BackColor = Color.FromArgb(255, 249, 232),
                BorderStyle = BorderStyle.FixedSingle
            };
            var lbl = new Label
            {
                Text = "Consejo: " + text,
                AutoSize = true,
                MaximumSize = new Size(WrapWidth - 24, 0),
                Left = 8,
                Top = 8
            };
            lbl.Size = lbl.PreferredSize;
            pnl.Height = lbl.Bottom + 8;
            pnl.Controls.Add(lbl);
            Push(pnl, 6);
        }

        private GroupBox AddGroup(string title)
        {
            var gb = new GroupBox
            {
                Text = title,
                Left = 10,
                Top = _y,
                Width = WrapWidth + 20,
                Height = 60
            };
            return gb;
        }

        private void AddTable(string[] headers, IEnumerable<string[]> rows)
        {
            var grid = new TableLayoutPanel
            {
                Left = 18,
                Top = _y,
                AutoSize = true,
                ColumnCount = headers.Length,
                CellBorderStyle = TableLayoutPanelCellBorderStyle.Single
            };

            for (int i = 0; i < headers.Length; i++)
                grid.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));

            // headers
            for (int i = 0; i < headers.Length; i++)
            {
                grid.Controls.Add(new Label
                {
                    Text = headers[i],
                    Font = new Font(Font, FontStyle.Bold),
                    AutoSize = true,
                    Padding = new Padding(3)
                }, i, 0);
            }

            int r = 1;
            foreach (var row in rows)
            {
                for (int c = 0; c < headers.Length; c++)
                {
                    grid.Controls.Add(new Label
                    {
                        Text = row.ElementAtOrDefault(c) ?? "",
                        AutoSize = true,
                        Padding = new Padding(3)
                    }, c, r);
                }
                r++;
            }

            Push(grid, 6);
        }

        private void Push(Control c, int marginAfter = 0, int? heightAfter = null)
        {
            doc.Controls.Add(c);
            if (heightAfter.HasValue)
                _y += heightAfter.Value;
            else
                _y = Math.Max(_y, c.Bottom + marginAfter);
        }

        public void GoTo(string id)
        {
            if (!_anchors.TryGetValue(id, out var ctl)) return;
            pnlContenido.ScrollControlIntoView(ctl);
            ctl.Focus();
        }

        private void BuildTreeIndex()
        {
            tvIndice.BeginUpdate();
            tvIndice.Nodes.Clear();

            TreeNode N(string text, string id)
            {
                return new TreeNode(text) { Tag = id };
            }

            var root = N("Manual de Usuario", "que-es");

            // Secciones existentes (se conservan)
            root.Nodes.Add(N("¿Qué es SICOE y qué es SicoeCAD?", "que-es"));
            root.Nodes.Add(N("Compatibilidad y requisitos", "compat"));

            var nArch = N("Archivos de entrada", "archivos");
            nArch.Nodes.Add(N("3.1. Catálogo de precios (CSV)", "cat-precios"));
            nArch.Nodes.Add(N("3.2. Catálogo PK_ID / CAPA (CSV)", "cat-pkid"));
            root.Nodes.Add(nArch);

            root.Nodes.Add(N("Preparar el dibujo antes de empezar", "preparar"));
            root.Nodes.Add(N("Cargar el eje y definir el abscisado", "eje"));
            root.Nodes.Add(N("Llenar el formulario: paso a paso", "form"));
            root.Nodes.Add(N("Seleccionar entidades y agregar (botón “+”)", "seleccion"));
            root.Nodes.Add(N("Abscisas y filtros por ordenadas", "ordenadas"));
            root.Nodes.Add(N("Tipo de ejecución", "ejec"));
            root.Nodes.Add(N("Dibujar abscisado (opcional)", "absc"));
            root.Nodes.Add(N("Exportar a Excel", "excel"));
            root.Nodes.Add(N("Casos típicos y soluciones rápidas", "casos"));
            root.Nodes.Add(N("Buenas prácticas de uso", "buenas"));
            root.Nodes.Add(N("Glosario", "glosario"));
            root.Nodes.Add(N("Anexos: ejemplos de PK_ID", "anexos"));
            root.Nodes.Add(N("Lista de chequeo rápida", "check"));

            // ===== NUEVO BLOQUE 2025-10-11: Actualizaciones Presupuesto (v9.x)
            var nPres = N("Actualizaciones del Módulo de Presupuesto (v9.x)", "presupuesto-actualizaciones");
            nPres.Nodes.Add(N("1) Buscador de entidades (botón Buscar)", "presupuesto-buscador"));
            nPres.Nodes.Add(N("2) Botón de Ayuda (contenido ampliado)", "presupuesto-ayuda"));
            nPres.Nodes.Add(N("3) Cargar el eje", "presupuesto-cargar-eje"));
            nPres.Nodes.Add(N("4) Cascada Capítulo → Competencia → Ítem", "presupuesto-cascada"));
            nPres.Nodes.Add(N("5) Carga de PK_ID desde CSV", "presupuesto-pkid-csv"));
            nPres.Nodes.Add(N("6) Tipo de ejecución: Ejecutada/Proyectada", "presupuesto-tipo-ejecucion"));
            nPres.Nodes.Add(N("7) Multi-Ítem sobre una misma entidad + Clonación", "presupuesto-flujo-multiitem"));
            nPres.Nodes.Add(N("8) Edición por doble clic en el DataGrid", "presupuesto-dgv-edicion"));
            nPres.Nodes.Add(N("Flujos recomendados", "presupuesto-flujos"));
            root.Nodes.Add(nPres);

            // ===== NUEVO BLOQUE 2025-10-11: Módulo de Topografía
            var nTop = N("Módulo de Topografía", "topografia");
            nTop.Nodes.Add(N("1) Importación de datos", "topo-importacion"));
            nTop.Nodes.Add(N("2) Arquitectura del CSV (bloques por nombre exacto)", "topo-arquitectura-csv"));
            nTop.Nodes.Add(N("3) Unir puntos + Vista previa + Etiquetado/Corte", "topo-unir-puntos"));
            nTop.Nodes.Add(N("4) Nombrar entidades y asociar a Capítulo/Competencia", "topo-nombrar-entidades"));
            nTop.Nodes.Add(N("Buenas prácticas Topografía", "topo-buenas-practicas"));
            root.Nodes.Add(nTop);

            // Pintar árbol
            tvIndice.Nodes.Add(root);
            tvIndice.ExpandAll();

            // Navegación por doble clic (ya existe); añadimos también clic simple opcional
            tvIndice.NodeMouseClick += (s, e) =>
            {
                if (e.Node?.Tag is string id) GoTo(id);
            };

            tvIndice.EndUpdate();
        }


        private void BuscarTexto(string query)
        {
            if (string.IsNullOrWhiteSpace(query))
                return;

            // Buscamos recursivamente en el contenedor 'doc'
            Control hit = AllDescendants(doc)
                .FirstOrDefault(c =>
                    (c is Label || c is GroupBox || c is LinkLabel) &&
                    ((c.Text ?? string.Empty).IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0));

            if (hit != null)
            {
                pnlContenido.ScrollControlIntoView(hit);
                hit.Focus();
            }
            else
            {
                MessageBox.Show(this, "No se encontraron coincidencias.", "Ayuda", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }

        // Helpers
        private IEnumerable<Control> AllDescendants(Control root)
        {
            foreach (Control c in root.Controls)
            {
                yield return c;
                foreach (var k in AllDescendants(c)) yield return k;
            }
        }

        private void UpdateWrapWidths()
        {
            int wrap = WrapWidth;
            doc.Width = wrap + 20;

            foreach (Control c in doc.Controls)
            {
                if (c is Label lbl)
                {
                    lbl.MaximumSize = new Size(wrap, 0);
                    lbl.Size = lbl.PreferredSize; // recalcula altura tras cambiar wrap
                }
                else if (c is Panel p)
                {
                    // Tip panel: ajustar label interno
                    foreach (Control k in p.Controls)
                        if (k is Label kl)
                        {
                            kl.MaximumSize = new Size(wrap - 24, 0);
                            kl.Size = kl.PreferredSize;
                        }
                    p.Width = wrap;
                    // mantener su Bottom
                }
                else if (c is GroupBox gb)
                {
                    gb.Width = wrap + 20;
                }
                else if (c is TableLayoutPanel tl)
                {
                    tl.Left = 18; // mantener margen
                }
            }

            // ajustar alto total (mantener scroll correcto)
            doc.Height = Math.Max(doc.Height, doc.Controls.Cast<Control>().DefaultIfEmpty().Max(cc => cc.Bottom) + 20);
        }
    }
}
