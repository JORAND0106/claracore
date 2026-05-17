using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;
using acApp = Autodesk.AutoCAD.ApplicationServices;
using acDb = Autodesk.AutoCAD.DatabaseServices;
using acGeo = Autodesk.AutoCAD.Geometry;

namespace SicoePresupuestoNET8
{
    internal static class PkStore
    {
        private const string LayerPk = "SICOE_PK_REG";
        private const string XDataApp = "SICOE_PK";
        /// <summary>Decimales en coordenadas exportadas (WGS84 y plano). 6 ≈ ~0,1 m.</summary>
        private const int ExportCoordDecimals = 6;
        private const double MinCurveSampleStep = 0.05;
        /// <summary>|bulge| menor → tramo recto (evita arcos microscópicos por redondeo CAD).</summary>
        private const double BulgeIsArcTol = 1e-4;
        private const double ColinearSinTol = 1e-5;
        /// <summary>Si longitud de curva ≈ cuerda, tratar como recta (explode a veces devuelve arco/spline casi recto).</summary>
        private const double StraightLenRelTol = 1e-3;
        private static string _lastDocKey;

        private static string GetDocKey()
        {
            try
            {
                return Autodesk.AutoCAD.DatabaseServices.HostApplicationServices
                         .WorkingDatabase?.Filename?.ToUpperInvariant() ?? "";
            }
            catch { return ""; }
        }

        /// <summary> Limpia cachés si el DWG activo cambió. Devuelve true si se limpió. </summary>
        public static bool ResetIfDocumentChanged()
        {
            var k = GetDocKey();

            // Si NO cambió el DWG, no hay nada que limpiar
            if (string.Equals(_lastDocKey, k, StringComparison.Ordinal))
                return false;

            // Cambió el DWG: actualiza clave y limpia cachés
            _lastDocKey = k;

            try
            {
                var flags = System.Reflection.BindingFlags.Static |
                            System.Reflection.BindingFlags.NonPublic |
                            System.Reflection.BindingFlags.Public;

                var fields = typeof(PkStore).GetFields(flags);
                foreach (var f in fields)
                {
                    var val = f.GetValue(null);
                    if (val == null) continue;

                    var clear = val.GetType().GetMethod("Clear", Type.EmptyTypes);
                    if (clear != null)
                    {
                        try { clear.Invoke(val, null); } catch { /* tolerante */ }
                    }
                }
            }
            catch { /* tolerante */ }

            return true; // <- siempre devuelve valor cuando cambió
        }


        public sealed class PkRegionDto
        {
            public string PkId { get; set; } = "";
            public List<List<Point2dDto>> Loops { get; set; } = new(); // 1..n anillos
        }
        public sealed class Point2dDto
        {
            public double X { get; set; }
            public double Y { get; set; }
            public Point2dDto() { }
            public Point2dDto(double x, double y) { X = x; Y = y; }
        }

        public static bool TryGetPkByPoint(acGeo.Point3d pt, out string pk)
        {
            // Reutiliza la implementación que ya explota la región y hace la prueba en 2D
            return TryGetPkForPoint(pt, out pk);
        }

        public static bool TryGetMidPoint(acDb.ObjectId entId, acDb.Transaction tr, out Point3d pt)
        {
            pt = Point3d.Origin;
            if (tr.GetObject(entId, acDb.OpenMode.ForRead, false, true) is acDb.Entity ent)
            {
                if (ent is acDb.Curve cv)
                {
                    double t = (cv.StartParam + cv.EndParam) * 0.5;
                    pt = cv.GetPointAtParameter(t);
                    return true;
                }
                if (ent is acDb.DBText tx) { pt = tx.Position; return true; }
                if (ent is acDb.MText mtx) { pt = mtx.Location; return true; }
            }
            return false;
        }

