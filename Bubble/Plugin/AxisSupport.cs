using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;
using acApp = Autodesk.AutoCAD.ApplicationServices;
using acDb = Autodesk.AutoCAD.DatabaseServices;
using acEd = Autodesk.AutoCAD.EditorInput;
using acGeo = Autodesk.AutoCAD.Geometry;
using System.IO;
// System.Text.Json reemplazado por Newtonsoft.Json


namespace SicoePresupuestoNET8
{
    public sealed class AxisContext
    {
        public bool IsDouble { get; set; }

        // --- Objetos en memoria (No se guardan en disco) ---
        [JsonIgnore] public acDb.ObjectId AxisA { get; set; } = acDb.ObjectId.Null;
        [JsonIgnore] public acDb.ObjectId AxisB { get; set; } = acDb.ObjectId.Null;
        [JsonIgnore] public acGeo.Point3d Pk0A { get; set; } = acGeo.Point3d.Origin;
        [JsonIgnore] public acGeo.Point3d Pk0B { get; set; } = acGeo.Point3d.Origin;

        // --- Datos para Persistencia (SÍ se guardan en disco) ---
        public string HandleA { get; set; } = "";
        public string HandleB { get; set; } = "";

        // Coordenadas para reconstruir los puntos
        public double XA { get; set; }
        public double YA { get; set; }
        public double ZA { get; set; }
        public double XB { get; set; }
        public double YB { get; set; }
        public double ZB { get; set; }

        public double Pk0DistA { get; set; } = 0.0;
        public double Pk0DistB { get; set; } = 0.0;

        // ── NUEVO: abscisa real donde comienza cada sector ────────────────
        public double AbsInicioA { get; set; } = 0.0;   // ej: 500.0 → empieza en 0+500
        public double AbsInicioB { get; set; } = 0.0;

        /// <summary>
        /// True: la abscisa crece hacia EndParam (distancia creciente en la curva).
        /// False: crece hacia StartParam (PK0 cerca del final geométrico de la polilínea).
        /// </summary>
        public bool ChainageTowardEnd { get; set; } = true;

        public string Orientacion { get; set; } = "";
        public string NombreA { get; set; } = "Única";
        public string NombreB { get; set; } = "";

        public double OrdDer_A { get; set; } = 20.0;
        public double OrdIzq_A { get; set; } = 20.0;
        public double OrdDer_B { get; set; } = 20.0;
        public double OrdIzq_B { get; set; } = 20.0;

        public double IntervaloPk { get; set; } = 10.0;
    }

    public struct PkResult
    {
        public double Pk;
        public double Offset;
        public char Lado;
        public string Calzada;
    }

    public static class PkFormatter
    {
        public static string ToPkString(double meters)
        {
            double abs = Math.Abs(meters);
            int km = (int)Math.Floor(abs / 1000.0);
            double m = abs - km * 1000.0;
            string core = $"{km}+{m:000.00}";
            return meters < 0 ? "-" + core : core;
        }
    }
    public static class AxisMath
    {
        /// <summary>
        /// Infiere si la abscisa crece hacia EndParam o hacia StartParam.
        /// PK0 marca el inicio del sector; la cadena continúa por el tramo más largo desde PK0.
        /// </summary>
        public static bool InferChainageTowardEnd(acDb.Curve eje, double pk0dist)
        {
            double dEnd = eje.GetDistanceAtParameter(eje.EndParam);
            double towardEnd = Math.Max(0, dEnd - pk0dist);
            double towardStart = Math.Max(0, pk0dist);
            return towardEnd >= towardStart;
        }

        public static void RefreshChainageDirection(AxisContext ax, acDb.Curve? ejeA)
        {
            if (ejeA == null || ax == null) return;
            try
            {
                ax.ChainageTowardEnd = InferChainageTowardEnd(ejeA, ax.Pk0DistA);
            }
            catch
            {
                ax.ChainageTowardEnd = true;
            }
        }

