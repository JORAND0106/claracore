using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Text;
using Newtonsoft.Json.Linq;
using System.Threading;
using System.Threading.Tasks;

using acApp = Autodesk.AutoCAD.ApplicationServices;
using acDb  = Autodesk.AutoCAD.DatabaseServices;
using acEd  = Autodesk.AutoCAD.EditorInput;
using acGe  = Autodesk.AutoCAD.Geometry;

namespace SicoePresupuestoNET8
{
    /// <summary>
    /// Worker que corre en background dentro de AutoCAD:
    /// 1) Envía heartbeat cada 3s → POST /cad-queue/{contratoId}/heartbeat
    /// 2) Descarga operaciones pendientes → GET /cad-queue/{contratoId}/pendientes
    /// 3) Ejecuta cada op en AutoCAD (cambiar_layer | insertar_bloque)
    /// 4) Marca como procesada → PUT /cad-queue/{id}/procesado
    /// </summary>
    public sealed class CadQueueWorker : IDisposable
    {
        // ── Config ──────────────────────────────────────────────────────────
        private readonly string _baseUrl;
        private readonly string _token;
        private readonly int _contratoId;
        private readonly int _usuarioId;
        private const int INTERVAL_MS = 3000;

        private Timer? _timer;
        private bool _running = false;
        private readonly object _lock = new();
        private static readonly HttpClient _http = new HttpClient();

        // ── Ctor ────────────────────────────────────────────────────────────
        public CadQueueWorker(string baseUrl, string token, int contratoId, int usuarioId = 0)
        {
            _baseUrl = baseUrl.TrimEnd('/');
            _token = token;
            _contratoId = contratoId;
            _usuarioId = usuarioId;
        }

        // ── Ciclo de vida ───────────────────────────────────────────────────
        public void Start()
        {
            _timer = new Timer(_ => Tick(), null, 0, INTERVAL_MS);
        }

        public void Stop()
        {
            _timer?.Dispose();
            _timer = null;
        }

        public void Dispose() => Stop();

        // ── Tick principal ──────────────────────────────────────────────────
        private void Tick()
        {
            lock (_lock)
            {
                if (_running) return;
                _running = true;
            }
            try
            {
                // 1) Heartbeat
                try { CurlPost($"{_baseUrl}/cad-queue/{_contratoId}/heartbeat?usuario_id={_usuarioId}", "{}", _token); }
                catch { }

                // 2) Descargar pendientes
                string json;
                try { json = CurlGet($"{_baseUrl}/cad-queue/{_contratoId}/pendientes", _token); }
                catch { return; }

                if (string.IsNullOrWhiteSpace(json) || json == "[]") return;

                // 3) Parsear — protegido: si el servidor devuelve HTML/texto de error, no crashea
                JArray doc;
                try { doc = JArray.Parse(json); }
                catch { return; } // respuesta no-JSON → ignorar silenciosamente

                {
                    foreach (var op in doc)
                    {
                        var id = op["id"].Value<long>();
                        var tipo = op["tipo"]?.Value<string>() ?? "";
                        var payload = (JObject)op["payload"];

                        string? revHandle = null;
                        int? presId = null;

                        try
                        {
                            switch (tipo)
                            {
                                case "cambiar_layer":
                                    EjecutarCambiarLayer(payload);
                                    break;

                                case "insertar_bloque":
                                    (revHandle, presId) = EjecutarInsertarBloque(payload);
                                    break;

                                case "zoom_pkid":
                                    EjecutarZoomPkid(payload);
                                    break;

                                case "highlight_registro":
                                    EjecutarHighlightRegistro(payload);
                                    break;

                                case "create_label":
                                    (revHandle, presId) = EjecutarCrearEtiqueta(payload);
                                    break;
                            }
                        }
                        catch { /* no bloquear el ciclo por un error de AutoCAD */ }

                        // 4) Marcar procesado
                        try
                        {
                            var body = revHandle != null
                                ? $"{{\"rev_block_handle\":\"{revHandle}\",\"presupuesto_id\":{presId}}}"
                                : "{}";
                            CurlPut($"{_baseUrl}/cad-queue/{id}/procesado", body, _token);
                        }
                        catch { }
                    }
                }
            }
            catch { } // captura cualquier excepción no prevista → nunca llega al ThreadPool
            finally
            {
                lock (_lock) { _running = false; }
            }
        }