        // ===== Índice en memoria de Regiones → PK =====
        private static List<(acDb.ObjectId id, string pk)> _idx = new();
        private static readonly object _guard = new();
        public static ObjectId CreateRegionFromSelection(string pkName, out string error)
        {
            error = "";
            var doc = Application.DocumentManager.MdiActiveDocument;
            var db = doc?.Database; var ed = doc?.Editor;
            if (db == null || ed == null) { error = "No hay documento activo."; return ObjectId.Null; }

            // pedir selección de UNA entidad cerrada
            var psel = new PromptEntityOptions("\nSeleccione un polígono cerrado...")
            {
                AllowNone = false
            };
            psel.SetRejectMessage("\nSolo polílinea cerrada, círculo, elipse o spline cerrada.");
            psel.AddAllowedClass(typeof(Polyline), true);
            psel.AddAllowedClass(typeof(Circle), true);
            psel.AddAllowedClass(typeof(Ellipse), true);
            psel.AddAllowedClass(typeof(Spline), true);

            var res = ed.GetEntity(psel);
            if (res.Status != PromptStatus.OK) { error = "Selección cancelada."; return ObjectId.Null; }

            using var tr = db.TransactionManager.StartTransaction();
            // después
            var bt = (acDb.BlockTable)tr.GetObject(db.BlockTableId, acDb.OpenMode.ForRead);
            var ms = bt[acDb.BlockTableRecord.ModelSpace];
            var btr = (acDb.BlockTableRecord)tr.GetObject(ms, acDb.OpenMode.ForRead);

            // Asegurar capa
            var layerName = SanitizeLayerName(pkName);
            EnsureLayer(db, tr, layerName);

            // preparar curvas
            var curves = new DBObjectCollection();
            var ent = (Entity)tr.GetObject(res.ObjectId, OpenMode.ForRead);

            switch (ent)
            {
                case Autodesk.AutoCAD.DatabaseServices.Polyline pl when pl.Closed:
                    curves.Add((Autodesk.AutoCAD.DatabaseServices.Curve)pl.Clone());
                    break;

                case Autodesk.AutoCAD.DatabaseServices.Circle c:
                    curves.Add((Autodesk.AutoCAD.DatabaseServices.Curve)c.Clone());
                    break;

                case Autodesk.AutoCAD.DatabaseServices.Ellipse e when e.Closed:
                    curves.Add((Autodesk.AutoCAD.DatabaseServices.Curve)e.Clone());
                    break;

                case Autodesk.AutoCAD.DatabaseServices.Spline sp when sp.Closed:
                    curves.Add((Autodesk.AutoCAD.DatabaseServices.Curve)sp.Clone());
                    break;

                default:
                    error = "La entidad no es un contorno cerrado.";
                    return ObjectId.Null;
            }

            // crear región
            var regs = Region.CreateFromCurves(curves);
            if (regs == null || regs.Count == 0) { error = "No se pudo crear la Region."; return ObjectId.Null; }

            var reg = (Region)regs[0];
            reg.Layer = layerName;                 // ← capa = PK_ID

            var regId = btr.AppendEntity(reg);
            tr.AddNewlyCreatedDBObject(reg, true);

            // Etiquetar con XData el nombre del PK_ID
            TagRegionWithName(reg, pkName);

            tr.Commit();
            return regId;
        }
        public static void TagRegionWithName(acDb.Region reg, string pkName)
        {
            var db = reg.Database;
            using var tr = db.TransactionManager.StartTransaction();

            EnsureRegApp(db, XDataApp, tr);

            using var rb = new acDb.ResultBuffer(
                new acDb.TypedValue((int)acDb.DxfCode.ExtendedDataRegAppName, XDataApp),
                new acDb.TypedValue((int)acDb.DxfCode.ExtendedDataAsciiString, (pkName ?? "").Trim())
            );

            reg.UpgradeOpen();
            reg.XData = rb;

            tr.Commit();
        }
        public static HashSet<string> LoadPkNamesFromRegions()
        {

            ResetIfDocumentChanged();

            var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            var doc = acApp.Application.DocumentManager.MdiActiveDocument;
            var db = doc?.Database;
            if (db == null) return set;

            _idx.Clear(); // limpia cualquier cache previo al cambiar de archivo
            using var tr = db.TransactionManager.StartTransaction();
            // después
            var bt = (acDb.BlockTable)tr.GetObject(db.BlockTableId, acDb.OpenMode.ForRead);
            var ms = bt[acDb.BlockTableRecord.ModelSpace];
            var btr = (acDb.BlockTableRecord)tr.GetObject(ms, acDb.OpenMode.ForRead);
            foreach (acDb.ObjectId id in btr)
            {
                if (tr.GetObject(id, acDb.OpenMode.ForRead, false, true) is not acDb.Region reg)
                    continue;

                acDb.ResultBuffer rb = reg.XData;
                if (rb == null) continue;

                string? pk = null;
                bool ok = false;
                foreach (acDb.TypedValue tv in rb.AsArray())
                {
                    // AppName de tu XData
                    if (tv.TypeCode == (int)acDb.DxfCode.ExtendedDataRegAppName && (tv.Value as string) == XDataApp)
                    {
                        ok = true;
                        continue;
                    }
                    if (ok && tv.TypeCode == (int)acDb.DxfCode.ExtendedDataAsciiString)
                    { pk = tv.Value as string; break; }
                }
                rb.Dispose();

                if (!string.IsNullOrWhiteSpace(pk))
                    set.Add(pk);
            }

            tr.Commit();
            return set;
        }
        public static acDb.ObjectId CreateRegionFromEntity(acDb.ObjectId entId, string pkName, out string error)
        {
            error = "";
            var doc = acApp.Application.DocumentManager.MdiActiveDocument;
            var db = doc?.Database;
            if (db == null) { error = "Sin dibujo activo."; return acDb.ObjectId.Null; }

            try
            {
                using (doc.LockDocument())
                using (var tr = db.TransactionManager.StartTransaction())
                {
                    if (tr.GetObject(entId, acDb.OpenMode.ForRead, false, true) is not acDb.Entity ent)
                    { error = "Entidad inválida."; return acDb.ObjectId.Null; }

                    var curves = new acDb.DBObjectCollection();

                    switch (ent)
                    {
                        case acDb.Polyline pl when pl.Closed:
                            curves.Add((acDb.Curve)pl.Clone()); break;
                        case acDb.Circle c:
                            curves.Add((acDb.Curve)c.Clone()); break;
                        case acDb.Ellipse e when e.Closed:
                            curves.Add((acDb.Curve)e.Clone()); break;
                        case acDb.Spline sp when sp.Closed:
                            curves.Add((acDb.Curve)sp.Clone()); break;
                        default:
                            error = "La entidad no es un contorno cerrado.";
                            return acDb.ObjectId.Null;
                    }

                    var regs = acDb.Region.CreateFromCurves(curves);
                    if (regs == null || regs.Count == 0) { error = "Region.CreateFromCurves falló."; return acDb.ObjectId.Null; }

                    var reg = (acDb.Region)regs[0];
                    // capa por PK_ID
                    var layerName = SanitizeLayerName(pkName);
                    EnsureLayer(db, tr, layerName);
                    reg.Layer = layerName;

                    var btr = (acDb.BlockTableRecord)tr.GetObject(db.CurrentSpaceId, acDb.OpenMode.ForWrite);
                    var id = btr.AppendEntity(reg);
                    tr.AddNewlyCreatedDBObject(reg, true);

                    // XData
                    EnsureRegApp(db, XDataApp, tr);
                    using var rb = new acDb.ResultBuffer(
                        new acDb.TypedValue((int)acDb.DxfCode.ExtendedDataRegAppName, XDataApp),
                        new acDb.TypedValue((int)acDb.DxfCode.ExtendedDataAsciiString, (pkName ?? "").Trim())
                    );
                    reg.XData = rb;

                    tr.Commit();
                    return id;
                }
            }
            catch (Autodesk.AutoCAD.Runtime.Exception ex) { error = ex.ErrorStatus.ToString(); return acDb.ObjectId.Null; }
            catch (Exception ex) { error = ex.Message; return acDb.ObjectId.Null; }
        }

        /// <summary>
        /// Al crear Region PK: rectas = solo extremos; curvas/arcos/splines/bulge = cada <paramref name="step"/> m.
        /// Devuelve null si el contorno puede usarse sin aplanar (polilínea cerrada sin bulge).
        /// </summary>
        public static List<acGeo.Point2d>? BuildBoundaryPointsForRegion(acDb.Entity ent, double step)
        {
            if (ent == null || step <= 0) return null;

            var dtoPts = new List<Point2dDto>();
            void Add(double x, double y)
            {
                var pt = PtDto(x, y);
                if (dtoPts.Count > 0)
                {
                    var last = dtoPts[dtoPts.Count - 1];
                    if ((pt.X - last.X) * (pt.X - last.X) + (pt.Y - last.Y) * (pt.Y - last.Y) < 1e-12)
                        return;
                }
                dtoPts.Add(pt);
            }

            switch (ent)
            {
                case acDb.Polyline pl when pl.Closed:
                    {
                        int nv = pl.NumberOfVertices;
                        bool hasBulge = false;
                        for (int i = 0; i < nv; i++)
                        {
                            if (Math.Abs(pl.GetBulgeAt(i)) >= BulgeIsArcTol)
                            {
                                hasBulge = true;
                                break;
                            }
                        }
                        if (!hasBulge) return null;

                        // Un vértice por esquina del polígono: no fusionar tramos rectos entre vértices distintos
                        AppendClosedPolylinePerEdge(pl, step, Add);
                        break;
                    }

                case acDb.Spline sp when sp.Closed:
                case acDb.Ellipse el when el.Closed:
                case acDb.Circle:
                    if (ent is acDb.Curve cv)
                    {
                        if (CurveIsEffectivelyStraight(cv))
                            AppendStraightEndpoints2d(cv, forward: true, omitFirst: false, Add);
                        else if (ent is acDb.Circle circ)
                            SampleCircleByDistance2d(circ, step, forward: true, omitFirst: false, Add);
                        else
                            SampleCurveByDistance2d(cv, step, forward: true, omitFirst: false, Add);
                    }
                    break;

                default:
                    if (ent is acDb.Curve cv2)
                    {
                        if (CurveIsEffectivelyStraight(cv2))
                            AppendStraightEndpoints2d(cv2, forward: true, omitFirst: false, Add);
                        else
                            SampleCurveByDistance2d(cv2, step, forward: true, omitFirst: false, Add);
                    }
                    else
                    {
                        return null;
                    }
                    break;
            }

            if (dtoPts.Count < 3) return null;

            var ring = DeduplicateConsecutivePoints(dtoPts, 1e-6);
            if (ring.Count < 3) return null;

            // No usar CollapseColinearVertices aquí: en esquinas con vértices dobles (offset)
            // eliminaba un vértice y cerraba el polígono en diagonal (falso "no cerrada").
            return ring.Select(p => new acGeo.Point2d(p.X, p.Y)).ToList();
        }

        /// <summary>Recorre cada arista de la LWPOLY cerrada sin saltar vértices de esquina.</summary>
        private static void AppendClosedPolylinePerEdge(
            acDb.Polyline pl, double step, Action<double, double> add)
        {
            int nv = pl.NumberOfVertices;
            if (nv < 2) return;

            for (int i = 0; i < nv; i++)
            {
                double bulge = pl.GetBulgeAt(i);
                var p1 = pl.GetPoint2dAt(i);
                var p2 = pl.GetPoint2dAt((i + 1) % nv);
                bool omitFirst = i > 0;

                if (Math.Abs(bulge) >= BulgeIsArcTol)
                    SamplePolylineArc2d(p1, p2, bulge, step, omitFirst, add);
                else
                {
                    if (!omitFirst) add(p1.X, p1.Y);
                    add(p2.X, p2.Y);
                }
            }
        }