        /// <summary>Convierte distancia acumulada en la curva a abscisa (metros de cadena).</summary>
        public static double DistAlongToPk(double distAlong, AxisContext ctx, bool calzadaA = true)
        {
            double pk0 = calzadaA ? ctx.Pk0DistA : ctx.Pk0DistB;
            double abs0 = calzadaA ? ctx.AbsInicioA : ctx.AbsInicioB;
            double delta = ctx.ChainageTowardEnd
                ? (distAlong - pk0)
                : (pk0 - distAlong);
            return abs0 + delta;
        }

        public static PkResult ComputePkAndOffset(acDb.Entity ent, AxisContext ctx)
        {
            if (ent == null) throw new ArgumentNullException(nameof(ent));
            var db = acApp.Application.DocumentManager.MdiActiveDocument.Database;

            using var tr = db.TransactionManager.StartTransaction();

            // Obtener curvas de ejes
            var ejeA = ctx.AxisA.IsNull ? null : tr.GetObject(ctx.AxisA, acDb.OpenMode.ForRead) as acDb.Curve;
            var ejeB = (!ctx.IsDouble || ctx.AxisB.IsNull) ? null : tr.GetObject(ctx.AxisB, acDb.OpenMode.ForRead) as acDb.Curve;

            if (ejeA == null)
                throw new InvalidOperationException("Eje A no disponible.");

            // Muestrear puntos representativos sobre la ENTIDAD
            var samplePoints = SampleEntityPoints(ent, tr, step: 2.0).ToList();
            if (samplePoints.Count == 0)
                samplePoints.Add(CentroBBox(ent));

            // Evaluar distancia mínima a eje A (y B si existe)
            var evalA = EvalMinDistanceToAxis(samplePoints, ejeA);
            (double minOffset, acGeo.Point3d bestEnt, acGeo.Point3d bestAxis, double axisDist, char lado) evalB = default;
            bool hasB = ejeB != null;
            if (hasB)
                evalB = EvalMinDistanceToAxis(samplePoints, ejeB);

            // ========= CANDIDATO A =========
            double signedOffA = (evalA.lado == 'I') ? evalA.minOffset : -evalA.minOffset;
            double pkRawA = DistAlongToPk(evalA.axisDist, ctx, calzadaA: true);

            var candA = new PkResult
            {
                Pk = pkRawA,
                Offset = signedOffA,
                Lado = evalA.lado,
                Calzada = ctx.NombreA
            };

            bool insideA = AxisMath.IsInsideOrdenada(candA, ctx);

            // ========= CANDIDATO B (si existe) =========
            PkResult candB = default;
            bool insideB = false;

            if (hasB)
            {
                double signedOffB = (evalB.lado == 'I') ? evalB.minOffset : -evalB.minOffset;
                double pkRawB = DistAlongToPk(evalB.axisDist, ctx, calzadaA: false);

                candB = new PkResult
                {
                    Pk = pkRawB,
                    Offset = signedOffB,
                    Lado = evalB.lado,
                    Calzada = ctx.NombreB
                };

                insideB = AxisMath.IsInsideOrdenada(candB, ctx);
            }

            // ========= REGLAS DE SELECCIÓN =========
            PkResult elegido;

            // 1) Solo A válido → usar A
            if (insideA && !insideB)
            {
                elegido = candA;
            }
            // 2) Solo B válido → usar B
            else if (!insideA && insideB)
            {
                elegido = candB;
            }
            // 3) Ambos válidos → elegir el más cercano (menor offset)
            else if (insideA && insideB)
            {
                elegido = (evalA.minOffset <= evalB.minOffset) ? candA : candB;
            }
            // 4) Ninguno dentro de ordenadas → fallback: eje más cercano (como antes)
            else
            {
                if (!hasB || evalA.minOffset <= evalB.minOffset)
                    elegido = candA;
                else
                    elegido = candB;
            }

            tr.Commit();
            return elegido;

            // ===== Helpers locales =====
            static (double minOffset, acGeo.Point3d bestEnt, acGeo.Point3d bestAxis, double axisDist, char lado)
                EvalMinDistanceToAxis(List<acGeo.Point3d> candidates, acDb.Curve axis)
            {
                double best = double.MaxValue;
                acGeo.Point3d bestEnt = acGeo.Point3d.Origin, bestAx = acGeo.Point3d.Origin;
                double bestAxisDist = 0;
                char bestSide = 'D';

                foreach (var c in candidates)
                {
                    var proj = axis.GetClosestPointTo(c, extend: false);
                    double off = c.DistanceTo(proj);
                    if (off < best)
                    {
                        best = off;
                        bestEnt = c;
                        bestAx = proj;
                        double par = axis.GetParameterAtPoint(proj);
                        var tan = axis.GetFirstDerivative(par);
                        var v = c - proj;
                        // cruz en Z (2D)
                        double crossZ = (tan.X * v.Y) - (tan.Y * v.X);
                        bestSide = crossZ > 0 ? 'I' : 'D';
                        bestAxisDist = axis.GetDistanceAtParameter(par);
                    }
                }
                return (best, bestEnt, bestAx, bestAxisDist, bestSide);
            }
        }
        public static PkResult? ComputePkAndOffset_Point(acGeo.Point3d p, AxisContext ctx)
        {
            var db = acApp.Application.DocumentManager.MdiActiveDocument.Database;

            using var tr = db.TransactionManager.StartTransaction();

            var ejeA = ctx.AxisA.IsNull ? null : tr.GetObject(ctx.AxisA, acDb.OpenMode.ForRead) as acDb.Curve;
            var ejeB = (!ctx.IsDouble || ctx.AxisB.IsNull) ? null : tr.GetObject(ctx.AxisB, acDb.OpenMode.ForRead) as acDb.Curve;

            if (ejeA == null)
                return null;

            // Aplanar punto a Z = 0
            acGeo.Point3d pFlat = FlattenXY(p);

            (double off, acGeo.Point3d proj, double dist, char side) Eval(acDb.Curve eje)
            {
                var proj = eje.GetClosestPointTo(pFlat, false);
                double off = pFlat.DistanceTo(proj);
                double par = eje.GetParameterAtPoint(proj);
                var tan = eje.GetFirstDerivative(par);
                var v = pFlat - proj;
                double cross = tan.X * v.Y - tan.Y * v.X;
                char side = cross > 0 ? 'I' : 'D';
                return (off, proj, eje.GetDistanceAtParameter(par), side);
            }

            var A = Eval(ejeA);
            var B = ejeB != null ? Eval(ejeB) : default;
            bool hasB = ejeB != null;

            var pkA = DistAlongToPk(A.dist, ctx, calzadaA: true);
            var pkB = hasB ? DistAlongToPk(B.dist, ctx, calzadaA: false) : double.MaxValue;

            PkResult rA = new PkResult
            {
                Pk = pkA,
                Offset = A.side == 'I' ? A.off : -A.off,
                Lado = A.side,
                Calzada = ctx.NombreA
            };
            PkResult rB = new PkResult
            {
                Pk = pkB,
                Offset = B.side == 'I' ? B.off : -B.off,
                Lado = B.side,
                Calzada = ctx.NombreB
            };

            bool insideA = AxisMath.IsInsideOrdenada(rA, ctx);
            bool insideB = hasB && AxisMath.IsInsideOrdenada(rB, ctx);

            if (insideA && !insideB) return rA;
            if (!insideA && insideB) return rB;
            if (insideA && insideB)
                return (A.off <= B.off) ? rA : rB;

            return null;
        }

