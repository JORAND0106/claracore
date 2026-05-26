using System;
using System.Collections.Specialized;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Threading;
using System.Web;

namespace ClaraLink
{
    internal static class ZoomHandler
    {
        private static dynamic? _acadApp;

        public static void EjecutarDesdeUri(string uri)
        {
            try
            {
                var u = new Uri(uri);
                var qs = HttpUtility.ParseQueryString(u.Query);
                var accion = (u.Host ?? "").ToLowerInvariant();

                if (accion == "insertar")
                {
                    EjecutarInsertarBloque(qs);
                    return;
                }

                if (accion is "zoom" or "highlight")
                {
                    EjecutarNavegarEnPlano(qs);
                    return;
                }
            }
            catch (Exception ex)
            {
                System.Windows.Forms.MessageBox.Show(
                    $"Error al hacer zoom:\n{ex.Message}",
                    "ClaraLink",
                    System.Windows.Forms.MessageBoxButtons.OK,
                    System.Windows.Forms.MessageBoxIcon.Error);
            }
        }

        /// <summary>
        /// Zoom + selección implícita (sssetfirst). Sin SELECT interactivo ni cambiar tamaño de ventana.
        /// </summary>
        private static void EjecutarNavegarEnPlano(NameValueCollection qs)
        {
            double x = ParseDouble(qs["x"] ?? "0");
            double y = ParseDouble(qs["y"] ?? "0");
            double radio = ParseDouble(qs["radio"] ?? "20");
            string handle = (qs["handle"] ?? "").Trim();
            string txtHandle = (qs["txt"] ?? "").Trim();

            if (!TryGetAcadDoc(out dynamic doc))
                return;

            CancelarComandoPendiente(doc);

            if ((x == 0 && y == 0) && !string.IsNullOrEmpty(handle))
            {
                try
                {
                    dynamic ent = doc.HandleToObject(handle);
                    if (ent != null)
                    {
                        dynamic min = ent.GetBoundingBox()[0];
                        dynamic max = ent.GetBoundingBox()[1];
                        x = ((double)min[0] + (double)max[0]) / 2.0;
                        y = ((double)min[1] + (double)max[1]) / 2.0;
                        double w = Math.Abs((double)max[0] - (double)min[0]);
                        double h = Math.Abs((double)max[1] - (double)min[1]);
                        radio = Math.Max(Math.Max(w, h) * 0.8, 15.0);
                    }
                }
                catch { /* seguir con x,y si vienen en URI */ }
            }

            if (x == 0 && y == 0) return;

            TraerAcadAlFrenteSinRedimensionar();

            string sx = x.ToString("F6", System.Globalization.CultureInfo.InvariantCulture);
            string sy = y.ToString("F6", System.Globalization.CultureInfo.InvariantCulture);
            string sr = radio.ToString("F2", System.Globalization.CultureInfo.InvariantCulture);
            doc.SendCommand($"_.ZOOM _C {sx},{sy} {sr}\n");

            if (!string.IsNullOrEmpty(handle))
            {
                try
                {
                    doc.SendCommand($"(sssetfirst nil (list (handent \"{handle}\")))\n");
                }
                catch { }
            }

            if (!string.IsNullOrEmpty(txtHandle) && txtHandle != handle)
            {
                try
                {
                    doc.SendCommand($"(sssetfirst nil (list (handent \"{txtHandle}\")))\n");
                }
                catch { }
            }
        }

        private static void TraerAcadAlFrenteSinRedimensionar()
        {
            try
            {
                if (_acadApp == null) return;
                _acadApp.Visible = true;
                // No tocar WindowState (evita maximizar/restaurar y romper el layout del usuario).
                try
                {
                    int hwnd = (int)_acadApp.HWND;
                    if (hwnd != 0) SetForegroundWindow(hwnd);
                }
                catch
                {
                    try { _acadApp.ActiveDocument?.Window?.Focus(); } catch { }
                }
            }
            catch { }
        }

        private static void CancelarComandoPendiente(dynamic doc)
        {
            try
            {
                doc.SendCommand("\x03\x03");
                Thread.Sleep(80);
            }
            catch { }
        }

        private static bool TryGetAcadDoc(out dynamic doc)
        {
            doc = null!;
            if (_acadApp == null)
            {
                try { _acadApp = GetActiveObject("AutoCAD.Application"); }
                catch { _acadApp = null; }
            }

            if (_acadApp == null)
            {
                MsgAcadNoAbierto();
                return false;
            }

            try
            {
                doc = _acadApp.ActiveDocument;
                if (doc == null) throw new InvalidOperationException();
                return true;
            }
            catch
            {
                _acadApp = null;
                try { _acadApp = GetActiveObject("AutoCAD.Application"); doc = _acadApp.ActiveDocument; }
                catch
                {
                    MsgAcadNoAbierto();
                    return false;
                }
                return doc != null;
            }
        }

