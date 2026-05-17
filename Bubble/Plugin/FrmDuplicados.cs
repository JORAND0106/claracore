// FrmDuplicados.cs
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Linq;
using System.Windows.Forms;
using System.Windows.Forms.DataVisualization.Charting;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using acApp = Autodesk.AutoCAD.ApplicationServices.Application;

namespace SicoePresupuestoNET8
{
    public partial class FrmDuplicados : Form
    {

        public class DuplicadoRow
        {
            public bool Chk { get; set; }
            public int Punto { get; set; }
            public double Norte { get; set; }
            public double Este { get; set; }
            public double Cota { get; set; }
            public string Descripcion { get; set; } = "";
            public string Bloque { get; set; } = "";
            public string IdRef { get; set; } = "";  // ObjectId.ToString()
            public double DistPair { get; set; }     // distancia a la fila anterior (2D)
            public int Group { get; set; }           // id de grupo de proximidad
            public bool IsSeparator { get; set; }    // fila separadora visual
            public ObjectId Oid => ParseId(IdRef);

            private static ObjectId ParseId(string s)
            {
                try { return new ObjectId(new IntPtr(Convert.ToInt64(s))); }
                catch { return ObjectId.Null; }
            }


        }


        // Estado panel
        private bool _resCollapsed = false;
        private readonly Editor _ed;
        private readonly Database _db;
        private readonly BindingList<DuplicadoRow> _all;
        private BindingList<DuplicadoRow> _view;
        private readonly BindingSource _bs = new BindingSource();

        public event EventHandler<int>? Eliminados; // cantidad eliminada

        public FrmDuplicados(Database db, Editor ed,
            IEnumerable<(ObjectId id, int punto, string desc, string blk, Point3d pos)> raw,
            double initialToleranceMeters = 0.05)
        {
            InitializeComponent();
            InitResumenPanel(); // construye controles del panel resumen fuera del Designer
            _db = db;
            _ed = ed;
            _raw = raw.ToList();
            _currentTol = initialToleranceMeters;

            // Inicializa listas de datos
            var rows = BuildAndPair(_raw, _currentTol);
            _all = new BindingList<DuplicadoRow>(rows.ToList());
            _view = new BindingList<DuplicadoRow>(_all.ToList());
            _bs.DataSource = _view;

            dgvDuplicados.AutoGenerateColumns = false;
            dgvDuplicados.DataSource = _bs;

            dgvDuplicados.Columns["colNorte"].DefaultCellStyle.Format = "F3";
            dgvDuplicados.Columns["colEste"].DefaultCellStyle.Format = "F3";
            dgvDuplicados.Columns["colCota"].DefaultCellStyle.Format = "F3";
            dgvDuplicados.Columns["colDistPair"].DefaultCellStyle.Format = "F3";

            // Colorear grupos y ocultar separadores
            dgvDuplicados.RowPrePaint += DgvDuplicados_RowPrePaint;

            UpdateStatus();

            // Tolerancia: enlaza NumericUpDown del diseñador si existe
            var numTol = this.Controls.Find("numTolerance", true).FirstOrDefault() as NumericUpDown;
            if (numTol != null)
            {
                numTol.DecimalPlaces = 3;
                numTol.Minimum = 0;
                numTol.Maximum = 10;   // 10 m
                numTol.Increment = 0.005M;
                numTol.Value = (decimal)_currentTol;
                numTol.ValueChanged += (s, e) => ApplyTolerance((double)numTol.Value);
            }


            // Select-all en encabezado
            AddSelectAllCheckBox();
            // Inicializar resumen e histograma con los datos actuales
            RefreshSummaryAndChart();

        }

        private readonly List<(ObjectId id, int punto, string desc, string blk, Point3d pos)> _raw;
        private double _currentTol = 0.05; // m por defecto
        private readonly System.Drawing.Color[] _pal =
        {
        System.Drawing.Color.FromArgb(255,240,240),
        System.Drawing.Color.FromArgb(240,255,240),
        System.Drawing.Color.FromArgb(240,240,255),
        System.Drawing.Color.FromArgb(255,248,220),
        System.Drawing.Color.FromArgb(235,245,255)
        };