        public static PkResult? ComputePkAndOffset_Point(acGeo.Point3d p, AxisContext ctx, char prefCalz)
        {
            var db = acApp.Application.DocumentManager.MdiActiveDocument.Database;

            using var tr = db.TransactionManager.StartTransaction();

            var ejeA = ctx.AxisA.IsNull ? null : tr.GetObject(ctx.AxisA, acDb.OpenMode.ForRead) as acDb.Curve;
            var ejeB = (!ctx.IsDouble || ctx.AxisB.IsNull) ? null : tr.GetObject(ctx.AxisB, acDb.OpenMode.ForRead) as acDb.Curve;

            if (ejeA == null)
                return null;

            // Aplanar punto a Z = 0
            acGeo.Point3d pFlat = FlattenXY(p);

            (double off, acGeo.Point3d proj, double dist, char side) Eval(acDb.Curve eje)
            {
                var proj = eje.GetClosestPointTo(pFlat, false);
                double off = pFlat.DistanceTo(proj);
                double par = eje.GetParameterAtPoint(proj);
                var tan = eje.GetFirstDerivative(par);
                var v = pFlat - proj;
                double cross = tan.X * v.Y - tan.Y * v.X;
                char side = cross > 0 ? 'I' : 'D';
                return (off, proj, eje.GetDistanceAtParameter(par), side);
            }

            var A = Eval(ejeA);
            var B = ejeB != null ? Eval(ejeB) : default;
            bool hasB = ejeB != null;

            var pkA = DistAlongToPk(A.dist, ctx, calzadaA: true);
            var pkB = hasB ? DistAlongToPk(B.dist, ctx, calzadaA: false) : double.MaxValue;

            PkResult rA = new PkResult
            {
                Pk = pkA,
                Offset = A.side == 'I' ? A.off : -A.off,
                Lado = A.side,
                Calzada = ctx.NombreA
            };

            PkResult rB = new PkResult
            {
                Pk = pkB,
                Offset = B.side == 'I' ? B.off : -B.off,
                Lado = B.side,
                Calzada = ctx.NombreB
            };

            bool insideA = AxisMath.IsInsideOrdenada(rA, ctx);
            bool insideB = hasB && AxisMath.IsInsideOrdenada(rB, ctx);

            bool prefA = prefCalz == 'A';
            bool prefB = prefCalz == 'B';

            if (prefA && insideA) return rA;
            if (prefB && insideB) return rB;

            if (insideA && !insideB) return rA;
            if (!insideA && insideB) return rB;
            if (insideA && insideB)
                return (A.off <= B.off) ? rA : rB;

            return null;
        }



