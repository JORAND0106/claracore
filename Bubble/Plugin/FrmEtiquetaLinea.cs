using System;
using System.Collections.Generic;
using System.Collections.Specialized;
using System.Linq;
using System.Text;
using System.Windows.Forms;

namespace SicoePresupuestoNET8
{
    public partial class FrmEtiquetaLinea : Form
    {
        private readonly double _longitudTotal;
        private readonly double? _longitudUtil;
        private readonly string _rumbo;

        // Nuevo: admite longitud útil opcional para etiquetar Lt/Lu
        public FrmEtiquetaLinea(double longitudTotal, string rumbo, double? longitudUtil = null)
        {
            
            
            _longitudTotal = longitudTotal;
            _longitudUtil = longitudUtil;
            _rumbo = rumbo;

            InitializeComponent();

            // Mostrar Lt y, si existe, Lu en el label existente.
            if (_longitudUtil.HasValue)
                lblLongCalc.Text = $"Lt: {_longitudTotal:F2} m{Environment.NewLine}Lu: {_longitudUtil.Value:F2} m";
            else
                lblLongCalc.Text = $"Longitud: {_longitudTotal:F2} m";

            lblRumboCalc.Text = $"Rumbo: {_rumbo}";

            // Longitud marcada por defecto
            chkLongitud.Checked = true;
            // Autocomplete para prefijos
            prefInicio.AutoCompleteMode = AutoCompleteMode.SuggestAppend;
            prefInicio.AutoCompleteSource = AutoCompleteSource.CustomSource;
            prefFin.AutoCompleteMode = AutoCompleteMode.SuggestAppend;
            prefFin.AutoCompleteSource = AutoCompleteSource.CustomSource;


            // Autocompletes
            InitAutocompleteForMaterialYDiametro();
            try
            {
                var doc = Autodesk.AutoCAD.ApplicationServices.Application.DocumentManager.MdiActiveDocument;
                if (doc != null) InitLayerAutocomplete(doc);
            }
            catch { /* tolerante */ }

            // ▼ Añade esto al final del constructor, antes de salir del ctor
            HeightStore.Load(); // lee desde %LOCALAPPDATA%\SicoePresupuestoNET8\altura_texto.json
            var last = HeightStore.Get();
            if (last.HasValue)
            {
                // respeta los límites del NumericUpDown
                var v = (decimal)Math.Max((double)numAltura.Minimum, Math.Min((double)numAltura.Maximum, last.Value));
                numAltura.Value = v;
            }


        }

        private AutoCompleteStringCollection _acLayers;
        public string LayerDestino => txlyrNodo.Text?.Trim() ?? "";

        protected override void OnLoad(EventArgs e)
        {
            base.OnLoad(e);

            // Cargar bases de autocompletar
            AutoCompleteStore.Load();    // material/diámetro (ya existente)
            PrefixStore.Load();          // << nuevo: prefijos

            // Material/Diámetro ya lo inicializas en InitAutocompleteForMaterialYDiametro()

            // Prefijos: asignar listas al CustomSource
            var acIni = new AutoCompleteStringCollection();
            acIni.AddRange(PrefixStore.GetIni());
            prefInicio.AutoCompleteCustomSource = acIni;

            var acFin = new AutoCompleteStringCollection();
            acFin.AddRange(PrefixStore.GetFin());
            prefFin.AutoCompleteCustomSource = acFin;
        }


        private void TxtMaterial_TextChanged(object? sender, EventArgs e)
            => chkMaterial.Checked = !string.IsNullOrWhiteSpace(txtMaterial.Text);

        private void TxtDiametro_TextChanged(object? sender, EventArgs e)
            => chkDiametro.Checked = !string.IsNullOrWhiteSpace(txtDiametro.Text);

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (this.DialogResult == DialogResult.OK)
            {
                HeightStore.Set((double)numAltura.Value);
                HeightStore.Save();
            }

        }

