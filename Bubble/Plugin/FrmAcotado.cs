using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using Autodesk.AutoCAD.Runtime;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.ConstrainedExecution;
// using System.Text.Json; // no usado
using System.Windows.Forms;
using acApp = Autodesk.AutoCAD.ApplicationServices.Application;

namespace SicoeCAD
{

    public partial class FrmAcotado : Form
    {
        private PromptSelectionResult? _sel;
        private List<ObjectId> _ultimasCotas = new();
        private bool _syncingOrd;

        public FrmAcotado()
        {
            InitializeComponent();
            CargarCapas();

            chkOrdX.CheckedChanged += SyncOrdChecks;
            chkOrdY.CheckedChanged += SyncOrdChecks;
        }

        private void CargarCapas()
        {
            try
            {
                var doc = acApp.DocumentManager.MdiActiveDocument;
                var db = doc.Database;
                using (var tr = db.TransactionManager.StartTransaction())
                {
                    var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
                    foreach (var id in lt)
                    {
                        var lay = (LayerTableRecord)tr.GetObject(id, OpenMode.ForRead);
                        cboCapa.Items.Add(lay.Name);
                    }
                    tr.Commit();
                }
            }
            catch { }
        }

        // en la clase
        private readonly List<ObjectId> _hi = new();   // ids resaltados en pantalla

        private void BtnSeleccionar_Click(object? sender, EventArgs e)
        {
            //CancelarComandoPendiente();  // evita estados colgados antes de seleccionar

            // Debe elegirse al menos un tipo
            if (!chkAlineado.Checked && !chkHorizontal.Checked && !chkVertical.Checked &&
                !chkAngular.Checked && !chkOrdX.Checked && !chkOrdY.Checked &&
                !chkDiametro.Checked && !chkRadio.Checked && !chkLongArco.Checked)
            {
                MessageBox.Show("Seleccione al menos un tipo de acotado antes de elegir entidades.", "SICOE");
                gbrAcotado.Focus(); // tu GroupBox de checks
                return;
            }

            var doc = acApp.DocumentManager.MdiActiveDocument;
            var db = doc.Database;
            var ed = doc.Editor;

            // limpia resaltados previos
            if (_hi.Count > 0)
            {
                using (var tr = db.TransactionManager.StartTransaction())
                {
                    foreach (var hid in _hi)
                        (tr.GetObject(hid, OpenMode.ForRead, false) as Entity)?.Unhighlight();
                    tr.Commit();
                }
                _hi.Clear();
            }


            var res = ed.GetSelection();
            if (res.Status != PromptStatus.OK)
            {
                txtSeleccion.Text = "0 entidades";
                _sel = null;
                return;
            }

            _sel = res;
            txtSeleccion.Text = $"{res.Value.Count} entidades seleccionadas";

            using (doc.LockDocument())
            using (var tr = db.TransactionManager.StartTransaction())
            {
                foreach (var id in res.Value.GetObjectIds())
                {
                    (tr.GetObject(id, OpenMode.ForRead, true) as Entity)?.Highlight();
                    _hi.Add(id);
                }
                tr.Commit();
            }
        }