        // ── Operación: cambiar layer de entidad y texto ─────────────────────
        private void EjecutarCambiarLayer(JObject p)
        {
            var entHandle = p["ent_handle"]?.Value<string>() ?? "";
            var txtHandle = p["txt_handle"]?.Value<string>() ?? "";
            var layerEnt = p["layer_ent"]?.Value<string>() ?? "";
            var layerTxt = p["layer_txt"]?.Value<string>() ?? "";
            var colorHex = p["color_hex"]?.Value<string>() ?? "";

            if (string.IsNullOrEmpty(entHandle) && string.IsNullOrEmpty(txtHandle)) return;

            var acadDoc = acApp.Application.DocumentManager.MdiActiveDocument;
            if (acadDoc == null) return;

            using var docLock = acadDoc.LockDocument();
            using var tr = acadDoc.Database.TransactionManager.StartTransaction();

            if (!string.IsNullOrEmpty(layerEnt) && !string.IsNullOrEmpty(entHandle))
            {
                EnsureLayer(tr, acadDoc.Database, layerEnt, colorHex);
                ChangeEntityLayer(tr, acadDoc.Database, entHandle, layerEnt);
            }
            if (!string.IsNullOrEmpty(layerTxt) && !string.IsNullOrEmpty(txtHandle))
            {
                EnsureLayer(tr, acadDoc.Database, layerTxt, colorHex);
                ChangeEntityLayer(tr, acadDoc.Database, txtHandle, layerTxt);
            }

            // Actualizar texto de etiqueta si viene new_text
            var ntVal = p["new_text"]?.Value<string>();
            if (!string.IsNullOrEmpty(ntVal) && !string.IsNullOrEmpty(txtHandle))
            {
                try
                {
                    var h = new acDb.Handle(Convert.ToInt64(txtHandle, 16));
                    if (acadDoc.Database.TryGetObjectId(h, out var objId))
                    {
                        var obj = tr.GetObject(objId, acDb.OpenMode.ForWrite);
                        if (obj is acDb.DBText dbText)
                            dbText.TextString = ntVal;
                        else if (obj is acDb.MText mText)
                            mText.Contents = ntVal;
                    }
                }
                catch { }
            }

            tr.Commit();
        }

        private void EjecutarZoomPkid(JObject p)
        {
            var x = p["x"]?.Value<double>() ?? 0;
            var y = p["y"]?.Value<double>() ?? 0;
            var radio = p["radio"]?.Value<double>() ?? 30;
            var handle = p["ent_handle"]?.Value<string>() ?? "";
            NavegarRegistroEnPlano(handle, "", x, y, radio);
        }

        // ── Operación: highlight de registro presupuesto ────────────────────
        private void EjecutarHighlightRegistro(JObject p)
        {
            var entHandle = p["ent_handle"]?.Value<string>() ?? "";
            var txtHandle = p["txt_handle"]?.Value<string>() ?? "";
            var x = p["x_label"]?.Value<double>() ?? 0;
            var y = p["y_label"]?.Value<double>() ?? 0;
            if (string.IsNullOrEmpty(entHandle) && (x == 0 && y == 0)) return;
            NavegarRegistroEnPlano(entHandle, txtHandle, x, y, 20);
        }

        /// <summary>
        /// Zoom + selección implícita sin dejar comandos activos en la línea de comando (evita SELECT pendiente).
        /// </summary>
        private static void NavegarRegistroEnPlano(string entHandle, string txtHandle, double x, double y, double radioFallback)
        {
            var acadDoc = acApp.Application.DocumentManager.MdiActiveDocument;
            if (acadDoc == null) return;

            TraerAcadAlFrenteSinRedimensionar();
            CancelarComandoPendiente(acadDoc);

            acDb.ObjectId? entOid = null;
            var handlesFlash = new List<string>();
            if (!string.IsNullOrWhiteSpace(entHandle)) handlesFlash.Add(entHandle.Trim());
            if (!string.IsNullOrWhiteSpace(txtHandle)) handlesFlash.Add(txtHandle.Trim());

            try
            {
                using var docLock = acadDoc.LockDocument();
                using var tr = acadDoc.Database.TransactionManager.StartTransaction();
                var ed = acadDoc.Editor;
                bool zoomHecho = false;

                if (!string.IsNullOrWhiteSpace(entHandle))
                {
                    try
                    {
                        var h = new acDb.Handle(Convert.ToInt64(entHandle.Trim(), 16));
                        if (acadDoc.Database.TryGetObjectId(h, out var oid))
                        {
                            entOid = oid;
                            if (tr.GetObject(oid, acDb.OpenMode.ForRead, false, true) is acDb.Entity ent)
                            {
                                ZoomExtentsEditor(ed, ent.GeometricExtents, 1.25);
                                zoomHecho = true;
                            }
                        }
                    }
                    catch { }
                }

                if (!zoomHecho && (x != 0 || y != 0))
                {
                    double half = Math.Max(radioFallback, 5.0);
                    var ext = new acDb.Extents3d(
                        new acGe.Point3d(x - half, y - half, 0),
                        new acGe.Point3d(x + half, y + half, 0));
                    ZoomExtentsEditor(ed, ext, 1.0);
                    zoomHecho = true;
                }

                if (entOid.HasValue)
                {
                    try { ed.SetImpliedSelection(new[] { entOid.Value }); } catch { }
                    try { ed.Regen(); } catch { }
                }

                tr.Commit();
            }
            catch { }

            if (handlesFlash.Count > 0)
                ResaltarHandlesTemporal(acadDoc, handlesFlash);
        }

