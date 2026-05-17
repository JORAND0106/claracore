using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;

namespace SicoePresupuestoNET8
{
    /// <summary>Lectura de PK_ID.csv — independiente del formulario (un solo .cs para copiar al proyecto VS).</summary>
    internal static class CapasCsvReader
    {
        public static List<CapaInfo> Read(string path)
        {
            var list = new List<CapaInfo>();
            if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
                return list;

            var lines = ReadAllLinesTolerant(path)
                .Where(l => !string.IsNullOrWhiteSpace(l))
                .ToList();
            if (lines.Count == 0) return list;

            char delim = DetectDelimiter(lines[0]);
            var h0 = SplitLine(lines[0], delim);
            bool hasHeader = LooksLikeHeaderRow(h0);
            int start = hasHeader ? 1 : 0;
            var map = hasHeader ? BuildHeaderMap(h0) : null;

            for (int i = start; i < lines.Count; i++)
            {
                var p = SplitLine(lines[i], delim);
                if (p.Length == 0) continue;

                var c = map != null ? FromMapped(p, map) : FromPositional(p);
                if (!string.IsNullOrWhiteSpace(c.CAPA))
                    list.Add(c);
            }

            // Si había encabezado pero no se leyó nada, reintentar sin encabezado
            if (list.Count == 0 && hasHeader && lines.Count > 1)
            {
                for (int i = 0; i < lines.Count; i++)
                {
                    var p = SplitLine(lines[i], delim);
                    if (p.Length == 0) continue;
                    var c = FromPositional(p);
                    if (!string.IsNullOrWhiteSpace(c.CAPA) && !IsHeaderCapaValue(c.CAPA))
                        list.Add(c);
                }
            }

            return list;
        }

        private static bool IsHeaderCapaValue(string capa)
        {
            var k = NormKey(capa);
            return k is "capa" or "pk_id" or "pkid" or "pk" or "pk-id";
        }

        private static bool LooksLikeHeaderRow(string[] cells)
        {
            foreach (var cell in cells)
            {
                var k = NormKey(cell);
                if (k is "capa" or "pk_id" or "pkid" or "pk" or "pk-id" or "civ" or "tramo"
                    or "infraestructura" or "infra" or "ubicacion")
                    return true;
            }
            return false;
        }

        private static CapaInfo FromMapped(string[] p, Dictionary<string, int> map)
        {
            return new CapaInfo
            {
                CAPA = GetCol(p, map, "capa", "pk_id", "pkid", "pk-id", "pk"),
                CIV = GetCol(p, map, "civ"),
                TRAMO = GetCol(p, map, "tramo"),
                INFRAESTRUCTURA = GetCol(p, map, "infraestructura", "infra"),
                COSTADO = GetCol(p, map, "costado"),
                UBICACION = GetCol(p, map, "ubicacion"),
                ABS_INICIO = GetCol(p, map, "abs_inicio", "absinicio", "abs_inicial"),
                ABS_FINAL = GetCol(p, map, "abs_final", "absfin", "abs_final"),
                CALZADA = GetCol(p, map, "calzada"),
            };
        }

        private static CapaInfo FromPositional(string[] p) => new CapaInfo
        {
            CAPA = Col(p, 0),
            CIV = Col(p, 1),
            TRAMO = Col(p, 2),
            INFRAESTRUCTURA = Col(p, 3),
            COSTADO = Col(p, 4),
            UBICACION = Col(p, 5),
            ABS_INICIO = Col(p, 6),
            ABS_FINAL = Col(p, 7),
            CALZADA = Col(p, 8),
        };

        private static string Col(string[] p, int i) =>
            i < p.Length ? (p[i] ?? "").Trim() : "";

        private static string GetCol(string[] p, Dictionary<string, int> map, params string[] keys)
        {
            foreach (var key in keys)
            {
                if (map.TryGetValue(key, out int idx) && idx >= 0 && idx < p.Length)
                    return (p[idx] ?? "").Trim();
            }
            return "";
        }

        private static Dictionary<string, int> BuildHeaderMap(string[] headers)
        {
            var map = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            for (int i = 0; i < headers.Length; i++)
            {
                var k = NormKey(headers[i]);
                if (k.Length == 0) continue;
                if (!map.ContainsKey(k)) map[k] = i;
                if (k is "pk" or "pk_id" or "pkid" or "pk-id" && !map.ContainsKey("capa"))
                    map["capa"] = i;
            }
            return map;
        }

        private static string NormKey(string? s)
        {
            if (string.IsNullOrWhiteSpace(s)) return "";
            s = s.Trim().TrimStart('\ufeff', '\u200b', '\u00a0');
            return s.ToLowerInvariant()
                .Replace(" ", "_")
                .Replace("á", "a").Replace("é", "e").Replace("í", "i")
                .Replace("ó", "o").Replace("ú", "u");
        }

        private static char DetectDelimiter(string firstLine)
        {
            int sc = firstLine.Count(ch => ch == ';');
            int cc = firstLine.Count(ch => ch == ',');
            int tc = firstLine.Count(ch => ch == '\t');
            if (tc > sc && tc > cc) return '\t';
            return sc > cc ? ';' : ',';
        }

        private static string[] SplitLine(string line, char delim)
        {
            var parts = new List<string>();
            if (string.IsNullOrEmpty(line)) return Array.Empty<string>();

            var sb = new StringBuilder();
            bool inQuotes = false;
            for (int i = 0; i < line.Length; i++)
            {
                char ch = line[i];
                if (ch == '"')
                {
                    if (inQuotes && i + 1 < line.Length && line[i + 1] == '"')
                    {
                        sb.Append('"');
                        i++;
                    }
                    else inQuotes = !inQuotes;
                    continue;
                }
                if (ch == delim && !inQuotes)
                {
                    parts.Add(sb.ToString().Trim());
                    sb.Clear();
                    continue;
                }
                sb.Append(ch);
            }
            parts.Add(sb.ToString().Trim());
            return parts.ToArray();
        }

        private static List<string> ReadAllLinesTolerant(string path)
        {
            foreach (var enc in GetEncodingsToTry())
            {
                try
                {
                    var lines = new List<string>();
                    using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                    using var sr = new StreamReader(fs, enc, detectEncodingFromByteOrderMarks: true);
                    string? line;
                    while ((line = sr.ReadLine()) != null)
                        lines.Add(line);
                    if (lines.Count > 0) return lines;
                }
                catch { /* siguiente encoding */ }
            }

            return File.ReadAllLines(path).ToList();
        }

        private static IReadOnlyList<Encoding> GetEncodingsToTry()
        {
            var list = new List<Encoding> { Encoding.UTF8 };

            try
            {
#if NET8_0_OR_GREATER
                Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
#endif
                list.Add(Encoding.GetEncoding(1252));
            }
            catch { /* 1252 no disponible en este runtime */ }

            list.Add(Encoding.Unicode);
            list.Add(Encoding.BigEndianUnicode);
            return list;
        }
    }
}
