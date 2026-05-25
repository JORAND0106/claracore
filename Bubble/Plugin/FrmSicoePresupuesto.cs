using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;
using System.Windows.Forms;
using System.Threading.Tasks;
using static SicoePresupuestoNET8.FrmSicoePresupuesto;
using Autodesk.AutoCAD.ApplicationServices.Core;


// Aliases AutoCAD
using acApp = Autodesk.AutoCAD.ApplicationServices;
using acCol = Autodesk.AutoCAD.Colors;
using acDb = Autodesk.AutoCAD.DatabaseServices;
using acEd = Autodesk.AutoCAD.EditorInput;
using acGeo = Autodesk.AutoCAD.Geometry;

namespace SicoePresupuestoNET8
{
    public partial class FrmSicoePresupuesto : Form
    {
        // ====== filas del grid de acumulación ======
        private Autodesk.AutoCAD.DatabaseServices.ObjectId[] _lockedIds = null;
        private bool _lockSelection = false;
        private string _lockedTipo = ""; // “Área”, “Longitud”, “Nodo”, etc., el tipo vigente al bloquear
                                         // Estado UI
        private bool _suppressAutoDropDown = true;   // suprime auto-despliegue al iniciar
                                                     // Nombres asignados a cada nodo en la selección actual (por handle del ORIGINAL)
        private Dictionary<string, string> _nombresNodoSeleccion = new(StringComparer.OrdinalIgnoreCase);
        // Tramo de tubería persistente durante el ciclo de “+”

        // === Persistencia para “Tramo de tubería” durante un ciclo congelado ===
        private bool _preguntaTramoHecha = false; // controla que solo se pregunte una vez por selección
        private bool _modoTramoActivo = false;    // ya lo usas más abajo; si no existe, deja esta línea
        private readonly Dictionary<string, (string Ini, string Fin)> _mapTramosSel
            = new(StringComparer.OrdinalIgnoreCase); // mapea HANDLE del ORIGINAL -> (NodoIni,NodoFin)
        // Mapa de handle de NODO -> info de presupuesto (ítems y cantidades) definido en FrmNombrarNodos
        private Dictionary<string, FrmNombrarNodos.NodoJson> nodoInfoMap
            = new(StringComparer.OrdinalIgnoreCase);
        // Info de cantidades e ítems por tramo (clave = HANDLE del original)
        private readonly Dictionary<string, FrmNombrarTramo.TramoPresupuestoInfo> _tramoInfoPorHandle
            = new(StringComparer.OrdinalIgnoreCase);

        // Longitud vigente del tramo seleccionado en dibujo
        private double _longitudTramoActual = 0.0;

        // === Cache espacial simple para PK_ID ===
        private readonly Dictionary<(int gx, int gy), string> _pkGridCache = new();
        private static (int gx, int gy) GridKey(Autodesk.AutoCAD.Geometry.Point3d p, double cell)
            => ((int)Math.Floor(p.X / cell), (int)Math.Floor(p.Y / cell));

        // BUSCAR: cualquier región de campos privados del formulario
        // AÑADIR:
        private Dictionary<acDb.ObjectId, (string AbsIni, string AbsFin, string PkId)> _evalCache = null;
        private HashSet<acDb.ObjectId> _aceptadosSet = null;           // para borrar solo aceptados
        private bool _saltarseResumenEnCiclo = false;                   // no volver a mostrar conteo
        private FrmNombrarTramo? _frmNombrarTramo; // controla que solo haya una ventana abierta
        private FrmPkFixerDescartados? _frmPkFixerDescartados;
        private bool _reanudarAgritemTrasPk = false;
        private List<(acDb.ObjectId Id, string AbsIni, string AbsFin, string PkId)>? _aceptadasReanudar;
        private char _prefCalzReanudar;
        private bool _sincronizadoExitoso = false; // controla flujo Sync → Export
        private void ActualizarLabelsGrid()
        {
            if (lblContadorExp == null || lblCostoDirExp == null) return;
            double cantTotal = 0;
            double costo = 0;
            foreach (var r in _rows)
            {
                cantTotal += r.CantTotal;
                costo += r.CostoDirecto;
            }
            lblContadorExp.Text = $"Cant. Total: {cantTotal:N3}";
            lblCostoDirExp.Text = $"Costo Dir.: {costo:N0}";
        }

        private void cmbCapa_SelectedIndexChanged(object sender, EventArgs e)
        {
            txtNoInicio.Clear();
            txtNoFinal.Clear();
        }
        private void txtNoInicio_Enter(object sender, EventArgs e) => txtNoInicio.SelectAll();
        private void txtNoFinal_Enter(object sender, EventArgs e) => txtNoFinal.SelectAll();
        // (opcional)
        private void txtNoInicio_Click(object sender, EventArgs e) => txtNoInicio.SelectAll();
        private void txtNoFinal_Click(object sender, EventArgs e) => txtNoFinal.SelectAll();

        // === Abscisado / Eje ===
        private AxisContext? _axis = null;
        private bool _axisOk = false;

        private bool InDesignMode =>
            (Site?.DesignMode ?? false) ||
            LicenseManager.UsageMode == LicenseUsageMode.Designtime;

        // --- Soporte de filtro/realce en cmbItem ---
        private List<PresItem> _allItemsForCombo = new();   // fuente completa (capítulo+competencia)
        private List<PresItem> _filteredItems = new();      // vista filtrada
        private string _itemQuery = "";                     // lo que está escribiendo el usuario




        // ====== filas del grid de acumulación ======
        public sealed class GridRow
        {

            public string Capitulo { get; set; } = "";
            public string Competencia { get; set; } = "";
            public string PK_ID { get; set; } = "";
            public string AbsIni { get; set; } = "";
            public string AbsFin { get; set; } = "";
            public string Item { get; set; } = "";
            public string Descripcion { get; set; } = "";
            public string Und { get; set; } = "";
            public string Calzada { get; set; } = "";
            public string Tramo { get; set; } = "";
            public decimal VlrUnitario { get; set; }
            public string NoInicio { get; set; } = "";
            public string NoFinal { get; set; } = "";
            public double AreaLongNod { get; set; }
            public double Ancho { get; set; }
            public double Espesor { get; set; }
            public double CantTotal { get; set; }
            public double CostoDirecto { get; set; }
            public string TipoEjecucion { get; set; } = "";
            public string TipoEntidad { get; set; } = "";
            public string ID_Pol { get; set; } = "";
            public string Observacion { get; set; } = "";
            public string CapaSolo { get; set; } = ""; // ← para Excel
            // ... (lo que ya tienes)

            // NUEVO: claves para sincronizar y capas
            public string EntHandle { get; set; } = "";   // handle de la entidad clon
            public string TxtHandle { get; set; } = "";   // handle del DBText creado
            public string LayerEnt { get; set; } = "";    // capa real de la ENTIDAD
            public string LayerTxt { get; set; } = "";    // capa real del TEXTO
            public string ColorHex { get; set; } = "";    // #RRGGBB (opcional para recolorear capas)
            public string GUID { get; set; } = "";        // (reservado, no lo usamos ahora)
                                                          // NUEVO: Soporte externo vinculado
            public string Remitente { get; set; } = "";
            public string FechaSoporte { get; set; } = "";   // yyyy-MM-dd (para Excel)
            public string AsuntoSoporte { get; set; } = "";
            public string LinkSoporte { get; set; } = "";
            public double X_LABEL { get; set; } = 0.0;   // Este Coordenadas que enlazan la busqueda desde excel al dwg
            public double Y_LABEL { get; set; } = 0.0;   // Norte Coordenadas que enlazan la busqueda desde excel al dwg

            // Cotas de rasante y clave (tramos: Ini/Fin independientes; nodos: ambos = mismo valor)
            public double RasanteIni { get; set; } = 0.0;
            public double RasanteFin { get; set; } = 0.0;
            public double ClaveIni { get; set; } = 0.0;
            public double ClaveFin { get; set; } = 0.0;
            // GridRow: Solo agrega las 7 propiedades para TRANSPORTAR datos
            // NO hay lógica de control de cambios aquí
            // El C# solo llena las columnas iniciales:
            public string Control_Cambios { get; set; } = "Vigente";
            public DateTime Fecha_Creacion { get; set; } = DateTime.Now;
            public DateTime? Fecha_Modificacion { get; set; } = null;
            public DateTime? Fecha_Eliminacion { get; set; } = null;
            public string Comentario_Cambio { get; set; } = "";
            public int Version { get; set; } = 1;
            public string ID_Relacionado { get; set; } = "";

        }
        // ==== MODELO PARA EL CSV DE CAPAS ====
        private List<CapaInfo> _capasFull = new();
        private readonly BindingList<GridRow> _rows = new();

        private CadQueueWorker? _cadWorker;

        // Exponer el lector de capas al popup sin duplicar lógica
        public static List<CapaInfo> LeerCapasCsv_UI(string path) => CapasCsvReader.Read(path);


        // ====== estado ======
        public enum TipoEntidad { Area, Longitud, Nodo }
        private TipoEntidad _tipo = TipoEntidad.Area;
        // Para NODOS: define si se exige análisis detallado (abre FrmNombrarNodos)
        // true  => solo BLOQUES + abre FrmNombrarNodos
        // false => BLOQUES + POLILÍNEAS CERRADAS (conteo rápido 1 UND), NO abre FrmNombrarNodos
        private bool _nodoAnalisisDetallado = true;
        private bool _nodoAgruparPorPkId = false;
        private bool _aplicarPrefijo = false;
        private string _nodoPrefijo = "";
        private int _nodoPrefContadorActual = 1;
        private string _prefEtiquetaActual = "";   // etiqueta prefijo del nodo en proceso

        private System.Drawing.Color _uiColor = System.Drawing.Color.Empty; // sin color elegido
        private acCol.Color _acadColor = null;                              // se define al elegir color
        private bool _tieneColor = false;                                   // bandera de color elegido
        private bool _silencioCascada = false;
        // --- Filtro en cmbItem ---
        private List<PresItem> _itemsFull = new();   // catálogo filtrable para este capítulo/competencia
        private bool _isFiltering = false;           // guarda para no reentrar