        /// <summary>Trae AutoCAD al frente sin cambiar WindowState (no maximiza ni restaura).</summary>
        private static void TraerAcadAlFrenteSinRedimensionar()
        {
            try
            {
                var mw = acApp.Application.MainWindow;
                mw?.Focus();
            }
            catch { }
        }

        /// <summary>ESC + espera a que el editor quede libre (sin SELECT u otro comando a medias).</summary>
        private static void CancelarComandoPendiente(acApp.Document doc)
        {
            if (doc == null) return;
            try
            {
                doc.SendStringToExecute("\x03\x03", true, false, false);
                var ed = doc.Editor;
                for (int i = 0; i < 20 && !ed.IsQuiescent; i++)
                    System.Threading.Thread.Sleep(15);
            }
            catch { }
        }

        private static void ZoomExtentsEditor(acEd.Editor ed, acDb.Extents3d ext, double factor)
        {
            if (factor <= 0) factor = 1.25;
            using var view = ed.GetCurrentView();
            var wc2ec = acGe.Matrix3d.PlaneToWorld(view.ViewDirection);
            wc2ec = acGe.Matrix3d.Displacement(view.Target - acGe.Point3d.Origin) * wc2ec;
            wc2ec = acGe.Matrix3d.Rotation(-view.ViewTwist, view.ViewDirection, view.Target) * wc2ec;

            var extEc = ext;
            extEc.TransformBy(wc2ec.Inverse());

            var min = extEc.MinPoint;
            var max = extEc.MaxPoint;
            double width = Math.Max((max.X - min.X) * factor, 1e-6);
            double height = Math.Max((max.Y - min.Y) * factor, 1e-6);
            if (width <= 0) width = view.Width;
            if (height <= 0) height = view.Height;

            view.Width = width;
            view.Height = height;
            view.CenterPoint = new acGe.Point2d((max.X + min.X) / 2.0, (max.Y + min.Y) / 2.0);
            ed.SetCurrentView(view);
        }

        private static void ResaltarHandlesTemporal(acApp.Document doc, List<string> handles)
        {
            var coloresOriginales = new Dictionary<string, int>();

            try
            {
                using var lk = doc.LockDocument();
                using var tr = doc.Database.TransactionManager.StartTransaction();
                foreach (var hStr in handles)
                {
                    try
                    {
                        var hObj = new acDb.Handle(Convert.ToInt64(hStr, 16));
                        if (!doc.Database.TryGetObjectId(hObj, out var objId)) continue;
                        if (tr.GetObject(objId, acDb.OpenMode.ForWrite, false, true) is acDb.Entity ent)
                        {
                            coloresOriginales[hStr] = ent.ColorIndex;
                            ent.ColorIndex = 2;
                        }
                    }
                    catch { }
                }
                tr.Commit();
            }
            catch { return; }

            if (coloresOriginales.Count == 0) return;

            Task.Delay(3000).ContinueWith(_ =>
            {
                try
                {
                    var doc2 = acApp.Application.DocumentManager.MdiActiveDocument;
                    if (doc2 == null) return;
                    using var lk2 = doc2.LockDocument();
                    using var tr2 = doc2.Database.TransactionManager.StartTransaction();
                    foreach (var kvp in coloresOriginales)
                    {
                        try
                        {
                            var hObj2 = new acDb.Handle(Convert.ToInt64(kvp.Key, 16));
                            if (doc2.Database.TryGetObjectId(hObj2, out var oid2)
                                && tr2.GetObject(oid2, acDb.OpenMode.ForWrite, false, true) is acDb.Entity ent2)
                                ent2.ColorIndex = kvp.Value;
                        }
                        catch { }
                    }
                    tr2.Commit();
                }
                catch { }
            });
        }