        private void BtnAcotar_Click(object? sender, EventArgs e)
        {
            try
            {
                // 0) Validación selección
                if (_sel == null || _sel.Status != PromptStatus.OK)
                {
                    MessageBox.Show("Debe seleccionar entidades primero.", "SICOE");
                    return;
                }

                // 1) Validación tipo de acotado
                if (!chkAlineado.Checked && !chkHorizontal.Checked && !chkVertical.Checked &&
                    !chkAngular.Checked && !chkOrdX.Checked && !chkOrdY.Checked &&
                    !chkDiametro.Checked && !chkRadio.Checked && !chkLongArco.Checked)
                {
                    MessageBox.Show("Seleccione al menos un tipo de acotado.", "SICOE");
                    return;
                }

                // 2) Capa obligatoria
                string capa = cboCapa.Text?.Trim() ?? "";
                if (string.IsNullOrWhiteSpace(capa))
                {
                    MessageBox.Show("La 'Capa destino' es obligatoria.", "SICOE");
                    cboCapa.Focus();
                    return;
                }

                // 3) Parámetros numéricos
                var CI = System.Globalization.CultureInfo.InvariantCulture;
                double desfase = double.TryParse(txtDesfase.Text.Replace(',', '.'), System.Globalization.NumberStyles.Any, CI, out var d) ? d : 0.50;
                double altText = double.TryParse(txtAlttext.Text.Replace(',', '.'), System.Globalization.NumberStyles.Any, CI, out var at) ? at : 0.20;

                var doc = acApp.DocumentManager.MdiActiveDocument;
                var db = doc.Database;
                var ed = doc.Editor;

                _ultimasCotas.Clear();

                this.Enabled = false;
                this.Cursor = Cursors.WaitCursor;


                // contadores visibles en todo el método
                int creadas = 0;
                int descartadas = 0;
                var fallidas = new HashSet<ObjectId>();

                List<Point3d> _ordAllPoints = null;
                Point3d _ordCentroid = Point3d.Origin;


                try
                {
                    using (var tr = db.TransactionManager.StartTransaction())
                    {
                        var btr = (BlockTableRecord)tr.GetObject(db.CurrentSpaceId, OpenMode.ForWrite);
                        AsegurarCapa(db, tr, capa);

                        // 2.1) Materializar selección una sola vez
                        var selEnts = new List<Entity>();
                        foreach (var idSel in _sel.Value.GetObjectIds())
                        {
                            var entTmp = tr.GetObject(idSel, OpenMode.ForRead) as Entity;
                            if (entTmp != null) selEnts.Add(entTmp);
                        }


                        // 2.2) Pre-scan para Ordenadas (centroide + nube de puntos)
                        if (chkOrdX.Checked || chkOrdY.Checked)
                        {
                            _ordAllPoints = RecolectarPuntosOrdenadasDeSeleccion(selEnts, tr).ToList();
                            _ordCentroid = ComputeCentroid(_ordAllPoints);
                        }

                        // 2.3) Loop normal
                        foreach (var ent in selEnts)
                        {


                            try
                            {
                                // Alineado
                                if (chkAlineado.Checked)
                                {
                                    // 1) LINE
                                    if (ent is Line ln)
                                    {
                                        var idDim = CrearDimAlineada(db, tr, btr, ln.StartPoint, ln.EndPoint, desfase, altText, capa);
                                        _ultimasCotas.Add(idDim);
                                        creadas++;
                                        // sin continue; dejamos que Longitud de Arco también actúe si está marcada
                                    }

                                    // 2) POLYLINE 2D: solo segmentos LINEALES (sin bulge)
                                    if (ent is Polyline pl)
                                    {
                                        int last = pl.Closed ? pl.NumberOfVertices : pl.NumberOfVertices - 1;
                                        int sign = 1;
                                        for (int i = 0; i < last; i++)
                                        {
                                            if (pl.GetSegmentType(i) != SegmentType.Line) continue; // descarta arcos
                                            var seg = pl.GetLineSegment2dAt(i);
                                            var pA = new Point3d(seg.StartPoint.X, seg.StartPoint.Y, 0);
                                            var pB = new Point3d(seg.EndPoint.X, seg.EndPoint.Y, 0);
                                            if (pA.DistanceTo(pB) <= 1e-9) continue;

                                            var idDim = CrearDimAlineada(db, tr, btr, pA, pB, sign * Math.Abs(desfase), altText, capa);
                                            _ultimasCotas.Add(idDim);
                                            creadas++;
                                            sign *= -1;
                                        }
                                        // sin continue
                                    }

                                    // 3) POLYLINE2D (antigua): solo segmentos con bulge ~ 0
                                    if (ent is Polyline2d pl2)
                                    {
                                        var ttr = pl2.Database.TransactionManager.TopTransaction;
                                        var verts = new List<(Point3d pt, double bulge)>();
                                        foreach (ObjectId vid in pl2)
                                        {
                                            var v = (Vertex2d)ttr.GetObject(vid, OpenMode.ForRead);
                                            verts.Add((v.Position, v.Bulge));
                                        }
                                        if (verts.Count >= 2)
                                        {
                                            bool closed = pl2.Closed;
                                            int last = closed ? verts.Count : verts.Count - 1;
                                            int sign = 1;
                                            for (int i = 0; i < last; i++)
                                            {
                                                int j = (i + 1) % verts.Count;
                                                if (Math.Abs(verts[i].bulge) > 1e-9) continue; // descarta curvo
                                                var pA = verts[i].pt;
                                                var pB = verts[j].pt;
                                                if (pA.DistanceTo(pB) <= 1e-9) continue;

                                                var idDim = CrearDimAlineada(db, tr, btr, pA, pB, sign * Math.Abs(desfase), altText, capa);
                                                _ultimasCotas.Add(idDim);
                                                creadas++;
                                                sign *= -1;
                                            }
                                        }
                                        // sin continue
                                    }

                                    // 4) POLYLINE3D: segmentos son rectas entre vértices
                                    if (ent is Polyline3d pl3)
                                    {
                                        var ttr = pl3.Database.TransactionManager.TopTransaction;
                                        var verts = new List<Point3d>();
                                        foreach (ObjectId vid in pl3)
                                            verts.Add(((PolylineVertex3d)ttr.GetObject(vid, OpenMode.ForRead)).Position);

                                        if (verts.Count >= 2)
                                        {
                                            bool closed = pl3.Closed;
                                            int last = closed ? verts.Count : verts.Count - 1;
                                            int sign = 1;
                                            for (int i = 0; i < last; i++)
                                            {
                                                int j = (i + 1) % verts.Count;
                                                var pA = verts[i];
                                                var pB = verts[j];
                                                if (pA.DistanceTo(pB) <= 1e-9) continue;

                                                var idDim = CrearDimAlineada(db, tr, btr, pA, pB, sign * Math.Abs(desfase), altText, capa);
                                                _ultimasCotas.Add(idDim);
                                                creadas++;
                                                sign *= -1;
                                            }
                                        }
                                        // sin continue
                                    }
                                    // 5) Todo lo demás NO se acota en modo Alineado (sin continue)
                                }

                                // Longitud de Arco (DIMARC masivo)
                                if (chkLongArco.Checked)
                                {
                                    // 1) ARC directo
                                    if (ent is Arc a)
                                    {
                                        double angS = a.StartAngle;
                                        double angE = a.EndAngle;
                                        if (angE < angS) angE += Math.PI * 2.0;   // respeta sentido del arco
                                        double angMid = angS + (angE - angS) * 0.5;

                                        double R = a.Center.DistanceTo(a.StartPoint);
                                        var midOnArc = new Point3d(
                                            a.Center.X + Math.Cos(angMid) * R,
                                            a.Center.Y + Math.Sin(angMid) * R, 0);

                                        var radDir = (midOnArc - a.Center).GetNormal();
                                        var pick = new Point3d(
                                            midOnArc.X + radDir.X * desfase,
                                            midOnArc.Y + radDir.Y * desfase, 0);

                                        var idDim = CrearDimLongArcoViaCommand(db, ed,
                                            a.Center, a.StartPoint, a.EndPoint, a.Normal,
                                            desfase, altText, capa, pick);

                                        if (!idDim.IsNull) { _ultimasCotas.Add(idDim); creadas++; }
                                    }

                                    // 2) POLYLINE 2D: segmentos tipo Arc
                                    if (ent is Polyline pl)
                                    {
                                        int last = pl.Closed ? pl.NumberOfVertices : pl.NumberOfVertices - 1;
                                        for (int i = 0; i < last; i++)
                                        {
                                            if (pl.GetSegmentType(i) != SegmentType.Arc) continue;

                                            var seg = pl.GetArcSegment2dAt(i);
                                            var nrm = Vector3d.ZAxis;
                                            var pS = new Point3d(seg.StartPoint.X, seg.StartPoint.Y, 0);
                                            var pE = new Point3d(seg.EndPoint.X, seg.EndPoint.Y, 0);
                                            var ctr = new Point3d(seg.Center.X, seg.Center.Y, 0);

                                            double angS = Math.Atan2(pS.Y - ctr.Y, pS.X - ctr.X);
                                            double angE = Math.Atan2(pE.Y - ctr.Y, pE.X - ctr.X);
                                            double twoPi = Math.PI * 2.0;
                                            double sweep = angE - angS;
                                            while (sweep <= -twoPi) sweep += twoPi;
                                            while (sweep > twoPi) sweep -= twoPi;
                                            if (seg.IsClockWise && sweep > 0) sweep -= twoPi;
                                            if (!seg.IsClockWise && sweep < 0) sweep += twoPi;

                                            double angMid = angS + sweep * 0.5;

                                            double R = ctr.DistanceTo(pS);
                                            var midOnArc = new Point3d(ctr.X + Math.Cos(angMid) * R,
                                                                       ctr.Y + Math.Sin(angMid) * R, 0);
                                            var radDir = (midOnArc - ctr).GetNormal();
                                            var pick = new Point3d(midOnArc.X + radDir.X * desfase,
                                                                   midOnArc.Y + radDir.Y * desfase, 0);

                                            var idDim = CrearDimLongArcoViaCommand(
                                                db, ed, ctr, pS, pE, nrm, desfase, altText, capa, pick);

                                            if (!idDim.IsNull) { _ultimasCotas.Add(idDim); creadas++; }
                                        }
                                    }

                                    // 3) POLYLINE2D (antigua): bulge != 0 define tramo curvo
                                    if (ent is Polyline2d pl2)
                                    {
                                        var ttr = pl2.Database.TransactionManager.TopTransaction;
                                        var verts = new List<(Point3d pt, double bulge)>();
                                        foreach (ObjectId vid in pl2)
                                        {
                                            var v = (Vertex2d)ttr.GetObject(vid, OpenMode.ForRead);
                                            verts.Add((v.Position, v.Bulge));
                                        }

                                        int count = verts.Count;
                                        if (count >= 2)
                                        {
                                            bool closed = pl2.Closed;
                                            int last = closed ? count : count - 1;
                                            for (int i = 0; i < last; i++)
                                            {
                                                int j = (i + 1) % count;
                                                double b = verts[i].bulge;
                                                if (Math.Abs(b) < 1e-4) continue; // descarta arcos ínfimos o líneas

                                                var pS = verts[i].pt; var pE = verts[j].pt;
                                                if (TryArcFromBulge(pS, pE, b, out var center))
                                                {
                                                    double angS2 = Math.Atan2(pS.Y - center.Y, pS.X - center.X);
                                                    double theta = 4.0 * Math.Atan(b);        // bulge = tan(theta/4)
                                                    double angMid2 = angS2 + theta / 2.0;     // respeta CW/CCW real
                                                    double R2 = center.DistanceTo(pS);
                                                    var midOnArc2 = new Point3d(center.X + Math.Cos(angMid2) * R2,
                                                                                center.Y + Math.Sin(angMid2) * R2, 0);
                                                    var radDir2 = (midOnArc2 - center).GetNormal();
                                                    var pick2 = new Point3d(midOnArc2.X + radDir2.X * desfase,
                                                                            midOnArc2.Y + radDir2.Y * desfase, 0);

                                                    var idDim = CrearDimLongArcoViaCommand(db, ed,
                                                        center, pS, pE, Vector3d.ZAxis,
                                                        desfase, altText, capa, pick2);

                                                    if (!idDim.IsNull) { _ultimasCotas.Add(idDim); creadas++; }
                                                }
                                            }
                                        }
                                    }
                                    // 4) Todo lo demás no aplica a DIMARC (sin continue)
                                }
                                // === Radio ===
                                if (chkRadio.Checked)
                                {
                                    // 1) ARC directo
                                    if (ent is Arc aR)
                                    {
                                        double angS = aR.StartAngle;
                                        double angE = aR.EndAngle;
                                        if (angE < angS) angE += Math.PI * 2.0;
                                        double angMid = angS + (angE - angS) * 0.5;

                                        double R = aR.Radius;
                                        var midOnArc = new Point3d(
                                            aR.Center.X + Math.Cos(angMid) * R,
                                            aR.Center.Y + Math.Sin(angMid) * R, 0);

                                        var idDimR = CrearDimRadio(db, tr, btr, aR.Center, midOnArc, desfase, altText, capa);
                                        if (!idDimR.IsNull) { _ultimasCotas.Add(idDimR); creadas++; }
                                    }

                                    // 2) CIRCLE
                                    if (ent is Circle cR)
                                    {
                                        double ang = Math.PI / 4.0;
                                        var ptOn = new Point3d(
                                            cR.Center.X + Math.Cos(ang) * cR.Radius,
                                            cR.Center.Y + Math.Sin(ang) * cR.Radius, 0);

                                        var idDimR = CrearDimRadio(db, tr, btr, cR.Center, ptOn, desfase, altText, capa);
                                        if (!idDimR.IsNull) { _ultimasCotas.Add(idDimR); creadas++; }
                                    }

                                    // 3) POLYLINE 2D: segmentos tipo Arc
                                    if (ent is Polyline plR)
                                    {
                                        int last = plR.Closed ? plR.NumberOfVertices : plR.NumberOfVertices - 1;
                                        for (int i = 0; i < last; i++)
                                        {
                                            if (plR.GetSegmentType(i) != SegmentType.Arc) continue;

                                            var seg = plR.GetArcSegment2dAt(i);
                                            var ctr = new Point3d(seg.Center.X, seg.Center.Y, 0);

                                            double angS = Math.Atan2(seg.StartPoint.Y - seg.Center.Y, seg.StartPoint.X - seg.Center.X);
                                            double angE = Math.Atan2(seg.EndPoint.Y - seg.Center.Y, seg.EndPoint.X - seg.Center.X);
                                            double twoPi = Math.PI * 2.0;
                                            double sweep = angE - angS;
                                            while (sweep <= -twoPi) sweep += twoPi;
                                            while (sweep > twoPi) sweep -= twoPi;
                                            if (seg.IsClockWise && sweep > 0) sweep -= twoPi;
                                            if (!seg.IsClockWise && sweep < 0) sweep += twoPi;

                                            double angMid = angS + sweep * 0.5;
                                            double R = ctr.DistanceTo(new Point3d(seg.StartPoint.X, seg.StartPoint.Y, 0));
                                            var midOnArc = new Point3d(
                                                ctr.X + Math.Cos(angMid) * R,
                                                ctr.Y + Math.Sin(angMid) * R, 0);

                                            var idDimR = CrearDimRadio(db, tr, btr, ctr, midOnArc, desfase, altText, capa);
                                            if (!idDimR.IsNull) { _ultimasCotas.Add(idDimR); creadas++; }
                                        }
                                    }

                                    // 4) POLYLINE2D (antigua): bulge != 0 => arco
                                    if (ent is Polyline2d pl2R)
                                    {
                                        var ttr = pl2R.Database.TransactionManager.TopTransaction;
                                        var verts = new List<(Point3d pt, double bulge)>();
                                        foreach (ObjectId vid in pl2R)
                                        {
                                            var v = (Vertex2d)ttr.GetObject(vid, OpenMode.ForRead);
                                            verts.Add((v.Position, v.Bulge));
                                        }

                                        int count = verts.Count;
                                        if (count >= 2)
                                        {
                                            bool closed = pl2R.Closed;
                                            int last = closed ? count : count - 1;
                                            for (int i = 0; i < last; i++)
                                            {
                                                int j = (i + 1) % count;
                                                double b = verts[i].bulge;
                                                if (Math.Abs(b) < 1e-4) continue;

                                                var pS = verts[i].pt; var pE = verts[j].pt;
                                                if (TryArcFromBulge(pS, pE, b, out var center))
                                                {
                                                    double angS2 = Math.Atan2(pS.Y - center.Y, pS.X - center.X);
                                                    double theta = 4.0 * Math.Atan(b);          // bulge = tan(theta/4)
                                                    double angMid2 = angS2 + theta / 2.0;
                                                    double R2 = center.DistanceTo(pS);
                                                    var midOnArc2 = new Point3d(center.X + Math.Cos(angMid2) * R2,
                                                                                center.Y + Math.Sin(angMid2) * R2, 0);

                                                    var idDimR = CrearDimRadio(db, tr, btr, center, midOnArc2, desfase, altText, capa);
                                                    if (!idDimR.IsNull) { _ultimasCotas.Add(idDimR); creadas++; }
                                                }
                                            }
                                        }
                                    }
                                    // 4) Todo lo demás no aplica a DIMARC (sin continue)
                                }

                                // === Ordenadas (estilo topográfico: rótulo NE apilado con líder) ===
                                if (chkOrdX.Checked || chkOrdY.Checked)
                                {
                                    var occupied = CollectOccupiedExtents(tr, btr);

                                    foreach (var pt in EnumerarPuntosClave(ent, tr))
                                    {
                                        int near = CountNeighbors(pt, _ordAllPoints, radius: Math.Max(Math.Abs(desfase) * 3.0, altText * 6.0));

                                        var idLbl = CrearEtiquetaNE_Avoid(db, tr, btr, pt,
                                                                          Math.Abs(desfase), altText, capa,
                                                                          occupied, _ordCentroid, near);
                                        if (!idLbl.IsNull)
                                        {
                                            _ultimasCotas.Add(idLbl); creadas++;
                                            if (tr.GetObject(idLbl, OpenMode.ForRead) is Entity el && el.Bounds.HasValue)
                                                occupied.Add(el.Bounds.Value);
                                        }
                                    }
                                }



                            }
                            catch
                            {
                                descartadas++;
                                fallidas.Add(ent.ObjectId);
                            }


                        }


                        tr.Commit();
                    }

                    // resaltar descartadas fuera de la transacción anterior
                    if (fallidas.Count > 0)
                    {
                        using (var trH = db.TransactionManager.StartTransaction())
                        {
                            foreach (var fid in fallidas)
                            {
                                var e2 = trH.GetObject(fid, OpenMode.ForRead, false) as Entity;
                                e2?.Highlight();
                                if (e2 != null) _hi.Add(fid);   // para que OnFormClosing las apague
                            }
                            trH.Commit();
                        }
                    }
                }
                finally
                {
                    if (_hi?.Count > 0)
                    {
                        using (var tr2 = db.TransactionManager.StartTransaction())
                        {
                            foreach (var hid in _hi)
                                (tr2.GetObject(hid, OpenMode.ForRead, false) as Entity)?.Unhighlight();
                            tr2.Commit();
                        }
                        _hi.Clear();
                    }
                }
                CancelarComandoPendiente();
                this.Enabled = true;
                this.Cursor = Cursors.Default;

                ed.Regen(); ed.UpdateScreen();
                MessageBox.Show(
                    $"Generadas: {creadas} cotas.\n" +
                    $"Descartadas: {descartadas}.\n" +
                    $"Desfase: {desfase:0.##} m\n" +
                    $"Altura: {altText:0.##} m",
                    "SICOE");
            }

            catch (System.Exception ex)
            {
                string msg = ex is InvalidOperationException
                    ? "Operación no válida para el estado actual del documento.\nProbable causa: se invocó un comando de AutoCAD sin bloquear el documento."
                    : ex.Message;
                MessageBox.Show(msg, "SICOE");
            }

        }