        private void UpdateStatus()
        {
            lblTotal.Text = $"Total: {_view.Count} items";
            var marcados = _view.Count(r => r.Chk);
            lblSeleccionados.Text = $"Marcados: {marcados} items";
        }

        private void txtFiltro_TextChanged(object? sender, EventArgs e)
        {
            var q = (txtFiltro.Text ?? "").Trim();
            if (string.IsNullOrEmpty(q))
            {
                _view = new BindingList<DuplicadoRow>(_all.ToList());
                _bs.DataSource = _view;
                RefreshSummaryAndChart();
                dgvDuplicados.DataSource = _bs;
                UpdateStatus();
                return;
            }

            var lower = q.ToLowerInvariant();
            var filtered = _all.Where(r =>
                   r.Punto.ToString().Contains(lower)
                || r.Descripcion.ToLowerInvariant().Contains(lower)
                || r.Bloque.ToLowerInvariant().Contains(lower))
                .ToList();

            _view = new BindingList<DuplicadoRow>(filtered);
            _bs.DataSource = _view;
            dgvDuplicados.DataSource = _bs;
            UpdateStatus();
        }

        private void dgvDuplicados_CurrentCellDirtyStateChanged(object? sender, EventArgs e)
        {
            if (dgvDuplicados.IsCurrentCellDirty)
            {
                dgvDuplicados.CommitEdit(DataGridViewDataErrorContexts.Commit);
                UpdateStatus();
            }
        }

        private void dgvDuplicados_CellDoubleClick(object? sender, DataGridViewCellEventArgs e)
        {
            if (e.RowIndex < 0 || e.RowIndex >= _view.Count) return;
            var r = _view[e.RowIndex];
            ZoomRows(new[] { r });
        }

        private void btnZoomSeleccion_Click(object? sender, EventArgs e)
        {
            var marked = _view.Where(x => x.Chk).ToList();
            if (marked.Count == 0 && dgvDuplicados.CurrentRow != null)
            {
                var r = dgvDuplicados.CurrentRow.DataBoundItem as DuplicadoRow;
                if (r != null) marked.Add(r);
            }
            if (marked.Count == 0) return;

            ZoomRows(marked);
        }

        private void ZoomRows(IEnumerable<DuplicadoRow> rows)
        {
            try
            {
                var ids = rows.Select(r => r.Oid).Where(id => !id.IsNull && id.IsValid).ToList();
                if (ids.Count == 0) return;

                using (var tr = _db.TransactionManager.StartTransaction())
                {
                    var ext = new Extents3d();
                    bool hasExt = false;

                    foreach (var id in ids)
                    {
                        var obj = tr.GetObject(id, OpenMode.ForRead, false);
                        if (obj is Entity ent)
                        {
                            try
                            {
                                var e = ent.GeometricExtents;
                                if (!hasExt)
                                {
                                    ext = e;
                                    hasExt = true;
                                }
                                else
                                {
                                    ext.AddExtents(e);
                                }
                            }
                            catch { /* entidades sin extents */ }
                        }
                    }

                    tr.Commit();

                    if (hasExt)
                    {
                        // 1) Zoom a la ventana de los ids
                        TopoHelpers.ZoomToExtents(_ed, ext);

                        // 2) Resaltar/seleccionar los mismos ids
                        TopoHelpers.SelectOnly(_ed, ids);
                    }

                }
            }
            catch (System.Exception ex)
            {
                _ed.WriteMessage($"\n[FrmDuplicados] Error en zoom: {ex.Message}");
            }
        }