        public static bool IsInsideOrdenada(PkResult r, AxisContext ctx)
        {
            // límites por calzada
            double limI, limD;
            if (!ctx.IsDouble || string.Equals(r.Calzada, ctx.NombreA, StringComparison.OrdinalIgnoreCase))
            {
                limI = ctx.OrdIzq_A;
                limD = ctx.OrdDer_A;
            }
            else
            {
                limI = ctx.OrdIzq_B;
                limD = ctx.OrdDer_B;
            }

            // Convención: Offset POSITIVO = izquierda, NEGATIVO = derecha
            if (r.Offset >= 0) return r.Offset <= limI;     // izquierda
            else return -r.Offset <= limD;     // derecha
        }

        private static acGeo.Point3d FlattenXY(acGeo.Point3d p)
        {
            // Ignora cualquier elevación: trabajamos siempre en Z = 0
            return new acGeo.Point3d(p.X, p.Y, 0.0);
        }

        // === Muestreo de puntos sobre la entidad ===
        // === Muestreo de puntos sobre la entidad ===
        // === Muestreo de puntos sobre la entidad ===
        // La hacemos PUBLIC para poder usarla desde otros formularios.
        public static IEnumerable<acGeo.Point3d> SampleEntityPoints(acDb.Entity ent, acDb.Transaction tr, double step)
        {
            if (ent is acDb.DBPoint pt) { yield return FlattenXY(pt.Position); yield break; }
            if (ent is acDb.BlockReference br) { yield return FlattenXY(br.Position); yield break; }

            if (ent is acDb.Curve cv)
            {
                double sd = cv.GetDistanceAtParameter(cv.StartParam);
                double ed = cv.GetDistanceAtParameter(cv.EndParam);
                double len = Math.Abs(ed - sd);

                // Vértices si es Polyline
                if (ent is acDb.Polyline pl)
                {
                    int nv = pl.NumberOfVertices;
                    for (int i = 0; i < nv; i++)
                        yield return FlattenXY(pl.GetPoint3dAt(i));
                }
                else
                {
                    // extremos
                    yield return FlattenXY(cv.StartPoint);
                    yield return FlattenXY(cv.EndPoint);
                }

                // Muestreo por distancia (cada 'step' metros)
                if (len > 0)
                {
                    double d = 0.0;
                    while (d <= len)
                    {
                        double parAtDist = cv.GetParameterAtDistance(sd + d);
                        var p = cv.GetPointAtParameter(parAtDist);
                        yield return FlattenXY(p);
                        d += Math.Max(0.5, step);
                    }
                }
                yield break;
            }

            // Fallback: centro de bbox
            yield return CentroBBox(ent);
        }