        // === Longitud total + puntos para cota alineada ===

        private void BtnDeshacer_Click(object? sender, EventArgs e)
        {
            CancelarComandoPendiente();

            if (_ultimasCotas.Count == 0) return;
            var doc = acApp.DocumentManager.MdiActiveDocument;
            var db = doc.Database;
            using (doc.LockDocument())
            using (var tr = db.TransactionManager.StartTransaction())
            {
                foreach (var id in _ultimasCotas)
                {
                    if (!id.IsErased && id.IsValid)
                    {
                        var obj = tr.GetObject(id, OpenMode.ForWrite, false);
                        obj?.Erase();
                    }
                }
                tr.Commit();
            }

            _ultimasCotas.Clear();
            MessageBox.Show("Última acción deshecha.", "SICOE");
        }

        private void BtnCerrar_Click(object? sender, EventArgs e)
        {
            BeginInvoke(new Action(() =>
            {
                CancelarComandoPendiente();
                Close();
            }));
        }




        // ====== Helpers ======
        private static void AsegurarCapa(Database db, Transaction tr, string name)
        {
            if (string.IsNullOrWhiteSpace(name)) name = "SIC_DIM";
            var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
            if (!lt.Has(name))
            {
                lt.UpgradeOpen();
                var rec = new LayerTableRecord
                {
                    Name = name,
                    IsOff = false,
                    IsFrozen = false
                };
                lt.Add(rec);
                tr.AddNewlyCreatedDBObject(rec, true);
            }
            else
            {
                var id = lt[name];
                var rec = (LayerTableRecord)tr.GetObject(id, OpenMode.ForWrite);
                rec.IsOff = false;   // encendida
                rec.IsFrozen = false;
            }
        }


