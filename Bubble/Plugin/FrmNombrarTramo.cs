using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using Newtonsoft.Json;
using System.Windows.Forms;
using System.Runtime.InteropServices;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
using System.Threading.Tasks;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.Geometry;
using Autodesk.AutoCAD.EditorInput;

namespace SicoePresupuestoNET8
{
    // ================== HELPER PARA CAPTURAR SCREENSHOTS DE AUTOCAD ==================
    internal static class AutoCADScreenshotHelper
    {
        [DllImport("user32.dll")]
        private static extern IntPtr GetDC(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);

        [DllImport("gdi32.dll")]
        private static extern bool BitBlt(IntPtr hdc, int nXDest, int nYDest, int nWidth, int nHeight,
            IntPtr hdcSrc, int nXSrc, int nYSrc, int dwRop);

        [DllImport("gdi32.dll")]
        private static extern IntPtr CreateCompatibleDC(IntPtr hdc);

        [DllImport("gdi32.dll")]
        private static extern IntPtr CreateCompatibleBitmap(IntPtr hdc, int nWidth, int nHeight);

        [DllImport("gdi32.dll")]
        private static extern IntPtr SelectObject(IntPtr hdc, IntPtr hgdiobj);

        [DllImport("gdi32.dll")]
        private static extern bool DeleteDC(IntPtr hdc);

        [DllImport("gdi32.dll")]
        private static extern bool DeleteObject(IntPtr hObject);

        [DllImport("user32.dll")]
        private static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);

        [DllImport("user32.dll")]
        private static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr FindWindowEx(IntPtr hwndParent, IntPtr hwndChildAfter, string lpszClass, string lpszWindow);

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        [DllImport("user32.dll")]
        private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

        private const int SW_RESTORE = 9;
        [StructLayout(LayoutKind.Sequential)]
        private struct RECT
        {
            public int Left;
            public int Top;
            public int Right;
            public int Bottom;
        }

        private const int SRCCOPY = 0x00CC0020;
        private const uint GW_CHILD = 5;

