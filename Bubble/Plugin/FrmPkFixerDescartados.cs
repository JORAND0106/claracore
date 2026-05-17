using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows.Forms;

using acApp = Autodesk.AutoCAD.ApplicationServices;
using acDb = Autodesk.AutoCAD.DatabaseServices;
using acGeo = Autodesk.AutoCAD.Geometry;
using acEd = Autodesk.AutoCAD.EditorInput;

namespace SicoePresupuestoNET8
{
    public partial class FrmPkFixerDescartados : Form
    {
        // Lista paralela con el ObjectId de la entidad de cada fila del grid
        private readonly List<acDb.ObjectId> _idsFilas = new();

        // =======================
        //  Modelo de cada fila
        // =======================
        public class RowPk
        {
            public acDb.ObjectId Id { get; set; }              // Opcional (por si lo quieres usar luego)
            public string Handle { get; set; } = string.Empty; // Handle de la ENTIDAD ORIGINAL
            public string AbsIni { get; set; } = string.Empty;
            public string AbsFin { get; set; } = string.Empty;
            public string Calzada { get; set; } = string.Empty;
            public double Dimension { get; set; }              // Área / Longitud / Nodo
            public string PkId { get; set; } = string.Empty;   // PK asignado por el usuario
        }

        private readonly List<RowPk> _rows;
        private readonly AutoCompleteStringCollection _pkAutoSource;
        private readonly HashSet<string> _validPks = new(StringComparer.OrdinalIgnoreCase);

        // Exponer resultado al formulario padre
        public IReadOnlyList<RowPk> Resultado => _rows;

