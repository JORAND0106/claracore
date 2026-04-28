using System;
using System.Collections.Generic;
// using System.Net.Http; // no usado — curl reemplaza HttpClient
// using System.Net.Http.Headers; // no usado — curl reemplaza HttpClient
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System.Threading.Tasks;

namespace SicoePresupuestoNET8
{
    public static class SicoeClaraExporter
    {
        private sealed class PresupuestoRow
        {
            public string? pk_id { get; set; }
            public string? capitulo { get; set; }
            public string? competencia { get; set; }
            public string? item { get; set; }
            public string? descripcion { get; set; }
            public string? und { get; set; }
            public string? calzada { get; set; }
            public string? tramo { get; set; }
            public string? abs_inicio { get; set; }
            public string? abs_final { get; set; }
            public double? vlr_unitario { get; set; }
            public string? no_inicio { get; set; }
            public string? no_final { get; set; }
            public double? area_long_nod { get; set; }
            public double? ancho { get; set; }
            public double? espesor { get; set; }
            public double? cant_total { get; set; }
            public double? costo_directo { get; set; }
            public string? tipo_ejecucion { get; set; }
            public string? tipo_entidad { get; set; }
            public string? id_pol { get; set; }
            public string? observacion { get; set; }
            public string? ent_handle { get; set; }
            public string? txt_handle { get; set; }
            public string? layer_ent { get; set; }
            public string? layer_txt { get; set; }
            public string? color_hex { get; set; }
            public string? guid { get; set; }
            public double? x_label { get; set; }
            public double? y_label { get; set; }
        }

        /// <summary>
        /// Envía las filas a POST /presupuesto/{contratoId}/bulk
        /// Debe llamarse desde Task.Run() para evitar bloqueo de socket de AutoCAD.
        /// </summary>
        public static async Task<(int enviados, string mensaje)> ExportAsync(
                    string baseUrl,
                    string token,
                    int contratoId,
                    IReadOnlyList<FrmSicoePresupuesto.GridRow> rows,
                    string mode = "append")
        {
            var payload = new List<PresupuestoRow>(rows.Count);
            foreach (var r in rows)
            {
                payload.Add(new PresupuestoRow
                {
                    pk_id = N(r.PK_ID),
                    capitulo = N(r.Capitulo),
                    competencia = N(r.Competencia),
                    item = N(r.Item),
                    descripcion = N(r.Descripcion),
                    und = N(r.Und),
                    calzada = N(r.Calzada),
                    tramo = N(r.Tramo),
                    abs_inicio = N(r.AbsIni),
                    abs_final = N(r.AbsFin),
                    vlr_unitario = r.VlrUnitario != 0 ? (double?)((double)r.VlrUnitario) : null,
                    no_inicio = N(r.NoInicio),
                    no_final = N(r.NoFinal),
                    area_long_nod = r.AreaLongNod != 0 ? r.AreaLongNod : null,
                    ancho = r.Ancho != 0 ? r.Ancho : null,
                    espesor = r.Espesor != 0 ? r.Espesor : null,
                    cant_total = r.CantTotal != 0 ? r.CantTotal : null,
                    costo_directo = r.CostoDirecto != 0 ? r.CostoDirecto : null,
                    tipo_ejecucion = N(r.TipoEjecucion),
                    tipo_entidad = N(r.TipoEntidad),
                    id_pol = N(r.ID_Pol),
                    observacion = N(r.Observacion),
                    ent_handle = N(r.EntHandle),
                    txt_handle = N(r.TxtHandle),
                    layer_ent = N(r.LayerEnt),
                    layer_txt = N(r.LayerTxt),
                    color_hex = N(r.ColorHex),
                    guid = N(r.GUID),
                    x_label = r.X_LABEL != 0 ? r.X_LABEL : null,
                    y_label = r.Y_LABEL != 0 ? r.Y_LABEL : null,
                });
            }

            // Escribir JSON a archivo temporal
            var jsonBody = JsonConvert.SerializeObject(payload);
            var tmpJson = System.IO.Path.GetTempFileName() + ".json";
            var tmpOutput = System.IO.Path.GetTempFileName() + ".txt";
            System.IO.File.WriteAllText(tmpJson, jsonBody, Encoding.UTF8);

            // Llamar curl.exe fuera del AppDomain de AutoCAD
            // source=sicoe_cad + X-SicoeCAD-Enviados: auditoría en ClaraCore (banner / sincro)
            var modeQ = Uri.EscapeDataString(mode ?? "append");
            var url = $"{baseUrl.TrimEnd('/')}/presupuesto/{contratoId}/bulk?mode={modeQ}&source=sicoe_cad";
            var args = $"-s -o \"{tmpOutput}\" -w \"%{{http_code}}\" " +
                       $"-X POST \"{url}\" " +
                       $"-H \"Authorization: Bearer {token}\" " +
                       $"-H \"Content-Type: application/json\" " +
                       $"-H \"X-SicoeCAD-Enviados: {rows.Count}\" " +
                       $"--data-binary \"@{tmpJson}\"";

            var psi = new System.Diagnostics.ProcessStartInfo
            {
                FileName = "curl.exe",
                Arguments = args,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            };

            string rawOutput = "";
            string httpCode = "0";

            await Task.Run(() =>
            {
                using var proc = System.Diagnostics.Process.Start(psi)!;
                rawOutput = proc.StandardOutput.ReadToEnd();
                proc.WaitForExit();
                // Con -w "%{http_code}" sin salto, stdout es solo el código (p.ej. "200")
                httpCode = rawOutput.Trim();
            });

            string responseBody = "";
            try
            {
                if (System.IO.File.Exists(tmpOutput))
                    responseBody = System.IO.File.ReadAllText(tmpOutput, Encoding.UTF8);
            }
            catch { }

            try { System.IO.File.Delete(tmpJson); } catch { }

            if (httpCode != "200" && httpCode != "201")
            {
                try { System.IO.File.Delete(tmpOutput); } catch { }
                var errDetail = string.IsNullOrWhiteSpace(responseBody) ? rawOutput : responseBody;
                throw new Exception($"Error HTTP {httpCode}.\n\nRespuesta:\n{errDetail}");
            }

            // API ClaraCore devuelve { "insertados": N } (no "inserted")
            int inserted = rows.Count;
            try
            {
                var obj = JObject.Parse(string.IsNullOrWhiteSpace(responseBody) ? "{}" : responseBody);
                if (obj["insertados"] != null)
                    inserted = obj["insertados"].Value<int>();
                else if (obj["inserted"] != null)
                    inserted = obj["inserted"].Value<int>();
            }
            catch { }

            try { System.IO.File.Delete(tmpOutput); } catch { }

            return (inserted, $"✅ {inserted} registros enviados correctamente a ClaraCore.");
        }

        private static string? N(string s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
    }
}