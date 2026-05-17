using System;
using System.Collections.Generic;
using System.Linq;

using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;

namespace SicoePresupuestoNET8
{
    internal sealed class OffsetInteligenteService
    {
        // Tolerancia geométrica (ajustable)
        private const double Tol = 1e-6;

        public OffsetResultado Ejecutar(
            List<ObjectId> seleccion,
            double distancia,
            OffsetModo modo,
            LadosSeleccion lados,
            OffsetOpciones opciones)
        {
            var doc = Application.DocumentManager.MdiActiveDocument!;
            var db = doc.Database;
            var ed = doc.Editor;

            var res = new OffsetResultado();

            using (var tr = db.TransactionManager.StartTransaction())
            {
                // Preparar capa destino si aplica
                if (opciones.CrearCapaNueva)
                    EnsureLayer(tr, db, opciones.LayerDestino);

                // 1) Recolectar polilíneas cerradas rectas para "modo inteligente"
                var plCandidatas = new List<(ObjectId id, Polyline pl, Extents3d ext, Point3d centro)>();

                foreach (var id in seleccion)
                {
                    var ent = tr.GetObject(id, OpenMode.ForRead) as Entity;
                    if (ent == null) continue;

                    res.Procesadas++;

                    if (ent is Polyline pl && pl.Closed && IsPolylineRecta(pl))
                    {
                        var ext = pl.GeometricExtents;
                        var centro = new Point3d(
                            (ext.MinPoint.X + ext.MaxPoint.X) / 2.0,
                            (ext.MinPoint.Y + ext.MaxPoint.Y) / 2.0,
                            0.0);

                        plCandidatas.Add((id, pl, ext, centro));
                    }
                }

                // 2) Detectar lados comunes (solo en polilíneas rectas)
                var sharedEdges = opciones.DetectarLadosComunes
                    ? DetectarLadosComunes(plCandidatas)
                    : new HashSet<(ObjectId, int)>();

                // 3) Procesar cada entidad
                var resumen = new List<string>();

                using (var btr = (BlockTableRecord)tr.GetObject(db.CurrentSpaceId, OpenMode.ForWrite))
                {
                    foreach (var id in seleccion)
                    {
                        var ent = tr.GetObject(id, OpenMode.ForRead) as Entity;
                        if (ent == null) { res.Omitidas++; continue; }

                        if (ent is Polyline pl && pl.Closed && IsPolylineRecta(pl))
                        {
                            // Offset inteligente por lados en WCS
                            var creadas = ProcesarPolylineInteligente(tr, btr, pl, id, distancia, modo, lados, opciones, sharedEdges);
                            res.Creadas += creadas;
                            if (creadas == 0) res.Omitidas++;
                            continue;
                        }

                        // Fallback seguro para: Line/Arc/Spline/Ellipse/Circle o Polyline con arcos
                        var creadasFallback = ProcesarFallbackOffsetCompleto(tr, btr, ent, distancia, modo, opciones);
                        res.Creadas += creadasFallback;
                        if (creadasFallback == 0) res.Omitidas++;
                    }
                }

                tr.Commit();
            }

            res.MensajeResumen =
                "Regla WCS (Opción A): Superior=+Y, Inferior=-Y, Derecho=+X, Izquierdo=-X.\n" +
                "Modo inteligente aplica a polilíneas cerradas con segmentos rectos.\n" +
                "Curvas (arcos/splines) usan offset completo en esta primera versión.";

            return res;
        }

        // ==========================================================
        // A) Offset inteligente para polilíneas rectas y cerradas
        // ==========================================================
        private int ProcesarPolylineInteligente(
            Transaction tr,
            BlockTableRecord btr,
            Polyline pl,
            ObjectId plId,
            double distancia,
            OffsetModo modo,
            LadosSeleccion lados,
            OffsetOpciones opciones,
            HashSet<(ObjectId, int)> sharedEdges)
        {
            int creadas = 0;

            if (modo == OffsetModo.HaciaAfuera || modo == OffsetModo.Ambos)
            {
                var outPl = BuildSmartOffset(pl, +distancia, lados, sharedEdges, plId);
                if (outPl != null)
                {
                    AplicarDestino(outPl, opciones, pl.Layer);
                    btr.AppendEntity(outPl);
                    tr.AddNewlyCreatedDBObject(outPl, true);
                    creadas++;
                }
            }

            if (modo == OffsetModo.HaciaAdentro || modo == OffsetModo.Ambos)
            {
                var inPl = BuildSmartOffset(pl, -distancia, lados, sharedEdges, plId);
                if (inPl != null)
                {
                    AplicarDestino(inPl, opciones, pl.Layer);
                    btr.AppendEntity(inPl);
                    tr.AddNewlyCreatedDBObject(inPl, true);
                    creadas++;
                }
            }

            return creadas;
        }