        private static acGeo.Point3d CentroBBox(acDb.Entity ent)
        {
            var ext = ent.GeometricExtents;
            return new acGeo.Point3d(
                0.5 * (ext.MinPoint.X + ext.MaxPoint.X),
                0.5 * (ext.MinPoint.Y + ext.MaxPoint.Y),
                0.0               // siempre Z = 0
            );
        }

    }
    public static class AxisRepository
    {
        // Debe coincidir con FrmCargueEje.FilePath
        private static string FilePath =>
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "SicoeCAD",
                "axes_v2.json");

        /// <summary>
        /// Carga todos los ejes desde el JSON y reconstruye AxisA/AxisB + Pk0A/Pk0B.
        /// </summary>
        public static List<AxisContext> LoadAllAxes()
        {
            var result = new List<AxisContext>();

            try
            {
                if (!File.Exists(FilePath))
                    return result;

                var json = File.ReadAllText(FilePath);
                var list = JsonConvert.DeserializeObject<List<AxisContext>>(json);

                if (list == null || list.Count == 0)
                    return result;

                var doc = acApp.Application.DocumentManager.MdiActiveDocument;
                if (doc == null)
                    return result;

                var db = doc.Database;

                using (var tr = db.TransactionManager.StartTransaction())
                {
                    foreach (var ax in list)
                    {
                        ax.AxisA = ResolveObjectId(db, ax.HandleA);
                        ax.AxisB = ResolveObjectId(db, ax.HandleB);

                        // Reconstruir puntos PK0 desde las coordenadas
                        ax.Pk0A = new acGeo.Point3d(ax.XA, ax.YA, ax.ZA);
                        ax.Pk0B = new acGeo.Point3d(ax.XB, ax.YB, ax.ZB);

                        // >>> CLAVE: si el eje A no existe en este DWG, este AxisContext NO sirve
                        if (ax.AxisA.IsNull || !ax.AxisA.IsValid)
                        {
                            // no lo agregues: corresponde a otro dibujo o se perdió el objeto
                            continue;
                        }

                        // Si es doble, y AxisB no existe, lo degradamos a único (opcional pero recomendado)
                        if (ax.IsDouble)
                        {
                            if (ax.AxisB.IsNull || !ax.AxisB.IsValid)
                            {
                                ax.IsDouble = false;
                                ax.HandleB = "";
                                ax.NombreB = "";
                                ax.Pk0B = acGeo.Point3d.Origin;
                                ax.Pk0DistB = 0.0;
                            }
                        }

                        if (tr.GetObject(ax.AxisA, acDb.OpenMode.ForRead) is acDb.Curve crvA)
                            AxisMath.RefreshChainageDirection(ax, crvA);

                        result.Add(ax);

                    }
                    tr.Commit();
                }
            }
            catch
            {
                // Silencioso: si algo falla, devolvemos lista vacía
                result.Clear();
            }

            return result;
        }

        /// <summary>
        /// Devuelve el primer eje disponible como eje activo.
        /// </summary>
        public static AxisContext? LoadFirstAxis()
        {
            var axes = LoadAllAxes();
            if (axes == null || axes.Count == 0)
                return null;

            return axes[0];
        }

