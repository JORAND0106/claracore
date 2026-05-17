using Autodesk.AutoCAD.Runtime;
using DocumentFormat.OpenXml.Wordprocessing;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using Newtonsoft.Json;
using SicoePresupuestoNET8; // <-- aquí está FrmSicoePresupuesto
// --- Agrega estos usings al inicio del archivo (si no existen) ---
using Autodesk.AutoCAD.Runtime;                           // CommandMethod
using Autodesk.AutoCAD.ApplicationServices;               // Application
using acApp = Autodesk.AutoCAD.ApplicationServices.Application;
using DocumentFormat.OpenXml.Spreadsheet; // alias

namespace SicoePresupuestoNET8
{
    public static class Commands
    {
        // ===== Adaptador de catálogo para EditarRegistroForm =====
        public sealed class PresItemRow
        {
            public string? Capitulo { get; init; }
            public string? Competencia { get; init; }
            public string? Item { get; init; }
            public string? Descripcion { get; init; }
            public string? Und { get; init; }
            // usa el nombre que ya tengas en tu modelo base:
            public decimal? VlrUnitario { get; init; }
        }

        // Nota: si tu lista interna se llama diferente (p.ej. ListPresitem o PresupuestoItems),
        // cambia el nombre en el Select de abajo para que compile.
        public static IEnumerable<PresItemRow> Presitem
        {
            get
            {
                // Usar el catálogo cargado en memoria
                return (Catalogo ?? new List<PresItem>()).Select(p => new PresItemRow
                {
                    Capitulo = p.Capitulo,
                    Competencia = p.Competencia,
                    Item = p.Item,
                    Descripcion = p.Descripcion,
                    Und = p.Und,
                    // Ajusta esta línea si tu clase PresItem usa VlrUnitario en lugar de ValorUnitario
                    VlrUnitario = p.ValorUnitario
                });
            }
        }
        // =======================
        //   ESTADO EN MEMORIA
        // =======================
        public static List<PresItem> Catalogo { get; private set; } = new();
        public static void SetCatalogo(List<PresItem> items)
        {
            Catalogo = items ?? new();
        }
        public static void ClearCatalogo() => Catalogo.Clear();

        public static AxisContext? ActiveAxis { get; private set; }
        public static void SetActiveAxis(AxisContext ctx) => ActiveAxis = ctx;

        public static List<CapaInfo>? CapasCatalog { get; private set; }
        public static void SetCapas(List<CapaInfo> capas) => CapasCatalog = capas;

        // =======================
        //   RUTAS / PERSISTENCIA
        // =======================
        private static string AppDir =>
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "SICOE");

        // -------- CAPAS (ya lo tenías) -----------
        private static string CapasPathFile => Path.Combine(AppDir, "capas_path.txt");
        public static void SaveCapasPath(string path)
        {
            Directory.CreateDirectory(AppDir);
            File.WriteAllText(CapasPathFile, path ?? "");
        }
        public static string? LoadCapasPath()
        {
            try { return File.Exists(CapasPathFile) ? File.ReadAllText(CapasPathFile).Trim() : null; }
            catch { return null; }
        }

