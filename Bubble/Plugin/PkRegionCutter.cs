using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.Geometry;

namespace SicoePresupuestoNET8
{
    internal static class PkRegionCutter
    {
        private const string XDataApp = "SICOE_PK";
        private const double TOL = 1e-6;

        // ============================
        // 1) PK REGIONS (Region con XDATA SICOE_PK)
        // ============================
        public static List<Region> GetPkRegions(Database db, Transaction tr)
        {
            var list = new List<Region>();

            var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
            var ms = (BlockTableRecord)tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForRead);

            foreach (ObjectId id in ms)
            {
                if (tr.GetObject(id, OpenMode.ForRead, false, true) is not Region reg)
                    continue;

                if (HasPkXData(reg))
                    list.Add(reg);
            }

            return list;
        }

        private static bool HasPkXData(Entity ent)
        {
            using var rb = ent.XData;
            if (rb == null) return false;

            foreach (var tv in rb.AsArray())
            {
                if (tv.TypeCode == (int)DxfCode.ExtendedDataRegAppName &&
                    string.Equals(tv.Value as string, XDataApp, StringComparison.OrdinalIgnoreCase))
                    return true;
            }
            return false;
        }

        // ============================
        // 2) CURVAS DE BORDE DE REGIONES PK (clonadas, caller las Dispose)
        // ============================
        public static List<Curve> BuildPkBoundaryCurves(List<Region> pkRegions)
        {
            var curves = new List<Curve>();

            foreach (var reg in pkRegions)
            {
                using var pieces = new DBObjectCollection();
                reg.Explode(pieces);

                foreach (DBObject o in pieces)
                {
                    if (o is Curve cv)
                    {
                        // usamos el cv tal cual (ya viene como objeto “temporal” fuera del DB)
                        curves.Add(cv);
                    }
                    else
                    {
                        o.Dispose();
                    }
                }
            }

            return curves;
        }

        // ============================
        // 3) CORTE DE CURVAS (Line/Polyline abierta/Arc/Spline/Circle/Ellipse)
        // ============================
        // PkRegionCutter.cs
        // REEMPLAZAR COMPLETO ESTE MÉTODO
        public static List<Curve> SplitCurveByPkBoundaries(Database db, Transaction tr, Curve target, List<Curve> boundaries)
        {
            // Regla de tu flujo:
            // - Si NO hay cortes reales -> devolver lista VACÍA (caller lo interpreta como "no dividir")
            // - Si hay 2+ segmentos -> devolver segmentos (caller reemplaza original)

            if (db == null || tr == null || target == null) return new List<Curve>();
            if (boundaries == null || boundaries.Count == 0) return new List<Curve>();

            // =========================
            // 1) Intersecciones con TODOS los bordes
            // =========================
            var allPts = new List<Point3d>();

            // Aplanar para evitar problemas por Z / elevaciones
            static Point3d Flat(Point3d p) => new Point3d(p.X, p.Y, 0.0);

            foreach (var b in boundaries)
            {
                if (b == null) continue;

                try
                {
                    var tmp = new Point3dCollection();
                    target.IntersectWith(b, Intersect.OnBothOperands, tmp, IntPtr.Zero, IntPtr.Zero);

                    if (tmp.Count > 0)
                    {
                        foreach (Point3d p in tmp)
                            allPts.Add(Flat(p));
                    }
                }
                catch
                {
                    // tolerante: ignora bordes problemáticos
                }
            }

            if (allPts.Count == 0)
                return new List<Curve>(); // sin intersecciones -> sin corte

            // =========================
            // 2) Dedup + quitar puntos pegados a extremos (tocar borde)
            // =========================
            const double tol = 1e-4; // 0.0001 (ajústalo si trabajas en metros y tu tolerancia debe ser mayor)
            bool Near(Point3d a, Point3d b) => a.DistanceTo(b) <= tol;

            // Dedup
            var uniq = new List<Point3d>();
            foreach (var p in allPts)
            {
                bool exists = false;
                for (int i = 0; i < uniq.Count; i++)
                {
                    if (Near(uniq[i], p)) { exists = true; break; }
                }
                if (!exists) uniq.Add(p);
            }

            // Extremos (aplanados)
            var sp = Flat(target.StartPoint);
            var ep = Flat(target.EndPoint);

            // Quitar intersecciones en extremos (regla: “si solo toca en extremo, no cortar”)
            uniq.RemoveAll(p => Near(p, sp) || Near(p, ep));

            if (uniq.Count == 0)
                return new List<Curve>(); // solo tocó extremos

            // =========================
            // 3) Ordenar puntos por distancia sobre la curva (CLAVE)
            // =========================
            // Proyectar a la curva y obtener distancia acumulada para ordenar estable
            var ordered = new List<(double dist, Point3d p)>();

            foreach (var p in uniq)
            {
                try
                {
                    var pFlat = Flat(p);
                    var proj = target.GetClosestPointTo(pFlat, false);

                    // Aplanar proyección por seguridad
                    proj = Flat(proj);

                    double par = target.GetParameterAtPoint(proj);
                    double dist = target.GetDistanceAtParameter(par);

                    ordered.Add((dist, proj));
                }
                catch
                {
                    // Si no se puede proyectar, se descarta ese punto
                }
            }

            if (ordered.Count == 0)
                return new List<Curve>();

            ordered.Sort((a, b) => a.dist.CompareTo(b.dist));

            // Re-dedup por si al proyectar quedaron puntos iguales
            var finalPts = new List<Point3d>();
            foreach (var it in ordered)
            {
                bool exists = false;
                for (int i = 0; i < finalPts.Count; i++)
                {
                    if (Near(finalPts[i], it.p)) { exists = true; break; }
                }
                if (!exists) finalPts.Add(it.p);
            }

            if (finalPts.Count == 0)
                return new List<Curve>();

            // =========================
            // 4) Split real con TODOS los puntos
            // =========================
            try
            {
                var pcol = new Point3dCollection(finalPts.ToArray());
                var pieces = target.GetSplitCurves(pcol);

                if (pieces == null || pieces.Count <= 1)
                {
                    if (pieces != null)
                        foreach (DBObject o in pieces) o.Dispose();

                    return new List<Curve>(); // no se partió realmente
                }

                var outCurves = new List<Curve>();
                foreach (DBObject o in pieces)
                {
                    if (o is Curve c) outCurves.Add(c);
                    else o.Dispose();
                }

                // Si por lo que sea devolvió 1, lo tratamos como “sin corte”
                if (outCurves.Count <= 1)
                {
                    foreach (var c in outCurves) c.Dispose();
                    return new List<Curve>();
                }

                return outCurves;
            }
            catch
            {
                return new List<Curve>();
            }
        }