        private void btnEliminarSeleccionados_Click(object? sender, EventArgs e)
        {
            // Solo borra lo que el usuario marcó en la grilla
            var toDelete = _view
                .Where(v => v.Chk && !v.IsSeparator && v.Oid.IsValid && !v.Oid.IsNull)
                .Select(v => v.Oid)
                .Distinct()
                .ToList();
            if (toDelete.Count == 0) return;

            var doc = acApp.DocumentManager.MdiActiveDocument;
            try
            {
                using (doc.LockDocument())
                using (var tr = _db.TransactionManager.StartTransaction())
                {
                    int ok = 0;
                    foreach (var id in toDelete)
                    {
                        try
                        {
                            var obj = tr.GetObject(id, OpenMode.ForWrite, false, true);
                            obj.Erase(true);
                            ok++;
                        }
                        catch { /* continuar */ }
                    }
                    tr.Commit();

                    // Actualizar grilla
                    var remainingAll = _all.Where(r => !toDelete.Contains(r.Oid)).ToList();
                    var remainingView = _view.Where(r => !toDelete.Contains(r.Oid)).ToList();

                    _all.Clear();
                    foreach (var r in remainingAll) _all.Add(r);

                    _view = new BindingList<DuplicadoRow>(remainingView);
                    _bs.DataSource = _view;
                    dgvDuplicados.DataSource = _bs;

                    UpdateStatus();

                    Eliminados?.Invoke(this, ok);
                }
            }
            catch (System.Exception ex)
            {
                _ed.WriteMessage($"\n[FrmDuplicados] Error al eliminar: {ex.Message}");
            }
            RefreshSummaryAndChart();

        }
        // --- Reinicia el flujo de selección y recarga la grilla ---
        private void btnReiniciar_Click(object? sender, EventArgs e)
        {
            try
            {
                var doc = Autodesk.AutoCAD.ApplicationServices.Application.DocumentManager.MdiActiveDocument;
                var ed = doc.Editor;
                var db = doc.Database;

                // Confirmar reinicio
                if (MessageBox.Show(this,
                    "¿Desea reiniciar el proceso de depuración y seleccionar nuevos nodos?",
                    "Reiniciar depuración",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question) != DialogResult.Yes)
                    return;

                // Limpia la grilla y las listas
                _all.Clear();
                _view.Clear();
                dgvDuplicados.DataSource = null;
                _bs.Clear();

                UpdateStatus();
                txtFiltro.Clear();

                // Nueva selección de nodos
                var pso = new PromptSelectionOptions
                {
                    MessageForAdding = "\nSeleccione nuevos bloques con NODO/DESC (Ventana/Cruz/Click). Enter para finalizar:",
                    MessageForRemoval = "\nQuite de la selección:"
                };

                var res = ed.GetSelection(pso, TopoHelpers.BlockRefFilter());
                if (res.Status != PromptStatus.OK)
                {
                    ed.WriteMessage("\nOperación cancelada.");
                    return;
                }

                // Extraer nueva lista
                var raw = TopoHelpers.ExtractNodoItems(db, ed, res.Value).ToList();
                if (raw.Count == 0)
                {
                    MessageBox.Show(this, "No se encontraron referencias válidas con NODO y DESC.", "SICOE");
                    return;
                }

                var rows = FrmDuplicados.BuildAndPair(raw, _currentTol);

                // Recargar en memoria y en grilla
                foreach (var r in rows) _all.Add(r);
                _view = new BindingList<DuplicadoRow>(_all.ToList());
                _bs.DataSource = _view;
                dgvDuplicados.DataSource = _bs;

                UpdateStatus();
                ed.WriteMessage($"\nSe cargaron {rows.Count} nodos nuevos para depuración.");
            }
            catch (System.Exception ex)
            {
                Autodesk.AutoCAD.ApplicationServices.Application.DocumentManager.MdiActiveDocument.Editor
                    .WriteMessage($"\n[btnReiniciar] Error: {ex.Message}");
            }
        }

