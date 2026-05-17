using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using System.Linq;

namespace SicoePresupuestoNET8
{
    internal static class CapasStore
    {
        private const string DictName = "SICOE_CFG";
        private const string KeyPath = "CAPAS_CSV_PATH";

        public static void SavePathToDwg(string path)
        {
            var db = Application.DocumentManager.MdiActiveDocument?.Database;
            if (db == null) return;

            using var tr = db.TransactionManager.StartTransaction();
            var nod = (DBDictionary)tr.GetObject(db.NamedObjectsDictionaryId, OpenMode.ForRead);

            DBDictionary dic;
            if (!nod.Contains(DictName))
            {
                nod.UpgradeOpen();
                dic = new DBDictionary();
                nod.SetAt(DictName, dic);
                tr.AddNewlyCreatedDBObject(dic, true);
            }
            else dic = (DBDictionary)tr.GetObject(nod.GetAt(DictName), OpenMode.ForWrite);

            var xr = new Xrecord { Data = new ResultBuffer(new TypedValue((int)DxfCode.Text, path ?? "")) };

            if (dic.Contains(KeyPath))
            {
                var old = (Xrecord)tr.GetObject(dic.GetAt(KeyPath), OpenMode.ForWrite);
                old.Data = xr.Data;
            }
            else
            {
                dic.SetAt(KeyPath, xr);
                tr.AddNewlyCreatedDBObject(xr, true);
            }
            tr.Commit();
        }

        public static string? LoadPathFromDwg()
        {
            var db = Application.DocumentManager.MdiActiveDocument?.Database;
            if (db == null) return null;

            using var tr = db.TransactionManager.StartTransaction();
            var nod = (DBDictionary)tr.GetObject(db.NamedObjectsDictionaryId, OpenMode.ForRead);

            if (!nod.Contains(DictName)) return null;
            var dic = (DBDictionary)tr.GetObject(nod.GetAt(DictName), OpenMode.ForRead);
            if (!dic.Contains(KeyPath)) return null;

            var xr = (Xrecord)tr.GetObject(dic.GetAt(KeyPath), OpenMode.ForRead);
            var txt = xr.Data?.AsArray().FirstOrDefault(v => v.TypeCode == (int)DxfCode.Text).Value as string;
            return string.IsNullOrWhiteSpace(txt) ? null : txt;
        }
    }
}