        private static void EjecutarInsertarBloque(NameValueCollection qs)
        {
            try
            {
                string bloque = qs["bloque"] ?? "";
                string layer = qs["layer"] ?? "";
                string handleBorrar = qs["handle_borrar"] ?? "";
                string registroId = qs["registro_id"] ?? "";
                string apiToken = qs["api_token"] ?? "";
                double x = ParseDouble(qs["x"] ?? "0");
                double y = ParseDouble(qs["y"] ?? "0");

                if (string.IsNullOrWhiteSpace(bloque) || (x == 0 && y == 0)) return;

                if (!TryGetAcadDoc(out dynamic doc))
                    return;

                CancelarComandoPendiente(doc);
                TraerAcadAlFrenteSinRedimensionar();

                dynamic ms = doc.ModelSpace;

                if (!string.IsNullOrWhiteSpace(handleBorrar))
                {
                    int total = 0;
                    try { total = (int)ms.Count; } catch { }
                    for (int i = 0; i < total; i++)
                    {
                        try
                        {
                            dynamic ent = ms.Item(i);
                            if ((string)ent.Handle == handleBorrar)
                            {
                                ent.Delete();
                                break;
                            }
                        }
                        catch { }
                    }
                }

                string newHandle = "";
                try
                {
                    double[] pt = { x, y, 0.0 };
                    dynamic blockRef = ms.InsertBlock(pt, bloque, 1.0, 1.0, 1.0, 0.0);
                    if (!string.IsNullOrWhiteSpace(layer))
                        blockRef.Layer = layer;
                    newHandle = (string)blockRef.Handle;
                }
                catch { }

                if (!string.IsNullOrWhiteSpace(newHandle) &&
                    !string.IsNullOrWhiteSpace(registroId) &&
                    !string.IsNullOrWhiteSpace(apiToken))
                {
                    var regId = registroId;
                    var tok = apiToken;
                    var hnd = newHandle;
                    System.Threading.Tasks.Task.Run(() =>
                    {
                        try
                        {
                            using var http = new HttpClient();
                            http.DefaultRequestHeaders.Authorization =
                                new AuthenticationHeaderValue("Bearer", tok);
                            var body = new StringContent(
                                $"{{\"rev_block_handle\":\"{hnd}\"}}",
                                System.Text.Encoding.UTF8, "application/json");
                            http.PutAsync(
                                $"https://claracore-backend.azurewebsites.net/presupuesto/item/{regId}",
                                body).Wait(5000);
                        }
                        catch { }
                    });
                }
            }
            catch { /* tolerante */ }
        }

        private static void MsgAcadNoAbierto()
        {
            System.Windows.Forms.MessageBox.Show(
                "AutoCAD no está abierto.\nAbre el DWG antes de usar ClaraLink.",
                "ClaraLink",
                System.Windows.Forms.MessageBoxButtons.OK,
                System.Windows.Forms.MessageBoxIcon.Warning);
        }

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(int hWnd);

        private static object GetActiveObject(string progId)
        {
            var progIds = new[]
            {
                "AutoCAD.Application.28",
                "AutoCAD.Application.27",
                "AutoCAD.Application.26",
                "AutoCAD.Application.25",
                "AutoCAD.Application.24",
                "AutoCAD.Application.23",
            };

            foreach (var pid in progIds)
            {
                try
                {
                    CLSIDFromProgID(pid, out Guid clsid);
                    GetActiveObjectWin32(ref clsid, IntPtr.Zero, out object obj);
                    if (obj != null) return obj;
                }
                catch { }
            }

            try
            {
                CreateBindCtx(0, out IBindCtx bc);
                GetRunningObjectTable(0, out IRunningObjectTable rot);
                rot.EnumRunning(out IEnumMoniker enumMoniker);
                enumMoniker.Reset();

                var monikers = new IMoniker[1];
                var fetched = IntPtr.Zero;

                while (enumMoniker.Next(1, monikers, fetched) == 0)
                {
                    try
                    {
                        monikers[0].GetDisplayName(bc, null, out string name);
                        if (name != null && name.EndsWith(".dwg", StringComparison.OrdinalIgnoreCase))
                        {
                            rot.GetObject(monikers[0], out object dwgObj);
                            dynamic dwgDoc = dwgObj;
                            return dwgDoc.Application;
                        }
                    }
                    catch { }
                }
            }
            catch { }

            throw new COMException("AutoCAD no encontrado.");
        }

        [DllImport("ole32.dll")]
        private static extern int GetRunningObjectTable(int reserved, out IRunningObjectTable prot);

        [DllImport("ole32.dll")]
        private static extern int CreateBindCtx(int reserved, out IBindCtx ppbc);

        [DllImport("ole32.dll", CharSet = CharSet.Unicode)]
        private static extern int CLSIDFromProgID(string lpszProgID, out Guid pclsid);

        [DllImport("oleaut32.dll", PreserveSig = false)]
        private static extern void GetActiveObjectWin32(ref Guid rclsid, IntPtr pvReserved,
            [MarshalAs(UnmanagedType.IUnknown)] out object ppunk);

        private static double ParseDouble(string s)
        {
            if (double.TryParse(s,
                System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture, out var v)) return v;
            return 0;
        }
    }
}
