using System;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;

// Aliases AutoCAD
using acApp = Autodesk.AutoCAD.ApplicationServices;
using acDb = Autodesk.AutoCAD.DatabaseServices;

namespace SicoePresupuestoNET8
{
    public sealed class FrmFiltroCapComItem : Form
    {
        private readonly ComboBox cmbCap = new();
        private readonly ComboBox cmbCom = new();
        private readonly ComboBox cmbItem = new();
        private readonly ComboBox cmbUnd = new();
        private readonly Button btnVerificar = new();
        private readonly Button btnCancelar = new();

        public FrmFiltroCapComItem()
        {
            Text = "Buscar y encender capas por Ítem";
            StartPosition = FormStartPosition.CenterParent;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false; MinimizeBox = false;
            ClientSize = new Size(560, 300);
            BackColor = Color.White;

            // ========== ROOT: header + contenido ==========
            var root = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 1,
                RowCount = 2,
                BackColor = Color.White
            };
            root.RowStyles.Add(new RowStyle(SizeType.AutoSize));          // header
            root.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));     // contenido
            Controls.Add(root);

            // Header
            var header = new Panel { Dock = DockStyle.Top, Height = 60, BackColor = Color.FromArgb(245, 248, 255) };
            var title = new Label
            {
                Text = "Filtrar capas por ítem",
                AutoSize = true,
                Font = new Font("Segoe UI Semibold", 16f, FontStyle.Bold),
                ForeColor = Color.FromArgb(28, 42, 90),
                Location = new Point(16, 16)
            };
            header.Controls.Add(title);
            root.Controls.Add(header, 0, 0);

            // Contenido (grid)
            var grid = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(16, 12, 16, 12),
                ColumnCount = 2,
                RowCount = 5,
                BackColor = Color.White
            };
            grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 120));
            grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            root.Controls.Add(grid, 0, 1);

            Label L(string t) => new Label { Text = t, AutoSize = true, Margin = new Padding(0, 8, 8, 0) };
            void StyleCombo(ComboBox c)
            {
                c.DropDownStyle = ComboBoxStyle.DropDownList;
                c.Font = new Font("Segoe UI", 9f);
                c.Anchor = AnchorStyles.Left | AnchorStyles.Right;
                c.Margin = new Padding(0, 4, 0, 8);
            }

            StyleCombo(cmbCap);
            StyleCombo(cmbCom);

            // Ítem: desplegable escribible + formateo "código - descripción"
            cmbItem.DropDownStyle = ComboBoxStyle.DropDown;
            cmbItem.Font = new Font("Segoe UI", 9f);
            cmbItem.Anchor = AnchorStyles.Left | AnchorStyles.Right;
            cmbItem.Margin = new Padding(0, 4, 0, 8);

            StyleCombo(cmbUnd);

            grid.Controls.Add(L("Capítulo:"), 0, 0); grid.Controls.Add(cmbCap, 1, 0);
            grid.Controls.Add(L("Competencia:"), 0, 1); grid.Controls.Add(cmbCom, 1, 1);
            grid.Controls.Add(L("Ítem:"), 0, 2); grid.Controls.Add(cmbItem, 1, 2);
            grid.Controls.Add(L("Und:"), 0, 3); grid.Controls.Add(cmbUnd, 1, 3);

            var flow = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft };
            btnVerificar.Text = "Verificar";
            btnVerificar.AutoSize = true; btnVerificar.Padding = new Padding(16, 6, 16, 6);
            btnVerificar.BackColor = Color.FromArgb(59, 130, 246); btnVerificar.ForeColor = Color.White;
            btnVerificar.FlatStyle = FlatStyle.Flat; btnVerificar.FlatAppearance.BorderSize = 0;

            btnCancelar.Text = "Cancelar";
            btnCancelar.AutoSize = true; btnCancelar.Padding = new Padding(16, 6, 16, 6);
            btnCancelar.BackColor = Color.FromArgb(229, 231, 235); btnCancelar.ForeColor = Color.Black;
            btnCancelar.FlatStyle = FlatStyle.Flat; btnCancelar.FlatAppearance.BorderSize = 0;

            flow.Controls.Add(btnVerificar); flow.Controls.Add(btnCancelar);
            grid.Controls.Add(flow, 1, 4);

            // Eventos
            Load += FrmFiltroCapComItem_Load;
            btnCancelar.Click += (_, __) => DialogResult = DialogResult.Cancel;
            btnVerificar.Click += (_, __) => EjecutarFiltroYNavegar();

            cmbCap.SelectedIndexChanged += (_, __) => CargarCompetencias();
            cmbCom.SelectedIndexChanged += (_, __) => CargarItems();
            cmbItem.SelectedIndexChanged += (_, __) => ActualizarUnd();

            cmbItem.FormattingEnabled = true;
            cmbItem.Format += (s, e) => { if (e.ListItem is PresItem it) e.Value = $"{it.Item} - {it.Descripcion}"; };
            cmbItem.TextUpdate += (_, __) => ApplyItemFilter(cmbItem.Text);
        }

        private void FrmFiltroCapComItem_Load(object? sender, EventArgs e)
        {
            // Usa el catálogo que ya está en memoria
            CargarCapitulos();
        }

        // ===== Carga de combos (misma lógica que el form principal) =====
        private void CargarCapitulos()
        {
            var caps = (Commands.Catalogo ?? new()).Select(x => x.Capitulo)
                          .Where(s => !string.IsNullOrWhiteSpace(s))
                          .Distinct().OrderBy(s => s).ToList();

            cmbCap.BeginUpdate();
            cmbCap.DataSource = null; cmbCap.Items.Clear();
            cmbCap.DataSource = caps;
            cmbCap.EndUpdate();
            cmbCap.SelectedIndex = caps.Count > 0 ? 0 : -1;
        }

        private void CargarCompetencias()
        {
            string cap = cmbCap.SelectedItem as string ?? "";
            var comps = (Commands.Catalogo ?? new())
                        .Where(x => x.Capitulo == cap)
                        .Select(x => x.Competencia)
                        .Where(s => !string.IsNullOrWhiteSpace(s))
                        .Distinct().OrderBy(s => s).ToList();

            cmbCom.BeginUpdate();
            cmbCom.DataSource = null; cmbCom.Items.Clear();
            cmbCom.DataSource = comps;
            cmbCom.EndUpdate();
            cmbCom.SelectedIndex = comps.Count > 0 ? 0 : -1;

            CargarItems();
        }

        private System.Collections.Generic.List<PresItem> _itemsFull = new();
        private void CargarItems()
        {
            string cap = cmbCap.SelectedItem as string ?? "";
            string com = cmbCom.SelectedItem as string ?? "";

            _itemsFull = (Commands.Catalogo ?? new())
                        .Where(x => x.Capitulo == cap && x.Competencia == com)
                        .OrderBy(x => x.Item).ToList();

            ApplyItemFilter("");
            cmbItem.SelectedIndex = -1;
            ActualizarUnd();
        }

        private void ApplyItemFilter(string term)
        {
            var src = _itemsFull.AsEnumerable();
            if (!string.IsNullOrWhiteSpace(term))
            {
                string t = term.Trim();
                src = src.Where(it =>
                    (!string.IsNullOrEmpty(it.Item) && it.Item.IndexOf(t, StringComparison.OrdinalIgnoreCase) >= 0) ||
                    (!string.IsNullOrEmpty(it.Descripcion) && it.Descripcion.IndexOf(t, StringComparison.OrdinalIgnoreCase) >= 0));
            }
            var list = src.Take(300).ToList();

            cmbItem.BeginUpdate();
            cmbItem.DataSource = null; cmbItem.Items.Clear();
            cmbItem.DisplayMember = nameof(PresItem.Descripcion);   // el Format pinta "cod - desc"
            cmbItem.ValueMember = nameof(PresItem.Item);
            cmbItem.DataSource = list;
            cmbItem.EndUpdate();

            cmbItem.DroppedDown = list.Count > 0;
        }

        private void ActualizarUnd()
        {
            if (cmbItem.SelectedItem is PresItem it)
            {
                cmbUnd.DataSource = new[] { it.Und ?? "" };
                cmbUnd.SelectedIndex = 0;
            }
            else
            {
                cmbUnd.DataSource = Array.Empty<string>();
                cmbUnd.SelectedIndex = -1;
            }
        }

        // ===== Helpers de prefijos (idénticos al principal) =====
        private static string Prefijo5(string src, string fallback)
        {
            var solo = new string((src ?? "").Where(char.IsLetterOrDigit).ToArray());
            solo = solo.Substring(0, 5);
            return string.IsNullOrWhiteSpace(solo) ? fallback : solo.ToUpperInvariant();
        }
        private string PrefijoCap5() => Prefijo5(cmbCap.SelectedItem?.ToString() ?? "", "CAP00");
        private string PrefijoCom5() => Prefijo5(cmbCom.SelectedItem?.ToString() ?? "", "COM00");
        // ===== Snapshot exacto de estado de capas =====
        private sealed class LayerStateSnapshot
        {
            public string CurrentLayerName { get; }
            public System.Collections.Generic.Dictionary<string, bool> OffMap { get; }
            public bool TempExisted { get; }
            public bool TempWasOff { get; }
            public LayerStateSnapshot(string current,
                System.Collections.Generic.Dictionary<string, bool> map,
                bool tempExisted, bool tempWasOff)
            {
                CurrentLayerName = current;
                OffMap = map;
                TempExisted = tempExisted;
                TempWasOff = tempWasOff;
            }
        }

        private static LayerStateSnapshot CapturarEstadoCapas()
        {
            var doc = acApp.Application.DocumentManager.MdiActiveDocument;
            if (doc == null)
                return new LayerStateSnapshot("", new System.Collections.Generic.Dictionary<string, bool>(), false, false);

            var db = doc.Database;
            using var tr = db.TransactionManager.StartTransaction();
            var lt = (acDb.LayerTable)tr.GetObject(db.LayerTableId, acDb.OpenMode.ForRead);

            string current = ((acDb.LayerTableRecord)tr.GetObject(db.Clayer, acDb.OpenMode.ForRead)).Name;

            const string TEMP = "SICOE_TEMP_ON";
            bool tempExisted = lt.Has(TEMP);
            bool tempWasOff = false;
            if (tempExisted)
            {
                var lrTemp = (acDb.LayerTableRecord)tr.GetObject(lt[TEMP], acDb.OpenMode.ForRead);
                tempWasOff = lrTemp.IsOff;
            }

            var map = new System.Collections.Generic.Dictionary<string, bool>(System.StringComparer.OrdinalIgnoreCase);
            foreach (acDb.ObjectId lid in lt)
            {
                if (tr.GetObject(lid, acDb.OpenMode.ForRead) is acDb.LayerTableRecord lr)
                    map[lr.Name] = lr.IsOff;
            }
            tr.Commit();

            return new LayerStateSnapshot(current, map, tempExisted, tempWasOff);
        }

        private static void RestaurarEstadoCapas(LayerStateSnapshot snap)
        {
            var doc = acApp.Application.DocumentManager.MdiActiveDocument;
            if (doc == null) return;

            using (doc.LockDocument())
            {
                var db = doc.Database;
                using var tr = db.TransactionManager.StartTransaction();
                var lt = (acDb.LayerTable)tr.GetObject(db.LayerTableId, acDb.OpenMode.ForRead);

                foreach (acDb.ObjectId lid in lt)
                {
                    if (tr.GetObject(lid, acDb.OpenMode.ForWrite) is acDb.LayerTableRecord lr)
                    {
                        if (snap.OffMap.TryGetValue(lr.Name, out bool wasOff))
                        {
                            lr.IsOff = wasOff;
                        }
                        else if (string.Equals(lr.Name, "SICOE_TEMP_ON", System.StringComparison.OrdinalIgnoreCase))
                        {
                            // Si no existía antes, déjala apagada; si existía, deja su estado original
                            lr.IsOff = snap.TempExisted ? snap.TempWasOff : true;
                        }
                        // Capas nuevas que pudieron crearse durante la navegación: se dejan como estén.
                    }
                }

                // Restaurar capa actual previa (asegura que esté encendida)
                if (!string.IsNullOrWhiteSpace(snap.CurrentLayerName) && lt.Has(snap.CurrentLayerName))
                {
                    var lrCur = (acDb.LayerTableRecord)tr.GetObject(lt[snap.CurrentLayerName], acDb.OpenMode.ForWrite);
                    if (lrCur.IsOff) lrCur.IsOff = false;
                    db.Clayer = lrCur.ObjectId;
                }

                tr.Commit();
            }
        }

        // ===== Acción del botón =====
        private void EjecutarFiltroYNavegar()
        {
            try
            {
                if (cmbCap.SelectedIndex < 0 || cmbCom.SelectedIndex < 0 || cmbItem.SelectedIndex < 0)
                {
                    MessageBox.Show(this, "Selecciona Capítulo, Competencia e Ítem.", "SICOE",
                        MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }

                var it = (PresItem)cmbItem.SelectedItem!;
                string cap5 = PrefijoCap5();
                string com5 = PrefijoCom5();
                string item = it.Item ?? "";

                string layerEnt = $"{cap5}_{com5}_{item}";
                string layerTxt = $"txt_{cap5}_{com5}_{item}";
                layerEnt = layerEnt.Substring(0, 255);
                layerTxt = layerTxt.Substring(0, 255);

                // --- NUEVO: snapshot del estado de capas ANTES del filtro ---
                var snap = CapturarEstadoCapas();

                // 1) Mostrar solo las dos capas objetivo (apagando todo lo demás)
                EncenderSoloEstasCapas(layerEnt, layerTxt);

                // 2) UX: oculto el form, navegas CAD, ENTER/ESC para volver
                var doc = acApp.Application.DocumentManager.MdiActiveDocument;
                var ed = doc.Editor;
                bool estabaVisible = this.Visible;
                if (estabaVisible) this.Hide();

                ed.WriteMessage($"\nMostrando solo: {layerEnt} y {layerTxt}.");
                ed.GetString("\nPresione ENTER o ESC para volver al formulario.");

                // 3) NUEVO: restaurar EXACTAMENTE el estado previo (no encender todo)
                RestaurarEstadoCapas(snap);

                if (!this.IsDisposed && estabaVisible)
                {
                    this.Show();
                    this.Activate();
                }
            }
            catch (Autodesk.AutoCAD.Runtime.Exception ex)
            {
                MessageBox.Show(this, $"No fue posible aplicar/restaurar el filtro de capas: {ex.ErrorStatus}",
                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, $"No fue posible aplicar/restaurar el filtro de capas:\n{ex.Message}",
                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static void EncenderTodasLasCapas(string? restoreCurrentLayer = null)
        {
            var doc = acApp.Application.DocumentManager.MdiActiveDocument;
            if (doc == null) return;

            using (doc.LockDocument())
            {
                var db = doc.Database;
                using var tr = db.TransactionManager.StartTransaction();
                var lt = (acDb.LayerTable)tr.GetObject(db.LayerTableId, acDb.OpenMode.ForRead);

                // Enciende todas
                foreach (acDb.ObjectId lid in lt)
                {
                    if (tr.GetObject(lid, acDb.OpenMode.ForWrite) is acDb.LayerTableRecord lr)
                        lr.IsOff = false;
                }

                // Restaurar capa actual si existe
                if (!string.IsNullOrWhiteSpace(restoreCurrentLayer) && lt.Has(restoreCurrentLayer))
                {
                    db.Clayer = lt[restoreCurrentLayer];
                }

                // Opcional: apagar/limpiar la temporal si te molesta dejarla encendida
                const string TEMP = "SICOE_TEMP_ON";
                if (lt.Has(TEMP))
                {
                    var lrTemp = (acDb.LayerTableRecord)tr.GetObject(lt[TEMP], acDb.OpenMode.ForWrite);
                    lrTemp.IsOff = false; // o true si prefieres
                }

                tr.Commit();
            }
        }

        /// <summary>
        /// Apaga todas las capas y deja encendidas solo las indicadas.
        /// Protege la capa “0” y “DEFPOINTS” y mueve la capa activa a “0”
        /// para evitar InvalidLayer.
        /// </summary>
        private static void EncenderSoloEstasCapas(params string[] nombresObjetivo)
        {
            var doc = acApp.Application.DocumentManager.MdiActiveDocument;
            if (doc == null) return;

            using (doc.LockDocument())
            {
                var db = doc.Database;
                using var tr = db.TransactionManager.StartTransaction();

                var lt = (acDb.LayerTable)tr.GetObject(db.LayerTableId, acDb.OpenMode.ForRead);

                // 1) Asegurar capa temporal y ponerla como actual
                const string TEMP = "SICOE_TEMP_ON";
                acDb.ObjectId tempId;
                if (!lt.Has(TEMP))
                {
                    lt.UpgradeOpen();
                    var ltr = new acDb.LayerTableRecord { Name = TEMP, IsOff = false };
                    tempId = lt.Add(ltr); tr.AddNewlyCreatedDBObject(ltr, true);
                }
                else tempId = lt[TEMP];

                db.Clayer = tempId; // ahora podemos apagar TODO lo demás (incluido "0")

                var keep = nombresObjetivo
                           .Where(s => !string.IsNullOrWhiteSpace(s))
                           .ToHashSet(StringComparer.OrdinalIgnoreCase);
                keep.Add(TEMP); // dejamos la temporal encendida

                // 2) Recorre todas las capas
                foreach (acDb.ObjectId lid in lt)
                {
                    if (tr.GetObject(lid, acDb.OpenMode.ForWrite) is not acDb.LayerTableRecord lr) continue;

                    // Enciende solo las capas objetivo + TEMP, apaga lo demás
                    lr.IsOff = !keep.Contains(lr.Name);
                }

                tr.Commit();
            }
        }
    }
}