        // ── Operación: insertar bloque semáforo ─────────────────────────────
        private (string? handle, int? presId) EjecutarInsertarBloque(JObject p)
        {
            var x = p["x_label"]?.Value<double>() ?? 0;
            var y = p["y_label"]?.Value<double>() ?? 0;
            var estado = p["estado"]?.Value<string>() ?? "";
            var layerTxt = p["layer_txt"]?.Value<string>() ?? "";
            var oldHandle = p["rev_block_handle"]?.Value<string>() ?? "";
            var presId = p["presupuesto_id"]?.Value<int>();

            if (x == 0 && y == 0) return (null, null);

            var blkName = estado switch
            {
                "Verificado"      => "Verificado",
                "Verificar Campo" => "Verificar Campo",
                _                 => "Pendiente",
            };

            var acadDoc = acApp.Application.DocumentManager.MdiActiveDocument;
            if (acadDoc == null) return (null, null);

            using var docLock = acadDoc.LockDocument();
            using var tr = acadDoc.Database.TransactionManager.StartTransaction();

            // Borrar bloque anterior si existe
            if (!string.IsNullOrEmpty(oldHandle))
                TryDeleteByHandle(tr, acadDoc.Database, oldHandle);

            // Verificar que el bloque exista en el DWG
            if (!BlockExists(tr, acadDoc.Database, blkName))
            {
                tr.Commit();
                return (null, null);
            }

            // Insertar nuevo bloque
            string? newHandle = null;
            var bt = (acDb.BlockTable)tr.GetObject(acadDoc.Database.BlockTableId, acDb.OpenMode.ForRead);
            var ms = (acDb.BlockTableRecord)tr.GetObject(bt[acDb.BlockTableRecord.ModelSpace], acDb.OpenMode.ForWrite);

            var blkRef = new acDb.BlockReference(
                new acGe.Point3d(x, y, 0),
                bt[blkName]
            );
            blkRef.ScaleFactors = new acGe.Scale3d(1, 1, 1);

            // Asignar layer del texto si está disponible
            if (!string.IsNullOrEmpty(layerTxt))
            {
                EnsureLayer(tr, acadDoc.Database, layerTxt, "");
                blkRef.Layer = layerTxt;
            }

            ms.AppendEntity(blkRef);
            tr.AddNewlyCreatedDBObject(blkRef, true);
            newHandle = blkRef.Handle.ToString();

            tr.Commit();
            return (newHandle, presId);
        }

        // ── Operación: crear etiqueta de texto para nueva cantidad ──────────
        private (string? handle, int? presId) EjecutarCrearEtiqueta(JObject p)
        {
            var x = p["x_label"]?.Value<double>() ?? 0;
            var y = p["y_label"]?.Value<double>() ?? 0;
            var layerTxt = p["layer_txt"]?.Value<string>() ?? "";
            var idPol = p["id_pol"]?.Value<string>() ?? "";
            var presId = p["presupuesto_id"]?.Value<int>();

            if (x == 0 && y == 0 || string.IsNullOrEmpty(idPol)) return (null, null);

            var acadDoc = acApp.Application.DocumentManager.MdiActiveDocument;
            if (acadDoc == null) return (null, null);

            using var docLock = acadDoc.LockDocument();
            using var tr = acadDoc.Database.TransactionManager.StartTransaction();

            // Asegurar que el layer exista
            if (!string.IsNullOrEmpty(layerTxt))
                EnsureLayer(tr, acadDoc.Database, layerTxt, "");

            // Crear el texto en el ModelSpace
            var bt = (acDb.BlockTable)tr.GetObject(acadDoc.Database.BlockTableId, acDb.OpenMode.ForRead);
            var ms = (acDb.BlockTableRecord)tr.GetObject(bt[acDb.BlockTableRecord.ModelSpace], acDb.OpenMode.ForWrite);

            var dbText = new acDb.DBText
            {
                TextString = idPol,
                Position = new acGe.Point3d(x, y, 0),
                Height = 0.15,   // altura estándar — ajusta si difiere del DWG
                Layer = !string.IsNullOrEmpty(layerTxt) ? layerTxt : "0"
            };

            ms.AppendEntity(dbText);
            tr.AddNewlyCreatedDBObject(dbText, true);

            string newHandle = dbText.Handle.ToString();
            tr.Commit();

            return (newHandle, presId);
        }

