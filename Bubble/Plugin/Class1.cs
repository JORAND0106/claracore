using System;
using System.IO;
using System.Linq;
using System.Globalization;
using System.Collections.Generic;

using Autodesk.AutoCAD.Runtime; // Solo para [CommandMethod] (sin usar Application para evitar ambigüedades)
using acApp = Autodesk.AutoCAD.ApplicationServices;
using acDb = Autodesk.AutoCAD.DatabaseServices;


namespace SicoePresupuestoNET8
{
    // ====== Modelo ======
    public class PresItem
    {
        public string Capitulo { get; set; } = "";
        public string Competencia { get; set; } = "";
        public string Item { get; set; } = "";
        public string Descripcion { get; set; } = "";
        public string Und { get; set; } = "";
        public decimal ValorUnitario { get; set; }
        public string? ColorHex { get; set; } // nuevo campo


        // Para mostrar en el combo de Ítem (código + descripción)
        public string Display => string.IsNullOrWhiteSpace(Descripcion)
                               ? Item
                               : $"{Item} - {Descripcion}";

        // ====== Servicios / “backend” ======
        /// Carga el catálogo desde un CSV. Devuelve true/false y, si hay error, el mensaje en <paramref name="error"/>.
        /// Formato esperado (cabecera opcional): Capitulo,Competencia,Item,Descripcion,Und,ValorUnitario
        /// Separador: coma o punto y coma.
        /// </summary>
        public static bool TryLoadCatalog(string path, out string error)
        {
            error = "";
            try
            {
                var list = LeerCsv(path);
                return true;
            }
            catch (System.Exception ex) // ¡OJO! fully-qualified para evitar choque con Autodesk.AutoCAD.Runtime.Exception
            {
                error = ex.Message;
                return false;
            }
        }

        /// <summary>
        /// Lector simple de CSV (coma o punto y coma). Ignora líneas vacías.
        /// </summary>
        public static List<PresItem> LeerCsv(string path)
        {
            if (string.IsNullOrWhiteSpace(path))
                throw new System.Exception("Ruta de archivo vacía.");

            if (!File.Exists(path))
                throw new System.Exception("No se encontró el archivo: " + path);

            var lines = File.ReadAllLines(path);
            var items = new List<PresItem>();
            bool maybeHeader = true;

            foreach (var raw in lines)
            {
                var line = raw?.Trim();
                if (string.IsNullOrWhiteSpace(line)) continue;

                // Soporta "," o ";"
                var parts = line.Split(line.Contains(';') ? ';' : ',');

                // ¿Cabecera?
                if (maybeHeader &&
                    parts.Length >= 6 &&
                    parts[0].Trim().Equals("Capitulo", StringComparison.OrdinalIgnoreCase))
                {
                    maybeHeader = false;
                    continue;
                }
                maybeHeader = false;

                // Campos mínimos
                if (parts.Length < 6) continue;

                // Parseo seguro
                string cap = parts[0].Trim();
                string comp = parts[1].Trim();
                string item = parts[2].Trim();
                string desc = parts[3].Trim();
                string und = parts[4].Trim();

                // Valor unitario con cultura invariante (acepta “.” como decimal)
                decimal vu = 0m;
                decimal.TryParse(
                    parts[5].Trim().Replace(",", "."),
                    NumberStyles.Any,
                    CultureInfo.InvariantCulture,
                    out vu);

                items.Add(new PresItem
                {
                    Capitulo = cap,
                    Competencia = comp,
                    Item = item,
                    Descripcion = desc,
                    Und = und,
                    ValorUnitario = vu
                });
            }

            return items;
        }

        // ====== Comandos de AutoCAD (opcionales, útiles para probar) ======

        /// <summary>
        /// Abre el formulario (modeless). Comando: SicoeCAD
        /// </summary>
   
    }
    internal static class AxisStore
    {
        private const string XR_KEY = "SICOE_AXIS_CTX";