        private static ObjectId CrearDimAlineada(
            Database db, Transaction tr, BlockTableRecord btr,
            Point3d p1, Point3d p2, double desfase, double altText, string capa)
        {
            // Normalizar Z
            var a = new Point3d(p1.X, p1.Y, 0.0);
            var b = new Point3d(p2.X, p2.Y, 0.0);

            // Vector y normal (signo de desfase determina lado)
            var v = b - a; if (v.Length < 1e-9) v = new Vector3d(1, 0, 0);
            var n = new Vector3d(-v.Y, v.X, 0.0).GetNormal() * desfase;
            var dimLinePoint = new Point3d((a.X + b.X) * 0.5 + n.X, (a.Y + b.Y) * 0.5 + n.Y, 0.0);

            var dim = new AlignedDimension
            {
                XLine1Point = a,
                XLine2Point = b,
                DimLinePoint = dimLinePoint,
                DimensionText = "<>",              // usa precisión del estilo/propiedad
                DimensionStyle = db.Dimstyle,
                Layer = string.IsNullOrWhiteSpace(capa) ? "SIC_DIM" : capa,
                Normal = Vector3d.ZAxis,
                Dimtxt = altText,
                Annotative = AnnotativeStates.False
            };

            // Flecha ~ altura de texto y precisión 2 decimales
            dim.Dimasz = altText;   // tamaño de flecha = altura de texto
            dim.Dimdec = 2;         // lineal con 2 decimales

            dim.SetDatabaseDefaults(db);
            btr.AppendEntity(dim);
            tr.AddNewlyCreatedDBObject(dim, true);
            dim.RecomputeDimensionBlock(false);

            return dim.ObjectId;
        }
        // ==== RADIO (coloca el texto fuera del arco con margen estable) ====
        // ==== RADIO (texto entre el centro y el arco) ====
        // ==== RADIO (texto entre el centro y la curva) ====
        private static ObjectId CrearDimRadio(
            Database db, Transaction tr, BlockTableRecord btr,
            Point3d center, Point3d ptSobreArco, double desfase, double altText, string capa)
        {
            // Direción centro→arco y radio
            Vector3d dir = ptSobreArco - center;
            if (dir.Length < 1e-9) dir = new Vector3d(1, 0, 0);
            double R = dir.Length;
            dir = dir.GetNormal();

            // 0.0 = en el centro | 1.0 = sobre el arco
            const double fracTexto = 0.25;                     // AJUSTA: 0.20–0.35 recomendado
            Point3d posTexto = center + dir * (R * fracTexto); // Texto entre centro y borde

            // Crea la cota radial
            var dim = new RadialDimension
            {
                Center = center,
                ChordPoint = ptSobreArco,
                LeaderLength = 0.0,                 // no empujes el texto hacia fuera
                DimensionStyle = db.Dimstyle,
                Layer = string.IsNullOrWhiteSpace(capa) ? "SIC_DIM" : capa,
                Normal = Vector3d.ZAxis,
                DimensionText = "<>",
                Dimtxt = altText,
                Dimasz = altText,
                Dimdec = 2,
                Dimtmove = 1                         // permite fijar TextPosition sin líder extra
            };

            // Fija el texto adentro (clave)
            // Fija el texto adentro (clave) y alínealo con la línea radial
            dim.TextPosition = posTexto;
            dim.TextRotation = Math.Atan2(dir.Y, dir.X);   // orientación del texto = dirección centro→arco
            dim.Dimtmove = 1;                               // mover texto, sin líder (asegura respeto a TextPosition)

            dim.SetDatabaseDefaults(db);
            btr.AppendEntity(dim);
            tr.AddNewlyCreatedDBObject(dim, true);
            dim.RecomputeDimensionBlock(false);

            return dim.ObjectId;
        }