        // ── Helpers AutoCAD ─────────────────────────────────────────────────
        private static void ChangeEntityLayer(acDb.Transaction tr, acDb.Database db, string handle, string layer)
        {
            try
            {
                var h = new acDb.Handle(Convert.ToInt64(handle, 16));
                if (!db.TryGetObjectId(h, out var objId)) return;
                var ent = (acDb.Entity)tr.GetObject(objId, acDb.OpenMode.ForWrite);
                ent.Layer = layer;
            }
            catch { }
        }

        private static void EnsureLayer(acDb.Transaction tr, acDb.Database db, string layerName, string colorHex)
        {
            try
            {
                var lt = (acDb.LayerTable)tr.GetObject(db.LayerTableId, acDb.OpenMode.ForRead);
                if (lt.Has(layerName)) return;

                lt.UpgradeOpen();
                var ltr = new acDb.LayerTableRecord { Name = layerName };

                if (!string.IsNullOrEmpty(colorHex))
                {
                    try
                    {
                        var hex = colorHex.TrimStart('#');
                        int r = Convert.ToInt32(hex.Substring(0, 2), 16);
                        int g = Convert.ToInt32(hex.Substring(2, 2), 16);
                        int b = Convert.ToInt32(hex.Substring(4, 2), 16);
                        ltr.Color = Autodesk.AutoCAD.Colors.Color.FromRgb((byte)r, (byte)g, (byte)b);
                    }
                    catch { }
                }

                lt.Add(ltr);
                tr.AddNewlyCreatedDBObject(ltr, true);
            }
            catch { }
        }

        private static bool BlockExists(acDb.Transaction tr, acDb.Database db, string blkName)
        {
            try
            {
                var bt = (acDb.BlockTable)tr.GetObject(db.BlockTableId, acDb.OpenMode.ForRead);
                return bt.Has(blkName);
            }
            catch { return false; }
        }

        private static void TryDeleteByHandle(acDb.Transaction tr, acDb.Database db, string handle)
        {
            try
            {
                var h = new acDb.Handle(Convert.ToInt64(handle, 16));
                if (!db.TryGetObjectId(h, out var objId)) return;
                var obj = tr.GetObject(objId, acDb.OpenMode.ForWrite);
                obj.Erase();
            }
            catch { }
        }

        // ── Helpers HTTP — curl.exe como proceso separado, evita bloqueo de AutoCAD ──
        private static string CurlGet(string url, string token)
        {
            var auth = string.IsNullOrEmpty(token) ? "" : $"-H \"Authorization: Bearer {token}\"";
            return RunCurl($"-s \"{url}\" {auth}");
        }

        private static string CurlPost(string url, string jsonBody, string token)
        {
            var tmp = System.IO.Path.GetTempFileName() + ".json";
            System.IO.File.WriteAllText(tmp, jsonBody, Encoding.UTF8);
            var auth = string.IsNullOrEmpty(token) ? "" : $"-H \"Authorization: Bearer {token}\"";
            var result = RunCurl($"-s -X POST \"{url}\" {auth} -H \"Content-Type: application/json\" --data-binary \"@{tmp}\"");
            try { System.IO.File.Delete(tmp); } catch { }
            return result;
        }

        private static string CurlPut(string url, string jsonBody, string token)
        {
            var tmp = System.IO.Path.GetTempFileName() + ".json";
            System.IO.File.WriteAllText(tmp, jsonBody, Encoding.UTF8);
            var auth = string.IsNullOrEmpty(token) ? "" : $"-H \"Authorization: Bearer {token}\"";
            var result = RunCurl($"-s -X PUT \"{url}\" {auth} -H \"Content-Type: application/json\" --data-binary \"@{tmp}\"");
            try { System.IO.File.Delete(tmp); } catch { }
            return result;
        }

        private static string RunCurl(string args)
        {
            var psi = new System.Diagnostics.ProcessStartInfo
            {
                FileName = "curl.exe",
                Arguments = args,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            };
            using var proc = System.Diagnostics.Process.Start(psi)!;
            proc.WaitForExit(8000);
            var output = proc.HasExited
                ? proc.StandardOutput.ReadToEnd()
                : "";
            if (!proc.HasExited) proc.Kill();
            return output;
        }
    }
}
    