        // -------- CATALOGO DE PRECIOS ------------
        private static string CatalogPathFile =>
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "SICOE", "catalogo_path.txt");
        private static string CatalogCacheFile =>
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "SICOE", "catalogo_cache.json");

        /// <summary>Guarda la ruta del último CSV de precios elegido por el usuario.</summary>
        public static void SaveCatalogoPath(string? path)
        {
            try
            {
                var dir = Path.GetDirectoryName(CatalogPathFile)!;
                if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                File.WriteAllText(CatalogPathFile, path ?? "");
            }
            catch { /* tolerante */ }
        }

        /// <summary>Lee la ruta del último CSV de precios.</summary>
        public static string? LoadCatalogoPath()
        {
            try
            {
                return File.Exists(CatalogPathFile) ? File.ReadAllText(CatalogPathFile).Trim() : null;
            }
            catch { return null; }
        }

        /// <summary>Guarda una copia del catálogo en caché (JSON) para abrir rápido.</summary>
        public static void SaveCatalogoCache(List<PresItem>? items)
        {
            try
            {
                var dir = Path.GetDirectoryName(CatalogCacheFile)!;
                if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                var toSave = items ?? new List<PresItem>();
                var json = JsonConvert.SerializeObject(toSave);
                File.WriteAllText(CatalogCacheFile, json);
            }
            catch { /* tolerante */ }
        }

        /// <summary>Intenta leer la caché. Si falla, devuelve null.</summary>
        public static List<PresItem>? LoadCatalogoCacheOrNull()
        {
            try
            {
                if (!File.Exists(CatalogCacheFile)) return null;
                var json = File.ReadAllText(CatalogCacheFile);
                var list = JsonConvert.DeserializeObject<List<PresItem>>(json) ?? new List<PresItem>();
                return list;
            }
            catch { return null; }
        }
        /// <summary>Exporta el catálogo a CSV (con encabezado fijo).</summary>
        public static void ExportarCatalogoCsv(string path, IEnumerable<PresItem>? items = null)
        {
            items ??= Catalogo ?? new List<PresItem>();
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);

            // Encabezados (coinciden con tu lector)
            var header = "Capitulo;Competencia;Item;Descripcion;Und;ValorUnitario";
            var sb = new StringBuilder();
            sb.AppendLine(header);

            foreach (var it in items)
            {
                // separador ';' y comillas si hay ; o comillas en la descripción
                string esc(string? s)
                {
                    s ??= "";
                    bool needQ = s.Contains(';') || s.Contains('"') || s.Contains('\n') || s.Contains('\r');
                    s = s.Replace("\"", "\"\"");
                    return needQ ? $"\"{s}\"" : s;
                }

                string vu = (it?.ValorUnitario ?? 0m).ToString(System.Globalization.CultureInfo.InvariantCulture);

                sb.Append(esc(it?.Capitulo));
                sb.Append(';'); sb.Append(esc(it?.Competencia));
                sb.Append(';'); sb.Append(esc(it?.Item));
                sb.Append(';'); sb.Append(esc(it?.Descripcion));
                sb.Append(';'); sb.Append(esc(it?.Und));
                sb.Append(';'); sb.Append(vu);
                sb.AppendLine();
            }

            File.WriteAllText(path, sb.ToString(), Encoding.UTF8);
        }

        /// <summary>Importa el catálogo desde CSV (tolerante a ; o ,).</summary>
        public static List<PresItem> ImportarCatalogoCsv(string path)
        {
            var list = new List<PresItem>();
            if (!File.Exists(path)) return list;

            IEnumerable<string> lines;
            try
            {
                using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                using var sr = new StreamReader(fs, Encoding.UTF8, true);
                var all = new List<string>();
                string? line;
                while ((line = sr.ReadLine()) != null) all.Add(line);
                lines = all;
            }
            catch (IOException)
            {
                var tmp = Path.GetTempFileName();
                File.Copy(path, tmp, true);
                lines = File.ReadAllLines(tmp, Encoding.UTF8);
                try { File.Delete(tmp); } catch { }
            }

            foreach (var raw in lines)
            {
                var line = raw?.Trim();
                if (string.IsNullOrWhiteSpace(line)) continue;

                var low = line.ToLowerInvariant();
                if (low.StartsWith("cap") && low.Contains("item") && low.Contains("und"))
                    continue; // encabezado

                // split tolerante
                string[] p = SmartSplitCsv(line);
                if (p.Length < 6) continue;

                string cap = (p[0] ?? "").Trim();
                string comp = (p[1] ?? "").Trim();
                string item = (p[2] ?? "").Trim();
                string desc = (p[3] ?? "").Trim();
                string und = (p[4] ?? "").Trim();
                decimal vu = ParseDecimalSafe(p[5]);

                list.Add(new PresItem
                {
                    Capitulo = cap,
                    Competencia = comp,
                    Item = item,
                    Descripcion = desc,
                    Und = und,
                    ValorUnitario = vu
                });
            }
            return list;

            static string[] SmartSplitCsv(string s)
            {
                // Simple parser para ; o , respetando comillas dobles
                var res = new List<string>();
                var cur = new StringBuilder();
                bool quoted = false;
                char sep = s.Contains(';') ? ';' : ',';

                for (int i = 0; i < s.Length; i++)
                {
                    char ch = s[i];
                    if (ch == '"')
                    {
                        if (quoted && i + 1 < s.Length && s[i + 1] == '"') { cur.Append('"'); i++; }
                        else quoted = !quoted;
                    }
                    else if (ch == sep && !quoted)
                    {
                        res.Add(cur.ToString());
                        cur.Clear();
                    }
                    else cur.Append(ch);
                }
                res.Add(cur.ToString());
                return res.ToArray();
            }

            static decimal ParseDecimalSafe(string s)
            {
                if (string.IsNullOrWhiteSpace(s)) return 0m;
                s = s.Trim();
                if (s.Contains(",") && s.Contains("."))
                {
                    int lc = s.LastIndexOf(',');
                    int ld = s.LastIndexOf('.');
                    s = (lc > ld) ? s.Replace(".", "").Replace(',', '.') : s.Replace(",", "");
                }
                else if (s.Contains(",")) s = s.Replace(',', '.');
                return decimal.TryParse(s, System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var v) ? v : 0m;
            }
        }
        // --- Dentro de la clase Commands ---
        [CommandMethod("SicoeCAD")]
        public static void Cmd_SicoeCAD()
        {
            using (var f = new SicoeCAD.FrmSicoeCad())
            {
                acApp.ShowModalDialog(f);

                if (f.LaunchPresupuesto)
                {
                    var opened = System.Windows.Forms.Application.OpenForms
                        .OfType<SicoePresupuestoNET8.FrmSicoePresupuesto>()
                        .FirstOrDefault();

                    if (opened != null) opened.Activate();
                    else acApp.ShowModelessDialog(new SicoePresupuestoNET8.FrmSicoePresupuesto());
                    return;
                }

                if (f.LaunchTopografia)
                {
                #if !NET48
                                    var opened = System.Windows.Forms.Application.OpenForms
                                        .OfType<SicoePresupuestoNET8.FrmSicoeTopografia>()
                                        .FirstOrDefault();

                                    if (opened != null) opened.Activate();
                                    else acApp.ShowModelessDialog(new SicoePresupuestoNET8.FrmSicoeTopografia());
                #endif
                }
            }
        }
        // --- Helpers de catálogo para UI (Topografía/Presupuesto comparten esto) ---
        public static List<string> GetCapitulos()
            => Catalogo?.Select(i => i.Capitulo)
                        .Where(s => !string.IsNullOrWhiteSpace(s))
                        .Distinct()
                        .OrderBy(s => s)
                        .ToList() ?? new();

        public static List<string> GetCompetencias(string capitulo)
            => Catalogo?.Where(i => string.Equals(i.Capitulo, capitulo, StringComparison.OrdinalIgnoreCase))
                        .Select(i => i.Competencia)
                        .Where(s => !string.IsNullOrWhiteSpace(s))
                        .Distinct()
                        .OrderBy(s => s)
                        .ToList() ?? new();
        // ======= Helpers adicionales de catálogo (para cascada en el editor) =======
        public static List<string> GetItems(string capitulo, string competencia)
            => Catalogo?
                .Where(i =>
                    string.Equals(i.Capitulo, capitulo, StringComparison.OrdinalIgnoreCase) &&
                    string.Equals(i.Competencia, competencia, StringComparison.OrdinalIgnoreCase))
                .Select(i => i.Item)
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .Distinct()
                .OrderBy(s => s)
                .ToList() ?? new();

        public static List<string> GetDescripciones(string capitulo, string competencia, string item)
            => Catalogo?
                .Where(i =>
                    string.Equals(i.Capitulo, capitulo, StringComparison.OrdinalIgnoreCase) &&
                    string.Equals(i.Competencia, competencia, StringComparison.OrdinalIgnoreCase) &&
                    string.Equals(i.Item, item, StringComparison.OrdinalIgnoreCase))
                .Select(i => i.Descripcion)
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .Distinct()
                .OrderBy(s => s)
                .ToList() ?? new();

        /// <summary>Devuelve el PresItem que coincide; si hay varios, devuelve el primero.</summary>
        public static PresItem? FindPresItem(string capitulo, string competencia, string item, string? descripcion = null)
        {
            var query = Catalogo?
                .Where(i =>
                    string.Equals(i.Capitulo, capitulo, StringComparison.OrdinalIgnoreCase) &&
                    string.Equals(i.Competencia, competencia, StringComparison.OrdinalIgnoreCase) &&
                    string.Equals(i.Item, item, StringComparison.OrdinalIgnoreCase));

            if (query == null) return null;

            if (!string.IsNullOrWhiteSpace(descripcion))
                query = query.Where(i => string.Equals(i.Descripcion, descripcion, StringComparison.OrdinalIgnoreCase));

            return query.FirstOrDefault();
        }

    }

}
