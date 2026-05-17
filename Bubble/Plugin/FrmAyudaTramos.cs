using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;

namespace SicoePresupuestoNET8
{
    /// <summary>
    /// Manual de ayuda específico para el formulario de Tramos de Tubería (FrmNombrarTramo).
    /// Explica cada campo de la grilla, los cálculos geométricos y los casos típicos.
    /// </summary>
    public sealed class FrmAyudaTramos : Form
    {
        // ── UI ───────────────────────────────────────────────────────────────
        private TextBox            txtBuscar;
        private Button             btnBuscar;
        private TreeView           tvIndice;
        private Panel              pnlContenido;
        private Label              lblTitulo;
        private Panel              doc;
        private int                _y;
        private readonly Dictionary<string, Control> _anchors =
            new(StringComparer.OrdinalIgnoreCase);

        public FrmAyudaTramos()
        {
            BuildUI();
            BuildContent();
        }

        // ════════════════════════════════════════════════════════════════════
        //  CONSTRUCCIÓN DE LA INTERFAZ
        // ════════════════════════════════════════════════════════════════════
        private void BuildUI()
        {
            Text             = "Ayuda — Formulario de Tramos de Tubería";
            StartPosition    = FormStartPosition.CenterParent;
            Font             = new Font("Segoe UI", 9F);
            Size             = new Size(1100, 750);
            MinimumSize      = new Size(950, 620);
            BackColor        = Color.FromArgb(245, 248, 255);

            var main = new TableLayoutPanel
            {
                Dock = DockStyle.Fill, ColumnCount = 2
            };
            main.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 280f));
            main.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            Controls.Add(main);

            // ── Panel izquierdo ───────────────────────────────────────────
            var left = new TableLayoutPanel
            {
                Dock = DockStyle.Fill, RowCount = 3,
                Padding = new Padding(10),
                BackColor = Color.FromArgb(235, 242, 255)
            };
            left.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            left.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            left.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            main.Controls.Add(left, 0, 0);

            var lblIdx = new Label
            {
                Text = "Índice de contenidos",
                Font = new Font("Segoe UI", 9.5F, FontStyle.Bold),
                AutoSize = true,
                Margin = new Padding(0, 0, 0, 8),
                ForeColor = Color.FromArgb(10, 33, 64)
            };
            left.Controls.Add(lblIdx);

            var buscarRow = new TableLayoutPanel
            {
                Dock = DockStyle.Fill, ColumnCount = 2, Height = 30, Margin = new Padding(0,0,0,6)
            };
            buscarRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            buscarRow.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            txtBuscar = new TextBox { Dock = DockStyle.Fill };
            btnBuscar = new Button { Text = "🔍", Width = 30 };
            buscarRow.Controls.Add(txtBuscar, 0, 0);
            buscarRow.Controls.Add(btnBuscar, 1, 0);
            left.Controls.Add(buscarRow);

            tvIndice = new TreeView
            {
                Dock = DockStyle.Fill,
                BorderStyle = BorderStyle.None,
                BackColor = Color.FromArgb(235, 242, 255),
                Font = new Font("Segoe UI", 8.5F)
            };
            left.Controls.Add(tvIndice);

            // ── Panel derecho (contenido) ─────────────────────────────────
            var right = new Panel { Dock = DockStyle.Fill, Padding = new Padding(0) };
            main.Controls.Add(right, 1, 0);

            lblTitulo = new Label
            {
                Text = "Manual de Tramos de Tubería — SicoeCAD",
                Font = new Font("Segoe UI", 13F, FontStyle.Bold),
                ForeColor = Color.FromArgb(10, 33, 64),
                Dock = DockStyle.Top,
                Height = 36,
                TextAlign = ContentAlignment.MiddleLeft,
                Padding = new Padding(10, 0, 0, 0),
                BackColor = Color.FromArgb(220, 232, 255)
            };
            right.Controls.Add(lblTitulo);

            pnlContenido = new Panel
            {
                Dock = DockStyle.Fill,
                AutoScroll = true,
                BackColor = Color.White,
                Padding = new Padding(10)
            };
            right.Controls.Add(pnlContenido);

            doc = new Panel
            {
                AutoSize = false,
                Left = 0, Top = 0,
                Width = 900
            };
            pnlContenido.Controls.Add(doc);

            // Eventos
            tvIndice.AfterSelect += (s, e) =>
            {
                if (e.Node?.Tag is string id) GoTo(id);
            };
            btnBuscar.Click += BtnBuscar_Click;
            txtBuscar.KeyDown += (s, e) =>
            {
                if (e.KeyCode == Keys.Enter) BtnBuscar_Click(null, null);
            };
            pnlContenido.SizeChanged += (s, e) => UpdateWrapWidths();