        private void bntOK_Click(object sender, EventArgs e)
        {
            // 1) Capa obligatoria
            if (string.IsNullOrWhiteSpace(LayerDestino))
            {
                MessageBox.Show("Digite el nombre de la capa para la línea y la etiqueta.", "SICOE",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                txlyrNodo.Focus();
                return;
            }

            // 2) === Validación de nodos y prefijos ===
            string pIni = (prefInicio.Text ?? "").Trim().ToUpperInvariant();
            string pFin = (prefFin.Text ?? "").Trim().ToUpperInvariant();
            string nIni = (txNodoIni.Text ?? "").Trim();
            string nFin = (txNodoFin.Text ?? "").Trim();

            pIni = System.Text.RegularExpressions.Regex.Replace(RemoveDiacritics(pIni), @"[^A-Z0-9_-]", "");
            pFin = System.Text.RegularExpressions.Regex.Replace(RemoveDiacritics(pFin), @"[^A-Z0-9_-]", "");
            prefInicio.Text = pIni;
            prefFin.Text = pFin;

            // Persistir prefijos para autocompletar futuras sesiones
            if (!string.IsNullOrEmpty(pIni)) PrefixStore.AddIni(pIni);
            if (!string.IsNullOrEmpty(pFin)) PrefixStore.AddFin(pFin);
            PrefixStore.Save();



            if (!string.IsNullOrEmpty(nIni) && string.IsNullOrEmpty(pIni))
            {
                MessageBox.Show("Debe diligenciar el prefijo para el nodo inicial.", "Validación",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                prefInicio.Focus();
                return;
            }
            if (!string.IsNullOrEmpty(nFin) && string.IsNullOrEmpty(pFin))
            {
                MessageBox.Show("Debe diligenciar el prefijo para el nodo final.", "Validación",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                prefFin.Focus();
                return;
            }

            // 3) Persistencias
            LayerStore.Add(LayerDestino);
            LayerStore.Save();

            HeightStore.Set((double)numAltura.Value);
            HeightStore.Save();

            SaveHistories();

            // 4) Cerrar
            this.DialogResult = DialogResult.OK;
            this.Close();
        }

        // Helper para quitar tildes
        private static string RemoveDiacritics(string text)
        {
            if (string.IsNullOrEmpty(text)) return text;
            var normalized = text.Normalize(System.Text.NormalizationForm.FormD);
            var sb = new System.Text.StringBuilder();
            foreach (var c in normalized)
            {
                var uc = System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c);
                if (uc != System.Globalization.UnicodeCategory.NonSpacingMark) sb.Append(c);
            }
            return sb.ToString().Normalize(System.Text.NormalizationForm.FormC);
        }

        // === Exposición segura para otros formularios ===
        public string NodoIniText => (txNodoIni.Text ?? "").Trim();
        public string NodoFinText => (txNodoFin.Text ?? "").Trim();
        public string PrefIniText => System.Text.RegularExpressions.Regex.Replace(
            RemoveDiacritics((prefInicio.Text ?? "").Trim().ToUpperInvariant()), @"[^A-Z0-9_-]", "");
        public string PrefFinText => System.Text.RegularExpressions.Regex.Replace(
            RemoveDiacritics((prefFin.Text ?? "").Trim().ToUpperInvariant()), @"[^A-Z0-9_-]", "");

        private void txtMaterial_TextChanged(object? sender, EventArgs e)
            => chkMaterial.Checked = !string.IsNullOrWhiteSpace(txtMaterial.Text);

        private void txtDiametro_TextChanged(object? sender, EventArgs e)
            => chkDiametro.Checked = !string.IsNullOrWhiteSpace(txtDiametro.Text);

        // Exposición de selecciones / valores
        public bool IncluirLongitud => chkLongitud.Checked;
        public bool IncluirDiametro => chkDiametro.Checked && !string.IsNullOrWhiteSpace(txtDiametro.Text);
        public bool IncluirMaterial => chkMaterial.Checked && !string.IsNullOrWhiteSpace(txtMaterial.Text);
        public bool IncluirPendiente => chkPendiente.Checked && !string.IsNullOrWhiteSpace(txtPendiente.Text);
        public bool IncluirRumbo => chkRumbo.Checked;
        public bool MarcarVertices => chkVertices.Checked;
        // Valor de longitud formateado para usar en el texto, sin depender de labels
        public string PrefijoVertices => txtPrefijo.Text?.Trim();
        public int NumeradorInicial => int.TryParse(txtNumerador.Text?.Trim(), out var n) ? Math.Max(1, n) : 1;

        public double AlturaTexto => (double)numAltura.Value;

        private AutoCompleteStringCollection _acMaterial, _acDiametro;
        // === NUEVO: exposición de Nodo Inicio y Nodo Fin ===
        private void InitAutocompleteForMaterialYDiametro()
        {
            // Fuentes desde el store JSON
            _acMaterial = new AutoCompleteStringCollection();
            _acMaterial.AddRange(AutoCompleteStore.GetMaterial());

            _acDiametro = new AutoCompleteStringCollection();
            _acDiametro.AddRange(AutoCompleteStore.GetDiametro());

            // Configurar TextBoxes
            txtMaterial.AutoCompleteMode = AutoCompleteMode.SuggestAppend;
            txtMaterial.AutoCompleteSource = AutoCompleteSource.CustomSource;
            txtMaterial.AutoCompleteCustomSource = _acMaterial;

            txtDiametro.AutoCompleteMode = AutoCompleteMode.SuggestAppend;
            txtDiametro.AutoCompleteSource = AutoCompleteSource.CustomSource;
            txtDiametro.AutoCompleteCustomSource = _acDiametro;
        }


        private static string[] ToArrayDistinct(StringCollection sc)
        {
            var hs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (string s in sc) if (!string.IsNullOrWhiteSpace(s)) hs.Add(s.Trim());
            return hs.ToArray();
        }
        private void SaveHistories()
        {
            AutoCompleteStore.AddMaterial(txtMaterial.Text);
            AutoCompleteStore.AddDiametro(txtDiametro.Text);
            AutoCompleteStore.Save();
        }


        public string BuildEtiquetaText()
        {
            var partes = new List<string>();

            if (chkDiametro.Checked)
                partes.Add($"\\U+2205{txtDiametro.Text}\"");          // Ø = \U+2205 en SHX/estándar
            if (chkMaterial.Checked)
                partes.Add($"{txtMaterial.Text}");
            if (chkLongitud.Checked)
                partes.Add($"L={_longitudTotal} m");
            if (chkPendiente.Checked)
                partes.Add($"i={txtPendiente.Text} m%");

            // —— NUEVO: multilínea ——
            var lineas = new List<string>();

            // orden explícito en filas
            // Orden de filas. Solo se muestran si el checkbox está marcado.
            if (chkLongitud.Checked)
            {
                lineas.Add($"Lt={_longitudTotal:0.##} m");
                if (_longitudUtil.HasValue)
                    lineas.Add($"Lu={_longitudUtil.Value:0.##} m");
            }
            if (chkDiametro.Checked) lineas.Add($"\\U+2205{txtDiametro.Text}\"");
            if (chkMaterial.Checked) lineas.Add($"{txtMaterial.Text}");
            if (chkPendiente.Checked) lineas.Add($"i={txtPendiente.Text} m%");

            // AutoCAD MText usa \P para salto de párrafo
            return string.Join("\\P", lineas);
        }
        private void InitLayerAutocomplete(Autodesk.AutoCAD.ApplicationServices.Document doc)
        {
            // 1) Cargar base JSON previa
            LayerStore.Load();

            // 2) Leer capas del dibujo actual
            var desdeDwg = new List<string>();
            using (doc.LockDocument())
            using (var tr = doc.Database.TransactionManager.StartTransaction())
            {
                var lt = (Autodesk.AutoCAD.DatabaseServices.LayerTable)
                         tr.GetObject(doc.Database.LayerTableId, Autodesk.AutoCAD.DatabaseServices.OpenMode.ForRead);
                foreach (Autodesk.AutoCAD.DatabaseServices.ObjectId id in lt)
                {
                    var ltr = (Autodesk.AutoCAD.DatabaseServices.LayerTableRecord)tr.GetObject(id,
                        Autodesk.AutoCAD.DatabaseServices.OpenMode.ForRead);
                    var name = (ltr?.Name ?? "").Trim();
                    if (!string.IsNullOrWhiteSpace(name)) desdeDwg.Add(name);
                }
                tr.Commit();
            }

            // 3) Unir capas de DWG + JSON y configurar el TextBox como autocomplete
            var hs = new HashSet<string>(LayerStore.GetAll(), StringComparer.OrdinalIgnoreCase);
            foreach (var s in desdeDwg) hs.Add(s);

            _acLayers = new AutoCompleteStringCollection();
            _acLayers.AddRange(hs.ToArray());

            txlyrNodo.AutoCompleteMode = AutoCompleteMode.SuggestAppend;
            txlyrNodo.AutoCompleteSource = AutoCompleteSource.CustomSource;
            txlyrNodo.AutoCompleteCustomSource = _acLayers;
        }
        internal static class LayerStore
        {
            private static readonly string _file =
                System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "SicoePresupuestoNET8", "layers.json");

            private static readonly HashSet<string> _layers = new(StringComparer.OrdinalIgnoreCase);

            public static void Load()
            {
                try
                {
                    var dir = System.IO.Path.GetDirectoryName(_file);
                    if (!System.IO.Directory.Exists(dir)) System.IO.Directory.CreateDirectory(dir);

                    if (System.IO.File.Exists(_file))
                    {
                        var json = System.IO.File.ReadAllText(_file, Encoding.UTF8);
                        var arr = Newtonsoft.Json.JsonConvert.DeserializeObject<string[]>(json) ?? Array.Empty<string>();
                        _layers.Clear();
                        foreach (var s in arr)
                            if (!string.IsNullOrWhiteSpace(s)) _layers.Add(s.Trim());
                    }
                }
                catch { /* tolerante */ }
            }

            public static void Save()
            {
                try
                {
                    var dir = System.IO.Path.GetDirectoryName(_file);
                    if (!System.IO.Directory.Exists(dir)) System.IO.Directory.CreateDirectory(dir);
                    var arr = _layers.OrderBy(s => s, StringComparer.OrdinalIgnoreCase).ToArray();
                    var json = Newtonsoft.Json.JsonConvert.SerializeObject(arr);
                    System.IO.File.WriteAllText(_file, json, Encoding.UTF8);
                }
                catch { /* tolerante */ }
            }

            public static void Add(string name)
            {
                if (!string.IsNullOrWhiteSpace(name)) _layers.Add(name.Trim());
            }

            public static IEnumerable<string> GetAll() => _layers.ToArray();
        }
        internal static class HeightStore
        {
            private static readonly string _file =
                System.IO.Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "SicoePresupuestoNET8",
                    "altura_texto.json");

            private static double? _last;

            public static void Load()
            {
                try
                {
                    var dir = System.IO.Path.GetDirectoryName(_file);
                    if (!System.IO.Directory.Exists(dir))
                        System.IO.Directory.CreateDirectory(dir);

                    if (System.IO.File.Exists(_file))
                    {
                        var json = System.IO.File.ReadAllText(_file, Encoding.UTF8);
                        _last = Newtonsoft.Json.JsonConvert.DeserializeObject<double?>(json);
                    }
                }
                catch { _last = null; }
            }

            public static void Save()
            {
                try
                {
                    var dir = System.IO.Path.GetDirectoryName(_file);
                    if (!System.IO.Directory.Exists(dir))
                        System.IO.Directory.CreateDirectory(dir);

                    var json = Newtonsoft.Json.JsonConvert.SerializeObject(_last);
                    System.IO.File.WriteAllText(_file, json, Encoding.UTF8);
                }
                catch { /* tolerante */ }
            }

            public static double? Get() => _last;

            public static void Set(double v) => _last = v;
        }
        internal static class PrefixStore
        {
            private static readonly string _file =
                System.IO.Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "SicoePresupuestoNET8",
                    "prefijos.json");