        /// <summary>
        /// Crea un ArcLengthDimension (DIMARC) usando centro, inicio y fin.
        /// El punto de cota se calcula en el punto medio del arco, desplazado
        /// radialmente por 'desfase'. Flechas y texto usan 'altText'.
        /// </summary>
        private static ObjectId CrearDimLongArcoViaCommand(
            Database db, Editor ed,
            Point3d center, Point3d start, Point3d end, Vector3d normal,
            double desfase, double altText, string capa,
            Point3d? pickOverride = null)
        {
            if (normal.Length == 0) normal = Vector3d.ZAxis;

            // 1) Punto para DIMARC: usa override si viene desde Polyline/Poly2d
            Point3d dimArcPoint;
            if (pickOverride.HasValue)
            {
                dimArcPoint = pickOverride.Value;
            }
            else
            {
                // Cálculo estándar: punto medio del arco CCW entre start→end
                double angS = Math.Atan2(start.Y - center.Y, start.X - center.X);
                double angE = Math.Atan2(end.Y - center.Y, end.X - center.X);
                double twoPi = Math.PI * 2.0;
                double sweep = angE - angS; while (sweep <= 0) sweep += twoPi;
                double angMid = angS + sweep * 0.5;
                double R = center.DistanceTo(start);
                var midOnArc = new Point3d(center.X + Math.Cos(angMid) * R,
                                           center.Y + Math.Sin(angMid) * R, 0);
                var radDir = (midOnArc - center).GetNormal();
                dimArcPoint = new Point3d(midOnArc.X + radDir.X * desfase,
                                          midOnArc.Y + radDir.Y * desfase, 0);
            }

            // 2) Asegurar capa sin tocar CLAYER
            var topTr = db.TransactionManager.TopTransaction;
            bool openedLocal = false;
            Transaction tr = topTr ?? (openedLocal = true, db.TransactionManager.StartTransaction()).Item2;
            try
            {
                var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
                if (!lt.Has(capa))
                {
                    lt.UpgradeOpen();
                    var rec = new LayerTableRecord { Name = capa, IsOff = false, IsFrozen = false };
                    lt.Add(rec);
                    tr.AddNewlyCreatedDBObject(rec, true);
                }
                if (openedLocal) tr.Commit();
            }
            finally { if (openedLocal) tr.Dispose(); }

            // 3) Capturar Id creado por el comando
            ObjectId creado = ObjectId.Null;
            void OnAppended(object s, ObjectEventArgs e)
            {
                if (e.DBObject is Dimension) creado = e.DBObject.ObjectId;
            }

            // 4) Forzar tamaño de texto/flecha. No tocar CLAYER
            var oldDimtxt = Convert.ToDouble(acApp.GetSystemVariable("DIMTXT"));
            var oldDimasz = Convert.ToDouble(acApp.GetSystemVariable("DIMASZ"));

            db.ObjectAppended += OnAppended;
            try
            {
                acApp.SetSystemVariable("DIMTXT", altText);
                acApp.SetSystemVariable("DIMASZ", altText);
                var doc = acApp.DocumentManager.MdiActiveDocument;

                CancelarComandoPendiente(); // asegura editor inactivo antes de DIMARC

                using (doc.LockDocument())   // <-- lock solo aquí
                {
                    ed.Command(

                                    "_.DIMARC",
                        "_CE", center,
                        "_S", start,
                        "_E", end,
                        "_D", dimArcPoint,
                        "", ""
                    );
                }
            }
            finally
            {
                acApp.SetSystemVariable("DIMTXT", oldDimtxt);
                acApp.SetSystemVariable("DIMASZ", oldDimasz);
                db.ObjectAppended -= OnAppended;
            }

            // 5) Poner el dim en la capa destino
            if (!creado.IsNull)
            {
                using var tr2 = db.TransactionManager.StartTransaction();
                var dim = (Dimension)tr2.GetObject(creado, OpenMode.ForWrite, false);
                if (!string.IsNullOrWhiteSpace(capa)) dim.Layer = capa;
                dim.Dimtxt = altText; dim.Dimasz = altText; dim.Dimdec = 2;
                dim.RecomputeDimensionBlock(false);
                tr2.Commit();
            }
            return creado;
        }
        // === COLISIÓN: utilidades ===
        private static List<Extents3d> CollectOccupiedExtents(Transaction tr, BlockTableRecord btr)
        {
            var list = new List<Extents3d>();
            foreach (ObjectId id in btr)
            {
                var e = tr.GetObject(id, OpenMode.ForRead, false) as Entity;
                if (e == null) continue;
                // Puedes filtrar por tipo si quieres solo textos/cotas, por ahora tomamos todo
                if (e.Bounds.HasValue) list.Add(e.Bounds.Value);
            }
            return list;
        }