        // ============================
        // 4) ÁREAS: Polilínea cerrada → varias polilíneas cerradas (área medible)
        // ============================
        public static List<Polyline> SplitClosedPolylineIntoPkAreas(
            Database db,
            Transaction tr,
            Polyline plClosed,
            List<Region> pkRegions)
        {
            var result = new List<Polyline>();
            if (db == null || tr == null || plClosed == null) return result;
            if (!plClosed.Closed) return result;
            if (pkRegions == null || pkRegions.Count == 0) return result;

            const double areaTol = 1e-4;     // descartar piezas minúsculas
            const double ptTol = 1e-4;       // tolerancia de encadenado
            const double sampleStep = 0.25;  // muestreo (arcos/splines)

            // 1) Crear REGION temporal del área base (NO residente en DB)
            Region baseAreaReg;
            {
                using var curves = new DBObjectCollection();
                curves.Add((Curve)plClosed.Clone());

                DBObjectCollection regs;
                try
                {
                    regs = Region.CreateFromCurves(curves);
                }
                catch
                {
                    return result;
                }

                if (regs == null || regs.Count == 0)
                {
                    if (regs != null) foreach (DBObject o in regs) o.Dispose();
                    return result;
                }

                baseAreaReg = regs[0] as Region;
                for (int i = 1; i < regs.Count; i++) regs[i].Dispose();

                if (baseAreaReg == null)
                {
                    regs[0].Dispose();
                    return result;
                }
            }

            try
            {
                // 2) Intersectar contra cada región PK, siempre en CLONES temporales
                foreach (var pkRegDw in pkRegions)
                {
                    if (pkRegDw == null) continue;

                    Region pkRegTmp = null;
                    Region pieceTmp = null;

                    try
                    {
                        pkRegTmp = (Region)pkRegDw.Clone();       // TEMPORAL
                        pieceTmp = (Region)baseAreaReg.Clone();   // TEMPORAL

                        pieceTmp.BooleanOperation(BooleanOperationType.BoolIntersect, pkRegTmp);

                        double a = 0.0;
                        try { a = pieceTmp.Area; } catch { a = 0.0; }
                        if (a <= areaTol) continue;

                        // 3) Convertir esa región a Polyline cerrada (medible)
                        var plOut = BuildClosedPolylineFromRegion(pieceTmp, ptTol, sampleStep);
                        if (plOut != null && plOut.Closed && plOut.NumberOfVertices >= 3)
                        {
                            result.Add(plOut);
                        }
                        else
                        {
                            plOut?.Dispose();
                        }
                    }
                    catch
                    {
                        // ignorar y seguir
                    }
                    finally
                    {
                        pkRegTmp?.Dispose();
                        pieceTmp?.Dispose();
                    }
                }
            }
            finally
            {
                baseAreaReg.Dispose();
            }

            return result;
        }