        /// <summary>
        /// Fábrica de filas desde datos brutos y cálculo DistPair por proximidad.
        /// </summary>
        public static List<DuplicadoRow> BuildAndPair(
            IEnumerable<(ObjectId id, int punto, string desc, string blk, Point3d pos)> items,
            double tol)
        {
            var baseList = items.Select(i => new DuplicadoRow
            {
                Punto = i.punto,
                Descripcion = i.desc ?? "",
                Bloque = i.blk ?? "",
                IdRef = i.id.OldIdPtr.ToInt64().ToString(),
                Norte = i.pos.Y,
                Este = i.pos.X,
                Cota = i.pos.Z,
                DistPair = 0.0,
                Group = -1,
                IsSeparator = false
            }).ToList();

            int n = baseList.Count;
            if (n == 0) return baseList;

            // 1) Agrupar por radio (2D) usando tolerancia
            var visit = new bool[n];
            var grupos = new List<List<int>>();
            for (int i = 0; i < n; i++)
            {
                if (visit[i]) continue;
                var gi = new List<int> { i };
                visit[i] = true;
                var pi = new Point2d(baseList[i].Este, baseList[i].Norte);

                for (int j = 0; j < n; j++)
                {
                    if (visit[j] || j == i) continue;
                    var pj = new Point2d(baseList[j].Este, baseList[j].Norte);
                    if (pi.GetDistanceTo(pj) <= tol) { gi.Add(j); visit[j] = true; }
                }
                grupos.Add(gi);
            }

            // 2) Ordenar grupos por bloque, desc y centroide
            Point2d Centroide(List<int> g)
            {
                double sx = 0, sy = 0;
                foreach (var k in g) { sx += baseList[k].Este; sy += baseList[k].Norte; }
                var m = Math.Max(g.Count, 1);
                return new Point2d(sx / m, sy / m);
            }

            grupos = grupos
                .OrderBy(g => baseList[g[0]].Bloque)
                .ThenBy(g => baseList[g[0]].Descripcion)
                .ThenBy(g => Centroide(g).Y)
                .ThenBy(g => Centroide(g).X)
                .ToList();

            // 3) Aplanar, asignar Group y DistPair secuencial; insertar separadores si salto > tol
            var ordered = new List<DuplicadoRow>(n + grupos.Count);
            for (int gi = 0; gi < grupos.Count; gi++)
            {
                var g = grupos[gi];
                g.Sort((a, b) =>
                {
                    int ny = baseList[a].Norte.CompareTo(baseList[b].Norte);
                    if (ny != 0) return ny;
                    return baseList[a].Este.CompareTo(baseList[b].Este);
                });

                foreach (var idx in g)
                {
                    var r = baseList[idx];
                    r.Group = gi;
                    ordered.Add(r);
                }

                if (gi < grupos.Count - 1)
                {
                    var last = baseList[g.Last()];
                    var nextFirst = baseList[grupos[gi + 1].First()];
                    var d = new Point2d(last.Este, last.Norte).GetDistanceTo(
                            new Point2d(nextFirst.Este, nextFirst.Norte));
                    if (d > tol) // separador si el salto supera la tolerancia
                    {
                        ordered.Add(new DuplicadoRow { IsSeparator = true, Group = gi });
                    }
                }
            }

            for (int i = 0; i < ordered.Count; i++)
            {
                if (ordered[i].IsSeparator) continue;

                // buscar fila previa no separadora
                int prev = i - 1;
                while (prev >= 0 && ordered[prev].IsSeparator) prev--;
                if (prev < 0) { ordered[i].DistPair = 0; continue; }

                var pPrev = new Point2d(ordered[prev].Este, ordered[prev].Norte);
                var pNow = new Point2d(ordered[i].Este, ordered[i].Norte);
                ordered[i].DistPair = pPrev.GetDistanceTo(pNow);
            }

            return ordered;
        }

        // === Agrega CheckBox al encabezado de la columna Chk ===
        private void AddSelectAllCheckBox()
        {
            try
            {
                // Ubicación relativa al encabezado
                var rect = dgvDuplicados.GetCellDisplayRectangle(0, -1, true);
                rect.X += 4;
                rect.Y += 2;

                CheckBox chkHeader = new CheckBox();
                chkHeader.Name = "chkHeader";
                chkHeader.Size = new System.Drawing.Size(18, 18);
                chkHeader.Location = rect.Location;
                chkHeader.Checked = false;
                chkHeader.BackColor = System.Drawing.Color.Transparent;

                // Evento para seleccionar/deseleccionar todo
                chkHeader.CheckedChanged += (s, e) =>
                {
                    bool state = chkHeader.Checked;
                    foreach (var row in _view)
                    {
                        if (!double.IsNaN(row.DistPair)) // ignorar separadores vacíos
                            row.Chk = state;
                    }

                    dgvDuplicados.Refresh();
                    UpdateStatus();
                };

                dgvDuplicados.Controls.Add(chkHeader);

                // Actualizar posición del checkbox si se redimensiona la columna
                dgvDuplicados.ColumnWidthChanged += (s, e) =>
                {
                    if (e.Column.Index == 0)
                    {
                        var rect2 = dgvDuplicados.GetCellDisplayRectangle(0, -1, true);
                        rect2.X += 4; rect2.Y += 2;
                        chkHeader.Location = rect2.Location;
                    }
                };
            }
            catch (System.Exception ex)
            {
                _ed.WriteMessage($"\n[AddSelectAllCheckBox] Error: {ex.Message}");
            }
        }
        private void DgvDuplicados_RowPrePaint(object? sender, DataGridViewRowPrePaintEventArgs e)
        {
            if (e.RowIndex < 0) return;
            var row = dgvDuplicados.Rows[e.RowIndex];
            if (row.DataBoundItem is not DuplicadoRow dr) return;

            if (dr.IsSeparator)
            {
                row.DefaultCellStyle.BackColor = System.Drawing.Color.White;
                row.DefaultCellStyle.SelectionBackColor = System.Drawing.Color.White;
                row.DefaultCellStyle.ForeColor = System.Drawing.Color.White;
                row.ReadOnly = true;
                return;
            }

            // Color por grupo alternando paleta
            var color = _pal[dr.Group % _pal.Length];
            row.DefaultCellStyle.BackColor = color;

            // Auto-selección por tolerancia (no seleccionar cabecera de grupo)
            if (dr.DistPair <= _currentTol && dr.DistPair > 0 && !dr.IsSeparator)
                dr.Chk = true;
        }