        private static bool Intersects(Extents3d a, Extents3d b, double pad)
        {
            // padding uniforme en XY
            var ax1 = a.MinPoint.X - pad; var ay1 = a.MinPoint.Y - pad;
            var ax2 = a.MaxPoint.X + pad; var ay2 = a.MaxPoint.Y + pad;

            var bx1 = b.MinPoint.X - pad; var by1 = b.MinPoint.Y - pad;
            var bx2 = b.MaxPoint.X + pad; var by2 = b.MaxPoint.Y + pad;

            bool sepX = ax2 < bx1 || bx2 < ax1;
            bool sepY = ay2 < by1 || by2 < ay1;
            return !(sepX || sepY);
        }

        // Crea un rótulo topográfico NE apilado con líder y evita solapes.
        // Formato: "N: 123456.78" en la primera línea y "E: 123456.78" en la segunda.
        private static ObjectId CrearEtiquetaNE_Avoid(
            Database db, Transaction tr, BlockTableRecord btr,
            Point3d basePoint, double desfaseMin, double altText, string capa,
            List<Extents3d> occupied, Point3d centroid, int nearCount)
        {
            // 1) Punto objetivo del texto usando tu dispersión radial
            var textPt = DynamicLeaderTarget(basePoint, centroid, desfaseMin, occupied, altText, nearCount);

            // 2) Construir el contenido MTEXT con salto de línea \P
            var mt = new MText
            {
                Location = textPt,
                TextHeight = altText,
                Attachment = AttachmentPoint.MiddleLeft, // texto a la derecha del codo
                Contents = FormatoNE(basePoint)
            };

            // 3) Construir el MLEADER con línea recta y aterrizaje corto
            var ml = new MLeader
            {
                Layer = string.IsNullOrWhiteSpace(capa) ? "SIC_DIM" : capa,
                ContentType = ContentType.MTextContent,
                MText = mt,
                ArrowSize = altText * 0.6,
                LandingGap = altText * 0.35,
                DoglegLength = altText * 0.9,
                Annotative = AnnotativeStates.False,
                LeaderLineType = LeaderType.StraightLeader
            };

            int ld = ml.AddLeader();
            int ln = ml.AddLeaderLine(ld);

            // vértices: arranque en el punto medido y aterrizaje en el texto
            ml.AddFirstVertex(ln, basePoint);
            ml.AddLastVertex(ln, textPt);

            // evitar giro del texto: mantener horizontal
            ml.TextAlignmentType = TextAlignmentType.LeftAlignment;

            btr.AppendEntity(ml);
            tr.AddNewlyCreatedDBObject(ml, true);

            // registrar ocupación aproximada del texto
            if (ml.Bounds.HasValue) occupied.Add(ml.Bounds.Value);

            return ml.ObjectId;
        }