        /// <summary>
        /// Captura screenshot de la ventana de AutoCAD, independientemente del monitor.
        /// Detecta en qué monitor está AutoCAD y captura desde ahí.
        /// </summary>
        public static async Task<string?> CaptureAutoCADScreenshotAsBase64Async(int delayMs = 2000, int quality = 85)
        {
            try
            {
                System.Diagnostics.Debug.WriteLine("=== Iniciando captura multi-monitor ===");

                // Esperar renderizado
                await Task.Delay(delayMs);

                var doc = Autodesk.AutoCAD.ApplicationServices.Application.DocumentManager.MdiActiveDocument;
                if (doc == null)
                {
                    System.Diagnostics.Debug.WriteLine("ERROR: No hay documento activo");
                    return null;
                }

                // Obtener ventana de AutoCAD
                IntPtr acWindow = Autodesk.AutoCAD.ApplicationServices.Application.MainWindow.Handle;
                if (acWindow == IntPtr.Zero)
                {
                    System.Diagnostics.Debug.WriteLine("ERROR: No se pudo obtener handle de ventana");
                    return null;
                }

                // Activar ventana
                ShowWindow(acWindow, SW_RESTORE);
                SetForegroundWindow(acWindow);
                await Task.Delay(200);

                // CRÍTICO: Obtener posición ABSOLUTA de la ventana en coordenadas de pantalla
                if (!GetWindowRect(acWindow, out RECT windowRect))
                {
                    System.Diagnostics.Debug.WriteLine("ERROR: No se pudo obtener WindowRect");
                    return null;
                }

                // Calcular dimensiones
                int width = windowRect.Right - windowRect.Left;
                int height = windowRect.Bottom - windowRect.Top;
                int x = windowRect.Left;
                int y = windowRect.Top;

                System.Diagnostics.Debug.WriteLine($"Ventana AutoCAD encontrada:");
                System.Diagnostics.Debug.WriteLine($"  Posición: ({x}, {y})");
                System.Diagnostics.Debug.WriteLine($"  Tamaño: {width}x{height}");
                System.Diagnostics.Debug.WriteLine($"  Esquina inferior derecha: ({windowRect.Right}, {windowRect.Bottom})");

                // Detectar en qué monitor está (para logging)
                var screen = System.Windows.Forms.Screen.FromHandle(acWindow);
                System.Diagnostics.Debug.WriteLine($"  Monitor: {screen.DeviceName}");
                System.Diagnostics.Debug.WriteLine($"  Bounds del monitor: {screen.Bounds}");

                if (width <= 0 || height <= 0)
                {
                    System.Diagnostics.Debug.WriteLine($"ERROR: Dimensiones inválidas");
                    return null;
                }

                // Capturar ventana completa primero
                using (var bitmapFull = new System.Drawing.Bitmap(width, height))
                {
                    using (var g = System.Drawing.Graphics.FromImage(bitmapFull))
                    {
                        g.CopyFromScreen(x, y, 0, 0, new System.Drawing.Size(width, height));
                    }

                    // ================================================================
                    // RECORTAR para eliminar ribbons y barras de herramientas
                    // ================================================================
                    // Calcular área del viewport (excluyendo UI de AutoCAD)
                    int topCrop = (int)(height * 0.25);      // Ribbon superior (~25%)
                    int bottomCrop = (int)(height * 0.20);   // Barra de comandos (~20%)

                    // NUEVO: Recorte horizontal - tomar solo el 50% del centro
                    int leftCrop = (int)(width * 0.25);      // Recortar 25% izquierda
                    int rightCrop = (int)(width * 0.25);     // Recortar 25% derecha
                                                             // Resultado: viewport centrado con 50% del ancho original

                    // Calcular nuevas dimensiones (centrado)
                    int viewportX = leftCrop;
                    int viewportY = topCrop;
                    int viewportWidth = width - leftCrop - rightCrop;   // 50% del ancho original
                    int viewportHeight = height - topCrop - bottomCrop;

                    // Validar que las dimensiones sean positivas
                    if (viewportWidth <= 0 || viewportHeight <= 0)
                    {
                        System.Diagnostics.Debug.WriteLine("ERROR: Dimensiones de viewport inválidas después de recorte");
                        return null;
                    }

                    System.Diagnostics.Debug.WriteLine($"Recortando viewport:");
                    System.Diagnostics.Debug.WriteLine($"  Original: {width}x{height}");
                    System.Diagnostics.Debug.WriteLine($"  Viewport: {viewportWidth}x{viewportHeight}");
                    System.Diagnostics.Debug.WriteLine($"  Recorte: Top={topCrop}px, Bottom={bottomCrop}px");

                    // Crear bitmap solo con el viewport (área de dibujo)
                    using (var viewportBitmap = new System.Drawing.Bitmap(viewportWidth, viewportHeight))
                    {
                        using (var gViewport = System.Drawing.Graphics.FromImage(viewportBitmap))
                        {
                            gViewport.DrawImage(bitmapFull,
                                new System.Drawing.Rectangle(0, 0, viewportWidth, viewportHeight),
                                new System.Drawing.Rectangle(viewportX, viewportY, viewportWidth, viewportHeight),
                                System.Drawing.GraphicsUnit.Pixel);
                        }

                        // Guardar debug
                        string debugPath = Path.Combine(Path.GetTempPath(), $"viewport_only_{DateTime.Now:yyyyMMdd_HHmmss}.jpg");

                        // Redimensionar viewport
                        using (var resized = ResizeImage(viewportBitmap, 1200))
                        {
                            using (var ms = new MemoryStream())
                            {
                                var encoder = GetJpegEncoder();
                                var encoderParams = new EncoderParameters(1);
                                encoderParams.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, (long)quality);

                                resized.Save(ms, encoder, encoderParams);
                                resized.Save(debugPath);

                                byte[] imageBytes = ms.ToArray();

                                System.Diagnostics.Debug.WriteLine($"✓ Viewport capturado: {imageBytes.Length} bytes");
                                System.Diagnostics.Debug.WriteLine($"✓ Debug: {debugPath}");

                                return Convert.ToBase64String(imageBytes);
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"ERROR CAPTURA: {ex.Message}");
                System.Diagnostics.Debug.WriteLine($"StackTrace: {ex.StackTrace}");
                return null;
            }
        }

        private static System.Drawing.Bitmap ResizeImage(System.Drawing.Bitmap image, int maxWidth)
        {
            if (image.Width <= maxWidth)
                return new System.Drawing.Bitmap(image);

            int newHeight = (int)((double)image.Height / image.Width * maxWidth);
            var resized = new System.Drawing.Bitmap(maxWidth, newHeight);

            using (var graphics = System.Drawing.Graphics.FromImage(resized))
            {
                graphics.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.HighQuality;
                graphics.CompositingQuality = System.Drawing.Drawing2D.CompositingQuality.HighQuality;
                graphics.DrawImage(image, 0, 0, maxWidth, newHeight);
            }

            return resized;
        }

        private static ImageCodecInfo GetJpegEncoder()
        {
            var codecs = ImageCodecInfo.GetImageEncoders();
            foreach (var codec in codecs)
            {
                if (codec.FormatID == ImageFormat.Jpeg.Guid)
                    return codec;
            }
            return codecs[0];
        }
    }

    internal sealed partial class FrmNombrarTramo : Form
    {
        // ================== MODELO DE FILA ============================


        public sealed class TramoRow
        {
            public string Handle { get; set; } = "";
            public string AbsIni { get; set; } = "";
            public string AbsFin { get; set; } = "";
            public string NodoIni { get; set; } = "";
            public string NodoFin { get; set; } = "";

            // NUEVOS CAMPOS
            public double RasanteIni { get; set; }
            public double RasanteFin { get; set; }
            public double ClaveIni { get; set; }
            public double ClaveFin { get; set; }

            public double NorteIni { get; set; }
            public double EsteIni { get; set; }
            public double NorteFin { get; set; }
            public double EsteFin { get; set; }

            // Todos estos valores se almacenan en mm en backend
            public string DiametroTexto { get; set; } = "";  // ej. "12\"", "6Ø6\"+3Ø3\""
            public double EspesorTuberiaMm { get; set; }      // espesor total en m
            public double AnchoExcavacion { get; set; }      // en metros
            public double CimentacionMm { get; set; }        // en m
            public string AlturaAtraqueTexto { get; set; } = "";  // "1:4" o "0.60"
            public double? AlturaExcManual { get; set; }     // altura de excavación manual (m)
            public double? EstrucViaEp { get; set; }         // "Estruc Via / E.P." (m)
            public List<string> ImagenesBase64 { get; set; } = new List<string>();

            // ====== CONFIGURACIÓN DE ÍTEMS DE PRESUPUESTO POR TRAMO ======
            // Todos los ítems se consideran DESACTIVADOS por defecto.
            // El usuario debe marcar explícitamente lo que quiere usar.
            public bool UsaExcav { get; set; } = false;
            public bool UsaAtraque { get; set; } = false;
            public bool UsaLong { get; set; } = false;
            public bool UsaRelleno { get; set; } = false;
            public bool UsaEntibado { get; set; } = false;
            public bool UsaCinta { get; set; } = false;
            public bool UsaOtros { get; set; } = false;
            public bool UsaCampana1 { get; set; } = false;
            public bool UsaCampana2 { get; set; } = false;
            // Texto seleccionado en cada ComboBox
            public string ItemExcav { get; set; } = string.Empty;
            public string ItemAtraque { get; set; } = string.Empty;
            public string ItemLong { get; set; } = string.Empty;
            public string ItemRelleno { get; set; } = string.Empty;
            public string ItemEntibado { get; set; } = string.Empty;
            public string ItemCinta { get; set; } = string.Empty;

            // Resumen de “Otros” para compatibilidad (se puede usar luego
            // como texto descriptivo en el informe / presupuesto).
            public string ItemOtros { get; set; } = string.Empty;
            public string ItemCampana1 { get; set; } = string.Empty;
            public string ItemCampana2 { get; set; } = string.Empty;
            // Cantidad total de "Otros" YA armonizada con la longitud del tramo.
            // Se actualizará como suma de (FactorPorMetro × Longitud) para todos los detalles.
            // Cantidad total de "Otros" asociada al tramo (armonizada con la longitud)
            public double CantOtros { get; set; } = 0.0;
            public int CantCampana1 { get; set; } = 0;
            public int CantCampana2 { get; set; } = 0;
            // Detalle por ítem "Otros"
            public sealed class OtroDetalleTramo
            {
                public string Item { get; set; } = string.Empty;   // Texto del combo (código + descripción)
                public double FactorPorMetro { get; set; }         // valor que digitas en txtOtros (factor/m)
                public double CantidadReal { get; set; }           // Factor × Longitud (m)
            }

            public List<OtroDetalleTramo> OtrosDetalles { get; } = new List<OtroDetalleTramo>();

            // ======= Métodos auxiliares simples ========================
            public double GetAbsIniMetros()
            {
                return ParseAbscisa(AbsIni);
            }

            public double GetAbsFinMetros()
            {
                return ParseAbscisa(AbsFin);
            }

            public double GetLongitud()
            {
                // Longitud “teórica” por diferencia de abscisas (respaldo)
                var li = GetAbsIniMetros();
                var lf = GetAbsFinMetros();
                double longPorAbscisas = Math.Max(0.0, lf - li);

                // Intentar obtener la longitud REAL del tramo desde el objeto CAD
                return FrmNombrarTramo.ObtenerLongitudRealTramo(this.Handle, longPorAbscisas);
            }


            private static double ParseAbscisa(string valor)
            {
                if (string.IsNullOrWhiteSpace(valor))
                    return 0.0;

                var s = valor.Replace("+", "").Trim();
                if (double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var d))
                    return d;

                if (double.TryParse(s, NumberStyles.Float, CultureInfo.CurrentCulture, out d))
                    return d;

                return 0.0;
            }
        }


        // ================== DTO PARA JSON ==============================
        public sealed class TramoJson
        {
            public string Handle { get; set; } = "";
            public string AbsIni { get; set; } = "";
            public string AbsFin { get; set; } = "";
            public string NodoIni { get; set; } = "";
            public string NodoFin { get; set; } = "";

            public double NorteIni { get; set; }
            public double EsteIni { get; set; }
            public double NorteFin { get; set; }
            public double EsteFin { get; set; }

            public double RasanteIni { get; set; }
            public double RasanteFin { get; set; }
            public double ClaveIni { get; set; }
            public double ClaveFin { get; set; }

            public string DiametroTexto { get; set; } = "";
            public double EspesorTuberiaMm { get; set; }      // en m (0.03, 0.04, etc.)
            public double AnchoExcavacion { get; set; }       // m
            public double CimentacionMm { get; set; }         // en m (0.15, 0.10, etc.)
            public string AlturaAtraqueTexto { get; set; } = "";  // "1:4" o "0.60"

            public double Longitud { get; set; }
            public double RasanteProm { get; set; }
            public double ClaveProm { get; set; }
            public double CotaFondoProm { get; set; }
            public double AlturaExcavacion { get; set; }
            public double EstrucViaEp { get; set; }           // m (Estruc Via / E.P.)

            public double VolumenExcavacion { get; set; }
            public double VolumenAtraque { get; set; }
            public double AreaEntibado { get; set; }
            public double AreaExtTubos { get; set; }          // área externa total de tuberías
            public double VolumenRelleno { get; set; }        // volumen de relleno granular
            public double CantOtros { get; set; }             // total "Otros" armonizado
            public int CantCampana1 { get; set; }
            public int CantCampana2 { get; set; }

            // Bandas de uso (checks del formulario)
            public bool UsaExcav { get; set; }
            public bool UsaAtraque { get; set; }
            public bool UsaLong { get; set; }
            public bool UsaRelleno { get; set; }
            public bool UsaEntibado { get; set; }
            public bool UsaCinta { get; set; }
            public bool UsaOtros { get; set; }
            public bool UsaCampana1 { get; set; }
            public bool UsaCampana2 { get; set; }

            // Texto de cada ítem (combo: código + descripción)
            public string ItemExcav { get; set; } = string.Empty;
            public string ItemAtraque { get; set; } = string.Empty;
            public string ItemLong { get; set; } = string.Empty;
            public string ItemRelleno { get; set; } = string.Empty;
            public string ItemEntibado { get; set; } = string.Empty;
            public string ItemCinta { get; set; } = string.Empty;
            public string ItemOtros { get; set; } = string.Empty;
            public string ItemCampana1 { get; set; } = string.Empty;
            public string ItemCampana2 { get; set; } = string.Empty;
            // ===== NUEVO: Screenshot capturado automáticamente =====
            public string ImagenBase64 { get; set; } = string.Empty;
        }


        // ================== BINDING ===================================
        // Sugerencias de diámetros ya usados (para autocomplete)
        private readonly HashSet<string> _diametrosUsados = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        private readonly BindingSource _bs = new BindingSource();
        // ===== NUEVO: Control para evitar recursión al replicar valores =====
        private bool _replicandoValoresEnGrid = false;
        public List<TramoRow> Resultado => (_bs.List as List<TramoRow>) ?? new List<TramoRow>();
        private bool _cargandoDatos = false;  // Guardia: impide efectos secundarios durante carga de datos al panel        // Catálogo filtrado de ítems de presupuesto (Capítulo + Competencia)
        private List<string> _catalogoItemsFiltrado = new List<string>();
        // ===== NUEVO: Memoria de nodos del capítulo =====

        private string _capituloActual = "";
        private List<string> _nodosDisponibles = new List<string>();

        // Ruta del gráfico actualmente seleccionado para el tramo (puede ser null)
        private string? _rutaGraficoActual;
        // ===== Variables para autocomplete robusto de nodos =====
        private TextBox? _textBoxNodoActual = null;
        private ListBox? _listBoxSugerencias = null;
        private bool _seleccionandoNodo = false; // NUEVO


        // ================== CONSTRUCTORES =============================
        public FrmNombrarTramo()
            : this(new List<TramoRow>())
        {
        }

        public FrmNombrarTramo(IEnumerable<TramoRow> data)
        {
            InitializeComponent();

            // Configuración básica del grid
            _grid.AutoGenerateColumns = false;
            _grid.AllowUserToAddRows = false;
            _grid.AllowUserToDeleteRows = false;
            _grid.SelectionMode = DataGridViewSelectionMode.FullRowSelect;

            // Definir columnas de forma explícita
            _grid.Columns.Clear();

            _grid.Columns.Add(new DataGridViewTextBoxColumn
            {
                DataPropertyName = "AbsIni",
                HeaderText = "Abs. Inicio",
                Width = 90,
                ReadOnly = true
            });
            _grid.Columns.Add(new DataGridViewTextBoxColumn
            {
                DataPropertyName = "AbsFin",
                HeaderText = "Abs. Final",
                Width = 90,
                ReadOnly = true
            });
            _grid.Columns.Add(new DataGridViewTextBoxColumn
            {
                DataPropertyName = "NodoIni",
                HeaderText = "Nodo Inicial",
                Width = 120
            });
            _grid.Columns.Add(new DataGridViewTextBoxColumn
            {
                DataPropertyName = "NodoFin",
                HeaderText = "Nodo Final",
                Width = 120
            });
            _grid.Columns.Add(new DataGridViewTextBoxColumn
            {
                DataPropertyName = "RasanteIni",
                HeaderText = "Rasante Inicial",
                Width = 90
            });
            _grid.Columns.Add(new DataGridViewTextBoxColumn
            {
                DataPropertyName = "RasanteFin",
                HeaderText = "Rasante Final",
                Width = 90
            });
            _grid.Columns.Add(new DataGridViewTextBoxColumn
            {
                DataPropertyName = "ClaveIni",
                HeaderText = "Clave Inicial",
                Width = 90
            });
            _grid.Columns.Add(new DataGridViewTextBoxColumn
            {
                DataPropertyName = "ClaveFin",
                HeaderText = "Clave Final",
                Width = 90
            });
            _grid.Columns.Add(new DataGridViewTextBoxColumn
            {
                DataPropertyName = "DiametroTexto",
                HeaderText = "Diámetro",
                Width = 100
            });
            _grid.Columns.Add(new DataGridViewTextBoxColumn
            {
                DataPropertyName = "EspesorTuberiaMm",
                HeaderText = "Espesor (m)", // valor que digitas: 0.03, 0.04...
                Width = 90
            });
            _grid.Columns.Add(new DataGridViewTextBoxColumn
            {
                DataPropertyName = "AnchoExcavacion",
                HeaderText = "Ancho excavación (m)",
                Width = 110
            });
            _grid.Columns.Add(new DataGridViewTextBoxColumn
            {
                DataPropertyName = "CimentacionMm",
                HeaderText = "Cimentación (m)", // valor que digitas: 0.10, 0.15...
                Width = 100
            });
            _grid.Columns.Add(new DataGridViewTextBoxColumn
            {
                DataPropertyName = "AlturaExcManual",
                HeaderText = "Altura exc. (m)",
                Width = 110
            });
            _grid.Columns.Add(new DataGridViewTextBoxColumn
            {
                DataPropertyName = "AlturaAtraqueTexto",
                HeaderText = "Atraque (ej: 1:4 ó 0.60)",
                Width = 140
            });
            _grid.Columns.Add(new DataGridViewTextBoxColumn
            {
                DataPropertyName = "EstrucViaEp",
                HeaderText = "Estruc Via / E.P. (m)",
                Width = 130
            });
            _grid.Columns.Add(new DataGridViewTextBoxColumn
            {
                DataPropertyName = "Handle",
                Visible = false
            });

            // Eventos para actualizar el panel-informe y controlar edición
            _grid.SelectionChanged += _grid_SelectionChanged;
            _grid.CellEndEdit += _grid_CellEndEdit;
            _grid.CellBeginEdit += _grid_CellBeginEdit;
            _grid.EditingControlShowing += _grid_EditingControlShowing;
            // ===== NUEVO: Evento doble clic para hacer zoom al tramo =====
            _grid.CellDoubleClick += Grid_CellDoubleClick;
            // ===== NUEVO: Permitir eliminar tramos con tecla Delete =====
            _grid.KeyDown += Grid_KeyDown;


            // Enlace de datos
            _bs.DataSource = data.ToList();
            _grid.DataSource = _bs;

            // Cargar diámetros ya existentes en la lista de sugerencias
            foreach (var r in Resultado)
            {
                if (!string.IsNullOrWhiteSpace(r.DiametroTexto))
                    _diametrosUsados.Add(r.DiametroTexto.Trim());
            }
            // Sincronizar configuración de ítems de tramo
            chkAplicarTodos.Checked = false; // por si el diseñador no lo deja en true
            chkAplicarTodos.CheckedChanged += ChkAplicarTodosConfig_CheckedChanged;

            ActualizarResumenSeleccion();
        }

        /// <summary>
        /// Carga en todos los ComboBox el catálogo de ítems YA filtrado por
        /// capítulo + competencia desde FrmSicoePresupuesto.
        /// Debe llamarse justo después de crear el formulario.
        /// </summary>
        /// <summary>
        /// Carga en todos los ComboBox el catálogo de ítems YA filtrado por
        /// capítulo + competencia desde FrmSicoePresupuesto.
        /// Debe llamarse justo después de crear el formulario.
        /// </summary>
        public void CargarCatalogoItems(IEnumerable<string> itemsFiltrados)
        {
            _catalogoItemsFiltrado = itemsFiltrados?
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .Select(s => s.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(s => s)
                .ToList()
                ?? new List<string>();

            // Configuramos cada Combo con búsqueda por CONTIENE
            ConfigurarComboBusquedaLibre(cmbExcav);
            ConfigurarComboBusquedaLibre(cmbAtraque);
            ConfigurarComboBusquedaLibre(cmbLong);
            ConfigurarComboBusquedaLibre(cmbRelleno);
            ConfigurarComboBusquedaLibre(cmbEntibado);
            ConfigurarComboBusquedaLibre(cmbCinta);
            ConfigurarComboBusquedaLibre(cmbOtros);
            ConfigurarComboBusquedaLibre(cmbCampana1);
            ConfigurarComboBusquedaLibre(cmbCampana2);

            // Refrescar texto del tramo actual
            ActualizarResumenSeleccion();
        }
        /// <summary>
        /// Establece el capítulo actual y carga los nodos disponibles de la memoria.
        /// </summary>
        public void SetCapitulo(string capitulo)
        {
            _capituloActual = capitulo?.Trim().ToUpperInvariant() ?? "";

            // Cargar nodos disponibles de este capítulo
            _nodosDisponibles = NodoMemoryRepository.ObtenerNodos(_capituloActual);
            System.Diagnostics.Debug.WriteLine($"[TRAMOS] Cargados {_nodosDisponibles.Count} nodos del capítulo {_capituloActual}");
        }
        private void AjustarDropDownWidthSegunItems(ComboBox combo)
        {
            if (combo == null) return;
            if (combo.Items.Count == 0) return;

            int maxWidth = combo.DropDownWidth;
            using (var g = combo.CreateGraphics())
            {
                foreach (var item in combo.Items)
                {
                    string texto = combo.GetItemText(item);
                    var sz = TextRenderer.MeasureText(g, texto, combo.Font);
                    if (sz.Width > maxWidth)
                        maxWidth = sz.Width;
                }
            }

            combo.DropDownWidth = maxWidth + 20;
        }

        // NUEVO: fuerza a que se vea siempre el INICIO del texto
        private void ResetComboCaretToStart(ComboBox combo)
        {
            if (combo == null) return;

            // Mueve el cursor al principio y evita selección
            combo.SelectionStart = 0;
            combo.SelectionLength = 0;
        }
        /// <summary>
        /// Deja el ComboBox en modo edición libre y conecta el filtro
        /// "contiene" sobre la lista maestra _catalogoItemsFiltrado,
        /// trabajando SIEMPRE sobre Items (no DataSource).
        /// </summary>
        private void ConfigurarComboBusquedaLibre(ComboBox combo)
        {
            if (combo == null) return;

            // Modo editable
            combo.DropDownStyle = ComboBoxStyle.DropDown;

            // Desactivamos el autocomplete estándar (solo hace "empieza por")
            combo.AutoCompleteMode = AutoCompleteMode.None;
            combo.AutoCompleteSource = AutoCompleteSource.None;

            // Fuente inicial = lista completa, usando Items (no DataSource)
            combo.BeginUpdate();
            combo.Items.Clear();
            if (_catalogoItemsFiltrado != null && _catalogoItemsFiltrado.Count > 0)
            {
                combo.Items.AddRange(_catalogoItemsFiltrado.Cast<object>().ToArray());
            }
            combo.EndUpdate();

            // Evitar múltiples suscripciones
            combo.TextUpdate -= ComboBusqueda_TextUpdate;
            combo.Leave -= ComboBusqueda_Leave;

            combo.TextUpdate += ComboBusqueda_TextUpdate;
            combo.Leave += ComboBusqueda_Leave;
        }
        /// <summary>
        /// Cada vez que cambia el texto, filtra la lista del combo usando
        /// "contiene" en cualquier parte del ítem (case-insensitive),
        /// reconstruyendo Items a partir de _catalogoItemsFiltrado.
        /// </summary>
        private void ComboBusqueda_TextUpdate(object? sender, EventArgs e)
        {
            if (sender is not ComboBox combo) return;
            if (_catalogoItemsFiltrado == null || _catalogoItemsFiltrado.Count == 0) return;

            string texto = combo.Text ?? string.Empty;
            int selStart = combo.SelectionStart;

            // Filtro "CONTIENE"
            var listaFiltrada = string.IsNullOrWhiteSpace(texto)
                ? _catalogoItemsFiltrado.ToList()
                : _catalogoItemsFiltrado
                    .Where(s => s.IndexOf(texto, StringComparison.CurrentCultureIgnoreCase) >= 0)
                    .ToList();

            combo.BeginUpdate();
            combo.Items.Clear();
            if (listaFiltrada.Count > 0)
                combo.Items.AddRange(listaFiltrada.Cast<object>().ToArray());
            combo.EndUpdate();

            // Mantener el texto que el usuario viene escribiendo
            combo.DroppedDown = true;                  // muestra la lista filtrada
            Cursor.Current = Cursors.Default;

            combo.Text = texto;
            combo.SelectionStart = Math.Min(selStart, combo.Text.Length);
            combo.SelectionLength = 0;
        }
        /// <summary>
        /// Al salir del combo, restaura la lista completa de Items
        /// pero conserva el texto elegido/escrito.
        /// </summary>
        /// <summary>
        /// Al salir del combo, restaura la lista completa de Items
        /// pero conserva el texto elegido/escrito, siempre y cuando
        /// dicho texto exista en el catálogo. Si no existe, se rechaza.
        /// </summary>
        private void ComboBusqueda_Leave(object? sender, EventArgs e)
        {
            if (sender is not ComboBox combo) return;
            if (_catalogoItemsFiltrado == null || _catalogoItemsFiltrado.Count == 0) return;

            string texto = combo.Text ?? string.Empty;

            // Restaurar SIEMPRE la lista completa en Items
            combo.BeginUpdate();
            combo.Items.Clear();
            combo.Items.AddRange(_catalogoItemsFiltrado.Cast<object>().ToArray());
            combo.EndUpdate();

            // Si el usuario dejó el combo vacío, lo aceptamos (sin ítem seleccionado)
            if (string.IsNullOrWhiteSpace(texto))
            {
                combo.Text = string.Empty;
                combo.SelectionStart = 0;
                combo.SelectionLength = 0;
                return;
            }

            // Validar que el texto coincida con algún ítem del catálogo
            bool existe = _catalogoItemsFiltrado
                .Any(s => string.Equals(s, texto, StringComparison.CurrentCultureIgnoreCase));

            if (!existe)
            {
                // Valor NO válido: avisar y limpiar el combo
                MessageBox.Show(
                    this,
                    $"El valor \"{texto}\" no corresponde a ningún ítem del catálogo.\n\n" +
                    "Por favor selecciona un ítem de la lista.",
                    "SICOE",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning
                );

                combo.Text = string.Empty;
                combo.SelectionStart = 0;
                combo.SelectionLength = 0;
                combo.Focus();
                return;
                AutoSyncCheckDesdeCombo(combo);
            }

            // Valor válido: lo dejamos tal cual, pero forzando a mostrar el INICIO
            combo.Text = texto;
            combo.SelectionStart = 0;
            combo.SelectionLength = 0;
        }


        // ================== EVENTOS COMBOBOX / CHECKBOX =====================

        private TramoRow? GetTramoActual()
        {
            if (_grid.CurrentRow == null)
                return null;

            return _grid.CurrentRow.DataBoundItem as TramoRow;
        }
        /// <summary>
        /// Copia la configuración de ítems y checks del PRIMER tramo
        /// al resto de tramos de la lista.
        /// NO toca cantidades numéricas (txtOtros).
        /// </summary>
        private void CopiarConfigDesdePrimeraFilaATodas()
        {
            if (_bs == null || _bs.Count <= 1) return;
            if (_bs[0] is not TramoRow origen) return;

            for (int i = 1; i < _bs.Count; i++)
            {
                if (_bs[i] is TramoRow t)
                {
                    // Checks
                    t.UsaExcav = origen.UsaExcav;
                    t.UsaAtraque = origen.UsaAtraque;
                    t.UsaLong = origen.UsaLong;
                    t.UsaRelleno = origen.UsaRelleno;
                    t.UsaEntibado = origen.UsaEntibado;
                    t.UsaCinta = origen.UsaCinta;
                    t.UsaOtros = origen.UsaOtros;
                    t.UsaCampana1 = origen.UsaCampana1;
                    t.UsaCampana2 = origen.UsaCampana2;

                    // Ítems de combos
                    t.ItemExcav = origen.ItemExcav;
                    t.ItemAtraque = origen.ItemAtraque;
                    t.ItemLong = origen.ItemLong;
                    t.ItemRelleno = origen.ItemRelleno;
                    t.ItemEntibado = origen.ItemEntibado;
                    t.ItemCinta = origen.ItemCinta;
                    t.ItemOtros = origen.ItemOtros;
                    t.ItemCampana1 = origen.ItemCampana1;
                    t.ItemCampana2 = origen.ItemCampana2;
                    t.CantCampana1 = origen.CantCampana1;
                    t.CantCampana2 = origen.CantCampana2;
                }
            }
        }
        /// <summary>
        /// Si el checkbox está activo y el tramo actual es el primero (fila 0),
        /// replica su configuración al resto de tramos.
        /// </summary>
        private void SincronizarConfigATodosSiCorresponde()
        {
            // CRÍTICO: Capturar estado del checkbox EN ESTE MOMENTO
            bool aplicarATodos = chkAplicarTodos.Checked;

            if (!aplicarATodos) return;
            if (_grid.CurrentRow == null) return;
            if (_grid.CurrentRow.Index != 0) return;

            CopiarConfigDesdePrimeraFilaATodas();
        }
        /// <summary>
        /// Si el usuario activa el checkbox después de haber llenado el primer tramo,
        /// copiamos de inmediato su configuración a todos los demás.
        /// </summary>
        private void ChkAplicarTodosConfig_CheckedChanged(object? sender, EventArgs e)
        {
            if (chkAplicarTodos.Checked)
            {
                CopiarConfigDesdePrimeraFilaATodas();
                ActualizarResumenSeleccion();
            }
        }

        private void CmbExcav_SelectedIndexChanged(object? sender, EventArgs e)
        {
            var r = GetTramoActual();
            if (r != null)
                r.ItemExcav = cmbExcav.Text;
            AutoSyncCheckDesdeCombo(cmbExcav);
            if (_cargandoDatos) return;
            SincronizarConfigATodosSiCorresponde();
            AjustarDropDownWidthSegunItems(cmbExcav);
            ResetComboCaretToStart(cmbExcav);
        }

        private void CmbAtraque_SelectedIndexChanged(object? sender, EventArgs e)
        {
            var r = GetTramoActual();
            if (r != null)
                r.ItemAtraque = cmbAtraque.Text;
            AutoSyncCheckDesdeCombo(cmbAtraque);
            if (_cargandoDatos) return;
            SincronizarConfigATodosSiCorresponde();
            AjustarDropDownWidthSegunItems(cmbAtraque);
            ResetComboCaretToStart(cmbAtraque);
        }

        private void CmbLong_SelectedIndexChanged(object? sender, EventArgs e)
        {
            var r = GetTramoActual();
            if (r != null)
                r.ItemLong = cmbLong.Text;
            AutoSyncCheckDesdeCombo(cmbLong);
            if (_cargandoDatos) return;
            SincronizarConfigATodosSiCorresponde();
            AjustarDropDownWidthSegunItems(cmbLong);
            ResetComboCaretToStart(cmbLong);
        }

        private void CmbRelleno_SelectedIndexChanged(object? sender, EventArgs e)
        {
            var r = GetTramoActual();
            if (r != null)
                r.ItemRelleno = cmbRelleno.Text;
            AutoSyncCheckDesdeCombo(cmbRelleno);
            if (_cargandoDatos) return;
            SincronizarConfigATodosSiCorresponde();
            AjustarDropDownWidthSegunItems(cmbRelleno);
            ResetComboCaretToStart(cmbRelleno);
        }

        private void CmbEntibado_SelectedIndexChanged(object? sender, EventArgs e)
        {
            var r = GetTramoActual();
            if (r != null)
                r.ItemEntibado = cmbEntibado.Text;
            AutoSyncCheckDesdeCombo(cmbEntibado);
            if (_cargandoDatos) return;
            SincronizarConfigATodosSiCorresponde();
            AjustarDropDownWidthSegunItems(cmbEntibado);
            ResetComboCaretToStart(cmbEntibado);
        }

        private void CmbCinta_SelectedIndexChanged(object? sender, EventArgs e)
        {
            var r = GetTramoActual();
            if (r != null)
                r.ItemCinta = cmbCinta.Text;
            AutoSyncCheckDesdeCombo(cmbCinta);
            if (_cargandoDatos) return;
            SincronizarConfigATodosSiCorresponde();
            AjustarDropDownWidthSegunItems(cmbCinta);
            ResetComboCaretToStart(cmbCinta);
        }

        private void CmbOtros_SelectedIndexChanged(object? sender, EventArgs e)
        {
            var r = GetTramoActual();
            if (r != null)
                r.ItemOtros = cmbOtros.Text;
            AutoSyncCheckDesdeCombo(cmbOtros);
            if (_cargandoDatos) return;
            SincronizarConfigATodosSiCorresponde();
            AjustarDropDownWidthSegunItems(cmbOtros);
            ResetComboCaretToStart(cmbOtros);
        }

        private void ChkExcav_CheckedChanged(object? sender, EventArgs e)
        {
            if (_cargandoDatos) return;
            var r = GetTramoActual();
            if (r != null)
                r.UsaExcav = chkExcav.Checked;
            SincronizarConfigATodosSiCorresponde();

        }

        private void ChkAtraque_CheckedChanged(object? sender, EventArgs e)
        {
            if (_cargandoDatos) return;
            var r = GetTramoActual();
            if (r != null)
                r.UsaAtraque = chkAtraque.Checked;
            SincronizarConfigATodosSiCorresponde();
        }

        private void ChkLong_CheckedChanged(object? sender, EventArgs e)
        {
            if (_cargandoDatos) return;
            var r = GetTramoActual();
            if (r != null)
                r.UsaLong = chkLong.Checked;
            SincronizarConfigATodosSiCorresponde();
        }

        private void ChkRelleno_CheckedChanged(object? sender, EventArgs e)
        {
            if (_cargandoDatos) return;
            var r = GetTramoActual();
            if (r != null)
                r.UsaRelleno = chkRelleno.Checked;
            SincronizarConfigATodosSiCorresponde();
        }

        private void ChkEntibado_CheckedChanged(object? sender, EventArgs e)
        {
            if (_cargandoDatos) return;
            var r = GetTramoActual();
            if (r != null)
                r.UsaEntibado = chkEntibado.Checked;
            SincronizarConfigATodosSiCorresponde();
        }

        private void ChkCinta_CheckedChanged(object? sender, EventArgs e)
        {
            if (_cargandoDatos) return;
            var r = GetTramoActual();
            if (r != null)
                r.UsaCinta = chkCinta.Checked;
            SincronizarConfigATodosSiCorresponde();
        }
        private void ChkOtros_CheckedChanged(object? sender, EventArgs e)
        {
            var r = GetTramoActual();
            if (r == null)
                return;

            r.UsaOtros = chkOtros.Checked;
            txtOtros.ReadOnly = !chkOtros.Checked;

            if (!chkOtros.Checked)
            {
                // Al desactivar "Otros" se limpian todas las cantidades e ítems
                r.CantOtros = 0;
                r.ItemOtros = string.Empty;
                r.OtrosDetalles.Clear();
                txtOtros.Text = string.Empty;
                // PlaceholderText no disponible en net48 — se omite
            }

            SincronizarConfigATodosSiCorresponde();
            ActualizarResumenSeleccion();
        }


        private void TxtOtros_Validated(object? sender, EventArgs e)
        {
            var r = GetTramoActual();
            if (r == null)
                return;

            // Texto digitado (factor por metro)
            var raw = txtOtros.Text.Trim();
            if (string.IsNullOrEmpty(raw))
                return;

            // Si no está activado "Otros", avisamos y no guardamos nada
            if (!chkOtros.Checked)
            {
                // Auto-activar para evitar error humano (misma lógica que en Nodos)
                chkOtros.Checked = true;
            }

            // Debe haber un ítem seleccionado en el combo
            var itemTexto = cmbOtros.Text?.Trim() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(itemTexto))
            {
                MessageBox.Show(this,
                    "Selecciona un ítem de presupuesto en el combo 'Otros' antes de digitar la cantidad por metro.",
                    "SICOE",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                cmbOtros.Focus();
                return;
            }

            // Factor por metro
            if (!double.TryParse(raw, NumberStyles.Float, CultureInfo.CurrentCulture, out var factor) || factor < 0)
            {
                MessageBox.Show(this,
                    "Cantidad numérica inválida para 'Otros'. Digita un valor mayor o igual a cero o deja el campo vacío.",
                    "SICOE",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                txtOtros.Focus();
                txtOtros.SelectAll();
                return;
            }

            // Longitud del tramo en metros
            double longitud = r.GetLongitud();
            if (longitud <= 0)
            {
                MessageBox.Show(this,
                    "La longitud del tramo es cero o inválida. Verifica las abscisas antes de agregar 'Otros'.",
                    "SICOE",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                return;
            }

            // Cantidad armonizada = factor × longitud del tramo
            double cantidadTramo = factor * longitud;

            // Registrar nuevo detalle (usando la clase anidada TramoRow.OtroDetalleTramo)
            var detalle = new TramoRow.OtroDetalleTramo
            {
                Item = itemTexto,
                FactorPorMetro = factor,
                CantidadReal = cantidadTramo
            };
            r.OtrosDetalles.Add(detalle);

            // Actualizar resumen de "Otros":
            //  - ItemOtros: concatenación simple de ítems (informativo)
            //  - CantOtros: suma total de cantidades armonizadas
            r.ItemOtros = string.Join(" + ", r.OtrosDetalles.Select(d => d.Item));
            r.CantOtros = r.OtrosDetalles.Sum(d => d.CantidadReal);

            // Limpiar controles para permitir agregar otro ítem "Otros"
            cmbOtros.Text = string.Empty;
            txtOtros.Clear();

            // Refrescar resumen y placeholder
            ActualizarResumenSeleccion();
        }


        // ================== EVENTOS UI ================================
        private void BtnCargar_Click(object sender, EventArgs e)
        {
            // 1) Validar que TODOS los tramos tengan NodoIni y NodoFin
            if (Resultado.Any(r => string.IsNullOrWhiteSpace(r.NodoIni) || string.IsNullOrWhiteSpace(r.NodoFin)))
            {
                MessageBox.Show(
                    this,
                    "Completa los nombres de nodo inicio y final en todas las filas.",
                    "SICOE",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning
                );
                return;
            }

            // 1B) Validar que exista al menos un concepto marcado
            bool hayConceptoMarcado = Resultado.Any(r =>
                            r.UsaExcav ||
                            r.UsaAtraque ||
                            r.UsaLong ||
                            r.UsaRelleno ||
                            r.UsaEntibado ||
                            r.UsaCinta ||
                            r.UsaOtros ||
                            r.UsaCampana1 ||
                            r.UsaCampana2);

            if (!hayConceptoMarcado)
            {
                MessageBox.Show(
                    this,
                    "Debes seleccionar al menos un ítem de presupuesto\n" +
                    "(Excavación, Atraque, Longitud, Relleno granular, Entibado, Cinta, Otros, Campanas 1 o Campanas 2)\n" +
                    "antes de cargar la información al presupuesto.",
                    "SICOE",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning
                );
                return;
            }
            if (!ValidarNoHayItemSinCheckTramos())
                return;

            // ===== NUEVO: Validar nodos no existentes en memoria =====
            if (!ValidarNodosExistentes())
                return;

            // 2) Cerrar el formulario.
            Close();
        }

        private void BtnAyuda_Click(object? sender, EventArgs e)
        {
            using var frm = new FrmAyudaTramos();
            frm.ShowDialog(this);
        }

        private void BtnGenerarInforme_Click(object sender, EventArgs e)
        {
            // DESACTIVADO — la información se envía directamente a ClaraCore
            return;
        }
        // ================== RESUMEN / CÁLCULOS ========================
        private void ActualizarResumenSeleccion()
        {
            if (_bs.Count == 0 || _grid.CurrentRow == null)
            {
                lblResumen.Text = "Sin tramos seleccionados.";
                LimpiarPanelInfoCantidades();
                return;
            }

            if (!(_grid.CurrentRow.DataBoundItem is TramoRow row))
            {
                lblResumen.Text = "Sin información del tramo.";
                LimpiarPanelInfoCantidades();
                return;
            }

            var calc = CalcularTramo(row);

            var tramoNombre = (!string.IsNullOrWhiteSpace(row.NodoIni) || !string.IsNullOrWhiteSpace(row.NodoFin))
                ? $"{row.NodoIni} - {row.NodoFin}"
                : "(sin nombre)";

            // --- Cálculo de pendiente m(%) ---
            double pendientePorc = 0.0;
            bool esContrapendiente = false;

            double L = calc.Longitud;              // longitud ya calculada
            double deltaClave = row.ClaveIni - row.ClaveFin; // Inicio - Fin

            if (L > 1e-6)
            {
                pendientePorc = Math.Abs(deltaClave / L * 100.0);  // en %
                esContrapendiente = (deltaClave > 0.0);
            }

            var sb = new StringBuilder();
            sb.AppendLine($"Tramo: {tramoNombre}");
            sb.AppendLine($"  Longitud: {calc.Longitud:F3} m");
            sb.AppendLine($"  Rasante promedio: {calc.RasanteProm:F3} m");
            sb.AppendLine($"  Cota clave promedio: {calc.ClaveProm:F3} m");
            sb.AppendLine($"  Cota fondo excavación (prom): {calc.CotaFondoProm:F3} m");
            sb.AppendLine($"  Altura excavación: {calc.AlturaExcavacion:F3} m");
            sb.AppendLine($"  Estruc Via / E.P.: {calc.EstrucViaEp:F3} m");
            sb.AppendLine($"  m(%): {pendientePorc:F3} %{(esContrapendiente ? " (Contrapendiente)" : string.Empty)}");
            sb.AppendLine($"  Área externa tubería: {calc.AreaExtTubos:F3} m²");
            sb.AppendLine($"  Volumen excavación: {calc.VolumenExcavacion:F3} m³");
            sb.AppendLine($"  Volumen atraque: {calc.VolumenAtraque:F3} m³");
            sb.AppendLine($"  Área entibado (2 caras): {calc.AreaEntibado:F3} m²");

            // Resumen de ítems "Otros" ya configurados
            int otrosCount = row.OtrosDetalles?.Count ?? 0;
            if (otrosCount > 0)
            {
                sb.AppendLine();
                sb.AppendLine("  Otros (armonizados con la longitud del tramo):");

                foreach (var o in row.OtrosDetalles)
                {
                    // Por seguridad, si CantidadReal estuviera en 0,
                    // recalculamos usando la longitud actual del tramo.
                    var cantReal = o.CantidadReal;
                    if (cantReal <= 0)
                        cantReal = o.FactorPorMetro * calc.Longitud;

                    sb.AppendLine(
                        $"    - {o.Item}: {cantReal:0.000} (factor {o.FactorPorMetro:0.000} × {calc.Longitud:0.000} m)");
                }

                sb.AppendLine($"    Total 'Otros': {row.CantOtros:0.000}");
            }

            lblResumen.Text = sb.ToString();


            // ======= Panel "Información de tramo" =======
            lblRasantePromValor.Text = calc.RasanteProm.ToString("0.000");
            lblClavePromValor.Text = calc.ClaveProm.ToString("0.000");
            lblFondoExcValor.Text = calc.CotaFondoProm.ToString("0.000");
            lblAlturaExcValor.Text = calc.AlturaExcavacion.ToString("0.000");
            lblPendienteValor.Text = pendientePorc.ToString("0.000") +
                                     (esContrapendiente ? " (Contrapendiente)" : string.Empty);
            lblAreaTubValor.Text = calc.AreaExtTubos.ToString("0.000");
            lblAreaSegAtraqueValor.Text = calc.AreaSegAtraque > 0
                            ? calc.AreaSegAtraque.ToString("0.0000") : "";
            lblAreaSegRellenoValor.Text = calc.AreaSegRelleno > 0
                ? calc.AreaSegRelleno.ToString("0.0000") : "";

            // ======= Panel "Cantidades tramo" =======
            txtExcav.Text = calc.VolumenExcavacion.ToString("0.000"); // m³
            txtAtraque.Text = calc.VolumenAtraque.ToString("0.000");   // m³
            txtLong.Text = calc.LongitudINT.ToString("0.000");            // m
            // RELLENO GRANULAR: usar cálculo consistente con CalcularTramo
            txtRelleno.Text = calc.VolumenRelleno.ToString("0.000");   // m³
            txtEntibado.Text = calc.AreaEntibado.ToString("0.000");    // m²
            txtCinta.Text = calc.LongitudMED.ToString("0.000");           // m

            // Para "Otros": el textbox funciona como entrada de factor por metro.
            // Lo dejamos vacío y usamos Placeholder para indicar el estado.
            // Para "Otros": el textbox funciona como entrada de factor por metro.
            // Lo dejamos vacío y usamos Placeholder para indicar el estado.
            txtOtros.Text = string.Empty;
            if (otrosCount > 0)
                if (string.IsNullOrWhiteSpace(txtOtros.Text))
                    txtOtros.Text = $"{otrosCount} ítem(s) configurados. Total = {row.CantOtros:0.000}";
                else
                    // PlaceholderText no disponible en net48 — se omite

                    // ===== CARGA DE CONTROLES (guardia para evitar efectos secundarios) =====
                    _cargandoDatos = true;
            try
            {
                // CheckBox por tramo
                chkExcav.Checked = row.UsaExcav;
                chkAtraque.Checked = row.UsaAtraque;
                chkLong.Checked = row.UsaLong;
                chkRelleno.Checked = row.UsaRelleno;
                chkEntibado.Checked = row.UsaEntibado;
                chkCinta.Checked = row.UsaCinta;
                chkOtros.Checked = row.UsaOtros;
                chkCampana1.Checked = row.UsaCampana1;
                chkCampana2.Checked = row.UsaCampana2;

                // TextBox "Otros" solo editable cuando UsaOtros está activo
                txtOtros.ReadOnly = !row.UsaOtros;

                // TextBox Campanas: editable solo cuando el check está activo
                txtCampana1.ReadOnly = !row.UsaCampana1;
                txtCampana2.ReadOnly = !row.UsaCampana2;

                // Combos con el texto guardado en el tramo
                cmbExcav.Text = row.ItemExcav;
                cmbAtraque.Text = row.ItemAtraque;
                cmbLong.Text = row.ItemLong;
                cmbRelleno.Text = row.ItemRelleno;
                cmbEntibado.Text = row.ItemEntibado;
                cmbCinta.Text = row.ItemCinta;
                cmbOtros.Text = row.ItemOtros;
                cmbCampana1.Text = row.ItemCampana1;
                cmbCampana2.Text = row.ItemCampana2;

                // Cantidades de Campanas (mostrar 0 como vacío para mejor UX)
                txtCampana1.Text = row.CantCampana1 > 0 ? row.CantCampana1.ToString() : string.Empty;
                txtCampana2.Text = row.CantCampana2 > 0 ? row.CantCampana2.ToString() : string.Empty;
            }
            finally
            {
                _cargandoDatos = false;
            }

        }

        private void LimpiarPanelInfoCantidades()
        {
            lblRasantePromValor.Text = string.Empty;
            lblClavePromValor.Text = string.Empty;
            lblFondoExcValor.Text = string.Empty;
            lblAlturaExcValor.Text = string.Empty;
            lblPendienteValor.Text = string.Empty;
            lblAreaTubValor.Text = string.Empty;
            lblAreaSegAtraqueValor.Text = string.Empty;
            lblAreaSegRellenoValor.Text = string.Empty;

            txtExcav.Text = string.Empty;
            txtAtraque.Text = string.Empty;
            txtLong.Text = string.Empty;
            txtRelleno.Text = string.Empty;
            txtEntibado.Text = string.Empty;
            txtCinta.Text = string.Empty;
            txtOtros.Text = string.Empty;
            txtCampana1.Text = string.Empty;
            txtCampana2.Text = string.Empty;
        }


        private sealed class CalculosTramo
        {
            public double Longitud;
            public double RasanteProm;
            public double ClaveProm;
            public double CotaFondoProm;
            public double AlturaExcavacion;
            public double VolumenExcavacion;
            public double VolumenAtraque;
            public double AreaEntibado;
            public double AlturaEntibadoBase; // altura sin descuento EstrucViaEp
            public double AreaExtTubos;      // NUEVO: área total externa de tuberías
            // NUEVO: datos geométricos para presupuesto
            public double AnchoExcavacion;
            public double AlturaAtraque;
            public double AlturaRelleno;
            public double AreaSegAtraque;
            public double AreaSegRelleno;
            public double VolumenRelleno;
            public double EstrucViaEp;
            // Longitudes diferenciadas por contorno de nodo
            public double LongitudINT;   // Tubería / Cinta (con descuento campanas)
            public double LongitudMED;   // Relleno / Atraque / Entibado (NODO_MED)
            public double LongitudEXT;   // Excavación (NODO_EXT)
        }

        private static (double hAtraque, bool esProporcional) ParseAtraque(
                    string texto, double diametroExtM)
        {
            if (string.IsNullOrWhiteSpace(texto)) return (0.0, false);
            var t = texto.Trim();
            if (t.Contains(':'))
            {
                var parts = t.Split(':');
                if (parts.Length == 2 &&
                    double.TryParse(parts[0].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out double num) &&
                    double.TryParse(parts[1].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out double den) &&
                    den > 0 && num > 0)
                {
                    double h = Math.Max(0.0, Math.Min(diametroExtM, (num / den) * diametroExtM));
                    return (h, true);
                }
            }
            if (double.TryParse(t, System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture, out double val))
                return (Math.Max(0.0, val), false);
            return (0.0, false);
        }

        private static double AreaSegmentoCircular(double r, double h)
        {
            if (h <= 0) return 0.0;
            if (h >= 2 * r) return Math.PI * r * r;
            double cosVal = Math.Max(-1.0, Math.Min(1.0, (r - h) / r));
            double theta = 2.0 * Math.Acos(cosVal);
            return r * r * (theta - Math.Sin(theta)) / 2.0;
        }

        private CalculosTramo CalcularTramo(TramoRow r)
        {
            var res = new CalculosTramo();

            // Longitud en metros a partir de las abscisas
            res.Longitud = r.GetLongitud();
            // Descuento por campanas activas: 0.10 m fijo si hay AL MENOS una campana marcada
            if (r.UsaCampana1 || r.UsaCampana2)
                res.Longitud = Math.Max(0.0, res.Longitud - 0.10);

            // Longitudes diferenciadas por contorno de nodo
            // LongitudINT: intersección con NODO_INT (geometría real entre caras internas)
            // Fallback: longitud física ya con descuento de campanas
            var (lExt, lMed, lInt) = ObtenerLongitudesNodo(r.Handle, res.Longitud);
            res.LongitudINT = lInt;
            res.LongitudEXT = lExt;
            res.LongitudMED = lMed;

            // Geometría base tomada de la fila
            res.AnchoExcavacion = Math.Round(r.AnchoExcavacion, 2, MidpointRounding.AwayFromZero);
            // Rasante / clave promedios
            res.RasanteProm = (r.RasanteIni + r.RasanteFin) / 2.0;
            res.ClaveProm = (r.ClaveIni + r.ClaveFin) / 2.0;

            // diametroTexto puede venir en pulgadas ("12\"") o en mm ("300")
            // Espesor y cimentación se ingresan en METROS en la grilla.
            double diametroMmEquiv, areaExtTubos;
            CalcularDiametros(r.DiametroTexto, r.EspesorTuberiaMm, out diametroMmEquiv, out areaExtTubos);

            var diametroM = diametroMmEquiv / 1000.0; // mm → m
            var espesorM = r.EspesorTuberiaMm;       // ya en m (ej. 0.03)
            var cimM = r.CimentacionMm;          // ya en m (ej. 0.15)

            double diametroExtM = diametroM + 2.0 * espesorM;
            double radioExtM = diametroExtM / 2.0;
            var (hAtraque, esProporcional) = ParseAtraque(r.AlturaAtraqueTexto, diametroExtM);
            res.AlturaAtraque = hAtraque;

            // Cota fondo excavación (promedio) geométrica
            res.CotaFondoProm = res.ClaveProm - (diametroM + espesorM + cimM);

            // Altura de excavación "automática" a partir de geometría
            double alturaAuto = res.RasanteProm - res.CotaFondoProm;
            if (alturaAuto < 0) alturaAuto = 0.0;

            // Si el usuario digitó una altura manual válida, se usa esa
            double alturaBase;
            if (r.AlturaExcManual.HasValue && r.AlturaExcManual.Value > 0)
                alturaBase = r.AlturaExcManual.Value;
            else
                alturaBase = alturaAuto;

            // ===== NUEVO: Descontar EstrucViaEp de la altura base =====
            double estrucViaEp = (r.EstrucViaEp.HasValue && r.EstrucViaEp.Value > 0)
                ? r.EstrucViaEp.Value
                : 0.0;

            res.EstrucViaEp = estrucViaEp;

            // Altura de excavación FINAL = altura base - EstrucViaEp
            res.AlturaExcavacion = Math.Round(alturaBase - estrucViaEp, 2, MidpointRounding.AwayFromZero);
            if (res.AlturaExcavacion < 0.0) res.AlturaExcavacion = 0.0;

            // Volumen excavación usa LongitudEXT (hasta contorno externo del nodo)
            res.VolumenExcavacion = res.LongitudEXT * r.AnchoExcavacion * res.AlturaExcavacion;

            // Volumen atraque
            if (esProporcional)
            {
                double areaSegAtraque = AreaSegmentoCircular(radioExtM, hAtraque);
                double alturaZanjaAtraque = cimM + hAtraque;
                res.VolumenAtraque = res.LongitudMED *
                    (r.AnchoExcavacion * alturaZanjaAtraque - areaSegAtraque);
                res.AreaSegAtraque = areaSegAtraque;
            }
            else
            {
                res.VolumenAtraque = res.LongitudMED * r.AnchoExcavacion * hAtraque
                                     - res.LongitudMED * areaExtTubos;
            }
            if (res.VolumenAtraque < 0) res.VolumenAtraque = 0.0;

            // Relleno granular
            // Formato A (proporción): el atraque es relativo al tubo, se descuenta cimM aparte
            // Formato B (decimal): hAtraque ya es altura absoluta desde el fondo
            double alturaRelleno = esProporcional
                ? res.AlturaExcavacion - cimM - hAtraque
                : res.AlturaExcavacion - hAtraque;
            if (alturaRelleno < 0.0) alturaRelleno = 0.0;

            if (esProporcional)
            {
                // Área del tubo restante por encima del atraque = πr² - segmento inferior
                double areaTuboRestante = Math.PI * radioExtM * radioExtM
                                          - AreaSegmentoCircular(radioExtM, hAtraque);
                double areaNetaRelleno = r.AnchoExcavacion * alturaRelleno - areaTuboRestante;
                if (areaNetaRelleno < 0) areaNetaRelleno = 0.0;

                res.VolumenRelleno = res.LongitudMED * areaNetaRelleno;

                // Áreas netas para visualización/verificación
                res.AreaSegAtraque = r.AnchoExcavacion * (cimM + hAtraque)
                                     - AreaSegmentoCircular(radioExtM, hAtraque);
                res.AreaSegRelleno = areaNetaRelleno;
            }
            else
            {
                res.VolumenRelleno = res.LongitudMED * r.AnchoExcavacion * alturaRelleno;
                res.AreaSegAtraque = 0.0;
                res.AreaSegRelleno = 0.0;
            }
            if (res.VolumenRelleno < 0) res.VolumenRelleno = 0.0;

            res.AlturaRelleno = Math.Round(alturaRelleno, 2, MidpointRounding.AwayFromZero);

            // Entibado tipo CAJÓN — usa alturaBase completa (sin descontar EstrucViaEp)
            // porque las paredes de la zanja existen en toda la altura, incluyendo la estructura de vía
            double alturaEntibadoCajon = GetAlturaEntibadoCajon(alturaBase);

            // Área entibado (2 caras) usa LongitudMED — siempre con alturaBase sin descuento
            res.AlturaEntibadoBase = alturaEntibadoCajon;
            res.AreaEntibado = (alturaEntibadoCajon > 0.0)
                ? 2.0 * alturaEntibadoCajon * res.LongitudMED
                : 0.0;

            // Guardamos el área externa total de tuberías (m²)
            res.AreaExtTubos = areaExtTubos;

            return res;
        }
        // ========= RESUMEN PARA PRESUPUESTO (consumido por FrmSicoePresupuesto) =========
        public sealed class TramoPresupuestoInfo
        {
            public string Handle { get; set; } = "";
            public string NodoIni { get; set; } = "";
            public string NodoFin { get; set; } = "";

            public double Longitud { get; set; }

            // Longitudes diferenciadas por contorno de nodo
            public double LongitudINT { get; set; }   // Tubería / Cinta
            public double LongitudMED { get; set; }   // Relleno / Atraque / Entibado
            public double LongitudEXT { get; set; }   // Excavación

            // Geometría base
            public double AnchoExcavacion { get; set; }
            public double AlturaExcavacion { get; set; }
            public double AlturaAtraque { get; set; }
            public double AlturaRelleno { get; set; }
            public double EstrucViaEp { get; set; }


            // Cantidades por concepto
            public double VolExcavacion { get; set; }
            public double VolAtraque { get; set; }
            public double VolRelleno { get; set; }
            public double AreaEntibado { get; set; }
            public double CantOtros { get; set; }
            public bool UsaExcav { get; set; }
            public bool UsaAtraque { get; set; }
            public bool UsaLong { get; set; }
            public bool UsaRelleno { get; set; }
            public bool UsaEntibado { get; set; }
            public bool UsaCinta { get; set; }
            public bool UsaOtros { get; set; }
            public bool UsaCampana1 { get; set; }
            public bool UsaCampana2 { get; set; }
            // Cotas del tramo (desde TramoRow)
            public double RasanteIni { get; set; }
            public double RasanteFin { get; set; }
            public double ClaveIni { get; set; }
            public double ClaveFin { get; set; }
            public string ItemExcav { get; set; } = string.Empty;
            public string ItemAtraque { get; set; } = string.Empty;
            public string ItemLong { get; set; } = string.Empty;
            public string ItemRelleno { get; set; } = string.Empty;
            public string ItemEntibado { get; set; } = string.Empty;
            public string ItemCinta { get; set; } = string.Empty;
            public string ItemOtros { get; set; } = string.Empty;
            public string ItemCampana1 { get; set; } = string.Empty;
            public string ItemCampana2 { get; set; } = string.Empty;
            public int CantCampana1 { get; set; }
            public int CantCampana2 { get; set; }
        }

        /// <summary>
        /// Construye la lista de información de presupuesto por HANDLE de tramo.
        /// Se usa desde FrmSicoePresupuesto cuando se cierra el formulario.
        /// </summary>
        public List<TramoPresupuestoInfo> BuildPresupuestoInfo()
        {
            var lista = new List<TramoPresupuestoInfo>();

            foreach (var r in Resultado)
            {
                if (r == null || string.IsNullOrWhiteSpace(r.Handle))
                    continue;

                var c = CalcularTramo(r);

                lista.Add(new TramoPresupuestoInfo
                {
                    Handle = r.Handle,
                    NodoIni = r.NodoIni ?? "",
                    NodoFin = r.NodoFin ?? "",

                    Longitud = c.Longitud,

                    LongitudINT = c.LongitudINT,
                    LongitudMED = c.LongitudMED,
                    LongitudEXT = c.LongitudEXT,

                    AnchoExcavacion = c.AnchoExcavacion,
                    AlturaExcavacion = c.AlturaExcavacion,
                    AlturaAtraque = c.AlturaAtraque,
                    AlturaRelleno = c.AlturaRelleno,
                    EstrucViaEp = c.EstrucViaEp,

                    VolExcavacion = c.VolumenExcavacion,
                    VolAtraque = c.VolumenAtraque,
                    VolRelleno = c.VolumenRelleno,
                    AreaEntibado = c.AreaEntibado,
                    CantOtros = r.CantOtros,
                    UsaExcav = r.UsaExcav,
                    UsaAtraque = r.UsaAtraque,
                    UsaLong = r.UsaLong,
                    UsaRelleno = r.UsaRelleno,
                    UsaEntibado = r.UsaEntibado,
                    UsaCinta = r.UsaCinta,
                    UsaOtros = r.UsaOtros,
                    UsaCampana1 = r.UsaCampana1,
                    UsaCampana2 = r.UsaCampana2,

                    ItemExcav = r.ItemExcav ?? "",
                    ItemAtraque = r.ItemAtraque ?? "",
                    ItemLong = r.ItemLong ?? "",
                    ItemRelleno = r.ItemRelleno ?? "",
                    ItemEntibado = r.ItemEntibado ?? "",
                    ItemCinta = r.ItemCinta ?? "",
                    ItemOtros = r.ItemOtros ?? "",
                    ItemCampana1 = r.ItemCampana1 ?? "",
                    ItemCampana2 = r.ItemCampana2 ?? "",
                    CantCampana1 = r.CantCampana1,
                    CantCampana2 = r.CantCampana2,

                    RasanteIni = r.RasanteIni,
                    RasanteFin = r.RasanteFin,
                    ClaveIni = r.ClaveIni,
                    ClaveFin = r.ClaveFin,
                });
            }

            return lista;
        }
        /// <summary>
        /// Interpreta el texto de diámetro
        /// Interpreta el texto de diámetro (en pulgadas o mm) y devuelve:
        /// - diametroMmEquiv: diámetro equivalente (mm) para la cota de fondo
        /// - areaExtTubos: suma de áreas externas (m²) para el cálculo de atraque
        /// Soporta formatos como:
        ///   "12\""                -> 1 tubo de 12"
        ///   "6Ø6\"+3Ø3\""         -> 6 tubos de 6" + 3 tubos de 3"
        ///   "300" o "300mm"       -> 300 mm
        /// Si lleva comillas (") se interpreta como pulgadas.
        /// Si no lleva comillas, se interpreta como milímetros.
        /// </summary>
        private void CalcularDiametros(string diametroTexto, double espesorM,
                                       out double diametroMmEquiv,
                                       out double areaExtTubos)
        {
            diametroMmEquiv = 0.0;
            areaExtTubos = 0.0;

            if (string.IsNullOrWhiteSpace(diametroTexto))
                return;

            // Espesor en mm para el cálculo de radio externo
            var espesorMm = espesorM * 1000.0;

            // Normaliza texto
            var txt = diametroTexto.Replace(" ", "").ToUpperInvariant();

            var partes = txt.Split(new[] { '+' }, StringSplitOptions.RemoveEmptyEntries);

            double maxDiamMm = 0.0;
            double areaTotalM2 = 0.0;

            foreach (var parte in partes)
            {
                int nTuberias;
                double diamInch;

                if (!TryParseParteDiametro(parte, out nTuberias, out diamInch))
                    continue;

                // Si el texto tenía comillas, se considera pulgadas
                // (TryParseParteDiametro ya lee el valor en pulgadas)
                var diamMm = diamInch * 25.4;  // pulgadas → mm
                var radioExtMm = (diamMm + 2.0 * espesorMm) / 2.0;
                var radioExtM = radioExtMm / 1000.0;

                var areaExt = Math.PI * radioExtM * radioExtM; // m²
                areaTotalM2 += nTuberias * areaExt;

                if (diamMm > maxDiamMm)
                    maxDiamMm = diamMm;
            }

            // Caso especial: si no se reconoció formato, intentamos mm directos sin comillas
            if (maxDiamMm <= 0.0)
            {
                var limpio = new string(diametroTexto.Where(char.IsDigit).ToArray());
                if (double.TryParse(limpio, NumberStyles.Float, CultureInfo.InvariantCulture, out var dmm))
                    maxDiamMm = dmm; // ya en mm
            }

            if (maxDiamMm < 0.0) maxDiamMm = 0.0;

            diametroMmEquiv = maxDiamMm;
            areaExtTubos = areaTotalM2;
        }

        private bool TryParseParteDiametro(string parte, out int nTuberias, out double diamInch)
        {
            nTuberias = 1;
            diamInch = 0.0;

            // Ejemplos: "6Ø6\"", "3X4\"", "2*8\""
            int idx = parte.IndexOf('Ø');
            if (idx < 0) idx = parte.IndexOf('X');
            if (idx < 0) idx = parte.IndexOf('*');

            string cantStr, diamStr;

            if (idx >= 0)
            {
                cantStr = parte.Substring(0, idx);
                diamStr = parte.Substring(idx + 1);
            }
            else
            {
                cantStr = "1";
                diamStr = parte;
            }

            if (!int.TryParse(cantStr, NumberStyles.Integer, CultureInfo.InvariantCulture, out nTuberias) || nTuberias <= 0)
                nTuberias = 1;

            bool tieneComillas = diamStr.Contains('"');
            diamStr = diamStr.Replace("\"", "");

            if (!double.TryParse(diamStr, NumberStyles.Float, CultureInfo.InvariantCulture, out diamInch))
                return false;

            if (diamInch <= 0.0) return false;

            // Sin comillas: el valor es mm o metros, NO pulgadas
            if (!tieneComillas)
            {
                double valorMm = diamInch < 1.0
                    ? diamInch * 1000.0   // metros → mm  (ej: 0.298 → 298mm)
                    : diamInch;           // ya en mm     (ej: 298 → 298mm)
                diamInch = valorMm / 25.4; // convertir a "pulgadas" para que CalcularDiametros multiplique bien
            }

            return true;
        }
        // ================== EXPORTAR JSON / LISTA ======================

        private List<TramoJson> BuildTramoJsonList()
        {
            var lista = new List<TramoJson>();

            foreach (var r in Resultado)
            {
                var c = CalcularTramo(r);

                lista.Add(new TramoJson
                {
                    Handle = r.Handle,
                    AbsIni = r.AbsIni,
                    AbsFin = r.AbsFin,
                    NodoIni = r.NodoIni,
                    NodoFin = r.NodoFin,

                    NorteIni = r.NorteIni,
                    EsteIni = r.EsteIni,
                    NorteFin = r.NorteFin,
                    EsteFin = r.EsteFin,

                    RasanteIni = r.RasanteIni,
                    RasanteFin = r.RasanteFin,
                    ClaveIni = r.ClaveIni,
                    ClaveFin = r.ClaveFin,

                    DiametroTexto = r.DiametroTexto,
                    EspesorTuberiaMm = r.EspesorTuberiaMm,
                    AnchoExcavacion = r.AnchoExcavacion,
                    CimentacionMm = r.CimentacionMm,
                    AlturaAtraqueTexto = r.AlturaAtraqueTexto,
                    EstrucViaEp = (r.EstrucViaEp.HasValue ? r.EstrucViaEp.Value : 0.0),

                    Longitud = c.Longitud,
                    RasanteProm = c.RasanteProm,
                    ClaveProm = c.ClaveProm,
                    CotaFondoProm = c.CotaFondoProm,
                    AlturaExcavacion = c.AlturaExcavacion,
                    VolumenExcavacion = c.VolumenExcavacion,
                    VolumenAtraque = c.VolumenAtraque,
                    AreaEntibado = c.AreaEntibado,
                    AreaExtTubos = c.AreaExtTubos,
                    VolumenRelleno = c.VolumenRelleno,
                    CantOtros = r.CantOtros,

                    UsaExcav = r.UsaExcav,
                    UsaAtraque = r.UsaAtraque,
                    UsaLong = r.UsaLong,
                    UsaRelleno = r.UsaRelleno,
                    UsaEntibado = r.UsaEntibado,
                    UsaCinta = r.UsaCinta,
                    UsaOtros = r.UsaOtros,
                    UsaCampana1 = r.UsaCampana1,
                    UsaCampana2 = r.UsaCampana2,

                    ItemExcav = r.ItemExcav ?? string.Empty,
                    ItemAtraque = r.ItemAtraque ?? string.Empty,
                    ItemLong = r.ItemLong ?? string.Empty,
                    ItemRelleno = r.ItemRelleno ?? string.Empty,
                    ItemEntibado = r.ItemEntibado ?? string.Empty,
                    ItemCinta = r.ItemCinta ?? string.Empty,
                    ItemOtros = r.ItemOtros ?? string.Empty,
                    ItemCampana1 = r.ItemCampana1 ?? string.Empty,
                    ItemCampana2 = r.ItemCampana2 ?? string.Empty,
                    CantCampana1 = r.CantCampana1,
                    CantCampana2 = r.CantCampana2
                });
            }

            return lista;
        }


        public List<TramoJson> GetTramoJsonList()
        {
            var lista = new List<TramoJson>();

            foreach (var r in Resultado)
            {
                var c = CalcularTramo(r);

                lista.Add(new TramoJson
                {
                    Handle = r.Handle,
                    AbsIni = r.AbsIni,
                    AbsFin = r.AbsFin,
                    NodoIni = r.NodoIni,
                    NodoFin = r.NodoFin,

                    NorteIni = r.NorteIni,
                    EsteIni = r.EsteIni,
                    NorteFin = r.NorteFin,
                    EsteFin = r.EsteFin,

                    RasanteIni = r.RasanteIni,
                    RasanteFin = r.RasanteFin,
                    ClaveIni = r.ClaveIni,
                    ClaveFin = r.ClaveFin,

                    DiametroTexto = r.DiametroTexto,
                    EspesorTuberiaMm = r.EspesorTuberiaMm,
                    AnchoExcavacion = r.AnchoExcavacion,
                    CimentacionMm = r.CimentacionMm,
                    AlturaAtraqueTexto = r.AlturaAtraqueTexto,
                    EstrucViaEp = (r.EstrucViaEp.HasValue ? r.EstrucViaEp.Value : 0.0),

                    Longitud = c.Longitud,
                    RasanteProm = c.RasanteProm,
                    ClaveProm = c.ClaveProm,
                    CotaFondoProm = c.CotaFondoProm,
                    AlturaExcavacion = c.AlturaExcavacion,
                    VolumenExcavacion = c.VolumenExcavacion,
                    VolumenAtraque = c.VolumenAtraque,
                    AreaEntibado = c.AreaEntibado,
                    AreaExtTubos = c.AreaExtTubos,
                    VolumenRelleno = c.VolumenRelleno,
                    CantOtros = r.CantOtros,

                    UsaExcav = r.UsaExcav,
                    UsaAtraque = r.UsaAtraque,
                    UsaLong = r.UsaLong,
                    UsaRelleno = r.UsaRelleno,
                    UsaEntibado = r.UsaEntibado,
                    UsaCinta = r.UsaCinta,
                    UsaOtros = r.UsaOtros,
                    UsaCampana1 = r.UsaCampana1,
                    UsaCampana2 = r.UsaCampana2,

                    ItemExcav = r.ItemExcav ?? string.Empty,
                    ItemAtraque = r.ItemAtraque ?? string.Empty,
                    ItemLong = r.ItemLong ?? string.Empty,
                    ItemRelleno = r.ItemRelleno ?? string.Empty,
                    ItemEntibado = r.ItemEntibado ?? string.Empty,
                    ItemCinta = r.ItemCinta ?? string.Empty,
                    ItemOtros = r.ItemOtros ?? string.Empty,
                    ItemCampana1 = r.ItemCampana1 ?? string.Empty,
                    ItemCampana2 = r.ItemCampana2 ?? string.Empty,
                    CantCampana1 = r.CantCampana1,
                    CantCampana2 = r.CantCampana2
                });
            }

            return lista;
        }

        public string GenerarJsonTramos()
        {
            var lista = BuildTramoJsonList();

            return JsonConvert.SerializeObject(lista, Newtonsoft.Json.Formatting.Indented);
        }
        private void _grid_SelectionChanged(object? sender, EventArgs e)
        {
            ActualizarResumenSeleccion();

            // ===== NUEVO: mostrar el checkbox "Aplicar a todos los tramos" SOLO cuando se está parado en la primera fila =====
            try
            {
                if (_grid.CurrentRow != null)
                {
                    // Si estoy en la fila 0 → mostrar
                    // Si estoy en cualquier otra fila → ocultar
                    chkAplicarTodos.Visible = (_grid.CurrentRow.Index == 0);
                }
            }
            catch
            {
                // Seguridad silenciosa
                chkAplicarTodos.Visible = true;
            }
        }

        private void _grid_CellBeginEdit(object? sender, DataGridViewCellCancelEventArgs e)
        {
            if (e.RowIndex < 0 || e.ColumnIndex < 0)
                return;

            var col = _grid.Columns[e.ColumnIndex];

            // Dejamos la columna AlturaExcManual SIEMPRE editable.
            // Ya no cancelamos la edición aunque el diámetro NO sea compuesto.
            if (!string.Equals(col.DataPropertyName, "AlturaExcManual", StringComparison.OrdinalIgnoreCase))
                return;

            // No hacemos nada más: el usuario puede escribir libremente.
            // La validación y prioridad de este valor se maneja en _grid_CellEndEdit
            // y en CalcularTramo (AlturaExcManual prevalece sobre la altura calculada).
        }


        private void _grid_CellEndEdit(object? sender, DataGridViewCellEventArgs e)
        {
            // Evitar recursión si ya estamos replicando
            if (_replicandoValoresEnGrid)
            {
                ActualizarResumenSeleccion();
                return;
            }

            if (e.RowIndex < 0 || e.ColumnIndex < 0)
            {
                ActualizarResumenSeleccion();
                return;
            }

            // ==============================================================
            // FUNCIONALIDAD: "Aplicar a todos" extendido a DataGrid
            // ==============================================================
            // CRÍTICO: Verificar el estado del checkbox EN EL MOMENTO de la edición
            bool aplicarATodos = chkAplicarTodos.Checked;

            if (aplicarATodos && e.RowIndex >= 0 && e.ColumnIndex >= 0)
            {
                var colName = _grid.Columns[e.ColumnIndex].DataPropertyName;

                // Lista de columnas que se deben replicar (TODAS las editables)
                var columnasReplicables = new[]
                {
                    "DiametroTexto",
                    "AlturaExcManual",
                    "EstrucViaEp",
                    "RasanteIni",
                    "RasanteFin",
                    "ClaveIni",
                    "ClaveFin",
                    "LongitudCalzada",
                    "AnchoCalzada",
                    "AnchoExcavacion",
                    "TaludExcavacion",
                    "BaseGranular",
                    "SubBase",
                    "PendienteTramo",
                    "EspesorTuberiaMm",
                    "CimentacionMm",
                    "AlturaAtraque"
                };

                // Si la columna editada es replicable
                if (columnasReplicables.Contains(colName))
                {
                    _replicandoValoresEnGrid = true;
                    try
                    {
                        // Obtener el valor de la celda editada
                        var valorEditado = _grid.Rows[e.RowIndex].Cells[e.ColumnIndex].Value;

                        // Replicar a todas las filas hacia abajo
                        for (int i = e.RowIndex + 1; i < _grid.Rows.Count; i++)
                        {
                            _grid.Rows[i].Cells[e.ColumnIndex].Value = valorEditado;
                        }

                        // Refrescar el grid
                        _grid.Refresh();
                    }
                    finally
                    {
                        _replicandoValoresEnGrid = false;
                    }
                }
            }

            var col = _grid.Columns[e.ColumnIndex];
            var rowGrid = _grid.Rows[e.RowIndex];

            if (rowGrid.DataBoundItem is not TramoRow row)
            {
                ActualizarResumenSeleccion();
                return;
            }

            // Si se editó la altura manual, parseamos y guardamos en la fila
            if (string.Equals(col.DataPropertyName, "AlturaExcManual", StringComparison.OrdinalIgnoreCase))
            {
                var raw = Convert.ToString(rowGrid.Cells[e.ColumnIndex].Value) ?? string.Empty;

                // Intentamos en cultura actual (coincide con lo que ves en la grilla)
                if (double.TryParse(raw, NumberStyles.Float, CultureInfo.CurrentCulture, out double h) && h > 0)
                {
                    row.AlturaExcManual = h;
                }
                else
                {
                    // Valor inválido → volvemos a automática
                    row.AlturaExcManual = null;
                    rowGrid.Cells[e.ColumnIndex].Value = null;
                }
            }
            // NUEVO: Estruc Via / E.P. (m)
            if (string.Equals(col.DataPropertyName, "EstrucViaEp", StringComparison.OrdinalIgnoreCase))
            {
                var raw = Convert.ToString(rowGrid.Cells[e.ColumnIndex].Value) ?? string.Empty;
                raw = raw.Trim();

                if (string.IsNullOrWhiteSpace(raw))
                {
                    row.EstrucViaEp = null;               // vacío = 0 en cálculo
                    rowGrid.Cells[e.ColumnIndex].Value = null;
                }
                else if (double.TryParse(raw, NumberStyles.Float, CultureInfo.CurrentCulture, out double v) && v >= 0)
                {
                    row.EstrucViaEp = v;
                    rowGrid.Cells[e.ColumnIndex].Value = v; // normaliza
                }
                else
                {
                    MessageBox.Show(this,
                        "Valor inválido en 'Estruc Via / E.P.'\n\nDigita un número mayor o igual a cero, o deja vacío.",
                        "SICOE",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Warning);

                    row.EstrucViaEp = null;
                    rowGrid.Cells[e.ColumnIndex].Value = null;
                }
            }
            // ===== Validación distancia entre ejes de nodos vs entidad seleccionada =====
            if (string.Equals(col.DataPropertyName, "NodoIni", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(col.DataPropertyName, "NodoFin", StringComparison.OrdinalIgnoreCase))
            {
                ValidarDistanciaNodosVsEntidad(row);
            }
            // Si se editó el diámetro, guardar el valor para futuras sugerencias
            if (string.Equals(col.DataPropertyName, "DiametroTexto", StringComparison.OrdinalIgnoreCase))
            {
                var rawDiam = Convert.ToString(rowGrid.Cells[e.ColumnIndex].Value) ?? string.Empty;
                if (!string.IsNullOrWhiteSpace(rawDiam))
                {
                    rawDiam = rawDiam.Trim();
                    _diametrosUsados.Add(rawDiam);
                }
            }

            // Recalcula el resumen con el valor que haya quedado (manual o automático)
            ActualizarResumenSeleccion();
        }
        // ==============================================================
        // FUNCIONALIDAD: Doble clic en grid → Zoom a tramo + Captura screenshot
        // ==============================================================
        private async void Grid_CellDoubleClick(object? sender, DataGridViewCellEventArgs e)
        {
            if (e.RowIndex < 0) return;

            if (_grid.Rows[e.RowIndex].DataBoundItem is not TramoRow tramo) return;

            // Verificar que tengamos coordenadas válidas
            if (tramo.NorteIni == 0 && tramo.EsteIni == 0 && tramo.NorteFin == 0 && tramo.EsteFin == 0)
            {
                MessageBox.Show(this, "Este tramo no tiene coordenadas válidas.", "Zoom", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            try
            {
                var doc = Autodesk.AutoCAD.ApplicationServices.Application.DocumentManager.MdiActiveDocument;
                if (doc == null) return;

                // CRÍTICO: Asegurar MODEL SPACE antes de hacer zoom
                doc.SendStringToExecute("TILEMODE 1 ", true, false, false);
                await Task.Delay(300); // Esperar a que cambie a Model Space

                // Calcular punto medio del tramo
                double xMedio = (tramo.EsteIni + tramo.EsteFin) / 2.0;
                double yMedio = (tramo.NorteIni + tramo.NorteFin) / 2.0;

                // Calcular tamaño del zoom basado en longitud del tramo
                double dx = Math.Abs(tramo.EsteFin - tramo.EsteIni);
                double dy = Math.Abs(tramo.NorteFin - tramo.NorteIni);
                double longitudTramo = Math.Sqrt(dx * dx + dy * dy);

                // Área de zoom: 1.5 veces la longitud del tramo (mínimo 30 unidades)
                double zoomSize = Math.Max(longitudTramo * 1.5, 30.0);

                // Calcular corners para el zoom
                double offset = zoomSize / 2.0;

                string x1 = (xMedio - offset).ToString(System.Globalization.CultureInfo.InvariantCulture);
                string y1 = (yMedio - offset).ToString(System.Globalization.CultureInfo.InvariantCulture);
                string x2 = (xMedio + offset).ToString(System.Globalization.CultureInfo.InvariantCulture);
                string y2 = (yMedio + offset).ToString(System.Globalization.CultureInfo.InvariantCulture);

                // Comando: UCS WORLD + ZOOM WINDOW + REGEN
                string comando = $"UCS W ZOOM W {x1},{y1} {x2},{y2} REGEN ";

                // Ejecutar zoom de forma asíncrona
                doc.SendStringToExecute(comando, true, false, false);

                // ===============================================================
                // CAPTURA AUTOMÁTICA DE SCREENSHOT
                // ===============================================================
                // Esperar más tiempo: 300ms (TILEMODE) + tiempo de zoom + REGEN
                // Total: ~1800ms para garantizar renderizado completo
                var base64Screenshot = await AutoCADScreenshotHelper.CaptureAutoCADScreenshotAsBase64Async(1800, 85);

                if (!string.IsNullOrEmpty(base64Screenshot))
                {
                    // Limpiar imágenes anteriores (sobrescribir)
                    tramo.ImagenesBase64.Clear();

                    // Guardar nueva imagen
                    tramo.ImagenesBase64.Add(base64Screenshot);

                    // Actualizar indicador visual en la celda
                    _grid.Rows[e.RowIndex].DefaultCellStyle.BackColor = System.Drawing.Color.FromArgb(240, 255, 240); // Verde muy claro

                    System.Diagnostics.Debug.WriteLine($"Screenshot capturado para tramo {tramo.NodoIni}-{tramo.NodoFin}");
                }
                else
                {
                    System.Diagnostics.Debug.WriteLine($"No se pudo capturar screenshot para tramo {tramo.NodoIni}-{tramo.NodoFin}");
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, $"Error al hacer zoom: {ex.Message}", "Zoom", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
        // ==============================================================
        // FUNCIONALIDAD: Eliminar tramo con tecla Delete
        // ==============================================================
        private void Grid_KeyDown(object? sender, KeyEventArgs e)
        {
            if (e.KeyCode != Keys.Delete) return;

            if (_grid.CurrentRow == null || _grid.CurrentRow.Index < 0) return;

            var ask = MessageBox.Show(this,
                "¿Deseas eliminar este tramo de la lista?\n\n" +
                "Esta acción no se puede deshacer.",
                "SICOE - Eliminar tramo",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning);

            if (ask != DialogResult.Yes) return;

            try
            {
                int index = _grid.CurrentRow.Index;

                // Eliminar directamente del BindingSource (NO usar la propiedad Resultado)
                _bs.RemoveAt(index);

                // Seleccionar la fila siguiente o anterior
                if (_grid.Rows.Count > 0)
                {
                    int newIndex = Math.Min(index, _grid.Rows.Count - 1);
                    if (newIndex >= 0)
                        _grid.Rows[newIndex].Selected = true;
                }

                ActualizarResumenSeleccion();
            }
            catch (Exception ex)
            {
                MessageBox.Show(this,
                    $"Error al eliminar tramo:\n{ex.Message}",
                    "SICOE - Error",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }

            e.Handled = true;
        }
        private void BtnAgregarImagen_Click(object sender, EventArgs e)
        {
            if (_grid.CurrentRow == null)
            {
                MessageBox.Show("Selecciona un tramo antes de cargar una imagen.", "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            if (!(_grid.CurrentRow.DataBoundItem is TramoRow row))
                return;

            using var ofd = new OpenFileDialog();
            ofd.Title = "Seleccionar gráfico para el tramo";
            ofd.Filter = "Imágenes (*.png;*.jpg;*.jpeg)|*.png;*.jpg;*.jpeg";

            if (ofd.ShowDialog(this) != DialogResult.OK)
                return;

            // Guardar ruta física del archivo para usarla en el informe HTML
            _rutaGraficoActual = ofd.FileName;

            // Convertir archivo → Base64 y almacenarlo en el tramo (por si en el futuro se usa)
            var bytes = File.ReadAllBytes(ofd.FileName);
            var base64 = Convert.ToBase64String(bytes);
            row.ImagenesBase64.Add(base64);

            // Mostrar preview en el formulario
            picPreview.ImageLocation = ofd.FileName;

            MessageBox.Show("Imagen agregada correctamente al tramo.", "SICOE",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        private void _grid_EditingControlShowing(object? sender, DataGridViewEditingControlShowingEventArgs e)
        {
            if (_grid.CurrentCell == null)
                return;

            var col = _grid.CurrentCell.OwningColumn;
            var propName = col.DataPropertyName ?? string.Empty;

            if ((string.Equals(propName, "NodoIni", StringComparison.OrdinalIgnoreCase) ||
                             string.Equals(propName, "NodoFin", StringComparison.OrdinalIgnoreCase))
                            && e.Control is TextBox tbNodo)
            {
                // Si no se cargaron por cualquier razón, recargar ahora
                if (_nodosDisponibles == null || _nodosDisponibles.Count == 0)
                    _nodosDisponibles = NodoMemoryRepository.ObtenerTodosLosNodos();

                var acNodos = new AutoCompleteStringCollection();
                if (_nodosDisponibles?.Count > 0)
                    acNodos.AddRange(_nodosDisponibles.ToArray());

                tbNodo.AutoCompleteMode = AutoCompleteMode.SuggestAppend;
                tbNodo.AutoCompleteSource = AutoCompleteSource.CustomSource;
                tbNodo.AutoCompleteCustomSource = acNodos;

                _textBoxNodoActual = tbNodo;
                tbNodo.TextChanged -= TbNodo_TextChanged;
                tbNodo.KeyDown -= TbNodo_KeyDown;
                tbNodo.Leave -= TbNodo_Leave;
                tbNodo.TextChanged += TbNodo_TextChanged;
                tbNodo.KeyDown += TbNodo_KeyDown;
                tbNodo.Leave += TbNodo_Leave;

                return;
            }

            // ===== AUTOCOMPLETE PARA DIÁMETRO =====
            if (string.Equals(propName, "DiametroTexto", StringComparison.OrdinalIgnoreCase)
                && e.Control is TextBox tb)
            {
                var ac = new AutoCompleteStringCollection();
                ac.AddRange(_diametrosUsados.ToArray());

                tb.AutoCompleteMode = AutoCompleteMode.SuggestAppend;
                tb.AutoCompleteSource = AutoCompleteSource.CustomSource;
                tb.AutoCompleteCustomSource = ac;

                return;
            }

            // ===== DESACTIVAR EN OTRAS COLUMNAS =====
            if (e.Control is TextBox tb2)
            {
                tb2.AutoCompleteMode = AutoCompleteMode.None;
                tb2.AutoCompleteSource = AutoCompleteSource.None;
                tb2.AutoCompleteCustomSource = null;
            }
        }
        /// <summary>
        /// Calcula LongitudEXT y LongitudMED intersectando la línea del tramo
        /// con los polígonos de contorno de nodo (capas nodo_ext y nodo_med)
        /// contenidos en los bloques del dibujo.
        /// Fallback a longitudINT si no se encuentran intersecciones.
        /// </summary>
        internal static (double LongitudEXT, double LongitudMED, double LongitudINT) ObtenerLongitudesNodo(
                    string handle, double fallback)
        {
            if (string.IsNullOrWhiteSpace(handle))
                return (fallback, fallback, fallback);

            try
            {
                var doc = Autodesk.AutoCAD.ApplicationServices.Core.Application
                    .DocumentManager.MdiActiveDocument;
                if (doc == null) return (fallback, fallback, fallback);

                using (doc.LockDocument())
                {
                    var db = doc.Database;
                    using (var tr = db.TransactionManager.StartOpenCloseTransaction())
                    {
                        // Obtener entidad del tramo
                        Handle h;
                        try { h = new Handle(Convert.ToInt64(handle, 16)); }
                        catch { return (fallback, fallback, fallback); }

                        ObjectId id = db.GetObjectId(false, h, 0);
                        if (!id.IsValid) return (fallback, fallback, fallback);

                        var obj = tr.GetObject(id, OpenMode.ForRead);

                        // Extraer inicio y fin en 2D
                        Autodesk.AutoCAD.Geometry.Point2d pIni, pFin;
                        if (obj is Line ln)
                        {
                            pIni = new Autodesk.AutoCAD.Geometry.Point2d(ln.StartPoint.X, ln.StartPoint.Y);
                            pFin = new Autodesk.AutoCAD.Geometry.Point2d(ln.EndPoint.X, ln.EndPoint.Y);
                        }
                        else if (obj is Polyline pl && pl.NumberOfVertices >= 2)
                        {
                            var p0 = pl.GetPoint3dAt(0);
                            var p1 = pl.GetPoint3dAt(pl.NumberOfVertices - 1);
                            pIni = new Autodesk.AutoCAD.Geometry.Point2d(p0.X, p0.Y);
                            pFin = new Autodesk.AutoCAD.Geometry.Point2d(p1.X, p1.Y);
                        }
                        else
                            return (fallback, fallback, fallback);

                        // Recopilar intersecciones con bloques del model space
                        var ptsMed = new List<Autodesk.AutoCAD.Geometry.Point2d>();
                        var ptsExt = new List<Autodesk.AutoCAD.Geometry.Point2d>();
                        var ptsInt = new List<Autodesk.AutoCAD.Geometry.Point2d>();

                        var ms = (BlockTableRecord)tr.GetObject(db.CurrentSpaceId, OpenMode.ForRead);

                        foreach (ObjectId msId in ms)
                        {
                            if (tr.GetObject(msId, OpenMode.ForRead, false, true)
                                is not BlockReference br) continue;

                            var btr = (BlockTableRecord)tr.GetObject(
                                br.BlockTableRecord, OpenMode.ForRead);
                            var xform = br.BlockTransform;

                            foreach (ObjectId subId in btr)
                            {
                                if (tr.GetObject(subId, OpenMode.ForRead, false, true)
                                    is not Polyline subPl) continue;

                                string layer = (subPl.Layer ?? "").Trim();
                                bool esMed = layer.Equals("nodo_med",
                                    StringComparison.OrdinalIgnoreCase);
                                bool esExt = layer.Equals("nodo_ext",
                                    StringComparison.OrdinalIgnoreCase);
                                bool esInt = layer.Equals("nodo_int",
                                    StringComparison.OrdinalIgnoreCase);

                                if (!esMed && !esExt && !esInt) continue;

                                int nv = subPl.NumberOfVertices;
                                int nSeg = subPl.Closed ? nv : nv - 1;

                                for (int seg = 0; seg < nSeg; seg++)
                                {
                                    var vA3d = xform * subPl.GetPoint3dAt(seg);
                                    var vB3d = xform * subPl.GetPoint3dAt((seg + 1) % nv);
                                    var segA = new Autodesk.AutoCAD.Geometry.Point2d(vA3d.X, vA3d.Y);
                                    var segB = new Autodesk.AutoCAD.Geometry.Point2d(vB3d.X, vB3d.Y);

                                    if (TryIntersectSegments2D(pIni, pFin, segA, segB,
                                                                            out var inter))
                                    {
                                        if (esMed) ptsMed.Add(inter);
                                        else if (esExt) ptsExt.Add(inter);
                                        else if (esInt) ptsInt.Add(inter);
                                    }
                                }
                            }
                        }

                        tr.Commit();

                        double lMed = CalcLongitudDesdeIntersecciones(pIni, pFin, ptsMed, fallback);
                        double lExt = CalcLongitudDesdeIntersecciones(pIni, pFin, ptsExt, fallback);
                        double lInt = CalcLongitudDesdeIntersecciones(pIni, pFin, ptsInt, fallback);

                        return (lExt, lMed, lInt);
                    }
                }
            }
            catch
            {
                return (fallback, fallback, fallback);
            }
        }

        /// <summary>
        /// Distancia entre el punto de intersección más cercano a pIni
        /// y el más cercano a pFin (proyección sobre el eje del tramo).
        /// </summary>
        private static double CalcLongitudDesdeIntersecciones(
            Autodesk.AutoCAD.Geometry.Point2d pIni,
            Autodesk.AutoCAD.Geometry.Point2d pFin,
            List<Autodesk.AutoCAD.Geometry.Point2d> intersecciones,
            double fallback)
        {
            if (intersecciones.Count < 2) return fallback;

            double dirX = pFin.X - pIni.X;
            double dirY = pFin.Y - pIni.Y;
            double len2 = dirX * dirX + dirY * dirY;
            if (len2 < 1e-12) return fallback;

            double tMin = double.MaxValue, tMax = double.MinValue;
            Autodesk.AutoCAD.Geometry.Point2d pMin = pIni, pMax = pFin;

            foreach (var p in intersecciones)
            {
                double vx = p.X - pIni.X, vy = p.Y - pIni.Y;
                double t = (vx * dirX + vy * dirY) / len2;
                if (t < tMin) { tMin = t; pMin = p; }
                if (t > tMax) { tMax = t; pMax = p; }
            }

            double dx = pMax.X - pMin.X;
            double dy = pMax.Y - pMin.Y;
            double dist = Math.Sqrt(dx * dx + dy * dy);
            return dist > 0.0 ? dist : fallback;
        }

        /// <summary>
        /// Intersección 2D de segmentos AB y CD.
        /// Devuelve true si se cruzan dentro de ambos segmentos.
        /// </summary>
        private static bool TryIntersectSegments2D(
            Autodesk.AutoCAD.Geometry.Point2d a,
            Autodesk.AutoCAD.Geometry.Point2d b,
            Autodesk.AutoCAD.Geometry.Point2d c,
            Autodesk.AutoCAD.Geometry.Point2d d,
            out Autodesk.AutoCAD.Geometry.Point2d intersection)
        {
            intersection = new Autodesk.AutoCAD.Geometry.Point2d(0, 0);
            double rx = b.X - a.X, ry = b.Y - a.Y;
            double sx = d.X - c.X, sy = d.Y - c.Y;
            double denom = rx * sy - ry * sx;
            if (Math.Abs(denom) < 1e-12) return false;

            double ex = c.X - a.X, ey = c.Y - a.Y;
            double t = (ex * sy - ey * sx) / denom;
            double u = (ex * ry - ey * rx) / denom;

            if (t < -1e-9 || t > 1.0 + 1e-9) return false;
            if (u < -1e-9 || u > 1.0 + 1e-9) return false;

            intersection = new Autodesk.AutoCAD.Geometry.Point2d(
                a.X + t * rx, a.Y + t * ry);
            return true;
        }
        internal static double ObtenerLongitudRealTramo(string handle, double longitudFallback)
        {
            // Si no hay HANDLE, devolvemos la longitud por abscisas
            if (string.IsNullOrWhiteSpace(handle))
                return longitudFallback;

            try
            {
                var doc = Autodesk.AutoCAD.ApplicationServices.Core.Application
                    .DocumentManager.MdiActiveDocument;
                if (doc == null)
                    return longitudFallback;

                using (doc.LockDocument())
                {
                    var db = doc.Database;

                    using (var tr = db.TransactionManager.StartOpenCloseTransaction())
                    {
                        // El HANDLE viene en hexadecimal (ej. "25F8C")
                        Handle h;
                        try
                        {
                            long raw = Convert.ToInt64(handle, 16);
                            h = new Handle(raw);
                        }
                        catch
                        {
                            return longitudFallback;
                        }

                        ObjectId id = db.GetObjectId(false, h, 0);
                        if (!id.IsValid)
                            return longitudFallback;

                        var obj = tr.GetObject(id, OpenMode.ForRead);

                        double len = longitudFallback;

                        // Cálculo SOLO en 2D (X, Y) — se ignora Z para evitar distorsión por cotas
                        if (obj is Line ln2d)
                        {
                            double dx = ln2d.EndPoint.X - ln2d.StartPoint.X;
                            double dy = ln2d.EndPoint.Y - ln2d.StartPoint.Y;
                            len = Math.Sqrt(dx * dx + dy * dy);
                        }
                        else if (obj is Polyline pl2d)
                        {
                            len = 0.0;
                            int nv = pl2d.NumberOfVertices;
                            for (int i = 0; i < nv - 1; i++)
                            {
                                var p1 = pl2d.GetPoint3dAt(i);
                                var p2 = pl2d.GetPoint3dAt(i + 1);
                                double dx = p2.X - p1.X;
                                double dy = p2.Y - p1.Y;
                                len += Math.Sqrt(dx * dx + dy * dy);
                            }
                        }
                        else if (obj is Polyline3d pl3d)
                        {
                            len = 0.0;
                            Point3d? prev3d = null;
                            foreach (ObjectId vId in pl3d)
                            {
                                if (tr.GetObject(vId, OpenMode.ForRead) is PolylineVertex3d vx)
                                {
                                    var p = vx.Position;
                                    if (prev3d.HasValue)
                                    {
                                        double dx = p.X - prev3d.Value.X;
                                        double dy = p.Y - prev3d.Value.Y;
                                        len += Math.Sqrt(dx * dx + dy * dy);
                                    }
                                    prev3d = p;
                                }
                            }
                        }
                        else if (obj is Curve curve2d)
                        {
                            // Fallback para otras curvas: distancia 2D inicio→fin
                            var ps = curve2d.StartPoint;
                            var pe = curve2d.EndPoint;
                            double dx = pe.X - ps.X;
                            double dy = pe.Y - ps.Y;
                            len = Math.Sqrt(dx * dx + dy * dy);
                        }
                        tr.Commit();

                        // Si no se obtuvo algo razonable, devolvemos el valor de respaldo
                        if (len <= 0.0 || double.IsNaN(len) || double.IsInfinity(len))
                            return longitudFallback;

                        return len;
                    }
                }
            }
            catch
            {
                // En cualquier error, seguimos usando la longitud por abscisas
                return longitudFallback;
            }
        }
        // ================== ENTIBADO TIPO CAJÓN (CONTRATO) ==================
        // Devuelve la altura facturable del entibado cajón (m) como la suma mínima
        // de módulos {1.35, 2.00, 2.35} que sea >= alturaExc.
        // Si alturaExc <= 0 => 0.
        private static double GetAlturaEntibadoCajon(double alturaExc)
        {
            if (double.IsNaN(alturaExc) || double.IsInfinity(alturaExc))
                return 0.0;

            // REGLA DE NEGOCIO: si la altura neta de excavación es <= 1.60 m, NO hay entibado
            if (alturaExc <= 1.60)
                return 0.0;

            // Módulos (m)
            double[] mods = new[] { 2.35, 2.00, 1.35 };

            // Redondeo "seguro" hacia arriba (centímetros) para evitar efectos de coma flotante.
            // Trabajamos en centésimas de metro (0.01 m).
            int target = (int)Math.Ceiling(alturaExc * 100.0);

            int[] modInt = mods.Select(m => (int)Math.Round(m * 100.0)).ToArray(); // 235, 200, 135

            // Cota superior para búsqueda:
            // con el módulo más grande, garantizamos cubrir el target.
            int maxMod = modInt.Max();
            int upper = ((target + maxMod - 1) / maxMod) * maxMod;

            // DP: reachable[s] indica si se puede formar la suma 's'
            // y prev[s] guarda el salto usado para reconstruir (no es necesario, pero útil).
            bool[] reachable = new bool[upper + 1];
            reachable[0] = true;

            for (int s = 0; s <= upper; s++)
            {
                if (!reachable[s]) continue;
                foreach (var m in modInt)
                {
                    int ns = s + m;
                    if (ns <= upper) reachable[ns] = true;
                }
            }

            // Buscar la primera suma alcanzable >= target (mínima posible)
            for (int s = target; s <= upper; s++)
            {
                if (reachable[s])
                    return s / 100.0;
            }

            // Fallback imposible (pero por seguridad): usar múltiplo del módulo mayor
            return upper / 100.0;
        }
        private void AutoSyncCheckDesdeCombo(ComboBox combo)
        {
            if (combo == null) return;

            // OJO: "Otros" es un flujo especial (se limpia el combo al agregar),
            // por eso NO lo autosincronizamos por texto del combo.
            if (ReferenceEquals(combo, cmbOtros)) return;

            CheckBox? chk = null;

            if (ReferenceEquals(combo, cmbExcav)) chk = chkExcav;
            else if (ReferenceEquals(combo, cmbAtraque)) chk = chkAtraque;
            else if (ReferenceEquals(combo, cmbLong)) chk = chkLong;
            else if (ReferenceEquals(combo, cmbRelleno)) chk = chkRelleno;
            else if (ReferenceEquals(combo, cmbEntibado)) chk = chkEntibado;
            else if (ReferenceEquals(combo, cmbCinta)) chk = chkCinta;
            else if (ReferenceEquals(combo, cmbCampana1)) chk = chkCampana1;
            else if (ReferenceEquals(combo, cmbCampana2)) chk = chkCampana2;

            if (chk == null) return;

            bool hayItem = !string.IsNullOrWhiteSpace(combo.Text);

            if (hayItem && !chk.Checked) chk.Checked = true;
            else if (!hayItem && chk.Checked) chk.Checked = false;
        }
        // ====== HANDLERS CAMPANA 1 ======

        private void CmbCampana1_SelectedIndexChanged(object? sender, EventArgs e)
        {
            var r = GetTramoActual();
            if (r != null)
                r.ItemCampana1 = cmbCampana1.Text;
            AutoSyncCheckDesdeCombo(cmbCampana1);
            if (_cargandoDatos) return;
            AjustarDropDownWidthSegunItems(cmbCampana1);
            ResetComboCaretToStart(cmbCampana1);
            SincronizarConfigATodosSiCorresponde();
        }

        private void ChkCampana1_CheckedChanged(object? sender, EventArgs e)
        {
            if (_cargandoDatos) return;
            var r = GetTramoActual();
            if (r == null) return;
            r.UsaCampana1 = chkCampana1.Checked;
            txtCampana1.ReadOnly = !chkCampana1.Checked;

            if (!chkCampana1.Checked)
            {
                r.CantCampana1 = 0;
                r.ItemCampana1 = string.Empty;
                cmbCampana1.Text = string.Empty;
                txtCampana1.Text = string.Empty;
            }

            SincronizarConfigATodosSiCorresponde();
            ActualizarResumenSeleccion();
        }

        private void TxtCampana1_KeyPress(object? sender, KeyPressEventArgs e)
        {
            // Solo dígitos y teclas de control (backspace, etc.) — NO decimales
            if (!char.IsDigit(e.KeyChar) && !char.IsControl(e.KeyChar))
                e.Handled = true;
        }

        private void TxtCampana1_Validated(object? sender, EventArgs e)
        {
            var r = GetTramoActual();
            if (r == null) return;

            var raw = txtCampana1.Text.Trim();

            if (string.IsNullOrWhiteSpace(raw))
            {
                r.CantCampana1 = 0;
                return;
            }

            if (!int.TryParse(raw, out int v) || v < 0)
            {
                MessageBox.Show(this,
                    "Campanas 1: ingresa un número entero mayor o igual a cero.",
                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                txtCampana1.Text = string.Empty;
                r.CantCampana1 = 0;
                return;
            }

            r.CantCampana1 = v;
            txtCampana1.Text = v.ToString();

            if (v > 0 && !chkCampana1.Checked)
                chkCampana1.Checked = true;

            if (v > 0 && string.IsNullOrWhiteSpace(r.ItemCampana1))
            {
                MessageBox.Show(this,
                    "Selecciona un ítem de presupuesto en el combo 'Campanas 1' antes de digitar la cantidad.",
                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                cmbCampana1.Focus();
                return;
            }

            SincronizarConfigATodosSiCorresponde();
            ActualizarResumenSeleccion();
        }

        // ====== HANDLERS CAMPANA 2 ======

        private void CmbCampana2_SelectedIndexChanged(object? sender, EventArgs e)
        {
            var r = GetTramoActual();
            if (r != null)
                r.ItemCampana2 = cmbCampana2.Text;
            AutoSyncCheckDesdeCombo(cmbCampana2);
            if (_cargandoDatos) return;
            AjustarDropDownWidthSegunItems(cmbCampana2);
            ResetComboCaretToStart(cmbCampana2);
            SincronizarConfigATodosSiCorresponde();
        }

        private void ChkCampana2_CheckedChanged(object? sender, EventArgs e)
        {
            if (_cargandoDatos) return;
            var r = GetTramoActual();
            if (r == null) return;
            r.UsaCampana2 = chkCampana2.Checked;
            txtCampana2.ReadOnly = !chkCampana2.Checked;

            if (!chkCampana2.Checked)
            {
                r.CantCampana2 = 0;
                r.ItemCampana2 = string.Empty;
                cmbCampana2.Text = string.Empty;
                txtCampana2.Text = string.Empty;
            }

            SincronizarConfigATodosSiCorresponde();
            ActualizarResumenSeleccion();
        }

        private void TxtCampana2_KeyPress(object? sender, KeyPressEventArgs e)
        {
            // Solo dígitos y teclas de control — NO decimales
            if (!char.IsDigit(e.KeyChar) && !char.IsControl(e.KeyChar))
                e.Handled = true;
        }

        private void TxtCampana2_Validated(object? sender, EventArgs e)
        {
            var r = GetTramoActual();
            if (r == null) return;

            var raw = txtCampana2.Text.Trim();

            if (string.IsNullOrWhiteSpace(raw))
            {
                r.CantCampana2 = 0;
                return;
            }

            if (!int.TryParse(raw, out int v) || v < 0)
            {
                MessageBox.Show(this,
                    "Campanas 2: ingresa un número entero mayor o igual a cero.",
                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                txtCampana2.Text = string.Empty;
                r.CantCampana2 = 0;
                return;
            }

            r.CantCampana2 = v;
            txtCampana2.Text = v.ToString();

            if (v > 0 && !chkCampana2.Checked)
                chkCampana2.Checked = true;

            if (v > 0 && string.IsNullOrWhiteSpace(r.ItemCampana2))
            {
                MessageBox.Show(this,
                    "Selecciona un ítem de presupuesto en el combo 'Campanas 2' antes de digitar la cantidad.",
                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                cmbCampana2.Focus();
                return;
            }

            SincronizarConfigATodosSiCorresponde();
            ActualizarResumenSeleccion();
        }

        private bool ValidarNoHayItemSinCheckTramos()
        {
            // Regla: si hay ItemX pero UsaX == false, es un error potencial.
            // Para "Otros": se valida por detalles configurados (OtrosDetalles.Count).
            var errores = new List<string>();

            foreach (var r in Resultado)
            {
                void add(string campo)
                {
                    // Identificar el tramo para ayudar al usuario:
                    string id = !string.IsNullOrWhiteSpace(r.AbsIni) && !string.IsNullOrWhiteSpace(r.AbsFin)
                        ? $"{r.AbsIni} → {r.AbsFin}"
                        : (r.Handle ?? "(sin handle)");

                    errores.Add($"• Tramo {id}: {campo}");
                }

                if (!string.IsNullOrWhiteSpace(r.ItemExcav) && !r.UsaExcav) add("Excavación: hay ítem pero el check está apagado.");
                if (!string.IsNullOrWhiteSpace(r.ItemAtraque) && !r.UsaAtraque) add("Atraque: hay ítem pero el check está apagado.");
                if (!string.IsNullOrWhiteSpace(r.ItemLong) && !r.UsaLong) add("Longitud: hay ítem pero el check está apagado.");
                if (!string.IsNullOrWhiteSpace(r.ItemRelleno) && !r.UsaRelleno) add("Relleno granular: hay ítem pero el check está apagado.");
                if (!string.IsNullOrWhiteSpace(r.ItemEntibado) && !r.UsaEntibado) add("Entibado: hay ítem pero el check está apagado.");
                if (!string.IsNullOrWhiteSpace(r.ItemCinta) && !r.UsaCinta) add("Cinta: hay ítem pero el check está apagado.");

                // "Otros" se valida por detalles (porque cmbOtros se limpia a propósito)
                if (r.OtrosDetalles.Count > 0 && !r.UsaOtros) add("Otros: hay ítems configurados pero el check está apagado.");

                if (!string.IsNullOrWhiteSpace(r.ItemCampana1) && !r.UsaCampana1) add("Campanas 1: hay ítem pero el check está apagado.");
                if (!string.IsNullOrWhiteSpace(r.ItemCampana2) && !r.UsaCampana2) add("Campanas 2: hay ítem pero el check está apagado.");
            }

            if (errores.Count == 0) return true;

            MessageBox.Show(this,
                "Hay ítems seleccionados/configurados sin el check activado.\n\n" +
                "Activa el check correspondiente para poder enviar a presupuesto.\n\n" +
                string.Join("\n", errores),
                "SicoeCAD - Validación de tramos",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);

            return false;
        }
        /// <summary>
        /// Valida que los nodos usados en los tramos existan en la memoria del capítulo.
        /// Si hay nodos no encontrados, pregunta al usuario si desea continuar.
        /// </summary>
        private bool ValidarNodosExistentes()
        {
            // Si no hay nodos cargados en memoria, permitir continuar
            // (puede ser primera vez que se usan nodos en este capítulo)
            if (_nodosDisponibles == null || _nodosDisponibles.Count == 0)
                return true;

            // Recopilar todos los nodos únicos usados en los tramos
            var nodosUsados = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var tramo in Resultado)
            {
                if (!string.IsNullOrWhiteSpace(tramo.NodoIni))
                    nodosUsados.Add(tramo.NodoIni.Trim().ToUpperInvariant());

                if (!string.IsNullOrWhiteSpace(tramo.NodoFin))
                    nodosUsados.Add(tramo.NodoFin.Trim().ToUpperInvariant());
            }

            // Comparar con nodos disponibles en memoria
            var nodosNoEncontrados = nodosUsados
                .Where(nodo => !_nodosDisponibles.Contains(nodo, StringComparer.OrdinalIgnoreCase))
                .OrderBy(n => n)
                .ToList();

            // Si todos los nodos existen, continuar
            if (nodosNoEncontrados.Count == 0)
                return true;

            // Construir mensaje de alerta
            string listaNodos = string.Join("\n• ", nodosNoEncontrados);

            var resultado = MessageBox.Show(this,
                $"Los siguientes nodos NO fueron calculados previamente:\n\n• {listaNodos}\n\n" +
                "Esto puede ser normal si se conectan a estructuras existentes.\n\n" +
                "¿Deseas continuar?",
                "SICOE - Nodos no encontrados",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning);

            return resultado == DialogResult.Yes;
        }
        // ================== AUTOCOMPLETE ROBUSTO PARA NODOS ==================

        private void TbNodo_TextChanged(object? sender, EventArgs e)
        {
            if (sender is not TextBox tb) return;
            if (_nodosDisponibles == null || _nodosDisponibles.Count == 0) return;

            string texto = tb.Text ?? string.Empty;

            // Si está vacío, ocultar sugerencias
            if (string.IsNullOrWhiteSpace(texto))
            {
                OcultarListBoxSugerencias();
                return;
            }

            // Filtrar nodos que CONTIENEN el texto (case-insensitive)
            var sugerencias = _nodosDisponibles
                .Where(n => n.IndexOf(texto, StringComparison.OrdinalIgnoreCase) >= 0)
                .OrderBy(n => n.IndexOf(texto, StringComparison.OrdinalIgnoreCase)) // Priorizar coincidencias al inicio
                .ThenBy(n => n)
                .Take(20) // Máximo 20 sugerencias
                .ToList();

            if (sugerencias.Count == 0)
            {
                OcultarListBoxSugerencias();
                return;
            }

            MostrarListBoxSugerencias(tb, sugerencias);
        }
        private void MostrarListBoxSugerencias(TextBox tb, List<string> sugerencias)
        {
            // Crear ListBox si no existe
            if (_listBoxSugerencias == null)
            {
                _listBoxSugerencias = new ListBox
                {
                    Width = 300,
                    Height = 150,
                    Visible = false,
                    TabStop = false  // CRÍTICO: No puede recibir foco
                };

                // SOLUCIÓN: Usar Click simple (se dispara al SOLTAR el mouse)
                _listBoxSugerencias.Click += (s, e) => {
                    if (_listBoxSugerencias.SelectedItem != null && _textBoxNodoActual != null)
                    {
                        string seleccion = _listBoxSugerencias.SelectedItem.ToString() ?? string.Empty;

                        // Asignar al TextBox
                        _textBoxNodoActual.Text = seleccion;
                        _textBoxNodoActual.SelectionStart = seleccion.Length;

                        // Ocultar inmediatamente
                        _listBoxSugerencias.Visible = false;

                        // Terminar edición del grid
                        _grid.EndEdit();
                        _grid.Focus();
                    }
                };

                // Agregar al formulario
                this.Controls.Add(_listBoxSugerencias);
                _listBoxSugerencias.BringToFront();
            }

            // Actualizar contenido
            _listBoxSugerencias.BeginUpdate();
            _listBoxSugerencias.Items.Clear();
            foreach (var s in sugerencias)
            {
                _listBoxSugerencias.Items.Add(s);
            }
            _listBoxSugerencias.EndUpdate();

            // Posicionar debajo del TextBox
            var cellRect = _grid.GetCellDisplayRectangle(_grid.CurrentCell.ColumnIndex, _grid.CurrentCell.RowIndex, false);
            var gridPos = _grid.PointToScreen(cellRect.Location);
            var formPos = this.PointToClient(gridPos);

            _listBoxSugerencias.Left = formPos.X;
            _listBoxSugerencias.Top = formPos.Y + cellRect.Height;
            _listBoxSugerencias.Visible = true;
        }

        private void OcultarListBoxSugerencias()
        {
            if (_listBoxSugerencias != null)
            {
                _listBoxSugerencias.Visible = false;
            }
        }

        private void TbNodo_KeyDown(object? sender, KeyEventArgs e)
        {
            if (_listBoxSugerencias == null || !_listBoxSugerencias.Visible)
                return;

            // Navegar con flechas
            if (e.KeyCode == Keys.Down)
            {
                if (_listBoxSugerencias.Items.Count > 0)
                {
                    int idx = _listBoxSugerencias.SelectedIndex;
                    if (idx < 0) idx = -1;
                    _listBoxSugerencias.SelectedIndex = Math.Min(idx + 1, _listBoxSugerencias.Items.Count - 1);
                }
                e.Handled = true;
                e.SuppressKeyPress = true;
            }
            else if (e.KeyCode == Keys.Up)
            {
                if (_listBoxSugerencias.Items.Count > 0)
                {
                    int idx = _listBoxSugerencias.SelectedIndex;
                    if (idx <= 0)
                        _listBoxSugerencias.SelectedIndex = -1;
                    else
                        _listBoxSugerencias.SelectedIndex = Math.Max(idx - 1, 0);
                }
                e.Handled = true;
                e.SuppressKeyPress = true;
            }
            else if (e.KeyCode == Keys.Enter || e.KeyCode == Keys.Tab)
            {
                // Aceptar sugerencia
                if (_listBoxSugerencias.SelectedItem != null && _textBoxNodoActual != null)
                {
                    string seleccion = _listBoxSugerencias.SelectedItem.ToString() ?? string.Empty;
                    _textBoxNodoActual.Text = seleccion;
                    _textBoxNodoActual.SelectionStart = seleccion.Length;
                }

                _listBoxSugerencias.Visible = false;
                e.Handled = true;
                e.SuppressKeyPress = true;
            }
            else if (e.KeyCode == Keys.Escape)
            {
                _listBoxSugerencias.Visible = false;
                e.Handled = true;
                e.SuppressKeyPress = true;
            }
        }
        /// <summary>
        /// Compara la distancia entre ejes de nodos (desde repositorio)
        /// con la longitud real de la entidad seleccionada.
        /// Muestra alerta si ambas están disponibles y la diferencia es significativa.
        /// </summary>
        private void ValidarDistanciaNodosVsEntidad(TramoRow row)
        {
            if (string.IsNullOrWhiteSpace(row.NodoIni) || string.IsNullOrWhiteSpace(row.NodoFin))
                return;
            if (string.IsNullOrWhiteSpace(_capituloActual))
                return;

            var (norteIni, esteIni, okIni) = NodoMemoryRepository.ObtenerCoordenadas(
                _capituloActual, row.NodoIni);
            var (norteFin, esteFin, okFin) = NodoMemoryRepository.ObtenerCoordenadas(
                _capituloActual, row.NodoFin);

            // Solo validar si tenemos coords de AMBOS nodos
            if (!okIni || !okFin) return;
            if (norteIni == 0 && esteIni == 0) return;
            if (norteFin == 0 && esteFin == 0) return;

            // Distancia entre ejes de nodos
            double dx = esteFin - esteIni;
            double dy = norteFin - norteIni;
            double distNodos = Math.Sqrt(dx * dx + dy * dy);

            // Longitud real de la entidad seleccionada
            double distEntidad = ObtenerLongitudRealTramo(row.Handle, 0.0);

            if (distEntidad <= 0.0) return;

            double diferencia = Math.Abs(distNodos - distEntidad);

            // Solo mostrar si la diferencia es mayor a 0.05 m (tolerancia)
            if (diferencia <= 0.05) return;

            var resultado = MessageBox.Show(this,
                $"Verificación de distancia:\n\n" +
                $"  Distancia entre ejes de nodos:   {distNodos:F3} m\n" +
                $"  Distancia entidad seleccionada:  {distEntidad:F3} m\n" +
                $"  Diferencia:                      {diferencia:F3} m\n\n" +
                "¿Desea continuar con esta asignación?",
                "SICOE - Verificar tramo",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning);

            if (resultado == DialogResult.No)
            {
                // Limpiar el nodo que se acaba de editar
                if (_grid.CurrentCell != null)
                {
                    string prop = _grid.Columns[_grid.CurrentCell.ColumnIndex].DataPropertyName ?? "";
                    if (prop == "NodoIni") row.NodoIni = string.Empty;
                    else if (prop == "NodoFin") row.NodoFin = string.Empty;
                    _grid.Refresh();
                }
            }
        }
        private void TbNodo_Leave(object? sender, EventArgs e)
        {
            // SOLUCIÓN SIMPLE: Timer corto para permitir el click
            var timer = new System.Windows.Forms.Timer();
            timer.Interval = 200;
            timer.Tick += (s, ev) => {
                timer.Stop();
                timer.Dispose();
                OcultarListBoxSugerencias();
            };
            timer.Start();
        }
    }
}