        private void ApplyTolerance(double tol)
        {
            _currentTol = Math.Max(0, tol);

            // Recalcular agrupación y distancias con la nueva tolerancia
            var rows = BuildAndPair(_raw, _currentTol);

            _all.Clear();
            foreach (var r in rows) _all.Add(r);

            _view = new BindingList<DuplicadoRow>(_all.ToList());
            _bs.DataSource = _view;
            dgvDuplicados.DataSource = _bs;
            dgvDuplicados.Refresh();
            UpdateStatus();
            RefreshSummaryAndChart();

        }
        private void RefreshSummaryAndChart()
        {
            // Fuente: solo filas de datos (sin separadores)
            var data = _view.Where(v => !v.IsSeparator && !double.IsNaN(v.DistPair)).ToList();
            int total = data.Count;

            // Duplicados según tolerancia actual: filas con DistPair > 0 y <= tol
            int dupsTol = data.Count(v => v.DistPair > 0 && v.DistPair <= _currentTol);

            // Grupos: tomar valores distintos de Group en filas de datos
            int grupos = data.Select(v => v.Group).Distinct().Count();

            // Distancias válidas > 0
            var dist = data.Select(v => v.DistPair).Where(d => d > 0).ToList();

            double dmin = dist.Count > 0 ? dist.Min() : 0.0;
            double dmax = dist.Count > 0 ? dist.Max() : 0.0;
            double davg = dist.Count > 0 ? dist.Average() : 0.0;

            // Actualizar labels
            lblResTot.Text = $"Total nodos: {total}";
            lblResDup.Text = $"Duplicados (tol): {dupsTol}";
            lblResGrps.Text = $"Grupos: {grupos}";
            lblResMin.Text = $"Dist. min: {dmin:F3}";
            lblResAvg.Text = $"Dist. media: {davg:F3}";
            lblResMax.Text = $"Dist. máx: {dmax:F3}";

            // Histograma simple en bins
            chartDist.Series["Hist"].Points.Clear();
            if (dist.Count == 0) return;

            // Número de bins: regla sqrt(n) con límites
            int bins = Math.Max(5, Math.Min(25, (int)Math.Ceiling(Math.Sqrt(dist.Count))));

            double min = dmin, max = dmax;
            if (max <= min) { max = min + 1e-6; }

            double binW = (max - min) / bins;
            var counts = new int[bins];

            foreach (var d in dist)
            {
                int b = (int)Math.Floor((d - min) / binW);
                if (b < 0) b = 0;
                if (b >= bins) b = bins - 1;
                counts[b]++;
            }

            for (int i = 0; i < bins; i++)
            {
                double a = min + i * binW;
                double b = a + binW;
                string label = $"{a:F3}-{b:F3}";
                chartDist.Series["Hist"].Points.AddXY(label, counts[i]);
            }
        }
        private void btnToggleResumen_Click(object? sender, EventArgs e)
        {
            // Colapsar/expandir el panel lateral
            _resCollapsed = !_resCollapsed;
            if (_resCollapsed)
            {
                pnlResumen.Width = 16; // deja solo el borde
                btnToggleResumen.Text = "⟩";
                btnToggleResumen.Left = 0;
            }
            else
            {
                pnlResumen.Width = 260;
                btnToggleResumen.Text = "⟨⟩";
                btnToggleResumen.Left = pnlResumen.Width - btnToggleResumen.Width - 6;
            }
        }
        private void InitResumenPanel()
        {
            // Botón colapsar/expandir
            this.btnToggleResumen = new System.Windows.Forms.Button();
            this.btnToggleResumen.Name = "btnToggleResumen";
            this.btnToggleResumen.Text = "⟨⟩";
            this.btnToggleResumen.Width = 32;
            this.btnToggleResumen.Height = 28;
            this.btnToggleResumen.Anchor = (AnchorStyles.Top | AnchorStyles.Right);
            this.btnToggleResumen.Location = new System.Drawing.Point(this.pnlResumen.Width - this.btnToggleResumen.Width - 6, 6);
            this.btnToggleResumen.Click += btnToggleResumen_Click;
            this.pnlResumen.Controls.Add(this.btnToggleResumen);

            // Título
            this.lblResTitulo = new System.Windows.Forms.Label();
            this.lblResTitulo.Name = "lblResTitulo";
            this.lblResTitulo.Text = "Resumen";
            this.lblResTitulo.Font = new System.Drawing.Font("Segoe UI", 10F, System.Drawing.FontStyle.Bold);
            this.lblResTitulo.AutoSize = true;
            this.lblResTitulo.Location = new System.Drawing.Point(10, 10);
            this.pnlResumen.Controls.Add(this.lblResTitulo);

            int y = 44;

            this.lblResTot = new System.Windows.Forms.Label { Name = "lblResTot", Text = "Total nodos: 0", AutoSize = true, Location = new System.Drawing.Point(10, y) }; y += 22;
            this.lblResDup = new System.Windows.Forms.Label { Name = "lblResDup", Text = "Duplicados (tol): 0", AutoSize = true, Location = new System.Drawing.Point(10, y) }; y += 22;
            this.lblResGrps = new System.Windows.Forms.Label { Name = "lblResGrps", Text = "Grupos: 0", AutoSize = true, Location = new System.Drawing.Point(10, y) }; y += 22;
            this.lblResMin = new System.Windows.Forms.Label { Name = "lblResMin", Text = "Dist. min: 0.000", AutoSize = true, Location = new System.Drawing.Point(10, y) }; y += 22;
            this.lblResAvg = new System.Windows.Forms.Label { Name = "lblResAvg", Text = "Dist. media: 0.000", AutoSize = true, Location = new System.Drawing.Point(10, y) }; y += 22;
            this.lblResMax = new System.Windows.Forms.Label { Name = "lblResMax", Text = "Dist. máx: 0.000", AutoSize = true, Location = new System.Drawing.Point(10, y) }; y += 28;

            this.pnlResumen.Controls.Add(this.lblResTot);
            this.pnlResumen.Controls.Add(this.lblResDup);
            this.pnlResumen.Controls.Add(this.lblResGrps);
            this.pnlResumen.Controls.Add(this.lblResMin);
            this.pnlResumen.Controls.Add(this.lblResAvg);
            this.pnlResumen.Controls.Add(this.lblResMax);

            // Chart
            this.chartDist = new System.Windows.Forms.DataVisualization.Charting.Chart();
            this.chartDist.Name = "chartDist";
            this.chartDist.Width = this.pnlResumen.Width - 20;
            this.chartDist.Height = 220;
            this.chartDist.Left = 10;
            this.chartDist.Top = y;

            this.chartDist.ChartAreas.Add("ca");
            var chArea = this.chartDist.ChartAreas["ca"];
            chArea.AxisX.Title = "Distancia (m)";
            chArea.AxisY.Title = "Frecuencia";

            this.chartDist.Series.Add("Hist");
            var series = this.chartDist.Series["Hist"];
            series.ChartType = System.Windows.Forms.DataVisualization.Charting.SeriesChartType.Column;
            series.IsXValueIndexed = true;

            this.pnlResumen.Controls.Add(this.chartDist);
        }

    }
}
