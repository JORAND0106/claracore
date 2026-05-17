using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
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
    internal static class AutoCADScreenshotHelperNodos
    {
        [DllImport("user32.dll")]
        private static extern IntPtr GetDC(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);

        [DllImport("user32.dll")]
        private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

        [DllImport("user32.dll")]
        private static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);

        [DllImport("user32.dll")]
        private static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [StructLayout(LayoutKind.Sequential)]
        private struct RECT
        {
            public int Left;
            public int Top;
            public int Right;
            public int Bottom;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct POINT
        {
            public int X;
            public int Y;
        }

        private const int SW_RESTORE = 9;

        /// <summary>
        /// Captura screenshot del viewport de AutoCAD (solo área de dibujo, sin UI).
        /// </summary>
        public static async Task<string?> CaptureAutoCADScreenshotAsBase64Async(int delayMs = 2000, int quality = 85)
        {
            try
            {
                System.Diagnostics.Debug.WriteLine("=== Captura nodo - inicio ===");

                await Task.Delay(delayMs);

                var doc = Autodesk.AutoCAD.ApplicationServices.Application.DocumentManager.MdiActiveDocument;
                if (doc == null)
                {
                    System.Diagnostics.Debug.WriteLine("ERROR: No hay documento activo");
                    return null;
                }

                IntPtr acWindow = Autodesk.AutoCAD.ApplicationServices.Application.MainWindow.Handle;
                if (acWindow == IntPtr.Zero)
                {
                    System.Diagnostics.Debug.WriteLine("ERROR: No se pudo obtener handle");
                    return null;
                }

                ShowWindow(acWindow, SW_RESTORE);
                SetForegroundWindow(acWindow);
                await Task.Delay(200);

                if (!GetWindowRect(acWindow, out RECT windowRect))
                {
                    System.Diagnostics.Debug.WriteLine("ERROR: No se pudo obtener WindowRect");
                    return null;
                }

                int width = windowRect.Right - windowRect.Left;
                int height = windowRect.Bottom - windowRect.Top;
                int x = windowRect.Left;
                int y = windowRect.Top;

                System.Diagnostics.Debug.WriteLine($"Ventana: {width}x{height} en ({x},{y})");

                if (width <= 0 || height <= 0) return null;

                using (var bitmapFull = new System.Drawing.Bitmap(width, height))
                {
                    using (var g = System.Drawing.Graphics.FromImage(bitmapFull))
                    {
                        g.CopyFromScreen(x, y, 0, 0, new System.Drawing.Size(width, height));
                    }

                    // Recortar UI
                    int topCrop = (int)(height * 0.25);
                    int bottomCrop = (int)(height * 0.12);
                    int leftCrop = (int)(width * 0.25);
                    int rightCrop = (int)(width * 0.25);

                    int viewportX = leftCrop;
                    int viewportY = topCrop;
                    int viewportWidth = width - leftCrop - rightCrop;
                    int viewportHeight = height - topCrop - bottomCrop;

                    if (viewportWidth <= 0 || viewportHeight <= 0) return null;

                    using (var viewportBitmap = new System.Drawing.Bitmap(viewportWidth, viewportHeight))
                    {
                        using (var gViewport = System.Drawing.Graphics.FromImage(viewportBitmap))
                        {
                            gViewport.DrawImage(bitmapFull,
                                new System.Drawing.Rectangle(0, 0, viewportWidth, viewportHeight),
                                new System.Drawing.Rectangle(viewportX, viewportY, viewportWidth, viewportHeight),
                                System.Drawing.GraphicsUnit.Pixel);
                        }

                        using (var resized = ResizeImage(viewportBitmap, 1200))
                        using (var ms = new MemoryStream())
                        {
                            var encoder = GetJpegEncoder();
                            var encoderParams = new EncoderParameters(1);
                            encoderParams.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, (long)quality);

                            resized.Save(ms, encoder, encoderParams);
                            byte[] imageBytes = ms.ToArray();

                            System.Diagnostics.Debug.WriteLine($"✓ Captura nodo: {imageBytes.Length} bytes");
                            return Convert.ToBase64String(imageBytes);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"ERROR captura nodo: {ex.Message}");
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

    internal sealed partial class FrmNombrarNodos : Form
    {
        // ===== MODELO DE FILA (GRID) =====
        public sealed class NodoRow
        {
            public string Handle { get; set; } = "";
            // Coordenadas del punto medio del bloque
            public double Norte { get; set; }
            public double Este { get; set; }

            // Abscisas del nodo (se llena desde BtnAgritem_Click)
            public string AbsIni { get; set; } = "";
            public string AbsFin { get; set; } = "";

            public string Nombre { get; set; } = "";

            public double Rasante { get; set; }
            public double ClaveSalida { get; set; }
            public double DescEstVia { get; set; }
            public double DiametroSalida { get; set; }
            // Áreas calculadas automáticamente desde polígonos del bloque AutoCAD
            public double AreaNodoEXT { get; set; }   // NODO_EXT → excavación
            public double AreaNodoMED { get; set; }   // NODO_MED → relleno perimetral
            public double PerimetroNodoEXT { get; set; } // Perímetro NODO_EXT → entibado
            public double Espesor { get; set; }

            public bool AplicaCanjuela { get; set; }
            public double EspesorCanjuela { get; set; }

            public bool AplicaPlacaFondo { get; set; }
            public double EspesorPlacaFondo { get; set; }

            public bool AplicaCamaFiltro { get; set; }
            public double EspesorCamaFiltro { get; set; }

            public int Pasos { get; set; }
            public double AlturaManual { get; set; }

            // NUEVO: flags de uso de ítems POR NODO (independientes del check global)
            public bool UsaExcav { get; set; }
            public bool UsaRellenoPerim { get; set; }
            public bool UsaEntibado { get; set; }
            public bool UsaNodo { get; set; }
            public bool UsaMamposteria { get; set; }
            public bool UsaPlacaFondo { get; set; }
            public bool UsaPasos { get; set; }
            public bool UsaCanjuela { get; set; }
            // NUEVO: Ítem seleccionado POR NODO (para que NO sea “esclavo” del último combo usado)
            public string ItemExcav { get; set; } = "";
            public string ItemRellenoPerim { get; set; } = "";
            public string ItemEntibado { get; set; } = "";
            public string ItemNodo { get; set; } = "";
            public string ItemMamposteria { get; set; } = "";
            public string ItemPlacaFondo { get; set; } = "";
            public string ItemPasos { get; set; } = "";
            public string ItemCanjuela { get; set; } = "";
            // ===== NUEVO: Screenshots capturados automáticamente =====
            public List<string> ImagenesBase64 { get; set; } = new List<string>();
        }

        // Catálogo de ítems filtrado por capítulo/competencia
        private List<string> _catalogoItemsFiltrado = new();

        // ===== NUEVO: Variable para guardar capítulo actual =====
        private string _capituloActual = "";

        // Marca de que estamos actualizando desde código (evitar recursiones)
        private bool _actualizandoDesdeCodigo = false;

        // ===== NUEVO: Control para evitar recursión al replicar valores en Grid =====
        private bool _replicandoValoresEnGrid = false;


        // Resultado crudo del grid (mismo patrón que versión anterior)
        private readonly BindingSource _bs = new BindingSource();
        public List<NodoRow> Resultado => (_bs.List as List<NodoRow>) ?? new List<NodoRow>();

        // Ruta de imagen asociada a nodos (se aplica igual para todos)
        private string? _rutaGraficoNodo;
        // Modelo de cantidades por nodo (para HTML y presupuesto)
        private System.Windows.Forms.Timer? _zoomTimer;
        private int _ultimaFilaSeleccionada = -1;
        public sealed class NodoJson
        {
            // Datos básicos
            public string Handle { get; set; } = "";
            public string Nombre { get; set; } = "";
            public string Abs { get; set; } = "";
            // Coordenadas del punto medio del bloque
            public double Norte { get; set; }
            public double Este { get; set; }
            public double Rasante { get; set; }
            public double ClaveSalida { get; set; }
            public double DescEstVia { get; set; }
            public double DiametroSalida { get; set; }
            // Áreas de contorno automáticas (desde bloque AutoCAD)
            public double AreaNodoEXT { get; set; }
            public double AreaNodoMED { get; set; }
            public double PerimetroNodoEXT { get; set; }

            public double AlturaExc { get; set; }
            public double AreaExc { get; set; }
            public double AreaPerimetral { get; set; }

            public int Pasos { get; set; }

            // Ítems seleccionados + cantidades calculadas
            public bool UsaExcav { get; set; }
            public string? ItemExcav { get; set; }
            public double CantExcav { get; set; }

            public bool UsaRellenoPerim { get; set; }
            public string? ItemRellenoPerim { get; set; }
            public double CantRellenoPerim { get; set; }

            public bool UsaEntibado { get; set; }
            public string? ItemEntibado { get; set; }
            public double CantEntibado { get; set; }

            public bool UsaNodo { get; set; }
            public string? ItemNodo { get; set; }
            public double CantNodo { get; set; }

            public bool UsaMamposteria { get; set; }
            public string? ItemMamposteria { get; set; }
            public double CantMamposteria { get; set; }

            public bool UsaPlacaFondo { get; set; }
            public string? ItemPlacaFondo { get; set; }
            public double CantPlacaFondo { get; set; }

            public bool UsaPasos { get; set; }
            public string? ItemPasos { get; set; }
            public double CantPasos { get; set; }

            public bool UsaCanjuela { get; set; }
            public string? ItemCanjuela { get; set; }
            public double CantCanjuela { get; set; }
            public double AreaExcav { get; set; }
            public double AlturaExcav { get; set; }
            public double PerimetroExcav { get; set; }
            // ===== NUEVO: Screenshot capturado =====
            public string ImagenBase64 { get; set; } = string.Empty;
        }

        // Opcional: evento para que el formulario principal capture las cantidades
        public event Action<List<NodoJson>>? EnviarAPresupuesto;

        /// <summary>
        /// Carga el catálogo de ítems (texto ya filtrado por capítulo/competencia)
        /// en TODOS los combos de cantidades del nodo.
        /// </summary>
        /// <summary>
        /// Constructor principal: recibe filas de nodos + catálogo de ítems
        /// ya filtrado por Capítulo / Competencia.
        /// </summary>
        // ================== CONSTRUCTORES =============================

        // ================== CONSTRUCTORES =============================

        public FrmNombrarNodos()
            : this(new List<NodoRow>())
        {
        }

        public FrmNombrarNodos(IEnumerable<NodoRow> data)
        {
            // ==============================================================
            // IMPORTANTE - FUNCIONALIDAD 1: Formulario MODELESS
            // ==============================================================
            // Este formulario debe mostrarse en modo MODELESS para permitir
            // interactuar con AutoCAD mientras está abierto.
            // 
            // FORMA CORRECTA de mostrarlo desde AutoCAD:
            // 
            //    var frm = new FrmNombrarNodos(nodos);
            //    Application.ShowModelessDialog(frm);
            //
            // NO usar: frm.ShowDialog() → esto bloquearía AutoCAD
            // ==============================================================

            InitializeComponent();

            // Configuración general del formulario
            StartPosition = FormStartPosition.CenterParent;
            FormBorderStyle = FormBorderStyle.Sizable;
            MaximizeBox = true;
            MinimizeBox = true;

            // ================== CONFIGURACIÓN DEL GRID ==================
            _grid.AutoGenerateColumns = false;
            _grid.Columns.Clear();

            // Permitir colorear los encabezados de columnas
            _grid.EnableHeadersVisualStyles = false;
            // Ajuste automático de columnas AL ANCHO DISPONIBLE DEL GRID
            _grid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
            // Solo scroll vertical para evitar que se "pierdan" columnas
            _grid.ScrollBars = ScrollBars.Vertical;

            _grid.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
            _grid.MultiSelect = false;
            _grid.AllowUserToAddRows = false;
            _grid.AllowUserToDeleteRows = false;


            // Nombre del nodo
            _grid.Columns.Add(new DataGridViewTextBoxColumn
            {
                DataPropertyName = nameof(NodoRow.Nombre),
                HeaderText = "Nombre del nodo"
            });

            // Abscisa (SOLO LECTURA)
            var colAbs = new DataGridViewTextBoxColumn
            {
                DataPropertyName = nameof(NodoRow.AbsIni),
                HeaderText = "Abscisa",
                ReadOnly = true
            };
            _grid.Columns.Add(colAbs);

            // Parámetros geométricos
            _grid.Columns.Add(CreateNumericColumn(nameof(NodoRow.Rasante), "Rasante (m)", 80));
            _grid.Columns.Add(CreateNumericColumn(nameof(NodoRow.ClaveSalida), "Clave salida (m)", 100));
            // NUEVO: descuento estructura vía / espacio público
            var colDescEstVia = CreateNumericColumn(
                nameof(NodoRow.DescEstVia),
                "Desc Est.Vía / E.Pub (m)",
                120);

            // Turquesa SicoeCAD más fuerte en el HEADER de esta columna
            colDescEstVia.HeaderCell.Style.BackColor = System.Drawing.Color.FromArgb(0, 154, 166); // #009AA6
            colDescEstVia.HeaderCell.Style.ForeColor = System.Drawing.Color.White;

            _grid.Columns.Add(colDescEstVia);
            _grid.Columns.Add(CreateNumericColumn(nameof(NodoRow.DiametroSalida), "Diámetro salida (m)", 100));
            // Áreas de contorno (solo lectura — calculadas desde AutoCAD al cargar)
            var colAreaExt = CreateNumericColumn(nameof(NodoRow.AreaNodoEXT), "Área EXT (m²)", 90);
            colAreaExt.ReadOnly = true;
            _grid.Columns.Add(colAreaExt);

            var colAreaMed = CreateNumericColumn(nameof(NodoRow.AreaNodoMED), "Área MED (m²)", 90);
            colAreaMed.ReadOnly = true;
            _grid.Columns.Add(colAreaMed);

            _grid.Columns.Add(CreateNumericColumn(nameof(NodoRow.Espesor), "Espesor Tubería(m)", 80));

            // Cañuela
            _grid.Columns.Add(new DataGridViewCheckBoxColumn
            {
                DataPropertyName = nameof(NodoRow.AplicaCanjuela),
                HeaderText = "Cañ.",
                Width = 40
            });
            _grid.Columns.Add(CreateNumericColumn(nameof(NodoRow.EspesorCanjuela), "Esp. cañuela (m)", 90));

            // Placa de fondo
            _grid.Columns.Add(new DataGridViewCheckBoxColumn
            {
                DataPropertyName = nameof(NodoRow.AplicaPlacaFondo),
                HeaderText = "Placa",
                Width = 45
            });
            _grid.Columns.Add(CreateNumericColumn(nameof(NodoRow.EspesorPlacaFondo), "Esp. placa (m)", 90));

            // Cama de filtro
            _grid.Columns.Add(new DataGridViewCheckBoxColumn
            {
                DataPropertyName = nameof(NodoRow.AplicaCamaFiltro),
                HeaderText = "Cama",
                Width = 45
            });
            _grid.Columns.Add(CreateNumericColumn(nameof(NodoRow.EspesorCamaFiltro), "Esp. cama (m)", 90));

            // Altura manual
            _grid.Columns.Add(CreateNumericColumn(nameof(NodoRow.AlturaManual), "Altura manual (m)", 110));

            // Handle (oculto)
            _grid.Columns.Add(new DataGridViewTextBoxColumn
            {
                DataPropertyName = nameof(NodoRow.Handle),
                HeaderText = "Handle",
                Visible = false
            });

            // Fuente de datos
            _bs.DataSource = data.ToList();
            _grid.DataSource = _bs;

            // Poblar áreas automáticas desde bloques AutoCAD
            foreach (NodoRow nr in Resultado)
            {
                if (!string.IsNullOrWhiteSpace(nr.Handle))
                {
                    var (aExt, aMed, pExt) = ObtenerAreasNodo(nr.Handle);
                    nr.AreaNodoEXT = aExt;
                    nr.AreaNodoMED = aMed;
                    nr.PerimetroNodoEXT = pExt;
                }
            }

            if (_bs.Count > 0)
                _grid.Rows[0].Selected = true;

            // Ocultar columna "Pasos" si llegara a existir
            var colPasos = _grid.Columns
                .Cast<DataGridViewColumn>()
                .FirstOrDefault(c => c.DataPropertyName == nameof(NodoRow.Pasos));
            if (colPasos != null)
                colPasos.Visible = false;

            // ================== ENLACE DE EVENTOS (cálculos) ==================

            // Cuando cambie la selección o edites una celda → recalcular
            _grid.SelectionChanged += Grid_SelectionChanged;
            _grid.CellBeginEdit += Grid_CellBeginEdit;
            _grid.CellEndEdit += Grid_CellEndEdit;
            _grid.EditingControlShowing += Grid_EditingControlShowing;

            // ===== NUEVO: Timer para zoom automático con delay =====
            _zoomTimer = new System.Windows.Forms.Timer();
            _zoomTimer.Interval = 300; // 300ms de delay
            _zoomTimer.Tick += ZoomTimer_Tick;

            // Evento cuando cambia la selección
            _grid.SelectionChanged += Grid_SelectionChanged;

            // ===== NUEVO: Evento doble clic para hacer zoom a la entidad en AutoCAD =====
            _grid.CellDoubleClick += Grid_CellDoubleClick;
            // ===== NUEVO: Eliminar con Delete =====
            _grid.KeyDown += Grid_KeyDown;

            // Todos los checks de cantidades comparten el mismo handler
            chkExcav.CheckedChanged += ChkCantidades_CheckedChanged;
            chkRellenoPerim.CheckedChanged += ChkCantidades_CheckedChanged;
            chkEntibado.CheckedChanged += ChkCantidades_CheckedChanged;
            chkNodo.CheckedChanged += ChkCantidades_CheckedChanged;
            chkMamposteria.CheckedChanged += ChkCantidades_CheckedChanged;
            chkPlacaFondo.CheckedChanged += ChkCantidades_CheckedChanged;
            chkPasos.CheckedChanged += ChkCantidades_CheckedChanged;
            chkCanjuela.CheckedChanged += ChkCantidades_CheckedChanged;
            // ===== NUEVO: Suscribir evento del check "Aplicar a todos" =====
            chkAplicarTodosNodos.CheckedChanged += ChkAplicarTodosNodos_CheckedChanged;

            // Primer cálculo para el nodo inicialmente seleccionado
            ActualizarPanelNodoActual();
            CargarChecksDesdeNodoActual();
            CargarCombosDesdeNodoActual();   // <<< NUEVO
            RecalcularCantidadesNodoActual();
            HookPersistenciaCombosPorNodo();
        }



        // ===== Helpers para columnas numéricas =====
        private static DataGridViewTextBoxColumn CreateNumericColumn(string propertyName, string header, int width)
        {
            return new DataGridViewTextBoxColumn
            {
                DataPropertyName = propertyName,
                HeaderText = header,
                Width = width,
                DefaultCellStyle = { Alignment = DataGridViewContentAlignment.MiddleRight, Format = "N3" }
            };
        }

        // ================== EVENTOS UI ==================

        private void ChkCantidades_CheckedChanged(object? sender, EventArgs e)
        {
            if (_actualizandoDesdeCodigo)
                return;

            var n = GetNodoActual();
            if (n == null) return;

            // 1) Actualizar flags SOLO del nodo seleccionado
            n.UsaExcav = chkExcav.Checked;
            n.UsaRellenoPerim = chkRellenoPerim.Checked;
            n.UsaEntibado = chkEntibado.Checked;
            n.UsaNodo = chkNodo.Checked;
            n.UsaMamposteria = chkMamposteria.Checked;
            n.UsaPlacaFondo = chkPlacaFondo.Checked;
            n.UsaPasos = chkPasos.Checked;
            n.UsaCanjuela = chkCanjuela.Checked;

            // 2) Si "Aplicar esta configuración a todos los nodos" está activo,
            //    copiamos ESTAS MISMAS SELECCIONES a todas las demás filas,
            //    SIN tocar ningún dato geométrico de la DataGrid.
            if (chkAplicarTodosNodos.Checked)
            {

                foreach (NodoRow otros in Resultado)
                {
                    if (ReferenceEquals(otros, n)) continue;

                    otros.UsaExcav = n.UsaExcav;
                    otros.UsaRellenoPerim = n.UsaRellenoPerim;
                    otros.UsaEntibado = n.UsaEntibado;
                    otros.UsaNodo = n.UsaNodo;
                    otros.UsaMamposteria = n.UsaMamposteria;
                    otros.UsaPlacaFondo = n.UsaPlacaFondo;
                    otros.UsaPasos = n.UsaPasos;
                    otros.UsaCanjuela = n.UsaCanjuela;
                }
            }

            RecalcularCantidadesNodoActual();
        }


        private void BtnAgregarImagen_Click(object? sender, EventArgs e)
        {
            using var dlg = new OpenFileDialog
            {
                Title = "Seleccionar gráfico de nodo",
                Filter = "Imágenes (*.png;*.jpg;*.jpeg)|*.png;*.jpg;*.jpeg|Todos los archivos (*.*)|*.*"
            };
            if (dlg.ShowDialog(this) == DialogResult.OK)
            {
                _rutaGraficoNodo = dlg.FileName;
                try
                {
                    picPreview.ImageLocation = _rutaGraficoNodo;
                }
                catch
                {
                    picPreview.Image = null;
                }
            }
        }

        private void BtnCargar_Click(object? sender, EventArgs e)
        {
            // Validar nombres de nodos
            if (Resultado.Any(r => string.IsNullOrWhiteSpace(r.Nombre)))
            {
                MessageBox.Show(this,
                    "Completa el nombre del nodo en todas las filas antes de enviar a presupuesto.",
                    "SicoeCAD - Nodos",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                return;
            }

            if (!ValidarNoHayItemSinCheck())
                return;
            var lista = ConstruirNodosJsonDesdeGrid();
            if (!HayAlMenosUnItemSeleccionado(lista))
            {
                MessageBox.Show(this,
                    "No hay ningún ítem de presupuesto asignado para los nodos.\n" +
                    "Activa al menos una cantidad (check) y selecciona un ítem.",
                    "SicoeCAD - Nodos",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
                return;
            }
            // ===== GUARDAR nombres de nodos en memoria =====
            if (!string.IsNullOrWhiteSpace(_capituloActual))
            {
                var nodosConCoords = Resultado
                                    .Where(r => !string.IsNullOrWhiteSpace(r.Nombre))
                                    .GroupBy(r => r.Nombre.Trim().ToUpperInvariant())
                                    .Select(g => (
                                        Nombre: g.Key,
                                        Norte: g.First().Norte,
                                        Este: g.First().Este))
                                    .ToList();

                if (nodosConCoords.Count > 0)
                {
                    NodoMemoryRepository.AgregarNodos(_capituloActual, nodosConCoords);
                    System.Diagnostics.Debug.WriteLine($"[NODOS] Guardados {nodosConCoords.Count} nodos en capítulo {_capituloActual}");
                }
            }
            EnviarAPresupuesto?.Invoke(lista);

            DialogResult = DialogResult.OK;
            Close();

        }

        private void BtnGenerarInforme_Click(object? sender, EventArgs e)
        {
            if (Resultado == null || Resultado.Count == 0)
            {
                MessageBox.Show(this,
                    "No hay nodos para generar el informe.",
                    "SICOE",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
                return;
            }

            // ===== VALIDACIÓN: Todos los nodos deben tener imagen capturada =====
            var nodosSinImagen = Resultado
                .Where(n => n.ImagenesBase64.Count == 0)
                .Select(n => n.Nombre)
                .ToList();

            if (nodosSinImagen.Count > 0)
            {
                string listaNodos = string.Join("\n• ", nodosSinImagen);

                MessageBox.Show(this,
                    $"Los siguientes nodos NO tienen imagen capturada:\n\n• {listaNodos}\n\n" +
                    "Debes hacer DOBLE CLIC en cada nodo para capturar su vista automáticamente " +
                    "antes de generar el informe.",
                    "SICOE - Falta capturar imágenes",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                return;
            }
            var lista = ConstruirNodosJsonDesdeGrid();
            if (!HayAlMenosUnItemSeleccionado(lista))
            {
                MessageBox.Show(this,
                    "No hay ningún ítem de presupuesto asignado para los nodos.\n" +
                    "No se puede generar el informe HTML.",
                    "SicoeCAD - Informe de nodos",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
                return;
            }

            using var dlg = new SaveFileDialog
            {
                Title = "Guardar informe HTML de nodos",
                Filter = "Archivo HTML (*.html)|*.html",
                FileName = "Informe_Nodos_SicoeCAD.html"
            };
            if (dlg.ShowDialog(this) != DialogResult.OK)
                return;

            string path = dlg.FileName;

            foreach (var nodo in lista)
            {
                if (!NodoTieneItems(nodo))
                    continue;

                NodoReportService.AppendNodoHtml(path, nodo, _rutaGraficoNodo);
            }


            MessageBox.Show(this,
                "Informe de nodos generado correctamente.",
                "SicoeCAD - Informe de nodos",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);

        }

        // ================== LÓGICA DE CÁLCULO ==================

        private NodoRow? GetNodoActual()
        {
            if (_bs.Current is NodoRow n)
                return n;
            return null;
        }

        private void ActualizarPanelNodoActual()
        {
            var n = GetNodoActual();
            if (n == null)
            {
                lblNombreNodoValor.Text = "";
                lblAbsNodoValor.Text = "";
                lblRasanteValor.Text = "";
                lblClaveSalidaValor.Text = "";
                lblDiametroValor.Text = "";
                lblAncho1Valor.Text = "";
                lblAncho2Valor.Text = "";
                lblAlturaExcValor.Text = "";
                lblAreaExcValor.Text = "";
                lblAreaPerimValor.Text = "";
                lblModoAltura.Text = "Sin nodo seleccionado";
                return;
            }

            double alturaExc;
            double areaExc;
            double areaPerim;
            bool usandoAlturaManual;

            // Calcula: altura calculada geométrica + aplica prioridad a AlturaManual si > 0
            CalcularGeometriaNodo(n, out alturaExc, out areaExc, out areaPerim, out usandoAlturaManual, out _);
            // Datos básicos del nodo
            lblNombreNodoValor.Text = n.Nombre ?? "";
            lblAbsNodoValor.Text = n.AbsIni ?? "";

            lblRasanteValor.Text = Fmt(n.Rasante);
            lblClaveSalidaValor.Text = Fmt(n.ClaveSalida);
            // Mostrar diámetro convertido: si es entero se interpreta en pulgadas → metros
            double _diamDisplay = n.DiametroSalida;
            if (_diamDisplay > 0 && Math.Abs(_diamDisplay - Math.Truncate(_diamDisplay)) < 1e-6)
                _diamDisplay = _diamDisplay * 0.0254;
            lblDiametroValor.Text = Fmt(_diamDisplay);
            lblAncho1Valor.Text = Fmt(n.AreaNodoEXT);   // Área NODO_EXT
            lblAncho2Valor.Text = Fmt(n.AreaNodoMED);   // Área NODO_MED

            // ÚNICO LABEL PARA ALTURA:
            //   - si AlturaManual > 0 → se muestra AlturaManual
            //   - si AlturaManual = 0  → se muestra la altura calculada geométrica
            lblAlturaExcValor.Text = Fmt(alturaExc);

            // Áreas asociadas a esa altura efectiva
            lblAreaExcValor.Text = Fmt(areaExc);
            lblAreaPerimValor.Text = Fmt(areaPerim);

            // Mensaje indicativo del modo usado
            lblModoAltura.Text = usandoAlturaManual
                ? "Altura manual en uso"
                : "Altura calculada desde rasante/clave/diámetro/espesores";
        }


        private void CargarChecksDesdeNodoActual()
        {
            _actualizandoDesdeCodigo = true;
            try
            {
                var n = GetNodoActual();
                if (n == null)
                {
                    chkExcav.Checked = false;
                    chkRellenoPerim.Checked = false;
                    chkEntibado.Checked = false;
                    chkNodo.Checked = false;
                    chkMamposteria.Checked = false;
                    chkPlacaFondo.Checked = false;
                    chkPasos.Checked = false;
                    chkCanjuela.Checked = false;
                    return;
                }

                chkExcav.Checked = n.UsaExcav;
                chkRellenoPerim.Checked = n.UsaRellenoPerim;
                chkEntibado.Checked = n.UsaEntibado;
                chkNodo.Checked = n.UsaNodo;
                chkMamposteria.Checked = n.UsaMamposteria;
                chkPlacaFondo.Checked = n.UsaPlacaFondo;
                chkPasos.Checked = n.UsaPasos;
                chkCanjuela.Checked = n.UsaCanjuela;
            }
            finally
            {
                _actualizandoDesdeCodigo = false;
            }
        }

        private void RecalcularCantidadesNodoActual()
        {
            var n = GetNodoActual();
            if (n == null)
            {
                txtExcav.Text = "";
                txtRellenoPerim.Text = "";
                txtEntibado.Text = "";
                txtNodo.Text = "";
                txtMamposteria.Text = "";
                txtPlacaFondo.Text = "";
                txtPasos.Text = "";
                txtCanjuela.Text = "";
                return;
            }

            // Geometría básica del nodo
            double alturaExc;
            double areaExc;
            double areaPerim;
            bool usandoAlturaManual;

            CalcularGeometriaNodo(n, out alturaExc, out areaExc, out areaPerim, out usandoAlturaManual, out double alturaTotal);

            // alturaExc ya tiene DescEstVia descontado → para excavación, relleno, entibado
            // alturaTotal sin descuento → para mampostería y pasos (estructura del nodo)

            // ========= 1) Excavación =========
            double vExc = areaExc * alturaExc;

            // ========= 2) Relleno perimetral =========
            double vRell = vExc - (areaPerim * alturaExc);
            if (vRell < 0.0) vRell = 0.0;

            // ========= 3) Entibado =========
            // La condición y el cálculo usan alturaTotal (sin descontar DescEstVia)
            double aEnt = n.PerimetroNodoEXT * alturaTotal;
            if (alturaTotal <= 1.50) aEnt = 0.0;

            // ========= 4) Nodo =========
            double nodoUnd = 1.0;

            // ========= 5) Mampostería — usa alturaTotal (sin descontar DescEstVia) =========
            double canjEsp = n.AplicaCanjuela ? n.EspesorCanjuela : 0.0;
            double placaEsp = n.AplicaPlacaFondo ? n.EspesorPlacaFondo : 0.0;
            double hMamp = alturaTotal - canjEsp - placaEsp - n.Espesor;
            if (hMamp < 0.0) hMamp = 0.0;

            // ========= 6) Placa de fondo =========
            double placaUnd = n.AplicaPlacaFondo ? 1.0 : 0.0;

            // ========= 7) Pasos — usa hMamp basado en alturaTotal =========
            double pasosCalc = hMamp > 0.0 ? Math.Ceiling(hMamp / 0.40) - 1 : 0.0;

            // ========= 8) Cañuela =========
            double canjuelaUnd = n.AplicaCanjuela ? 1.0 : 0.0;

            // ===== Asignar a los TextBox =====
            txtExcav.Text = Fmt(vExc);
            txtRellenoPerim.Text = Fmt(vRell);
            txtEntibado.Text = Fmt(aEnt);
            txtNodo.Text = Fmt(nodoUnd);
            txtMamposteria.Text = Fmt(hMamp);
            txtPlacaFondo.Text = Fmt(placaUnd);
            txtPasos.Text = pasosCalc.ToString("0");
            txtCanjuela.Text = Fmt(canjuelaUnd);
        }
        /// <summary>
        /// Calcula altura de excavación, área de excavación y área perimetral
        /// para un nodo según la fórmula acordada.
        /// </summary>
        private static void CalcularGeometriaNodo(
            NodoRow n,
            out double alturaExc,
            out double areaExc,
            out double areaPerim,
            out bool usandoAlturaManual,
            out double alturaTotal)
        {
            // 1) Diámetro: si viene como entero (sin decimales) lo interpretamos en pulgadas
            //    y lo convertimos a metros. Si ya viene con decimales, se asume que está en m.
            double diamCalc = n.DiametroSalida;
            bool esEntero = Math.Abs(diamCalc - Math.Truncate(diamCalc)) < 1e-6;
            if (esEntero && diamCalc > 0)
            {
                // pulgadas → metros (36" = 0.914 m aprox.)
                diamCalc = diamCalc * 0.0254;
            }

            // 2) Espesores opcionales
            double canj = n.AplicaCanjuela ? n.EspesorCanjuela : 0.0;
            double placa = n.AplicaPlacaFondo ? n.EspesorPlacaFondo : 0.0;
            double cama = n.AplicaCamaFiltro ? n.EspesorCamaFiltro : 0.0;

            // 3) Altura de excavación ANTES de descontar DescEstVia
            double alturaCalc = n.Rasante - (n.ClaveSalida - diamCalc - n.Espesor - canj - placa - cama);
            if (alturaCalc < 0) alturaCalc = 0;

            usandoAlturaManual = n.AlturaManual > 0;
            double alturaBase = usandoAlturaManual ? n.AlturaManual : alturaCalc;

            // alturaTotal = altura ANTES de descontar DescEstVia (para mampostería y pasos)
            alturaTotal = alturaBase;

            // Altura útil de excavación = altura base − DescEstVia
            alturaExc = alturaBase - n.DescEstVia;
            if (alturaExc < 0) alturaExc = 0;

            // 4) Área de excavación = polígono NODO_EXT del bloque
            areaExc = n.AreaNodoEXT;
            if (areaExc < 0) areaExc = 0;

            // 5) Área perimetral = polígono NODO_MED del bloque
            areaPerim = n.AreaNodoMED;
            if (areaPerim < 0) areaPerim = 0;
        }


        private void ChkAplicarTodosNodos_CheckedChanged(object? sender, EventArgs e)
        {
            // NUEVO COMPORTAMIENTO:
            // Este check SOLO controla si las selecciones de los checkboxes
            // de cantidades se arrastran a todos los nodos.
            // NO modifica ningún valor geométrico de la DataGrid.

            // Si se DESACTIVA, no hacemos nada (cada nodo mantiene su configuración individual)
            if (!chkAplicarTodosNodos.Checked)
                return;

            // Si se ACTIVA, copiamos la configuración del nodo actual a todos los demás
            var origen = GetNodoActual();
            if (origen == null) return;

            // Copiamos la configuración de ítems del nodo actual al resto

            foreach (NodoRow n in Resultado)
            {
                if (ReferenceEquals(n, origen)) continue;

                n.UsaExcav = origen.UsaExcav;
                n.UsaRellenoPerim = origen.UsaRellenoPerim;
                n.UsaEntibado = origen.UsaEntibado;
                n.UsaNodo = origen.UsaNodo;
                n.UsaMamposteria = origen.UsaMamposteria;
                n.UsaPlacaFondo = origen.UsaPlacaFondo;
                n.UsaPasos = origen.UsaPasos;
                n.UsaCanjuela = origen.UsaCanjuela;
            }

            // Refrescamos solo los checks visibles del nodo actual
            CargarChecksDesdeNodoActual();
            RecalcularCantidadesNodoActual();
        }


        private static string Fmt(double value)
        {
            return value.ToString("0.000", CultureInfo.InvariantCulture);
        }

        // ================== CONSTRUCCIÓN MODELO JSON ==================

        private List<NodoJson> ConstruirNodosJsonDesdeGrid()
        {
            var lista = new List<NodoJson>();

            foreach (NodoRow n in Resultado)
            {
                double alturaExc;
                double areaExc;
                double areaPerim;
                bool usandoAlturaManual;

                CalcularGeometriaNodo(n, out alturaExc, out areaExc, out areaPerim, out usandoAlturaManual, out double alturaTotal);

                // alturaExc YA tiene DescEstVia descontado (lo aplica CalcularGeometriaNodo)
                // No volver a descontar aquí
                double alturaUtilExc = alturaExc;

                // Mampostería y Pasos usan alturaTotal (SIN descontar DescEstVia)
                // porque son la estructura del nodo, no la zanja de excavación
                double canj = n.AplicaCanjuela ? n.EspesorCanjuela : 0.0;
                double placa = n.AplicaPlacaFondo ? n.EspesorPlacaFondo : 0.0;
                double hMamp = alturaTotal - canj - placa - n.Espesor;
                if (hMamp < 0) hMamp = 0;

                // Pasos desde altura de mampostería
                double pasosCalc = hMamp > 0 ? Math.Ceiling(hMamp / 0.40) - 1 : 0;
                if (pasosCalc < 0) pasosCalc = 0;

                // Perímetro de la excavación en planta (rectángulo Ancho1 x Ancho2)
                // Perímetro real del polígono NODO_EXT del bloque
                double perimetroExc = n.PerimetroNodoEXT;
                if (perimetroExc < 0) perimetroExc = 0;

                var j = new NodoJson
                {
                    Handle = n.Handle,
                    Nombre = n.Nombre,
                    Abs = n.AbsIni,

                    // Coordenadas del punto medio del bloque
                    Norte = n.Norte,
                    Este = n.Este,

                    Rasante = n.Rasante,
                    ClaveSalida = n.ClaveSalida,
                    DescEstVia = n.DescEstVia,
                    DiametroSalida = n.DiametroSalida,
                    // Áreas de contorno del bloque
                    AreaNodoEXT = Math.Round(n.AreaNodoEXT, 2, MidpointRounding.AwayFromZero),
                    AreaNodoMED = Math.Round(n.AreaNodoMED, 2, MidpointRounding.AwayFromZero),
                    PerimetroNodoEXT = Math.Round(n.PerimetroNodoEXT, 2, MidpointRounding.AwayFromZero),

                    // Geometría base
                    AlturaExc = alturaExc,
                    AreaExc = areaExc,
                    AreaPerimetral = areaPerim,

                    // Alias usados en FrmSicoePresupuesto (redondeados a 2 decimales)
                    AlturaExcav = Math.Round(alturaExc, 2, MidpointRounding.AwayFromZero),
                    AreaExcav = Math.Round(areaExc, 2, MidpointRounding.AwayFromZero),
                    PerimetroExcav = Math.Round(perimetroExc, 2, MidpointRounding.AwayFromZero),

                    Pasos = (int)pasosCalc
                };

                // =========================================================
                // Cantidades según flags POR NODO y combos POR NODO (n.ItemX)
                // =========================================================

                // 1) Excavación (m3)
                if (n.UsaExcav)
                {
                    double vExc = areaExc * alturaUtilExc;
                    if (vExc > 0 && !string.IsNullOrWhiteSpace(n.ItemExcav))
                    {
                        j.UsaExcav = true;
                        j.ItemExcav = n.ItemExcav;
                        j.CantExcav = vExc;
                    }
                }

                // 2) Relleno perimetral (m3)
                //    (volumen excavación) - (volumen "caja" interior / perímetro según tu fórmula actual)
                if (n.UsaRellenoPerim)
                {
                    double vExc = areaExc * alturaUtilExc;
                    double vRell = vExc - (areaPerim * alturaUtilExc);
                    if (vRell < 0) vRell = 0;

                    if (vRell > 0 && !string.IsNullOrWhiteSpace(n.ItemRellenoPerim))
                    {
                        j.UsaRellenoPerim = true;
                        j.ItemRellenoPerim = n.ItemRellenoPerim;
                        j.CantRellenoPerim = vRell;
                    }
                }

                // 3) Entibado (m2)
                //    Se calcula con alturaTotal (sin descontar DescEstVia)
                if (n.UsaEntibado && alturaTotal > 1.50)
                {
                    // Área de entibado = perímetro * altura total de excavación
                    double aEnt = n.PerimetroNodoEXT * alturaTotal; if (aEnt < 0) aEnt = 0;

                    if (aEnt > 0 && !string.IsNullOrWhiteSpace(n.ItemEntibado))
                    {
                        j.UsaEntibado = true;
                        j.ItemEntibado = n.ItemEntibado;
                        j.CantEntibado = aEnt;
                    }
                }
                else
                {
                    j.UsaEntibado = false;
                    j.CantEntibado = 0.0;
                }

                // 4) Nodo (unidad)
                if (n.UsaNodo && !string.IsNullOrWhiteSpace(n.ItemNodo))
                {
                    j.UsaNodo = true;
                    j.ItemNodo = n.ItemNodo;
                    j.CantNodo = 1.0;
                }

                // 5) Mampostería (según tu lógica: Cant = hMamp)
                if (n.UsaMamposteria && hMamp > 0 && !string.IsNullOrWhiteSpace(n.ItemMamposteria))
                {
                    j.UsaMamposteria = true;
                    j.ItemMamposteria = n.ItemMamposteria;
                    j.CantMamposteria = hMamp;
                }

                // 6) Placa fondo (und)
                if (n.UsaPlacaFondo && !string.IsNullOrWhiteSpace(n.ItemPlacaFondo))
                {
                    j.UsaPlacaFondo = true;
                    j.ItemPlacaFondo = n.ItemPlacaFondo;
                    j.CantPlacaFondo = 1.0;
                }

                // 7) Pasos (und)
                if (n.UsaPasos && pasosCalc > 0 && !string.IsNullOrWhiteSpace(n.ItemPasos))
                {
                    j.UsaPasos = true;
                    j.ItemPasos = n.ItemPasos;
                    j.CantPasos = pasosCalc;
                }

                // 8) Cañuela (und)
                if (n.UsaCanjuela && !string.IsNullOrWhiteSpace(n.ItemCanjuela))
                {
                    j.UsaCanjuela = true;
                    j.ItemCanjuela = n.ItemCanjuela;
                    j.CantCanjuela = 1.0;
                }

                // ===== NUEVO: Pasar screenshot capturado =====
                j.ImagenBase64 = n.ImagenesBase64.Count > 0 ? n.ImagenesBase64[0] : string.Empty;

                lista.Add(j);
            }

            return lista;
        }
        /// <summary>
        /// Lee los polígonos NODO_EXT y NODO_MED dentro del bloque referenciado por handle
        /// y devuelve (AreaEXT, AreaMED, PerimetroEXT).
        /// Usa la fórmula de Shoelace para el área y suma de segmentos para el perímetro.
        /// Fallback a 0 si no se encuentran las capas o hay error.
        /// </summary>
        internal static (double AreaEXT, double AreaMED, double PerimetroEXT) ObtenerAreasNodo(
            string handle)
        {
            if (string.IsNullOrWhiteSpace(handle))
                return (0, 0, 0);

            try
            {
                var doc = Autodesk.AutoCAD.ApplicationServices.Core.Application
                    .DocumentManager.MdiActiveDocument;
                if (doc == null) return (0, 0, 0);

                using (doc.LockDocument())
                {
                    var db = doc.Database;
                    using (var tr = db.TransactionManager.StartOpenCloseTransaction())
                    {
                        Handle h;
                        try { h = new Handle(Convert.ToInt64(handle, 16)); }
                        catch { return (0, 0, 0); }

                        ObjectId id = db.GetObjectId(false, h, 0);
                        if (!id.IsValid) return (0, 0, 0);

                        if (tr.GetObject(id, OpenMode.ForRead) is not BlockReference br)
                            return (0, 0, 0);

                        var btr = (BlockTableRecord)tr.GetObject(
                            br.BlockTableRecord, OpenMode.ForRead);
                        var xform = br.BlockTransform;

                        double areaEXT = 0, AreaMED = 0, perimEXT = 0;

                        foreach (ObjectId subId in btr)
                        {
                            var subEnt = tr.GetObject(subId, OpenMode.ForRead, false, true);

                            string layer = "";
                            double area = 0;
                            double perim = 0;

                            if (subEnt is Polyline subPl)
                            {
                                layer = (subPl.Layer ?? "").Trim();
                                bool esExtPl = layer.Equals("nodo_ext", StringComparison.OrdinalIgnoreCase);
                                bool esMedPl = layer.Equals("nodo_med", StringComparison.OrdinalIgnoreCase);
                                if (!esExtPl && !esMedPl) continue;

                                int nv = subPl.NumberOfVertices;
                                if (nv < 3) continue;

                                var pts = new List<(double X, double Y)>(nv);
                                for (int i = 0; i < nv; i++)
                                {
                                    var p3 = xform * subPl.GetPoint3dAt(i);
                                    pts.Add((p3.X, p3.Y));
                                }

                                double shoelace = 0;
                                for (int i = 0; i < nv; i++)
                                {
                                    var a = pts[i];
                                    var b = pts[(i + 1) % nv];
                                    shoelace += a.X * b.Y - b.X * a.Y;
                                }
                                area = Math.Abs(shoelace) / 2.0;

                                if (esExtPl)
                                {
                                    for (int i = 0; i < nv; i++)
                                    {
                                        var a = pts[i];
                                        var b = pts[(i + 1) % nv];
                                        double dx = b.X - a.X, dy = b.Y - a.Y;
                                        perim += Math.Sqrt(dx * dx + dy * dy);
                                    }
                                    areaEXT = area;
                                    perimEXT = perim;
                                }
                                else
                                {
                                    AreaMED = area;
                                }
                            }
                            else if (subEnt is Circle circ)
                            {
                                // Soporte para nodos circulares (pozos, cámaras redondas)
                                layer = (circ.Layer ?? "").Trim();
                                bool esExtC = layer.Equals("nodo_ext", StringComparison.OrdinalIgnoreCase);
                                bool esMedC = layer.Equals("nodo_med", StringComparison.OrdinalIgnoreCase);
                                if (!esExtC && !esMedC) continue;

                                double r = circ.Radius;
                                area = Math.PI * r * r;
                                perim = 2.0 * Math.PI * r;

                                if (esExtC) { areaEXT = area; perimEXT = perim; }
                                else { AreaMED = area; }
                            }
                            else
                            {
                                continue;
                            }
                        }

                        tr.Commit();
                        return (areaEXT, AreaMED, perimEXT);
                    }
                }
            }
            catch
            {
                return (0, 0, 0);
            }
        }

        // ================== EXPORTE A PRESUPUESTO (PÚBLICO) ==================

        /// <summary>
        /// Devuelve la lista completa de nodos con sus ítems y cantidades
        /// (solo los que tienen check + ítem seleccionado).
        /// </summary>
        public List<NodoJson> BuildPresupuestoInfo()
        {
            return ConstruirNodosJsonDesdeGrid();
        }


        private static bool NodoTieneItems(NodoJson n)
        {
            return (n.UsaExcav && n.CantExcav > 0) ||
                   (n.UsaRellenoPerim && n.CantRellenoPerim > 0) ||
                   (n.UsaEntibado && n.CantEntibado > 0) ||
                   (n.UsaNodo && n.CantNodo > 0) ||
                   (n.UsaMamposteria && n.CantMamposteria > 0) ||
                   (n.UsaPlacaFondo && n.CantPlacaFondo > 0) ||
                   (n.UsaPasos && n.CantPasos > 0) ||
                   (n.UsaCanjuela && n.CantCanjuela > 0);
        }

        private static bool HayAlMenosUnItemSeleccionado(List<NodoJson> lista)
        {
            return lista.Any(NodoTieneItems);
        }
        /// <summary>
        /// Fuerza el foco al control de edición para evitar que AutoCAD capture las teclas.
        /// </summary>
        private void Grid_EditingControlShowing(object? sender, DataGridViewEditingControlShowingEventArgs e)
        {
            if (e.Control is TextBox tb)
            {
                // Remover cualquier handler previo para evitar duplicados
                tb.Enter -= TextBox_Enter;
                tb.Leave -= TextBox_Leave;

                // Agregar handlers
                tb.Enter += TextBox_Enter;
                tb.Leave += TextBox_Leave;

                // Forzar foco inmediatamente
                tb.Focus();
            }
        }

        private void TextBox_Enter(object? sender, EventArgs e)
        {
            if (sender is TextBox tb)
            {
                // Forzar foco cuando entra al TextBox
                tb.Focus();
            }
        }

        private void TextBox_Leave(object? sender, EventArgs e)
        {
            // Cleanup si es necesario
        }
        private void Grid_CellBeginEdit(object? sender, DataGridViewCellCancelEventArgs e)
        {
            if (e.RowIndex < 0 || e.ColumnIndex < 0) return;

            var fila = _grid.Rows[e.RowIndex];
            if (fila.DataBoundItem is not NodoRow n) return;

            string prop = _grid.Columns[e.ColumnIndex].DataPropertyName ?? string.Empty;

            // Si el usuario intenta escribir espesor y el check está apagado → cancelar
            if (prop == nameof(NodoRow.EspesorCanjuela) && !n.AplicaCanjuela)
            {
                e.Cancel = true;
            }
            else if (prop == nameof(NodoRow.EspesorPlacaFondo) && !n.AplicaPlacaFondo)
            {
                e.Cancel = true;
            }
            else if (prop == nameof(NodoRow.EspesorCamaFiltro) && !n.AplicaCamaFiltro)
            {
                e.Cancel = true;
            }
        }

        private void Grid_CellEndEdit(object? sender, DataGridViewCellEventArgs e)
        {
            // Evitar recursión si ya estamos replicando
            if (_replicandoValoresEnGrid)
                return;

            // ==============================================================
            // FUNCIONALIDAD 3: "Aplicar a todos" extendido a DataGrid
            // ==============================================================
            // Si el check "Aplicar esta configuración a todos los nodos" está activo,
            // replicamos el valor editado a TODAS las filas hacia abajo
            // SOLO replicar si checkbox está activado
            if (!chkAplicarTodosNodos.Checked)
            {
                // Sin replicación - solo actualizar
                ActualizarPanelNodoActual();
                RecalcularCantidadesNodoActual();
                return;
            }

            if (e.RowIndex >= 0 && e.ColumnIndex >= 0)
            {
                var colName = _grid.Columns[e.ColumnIndex].DataPropertyName;

                // Lista de columnas que se deben replicar (solo las editables numéricas)
                var columnasReplicables = new[]
                {
                    nameof(NodoRow.Nombre),           // ← NUEVO: Replicar nombre
                    nameof(NodoRow.DescEstVia),
                    nameof(NodoRow.DiametroSalida),
                    nameof(NodoRow.Espesor),
                    nameof(NodoRow.EspesorCanjuela),
                    nameof(NodoRow.EspesorPlacaFondo),
                    nameof(NodoRow.EspesorCamaFiltro),
                    nameof(NodoRow.AlturaManual)
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

            // Cada vez que cambie un valor geométrico, actualizamos panel y cantidades
            ActualizarPanelNodoActual();
            RecalcularCantidadesNodoActual();
        }

        /// <summary>
        /// Se ejecuta cuando el usuario cambia de fila (click o flechas del teclado).
        /// Reinicia el timer para hacer zoom después de 300ms de quietud.
        /// </summary>
        private void Grid_SelectionChanged(object? sender, EventArgs e)
        {

            // ===== CRÍTICO: Checkbox solo activo en fila 0 =====
            if (_grid.CurrentRow != null)
            {
                bool esPrimeraFila = (_grid.CurrentRow.Index == 0);
                chkAplicarTodosNodos.Visible = esPrimeraFila;

                // Si NO es la primera fila, DESACTIVAR el checkbox
                if (!esPrimeraFila && chkAplicarTodosNodos.Checked)
                {
                    chkAplicarTodosNodos.Checked = false;
                }
            }
            // ===== FIN CRÍTICO =====//
            try
            {
                // Detener el timer anterior
                _zoomTimer?.Stop();

                // Si no hay filas seleccionadas, salir
                if (_grid.SelectedRows.Count == 0)
                    return;

                int filaActual = _grid.SelectedRows[0].Index;

                // Si cambió de fila, reiniciar timer
                if (filaActual != _ultimaFilaSeleccionada)
                {
                    _ultimaFilaSeleccionada = filaActual;
                    _zoomTimer?.Start();
                }

                // NUEVO: Cargar combos del nodo seleccionado
                ActualizarPanelNodoActual();
                CargarChecksDesdeNodoActual();
                CargarCombosDesdeNodoActual();
                RecalcularCantidadesNodoActual();
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Error en Grid_SelectionChanged: {ex.Message}");
            }
        }

        /// <summary>
        /// Se ejecuta cuando pasan 300ms sin cambiar de fila.
        /// Hace zoom al nodo seleccionado.
        /// </summary>
        /// <summary>
        /// Se ejecuta cuando pasan 300ms sin cambiar de fila.
        /// Hace zoom al nodo seleccionado.
        /// </summary>
        private void ZoomTimer_Tick(object? sender, EventArgs e)
        {
            try
            {
                // Detener el timer
                _zoomTimer?.Stop();

                // Verificar que hay una fila seleccionada
                if (_grid.SelectedRows.Count == 0)
                    return;

                var fila = _grid.SelectedRows[0];
                if (fila.DataBoundItem is not NodoRow nodo)
                    return;

                // Hacer zoom al nodo
                var doc = Autodesk.AutoCAD.ApplicationServices.Application.DocumentManager.MdiActiveDocument;
                if (doc == null)
                    return;

                var db = doc.Database;
                string handleBuscado = nodo.Handle ?? "";

                if (string.IsNullOrWhiteSpace(handleBuscado))
                    return;

                using (doc.LockDocument())
                using (var tr = db.TransactionManager.StartTransaction())
                {
                    // Buscar la entidad por handle en todo el ModelSpace
                    var bt = (Autodesk.AutoCAD.DatabaseServices.BlockTable)tr.GetObject(
                        db.BlockTableId,
                        Autodesk.AutoCAD.DatabaseServices.OpenMode.ForRead);

                    var btr = (Autodesk.AutoCAD.DatabaseServices.BlockTableRecord)tr.GetObject(
                        bt[Autodesk.AutoCAD.DatabaseServices.BlockTableRecord.ModelSpace],
                        Autodesk.AutoCAD.DatabaseServices.OpenMode.ForRead);

                    foreach (Autodesk.AutoCAD.DatabaseServices.ObjectId id in btr)
                    {
                        if (tr.GetObject(id, Autodesk.AutoCAD.DatabaseServices.OpenMode.ForRead)
                            is Autodesk.AutoCAD.DatabaseServices.Entity ent)
                        {
                            string h = ent.Handle.ToString();
                            if (string.Equals(h, handleBuscado, StringComparison.OrdinalIgnoreCase))
                            {
                                try
                                {
                                    var ext = ent.GeometricExtents;
                                    var min = ext.MinPoint;
                                    var max = ext.MaxPoint;

                                    double margen = 2.0;
                                    double centerX = (min.X + max.X) / 2.0;
                                    double centerY = (min.Y + max.Y) / 2.0;
                                    double height = (max.Y - min.Y) + (margen * 2);
                                    double width = (max.X - min.X) + (margen * 2);

                                    var view = new Autodesk.AutoCAD.DatabaseServices.ViewTableRecord
                                    {
                                        CenterPoint = new Autodesk.AutoCAD.Geometry.Point2d(centerX, centerY),
                                        Height = height,
                                        Width = width
                                    };

                                    doc.Editor.SetCurrentView(view);
                                }
                                catch (Exception exZoom)
                                {
                                    System.Diagnostics.Debug.WriteLine($"Error haciendo zoom: {exZoom.Message}");
                                }
                                break;
                            }
                        }
                    }
                    tr.Commit();
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Error en ZoomTimer_Tick: {ex.Message}");
            }
        }
        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _zoomTimer?.Stop();
                _zoomTimer?.Dispose();
                _zoomTimer = null;
            }
            base.Dispose(disposing);
        }
        // ==============================================================
        // FUNCIONALIDAD 2: Doble clic en grid → Zoom a entidad en AutoCAD
        // ==============================================================
        private async void Grid_CellDoubleClick(object? sender, DataGridViewCellEventArgs e)
        {
            if (e.RowIndex < 0) return;

            if (_grid.Rows[e.RowIndex].DataBoundItem is not NodoRow nodo) return;

            if (nodo.Norte == 0 && nodo.Este == 0)
            {
                MessageBox.Show(this, "Nodo sin coordenadas.", "Zoom", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            try
            {
                var doc = Autodesk.AutoCAD.ApplicationServices.Application.DocumentManager.MdiActiveDocument;
                if (doc == null) return;

                // ===== IMPORTANTE: MISMO FLUJO QUE TRAMOS =====
                // 1. TILEMODE primero (Model Space)
                doc.SendStringToExecute("TILEMODE 1 ", true, false, false);
                await Task.Delay(300);

                // 2. Coordenadas del nodo
                double x = nodo.Este;
                double y = nodo.Norte;

                // 3. Offset fijo (ajustable)
                double offset = 3;  // Usuario ya lo ajustó a 3

                // 4. Calcular corners
                string x1 = (x - offset).ToString(System.Globalization.CultureInfo.InvariantCulture);
                string y1 = (y - offset).ToString(System.Globalization.CultureInfo.InvariantCulture);
                string x2 = (x + offset).ToString(System.Globalization.CultureInfo.InvariantCulture);
                string y2 = (y + offset).ToString(System.Globalization.CultureInfo.InvariantCulture);

                // 5. Comando EXACTO igual a tramos (SIN ZOOM E)
                string comando = $"UCS W ZOOM W {x1},{y1} {x2},{y2} REGEN ";

                // 6. Ejecutar zoom
                doc.SendStringToExecute(comando, true, false, false);

                // ===== CAPTURA AUTOMÁTICA =====
                var base64Screenshot = await AutoCADScreenshotHelperNodos.CaptureAutoCADScreenshotAsBase64Async(1800, 85);

                if (!string.IsNullOrEmpty(base64Screenshot))
                {
                    nodo.ImagenesBase64.Clear();
                    nodo.ImagenesBase64.Add(base64Screenshot);
                    _grid.Rows[e.RowIndex].DefaultCellStyle.BackColor = System.Drawing.Color.FromArgb(240, 255, 240);
                    System.Diagnostics.Debug.WriteLine($"Screenshot capturado para nodo {nodo.Nombre}");
                }
                else
                {
                    System.Diagnostics.Debug.WriteLine($"No se pudo capturar screenshot para nodo {nodo.Nombre}");
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, $"Error: {ex.Message}", "Zoom", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
        // ==============================================================
        // FUNCIONALIDAD: Eliminar nodo con tecla Delete
        // ==============================================================
        private void Grid_KeyDown(object? sender, KeyEventArgs e)
        {
            if (e.KeyCode != Keys.Delete) return;

            if (_grid.CurrentRow == null || _grid.CurrentRow.Index < 0) return;

            var ask = MessageBox.Show(this,
                "¿Deseas eliminar este nodo de la lista?\n\nEsta acción no se puede deshacer.",
                "SICOE - Eliminar nodo",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning);

            if (ask != DialogResult.Yes) return;

            try
            {
                int index = _grid.CurrentRow.Index;

                // Eliminar directamente del BindingSource (NO usar la propiedad Resultado)
                _bs.RemoveAt(index);

                if (_grid.Rows.Count > 0)
                {
                    int newIndex = Math.Min(index, _grid.Rows.Count - 1);
                    if (newIndex >= 0)
                        _grid.Rows[newIndex].Selected = true;
                }

                ActualizarPanelNodoActual();
                RecalcularCantidadesNodoActual();
            }
            catch (Exception ex)
            {
                MessageBox.Show(this,
                    $"Error al eliminar nodo:\n{ex.Message}",
                    "SICOE - Error",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }

            e.Handled = true;
        }
        /// <summary>
        /// Carga en TODOS los ComboBox el catálogo de ítems YA filtrado
        /// por capítulo + competencia desde FrmSicoePresupuesto.
        /// Debe llamarse justo después de crear el formulario.
        /// </summary>
        public void CargarCatalogoItems(IEnumerable<string> itemsFiltrados)
        {
            // 1) Guardamos el catálogo YA FILTRADO por Capítulo + Competencia
            _catalogoItemsFiltrado = itemsFiltrados?
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .Select(s => s.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(s => s)
                .ToList()
                ?? new List<string>();

            // 2) Configuramos cada Combo con búsqueda por "CONTIENE"
            ConfigurarComboBusquedaLibre(cmbExcav);
            ConfigurarComboBusquedaLibre(cmbRellenoPerim);
            ConfigurarComboBusquedaLibre(cmbEntibado);
            ConfigurarComboBusquedaLibre(cmbNodo);
            ConfigurarComboBusquedaLibre(cmbMamposteria);
            ConfigurarComboBusquedaLibre(cmbPlacaFondo);
            ConfigurarComboBusquedaLibre(cmbPasos);
            ConfigurarComboBusquedaLibre(cmbCanjuela);
        }
        /// <summary>
        /// Establece el capítulo actual para guardar nodos en la memoria correcta.
        /// Debe llamarse ANTES de que el usuario envíe a presupuesto.
        /// </summary>
        public void SetCapitulo(string capitulo)
        {
            _capituloActual = capitulo?.Trim().ToUpperInvariant() ?? "";
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

        // Fuerza a que se vea siempre el INICIO del texto
        private void ResetComboCaretToStart(ComboBox combo)
        {
            if (combo == null) return;
            if (!combo.IsHandleCreated) return;   // NET 4.8: evita crash antes de Show()

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

            // Desactivamos el autocomplete estándar
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
            int selStart = Math.Max(0, combo.SelectionStart);

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

            combo.DroppedDown = true;
            System.Windows.Forms.Cursor.Current = System.Windows.Forms.Cursors.Default;

            combo.Text = texto;
            combo.SelectionStart = Math.Min(selStart, combo.Text.Length);
            combo.SelectionLength = 0;
        }

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

            // Si el usuario dejó el combo vacío, lo aceptamos
            if (string.IsNullOrWhiteSpace(texto))
            {
                combo.Text = string.Empty;
                combo.SelectionStart = 0;
                combo.SelectionLength = 0;
                GuardarComboEnNodoActual(combo);   // <<< NUEVO (guarda el ítem en la fila actual o en todas si aplica)
                RecalcularCantidadesNodoActual();
                return;
            }

            // Validar que el texto exista en el catálogo
            bool existe = _catalogoItemsFiltrado
                .Any(s => string.Equals(s, texto, StringComparison.CurrentCultureIgnoreCase));

            if (!existe)
            {
                MessageBox.Show(
                    this,
                    $"El valor \"{texto}\" no corresponde a ningún ítem del catálogo.\n\n" +
                    "Por favor selecciona un ítem de la lista.",
                    "SicoeCAD - Nodos",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning
                );

                combo.Text = string.Empty;
                combo.SelectionStart = 0;
                combo.SelectionLength = 0;
                combo.Focus();
                return;
            }

            // Valor válido → lo dejamos tal cual, mostrando el inicio
            combo.Text = texto;
            combo.SelectionStart = 0;
            combo.SelectionLength = 0;
        }
        private void CargarCombosDesdeNodoActual()
        {
            _actualizandoDesdeCodigo = true;
            try
            {
                var n = GetNodoActual();
                if (n == null)
                {
                    cmbExcav.Text = "";
                    cmbRellenoPerim.Text = "";
                    cmbEntibado.Text = "";
                    cmbNodo.Text = "";
                    cmbMamposteria.Text = "";
                    cmbPlacaFondo.Text = "";
                    cmbPasos.Text = "";
                    cmbCanjuela.Text = "";
                    return;
                }

                cmbExcav.Text = n.ItemExcav ?? "";
                cmbRellenoPerim.Text = n.ItemRellenoPerim ?? "";
                cmbEntibado.Text = n.ItemEntibado ?? "";
                cmbNodo.Text = n.ItemNodo ?? "";
                cmbMamposteria.Text = n.ItemMamposteria ?? "";
                cmbPlacaFondo.Text = n.ItemPlacaFondo ?? "";
                cmbPasos.Text = n.ItemPasos ?? "";
                cmbCanjuela.Text = n.ItemCanjuela ?? "";

                // Mostrar siempre el inicio del texto (consistente con tu UX actual)
                ResetComboCaretToStart(cmbExcav);
                ResetComboCaretToStart(cmbRellenoPerim);
                ResetComboCaretToStart(cmbEntibado);
                ResetComboCaretToStart(cmbNodo);
                ResetComboCaretToStart(cmbMamposteria);
                ResetComboCaretToStart(cmbPlacaFondo);
                ResetComboCaretToStart(cmbPasos);
                ResetComboCaretToStart(cmbCanjuela);
            }
            finally
            {
                _actualizandoDesdeCodigo = false;
            }
        }

        private void GuardarComboEnNodoActual(ComboBox combo)
        {
            if (_actualizandoDesdeCodigo) return;

            var n = GetNodoActual();
            if (n == null) return;

            string valor = combo.Text?.Trim() ?? "";

            // SIEMPRE guardar en el nodo actual
            if (ReferenceEquals(combo, cmbExcav)) n.ItemExcav = valor;
            else if (ReferenceEquals(combo, cmbRellenoPerim)) n.ItemRellenoPerim = valor;
            else if (ReferenceEquals(combo, cmbEntibado)) n.ItemEntibado = valor;
            else if (ReferenceEquals(combo, cmbNodo)) n.ItemNodo = valor;
            else if (ReferenceEquals(combo, cmbMamposteria)) n.ItemMamposteria = valor;
            else if (ReferenceEquals(combo, cmbPlacaFondo)) n.ItemPlacaFondo = valor;
            else if (ReferenceEquals(combo, cmbPasos)) n.ItemPasos = valor;
            else if (ReferenceEquals(combo, cmbCanjuela)) n.ItemCanjuela = valor;

            // SOLO replicar si checkbox está activado
            if (!chkAplicarTodosNodos.Checked)
                return; // SALIR - no copiar

            // Copiar a todos los demás
            foreach (var otros in Resultado)
            {
                if (ReferenceEquals(otros, n)) continue;

                if (ReferenceEquals(combo, cmbExcav)) otros.ItemExcav = valor;
                else if (ReferenceEquals(combo, cmbRellenoPerim)) otros.ItemRellenoPerim = valor;
                else if (ReferenceEquals(combo, cmbEntibado)) otros.ItemEntibado = valor;
                else if (ReferenceEquals(combo, cmbNodo)) otros.ItemNodo = valor;
                else if (ReferenceEquals(combo, cmbMamposteria)) otros.ItemMamposteria = valor;
                else if (ReferenceEquals(combo, cmbPlacaFondo)) otros.ItemPlacaFondo = valor;
                else if (ReferenceEquals(combo, cmbPasos)) otros.ItemPasos = valor;
                else if (ReferenceEquals(combo, cmbCanjuela)) otros.ItemCanjuela = valor;
            }
        }
        private void HookPersistenciaCombosPorNodo()
        {
            // Guardar inmediatamente cuando el usuario elige desde la lista
            cmbExcav.SelectionChangeCommitted += Combo_SelectionChangeCommitted;
            cmbRellenoPerim.SelectionChangeCommitted += Combo_SelectionChangeCommitted;
            cmbEntibado.SelectionChangeCommitted += Combo_SelectionChangeCommitted;
            cmbNodo.SelectionChangeCommitted += Combo_SelectionChangeCommitted;
            cmbMamposteria.SelectionChangeCommitted += Combo_SelectionChangeCommitted;
            cmbPlacaFondo.SelectionChangeCommitted += Combo_SelectionChangeCommitted;
            cmbPasos.SelectionChangeCommitted += Combo_SelectionChangeCommitted;
            cmbCanjuela.SelectionChangeCommitted += Combo_SelectionChangeCommitted;

            // Respaldo: si el usuario escribe o pega texto y sale del control
            cmbExcav.Validated += Combo_Validated;
            cmbRellenoPerim.Validated += Combo_Validated;
            cmbEntibado.Validated += Combo_Validated;
            cmbNodo.Validated += Combo_Validated;
            cmbMamposteria.Validated += Combo_Validated;
            cmbPlacaFondo.Validated += Combo_Validated;
            cmbPasos.Validated += Combo_Validated;
            cmbCanjuela.Validated += Combo_Validated;
        }
        private void Combo_SelectionChangeCommitted(object? sender, EventArgs e)
        {
            if (sender is not ComboBox combo) return;

            // 1) Guardar el valor en el nodo actual (o en todos si aplica)
            GuardarComboEnNodoActual(combo);
            AutoSyncCheckDesdeCombo(combo);

            // 2) Recalcular cantidades del nodo actual (para que refleje el item elegido)
            RecalcularCantidadesNodoActual();

            // 3) Opcional: si tu grilla muestra el item, refrescarla aquí
            _grid.Refresh();
        }
        private void Combo_Validated(object? sender, EventArgs e)
        {
            if (sender is not ComboBox combo) return;

            GuardarComboEnNodoActual(combo);
            AutoSyncCheckDesdeCombo(combo);
            RecalcularCantidadesNodoActual();
        }
        private void AutoSyncCheckDesdeCombo(ComboBox combo)
        {
            // Si estamos cargando valores desde código al cambiar de fila, NO disparar autosync.
            if (_actualizandoDesdeCodigo) return;

            CheckBox? chk = null;

            if (ReferenceEquals(combo, cmbExcav)) chk = chkExcav;
            else if (ReferenceEquals(combo, cmbRellenoPerim)) chk = chkRellenoPerim;
            else if (ReferenceEquals(combo, cmbEntibado)) chk = chkEntibado;
            else if (ReferenceEquals(combo, cmbNodo)) chk = chkNodo;
            else if (ReferenceEquals(combo, cmbMamposteria)) chk = chkMamposteria;
            else if (ReferenceEquals(combo, cmbPlacaFondo)) chk = chkPlacaFondo;
            else if (ReferenceEquals(combo, cmbPasos)) chk = chkPasos;
            else if (ReferenceEquals(combo, cmbCanjuela)) chk = chkCanjuela;

            if (chk == null) return;

            bool hayItem = !string.IsNullOrWhiteSpace(combo.Text);

            // Regla:
            // - Si hay ítem => activar check
            // - Si no hay ítem => desactivar check
            // IMPORTANTE: NO ponemos _actualizandoDesdeCodigo = true,
            // porque necesitamos que ChkCantidades_CheckedChanged actualice flags y aplique a todos si corresponde.
            if (hayItem && !chk.Checked) chk.Checked = true;
            else if (!hayItem && chk.Checked) chk.Checked = false;
        }
        private bool ValidarNoHayItemSinCheck()
        {
            // Si hay texto en un combo pero el check correspondiente está apagado,
            // eso es un error potencial (usuario olvidó activar el check).
            var errores = new List<string>();

            void check(string etiqueta, ComboBox combo, CheckBox chk)
            {
                if (!string.IsNullOrWhiteSpace(combo.Text) && !chk.Checked)
                    errores.Add($"• {etiqueta}: hay ítem seleccionado pero el check está desactivado.");
            }

            check("Excavación (m³)", cmbExcav, chkExcav);
            check("Relleno perimetral (m³)", cmbRellenoPerim, chkRellenoPerim);
            check("Entibado (m²)", cmbEntibado, chkEntibado);
            check("Caja/Cámara/Pozo (und)", cmbNodo, chkNodo);
            check("Mampostería", cmbMamposteria, chkMamposteria);
            check("Placa de fondo (und)", cmbPlacaFondo, chkPlacaFondo);
            check("Pasos (und)", cmbPasos, chkPasos);
            check("Cañuela (und)", cmbCanjuela, chkCanjuela);

            if (errores.Count == 0) return true;

            MessageBox.Show(this,
                "Hay ítems seleccionados sin el check activado.\n\n" +
                "Activa el check correspondiente para que el ítem se envíe a presupuesto.\n\n" +
                string.Join("\n", errores),
                "SicoeCAD - Validación de nodos",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);

            return false;
        }
    }
}