        // dSigned: +d = hacia afuera según selección WCS, -d = hacia adentro
        private Polyline? BuildSmartOffset(
            Polyline src,
            double dSigned,
            LadosSeleccion lados,
            HashSet<(ObjectId, int)> sharedEdges,
            ObjectId srcId)
        {
            int n = src.NumberOfVertices;
            if (n < 3) return null;

            // BBox para clasificar lados por WCS (izq/der/sup/inf)
            var ext = src.GeometricExtents;
            double cx = (ext.MinPoint.X + ext.MaxPoint.X) / 2.0;
            double cy = (ext.MinPoint.Y + ext.MaxPoint.Y) / 2.0;

            // Construir líneas (original u offset) por cada segmento
            var lines = new Line2d[n];

            for (int i = 0; i < n; i++)
            {
                int j = (i + 1) % n;

                var p1 = src.GetPoint2dAt(i);
                var p2 = src.GetPoint2dAt(j);

                // Segmento recto
                var mid = new Point2d((p1.X + p2.X) / 2.0, (p1.Y + p2.Y) / 2.0);

                bool isVertical = Math.Abs(p1.X - p2.X) < Math.Abs(p1.Y - p2.Y);
                bool isHorizontal = !isVertical;

                // Clasificación del lado (WCS)
                bool segIzq = isVertical && (mid.X < cx);
                bool segDer = isVertical && (mid.X >= cx);
                bool segInf = isHorizontal && (mid.Y < cy);
                bool segSup = isHorizontal && (mid.Y >= cy);

                bool ladoSeleccionado =
                    (segIzq && lados.Izquierdo) ||
                    (segDer && lados.Derecho) ||
                    (segSup && lados.Superior) ||
                    (segInf && lados.Inferior);

                // Detectar lado común: si este segmento es "shared", NO se desfasa
                if (sharedEdges.Contains((srcId, i)))
                    ladoSeleccionado = false;

                // Construir línea base
                var baseLine = new Line2d(p1, p2);

                if (!ladoSeleccionado)
                {
                    lines[i] = baseLine;
                    continue;
                }

                // Offset del segmento SOLO en eje X o Y (WCS),
                // para que "solo se mueva el costado", como en tu ejemplo.
                // Vertical => desplazar en X; Horizontal => desplazar en Y.
                double dx = 0, dy = 0;

                if (segIzq) dx = -dSigned;
                else if (segDer) dx = +dSigned;
                else if (segSup) dy = +dSigned;
                else if (segInf) dy = -dSigned;

                // Aplicar desplazamiento paralelo
                var q1 = new Point2d(p1.X + dx, p1.Y + dy);
                var q2 = new Point2d(p2.X + dx, p2.Y + dy);
                lines[i] = new Line2d(q1, q2);
            }

            // Reconstruir vértices como intersección de líneas adyacentes
            var outPl = new Polyline();
            outPl.SetDatabaseDefaults();
            outPl.Closed = true;

            for (int i = 0; i < n; i++)
            {
                int prev = (i - 1 + n) % n;

                var liPrev = lines[prev];
                var li = lines[i];

                if (!TryIntersect(liPrev, li, out var pi))
                {
                    // Caso raro (paralelas): caer al punto original
                    var p = src.GetPoint2dAt(i);
                    pi = p;
                }

                outPl.AddVertexAt(i, pi, 0.0, 0.0, 0.0);
            }

            // Validación mínima
            if (outPl.NumberOfVertices < 3) return null;

            return outPl;
        }

        private static bool TryIntersect(Line2d a, Line2d b, out Point2d p)
        {
            p = default;

            // Intersección de líneas infinitas
            try
            {
                var pts = a.IntersectWith(b);
                if (pts != null && pts.Length > 0)
                {
                    p = pts[0];
                    return true;
                }
            }
            catch { }
            return false;
        }

        private static bool IsPolylineRecta(Polyline pl)
        {
            // Si tiene bulge != 0, es arco; por ahora NO entra al modo inteligente
            for (int i = 0; i < pl.NumberOfVertices; i++)
            {
                if (Math.Abs(pl.GetBulgeAt(i)) > Tol)
                    return false;
            }
            return true;
        }