        private static List<Point2dDto> DeduplicateConsecutivePoints(List<Point2dDto> pts, double minDist)
        {
            if (pts.Count < 2) return pts;
            double t2 = minDist * minDist;
            var outPts = new List<Point2dDto>(pts.Count);
            foreach (var p in pts)
            {
                if (outPts.Count == 0)
                {
                    outPts.Add(p);
                    continue;
                }
                var last = outPts[outPts.Count - 1];
                double dx = p.X - last.X, dy = p.Y - last.Y;
                if (dx * dx + dy * dy > t2)
                    outPts.Add(p);
            }
            return outPts;
        }

        private static void EnsureRegApp(acDb.Database db, string app, acDb.Transaction tr)
        {
            var rat = (acDb.RegAppTable)tr.GetObject(db.RegAppTableId, acDb.OpenMode.ForRead);
            if (!rat.Has(app))
            {
                rat.UpgradeOpen();
                var rec = new acDb.RegAppTableRecord { Name = app };
                rat.Add(rec);
                tr.AddNewlyCreatedDBObject(rec, true);
            }
        }
        private static string SanitizeLayerName(string pk)
        {
            var n = (pk ?? "").Trim();
            if (n.Length == 0) n = "PK_UNNAMED";

            char[] bad = { '<', '>', '/', '\\', ':', ';', '?', '*', '|', '"', '=', ',' };
            foreach (var ch in bad) n = n.Replace(ch, '_');
            if (n.Length > 255) n = n.Substring(0, 255);
            return n;
        }

        private static void EnsureLayer(acDb.Database db, acDb.Transaction tr, string layerName)
        {
            var lt = (acDb.LayerTable)tr.GetObject(db.LayerTableId, acDb.OpenMode.ForRead);
            if (!lt.Has(layerName))
            {
                lt.UpgradeOpen();
                var lr = new acDb.LayerTableRecord { Name = layerName };
                lt.Add(lr);
                tr.AddNewlyCreatedDBObject(lr, true);
            }
        }
        public static void RebuildPkRegionIndex()
        {
            lock (_guard)
            {
                _idx.Clear();

                var doc = acApp.Application.DocumentManager.MdiActiveDocument;
                var db = doc?.Database;
                if (db == null) return;

                using var tr = db.TransactionManager.StartTransaction();
                // después
                var bt = (acDb.BlockTable)tr.GetObject(db.BlockTableId, acDb.OpenMode.ForRead);
                var ms = bt[acDb.BlockTableRecord.ModelSpace];
                var btr = (acDb.BlockTableRecord)tr.GetObject(ms, acDb.OpenMode.ForRead);

                foreach (acDb.ObjectId id in btr)
                {
                    if (tr.GetObject(id, acDb.OpenMode.ForRead, false, true) is not acDb.Region reg)
                        continue;

                    // XData → nombre del PK
                    string? pk = null;
                    var rb = reg.XData;
                    if (rb != null)
                    {
                        bool ok = false;
                        foreach (var tv in rb.AsArray())
                        {
                            if (tv.TypeCode == (int)acDb.DxfCode.ExtendedDataRegAppName &&
                                string.Equals(tv.Value as string, XDataApp, StringComparison.Ordinal))
                            { ok = true; continue; }

                            if (ok && tv.TypeCode == (int)acDb.DxfCode.ExtendedDataAsciiString)
                            { pk = tv.Value as string; break; }
                        }
                        rb.Dispose();
                    }

                    if (!string.IsNullOrWhiteSpace(pk))
                        _idx.Add((id, pk.Trim()));
                }

                tr.Commit();
            }
        }
        /// Punto medio geométrico de una entidad (curvas precisas, resto bbox-center).
        public static Autodesk.AutoCAD.Geometry.Point3d MidPointOf(acDb.Entity ent)
        {
            if (ent is acDb.Curve cv && !cv.Closed && !cv.IsPeriodic)
            {
                try
                {
                    double len = cv.GetDistanceAtParameter(cv.EndParam);
                    return cv.GetPointAtDist(len * 0.5);
                }
                catch { /* cae a centro de bbox */ }
            }

            var ext = ent.GeometricExtents;
            return new Autodesk.AutoCAD.Geometry.Point3d(
                0.5 * (ext.MinPoint.X + ext.MaxPoint.X),
                0.5 * (ext.MinPoint.Y + ext.MaxPoint.Y),
                0.5 * (ext.MinPoint.Z + ext.MaxPoint.Z));
        }

