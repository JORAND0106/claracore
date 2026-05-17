using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Linq;
using System.IO;
using Newtonsoft.Json;
using System.Windows.Forms;

namespace SicoePresupuestoNET8
{
    public partial class FrmCapasCsvPopup : Form
    {
        private readonly BindingList<CapaInfo> _binding;
        private HashSet<string> _pkConRegion = new(StringComparer.OrdinalIgnoreCase);
        public List<CapaInfo> CapasCargadas => _binding.ToList();
        public string UltimaRuta { get; private set; } = "";

        public FrmCapasCsvPopup(List<CapaInfo> inicio, string rutaInicial)
        {
            InitializeComponent();

            _binding = new BindingList<CapaInfo>(inicio?.ToList() ?? new List<CapaInfo>());
            dgvCapas.DataSource = _binding;
            // en el constructor, después de asignar DataSource
            EnsureRegionColumn();
            ReloadPkRegionState();
          
            RefrescarColumnaRegion();

            if (!string.IsNullOrWhiteSpace(rutaInicial))
            {
                UltimaRuta = rutaInicial;
                lblRuta.Text = "Ruta: " + UltimaRuta;
            }

            // grid solo lectura
            dgvCapas.ReadOnly = true;
            dgvCapas.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
            dgvCapas.MultiSelect = false;

            // la primera vez que se muestra la ventana, recarga el estado de regiones
            this.Shown += (_, __) => ReloadPkRegionState();

            btnExportJson.Click += BtnExportJson_Click;
            btnImportJson.Click += BtnImportJson_Click;
            btnExportGeoJson.Click += BtnExportGeoJson_Click;
            // en FrmCapasCsvPopup.cs (constructor, después de InitializeComponent)
            btnNuevoPk.Click += BtnNuevoPk_Click;   // este es el de la UI

        }

        private void BtnCargarCsv_Click(object sender, EventArgs e)
        {
            if (!AcadOpenPathHelper.TryPickOpenFile(
                    "Cargar CSV con PK_ID",
                    "CSV (*.csv)|*.csv|Todos (*.*)|*.*",
                    out var path,
                    UltimaRuta,
                    this)
                || string.IsNullOrWhiteSpace(path))
                return;

            CargarCsvDesdeRuta(path);
        }

