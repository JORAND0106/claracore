// TopoHelpers.cs
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using acApp = Autodesk.AutoCAD.ApplicationServices.Application;

namespace SicoePresupuestoNET8
{
    internal static class TopoHelpers
    {
        public static bool TryReadNodoDesc(BlockReference br, Transaction tr, out int nodo, out string desc)
        {
            nodo = 0;
            desc = "";
            try
            {
                if (br.AttributeCollection == null) return false;

                string? nodoStr = null;
                string? descStr = null;

                foreach (ObjectId attId in br.AttributeCollection)
                {
                    if (!attId.IsValid || attId.IsNull) continue;
                    var ar = tr.GetObject(attId, OpenMode.ForRead, false) as AttributeReference;
                    if (ar == null) continue;

                    var tag = (ar.Tag ?? "").Trim().ToUpperInvariant();
                    if (tag == "NODO") nodoStr = ar.TextString?.Trim();
                    else if (tag == "DESC" || tag == "DESCRIPCION") descStr = ar.TextString?.Trim();

                    if (nodoStr != null && descStr != null) break;
                }

                if (string.IsNullOrWhiteSpace(nodoStr)) return false;
                if (!int.TryParse(nodoStr, out nodo)) return false;

                desc = descStr ?? "";
                return true;
            }
            catch { return false; }
        }

        // Reemplazo completo
        // Reemplazo completo
        public static void ZoomToExtents(Editor ed, Extents3d ext, double marginFactor = 1.1)
        {
            try
            {
                var min = ext.MinPoint;
                var max = ext.MaxPoint;

                // Margen
                var diag = max - min;
                var cx = (min.X + max.X) * 0.5;
                var cy = (min.Y + max.Y) * 0.5;

                var halfX = Math.Abs(diag.X) * 0.5 * marginFactor + 1e-4;
                var halfY = Math.Abs(diag.Y) * 0.5 * marginFactor + 1e-4;

                var p1 = new Point3d(cx - halfX, cy - halfY, 0);
                var p2 = new Point3d(cx + halfX, cy + halfY, 0);

                ZoomWindowWcs(ed, p1, p2); // << corregido: no existe Editor.ZoomWindow
            }
            catch { /* no romper */ }
        }

        // Nuevo helper: aplica zoom a una ventana definida en WCS.
        // Convierte WCS -> DCS y ajusta la vista actual.
        private static void ZoomWindowWcs(Editor ed, Point3d p1Wcs, Point3d p2Wcs)
        {
            using (var vtr = ed.GetCurrentView())
            {
                // Transformación WCS -> DCS
                // DCS = Display Coordinate System de la vista actual
                Matrix3d wcs2dcs =
                    Matrix3d.Rotation(-vtr.ViewTwist, vtr.ViewDirection, vtr.Target) *
                    Matrix3d.Displacement(vtr.Target - Point3d.Origin).Inverse() *
                    Matrix3d.PlaneToWorld(vtr.ViewDirection).Inverse();

                var p1 = p1Wcs.TransformBy(wcs2dcs);
                var p2 = p2Wcs.TransformBy(wcs2dcs);

                // Normalizar rectángulo
                var minX = Math.Min(p1.X, p2.X);
                var maxX = Math.Max(p1.X, p2.X);
                var minY = Math.Min(p1.Y, p2.Y);
                var maxY = Math.Max(p1.Y, p2.Y);

                double width = Math.Max(maxX - minX, 1e-6);
                double height = Math.Max(maxY - minY, 1e-6);

                // Centro y tamaños en DCS
                vtr.CenterPoint = new Point2d(minX + width / 2.0, minY + height / 2.0);
                vtr.Width = width;
                vtr.Height = height;

                ed.SetCurrentView(vtr);
            }
        }