        /// Dado un ObjectId de entidad, intenta resolver PK por su punto medio.
        public static bool TryGetPkForEntity(acDb.ObjectId entId, out string pk)
        {
            pk = "";
            var doc = acApp.Application.DocumentManager.MdiActiveDocument;
            var db = doc?.Database;
            if (db == null) return false;

            using var tr = db.TransactionManager.StartTransaction();
            var ent = tr.GetObject(entId, acDb.OpenMode.ForRead) as acDb.Entity;
            if (ent == null) return false;

            var p = MidPointOf(ent);
            tr.Commit();

            return TryGetPkForPoint(p, out pk);
        }
        // === PK_ID por punto medio en XY ===
        public static bool TryGetPkForPoint(Autodesk.AutoCAD.Geometry.Point3d p3d, out string pk)
        {
            pk = "";
            var doc = acApp.Application.DocumentManager.MdiActiveDocument;
            var db = doc?.Database;
            if (db == null) return false;

            var p = new Autodesk.AutoCAD.Geometry.Point2d(p3d.X, p3d.Y);

            using var tr = db.TransactionManager.StartTransaction();
            // después
            var bt = (acDb.BlockTable)tr.GetObject(db.BlockTableId, acDb.OpenMode.ForRead);
            var ms = bt[acDb.BlockTableRecord.ModelSpace];
            var btr = (acDb.BlockTableRecord)tr.GetObject(ms, acDb.OpenMode.ForRead);

            foreach (acDb.ObjectId id in btr)
            {
                if (tr.GetObject(id, acDb.OpenMode.ForRead, false, true) is not acDb.Region reg)
                    continue;

                // leer XDATA “SICOE_PK” = nombre del PK_ID
                string? pkName = ReadPkNameFromXData(reg);
                if (string.IsNullOrWhiteSpace(pkName)) continue;

                // prueba de contención: explotar contornos y evaluar en XY
                using var pieces = new acDb.DBObjectCollection();
                reg.Explode(pieces);

                var segs = new List<acDb.Curve>();
                foreach (acDb.DBObject o in pieces)
                {
                    if (o is acDb.Curve cv) segs.Add(cv);
                    else o.Dispose();
                }

                // reconstruir anillos a partir de segmentos
                foreach (var loop in BuildLoops(segs, 1e-4, 0.5)) // usa el mismo helper de Export
                {
                    // prueba de contención en 2D
                    if (PointInPoly(p, loop.Select(q => new acGeo.Point2d(q.X, q.Y))))
                    {
                        pk = pkName!.Trim();
                        foreach (var cv in segs) cv.Dispose();
                        tr.Commit();
                        return true;
                    }
                }

                // liberar
                foreach (var cv in segs) cv.Dispose();

                // si algún contorno contiene al punto → listo
                foreach (acDb.DBObject o in pieces)
                {
                    if (o is not acDb.Entity e) { o.Dispose(); continue; }

                    bool inside = e switch
                    {
                        acDb.Polyline pl when pl.Closed => PointInPoly(p, Vertices(pl)),
                        acDb.Circle c => p.GetDistanceTo(new Autodesk.AutoCAD.Geometry.Point2d(c.Center.X, c.Center.Y)) <= c.Radius + 1e-6,
                        acDb.Ellipse el when el.Closed => IsInsideEllipse(p, el),
                        acDb.Spline sp when sp.Closed => PointInPoly(p, Sample(sp, 72)),
                        _ => false
                    };

                    e.Dispose();
                    if (inside) { pk = pkName!.Trim(); tr.Commit(); return true; }
                }
            }

            tr.Commit();
            return false;

            // --- helpers locales ---
            static string? ReadPkNameFromXData(acDb.Entity ent)
            {
                using var rb = ent.XData;
                if (rb == null) return null;
                bool ok = false;
                foreach (var tv in rb.AsArray())
                {
                    if (tv.TypeCode == (int)acDb.DxfCode.ExtendedDataRegAppName &&
                        string.Equals(tv.Value as string, XDataApp, StringComparison.OrdinalIgnoreCase)) { ok = true; continue; }
                    if (ok && tv.TypeCode == (int)acDb.DxfCode.ExtendedDataAsciiString)
                        return tv.Value as string;
                }
                return null;
            }

            static IEnumerable<Autodesk.AutoCAD.Geometry.Point2d> Vertices(acDb.Polyline pl)
            {
                for (int i = 0; i < pl.NumberOfVertices; i++)
                {
                    var p = pl.GetPoint3dAt(i);
                    yield return new Autodesk.AutoCAD.Geometry.Point2d(p.X, p.Y);
                }
            }
            static IEnumerable<Autodesk.AutoCAD.Geometry.Point2d> Sample(acDb.Spline sp, int n)
            {
                n = Math.Max(16, Math.Min(256, n));
                double t0 = sp.StartParam, t1 = sp.EndParam, dt = (t1 - t0) / n;
                for (double t = t0; t <= t1 + 1e-9; t += dt)
                {
                    var p = sp.GetPointAtParameter(t);
                    yield return new Autodesk.AutoCAD.Geometry.Point2d(p.X, p.Y);
                }
            }
            static bool IsInsideEllipse(Autodesk.AutoCAD.Geometry.Point2d p, acDb.Ellipse el)
            {
                var cen = new Autodesk.AutoCAD.Geometry.Point2d(el.Center.X, el.Center.Y);
                var major = new Autodesk.AutoCAD.Geometry.Vector2d(el.MajorAxis.X, el.MajorAxis.Y);
                var minor = new Autodesk.AutoCAD.Geometry.Vector2d(-major.Y, major.X).GetNormal().MultiplyBy(el.MinorRadius);
                major = major.GetNormal().MultiplyBy(el.MajorRadius);

                // transformar a coords de la elipse
                var v = p - cen;
                double a = major.Length, b = minor.Length;
                var ex = major.GetNormal(); var ey = minor.GetNormal();
                double x = v.DotProduct(ex), y = v.DotProduct(ey);
                return (x * x) / (a * a) + (y * y) / (b * b) <= 1.0 + 1e-6;
            }
            static bool PointInPoly(Autodesk.AutoCAD.Geometry.Point2d p, IEnumerable<Autodesk.AutoCAD.Geometry.Point2d> poly)
            {
                // ray casting
                bool inside = false;
                var pts = poly.ToList();
                if (pts.Count < 3) return false;
                for (int i = 0, j = pts.Count - 1; i < pts.Count; j = i++)
                {
                    var pi = pts[i]; var pj = pts[j];
                    bool inter = ((pi.Y > p.Y) != (pj.Y > p.Y)) &&
                                 (p.X < (pj.X - pi.X) * (p.Y - pi.Y) / ((pj.Y - pi.Y) == 0 ? 1e-9 : (pj.Y - pi.Y)) + pi.X);
                    if (inter) inside = !inside;
                }
                return inside;
            }
        }

        // ============================================================================
        // Export GeoJSON/JSON: muestreo inteligente (rectas = 2 pts, curvas cada step m)
        // ============================================================================

        private static double RoundExport(double v) =>
            Math.Round(v, ExportCoordDecimals, MidpointRounding.AwayFromZero);

        private static Point2dDto PtDto(double x, double y) =>
            new(RoundExport(x), RoundExport(y));

        private static List<List<Point2dDto>> BuildLoopsForExport(
            List<acDb.Curve> segs, double tol, double step)
        {
            var work = NormalizeExplodedSegments(segs, tol);
            var loops = new List<List<Point2dDto>>();
            try
            {
            var used = new HashSet<int>();
            var T = new acGeo.Tolerance(tol, tol);

            for (int k = 0; k < work.Count; k++)
            {
                if (used.Contains(k)) continue;

                var loop = new List<Point2dDto>();
                int curr = k;
                used.Add(curr);

                var pCursor = work[curr].EndPoint;
                AppendCurveSample2d(work[curr], step, loop, forward: true, omitFirst: false);

                while (true)
                {
                    int nxt = -1;
                    bool fwd = true;

                    for (int j = 0; j < work.Count; j++)
                    {
                        if (used.Contains(j) || j == curr) continue;

                        var s = work[j].StartPoint;
                        var e = work[j].EndPoint;

                        if (s.IsEqualTo(pCursor, T)) { nxt = j; fwd = true; break; }
                        if (e.IsEqualTo(pCursor, T)) { nxt = j; fwd = false; break; }
                    }

                    if (nxt < 0) break;

                    AppendCurveSample2d(work[nxt], step, loop, forward: fwd, omitFirst: true);
                    pCursor = fwd ? work[nxt].EndPoint : work[nxt].StartPoint;
                    used.Add(nxt);

                    if (loop.Count > 3)
                    {
                        var p0 = loop[0];
                        var pN = loop[loop.Count - 1];
                        double dx = pN.X - p0.X, dy = pN.Y - p0.Y;
                        if (dx * dx + dy * dy < tol * tol) break;
                    }
                    curr = nxt;
                }

                if (loop.Count >= 3)
                    loops.Add(CompressExportLoop(CollapseColinearVertices(loop), tol));
            }
            }
            finally
            {
                var kept = new HashSet<acDb.Curve>(work);
                foreach (var c in segs)
                {
                    if (!c.IsDisposed && !kept.Contains(c))
                        c.Dispose();
                }
                foreach (var c in work)
                {
                    if (!c.IsDisposed)
                        c.Dispose();
                }
            }

            return loops;
        }

        /// <summary>
        /// Tras Region.Explode: encadena piezas, fusiona líneas colineales contiguas
        /// (evita un vértice por micro-segmento en rectas) y deja arcos/splines intactos.
        /// </summary>
        private static List<acDb.Curve> NormalizeExplodedSegments(List<acDb.Curve> segs, double tol)
        {
            if (segs == null || segs.Count == 0)
                return new List<acDb.Curve>();

            var chainTol = Math.Max(tol, 0.02);
            var T = new acGeo.Tolerance(chainTol, chainTol);
            var ordered = ChainCurvesForExport(segs, T);
            var result = new List<acDb.Curve>();
            acGeo.Point3d? runA = null;
            acGeo.Point3d? runB = null;

            void FlushRun()
            {
                if (!runA.HasValue || !runB.HasValue) return;
                if (runA.Value.DistanceTo(runB.Value) < tol)
                {
                    runA = runB = null;
                    return;
                }
                result.Add(new acDb.Line(runA.Value, runB.Value));
                runA = runB = null;
            }

            foreach (var c in ordered)
            {
                if (c is acDb.Line ln)
                {
                    var a = ln.StartPoint;
                    var b = ln.EndPoint;
                    if (!runA.HasValue)
                    {
                        runA = a;
                        runB = b;
                    }
                    else if (runB.Value.IsEqualTo(a, T) && AreColinear3d(runA.Value, runB.Value, b, tol))
                    {
                        runB = b;
                    }
                    else if (runB.Value.IsEqualTo(b, T) && AreColinear3d(runA.Value, runB.Value, a, tol))
                    {
                        runB = a;
                    }
                    else
                    {
                        FlushRun();
                        runA = a;
                        runB = b;
                    }
                    ln.Dispose();
                }
                else
                {
                    FlushRun();
                    result.Add(c);
                }
            }

            FlushRun();
            return result;
        }

