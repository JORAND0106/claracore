using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows.Forms;

using acApp = Autodesk.AutoCAD.ApplicationServices;
using acEd = Autodesk.AutoCAD.EditorInput;
using acDb = Autodesk.AutoCAD.DatabaseServices;
using acGeo = Autodesk.AutoCAD.Geometry;

namespace SicoePresupuestoNET8
{
    public partial class FrmPkRegionPicker : Form
    {
        // ── Estado modo individual ────────────────────────────────────────────
        private acDb.ObjectId _selectedEnt = acDb.ObjectId.Null;
        public string? LastPkName { get; private set; }
        private bool _picking = false;
        private readonly bool _allowManual;

        // ── Listas de PK ─────────────────────────────────────────────────────
        private readonly HashSet<string> _validPksAll = new(StringComparer.OrdinalIgnoreCase);
        private readonly HashSet<string> _validPks = new(StringComparer.OrdinalIgnoreCase);
        private HashSet<string> _pksConRegion = new(StringComparer.OrdinalIgnoreCase);
        private AutoCompleteStringCollection _acSrc = new();

        // ── Estado modo masivo ────────────────────────────────────────────────
        // Fila de la grilla: handle del polígono original + nombre temporal + PK asignado
        private sealed class FilaMasiva
        {
            public acDb.ObjectId EntId { get; set; }
            public string TmpName { get; set; } = "";
            public string PkId { get; set; } = "";
            // handle del DBText temporal insertado (para borrarlo al confirmar/cancelar)
            public acDb.ObjectId TxtId { get; set; } = acDb.ObjectId.Null;
        }
        private readonly List<FilaMasiva> _filasMasivas = new();

        // ── Constructor ───────────────────────────────────────────────────────
        public FrmPkRegionPicker(List<string> sugerencias, bool allowManual = false)
        {
            InitializeComponent();

            // Cargar sets de PK
            foreach (var s in sugerencias ?? new List<string>())
            {
                var v = (s ?? "").Trim();
                if (v.Length == 0) continue;
                _validPksAll.Add(v);
                _validPks.Add(v);
            }
            _allowManual = allowManual;

            // PK que ya tienen región
            _pksConRegion = PkStore.LoadPkNamesFromRegions()
                            ?? new(StringComparer.OrdinalIgnoreCase);

            // Autocompletar campo individual
            RefreshAutoComplete();
            txtNombreInd.AutoCompleteMode = AutoCompleteMode.SuggestAppend;
            txtNombreInd.AutoCompleteSource = AutoCompleteSource.CustomSource;
            txtNombreInd.AutoCompleteCustomSource = _acSrc;

            // Autocompletar campo masivo (columna PK en grilla se controla por código)
            RefreshAutoCompleteMasivo();

            // Modo manual: siempre editable, sin exigir polígono
            if (_allowManual)
            {
                txtNombreInd.ReadOnly = false;
                txtNombreInd.Enabled = true;
                btnGuardarInd.Enabled = false;
                txtNombreInd.TextChanged += (s, e) =>
                {
                    var t = (txtNombreInd.Text ?? "").Trim();
                    btnGuardarInd.Enabled = _validPksAll.Contains(t);
                };
            }

            // Eventos modo individual
            btnSeleccionarInd.Click += BtnSeleccionarInd_Click;
            btnGuardarInd.Click += BtnGuardarInd_Click;

            // Eventos modo masivo
            btnSeleccionarMasivo.Click += BtnSeleccionarMasivo_Click;
            btnConfirmarMasivo.Click += BtnConfirmarMasivo_Click;
            btnCancelarMasivo.Click += BtnCancelarMasivo_Click;

            // Validación campo individual
            txtNombreInd.KeyPress += TxtNombreInd_KeyPressSoloNumeros;
            txtNombreInd.Validating += TxtNombreInd_Validating;
            txtNombreInd.TextChanged += TxtNombreInd_TextChanged;

            // Configurar grilla masiva
            ConfigurarGridMasivo();

            // Tab inicial: individual
            tabControl.SelectedIndex = 0;
        }