        /// <summary>
        /// Obtiene siguiente número de punto desde NOD y XRecord. Si no existe, arranca en 1.
        /// </summary>
        public static int GetNextPointNumber(Database db, Transaction tr)
        {
            const string dictName = "SICOE_NODO_CTRL";
            const string xrecName = "NEXT_POINT";

            var nod = (DBDictionary)tr.GetObject(db.NamedObjectsDictionaryId, OpenMode.ForRead);
            if (!nod.Contains(dictName))
                return 1;

            var dictId = nod.GetAt(dictName);
            var dict = (DBDictionary)tr.GetObject(dictId, OpenMode.ForRead);

            if (!dict.Contains(xrecName))
                return 1;

            var xrId = dict.GetAt(xrecName);
            var xr = (Xrecord)tr.GetObject(xrId, OpenMode.ForRead);
            var rb = xr.Data;
            if (rb == null) return 1;

            foreach (var tv in rb)
            {
                if (tv.TypeCode == (int)DxfCode.Int32)
                    return (int)tv.Value;
            }
            return 1;
        }

        public static void SaveNextPointNumber(Database db, Transaction tr, int next)
        {
            const string dictName = "SICOE_NODO_CTRL";
            const string xrecName = "NEXT_POINT";

            var nod = (DBDictionary)tr.GetObject(db.NamedObjectsDictionaryId, OpenMode.ForRead);
            ObjectId dictId;

            if (!nod.Contains(dictName))
            {
                nod.UpgradeOpen();
                var nd = new DBDictionary();
                dictId = nod.SetAt(dictName, nd);
                tr.AddNewlyCreatedDBObject(nd, true);
            }
            else
            {
                dictId = nod.GetAt(dictName);
            }

            var dict = (DBDictionary)tr.GetObject(dictId, OpenMode.ForWrite);
            Xrecord xr;
            if (!dict.Contains(xrecName))
            {
                xr = new Xrecord();
                dict.SetAt(xrecName, xr);
                tr.AddNewlyCreatedDBObject(xr, true);
            }
            else
            {
                xr = (Xrecord)tr.GetObject(dict.GetAt(xrecName), OpenMode.ForWrite);
            }

            xr.Data = new ResultBuffer(new TypedValue((int)DxfCode.Int32, next));
        }

        /// <summary>
        /// Crea filtro para referencias de bloque (INSERT).
        /// </summary>
        public static SelectionFilter BlockRefFilter()
        {
            return new SelectionFilter(new TypedValue[]
            {
                new TypedValue((int)DxfCode.Start, "INSERT")
            });
        }

        public static IEnumerable<(ObjectId id, int punto, string desc, string blk, Point3d pos)>
            ExtractNodoItems(Database db, Editor ed, SelectionSet ss)
        {
            var items = new List<(ObjectId, int, string, string, Point3d)>();
            using (var tr = db.TransactionManager.StartTransaction())
            {
                foreach (var sel in ss.GetObjectIds())
                {
                    var obj = tr.GetObject(sel, OpenMode.ForRead, false) as BlockReference;
                    if (obj == null) continue;

                    if (!TryReadNodoDesc(obj, tr, out var nodo, out var desc)) continue;

                    var btr = (BlockTableRecord)tr.GetObject(obj.BlockTableRecord, OpenMode.ForRead);
                    var name = btr.Name;

                    items.Add((sel, nodo, desc ?? "", name ?? "", obj.Position));
                }
                tr.Commit();
            }
            return items;
        }
        // Selecciona solo los ids dados y fuerza refresco de pantalla.
        public static void SelectOnly(Editor ed, IEnumerable<ObjectId> ids)
        {
            try
            {
                var arr = ids?.Where(id => id.IsValid && !id.IsNull).Distinct().ToArray() ?? Array.Empty<ObjectId>();
                ed.SetImpliedSelection(arr);
                ed.Regen();          // actualiza vista y grips
                ed.UpdateScreen();   // asegura repintado inmediato
            }
            catch { /* no romper */ }
        }

    }
}