        private void CargarCsvDesdeRuta(string path)
        {
            var ext = Path.GetExtension(path);
            if (!string.IsNullOrEmpty(ext) &&
                !ext.Equals(".csv", StringComparison.OrdinalIgnoreCase) &&
                !ext.Equals(".txt", StringComparison.OrdinalIgnoreCase))
            {
                var dr = MessageBox.Show(this,
                    $"La extensión \"{ext}\" no es .csv.\n¿Intentar leer el archivo de todos modos?",
                    "SICOE", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
                if (dr != DialogResult.Yes) return;
            }

            var prevRuta = lblRuta.Text;
            lblRuta.Text = "Cargando CSV…";
            btnCargarCsv.Enabled = false;
            Cursor = Cursors.WaitCursor;
            try
            {
                var list = CapasCsvReader.Read(path);
                if (list == null || list.Count == 0)
                {
                    string preview = "";
                    try
                    {
                        var ln = File.ReadLines(path).FirstOrDefault(l => !string.IsNullOrWhiteSpace(l));
                        if (ln != null)
                            preview = ln.Length > 120 ? ln.Substring(0, 120) + "…" : ln;
                    }
                    catch { }

                    MessageBox.Show(this,
                        "No se encontraron filas con PK_ID (columna CAPA).\n\n" +
                        "Encabezado esperado:\nCAPA, CIV, TRAMO, INFRAESTRUCTURA, COSTADO, UBICACION, ABS_INICIO, ABS_FINAL, CALZADA\n\n" +
                        (string.IsNullOrEmpty(preview) ? "" : $"Primera línea del archivo:\n{preview}"),
                        "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }

                dgvCapas.SuspendLayout();
                try
                {
                    _binding.Clear();
                    foreach (var c in list)
                        _binding.Add(c);
                }
                finally
                {
                    dgvCapas.ResumeLayout(true);
                }

                UltimaRuta = path;
                lblRuta.Text = "Ruta: " + UltimaRuta;

                EnsureRegionColumn();
                ReloadPkRegionState();

                MessageBox.Show(this, $"Se cargaron {list.Count} PK_ID desde:\n{path}",
                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "Error al cargar el archivo CSV:\n" + ex.Message,
                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                btnCargarCsv.Enabled = true;
                Cursor = Cursors.Default;
                if (lblRuta.Text == "Cargando CSV…")
                    lblRuta.Text = prevRuta;
            }
        }

        private void BtnCargarPk_Click(object sender, EventArgs e)
        {
            var sugerencias = _binding.Select(c => c.CAPA)
                                     .Where(s => !string.IsNullOrWhiteSpace(s))
                                     .Distinct(StringComparer.OrdinalIgnoreCase)
                                     .OrderBy(s => s).ToList();

            var f = new FrmPkRegionPicker(sugerencias);
            f.TopMost = false;
            f.FormClosed += (s, ea) =>
            {
                _pkConRegion = PkStore.LoadPkNamesFromRegions();
                RefrescarColumnaRegion();
                if (!string.IsNullOrWhiteSpace(f.LastPkName))
                {
                    foreach (DataGridViewRow row in dgvCapas.Rows)
                    {
                        var pk = Convert.ToString(row.Cells[0].Value)?.Trim();
                        if (string.Equals(pk, f.LastPkName, StringComparison.OrdinalIgnoreCase))
                        {
                            row.Selected = true;
                            dgvCapas.FirstDisplayedScrollingRowIndex = row.Index;
                            break;
                        }
                    }
                }
                ReloadPkRegionState();
            };
            f.Show();
        }
        private void RefrescarColumnaRegion()
        {
            EnsureRegionColumn();
            int colPk = GetPkColumnIndex();

            foreach (DataGridViewRow r in dgvCapas.Rows)
            {
                var pk = Convert.ToString(r.Cells[colPk].Value)?.Trim();
                bool tiene = !string.IsNullOrWhiteSpace(pk) && _pkConRegion.Contains(pk);
                r.Cells["colRegion"].Value = tiene ? "✓" : "";
            }
        }


        private void EnsureRegionColumn()
        {
            if (dgvCapas.Columns["colRegion"] != null) return;

            var col = new DataGridViewTextBoxColumn
            {
                Name = "colRegion",
                HeaderText = "Región",
                ReadOnly = true,
                Width = 60
            };
            dgvCapas.Columns.Insert(0, col);
        }
        private void ReloadPkRegionState()
        {
            _pkConRegion = PkStore.LoadPkNamesFromRegions(); // lee del DWG (XData)
            RefrescarColumnaRegion();
        }


        // localiza la columna del PK por propiedad, no por índice fijo
        // Busca la columna que contiene el PK (por texto de cabecera o nombre)
        private int GetPkColumnIndex()
        {
            foreach (DataGridViewColumn c in dgvCapas.Columns)
            {
                // Ajusta aquí si tu cabecera cambia
                if (string.Equals(c.HeaderText, "Pk_Id/Sector", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(c.Name, "Pk_IdSector", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(c.DataPropertyName, "Pk_IdSector", StringComparison.OrdinalIgnoreCase))
                    return c.Index;
            }
            // fallback: asume que inserta "Región" en 0 y PK queda en 1
            return Math.Min(1, dgvCapas.Columns.Count - 1);
        }


        // asocia este handler al botón "Exportar JSON"
        private void BtnExportGeoJson_Click(object? sender, EventArgs e)
        {
            using var sfdGeo = new SaveFileDialog
            {
                Title = "Exportar regiones a GeoJSON",
                Filter = "GeoJSON (*.geojson)|*.geojson|JSON (*.json)|*.json",
                FileName = "pk_regions.geojson",
            };
            if (sfdGeo.ShowDialog(this) != DialogResult.OK) return;
            var geoPath = sfdGeo.FileName;

            try
            {
                int n = PkStore.ExportPkRegionsToGeoJson(geoPath, 0.5);
                MessageBox.Show(this,
                    $"GeoJSON exportado: {n} regiones\n\n{geoPath}",
                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, $"Error al exportar GeoJSON:\n{ex.Message}",
                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void BtnExportJson_Click(object? sender, EventArgs e)
        {
            // 1) Elegir ruta destino
            using var sfdJson = new SaveFileDialog
            {
                Title = "Exportar PK_ID a JSON",
                Filter = "JSON (*.json)|*.json",
                FileName = "pk_regions.json",
            };
            if (sfdJson.ShowDialog(this) != DialogResult.OK) return;
            var jsonPath = sfdJson.FileName;

            // 2) PK_ID desde el GRID (CSV cargado)
            var pkFromGrid = _binding
                .Select(c => (c?.CAPA ?? "").Trim())
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            // 3) Exportar REGIONES del DWG a un JSON temporal y leerlo
            var tmp = Path.Combine(Path.GetTempPath(), $"pk_regions_{Guid.NewGuid():N}.json");
            int nDwg = PkStore.ExportPkRegionsToJson(tmp, 0.5); // malla por defecto 0.5
            var dwgList = new List<PkStore.PkRegionDto>();
            if (File.Exists(tmp))
            {
                try
                {
                    var raw = File.ReadAllText(tmp);
                    dwgList = JsonConvert.DeserializeObject<List<PkStore.PkRegionDto>>(raw) ?? new List<PkStore.PkRegionDto>();
                }
                catch { /* tolerante */ }
                finally { try { File.Delete(tmp); } catch { } }
            }

            // 4) Unir: todos los PK del GRID, y de DWG (para no perder ninguno)
            var byPk = new Dictionary<string, PkStore.PkRegionDto>(StringComparer.OrdinalIgnoreCase);

            // 4a) primero lo que viene del DWG (con Loops)
            foreach (var r in dwgList)
            {
                var key = (r?.PkId ?? "").Trim();
                if (string.IsNullOrWhiteSpace(key)) continue;
                if (!byPk.ContainsKey(key))
                    byPk[key] = new PkStore.PkRegionDto { PkId = key, Loops = r.Loops ?? new() };
            }

            // 4b) ahora PK del GRID que quizá no tengan región todavía (Loops vacíos)
            foreach (var pk in pkFromGrid)
            {
                if (!byPk.ContainsKey(pk))
                    byPk[pk] = new PkStore.PkRegionDto { PkId = pk, Loops = new() };
            }

            // 5) Serializar final
            var finalList = byPk.Values.OrderBy(v => v.PkId, StringComparer.OrdinalIgnoreCase).ToList();
            File.WriteAllText(jsonPath, JsonConvert.SerializeObject(finalList, Newtonsoft.Json.Formatting.Indented));

            // 6) Reporte
            int total = finalList.Count;
            int conGeom = finalList.Count(x => x.Loops != null && x.Loops.Count > 0);
            MessageBox.Show(this,
                $"Exportados: {total} PK_ID\nCon geometría: {conGeom}\nSin geometría: {total - conGeom}\n\nArchivo:\n{jsonPath}",
                "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private void BtnImportJson_Click(object? sender, EventArgs e)
        {
            
            using var ofdJson = new OpenFileDialog
            {
                Title = "Importar PK_ID desde JSON",
                Filter = "JSON (*.json)|*.json",
            };
            if (ofdJson.ShowDialog(this) != DialogResult.OK) return;
            var importPath = ofdJson.FileName;

            try
            {
                PkStore.ResetIfDocumentChanged(); 
                int n = PkStore.ImportPkRegionsFromJson(importPath);
                MessageBox.Show(this, $"Importadas {n} regiones.", "SICOE");


                _pkConRegion = PkStore.LoadPkNamesFromRegions();
                RefrescarColumnaRegion();

                MessageBox.Show(this, $"Importadas {n} regiones PK desde:\n{importPath}", "SICOE");
            }
            catch (Autodesk.AutoCAD.Runtime.Exception ex)
            {
                MessageBox.Show(this, $"AutoCAD: {ex.ErrorStatus}", "Error al importar JSON",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, ex.Message, "Error al importar JSON",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void BtnNuevoPk_Click(object? sender, EventArgs e)
        {
            using var f = new FrmNuevoPkId();
            if (f.ShowDialog(this) != DialogResult.OK) return;
            if (f.Result == null) return;

            _binding.Add(f.Result);
            var idx = _binding.Count - 1;
            if (idx >= 0 && idx < dgvCapas.Rows.Count)
            {
                dgvCapas.ClearSelection();
                dgvCapas.Rows[idx].Selected = true;
                dgvCapas.FirstDisplayedScrollingRowIndex = idx;
            }
            GuardarCsvSiSePuede();        // ← persistencia
            ReloadPkRegionState();
            if (!GuardarCsv_Interactivo()) return;   // si cancela, deja la grilla igual

        }
        private void GuardarCsvSiSePuede()
        {
            if (string.IsNullOrWhiteSpace(UltimaRuta)) return;

            try
            {
                using var sw = new StreamWriter(UltimaRuta, false, System.Text.Encoding.UTF8);
                // Encabezados según tus columnas reales
                sw.WriteLine("CAPA,CIV,TRAMO,INFRAESTRUCTURA,COSTADO,UBICACION,ABS_INICIO,ABS_FINAL");
                foreach (var c in _binding)
                {
                    // Ajusta el orden/escape según tu definición de CapaInfo
                    sw.WriteLine(string.Join(",",
                        c.CAPA, c.CIV, c.TRAMO, c.INFRAESTRUCTURA, c.COSTADO, c.UBICACION,
                        c.ABS_INICIO, c.ABS_FINAL));
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "No fue posible guardar el CSV:\n" + ex.Message, "SICOE",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
        private bool GuardarCsv_Interactivo()
        {
            if (!string.IsNullOrWhiteSpace(UltimaRuta))
                return GuardarCsv(UltimaRuta);

            using var sfdCsv = new SaveFileDialog
            {
                Title = "Guardar PK_ID a CSV",
                Filter = "CSV (*.csv)|*.csv",
                FileName = "capas.csv",
            };
            if (sfdCsv.ShowDialog(this) != DialogResult.OK) return false;

            UltimaRuta = sfdCsv.FileName;
            lblRuta.Text = "Ruta: " + UltimaRuta;
            var ok = GuardarCsv(UltimaRuta);
            if (ok) CapasStore.SavePathToDwg(UltimaRuta); // vincula al DWG
            return ok;
        }

        private bool GuardarCsv(string path)
        {
            try
            {
                using var sw = new StreamWriter(path, false, System.Text.Encoding.UTF8);
                // encabezado
                sw.WriteLine("CAPA,CIV,TRAMO,INFRAESTRUCTURA,COSTADO,UBICACION,ABS_INICIO,ABS_FINAL,CALZADA");
                foreach (var c in _binding)
                {
                    // escapa comas si aparece alguna
                    string Esc(string s) => s.Contains(",") ? $"\"{s}\"" : s;
                    sw.WriteLine(string.Join(",",
                        Esc(c.CAPA), Esc(c.CIV), Esc(c.TRAMO), Esc(c.INFRAESTRUCTURA),
                        Esc(c.COSTADO), Esc(c.UBICACION), Esc(c.ABS_INICIO), Esc(c.ABS_FINAL),
                        Esc(c.CALZADA)));
                }
                return true;
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "No fue posible guardar el CSV:\n" + ex.Message, "SICOE",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return false;
            }
        }
        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            base.OnFormClosing(e);
            if (DialogResult == DialogResult.OK)
                GuardarCsv_Interactivo();
        }
    }
}