        // Devuelve "N: {Y}\P E: {X}" con 2 decimales (ajusta a tu formato)
        private static string FormatoNE(Point3d p)
        {
            return $"N: {p.Y:0.00}\\P E: {p.X:0.00}";
        }


        /// <summary>
        /// Devuelve puntos “endpoint” relevantes de la entidad:
        /// Line: start/end. Polyline/2d/3d: todos los vértices.
        /// Arc/Spline: inicio y fin. Circle/Hatch: ninguno.
        /// </summary>
        private static IEnumerable<Point3d> EnumerarPuntosClave(Entity ent, Transaction tr)
        {
            if (ent is Line ln)
            {
                yield return new Point3d(ln.StartPoint.X, ln.StartPoint.Y, 0);
                yield return new Point3d(ln.EndPoint.X, ln.EndPoint.Y, 0);
                yield break;
            }

            if (ent is Polyline pl)
            {
                int n = pl.NumberOfVertices;
                for (int i = 0; i < n; i++)
                    yield return new Point3d(pl.GetPoint3dAt(i).X, pl.GetPoint3dAt(i).Y, 0);
                yield break;
            }

            if (ent is Polyline2d pl2)
            {
                foreach (ObjectId vid in pl2)
                {
                    var v = (Vertex2d)tr.GetObject(vid, OpenMode.ForRead);
                    yield return new Point3d(v.Position.X, v.Position.Y, 0);
                }
                yield break;
            }

            if (ent is Polyline3d pl3)
            {
                foreach (ObjectId vid in pl3)
                {
                    var v = (PolylineVertex3d)tr.GetObject(vid, OpenMode.ForRead);
                    yield return new Point3d(v.Position.X, v.Position.Y, 0);
                }
                yield break;
            }

            if (ent is Arc a)
            {
                yield return new Point3d(a.StartPoint.X, a.StartPoint.Y, 0);
                yield return new Point3d(a.EndPoint.X, a.EndPoint.Y, 0);
                yield break;
            }

            if (ent is Spline s)
            {
                yield return new Point3d(s.StartPoint.X, s.StartPoint.Y, 0);
                yield return new Point3d(s.EndPoint.X, s.EndPoint.Y, 0);
                yield break;
            }

            // Círculo, Hatch u otros: sin endpoints útiles
            yield break;
        }

        /// <summary>
        /// Reconstruye el centro del arco de una polyline 2D desde 2 puntos y bulge.
        /// Fórmula estándar: bulge = tan(theta/4), theta = ángulo central con signo.
        /// </summary>
        private static bool TryArcFromBulge(Point3d p1, Point3d p2, double bulge, out Point3d center)
        {
            center = Point3d.Origin;
            double chord = p1.DistanceTo(p2);
            if (chord <= 1e-12) return false;

            // ángulo central
            double theta = 4.0 * Math.Atan(bulge);
            double R = chord / (2.0 * Math.Sin(Math.Abs(theta) / 2.0));
            if (double.IsNaN(R) || double.IsInfinity(R)) return false;

            // punto medio de la cuerda
            var mid = new Point3d((p1.X + p2.X) * 0.5, (p1.Y + p2.Y) * 0.5, 0);
            // dirección de la cuerda y normal
            var v = (p2 - p1).GetNormal();
            var n = new Vector3d(-v.Y, v.X, 0); // 90° CCW

            // distancia del centro al punto medio: d = R * cos(theta/2)
            double d = R * Math.Cos(Math.Abs(theta) / 2.0);
            // signo del bulge determina el lado del centro
            double sign = Math.Sign(bulge);

            center = new Point3d(mid.X + n.X * d * sign, mid.Y + n.Y * d * sign, 0);
            return true;
        }
        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            CancelarComandoPendiente();