        // ══════════════════════════════════════════════════════════════════════
        //  MODO INDIVIDUAL
        // ══════════════════════════════════════════════════════════════════════

        private void BtnSeleccionarInd_Click(object sender, EventArgs e)
        {
            if (_picking) return;
            _picking = true;
            try
            {
                var doc = acApp.Application.DocumentManager.MdiActiveDocument;
                if (doc?.Editor == null) return;

                txtNombreInd.Enabled = false;
                btnGuardarInd.Enabled = false;

                bool vis = Visible; Hide();
                acApp.Application.MainWindow.Focus();

                var peo = new acEd.PromptEntityOptions("\nSeleccione un polígono cerrado...")
                { AllowNone = false };
                peo.SetRejectMessage("\nSolo polilínea cerrada, círculo, elipse o spline cerrada.");
                peo.AddAllowedClass(typeof(acDb.Polyline), true);
                peo.AddAllowedClass(typeof(acDb.Circle), true);
                peo.AddAllowedClass(typeof(acDb.Ellipse), true);
                peo.AddAllowedClass(typeof(acDb.Spline), true);

                var res = doc.Editor.GetEntity(peo);

                if (vis && !IsDisposed) { Show(); Activate(); }

                if (res.Status != acEd.PromptStatus.OK)
                { _selectedEnt = acDb.ObjectId.Null; return; }

                _selectedEnt = res.ObjectId;
                txtNombreInd.Enabled = true;
                btnGuardarInd.Enabled = true;
                txtNombreInd.Focus();
            }
            catch (Autodesk.AutoCAD.Runtime.Exception ex)
                when (ex.ErrorStatus == Autodesk.AutoCAD.Runtime.ErrorStatus.InvalidInput)
            {
                _selectedEnt = acDb.ObjectId.Null;
                if (!IsDisposed) { Show(); Activate(); }
            }
            finally { _picking = false; }
        }