        /// <summary>
        /// Distancia perpendicular mínima de un punto al eje A (o A/B si es doble).
        /// </summary>
        public static double MinDistanceToAxisContext(acGeo.Point3d p, AxisContext ctx)
        {
            if (ctx == null || ctx.AxisA.IsNull)
                return double.MaxValue;

            var doc = acApp.Application.DocumentManager.MdiActiveDocument;
            if (doc == null) return double.MaxValue;

            var db = doc.Database;
            var pFlat = new acGeo.Point3d(p.X, p.Y, 0.0);

            using var tr = db.TransactionManager.StartTransaction();
            try
            {
                if (tr.GetObject(ctx.AxisA, acDb.OpenMode.ForRead) is not acDb.Curve ejeA)
                    return double.MaxValue;

                double DistTo(acDb.Curve eje)
                {
                    try
                    {
                        var proj = eje.GetClosestPointTo(pFlat, false);
                        return pFlat.DistanceTo(proj);
                    }
                    catch { return double.MaxValue; }
                }

                double dMin = DistTo(ejeA);

                if (ctx.IsDouble && !ctx.AxisB.IsNull &&
                    tr.GetObject(ctx.AxisB, acDb.OpenMode.ForRead) is acDb.Curve ejeB)
                {
                    dMin = Math.Min(dMin, DistTo(ejeB));
                }

                tr.Commit();
                return dMin;
            }
            catch
            {
                return double.MaxValue;
            }
        }

        /// <summary>
        /// Elige el eje/sector más cercano al punto (soporta múltiples sectores).
        /// Penaliza ejes cuya abscisa inferida quede antes del inicio del sector.
        /// </summary>
        public static AxisContext? ResolveAxisForPoint(acGeo.Point3d p)
        {
            var axes = LoadAllAxes();
            if (axes == null || axes.Count == 0)
                return null;

            if (axes.Count == 1)
                return axes[0];

            var doc = acApp.Application.DocumentManager.MdiActiveDocument;
            if (doc == null) return axes[0];

            var db = doc.Database;
            var pFlat = new acGeo.Point3d(p.X, p.Y, 0.0);

            AxisContext? best = null;
            double bestScore = double.MaxValue;

            using (var tr = db.TransactionManager.StartTransaction())
            {
                foreach (var ax in axes)
                {
                    if (ax.AxisA.IsNull) continue;
                    if (tr.GetObject(ax.AxisA, acDb.OpenMode.ForRead) is not acDb.Curve ejeA)
                        continue;

                    try
                    {
                        var proj = ejeA.GetClosestPointTo(pFlat, false);
                        double off = pFlat.DistanceTo(proj);
                        double par = ejeA.GetParameterAtPoint(proj);
                        double dist = ejeA.GetDistanceAtParameter(par);
                        double pk = AxisMath.DistAlongToPk(dist, ax, calzadaA: true);

                        double score = off;
                        // Fuera del sector (abscisa menor al inicio): penalizar fuerte
                        if (pk < ax.AbsInicioA - 80.0)
                            score += 5000.0;
                        // Muy por delante del tramo típico del sector anterior
                        if (pk < ax.AbsInicioA - 5.0)
                            score += 500.0;

                        if (score < bestScore)
                        {
                            bestScore = score;
                            best = ax;
                        }
                    }
                    catch { }
                }
                tr.Commit();
            }

            return best ?? axes[0];
        }

        /// <summary>
        /// Elige el eje/sector más cercano al centro geométrico de la entidad.
        /// </summary>
        public static AxisContext? ResolveAxisForEntity(acDb.Entity ent)
        {
            if (ent == null) return LoadFirstAxis();

            acGeo.Point3d centro;
            try
            {
                var ext = ent.GeometricExtents;
                centro = new acGeo.Point3d(
                    0.5 * (ext.MinPoint.X + ext.MaxPoint.X),
                    0.5 * (ext.MinPoint.Y + ext.MaxPoint.Y),
                    0.0);
            }
            catch
            {
                return LoadFirstAxis();
            }

            return ResolveAxisForPoint(centro) ?? LoadFirstAxis();
        }

        // ==== Helper privado (mismo patrón que en FrmCargueEje) ====
        private static acDb.ObjectId ResolveObjectId(acDb.Database db, string handleStr)
        {
            if (string.IsNullOrWhiteSpace(handleStr))
                return acDb.ObjectId.Null;

            try
            {
                long ln = Convert.ToInt64(handleStr, 16);
                return db.GetObjectId(false, new acDb.Handle(ln), 0);
            }
            catch
            {
                return acDb.ObjectId.Null;
            }
        }
    }

}