        private static List<acDb.Curve> ChainCurvesForExport(List<acDb.Curve> segs, acGeo.Tolerance T)
        {
            if (segs.Count <= 1) return new List<acDb.Curve>(segs);

            var remaining = new List<acDb.Curve>(segs);
            var ordered = new List<acDb.Curve> { remaining[0] };
            remaining.RemoveAt(0);

            while (remaining.Count > 0)
            {
                var endPt = ordered[ordered.Count - 1].EndPoint;
                int pick = -1;
                bool rev = false;

                for (int i = 0; i < remaining.Count; i++)
                {
                    var c = remaining[i];
                    if (c.StartPoint.IsEqualTo(endPt, T)) { pick = i; rev = false; break; }
                    if (c.EndPoint.IsEqualTo(endPt, T)) { pick = i; rev = true; break; }
                }

                if (pick < 0) break;

                var seg = remaining[pick];
                remaining.RemoveAt(pick);

                if (rev)
                {
                    if (seg is acDb.Line ln)
                    {
                        var nl = new acDb.Line(ln.EndPoint, ln.StartPoint);
                        ln.Dispose();
                        seg = nl;
                    }
                    else if (seg is acDb.Arc ar)
                    {
                        try
                        {
                            var nar = new acDb.Arc(ar.Center, ar.Radius, ar.EndAngle, ar.StartAngle);
                            ar.Dispose();
                            seg = nar;
                        }
                        catch { /* mantener original */ }
                    }
                }

                ordered.Add(seg);
            }

            ordered.AddRange(remaining);
            return ordered;
        }

        private static bool AreColinear3d(acGeo.Point3d a, acGeo.Point3d b, acGeo.Point3d c, double tol)
        {
            var v1 = b - a;
            var v2 = c - b;
            if (v1.Length < tol || v2.Length < tol) return true;
            double cross = v1.CrossProduct(v2).Length;
            return cross / Math.Max(v1.Length * v2.Length, tol) < ColinearSinTol;
        }

        private static bool AreColinear2d(acGeo.Point2d a, acGeo.Point2d b, acGeo.Point2d c, double tol)
        {
            double v1x = b.X - a.X, v1y = b.Y - a.Y;
            double v2x = c.X - b.X, v2y = c.Y - b.Y;
            double l1 = Math.Sqrt(v1x * v1x + v1y * v1y);
            double l2 = Math.Sqrt(v2x * v2x + v2y * v2y);
            // Tramo degenerado: no colapsar el vértice intermedio (es esquina o vértice doble).
            if (l1 < tol || l2 < tol) return false;
            double cross = Math.Abs(v1x * v2y - v1y * v2x);
            return cross / Math.Max(l1 * l2, tol) < ColinearSinTol;
        }

        private static bool AreColinear2d(Point2dDto a, Point2dDto b, Point2dDto c, double tol) =>
            AreColinear2d(new acGeo.Point2d(a.X, a.Y), new acGeo.Point2d(b.X, b.Y), new acGeo.Point2d(c.X, c.Y), tol);

        /// <summary>True si la entidad es geométricamente un segmento recto (aunque sea Arc/Spline en el DWG).</summary>
        private static bool CurveIsEffectivelyStraight(acDb.Curve c)
        {
            try
            {
                var a = c.StartPoint;
                var b = c.EndPoint;
                double chord = a.DistanceTo(b);
                if (chord < 1e-6) return true;

                double len = c.GetDistanceAtParameter(c.EndParam) - c.GetDistanceAtParameter(c.StartParam);
                if (len < 1e-6) return true;

                return Math.Abs(len - chord) / chord <= StraightLenRelTol;
            }
            catch
            {
                return CurveIsNearlyLinear(c, 1e-3);
            }
        }

        private static void AppendStraightEndpoints2d(
            acDb.Curve c, bool forward, bool omitFirst, Action<double, double> add)
        {
            var a = forward ? c.StartPoint : c.EndPoint;
            var b = forward ? c.EndPoint : c.StartPoint;
            if (!omitFirst) add(a.X, a.Y);
            add(b.X, b.Y);
        }

        private static void AppendCurveSample2d(
            acDb.Curve c, double step, List<Point2dDto> outPts, bool forward, bool omitFirst)
        {
            if (CurveIsEffectivelyStraight(c))
            {
                AppendStraightEndpoints2d(c, forward, omitFirst, (x, y) =>
                {
                    var pt = PtDto(x, y);
                    if (outPts.Count > 0)
                    {
                        var last = outPts[outPts.Count - 1];
                        if ((pt.X - last.X) * (pt.X - last.X) + (pt.Y - last.Y) * (pt.Y - last.Y) < 1e-12)
                            return;
                    }
                    outPts.Add(pt);
                });
                return;
            }

            void Add(double x, double y)
            {
                var pt = PtDto(x, y);
                if (outPts.Count > 0)
                {
                    var last = outPts[outPts.Count - 1];
                    double dx = pt.X - last.X, dy = pt.Y - last.Y;
                    if (dx * dx + dy * dy < 1e-12) return;
                }
                outPts.Add(pt);
            }

            switch (c)
            {
                case acDb.Line ln:
                    AppendStraightEndpoints2d(ln, forward, omitFirst, Add);
                    break;

                case acDb.Polyline pl:
                    AppendPolylineSamples2d(pl, step, forward, omitFirst, Add);
                    break;

                case acDb.Arc:
                case acDb.Spline:
                case acDb.Ellipse:
                    SampleCurveByDistance2d(c, step, forward, omitFirst, Add);
                    break;

                case acDb.Circle circ:
                    SampleCircleByDistance2d(circ, step, forward, omitFirst, Add);
                    break;

                default:
                    SampleCurveByDistance2d(c, step, forward, omitFirst, Add);
                    break;
            }
        }

        /// <summary>
        /// Polilínea: fusiona tramos rectos colineales (solo inicio/fin del tramo) y arcos cada step m.
        /// </summary>
        private static void AppendPolylineSamples2d(
            acDb.Polyline pl, double step, bool forward, bool omitFirst, Action<double, double> add)
        {
            int nv = pl.NumberOfVertices;
            if (nv < 2) return;

            int segCount = pl.Closed ? nv : nv - 1;
            bool needStart = !omitFirst;
            int si = 0;

            while (si < segCount)
            {
                int vi = forward ? si : segCount - 1 - si;
                double bulge = forward ? pl.GetBulgeAt(vi) : -pl.GetBulgeAt(vi);

                if (Math.Abs(bulge) >= BulgeIsArcTol)
                {
                    var p1 = forward ? pl.GetPoint2dAt(vi) : pl.GetPoint2dAt((vi + 1) % nv);
                    var p2 = forward ? pl.GetPoint2dAt((vi + 1) % nv) : pl.GetPoint2dAt(vi);
                    SamplePolylineArc2d(p1, p2, bulge, step, needStart, add);
                    needStart = false;
                    si++;
                    continue;
                }

                var runStart = forward ? pl.GetPoint2dAt(vi) : pl.GetPoint2dAt((vi + 1) % nv);
                var runEnd = runStart;
                int sj = si + 1;

                while (sj < segCount)
                {
                    int vj = forward ? sj : segCount - 1 - sj;
                    if (Math.Abs(forward ? pl.GetBulgeAt(vj) : -pl.GetBulgeAt(vj)) >= BulgeIsArcTol)
                        break;

                    var nextEnd = forward
                        ? pl.GetPoint2dAt((vj + 1) % nv)
                        : pl.GetPoint2dAt(vj);

                    if (sj > si && !AreColinear2d(runStart, runEnd, nextEnd, 1e-4))
                        break;

                    runEnd = nextEnd;
                    sj++;
                }

                if (needStart) add(runStart.X, runStart.Y);
                add(runEnd.X, runEnd.Y);
                needStart = false;
                si = sj;
            }
        }