        private void BtnGuardarInd_Click(object sender, EventArgs e)
        {
            var pk = (txtNombreInd.Text ?? "").Trim();
            if (pk.Length == 0) { MessageBox.Show(this, "Ingrese un PK_ID.", "SICOE"); return; }

            if (_allowManual)
            {
                if (!_validPksAll.Contains(pk))
                {
                    MessageBox.Show(this, "PK_ID no existe en el proyecto.", "SICOE",
                                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    txtNombreInd.SelectAll(); return;
                }
                LastPkName = pk;
                DialogResult = DialogResult.OK;
                Close(); return;
            }

            if (PkStore.HasPkRegion(pk))
            {
                var dr = MessageBox.Show(this,
                    $"El PK_ID \"{pk}\" ya tiene coordenadas.\n\n¿Desea reemplazarlas?",
                    "SICOE", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
                if (dr != DialogResult.Yes)
                { txtNombreInd.Focus(); txtNombreInd.SelectAll(); return; }
            }

            if (!_selectedEnt.IsValid)
            { MessageBox.Show(this, "Primero seleccione un polígono.", "SICOE"); return; }

            try
            {
                var doc = acApp.Application.DocumentManager.MdiActiveDocument;
                if (doc == null) { MessageBox.Show(this, "No hay dibujo activo.", "SICOE"); return; }

                using (doc.LockDocument())
                {
                    // Aplanar curvas antes de crear la región
                    double paso = 0.5;
                    if (double.TryParse(txtPasoMuestreo.Text,
                        System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var p) && p > 0)
                        paso = p;

                    var entAplanada = AplanarAPolilinea(_selectedEnt, paso, doc);
                    var idParaRegion = entAplanada ?? _selectedEnt;
                    var regId = PkStore.CreateRegionFromEntity(idParaRegion, pk, out var err);
                    if (entAplanada.HasValue) BorrarEntidadTemporal(doc, entAplanada.Value);
                    if (regId.IsNull)
                    {
                        MessageBox.Show(this,
                            string.IsNullOrEmpty(err) ? "No se pudo crear la región." : err, "SICOE");
                        return;
                    }
                }
                LastPkName = pk;
                MessageBox.Show(this, $"Región creada: {pk}", "SICOE");
                DialogResult = DialogResult.OK;
                Close();
            }
            catch (Autodesk.AutoCAD.Runtime.Exception ex)
            { MessageBox.Show(this, $"Error AutoCAD: {ex.ErrorStatus}", "SICOE"); }
            catch (Exception ex)
            { MessageBox.Show(this, $"Error: {ex.Message}", "SICOE"); }
        }

        private void TxtNombreInd_KeyPressSoloNumeros(object? sender, KeyPressEventArgs e)
        {
            if (char.IsControl(e.KeyChar)) return;
            if (char.IsDigit(e.KeyChar)) return;
            e.Handled = true;
        }

        private void TxtNombreInd_TextChanged(object? sender, EventArgs e)
        {
            var t = (txtNombreInd.Text ?? "").Trim();
            var ok = _validPks.Contains(t);
            if (_allowManual)
                btnGuardarInd.Enabled = _validPksAll.Contains(t);
            else
                btnGuardarInd.Enabled = _selectedEnt.IsValid && ok;
        }

        private void TxtNombreInd_Validating(object? sender,
                                              System.ComponentModel.CancelEventArgs e)
        {
            if (_allowManual) return;
            var t = (txtNombreInd.Text ?? "").Trim();
            if (t.Length == 0) return;

            if (!_validPksAll.Contains(t))
            {
                e.Cancel = true;
                MessageBox.Show(this, "PK_ID no existe. Seleccione uno de la lista.", "SICOE",
                                MessageBoxButtons.OK, MessageBoxIcon.Warning);
                txtNombreInd.SelectAll(); return;
            }

            if (_pksConRegion.Contains(t))
            {
                var dr = MessageBox.Show(this,
                    $"El PK_ID \"{t}\" ya tiene coordenadas.\n¿Desea reemplazarlas?",
                    "SICOE", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
                if (dr != DialogResult.Yes)
                { e.Cancel = true; txtNombreInd.SelectAll(); }
            }
        }

        // ══════════════════════════════════════════════════════════════════════
        //  MODO MASIVO
        // ══════════════════════════════════════════════════════════════════════

        private void ConfigurarGridMasivo()
        {
            dgvMasivo.Columns.Clear();
            dgvMasivo.AutoGenerateColumns = false;

            // Col 0 — N° temporal (solo lectura)
            var colTmp = new DataGridViewTextBoxColumn
            {
                Name = "colTmp",
                HeaderText = "N° Temp",
                DataPropertyName = "TmpName",
                ReadOnly = true,
                Width = 80
            };

            // Col 1 — PK_ID asignado (editable con autocompletar)
            var colPk = new DataGridViewTextBoxColumn
            {
                Name = "colPk",
                HeaderText = "PK_ID del proyecto",
                DataPropertyName = "PkId",
                ReadOnly = false,
                Width = 220
            };

            dgvMasivo.Columns.Add(colTmp);
            dgvMasivo.Columns.Add(colPk);
            dgvMasivo.SelectionMode = DataGridViewSelectionMode.FullRowSelect;

            // Autocompletar al editar celda PK
            dgvMasivo.EditingControlShowing += DgvMasivo_EditingControlShowing;
            dgvMasivo.CellValidating += DgvMasivo_CellValidating;
            dgvMasivo.CellDoubleClick += DgvMasivo_CellDoubleClick;
            dgvMasivo.CellEndEdit += DgvMasivo_CellEndEdit;
        }

        private void DgvMasivo_CellDoubleClick(object? sender,
                                                DataGridViewCellEventArgs e)
        {
            if (e.RowIndex < 0 || e.RowIndex >= _filasMasivas.Count) return;
            var fila = _filasMasivas[e.RowIndex];
            if (fila.TxtId.IsNull || !fila.TxtId.IsValid) return;

            try
            {
                var doc = acApp.Application.DocumentManager.MdiActiveDocument;
                if (doc == null) return;

                using var tr = doc.Database.TransactionManager.StartTransaction();
                var txt = tr.GetObject(fila.TxtId, acDb.OpenMode.ForRead)
                          as acDb.DBText;
                if (txt == null) { tr.Abort(); return; }

                // Calcular ventana de zoom con margen
                double margin = txt.Height * 10;
                var min = new acGeo.Point3d(txt.Position.X - margin,
                                            txt.Position.Y - margin, 0);
                var max = new acGeo.Point3d(txt.Position.X + margin,
                                            txt.Position.Y + margin, 0);
                tr.Commit();

                // Zoom a la entidad
                // Zoom via comando ZOOM con ventana
                doc.Editor.Command("_.ZOOM", "_W",
                    $"{min.X},{min.Y}", $"{max.X},{max.Y}");
                acApp.Application.MainWindow.Focus();
                // Devolver el foco al form sin bloquearlo
                if (!IsDisposed) { this.BringToFront(); }
            }
            catch { /* silencioso */ }
        }

        private void DgvMasivo_EditingControlShowing(object? sender,
                                                      DataGridViewEditingControlShowingEventArgs e)
        {
            if (dgvMasivo.CurrentCell?.ColumnIndex != 1) return;
            if (e.Control is not TextBox tb) return;

            tb.AutoCompleteMode = AutoCompleteMode.SuggestAppend;
            tb.AutoCompleteSource = AutoCompleteSource.CustomSource;
            tb.AutoCompleteCustomSource = _acSrcMasivo;
        }

        private void DgvMasivo_CellValidating(object? sender,
                                                       DataGridViewCellValidatingEventArgs e)
        {
            if (e.ColumnIndex != 1) return;
            var v = (e.FormattedValue?.ToString() ?? "").Trim();
            if (v.Length == 0) return;

            if (!_validPksAll.Contains(v))
            {
                e.Cancel = true;
                MessageBox.Show(this, $"\"{v}\" no existe en la lista de PK_ID.", "SICOE",
                                MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            // Verificar que no esté ya asignado en otra fila de la grilla
            for (int i = 0; i < dgvMasivo.Rows.Count; i++)
            {
                if (i == e.RowIndex) continue;
                var existing = (dgvMasivo.Rows[i].Cells[1].Value?.ToString() ?? "").Trim();
                if (string.Equals(existing, v, StringComparison.OrdinalIgnoreCase))
                {
                    e.Cancel = true;
                    MessageBox.Show(this,
                        $"\"{v}\" ya fue asignado a {dgvMasivo.Rows[i].Cells[0].Value}.",
                        "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
            }
        }

        private void DgvMasivo_CellEndEdit(object? sender, DataGridViewCellEventArgs e)
        {
            if (e.ColumnIndex != 1) return;
            // Reconstruir autocompletar excluyendo los ya usados en la grilla
            RefreshAutoCompleteMasivoDisponibles();
        }
        private AutoCompleteStringCollection _acSrcMasivo = new();

        private void RefreshAutoCompleteMasivo()
        {
            _acSrcMasivo = new AutoCompleteStringCollection();
            foreach (var pk in _validPksAll)
                _acSrcMasivo.Add(pk);
        }

        private void RefreshAutoCompleteMasivoDisponibles()
        {
            // PK ya usados en la grilla
            var usados = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (DataGridViewRow row in dgvMasivo.Rows)
            {
                var v = (row.Cells[1].Value?.ToString() ?? "").Trim();
                if (v.Length > 0) usados.Add(v);
            }

            // PK ya usados en el DWG (ya tienen región)
            var conRegion = PkStore.LoadPkNamesFromRegions()
                            ?? new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            _acSrcMasivo = new AutoCompleteStringCollection();
            foreach (var pk in _validPksAll)
                if (!usados.Contains(pk) && !conRegion.Contains(pk))
                    _acSrcMasivo.Add(pk);
        }

        // ── Fase 1: selección masiva de polígonos ─────────────────────────────
        private void BtnSeleccionarMasivo_Click(object sender, EventArgs e)
        {
            if (_picking) return;
            _picking = true;

            // Si ya había temporales previas, limpiarlas primero
            LimpiarTemporales();

            try
            {
                var doc = acApp.Application.DocumentManager.MdiActiveDocument;
                if (doc?.Editor == null) return;

                Hide();
                acApp.Application.MainWindow.Focus();

                var pso = new acEd.PromptSelectionOptions
                {
                    MessageForAdding = "\nSeleccione todos los polígonos (ventana o clic individual):"
                };
                // Filtro: solo Polyline, Circle, Ellipse, Spline
                var filter = new acEd.SelectionFilter(new[]
                {
                    new acDb.TypedValue((int)acDb.DxfCode.Start,
                        "LWPOLYLINE,CIRCLE,ELLIPSE,SPLINE")
                });

                var res = doc.Editor.GetSelection(pso, filter);

                if (!IsDisposed) { Show(); Activate(); }

                if (res.Status != acEd.PromptStatus.OK || res.Value.Count == 0)
                {
                    MessageBox.Show(this, "No se seleccionaron polígonos.", "SICOE",
                                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                // Crear nombres temporales y textos en el DWG
                using (doc.LockDocument())
                using (var tr = doc.Database.TransactionManager.StartTransaction())
                {
                    var bt = (acDb.BlockTable)tr.GetObject(
                                  doc.Database.BlockTableId, acDb.OpenMode.ForRead);
                    var btr = (acDb.BlockTableRecord)tr.GetObject(
                                  bt[acDb.BlockTableRecord.ModelSpace], acDb.OpenMode.ForWrite);

                    int idx = 1;
                    foreach (acEd.SelectedObject so in res.Value)
                    {
                        var ent = tr.GetObject(so.ObjectId, acDb.OpenMode.ForRead)
                                  as acDb.Entity;
                        if (ent == null) continue;

                        var tmpName = $"_TMP_{idx:D3}";

                        // Calcular centroide del bbox para insertar el texto
                        var ext = ent.GeometricExtents;
                        var centro = new acGeo.Point3d(
                            0.5 * (ext.MinPoint.X + ext.MaxPoint.X),
                            0.5 * (ext.MinPoint.Y + ext.MaxPoint.Y),
                            0.0);

                        // Insertar texto temporal
                        var txt = new acDb.DBText
                        {
                            Position = centro,
                            TextString = tmpName,
                            Height = 1.5,
                            Color = Autodesk.AutoCAD.Colors.Color.FromColorIndex(
                                                Autodesk.AutoCAD.Colors.ColorMethod.ByAci, 1), // rojo
                            Layer = "0"
                        };
                        btr.AppendEntity(txt);
                        tr.AddNewlyCreatedDBObject(txt, true);

                        _filasMasivas.Add(new FilaMasiva
                        {
                            EntId = so.ObjectId,
                            TmpName = tmpName,
                            PkId = "",
                            TxtId = txt.ObjectId
                        });
                        idx++;
                    }
                    tr.Commit();
                }

                // Poblar grilla
                dgvMasivo.Rows.Clear();
                foreach (var f in _filasMasivas)
                    dgvMasivo.Rows.Add(f.TmpName, f.PkId);

                lblInfoMasivo.Text =
                    $"{_filasMasivas.Count} polígonos seleccionados. " +
                    $"Asigne el PK_ID a cada uno y pulse Confirmar.";

                btnConfirmarMasivo.Enabled = true;
                btnCancelarMasivo.Enabled = true;
            }
            catch (Autodesk.AutoCAD.Runtime.Exception ex)
            { MessageBox.Show(this, $"Error AutoCAD: {ex.ErrorStatus}", "SICOE"); }
            catch (Exception ex)
            { MessageBox.Show(this, $"Error: {ex.Message}", "SICOE"); }
            finally { _picking = false; }
        }

        // ── Fase 2: confirmar — crear regiones y borrar textos temporales ─────
        private void BtnConfirmarMasivo_Click(object sender, EventArgs e)
        {
            // Sincronizar grilla → lista
            for (int i = 0; i < dgvMasivo.Rows.Count && i < _filasMasivas.Count; i++)
            {
                var v = (dgvMasivo.Rows[i].Cells[1].Value?.ToString() ?? "").Trim();
                _filasMasivas[i].PkId = v;
            }

            // Validar que todas las filas tengan PK asignado y válido
            var sinAsignar = _filasMasivas.Where(f => f.PkId.Length == 0).ToList();
            if (sinAsignar.Count > 0)
            {
                var dr = MessageBox.Show(this,
                    $"{sinAsignar.Count} polígono(s) no tienen PK_ID asignado.\n" +
                    $"¿Desea continuar y omitirlos?",
                    "SICOE", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
                if (dr != DialogResult.Yes) return;
            }

            var invalidos = _filasMasivas
                .Where(f => f.PkId.Length > 0 && !_validPksAll.Contains(f.PkId))
                .ToList();
            if (invalidos.Count > 0)
            {
                MessageBox.Show(this,
                    $"Los siguientes PK_ID no existen en la lista:\n" +
                    string.Join("\n", invalidos.Select(f => $"  {f.TmpName} → {f.PkId}")),
                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            // Crear regiones y borrar textos temporales
            int creadas = 0, omitidas = 0;
            try
            {
                var doc = acApp.Application.DocumentManager.MdiActiveDocument;
                if (doc == null) return;

                using (doc.LockDocument())
                {
                    foreach (var fila in _filasMasivas)
                    {
                        if (fila.PkId.Length == 0) { omitidas++; continue; }

                        // Crear región
                        double pasoMasivo = 0.5;
                        if (double.TryParse(txtPasoMuestreo.Text,
                            System.Globalization.NumberStyles.Any,
                            System.Globalization.CultureInfo.InvariantCulture, out var pm) && pm > 0)
                            pasoMasivo = pm;

                        var entAplanada = AplanarAPolilinea(fila.EntId, pasoMasivo, doc);
                        var idParaRegion = entAplanada ?? fila.EntId;
                        var regId = PkStore.CreateRegionFromEntity(
                                        idParaRegion, fila.PkId, out var err);
                        if (entAplanada.HasValue) BorrarEntidadTemporal(doc, entAplanada.Value); if (regId.IsNull)
                        {
                            MessageBox.Show(this,
                                $"No se pudo crear región para {fila.TmpName}:\n{err}", "SICOE");
                            omitidas++; continue;
                        }

                        // Borrar texto temporal
                        BorrarTextoTemporal(doc, fila.TxtId);
                        creadas++;
                    }
                }

                _filasMasivas.Clear();
                dgvMasivo.Rows.Clear();
                lblInfoMasivo.Text = $"✔ {creadas} regiones creadas. {omitidas} omitidas.";
                btnConfirmarMasivo.Enabled = false;
                btnCancelarMasivo.Enabled = false;

                MessageBox.Show(this,
                    $"Proceso completado.\n\n✔ Regiones creadas: {creadas}\n✖ Omitidas: {omitidas}",
                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            { MessageBox.Show(this, $"Error: {ex.Message}", "SICOE"); }
        }

        // ── Cancelar masivo: borrar temporales y limpiar ─────────────────────
        private void BtnCancelarMasivo_Click(object sender, EventArgs e)
        {
            LimpiarTemporales();
            dgvMasivo.Rows.Clear();
            lblInfoMasivo.Text = "Selección cancelada. Puede iniciar de nuevo.";
            btnConfirmarMasivo.Enabled = false;
            btnCancelarMasivo.Enabled = false;
        }

        private void LimpiarTemporales()
        {
            if (_filasMasivas.Count == 0) return;
            try
            {
                var doc = acApp.Application.DocumentManager.MdiActiveDocument;
                if (doc == null) return;
                using (doc.LockDocument())
                    foreach (var f in _filasMasivas)
                        BorrarTextoTemporal(doc, f.TxtId);
            }
            catch { /* silencioso */ }
            finally { _filasMasivas.Clear(); }
        }

        private static void BorrarTextoTemporal(
            acApp.Document doc, acDb.ObjectId txtId)
        {
            if (txtId.IsNull || !txtId.IsValid) return;
            using var tr = doc.Database.TransactionManager.StartTransaction();
            try
            {
                var obj = tr.GetObject(txtId, acDb.OpenMode.ForWrite, false, true);
                if (obj != null && !obj.IsErased) obj.Erase();
                tr.Commit();
            }
            catch { tr.Abort(); }
        }

        // ── Helpers comunes ───────────────────────────────────────────────────
        private void RefreshAutoComplete()
        {
            _acSrc = new AutoCompleteStringCollection();
            var fuente = _allowManual
                ? _validPksAll
                : _validPksAll.Where(pk => !_pksConRegion.Contains(pk));
            foreach (var pk in fuente) _acSrc.Add(pk);
        }

        // Rectas: sin aplanar. Curvas/splines/bulge: polilínea con muestreo cada 'paso' m (solo en arcos).
        private static acDb.ObjectId? AplanarAPolilinea(
            acDb.ObjectId entId, double paso, acApp.Document doc)
        {
            var db = doc.Database;
            using var tr = db.TransactionManager.StartTransaction();
            var ent = tr.GetObject(entId, acDb.OpenMode.ForRead, false, true) as acDb.Entity;
            if (ent == null) { tr.Abort(); return null; }

            var pts = PkStore.BuildBoundaryPointsForRegion(ent, paso);
            if (pts == null) { tr.Abort(); return null; }

            if (pts.Count < 3) { tr.Abort(); return null; }

            // Evitar vértice duplicado de cierre + Closed=true (AutoCAD puede marcar "no cerrada")
            if (pts.Count > 2)
            {
                var a = pts[0];
                var b = pts[pts.Count - 1];
                if (a.GetDistanceTo(b) < 1e-6)
                    pts.RemoveAt(pts.Count - 1);
            }
            if (pts.Count < 3) { tr.Abort(); return null; }

            var nueva = new acDb.Polyline(pts.Count);
            for (int i = 0; i < pts.Count; i++)
                nueva.AddVertexAt(i, pts[i], 0, 0, 0);
            nueva.Closed = true;

            try
            {
                if (!nueva.Closed || Math.Abs(nueva.Area) < 1e-8)
                {
                    tr.Abort();
                    return null;
                }
            }
            catch
            {
                tr.Abort();
                return null;
            }
            nueva.Layer = "0";

            var btr = (acDb.BlockTableRecord)tr.GetObject(
                          db.CurrentSpaceId, acDb.OpenMode.ForWrite);
            var newId = btr.AppendEntity(nueva);
            tr.AddNewlyCreatedDBObject(nueva, true);
            tr.Commit();
            return newId;
        }

        private static void BorrarEntidadTemporal(acApp.Document doc, acDb.ObjectId id)
        {
            if (id.IsNull || !id.IsValid) return;
            using var tr = doc.Database.TransactionManager.StartTransaction();
            try
            {
                var obj = tr.GetObject(id, acDb.OpenMode.ForWrite, false, true);
                if (obj != null && !obj.IsErased) obj.Erase();
                tr.Commit();
            }
            catch { tr.Abort(); }
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            // Si quedan temporales al cerrar, limpiarlas
            LimpiarTemporales();
            base.OnFormClosing(e);
        }
    }
}