        // ====================================================
        //  Constructor: recibe filas + sugerencias de PK_ID
        // ====================================================
        public FrmPkFixerDescartados(IEnumerable<RowPk> rows,
                                     IEnumerable<string>? pkSuggestions)
        {
            InitializeComponent();

            _rows = rows?.ToList() ?? new List<RowPk>();

            var listaPk = (pkSuggestions ?? Enumerable.Empty<string>())
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .Select(s => s.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(s => s)
                .ToList();

            _pkAutoSource = new AutoCompleteStringCollection();
            if (listaPk.Count > 0)
            {
                _pkAutoSource.AddRange(listaPk.ToArray());
                _validPks.UnionWith(listaPk);   // ← PK_ID válidos para validar
            }

            dgvDescartados.AutoGenerateColumns = false;

            CargarFilas();

            // Evitar sort (mantiene sincronía fila <-> _rows <-> _idsFilas)
            foreach (DataGridViewColumn c in dgvDescartados.Columns)
            {
                c.SortMode = DataGridViewColumnSortMode.NotSortable;
            }

        }

        // ==========================
        //  Carga inicial de la grid
        // ==========================
        private void CargarFilas()
        {
            dgvDescartados.Rows.Clear();
            _idsFilas.Clear();   // reiniciar lista paralela

            foreach (var r in _rows)
            {
                int idx = dgvDescartados.Rows.Add();
                var row = dgvDescartados.Rows[idx];

                // Nombres de columnas tal como se definieron en el .Designer
                row.Cells["colAbsIni"].Value = r.AbsIni;
                row.Cells["colAbsFin"].Value = r.AbsFin;

                if (dgvDescartados.Columns.Contains("colCalzada"))
                    row.Cells["colCalzada"].Value = r.Calzada;

                row.Cells["colDimension"].Value = r.Dimension;
                row.Cells["colPkId"].Value = r.PkId;
                row.Cells["colHandleOriginal"].Value = r.Handle;

                // Asociar el ObjectId de la entidad original a ESTA fila
                _idsFilas.Add(r.Id);

                // Tag = referencia al modelo (para eliminar/zoom sin depender de índices)
                row.Tag = r;
            }
        }


        // =========================================
        //  Botón Aceptar: validar y cerrar con OK
        // =========================================
        private void btnAceptar_Click(object sender, EventArgs e)
        {
            // Finalizar edición de la celda actual
            dgvDescartados.EndEdit();

            // Pasar valores de la grid al modelo interno
            for (int i = 0; i < _rows.Count && i < dgvDescartados.Rows.Count; i++)
            {
                var gridRow = dgvDescartados.Rows[i];
                var pk = gridRow.Cells["colPkId"].Value?.ToString() ?? string.Empty;
                _rows[i].PkId = pk.Trim();
            }

            // Validar: TODAS las filas deben tener PK_ID
            var incompletas = _rows.Where(r => string.IsNullOrWhiteSpace(r.PkId)).ToList();
            if (incompletas.Count > 0)
            {
                MessageBox.Show(
                    this,
                    "Hay filas sin PK_ID.\n\nDebes diligenciar el PK_ID para todas las entidades descartadas antes de continuar.",
                    "SICOE",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);

                return; // NO cierra
            }

            this.DialogResult = DialogResult.OK;
            this.Close();
        }

        // =========================================
        //  Botón Cancelar: salir sin aplicar cambios
        // =========================================
        private void btnCancelar_Click(object sender, EventArgs e)
        {
            this.DialogResult = DialogResult.Cancel;
            this.Close();
        }
        private void btnEliminarEnt_Click(object sender, EventArgs e)
        {
            // Debe haber una fila seleccionada
            if (dgvDescartados.CurrentRow == null || dgvDescartados.CurrentRow.IsNewRow)
            {
                MessageBox.Show(this, "Seleccione una fila para eliminar.", "SICOE",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            int rowIndex = dgvDescartados.CurrentRow.Index;
            if (rowIndex < 0) return;

            // Tomar el RowPk desde Tag (preferido)
            RowPk? rp = null;
            try { rp = dgvDescartados.CurrentRow.Tag as RowPk; } catch { }

            // Resolver ObjectId
            acDb.ObjectId id = acDb.ObjectId.Null;

            if (rp != null && rp.Id.IsValid && !rp.Id.IsNull)
                id = rp.Id;
            else if (rowIndex < _idsFilas.Count)
                id = _idsFilas[rowIndex];

            // Confirmación
            var ask = MessageBox.Show(this,
                "Esta acción borrará la entidad del dibujo y eliminará la fila del listado.\n\n¿Desea continuar?",
                "SICOE",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning);

            if (ask != DialogResult.Yes) return;

            // 1) Borrar en AutoCAD (real)
            if (id.IsValid && !id.IsNull)
            {
                try
                {
                    var doc = acApp.Application.DocumentManager.MdiActiveDocument;
                    if (doc != null)
                    {
                        var db = doc.Database;

                        using (doc.LockDocument())
                        using (var tr = db.TransactionManager.StartTransaction())
                        {
                            var obj = tr.GetObject(id, acDb.OpenMode.ForWrite, false, true);
                            if (obj is acDb.Entity ent && !ent.IsErased)
                            {
                                ent.Erase(true);
                            }
                            tr.Commit();
                        }
                    }
                }
                catch (Exception ex)
                {
                    MessageBox.Show(this,
                        "No se pudo borrar la entidad en AutoCAD.\n\nDetalle: " + ex.Message,
                        "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return; // si no se borra en CAD, NO eliminamos la fila
                }
            }

            // 2) Eliminar del modelo interno (_rows)
            //    - Si tenemos la referencia rp, la removemos por referencia
            //    - Si no, removemos por índice (mientras esté alineado)
            if (rp != null)
            {
                _rows.Remove(rp);
            }
            else
            {
                if (rowIndex >= 0 && rowIndex < _rows.Count)
                    _rows.RemoveAt(rowIndex);
            }

            // 3) Eliminar de la lista paralela de ids
            if (rowIndex >= 0 && rowIndex < _idsFilas.Count)
                _idsFilas.RemoveAt(rowIndex);

            // 4) Eliminar del grid
            dgvDescartados.Rows.RemoveAt(rowIndex);
        }

        // ==================================================
        //  Autocompletado en columna PK_ID usando PK existentes
        // ==================================================
        private void dgvDescartados_EditingControlShowing(object sender, DataGridViewEditingControlShowingEventArgs e)
        {
            if (dgvDescartados.CurrentCell == null)
                return;

            // Solo aplicar autocomplete a la columna de PK_ID
            if (dgvDescartados.CurrentCell.OwningColumn != null &&
                dgvDescartados.CurrentCell.OwningColumn.Name == "colPkId" &&
                e.Control is TextBox tb)
            {
                tb.AutoCompleteMode = AutoCompleteMode.SuggestAppend;
                tb.AutoCompleteSource = AutoCompleteSource.CustomSource;
                tb.AutoCompleteCustomSource = _pkAutoSource;
            }
            else if (e.Control is TextBox tb2)
            {
                // En cualquier otra columna, desactivar autocomplete
                tb2.AutoCompleteMode = AutoCompleteMode.None;
                tb2.AutoCompleteSource = AutoCompleteSource.None;
            }
        }

        // ==================================================
        //  Doble clic en fila -> hacer ZOOM a la entidad
        // ==================================================
        private void dgvDescartados_CellDoubleClick(object sender, DataGridViewCellEventArgs e)
        {
            if (e.RowIndex < 0) return;

            acDb.ObjectId id = acDb.ObjectId.Null;

            // 1) Preferido: leer desde Tag (robusto)
            try
            {
                var gridRow = dgvDescartados.Rows[e.RowIndex];
                if (gridRow?.Tag is RowPk rp && rp.Id.IsValid && !rp.Id.IsNull)
                    id = rp.Id;
            }
            catch { }

            // 2) Fallback: lista paralela
            if (id.IsNull)
            {
                if (e.RowIndex >= _idsFilas.Count) return;
                id = _idsFilas[e.RowIndex];
            }

            if (!id.IsValid || id.IsNull) return;

            try
            {
                var doc = acApp.Application.DocumentManager.MdiActiveDocument;
                if (doc == null) return;

                var db = doc.Database;
                var ed = doc.Editor;

                using (doc.LockDocument())
                using (var tr = db.TransactionManager.StartTransaction())
                {
                    if (tr.GetObject(id, acDb.OpenMode.ForRead, false, true) is not acDb.Entity ent)
                        return;

                    var ext = ent.GeometricExtents;
                    ZoomToExtents(ed, ext);

                    try { ed.SetImpliedSelection(new[] { id }); } catch { }

                    tr.Commit();
                }
            }
            catch
            {
                // silencioso
            }
        }

        // Zoom a extents de una entidad corrigiendo dirección de vista / UCS
        private static void ZoomToExtents(acEd.Editor ed, acDb.Extents3d ext)
        {
            const double factor = 5.0; // margen

            using (var view = ed.GetCurrentView())
            {
                // Matriz de WCS a sistema de la cámara (Eye coordinates)
                var wc2ec = acGeo.Matrix3d.PlaneToWorld(view.ViewDirection);
                wc2ec = acGeo.Matrix3d.Displacement(view.Target - acGeo.Point3d.Origin) * wc2ec;
                wc2ec = acGeo.Matrix3d.Rotation(-view.ViewTwist, view.ViewDirection, view.Target) * wc2ec;

                // Pasar los extents a coordenadas de la vista
                var extEc = ext;
                extEc.TransformBy(wc2ec.Inverse());

                var min = extEc.MinPoint;
                var max = extEc.MaxPoint;

                double width = (max.X - min.X) * factor;
                double height = (max.Y - min.Y) * factor;

                // Evitar tamaños cero
                if (width <= 0) width = view.Width;
                if (height <= 0) height = view.Height;

                double cx = (max.X + min.X) / 2.0;
                double cy = (max.Y + min.Y) / 2.0;

                view.Width = width;
                view.Height = height;
                view.CenterPoint = new acGeo.Point2d(cx, cy);

                ed.SetCurrentView(view);
            }
        }

        private void dgvDescartados_CellValidating(object sender, DataGridViewCellValidatingEventArgs e)
        {
            if (e.RowIndex < 0) return;

            var grid = (DataGridView)sender;
            var col = grid.Columns[e.ColumnIndex];

            // Solo validar la columna PK_ID
            if (col == null || col.Name != "colPkId")
                return;

            var texto = (e.FormattedValue?.ToString() ?? "").Trim();

            // Permitimos vacío en edición; el botón Guardar se encarga de exigir que todos tengan PK
            if (texto.Length == 0) return;

            if (!_validPks.Contains(texto))
            {
                e.Cancel = true;
                MessageBox.Show(this,
                    $"El PK_ID \"{texto}\" no existe en el proyecto.\n\nSeleccione uno de la lista.",
                    "SICOE",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);

                // Deja el foco en la celda hasta que escoja un PK válido
            }
        }

    }
}
