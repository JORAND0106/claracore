using System;
using System.Collections.Generic;
using System.Collections.Specialized;
using System.Globalization;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Threading;

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
                var qs = System.Web.HttpUtility.ParseQueryString(u.Query);
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
                    $"Error al navegar en el plano:\n{ex.Message}",
                    "ClaraLink",
                    System.Windows.Forms.MessageBoxButtons.OK,
                    System.Windows.Forms.MessageBoxIcon.Error);
            }
        }

        /// <summary>
        /// Zoom + selección implícita. Prioriza handle (extents reales); si no, coordenadas x/y.
        /// </summary>
        private static void EjecutarNavegarEnPlano(NameValueCollection qs)
        {
            double x = ParseDouble(qs["x"] ?? "0");
            double y = ParseDouble(qs["y"] ?? "0");
            double radio = ParseDouble(qs["radio"] ?? "20");
            if (radio <= 0) radio = 20;

            string handle = (qs["handle"] ?? qs["ent_handle"] ?? "").Trim();
            string txtHandle = (qs["txt"] ?? qs["txt_handle"] ?? "").Trim();

            if (!TryGetAcadDoc(out dynamic doc))
                return;

            CancelarComandoPendiente(doc);
            TraerAcadAlFrenteSinRedimensionar();

            bool zoomHecho = false;

            if (!string.IsNullOrEmpty(handle))
            {
                if (TryZoomPorHandle(doc, handle, ref x, ref y, ref radio))
                    zoomHecho = true;
            }

            if (!zoomHecho && (x != 0 || y != 0))
            {
                ZoomPorCoordenadas(doc, x, y, radio);
                zoomHecho = true;
            }

            if (!zoomHecho)
            {
                MsgSinUbicacion();
                return;
            }

            SeleccionarHandles(doc, handle, txtHandle);
        }

        private static bool TryZoomPorHandle(dynamic doc, string handle, ref double x, ref double y, ref double radio)
        {
            foreach (var h in VariantesHandle(handle))
            {
                try
                {
                    dynamic ent = doc.HandleToObject(h);
                    if (ent == null) continue;

                    dynamic bbMin = ent.GetBoundingBox()[0];
                    dynamic bbMax = ent.GetBoundingBox()[1];
                    double minX = (double)bbMin[0];
                    double minY = (double)bbMin[1];
                    double maxX = (double)bbMax[0];
                    double maxY = (double)bbMax[1];

                    x = (minX + maxX) / 2.0;
                    y = (minY + maxY) / 2.0;
                    double w = Math.Abs(maxX - minX);
                    double hgt = Math.Abs(maxY - minY);
                    radio = Math.Max(Math.Max(w, hgt) * 0.65, 15.0);

                    ZoomVentana(doc, minX, minY, maxX, maxY, 1.25);
                    return true;
                }
                catch { /* probar siguiente variante de handle */ }
            }

            return false;
        }

        private static void ZoomPorCoordenadas(dynamic doc, double x, double y, double radio)
        {
            double half = Math.Max(radio, 5.0);
            ZoomVentana(doc, x - half, y - half, x + half, y + half, 1.0);
        }

        private static void ZoomVentana(dynamic doc, double minX, double minY, double maxX, double maxY, double factor)
        {
            if (factor <= 0) factor = 1.25;
            double cx = (minX + maxX) / 2.0;
            double cy = (minY + maxY) / 2.0;
            double halfW = Math.Max((maxX - minX) * factor / 2.0, 5.0);
            double halfH = Math.Max((maxY - minY) * factor / 2.0, 5.0);

            try
            {
                dynamic app = doc.Application;
                object pMin = new[] { cx - halfW, cy - halfH, 0.0 };
                object pMax = new[] { cx + halfW, cy + halfH, 0.0 };
                app.ZoomWindow(pMin, pMax);
                return;
            }
            catch { /* fallback SendCommand */ }

            string ix = cx.ToString("F6", CultureInfo.InvariantCulture);
            string iy = cy.ToString("F6", CultureInfo.InvariantCulture);
            string ir = Math.Max(halfW, halfH).ToString("F2", CultureInfo.InvariantCulture);
            doc.SendCommand($"_.ZOOM _C {ix},{iy} {ir}\n");
        }

        private static void SeleccionarHandles(dynamic doc, string handle, string txtHandle)
        {
            var lista = new List<string>();
            if (!string.IsNullOrWhiteSpace(handle)) lista.Add(handle.Trim());
            if (!string.IsNullOrWhiteSpace(txtHandle)
                && !string.Equals(txtHandle.Trim(), handle.Trim(), StringComparison.OrdinalIgnoreCase))
                lista.Add(txtHandle.Trim());

            foreach (var h in lista)
            {
                foreach (var hv in VariantesHandle(h))
                {
                    try
                    {
                        doc.SendCommand($"(sssetfirst nil (list (handent \"{hv}\")))\n");
                        return;
                    }
                    catch { }
                }
            }
        }

        /// <summary>AutoCAD guarda handles en hex; la web puede enviar decimal o hex.</summary>
        private static IEnumerable<string> VariantesHandle(string raw)
        {
            var s = (raw ?? "").Trim();
            if (string.IsNullOrEmpty(s)) yield break;

            yield return s;

            if (s.StartsWith("0x", StringComparison.OrdinalIgnoreCase))
            {
                var hx = s.Substring(2);
                if (!string.IsNullOrEmpty(hx)) yield return hx.ToUpperInvariant();
            }

            if (long.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out var dec) && dec > 0)
                yield return dec.ToString("X", CultureInfo.InvariantCulture);

            if (long.TryParse(s, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var hex) && hex > 0)
            {
                var up = hex.ToString("X", CultureInfo.InvariantCulture);
                yield return up;
                yield return hex.ToString(CultureInfo.InvariantCulture);
            }
        }

        private static void TraerAcadAlFrenteSinRedimensionar()
        {
            try
            {
                if (_acadApp == null) return;
                _acadApp.Visible = true;
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
                Thread.Sleep(120);
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
                try
                {
                    _acadApp = GetActiveObject("AutoCAD.Application");
                    doc = _acadApp.ActiveDocument;
                }
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
                    foreach (var hv in VariantesHandle(handleBorrar))
                    {
                        for (int i = 0; i < total; i++)
                        {
                            try
                            {
                                dynamic ent = ms.Item(i);
                                if (string.Equals((string)ent.Handle, hv, StringComparison.OrdinalIgnoreCase)
                                    || string.Equals((string)ent.Handle, handleBorrar.Trim(), StringComparison.OrdinalIgnoreCase))
                                {
                                    ent.Delete();
                                    break;
                                }
                            }
                            catch { }
                        }
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
                "AutoCAD no está abierto.\nAbre el DWG del contrato antes de usar ClaraLink.",
                "ClaraLink",
                System.Windows.Forms.MessageBoxButtons.OK,
                System.Windows.Forms.MessageBoxIcon.Warning);
        }

        private static void MsgSinUbicacion()
        {
            System.Windows.Forms.MessageBox.Show(
                "No se pudo ubicar la entidad en el plano.\n\n" +
                "Verifique que el DWG abierto sea el del contrato y que el registro tenga handle o coordenadas (x_label, y_label).",
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
                "AutoCAD.Application",
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
            if (double.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture, out var v)) return v;
            if (double.TryParse(s, NumberStyles.Any, CultureInfo.CurrentCulture, out v)) return v;
            return 0;
        }
    }
}