        private static void SamplePolylineArc2d(
            acGeo.Point2d p1, acGeo.Point2d p2, double bulge, double step,
            bool omitFirst, Action<double, double> add)
        {
            if (Math.Abs(bulge) < BulgeIsArcTol)
            {
                if (!omitFirst) add(p1.X, p1.Y);
                add(p2.X, p2.Y);
                return;
            }

            try
            {
                var arc = new acGeo.CircularArc2d(p1, p2, bulge, false);
                double a0 = arc.StartAngle;
                double a1 = arc.EndAngle;
                double len = arc.Radius * Math.Abs(a1 - a0);
                if (len < 1e-9) return;

                double chord = p1.GetDistanceTo(p2);
                if (chord > 1e-6 && Math.Abs(len - chord) / chord <= StraightLenRelTol)
                {
                    if (!omitFirst) add(p1.X, p1.Y);
                    add(p2.X, p2.Y);
                    return;
                }

                double s = Math.Max(MinCurveSampleStep, step);
                for (double d = 0; d <= len + 1e-6; d += s)
                {
                    if (d < 1e-9 && omitFirst) continue;
                    double frac = Math.Min(1.0, d / len);
                    double ang = a0 + (a1 - a0) * frac;
                    var p = arc.EvaluatePoint(ang);
                    add(p.X, p.Y);
                }
            }
            catch
            {
                if (!omitFirst) add(p1.X, p1.Y);
                add(p2.X, p2.Y);
            }
        }

        private static void SampleCircleByDistance2d(
            acDb.Circle circ, double step, bool forward, bool omitFirst, Action<double, double> add)
        {
            double clen = 2.0 * Math.PI * circ.Radius;
            if (clen < 1e-9) return;

            double s = Math.Max(MinCurveSampleStep, step);
            for (double d = 0; d <= clen + 1e-6; d += s)
            {
                if (d < 1e-9 && omitFirst) continue;
                double frac = Math.Min(1.0, d / clen);
                double ang = forward ? 2.0 * Math.PI * frac : 2.0 * Math.PI * (1.0 - frac);
                var p = circ.Center + new acGeo.Vector3d(
                    Math.Cos(ang) * circ.Radius,
                    Math.Sin(ang) * circ.Radius,
                    0);
                add(p.X, p.Y);
            }
        }

        private static void SampleCurveByDistance2d(
            acDb.Curve c, double step, bool forward, bool omitFirst, Action<double, double> add)
        {
            if (CurveIsEffectivelyStraight(c))
            {
                AppendStraightEndpoints2d(c, forward, omitFirst, add);
                return;
            }

            double len;
            try
            {
                len = c.GetDistanceAtParameter(c.EndParam) - c.GetDistanceAtParameter(c.StartParam);
            }
            catch
            {
                len = 0;
            }

            if (len < 1e-9) return;

            double s = Math.Max(MinCurveSampleStep, step);
            for (double d = 0; d <= len + 1e-6; d += s)
            {
                if (d < 1e-9 && omitFirst) continue;

                double dist = forward ? d : len - d;

                try
                {
                    var p = c.GetPointAtDist(dist);
                    add(p.X, p.Y);
                }
                catch
                {
                    double frac = Math.Min(1.0, d / len);
                    double t = forward
                        ? c.StartParam + (c.EndParam - c.StartParam) * frac
                        : c.EndParam - (c.EndParam - c.StartParam) * frac;
                    var p = c.GetPointAtParameter(t);
                    add(p.X, p.Y);
                }
            }
        }

        private static bool CurveIsNearlyLinear(acDb.Curve c, double tol = 1e-4)
        {
            try
            {
                var a = c.StartPoint;
                var b = c.EndPoint;
                double chord = a.DistanceTo(b);
                if (chord < tol) return true;

                double tMid = (c.StartParam + c.EndParam) * 0.5;
                var m = c.GetPointAtParameter(tMid);
                var ab = b - a;
                var am = m - a;
                double cross = ab.CrossProduct(am).Length;
                return cross / Math.Max(chord, tol) < tol;
            }
            catch
            {
                return false;
            }
        }

        /// <summary>Elimina vértices intermedios en tramos rectos del anillo (p. ej. polilínea densa en CAD).</summary>
        private static List<Point2dDto> CollapseColinearVertices(List<Point2dDto> pts, double tol = 1e-3)
        {
            if (pts.Count < 3) return pts;

            var outPts = new List<Point2dDto>(pts.Count);
            int n = pts.Count;
            bool closed = Math.Abs(pts[0].X - pts[n - 1].X) < 1e-9 &&
                            Math.Abs(pts[0].Y - pts[n - 1].Y) < 1e-9;
            int count = closed ? n - 1 : n;
            if (count < 2) return pts;

            for (int i = 0; i < count; i++)
            {
                var prev = pts[(i - 1 + count) % count];
                var cur = pts[i];
                var next = pts[(i + 1) % count];
                if (AreColinear2d(prev, cur, next, tol))
                    continue;
                outPts.Add(cur);
            }

            if (outPts.Count < 2) return pts;
            if (closed)
            {
                var a = outPts[0];
                var b = outPts[outPts.Count - 1];
                if (Math.Abs(a.X - b.X) > 1e-9 || Math.Abs(a.Y - b.Y) > 1e-9)
                    outPts.Add(a);
            }
            return outPts;
        }

        private static List<Point2dDto> CompressExportLoop(List<Point2dDto> pts, double tol)
        {
            if (pts.Count < 2) return pts;

            var outPts = new List<Point2dDto>(pts.Count);
            Point2dDto? last = null;
            double t2 = tol * tol;

            foreach (var p in pts)
            {
                if (last == null)
                {
                    outPts.Add(p);
                    last = p;
                    continue;
                }

                double dx = p.X - last.X, dy = p.Y - last.Y;
                if (dx * dx + dy * dy > t2)
                {
                    outPts.Add(p);
                    last = p;
                }
            }

            if (outPts.Count > 2)
            {
                var a = outPts[0];
                var b = outPts[outPts.Count - 1];
                double dx = b.X - a.X, dy = b.Y - a.Y;
                if (dx * dx + dy * dy > t2)
                    outPts.Add(a);
            }

            return outPts;
        }