        // Guarda en el DWG actual el AxisContext (handles + parámetros)
        public static void SaveToDwg(AxisContext ctx)
        {
            var db = acApp.Application.DocumentManager.MdiActiveDocument.Database;
            using var tr = db.TransactionManager.StartTransaction();
            var nod = (acDb.DBDictionary)tr.GetObject(db.NamedObjectsDictionaryId, acDb.OpenMode.ForRead);

            nod.UpgradeOpen();

            var rb = new acDb.ResultBuffer(
                new acDb.TypedValue((int)acDb.DxfCode.Text, XR_KEY),                      // marca
                new acDb.TypedValue((int)acDb.DxfCode.Int16, ctx.IsDouble ? 1 : 0),        // 1=doble
                new acDb.TypedValue((int)acDb.DxfCode.Int64, ctx.AxisA.Handle.Value),      // handle A
                new acDb.TypedValue((int)acDb.DxfCode.Int64, ctx.AxisB.IsNull ? 0L : ctx.AxisB.Handle.Value), // handle B o 0
                new acDb.TypedValue((int)acDb.DxfCode.Real, ctx.Pk0DistA),
                new acDb.TypedValue((int)acDb.DxfCode.Real, ctx.Pk0DistB),
                new acDb.TypedValue((int)acDb.DxfCode.Real, ctx.OrdIzq_A),
                new acDb.TypedValue((int)acDb.DxfCode.Real, ctx.OrdDer_A),
                new acDb.TypedValue((int)acDb.DxfCode.Real, ctx.OrdIzq_B),
                new acDb.TypedValue((int)acDb.DxfCode.Real, ctx.OrdDer_B),
                new acDb.TypedValue((int)acDb.DxfCode.Text, ctx.NombreA ?? ""),
                new acDb.TypedValue((int)acDb.DxfCode.Text, ctx.NombreB ?? "")
            );

            acDb.Xrecord xr;
            if (nod.Contains(XR_KEY))
            {
                xr = (acDb.Xrecord)tr.GetObject(nod.GetAt(XR_KEY), acDb.OpenMode.ForWrite);
                xr.Data = rb;
            }
            else
            {
                xr = new acDb.Xrecord { Data = rb };
                nod.SetAt(XR_KEY, xr);
                tr.AddNewlyCreatedDBObject(xr, true);
            }

            tr.Commit();
        }

        // Intenta leer del DWG actual. Devuelve null si no hay datos válidos.
        public static AxisContext? LoadFromDwg()
        {
            var db = acApp.Application.DocumentManager.MdiActiveDocument.Database;
            using var tr = db.TransactionManager.StartTransaction();
            var nod = (acDb.DBDictionary)tr.GetObject(db.NamedObjectsDictionaryId, acDb.OpenMode.ForRead);

            if (!nod.Contains(XR_KEY)) return null;

            var xr = (acDb.Xrecord)tr.GetObject(nod.GetAt(XR_KEY), acDb.OpenMode.ForRead);
            var tv = xr.Data?.AsArray();
            if (tv == null || tv.Length < 12) return null;

            try
            {
                bool isDouble = Convert.ToInt16(tv[1].Value) == 1;
                long hA = Convert.ToInt64(tv[2].Value);
                long hB = Convert.ToInt64(tv[3].Value);
                double pk0A = Convert.ToDouble(tv[4].Value);
                double pk0B = Convert.ToDouble(tv[5].Value);
                double ordIA = Convert.ToDouble(tv[6].Value);
                double ordDA = Convert.ToDouble(tv[7].Value);
                double ordIB = Convert.ToDouble(tv[8].Value);
                double ordDB = Convert.ToDouble(tv[9].Value);
                string nomA = Convert.ToString(tv[10].Value) ?? "";
                string nomB = Convert.ToString(tv[11].Value) ?? "";

                acDb.ObjectId idA = db.GetObjectId(false, new acDb.Handle(hA), 0);
                acDb.ObjectId idB = acDb.ObjectId.Null;
                if (isDouble && hB != 0) idB = db.GetObjectId(false, new acDb.Handle(hB), 0);

                // Validar que existan las curvas
                if (tr.GetObject(idA, acDb.OpenMode.ForRead, false, true) is not acDb.Curve)
                    return null;
                if (isDouble && !idB.IsNull &&
                    tr.GetObject(idB, acDb.OpenMode.ForRead, false, true) is not acDb.Curve)
                    return null;

                var ctx = new AxisContext
                {
                    IsDouble = isDouble,
                    AxisA = idA,
                    AxisB = idB,
                    Pk0DistA = pk0A,
                    Pk0DistB = pk0B,
                    OrdIzq_A = ordIA,
                    OrdDer_A = ordDA,
                    OrdIzq_B = ordIB,
                    OrdDer_B = ordDB,
                    NombreA = nomA,
                    NombreB = nomB
                };
                return ctx;
            }
            catch
            {
                return null;
            }
        }

        // Limpia el eje guardado en el DWG
        public static void ClearFromDwg()
        {
            var db = acApp.Application.DocumentManager.MdiActiveDocument.Database;
            using var tr = db.TransactionManager.StartTransaction();
            var nod = (acDb.DBDictionary)tr.GetObject(db.NamedObjectsDictionaryId, acDb.OpenMode.ForRead);
            if (nod.Contains(XR_KEY))
            {
                nod.UpgradeOpen();
                var id = nod.GetAt(XR_KEY);
                var xr = (acDb.Xrecord)tr.GetObject(id, acDb.OpenMode.ForWrite);
                xr.Erase(true);
            }
            tr.Commit();
        }
    }
}