            BuildTreeIndex();
        }

        // ════════════════════════════════════════════════════════════════════
        //  CONTENIDO DEL MANUAL
        // ════════════════════════════════════════════════════════════════════
        private void BuildContent()
        {
            pnlContenido.SuspendLayout();
            doc.SuspendLayout();
            doc.Controls.Clear();
            _anchors.Clear();
            _y = 10;

            // ── Índice rápido con hipervínculos ──────────────────────────
            AddToc();
            AddHr();

            // ═════════════════════════════════════════════════════════════
            AddSectionHeader("intro", "1. ¿Para qué sirve este formulario?");
            AddPara("El formulario de Tramos de Tubería te permite registrar, calcular y vincular al presupuesto las cantidades de obra asociadas a la instalación de redes (sanitaria, pluvial, acueducto, gas, telecomunicaciones, etc.).");
            AddPara("Cada fila de la grilla representa UN tramo de tubería entre dos nodos. A partir de los datos que ingresas, el sistema calcula automáticamente: volumen de excavación, volumen de atraque, volumen de relleno granular, área de entibado, longitud de tubería y cinta.");
            AddTip("Antes de usar este formulario, los nodos deben estar previamente nombrados con el formulario de Nodos. Los nombres de Nodo Inicial y Nodo Final deben coincidir exactamente.");

            // ═════════════════════════════════════════════════════════════
            AddSectionHeader("nodos", "2. Nodo Inicial y Nodo Final");
            AddPara("Son los nombres que identifican los extremos del tramo. Deben ser exactamente los mismos que asignaste en el formulario de Nodos — sin espacios adicionales, sin cambiar mayúsculas.");
            AddList(new[]
            {
                "Correcto: 'PZ-01', 'PZ-02' (tal como están en el formulario de Nodos).",
                "Incorrecto: 'pz-01', 'PZ 01', ' PZ-01' (con espacio al inicio).",
                "Si no coinciden, el sistema no podrá calcular longitudes ni vincular la geometría."
            });
            AddTip("Copia y pega el nombre desde el formulario de Nodos para evitar errores de escritura.");

            // ═════════════════════════════════════════════════════════════
            AddSectionHeader("cotas", "3. Rasante y Clave — ¿qué son?");
            AddPara("Estos campos representan elevaciones (cotas) en metros sobre el nivel del mar (o el datum de tu proyecto).");
            AddTable(
                new[] { "Campo", "Significado", "Ejemplo" },
                new[]
                {
                    new[] { "Rasante Inicial / Final", "Cota de la superficie del terreno o pavimento en cada extremo del tramo.", "2563.450 m" },
                    new[] { "Clave Inicial / Final", "Cota de la parte superior (clave) de la tubería en cada extremo.", "2561.200 m" }
                });
            AddPara("Con estos cuatro valores el sistema calcula: promedio de rasante, promedio de clave, cota de fondo de excavación y altura de excavación automática.");
            AddTip("Si ingresas 0 en todos los campos de cota, el sistema no puede calcular la altura automáticamente. En ese caso debes usar el campo 'Altura exc. manual'.");

            // ═════════════════════════════════════════════════════════════
            AddSectionHeader("diametro", "4. Diámetro de la tubería");
            AddPara("Ingresa el diámetro NOMINAL (interno) de la tubería. El sistema acepta tres formatos:");
            AddTable(
                new[] { "Formato", "Ejemplo", "Interpretación" },
                new[]
                {
                    new[] { "Pulgadas (con comillas)", "\"12\"", "12 pulgadas = 304.8 mm" },
                    new[] { "Metros (decimal, sin comillas)", "0.30", "0.30 m = 300 mm" },
                    new[] { "Milímetros (entero, sin comillas)", "300", "300 mm" },
                    new[] { "Múltiples tubos", "6Ø6\"+3Ø3\"", "6 tubos de 6\" + 3 tubos de 3\"" }
                });
            AddTip("Si usas pulgadas, escribe las comillas dobles: \"12\". Si omites las comillas, el valor se interpreta en metros (si es < 1.0) o en milímetros (si es ≥ 1.0).");
            AddList(new[]
            {
                "Caso red de acueducto DN 300: escribe 0.30 ó 300 ó \"12\" (son equivalentes).",
                "Caso red sanitaria PVC 8\": escribe \"8\" con comillas.",
                "Caso red compuesta: 2Ø8\"+1Ø6\" (2 tubos de 8 pulgadas + 1 tubo de 6 pulgadas)."
            });

            // ═════════════════════════════════════════════════════════════
            AddSectionHeader("espesor", "5. Espesor de la tubería (m)");
            AddPara("Es el espesor de la PARED de la tubería, expresado en metros. No es el diámetro externo; es cuánto mide la pared del tubo.");
            AddTable(
                new[] { "Tipo de tubería", "Espesor típico (m)" },
                new[]
                {
                    new[] { "PVC sanitario DN 200", "0.009 m (9 mm)" },
                    new[] { "Concreto reforzado DN 600", "0.075 m (75 mm)" },
                    new[] { "Polietileno HDPE DN 315", "0.019 m (19 mm)" }
                });
            AddPara("El espesor se suma al diámetro nominal para obtener el diámetro externo: Ø_ext = Ø_nominal + 2 × espesor.");
            AddTip("Si no conoces el espesor exacto, consulta la ficha técnica del fabricante. Un error en este valor afecta directamente el cálculo del atraque y relleno.");

            // ═════════════════════════════════════════════════════════════
            AddSectionHeader("ancho", "6. Ancho de excavación (m)");
            AddPara("Es el ancho de la zanja que se va a excavar, medido en metros. Incluye el espacio necesario para instalar la tubería más los márgenes de trabajo.");
            AddList(new[]
            {
                "Para una tubería de 300 mm en zona urbana, el ancho mínimo suele ser 0.60 m.",
                "Para una tubería de 600 mm, podría ser 1.20 m según especificaciones.",
                "Este valor lo define el especialista de redes o la norma técnica del contrato."
            });
            AddTip("El ancho de excavación es la base de todos los cálculos volumétricos. Verifica que corresponda al ancho real de la zanja, no al ancho del tubo.");

            // ═════════════════════════════════════════════════════════════
            AddSectionHeader("cimentacion", "7. Cimentación (m)");
            AddPara("Es el espesor de la CAMA DE ARENA (o material granular) que va debajo de la tubería, antes de posarla. Se mide en metros.");
            AddPara("Su función es distribuir uniformemente las cargas sobre el tubo y protegerlo del fondo irregular de la excavación.");
            AddTable(
                new[] { "Caso", "Cimentación típica" },
                new[]
                {
                    new[] { "Red sanitaria PVC", "0.10 m (10 cm de arena)" },
                    new[] { "Red de acueducto", "0.15 m (15 cm de material granular)" },
                    new[] { "Red pluvial concreto", "0.15 – 0.20 m" }
                });
            AddPara("La cimentación afecta la cota de fondo de excavación: cuanto mayor sea, más profunda queda la zanja.");
            AddTip("La cimentación NO genera un ítem de presupuesto separado en este formulario. Su función es solo geométrica: ajustar la cota de fondo y la altura del atraque.");

            // ═════════════════════════════════════════════════════════════
            AddSectionHeader("alt-exc-manual", "8. Altura de excavación manual (m)");
            AddPara("⚠️ CAMPO OPCIONAL — Solo usa este campo cuando NO tienes cotas de rasante y clave, o cuando necesitas anular el cálculo automático.");
            AddPara("Normalmente la altura de excavación se calcula automáticamente así:");
            AddList(new[]
            {
                "Altura auto = Rasante promedio − Cota fondo excavación.",
                "Cota fondo = Clave promedio − (Ø nominal + espesor + cimentación)."
            });
            AddPara("Si ingresas un valor en 'Altura exc. manual', este REEMPLAZA completamente el cálculo automático. Úsalo cuando:");
            AddList(new[]
            {
                "Las cotas no están disponibles aún (diseño en curso).",
                "La altura de excavación es estándar por especificación (p.ej., siempre 1.50 m).",
                "Necesitas sobreescribir el cálculo por un valor de ingeniería específico."
            });
            AddTip("Si ya ingresaste cotas, NO llenes este campo. Si lo llenas, las cotas son ignoradas para el cálculo de altura. Para volver al cálculo automático, borra el valor de este campo.");

            // ═════════════════════════════════════════════════════════════
            AddSectionHeader("atraque", "9. Atraque — el campo más importante ⭐");
            AddPara("El atraque es el material granular (usualmente recebo o arena) que rodea la tubería hasta cierta altura, garantizando su soporte lateral y resistencia a cargas. Este campo acepta DOS formatos:");

            AddSubHeader("atraque-prop", "9.1. Formato proporcional: 1:3, 1:4, 1:2...");
            AddPara("Usa este formato para REDES HÚMEDAS: sanitaria, pluvial, acueducto y gas. Indica qué fracción del diámetro externo cubre el atraque.");
            AddTable(
                new[] { "Formato", "Significado", "Ejemplo con Ø ext = 0.30 m" },
                new[]
                {
                    new[] { "1:4", "El atraque cubre 1/4 del diámetro externo desde el fondo", "h_atraque = 0.075 m" },
                    new[] { "1:3", "El atraque cubre 1/3 del diámetro externo", "h_atraque = 0.100 m" },
                    new[] { "1:2", "El atraque cubre la mitad del diámetro (eje del tubo)", "h_atraque = 0.150 m" },
                    new[] { "3:4", "El atraque cubre 3/4 del diámetro", "h_atraque = 0.225 m" },
                    new[] { "1:1", "El atraque cubre el tubo completo (Escenario A)", "h_atraque = 0.300 m" }
                });
            AddPara("Con la proporción, el sistema usa la fórmula exacta de segmento circular para descontar el área del tubo y calcular el volumen de material real:");
            AddList(new[]
            {
                "Área neta atraque = ancho_zanja × (cimentación + h_atraque) − área_segmento_circular(h_atraque).",
                "El relleno granular arranca exactamente donde termina el atraque y cubre el tubo restante.",
                "Este cálculo respeta la geometría real del tubo — no es una aproximación."
            });
            AddTip("La proporción a usar la define el especialista de redes o la norma del contrato. Para redes sanitarias y pluviales es común 1:4 o 1:3. Para acueducto puede ser hasta 1:2.");

            AddSubHeader("atraque-decimal", "9.2. Formato decimal: 0.50, 0.80...");
            AddPara("Usa este formato para REDES SECAS (eléctricas, telecomunicaciones, ductos) o cuando tienes múltiples tubos de diferentes diámetros y una altura fija de atraque.");
            AddTable(
                new[] { "Ejemplo", "Interpretación" },
                new[]
                {
                    new[] { "0.50", "El atraque tiene 0.50 m de altura desde el fondo de la cimentación" },
                    new[] { "0.80", "El atraque tiene 0.80 m de altura" }
                });
            AddPara("Con el formato decimal, el cálculo es:");
            AddList(new[]
            {
                "Vol. atraque = LongitudMED × ancho_zanja × h_atraque − LongitudMED × área_ext_tubos.",
                "Vol. relleno = LongitudMED × ancho_zanja × (altura_exc − h_atraque).",
                "Se aplica para redes compuestas como 6Ø6\"+3Ø3\" donde no hay una sola proporción definida."
            });
            AddTip("Si ingresas una proporción (ej: 1:3) pero el diámetro está vacío o en cero, el cálculo dará resultados incorrectos. Siempre verifica que el diámetro esté correctamente ingresado.");

            // ═════════════════════════════════════════════════════════════
            AddSectionHeader("estruc", "10. Estructura de vía / Espacio Público (m)");
            AddPara("Este campo permite descontar de la altura de excavación el espesor de la estructura de pavimento o del espacio público existente.");
            AddPara("¿Cuándo usarlo? Cuando la excavación pasa por debajo de un andén, calzada o estructura ya construida y ese espesor NO debe contarse como excavación de tierra (tiene otro ítem o se liquida aparte).");
            AddTable(
                new[] { "Ejemplo", "Valor a ingresar" },
                new[]
                {
                    new[] { "Andén en concreto de 0.15 m", "0.15" },
                    new[] { "Calzada: base 0.20 m + carpeta 0.07 m", "0.27" },
                    new[] { "No hay estructura de vía", "0 (dejar vacío)" }
                });
            AddPara("El sistema descuenta este valor de la altura de excavación: Altura_exc_final = Altura_base − Estruc_Via_EP.");
            AddTip("Si no hay estructura de vía, deja este campo vacío o en cero. No afecta otros cálculos.");

            // ═════════════════════════════════════════════════════════════
            AddSectionHeader("panel-info", "11. Panel 'Información de tramo' — qué muestra");
            AddPara("Al seleccionar una fila en la grilla, el panel izquierdo muestra los resultados calculados automáticamente:");
            AddTable(
                new[] { "Campo", "Descripción" },
                new[]
                {
                    new[] { "Área externa tubería (m²)", "Suma del área de la sección circular de todos los tubos (π×r²_ext × n_tubos). Es 0 si el diámetro está vacío." },
                    new[] { "Pendiente m(%)", "Pendiente de la tubería calculada entre claves de inicio y fin." },
                    new[] { "Rasante promedio (m)", "Promedio de Rasante Inicial y Final." },
                    new[] { "Clave promedio (m)", "Promedio de Clave Inicial y Final." },
                    new[] { "Fondo excavación prom.", "Clave prom. − (Ø nominal + espesor + cimentación)." },
                    new[] { "Altura de excavación (m)", "Rasante prom. − Fondo exc. (o el valor manual si se ingresó)." },
                    new[] { "Área neta atraque (m²)", "Área real del atraque: ancho × altura_atraque − segmento_circular. Solo en formato proporcional." },
                    new[] { "Área neta relleno (m²)", "Área real del relleno: ancho × altura_relleno − área_tubo_restante. Solo en formato proporcional." }
                });
            AddTip("Los campos 'Área neta atraque' y 'Área neta relleno' son de VERIFICACIÓN. Puedes multiplicarlos por la longitud del tramo para comparar con tu cálculo manual.");

            // ═════════════════════════════════════════════════════════════
            AddSectionHeader("cantidades", "12. Panel 'Cantidades del tramo' — cómo se calculan");
            AddTable(
                new[] { "Concepto", "Fórmula", "Longitud usada" },
                new[]
                {
                    new[] { "Excavación (m³)", "Long × Ancho × Altura_exc", "LongitudEXT (hasta borde externo del nodo)" },
                    new[] { "Atraque (m³)", "Long × Área_neta_atraque  (proporcional)  ó  Long × Ancho × h_atraque − Long × ÁreaExtTubos  (decimal)", "LongitudMED" },
                    new[] { "Longitud tubería (m)", "Longitud real con descuento de campanas si aplica", "LongitudINT" },
                    new[] { "Relleno granular (m³)", "Long × Área_neta_relleno  (proporcional)  ó  Long × Ancho × (H_exc − h_atraque)  (decimal)", "LongitudMED" },
                    new[] { "Entibado (m²)", "2 caras × altura_cajón × Long", "LongitudMED" },
                    new[] { "Cinta señalización (m)", "Longitud del tramo", "LongitudMED" }
                });
            AddPara("Existen tres longitudes diferenciadas según la geometría del nodo:");
            AddList(new[]
            {
                "LongitudEXT: longitud hasta el contorno exterior del nodo (para excavación).",
                "LongitudMED: longitud hasta el contorno medio del nodo (para relleno, atraque, entibado).",
                "LongitudINT: longitud hasta el interior del nodo, con descuento de campanas si aplica (para tubería y cinta)."
            });

            // ═════════════════════════════════════════════════════════════
            AddSectionHeader("vincular", "13. Vincular al presupuesto (checkboxes y combos)");
            AddPara("Cada concepto tiene un checkbox y un combo. El checkbox activa ese concepto para el tramo. El combo selecciona el ítem del catálogo de precios al que se vincula la cantidad calculada.");
            AddList(new[]
            {
                "Solo los conceptos marcados (checkbox activado) se envían al presupuesto.",
                "El combo debe tener un ítem seleccionado para que el tramo sea válido.",
                "Puedes usar 'Aplicar a todos los tramos' para copiar la configuración del tramo actual a todos los demás de una sola vez."
            });
            AddTip("Revisa que el ítem seleccionado en el combo tenga la unidad correcta (m³ para volúmenes, m para longitudes, m² para entibado). Si la unidad no coincide, el cálculo en el presupuesto será incorrecto.");

            // ═════════════════════════════════════════════════════════════
            AddSectionHeader("errores", "14. Errores frecuentes y cómo corregirlos");
            AddTable(
                new[] { "Síntoma", "Causa probable", "Solución" },
                new[]
                {
                    new[] { "Área externa tubería = 0.000", "Diámetro vacío o formato no reconocido", "Verifica el campo Diámetro. Usa formato correcto (ver sección 4)." },
                    new[] { "Fondo excavación = valor raro o negativo", "Cotas en 0 o diámetro mal ingresado", "Ingresa cotas reales o usa Altura exc. manual." },
                    new[] { "Vol. atraque muy pequeño o 0", "Proporción bien escrita pero diámetro = 0", "Corrige el diámetro primero." },
                    new[] { "Vol. relleno = mismo que sin proporción", "Diámetro 0 → hAtraque = 0 → fórmula colapsa", "Corrige el diámetro. Relee sección 4." },
                    new[] { "Nodo no coincide", "Nombre escrito distinto al del formulario de nodos", "Copia exacto el nombre del formulario de nodos." },
                    new[] { "Altura exc. manual anula las cotas", "Campo llenado por error", "Borra el valor del campo Altura exc. manual." },
                    new[] { "Área neta atraque/relleno vacíos", "Formato decimal (0.5) — campos solo aplican a proporcional", "Normal. En formato decimal no hay segmento circular." }
                });

            // ═════════════════════════════════════════════════════════════
            AddSectionHeader("flujo", "15. Flujo de trabajo recomendado paso a paso");
            AddList(new[]
            {
                "Paso 1: Define nodos en el formulario de Nodos (FrmNombrarNodos). Anota los nombres exactos.",
                "Paso 2: Abre FrmNombrarTramo. La grilla aparece vacía.",
                "Paso 3: Por cada tramo, haz clic en la fila y selecciona el tramo en el DWG (doble clic captura la vista).",
                "Paso 4: Llena Nodo Inicial / Final (copiados del formulario de nodos).",
                "Paso 5: Llena Rasante y Clave en ambos extremos (si tienes cotas).",
                "Paso 6: Llena Diámetro, Espesor, Ancho de excavación, Cimentación.",
                "Paso 7: Llena Atraque: usa 1:4 / 1:3 / 1:2 para redes húmedas; usa 0.50 / 0.80 para redes secas o compuestas.",
                "Paso 8: Si no tienes cotas, llena Altura exc. manual.",
                "Paso 9: Verifica el panel 'Información de tramo' — revisa que los valores sean coherentes.",
                "Paso 10: En el panel 'Cantidades del tramo', activa los checkboxes que apliquen y selecciona el ítem en cada combo.",
                "Paso 11: Haz clic en 'Cargar al presupuesto' para enviar las cantidades al DataGrid principal."
            });

            // ═════════════════════════════════════════════════════════════
            AddSectionHeader("glosario-t", "16. Glosario técnico");
            AddList(new[]
            {
                "Cota / Elevación: altura sobre el nivel de referencia del proyecto (metros).",
                "Rasante: superficie superior del terreno o pavimento.",
                "Clave: punto más alto (corona) de la sección exterior de la tubería.",
                "Cimentación: cama de material granular bajo la tubería.",
                "Atraque: relleno lateral y de soporte alrededor de la tubería hasta cierta altura.",
                "Relleno granular: material que ocupa el espacio de la zanja por encima del atraque.",
                "Entibado: sistema de contención lateral de las paredes de la zanja.",
                "Diámetro nominal: diámetro interior de la tubería (DN).",
                "Diámetro externo: diámetro nominal + 2 × espesor de pared.",
                "Segmento circular: área de un sector de círculo definido por una cuerda horizontal.",
                "LongitudEXT / MED / INT: longitudes diferenciadas según el contorno geométrico del nodo."
            });

            // Ajustar tamaño del doc
            doc.Height = _y + 30;
            UpdateWrapWidths();

            doc.ResumeLayout(true);
            pnlContenido.ResumeLayout(true);
        }

        // ════════════════════════════════════════════════════════════════════
        //  ÍNDICE DEL ÁRBOL
        // ════════════════════════════════════════════════════════════════════
        private void BuildTreeIndex()
        {
            tvIndice.BeginUpdate();
            tvIndice.Nodes.Clear();

            TreeNode N(string text, string id) => new TreeNode(text) { Tag = id };

            var root = N("Manual de Tramos", "intro");
            root.Nodes.Add(N("1. ¿Para qué sirve?", "intro"));
            root.Nodes.Add(N("2. Nodo Inicial y Final", "nodos"));
            root.Nodes.Add(N("3. Rasante y Clave", "cotas"));
            root.Nodes.Add(N("4. Diámetro", "diametro"));
            root.Nodes.Add(N("5. Espesor de tubería", "espesor"));
            root.Nodes.Add(N("6. Ancho de excavación", "ancho"));
            root.Nodes.Add(N("7. Cimentación", "cimentacion"));
            root.Nodes.Add(N("8. Altura exc. manual", "alt-exc-manual"));

            var nAtr = N("9. Atraque ⭐", "atraque");
            nAtr.Nodes.Add(N("9.1. Formato proporcional (1:3)", "atraque-prop"));
            nAtr.Nodes.Add(N("9.2. Formato decimal (0.50)", "atraque-decimal"));
            root.Nodes.Add(nAtr);

            root.Nodes.Add(N("10. Estruc. Vía / E.P.", "estruc"));
            root.Nodes.Add(N("11. Panel Info de tramo", "panel-info"));
            root.Nodes.Add(N("12. Cantidades (fórmulas)", "cantidades"));
            root.Nodes.Add(N("13. Vincular al presupuesto", "vincular"));
            root.Nodes.Add(N("14. Errores frecuentes", "errores"));
            root.Nodes.Add(N("15. Flujo recomendado", "flujo"));
            root.Nodes.Add(N("16. Glosario", "glosario-t"));

            tvIndice.Nodes.Add(root);
            root.Expand();
            tvIndice.EndUpdate();
        }

        // ════════════════════════════════════════════════════════════════════
        //  ÍNDICE INTERNO (TOC con hipervínculos)
        // ════════════════════════════════════════════════════════════════════
        private void AddToc()
        {
            var gb = new GroupBox
            {
                Text = "Contenido — haz clic para ir a la sección",
                Left = 10, Top = _y,
                Width = WrapWidth + 20,
                BackColor = Color.FromArgb(245, 248, 255),
                ForeColor = Color.FromArgb(10, 33, 64)
            };
            var x = 10; var y = 22;
            var col = 0;

            void Link(string text, string id)
            {
                var l = new LinkLabel
                {
                    Text = "▸ " + text,
                    AutoSize = true,
                    Left = x + col * 310,
                    Top = y,
                    LinkColor = Color.RoyalBlue,
                    Font = new Font("Segoe UI", 8.5F)
                };
                l.Click += (s, e) => GoTo(id);
                gb.Controls.Add(l);
                y += 22;
                if (y > 280) { y = 22; col++; }
            }

            Link("1. ¿Para qué sirve?", "intro");
            Link("2. Nodo Inicial y Final", "nodos");
            Link("3. Rasante y Clave", "cotas");
            Link("4. Diámetro de tubería", "diametro");
            Link("5. Espesor de pared", "espesor");
            Link("6. Ancho de excavación", "ancho");
            Link("7. Cimentación", "cimentacion");
            Link("8. Altura exc. manual", "alt-exc-manual");
            Link("9. Atraque (proporcional)", "atraque-prop");
            Link("9. Atraque (decimal)", "atraque-decimal");
            Link("10. Estructura vía / E.P.", "estruc");
            Link("11. Panel Info de tramo", "panel-info");
            Link("12. Fórmulas de cantidades", "cantidades");
            Link("13. Vincular al presupuesto", "vincular");
            Link("14. Errores frecuentes", "errores");
            Link("15. Flujo recomendado", "flujo");
            Link("16. Glosario", "glosario-t");

            gb.Height = y + 12;
            Push(gb, 10);
        }

        // ════════════════════════════════════════════════════════════════════
        //  HELPERS UI (idénticos a FrmAyuda)
        // ════════════════════════════════════════════════════════════════════
        private int WrapWidth => Math.Max(200, pnlContenido.ClientSize.Width - 60);

        private void AddHr()
        {
            var sep = new Panel
            {
                BackColor = Color.Gainsboro, Height = 1,
                Width = WrapWidth, Left = 10, Top = _y + 8
            };
            Push(sep, heightAfter: 16);
        }

        private void AddSectionHeader(string id, string title)
        {
            var lbl = new Label
            {
                Text = title,
                Font = new Font("Segoe UI", 11F, FontStyle.Bold),
                ForeColor = Color.FromArgb(10, 33, 64),
                AutoSize = true, Left = 10, Top = _y
            };
            _anchors[id] = lbl;
            Push(lbl, 14);
        }

        private void AddSubHeader(string id, string title)
        {
            var lbl = new Label
            {
                Text = title,
                Font = new Font("Segoe UI", 10F, FontStyle.Bold),
                ForeColor = Color.FromArgb(26, 74, 140),
                AutoSize = true, Left = 18, Top = _y
            };
            _anchors[id] = lbl;
            Push(lbl, 12);
        }

        private void AddPara(string text)
        {
            var lbl = new Label
            {
                Text = text, AutoSize = true,
                MaximumSize = new Size(WrapWidth, 0),
                Left = 18, Top = _y, UseMnemonic = false
            };
            lbl.Size = lbl.PreferredSize;
            Push(lbl, 10);
        }

        private void AddList(IEnumerable<string> items)
        {
            foreach (var it in items)
            {
                var lbl = new Label
                {
                    Text = "• " + it, AutoSize = true,
                    MaximumSize = new Size(WrapWidth - 10, 0),
                    Left = 24, Top = _y
                };
                lbl.Size = lbl.PreferredSize;
                Push(lbl, 4);
            }
            _y += 4;
        }

        private void AddTip(string text)
        {
            var pnl = new Panel
            {
                Left = 18, Top = _y, Width = WrapWidth,
                BackColor = Color.FromArgb(255, 249, 220),
                BorderStyle = BorderStyle.FixedSingle
            };
            var lbl = new Label
            {
                Text = "💡 " + text, AutoSize = true,
                MaximumSize = new Size(WrapWidth - 24, 0),
                Left = 8, Top = 8, UseMnemonic = false
            };
            lbl.Size = lbl.PreferredSize;
            pnl.Height = lbl.Bottom + 14;
            pnl.Controls.Add(lbl);
            Push(pnl, 16);
        }

        private void AddTable(string[] headers, IEnumerable<string[]> rows)
        {
            var grid = new TableLayoutPanel
            {
                Left = 18,
                Top = _y,
                AutoSize = false,
                Width = WrapWidth - 20,
                ColumnCount = headers.Length,
                CellBorderStyle = TableLayoutPanelCellBorderStyle.Single,
                BackColor = Color.White
            };
            for (int i = 0; i < headers.Length; i++)
                grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f / headers.Length));

            int colW = Math.Max(60, (WrapWidth - 20) / Math.Max(1, headers.Length));

            for (int i = 0; i < headers.Length; i++)
                grid.Controls.Add(new Label
                {
                    Text = headers[i],
                    Font = new Font("Segoe UI", 8.5F, FontStyle.Bold),
                    AutoSize = false,
                    Size = new Size(colW, 0),
                    MaximumSize = new Size(colW, 0),
                    Padding = new Padding(4),
                    BackColor = Color.FromArgb(220, 232, 255),
                    UseMnemonic = false
                }, i, 0);

            int r = 1;
            foreach (var row in rows)
            {
                for (int c = 0; c < headers.Length; c++)
                {
                    var cell = new Label
                    {
                        Text = row.ElementAtOrDefault(c) ?? "",
                        AutoSize = false,
                        MaximumSize = new Size(colW, 0),
                        Size = new Size(colW, 0),
                        Padding = new Padding(4),
                        UseMnemonic = false
                    };
                    cell.Size = new Size(colW, cell.GetPreferredSize(new Size(colW, 0)).Height + 8);
                    grid.Controls.Add(cell, c, r);
                }
                r++;
            }
            grid.AutoSize = true;
            grid.PerformLayout();
            // Forzar altura antes de hacer Push para que _y avance correctamente
            int gridH = 0;
            foreach (Control gc in grid.Controls)
                gridH = Math.Max(gridH, gc.Top + gc.Height);
            grid.Height = gridH + 8;
            Push(grid, 16);
        }

        private void Push(Control c, int marginAfter = 0, int? heightAfter = null)
        {
            doc.Controls.Add(c);
            if (heightAfter.HasValue) _y += heightAfter.Value;
            else _y = Math.Max(_y, c.Bottom + marginAfter);
        }

        public void GoTo(string id)
        {
            if (!_anchors.TryGetValue(id, out var ctl)) return;
            pnlContenido.ScrollControlIntoView(ctl);
            ctl.Focus();
        }

        private void UpdateWrapWidths()
        {
            int w = WrapWidth;
            foreach (Control c in doc.Controls)
            {
                if (c is Label lbl && lbl.MaximumSize.Width > 0)
                {
                    lbl.MaximumSize = new Size(w, 0);
                    lbl.Size = lbl.PreferredSize;
                }
                else if (c is Panel pnl && pnl.BackColor == Color.FromArgb(255, 249, 220))
                {
                    pnl.Width = w;
                    foreach (Control pc in pnl.Controls)
                        if (pc is Label pl) { pl.MaximumSize = new Size(w - 24, 0); pl.Size = pl.PreferredSize; }
                    pnl.Height = pnl.Controls.Cast<Control>().LastOrDefault()?.Bottom + 10 ?? pnl.Height;
                }
                else if (c is TableLayoutPanel tlp)
                {
                    tlp.Width = w - 20;
                    int cols = tlp.ColumnCount;
                    int colW = Math.Max(60, (w - 20) / Math.Max(1, cols));
                    for (int i = 0; i < cols; i++)
                        tlp.ColumnStyles[i] = new ColumnStyle(SizeType.Absolute, colW);
                }
            }
            doc.Width = w + 20;
        }

        private void BtnBuscar_Click(object? sender, EventArgs? e)
        {
            var q = txtBuscar.Text.Trim();
            if (q.Length == 0) return;
            foreach (var kv in _anchors)
            {
                if (kv.Value.Text.IndexOf(q, StringComparison.OrdinalIgnoreCase) >= 0)
                { GoTo(kv.Key); return; }
            }
            MessageBox.Show(this, $"No se encontró '{q}'.", "Búsqueda",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
    }
}