        public static int ExportPkRegionsToGeoJson(string path, double splineStep = 0.5)
        {
            var db = acApp.Application.DocumentManager.MdiActiveDocument?.Database;
            if (db == null) return 0;

            var features = new List<object>();

            using var tr = db.TransactionManager.StartTransaction();
            var bt = (acDb.BlockTable)tr.GetObject(db.BlockTableId, acDb.OpenMode.ForRead);
            var msId = bt[acDb.BlockTableRecord.ModelSpace];
            var btr = (acDb.BlockTableRecord)tr.GetObject(msId, acDb.OpenMode.ForRead);

            foreach (acDb.ObjectId id in btr)
            {
                if (tr.GetObject(id, acDb.OpenMode.ForRead, false, true) is not acDb.Region reg)
                    continue;

                string? pk = ReadPkName(reg);
                if (string.IsNullOrWhiteSpace(pk)) pk = reg.Layer;
                if (string.IsNullOrWhiteSpace(pk)) continue;

                var dto = new PkRegionDto { PkId = pk.Trim() };
                using (var pieces = new acDb.DBObjectCollection())
                {
                    reg.Explode(pieces);
                    var segs = new List<acDb.Curve>();
                    foreach (acDb.DBObject o in pieces)
                    {
                        if (o is acDb.Curve cv) segs.Add(cv);
                        else o.Dispose();
                    }
                    foreach (var loop in BuildLoopsForExport(segs, 1e-4, splineStep))
                        if (loop.Count >= 3)
                            dto.Loops.Add(loop);
                }

                if (dto.Loops.Count == 0) continue;

                // Convertir coordenadas MAGNA-SIRGAS 3116 → WGS84 4326
                var rings = dto.Loops.Select(loop =>
                    loop.Select(p => MagnaToWgs84(p.X, p.Y)).ToList()
                ).ToList();

                // Cerrar cada anillo si no está cerrado
                foreach (var ring in rings)
                {
                    if (ring.Count > 0)
                    {
                        var first = ring[0];
                        var last = ring[ring.Count - 1];
                        if (Math.Abs(first[0] - last[0]) > 1e-9 || Math.Abs(first[1] - last[1]) > 1e-9)
                            ring.Add(first);
                    }
                }

                features.Add(new
                {
                    type = "Feature",
                    properties = new { pk_id = dto.PkId },
                    geometry = new
                    {
                        type = "Polygon",
                        coordinates = rings
                    }
                });
            }
            // Agregar textos del abscisado como puntos
            var capasAbscisado = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "Txt_Abs_Unica", "Txt_Abs_CalzA", "Txt_Abs_CalzB"
            };

            foreach (acDb.ObjectId id in btr)
            {
                if (tr.GetObject(id, acDb.OpenMode.ForRead, false, true)
                    is not acDb.DBText txt) continue;

                if (!capasAbscisado.Contains(txt.Layer)) continue;
                if (string.IsNullOrWhiteSpace(txt.TextString)) continue;

                var wgs = MagnaToWgs84(txt.Position.X, txt.Position.Y);

                features.Add(new
                {
                    type = "Feature",
                    properties = new
                    {
                        tipo = "abscisa",
                        etiqueta = txt.TextString,
                        capa = txt.Layer
                    },
                    geometry = new
                    {
                        type = "Point",
                        coordinates = wgs
                    }
                });
            }

            tr.Commit();

            var geojson = new
            {
                type = "FeatureCollection",
                features
            };

            System.IO.File.WriteAllText(path,
                JsonConvert.SerializeObject(geojson, Newtonsoft.Json.Formatting.Indented),
                System.Text.Encoding.UTF8);

            return features.Count;
        }

        // Conversión MAGNA-SIRGAS Colombia Bogotá (EPSG:3116) → WGS84 (EPSG:4326)
        // Usa la fórmula de Transverse Mercator inversa
        private static double[] MagnaToWgs84(double easting, double northing)
        {
            // Parámetros EPSG:3116 — MAGNA-SIRGAS / Colombia Bogota zone
            // Fuente: gdalsrsinfo EPSG:3116 — máxima precisión
            const double a = 6378137.0;
            const double f = 1.0 / 298.257222101;
            const double k0 = 1.0;
            const double E0 = 1000000.0;
            const double N0 = 1000000.0;
            const double lon0 = -74.0775079166667 * Math.PI / 180.0;
            const double lat0 = 4.59620041666667 * Math.PI / 180.0;

            double e2 = 2 * f - f * f;
            double e = Math.Sqrt(e2);
            double e4 = e2 * e2;
            double e6 = e2 * e4;

            double x = easting - E0;
            double y = northing - N0;

            // M0 — meridional arc en lat0
            double M0 = a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * lat0
                           - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.Sin(2 * lat0)
                           + (15 * e4 / 256 + 45 * e6 / 1024) * Math.Sin(4 * lat0)
                           - (35 * e6 / 3072) * Math.Sin(6 * lat0));

            double M = M0 + y / k0;
            double mu = M / (a * (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256));

            double e1 = (1 - Math.Sqrt(1 - e2)) / (1 + Math.Sqrt(1 - e2));
            double phi1 = mu
                + (3 * e1 / 2 - 27 * e1 * e1 * e1 / 32) * Math.Sin(2 * mu)
                + (21 * e1 * e1 / 16 - 55 * e1 * e1 * e1 * e1 / 32) * Math.Sin(4 * mu)
                + (151 * e1 * e1 * e1 / 96) * Math.Sin(6 * mu)
                + (1097 * e1 * e1 * e1 * e1 / 512) * Math.Sin(8 * mu);

            double N1 = a / Math.Sqrt(1 - e2 * Math.Sin(phi1) * Math.Sin(phi1));
            double T1 = Math.Tan(phi1) * Math.Tan(phi1);
            double C1 = e2 / (1 - e2) * Math.Cos(phi1) * Math.Cos(phi1);
            double R1 = a * (1 - e2) / Math.Pow(1 - e2 * Math.Sin(phi1) * Math.Sin(phi1), 1.5);
            double D = x / (N1 * k0);

