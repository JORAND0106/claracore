using Autodesk.AutoCAD.DatabaseServices;
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.Linq;
using System.Windows.Forms;
using acApp = Autodesk.AutoCAD.ApplicationServices;
using acCol = Autodesk.AutoCAD.Colors;
using acDb = Autodesk.AutoCAD.DatabaseServices;
using acEd = Autodesk.AutoCAD.EditorInput;
using acGeo = Autodesk.AutoCAD.Geometry;



namespace SicoePresupuestoNET8
{
    public partial class FrmGestorSeleccionEntidades : Form
    {
    
        public class RowInfo
        {
            public acDb.ObjectId Id { get; set; }
            public string Handle { get; set; } = "";
            public string PkId { get; set; } = "";
            public string TipoCad { get; set; } = "";
            public double Dimension { get; set; } = 0.0;
            public string Abscisa { get; set; } = "";
            public string Calzada { get; set; } = "";

            // === NUEVO: Capa/Layer real de la entidad ===
            public string LayerName { get; set; } = "";


            // === Duplicados ===
            public bool IsDuplicate { get; set; } = false;      // “esta fila es duplicada”
            public string DupGroup { get; set; } = "";          // id de grupo (misma firma)
            public string Signature { get; set; } = "";         // firma geométrica
            public bool MarkToDelete { get; set; } = false;     // checkbox (usuario decide)
        }


        private readonly List<RowInfo> _rows = new();
        private readonly FrmSicoePresupuesto.TipoEntidad _tipo;
        private readonly AxisContext? _axisCtx; // puede ser null si no hay eje
        private acDb.ObjectId _lastEntId = acDb.ObjectId.Null;
        private readonly bool _nodoAnalisisDetallado;

        public IReadOnlyList<acDb.ObjectId> SelectedIds
            => _rows.Select(r => r.Id).ToList();

        public FrmGestorSeleccionEntidades(
            IEnumerable<acDb.ObjectId> ids,
            FrmSicoePresupuesto.TipoEntidad tipo,
            AxisContext? axisCtx,
            bool nodoAnalisisDetallado)