        private string _hatchSeleccionado = "SOLID";
        private readonly List<acDb.ObjectId> _selIds = new();
        // --- Controla si quedó “pendiente” el ciclo de Agregar otro ítem ---
        private bool _cicloAgregarPendiente = false;                 // true = el usuario dijo “Sí” y no cerró aún
        private List<acDb.ObjectId> _ultimosOriginales = new();      // originales de la última corrida de "+"
                                                                     // Selecciona todo el texto cuando el control recibe el foco
        private void SelectAllOnEnter(object sender, EventArgs e)
        {
            if (sender is TextBoxBase tb && tb.Enabled && tb.Visible)
                tb.SelectAll();
        }
        // para el DataGridView embebido (lo creo en runtime dentro de GbItemPre)
        public FrmSicoePresupuesto()
        {
            InitializeComponent();
            FormClosed += (s, e) => { _cadWorker?.Stop(); _cadWorker = null; };
            Text = "Presupuesto de Obra. SICOE";

            // tipo de entidad
            rbArea.CheckedChanged += (s, e) => { if (rbArea.Checked) _tipo = TipoEntidad.Area; };
            rbLongitud.CheckedChanged += (s, e) => { if (rbLongitud.Checked) _tipo = TipoEntidad.Longitud; };
            rbNodo.CheckedChanged += (s, e) => { if (rbNodo.Checked) _tipo = TipoEntidad.Nodo; };

            // botones
            btnSeleccionEntidad.Click += btnSeleccionEntidad_Click;
            BtnAgritem.Click += BtnAgritem_Click;                 // "+"
            btnAgregar.Click += btnAgregar_Click;                 // Catálogo CSV
            btnBorrar.Click += btnBorrar_Click;
            btnEditar.Click += btnEditarCatalogo_Click;                  // toggle edición del grid
            btnCapasCsv.Click += btnCapasCsv_Click;             // --- CSV de CAPAS ---
            btnCargueEje.Click -= btnCargueEje_Click;  // evita doble suscripción
            btnCargueEje.Click += btnCargueEje_Click;
            btnayuda.Click += btnayuda_Click;
            btnbuscar.Click += btnbuscar_Click;
            // =================== XLSM (Plantilla) ===================
            btnXlsmExaminar.Click -= btnXlsmExaminar_Click;
            btnXlsmExaminar.Click += btnXlsmExaminar_Click;
            btnCrearXlsm.Click -= btnCrearXlsm_Click;
            btnCrearXlsm.Click += btnCrearXlsm_Click;
            HookSelectAll(txtNoInicio);
            HookSelectAll(txtNoFinal);
            HookSelectAll(txtAncho);
            HookSelectAll(txtEspesor);
            HookProperCase(txtNoInicio);
            HookProperCase(txtNoFinal);
            HookProperCase(txtObservacion);
            // --- Desactivar/ocultar Ayuda en el formulario de Presupuesto ---
            this.Load += (s, e) =>
            {
                var btn = this.Controls.Find("btnAyuda", true).FirstOrDefault() as Control;
                if (btn != null)
                {
                    btn.Visible = false;   // no se muestra
                    btn.Enabled = false;   // no es clickeable
                    btn.TabStop = false;   // no entra con TAB
                }
            };

            this.Shown += (_, __) =>
            {
                _suppressAutoDropDown = false;    // a partir de aquí, ya permitimos desplegar
                cmbItem.DroppedDown = false;      // por si quedaron abiertos
            };

            // === GRID: configurar y enlazar una sola vez ===
            ConfigurarGrid();                  // define columnas visibles
            dgvPrecargados.AutoGenerateColumns = false;
            dgvPrecargados.DataSource = _rows; // BindingList<GridRow>
            dgvPrecargados.CellDoubleClick += dgvPrecargados_CellDoubleClick;
            dgvPrecargados.ColumnHeaderMouseClick += DgvPrecargados_ColumnHeaderMouseClick;

            // cascada de combos
            cmbCapitulo.SelectedIndexChanged += (s, e) => { if (!_silencioCascada) CargarCompetencias(); };
            cmbCompetencia.SelectedIndexChanged += (s, e) => { if (!_silencioCascada) CargarItems(); };
            cmbItem.SelectedIndexChanged += (s, e) => { if (!_silencioCascada) ActualizarUnd(); };

            // combo Item: "código - descripción"
            cmbItem.FormattingEnabled = true;
            cmbItem.Format += (s, e) =>
            {
                if (e.ListItem is PresItem it)
                    e.Value = $"{it.Item} - {it.Descripcion}";
            };
            this.KeyPreview = true;
            this.KeyDown += Frm_KeyDown_Lic;

            BtnAgritem.Enabled = false;
            btnSyncExcel.Enabled = true;
            ActualizarLabelsGrid();
            btnCrearXlsm.Enabled = false;
            btnXlsmExaminar.Enabled = false;
            // Ocultar controles Excel — flujo exclusivo ClaraCore
            btnCrearXlsm.Visible = false;
            btnXlsmExaminar.Visible = false;
            txtXlsxRuta.Visible = false;

            txtNoInicio.Enter += SelectAllOnEnter;   // al llegar con TAB, selecciona todo
            txtNoFinal.Enter += SelectAllOnEnter;

            // (opcional) también si haces clic con el mouse
            txtNoInicio.Click += SelectAllOnEnter;
            txtNoFinal.Click += SelectAllOnEnter;

            // ==== FIX PINTADO INICIAL (evita "form en blanco hasta mover") ====
            this.DoubleBuffered = true;
            this.SetStyle(
                ControlStyles.AllPaintingInWmPaint |
                ControlStyles.OptimizedDoubleBuffer |
                ControlStyles.UserPaint |
                ControlStyles.ResizeRedraw, true);
            this.UpdateStyles();

            // Forzar primer render en cola UI (AutoCAD a veces no pinta hasta WM_MOVE)
            this.Shown += (s, e) =>
            {
                try
                {
                    this.BeginInvoke(new Action(() =>
                    {
                        this.Invalidate(true);
                        this.Update();
                        this.Refresh();
                    }));
                }
                catch { }
            };

        }
        private void FrmSicoePresupuesto_Load(object sender, EventArgs e)
        {

            try
            {


                // ----- CAD: solo si hay documento activo -----
                var docMgr = acApp.Application.DocumentManager;   // <- sin ?.
                var doc = docMgr.MdiActiveDocument;               // <- sin ?.
                if (doc != null)
                {
                    CargarHatchesDesdeDibujo();
                    TomarPreseleccion();
                }

                // Deja combos y estados consistentes (existan o no datos)
                CargarCapitulos();
            }
            catch (Exception ex)
            {
                // Ultimo salvavidas: no romper la UI
                MessageBox.Show(this,
                    "El formulario se abrió en modo seguro.\n\nDetalle:\n" + ex.Message,
                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }

            if (InDesignMode) return;  // <-- aquí sí

            // valores iniciales
            if (string.IsNullOrWhiteSpace(txtAltText.Text)) txtAltText.Text = "0.15";
            _tieneColor = false;
            BtnAgritem.Enabled = false;                  // ← “+” deshabilitado hasta elegir color
            if (string.IsNullOrWhiteSpace(txt_contador.Text))
                txt_contador.Text = LoadGlobalCounter().ToString();


            cmbCapitulo.SelectedIndex = -1;
            cmbCompetencia.SelectedIndex = -1;
            cmbItem.SelectedIndex = -1;
            cmbUnd.SelectedIndex = -1;
            btnEditar.Click += btnEditar_Click;

            // Si ya hay catálogo en sesión:
            if (Commands.CapasCatalog != null)
            {
                _capasFull = Commands.CapasCatalog;
            }
            else
            {
                // 1) Intentar desde AppData (Commands)
                // 2) Fallback: ruta guardada en el DWG (CapasStore)
                var last = Commands.LoadCapasPath();
                if (string.IsNullOrWhiteSpace(last) || !File.Exists(last))
                    last = CapasStore.LoadPathFromDwg() ?? "";

                if (!string.IsNullOrWhiteSpace(last) && File.Exists(last))
                {
                    try
                    {
                        _capasFull = CapasCsvReader.Read(last);
                        Commands.SetCapas(_capasFull);
                    }
                    catch (IOException ioex)
                    {
                        MessageBox.Show(this,
                            "No se pudo leer el CSV de capas porque está abierto en otra aplicación.\n\n" +
                            $"Ruta:\n{last}\n\nDetalle: {ioex.Message}\n\n" +
                            "Cierra el archivo (Excel) o elige otro CSV desde el botón 'Capas CSV'.",
                            "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show(this,
                            "No se pudo leer el CSV de capas.\n\n" + ex.Message,
                            "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    }
                }
            }


            // catálogo (si ya existe)
            // === Catálogo de precios: intenta abrir rápido ===
            // 1) Si hay caché JSON -> usarla.
            // 2) Si no hay caché, intenta reabrir el último CSV usado.
            // 3) Si nada, continúa vacío y el usuario cargará con "Agregar".
            if (Commands.Catalogo == null || Commands.Catalogo.Count == 0)
            {
                var cache = Commands.LoadCatalogoCacheOrNull();
                if (cache != null && cache.Count > 0)
                {
                    Commands.SetCatalogo(cache);
                }
                else
                {
                    var last = Commands.LoadCatalogoPath();
                    if (!string.IsNullOrWhiteSpace(last) && File.Exists(last))
                    {
                        try
                        {
                            var (itemsAuto, _, _) = LeerCatalogoCsv(last);
                            if (itemsAuto != null && itemsAuto.Count > 0)
                                Commands.SetCatalogo(itemsAuto);
                        }
                        catch { /* tolerante, seguimos sin catálogo */ }
                    }
                }
            }
            CargarCapitulos(); // deja combos consistentes (con o sin datos)

            // listado de hatch "seguro"
            CargarHatchesDesdeDibujo();

            // tomar preselección (lo azul) y resaltar
            TomarPreseleccion();


            // Difere el resto para cuando el form ya está cargado
            this.Load -= FrmSicoePresupuesto_Load;
            this.Load += FrmSicoePresupuesto_Load;                            // <<< NUEVO
            // 1) Intentar recuperar el eje guardado dentro del DWG
            if (!_axisOk)
            {
                var ctx = AxisStore.LoadFromDwg();
                if (ctx != null)
                {
                    _axis = ctx;
                    _axisOk = true;
                    // opcional: sincronizar con la memoria de sesión
                    Commands.SetActiveAxis(_axis);
                }
            }
        }
        private void dgvPrecargados_CellDoubleClick(object sender, DataGridViewCellEventArgs e)
        {
            var row = GetSelectedGridRow();        // ← usa tu helper
            if (row == null) return;

            using (var frm = new EditarRegistroForm(row))   // o (sel, this)
            {
                if (frm.ShowDialog(this) == DialogResult.OK)
                    dgvPrecargados.Refresh();
            }
        }

        private void btnEditar_Click(object? sender, EventArgs e)
        {
            var row = GetSelectedGridRow();        // ← usa tu helper
            if (row == null)
            {
                MessageBox.Show("Selecciona una fila para editar.", "SICOE",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            using (var frm = new EditarRegistroForm(row)) // o (sel, this)
            {
                if (frm.ShowDialog(this) == DialogResult.OK)
                    dgvPrecargados.Refresh();
            }
        }

        /// <summary>
        private GridRow? GetSelectedGridRow()
        {
            if (dgvPrecargados?.CurrentRow?.DataBoundItem is GridRow gr)
                return gr;
            return null;
        }
        // =================== CATALOGO ===================
        private void CargarCapitulos()
        {
            _silencioCascada = true;
            try
            {
                var caps = (Commands.Catalogo ?? new List<PresItem>())
                           .Select(x => x.Capitulo)
                           .Where(s => !string.IsNullOrWhiteSpace(s))
                           .Distinct()
                           .OrderBy(s => s)
                           .ToList();

                using (new ComboUpdateScope(cmbCapitulo))
                {
                    var keep = cmbCapitulo.SelectedItem as string; // intenta conservar selección
                    cmbCapitulo.DataSource = null;
                    cmbCapitulo.Items.Clear();
                    cmbCapitulo.DataSource = caps;

                    if (!string.IsNullOrEmpty(keep))
                    {
                        int idx = caps.FindIndex(x => string.Equals(x, keep, StringComparison.OrdinalIgnoreCase));
                        cmbCapitulo.SelectedIndex = idx;
                    }
                    else
                    {
                        cmbCapitulo.SelectedIndex = -1;
                    }
                }

                // carga siguiente nivel sin disparar eventos visuales
                CargarCompetencias();
            }
            finally { _silencioCascada = false; }
        }


        private void CargarCompetencias()
        {
            _silencioCascada = true;
            try
            {
                string cap = cmbCapitulo.SelectedItem as string ?? "";
                var comps = (Commands.Catalogo ?? new List<PresItem>())
                            .Where(x => x.Capitulo == cap)
                            .Select(x => x.Competencia)
                            .Where(s => !string.IsNullOrWhiteSpace(s))
                            .Distinct()
                            .OrderBy(s => s)
                            .ToList();

                using (new ComboUpdateScope(cmbCompetencia))
                {
                    var keep = cmbCompetencia.SelectedItem as string;
                    cmbCompetencia.DataSource = null;
                    cmbCompetencia.Items.Clear();
                    cmbCompetencia.DataSource = comps;

                    if (!string.IsNullOrEmpty(keep))
                    {
                        int idx = comps.FindIndex(x => string.Equals(x, keep, StringComparison.OrdinalIgnoreCase));
                        cmbCompetencia.SelectedIndex = idx;
                    }
                    else
                    {
                        cmbCompetencia.SelectedIndex = -1;
                    }
                }

                CargarItems();
            }
            finally { _silencioCascada = false; }
        }


        private void CargarItems()
        {
            string cap = cmbCapitulo.SelectedItem as string ?? "";
            string comp = cmbCompetencia.SelectedItem as string ?? "";

            // guardamos el universo completo para ESTE capítulo/competencia
            _itemsFull = (Commands.Catalogo ?? new List<PresItem>())
                         .Where(x => x.Capitulo == cap && x.Competencia == comp)
                         .OrderBy(x => x.Item)
                         .ToList();

            // mostrarlos sin filtro inicial
            ApplyItemFilter("");

            // formateo visual "código - descripción"
            cmbItem.FormattingEnabled = true;
            cmbItem.Format -= CmbItem_Format;  // evitar duplicado
            cmbItem.Format += CmbItem_Format;

            // sin selección hasta que el usuario elija/escriba
            cmbItem.SelectedIndex = -1;

            ActualizarUnd();
        }

        private void CmbItem_Format(object? sender, ListControlConvertEventArgs e)
        {
            if (e.ListItem is PresItem it)
                e.Value = $"{it.Item} - {it.Descripcion}";
        }

        // Aplica filtro "contiene" (en Item o Descripcion). Nunca fuerza SelectedIndex=0 si no hay elementos.
        private void ApplyItemFilter(string term)
        {
            try
            {
                _isFiltering = true;

                string typed = term ?? string.Empty;  // <-- lo que el usuario escribió

                IEnumerable<PresItem> source = _itemsFull;
                if (!string.IsNullOrWhiteSpace(typed))
                {
                    string t = typed.Trim();
                    source = _itemsFull.Where(it =>
                        (!string.IsNullOrEmpty(it.Item) && it.Item.IndexOf(t, StringComparison.OrdinalIgnoreCase) >= 0) ||
                        (!string.IsNullOrEmpty(it.Descripcion) && it.Descripcion.IndexOf(t, StringComparison.OrdinalIgnoreCase) >= 0)
                    );
                }

                var list = source.Take(300).ToList();

                // Cambiar la lista SIN perder lo que se está escribiendo
                cmbItem.BeginUpdate();
                cmbItem.DataSource = null;
                cmbItem.Items.Clear();
                cmbItem.DisplayMember = nameof(PresItem.Descripcion); // el Format pinta "código - descripción"
                cmbItem.ValueMember = nameof(PresItem.Item);
                cmbItem.DataSource = list;
                cmbItem.EndUpdate();

                // Nada seleccionado mientras escribe
                cmbItem.SelectedIndex = -1;

                // Después (evita abrir durante carga y solo abre si el usuario está en el combo):
                cmbItem.DroppedDown = !_suppressAutoDropDown && cmbItem.Focused && list.Count > 0;

                // --- RESTAURAR TEXTO Y CARET (lo que faltaba) ---
                cmbItem.Text = typed;
                cmbItem.SelectionStart = typed.Length;
                cmbItem.SelectionLength = 0;
            }
            finally
            {
                _isFiltering = false;
            }
        }


        private void ActualizarUnd()
        {
            if (cmbItem.SelectedItem is PresItem it)
            {
                cmbUnd.DataSource = new List<string> { it.Und ?? "" };
                cmbUnd.SelectedIndex = 0;
            }
            else
            {
                cmbUnd.DataSource = new List<string>();
                cmbUnd.SelectedIndex = -1;
            }
        }

        private void CargarHatchesDesdeDibujo()
        {
            var defaults = new[]
            {
                "SOLID","ANSI31","ANSI32","ANSI33","ANSI34","ANSI35","ANSI36","ANSI37",
                "DOTS","EARTH","GRAVEL","SAND","BRICK","NET","AR-CONC","AR-SACH","AR-RSHKE"
            };

        }

        // =================== VALIDACIÓN PREVIA ===================

        private bool ValidarFormularioParaSeleccion()
        {
            var faltantes = new List<string>();

            if (!rbArea.Checked && !rbLongitud.Checked && !rbNodo.Checked) faltantes.Add("Tipo de Entidad (Área o Longitud o Nodo");
            if (cmbCapitulo.SelectedIndex < 0) faltantes.Add("Capítulo");
            if (cmbCompetencia.SelectedIndex < 0) faltantes.Add("Competencia");
            if (cmbItem.SelectedIndex < 0) faltantes.Add("Ítem");
            if (cmbUnd.SelectedIndex < 0) faltantes.Add("Und");
            if (string.IsNullOrWhiteSpace(txtAltText.Text)) faltantes.Add("Alt. Text");
            if (string.IsNullOrWhiteSpace(txtAncho.Text)) faltantes.Add("Ancho");
            if (string.IsNullOrWhiteSpace(txtEspesor.Text)) faltantes.Add("Espesor");
            if (string.IsNullOrWhiteSpace(txtNoInicio.Text)) faltantes.Add("No. Inicio");
            if (string.IsNullOrWhiteSpace(txtNoFinal.Text)) faltantes.Add("No. Final");
            if (!rbEjecObra.Checked && !rbEjecPresupuesto.Checked)
                faltantes.Add("Tipo de Ejecución (Obra ejecutada o Presupuesto de Obra");

            if (!rbEjecObra.Checked && !rbEjecPresupuesto.Checked)
                faltantes.Add("Tipo de Ejecución (Obra ejecutada o Presupuesto de Obra");

            // === CORRECCIÓN AQUÍ ===
            // Validar si existen ejes cargados en el sistema (archivo JSON)
            string jsonPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "SicoeCAD", "axes_v2.json");
            bool ejesCargados = false;

            if (File.Exists(jsonPath))
            {
                try
                {
                    string json = File.ReadAllText(jsonPath);
                    var lista = JsonConvert.DeserializeObject<List<AxisContext>>(json);
                    if (lista != null && lista.Count > 0) ejesCargados = true;
                }
                catch { }
            }

            if (!ejesCargados)
            {
                MessageBox.Show(this,
                    "Debe cargar al menos un eje (botón 'CargueEje') antes de continuar.",
                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return false;
            }
            // =======================

            if (faltantes.Count > 0)


                if (faltantes.Count > 0)
            {
                ;
                MessageBox.Show(this,
                    "Completa los siguientes campos:\n• " + string.Join("\n• ", faltantes),
                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return false;
            }

            // Alt. Text debe ser > 0 (esto sí conviene mantenerlo positivo)
            if (!TryParseDouble(txtAltText.Text, out var alt) || alt <= 0)
            {
                MessageBox.Show(this, "Alt. Text debe ser un número mayor que cero.",
                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return false;
            }

            // Ancho y Espesor: permitir números negativos (descuentos) pero NO 0
            if (!TryParseDouble(txtAncho.Text, out var ancho) || Math.Abs(ancho) < double.Epsilon)
            {
                MessageBox.Show(this, "Ancho debe ser un número distinto de cero (se permiten negativos).",
                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return false;
            }
            if (!TryParseDouble(txtEspesor.Text, out var esp) || Math.Abs(esp) < double.Epsilon)
            {
                MessageBox.Show(this, "Espesor debe ser un número distinto de cero (se permiten negativos).",
                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return false;
            }

            if (_tipo == TipoEntidad.Area)
            {

            }
            return true;

        }
        private static bool TryParsePkMeters(string? s, out double meters)
        {
            meters = double.NaN;
            if (string.IsNullOrWhiteSpace(s)) return false;

            string t = s.Trim().ToUpperInvariant();
            // Remueve prefijos comunes
            if (t.StartsWith("PK ")) t = t.Substring(3).Trim();
            if (t.StartsWith("PK")) t = t.Substring(2).Trim();

            // Signo
            int sign = 1;
            if (t.StartsWith("-"))
            {
                sign = -1;
                t = t.Substring(1).Trim();
            }

            // Normaliza separadores
            t = t.Replace(" ", "");
            // Formatos esperados: "10+500", "0+050", "10500"
            int plus = t.IndexOf('+');
            long total;
            if (plus >= 0)
            {
                string km = t.Substring(0, plus);
                string m = t.Substring(plus + 1);
                if (string.IsNullOrWhiteSpace(km)) km = "0";
                if (string.IsNullOrWhiteSpace(m)) m = "0";
                if (!long.TryParse(km, out var kmv)) return false;
                if (!long.TryParse(m, out var mv)) return false;
                // Seguridad: 3 dígitos para metros
                if (mv < 0 || mv >= 1000) return false;
                total = kmv * 1000L + mv;
            }
            else
            {
                // Sólo números continuos
                if (!long.TryParse(t, out total)) return false;
            }

            meters = sign * (double)total;
            return true;
        }
        private DataGridViewColumn? _lastSortCol = null;
        private bool _lastSortAsc = true;

        private void DgvPrecargados_ColumnHeaderMouseClick(object? sender, DataGridViewCellMouseEventArgs e)
        {
            var grid = dgvPrecargados;
            if (e.ColumnIndex < 0) return;

            var col = grid.Columns[e.ColumnIndex];
            string prop = (col.DataPropertyName ?? "").Trim();

            // Solo AbsIni / AbsFin
            if (!string.Equals(prop, "AbsIni", StringComparison.OrdinalIgnoreCase) &&
                !string.Equals(prop, "AbsFin", StringComparison.OrdinalIgnoreCase))
                return;

            bool asc = true;
            if (_lastSortCol == col) asc = !_lastSortAsc;   // toggle
            _lastSortCol = col;
            _lastSortAsc = asc;

            // Copia ordenable
            var list = _rows.ToList();

            int cmp(GridRow a, GridRow b)
            {
                string sa = prop == "AbsIni" ? a.AbsIni : a.AbsFin;
                string sb = prop == "AbsIni" ? b.AbsIni : b.AbsFin;

                bool pa = TryParsePkMeters(sa, out double ma);
                bool pb = TryParsePkMeters(sb, out double mb);

                if (pa && pb)
                    return ma.CompareTo(mb);
                if (pa && !pb) return -1; // válidos primero
                if (!pa && pb) return 1;
                // fallback: string
                return string.Compare(sa ?? "", sb ?? "", StringComparison.OrdinalIgnoreCase);
            }

            list.Sort((a, b) => asc ? cmp(a, b) : cmp(b, a));

            // Reemplaza el contenido de la BindingList sin perder el DataSource
            _rows.RaiseListChangedEvents = false;
            try
            {
                _rows.Clear();
                foreach (var r in list) _rows.Add(r);
            }
            finally
            {
                _rows.RaiseListChangedEvents = true;
                _rows.ResetBindings();
            }

            // Actualiza glifos
            foreach (DataGridViewColumn c in grid.Columns) c.HeaderCell.SortGlyphDirection = SortOrder.None;
            col.HeaderCell.SortGlyphDirection = asc ? SortOrder.Ascending : SortOrder.Descending;
        }

        // =================== SELECCIÓN EN DIBUJO ===================

        private void btnSeleccionEntidad_Click(object sender, EventArgs e)
        {
            // === NUEVO: consulta si esta entidad tiene soporte externo (nube/correo) ===
            var ask = MessageBox.Show(this,
                "¿Esta información proviene de soporte externo (correo/nube)?",
                "SICOE", MessageBoxButtons.YesNo, MessageBoxIcon.Question);

            if (ask == DialogResult.Yes)
            {
                var hist = LoadSupportHistory();

                using (var frm = new FrmSoporteEntidad(hist))
                {
                    var r = frm.ShowDialog(this);
                    if (r == DialogResult.OK && frm.SelectedSupport != null)
                    {
                        _supportPending = frm.SelectedSupport;
                        SaveSupportHistory(hist);
                    }
                    else
                    {
                        _supportPending = null;
                    }
                }
            }
            else
            {
                _supportPending = null;
            }

            // Bloqueo de selección
            if (_lockSelection && _lockedIds != null && _lockedIds.Length > 0)
            {
                MessageBox.Show(this,
                    "La selección está congelada porque elegiste agregar más ítems sobre la misma entidad.\n" +
                    "Termina el ciclo (responde 'No' cuando se te pregunte) para liberar la selección.",
                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Information);

                var edFreeze = acApp.Application.DocumentManager.MdiActiveDocument?.Editor;
                try { edFreeze.SetImpliedSelection(_lockedIds); } catch { }
                return;
            }
            // =========================
            // NODO: preguntar si requiere análisis detallado
            // =========================
            if (_tipo == TipoEntidad.Nodo)
            {
                var q = MessageBox.Show(
                    this,
                    "¿Estos nodos requieren análisis detallado por separado?\n(Sí: pozos/cámaras/cajas; No: canecas/bolardos/tachas/hitos)",
                    "SICOE",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question);

                _nodoAnalisisDetallado = (q == DialogResult.Yes);
                _nodoAgruparPorPkId = false;

                // Popup de prefijo (solo nodo rápido, completamente opcional)
                if (!_nodoAnalisisDetallado)
                {
                    var qAgrup = MessageBox.Show(
                        this,
                        "¿Desea agrupar las entidades seleccionadas por PK_ID?\n\n" +
                        "Sí: crea un bloque por PK y una fila con la cantidad total (ej. 500 tachas).\n" +
                        "No: mantiene una fila por cada entidad individual.",
                        "SICOE",
                        MessageBoxButtons.YesNo,
                        MessageBoxIcon.Question);

                    _nodoAgruparPorPkId = (qAgrup == DialogResult.Yes);

                    _aplicarPrefijo = false; // reset por si viene de ciclo anterior
                    if (!_nodoAgruparPorPkId)
                    {
                        using var frmPref = new FrmPrefijosNodo();
                        frmPref.ShowDialog(this);
                        _aplicarPrefijo = frmPref.Aplicar;
                        _nodoPrefijo = frmPref.Prefijo;
                        _nodoPrefContadorActual = frmPref.ContadorInicial;
                    }
                }
            }

            try
            {
                BtnAgritem.Enabled = false;

                if (!ValidarFormularioParaSeleccion()) return;

                // === CARGAR LISTA DE EJES (validación rápida) ===
                string jsonPath = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                    "SicoeCAD", "axes_v2.json");

                List<AxisContext> listaEjes = null;

                if (File.Exists(jsonPath))
                {
                    try
                    {
                        listaEjes = JsonConvert.DeserializeObject<List<AxisContext>>(File.ReadAllText(jsonPath));
                    }
                    catch { }
                }

                if (listaEjes == null || listaEjes.Count == 0)
                {
                    MessageBox.Show(this,
                        "Debe cargar al menos un eje (botón 'CargueEje') antes de continuar.",
                        "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }

                var ed = acApp.Application.DocumentManager.MdiActiveDocument.Editor;
                var db = acApp.Application.DocumentManager.MdiActiveDocument.Database;

                var pso = new acEd.PromptSelectionOptions
                {
                    MessageForAdding = "\nSeleccione entidades (ventana/arrastre) y ENTER...",
                    AllowSubSelections = true,
                    SingleOnly = false,
                    RejectObjectsFromNonCurrentSpace = true
                };

                if (_selIds.Count > 0) Resaltar(_selIds, false);
                _selIds.Clear();

                bool estabaVisible = this.Visible;
                this.Hide();
                acApp.Application.MainWindow.Focus();

                var res = ed.GetSelection(pso);

                if (!this.IsDisposed && estabaVisible)
                {
                    this.Show();
                    this.Activate();
                }

                if (res.Status != acEd.PromptStatus.OK || res.Value == null) return;

                int cClosedPl = 0, cPolys = 0, cLines = 0, cP3d = 0, cPts = 0, cBlocks = 0, cCir = 0, cEll = 0, descartadas = 0;

                using (var tr = db.TransactionManager.StartTransaction())
                {
                    foreach (var id in res.Value.GetObjectIds())
                    {
                        var obj = tr.GetObject(id, acDb.OpenMode.ForRead, false, true);
                        bool ok = false;

                        switch (_tipo)
                        {
                            case TipoEntidad.Area:
                                if (obj is acDb.Polyline pl && pl.Closed) { ok = true; cClosedPl++; }
                                else if (obj is acDb.Circle) { ok = true; cCir++; }
                                else if (obj is acDb.Ellipse el && el.Closed) { ok = true; cEll++; }
                                else if (obj is acDb.BlockReference) { ok = true; cBlocks++; }
                                else { descartadas++; }
                                break;

                            case TipoEntidad.Longitud:
                                if (obj is acDb.Polyline) ok = true;
                                else if (obj is acDb.Line) ok = true;
                                else if (obj is acDb.Polyline3d) ok = true;
                                else if (obj is acDb.BlockReference) { ok = true; cBlocks++; }
                                else descartadas++;
                                if (ok && obj is acDb.Polyline) cPolys++;
                                if (ok && obj is acDb.Line) cLines++;
                                if (ok && obj is acDb.Polyline3d) cP3d++;
                                break;

                            case TipoEntidad.Nodo:
                                if (_nodoAnalisisDetallado)
                                {
                                    // Detallado: SOLO BLOQUES (tal como pediste)
                                    if (obj is acDb.BlockReference) { ok = true; cBlocks++; }
                                    else descartadas++;
                                }
                                else
                                {
                                    // Rápido: BLOQUES + POLILÍNEAS CERRADAS (se contarán como 1 UND)
                                    if (obj is acDb.BlockReference) { ok = true; cBlocks++; }
                                    else if (obj is acDb.Polyline plN && plN.Closed) { ok = true; cClosedPl++; }
                                    else descartadas++;
                                }
                                break;

                        }

                        if (ok) _selIds.Add(id);
                    }
                    tr.Commit();
                }

                if (_selIds.Count == 0)
                {
                    MessageBox.Show(this,
                        "No se seleccionó ninguna entidad válida para el tipo elegido.",
                        "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                _preguntaTramoHecha = false;
                _modoTramoActivo = false;
                _mapTramosSel.Clear();

                Resaltar(_selIds, true);

                string resumen = _tipo switch
                {
                    TipoEntidad.Area => $"Polilíneas cerradas: {cClosedPl}\nCírculos: {cCir}\nEllipses: {cEll}\nBloques: {cBlocks}\nDescartadas: {descartadas}",
                    TipoEntidad.Longitud => $"Polilíneas: {cPolys}\nLíneas: {cLines}\nPolilíneas 3D: {cP3d}\nBloques: {cBlocks}\nDescartadas: {descartadas}",
                    TipoEntidad.Nodo => _nodoAnalisisDetallado
                        ? $"Bloques: {cBlocks}\nDescartadas: {descartadas}"
                        : $"Polilíneas cerradas: {cClosedPl}\nBloques: {cBlocks}\nDescartadas: {descartadas}",
                    _ => ""
                };

                MessageBox.Show(this,
                    $"Total seleccionadas: {res.Value.Count}\n{resumen}",
                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Information);

                // ==== NUEVO PASO: gestor de selección ====
                AxisContext? axisCtx = AxisRepository.LoadFirstAxis();

                using (var frmGestor = new FrmGestorSeleccionEntidades(_selIds, _tipo, axisCtx, _nodoAnalisisDetallado))

                {
                    var dlg = frmGestor.ShowDialog(this);

                    if (dlg != DialogResult.OK)
                    {
                        Resaltar(_selIds, false);
                        _selIds.Clear();
                        BtnAgritem.Enabled = false;
                        return;
                    }

                    // ===============================
                    // OK: traer selección final del gestor (UNA SOLA VEZ)
                    // ===============================
                    Resaltar(_selIds, false);

                    _selIds.Clear();
                    _selIds.AddRange(frmGestor.SelectedIds);

                    if (_selIds.Count == 0)
                    {
                        BtnAgritem.Enabled = false;
                        MessageBox.Show(this,
                            "No hay entidades válidas para procesar.",
                            "SICOE",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Warning);
                        return;
                    }

                    Resaltar(_selIds, true);
                    BtnAgritem.Enabled = true;

                }

            }
            catch (Exception ex)
            {
                MessageBox.Show(this,
                    "Error al seleccionar: " + ex.Message,
                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }


        // Muestreo a lo largo de la entidad
        private static IEnumerable<Autodesk.AutoCAD.Geometry.Point3d> SamplePoints(
            Autodesk.AutoCAD.DatabaseServices.Entity ent, int max = 7)
        {
            max = Math.Max(3, Math.Min(9, max | 1));
            if (ent is Autodesk.AutoCAD.DatabaseServices.Curve c)
            {
                List<Autodesk.AutoCAD.Geometry.Point3d> pts = null;
                try
                {
                    double L = c.GetDistanceAtParameter(c.EndParam) - c.GetDistanceAtParameter(c.StartParam);
                    if (L > 0)
                    {
                        pts = new List<Autodesk.AutoCAD.Geometry.Point3d>();
                        for (int i = 1; i <= max; i++)
                        {
                            double d = L * (i / (double)(max + 1));
                            pts.Add(c.GetPointAtDist(d));
                        }
                    }
                }
                catch { /* tolerante */ }

                if (pts != null)
                {
                    foreach (var p in pts) yield return p;
                    yield break;
                }
            }

            if (ent is Autodesk.AutoCAD.DatabaseServices.BlockReference br) { yield return br.Position; yield break; }
            if (ent is Autodesk.AutoCAD.DatabaseServices.DBPoint pt) { yield return pt.Position; yield break; }
            var ge = ent.GeometricExtents;
            yield return new Autodesk.AutoCAD.Geometry.Point3d(
                (ge.MinPoint.X + ge.MaxPoint.X) * 0.5,
                (ge.MinPoint.Y + ge.MaxPoint.Y) * 0.5, 0);
        }

        // =================== BOTÓN “+” ===================

        // === BOTÓN "+" ===
        // Duplica selección, rotula cada clon, reasigna capas y agrega UNA FILA POR ENTIDAD al grid.
        // === BOTÓN "+" ===
        // Duplica selección, rotula cada clon, reasigna capas y agrega UNA FILA POR ENTIDAD al grid.
        // Si respondes "No" al final, borra los clones para limpiar el dibujo.
        // === BOTÓN "+" ================================================
        // Duplica la selección, rotula cada clon (prefijo + contador),
        // pasa cada ENTIDAD como fila al grid, apaga las capas nuevas
        // y pregunta si deseas agregar otro ítem. Si respondes NO,
        // elimina las entidades ORIGINALES (los clones quedan).
        private void BtnAgritem_Click(object? sender, EventArgs e)
        {
            try
            {
                int contador = 0;   // ← variable visible en TODO el método

                // 1) Validación y selección previa
                if (!ValidarFormularioParaSeleccion()) return;

                // justo después de ValidarFormularioParaSeleccion()
                PkStore.RebuildPkRegionIndex();   // opcional, acelera las búsquedas

                // Forzar estado de tipo de entidad (por si algo cambió)
                _tipo = rbArea.Checked ? TipoEntidad.Area :
                        rbLongitud.Checked ? TipoEntidad.Longitud :
                        TipoEntidad.Nodo;

                if (PkStore.DebugDumpPkRegions(out var _names) == 0)
                {
                    MessageBox.Show(this, "No hay regiones PK en ModelSpace. Importe o cree PK_ID.", "SICOE");
                    return;
                }

                // Si hay selección congelada, respeta el tipo previamente fijado
                if (_lockSelection && !string.IsNullOrEmpty(_lockedTipo))
                {
                    // Ajusta los radios para que el usuario vea el tipo bloqueado
                    rbArea.Checked = string.Equals(_lockedTipo, "Área", StringComparison.OrdinalIgnoreCase);
                    rbLongitud.Checked = string.Equals(_lockedTipo, "Longitud", StringComparison.OrdinalIgnoreCase);
                    rbNodo.Checked = string.Equals(_lockedTipo, "Nodo", StringComparison.OrdinalIgnoreCase);

                    // Reasigna _tipo acorde a los radios fijados
                    _tipo = rbArea.Checked ? TipoEntidad.Area :
                            rbLongitud.Checked ? TipoEntidad.Longitud :
                            TipoEntidad.Nodo;
                }

                if (_selIds == null || _selIds.Count == 0)
                {
                    MessageBox.Show(this, "Primero selecciona entidades (botón Sel. dibujo).",
                                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
                // ==========================================================
                // 1. Filtrar entidades montadas exactamente (duplicadas por BBox)
                //    NOTA: Esto puede reducir el conteo vs. el Gestor.
                // ==========================================================

                // Guardar la selección TAL CUAL viene del Gestor (trazabilidad real)
                var idsOriginales = _selIds.ToList();

                var docSel = acApp.Application.DocumentManager.MdiActiveDocument;
                var dbSel = docSel.Database;

                var filtrados = new List<acDb.ObjectId>();
                var firmas = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                // Separar causas (NO mezclar todo en “eliminadas”)
                var dupBbox = new List<acDb.ObjectId>();          // <- duplicadas exactas reales
                var invalidasONoEntidad = new List<acDb.ObjectId>(); // <- ids inválidos o no Entity
                var sinExtents = new List<acDb.ObjectId>();       // <- pasan (no se filtran), pero se reportan

                using (var trMx = dbSel.TransactionManager.StartTransaction())
                {
                    foreach (var id in _selIds)
                    {
                        if (!id.IsValid || id.IsNull)
                        {
                            invalidasONoEntidad.Add(id);
                            continue;
                        }

                        if (trMx.GetObject(id, acDb.OpenMode.ForRead, false, true) is not acDb.Entity ent)
                        {
                            invalidasONoEntidad.Add(id);
                            continue;
                        }

                        acDb.Extents3d ext;
                        try
                        {
                            ext = ent.GeometricExtents;
                        }
                        catch
                        {
                            // Si no tiene extents, NO la filtres: la dejamos pasar
                            sinExtents.Add(id);
                            filtrados.Add(id);
                            continue;
                        }

                        var min = ext.MinPoint;
                        var max = ext.MaxPoint;

                        // Firma geométrica: tipo + bounding box (4 coords)
                        string firma = string.Format(
                            "{0}|{1:0.0000}|{2:0.0000}|{3:0.0000}|{4:0.0000}",
                            ent.GetType().FullName,
                            min.X, min.Y, max.X, max.Y
                        );

                        // Solo agregamos la PRIMERA entidad con esa firma
                        if (firmas.Add(firma))
                        {
                            filtrados.Add(id);
                        }
                        else
                        {
                            // Esta SÍ es duplicada exacta por bbox
                            dupBbox.Add(id);
                        }
                    }
                    trMx.Commit();
                }

                // === Reporte corto (opcional) ===
                if (dupBbox.Count > 0 || invalidasONoEntidad.Count > 0 || sinExtents.Count > 0)
                {
                    // Handles solo de las duplicadas exactas (las que interesan realmente)
                    var handlesDup = new List<string>();
                    using (var trR = dbSel.TransactionManager.StartTransaction())
                    {
                        foreach (var id in dupBbox.Take(25))
                        {
                            try
                            {
                                if (id.IsValid && !id.IsNull &&
                                    trR.GetObject(id, acDb.OpenMode.ForRead, false, true) is acDb.Entity entR)
                                    handlesDup.Add(entR.Handle.ToString());
                                else
                                    handlesDup.Add("(inválida)");
                            }
                            catch { handlesDup.Add("(error)"); }
                        }
                        trR.Commit();
                    }

                    MessageBox.Show(this,
                        "Aviso de depuración adicional en AgrItem:\n\n" +
                        $"- Recibidas desde Gestor: {idsOriginales.Count}\n" +
                        $"- Duplicadas exactas (filtro BBox): {dupBbox.Count}\n" +
                        $"- Sin extents (se conservan): {sinExtents.Count}\n" +
                        $"- Inválidas / no entidad: {invalidasONoEntidad.Count}\n" +
                        $"- Quedan para PK/Abs: {filtrados.Count}\n\n" +
                        (dupBbox.Count > 0
                            ? $"Handles duplicadas BBox (muestra máx. 25):\n{string.Join(", ", handlesDup)}"
                            : ""),
                        "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }

                // === NUEVO: borrar del dibujo SOLO las duplicadas exactas por bbox (si el usuario quiere) ===
                if (dupBbox.Count > 0)
                {
                    var askBorrar = MessageBox.Show(this,
                        "Se detectaron duplicadas exactas (BBox) que fueron descartadas del cálculo.\n\n" +
                        $"Duplicadas exactas: {dupBbox.Count}\n\n" +
                        "¿Deseas BORRARLAS del dibujo para que no se vuelvan a seleccionar/calcular por error?\n\n" +
                        "Sí = Borrar duplicadas exactas\nNo = Conservarlas en el dibujo",
                        "SICOE", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);

                    if (askBorrar == DialogResult.Yes)
                    {
                        // Borrar SOLO las duplicadas reales (no tocar inválidas/no-entidad)
                        var listaBorrarDup = dupBbox
                            .Where(x => x.IsValid && !x.IsNull)
                            .Distinct()
                            .ToList();

                        if (listaBorrarDup.Count > 0)
                        {
                            // Si tu BorrarOriginales ya hace LockDocument internamente, no necesitas este lock.
                            // Si NO lo hace, esto ayuda a evitar problemas de acceso concurrente.
                            using (docSel.LockDocument())
                            {
                                BorrarOriginales(listaBorrarDup);
                            }
                        }
                    }
                }

                // Reescribir _selIds con el resultado filtrado
                _selIds.Clear();
                _selIds.AddRange(filtrados);

                if (_selIds.Count == 0)
                {
                    MessageBox.Show(this,
                        "Todas las entidades seleccionadas estaban duplicadas (montadas exactamente) y fueron descartadas del cálculo.",
                        "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                // Guardar para un posible cierre “forzado” al exportar Excel
                _ultimosOriginales = idsOriginales.ToList();


                // 2) Datos del formulario (SOLO para Área/Longitud o como fallback; para Nodo se usarán los del form de nodos)
                if (cmbItem.SelectedItem is not PresItem itCat)
                {
                    MessageBox.Show(this, "El Ítem seleccionado no es válido.", "SICOE",
                                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }

                // Color desde el catálogo (ColorHex). Si falla, usa negro.
                if (!TryParseHexColor(itCat.ColorHex, out var uiCol, out var acadCol))
                {
                    uiCol = System.Drawing.Color.Black;
                    acadCol = acCol.Color.FromRgb(0, 0, 0);
                }

                // Ajusta estado interno de color (por si algo lo usa en el flujo)
                _uiColor = uiCol;
                _acadColor = acadCol;
                _tieneColor = true;

                string capitulo = cmbCapitulo.SelectedItem?.ToString() ?? "";
                string competencia = cmbCompetencia.SelectedItem?.ToString() ?? "";
                TramoReportService.SetCapituloCompetencia(capitulo, competencia);

                string itemCodForm = itCat.Item ?? "";          // Ítem del combo principal (solo sirve para Área/Longitud)
                string descForm = itCat.Descripcion ?? "";
                string undForm = itCat.Und ?? "";
                decimal vlrUnitForm = itCat.ValorUnitario;

                string noIniForm = (txtNoInicio.Text ?? "").Trim().ToUpperInvariant();
                string noFinForm = (txtNoFinal.Text ?? "").Trim().ToUpperInvariant();
                string observ = ToSentenceCase(txtObservacion.Text ?? "");

                double alt = ParseOrZero(txtAltText.Text);
                if (alt <= 0) alt = 0.15;
                double anchoForm = ParseOrZero(txtAncho.Text);
                double espesorForm = ParseOrZero(txtEspesor.Text);

                string tipoEjec = rbEjecObra.Checked ? "Obra Ejecutada" : "Presupuesto de Obra";
                string tipoEnt = _tipo == TipoEntidad.Area ? "Área" :
                                    _tipo == TipoEntidad.Longitud ? "Longitud" : "Nodo";

                // Intentar cargar el eje desde el JSON v2 si aún no está en memoria
                if (_axis == null || !_axisOk)
                {
                    var eje = AxisRepository.LoadFirstAxis();

                    if (eje != null && !eje.AxisA.IsNull)
                    {
                        _axis = eje;
                        _axisOk = true;
                    }
                    else
                    {
                        MessageBox.Show(this,
                            "Debe cargar el eje (CargueEje) antes de continuar.",
                            "SICOE",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Warning);
                        return;
                    }
                }

                // 3) Calzada preferida
                char prefCalz = AskCalzadaPreferida(_axis);

                // 4) Evaluamos cada entidad seleccionada -> AbsIni/AbsFin y PK
                var db = acApp.Application.DocumentManager.MdiActiveDocument.Database;
                var aceptadas = new List<(acDb.ObjectId Id, string AbsIni, string AbsFin, string PkId)>();
                _saltarseResumenEnCiclo = false;
                var idsDescartadas = new List<acDb.ObjectId>();

                if (_reanudarAgritemTrasPk && _aceptadasReanudar != null)
                {
                    _reanudarAgritemTrasPk = false;
                    aceptadas.AddRange(_aceptadasReanudar);
                    _aceptadasReanudar = null;
                    prefCalz = _prefCalzReanudar;
                    _saltarseResumenEnCiclo = true;
                }
                else if (_lockSelection && _cicloAgregarPendiente && _evalCache != null)
                {
                    foreach (var id in _selIds)
                        if (_evalCache.TryGetValue(id, out var info))
                            aceptadas.Add((id, info.AbsIni, info.AbsFin, info.PkId));
                }
                else
                {
                    using (var tr = db.TransactionManager.StartTransaction())
                    {
                        foreach (var id in _selIds)
                        {
                            if (tr.GetObject(id, acDb.OpenMode.ForRead, false, true) is not acDb.Entity ent)
                            {
                                idsDescartadas.Add(id);
                                continue;
                            }

                            if (!EntidadCoincideConTipo(ent, _tipo))
                            {
                                // IMPORTANTE: antes lo “tragaba” y por eso te daba 0/0
                                idsDescartadas.Add(id);
                                continue;
                            }


                            // PK por punto medio *robusto* (muestra varios puntos dentro de la entidad)
                            string pkThis = GetPkRobusto(ent, tr);
                            if (string.IsNullOrWhiteSpace(pkThis))
                            {
                                idsDescartadas.Add(id);
                                continue;
                            }

                            if (string.IsNullOrWhiteSpace(pkThis))
                            {
                                idsDescartadas.Add(id);
                                continue;
                            }

                            // Abs con validación; resolver eje/sector más cercano a la entidad
                            var axisEnt = AxisRepository.ResolveAxisForEntity(ent) ?? _axis!;
                            string ai = "", af = "";
                            if (TryComputeAbsIniFin(ent, axisEnt, prefCalz, out var aiOk, out var afOk, out var dentro) && dentro)
                            {
                                ai = aiOk; af = afOk;
                            }
                            else
                            {
                                try
                                {
                                    if (tr.GetObject(axisEnt.AxisA, acDb.OpenMode.ForRead) is acDb.Curve eje)
                                    {
                                        var p0 = CentroDeSeguro(ent);
                                        var p1 = p0;
                                        switch (ent)
                                        {
                                            case acDb.Line ln: p1 = ln.EndPoint; break;
                                            case acDb.Polyline pl: p1 = pl.StartPoint; break;
                                            case acDb.Polyline3d p3:
                                                foreach (acDb.ObjectId vId in p3)
                                                    if (tr.GetObject(vId, acDb.OpenMode.ForRead) is acDb.PolylineVertex3d vx)
                                                    { p1 = new acGeo.Point3d(vx.Position.X, vx.Position.Y, 0); break; }
                                                break;
                                            case acDb.DBPoint pt: p1 = pt.Position; break;
                                            case acDb.BlockReference br: p1 = br.Position; break;
                                        }
                                        double pk0 = axisEnt.Pk0DistA;
                                        double absBase = axisEnt.AbsInicioA;
                                        double d0 = eje.GetDistanceAtParameter(eje.GetParameterAtPoint(eje.GetClosestPointTo(p0, false))) - pk0 + absBase;
                                        double d1 = eje.GetDistanceAtParameter(eje.GetParameterAtPoint(eje.GetClosestPointTo(p1, false))) - pk0 + absBase;
                                        ai = PkFormatter.ToPkString(Math.Min(d0, d1));
                                        af = PkFormatter.ToPkString(Math.Max(d0, d1));
                                    }
                                }
                                catch { }
                            }

                            aceptadas.Add((id, ai, af, pkThis));
                        }
                        tr.Commit();
                    }
                }

                if (_evalCache == null) _evalCache = new();
                if (_aceptadosSet == null) _aceptadosSet = new HashSet<acDb.ObjectId>();
                foreach (var a in aceptadas) _evalCache[a.Id] = (a.AbsIni, a.AbsFin, a.PkId);

                // Resumen de vinculadas / descartadas
                if (!_saltarseResumenEnCiclo)
                {
                    int descartadas = idsDescartadas.Count;
                    MessageBox.Show(this,
                        $"{aceptadas.Count} Entidades vinculadas\n{descartadas} Entidades descartadas.",
                        "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Information);

                    if (descartadas > 0)
                    {
                        var askPk = MessageBox.Show(this,
                            "¿Desea asignar el PK-ID de manera manual a las descartadas?",
                            "SICOE", MessageBoxButtons.YesNo, MessageBoxIcon.Question);

                        if (askPk == DialogResult.Yes)
                        {
                            // ===== NUEVO: Revisar cache de PK antes de mostrar formulario =====
                            var idsConPkCache = new List<acDb.ObjectId>();
                            var idsSinPkCache = new List<acDb.ObjectId>();

                            foreach (var id in idsDescartadas)
                            {
                                if (_evalCache != null && _evalCache.TryGetValue(id, out var cachedInfo))
                                {
                                    if (!string.IsNullOrWhiteSpace(cachedInfo.PkId))
                                    {
                                        idsConPkCache.Add(id);
                                        aceptadas.Add((id, cachedInfo.AbsIni, cachedInfo.AbsFin, cachedInfo.PkId));
                                    }
                                    else
                                    {
                                        idsSinPkCache.Add(id);
                                    }
                                }
                                else
                                {
                                    idsSinPkCache.Add(id);
                                }
                            }

                            if (idsConPkCache.Count > 0)
                            {
                                MessageBox.Show(this,
                                    $"Se recuperaron {idsConPkCache.Count} PK-ID asignados previamente.\n" +
                                    $"Solo se pedirán los {idsSinPkCache.Count} restantes.",
                                    "SICOE - PK Cache",
                                    MessageBoxButtons.OK,
                                    MessageBoxIcon.Information);
                            }

                            if (idsSinPkCache.Count > 0)
                            {
                                var sugerencias = GetAllPkIds();
                                var listaRows = new List<FrmPkFixerDescartados.RowPk>();

                                using (var tr2 = db.TransactionManager.StartTransaction())
                                {
                                    foreach (var id in idsSinPkCache)
                                    {
                                        if (tr2.GetObject(id, acDb.OpenMode.ForRead, false, true) is not acDb.Entity ent2)
                                            continue;

                                        var axisEnt2 = AxisRepository.ResolveAxisForEntity(ent2) ?? _axis!;
                                        string ai = "", af = "";
                                        if (TryComputeAbsIniFin(ent2, axisEnt2, prefCalz, out var aiOk, out var afOk, out var dentro) && dentro)
                                        {
                                            ai = aiOk;
                                            af = afOk;
                                        }
                                        else
                                        {
                                            try
                                            {
                                                if (tr2.GetObject(axisEnt2.AxisA, acDb.OpenMode.ForRead) is acDb.Curve eje)
                                                {
                                                    var p0 = CentroDeSeguro(ent2);
                                                    var p1 = p0;
                                                    switch (ent2)
                                                    {
                                                        case acDb.Line ln: p1 = ln.EndPoint; break;
                                                        case acDb.Polyline pl: p1 = pl.StartPoint; break;
                                                        case acDb.Polyline3d p3:
                                                            foreach (acDb.ObjectId vId in p3)
                                                                if (tr2.GetObject(vId, acDb.OpenMode.ForRead) is acDb.PolylineVertex3d vx)
                                                                { p1 = new acGeo.Point3d(vx.Position.X, vx.Position.Y, 0); break; }
                                                            break;
                                                        case acDb.DBPoint pt: p1 = pt.Position; break;
                                                        case acDb.BlockReference br: p1 = br.Position; break;
                                                    }
                                                    double pk0 = axisEnt2.Pk0DistA;
                                                    double absBase = axisEnt2.AbsInicioA;
                                                    double d0 = eje.GetDistanceAtParameter(eje.GetParameterAtPoint(eje.GetClosestPointTo(p0, false))) - pk0 + absBase;
                                                    double d1 = eje.GetDistanceAtParameter(eje.GetParameterAtPoint(eje.GetClosestPointTo(p1, false))) - pk0 + absBase;
                                                    ai = PkFormatter.ToPkString(Math.Min(d0, d1));
                                                    af = PkFormatter.ToPkString(Math.Max(d0, d1));
                                                }
                                            }
                                            catch { }
                                        }

                                        double dim = 0.0;
                                        try
                                        {
                                            var dimRaw = MedidaDe(ent2);
                                            dim = (_tipo == TipoEntidad.Area)
                                                ? AreaM2ParaUndCatalogo(dimRaw, undForm)
                                                : Math.Round(dimRaw, 2, MidpointRounding.AwayFromZero);
                                        }
                                        catch { }

                                        string handle = "";
                                        try { handle = ent2.Handle.ToString(); } catch { }

                                        listaRows.Add(new FrmPkFixerDescartados.RowPk
                                        {
                                            Id = id,
                                            Handle = handle,
                                            AbsIni = ai,
                                            AbsFin = af,
                                            Calzada = prefCalz.ToString(),
                                            Dimension = dim,
                                            PkId = ""
                                        });
                                    }
                                    tr2.Commit();
                                }

                                var aceptadasSnapshot = aceptadas.ToList();

                                if (_frmPkFixerDescartados != null && !_frmPkFixerDescartados.IsDisposed)
                                {
                                    _frmPkFixerDescartados.Activate();
                                    return;
                                }

                                var frmFix = new FrmPkFixerDescartados(listaRows, sugerencias);
                                _frmPkFixerDescartados = frmFix;
                                var prefCalzPk = prefCalz;

                                frmFix.FormClosed += (_, __) =>
                                {
                                    try
                                    {
                                        if (frmFix.DialogResult == DialogResult.OK)
                                        {
                                            var merged = new List<(acDb.ObjectId Id, string AbsIni, string AbsFin, string PkId)>(aceptadasSnapshot);
                                            foreach (var row in frmFix.Resultado)
                                            {
                                                if (row.Id.IsNull) continue;
                                                string pkManualFila = row.PkId?.Trim() ?? "";
                                                if (string.IsNullOrWhiteSpace(pkManualFila)) continue;
                                                merged.Add((row.Id, row.AbsIni ?? "", row.AbsFin ?? "", pkManualFila));
                                            }

                                            if (_evalCache == null) _evalCache = new();
                                            foreach (var a in merged)
                                                _evalCache[a.Id] = (a.AbsIni, a.AbsFin, a.PkId);

                                            _aceptadosSet = new HashSet<acDb.ObjectId>(merged.Select(a => a.Id));
                                            _aceptadasReanudar = merged;
                                            _prefCalzReanudar = prefCalzPk;
                                            _reanudarAgritemTrasPk = true;
                                            _saltarseResumenEnCiclo = true;

                                            BtnAgritem_Click(null, EventArgs.Empty);
                                        }
                                    }
                                    finally
                                    {
                                        frmFix.Dispose();
                                        if (ReferenceEquals(_frmPkFixerDescartados, frmFix))
                                            _frmPkFixerDescartados = null;
                                    }
                                };

                                acApp.Application.ShowModelessDialog(frmFix);
                                return;
                            }

                            foreach (var a in aceptadas)
                                _evalCache[a.Id] = (a.AbsIni, a.AbsFin, a.PkId);

                            _aceptadosSet = new HashSet<acDb.ObjectId>(aceptadas.Select(a => a.Id));

                            idsDescartadas.Clear();
                            descartadas = 0;
                        }
                    }
                    _saltarseResumenEnCiclo = true;
                }

                // === TRAMO DE TUBERÍA PARA TIPO Longitud: preguntar una sola vez por selección ===
                if (_tipo == TipoEntidad.Longitud)
                {
                    if (!_preguntaTramoHecha)
                    {
                        var ask = MessageBox.Show(this,
                            "¿Esta longitud es para un tramo de tubería?",
                            "SICOE", MessageBoxButtons.YesNo, MessageBoxIcon.Question);

                        _modoTramoActivo = (ask == DialogResult.Yes);
                        _preguntaTramoHecha = true;

                        if (_modoTramoActivo)
                        {
                            var dbTmp = Autodesk.AutoCAD.ApplicationServices.Application
                                        .DocumentManager.MdiActiveDocument.Database;

                            var filasTramo = new List<FrmNombrarTramo.TramoRow>();
                            using (var trTmp = dbTmp.TransactionManager.StartTransaction())
                            {
                                foreach (var a in aceptadas)
                                {
                                    var obj = trTmp.GetObject(a.Id,
                                        Autodesk.AutoCAD.DatabaseServices.OpenMode.ForRead,
                                        false, true);

                                    var h = (obj as Autodesk.AutoCAD.DatabaseServices.Entity)
                                                ?.Handle.ToString() ?? "";

                                    Autodesk.AutoCAD.Geometry.Point3d pIni = Autodesk.AutoCAD.Geometry.Point3d.Origin;
                                    Autodesk.AutoCAD.Geometry.Point3d pFin = Autodesk.AutoCAD.Geometry.Point3d.Origin;

                                    if (obj is Autodesk.AutoCAD.DatabaseServices.Line ln)
                                    {
                                        pIni = ln.StartPoint;
                                        pFin = ln.EndPoint;
                                    }
                                    else if (obj is Autodesk.AutoCAD.DatabaseServices.Polyline pl)
                                    {
                                        if (pl.NumberOfVertices > 0)
                                        {
                                            pIni = pl.GetPoint3dAt(0);
                                            pFin = pl.GetPoint3dAt(pl.NumberOfVertices - 1);
                                        }
                                    }
                                    else if (obj is Autodesk.AutoCAD.DatabaseServices.Polyline3d pl3)
                                    {
                                        Autodesk.AutoCAD.Geometry.Point3d? pFirst = null;
                                        Autodesk.AutoCAD.Geometry.Point3d? pLast = null;
                                        foreach (Autodesk.AutoCAD.DatabaseServices.ObjectId vId in pl3)
                                        {
                                            if (trTmp.GetObject(vId,
                                                Autodesk.AutoCAD.DatabaseServices.OpenMode.ForRead)
                                                is Autodesk.AutoCAD.DatabaseServices.PolylineVertex3d vx)
                                            {
                                                var p = vx.Position;
                                                var p2d = new Autodesk.AutoCAD.Geometry.Point3d(p.X, p.Y, 0);
                                                if (pFirst == null) pFirst = p2d;
                                                pLast = p2d;
                                            }
                                        }
                                        if (pFirst.HasValue && pLast.HasValue)
                                        {
                                            pIni = pFirst.Value;
                                            pFin = pLast.Value;
                                        }
                                    }

                                    filasTramo.Add(new FrmNombrarTramo.TramoRow
                                    {
                                        Handle = h,
                                        AbsIni = a.AbsIni,
                                        AbsFin = a.AbsFin,
                                        NodoIni = "",
                                        NodoFin = "",
                                        NorteIni = pIni.Y,
                                        EsteIni = pIni.X,
                                        NorteFin = pFin.Y,
                                        EsteFin = pFin.X
                                    });
                                }
                                trTmp.Commit();
                            }

                            if (_frmNombrarTramo != null && !_frmNombrarTramo.IsDisposed)
                            {
                                _frmNombrarTramo.Activate();
                                return;
                            }

                            var frmT = new FrmNombrarTramo(filasTramo);
                            _frmNombrarTramo = frmT;

                            // ===== NUEVO: Pasar capítulo actual para cargar nodos disponibles =====
                            frmT.SetCapitulo(capitulo);

                            var listaCatalogoTramo = new List<string>();

                            if (cmbItem.DataSource is System.Collections.IEnumerable enumerableDsT)
                            {
                                foreach (var obj in enumerableDsT)
                                {
                                    if (obj is PresItem pi)
                                    {
                                        string linea = $"{pi.Item} - {pi.Descripcion} ({pi.Und})";
                                        if (!string.IsNullOrWhiteSpace(linea))
                                            listaCatalogoTramo.Add(linea);
                                    }
                                }
                            }
                            else
                            {
                                foreach (var obj in cmbItem.Items)
                                {
                                    if (obj is PresItem pi)
                                    {
                                        string linea = $"{pi.Item} - {pi.Descripcion} ({pi.Und})";
                                        if (!string.IsNullOrWhiteSpace(linea))
                                            listaCatalogoTramo.Add(linea);
                                    }
                                    else if (obj != null)
                                    {
                                        var linea = obj.ToString();
                                        if (!string.IsNullOrWhiteSpace(linea))
                                            listaCatalogoTramo.Add(linea);
                                    }
                                }
                            }

                            listaCatalogoTramo = listaCatalogoTramo
                                .Distinct(StringComparer.OrdinalIgnoreCase)
                                .OrderBy(s => s)
                                .ToList();

                            frmT.CargarCatalogoItems(listaCatalogoTramo);

                            frmT.FormClosed += (s, args) =>
                            {
                                try
                                {
                                    _mapTramosSel.Clear();
                                    foreach (var r in frmT.Resultado)
                                    {
                                        var ni = (r.NodoIni ?? "").Trim().ToUpperInvariant();
                                        var nf = (r.NodoFin ?? "").Trim().ToUpperInvariant();

                                        if (!string.IsNullOrWhiteSpace(r.Handle))
                                            _mapTramosSel[r.Handle] = (ni, nf);
                                    }

                                    _tramoInfoPorHandle.Clear();
                                    foreach (var info in frmT.BuildPresupuestoInfo())
                                    {
                                        if (string.IsNullOrWhiteSpace(info.Handle))
                                            continue;

                                        _tramoInfoPorHandle[info.Handle] = info;
                                    }
                                }
                                finally
                                {
                                    frmT.Dispose();
                                    _frmNombrarTramo = null;
                                }
                            };

                            acApp.Application.ShowModelessDialog(frmT);
                            return;
                        }
                    }
                }

                if (aceptadas.Count == 0)
                {
                    MessageBox.Show(this, "No hay entidades válidas para procesar.", "SICOE",
                                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }

                // 5) Duplicamos SOLO las aceptadas
                var doc3 = acApp.Application.DocumentManager.MdiActiveDocument;
                var db3 = doc3.Database;

                using (doc3.LockDocument())
                {
                    bool nodosAgrupadosProcesados = false;

                    // === SOLO NODO: levantar FrmNombrarNodos UNA sola vez ===
                    if(_tipo == TipoEntidad.Nodo && _nodoAnalisisDetallado && (nodoInfoMap == null || nodoInfoMap.Count == 0))
                    {
                        var dbTmp = db3;
                        List<FrmNombrarNodos.NodoRow> filas = new List<FrmNombrarNodos.NodoRow>();

                        using (var trTmp = dbTmp.TransactionManager.StartTransaction())
                        {
                            foreach (var a in aceptadas)
                            {
                                var entNodo = trTmp.GetObject(a.Id, acDb.OpenMode.ForRead, false, true) as acDb.Entity;
                                var h = entNodo?.Handle.ToString() ?? "";

                                _nombresNodoSeleccion.TryGetValue(h, out var nombrePrevio);

                                double areaPerimetral = 0.0;
                                double norte = 0.0;
                                double este = 0.0;

                                if (entNodo != null)
                                {
                                    try
                                    {
                                        var ext = entNodo.GeometricExtents;

                                        double xMin = ext.MinPoint.X;
                                        double xMax = ext.MaxPoint.X;
                                        double yMin = ext.MinPoint.Y;
                                        double yMax = ext.MinPoint.Y;

                                        este = (xMin + xMax) / 2.0;
                                        norte = (yMin + yMax) / 2.0;

                                        areaPerimetral = CalcularAreaNodoExacta(entNodo, trTmp);
                                        if (areaPerimetral <= 0.0)
                                        {
                                            double anchoBBox = Math.Abs(xMax - xMin);
                                            double largoBBox = Math.Abs(yMax - yMin);
                                            areaPerimetral = anchoBBox * largoBBox;
                                        }
                                    }
                                    catch
                                    {
                                        areaPerimetral = 0.0;
                                        norte = 0.0;
                                        este = 0.0;
                                    }
                                }

                                filas.Add(new FrmNombrarNodos.NodoRow
                                {
                                    Handle = h,
                                    AbsIni = a.AbsIni,
                                    AbsFin = a.AbsFin,
                                    Nombre = nombrePrevio ?? "",
                                    Norte = norte,
                                    Este = este
                                });
                            }

                            trTmp.Commit();
                        }

                        var listaCatalogoNodo = new List<string>();

                        if (cmbItem.DataSource is System.Collections.IEnumerable enumerableDs)
                        {
                            foreach (var obj in enumerableDs)
                            {
                                if (obj is PresItem pi)
                                {
                                    string linea = $"{pi.Item} - {pi.Descripcion} ({pi.Und})";
                                    if (!string.IsNullOrWhiteSpace(linea))
                                        listaCatalogoNodo.Add(linea);
                                }
                            }
                        }
                        else
                        {
                            foreach (var obj in cmbItem.Items)
                            {
                                if (obj is PresItem pi)
                                {
                                    string linea = $"{pi.Item} - {pi.Descripcion} ({pi.Und})";
                                    if (!string.IsNullOrWhiteSpace(linea))
                                        listaCatalogoNodo.Add(linea);
                                }
                                else if (obj != null)
                                {
                                    var linea = obj.ToString();
                                    if (!string.IsNullOrWhiteSpace(linea))
                                        listaCatalogoNodo.Add(linea);
                                }
                            }
                        }

                        listaCatalogoNodo = listaCatalogoNodo
                            .Distinct(StringComparer.OrdinalIgnoreCase)
                            .OrderBy(s => s)
                            .ToList();

                        // Crear formulario MODELESS
                        var frmN = new FrmNombrarNodos(filas);
                        frmN.CargarCatalogoItems(listaCatalogoNodo);
                        // ===== NUEVO: Pasar capítulo actual para guardar en memoria =====
                        frmN.SetCapitulo(capitulo);

                        // Capturar variables locales que se necesitarán en el callback
                        var localCap5 = PrefijoCap5();
                        var localComp5 = PrefijoCom5();
                        var localLayerEntBase = $"{localCap5}_{localComp5}_";
                        var localLayerTxtBase = $"txt_{localCap5}_{localComp5}_";
                        var localApagarCapas = true;

                        // Suscribirse al evento ANTES de mostrar el formulario
                        frmN.EnviarAPresupuesto += (listaNodoInfo) =>
                        {
                            try
                            {
                                // Procesar los datos cuando el usuario haga clic en "Enviar a presupuesto"
                                _nombresNodoSeleccion.Clear();
                                foreach (var r in frmN.Resultado)
                                {
                                    _nombresNodoSeleccion[r.Handle] =
                                        r.Nombre?.Trim().ToUpperInvariant() ?? "";
                                }

                                nodoInfoMap = listaNodoInfo
                                    .Where(n => !string.IsNullOrWhiteSpace(n.Handle))
                                    .ToDictionary(n => n.Handle, n => n, StringComparer.OrdinalIgnoreCase);

                                // Cerrar el formulario después de procesar
                                frmN.Close();

                                // IMPORTANTE: Continuar con el resto del código original
                                // (el código que estaba DESPUÉS de la línea 1911)
                                // TODO: Necesitas copiar aquí el código que sigue después del using
                            }
                            catch (Exception ex)
                            {
                                MessageBox.Show(this,
                                    $"Error al procesar nodos:\n{ex.Message}",
                                    "SicoeCAD - Error",
                                    MessageBoxButtons.OK,
                                    MessageBoxIcon.Error);
                            }
                        };

                        // Mostrar formulario MODELESS
                        Autodesk.AutoCAD.ApplicationServices.Application.ShowModelessDialog(frmN);

                        // IMPORTANTE: Como es modeless, el código NO debe continuar aquí
                        // Todo debe estar dentro del callback del evento EnviarAPresupuesto
                        // Por eso necesito que me muestres qué código viene DESPUÉS de la línea 1911
                        return; // Salir para evitar que el código continúe
                    }

                    // 6) Capas base (prefijos). Aquí NO se usa el ítem temporal para NODOS.
                    string cap5 = PrefijoCap5();
                    string comp5 = PrefijoCom5();
                    string layerEntBase = $"{cap5}_{comp5}_";
                    string layerTxtBase = $"txt_{cap5}_{comp5}_";

                    bool apagarCapas = true;

                    // Para Área/Longitud se asegura al menos la capa del ítem del formulario
                    string layerEntDefault = layerEntBase + itemCodForm;
                    string layerTxtDefault = layerTxtBase + itemCodForm;
                    if (layerEntDefault.Length > 255) layerEntDefault = layerEntDefault.Substring(0, 255);
                    if (layerTxtDefault.Length > 255) layerTxtDefault = layerTxtDefault.Substring(0, 255);
                    AsegurarCapa(layerEntDefault, _acadColor, apagarCapas);
                    AsegurarCapa(layerTxtDefault, _acadColor, apagarCapas);

                    // 7) Contador global persistente
                    if (!int.TryParse((txt_contador.Text ?? "").Trim(), out contador) || contador <= 0)
                        contador = LoadGlobalCounter();

                    // === NODO RÁPIDO AGRUPADO POR PK_ID ===
                    if (_tipo == TipoEntidad.Nodo && !_nodoAnalisisDetallado && _nodoAgruparPorPkId && !_cicloAgregarPendiente)
                    {
                        int regs = ProcesarNodosAgrupadosPorPk(
                            db3, aceptadas,
                            capitulo, competencia, itemCodForm, descForm, undForm, vlrUnitForm,
                            noIniForm, noFinForm, observ, alt, anchoForm, espesorForm,
                            tipoEjec, layerEntBase, layerTxtBase, itCat.ColorHex ?? "",
                            ref contador);

                        nodosAgrupadosProcesados = true;

                        SaveGlobalCounter(contador);
                        txt_contador.Text = contador.ToString();
                        ActualizarLabelsGrid();

                        MessageBox.Show(this,
                            $"Se agruparon {aceptadas.Count} entidad(es) en {regs} registro(s) por PK_ID.",
                            "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    }
                    else
                    {
                    var pares = DeepCloneWithMap(db3, aceptadas.Select(a => a.Id));
                    if (pares.Count == 0)
                    {
                        MessageBox.Show(this, "No se pudieron duplicar las entidades.", "SICOE",
                                        MessageBoxButtons.OK, MessageBoxIcon.Warning);
                        return;
                    }

                    // 8) Coloca texto y arma UNA FILA POR CLON
                    using (var tr = db3.TransactionManager.StartTransaction())
                    {
                        var btr = (acDb.BlockTableRecord)tr.GetObject(db3.CurrentSpaceId, acDb.OpenMode.ForWrite);

                        for (int i = 0; i < pares.Count; i++)
                        {
                            var idClon = pares[i].Clone;
                            if (tr.GetObject(idClon, acDb.OpenMode.ForWrite, false, true) is not acDb.Entity entClon)
                                continue;

                            // Capa inicial del clon (solo válida para Área/Longitud)
                            string layerEntActual = layerEntDefault;
                            string layerTxtActual = layerTxtDefault;

                            if (_tipo != TipoEntidad.Nodo || (_tipo == TipoEntidad.Nodo && !_nodoAnalisisDetallado))
                            {
                                // Área/Longitud y también Nodo rápido (para que quede bien clasificado)
                                entClon.Layer = layerEntActual;
                            }


                            // Centro geométrico del clon
                            var pos = CentroDeSeguro(entClon);

                            acDb.DBText? dbt = null;
                            string etiqueta = "";

                            // ======================================================
                            // FIX: Cuando es NODO y estamos en ciclo "Agregar más ítems"
                            // también debemos generar etiqueta (ID_POL) y texto.
                            // ======================================================
                            if (_tipo == TipoEntidad.Nodo && _cicloAgregarPendiente)
                            {
                                // Capas específicas para el ítem actual del formulario
                                string layerEntNodoCiclo = layerEntBase + itemCodForm;
                                string layerTxtNodoCiclo = layerTxtBase + itemCodForm;

                                if (layerEntNodoCiclo.Length > 255) layerEntNodoCiclo = layerEntNodoCiclo.Substring(0, 255);
                                if (layerTxtNodoCiclo.Length > 255) layerTxtNodoCiclo = layerTxtNodoCiclo.Substring(0, 255);

                                // Asegurar capas y asignarlas al clon
                                AsegurarCapa(layerEntNodoCiclo, _acadColor, true);
                                AsegurarCapa(layerTxtNodoCiclo, _acadColor, true);

                                entClon.Layer = layerEntNodoCiclo;

                                // Etiqueta / ID_POL (igual filosofía que tramo)
                                etiqueta = string.IsNullOrWhiteSpace(itemCodForm)
                                            ? $"{contador}"
                                            : $"{itemCodForm}_{contador}";

                                // Crear texto para el clon del nodo en este ciclo
                                dbt = new acDb.DBText();
                                dbt.SetDatabaseDefaults();
                                dbt.TextString = etiqueta;
                                dbt.Height = alt;
                                dbt.Layer = layerTxtNodoCiclo;
                                dbt.HorizontalMode = acDb.TextHorizontalMode.TextCenter;
                                dbt.VerticalMode = acDb.TextVerticalMode.TextVerticalMid;
                                dbt.AlignmentPoint = pos;
                                dbt.Position = pos;
                                btr.AppendEntity(dbt);
                                tr.AddNewlyCreatedDBObject(dbt, true);
                            }
                            else if (_tipo == TipoEntidad.Nodo && !_nodoAnalisisDetallado)
                            {
                                // Nodo rápido: etiqueta normal (ID_POL) y texto normal
                                etiqueta = string.IsNullOrWhiteSpace(itemCodForm)
                                          ? $"{contador}"
                                          : $"{itemCodForm}_{contador}";

                                // Calcular etiqueta prefijo y guardar en campo intermedio
                                // (noIni/noFin se declaran más abajo — no se pueden usar aquí)
                                if (_aplicarPrefijo && !string.IsNullOrWhiteSpace(_nodoPrefijo))
                                {
                                    _prefEtiquetaActual = $"{_nodoPrefijo}{_nodoPrefContadorActual}";
                                    _nodoPrefContadorActual++;
                                }
                                else
                                {
                                    _prefEtiquetaActual = "";
                                }

                                // Texto en layer_txt (comportamiento existente)
                                dbt = new acDb.DBText();
                                dbt.SetDatabaseDefaults();
                                dbt.TextString = etiqueta;
                                dbt.Height = alt;
                                dbt.Layer = layerTxtActual;
                                dbt.HorizontalMode = acDb.TextHorizontalMode.TextCenter;
                                dbt.VerticalMode = acDb.TextVerticalMode.TextVerticalMid;
                                dbt.AlignmentPoint = pos;
                                dbt.Position = pos;
                                btr.AppendEntity(dbt);
                                tr.AddNewlyCreatedDBObject(dbt, true);

                                // Texto ADICIONAL en layer_ent con el prefijo (si aplica)
                                if (_aplicarPrefijo && !string.IsNullOrWhiteSpace(_nodoPrefijo))
                                {
                                    var dbtEnt = new acDb.DBText();
                                    dbtEnt.SetDatabaseDefaults();
                                    dbtEnt.TextString = _prefEtiquetaActual;
                                    dbtEnt.Height = alt;
                                    dbtEnt.Layer = layerEntActual;
                                    dbtEnt.HorizontalMode = acDb.TextHorizontalMode.TextCenter;
                                    dbtEnt.VerticalMode = acDb.TextVerticalMode.TextVerticalMid;
                                    dbtEnt.AlignmentPoint = pos;
                                    dbtEnt.Position = pos;
                                    btr.AppendEntity(dbtEnt);
                                    tr.AddNewlyCreatedDBObject(dbtEnt, true);
                                }
                            }
                            else if (_tipo != TipoEntidad.Nodo)
                            {
                                // Área / Longitud (comportamiento existente)
                                etiqueta = string.IsNullOrWhiteSpace(itemCodForm)
                                          ? $"{contador}"
                                          : $"{itemCodForm}_{contador}";

                                dbt = new acDb.DBText();
                                dbt.SetDatabaseDefaults();
                                dbt.TextString = etiqueta;
                                dbt.Height = alt;
                                dbt.Layer = layerTxtActual;
                                dbt.HorizontalMode = acDb.TextHorizontalMode.TextCenter;
                                dbt.VerticalMode = acDb.TextVerticalMode.TextVerticalMid;
                                dbt.AlignmentPoint = pos;
                                dbt.Position = pos;
                                btr.AppendEntity(dbt);
                                tr.AddNewlyCreatedDBObject(dbt, true);
                            }

                            string entHandle = entClon.Handle.ToString();
                            string txtHandle = dbt?.Handle.ToString() ?? "";
                            string layerEntReal = entClon.Layer;
                            string layerTxtReal = dbt?.Layer ?? "";
                            string colorHexExcel = itCat.ColorHex ?? "";


                            double medidaRaw = Math.Round(MedidaDe(entClon), 2, MidpointRounding.AwayFromZero);
                            double medida = (_tipo == TipoEntidad.Area)
                                ? AreaM2ParaUndCatalogo(medidaRaw, undForm)
                                : medidaRaw;
                            double cantTotal = Math.Round(medida * anchoForm * espesorForm, 2, MidpointRounding.AwayFromZero);
                            double costoDirecto = Math.Round(cantTotal * (double)vlrUnitForm, 0, MidpointRounding.AwayFromZero);
                            // Nodo rápido: siempre 1 UND (no aplica área/perímetro/ancho/espesor)
                            if (_tipo == TipoEntidad.Nodo && !_nodoAnalisisDetallado)
                            {
                                medida = 1.0; // siempre 1 UND
                                              // NO tocar cantTotal aquí, porque debe seguir multiplicando ancho/espesor
                            }


                            string handleOriginal = "";
                            try { handleOriginal = aceptadas[i].Id.Handle.ToString(); } catch { }

                            // === CASO ESPECIAL: NODO → usar info de FrmNombrarNodos y crear clones/etiquetas por ÍTEM REAL ===
                            // Solo aplica en el PRIMER ciclo (cuando aún NO estamos agregando otro ítem)
                            if (_tipo == TipoEntidad.Nodo &&
                                !_cicloAgregarPendiente &&                  // ← NUEVO
                                nodoInfoMap != null &&
                                !string.IsNullOrWhiteSpace(handleOriginal) &&
                                nodoInfoMap.TryGetValue(handleOriginal, out var infoNodo))
                            {

                                // 1) PK_ID automático por región para este nodo
                                string pkAutoNodo;
                                if (_evalCache != null && _evalCache.TryGetValue(aceptadas[i].Id, out var infoEvalNodo))
                                {
                                    pkAutoNodo = infoEvalNodo.PkId;
                                }
                                else
                                {
                                    pkAutoNodo = aceptadas[i].PkId;
                                    try
                                    {
                                        var midNodo = PkStore.MidPointOf(entClon);
                                        if (!PkStore.TryGetPkForPoint(midNodo, out pkAutoNodo))
                                        {
                                            if (tr.GetObject(aceptadas[i].Id, acDb.OpenMode.ForRead, false, true) is acDb.Entity entOrigNodo)
                                            {
                                                var midOrigNodo = PkStore.MidPointOf(entOrigNodo);
                                                PkStore.TryGetPkForPoint(midOrigNodo, out pkAutoNodo);
                                            }
                                        }
                                        if (string.IsNullOrWhiteSpace(pkAutoNodo))
                                            pkAutoNodo = aceptadas[i].PkId;
                                    }
                                    catch
                                    {
                                        pkAutoNodo = aceptadas[i].PkId;
                                    }
                                }

                                // 2) Costado / Tramo para este PK
                                string costadoNodo = "";
                                string tramoNodo = "";
                                var capaNodo = _capasFull.FirstOrDefault(c =>
                                    string.Equals(c.CAPA, pkAutoNodo, StringComparison.OrdinalIgnoreCase));
                                if (capaNodo != null)
                                {
                                    costadoNodo = capaNodo.CALZADA ?? "";
                                    tramoNodo = capaNodo.TRAMO ?? "";
                                }

                                // 3) Abscisas de este nodo
                                string absIniNodo = aceptadas[i].AbsIni;
                                string absFinNodo = aceptadas[i].AbsFin;

                                // 4) Nombre de nodo (NoInicio/NoFinal)
                                string noIniNodo = noIniForm;
                                string noFinNodo = noFinForm;

                                if (!string.IsNullOrWhiteSpace(handleOriginal) &&
                                    _nombresNodoSeleccion.TryGetValue(handleOriginal, out var nomNodo) &&
                                    !string.IsNullOrWhiteSpace(nomNodo))
                                {
                                    noIniNodo = nomNodo;
                                    noFinNodo = nomNodo;
                                }

                                int indiceItemNodo = 0;
                                string conceptoActual = "";

                                // Función local: crea CLONES y FILAS por cada ítem REAL del nodo
                                void AgregarFilaDesdeNodo(string? itemTexto, double cantidad)
                                {
                                    if (string.IsNullOrWhiteSpace(itemTexto)) return;
                                    if (cantidad <= 0.0) return;

                                    // Parsear "8.34 - TEXTO (m³)" -> código, descripción y unidad
                                    ParseLineaCatalogoNodo(itemTexto, out var codItem, out var descItem, out var undItem);

                                    // 0) Capas específicas de ESTE ítem de nodo
                                    string layerEntNodo = layerEntBase + codItem;
                                    string layerTxtNodo = layerTxtBase + codItem;
                                    if (layerEntNodo.Length > 255) layerEntNodo = layerEntNodo.Substring(0, 255);
                                    if (layerTxtNodo.Length > 255) layerTxtNodo = layerTxtNodo.Substring(0, 255);
                                    AsegurarCapa(layerEntNodo, _acadColor, true);
                                    AsegurarCapa(layerTxtNodo, _acadColor, true);

                                    // 1) Valor unitario desde catálogo
                                    decimal vlrUnitNodo = 0;
                                    if (cmbItem.DataSource is System.Collections.IEnumerable ds)
                                    {
                                        foreach (var obj in ds)
                                        {
                                            if (obj is PresItem pi &&
                                                string.Equals(pi.Item, codItem, StringComparison.OrdinalIgnoreCase))
                                            {
                                                vlrUnitNodo = pi.ValorUnitario;
                                                break;
                                            }
                                        }
                                    }

                                    if (vlrUnitNodo <= 0)
                                        vlrUnitNodo = vlrUnitForm;

                                    double cantTotalNodo = Math.Round(cantidad, 2, MidpointRounding.AwayFromZero);
                                    double costoDirectoNodo = Math.Round(cantTotalNodo * (double)vlrUnitNodo, 0,
                                                                         MidpointRounding.AwayFromZero);

                                    double anchoNodo = 1.0;
                                    double espesorNodo = 1.0;
                                    double areaLongNodo = 1.0;

                                    switch (conceptoActual)
                                    {
                                        case "EXCAV":
                                            anchoNodo = Math.Round(infoNodo.AreaExcav, 2, MidpointRounding.AwayFromZero);
                                            // Derivar la altura REAL desde el volumen (ya contiene el descuento DescEstVia)
                                            espesorNodo = (infoNodo.AreaExcav > 0)
                                                ? Math.Round(infoNodo.CantExcav / infoNodo.AreaExcav, 2, MidpointRounding.AwayFromZero)
                                                : Math.Round(infoNodo.AlturaExcav, 2, MidpointRounding.AwayFromZero);
                                            break;

                                        case "RELLENO":
                                            // Ancho = área anular (EXT - MED); Espesor = altura excavación
                                            double areaAnularRell = Math.Max(0,
                                                infoNodo.AreaNodoEXT - infoNodo.AreaNodoMED);
                                            anchoNodo = Math.Round(areaAnularRell, 2, MidpointRounding.AwayFromZero);
                                            espesorNodo = Math.Round(infoNodo.AlturaExcav, 2, MidpointRounding.AwayFromZero);
                                            break;

                                        case "ENTIB":
                                            anchoNodo = Math.Round(infoNodo.PerimetroExcav, 2, MidpointRounding.AwayFromZero);
                                            espesorNodo = Math.Round(infoNodo.AlturaExcav, 2, MidpointRounding.AwayFromZero);
                                            break;

                                        case "MAMPOST":
                                            anchoNodo = Math.Round(infoNodo.CantMamposteria, 2, MidpointRounding.AwayFromZero);
                                            espesorNodo = 1.0;
                                            break;

                                        case "PASO":
                                        case "NODO":
                                        case "PLACA":
                                        case "CANJ":
                                            // Ítems de unidad: la cantidad va a AreaLongNod
                                            // para que la fórmula AreaLongNod × 1 × 1 = cantidad sea coherente
                                            areaLongNodo = cantTotalNodo;
                                            anchoNodo = 1.0;
                                            espesorNodo = 1.0;
                                            break;

                                        default:
                                            anchoNodo = 1.0;
                                            espesorNodo = 1.0;
                                            break;
                                    }

                                    // ====== CLONADO POR ÍTEM ======
                                    acDb.Entity entParaItem;
                                    string etiquetaLocal;
                                    string entHandleLocal;
                                    string txtHandleLocal;

                                    if (indiceItemNodo == 0)
                                    {
                                        // Usamos el clon ya creado, pero lo movemos a la capa correcta
                                        entParaItem = entClon;
                                        entParaItem.Layer = layerEntNodo;

                                        etiquetaLocal = string.IsNullOrWhiteSpace(codItem)
                                                            ? $"{contador}"
                                                            : $"{codItem}_{contador}";

                                        var posNodo = CentroDeSeguro(entParaItem);
                                        var txtNodo = new acDb.DBText();
                                        txtNodo.SetDatabaseDefaults();
                                        txtNodo.TextString = etiquetaLocal;
                                        txtNodo.Height = alt;
                                        txtNodo.Layer = layerTxtNodo;
                                        txtNodo.HorizontalMode = acDb.TextHorizontalMode.TextCenter;
                                        txtNodo.VerticalMode = acDb.TextVerticalMode.TextVerticalMid;
                                        txtNodo.AlignmentPoint = posNodo;
                                        txtNodo.Position = posNodo;
                                        btr.AppendEntity(txtNodo);
                                        tr.AddNewlyCreatedDBObject(txtNodo, true);

                                        entHandleLocal = entParaItem.Handle.ToString();
                                        txtHandleLocal = txtNodo.Handle.ToString();
                                    }
                                    else
                                    {
                                        // Ítems adicionales → clon extra
                                        var entExtra = (acDb.Entity)entClon.Clone();
                                        btr.AppendEntity(entExtra);
                                        tr.AddNewlyCreatedDBObject(entExtra, true);
                                        entExtra.Layer = layerEntNodo;

                                        contador++;
                                        etiquetaLocal = string.IsNullOrWhiteSpace(codItem)
                                                            ? $"{contador}"
                                                            : $"{codItem}_{contador}";

                                        var posExtra = CentroDeSeguro(entExtra);
                                        var dbtExtra = new acDb.DBText();
                                        dbtExtra.SetDatabaseDefaults();
                                        dbtExtra.TextString = etiquetaLocal;
                                        dbtExtra.Height = alt;
                                        dbtExtra.Layer = layerTxtNodo;
                                        dbtExtra.HorizontalMode = acDb.TextHorizontalMode.TextCenter;
                                        dbtExtra.VerticalMode = acDb.TextVerticalMode.TextVerticalMid;
                                        dbtExtra.AlignmentPoint = posExtra;
                                        dbtExtra.Position = posExtra;
                                        btr.AppendEntity(dbtExtra);
                                        tr.AddNewlyCreatedDBObject(dbtExtra, true);

                                        entParaItem = entExtra;
                                        entHandleLocal = entExtra.Handle.ToString();
                                        txtHandleLocal = dbtExtra.Handle.ToString();
                                    }

                                    // Evitar duplicados exactos en la tabla
                                    if (ExisteFilaPresupuestal(pkAutoNodo, codItem, etiquetaLocal.ToUpperInvariant()))
                                    {
                                        indiceItemNodo++;
                                        return;
                                    }

                                    var textPos = (dbt != null) ? dbt.Position : pos;

                                    _rows.Add(new GridRow
                                    {
                                        PK_ID = pkAutoNodo,
                                        CapaSolo = pkAutoNodo,
                                        Capitulo = capitulo,
                                        Competencia = competencia,
                                        Item = codItem,
                                        Descripcion = descItem,
                                        Und = undItem,
                                        Calzada = costadoNodo,
                                        Tramo = tramoNodo,
                                        AbsIni = absIniNodo,
                                        AbsFin = absFinNodo,
                                        VlrUnitario = vlrUnitNodo,
                                        AreaLongNod = areaLongNodo,
                                        Ancho = anchoNodo,
                                        Espesor = espesorNodo,
                                        CantTotal = cantTotalNodo,
                                        CostoDirecto = costoDirectoNodo,
                                        TipoEjecucion = tipoEjec,
                                        TipoEntidad = "Nodo",
                                        RasanteIni = infoNodo.Rasante,
                                        RasanteFin = infoNodo.Rasante,
                                        ClaveIni = infoNodo.ClaveSalida,
                                        ClaveFin = infoNodo.ClaveSalida,
                                        ID_Pol = etiquetaLocal.ToUpperInvariant(),
                                        NoInicio = noIniNodo,
                                        NoFinal = noFinNodo,
                                        Observacion = observ,
                                        Remitente = _supportPending?.Remitente ?? "",
                                        FechaSoporte = _supportPending?.Fecha.ToString("yyyy-MM-dd") ?? "",
                                        AsuntoSoporte = _supportPending?.Asunto ?? "",
                                        LinkSoporte = _supportPending?.Enlace ?? "",
                                        EntHandle = entHandleLocal,
                                        TxtHandle = txtHandleLocal,
                                        LayerEnt = layerEntNodo,
                                        LayerTxt = layerTxtNodo,
                                        ColorHex = colorHexExcel,
                                        GUID = "",
                                        X_LABEL = Math.Round(textPos.X, 3),
                                        Y_LABEL = Math.Round(textPos.Y, 3),
                                    });

                                    indiceItemNodo++;
                                }

                                // Disparar la función por cada concepto activo
                                if (infoNodo.UsaExcav && infoNodo.CantExcav > 0)
                                {
                                    conceptoActual = "EXCAV";
                                    AgregarFilaDesdeNodo(infoNodo.ItemExcav, infoNodo.CantExcav);
                                }

                                if (infoNodo.UsaRellenoPerim && infoNodo.CantRellenoPerim > 0)
                                {
                                    conceptoActual = "RELLENO";
                                    AgregarFilaDesdeNodo(infoNodo.ItemRellenoPerim, infoNodo.CantRellenoPerim);
                                }

                                if (infoNodo.UsaEntibado && infoNodo.CantEntibado > 0)
                                {
                                    conceptoActual = "ENTIB";
                                    AgregarFilaDesdeNodo(infoNodo.ItemEntibado, infoNodo.CantEntibado);
                                }

                                if (infoNodo.UsaNodo && infoNodo.CantNodo > 0)
                                {
                                    conceptoActual = "NODO";
                                    AgregarFilaDesdeNodo(infoNodo.ItemNodo, infoNodo.CantNodo);
                                }

                                if (infoNodo.UsaMamposteria && infoNodo.CantMamposteria > 0)
                                {
                                    conceptoActual = "MAMPOST";
                                    AgregarFilaDesdeNodo(infoNodo.ItemMamposteria, infoNodo.CantMamposteria);
                                }

                                if (infoNodo.UsaPlacaFondo && infoNodo.CantPlacaFondo > 0)
                                {
                                    conceptoActual = "PLACA";
                                    AgregarFilaDesdeNodo(infoNodo.ItemPlacaFondo, infoNodo.CantPlacaFondo);
                                }

                                if (infoNodo.UsaPasos && infoNodo.CantPasos > 0)
                                {
                                    conceptoActual = "PASO";
                                    AgregarFilaDesdeNodo(infoNodo.ItemPasos, infoNodo.CantPasos);
                                }

                                if (infoNodo.UsaCanjuela && infoNodo.CantCanjuela > 0)
                                {
                                    conceptoActual = "CANJ";
                                    AgregarFilaDesdeNodo(infoNodo.ItemCanjuela, infoNodo.CantCanjuela);
                                }

                                contador++;
                                continue;
                            }

                            // === Resto de tipos (Área / Longitud) ===

                            string pkAuto;
                            if (_evalCache != null && _evalCache.TryGetValue(aceptadas[i].Id, out var infoEval))
                            {
                                pkAuto = infoEval.PkId;
                            }
                            else
                            {
                                pkAuto = aceptadas[i].PkId;
                                try
                                {
                                    var midE = PkStore.MidPointOf(entClon);
                                    if (!PkStore.TryGetPkForPoint(midE, out pkAuto))
                                    {
                                        if (tr.GetObject(aceptadas[i].Id, acDb.OpenMode.ForRead, false, true) is acDb.Entity entOrig)
                                        {
                                            var midOrig = PkStore.MidPointOf(entOrig);
                                            PkStore.TryGetPkForPoint(midOrig, out pkAuto);
                                        }
                                    }
                                    if (string.IsNullOrWhiteSpace(pkAuto)) pkAuto = aceptadas[i].PkId;
                                }
                                catch { pkAuto = aceptadas[i].PkId; }
                            }

                            string costadoSel = "";
                            string tramoSel = "";
                            var capaRow = _capasFull.FirstOrDefault(c =>
                                string.Equals(c.CAPA, pkAuto, StringComparison.OrdinalIgnoreCase));
                            if (capaRow != null) { costadoSel = capaRow.CALZADA ?? ""; tramoSel = capaRow.TRAMO ?? ""; }

                            var absIni = aceptadas[i].AbsIni;
                            var absFin = aceptadas[i].AbsFin;

                            string noIni = (!string.IsNullOrWhiteSpace(_prefEtiquetaActual))
                                                                       ? _prefEtiquetaActual : noIniForm;
                            string noFin = (!string.IsNullOrWhiteSpace(_prefEtiquetaActual))
                                           ? _prefEtiquetaActual : noFinForm;

                            // TRAMO: toma nombres desde FrmNombrarTramo
                            if (_tipo == TipoEntidad.Longitud && _modoTramoActivo)
                            {
                                if (!string.IsNullOrWhiteSpace(handleOriginal) &&
                                    _mapTramosSel.TryGetValue(handleOriginal, out var par))
                                {
                                    if (!string.IsNullOrWhiteSpace(par.Ini)) noIni = par.Ini;
                                    if (!string.IsNullOrWhiteSpace(par.Fin)) noFin = par.Fin;
                                }
                            }

                            // ✅ FIX: NODO + ciclo “agregar otro ítem” => respetar SIEMPRE el nombre del FrmNombrarNodos
                            if (_tipo == TipoEntidad.Nodo && _cicloAgregarPendiente)
                            {
                                if (!string.IsNullOrWhiteSpace(handleOriginal) &&
                                    _nombresNodoSeleccion.TryGetValue(handleOriginal, out var nomNodo) &&
                                    !string.IsNullOrWhiteSpace(nomNodo))
                                {
                                    noIni = nomNodo.Trim().ToUpperInvariant();
                                    noFin = noIni;
                                }
                            }


                            if (_tipo == TipoEntidad.Longitud &&
                                _modoTramoActivo &&
                                !_cicloAgregarPendiente &&           // ← NUEVO
                                !string.IsNullOrWhiteSpace(handleOriginal) &&
                                _tramoInfoPorHandle.TryGetValue(handleOriginal, out var infoTramo))
                            {
                                // --- CLONADO POR ÍTEM DE TRAMO (IGUAL FILOSOFÍA QUE NODOS) ---
                                int indiceItemTramo = 0;

                                void AgregarItemTramo(
                                    string? lineaItem,
                                    double longitud,
                                    double ancho,
                                    double espesor,
                                    double cantidad)
                                {
                                    if (string.IsNullOrWhiteSpace(lineaItem)) return;
                                    if (cantidad <= 0.0) return;
                                    if (!TryGetPresItemFromLinea(lineaItem, out var pi) || pi == null) return;

                                    string codItem = pi.Item ?? "";

                                    // Capas específicas para este ítem del tramo
                                    string cap5Loc = PrefijoCap5();
                                    string comp5Loc = PrefijoCom5();
                                    string layerEntTramo = $"{cap5Loc}_{comp5Loc}_{codItem}";
                                    string layerTxtTramo = $"txt_{cap5Loc}_{comp5Loc}_{codItem}";
                                    if (layerEntTramo.Length > 255) layerEntTramo = layerEntTramo.Substring(0, 255);
                                    if (layerTxtTramo.Length > 255) layerTxtTramo = layerTxtTramo.Substring(0, 255);
                                    AsegurarCapa(layerEntTramo, _acadColor, true);
                                    AsegurarCapa(layerTxtTramo, _acadColor, true);

                                    acDb.Entity entParaItem;
                                    acDb.DBText txtParaItem;
                                    string etiquetaLocal;

                                    if (indiceItemTramo == 0)
                                    {
                                        // Primer ítem → reutiliza el clon ya creado
                                        entParaItem = entClon;
                                        entParaItem.Layer = layerEntTramo;

                                        etiquetaLocal = string.IsNullOrWhiteSpace(codItem)
                                                            ? $"{contador}"
                                                            : $"{codItem}_{contador}";

                                        if (dbt == null)
                                        {
                                            dbt = new acDb.DBText();
                                            dbt.SetDatabaseDefaults();
                                            dbt.TextString = etiquetaLocal;
                                            dbt.Height = alt;
                                            dbt.Layer = layerTxtTramo;
                                            dbt.HorizontalMode = acDb.TextHorizontalMode.TextCenter;
                                            dbt.VerticalMode = acDb.TextVerticalMode.TextVerticalMid;
                                            dbt.AlignmentPoint = pos;
                                            dbt.Position = pos;
                                            btr.AppendEntity(dbt);
                                            tr.AddNewlyCreatedDBObject(dbt, true);
                                        }

                                        dbt.TextString = etiquetaLocal;
                                        dbt.Layer = layerTxtTramo;
                                        txtParaItem = dbt;
                                    }
                                    else
                                    {
                                        // Ítems adicionales → nuevo clon de la ENTIDAD y nuevo texto
                                        var entExtra = (acDb.Entity)entClon.Clone();
                                        btr.AppendEntity(entExtra);
                                        tr.AddNewlyCreatedDBObject(entExtra, true);
                                        entExtra.Layer = layerEntTramo;

                                        contador++;
                                        etiquetaLocal = string.IsNullOrWhiteSpace(codItem)
                                                            ? $"{contador}"
                                                            : $"{codItem}_{contador}";

                                        var posExtra = CentroDeSeguro(entExtra);
                                        var txtExtra = new acDb.DBText();
                                        txtExtra.SetDatabaseDefaults();
                                        txtExtra.TextString = etiquetaLocal;
                                        txtExtra.Height = alt;
                                        txtExtra.Layer = layerTxtTramo;
                                        txtExtra.HorizontalMode = acDb.TextHorizontalMode.TextCenter;
                                        txtExtra.VerticalMode = acDb.TextVerticalMode.TextVerticalMid;
                                        txtExtra.AlignmentPoint = posExtra;
                                        txtExtra.Position = posExtra;
                                        btr.AppendEntity(txtExtra);
                                        tr.AddNewlyCreatedDBObject(txtExtra, true);

                                        entParaItem = entExtra;
                                        txtParaItem = txtExtra;
                                    }

                                    // Evitar filas duplicadas exactas (misma PK, ítem, ID_Pol)
                                    if (ExisteFilaPresupuestal(pkAuto, codItem, etiquetaLocal.ToUpperInvariant()))
                                    {
                                        indiceItemTramo++;
                                        return;
                                    }

                                    double longVal = Math.Round(longitud, 2, MidpointRounding.AwayFromZero);
                                    double anchoVal = Math.Round(ancho, 2, MidpointRounding.AwayFromZero);
                                    double espVal = Math.Round(espesor, 2, MidpointRounding.AwayFromZero);
                                    double cantVal = Math.Round(cantidad, 2, MidpointRounding.AwayFromZero);
                                    double costoVal = Math.Round(cantVal * (double)pi.ValorUnitario, 0, MidpointRounding.AwayFromZero);

                                    var textPos = (dbt != null) ? dbt.Position : pos;

                                    _rows.Add(new GridRow
                                    {
                                        PK_ID = pkAuto,
                                        CapaSolo = pkAuto,
                                        Capitulo = capitulo,
                                        Competencia = competencia,
                                        Item = codItem,
                                        Descripcion = pi.Descripcion ?? "",
                                        Und = pi.Und ?? "",
                                        Calzada = costadoSel,
                                        Tramo = tramoSel,
                                        AbsIni = absIni,
                                        AbsFin = absFin,
                                        VlrUnitario = pi.ValorUnitario,
                                        NoInicio = noIni,
                                        NoFinal = noFin,
                                        AreaLongNod = longVal,
                                        Ancho = anchoVal,
                                        Espesor = espVal,
                                        CantTotal = cantVal,
                                        CostoDirecto = costoVal,
                                        TipoEjecucion = tipoEjec,
                                        TipoEntidad = "Tramo Tubería",
                                        RasanteIni = infoTramo.RasanteIni,
                                        RasanteFin = infoTramo.RasanteFin,
                                        ClaveIni = infoTramo.ClaveIni,
                                        ClaveFin = infoTramo.ClaveFin,
                                        ID_Pol = etiquetaLocal.ToUpperInvariant(),
                                        Observacion = observ,
                                        Remitente = _supportPending?.Remitente ?? "",
                                        FechaSoporte = _supportPending?.Fecha.ToString("yyyy-MM-dd") ?? "",
                                        AsuntoSoporte = _supportPending?.Asunto ?? "",
                                        LinkSoporte = _supportPending?.Enlace ?? "",
                                        EntHandle = entParaItem.Handle.ToString(),
                                        TxtHandle = txtParaItem.Handle.ToString(),
                                        LayerEnt = layerEntTramo,
                                        LayerTxt = layerTxtTramo,
                                        ColorHex = colorHexExcel,
                                        GUID = "",
                                        X_LABEL = Math.Round(textPos.X, 3),
                                        Y_LABEL = Math.Round(textPos.Y, 3),
                                    });

                                    indiceItemTramo++;
                                }

                                // ===== DISPARAR POR CADA CONCEPTO DEL TRAMO (Mismas fórmulas que AgregarFilasPorTramo) =====

                                // Excavación: VolExcavacion = Longitud * AnchoExcavacion * AlturaExcavacion
                                if (infoTramo.UsaExcav && infoTramo.VolExcavacion > 0 &&
                                    !string.IsNullOrWhiteSpace(infoTramo.ItemExcav))
                                {
                                    // Derivar la altura REAL desde el volumen (ya contiene el descuento EstrucViaEp)
                                    double alturaExcTramo = (infoTramo.Longitud > 0 && infoTramo.AnchoExcavacion > 0)
                                        ? Math.Round(infoTramo.VolExcavacion / infoTramo.AnchoExcavacion / infoTramo.Longitud, 2, MidpointRounding.AwayFromZero)
                                        : infoTramo.AlturaExcavacion;

                                    AgregarItemTramo(
                                    infoTramo.ItemExcav,
                                    infoTramo.LongitudEXT,
                                    infoTramo.AnchoExcavacion,
                                    alturaExcTramo,
                                    infoTramo.VolExcavacion);
                                }

                                // Atraque: espesor = VolAtraque / (Longitud * AnchoExcavacion)
                                if (infoTramo.UsaAtraque && infoTramo.VolAtraque > 0 &&
                                    !string.IsNullOrWhiteSpace(infoTramo.ItemAtraque))
                                {
                                    double longitud = infoTramo.LongitudMED;
                                    double ancho = infoTramo.AnchoExcavacion;
                                    double cantidad = infoTramo.VolAtraque;
                                    double espesor = 0.0;
                                    if (longitud > 0.0 && ancho > 0.0 && cantidad > 0.0)
                                        espesor = cantidad / (longitud * ancho);

                                    AgregarItemTramo(
                                        infoTramo.ItemAtraque,
                                        longitud,
                                        ancho,
                                        espesor,
                                        cantidad);
                                }

                                // Longitud de tubería (lineal)
                                if (infoTramo.UsaLong && infoTramo.LongitudINT > 0 &&
                                    !string.IsNullOrWhiteSpace(infoTramo.ItemLong))
                                {
                                    AgregarItemTramo(
                                        infoTramo.ItemLong,
                                        infoTramo.LongitudINT,
                                        1.0,
                                        1.0,
                                        infoTramo.LongitudINT);
                                }

                                // Relleno granular
                                if (infoTramo.UsaRelleno && infoTramo.VolRelleno > 0 &&
                                    !string.IsNullOrWhiteSpace(infoTramo.ItemRelleno))
                                {
                                    AgregarItemTramo(
                                    infoTramo.ItemRelleno,
                                    infoTramo.LongitudMED,
                                    infoTramo.AnchoExcavacion,
                                    infoTramo.AlturaRelleno,
                                    infoTramo.VolRelleno);
                                }

                                // Entibado: área = Longitud * AlturaExcavación * 2 caras
                                if (infoTramo.UsaEntibado && infoTramo.AreaEntibado > 0 &&
                                    !string.IsNullOrWhiteSpace(infoTramo.ItemEntibado))
                                {
                                    AgregarItemTramo(
                                    infoTramo.ItemEntibado,
                                    infoTramo.LongitudMED,
                                    infoTramo.AlturaExcavacion,
                                    2.0,
                                    infoTramo.AreaEntibado);
                                }

                                // Cinta
                                if (infoTramo.UsaCinta && infoTramo.Longitud > 0 &&
                                    !string.IsNullOrWhiteSpace(infoTramo.ItemCinta))
                                {
                                    AgregarItemTramo(
                                    infoTramo.ItemCinta,
                                    infoTramo.LongitudMED,
                                    1.0,
                                    1.0,
                                    infoTramo.LongitudMED);
                                }

                                // Otros: espesor equivalente = CantOtros / Longitud
                                if (infoTramo.UsaOtros && infoTramo.CantOtros > 0 &&
                                    !string.IsNullOrWhiteSpace(infoTramo.ItemOtros))
                                {
                                    double espEquiv = (infoTramo.LongitudINT > 0.0)
                                                        ? infoTramo.CantOtros / infoTramo.LongitudINT
                                                        : 0.0;

                                    AgregarItemTramo(
                                        infoTramo.ItemOtros,
                                        infoTramo.LongitudINT,
                                        1.0,
                                        espEquiv,
                                        infoTramo.CantOtros);
                                }

                                // Campanas 1: AreaLongNod=cantidad, Ancho=1, Espesor=1, CantTotal=cantidad (UND)
                                if (infoTramo.UsaCampana1 && infoTramo.CantCampana1 > 0 &&
                                    !string.IsNullOrWhiteSpace(infoTramo.ItemCampana1))
                                {
                                    AgregarItemTramo(
                                        infoTramo.ItemCampana1,
                                        infoTramo.CantCampana1,   // AreaLongNod = cantidad entera
                                        1.0,                       // Ancho = 1
                                        1.0,                       // Espesor = 1
                                        infoTramo.CantCampana1);  // CantTotal = cantidad entera
                                }

                                // Campanas 2: AreaLongNod=cantidad, Ancho=1, Espesor=1, CantTotal=cantidad (UND)
                                if (infoTramo.UsaCampana2 && infoTramo.CantCampana2 > 0 &&
                                    !string.IsNullOrWhiteSpace(infoTramo.ItemCampana2))
                                {
                                    AgregarItemTramo(
                                        infoTramo.ItemCampana2,
                                        infoTramo.CantCampana2,   // AreaLongNod = cantidad entera
                                        1.0,                       // Ancho = 1
                                        1.0,                       // Espesor = 1
                                        infoTramo.CantCampana2);  // CantTotal = cantidad entera
                                }
                                // Al terminar todos los ítems del tramo, avanzar contador base
                                contador++;
                                continue;
                            }


                            else
                            {
                                // Normalizar llaves (evita NullReference y falsos duplicados por espacios)
                                string itemKey = (itemCodForm ?? "").Trim();
                                string etiquetaKey = (etiqueta ?? "").Trim().ToUpperInvariant();

                                if (ExisteFilaPresupuestal(pkAuto, itemKey, etiquetaKey))
                                {
                                    contador++;
                                    continue;
                                }

                                // Valores base (primer ciclo normal: usa la geometría)
                                double areaLongOut = medida;
                                double anchoOut = anchoForm;
                                double espesorOut = espesorForm;
                                double cantOut = cantTotal;
                                double costoOut = costoDirecto;
                                decimal vlrUnitOut = vlrUnitForm;

                                // Ciclo adicional (agregar otro ítem sobre la MISMA entidad) para NODO:
                                // AreaLongNod = 1 y se recalcula cantidad con Ancho y Espesor del formulario.
                                if (_cicloAgregarPendiente && _tipo == TipoEntidad.Nodo)
                                {
                                    areaLongOut = 1.0;

                                    if (anchoOut <= 0) anchoOut = 1.0;
                                    if (espesorOut <= 0) espesorOut = 1.0;

                                    cantOut = Math.Round(areaLongOut * anchoOut * espesorOut, 2, MidpointRounding.AwayFromZero);
                                    costoOut = Math.Round(cantOut * (double)vlrUnitOut, 0, MidpointRounding.AwayFromZero);
                                }

                                // Coordenadas del label (ID_POL): si existe el DBText usamos su Position, si no, el centro geométrico.
                                var textPos = (dbt != null) ? dbt.Position : pos;

                                _rows.Add(new GridRow
                                {
                                    PK_ID = pkAuto,
                                    CapaSolo = pkAuto,
                                    Capitulo = capitulo,
                                    Competencia = competencia,
                                    Item = itemKey,
                                    Descripcion = descForm,
                                    Und = undForm,
                                    Calzada = costadoSel,
                                    Tramo = tramoSel,
                                    AbsIni = absIni,
                                    AbsFin = absFin,

                                    VlrUnitario = vlrUnitOut,   // decimal
                                    NoInicio = noIni,
                                    NoFinal = noFin,

                                    AreaLongNod = areaLongOut,
                                    Ancho = anchoOut,
                                    Espesor = espesorOut,
                                    CantTotal = cantOut,
                                    CostoDirecto = costoOut,

                                    TipoEjecucion = tipoEjec,
                                    TipoEntidad = (_tipo == TipoEntidad.Nodo && _nodoAnalisisDetallado) ? "Nodo RSP" : tipoEnt,
                                    ID_Pol = etiquetaKey,
                                    Observacion = observ,

                                    Remitente = _supportPending?.Remitente ?? "",
                                    FechaSoporte = _supportPending?.Fecha.ToString("yyyy-MM-dd") ?? "",
                                    AsuntoSoporte = _supportPending?.Asunto ?? "",
                                    LinkSoporte = _supportPending?.Enlace ?? "",

                                    EntHandle = entHandle,
                                    TxtHandle = txtHandle,
                                    LayerEnt = layerEntReal,
                                    LayerTxt = layerTxtReal,
                                    ColorHex = colorHexExcel,
                                    GUID = "",

                                    X_LABEL = Math.Round(textPos.X, 3),
                                    Y_LABEL = Math.Round(textPos.Y, 3),
                                });
                            }


                            contador++;
                        }

                        tr.Commit();
                    }
                    } // fin rama no agrupada (DeepClone)

                    if (nodosAgrupadosProcesados)
                    {
                        var rDelGrp = MessageBox.Show(this,
                            "¿Desea ELIMINAR la(s) entidad(es) ORIGINAL(ES) del dibujo?",
                            "SICOE", MessageBoxButtons.YesNo, MessageBoxIcon.Question);

                        if (rDelGrp == DialogResult.Yes)
                        {
                            var listaABorrar = aceptadas
                                .Select(a => a.Id)
                                .Where(id => id.IsValid && !id.IsNull)
                                .Distinct()
                                .ToList();

                            if (listaABorrar.Count > 0)
                                BorrarOriginales(listaABorrar);
                        }
                        else
                        {
                            var rLayerGrp = MessageBox.Show(this,
                                "¿Desea dejar ENCENDIDA la capa de la(s) entidad(es) original(es)?\n\nSí = Encendida\nNo = Apagada",
                                "SICOE", MessageBoxButtons.YesNo, MessageBoxIcon.Question);

                            bool apagarOrig = (rLayerGrp == DialogResult.No);
                            var layerNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                            using (var trL = db3.TransactionManager.StartTransaction())
                            {
                                foreach (var idOrig in aceptadas.Select(a => a.Id))
                                {
                                    if (!idOrig.IsValid) continue;
                                    try
                                    {
                                        if (trL.GetObject(idOrig, acDb.OpenMode.ForRead, false, true) is acDb.Entity entOrig)
                                            layerNames.Add(entOrig.Layer);
                                    }
                                    catch { }
                                }
                                trL.Commit();
                            }
                            SetLayersOnOff(layerNames, apagarOrig);
                            Resaltar(aceptadas.Select(a => a.Id).ToList(), false);
                        }

                        _selIds.Clear();
                        btnSeleccionEntidad.Enabled = false;
                        BtnAgritem.Enabled = false;
                        _cicloAgregarPendiente = false;
                        _nodoAgruparPorPkId = false;
                        _ultimosOriginales.Clear();
                        _evalCache = null;
                        _aceptadosSet = null;
                        _saltarseResumenEnCiclo = false;
                        _nombresNodoSeleccion.Clear();
                        nodoInfoMap = null;

                        LimpiarFormularioParaSiguiente();
                        cmbCapitulo.Focus();
                        rbEjecObra.Checked = false;
                        rbEjecPresupuesto.Checked = false;
                        rbArea.Checked = false;
                        rbLongitud.Checked = false;
                        rbNodo.Checked = false;

                        try
                        {
                            var edGrp = acApp.Application.DocumentManager.MdiActiveDocument.Editor;
                            edGrp.Regen();
                            edGrp.SetImpliedSelection(Array.Empty<acDb.ObjectId>());
                        }
                        catch { }

                        return;
                    }
                }

                // Persistir prefijo nodo rápido si se usó en este lote
                if (_tipo == TipoEntidad.Nodo && !_nodoAnalisisDetallado
                    && _aplicarPrefijo && !string.IsNullOrWhiteSpace(_nodoPrefijo))
                {
                    NodoPrefijosStore.Save(_nodoPrefijo, _nodoPrefContadorActual);
                }

                SaveGlobalCounter(contador);

                txt_contador.Text = contador.ToString();
                ActualizarLabelsGrid();

                var rta = MessageBox.Show(this,
                    "¿Desea agregar otro ítem sobre la MISMA entidad seleccionada?",
                    "SICOE", MessageBoxButtons.YesNo, MessageBoxIcon.Question);

                var ed2 = acApp.Application.DocumentManager.MdiActiveDocument.Editor;

                if (rta == DialogResult.Yes)
                {
                    
                    // Limpiar Ancho y Espesor para el siguiente ítem
                    txtAncho.Text = string.Empty;
                    txtEspesor.Text = string.Empty;

                    _lockSelection = true;
                    _lockedIds = _selIds.ToArray();
                    _lockedTipo = (_tipo == TipoEntidad.Area) ? "Área" :
                                  (_tipo == TipoEntidad.Longitud) ? "Longitud" : "Nodo";

                    try { ed2.SetImpliedSelection(_lockedIds); } catch { }
                    btnSeleccionEntidad.Enabled = false;
                    _cicloAgregarPendiente = true;
                    return;
                }
                else
                {
                    _lockSelection = false;
                    _lockedIds = null;
                    _lockedTipo = "";
                    _preguntaTramoHecha = false;
                    _modoTramoActivo = false;
                    _mapTramosSel.Clear();

                    var rDel = MessageBox.Show(this,
                        "¿Desea ELIMINAR la(s) entidad(es) ORIGINAL(ES) del dibujo?",
                        "SICOE", MessageBoxButtons.YesNo, MessageBoxIcon.Question);

                    if (rDel == DialogResult.Yes)
                    {
                        // Borrar SOLO las entidades realmente procesadas (aceptadas)
                        var listaABorrar = aceptadas
                            .Select(a => a.Id)
                            .Where(id => id.IsValid && !id.IsNull)
                            .Distinct()
                            .ToList();

                        if (listaABorrar.Count == 0)
                        {
                            MessageBox.Show(this,
                                "No hay entidades aceptadas para borrar (lista vacía).",
                                "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        }
                        else
                        {
                            BorrarOriginales(listaABorrar);
                        }
                    }

                    else
                    {
                        var rLayer = MessageBox.Show(this,
                            "¿Desea dejar ENCENDIDA la capa de la(s) entidad(es) original(es)?\n\nSí = Encendida\nNo = Apagada",
                            "SICOE", MessageBoxButtons.YesNo, MessageBoxIcon.Question);

                        bool apagar = (rLayer == DialogResult.No);

                        var layerNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                        var dbL = Autodesk.AutoCAD.ApplicationServices.Application.DocumentManager.MdiActiveDocument.Database;
                        using (var trL = dbL.TransactionManager.StartTransaction())
                        {
                            var setAceptadas2 = new HashSet<acDb.ObjectId>(aceptadas.Select(a => a.Id));
                            foreach(var idOrig in aceptadas.Select(a => a.Id))
                            {
                                if (!idOrig.IsValid || !setAceptadas2.Contains(idOrig)) continue;
                                try
                                {
                                    var obj = trL.GetObject(idOrig, acDb.OpenMode.ForRead, false, true);
                                    if (obj is acDb.Entity entOrig)
                                        layerNames.Add(entOrig.Layer);
                                }
                                catch { }
                            }

                            trL.Commit();
                        }

                        SetLayersOnOff(layerNames, apagar);
                        Resaltar(aceptadas.Select(a => a.Id).ToList(), false);
                    }

                    try
                    {
                        var ed3 = acApp.Application.DocumentManager.MdiActiveDocument.Editor;
                        ed3.SetImpliedSelection(Array.Empty<acDb.ObjectId>());
                    }
                    catch { }


                    _selIds.Clear();
                    btnSeleccionEntidad.Enabled = false;
                    BtnAgritem.Enabled = false;

                    _cicloAgregarPendiente = false;
                    _ultimosOriginales.Clear();

                    LimpiarFormularioParaSiguiente();
                    cmbCapitulo.Focus();
                    rbEjecObra.Checked = false;
                    rbEjecPresupuesto.Checked = false;
                    rbArea.Checked = false;
                    rbLongitud.Checked = false;
                    rbNodo.Checked = false;
                    try
                    {
                        var ed = acApp.Application.DocumentManager.MdiActiveDocument.Editor;
                        ed.Regen();
                        ed.SetImpliedSelection(Array.Empty<Autodesk.AutoCAD.DatabaseServices.ObjectId>());
                    }
                    catch { }
                }

                _nombresNodoSeleccion.Clear();
                nodoInfoMap = null;
                _modoTramoActivo = false;
                _mapTramosSel.Clear();

                LimpiarFormularioParaSiguiente();
                cmbCapitulo.Focus();
                rbEjecObra.Checked = false;
                rbEjecPresupuesto.Checked = false;
                rbArea.Checked = false;
                rbLongitud.Checked = false;
                rbNodo.Checked = false;

                _evalCache = null;
                _aceptadosSet = null;
                _saltarseResumenEnCiclo = false;
            }
            catch (Autodesk.AutoCAD.Runtime.Exception ex)
            {
                MessageBox.Show(this, "Error de AutoCAD: " + ex.ErrorStatus,
                                "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "Error: " + ex.Message,
                                "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                // Habilitar sync solo si hay filas listas
                btnSyncExcel.Enabled = _rows.Count > 0;
            }
        }

        // ==== OWNER CORRECTO PARA DIÁLOGOS EN AUTOCAD ====
        private sealed class WindowWrapper : IWin32Window
        {
            public WindowWrapper(IntPtr handle) => Handle = handle;
            public IntPtr Handle { get; }
        }

        private static IWin32Window AcadOwner()
        {
            try
            {
                var h = Autodesk.AutoCAD.ApplicationServices.Application.MainWindow.Handle;
                return new WindowWrapper(h);
            }
            catch
            {
                return new WindowWrapper(IntPtr.Zero);
            }
        }

        /// <summary>
        /// Obtiene un PK_ID robusto para una entidad, muestreando varios puntos
        /// dentro de su bounding box y escogiendo el PK más frecuente.
        /// Si no encuentra ninguno, cae en el comportamiento antiguo (punto medio + pequeñas tolerancias).
        /// </summary>
        private string GetPkRobusto(acDb.Entity ent, acDb.Transaction tr)
        {
            try
            {
                // Bounding box de la entidad
                acDb.Extents3d ext;
                try
                {
                    ext = ent.GeometricExtents;
                }
                catch
                {
                    // Si no tiene extents, usamos directamente el comportamiento antiguo
                    return GetPkPorMidAntiguo(ent);
                }

                double cx = (ext.MinPoint.X + ext.MaxPoint.X) / 2.0;
                double cy = (ext.MinPoint.Y + ext.MaxPoint.Y) / 2.0;
                double dx = (ext.MaxPoint.X - ext.MinPoint.X) / 3.0;
                double dy = (ext.MaxPoint.Y - ext.MinPoint.Y) / 3.0;

                // Puntos de muestreo: centro y 4 puntos alrededor
                var muestras = new List<acGeo.Point3d>
        {
            new acGeo.Point3d(cx,       cy,       0),
            new acGeo.Point3d(cx + dx,  cy,       0),
            new acGeo.Point3d(cx - dx,  cy,       0),
            new acGeo.Point3d(cx,       cy + dy,  0),
            new acGeo.Point3d(cx,       cy - dy,  0)
        };

                var conteo = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

                foreach (var p in muestras)
                {
                    if (PkStore.TryGetPkForPoint(p, out var pkTmp) &&
                        !string.IsNullOrWhiteSpace(pkTmp))
                    {
                        if (!conteo.TryGetValue(pkTmp, out var c)) c = 0;
                        conteo[pkTmp] = c + 1;
                    }
                }

                // Si al menos un punto cayó dentro de alguna región, devolvemos el PK más frecuente
                if (conteo.Count > 0)
                {
                    return conteo
                        .OrderByDescending(kv => kv.Value)
                        .First().Key;
                }

                // Si ninguno de los puntos encontró PK, usamos el comportamiento antiguo
                return GetPkPorMidAntiguo(ent);
            }
            catch
            {
                return string.Empty;
            }
        }

        /// <summary>
        /// Comportamiento antiguo: punto medio y pequeñas tolerancias.
        /// </summary>
        private string GetPkPorMidAntiguo(acDb.Entity ent)
        {
            string pk = "";
            try
            {
                acDb.Extents3d ext = ent.GeometricExtents;
                double cx = (ext.MinPoint.X + ext.MaxPoint.X) / 2.0;
                double cy = (ext.MinPoint.Y + ext.MaxPoint.Y) / 2.0;
                var mid = new acGeo.Point3d(cx, cy, 0);

                PkStore.TryGetPkForPoint(mid, out pk);
                if (string.IsNullOrWhiteSpace(pk))
                {
                    const double eps = 1e-3;
                    if (!PkStore.TryGetPkForPoint(new acGeo.Point3d(mid.X + eps, mid.Y, 0), out pk) ||
                        string.IsNullOrWhiteSpace(pk))
                    {
                        PkStore.TryGetPkForPoint(new acGeo.Point3d(mid.X, mid.Y + eps, 0), out pk);
                    }
                }
            }
            catch
            {
                pk = "";
            }
            return pk ?? string.Empty;
        }

        // Evita duplicar filas en el grid con la misma PK, Ítem e ID_Pol
        private bool ExisteFilaPresupuestal(string pkId, string itemCod, string idPol)
        {
            if (string.IsNullOrWhiteSpace(pkId) ||
                string.IsNullOrWhiteSpace(itemCod) ||
                string.IsNullOrWhiteSpace(idPol))
                return false;

            return _rows.Any(r =>
                string.Equals(r.PK_ID, pkId, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(r.Item, itemCod, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(r.ID_Pol, idPol, StringComparison.OrdinalIgnoreCase));
        }

        // ============================================================
        // Calcula el área REAL "perimetral" de un nodo a partir de la entidad:
        //  - Si es Hatch  → Hatch.Area
        //  - Si es Polyline cerrada → Polyline.Area
        //  - Si es Circle → π·r²
        //  - Si es BlockReference → recorre la definición del bloque
        //    y toma SOLO la geometría de MAYOR área (hatch / pl cerrada / círculo)
        //    como el perímetro externo, multiplicando por la escala X·Y del bloque.
        //  - Otros tipos devuelven 0.0 (el caller usará el bounding box).
        // Requiere la misma Transaction usada para leer la entidad.
        // ============================================================
        private static double CalcularAreaNodoExacta(acDb.Entity ent, acDb.Transaction tr)
        {
            try
            {
                // 1) Casos directos (no bloque)
                switch (ent)
                {
                    case acDb.Hatch h:
                        return h.Area;

                    case acDb.Polyline pl when pl.Closed && pl.Area > 0.0:
                        return pl.Area;

                    case acDb.Circle c:
                        return Math.PI * c.Radius * c.Radius;
                }

                // 2) Caso: BlockReference (bloque del nodo)
                if (ent is acDb.BlockReference br)
                {
                    double maxAreaDef = 0.0;

                    // Definición del bloque (espacio de definición, sin escala)
                    var btrNodo = (acDb.BlockTableRecord)tr.GetObject(
                        br.BlockTableRecord, acDb.OpenMode.ForRead);

                    foreach (acDb.ObjectId idSub in btrNodo)
                    {
                        var objSub = tr.GetObject(idSub, acDb.OpenMode.ForRead, false, true);

                        double aSub = 0.0;

                        if (objSub is acDb.Hatch h2)
                        {
                            aSub = h2.Area;
                        }
                        else if (objSub is acDb.Polyline pl2 && pl2.Closed && pl2.Area > 0.0)
                        {
                            aSub = pl2.Area;
                        }
                        else if (objSub is acDb.Circle c2)
                        {
                            aSub = Math.PI * c2.Radius * c2.Radius;
                        }

                        // Nos quedamos con la geometría de MAYOR área como "perímetro externo"
                        if (aSub > maxAreaDef)
                            maxAreaDef = aSub;
                    }

                    if (maxAreaDef > 0.0)
                    {
                        // Escala del bloque en X/Y
                        double sx = Math.Abs(br.ScaleFactors.X);
                        double sy = Math.Abs(br.ScaleFactors.Y);

                        if (sx > 0.0 && sy > 0.0)
                            return maxAreaDef * sx * sy;

                        return maxAreaDef;
                    }
                }
            }
            catch
            {
                // silencioso: devolvemos 0 y el caller usará el área del bounding box
            }

            return 0.0;
        }

        /// <summary>
        /// Parsea una línea de catálogo del estilo "7.01 - TEXTO (m³)"
        /// en código de ítem, descripción y unidad.
        /// </summary>
        // Parser unificado para líneas del catálogo de nodos / tramos.
        // Formato esperado: "CODIGO - DESCRIPCION (UND)"
        // Ejemplo: "NP-206 - CAJA DE UN (PZ)"
        //          "7.01 - EXCAVACION EN ZANJA (m3)"
        private static void ParseLineaCatalogoNodo(string texto, out string item, out string descripcion, out string und)
        {
            item = "";
            descripcion = "";
            und = "";

            if (string.IsNullOrWhiteSpace(texto))
                return;

            string s = texto.Trim();

            // 1) Extraer UND entre paréntesis al final: "(UND)"
            int pIniPar = s.LastIndexOf('(');
            int pFinPar = s.LastIndexOf(')');

            if (pIniPar >= 0 && pFinPar > pIniPar)
            {
                und = s.Substring(pIniPar + 1, pFinPar - pIniPar - 1).Trim();
                s = s.Substring(0, pIniPar).Trim();
            }

            // 2) CODIGO: todo lo que está ANTES de " - "
            //    Esto conserva "NP-206", "NP-062", "7.01A", etc.
            int idxSep = s.IndexOf(" - ", StringComparison.Ordinal);
            if (idxSep < 0)
            {
                // Si no hay separador, tomamos todo como código
                item = s;
                descripcion = "";
                return;
            }

            item = s.Substring(0, idxSep).Trim();

            // 3) DESCRIPCION: lo que va DESPUÉS de " - "
            descripcion = s.Substring(idxSep + 3).Trim();
        }


        /// <summary>
        /// A partir de una línea de catálogo del formulario de tramos
        /// (formato: "CODIGO - Descripción (Und)") obtiene el PresItem real.
        /// </summary>
        private bool TryGetPresItemFromLinea(string linea, out PresItem? item)
        {
            item = null;
            if (string.IsNullOrWhiteSpace(linea)) return false;

            string cod = linea;
            int idx = linea.IndexOf(" - ", StringComparison.Ordinal);
            if (idx > 0)
                cod = linea.Substring(0, idx).Trim();

            if (string.IsNullOrWhiteSpace(cod)) return false;

            foreach (var obj in cmbItem.Items)
            {
                if (obj is PresItem pi &&
                    string.Equals(pi.Item, cod, StringComparison.OrdinalIgnoreCase))
                {
                    item = pi;
                    return true;
                }
            }

            return false;
        }

        // ==============================================================

        // 1) Parseo numérico tolerante (coma/punto)
        private static double ParseOrZero(string? s)
        {
            if (string.IsNullOrWhiteSpace(s)) return 0.0;
            var t = s.Trim();

            if (t.Contains(",") && t.Contains("."))
            {
                int ic = t.LastIndexOf(',');
                int id = t.LastIndexOf('.');
                t = (ic > id) ? t.Replace(".", "").Replace(',', '.')
                              : t.Replace(",", "");
            }
            else if (t.Contains(",")) t = t.Replace(',', '.');

            return double.TryParse(t, System.Globalization.NumberStyles.Any,
                                   System.Globalization.CultureInfo.InvariantCulture, out var v)
                   ? v : 0.0;
        }

        // 2) Medida de UNA entidad según el tipo elegido (_tipo)
        private double MedidaDe(acDb.Entity ent)
        {
            switch (_tipo)
            {
                case TipoEntidad.Area:
                    if (ent is acDb.Polyline pl && pl.Closed)
                        return AreaFromPolylineOutline(pl);                 // << antes: Math.Abs(pl.Area)
                    if (ent is acDb.Circle cc)                              // por si seleccionas círculo suelto
                        return Math.PI * cc.Radius * cc.Radius;
                    if (ent is acDb.Ellipse el && el.Closed)                // opcional
                        return Math.PI * el.MajorRadius * el.MinorRadius;
                    if (ent is acDb.BlockReference brArea)
                        return AreaDeBloqueConPlCerrada(brArea);            // se actualiza abajo
                    return 0.0;

                case TipoEntidad.Longitud:
                    {
                        var db = acApp.Application.DocumentManager.MdiActiveDocument.Database;
                        using var tr = db.TransactionManager.StartTransaction();

                        if (ent is acDb.Curve cv)
                            return LongitudHorizontalCurve(cv, tr);   // ← AQUÍ: horizontal (XY)

                        if (ent is acDb.BlockReference br)
                            return Math.Abs(PerimetroDeBloque(br));   // ya es 2D

                        return 0.0;
                    }
                case TipoEntidad.Nodo:
                    return 1.0;
            }
            return 0.0;
        }

        /// <summary>
        /// Convierte un área calculada en m² a la unidad del ítem del catálogo (solo Área).
        /// 1 HA = 10 000 m².
        /// </summary>
        private static double AreaM2ParaUndCatalogo(double areaM2, string? und)
        {
            if (EsUnidadHectarea(und))
                return Math.Round(areaM2 / 10000.0, 4, MidpointRounding.AwayFromZero);
            return Math.Round(areaM2, 2, MidpointRounding.AwayFromZero);
        }

        private static bool EsUnidadHectarea(string? und)
        {
            if (string.IsNullOrWhiteSpace(und)) return false;
            var u = und.Trim().ToUpperInvariant()
                .Replace("²", "2").Replace("³", "3")
                .Replace(".", "").Replace(" ", "").Replace("_", "").Replace("-", "");
            return u is "HA" or "HAS" or "HECTAREA" or "HECTAREAS";
        }

        private void LimpiarFormularioParaSiguiente()
        {
            // Info presupuestal
            cmbCapitulo.SelectedIndex = -1;
            cmbCompetencia.SelectedIndex = -1;
            cmbItem.SelectedIndex = -1;
            cmbUnd.SelectedIndex = -1;

            // Parámetros
            //txtCapa.Clear();
            if (string.IsNullOrWhiteSpace(txtAltText.Text)) txtAltText.Text = "0.15";
            txtAncho.Clear();
            txtEspesor.Clear();
            //txtNoInicio.Clear();
            //txtNoFinal.Clear();
            txtObservacion.Clear();
        }

        private void btnGenerarAbscisado_Click(object? sender, EventArgs e)
        {
            try
            {
                // 1. Cargar la lista desde el archivo JSON (Fuente de verdad)
                string jsonPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "SicoeCAD", "axes_v2.json");

                if (!File.Exists(jsonPath))
                {
                    MessageBox.Show(this, "No hay configuración de ejes guardada.\nUse 'CargueEje' y agregue al menos una vía.",
                        "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }

                string jsonContent = File.ReadAllText(jsonPath);
                var listaEjes = JsonConvert.DeserializeObject<List<AxisContext>>(jsonContent);

                if (listaEjes == null || listaEjes.Count == 0)
                {
                    MessageBox.Show(this, "La lista de ejes está vacía.", "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }

                // 2. CONFIGURAR TAMAÑO DE PUNTO (30% del Texto)
                // Leemos la altura que el usuario puso en la caja de texto
                double alturaTexto = ParseOrZero(txtAltText.Text);
                if (alturaTexto <= 0) alturaTexto = 1.0; // Valor base por defecto si está vacío

                double sizePunto = alturaTexto * 0.30; // 30% de la altura del texto

                // Configurar variables de AutoCAD
                // PDMODE 34 = Círculo con X (Visible)
                // PDSIZE > 0 = Tamaño absoluto (unidades de dibujo)
                acApp.Application.SetSystemVariable("PDMODE", 34);
                acApp.Application.SetSystemVariable("PDSIZE", sizePunto);

                // 2. Reconectar con AutoCAD (Convertir Handles a ObjectIds)
                int totalTextos = 0;
                int ejesProcesados = 0;
                int ejesFallidos = 0;

                var db = acApp.Application.DocumentManager.MdiActiveDocument.Database;

                using (var tr = db.TransactionManager.StartTransaction())
                {
                    foreach (var ax in listaEjes)
                    {
                        // Recuperar Calzada A
                        if (!string.IsNullOrWhiteSpace(ax.HandleA))
                        {
                            try { ax.AxisA = db.GetObjectId(false, new acDb.Handle(Convert.ToInt64(ax.HandleA, 16)), 0); }
                            catch { ax.AxisA = acDb.ObjectId.Null; }
                        }

                        // Recuperar Calzada B
                        if (!string.IsNullOrWhiteSpace(ax.HandleB))
                        {
                            try { ax.AxisB = db.GetObjectId(false, new acDb.Handle(Convert.ToInt64(ax.HandleB, 16)), 0); }
                            catch { ax.AxisB = acDb.ObjectId.Null; }
                        }

                        // Recuperar Puntos (Desde las coordenadas guardadas)
                        ax.Pk0A = new acGeo.Point3d(ax.XA, ax.YA, ax.ZA);
                        ax.Pk0B = new acGeo.Point3d(ax.XB, ax.YB, ax.ZB);

                        // Validar si se recuperó algo útil
                        if (ax.AxisA.IsNull && ax.AxisB.IsNull)
                        {
                            ejesFallidos++;
                            continue;
                        }

                        // 3. Dibujar (Pasamos la transacción actual para eficiencia)
                        // IMPORTANTE: DibujarAbscisadoSobreEje debe aceptar la transacción externa o crear una nueva internamente.
                        // Para simplificar, llamamos al método y dejamos que él gestione su transacción si así está diseñado,
                        // o idealmente refactorizamos para pasar 'tr'. 
                        // Como tu método DibujarAbscisadoSobreEje crea su propia transacción, lo llamamos fuera de este using o adaptamos.
                        // -> Vamos a llamarlo fuera del using de recuperación para evitar conflictos de anidamiento si no está preparado.
                    }
                    tr.Commit();
                }

                // 3. Ciclo de dibujo (Transacción por separado para cada eje para seguridad)
                foreach (var ax in listaEjes)
                {
                    if (ax.AxisA.IsNull && ax.AxisB.IsNull) continue; // Skip si falló la recuperación

                    int n = DibujarAbscisadoSobreEje(ax); // Este método usa su propia transacción
                    totalTextos += n;
                    ejesProcesados++;
                }

                MessageBox.Show(this, $"Proceso finalizado.\n\n" +
                                      $"Ejes (Vías) procesados: {ejesProcesados}\n" +
                                      $"Ejes fallidos/no encontrados: {ejesFallidos}\n" +
                                      $"Total textos/marcas: {totalTextos}",
                                      "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "Error crítico: " + ex.Message, "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // =================== LISTADO DE PRECIOS (CSV) ===================

        private void btnAgregar_Click(object sender, EventArgs e)
        {
            try
            {
                if (Commands.Catalogo == null)
                    Commands.SetCatalogo(new List<PresItem>());

                // si necesitas CAD:
                var doc = acApp.Application.DocumentManager.MdiActiveDocument;
                if (doc == null)
                {
                    MessageBox.Show(this, "No hay un dibujo activo en AutoCAD.", "SICOE",
                        MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
                var ed = doc.Editor;

                if (!AcadOpenPathHelper.TryPickOpenFile(
                        "Cargar catálogo SICOE (CSV)",
                        "CSV (*.csv)|*.csv|Todos (*.*)|*.*",
                        out var catPath,
                        Commands.LoadCatalogoPath(),
                        this)
                    || string.IsNullOrWhiteSpace(catPath))
                    return;

                var (items, caps, comps) = LeerCatalogoCsv(catPath);
                if (items.Count == 0)
                {
                    MessageBox.Show("El archivo no contenía ítems válidos.", "SICOE",
                                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }

                Commands.SetCatalogo(items);
                CargarCapitulos();

                Commands.SaveCatalogoPath(catPath);   // ← guarda ÚLTIMA RUTA
                Commands.SaveCatalogoCache(items);         // ← guarda COPIA CACHÉ

                MessageBox.Show(
                    $"Catálogo cargado correctamente.\n" +
                    $"Capítulos: {caps}\nCompetencias: {comps}\nÍtems: {items.Count}",
                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Error al cargar el CSV:\n" + ex.Message,
                                "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void btnBorrar_Click(object sender, EventArgs e)
        {

            // Limpia filas del grid
            DeleteSelectedRows();

            MessageBox.Show(this, "Se limpió la selección y el listado del grid.",
                            "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        // Abre el editor de catálogo
        private void btnEditarCatalogo_Click(object sender, EventArgs e)
        {
            try
            {
                // Garantiza que la lista exista
                if (Commands.Catalogo == null)
                    Commands.SetCatalogo(new List<PresItem>());

                using (var frm = new FrmCatalogoEditor())
                {
                    var r = frm.ShowDialog(this);
                    if (r == DialogResult.OK)
                    {
                        // Como el editor trabaja sobre Commands.Catalogo,
                        // basta refrescar la cascada:
                        CargarCapitulos();
                        MessageBox.Show(this, "Catálogo actualizado correctamente.",
                            "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        Commands.SaveCatalogoCache(Commands.Catalogo); // ← persistir cambios del editor

                    }

                }
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "No fue posible abrir el editor de catálogo.\n" + ex.Message,
                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
        // =================== EXCEL (.xlsx) ===================
        // Botón "Examinar" (elige ruta según 'Crear nuevo' / 'Abrir existente')
        private string _xlsmTargetPath = ""; // Ruta del XLSM seleccionado (sesión actual)

        // =================== XLSM (Plantilla existente) ===================
        private void btnXlsmExaminar_Click(object? sender, EventArgs e)
        {
            // Selección de XLSM eliminada. El flujo es exclusivamente ClaraCore.
        }
        // Botón que permite abrir el formulario para cargar el eje del contrato
        private void btnCargueEje_Click(object? sender, EventArgs e)
        {
            try
            {
                using var f = new FrmCargueEje();
                var r = f.ShowDialog(this);

                // VERIFICACIÓN DE SEGURIDAD: Evita el NullReferenceException
                if (f.Axes == null)
                {
                    // Si por alguna razón la lista es nula, salimos sin error.
                    return;
                }

                if (r == DialogResult.OK && f.Axes.Count > 0)
                {
                    // Usamos el primer eje de la lista como el eje activo principal para cálculos
                    var axisPrincipal = f.Axes.FirstOrDefault();

                    if (axisPrincipal != null)
                    {
                        // Persistir en DWG y Sesión
                        AxisStore.SaveToDwg(axisPrincipal);
                        Commands.SetActiveAxis(axisPrincipal); // Esto actualiza la propiedad _axis automáticamente

                        MessageBox.Show(this, $"Ejes cargados correctamente: {f.Axes.Count}\n\nLas abscisas se calculan automáticamente con el eje más cercano a cada entidad.", "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    }
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "Error al cargar eje: " + ex.Message, "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
        private void btnCrearXlsm_Click(object sender, EventArgs e)
        {
            // Exportación Excel eliminada. El flujo es exclusivamente ClaraCore.
        }
        // ═══════════════════════════════════════════════════════════════════════════
        // INSTRUCCIÓN: Pega este método DENTRO de la clase FrmSicoePresupuesto,
        // junto a los demás event handlers (btn_Click).
        // ═══════════════════════════════════════════════════════════════════════════

        private async void btnSyncExcel_Click(object sender, EventArgs e)
        {
            // Si no hay filas, solo enlazar el worker (sin exportar)
            bool soloEnlazar = _rows.Count == 0;

            using var dlg = new FrmClaraLogin();
            dlg.StartPosition = FormStartPosition.CenterScreen;
            dlg.TopMost = true;                        // garantiza que sea visible
            if (dlg.ShowDialog() != DialogResult.OK) return;   // sin 'this' como owner
            dlg.TopMost = false;

            // ── Arrancar worker de cola CAD ────────────────────────────────
            _cadWorker?.Stop();
            _cadWorker = new CadQueueWorker(dlg.BaseUrl, dlg.TokenTemp, dlg.ContratoId, dlg.UsuarioId);
            _cadWorker.Start();

            btnSyncExcel.Enabled = false;
            var cursor = Cursor;
            Cursor = Cursors.WaitCursor;

            try
            {
                if (soloEnlazar)
                {
                    MessageBox.Show("✅ DWG enlazado con ClaraCore.\nEl semáforo y edición de layers están activos.",
                        "SicoeCAD → ClaraCore", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    btnSyncExcel.Enabled = true; // re-habilitar para futuras sesiones
                }
                else
                {
                    var resultado = await SicoeClaraExporter.ExportAsync(
                                                dlg.BaseUrl,
                                                dlg.TokenTemp,
                                                dlg.ContratoId,
                                                _rows,
                                                dlg.Mode);

                    MessageBox.Show(resultado.mensaje, "SicoeCAD → ClaraCore",
                                    MessageBoxButtons.OK, MessageBoxIcon.Information);

                    // Sync exitoso: limpiar grilla y reiniciar para siguiente lote
                    _sincronizadoExitoso = true;
                    ReiniciarActividadPostExport();
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error al sincronizar:\n\n{ex.Message}",
                    "SicoeCAD → ClaraCore", MessageBoxButtons.OK, MessageBoxIcon.Error);
                // Si falló, re-habilitar para que pueda intentar de nuevo
                btnSyncExcel.Enabled = true;
            }
            finally
            {
                Cursor = cursor;
            }
        }

        // =================== HELPERS – Dibujo/Medidas ===================
        private void ComputeLabelCoordinatesForRows()
        {
            var doc = Autodesk.AutoCAD.ApplicationServices.Core.Application.DocumentManager.MdiActiveDocument;
            if (doc == null) return;

            var db = doc.Database;

            using (doc.LockDocument())
            using (var tr = db.TransactionManager.StartTransaction())
            {
                foreach (var r in _rows)
                {
                    if (TryGetXYFromHandle(db, tr, r.TxtHandle, out var x1, out var y1))
                    {
                        r.X_LABEL = x1;
                        r.Y_LABEL = y1;
                        continue;
                    }

                    if (TryGetXYFromHandle(db, tr, r.EntHandle, out var x2, out var y2))
                    {
                        r.X_LABEL = x2;
                        r.Y_LABEL = y2;
                        continue;
                    }

                    // Si no hay handle utilizable, queda en 0 (exporter puede mandar vacío si quieres)
                    r.X_LABEL = 0;
                    r.Y_LABEL = 0;
                }

                tr.Commit();
            }
        }

        private static bool TryGetXYFromHandle(
            Autodesk.AutoCAD.DatabaseServices.Database db,
            Autodesk.AutoCAD.DatabaseServices.Transaction tr,
            string handleHex,
            out double x,
            out double y)
        {
            x = 0; y = 0;
            if (string.IsNullOrWhiteSpace(handleHex)) return false;

            handleHex = handleHex.Trim();

            try
            {
                // Handle viene en HEX (ej: "1A2F"). Convertimos a long:
                if (!long.TryParse(handleHex, System.Globalization.NumberStyles.HexNumber,
                        System.Globalization.CultureInfo.InvariantCulture, out var hLong))
                    return false;

                var handle = new Autodesk.AutoCAD.DatabaseServices.Handle(hLong);
                var id = db.GetObjectId(false, handle, 0);

                if (id.IsNull || id.IsErased) return false;

                var obj = tr.GetObject(id, Autodesk.AutoCAD.DatabaseServices.OpenMode.ForRead, false);

                // Preferencias: DBText / MText / BlockReference / Entity center
                if (obj is Autodesk.AutoCAD.DatabaseServices.DBText t)
                {
                    x = t.Position.X;
                    y = t.Position.Y;
                    return true;
                }

                if (obj is Autodesk.AutoCAD.DatabaseServices.MText mt)
                {
                    x = mt.Location.X;
                    y = mt.Location.Y;
                    return true;
                }

                if (obj is Autodesk.AutoCAD.DatabaseServices.BlockReference br)
                {
                    x = br.Position.X;
                    y = br.Position.Y;
                    return true;
                }

                if (obj is Autodesk.AutoCAD.DatabaseServices.Entity ent)
                {
                    try
                    {
                        var ext = ent.GeometricExtents;
                        x = (ext.MinPoint.X + ext.MaxPoint.X) / 2.0;
                        y = (ext.MinPoint.Y + ext.MaxPoint.Y) / 2.0;
                        return true;
                    }
                    catch
                    {
                        // Algunas entidades pueden no tener extents
                        return false;
                    }
                }

                return false;
            }
            catch
            {
                return false;
            }
        }
        private string PrefijoCap5()
        {
            var cap = cmbCapitulo.SelectedItem?.ToString() ?? "";
            var solo = new string(cap.Where(char.IsLetterOrDigit).ToArray());
            if (solo.Length > 5) solo = solo.Substring(0, 5);
            return string.IsNullOrWhiteSpace(solo) ? "CAP00" : solo.ToUpperInvariant();
        }
        private string PrefijoCom5()
        {
            var com = cmbCompetencia.SelectedItem?.ToString() ?? "";
            var solocom = new string(com.Where(char.IsLetterOrDigit).ToArray());
            if (solocom.Length > 5) solocom = solocom.Substring(0, 5);
            return string.IsNullOrWhiteSpace(solocom) ? "COM00" : solocom.ToUpperInvariant();
        }
        private void AsegurarCapa(string nombre, Autodesk.AutoCAD.Colors.Color color, bool apagar)
        {
            var doc = acApp.Application.DocumentManager.MdiActiveDocument;
            var db = doc.Database;

            using (var tr = db.TransactionManager.StartTransaction())
            {
                var lt = (acDb.LayerTable)tr.GetObject(db.LayerTableId, acDb.OpenMode.ForRead);

                acDb.ObjectId layerId;

                if (!lt.Has(nombre))
                {
                    // Crear nuevo layer SI NO EXISTE
                    lt.UpgradeOpen();
                    var layer = new acDb.LayerTableRecord
                    {
                        Name = nombre,
                        Color = color
                    };
                    layerId = lt.Add(layer);
                    tr.AddNewlyCreatedDBObject(layer, true);
                }
                else
                {
                    // Obtener layer existente
                    layerId = lt[nombre];
                    var layer = (acDb.LayerTableRecord)tr.GetObject(layerId, acDb.OpenMode.ForWrite);

                    // Si la capa estaba encendida, la apagamos
                    layer.IsOff = true;

                    // Actualizamos el color para mantener coherencia
                    layer.Color = color;
                }

                // Independientemente del estado previo, si apagar == true la capa queda apagada
                if (apagar)
                {
                    var layer = (acDb.LayerTableRecord)tr.GetObject(layerId, acDb.OpenMode.ForWrite);
                    layer.IsOff = true;
                }

                tr.Commit();
            }
        }

        private void TomarPreseleccion()
        {
            _selIds.Clear();

            var ed = acApp.Application.DocumentManager.MdiActiveDocument.Editor;
            var sel = ed.SelectImplied();

            if (sel.Status != acEd.PromptStatus.OK || sel.Value == null)
                return;

            var ids = sel.Value.GetObjectIds();

            var db = acApp.Application.DocumentManager.MdiActiveDocument.Database;
            using var tr = db.TransactionManager.StartTransaction();

            foreach (var id in ids)
            {
                if (tr.GetObject(id, acDb.OpenMode.ForRead, false, true) is not acDb.Entity ent) continue;

                bool ok = _tipo switch
                {
                    TipoEntidad.Area =>
                        (ent is acDb.Polyline pl && pl.Closed) ||
                        (ent is acDb.Circle) ||
                        (ent is acDb.Ellipse el && el.Closed) ||
                        (ent is acDb.BlockReference),
                    TipoEntidad.Longitud => ent is acDb.Polyline || ent is acDb.Line || ent is acDb.Polyline3d || ent is acDb.BlockReference,
                    TipoEntidad.Nodo => ent is acDb.DBPoint || ent is acDb.BlockReference,
                    _ => false
                };

                if (ok) _selIds.Add(id);
            }

            tr.Commit();

            if (_selIds.Count > 0) Resaltar(_selIds, true);
        }


        private bool TryComputeAbsIniFin(
            acDb.Entity ent,
            AxisContext ctx,
            char prefCalz,
            out string absIni,
            out string absFin,
            out bool dentro)
        {
            absIni = "";
            absFin = "";
            dentro = false;

            if (ent == null || ctx == null || ctx.AxisA.IsNull)
                return false;

            // 1) Muestreamos TODOS los puntos de la entidad
            var db = acApp.Application.DocumentManager.MdiActiveDocument.Database;
            List<acGeo.Point3d> puntos;

            using (var tr = db.TransactionManager.StartTransaction())
            {
                // Usa la función pública de AxisMath
                puntos = AxisMath.SampleEntityPoints(ent, tr, 1.0).ToList();
                tr.Commit();
            }

            if (puntos.Count == 0)
                return false;

            // 2) Determinar calzada de REFERENCIA usando el centro geométrico
            acGeo.Point3d centro;
            try
            {
                var ext = ent.GeometricExtents;
                centro = new acGeo.Point3d(
                    0.5 * (ext.MinPoint.X + ext.MaxPoint.X),
                    0.5 * (ext.MinPoint.Y + ext.MaxPoint.Y),
                    0.0   // Z = 0 siempre
                );
            }
            catch
            {
                // Si falla el bbox, tomamos el primer punto muestreado, aplanado
                var p0 = puntos[0];
                centro = new acGeo.Point3d(p0.X, p0.Y, 0.0);
            }

            // Usar la versión con preferencia de calzada (prefCalz viene del flujo de Agritem)
            var pkCentroOpt = AxisMath.ComputePkAndOffset_Point(centro, ctx, prefCalz);
            if (!pkCentroOpt.HasValue)
                return false;

            var pkCentro = pkCentroOpt.Value;
            string calzadaRef = pkCentro.Calzada;    // ahora respeta la calzada escogida

            double pkMin = double.MaxValue;
            double pkMax = double.MinValue;
            bool anyInside = false;

            // 3) Recorremos TODOS los puntos pero
            //    SOLO usamos los que caen en la MISMA calzada del centro.
            foreach (var p in puntos)
            {
                var pkResOpt = AxisMath.ComputePkAndOffset_Point(p, ctx);
                if (!pkResOpt.HasValue)
                    continue;

                var r = pkResOpt.Value;

                // Solo aceptamos puntos de la misma calzada que el centro
                if (!string.Equals(r.Calzada, calzadaRef, StringComparison.OrdinalIgnoreCase))
                    continue;

                // Actualizar rango PK
                pkMin = Math.Min(pkMin, r.Pk);
                pkMax = Math.Max(pkMax, r.Pk);

                // Verificar que al menos UN punto está dentro de las ordenadas
                if (AxisMath.IsInsideOrdenada(r, ctx))
                    anyInside = true;
            }

            if (!anyInside || pkMin == double.MaxValue || pkMax == double.MinValue)
                return false;

            absIni = PkFormatter.ToPkString(pkMin);
            absFin = PkFormatter.ToPkString(pkMax);
            dentro = true;
            return true;
        }


        // =================== CSV lector ===================

        private (List<PresItem> items, int caps, int comps) LeerCatalogoCsv(string path)
        {
            var items = new List<PresItem>();
            var enc = GetBestCsvEncoding(path);

            IEnumerable<string> lines;
            try { lines = ReadLinesShared(path, enc); }
            catch (IOException)
            {
                var tmp = Path.GetTempFileName();
                File.Copy(path, tmp, true);
                lines = File.ReadLines(tmp, enc);
                try { File.Delete(tmp); } catch { }
            }

            int lineNo = 0;
            int idxCap = 0, idxCom = 1, idxItem = 2, idxDesc = 3, idxUnd = 4, idxVU = 5, idxHex = -1;
            bool hasHeader = false;

            foreach (var raw in lines)
            {
                lineNo++;
                var line = raw?.Trim();
                if (string.IsNullOrWhiteSpace(line)) continue;

                // split tolerante
                string[] p = line.Split(';');
                if (p.Length < 6) p = line.Split(',');
                if (p.Length < 6) continue;

                if (lineNo == 1)
                {
                    // ¿encabezados?
                    var low = string.Join("|", p).ToLowerInvariant();
                    if (low.Contains("cap") && low.Contains("item") && (low.Contains("und") || low.Contains("unidad")))
                    {
                        hasHeader = true;
                        var map = p
                            .Select((s, i) => new { k = (s ?? "").Trim().ToLowerInvariant(), i })
                            .ToDictionary(x => x.k, x => x.i);

                        int Get(string key, int def)
                            => map.TryGetValue(key, out var ix) ? ix : def;

                        idxCap = Get("capitulo", 0);
                        idxCom = Get("competencia", 1);
                        idxItem = Get("item", 2);
                        idxDesc = Get("descripcion", 3);
                        idxUnd = Get("und", 4);
                        idxVU = Get("valorunitario", 5);
                        idxHex = map.ContainsKey("colorhex") ? map["colorhex"] : -1;
                        continue; // saltar cabecera
                    }
                }

                string cap = FixUtf8Mojibake(p.ElementAtOrDefault(idxCap)?.Trim() ?? "");
                string comp = FixUtf8Mojibake(p.ElementAtOrDefault(idxCom)?.Trim() ?? "");
                string item = FixUtf8Mojibake(p.ElementAtOrDefault(idxItem)?.Trim() ?? "");
                string desc = FixUtf8Mojibake(p.ElementAtOrDefault(idxDesc)?.Trim() ?? "");
                string und = FixUtf8Mojibake(p.ElementAtOrDefault(idxUnd)?.Trim() ?? "");
                decimal vu = ParseDecimalSafe(p.ElementAtOrDefault(idxVU) ?? "");
                string? hex = idxHex >= 0 ? (p.ElementAtOrDefault(idxHex)?.Trim()) : null;

                items.Add(new PresItem
                {
                    Capitulo = cap,
                    Competencia = comp,
                    Item = item,
                    Descripcion = desc,
                    Und = und,
                    ValorUnitario = vu,
                    ColorHex = string.IsNullOrWhiteSpace(hex) ? null : hex.ToUpperInvariant()
                });
            }

            int caps = items.Select(x => x.Capitulo).Where(s => !string.IsNullOrWhiteSpace(s)).Distinct().Count();
            int comps = items.Select(x => x.Competencia).Where(s => !string.IsNullOrWhiteSpace(s)).Distinct().Count();
            return (items, caps, comps);
        }

        private void btnCapasCsv_Click(object sender, EventArgs e)
        {
            // pasar lo que YA está en memoria y la ruta del DWG al popup
            var init = _capasFull?.ToList() ?? new List<CapaInfo>();
            var rutaDwg = CapasStore.LoadPathFromDwg() ?? "";

            var frm = new FrmCapasCsvPopup(init, rutaDwg);
            frm.TopMost = false;
            frm.FormClosed += (s, ea) =>
            {
                if (frm.DialogResult != DialogResult.OK) return;
                _capasFull = frm.CapasCargadas?.ToList() ?? new List<CapaInfo>();
                Commands.SetCapas(_capasFull);
                if (!string.IsNullOrWhiteSpace(frm.UltimaRuta))
                    CapasStore.SavePathToDwg(frm.UltimaRuta);
                MessageBox.Show(this, $"Capas cargadas: {_capasFull.Count}", "SICOE",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
            };
            frm.Show();
        }

        private static List<CapaInfo> LeerCapasCsv(string path)
        {
            var list = new List<CapaInfo>();
            List<string> lines;

            try
            {
                var enc = GetBestCsvEncoding(path);
                lines = ReadLinesShared(path, enc)
                    .Where(l => !string.IsNullOrWhiteSpace(l))
                    .ToList();
            }
            catch (IOException)
            {
                var tmp = Path.Combine(Path.GetTempPath(), $"capas_{Guid.NewGuid():N}.csv");
                File.Copy(path, tmp, true);
                var enc = GetBestCsvEncoding(path);
                lines = File.ReadAllLines(tmp, enc)
                    .Where(l => !string.IsNullOrWhiteSpace(l))
                    .ToList();
                try { File.Delete(tmp); } catch { /* no crítico */ }
            }

            if (lines.Count == 0) return list;

            char delim = DetectCapasCsvDelimiter(lines[0]);
            int start = 0;
            Dictionary<string, int>? map = null;

            var h0 = SplitCapasCsvLine(lines[0], delim);
            var low0 = string.Join("|", h0).ToLowerInvariant();
            bool looksHeader = (low0.Contains("capa") || low0.Contains("pk_id") || low0.Contains("pkid") || low0.Contains("pk-id"))
                && (low0.Contains("tramo") || low0.Contains("ubicacion") || low0.Contains("infra"));

            if (looksHeader)
            {
                map = BuildCapasHeaderMap(h0);
                start = 1;
            }

            string Get(string[] p, params string[] keys)
            {
                if (map != null)
                {
                    foreach (var key in keys)
                    {
                        if (map.TryGetValue(key, out int idx) && idx >= 0 && idx < p.Length)
                            return (p[idx] ?? "").Trim();
                    }
                }
                return "";
            }

            for (int i = start; i < lines.Count; i++)
            {
                var p = SplitCapasCsvLine(lines[i], delim);
                if (p.Length == 0) continue;

                var c = map != null
                    ? new CapaInfo
                    {
                        CAPA = Get(p, "capa", "pk_id", "pkid", "pk-id", "pk"),
                        CIV = Get(p, "civ"),
                        TRAMO = Get(p, "tramo"),
                        INFRAESTRUCTURA = Get(p, "infraestructura", "infra"),
                        COSTADO = Get(p, "costado"),
                        UBICACION = Get(p, "ubicacion", "ubicación"),
                        ABS_INICIO = Get(p, "abs_inicio", "abs inicio", "absini"),
                        ABS_FINAL = Get(p, "abs_final", "abs final", "absfin"),
                        CALZADA = Get(p, "calzada"),
                    }
                    : new CapaInfo
                    {
                        CAPA = p.ElementAtOrDefault(0)?.Trim() ?? "",
                        CIV = p.ElementAtOrDefault(1)?.Trim() ?? "",
                        TRAMO = p.ElementAtOrDefault(2)?.Trim() ?? "",
                        INFRAESTRUCTURA = p.ElementAtOrDefault(3)?.Trim() ?? "",
                        COSTADO = p.ElementAtOrDefault(4)?.Trim() ?? "",
                        UBICACION = p.ElementAtOrDefault(5)?.Trim() ?? "",
                        ABS_INICIO = p.ElementAtOrDefault(6)?.Trim() ?? "",
                        ABS_FINAL = p.ElementAtOrDefault(7)?.Trim() ?? "",
                        CALZADA = p.ElementAtOrDefault(8)?.Trim() ?? "",
                    };

                if (!string.IsNullOrWhiteSpace(c.CAPA))
                    list.Add(c);
            }
            return list;
        }

        private static char DetectCapasCsvDelimiter(string firstLine)
        {
            int sc = firstLine.Count(ch => ch == ';');
            int cc = firstLine.Count(ch => ch == ',');
            return sc > cc ? ';' : ',';
        }

        private static string[] SplitCapasCsvLine(string line, char delim)
        {
            var parts = new List<string>();
            if (string.IsNullOrEmpty(line)) return Array.Empty<string>();

            var sb = new StringBuilder();
            bool inQuotes = false;
            for (int i = 0; i < line.Length; i++)
            {
                char ch = line[i];
                if (ch == '"')
                {
                    if (inQuotes && i + 1 < line.Length && line[i + 1] == '"')
                    {
                        sb.Append('"');
                        i++;
                    }
                    else inQuotes = !inQuotes;
                    continue;
                }
                if (ch == delim && !inQuotes)
                {
                    parts.Add(sb.ToString().Trim());
                    sb.Clear();
                    continue;
                }
                sb.Append(ch);
            }
            parts.Add(sb.ToString().Trim());
            return parts.ToArray();
        }

        private static Dictionary<string, int> BuildCapasHeaderMap(string[] headers)
        {
            var map = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            for (int i = 0; i < headers.Length; i++)
            {
                var k = (headers[i] ?? "").Trim().ToLowerInvariant()
                    .Replace(" ", "_")
                    .Replace("á", "a").Replace("é", "e").Replace("í", "i").Replace("ó", "o").Replace("ú", "u");
                if (k.Length == 0) continue;
                if (!map.ContainsKey(k)) map[k] = i;

                if ((k is "pk" or "pk_id" or "pkid" or "pk-id") && !map.ContainsKey("capa"))
                    map["capa"] = i;
            }
            return map;
        }

        private static decimal ParseDecimalSafe(string s)
        {
            if (string.IsNullOrWhiteSpace(s)) return 0m;
            s = s.Trim();

            if (s.Contains(",") && s.Contains("."))
            {
                int lastComma = s.LastIndexOf(',');
                int lastDot = s.LastIndexOf('.');
                if (lastComma > lastDot) s = s.Replace(".", "").Replace(',', '.');
                else s = s.Replace(",", "");
            }
            else if (s.Contains(",")) s = s.Replace(',', '.');

            return decimal.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture, out var val) ? val : 0m;
        }

        // =================== UTILIDADES GENERALES ===================

        private static bool TryParseDouble(string? s, out double v)
        {
            v = 0;
            if (string.IsNullOrWhiteSpace(s)) return false;
            var t = s.Trim();

            if (t.Contains(",") && t.Contains("."))
            {
                int lc = t.LastIndexOf(',');
                int ld = t.LastIndexOf('.');
                if (lc > ld) t = t.Replace(".", "").Replace(',', '.');
                else t = t.Replace(",", "");
            }
            else if (t.Contains(",")) t = t.Replace(',', '.');

            return double.TryParse(t, NumberStyles.Any, CultureInfo.InvariantCulture, out v);
        }

        private static string ToSentenceCase(string? s)
        {
            if (string.IsNullOrWhiteSpace(s)) return "";
            s = s.Trim();
            return char.ToUpper(s[0]) + (s.Length > 1 ? s.Substring(1).ToLowerInvariant() : "");
        }

        // Centro robusto del bbox (con fallback por tipo)
        private static Autodesk.AutoCAD.Geometry.Point3d CentroDeSeguro(Autodesk.AutoCAD.DatabaseServices.Entity ent)
        {
            try
            {
                var ext = ent.GeometricExtents; // puede lanzar cuando los extents no están listos
                return new Autodesk.AutoCAD.Geometry.Point3d(
                    (ext.MinPoint.X + ext.MaxPoint.X) * 0.5,
                    (ext.MinPoint.Y + ext.MaxPoint.Y) * 0.5,
                    (ext.MinPoint.Z + ext.MaxPoint.Z) * 0.5
                );
            }
            catch
            {
                switch (ent)
                {
                    case Autodesk.AutoCAD.DatabaseServices.Polyline pl:
                        {
                            if (pl.NumberOfVertices == 0) return Autodesk.AutoCAD.Geometry.Point3d.Origin;
                            double minX = double.PositiveInfinity, minY = double.PositiveInfinity, minZ = 0;
                            double maxX = double.NegativeInfinity, maxY = double.NegativeInfinity, maxZ = 0;
                            for (int i = 0; i < pl.NumberOfVertices; i++)
                            {
                                var p = pl.GetPoint3dAt(i);
                                if (p.X < minX) minX = p.X; if (p.Y < minY) minY = p.Y; if (p.Z < minZ) minZ = p.Z;
                                if (p.X > maxX) maxX = p.X; if (p.Y > maxY) maxY = p.Y; if (p.Z > maxZ) maxZ = p.Z;
                            }
                            return new Autodesk.AutoCAD.Geometry.Point3d(
                                (minX + maxX) * 0.5,
                                (minY + maxY) * 0.5,
                                (minZ + maxZ) * 0.5
                            );
                        }

                    case Autodesk.AutoCAD.DatabaseServices.Line ln:
                        return new Autodesk.AutoCAD.Geometry.Point3d(
                            (ln.StartPoint.X + ln.EndPoint.X) * 0.5,
                            (ln.StartPoint.Y + ln.EndPoint.Y) * 0.5,
                            (ln.StartPoint.Z + ln.EndPoint.Z) * 0.5
                        );

                    case Autodesk.AutoCAD.DatabaseServices.BlockReference br:
                        return br.Position;

                    default:
                        return Autodesk.AutoCAD.Geometry.Point3d.Origin;
                }
            }
        }
        // ---------- Helpers Excel y utilidades ----------

        // ---------- EXCEL: headers, nombres y utilidades (ÚNICO BLOQUE) ----------
        private static readonly string[] _xlsxHeaders = new[]
        {
        "Pk_Id","Capitulo","Competencia","Item","Descripción","Und","Calzada","Tramo","Abs. Inicio","Abs. Final",
        "Vlr Unitario","No. Inicio","No. Final","Area/Long/Nod","Ancho","Espesor","Cant.Total",
        "Costo Directo","Tipo de Ejecución","Tipo de Entidad","ID_Pol","Observación",
        // ==== NUEVO: columnas de soporte externo ====
        "Remitente","Fecha Soporte","Asunto Soporte","Link Soporte",
        // ==== (lo que ya tenías) sincronización CAD ====
        "EntHandle","TxtHandle","LayerEnt","LayerTxt","ColorHex","GUID"
    };


        // Nombre de hoja válido (máx 31, sin : \ / ? * [ ])
        private static string MakeSafeSheetName(string? raw)
        {
            string s = (raw ?? "").Trim();
            foreach (char ch in ":\\/?*[]") s = s.Replace(ch.ToString(), "");
            if (s.Length == 0) s = "Hoja";
            if (s.Length > 31) s = s.Substring(0, 31);
            return s;
        }


        // Best-effort: si el archivo está abierto, solo aviso (sin Marshal/COM)
        private static void TryCloseWorkbookIfOpen(string path)
        {
            if (!File.Exists(path)) return;

            try
            {
                using var fs = new FileStream(path, FileMode.Open, FileAccess.ReadWrite, FileShare.None);
                // Si abre aquí, no estaba bloqueado
            }
            catch
            {
                MessageBox.Show("El archivo Excel parece estar abierto. Ciérralo y vuelve a intentar.",
                                "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
        // Contador persistente --------------------------------
        private static string CounterFilePath =>
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                         "SICOE", "contador.txt");

        private static int LoadGlobalCounter()
        {
            try
            {
                var dir = Path.GetDirectoryName(CounterFilePath)!;
                if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                if (!File.Exists(CounterFilePath)) { File.WriteAllText(CounterFilePath, "1"); return 1; }
                if (int.TryParse(File.ReadAllText(CounterFilePath).Trim(), out int n) && n > 0) return n;
            }
            catch { }
            return 1;
        }

        private static void SaveGlobalCounter(int next)
        {
            try
            {
                var dir = Path.GetDirectoryName(CounterFilePath)!;
                if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                File.WriteAllText(CounterFilePath, Math.Max(1, next).ToString());
            }
            catch { /* no crítico */ }
        }
        // Texto que mostramos/buscamos

        private void cmbItem_TextUpdate(object? sender, EventArgs e)
        {
            if (_isFiltering) return;
            ApplyItemFilter(cmbItem.Text);
        }

        // Pausa repintado del ComboBox durante el llenado
        private sealed class ComboUpdateScope : IDisposable
        {
            private readonly ComboBox _combo;
            public ComboUpdateScope(ComboBox combo)
            {
                _combo = combo;
                _combo.BeginUpdate();
            }
            public void Dispose() => _combo.EndUpdate();
        }
        private void Frm_KeyDown_Lic(object? sender, System.Windows.Forms.KeyEventArgs e)
        {
            if (e.Control && e.Shift && e.KeyCode == System.Windows.Forms.Keys.Delete)
            {
                LicenseService.ResetAndPrompt(this); // resetea y abre
                e.Handled = true;
            }
            if (e.Control && e.KeyCode == System.Windows.Forms.Keys.L)
            {
                LicenseService.ShowAdminDialog(this, force: true); // abrir siempre
                e.Handled = true;
            }
        }
        // ===== Persistencia de colores recientes / personalizados =====
        private static string ColorsFilePath =>
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                         "SICOE", "recent_colors.json");

        private static List<Color> _recentColors = new(); // máx. 16

        private void DeleteSelectedRows()
        {
            if (dgvPrecargados == null || dgvPrecargados.SelectedRows.Count == 0)
            {
                MessageBox.Show(this, "Selecciona una fila para borrar.", "SICOE",
                                MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            // Confirma (opcional)
            var ask = MessageBox.Show(this, "¿Eliminar la fila seleccionada?", "SICOE",
                                      MessageBoxButtons.YesNo, MessageBoxIcon.Question);
            if (ask != DialogResult.Yes) return;

            // Obtén el objeto de la fila seleccionada y quítalo de la lista
            var row = dgvPrecargados.SelectedRows[0];
            if (row.DataBoundItem is GridRow model)
            {
                int idx = row.Index;           // para reubicar selección
                _rows.Remove(model);           // esto refresca el grid

                // Dejar seleccionada la siguiente fila (si existe), para mejor UX
                if (_rows.Count > 0)
                {
                    int next = Math.Min(idx, _rows.Count - 1);
                    dgvPrecargados.ClearSelection();
                    dgvPrecargados.Rows[next].Selected = true;
                }
            }
        }
        private static acCol.Color _negro => acCol.Color.FromRgb(0, 0, 0);

        private void AsegurarCapaOn(string nombre)
        {
            // versión encendida para ejes/texto
            var db = acApp.Application.DocumentManager.MdiActiveDocument.Database;
            using var tr = db.TransactionManager.StartTransaction();
            var lt = (acDb.LayerTable)tr.GetObject(db.LayerTableId, acDb.OpenMode.ForRead);
            if (!lt.Has(nombre))
            {
                lt.UpgradeOpen();
                var ltr = new acDb.LayerTableRecord
                {
                    Name = nombre,
                    Color = _negro,
                    IsOff = false
                };
                lt.Add(ltr);
                tr.AddNewlyCreatedDBObject(ltr, true);
            }
            else
            {
                var id = lt[nombre];
                if (tr.GetObject(id, acDb.OpenMode.ForWrite) is acDb.LayerTableRecord ex)
                    ex.IsOff = false;
            }
            tr.Commit();
        }
        private int DibujarAbscisadoSobreEje(AxisContext ctx)
        {
            int total = 0;
            double intervalo = Math.Max(0.01, ctx.IntervaloPk);
            double altura = ParseOrZero(txtAltText.Text);
            if (altura <= 0) altura = 2.0; // AUMENTAR tamaño por defecto a 2.0 para visibilidad

            // Nombres de capas
            string capaEjeA = ctx.IsDouble ? "EJE_CALZ_A" : "EJE_UNICA";
            string capaTxtA = ctx.IsDouble ? "Txt_Abs_CalzA" : "Txt_Abs_Unica";
            string capaEjeB = "EJE_CALZ_B";
            string capaTxtB = "Txt_Abs_CalzB";

            // Asegurar capas ENCENDIDAS y con color visible
            AsegurarCapaOn(capaEjeA);
            AsegurarCapaOn(capaTxtA);
            if (ctx.IsDouble) { AsegurarCapaOn(capaEjeB); AsegurarCapaOn(capaTxtB); }

            var doc = acApp.Application.DocumentManager.MdiActiveDocument;
            var db = doc.Database;

            using (var tr = db.TransactionManager.StartTransaction())
            {
                var btr = (acDb.BlockTableRecord)tr.GetObject(db.CurrentSpaceId, acDb.OpenMode.ForWrite);

                // Calzada A
                if (!ctx.AxisA.IsNull && ctx.AxisA.IsValid)
                {
                    var ejeA = tr.GetObject(ctx.AxisA, acDb.OpenMode.ForWrite) as acDb.Curve;
                    if (ejeA != null)
                    {
                        ejeA.Layer = capaEjeA; // Mueve el eje a su capa
                        total += DibujarAbscisadoDeCalzada(ejeA, ctx.Pk0DistA, ctx.AbsInicioA, intervalo, altura, capaTxtA, btr, tr);
                    }
                }

                // Calzada B
                if (ctx.IsDouble && !ctx.AxisB.IsNull && ctx.AxisB.IsValid)
                {
                    var ejeB = tr.GetObject(ctx.AxisB, acDb.OpenMode.ForWrite) as acDb.Curve;
                    if (ejeB != null)
                    {
                        ejeB.Layer = capaEjeB; // Mueve el eje a su capa
                        total += DibujarAbscisadoDeCalzada(ejeB, ctx.Pk0DistB, ctx.AbsInicioB, intervalo, altura, capaTxtB, btr, tr);
                    }
                }

                tr.Commit();
            }

            // Forzar regeneración visual
            doc.Editor.Regen();

            return total;
        }
        private int DibujarAbscisadoDeCalzada(
                    acDb.Curve eje,
                    double pk0Dist,
                    double absInicio,
                    double intervalo,
                    double altura,
            string capaTxt,
            acDb.BlockTableRecord btr,
            acDb.Transaction tr)
        {
            int count = 0;

            double dStart = 0.0;
            double dEnd = eje.GetDistanceAtParameter(eje.EndParam);

            var distList = new List<double>();
            // extremos
            distList.Add(dStart);
            distList.Add(dEnd);

            // Primera marca: siguiente múltiplo del intervalo considerando absInicio
            // Ej: absInicio=3917, intervalo=10 → primer múltiplo = 3920
            // La distancia en el eje que corresponde a 3920 es:
            // pk0Dist + (3920 - absInicio) = pk0Dist + 3
            double primeraAbscisa = Math.Ceiling(absInicio / intervalo) * intervalo;
            double offsetPrimera = primeraAbscisa - absInicio; // metros desde pk0Dist

            // Siempre crecer desde pk0Dist hacia ambos lados en distancia absoluta
            // hacia adelante
            for (double off = offsetPrimera; off <= (dEnd - pk0Dist) + 1e-7; off += intervalo)
            {
                double d = pk0Dist + off;
                if (d >= dStart - 1e-7 && d <= dEnd + 1e-7)
                    distList.Add(Math.Max(dStart, Math.Min(dEnd, d)));
            }
            // hacia atrás (por si pk0 no está al inicio del eje)
            for (double off = offsetPrimera - intervalo; off >= -(pk0Dist - dStart) - 1e-7; off -= intervalo)
            {
                double d = pk0Dist + off;
                if (d >= dStart - 1e-7 && d <= dEnd + 1e-7)
                    distList.Add(Math.Max(dStart, Math.Min(dEnd, d)));
            }

            distList = distList.Distinct().OrderBy(x => x).ToList();

            foreach (var d in distList)
            {
                // clamp seguro
                double dSafe = Math.Max(dStart + 1e-9, Math.Min(dEnd - 1e-9, d));
                double par = eje.GetParameterAtDistance(dSafe);
                var p = eje.GetPointAtParameter(par);
                var tan = eje.GetFirstDerivative(par);

                // Perpendicular (+90°)
                double ang = Math.Atan2(tan.Y, tan.X);
                double rot = ang + Math.PI / 2.0;

                // Si queda cabeza-abajo, lo giro 180°
                if (rot > Math.PI / 2 || rot < -Math.PI / 2)
                    rot += Math.PI;

                // Desfase hacia la normal (~0.8*altura)
                var normalUnit = new acGeo.Vector3d(-tan.Y, tan.X, 0).GetNormal();
                var pDesfasado = p + normalUnit.MultiplyBy(altura * 0.8);

                // Texto PK relativo a PK0
                double pkMeters = Math.Abs(dSafe - pk0Dist) + absInicio;
                string pkStr = PkFormatter.ToPkString(pkMeters);

                // === PUNTOS (DBPoint) ===
                var punto = new acDb.DBPoint(); // 1. Crear
                btr.AppendEntity(punto);        // 2. Añadir al espacio
                tr.AddNewlyCreatedDBObject(punto, true); // 3. Añadir a la transacción

                // 4. AHORA SÍ podemos configurar propiedades
                punto.Position = p;
                punto.Layer = capaTxt;

                // === TEXTOS (DBText) ===
                var dbt = new acDb.DBText();    // 1. Crear
                btr.AppendEntity(dbt);          // 2. Añadir al espacio
                tr.AddNewlyCreatedDBObject(dbt, true); // 3. Añadir a la transacción

                // 4. AHORA SÍ podemos configurar propiedades y llamar a SetDatabaseDefaults
                dbt.SetDatabaseDefaults(); // <-- Esta línea fallaba antes porque el objeto no estaba en la DB
                dbt.TextString = pkStr;
                dbt.Height = altura;
                dbt.Layer = capaTxt;
                dbt.HorizontalMode = acDb.TextHorizontalMode.TextCenter;
                dbt.VerticalMode = acDb.TextVerticalMode.TextVerticalMid;
                dbt.AlignmentPoint = pDesfasado;
                dbt.Position = pDesfasado;
                dbt.Rotation = rot;

                count++;
            }
            return count;
        }
        // Clona PROFUNDO (deep clone) al espacio actual. Mantiene atributos de bloques, XData, etc.
        private static List<Autodesk.AutoCAD.DatabaseServices.ObjectId> DeepCloneToCurrentSpace(
            IEnumerable<Autodesk.AutoCAD.DatabaseServices.ObjectId> sourceIds)
        {
            var result = new List<Autodesk.AutoCAD.DatabaseServices.ObjectId>();
            var db = Autodesk.AutoCAD.ApplicationServices.Application.DocumentManager.MdiActiveDocument.Database;

            using var tr = db.TransactionManager.StartTransaction();
            var btrTarget = (Autodesk.AutoCAD.DatabaseServices.BlockTableRecord)
                tr.GetObject(db.CurrentSpaceId, Autodesk.AutoCAD.DatabaseServices.OpenMode.ForWrite);

            var idCol = new Autodesk.AutoCAD.DatabaseServices.ObjectIdCollection(sourceIds.ToArray());
            var map = new Autodesk.AutoCAD.DatabaseServices.IdMapping();

            // DeepClone: coloca los clones dentro del BlockTableRecord destino (espacio actual)
            db.DeepCloneObjects(idCol, btrTarget.ObjectId, map, false);

            // Recoger los ObjectId resultantes desde el mapping
            foreach (Autodesk.AutoCAD.DatabaseServices.IdPair pair in map)
            {
                if (pair.IsCloned && !pair.Value.IsNull && pair.Value.IsValid)
                    result.Add(pair.Value);
            }

            tr.Commit();
            return result;
        }

        // === Helper: lectura "tolerante" de CSVs abiertos ===
        private static Encoding GetBestCsvEncoding(string path)
        {
            // Habilita Windows-1252 / codepages en .NET moderno (VS2022 / .NET 6/7/8)
        #if NET8_0_OR_GREATER
                    try { Encoding.RegisterProvider(CodePagesEncodingProvider.Instance); } catch { }
        #endif

            // Leer una muestra (tolera CSV abierto en Excel/OneDrive)
            byte[] sample;
            using (var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            {
                int max = (int)Math.Min(fs.Length, 128 * 1024); // 128KB
                sample = new byte[max];
                int read = fs.Read(sample, 0, max);
                if (read != max) Array.Resize(ref sample, read);
            }

            // 1) Detectar BOM (si existe)
            if (sample.Length >= 3 &&
                sample[0] == 0xEF && sample[1] == 0xBB && sample[2] == 0xBF)
                return new UTF8Encoding(encoderShouldEmitUTF8Identifier: true);

            if (sample.Length >= 2)
            {
                if (sample[0] == 0xFF && sample[1] == 0xFE) return Encoding.Unicode;            // UTF-16 LE
                if (sample[0] == 0xFE && sample[1] == 0xFF) return Encoding.BigEndianUnicode;   // UTF-16 BE
            }

            // 2) Si NO hay BOM: comparar "calidad" de decodificación
            //    - UTF-8 (con reemplazo) vs Windows-1252
            string sUtf8 = Encoding.UTF8.GetString(sample);
            string s1252 = Encoding.GetEncoding(1252).GetString(sample);

            // Métricas:
            // - En UTF-8: contar caracteres de reemplazo (�) indica bytes inválidos para UTF-8
            int replUtf8 = 0;
            for (int i = 0; i < sUtf8.Length; i++)
                if (sUtf8[i] == '\uFFFD') replUtf8++;

            // - En 1252: detectar patrones típicos de mojibake cuando el texto real era UTF-8
            //   (Ã, Â, etc). En español real, estos patrones son raros.
            int mojibake1252 = 0;
            for (int i = 0; i < s1252.Length; i++)
            {
                char c = s1252[i];
                if (c == 'Ã' || c == 'Â') mojibake1252++;
                if (c == '\uFFFD') mojibake1252 += 2;
            }

            // - Bonificación si UTF-8 contiene letras típicas del español (ñ, á, é, í, ó, ú, ü)
            int spanishUtf8 = 0;
            for (int i = 0; i < sUtf8.Length; i++)
            {
                char c = sUtf8[i];
                if ("áéíóúÁÉÍÓÚñÑüÜ".IndexOf(c) >= 0) spanishUtf8++;
            }

            // Regla de decisión:
            // Si 1252 muestra mojibake notable, preferir UTF-8.
            // Si UTF-8 tiene demasiados reemplazos, preferir 1252.
            // Si UTF-8 tiene señales claras de español y 1252 tiene mojibake, preferir UTF-8.
            if (mojibake1252 >= 3 && replUtf8 <= 10) return Encoding.UTF8;
            if (spanishUtf8 >= 3 && mojibake1252 >= 1 && replUtf8 <= 20) return Encoding.UTF8;
            if (replUtf8 > 50) return Encoding.GetEncoding(1252);

            // 3) Fallback: intentar UTF-8 estricto; si falla, 1252
            try
            {
                var utf8Strict = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true);
                _ = utf8Strict.GetString(sample);
                return Encoding.UTF8;
            }
            catch
            {
                return Encoding.GetEncoding(1252);
            }
        }
        private static IEnumerable<string> ReadLinesShared(string path, Encoding enc)
        {
            using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            using var sr = new StreamReader(fs, enc, detectEncodingFromByteOrderMarks: true);
            string? line;
            while ((line = sr.ReadLine()) != null)
                yield return line;
        }
        private static string FixUtf8Mojibake(string s)
        {
            if (string.IsNullOrEmpty(s)) return s;

            // Si aparece Ã / Â / � casi seguro es UTF-8 mal interpretado como 1252
            if (s.IndexOf('Ã') < 0 && s.IndexOf('Â') < 0 && s.IndexOf('\uFFFD') < 0)
                return s;

            try
            {
                // Necesario en .NET moderno (VS2022 / .NET 6/7/8) para Windows-1252
                #if NET8_0_OR_GREATER
                                Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
                #endif

                var bytes = Encoding.GetEncoding(1252).GetBytes(s);
                var fixedText = Encoding.UTF8.GetString(bytes);

                // Si la reparación empeora, devolvemos original
                // (heurística simple: si aún quedan muchos Ã/Â, no sirvió)
                int badOrig = (s.Count(c => c == 'Ã' || c == 'Â' || c == '\uFFFD'));
                int badFix = (fixedText.Count(c => c == 'Ã' || c == 'Â' || c == '\uFFFD'));

                return badFix <= badOrig ? fixedText : s;
            }
            catch
            {
                return s;
            }
        }
        private static string Normaliza(string? s)
        {
            if (string.IsNullOrWhiteSpace(s)) return "";
            var formD = s.Normalize(System.Text.NormalizationForm.FormD);
            var sinAcentos = new string(formD.Where(ch => System.Globalization.CharUnicodeInfo.GetUnicodeCategory(ch) != System.Globalization.UnicodeCategory.NonSpacingMark).ToArray());
            return sinAcentos.ToUpperInvariant().Trim();
        }


        // Devuelve 'A' (Calzada A), 'B' (Calzada B) o '?' = Auto (la más cercana).
        private char AskCalzadaPreferida(AxisContext ctx)
        {
            // Vía única: solo hay una calzada → da igual, usamos A.
            if (ctx == null || !ctx.IsDouble)
                return 'A';

            // Vía doble: siempre AUTOMÁTICO (la rutina elegirá la más adecuada
            // según distancia y ordenadas). No se muestra ningún formulario.
            return '?';   // '?' = modo automático en ComputePkAndOffset_Point(...)
        }

        private bool EntidadCoincideConTipo(acDb.Entity ent, TipoEntidad t)
        {
            switch (t)
            {
                case TipoEntidad.Area:
                    return (ent is acDb.Polyline plA && plA.Closed) ||
                           (ent is acDb.Circle) ||
                           (ent is acDb.Ellipse elA && elA.Closed) ||
                           (ent is acDb.BlockReference);

                case TipoEntidad.Longitud:
                    return (ent is acDb.Polyline) ||
                           (ent is acDb.Line) ||
                           (ent is acDb.Polyline3d) ||
                           (ent is acDb.Arc) ||
                           (ent is acDb.Spline) ||
                           (ent is acDb.BlockReference);

                case TipoEntidad.Nodo:
                    // Detallado (Sí): SOLO BLOQUES
                    if (_nodoAnalisisDetallado)
                        return ent is acDb.BlockReference;

                    // Rápido (No): BLOQUES + POLILÍNEAS CERRADAS
                    return (ent is acDb.BlockReference) ||
                           (ent is acDb.Polyline plN && plN.Closed);

                default:
                    return false;
            }
        }

        private double PerimetroDeBloque(acDb.BlockReference br)
        {
            var db = acApp.Application.DocumentManager.MdiActiveDocument.Database;

            using var tr = db.TransactionManager.StartTransaction();
            using var objs = new acDb.DBObjectCollection();

            try
            {
                br.Explode(objs); // geometría transformada al WCS

                double bestArea = -1.0;
                double bestPerimeter = 0.0;

                foreach (acDb.DBObject o in objs)
                {
                    if (o is not acDb.Entity e) continue;

                    switch (e)
                    {
                        // 1) Polilíneas cerradas → candidato ideal
                        case acDb.Polyline pl when pl.Closed:
                            try
                            {
                                // Nota: Area puede lanzar en polilíneas degeneradas
                                double area = Math.Abs(pl.Area);
                                if (area > bestArea)
                                {
                                    bestArea = area;
                                    bestPerimeter = Math.Abs(pl.Length); // perímetro del contorno
                                }
                            }
                            catch { /* ignorar degeneradas */ }
                            break;

                        // 2) Círculos → soportamos contornos circulares
                        case acDb.Circle cc:
                            {
                                double r = cc.Radius;
                                double area = Math.PI * r * r;
                                if (area > bestArea)
                                {
                                    bestArea = area;
                                    bestPerimeter = 2.0 * Math.PI * r;
                                }
                            }
                            break;

                            // (podrías añadir Ellipse cerrada o Spline cerrada si lo requieres)
                    }
                }

                // Si encontramos alguna cerrada, devolvemos su perímetro (la de mayor área)
                if (bestArea > 0.0)
                    return bestPerimeter;

                // --- Fallback: no había cerradas, usamos el bbox del bloque exploteado ---
                // Aproximación: perímetro del rectángulo de extents de TODA la geometría
                bool haveExtents = false;
                acGeo.Point3d min = new(double.PositiveInfinity, double.PositiveInfinity, 0);
                acGeo.Point3d max = new(double.NegativeInfinity, double.NegativeInfinity, 0);

                foreach (acDb.DBObject o in objs)
                {
                    if (o is acDb.Entity ent)
                    {
                        try
                        {
                            var ext = ent.GeometricExtents;
                            if (!haveExtents) { min = ext.MinPoint; max = ext.MaxPoint; haveExtents = true; }
                            else
                            {
                                min = new acGeo.Point3d(Math.Min(min.X, ext.MinPoint.X), Math.Min(min.Y, ext.MinPoint.Y), 0);
                                max = new acGeo.Point3d(Math.Max(max.X, ext.MaxPoint.X), Math.Max(max.Y, ext.MaxPoint.Y), 0);
                            }
                        }
                        catch { /* algunas entidades pueden no tener extents listos */ }
                    }
                }

                if (haveExtents)
                {
                    double w = Math.Abs(max.X - min.X);
                    double h = Math.Abs(max.Y - min.Y);
                    return 2.0 * (w + h);
                }

                return 0.0; // nada medible
            }
            catch
            {
                return 0.0;
            }
            finally
            {
                // liberar objetos del Explode
                foreach (acDb.DBObject o in objs) o.Dispose();
            }
        }
        // Borra entidades originales (best-effort)
        private void BorrarOriginales(List<acDb.ObjectId> ids)
        {
            if (ids == null || ids.Count == 0) return;

            var doc = acApp.Application.DocumentManager.MdiActiveDocument;
            if (doc == null) return;

            var db = doc.Database;

            int borradas = 0;
            int noEncontradas = 0;
            int noSePudo = 0;

            using (doc.LockDocument())
            using (var tr = db.TransactionManager.StartTransaction())
            {
                foreach (var id in ids)
                {
                    try
                    {
                        if (id.IsNull || !id.IsValid)
                        {
                            noEncontradas++;
                            continue;
                        }

                        var obj = tr.GetObject(id, acDb.OpenMode.ForWrite, false, true);
                        if (obj == null || obj.IsErased)
                        {
                            noEncontradas++;
                            continue;
                        }

                        // 🔴 FIX CLAVE: forzar escritura real
                        if (!obj.IsWriteEnabled)
                            obj.UpgradeOpen();

                        // ===== NUEVO: Manejo especial para bloques con atributos =====
                        if (obj is acDb.BlockReference blkRef)
                        {
                            // Los bloques pueden tener atributos que necesitan abrirse
                            var attCol = blkRef.AttributeCollection;
                            if (attCol != null && attCol.Count > 0)
                            {
                                foreach (acDb.ObjectId attId in attCol)
                                {
                                    try
                                    {
                                        if (!attId.IsValid || attId.IsNull) continue;

                                        var attRef = tr.GetObject(attId, acDb.OpenMode.ForWrite, false, true);
                                        if (attRef != null && !attRef.IsErased)
                                        {
                                            if (!attRef.IsWriteEnabled)
                                                attRef.UpgradeOpen();

                                            attRef.Erase(true);
                                        }
                                    }
                                    catch
                                    {
                                        // Atributo no se pudo borrar, continuar con otros
                                    }
                                }
                            }
                        }

                        // Ahora sí borrar el bloque principal
                        obj.Erase(true);
                        borradas++;
                    }
                    catch
                    {
                        noSePudo++;
                    }
                }

                tr.Commit();
            }

            try
            {
                var ed = doc.Editor;
                ed.Regen();
                ed.SetImpliedSelection(Array.Empty<acDb.ObjectId>());
            }
            catch { }

            MessageBox.Show(this,
                $"Borrado de originales:\n" +
                $"- Borradas: {borradas}\n" +
                $"- No encontradas / ya borradas: {noEncontradas}\n" +
                $"- No se pudieron borrar: {noSePudo}",
                "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        // Si quedó “pendiente” (usuario dijo Sí y no cerró), simula el “No” antes de exportar
        private void CerrarCicloAgregarSiPendiente()
        {
            if (!_cicloAgregarPendiente) return;

            // 1) Borrar originales (esta rutina ya hace Unhighlight antes de Erase)
            if (_ultimosOriginales != null && _ultimosOriginales.Count > 0)
                BorrarOriginales(_ultimosOriginales);

            // 2) NO llames Resaltar() aquí: ya no existen.
            _selIds.Clear();
            btnSeleccionEntidad.Enabled = false;
            BtnAgritem.Enabled = false;

            _cicloAgregarPendiente = false;
            _ultimosOriginales.Clear();
        }

        private void Resaltar(IEnumerable<acDb.ObjectId> ids, bool on)
        {
            var db = acApp.Application.DocumentManager.MdiActiveDocument.Database;
            using var tr = db.TransactionManager.StartTransaction();

            foreach (var id in ids)
            {
                try
                {
                    if (!id.IsValid) continue;

                    var ent = tr.GetObject(id, acDb.OpenMode.ForRead, false, true) as acDb.Entity;
                    if (ent == null || ent.IsErased) continue;   // <<< clave

                    if (on) ent.Highlight();
                    else ent.Unhighlight();
                }
                catch (Autodesk.AutoCAD.Runtime.Exception)
                {
                    // Entidad borrada o no accesible: ignorar sin romper el flujo.
                }
            }
            tr.Commit();
        }
        private void btnayuda_Click(object? sender, EventArgs e)
        {
            using var f = new FrmAyuda();
            f.ShowDialog(this);
        }
        // Toma los 5 primeros caracteres alfanuméricos en MAYÚSCULA; si queda vacío usa fallback.
        // en el constructor (botones)
        private void btnbuscar_Click(object? sender, EventArgs e)
        {
            using var f = new FrmFiltroCapComItem();
            f.ShowDialog(this);
        }
        private double AreaDeBloqueConPlCerrada(acDb.BlockReference br)
        {
            var db = acApp.Application.DocumentManager.MdiActiveDocument.Database;
            using var tr = db.TransactionManager.StartTransaction();
            using var objs = new acDb.DBObjectCollection();

            try
            {
                br.Explode(objs); // ya transformado a WCS

                double bestArea = 0.0;

                foreach (acDb.DBObject o in objs)
                {
                    if (o is not acDb.Entity e) continue;

                    switch (e)
                    {
                        case acDb.Polyline pl when pl.Closed:
                            {
                                double a = AreaFromPolylineOutline(pl);   // << ignora width
                                if (a > bestArea) bestArea = a;
                                break;
                            }
                        case acDb.Circle cc:
                            {
                                double a = Math.PI * cc.Radius * cc.Radius;
                                if (a > bestArea) bestArea = a;
                                break;
                            }
                        case acDb.Ellipse el when el.Closed:
                            {
                                double a = Math.PI * el.MajorRadius * el.MinorRadius;
                                if (a > bestArea) bestArea = a;
                                break;
                            }
                    }
                }

                // Si no hubo curvas cerradas, intentar bbox como último recurso (evita 0)
                // ... después de intentar pl cerradas / circle / ellipse ...
                // Si no encontramos ninguna curva cerrada “buena” dentro del bloque:
                if (bestArea <= 0.0)
                {
                    // Construir hull con endpoints de las líneas (y vértices de polilíneas abiertas si aparecen)
                    var pts = new List<acGeo.Point2d>();

                    foreach (acDb.DBObject o in objs)
                    {
                        switch (o)
                        {
                            case acDb.Line ln:
                                pts.Add(new acGeo.Point2d(ln.StartPoint.X, ln.StartPoint.Y));
                                pts.Add(new acGeo.Point2d(ln.EndPoint.X, ln.EndPoint.Y));
                                break;

                            case acDb.Polyline pl when !pl.Closed:
                                for (int i = 0; i < pl.NumberOfVertices; i++)
                                {
                                    var p3 = pl.GetPoint3dAt(i);
                                    pts.Add(new acGeo.Point2d(p3.X, p3.Y));
                                }
                                break;

                            // Si tu bloque pudiera traer Arcs sueltos y quieres considerarlos:
                            case acDb.Arc arc:
                                // Tomamos extremos; con rectángulos típicos no hace falta muestrear
                                pts.Add(new acGeo.Point2d(arc.StartPoint.X, arc.StartPoint.Y));
                                pts.Add(new acGeo.Point2d(arc.EndPoint.X, arc.EndPoint.Y));
                                break;
                        }
                    }

                    if (pts.Count >= 3)
                    {
                        var hull = ConvexHull2D(pts);
                        var hullArea = PolygonArea(hull);
                        if (hullArea > 0.0) bestArea = hullArea;
                    }
                }

                // Nada de bbox axis-aligned aquí. Devolvemos lo que haya:
                return bestArea;
            }
            catch { return 0.0; }
            finally { foreach (acDb.DBObject o in objs) o.Dispose(); }
        }

        private static bool PolyHasAnyWidth(acDb.Polyline pl)
        {
            if (pl.ConstantWidth > 1e-9) return true;
            for (int i = 0; i < pl.NumberOfVertices; i++)
                if (pl.GetStartWidthAt(i) > 1e-9 || pl.GetEndWidthAt(i) > 1e-9)
                    return true;
            return false;
        }

        // Área del contorno ignorando el “ancho” de la polilínea
        private static double AreaFromPolylineOutline(acDb.Polyline pl)
        {
            if (!pl.Closed) return 0.0;

            // Si no tiene ancho, devolvemos directo
            if (!PolyHasAnyWidth(pl))
                return Math.Abs(pl.Area);

            // Clonar y poner widths = 0
            var clone = (acDb.Polyline)pl.Clone();
            try
            {
                clone.ConstantWidth = 0.0;
                for (int i = 0; i < clone.NumberOfVertices; i++)
                {
                    clone.SetStartWidthAt(i, 0.0);
                    clone.SetEndWidthAt(i, 0.0);
                }
                return Math.Abs(clone.Area);
            }
            catch { return 0.0; }
            finally { clone.Dispose(); }
        }
        // === Convex Hull 2D (Graham scan) y área por “shoelace” ===
        private static List<acGeo.Point2d> ConvexHull2D(List<acGeo.Point2d> pts)
        {
            var p = pts.Distinct().OrderBy(v => v.X).ThenBy(v => v.Y).ToList();
            if (p.Count <= 2) return p;

            double Cross(acGeo.Point2d o, acGeo.Point2d a, acGeo.Point2d b) =>
                (a.X - o.X) * (b.Y - o.Y) - (a.Y - o.Y) * (b.X - o.X);

            var lower = new List<acGeo.Point2d>();
            foreach (var v in p)
            {
                while (lower.Count >= 2 && Cross(lower[lower.Count - 2], lower[lower.Count - 1], v) <= 0) lower.RemoveAt(lower.Count - 1);
                lower.Add(v);
            }

            var upper = new List<acGeo.Point2d>();
            for (int i = p.Count - 1; i >= 0; i--)
            {
                var v = p[i];
                while (upper.Count >= 2 && Cross(upper[upper.Count - 2], upper[upper.Count - 1], v) <= 0) upper.RemoveAt(upper.Count - 1);
                upper.Add(v);
            }

            lower.RemoveAt(lower.Count - 1);
            upper.RemoveAt(upper.Count - 1);
            lower.AddRange(upper);
            return lower;
        }

        private static double PolygonArea(List<acGeo.Point2d> poly)
        {
            if (poly == null || poly.Count < 3) return 0.0;
            double a = 0.0;
            for (int i = 0, j = poly.Count - 1; i < poly.Count; j = i++)
                a += (poly[j].X * poly[i].Y) - (poly[j].Y * poly[i].X);
            return Math.Abs(a) * 0.5;
        }
        private static bool TryParseHexColor(string? hex, out System.Drawing.Color ui, out acCol.Color acad)
        {
            ui = System.Drawing.Color.Empty;
            acad = null;
            if (string.IsNullOrWhiteSpace(hex)) return false;

            string t = hex.Trim();
            if (!t.StartsWith("#")) return false;
            if (t.Length != 7) return false;           // "#RRGGBB"

            try
            {
                int r = Convert.ToInt32(t.Substring(1, 2), 16);
                int g = Convert.ToInt32(t.Substring(3, 2), 16);
                int b = Convert.ToInt32(t.Substring(5, 2), 16);
                ui = System.Drawing.Color.FromArgb(r, g, b);
                acad = acCol.Color.FromRgb((byte)r, (byte)g, (byte)b);
                return true;
            }
            catch { return false; }
        }
        // Reinicia la UI para un nuevo ciclo sin cerrar el formulario
        private void ReiniciarActividadPostExport()
        {
            // liberar cualquier congelamiento de selección
            _lockSelection = false;
            _lockedIds = null;
            _lockedTipo = "";

            // quitar resaltados y limpiar selección
            try { Resaltar(_selIds, false); } catch { }
            try
            {
                var ed = acApp.Application.DocumentManager.MdiActiveDocument.Editor;
                ed.SetImpliedSelection(Array.Empty<acDb.ObjectId>());
            }
            catch { }
            _selIds.Clear();

            // dejar botones en estado inicial
            btnSeleccionEntidad.Enabled = true;  // listo para seleccionar de nuevo
            BtnAgritem.Enabled = false;          // hasta que haya nueva selección
            btnSyncExcel.Enabled = false;        // se habilita cuando haya filas nuevas
            btnCrearXlsm.Enabled = false;        // deshabilitado permanentemente
            btnXlsmExaminar.Enabled = false;     // deshabilitado permanentemente
            _sincronizadoExitoso = false;

            // limpiar grid y formulario (como "nuevo")
            _rows.Clear();
            ActualizarLabelsGrid();
            LimpiarFormularioParaSiguiente();
            rbArea.Checked = rbLongitud.Checked = rbNodo.Checked = false;
            rbEjecObra.Checked = rbEjecPresupuesto.Checked = false;

            // foco al formulario para continuar
            try { this.Activate(); this.Focus(); } catch { }
        }

        private static T? OpenByHandle<T>(acDb.Transaction tr, string handleHex)
            where T : acDb.DBObject
        {
            if (string.IsNullOrWhiteSpace(handleHex)) return null;

            try
            {
                var db = acApp.Application.DocumentManager.MdiActiveDocument.Database;
                var h = new acDb.Handle(Convert.ToInt64(handleHex, 16)); // hex -> Handle
                var id = db.GetObjectId(false, h, 0);                    // buscar ObjectId en la BD
                return tr.GetObject(id, acDb.OpenMode.ForWrite, false, true) as T;
            }
            catch
            {
                return null;
            }
        }
        private static void SetLayersOnOff(IEnumerable<string> layerNames, bool off)
        {
            var db = Autodesk.AutoCAD.ApplicationServices.Application.DocumentManager.MdiActiveDocument.Database;
            using var tr = db.TransactionManager.StartTransaction();
            var lt = (Autodesk.AutoCAD.DatabaseServices.LayerTable)tr.GetObject(db.LayerTableId, Autodesk.AutoCAD.DatabaseServices.OpenMode.ForRead);

            foreach (var name in layerNames.Where(n => !string.IsNullOrWhiteSpace(n)).Distinct(StringComparer.OrdinalIgnoreCase))
            {
                if (!lt.Has(name)) continue;
                var id = lt[name];
                var ltr = (Autodesk.AutoCAD.DatabaseServices.LayerTableRecord)tr.GetObject(id, Autodesk.AutoCAD.DatabaseServices.OpenMode.ForWrite);
                ltr.IsOff = off;  // false = encendida, true = apagada
            }
            tr.Commit();
        }
        private void ConfigurarGrid()
        {
            // Limpia columnas actuales
            dgvPrecargados.Columns.Clear();

            // Solo VISUALIZACIÓN: define qué ves en pantalla (orden y encabezados)
            // DataPropertyName = nombre EXACTO de la propiedad en GridRow
            // PK_ID primero
            dgvPrecargados.Columns.Add(new DataGridViewTextBoxColumn
            {
                DataPropertyName = "PK_ID",
                HeaderText = "Pk_Id",
                FillWeight = 80
            }); dgvPrecargados.Columns.Add(new DataGridViewTextBoxColumn
            {
                DataPropertyName = "Item",
                HeaderText = "Ítem",
                FillWeight = 80
            });
            dgvPrecargados.Columns.Add(new DataGridViewTextBoxColumn
            {
                DataPropertyName = "Descripcion",
                HeaderText = "Descripción",
                FillWeight = 220
            });
            dgvPrecargados.Columns.Add(new DataGridViewTextBoxColumn
            {
                DataPropertyName = "Und",
                HeaderText = "Und",
                FillWeight = 60
            });
            dgvPrecargados.Columns.Add(new DataGridViewTextBoxColumn
            {
                DataPropertyName = "VlrUnitario",
                HeaderText = "Vlr Unit.",
                FillWeight = 90
            });
            dgvPrecargados.Columns.Add(new DataGridViewTextBoxColumn
            {
                DataPropertyName = "Calzada",
                HeaderText = "Calzada",
                FillWeight = 90
            });
            dgvPrecargados.Columns.Add(new DataGridViewTextBoxColumn
            {
                DataPropertyName = "Tramo",
                HeaderText = "Tramo",
                FillWeight = 90
            });
            dgvPrecargados.Columns.Add(new DataGridViewTextBoxColumn
            {
                DataPropertyName = "AbsIni",
                HeaderText = "Abs.Ini",
                FillWeight = 110,
                SortMode = DataGridViewColumnSortMode.Programmatic
            });
            dgvPrecargados.Columns.Add(new DataGridViewTextBoxColumn
            {
                DataPropertyName = "AbsFin",
                HeaderText = "Abs.Fin",
                FillWeight = 110,
                SortMode = DataGridViewColumnSortMode.Programmatic
            });
            dgvPrecargados.Columns.Add(new DataGridViewTextBoxColumn
            {
                DataPropertyName = "CantTotal",
                HeaderText = "Cant.Total",
                FillWeight = 110,
                DefaultCellStyle = new DataGridViewCellStyle { Format = "0.##" }
            });
            dgvPrecargados.Columns.Add(new DataGridViewTextBoxColumn
            {
                DataPropertyName = "CostoDirecto",
                HeaderText = "Costo Dir.",
                FillWeight = 120,
                DefaultCellStyle = new DataGridViewCellStyle { Format = "0" }
            });
            dgvPrecargados.Columns.Add(new DataGridViewTextBoxColumn
            {
                DataPropertyName = "ID_Pol",
                HeaderText = "ID",
                FillWeight = 100
            });

            // Si quieres mostrar también TipoEjecucion / TipoEntidad, añade columnas aquí.
            // Todo lo demás (NoInicio, NoFinal, Ancho, Espesor, AreaLongNod, VlrUnitario, Observacion, Capa) NO se muestra,
            // pero SIGUE estando en _rows para exportar al Excel como hoy.
        }
        private void HookSelectAll(TextBox tb)
        {
            // Al recibir el foco por TAB, diferimos el SelectAll para que quede “pegado”
            tb.Enter += TextBox_SelectAllDeferred;

            // Si el usuario hace clic, mantenemos la selección (útil cuando ya estaba seleccionando con el mouse)
            tb.MouseUp += TextBox_MouseUpSelectAll;
        }

        private void TextBox_SelectAllDeferred(object sender, EventArgs e)
        {
            var tb = (TextBox)sender;

            // Difíerelo un tic: garantiza que el foco ya se asentó
            BeginInvoke((Action)(() =>
            {
                tb.SelectionStart = 0;
                tb.SelectionLength = tb.TextLength;
            }));
        }

        private void TextBox_MouseUpSelectAll(object sender, MouseEventArgs e)
        {
            var tb = (TextBox)sender;

            // Si no hay selección (clic simple), selecciona todo
            if (tb.SelectionLength == 0)
                tb.SelectAll();
        }
        private static readonly CultureInfo Es = new CultureInfo("es-ES");

        private void HookProperCase(TextBox tb)
        {
            tb.Leave += (_, __) => ApplyProperCase(tb);
            tb.Validated += (_, __) => ApplyProperCase(tb); // respaldo extra si usas Validating
        }

        private void ApplyProperCase(TextBox tb)
        {
            var s = tb.Text;
            if (string.IsNullOrWhiteSpace(s)) return;

            // Normaliza a minúsculas y luego aplica Título según cultura (es-ES)
            var t = Es.TextInfo.ToTitleCase(s.ToLower(Es));

            if (!t.Equals(s, StringComparison.Ordinal))
            {
                int selStart = Math.Max(0, tb.SelectionStart); // conserva el caret
                tb.Text = t;
                tb.SelectionStart = Math.Min(selStart, tb.TextLength);
            }
        }
        // Clona una lista de entidades dentro del espacio actual
        // y devuelve el mapeo ORIG -> CLON en el MISMO orden de entrada.
        private int ProcesarNodosAgrupadosPorPk(
            acDb.Database db,
            List<(acDb.ObjectId Id, string AbsIni, string AbsFin, string PkId)> aceptadas,
            string capitulo, string competencia, string itemCodForm, string descForm, string undForm,
            decimal vlrUnitForm, string noIniForm, string noFinForm, string observ,
            double alt, double anchoForm, double espesorForm, string tipoEjec,
            string layerEntBase, string layerTxtBase, string colorHexExcel,
            ref int contador)
        {
            string layerEnt = layerEntBase + itemCodForm;
            string layerTxt = layerTxtBase + itemCodForm;
            if (layerEnt.Length > 255) layerEnt = layerEnt.Substring(0, 255);
            if (layerTxt.Length > 255) layerTxt = layerTxt.Substring(0, 255);
            AsegurarCapa(layerEnt, _acadColor, true);
            AsegurarCapa(layerTxt, _acadColor, true);

            var grupos = aceptadas
                .GroupBy(a => (a.PkId ?? "").Trim(), StringComparer.OrdinalIgnoreCase)
                .OrderBy(g => g.Key)
                .ToList();

            int registros = 0;

            using (var tr = db.TransactionManager.StartTransaction())
            {
                var bt = (acDb.BlockTable)tr.GetObject(db.BlockTableId, acDb.OpenMode.ForRead);
                bt.UpgradeOpen();
                var ms = (acDb.BlockTableRecord)tr.GetObject(db.CurrentSpaceId, acDb.OpenMode.ForWrite);

                foreach (var grupo in grupos)
                {
                    var ids = grupo.Select(g => g.Id).ToList();
                    int cantidad = ids.Count;
                    if (cantidad == 0) continue;

                    string pkId = string.IsNullOrWhiteSpace(grupo.Key) ? "SIN_PK" : grupo.Key;

                    var first = grupo.First();
                    string absIni = first.AbsIni;
                    string absFin = first.AbsFin;

                    double sx = 0, sy = 0;
                    int nCentro = 0;
                    foreach (var id in ids)
                    {
                        if (tr.GetObject(id, acDb.OpenMode.ForRead, false, true) is acDb.Entity ent)
                        {
                            var c = CentroDeSeguro(ent);
                            sx += c.X;
                            sy += c.Y;
                            nCentro++;
                        }
                    }
                    if (nCentro == 0) continue;

                    var centro = new acGeo.Point3d(sx / nCentro, sy / nCentro, 0.0);
                    string blkName = ObtenerNombreBloqueUnico(bt, tr, $"SICOE_PK_{SanitizarNombreBloque(pkId)}_{contador}");

                    var btrDef = new acDb.BlockTableRecord
                    {
                        Name = blkName,
                        Origin = acGeo.Point3d.Origin
                    };
                    bt.Add(btrDef);
                    tr.AddNewlyCreatedDBObject(btrDef, true);

                    var xfToLocal = acGeo.Matrix3d.Displacement(new acGeo.Vector3d(-centro.X, -centro.Y, -centro.Z));
                    foreach (var id in ids)
                    {
                        if (tr.GetObject(id, acDb.OpenMode.ForRead, false, true) is not acDb.Entity entOrig)
                            continue;

                        var cl = (acDb.Entity)entOrig.Clone();
                        cl.TransformBy(xfToLocal);
                        cl.Layer = layerEnt;
                        btrDef.AppendEntity(cl);
                        tr.AddNewlyCreatedDBObject(cl, true);
                    }

                    var br = new acDb.BlockReference(centro, btrDef.ObjectId) { Layer = layerEnt };
                    ms.AppendEntity(br);
                    tr.AddNewlyCreatedDBObject(br, true);

                    string etiqueta = string.IsNullOrWhiteSpace(itemCodForm)
                        ? $"{contador}"
                        : $"{itemCodForm}_{contador}";

                    var dbt = new acDb.DBText
                    {
                        TextString = $"{etiqueta} (x{cantidad})",
                        Height = alt,
                        Layer = layerTxt,
                        HorizontalMode = acDb.TextHorizontalMode.TextCenter,
                        VerticalMode = acDb.TextVerticalMode.TextVerticalMid,
                        AlignmentPoint = centro,
                        Position = centro
                    };
                    dbt.SetDatabaseDefaults();
                    ms.AppendEntity(dbt);
                    tr.AddNewlyCreatedDBObject(dbt, true);

                    string costadoSel = "";
                    string tramoSel = "";
                    var capaRow = _capasFull.FirstOrDefault(c =>
                        string.Equals(c.CAPA, pkId, StringComparison.OrdinalIgnoreCase));
                    if (capaRow != null)
                    {
                        costadoSel = capaRow.CALZADA ?? "";
                        tramoSel = capaRow.TRAMO ?? "";
                    }

                    double anchoOut = anchoForm > 0 ? anchoForm : 1.0;
                    double espesorOut = espesorForm > 0 ? espesorForm : 1.0;
                    double cantOut = Math.Round(cantidad * anchoOut * espesorOut, 2, MidpointRounding.AwayFromZero);
                    double costoOut = Math.Round(cantOut * (double)vlrUnitForm, 0, MidpointRounding.AwayFromZero);
                    string etiquetaKey = etiqueta.Trim().ToUpperInvariant();

                    if (ExisteFilaPresupuestal(pkId, itemCodForm ?? "", etiquetaKey))
                    {
                        contador++;
                        continue;
                    }

                    string obsGrupo = string.IsNullOrWhiteSpace(observ)
                        ? $"Agrupado: {cantidad} und por PK_ID."
                        : $"{observ} | Agrupado: {cantidad} und.";

                    _rows.Add(new GridRow
                    {
                        PK_ID = pkId,
                        CapaSolo = pkId,
                        Capitulo = capitulo,
                        Competencia = competencia,
                        Item = itemCodForm ?? "",
                        Descripcion = descForm,
                        Und = undForm,
                        Calzada = costadoSel,
                        Tramo = tramoSel,
                        AbsIni = absIni,
                        AbsFin = absFin,
                        VlrUnitario = vlrUnitForm,
                        NoInicio = noIniForm,
                        NoFinal = noFinForm,
                        AreaLongNod = cantidad,
                        Ancho = anchoOut,
                        Espesor = espesorOut,
                        CantTotal = cantOut,
                        CostoDirecto = costoOut,
                        TipoEjecucion = tipoEjec,
                        TipoEntidad = "Nodo Agrupado",
                        ID_Pol = etiquetaKey,
                        Observacion = obsGrupo,
                        Remitente = _supportPending?.Remitente ?? "",
                        FechaSoporte = _supportPending?.Fecha.ToString("yyyy-MM-dd") ?? "",
                        AsuntoSoporte = _supportPending?.Asunto ?? "",
                        LinkSoporte = _supportPending?.Enlace ?? "",
                        EntHandle = br.Handle.ToString(),
                        TxtHandle = dbt.Handle.ToString(),
                        LayerEnt = layerEnt,
                        LayerTxt = layerTxt,
                        ColorHex = colorHexExcel,
                        GUID = "",
                        X_LABEL = Math.Round(centro.X, 3),
                        Y_LABEL = Math.Round(centro.Y, 3),
                    });

                    registros++;
                    contador++;
                }

                tr.Commit();
            }

            return registros;
        }

        private static string SanitizarNombreBloque(string name)
        {
            var s = string.IsNullOrWhiteSpace(name) ? "SIN_PK" : name.Trim();
            foreach (var c in Path.GetInvalidFileNameChars())
                s = s.Replace(c, '_');
            s = s.Replace(' ', '_').Replace('+', '_').Replace(';', '_').Replace('=', '_');
            if (s.Length > 180) s = s.Substring(0, 180);
            return s;
        }

        private static string ObtenerNombreBloqueUnico(acDb.BlockTable bt, acDb.Transaction tr, string baseName)
        {
            string name = baseName;
            int suffix = 1;
            while (bt.Has(name))
            {
                name = $"{baseName}_{suffix}";
                suffix++;
            }
            return name;
        }

        private List<(acDb.ObjectId Original, acDb.ObjectId Clone)> DeepCloneWithMap(
            acDb.Database db,
            IEnumerable<acDb.ObjectId> originales)
        {
            var resultado = new List<(acDb.ObjectId Original, acDb.ObjectId Clone)>();

            if (db == null || originales == null)
                return resultado;

            // Colección de ids originales válidos
            var ids = new acDb.ObjectIdCollection();
            foreach (var id in originales)
            {
                if (id.IsValid)
                    ids.Add(id);
            }

            if (ids.Count == 0)
                return resultado;

            // Clonamos al espacio actual
            using (var tr = db.TransactionManager.StartTransaction())
            {
                var btr = (acDb.BlockTableRecord)tr.GetObject(
                    db.CurrentSpaceId,
                    acDb.OpenMode.ForWrite
                );

                var mapping = new acDb.IdMapping();

                db.DeepCloneObjects(ids, btr.ObjectId, mapping, false);

                tr.Commit();

                // mapping contiene pares Key(ORIG) -> Value(CLON)
                foreach (acDb.IdPair pair in mapping)
                {
                    if (pair.IsCloned && !pair.Value.IsNull)
                    {
                        resultado.Add((pair.Key, pair.Value));
                    }
                }
            }

            // Reordenar según la lista de entrada para que
            // aceptadas[i].Id coincida con pares[i].Clone
            var dict = resultado.ToDictionary(p => p.Original, p => p.Clone);
            var ordenados = new List<(acDb.ObjectId Original, acDb.ObjectId Clone)>();

            foreach (var id in originales)
            {
                if (id.IsValid && dict.TryGetValue(id, out var clonId))
                    ordenados.Add((id, clonId));
            }

            return ordenados;
        }

        // === Longitudes horizontales (proyección XY) ===
        private static double DistXY(acGeo.Point3d a, acGeo.Point3d b)
            => Math.Sqrt((a.X - b.X) * (a.X - b.X) + (a.Y - b.Y) * (a.Y - b.Y));

        private static double LongitudHorizontalPolyline3d(acDb.Polyline3d p3, acDb.Transaction tr)
        {
            var pts = new List<acGeo.Point3d>();
            foreach (acDb.ObjectId vId in p3)
                if (tr.GetObject(vId, acDb.OpenMode.ForRead) is acDb.PolylineVertex3d vx)
                    pts.Add(new acGeo.Point3d(vx.Position.X, vx.Position.Y, 0));

            if (pts.Count < 2) return 0.0;

            double acc = 0.0;
            for (int i = 1; i < pts.Count; i++)
                acc += DistXY(pts[i - 1], pts[i]);
            return acc;
        }

        private static double LongitudHorizontalCurve(acDb.Curve cv, acDb.Transaction tr)
        {
            switch (cv)
            {
                case acDb.Line ln:
                    return DistXY(ln.StartPoint, ln.EndPoint);

                case acDb.Polyline pl:        // Polyline 2D: su Length ya es XY
                    try { return Math.Abs(pl.Length); }
                    catch { return 0.0; }

                case acDb.Polyline3d p3:
                    return LongitudHorizontalPolyline3d(p3, tr);

                default:
                    // Aproximación genérica por muestreo para Spline/Arc/etc. con Z variable:
                    try
                    {
                        // muestreamos ~100 segmentos (ajusta si quieres)
                        int n = 100;
                        double t0 = cv.StartParam, t1 = cv.EndParam;
                        if (double.IsNaN(t0) || double.IsNaN(t1) || Math.Abs(t1 - t0) < 1e-9) return 0.0;

                        double acc = 0.0;
                        var pPrev = cv.GetPointAtParameter(t0);
                        for (int i = 1; i <= n; i++)
                        {
                            double ti = t0 + (t1 - t0) * i / n;
                            var p = cv.GetPointAtParameter(ti);
                            acc += DistXY(pPrev, p);
                            pPrev = p;
                        }
                        return acc;
                    }
                    catch { return 0.0; }
            }
        }
        // ==== NUEVO: soporte externo vinculado a una entidad/ítem ====
        public sealed class SupportInfo
        {
            public string Remitente { get; set; } = "";
            public DateTime Fecha { get; set; } = DateTime.Today;
            public string Asunto { get; set; } = "";
            public string Enlace { get; set; } = "";
        }

        private static string SupportHistoryPath =>
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                         "SICOE", "support_history.json");

        private static List<SupportInfo> LoadSupportHistory()
        {
            try
            {
                var dir = Path.GetDirectoryName(SupportHistoryPath)!;
                if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                if (!File.Exists(SupportHistoryPath)) return new List<SupportInfo>();
                var json = File.ReadAllText(SupportHistoryPath, Encoding.UTF8);
                return JsonConvert.DeserializeObject<List<SupportInfo>>(json) ?? new List<SupportInfo>();
            }
            catch { return new List<SupportInfo>(); }
        }

        private static void SaveSupportHistory(List<SupportInfo> list)
        {
            try
            {
                var dir = Path.GetDirectoryName(SupportHistoryPath)!;
                if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                var json = JsonConvert.SerializeObject(list, Newtonsoft.Json.Formatting.Indented);
                File.WriteAllText(SupportHistoryPath, json, Encoding.UTF8);
            }
            catch { /* tolerante */ }
        }

        // Mantén en memoria lo capturado para la selección vigente
        private SupportInfo? _supportPending = null;
        // ==== NUEVO: formulario emergente de soporte externo ====
        internal sealed class FrmSoporteEntidad : Form
        {
            private TextBox txtRemitente = new TextBox();
            private DateTimePicker dtFecha = new DateTimePicker();
            private TextBox txtAsunto = new TextBox();
            private TextBox txtLink = new TextBox();
            private DataGridView dgvHist = new DataGridView();
            private Button btnGuardar = new Button();
            private Button btnCancelar = new Button();
            // >>> AÑADIR (nivel de clase, dentro de FrmSoporteEntidad)
            private readonly List<FrmSicoePresupuesto.SupportInfo> _hist;
            private readonly BindingSource _bsHist = new BindingSource();
            private AutoCompleteStringCollection _acRem = new AutoCompleteStringCollection();

            public FrmSicoePresupuesto.SupportInfo? SelectedSupport { get; private set; }
            // >>> AÑADIR (método de instancia, no static)
            private void ApplyHistoryFilter(string term)
            {
                IEnumerable<FrmSicoePresupuesto.SupportInfo> q = _hist;

                if (!string.IsNullOrWhiteSpace(term))
                {
                    string t = term.Trim();
                    q = _hist.Where(h => !string.IsNullOrEmpty(h.Remitente) &&
                                          h.Remitente.IndexOf(t, StringComparison.OrdinalIgnoreCase) >= 0);
                }

                _bsHist.DataSource = q.OrderByDescending(h => h.Fecha).ToList();
            }

            public FrmSoporteEntidad(List<FrmSicoePresupuesto.SupportInfo> historial)
            {
                
                _hist = historial;

                Text = "Soporte de entidad (nube/correo)";
                StartPosition = FormStartPosition.CenterParent;
                FormBorderStyle = FormBorderStyle.FixedDialog;
                MaximizeBox = false; MinimizeBox = false;
                ClientSize = new Size(760, 470);

                var lbl1 = new Label { Text = "Remitente:", AutoSize = true, Location = new Point(20, 20) };
                var lbl2 = new Label { Text = "Fecha:", AutoSize = true, Location = new Point(20, 60) };
                var lbl3 = new Label { Text = "Asunto:", AutoSize = true, Location = new Point(20, 100) };
                var lbl4 = new Label { Text = "Enlace/Link:", AutoSize = true, Location = new Point(20, 140) };

                txtRemitente.Location = new Point(120, 16); txtRemitente.Width = 500;
                dtFecha.Location = new Point(120, 56); dtFecha.Width = 200; dtFecha.Format = DateTimePickerFormat.Short;
                txtAsunto.Location = new Point(120, 96); txtAsunto.Width = 500;
                txtLink.Location = new Point(120, 136); txtLink.Width = 500;

                btnGuardar.Text = "Guardar"; btnGuardar.Location = new Point(640, 16); btnGuardar.Size = new Size(90, 30);
                btnCancelar.Text = "Cancelar"; btnCancelar.Location = new Point(640, 56); btnCancelar.Size = new Size(90, 30);

                dgvHist.Location = new Point(20, 190); dgvHist.Size = new Size(710, 250);
                dgvHist.ReadOnly = true; dgvHist.AllowUserToAddRows = false; dgvHist.AllowUserToDeleteRows = false;
                dgvHist.AutoGenerateColumns = false; dgvHist.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
                dgvHist.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "Remitente", HeaderText = "Remitente", Width = 160 });
                dgvHist.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "Fecha", HeaderText = "Fecha", Width = 90, DefaultCellStyle = new DataGridViewCellStyle { Format = "yyyy-MM-dd" } });
                dgvHist.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "Asunto", HeaderText = "Asunto", AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill });
                dgvHist.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "Enlace", HeaderText = "Link", Width = 220 });

                // BindingSource inicial
                _bsHist.DataSource = _hist.OrderByDescending(x => x.Fecha).ToList();
                dgvHist.DataSource = _bsHist;

                Controls.AddRange(new Control[] {
                    lbl1, lbl2, lbl3, lbl4,
                    txtRemitente, dtFecha, txtAsunto, txtLink,
                    btnGuardar, btnCancelar, dgvHist
                });
                // Autocompletar
                _acRem.Clear();
                _acRem.AddRange(_hist.Where(h => !string.IsNullOrWhiteSpace(h.Remitente))
                                     .Select(h => h.Remitente.Trim())
                                     .Distinct(StringComparer.OrdinalIgnoreCase)
                                     .OrderBy(s => s)
                                     .ToArray());

                txtRemitente.AutoCompleteMode = AutoCompleteMode.SuggestAppend;
                txtRemitente.AutoCompleteSource = AutoCompleteSource.CustomSource;
                txtRemitente.AutoCompleteCustomSource = _acRem;

                // Filtro en vivo
                txtRemitente.TextChanged += (_, __) => ApplyHistoryFilter(txtRemitente.Text);

                // Comodidad: ↓
                txtRemitente.KeyDown += (s, ev) =>
                {
                    if (ev.KeyCode == Keys.Down && dgvHist.Rows.Count > 0)
                    {
                        dgvHist.Focus();
                        if (dgvHist.CurrentCell == null)
                            dgvHist.CurrentCell = dgvHist.Rows[0].Cells[0];
                        dgvHist.Rows[0].Selected = true;
                        ev.Handled = true;
                    }
                };

                ApplySicoeTheme();

                // OJO: quita el bloque que reasignaba DataSource con .Select(...)
                // (ya tenemos _bsHist como origen)

                // Doble clic rellena
                dgvHist.CellDoubleClick += (_, __) =>
                {
                    if (dgvHist.CurrentRow?.DataBoundItem is FrmSicoePresupuesto.SupportInfo si)
                    {
                        txtRemitente.Text = si.Remitente ?? "";
                        dtFecha.Value = si.Fecha == default ? DateTime.Today : si.Fecha;
                        txtAsunto.Text = si.Asunto ?? "";
                        txtLink.Text = si.Enlace ?? "";
                    }
                };

                // Normalizaciones
                txtRemitente.Leave += (_, __) =>
                {
                    var es = new CultureInfo("es-ES");
                    txtRemitente.Text = es.TextInfo.ToTitleCase((txtRemitente.Text ?? "").ToLower(es));
                };
                txtAsunto.Leave += (_, __) =>
                {
                    var s = txtAsunto.Text?.Trim() ?? "";
                    txtAsunto.Text = string.IsNullOrEmpty(s) ? "" :
                        char.ToUpper(s[0]) + (s.Length > 1 ? s.Substring(1).ToLowerInvariant() : "");
                };

                // Guardar
                btnGuardar.Click += (_, __) =>
                {
                    string rem = (txtRemitente.Text ?? "").Trim();
                    string asu = (txtAsunto.Text ?? "").Trim();
                    string lnk = (txtLink.Text ?? "").Trim();

                    if (string.IsNullOrWhiteSpace(rem) || string.IsNullOrWhiteSpace(asu) || string.IsNullOrWhiteSpace(lnk))
                    {
                        MessageBox.Show(this, "Remitente, Asunto y Link son obligatorios.", "SICOE",
                                        MessageBoxButtons.OK, MessageBoxIcon.Warning);
                        return;
                    }

                    SelectedSupport = new FrmSicoePresupuesto.SupportInfo
                    {
                        Remitente = rem,
                        Fecha = dtFecha.Value.Date,
                        Asunto = asu,
                        Enlace = lnk
                    };

                    // Actualiza historial (por Link)
                    var idx = _hist.FindIndex(h => h.Enlace.Equals(lnk, StringComparison.OrdinalIgnoreCase));
                    if (idx >= 0) _hist[idx] = SelectedSupport; else _hist.Insert(0, SelectedSupport);

                    // >>> AQUÍ (dentro del handler) refrescamos
                    if (!string.IsNullOrWhiteSpace(SelectedSupport.Remitente) &&
                        !_acRem.Contains(SelectedSupport.Remitente))
                    {
                        _acRem.Add(SelectedSupport.Remitente);
                    }
                    ApplyHistoryFilter(txtRemitente.Text);

                    DialogResult = DialogResult.OK;
                    Close();
                };

                btnCancelar.Click += (_, __) => { SelectedSupport = null; DialogResult = DialogResult.Cancel; Close(); };

                // Al abrir: muestra todo
                ApplyHistoryFilter(string.Empty);
                txtRemitente.Focus();
            }            // --- Paleta SICOE (ajusta tonos si quieres) ---
            static class SicoeColors
            {
                public static readonly Color Bg = Color.FromArgb(245, 249, 255);   // fondo suave
                public static readonly Color Panel = Color.FromArgb(230, 238, 252);
                public static readonly Color Primary = Color.FromArgb(47, 131, 232); // azul botones
                public static readonly Color PrimaryDark = Color.FromArgb(28, 101, 191);
                public static readonly Color Text = Color.FromArgb(30, 41, 59);
                public static readonly Color GridHeader = Color.FromArgb(222, 231, 250);
            }
            void ApplySicoeTheme()
            {
                // Form
                BackColor = SicoeColors.Bg;
                ForeColor = SicoeColors.Text;

                // Entradas
                foreach (Control c in Controls)
                {
                    if (c is TextBox tb) { tb.BorderStyle = BorderStyle.FixedSingle; tb.BackColor = Color.White; tb.ForeColor = SicoeColors.Text; }
                    if (c is DateTimePicker dt) { dt.CalendarMonthBackground = Color.White; dt.CalendarTitleBackColor = SicoeColors.Primary; }
                    if (c is Label lb) lb.ForeColor = SicoeColors.Text;
                    if (c is Button b)
                    {
                        b.FlatStyle = FlatStyle.Flat;
                        b.FlatAppearance.BorderSize = 0;
                    }
                }

                // Botones
                StyleButton(btnGuardar, SicoeColors.Primary, Color.White, SicoeColors.PrimaryDark);
                StyleButton(btnCancelar, Color.FromArgb(243, 244, 246), SicoeColors.Text, Color.FromArgb(225, 227, 230));

                // DataGridView
                dgvHist.BackgroundColor = SicoeColors.Bg;
                dgvHist.BorderStyle = BorderStyle.None;
                dgvHist.EnableHeadersVisualStyles = false;
                dgvHist.ColumnHeadersDefaultCellStyle.BackColor = SicoeColors.GridHeader;
                dgvHist.ColumnHeadersDefaultCellStyle.ForeColor = SicoeColors.Text;
                dgvHist.ColumnHeadersDefaultCellStyle.Font = new Font(dgvHist.Font, FontStyle.Bold);
                dgvHist.DefaultCellStyle.BackColor = Color.White;
                dgvHist.DefaultCellStyle.ForeColor = SicoeColors.Text;
                dgvHist.AlternatingRowsDefaultCellStyle.BackColor = SicoeColors.Panel;
                dgvHist.GridColor = Color.FromArgb(210, 220, 240);
            }
            void StyleButton(Button b, Color bg, Color fg, Color hover)
            {
                b.BackColor = bg;
                b.ForeColor = fg;
                b.FlatStyle = FlatStyle.Flat;
                b.FlatAppearance.BorderSize = 0;
                b.MouseEnter += (_, __) => b.BackColor = hover;
                b.MouseLeave += (_, __) => b.BackColor = bg;
            }

        }
        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            int r = 12; // radio de esquina
            var bounds = new Rectangle(0, 0, this.Width, this.Height);

            using (var path = new GraphicsPath())
            {
                path.AddArc(bounds.X, bounds.Y, r, r, 180, 90);
                path.AddArc(bounds.Right - r, bounds.Y, r, r, 270, 90);
                path.AddArc(bounds.Right - r, bounds.Bottom - r, r, r, 0, 90);
                path.AddArc(bounds.X, bounds.Bottom - r, r, r, 90, 90);
                path.CloseFigure();
                this.Region = new Region(path);
            }

        }

        private string AutoPkFor(acDb.ObjectId entId)
        {
            return PkStore.TryGetPkForEntity(entId, out var pk) ? pk : "";
        }
        private sealed class CatRow { public string Codigo = ""; public string Descripcion = ""; public string Und = ""; public double ValorUnitario = 0; }

        private List<CatRow> GetCatalogoFiltradoCapituloActual()
        {
            var list = new List<CatRow>();

            // Caso 1: DataTable como DataSource del combo `cmbItem`
            if (cmbItem?.DataSource is DataTable dt)
            {
                string[] cols = dt.Columns.Cast<DataColumn>().Select(c => c.ColumnName.ToUpperInvariant()).ToArray();
                string colCod = cols.FirstOrDefault(c => c.Contains("ITEM") || c == "CODIGO") ?? cols.First();
                string colDesc = cols.FirstOrDefault(c => c.Contains("DESC")) ?? cols.Last();
                string colUnd = cols.FirstOrDefault(c => c.StartsWith("UND")) ?? "UND";
                string colVU = cols.FirstOrDefault(c => c.Contains("VALOR")) ?? "";

                foreach (DataRow r in dt.Rows)
                {
                    var row = new CatRow
                    {
                        Codigo = Convert.ToString(r[colCod]) ?? "",
                        Descripcion = Convert.ToString(r[colDesc]) ?? "",
                        Und = dt.Columns.Contains(colUnd) ? Convert.ToString(r[colUnd]) ?? "" : "m",
                        ValorUnitario = dt.Columns.Contains(colVU) ? ToD(r[colVU]) : 0
                    };
                    list.Add(row);
                }
                return list;
            }

            // Caso 2: lista de objetos (código genérico)
            if (cmbItem?.DataSource is System.Collections.IEnumerable en)
            {
                foreach (var o in en)
                {
                    var t = o.GetType();
                    string cod = TryGet<string>(o, t, "Codigo") ?? TryGet<string>(o, t, "Item") ?? cmbItem.GetItemText(o);
                    string des = TryGet<string>(o, t, "Descripcion") ?? "";
                    string und = TryGet<string>(o, t, "Und") ?? "m";
                    double vu = TryGet<double?>(o, t, "ValorUnitario") ?? 0;
                    list.Add(new CatRow { Codigo = cod ?? "", Descripcion = des ?? "", Und = und ?? "m", ValorUnitario = vu });
                }
                return list;
            }

            // Fallback: usa los ítems visuales del combo
            if (cmbItem != null)
            {
                foreach (var it in cmbItem.Items)
                {
                    var txt = cmbItem.GetItemText(it);
                    list.Add(new CatRow { Codigo = txt, Descripcion = "", Und = "m", ValorUnitario = 0 });
                }
            }
            return list;

            static T? TryGet<T>(object obj, Type t, string prop)
            {
                var p = t.GetProperty(prop);
                if (p == null) return default;
                var v = p.GetValue(obj);
                if (v == null) return default;
                return (T)Convert.ChangeType(v, typeof(T));
            }
            static double ToD(object v)
            {
                if (v == null) return 0;
                if (v is double d) return d;
                double.TryParse(Convert.ToString(v), out var x);
                return x;
            }
        }
        // Suma de longitudes para LINE, LWPOLYLINE, 2D/3D Polyline, ARC, CIRCLE
        private double CalcularLongitudDeSeleccion(IEnumerable<Autodesk.AutoCAD.DatabaseServices.ObjectId> ids)
        {
            if (ids == null) return 0.0;

            var doc = Autodesk.AutoCAD.ApplicationServices.Application.DocumentManager.MdiActiveDocument;
            var db = doc.Database;
            double total = 0.0;

            using (var tr = db.TransactionManager.StartTransaction())
            {
                foreach (var id in ids)
                {
                    var ent = tr.GetObject(id, Autodesk.AutoCAD.DatabaseServices.OpenMode.ForRead)
                                as Autodesk.AutoCAD.DatabaseServices.Entity;
                    if (ent == null) continue;
                    total += GetLongitudEntidad(ent);
                }
                tr.Commit();
            }
            return total;
        }

        private static double GetLongitudEntidad(Autodesk.AutoCAD.DatabaseServices.Entity ent)
        {
            switch (ent)
            {
                case Autodesk.AutoCAD.DatabaseServices.Line ln:
                    return ln.Length;

                case Autodesk.AutoCAD.DatabaseServices.Arc ar:
                    return ar.Length;

                case Autodesk.AutoCAD.DatabaseServices.Circle ci:
                    return 2.0 * Math.PI * ci.Radius; // perímetro si alguna vez usas círculos

                case Autodesk.AutoCAD.DatabaseServices.Polyline pl: // LWPOLYLINE
                    return pl.Length;

                case Autodesk.AutoCAD.DatabaseServices.Polyline2d pl2:
                    {
                        double len = 0.0;
                        Autodesk.AutoCAD.DatabaseServices.Vertex2d prev = null;
                        foreach (Autodesk.AutoCAD.DatabaseServices.ObjectId vId in pl2)
                        {
                            var v = (Autodesk.AutoCAD.DatabaseServices.Vertex2d)pl2.Database.TransactionManager
                                    .GetObject(vId, Autodesk.AutoCAD.DatabaseServices.OpenMode.ForRead);
                            if (prev != null) len += prev.Position.DistanceTo(v.Position);
                            prev = v;
                        }
                        return len;
                    }

                case Autodesk.AutoCAD.DatabaseServices.Polyline3d pl3:
                    {
                        double len = 0.0;
                        Autodesk.AutoCAD.Geometry.Point3d? prev = null;
                        foreach (Autodesk.AutoCAD.DatabaseServices.ObjectId vId in pl3)
                        {
                            var v = (Autodesk.AutoCAD.DatabaseServices.PolylineVertex3d)pl3.Database.TransactionManager
                                    .GetObject(vId, Autodesk.AutoCAD.DatabaseServices.OpenMode.ForRead);
                            if (prev.HasValue) len += prev.Value.DistanceTo(v.Position);
                            prev = v.Position;
                        }
                        return len;
                    }
            }
            return 0.0;
        }
        private static List<string> GetAllPkIds()
        {
            var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            // 1) PK de regiones activas (PkStore)
            if (PkStore.DebugDumpPkRegions(out var names) > 0 && names != null)
                foreach (var n in names) if (!string.IsNullOrWhiteSpace(n)) set.Add(n.Trim());

            // 2) PK declarados por regiones dibujadas (si tu PkStore lo soporta)
            var fromRegions = PkStore.LoadPkNamesFromRegions();
            if (fromRegions != null)
                foreach (var n in fromRegions)
                    if (!string.IsNullOrWhiteSpace(n)) set.Add(n.Trim());

            // 3) PK presentes en XData de entidades del DWG
            try
            {
                var db = acApp.Application.DocumentManager.MdiActiveDocument?.Database;
                if (db != null)
                    using (var tr = db.TransactionManager.StartTransaction())
                    {
                        var btr = (acDb.BlockTableRecord)tr.GetObject(db.CurrentSpaceId, acDb.OpenMode.ForRead);
                        foreach (acDb.ObjectId id in btr)
                        {
                            if (tr.GetObject(id, acDb.OpenMode.ForRead, false, true) is not acDb.Entity e) continue;
                            var pk = ReadEntityPk(e);
                            if (!string.IsNullOrWhiteSpace(pk)) set.Add(pk.Trim());
                        }
                        tr.Commit();
                    }
            }
            catch { /* tolerante */ }

            return set.OrderBy(s => s, StringComparer.OrdinalIgnoreCase).ToList();
        }
        private static void EnsureRegApp(string regAppName = "SICOE_PK")
        {
            var db = acApp.Application.DocumentManager.MdiActiveDocument.Database;
            using var tr = db.TransactionManager.StartTransaction();
            var rat = (acDb.RegAppTable)tr.GetObject(db.RegAppTableId, acDb.OpenMode.ForRead);
            if (!rat.Has(regAppName))
            {
                rat.UpgradeOpen();
                var rec = new acDb.RegAppTableRecord { Name = regAppName };
                rat.Add(rec);
                tr.AddNewlyCreatedDBObject(rec, true);
            }
            tr.Commit();
        }
        private static void SetEntityPk(acDb.ObjectId id, string pk)
        {
            if (string.IsNullOrWhiteSpace(pk)) return;
            EnsureRegApp();

            var db = acApp.Application.DocumentManager.MdiActiveDocument.Database;
            using var tr = db.TransactionManager.StartTransaction();

            if (tr.GetObject(id, acDb.OpenMode.ForWrite, false, true) is acDb.Entity e)
            {
                var tvs = new acDb.ResultBuffer(
                    new acDb.TypedValue((int)acDb.DxfCode.ExtendedDataRegAppName, "SICOE_PK"),
                    new acDb.TypedValue((int)acDb.DxfCode.ExtendedDataAsciiString, pk.Trim())
                );
                e.XData = tvs;
            }

            tr.Commit();
        }
        private static string ReadEntityPk(acDb.Entity e)
        {
            try
            {
                var rb = e.XData;
                if (rb == null) return "";
                using (rb)
                {
                    string lastApp = "";
                    foreach (acDb.TypedValue tv in rb)
                    {
                        if (tv.TypeCode == (int)acDb.DxfCode.ExtendedDataRegAppName)
                            lastApp = (tv.Value as string) ?? "";
                        else if (tv.TypeCode == (int)acDb.DxfCode.ExtendedDataAsciiString &&
                                 string.Equals(lastApp, "SICOE_PK", StringComparison.OrdinalIgnoreCase))
                            return (tv.Value as string) ?? "";
                    }
                }
            }
            catch { }
            return "";
        }
        private static void AsignarPkManualASeleccionDescartada(IEnumerable<acDb.ObjectId> ids, string pkManual)
        {
            var list = ids?.ToList();
            if (list == null || list.Count == 0) return;

            var db = acApp.Application.DocumentManager.MdiActiveDocument.Database;
            using var tr = db.TransactionManager.StartTransaction();
            foreach (var id in list)
            {
                try
                {
                    if (tr.GetObject(id, acDb.OpenMode.ForRead, false, true) is acDb.Entity)
                    {
                        // SetEntityPk abre y escribe con su propia transacción si lo deseas;
                        // aquí lo hacemos dentro del mismo 'tr' para eficiencia:
                        if (tr.GetObject(id, acDb.OpenMode.ForWrite, false, true) is acDb.Entity e)
                        {
                            EnsureRegApp();
                            var tvs = new acDb.ResultBuffer(
                                new acDb.TypedValue((int)acDb.DxfCode.ExtendedDataRegAppName, "SICOE_PK"),
                                new acDb.TypedValue((int)acDb.DxfCode.ExtendedDataAsciiString, pkManual.Trim())
                            );
                            e.XData = tvs;
                        }
                    }
                }
                catch { /* tolerante */ }
            }
            tr.Commit();
        }
        /// <summary>
        /// Bloquea TODOS los layers usados en las filas exportadas (LayerEnt y LayerTxt).
        /// Esto impide edición manual en AutoCAD; solo VBA podrá desbloquear temporalmente.
        /// </summary>
        /// <summary>
        /// Bloquea los layers especificados para proteger entidades recién creadas.
        /// Esto impide edición/eliminación manual en AutoCAD.
        /// </summary>

    }
}