            double lat = phi1
                - (N1 * Math.Tan(phi1) / R1)
                * (D * D / 2
                   - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * e2 / (1 - e2)) * D * D * D * D / 24
                   + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * e2 / (1 - e2) - 3 * C1 * C1) * D * D * D * D * D * D / 720);

            double lon = lon0
                + (D
                   - (1 + 2 * T1 + C1) * D * D * D / 6
                   + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * e2 / (1 - e2) + 24 * T1 * T1) * D * D * D * D * D / 120)
                / Math.Cos(phi1);

            return new double[] {
                RoundExport(lon * 180.0 / Math.PI),
                RoundExport(lat * 180.0 / Math.PI)
            };
        }

        public static int ExportPkRegionsToJson(string path, double splineStep = 0.5)
        {
            var db = acApp.Application.DocumentManager.MdiActiveDocument?.Database;
            if (db == null) return 0;

            var list = new List<PkRegionDto>();

            using var tr = db.TransactionManager.StartTransaction();
            var bt = (acDb.BlockTable)tr.GetObject(db.BlockTableId, acDb.OpenMode.ForRead);
            var msId = bt[acDb.BlockTableRecord.ModelSpace];
            var btr = (acDb.BlockTableRecord)tr.GetObject(msId, acDb.OpenMode.ForRead);

            foreach (acDb.ObjectId id in btr)
            {
                if (tr.GetObject(id, acDb.OpenMode.ForRead, false, true) is not acDb.Region reg)
                    continue;

                // nombre PK: XDATA si existe, si no, nombre de capa
                string? pk = ReadPkName(reg);
                if (string.IsNullOrWhiteSpace(pk)) pk = reg.Layer;
                if (string.IsNullOrWhiteSpace(pk)) continue;

                var dto = new PkRegionDto { PkId = pk.Trim() };
                using (var pieces = new acDb.DBObjectCollection())
                {
                    reg.Explode(pieces);
                    var segs = new List<acDb.Curve>();
                    foreach (acDb.DBObject o in pieces)
                    {
                        if (o is acDb.Curve cv) segs.Add(cv);
                        else o.Dispose();
                    }

                    foreach (var loop in BuildLoopsForExport(segs, 1e-4, splineStep))
                    {
                        if (loop.Count >= 3)
                            dto.Loops.Add(loop);
                    }
                }

                if (dto.Loops.Count > 0) list.Add(dto);
            }
            tr.Commit();

            System.IO.File.WriteAllText(path, JsonConvert.SerializeObject(list, Newtonsoft.Json.Formatting.Indented));
            return list.Count;

        }
        // Simplificación Douglas-Peucker en coordenadas WGS84
        private static List<Point2dDto> SimplifyRing(List<Point2dDto> pts, double tolerance)
        {
            if (pts.Count <= 4) return pts;
            var result = DouglasPeucker(pts, tolerance);
            // garantizar cierre
            if (result.Count > 0)
            {
                var f = result[0]; var l = result[result.Count - 1];
                if (Math.Abs(f.X - l.X) > 1e-9 || Math.Abs(f.Y - l.Y) > 1e-9)
                    result.Add(f);
            }
            return result;
        }

        private static List<Point2dDto> DouglasPeucker(List<Point2dDto> pts, double tol)
        {
            if (pts.Count < 3) return pts;
            double maxDist = 0; int idx = 0;
            var first = pts[0]; var last = pts[pts.Count - 1];
            double dx = last.X - first.X, dy = last.Y - first.Y;
            double len = Math.Sqrt(dx * dx + dy * dy);

            for (int i = 1; i < pts.Count - 1; i++)
            {
                double d = len < 1e-12
                    ? Math.Sqrt(Math.Pow(pts[i].X - first.X, 2) + Math.Pow(pts[i].Y - first.Y, 2))
                    : Math.Abs(dy * (pts[i].X - first.X) - dx * (pts[i].Y - first.Y)) / len;
                if (d > maxDist) { maxDist = d; idx = i; }
            }

            if (maxDist > tol)
            {
                var left = DouglasPeucker(pts.GetRange(0, idx + 1), tol);
                var right = DouglasPeucker(pts.GetRange(idx, pts.Count - idx), tol);
                left.RemoveAt(left.Count - 1);
                left.AddRange(right);
                return left;
            }
            return new List<Point2dDto> { first, last };
        }
        public static int ImportPkRegionsFromJson(string path)
        {
            if (!System.IO.File.Exists(path)) return 0;
            var json = System.IO.File.ReadAllText(path);
            var list = JsonConvert.DeserializeObject<List<PkRegionDto>>(json) ?? new List<PkRegionDto>();

            var doc = acApp.Application.DocumentManager.MdiActiveDocument;
            var db = doc?.Database;
            if (db == null || list.Count == 0) return 0;

            using (doc.LockDocument())
            using (var tr = db.TransactionManager.StartTransaction())
            {
                var btr = (BlockTableRecord)tr.GetObject(db.CurrentSpaceId, OpenMode.ForWrite);

                int ok = 0;
                foreach (var reg in list)
                {
                    string pk = (reg?.PkId ?? "").Trim();
                    if (pk.Length == 0) continue;

                    foreach (var loop in reg.Loops ?? new List<List<Point2dDto>>())
                    {
                        if (reg.Loops == null || reg.Loops.Count == 0) continue;

                        // Usa solo el primer loop (contorno principal)
                        var firstLoop = reg.Loops[0];
                        var raw = firstLoop?.Select(p => new acGeo.Point2d(p.X, p.Y)).ToList() ?? new();
                        if (raw.Count < 3) continue;

                        // Dedupe y cierre
                        const double tol = 1e-3;
                        var pts = new List<acGeo.Point2d>(raw.Count + 1);
                        acGeo.Point2d? last = null;
                        foreach (var q in raw)
                        {
                            if (double.IsNaN(q.X) || double.IsNaN(q.Y) ||
                                double.IsInfinity(q.X) || double.IsInfinity(q.Y)) continue;

                            if (last == null || (q - last.Value).LengthSqrd > tol * tol)
                            {
                                pts.Add(q);
                                last = q;
                            }
                        }
                        if (pts.Count < 3) continue;
                        if ((pts[0] - pts[pts.Count - 1]).LengthSqrd > tol * tol) pts.Add(pts[0]);

                        // Crear polilínea cerrada
                        var pl = new acDb.Polyline(pts.Count - 1);
                        for (int i = 0; i < pts.Count - 1; i++)
                            pl.AddVertexAt(i, pts[i], 0, 0, 0);
                        pl.Closed = true;
                        btr.AppendEntity(pl);
                        tr.AddNewlyCreatedDBObject(pl, true);

                        // Crear región asociada
                        var curves = new acDb.DBObjectCollection(); curves.Add(pl);
                        acDb.Region regEnt;
                        try
                        {
                            var regs = acDb.Region.CreateFromCurves(curves);
                            if (regs == null || regs.Count == 0) continue;
                            regEnt = (acDb.Region)regs[0];
                        }
                        catch (Autodesk.AutoCAD.Runtime.Exception)
                        {
                            continue; // loop inválido
                        }

                        // Asignar capa y XData
                        var layer = SanitizeLayerName(pk);
                        EnsureLayer(db, tr, layer);
                        regEnt.Layer = layer;

                        EnsureRegApp(db, XDataApp, tr);
                        using (var rb = new acDb.ResultBuffer(
                            new acDb.TypedValue((int)acDb.DxfCode.ExtendedDataRegAppName, XDataApp),
                            new acDb.TypedValue((int)acDb.DxfCode.ExtendedDataAsciiString, pk)))
                        {
                            regEnt.XData = rb;
                        }

                        btr.AppendEntity(regEnt);
                        tr.AddNewlyCreatedDBObject(regEnt, true);

                        // contar 1 import por región
                        ok++;



                    }
                }
                tr.Commit();
                return ok;


            }

        }
        public static int DebugDumpPkRegions(out List<string> names)
        {
            names = new();
            var db = acApp.Application.DocumentManager.MdiActiveDocument?.Database;
            if (db == null) return 0;

            using var tr = db.TransactionManager.StartTransaction();
            // después
            var bt = (acDb.BlockTable)tr.GetObject(db.BlockTableId, acDb.OpenMode.ForRead);
            var ms = bt[acDb.BlockTableRecord.ModelSpace];
            var btr = (acDb.BlockTableRecord)tr.GetObject(ms, acDb.OpenMode.ForRead);

            foreach (acDb.ObjectId id in btr)
            {
                if (tr.GetObject(id, acDb.OpenMode.ForRead, false, true) is not acDb.Region reg) continue;
                string name = ReadPkName(reg) ?? reg.Layer;
                if (!string.IsNullOrWhiteSpace(name)) names.Add(name.Trim());
            }
            tr.Commit();
            return names.Count;
        }
        private static string? ReadPkName(acDb.Entity ent)
        {
            using var rb = ent.XData;
            if (rb == null) return null;

            bool ok = false;
            foreach (var tv in rb.AsArray())
            {
                if (tv.TypeCode == (int)acDb.DxfCode.ExtendedDataRegAppName &&
                    (tv.Value as string) == XDataApp) { ok = true; continue; }
                if (ok && tv.TypeCode == (int)acDb.DxfCode.ExtendedDataAsciiString)
                    return tv.Value as string;
            }
            return null;
        }
        // ============================================================================
        // HELPERS: Reconstrucción de loops y prueba de contención 2D
        // ============================================================================
        private static List<List<acGeo.Point3d>> BuildLoops(List<acDb.Curve> segs, double tol, double step) =>
            BuildLoopsForExport(segs, tol, step)
                .Select(loop => loop.Select(p => new acGeo.Point3d(p.X, p.Y, 0)).ToList())
                .ToList();

        private static bool PointInPoly(acGeo.Point2d p, IEnumerable<acGeo.Point2d> poly)
        {
            bool inside = false;
            var pts = poly.ToList();
            for (int i = 0, j = pts.Count - 1; i < pts.Count; j = i++)
            {
                if (((pts[i].Y > p.Y) != (pts[j].Y > p.Y)) &&
                    (p.X < (pts[j].X - pts[i].X) * (p.Y - pts[i].Y) / (pts[j].Y - pts[i].Y) + pts[i].X))
                    inside = !inside;
            }
            return inside;
        }
        public static bool HasPkRegion(string pkId)
        {
            if (string.IsNullOrWhiteSpace(pkId)) return false;
            var set = LoadPkNamesFromRegions() ?? new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            return set.Contains(pkId.Trim());
        }



    }
}