        {
            InitializeComponent();

            // =====================================================
            // FIX: Evitar que el formulario se cierre automáticamente
            // por propiedad DialogResult del botón (configurada en Designer)
            // =====================================================
            btnAceptar.DialogResult = DialogResult.None;   // <- CLAVE: NO debe cerrar el form
            btnCancelar.DialogResult = DialogResult.Cancel;   // (Opcional) si tu botón Cancelar debe cerrar, sí puede quedar:
            btnSeparar.Click -= btnSeparar_Click;
            btnSeparar.Click += btnSeparar_Click;
            
            // Si el form tenía AcceptButton apuntando a btnAceptar, se puede dejar.
            // Enter seguirá disparando el click, pero ya NO cerrará el form por DialogResult.

            _tipo = tipo;
            // Si viene null, intentamos cargar el primero del repositorio
            _axisCtx = axisCtx ?? AxisRepository.LoadFirstAxis();

            // >>> CLAVE: si no hay eje válido, avisar (para no perder 1 hora viendo "—")
            if (_axisCtx == null || _axisCtx.AxisA.IsNull || !_axisCtx.AxisA.IsValid)
            {
                MessageBox.Show(this,
                    "No hay un EJE válido cargado para este dibujo.\n\n" +
                    "Causa típica:\n" +
                    "- El eje guardado en axes_v2.json pertenece a OTRO DWG (Handle no existe aquí).\n\n" +
                    "Acción:\n" +
                    "- Abre Gestión de Ejes y carga/selecciona el eje de ESTE dibujo.",
                    "SICOE - Eje no disponible",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
            }

            if (ids != null)
            {
                // Sanitizar IDs: evita eWasErased / ids de otro DB
                var doc = acApp.Application.DocumentManager.MdiActiveDocument;
                var db = doc?.Database;

                var limpios = new List<acDb.ObjectId>();
                if (db != null)
                {
                    foreach (var id in ids)
                    {
                        try
                        {
                            if (id.IsNull) continue;
                            if (!id.IsValid) continue;

                            // CLAVE: IsValid puede ser true aunque la entidad esté borrada
                            if (id.IsErased) continue;

                            // Evita ids que vienen de otro dibujo/DB
                            if (id.Database != db) continue;

                            limpios.Add(id);
                        }
                        catch
                        {
                            // Si algo raro pasa con el id, lo descartamos
                        }
                    }
                }

                AgregarDesdeIds(limpios);
            }

            // === SINCRONIZACIÓN CHECKBOX "Del" ===
            // 1) Commit inmediato cuando se hace click en un checkbox
            dgvEntidades.CurrentCellDirtyStateChanged += (s, e) =>
            {
                if (dgvEntidades.IsCurrentCellDirty)
                    dgvEntidades.CommitEdit(DataGridViewDataErrorContexts.Commit);
            };

            // 2) Cada cambio en la celda 0 (Del) actualiza el modelo (RowInfo.MarkToDelete)
            dgvEntidades.CellValueChanged += (s, e) =>
            {
                if (e.RowIndex < 0) return;
                if (e.ColumnIndex != 0) return; // 0 = Del

                var gr = dgvEntidades.Rows[e.RowIndex];
                if (gr?.Tag is not RowInfo ri) return;

                bool marcado = false;
                try
                {
                    var v = gr.Cells[0].Value;
                    if (v is bool b) marcado = b;
                    else if (v != null && bool.TryParse(v.ToString(), out var bb)) marcado = bb;
                }
                catch { }

                ri.MarkToDelete = marcado;

                // Mantener checkbox maestro actualizado sin recursión
                if (_rows.Count > 0)
                {
                    bool all = _rows.All(x => x.MarkToDelete);
                    bool any = _rows.Any(x => x.MarkToDelete);

                    chkSeleccionarTodo.CheckedChanged -= chkSeleccionarTodo_CheckedChanged;
                    chkSeleccionarTodo.Checked = all && any;
                    chkSeleccionarTodo.CheckedChanged += chkSeleccionarTodo_CheckedChanged;
                }
            };
            // Forzar commit inmediato del checkbox (Del) y sincronizar modelo
            dgvEntidades.CurrentCellDirtyStateChanged += dgvEntidades_CurrentCellDirtyStateChanged;
            dgvEntidades.CellValueChanged += dgvEntidades_CellValueChanged;

            DetectarYMarcarDuplicados();
            RefrescarGrilla();
            btnUnificarCapa.Enabled = _rows.Count > 0;
            _nodoAnalisisDetallado = nodoAnalisisDetallado;

        }

        // ================== CARGA INICIAL / AGREGAR ==================

        private void AgregarDesdeIds(IEnumerable<acDb.ObjectId> ids)
        {
            var doc = acApp.Application.DocumentManager.MdiActiveDocument;
            if (doc == null) return;
            var db = doc.Database;

            using (var tr = db.TransactionManager.StartTransaction())
            {
                foreach (var id in ids)
                {
                    try
                    {
                        if (id.IsNull) continue;
                        if (!id.IsValid) continue;

                        // CLAVE: evita eWasErased
                        if (id.IsErased) continue;

                        // Evita ids de otro dibujo/DB
                        if (id.Database != db) continue;

                        if (_rows.Any(r => r.Id == id)) continue; // evitar duplicados

                        acDb.DBObject? obj = null;
                        try
                        {
                            obj = tr.GetObject(id, acDb.OpenMode.ForRead, false, true);
                        }
                        catch (Autodesk.AutoCAD.Runtime.Exception ex) when (ex.ErrorStatus == Autodesk.AutoCAD.Runtime.ErrorStatus.WasErased)
                        {
                            continue; // entidad ya no existe
                        }

                        if (obj == null) continue;

                        if (!EntidadCoincideConTipo(obj, _tipo))
                            continue;

                        if (obj is not acDb.Entity ent) continue;

                        var info = ConstruirRowInfo(ent, id);
                        _rows.Add(info);
                    }
                    catch
                    {
                        // Cualquier caso raro: saltar ese id y seguir
                    }
                }

                tr.Commit();
            }
        }

        private RowInfo ConstruirRowInfo(acDb.Entity ent, acDb.ObjectId id)
        {
            var info = new RowInfo
            {
                Id = id,
                Handle = "",
                PkId = "",
                TipoCad = GetTipoCad(ent),
                Dimension = CalcularDimensionAprox(ent),
                Abscisa = "",
                Calzada = "",
                LayerName = ""
            };

            try { info.Handle = ent.Handle.ToString(); } catch { }

            // Layer/Capa
            try { info.LayerName = string.IsNullOrWhiteSpace(ent.Layer) ? "—" : ent.Layer; }
            catch { info.LayerName = "—"; }

            // PK_ID aproximado usando el punto medio de PkStore
            try
            {
                var midPk = PkStore.MidPointOf(ent);
                if (PkStore.TryGetPkForPoint(midPk, out string pkId) && !string.IsNullOrWhiteSpace(pkId))
                    info.PkId = pkId;
            }
            catch { }

            // Abscisa + Calzada: resolver el eje/sector más cercano a la entidad
            var axisForEnt = AxisRepository.ResolveAxisForEntity(ent) ?? _axisCtx;
            if (axisForEnt != null && !axisForEnt.AxisA.IsNull)
            {
                string absIni = "", absFin = "", calzada = "";
                bool dentro = false;

                // 1) Intento NORMAL (con ordenadas / dentro)
                if (TryComputeAbsIniFin(ent, axisForEnt, 'X', out absIni, out absFin, out dentro, out calzada) && dentro)
                {
                    info.Abscisa = $"{absIni} - {absFin}";
                    info.Calzada = string.IsNullOrWhiteSpace(calzada) ? "—" : calzada;
                }
                else
                {
                    // 2) Intento FORZADO (sin filtro Inside) para garantizar que se vea algo en el gestor
                    string absIniF = "", absFinF = "", calzadaF = "";
                    bool okForced = TryComputeAbsIniFin_Forced(ent, axisForEnt, out absIniF, out absFinF, out calzadaF);

                    if (okForced)
                    {
                        // Marcamos que es “fuera de ordenadas” para depurar (pero ya se ve el PK en grilla)
                        info.Abscisa = $"{absIniF} - {absFinF}";
                        info.Calzada = string.IsNullOrWhiteSpace(calzadaF) ? "—" : (calzadaF + " (FUERA)");
                    }
                    else
                    {
                        info.Abscisa = "—";
                        info.Calzada = "—";
                    }
                }
            }

            return info;
        }


        private static string GetTipoCad(acDb.Entity ent)
        {
            if (ent is acDb.Polyline) return "Polilínea";
            if (ent is acDb.Line) return "Línea";
            if (ent is acDb.Polyline3d) return "Polilínea 3D";
            if (ent is acDb.Circle) return "Círculo";
            if (ent is acDb.Ellipse) return "Elipse";
            if (ent is acDb.DBPoint) return "Punto";
            if (ent is acDb.BlockReference) return "Bloque";
            return ent.GetType().Name;
        }

        private double CalcularDimensionAprox(acDb.Entity ent)
        {
            try
            {
                switch (_tipo)
                {
                    // ===== ÁREA: usar área real en XY, sin “altura” =====
                    case FrmSicoePresupuesto.TipoEntidad.Area:
                        // Polilínea cerrada
                        if (ent is acDb.Polyline pl && pl.Closed)
                            return Math.Round(pl.Area, 2);

                        // Círculo
                        if (ent is acDb.Circle c)
                            return Math.Round(Math.PI * c.Radius * c.Radius, 2);

                        // Elipse cerrada
                        if (ent is acDb.Ellipse el && el.Closed)
                            return Math.Round(Math.PI * el.MajorRadius * el.MinorRadius, 2);

                        // Bloque u otros → aproximar con bbox en XY
                        {
                            // Bloque → calcular "área real" desde la geometría interna del bloque (si es posible)
                            // Si no se puede, fallback a bbox (como antes)
                            if (ent is acDb.BlockReference br)
                            {
                                try
                                {
                                    var doc = acApp.Application.DocumentManager.MdiActiveDocument;
                                    var db = doc?.Database;
                                    if (db != null)
                                    {
                                        // Escala del bloque (área escala con |sx * sy| en XY)
                                        double sx = br.ScaleFactors.X;
                                        double sy = br.ScaleFactors.Y;
                                        double areaScale = Math.Abs(sx * sy);

                                        double areaMax = 0.0;

                                        using (var tr = db.TransactionManager.StartTransaction())
                                        {
                                            var btr = (acDb.BlockTableRecord)tr.GetObject(br.BlockTableRecord, acDb.OpenMode.ForRead);

                                            foreach (acDb.ObjectId id in btr)
                                            {
                                                var o = tr.GetObject(id, acDb.OpenMode.ForRead) as acDb.Entity;
                                                if (o == null) continue;

                                                // Círculo
                                                if (o is acDb.Circle cDef)
                                                {
                                                    double a = Math.PI * cDef.Radius * cDef.Radius;
                                                    if (a > areaMax) areaMax = a;
                                                    continue;
                                                }

                                                // Polilínea cerrada
                                                if (o is acDb.Polyline plDef && plDef.Closed)
                                                {
                                                    double a = plDef.Area;
                                                    if (a > areaMax) areaMax = a;
                                                    continue;
                                                }

                                                // Elipse cerrada
                                                if (o is acDb.Ellipse elDef && elDef.Closed)
                                                {
                                                    double a = Math.PI * elDef.MajorRadius * elDef.MinorRadius;
                                                    if (a > areaMax) areaMax = a;
                                                    continue;
                                                }
                                            }

                                            tr.Commit();
                                        }

                                        if (areaMax > 1e-9)
                                            return Math.Round(areaMax * areaScale, 2);

                                    }
                                }
                                catch
                                {
                                    // si algo falla, caemos al bbox
                                }

                                // Fallback bbox (igual que antes)
                                var extA = br.GeometricExtents;
                                double dxA = Math.Abs(extA.MaxPoint.X - extA.MinPoint.X);
                                double dyA = Math.Abs(extA.MaxPoint.Y - extA.MinPoint.Y);
                                return Math.Round(dxA * dyA, 2);
                            }

                            // Otros → aproximar con bbox en XY (igual que antes)
                            {
                                var extA = ent.GeometricExtents;
                                double dxA = Math.Abs(extA.MaxPoint.X - extA.MinPoint.X);
                                double dyA = Math.Abs(extA.MaxPoint.Y - extA.MinPoint.Y);
                                return Math.Round(dxA * dyA, 2);
                            }

                        }

                    // ===== LONGITUD: usar longitud real del objeto en XY =====
                    case FrmSicoePresupuesto.TipoEntidad.Longitud:
                        if (ent is acDb.Curve cv)
                        {
                            double startDist = cv.GetDistanceAtParameter(cv.StartParam);
                            double endDist = cv.GetDistanceAtParameter(cv.EndParam);
                            return Math.Round(Math.Abs(endDist - startDist), 2);
                        }

                        // Si no es curva (por ejemplo un bloque), aproximar con la diagonal del bbox
                        {
                            var extL = ent.GeometricExtents;
                            double dxL = Math.Abs(extL.MaxPoint.X - extL.MinPoint.X);
                            double dyL = Math.Abs(extL.MaxPoint.Y - extL.MinPoint.Y);
                            return Math.Round(Math.Sqrt(dxL * dxL + dyL * dyL), 2);
                        }

                    // ===== NODO: no mostramos dimensión =====
                    case FrmSicoePresupuesto.TipoEntidad.Nodo:
                        return 0.0;

                    default:
                        return 0.0;
                }
            }
            catch
            {
                return 0.0;
            }
        }

        private bool EntidadCoincideConTipo(acDb.DBObject obj, FrmSicoePresupuesto.TipoEntidad tipo)
        {
            if (obj is not acDb.Entity ent) return false;

            switch (tipo)
            {
                case FrmSicoePresupuesto.TipoEntidad.Area:
                    return (ent is acDb.Polyline pl && pl.Closed)
                           || ent is acDb.Circle
                           || (ent is acDb.Ellipse el && el.Closed)
                           || ent is acDb.BlockReference;

                case FrmSicoePresupuesto.TipoEntidad.Longitud:
                    return ent is acDb.Polyline
                           || ent is acDb.Line
                           || ent is acDb.Polyline3d
                           || ent is acDb.BlockReference;

                case FrmSicoePresupuesto.TipoEntidad.Nodo:
                    if (_nodoAnalisisDetallado)
                        return ent is acDb.BlockReference; // Detallado: SOLO BLOQUES
                    return (ent is acDb.BlockReference)
                           || (ent is acDb.Polyline plN && plN.Closed); // Rápido: BLOQUE + POLILÍNEA CERRADA


                default:
                    return false;
            }
        }

        // ================== GRILLA / RESUMEN ==================

        private void RefrescarGrilla()
        {
            dgvEntidades.Rows.Clear();

            // Colores por grupo de duplicados (alternar)
            var grupos = _rows
                .Where(r => !string.IsNullOrWhiteSpace(r.DupGroup)) // cualquier fila dentro de grupo dup
                .Select(r => r.DupGroup)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(s => s)
                .ToList();

            var mapaColorGrupo = new Dictionary<string, System.Drawing.Color>(StringComparer.OrdinalIgnoreCase);
            for (int i = 0; i < grupos.Count; i++)
            {
                mapaColorGrupo[grupos[i]] = (i % 2 == 0)
                    ? System.Drawing.Color.FromArgb(255, 235, 238)   // rojo muy suave
                    : System.Drawing.Color.FromArgb(255, 243, 224);  // naranja muy suave
            }

            for (int i = 0; i < _rows.Count; i++)
            {
                var r = _rows[i];

                // IMPORTANTE:
                // Orden esperado de columnas:
                // 0 Del (checkbox)
                // 1 #
                // 2 PK_ID
                // 3 Tipo CAD
                // 4 Dimensión
                // 5 Abscisa
                // 6 Calzada
                // 7 Capa
                int rowIdx = dgvEntidades.Rows.Add(
                    r.MarkToDelete,
                    i + 1,
                    string.IsNullOrWhiteSpace(r.PkId) ? "—" : r.PkId,
                    r.TipoCad,
                    r.Dimension.ToString("0.##", CultureInfo.InvariantCulture),
                    string.IsNullOrWhiteSpace(r.Abscisa) ? "—" : r.Abscisa,
                    string.IsNullOrWhiteSpace(r.Calzada) ? "—" : r.Calzada,
                    string.IsNullOrWhiteSpace(r.LayerName) ? "—" : r.LayerName
                );

                var gridRow = dgvEntidades.Rows[rowIdx];
                gridRow.Tag = r; // vínculo real (anti-errores por orden/sort)

                // Pintar duplicadas por grupo
                if (!string.IsNullOrWhiteSpace(r.DupGroup)
                    && mapaColorGrupo.TryGetValue(r.DupGroup, out var c))
                {
                    gridRow.DefaultCellStyle.BackColor = c;
                    gridRow.DefaultCellStyle.ForeColor = System.Drawing.Color.Black;
                }
            }

            // Duplicados detectados = cualquier fila que pertenezca a un grupo duplicado
            int dupDetectadas = _rows.Count(r => !string.IsNullOrWhiteSpace(r.DupGroup));
            int dupMarcadas = _rows.Count(r => !string.IsNullOrWhiteSpace(r.DupGroup) && r.MarkToDelete);

            // IMPORTANTE (según lo que aclaraste):
            // AGREGAR es para agregar más entidades al listado. No debe bloquearse por duplicados.
            btnAgregar.Enabled = true;

            ActualizarResumen();

        }
        private void dgvEntidades_CurrentCellDirtyStateChanged(object? sender, EventArgs e)
        {
            // Esto hace que el click del checkbox se “confirme” al instante
            if (dgvEntidades.IsCurrentCellDirty)
                dgvEntidades.CommitEdit(DataGridViewDataErrorContexts.Commit);
        }
        private void dgvEntidades_CellValueChanged(object? sender, DataGridViewCellEventArgs e)
        {
            // Solo nos interesa la columna 0 = Del
            if (e.RowIndex < 0) return;
            if (e.ColumnIndex != 0) return;

            var gr = dgvEntidades.Rows[e.RowIndex];
            if (gr?.Tag is not RowInfo ri) return;

            bool marcado = false;
            try
            {
                var v = gr.Cells[0].Value;
                if (v is bool b) marcado = b;
                else if (v != null && bool.TryParse(v.ToString(), out var bb)) marcado = bb;
            }
            catch { }

            ri.MarkToDelete = marcado;

            // Recalcular checkbox maestro sin disparar loops raros
            if (_rows.Count > 0)
            {
                var all = _rows.All(r => r.MarkToDelete);
                if (chkSeleccionarTodo.Checked != all)
                    chkSeleccionarTodo.Checked = all;
            }

            // Actualiza el resumen también (opcional pero recomendado)
            ActualizarResumen();
        }
        private void ActualizarResumen()
        {
            int dupDetectadas = _rows.Count(x => !string.IsNullOrWhiteSpace(x.DupGroup));
            int dupMarcadas = _rows.Count(x => !string.IsNullOrWhiteSpace(x.DupGroup) && x.MarkToDelete);

            lblResumen.Text =
                $"Entidades en la lista: {_rows.Count}    |    " +
                $"Duplicadas detectadas: {dupDetectadas}    |    " +
                $"Duplicadas marcadas (Del): {dupMarcadas}";

            if (_rows.Count == 0)
            {
                chkSeleccionarTodo.Checked = false;
                chkSeleccionarTodo.Enabled = false;
            }
            else
            {
                chkSeleccionarTodo.Enabled = true;

                var all = _rows.All(r => r.MarkToDelete);
                if (chkSeleccionarTodo.Checked != all)
                    chkSeleccionarTodo.Checked = all;
            }
        }


        // ================== BOTONES ==================

        private void btnAgregar_Click(object sender, EventArgs e)
        {

            var doc = acApp.Application.DocumentManager.MdiActiveDocument;
            if (doc == null) return;

            var ed = doc.Editor;
            var db = doc.Database;

            var pso = new acEd.PromptSelectionOptions
            {
                MessageForAdding = "\nSeleccione entidades adicionales y ENTER...",
                AllowSubSelections = true,
                SingleOnly = false,
                RejectObjectsFromNonCurrentSpace = true
            };

            var res = ed.GetSelection(pso);
            if (res.Status != acEd.PromptStatus.OK || res.Value == null) return;

            using (var tr = db.TransactionManager.StartTransaction())
            {
                foreach (var id in res.Value.GetObjectIds())
                {
                    try
                    {
                        if (id.IsNull) continue;
                        if (!id.IsValid) continue;
                        if (id.IsErased) continue;
                        if (id.Database != db) continue;

                        if (_rows.Any(r => r.Id == id)) continue;

                        acDb.DBObject? obj = null;
                        try
                        {
                            obj = tr.GetObject(id, acDb.OpenMode.ForRead, false, true);
                        }
                        catch (Autodesk.AutoCAD.Runtime.Exception ex) when (ex.ErrorStatus == Autodesk.AutoCAD.Runtime.ErrorStatus.WasErased)
                        {
                            continue;
                        }

                        if (obj == null) continue;

                        if (!EntidadCoincideConTipo(obj, _tipo))
                            continue;

                        if (obj is not acDb.Entity ent) continue;

                        var info = ConstruirRowInfo(ent, id);
                        _rows.Add(info);
                    }
                    catch
                    {
                        // Saltar id problemático
                    }
                }

                tr.Commit();
            }
            DetectarYMarcarDuplicados();
            RefrescarGrilla();
        }

        private void btnQuitar_Click(object sender, EventArgs e)
        {
            // Leer “marcadas” directamente de la grilla (NO SelectedRows)
            // Esto garantiza que se borra lo que el usuario marcó, no otra cosa.
            var marcadas = new List<RowInfo>();

            foreach (DataGridViewRow gr in dgvEntidades.Rows)
            {
                if (gr == null) continue;

                bool marcado = false;
                try
                {
                    var v = gr.Cells[0].Value; // colDel es la primera
                    if (v is bool b) marcado = b;
                    else if (v != null && bool.TryParse(v.ToString(), out var bb)) marcado = bb;
                }
                catch { }

                if (!marcado) continue;

                if (gr.Tag is RowInfo ri)
                    marcadas.Add(ri);
            }

            if (marcadas.Count == 0)
            {
                MessageBox.Show(this,
                    "No hay filas marcadas para eliminar.\n\nMarca la columna 'Del' en las entidades que deseas quitar.",
                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            var ask = MessageBox.Show(this,
                $"Se van a eliminar {marcadas.Count} entidades del listado.\n\n¿Continuar?",
                "SICOE", MessageBoxButtons.YesNo, MessageBoxIcon.Question);

            if (ask != DialogResult.Yes) return;

            // Eliminar de _rows por ObjectId (robusto)
            var set = new HashSet<acDb.ObjectId>(marcadas.Select(x => x.Id));
            int before = _rows.Count;

            _rows.RemoveAll(x => set.Contains(x.Id));

            int removed = before - _rows.Count;

            // Recalcular duplicados (porque cambian los grupos)
            DetectarYMarcarDuplicados();
            RefrescarGrilla();

            MessageBox.Show(this,
                $"Eliminadas: {removed}\nRestantes: {_rows.Count}\nDuplicadas detectadas: {_rows.Count(x => x.IsDuplicate)}",
                "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private void btnRestablecerDuplicados_Click(object sender, EventArgs e)
        {
            if (_rows.Count == 0)
                return;

            var ask = MessageBox.Show(this,
                "Se restablecerá la selección automática de duplicados:\n\n" +
                "- Duplicados quedarán marcados (Del)\n" +
                "- Entidades únicas quedarán desmarcadas\n\n" +
                "¿Deseas continuar?",
                "SICOE",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question);

            if (ask != DialogResult.Yes)
                return;

            DetectarYMarcarDuplicados();
            RefrescarGrilla();
        }

        private void btnAceptar_Click(object sender, EventArgs e)
        {
            if (_rows.Count == 0)
            {
                MessageBox.Show(this,
                    "No hay entidades en la lista.",
                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Information);

                // IMPORTANTE:
                // No cierres el gestor por una validación.
                // Solo regresas al formulario para que el usuario corrija.
                return;
            }

            // Forzar commit del último checkbox tocado
            try { dgvEntidades.EndEdit(); } catch { }
            try { dgvEntidades.CommitEdit(DataGridViewDataErrorContexts.Commit); } catch { }

            int dupDetectadas = _rows.Count(r => !string.IsNullOrWhiteSpace(r.DupGroup));
            int dupMarcadas = _rows.Count(r => !string.IsNullOrWhiteSpace(r.DupGroup) && r.MarkToDelete);

            // Si hay duplicados, SOLO avisar y NO cerrar (te quedas en el gestor)
            if (dupDetectadas > 0)
            {
                MessageBox.Show(this,
                    "Aún existen entidades en grupos duplicados dentro del listado.\n\n" +
                    $"Duplicadas detectadas (en grupo): {dupDetectadas}\n" +
                    $"Marcadas para borrar (Del): {dupMarcadas}\n\n" +
                    "Acción requerida:\n" +
                    "- Si vas a depurar, usa 'Quitar DUP' antes de Aceptar.\n" +
                    "- Si son duplicados controlados, desmarca 'Del' en las que NO quieras borrar.\n\n" +
                    "No se enviará la selección hasta que resuelvas los duplicados.",
                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Warning);

                return; // clave: no tocar DialogResult, no Close()
            }

            // Solo aquí (cuando TODO está OK) se cierra y se devuelve la selección
            this.DialogResult = DialogResult.OK;
        }
        private void btnUnificarCapa_Click(object sender, EventArgs e)
        {
            if (_rows.Count == 0)
            {
                MessageBox.Show(this,
                    "No hay entidades en la lista.",
                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            // Forzar commit del último checkbox tocado (por si decides operar sobre marcadas)
            try { dgvEntidades.EndEdit(); } catch { }
            try { dgvEntidades.CommitEdit(DataGridViewDataErrorContexts.Commit); } catch { }

            // === MODO DE APLICACIÓN ===
            // true  => solo aplica a las marcadas "Del"
            // false => aplica a TODO el listado
            bool soloMarcadasDel = false;

            // 1) Determinar objetivo
            List<RowInfo> objetivo;
            if (soloMarcadasDel)
                objetivo = _rows.Where(r => r.MarkToDelete).ToList();
            else
                objetivo = _rows.ToList();

            if (objetivo.Count == 0)
            {
                MessageBox.Show(this,
                    "No hay entidades objetivo.\n\n" +
                    (soloMarcadasDel
                        ? "Marca 'Del' en las entidades a las que deseas unificar la capa."
                        : "La lista está vacía."),
                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            // 2) Pedir capa destino (simple y robusto)
            // Usa un InputBox-like (Microsoft.VisualBasic) o tu propio mini-form.
            // Aquí lo dejo con InputBox para que quede inmediato.
            string capaDestino = Microsoft.VisualBasic.Interaction.InputBox(
                "Escribe el nombre de la capa destino.\n\n" +
                "Sugerencia: usa un nombre estándar del proyecto.\n" +
                "Ejemplo: 3PAVI_IDU_3.01_UNIFICADO",
                "SICOE - Unificar capa",
                "");

            capaDestino = (capaDestino ?? "").Trim();

            if (string.IsNullOrWhiteSpace(capaDestino))
                return; // Cancelado: no hace nada, vuelve al gestor

            // 3) Aplicar en AutoCAD (cambiar Layer de entidades)
            var doc = acApp.Application.DocumentManager.MdiActiveDocument;
            if (doc == null) return;

            var db = doc.Database;

            int cambiadas = 0;
            int noEncontradas = 0;

            using (doc.LockDocument())
            using (var tr = db.TransactionManager.StartTransaction())
            {
                // 3.1 Crear capa si no existe
                var lt = (acDb.LayerTable)tr.GetObject(db.LayerTableId, acDb.OpenMode.ForRead);
                if (!lt.Has(capaDestino))
                {
                    lt.UpgradeOpen();
                    var ltr = new acDb.LayerTableRecord { Name = capaDestino };
                    lt.Add(ltr);
                    tr.AddNewlyCreatedDBObject(ltr, true);
                }

                // 3.2 Cambiar layer
                foreach (var r in objetivo)
                {
                    if (r.Id.IsNull || !r.Id.IsValid)
                    {
                        noEncontradas++;
                        continue;
                    }

                    try
                    {
                        var obj = tr.GetObject(r.Id, acDb.OpenMode.ForWrite, false, true) as acDb.Entity;
                        if (obj == null) { noEncontradas++; continue; }

                        if (!string.Equals(obj.Layer, capaDestino, StringComparison.OrdinalIgnoreCase))
                        {
                            obj.Layer = capaDestino;
                            cambiadas++;
                        }

                        // Mantener coherencia en el modelo (grilla)
                        r.LayerName = capaDestino;
                    }
                    catch
                    {
                        noEncontradas++;
                    }
                }

                tr.Commit();
            }

            // 4) Refrescar grilla para mostrar capa unificada
            RefrescarGrilla();

            MessageBox.Show(this,
                $"Capa destino: {capaDestino}\n" +
                $"Entidades objetivo: {objetivo.Count}\n" +
                $"Cambiadas: {cambiadas}\n" +
                $"No procesadas: {noEncontradas}",
                "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }


        private void btnQuitarDuplicadas_Click(object sender, EventArgs e)
        {
            if (_rows.Count == 0) return;

            // Forzar commit del último checkbox tocado
            try { dgvEntidades.EndEdit(); } catch { }
            try { dgvEntidades.CommitEdit(DataGridViewDataErrorContexts.Commit); } catch { }

            // 1) Candidatas a borrar = pertenezco a un grupo duplicado + marcado Del
            var candidatas = _rows
                .Where(r => !string.IsNullOrWhiteSpace(r.DupGroup) && r.MarkToDelete && r.Id.IsValid && !r.Id.IsNull)
                .ToList();

            if (candidatas.Count == 0)
            {
                MessageBox.Show(this,
                    "No hay duplicadas marcadas para eliminar.\n\nMarca la columna 'Del' en las entidades que deseas borrar.",
                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            // 2) Validación: no permitir borrar TODO un grupo (debe quedar al menos 1 por grupo)
            var gruposInvalidos = _rows
                .Where(r => !string.IsNullOrWhiteSpace(r.DupGroup))
                .GroupBy(r => r.DupGroup, StringComparer.OrdinalIgnoreCase)
                .Where(g =>
                {
                    int total = g.Count();
                    int marcadas = g.Count(x => x.MarkToDelete);
                    return (marcadas >= total); // están marcando todo el grupo
                })
                .Select(g => g.Key)
                .OrderBy(x => x)
                .ToList();

            if (gruposInvalidos.Count > 0)
            {
                MessageBox.Show(this,
                    "Hay grupos donde marcaste TODO para borrar.\n" +
                    "Debe quedar al menos 1 entidad por cada grupo duplicado.\n\n" +
                    "Grupos: " + string.Join(", ", gruposInvalidos),
                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            var idsBorrar = candidatas.Select(x => x.Id).ToHashSet();

            var ask = MessageBox.Show(this,
                $"Se eliminarán {idsBorrar.Count} entidades marcadas como duplicadas:\n" +
                "- Se borrarán del DIBUJO (Erase)\n" +
                "- Y se quitarán del LISTADO\n\n¿Continuar?",
                "SICOE", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);

            if (ask != DialogResult.Yes) return;

            // 3) Borrar en el dibujo
            int borradasDibujo = BorrarEntidadesDelDibujo(idsBorrar);

            // 4) Quitar del listado
            int before = _rows.Count;
            _rows.RemoveAll(r => idsBorrar.Contains(r.Id));
            int removidasLista = before - _rows.Count;

            // 5) Recalcular duplicados y refrescar
            DetectarYMarcarDuplicados();
            RefrescarGrilla();

            MessageBox.Show(this,
                $"Duplicadas solicitadas: {idsBorrar.Count}\n" +
                $"Borradas del dibujo: {borradasDibujo}\n" +
                $"Quitadas del listado: {removidasLista}\n" +
                $"Restantes en lista: {_rows.Count}",
                "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private void btnSeparar_Click(object sender, EventArgs e)
        {
            // 0) Confirmación (SI/NO)
            var ask = MessageBox.Show(this,
                "Vas a SEPARAR las entidades por límites de PK_ID.\n\n" +
                "Esto REEMPLAZARÁ las entidades originales por nuevas secciones/áreas segmentadas.\n" +
                "Al finalizar, la lista se limpiará y tendrás que agregarlas nuevamente.\n\n" +
                "¿Estás seguro de continuar?",
                "SICOE - Confirmar separación",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning,
                MessageBoxDefaultButton.Button2);

            if (ask != DialogResult.Yes)
                return; // NO = no hace nada, retorna al formulario

            // 1) Validación: hay entidades
            if (_rows.Count == 0)
            {
                MessageBox.Show(this, "No hay entidades en la lista.", "SICOE",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            var idsObjetivo = _rows
                .Select(r => r.Id)
                .Where(id => id.IsValid && !id.IsNull)
                .ToList();

            var doc = acApp.Application.DocumentManager.MdiActiveDocument;
            if (doc == null) return;
            var db = doc.Database;

            int cortadas = 0;
            bool huboErrores = false;
            var errores = new List<string>();

            using (doc.LockDocument())
            using (var tr = db.TransactionManager.StartTransaction())
            {
                // 1) Regiones PK_ID (solo SICOE_PK)
                var pkRegions = PkRegionCutter.GetPkRegions(db, tr);
                if (pkRegions.Count == 0)
                {
                    MessageBox.Show(this,
                        "No se encontraron regiones PK_ID (SICOE_PK) en el dibujo.\n\n" +
                        "Crea/carga las regiones PK_ID y vuelve a intentar.",
                        "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }

                // 2) Curvas de borde para cortar curvas abiertas
                var pkBoundaries = PkRegionCutter.BuildPkBoundaryCurves(pkRegions);

                // ModelSpace ForWrite
                var btr = (acDb.BlockTableRecord)tr.GetObject(db.CurrentSpaceId, acDb.OpenMode.ForWrite);

                foreach (var id in idsObjetivo)
                {
                    try
                    {
                        var entR = tr.GetObject(id, acDb.OpenMode.ForRead, false, true) as acDb.Entity;
                        if (entR == null) continue;

                        // Regla: no cortar bloques
                        if (entR is acDb.BlockReference) continue;

                        // =========================
                        // A) ÁREAS: polilínea cerrada
                        // =========================
                        if (entR is acDb.Polyline plR && plR.Closed)
                        {
                            // CLAVE: trabajamos sobre un CLONE (no DB-resident)
                            var plClone = (acDb.Polyline)plR.Clone();

                            // Calcula nuevas áreas (polilíneas cerradas medibles)
                            var nuevasAreas = PkRegionCutter.SplitClosedPolylineIntoPkAreas(db, tr, plClone, pkRegions);

                            // OJO: el clone ya no se necesita
                            plClone.Dispose();

                            if (nuevasAreas != null && nuevasAreas.Count > 1)
                            {
                                // Copiar propiedades ANTES de borrar
                                // (porque después del Erase algunas APIs se vuelven inestables)
                                var propsSource = plR; // entR aún está ForRead y NO está borrada

                                // Ahora sí abrimos ForWrite para borrar
                                var plW = tr.GetObject(id, acDb.OpenMode.ForWrite, false, true) as acDb.Polyline;
                                if (plW == null)
                                {
                                    // liberar lo creado si no pudimos abrir
                                    foreach (var neo in nuevasAreas) neo?.Dispose();
                                    continue;
                                }

                                // Reemplazar: borrar original
                                plW.Erase(true);

                                // Insertar nuevas polilíneas cerradas conservando propiedades
                                foreach (var neo in nuevasAreas)
                                {
                                    if (neo == null) continue;
                                    PkRegionCutter.CopyEntityProperties(propsSource, neo);
                                    btr.AppendEntity(neo);
                                    tr.AddNewlyCreatedDBObject(neo, true);
                                }

                                cortadas++;
                            }
                            else
                            {
                                // si el cutter creó 0/1, debe liberar (por si devuelve lista con 1)
                                if (nuevasAreas != null)
                                    foreach (var neo in nuevasAreas) neo?.Dispose();
                            }

                            continue;
                        }

                        // =========================
                        // B) CURVAS: línea, polilínea abierta, arco, spline, etc.
                        // =========================
                        if (entR is acDb.Curve cvR)
                        {
                            // CLAVE: trabajar sobre CLONE
                            var cvClone = (acDb.Curve)cvR.Clone();

                            var nuevosSegs = PkRegionCutter.SplitCurveByPkBoundaries(db, tr, cvClone, pkBoundaries);
                            System.Diagnostics.Debug.WriteLine(
                                $"[SICOE][Split] Ent {id.Handle} -> intersecciones => segmentos: {(nuevosSegs == null ? 0 : nuevosSegs.Count)}");


                            cvClone.Dispose();

                            if (nuevosSegs != null && nuevosSegs.Count > 1)
                            {
                                var propsSource = cvR; // todavía existe

                                var cvW = tr.GetObject(id, acDb.OpenMode.ForWrite, false, true) as acDb.Curve;
                                if (cvW == null)
                                {
                                    foreach (var neo in nuevosSegs) neo?.Dispose();
                                    continue;
                                }

                                cvW.Erase(true);

                                foreach (var neo in nuevosSegs)
                                {
                                    if (neo == null) continue;
                                    PkRegionCutter.CopyEntityProperties(propsSource, neo);
                                    btr.AppendEntity(neo);
                                    tr.AddNewlyCreatedDBObject(neo, true);
                                }

                                cortadas++;
                            }
                            else
                            {
                                if (nuevosSegs != null)
                                    foreach (var neo in nuevosSegs) neo?.Dispose();
                            }

                            continue;
                        }

                        // Otros tipos: no se tocan
                    }
                    catch (Autodesk.AutoCAD.Runtime.Exception ex)
                    {
                        huboErrores = true;
                        errores.Add($"Handle/Id {id.Handle}: {ex.ErrorStatus}");
                    }
                    catch (Exception ex)
                    {
                        huboErrores = true;
                        errores.Add($"Handle/Id {id.Handle}: {ex.Message}");
                    }
                }

                // liberar contornos clonados
                foreach (var c in pkBoundaries) c.Dispose();

                tr.Commit();
            }

            if (cortadas > 0)
            {
                _rows.Clear();
                RefrescarGrilla();

                MessageBox.Show(this,
                    "Las entidades que has seleccionado se han actualizado y no tienen la misma dimensión.\n\n" +
                    "Agrégalas nuevamente",
                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            else
            {
                var msg =
                    "No se detectaron cruces reales con límites PK_ID.\n\n" +
                    "Nota: si la entidad solo TOCA el borde (no lo cruza), no se modifica (regla aplicada).";

                if (huboErrores)
                {
                    msg += "\n\nSe detectaron errores en algunas entidades.";
                    // si quieres verlas en debug:
                    System.Diagnostics.Debug.WriteLine(string.Join("\n", errores));
                }

                MessageBox.Show(this, msg, "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }



        private int BorrarEntidadesDelDibujo(HashSet<acDb.ObjectId> ids)
        {
            if (ids == null || ids.Count == 0) return 0;

            var doc = acApp.Application.DocumentManager.MdiActiveDocument;
            if (doc == null) return 0;

            var db = doc.Database;
            var ed = doc.Editor;
            int borradas = 0;
            int errores = 0;

            using (doc.LockDocument())
            {
                using (var tr = db.TransactionManager.StartTransaction())
                {
                    foreach (var id in ids)
                    {
                        if (id.IsNull || !id.IsValid)
                        {
                            errores++;
                            continue;
                        }

                        try
                        {
                            var obj = tr.GetObject(id, acDb.OpenMode.ForWrite, false, true);
                            if (obj == null)
                            {
                                errores++;
                                continue;
                            }

                            // Evitar doble borrado
                            if (!obj.IsErased)
                            {
                                obj.Erase(true);
                                borradas++;
                            }
                        }
                        catch (System.Exception ex)
                        {
                            // Log del error (opcional, para debugging)
                            System.Diagnostics.Debug.WriteLine($"Error borrando entidad {id}: {ex.Message}");
                            errores++;
                        }
                    }

                    tr.Commit();
                }

                // CRÍTICO: Regenerar la vista para que el usuario VEA los cambios
                try
                {
                    ed.Regen();
                }
                catch
                {
                    // Si falla el regen, intentar con UpdateScreen
                    try { ed.UpdateScreen(); } catch { }
                }
            }

            // Log de diagnóstico
            if (errores > 0)
            {
                System.Diagnostics.Debug.WriteLine($"Borrado completado: {borradas} exitosas, {errores} errores");
            }

            return borradas;
        }
        private void chkSeleccionarTodo_CheckedChanged(object sender, EventArgs e)
        {
            bool marcar = chkSeleccionarTodo.Checked;

            foreach (DataGridViewRow gr in dgvEntidades.Rows)
            {
                if (gr == null) continue;

                // Columna 0 = Del
                gr.Cells[0].Value = marcar;

                // Mantener sincronizado el modelo
                if (gr.Tag is RowInfo ri)
                {
                    ri.MarkToDelete = marcar;
                }
            }
        }

        // ================== DOBLE CLICK → ZOOM ==================

        private void dgvEntidades_CellDoubleClick(object sender, DataGridViewCellEventArgs e)
        {
            if (e.RowIndex < 0 || e.RowIndex >= _rows.Count) return;

            var row = _rows[e.RowIndex];
            ZoomToEntity(row.Id);
        }
        private void ZoomToEntity(acDb.ObjectId id)
        {
            if (id.IsNull || !id.IsValid) return;

            var doc = acApp.Application.DocumentManager.MdiActiveDocument;
            if (doc == null) return;

            var db = doc.Database;
            var ed = doc.Editor;

            using (doc.LockDocument())
            using (var tr = db.TransactionManager.StartTransaction())
            {
                try
                {
                    // 1) Quitar resaltado anterior (si la entidad sigue existiendo)
                    if (!_lastEntId.IsNull && _lastEntId.IsValid)
                    {
                        try
                        {
                            var prevEnt = tr.GetObject(
                                _lastEntId,
                                acDb.OpenMode.ForRead,
                                false, true) as acDb.Entity;

                            prevEnt?.Unhighlight();
                        }
                        catch
                        {
                            // La entidad pudo haber sido borrada → ignorar
                        }
                    }

                    // 2) Obtener la entidad actual
                    var ent = tr.GetObject(
                        id,
                        acDb.OpenMode.ForRead,
                        false, true) as acDb.Entity;

                    if (ent == null)
                    {
                        tr.Commit();
                        return;
                    }

                    _lastEntId = id;

                    // 3) Resaltar la entidad actual
                    try { ent.Highlight(); } catch { }

                    // 4) Obtener extents y aplicar el MISMO zoom que en FrmPkFixerDescartados
                    acDb.Extents3d ext;
                    try
                    {
                        ext = ent.GeometricExtents;
                    }
                    catch
                    {
                        tr.Commit();
                        return;
                    }

                    ZoomToExtents(ed, ext);
                }
                catch (Autodesk.AutoCAD.Runtime.Exception ex)
                {
                    System.Diagnostics.Debug.WriteLine("ZoomToEntity ACAD EX: " + ex.Message);
                }
                catch (Exception ex)
                {
                    System.Diagnostics.Debug.WriteLine("ZoomToEntity EX: " + ex.Message);
                }

                tr.Commit();
            }
        }

        private static void ZoomToExtents(acEd.Editor ed, acDb.Extents3d ext)
        {
            const double factor = 2.5; // margen, igual que en FrmPkFixerDescartados

            using (var view = ed.GetCurrentView())
            {
                // Matriz de WCS a coordenadas de la cámara (Eye coordinates)
                var wc2ec = acGeo.Matrix3d.PlaneToWorld(view.ViewDirection);
                wc2ec = acGeo.Matrix3d.Displacement(view.Target - acGeo.Point3d.Origin) * wc2ec;
                wc2ec = acGeo.Matrix3d.Rotation(
                            -view.ViewTwist,
                            view.ViewDirection,
                            view.Target) * wc2ec;

                // Transformar extents a coordenadas de la vista
                var extEc = ext;
                extEc.TransformBy(wc2ec.Inverse());

                var min = extEc.MinPoint;
                var max = extEc.MaxPoint;

                double width = (max.X - min.X) * factor;
                double height = (max.Y - min.Y) * factor;

                // Evitar tamaños nulos
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

        // ================== ABS SIMPLE PARA LA GRILLA ==================

        private bool TryComputeAbsIniFin(
            Autodesk.AutoCAD.DatabaseServices.Entity ent,
            AxisContext ctx,
            char prefCalz,
            out string absIni,
            out string absFin,
            out bool dentro,
            out string calzadaOut)
        {
            absIni = "";
            absFin = "";
            dentro = false;
            calzadaOut = "";

            if (ent == null || ctx == null || ctx.AxisA.IsNull)
                return false;

            var doc = Autodesk.AutoCAD.ApplicationServices.Application.DocumentManager.MdiActiveDocument;
            if (doc == null) return false;

            var db = doc.Database;

            // =========================================================
            // 1) Puntos representativos (extremos reales)
            //    FIX CLAVE: Bloques -> centro geométrico (bbox), NO insertion point.
            // =========================================================
            List<Autodesk.AutoCAD.Geometry.Point3d> pts = new();

            using (var tr = db.TransactionManager.StartTransaction())
            {
                try
                {
                    switch (ent)
                    {
                        case Autodesk.AutoCAD.DatabaseServices.Line ln:
                            pts.Add(new Autodesk.AutoCAD.Geometry.Point3d(ln.StartPoint.X, ln.StartPoint.Y, 0));
                            pts.Add(new Autodesk.AutoCAD.Geometry.Point3d(ln.EndPoint.X, ln.EndPoint.Y, 0));
                            break;

                        case Autodesk.AutoCAD.DatabaseServices.Polyline pl:
                            {
                                int n = pl.NumberOfVertices;
                                for (int i = 0; i < n; i++)
                                {
                                    var p = pl.GetPoint3dAt(i);
                                    pts.Add(new Autodesk.AutoCAD.Geometry.Point3d(p.X, p.Y, 0));
                                }

                                if (n > 0)
                                {
                                    var p0 = pl.GetPoint3dAt(0);
                                    var p1 = pl.GetPoint3dAt(n - 1);
                                    pts.Add(new Autodesk.AutoCAD.Geometry.Point3d(p0.X, p0.Y, 0));
                                    pts.Add(new Autodesk.AutoCAD.Geometry.Point3d(p1.X, p1.Y, 0));
                                }
                            }
                            break;

                        case Autodesk.AutoCAD.DatabaseServices.Polyline3d pl3:
                            foreach (Autodesk.AutoCAD.DatabaseServices.ObjectId vId in pl3)
                            {
                                if (tr.GetObject(vId, Autodesk.AutoCAD.DatabaseServices.OpenMode.ForRead) is Autodesk.AutoCAD.DatabaseServices.PolylineVertex3d vx)
                                {
                                    var p = vx.Position;
                                    pts.Add(new Autodesk.AutoCAD.Geometry.Point3d(p.X, p.Y, 0));
                                }
                            }
                            break;

                        case Autodesk.AutoCAD.DatabaseServices.DBPoint pt:
                            pts.Add(new Autodesk.AutoCAD.Geometry.Point3d(pt.Position.X, pt.Position.Y, 0));
                            break;

                        case Autodesk.AutoCAD.DatabaseServices.BlockReference br:
                            {
                                // FIX: centro geométrico real del bloque
                                var ext = br.GeometricExtents;
                                var mid = new Autodesk.AutoCAD.Geometry.Point3d(
                                    0.5 * (ext.MinPoint.X + ext.MaxPoint.X),
                                    0.5 * (ext.MinPoint.Y + ext.MaxPoint.Y),
                                    0.0);
                                pts.Add(mid);
                            }
                            break;

                        default:
                            try
                            {
                                var samples = AxisMath.SampleEntityPoints(ent, tr, 0.5);
                                foreach (var p in samples)
                                    pts.Add(new Autodesk.AutoCAD.Geometry.Point3d(p.X, p.Y, 0));
                            }
                            catch { }
                            break;
                    }
                }
                catch { }

                tr.Commit();
            }

            if (pts.Count == 0)
                return false;

            // Punto de referencia (centro de extents)
            Autodesk.AutoCAD.Geometry.Point3d pRef;
            try
            {
                var ext = ent.GeometricExtents;
                pRef = new Autodesk.AutoCAD.Geometry.Point3d(
                    0.5 * (ext.MinPoint.X + ext.MaxPoint.X),
                    0.5 * (ext.MinPoint.Y + ext.MaxPoint.Y),
                    0.0);
            }
            catch
            {
                pRef = pts[0];
            }

            using (var tr = db.TransactionManager.StartTransaction())
            {
                var ejeA = tr.GetObject(ctx.AxisA, Autodesk.AutoCAD.DatabaseServices.OpenMode.ForRead) as Autodesk.AutoCAD.DatabaseServices.Curve;
                Autodesk.AutoCAD.DatabaseServices.Curve? ejeB = null;

                if (ctx.IsDouble && !ctx.AxisB.IsNull)
                    ejeB = tr.GetObject(ctx.AxisB, Autodesk.AutoCAD.DatabaseServices.OpenMode.ForRead) as Autodesk.AutoCAD.DatabaseServices.Curve;

                if (ejeA == null)
                    return false;

                (bool ok, double pk, double signedOffset) Project(Autodesk.AutoCAD.DatabaseServices.Curve eje, double pk0dist, double absIniSector, Autodesk.AutoCAD.Geometry.Point3d p)
                {
                    try
                    {
                        var pFlat = new Autodesk.AutoCAD.Geometry.Point3d(p.X, p.Y, 0.0);
                        var proj = eje.GetClosestPointTo(pFlat, false);

                        double off = pFlat.DistanceTo(proj);

                        double par = eje.GetParameterAtPoint(proj);
                        var tan = eje.GetFirstDerivative(par);
                        var v = pFlat - proj;

                        double cross = tan.X * v.Y - tan.Y * v.X;
                        double signed = (cross > 0) ? off : -off;

                        double dist = eje.GetDistanceAtParameter(par);
                        double pk = dist - pk0dist + absIniSector;

                        return (true, pk, signed);
                    }
                    catch
                    {
                        return (false, 0, 0);
                    }
                }

                bool Inside(double signedOffset, double limI, double limD)
                {
                    if (signedOffset >= 0) return signedOffset <= limI;
                    return (-signedOffset) <= limD;
                }

                bool hasB = (ctx.IsDouble && ejeB != null);

                bool preferA = true;

                if (prefCalz == 'A') preferA = true;
                else if (prefCalz == 'B' && hasB) preferA = false;
                else
                {
                    var a = Project(ejeA, ctx.Pk0DistA, ctx.AbsInicioA, pRef);
                    bool inA = a.ok && Inside(a.signedOffset, ctx.OrdIzq_A, ctx.OrdDer_A);

                    if (!hasB)
                    {
                        preferA = true;
                    }
                    else
                    {
                        var b = Project(ejeB!, ctx.Pk0DistB, ctx.AbsInicioB, pRef);
                        bool inB = b.ok && Inside(b.signedOffset, ctx.OrdIzq_B, ctx.OrdDer_B);

                        if (inA && !inB) preferA = true;
                        else if (!inA && inB) preferA = false;
                        else if (inA && inB) preferA = Math.Abs(a.signedOffset) <= Math.Abs(b.signedOffset);
                        else preferA = Math.Abs(a.signedOffset) <= Math.Abs(b.signedOffset);
                    }
                }

                var eje = preferA ? ejeA : ejeB!;
                double pk0dist = preferA ? ctx.Pk0DistA : ctx.Pk0DistB;
                double absInicio = preferA ? ctx.AbsInicioA : ctx.AbsInicioB;
                double limI = preferA ? ctx.OrdIzq_A : ctx.OrdIzq_B;
                double limD = preferA ? ctx.OrdDer_A : ctx.OrdDer_B;

                // Salida coherente
                calzadaOut = preferA ? "A" : "B";

                double pkMin = double.MaxValue;
                double pkMax = double.MinValue;
                bool anyInside = false;

                foreach (var p in pts)
                {
                    var ev = Project(eje, pk0dist, absInicio, p);
                    if (!ev.ok) continue;

                    if (!Inside(ev.signedOffset, limI, limD))
                        continue;

                    anyInside = true;
                    pkMin = Math.Min(pkMin, ev.pk);
                    pkMax = Math.Max(pkMax, ev.pk);
                }

                if (!anyInside || pkMin == double.MaxValue || pkMax == double.MinValue)
                    return false;

                if (pkMin > pkMax)
                {
                    var t = pkMin; pkMin = pkMax; pkMax = t;
                }

                absIni = PkFormatter.ToPkString(pkMin);
                absFin = PkFormatter.ToPkString(pkMax);
                dentro = true;

                tr.Commit();
                return true;
            }
        }
        private bool TryComputeAbsIniFin_Forced(
            acDb.Entity ent,
            AxisContext ctx,
            out string absIni,
            out string absFin,
            out string calzadaOut)
        {
            absIni = "";
            absFin = "";
            calzadaOut = "";

            if (ent == null || ctx == null || ctx.AxisA.IsNull)
                return false;

            var doc = acApp.Application.DocumentManager.MdiActiveDocument;
            if (doc == null) return false;

            var db = doc.Database;

            // Puntos representativos (mínimo 1)
            List<acGeo.Point3d> pts = new();

            using (var tr = db.TransactionManager.StartTransaction())
            {
                try
                {
                    switch (ent)
                    {
                        case acDb.Line ln:
                            pts.Add(new acGeo.Point3d(ln.StartPoint.X, ln.StartPoint.Y, 0));
                            pts.Add(new acGeo.Point3d(ln.EndPoint.X, ln.EndPoint.Y, 0));
                            break;

                        case acDb.Polyline pl:
                            {
                                int n = pl.NumberOfVertices;
                                for (int i = 0; i < n; i++)
                                {
                                    var p = pl.GetPoint3dAt(i);
                                    pts.Add(new acGeo.Point3d(p.X, p.Y, 0));
                                }
                                if (n > 0)
                                {
                                    var p0 = pl.GetPoint3dAt(0);
                                    var p1 = pl.GetPoint3dAt(n - 1);
                                    pts.Add(new acGeo.Point3d(p0.X, p0.Y, 0));
                                    pts.Add(new acGeo.Point3d(p1.X, p1.Y, 0));
                                }
                            }
                            break;

                        case acDb.Polyline3d pl3:
                            foreach (acDb.ObjectId vId in pl3)
                            {
                                if (tr.GetObject(vId, acDb.OpenMode.ForRead) is acDb.PolylineVertex3d vx)
                                {
                                    var p = vx.Position;
                                    pts.Add(new acGeo.Point3d(p.X, p.Y, 0));
                                }
                            }
                            break;

                        case acDb.Circle c:
                            pts.Add(new acGeo.Point3d(c.Center.X, c.Center.Y, 0));
                            break;

                        case acDb.Ellipse el:
                            pts.Add(new acGeo.Point3d(el.Center.X, el.Center.Y, 0));
                            break;

                        case acDb.DBPoint pt:
                            pts.Add(new acGeo.Point3d(pt.Position.X, pt.Position.Y, 0));
                            break;

                        case acDb.BlockReference br:
                            {
                                // centro geométrico real del bloque (bbox)
                                var ext = br.GeometricExtents;
                                pts.Add(new acGeo.Point3d(
                                    0.5 * (ext.MinPoint.X + ext.MaxPoint.X),
                                    0.5 * (ext.MinPoint.Y + ext.MaxPoint.Y),
                                    0.0));
                            }
                            break;

                        default:
                            // fallback: al menos centro del bbox
                            try
                            {
                                var ext = ent.GeometricExtents;
                                pts.Add(new acGeo.Point3d(
                                    0.5 * (ext.MinPoint.X + ext.MaxPoint.X),
                                    0.5 * (ext.MinPoint.Y + ext.MaxPoint.Y),
                                    0.0));
                            }
                            catch { }
                            break;
                    }
                }
                catch { }

                tr.Commit();
            }

            if (pts.Count == 0) return false;

            using (var tr = db.TransactionManager.StartTransaction())
            {
                var ejeA = tr.GetObject(ctx.AxisA, acDb.OpenMode.ForRead) as acDb.Curve;
                acDb.Curve? ejeB = null;

                if (ctx.IsDouble && !ctx.AxisB.IsNull)
                    ejeB = tr.GetObject(ctx.AxisB, acDb.OpenMode.ForRead) as acDb.Curve;

                if (ejeA == null) return false;

                // Proyección robusta a pk (sin offset firmado ni Inside)
                (bool ok, double pk) ProjectPk(acDb.Curve eje, double pk0dist, double absIniSector, acGeo.Point3d p)
                {
                    try
                    {
                        var pFlat = new acGeo.Point3d(p.X, p.Y, 0.0);
                        var proj = eje.GetClosestPointTo(pFlat, false);
                        double par = eje.GetParameterAtPoint(proj);
                        double dist = eje.GetDistanceAtParameter(par);
                        double pk = dist - pk0dist + absIniSector;
                        return (true, pk);
                    }
                    catch
                    {
                        return (false, 0);
                    }
                }

                // Elegir eje A/B por “menor distancia” usando pRef (centro bbox)
                acGeo.Point3d pRef;
                try
                {
                    var ext = ent.GeometricExtents;
                    pRef = new acGeo.Point3d(
                        0.5 * (ext.MinPoint.X + ext.MaxPoint.X),
                        0.5 * (ext.MinPoint.Y + ext.MaxPoint.Y),
                        0.0);
                }
                catch
                {
                    pRef = pts[0];
                }

                double DistToCurve(acDb.Curve eje, acGeo.Point3d p)
                {
                    try
                    {
                        var pFlat = new acGeo.Point3d(p.X, p.Y, 0.0);
                        var proj = eje.GetClosestPointTo(pFlat, false);
                        return pFlat.DistanceTo(proj);
                    }
                    catch { return double.MaxValue; }
                }

                bool useA = true;
                if (ejeB != null)
                {
                    double dA = DistToCurve(ejeA, pRef);
                    double dB = DistToCurve(ejeB, pRef);
                    useA = dA <= dB;
                }

                var eje = useA ? ejeA : ejeB!;
                double pk0 = useA ? ctx.Pk0DistA : ctx.Pk0DistB;
                double absInicio = useA ? ctx.AbsInicioA : ctx.AbsInicioB;
                calzadaOut = useA ? "A" : "B";

                double pkMin = double.MaxValue;
                double pkMax = double.MinValue;
                bool any = false;

                foreach (var p in pts)
                {
                    var r = ProjectPk(eje, pk0, absInicio, p);
                    if (!r.ok) continue;

                    any = true;
                    pkMin = Math.Min(pkMin, r.pk);
                    pkMax = Math.Max(pkMax, r.pk);
                }

                if (!any) return false;

                if (pkMin > pkMax) { var t = pkMin; pkMin = pkMax; pkMax = t; }

                absIni = PkFormatter.ToPkString(pkMin);
                absFin = PkFormatter.ToPkString(pkMax);

                tr.Commit();
                return true;
            }
        }


        private void LimpiarResaltadoTemporal()
        {
            var doc = acApp.Application.DocumentManager.MdiActiveDocument;
            if (doc == null) return;

            var db = doc.Database;

            using (doc.LockDocument())
            using (var tr = db.TransactionManager.StartTransaction())
            {
                try
                {
                    if (!_lastEntId.IsNull)
                    {
                        if (tr.GetObject(_lastEntId, acDb.OpenMode.ForRead, false, true) is acDb.Entity entPrev)
                        {
                            entPrev.Unhighlight();
                        }
                    }
                }
                catch
                {
                    // ignoramos errores tipo eNotInDatabase, etc.
                }
                finally
                {
                    _lastEntId = acDb.ObjectId.Null;
                }

                tr.Commit();
            }
        }
        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            LimpiarResaltadoTemporal();
            base.OnFormClosed(e);
        }

        // ==========================================================
        // DUPLICADOS: firma geométrica con tolerancia + agrupación
        //  - Marca TODAS las duplicadas (menos 1 por grupo) como:
        //      IsDuplicate = true
        //      MarkToDelete = true (por defecto)
        //  - El usuario decide qué dejar (desmarca / marca)
        // ==========================================================
        private void DetectarYMarcarDuplicados()
        {
            // Limpia flags
            foreach (var r in _rows)
            {
                r.IsDuplicate = false;
                r.DupGroup = "";
                r.Signature = "";
                // MarkToDelete solo se asigna si cae en un grupo duplicado
            }

            var doc = acApp.Application.DocumentManager.MdiActiveDocument;
            if (doc == null) return;

            var db = doc.Database;

            // ==========================================================
            // TOLERANCIAS (AJUSTA A TU REALIDAD)
            // ==========================================================
            const double TOL_DIST = 0.01; // 1 cm
            const double TOL_DIM = 0.01;  // 0.01 si muestras 2 decimales
            const double GRID = 0.05;     // 5 cm (solo para agrupar candidatos)
            const bool INCLUDE_Z = false;
            const double TOL_Z = 0.02;

            long Bin(double v, double cell) => (long)Math.Round(v / cell);

            double DimNorm(double d) => Math.Round(d / TOL_DIM) * TOL_DIM;

            bool SameDim(double d1, double d2) => DimNorm(d1).Equals(DimNorm(d2));

            bool SameCoord(acGeo.Point3d a, acGeo.Point3d b)
            {
                var dx = a.X - b.X;
                var dy = a.Y - b.Y;
                var dist2 = (dx * dx) + (dy * dy);

                if (dist2 > (TOL_DIST * TOL_DIST)) return false;

                if (INCLUDE_Z)
                {
                    if (Math.Abs(a.Z - b.Z) > TOL_Z) return false;
                }
                return true;
            }

            string GridKey(acGeo.Point3d p, double dim)
            {
                var bx = Bin(p.X, GRID);
                var by = Bin(p.Y, GRID);
                var dNorm = Math.Round(dim / TOL_DIM);

                if (!INCLUDE_Z)
                    return $"{_tipo}|{bx}|{by}|D:{dNorm}";

                var bz = Bin(p.Z, GRID);
                return $"{_tipo}|{bx}|{by}|{bz}|D:{dNorm}";
            }

            // ==========================================================
            // ANCLA UNIFICADA:
            //  - Para Bloques: usar centro geométrico (GeometricExtents),
            //    NO el punto de inserción (Position).
            //  - Para Círculos/Elipses: su centro.
            //  - Para otros: centro del bbox.
            // ==========================================================
            acGeo.Point3d GetAnchor(acDb.Entity ent)
            {
                try
                {
                    switch (ent)
                    {
                        case acDb.DBPoint pt:
                            return pt.Position;

                        case acDb.Circle c:
                            return c.Center;

                        case acDb.Ellipse el:
                            return el.Center;

                        case acDb.BlockReference br:
                            // CLAVE: el bloque se compara por su "centro real" (bbox),
                            // porque el insertion point NO siempre coincide con el centro del símbolo.
                            {
                                var ext = br.GeometricExtents;
                                return new acGeo.Point3d(
                                    (ext.MinPoint.X + ext.MaxPoint.X) / 2.0,
                                    (ext.MinPoint.Y + ext.MaxPoint.Y) / 2.0,
                                    (ext.MinPoint.Z + ext.MaxPoint.Z) / 2.0);
                            }

                        default:
                            {
                                var ext = ent.GeometricExtents;
                                return new acGeo.Point3d(
                                    (ext.MinPoint.X + ext.MaxPoint.X) / 2.0,
                                    (ext.MinPoint.Y + ext.MaxPoint.Y) / 2.0,
                                    (ext.MinPoint.Z + ext.MaxPoint.Z) / 2.0);
                            }
                    }
                }
                catch
                {
                    return acGeo.Point3d.Origin;
                }
            }

            // ==========================================================
            // Construir firmas
            // ==========================================================
            var anchorById = new Dictionary<ObjectId, acGeo.Point3d>();

            using (var tr = db.TransactionManager.StartTransaction())
            {
                foreach (var r in _rows)
                {
                    if (!r.Id.IsValid) { r.Signature = "INV"; continue; }

                    var obj = tr.GetObject(r.Id, acDb.OpenMode.ForRead, false, true);
                    if (obj is not acDb.Entity ent) { r.Signature = "NOENT"; continue; }

                    var anchor = GetAnchor(ent);
                    anchorById[r.Id] = anchor;

                    // Firma por candidatos: ANCLA (grid) + DIM normalizada
                    r.Signature = GridKey(anchor, DimNorm(r.Dimension));
                }
                tr.Commit();
            }

            // ==========================================================
            // Agrupar por key y detectar duplicados reales
            // ==========================================================
            var candidatos = _rows
                .Where(r => !string.IsNullOrWhiteSpace(r.Signature) &&
                            r.Signature != "INV" &&
                            r.Signature != "NOENT")
                .GroupBy(r => r.Signature, StringComparer.OrdinalIgnoreCase)
                .ToList();

            int groupIndex = 1;

            foreach (var g in candidatos)
            {
                var list = g.ToList();
                if (list.Count < 2) continue;

                var visited = new HashSet<int>();

                for (int i = 0; i < list.Count; i++)
                {
                    if (visited.Contains(i)) continue;

                    var baseRow = list[i];
                    if (!anchorById.TryGetValue(baseRow.Id, out var basePt)) continue;

                    var cluster = new List<RowInfo> { baseRow };
                    visited.Add(i);

                    for (int j = i + 1; j < list.Count; j++)
                    {
                        if (visited.Contains(j)) continue;

                        var testRow = list[j];
                        if (!anchorById.TryGetValue(testRow.Id, out var testPt)) continue;

                        // Duplicado REAL = misma coordenada + misma dimensión
                        if (SameCoord(basePt, testPt) && SameDim(baseRow.Dimension, testRow.Dimension))
                        {
                            cluster.Add(testRow);
                            visited.Add(j);
                        }
                    }

                    if (cluster.Count > 1)
                    {
                        string gid = $"DUP{groupIndex:000}";
                        groupIndex++;

                        // Conserva 1 (primero) y marca el resto para borrar
                        for (int k = 0; k < cluster.Count; k++)
                        {
                            var rr = cluster[k];
                            rr.DupGroup = gid;
                            rr.IsDuplicate = true;
                            rr.MarkToDelete = (k != 0);
                        }
                    }
                }
            }

            // Las que no están en grupos quedan “no duplicadas”
            foreach (var r in _rows)
            {
                if (string.IsNullOrWhiteSpace(r.DupGroup))
                {
                    r.IsDuplicate = false;
                    // no tocar MarkToDelete aquí
                }
            }
        }


    }

}