        private static Polyline? BuildClosedPolylineFromRegion(Region reg, double tol, double step)
        {
            using var pieces = new DBObjectCollection();
            reg.Explode(pieces);

            var curves = new List<Curve>();
            foreach (DBObject o in pieces)
            {
                if (o is Curve cv) curves.Add(cv);
                else o.Dispose();
            }
            if (curves.Count == 0) return null;

            Curve? inv1 = null;
            Curve? inv2 = null;

            try
            {
                var T = new Tolerance(tol, tol);

                // Encadenar curvas por extremos
                var used = new HashSet<int>();
                var chain = new List<Curve>();

                int curr = 0;
                used.Add(curr);
                chain.Add(curves[curr]);

                var end = curves[curr].EndPoint;

                while (true)
                {
                    int nxt = -1;
                    bool reverse = false;

                    for (int i = 0; i < curves.Count; i++)
                    {
                        if (used.Contains(i)) continue;

                        var s = curves[i].StartPoint;
                        var e = curves[i].EndPoint;

                        if (s.IsEqualTo(end, T)) { nxt = i; reverse = false; break; }
                        if (e.IsEqualTo(end, T)) { nxt = i; reverse = true; break; }
                    }

                    if (nxt < 0) break;
                    used.Add(nxt);

                    if (reverse)
                    {
                        var inv = (Curve)curves[nxt].Clone();
                        inv.ReverseCurve();
                        chain.Add(inv);
                        end = inv.EndPoint;

                        // guardar referencia para liberar luego (clones)
                        if (inv1 == null) inv1 = inv;
                        else inv2 = inv;
                    }
                    else
                    {
                        chain.Add(curves[nxt]);
                        end = curves[nxt].EndPoint;
                    }

                    if (chain.Count > 2)
                    {
                        var start = chain[0].StartPoint;
                        if (end.IsEqualTo(start, T)) break;
                    }
                }

                // Muestrear a puntos 2D
                var pts = new List<Point2d>();
                foreach (var cv in chain)
                {
                    double len = 0;
                    try
                    {
                        len = cv.GetDistanceAtParameter(cv.EndParam) - cv.GetDistanceAtParameter(cv.StartParam);
                    }
                    catch { len = 0; }

                    if (len <= 0)
                    {
                        var p0 = cv.StartPoint;
                        pts.Add(new Point2d(p0.X, p0.Y));
                        continue;
                    }

                    int n = Math.Max(8, (int)Math.Ceiling(len / Math.Max(0.1, step)));
                    for (int i = 0; i <= n; i++)
                    {
                        double t = cv.StartParam + (cv.EndParam - cv.StartParam) * (i / (double)n);
                        var p = cv.GetPointAtParameter(t);
                        pts.Add(new Point2d(p.X, p.Y));
                    }
                }

                // Compactar
                var compact = new List<Point2d>();
                for (int i = 0; i < pts.Count; i++)
                {
                    if (compact.Count == 0) { compact.Add(pts[i]); continue; }
                    if (compact[compact.Count - 1].GetDistanceTo(pts[i]) > tol) compact.Add(pts[i]);
                }
                if (compact.Count < 3) return null;

                // Cerrar
                if (compact[0].GetDistanceTo(compact[compact.Count - 1]) > tol)
                    compact.Add(compact[0]);

                var pl = new Polyline();
                pl.SetDatabaseDefaults();
                for (int i = 0; i < compact.Count - 1; i++)
                    pl.AddVertexAt(i, compact[i], 0, 0, 0);
                pl.Closed = true;

                return pl;
            }
            finally
            {
                // liberar curvas del explode
                foreach (var cv in curves) cv.Dispose();

                // liberar clones invertidos si existieron
                inv1?.Dispose();
                inv2?.Dispose();
            }
        }