            // mantenemos dos conjuntos: prefijo de inicio y de fin
            private static readonly HashSet<string> _ini = new(StringComparer.OrdinalIgnoreCase);
            private static readonly HashSet<string> _fin = new(StringComparer.OrdinalIgnoreCase);

            private class PrefixPayload
            {
                public string[] Ini { get; set; } = Array.Empty<string>();
                public string[] Fin { get; set; } = Array.Empty<string>();
            }

            public static void Load()
            {
                try
                {
                    var dir = System.IO.Path.GetDirectoryName(_file);
                    if (!System.IO.Directory.Exists(dir))
                        System.IO.Directory.CreateDirectory(dir);

                    _ini.Clear(); _fin.Clear();

                    if (System.IO.File.Exists(_file))
                    {
                        var json = System.IO.File.ReadAllText(_file, Encoding.UTF8);
                        var data = Newtonsoft.Json.JsonConvert.DeserializeObject<PrefixPayload>(json)
                                   ?? new PrefixPayload();
                        foreach (var s in data.Ini ?? Array.Empty<string>())
                            if (!string.IsNullOrWhiteSpace(s)) _ini.Add(s.Trim());
                        foreach (var s in data.Fin ?? Array.Empty<string>())
                            if (!string.IsNullOrWhiteSpace(s)) _fin.Add(s.Trim());
                    }
                }
                catch { /* tolerante */ }
            }