        // ==========================================================
        // B) Detección de lados comunes (solo H/V) entre polilíneas rectas
        //    Marca segmentos (ObjectId, indexSegment) para NO offset
        // ==========================================================
        private HashSet<(ObjectId, int)> DetectarLadosComunes(
            List<(ObjectId id, Polyline pl, Extents3d ext, Point3d centro)> polylines)
        {
            var shared = new HashSet<(ObjectId, int)>();

            // Extraer segmentos H/V con claves normalizadas
            var segs = new List<SegHV>();

            foreach (var (id, pl, _, _) in polylines)
            {
                int n = pl.NumberOfVertices;
                for (int i = 0; i < n; i++)
                {
                    int j = (i + 1) % n;
                    var p1 = pl.GetPoint2dAt(i);
                    var p2 = pl.GetPoint2dAt(j);

                    bool vertical = Math.Abs(p1.X - p2.X) < Math.Abs(p1.Y - p2.Y);
                    bool horizontal = !vertical;

                    if (!vertical && !horizontal) continue;

                    if (vertical)
                    {
                        double x = p1.X;
                        double y1 = Math.Min(p1.Y, p2.Y);
                        double y2 = Math.Max(p1.Y, p2.Y);
                        segs.Add(new SegHV(id, i, true, x, y1, y2));
                    }
                    else
                    {
                        double y = p1.Y;
                        double x1 = Math.Min(p1.X, p2.X);
                        double x2 = Math.Max(p1.X, p2.X);
                        segs.Add(new SegHV(id, i, false, y, x1, x2));
                    }
                }
            }

            // Dos segmentos son comunes si:
            // - ambos verticales en mismo X (≈Tol) y tienen solape en Y
            // - o ambos horizontales en mismo Y y tienen solape en X
            for (int a = 0; a < segs.Count; a++)
            {
                for (int b = a + 1; b < segs.Count; b++)
                {
                    var s1 = segs[a];
                    var s2 = segs[b];
                    if (s1.IsVertical != s2.IsVertical) continue;

                    if (Math.Abs(s1.Const - s2.Const) > 1e-4) continue; // tolerancia más laxa

                    // Overlap
                    double o1 = Math.Max(s1.Min, s2.Min);
                    double o2 = Math.Min(s1.Max, s2.Max);
                    if (o2 - o1 <= 1e-4) continue;

                    // Son compartidos => marcar ambos
                    shared.Add((s1.Owner, s1.Index));
                    shared.Add((s2.Owner, s2.Index));
                }
            }

            return shared;
        }

        private readonly struct SegHV
        {
            public SegHV(ObjectId owner, int index, bool isVertical, double @const, double min, double max)
            {
                Owner = owner;
                Index = index;
                IsVertical = isVertical;
                Const = @const;
                Min = min;
                Max = max;
            }

            public ObjectId Owner { get; }
            public int Index { get; }
            public bool IsVertical { get; }
            public double Const { get; } // X si vertical, Y si horizontal
            public double Min { get; }
            public double Max { get; }
        }

        // ==========================================================
        // C) Fallback: offset completo para curvas / entidades no soportadas
        // ==========================================================
        private int ProcesarFallbackOffsetCompleto(
            Transaction tr,
            BlockTableRecord btr,
            Entity ent,
            double distancia,
            OffsetModo modo,
            OffsetOpciones opciones)
        {
            // En esta versión: Curve.GetOffsetCurves (offset total)
            if (ent is not Curve curve) return 0;

            int creadas = 0;

            if (modo == OffsetModo.HaciaAfuera || modo == OffsetModo.Ambos)
                creadas += AppendOffsetCurveSet(tr, btr, curve, +distancia, opciones);

            if (modo == OffsetModo.HaciaAdentro || modo == OffsetModo.Ambos)
                creadas += AppendOffsetCurveSet(tr, btr, curve, -distancia, opciones);

            return creadas;
        }

        private int AppendOffsetCurveSet(Transaction tr, BlockTableRecord btr, Curve curve, double d, OffsetOpciones opciones)
        {
            try
            {
                var set = curve.GetOffsetCurves(d);
                int c = 0;

                foreach (DBObject dbo in set)
                {
                    if (dbo is not Entity e) { dbo.Dispose(); continue; }

                    AplicarDestino(e, opciones, curve.Layer);
                    btr.AppendEntity(e);
                    tr.AddNewlyCreatedDBObject(e, true);
                    c++;
                }
                return c;
            }
            catch
            {
                return 0;
            }
        }

        // ==========================================================
        // D) Capa destino
        // ==========================================================
        private void AplicarDestino(Entity e, OffsetOpciones opciones, string layerOrigen)
        {
            if (opciones.CrearCapaNueva)
                e.Layer = opciones.LayerDestino;
            else
                e.Layer = layerOrigen;
        }

        private void EnsureLayer(Transaction tr, Database db, string layerName)
        {
            var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
            if (lt.Has(layerName)) return;

            lt.UpgradeOpen();
            var ltr = new LayerTableRecord
            {
                Name = layerName
            };
            lt.Add(ltr);
            tr.AddNewlyCreatedDBObject(ltr, true);
        }
    }
}