        // ============================
        // 5) PROPIEDADES: conservar todo lo posible
        // ============================
        public static void CopyEntityProperties(Entity src, Entity dst)
        {
            try
            {
                dst.Layer = src.Layer;
                dst.Color = src.Color;
                dst.Linetype = src.Linetype;
                dst.LinetypeScale = src.LinetypeScale;
                dst.LineWeight = src.LineWeight;
                dst.Transparency = src.Transparency;
                dst.Visible = src.Visible;
            }
            catch { }
        }

        // ============================
        // Helpers
        // ============================
        private static bool IsNear(Point3d a, Point3d b, double tol)
            => a.DistanceTo(b) <= tol;

        private static List<Point3d> DedupPoints(Point3dCollection pts, double tol)
        {
            var outPts = new List<Point3d>();
            foreach (Point3d p in pts)
            {
                bool exists = outPts.Any(q => q.DistanceTo(p) <= tol);
                if (!exists) outPts.Add(p);
            }
            return outPts;
        }

        private static List<List<Point2d>> BuildLoops2D(List<Curve> segs, double tol)
        {
            var loops = new List<List<Point2d>>();
            var used = new HashSet<int>();
            var T = new Tolerance(tol, tol);

            Point2d P2(Point3d p) => new Point2d(p.X, p.Y);

            for (int i = 0; i < segs.Count; i++)
            {
                if (used.Contains(i)) continue;

                var loop = new List<Point2d>();

                // arrancar con i en forward
                var curr = i;
                used.Add(curr);

                loop.Add(P2(segs[curr].StartPoint));
                loop.Add(P2(segs[curr].EndPoint));
                var cursor = segs[curr].EndPoint;

                while (true)
                {
                    int nxt = -1;
                    bool forward = true;

                    for (int j = 0; j < segs.Count; j++)
                    {
                        if (used.Contains(j)) continue;

                        var s = segs[j].StartPoint;
                        var e = segs[j].EndPoint;

                        if (s.IsEqualTo(cursor, T)) { nxt = j; forward = true; break; }
                        if (e.IsEqualTo(cursor, T)) { nxt = j; forward = false; break; }
                    }

                    if (nxt < 0) break;

                    if (forward)
                    {
                        loop.Add(P2(segs[nxt].EndPoint));
                        cursor = segs[nxt].EndPoint;
                    }
                    else
                    {
                        loop.Add(P2(segs[nxt].StartPoint));
                        cursor = segs[nxt].StartPoint;
                    }

                    used.Add(nxt);

                    // cierre
                    if (loop.Count > 3 && loop[0].IsEqualTo(loop[loop.Count - 1], T))
                        break;
                }

                // asegurar cierre
                if (loop.Count >= 3)
                {
                    if (!loop[0].IsEqualTo(loop[loop.Count - 1], T))
                        loop.Add(loop[0]);

                    // compactar puntos repetidos
                    loops.Add(Compress(loop, tol));
                }
            }

            // filtrar loops degenerados
            return loops.Where(l => l.Count >= 4).ToList();

            static List<Point2d> Compress(List<Point2d> pts, double tol)
            {
                var outPts = new List<Point2d>();
                for (int i = 0; i < pts.Count; i++)
                {
                    if (i == 0) { outPts.Add(pts[i]); continue; }
                    if (outPts[outPts.Count - 1].GetDistanceTo(pts[i]) > tol)
                        outPts.Add(pts[i]);
                }
                return outPts;
            }
        }

        private static List<Polyline> DedupPolylinesByAreaAndBBox(List<Polyline> polys)
        {
            const double areaTol = 1e-4;
            const double bbTol = 1e-3;

            string Key(Polyline p)
            {
                var ext = p.GeometricExtents;
                double a = Math.Round(p.Area / areaTol) * areaTol;
                double x1 = Math.Round(ext.MinPoint.X / bbTol) * bbTol;
                double y1 = Math.Round(ext.MinPoint.Y / bbTol) * bbTol;
                double x2 = Math.Round(ext.MaxPoint.X / bbTol) * bbTol;
                double y2 = Math.Round(ext.MaxPoint.Y / bbTol) * bbTol;
                return $"{a:0.####}|{x1:0.###}|{y1:0.###}|{x2:0.###}|{y2:0.###}";
            }

            var map = new Dictionary<string, Polyline>(StringComparer.OrdinalIgnoreCase);
            foreach (var p in polys)
            {
                var k = Key(p);
                if (!map.ContainsKey(k)) map[k] = p;
                else p.Dispose();
            }

            return map.Values.ToList();
        }
    }
}