            public static void Save()
            {
                try
                {
                    var dir = System.IO.Path.GetDirectoryName(_file);
                    if (!System.IO.Directory.Exists(dir))
                        System.IO.Directory.CreateDirectory(dir);

                    // limitar tamaño para que no crezca sin control
                    static string[] TakeTop(HashSet<string> hs, int max) =>
                        hs.OrderBy(s => s, StringComparer.OrdinalIgnoreCase).Take(max).ToArray();

                    var payload = new PrefixPayload
                    {
                        Ini = TakeTop(_ini, 200),
                        Fin = TakeTop(_fin, 200)
                    };

                    var json = Newtonsoft.Json.JsonConvert.SerializeObject(
                                        payload,
                                        Newtonsoft.Json.Formatting.Indented);

                    System.IO.File.WriteAllText(_file, json, Encoding.UTF8);
                }
                catch { /* tolerante */ }
            }

            public static void AddIni(string s)
            {
                if (!string.IsNullOrWhiteSpace(s))
                    _ini.Add(s.Trim().ToUpperInvariant());
            }

            public static void AddFin(string s)
            {
                if (!string.IsNullOrWhiteSpace(s))
                    _fin.Add(s.Trim().ToUpperInvariant());
            }

            public static string[] GetIni() => _ini.ToArray();
            public static string[] GetFin() => _fin.ToArray();
        }


    }
}