            base.OnFormClosing(e);
            try
            {
                var doc = acApp.DocumentManager.MdiActiveDocument;
                var db = doc.Database;
                using (var tr = db.TransactionManager.StartTransaction())
                {
                    if (_hi?.Count > 0)
                    {
                        foreach (var id in _hi)
                            (tr.GetObject(id, OpenMode.ForRead, false) as Entity)?.Unhighlight();
                        _hi.Clear();
                    }
                    tr.Commit();
                }
            }
            catch { }
        }

        // --- helper para liberar el editor de AutoCAD ---
        private static void CancelarComandoPendiente()
        {
            var doc = acApp.DocumentManager.MdiActiveDocument;
            if (doc == null) return;
            var ed = doc.Editor;

            // ESC ESC para cancelar cualquier comando en curso
            doc.SendStringToExecute("\x03\x03", true, false, false);

            // Espera breve a que el editor quede libre (máx ~100 ms)
            int intentos = 0;
            while (!ed.IsQuiescent && intentos < 10)
            {
                System.Windows.Forms.Application.DoEvents();
                System.Threading.Thread.Sleep(10);
                intentos++;
            }
        }
        // Mantiene chkOrdX y chkOrdY siempre iguales:
        // - Si el usuario marca una, se marcan ambas.
        // - Si el usuario desmarca una, se desmarcan ambas.
        private void SyncOrdChecks(object? sender, EventArgs e)
        {
            if (_syncingOrd) return;
            try
            {
                _syncingOrd = true;

                // Si el usuario marca X ⇒ marcar Y. Si desmarca X ⇒ desmarcar Y.
                if (ReferenceEquals(sender, chkOrdX))
                {
                    chkOrdY.Checked = chkOrdX.Checked;
                    return;
                }

                // Si el usuario marca Y ⇒ marcar X. Si desmarca Y ⇒ desmarcar X.
                if (ReferenceEquals(sender, chkOrdY))
                {
                    chkOrdX.Checked = chkOrdY.Checked;
                    return;
                }

                // Fallback: mantenerlos iguales si el origen no es ninguno de los dos
                bool same = chkOrdX.Checked || chkOrdY.Checked;
                chkOrdX.Checked = same;
                chkOrdY.Checked = same;
            }
            finally
            {
                _syncingOrd = false;
            }
        }
        // Reúne TODOS los puntos candidatos de las entidades seleccionadas
        private IEnumerable<Point3d> RecolectarPuntosOrdenadasDeSeleccion(IEnumerable<Entity> seleccion, Transaction tr)
        {
            foreach (var e in seleccion)
                foreach (var p in EnumerarPuntosClave(e, tr))
                    yield return p;
        }

        private static Point3d ComputeCentroid(IList<Point3d> pts)
        {
            if (pts == null || pts.Count == 0) return Point3d.Origin;
            double sx = 0, sy = 0;
            foreach (var p in pts) { sx += p.X; sy += p.Y; }
            return new Point3d(sx / pts.Count, sy / pts.Count, 0);
        }

        private static int CountNeighbors(Point3d p, IList<Point3d> pts, double radius)
        {
            if (pts == null) return 0;
            double r2 = radius * radius;
            int c = 0;
            foreach (var q in pts)
            {
                double dx = p.X - q.X, dy = p.Y - q.Y;
                if ((dx * dx + dy * dy) <= r2) c++;
            }
            return c; // incluye al propio punto
        }

        // Calcula el punto del líder con desfase mínimo y escalamiento por densidad, corrige por colisión
        private static Point3d DynamicLeaderTarget(Point3d basePoint, Point3d centroid, double desfaseMin,
                                                   List<Extents3d> occupied, double altText, int nearCount)
        {
            // Dirección radial desde el centroide. Si es nula, usa +45°
            Vector3d dir = basePoint - centroid;   // ya es Vector3d
            if (dir.Length < 1e-6) dir = new Vector3d(1, 1, 0);
            dir = dir.GetNormal();

            // factor inicial por densidad local: 1 + 0.15*(vecinos-1), acotado a [1, 3]
            double f0 = 1.0 + 0.15 * Math.Max(0, nearCount - 1);
            if (f0 < 1.0) f0 = 1.0;
            if (f0 > 3.0) f0 = 3.0;

            // intento en varios escalados y cuadrantes alternos
            int maxTries = 16;
            double pad = Math.Max(altText, 0.5) * 0.6;

            // secuencia de cuadrantes: +dir, +X−Y, −X+Y, −dir
            Vector3d dir90 = new Vector3d(-dir.Y, dir.X, 0);   // rotado 90°
            Vector3d[] dirs = new[]
            {
        dir,
        new Vector3d( dir.X, -dir.Y, 0).GetNormal(),
        new Vector3d(-dir.X,  dir.Y, 0).GetNormal(),
        (-dir).GetNormal(),
        dir90,
        (-dir90).GetNormal()
    };

            for (int i = 0; i < maxTries; i++)
            {
                // crece suavemente 18% por intento, mantiene mínimo del formulario
                double f = f0 * Math.Pow(1.18, i);
                double off = Math.Max(desfaseMin, desfaseMin * f);

                var tryDir = dirs[i % dirs.Length];
                var candidate = new Point3d(basePoint.X + tryDir.X * off,
                                            basePoint.Y + tryDir.Y * off, 0);

                // construir extents aproximados del texto alrededor del candidato
                var bb = new Extents3d(
                    new Point3d(candidate.X - altText, candidate.Y - altText, 0),
                    new Point3d(candidate.X + altText, candidate.Y + altText, 0)
                );

                bool collide = false;
                foreach (var occ in occupied)
                {
                    if (Intersects(bb, occ, pad)) { collide = true; break; }
                }
                if (!collide) return candidate;
            }

            // último recurso: mínimo en +dir
            return new Point3d(basePoint.X + dir.X * desfaseMin, basePoint.Y + dir.Y * desfaseMin, 0);
        }


    }
}
