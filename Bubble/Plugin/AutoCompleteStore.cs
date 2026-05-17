using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;

namespace SicoePresupuestoNET8
{
    internal static class AutoCompleteStore
    {
        private sealed class Model
        {
            public List<string> Material { get; set; } = new();
            public List<string> Diametro { get; set; } = new();
        }

        // %AppData%\SicoePresupuestoNET8\autocomplete.json
        private static readonly string Folder =
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "SicoePresupuestoNET8");
        private static readonly string FilePath = Path.Combine(Folder, "autocomplete.json");

        private static Model _db = new();
        private static bool _loaded;

        public static void Load()
        {
            if (_loaded) return;
            _loaded = true;

            try
            {
                Directory.CreateDirectory(Folder);
                if (File.Exists(FilePath))
                {
                    var json = File.ReadAllText(FilePath);
                    _db = JsonConvert.DeserializeObject<Model>(json) ?? new Model();
                }
            }
            catch { _db = new Model(); }
        }

        public static void Save()
        {
            try
            {
                Directory.CreateDirectory(Folder);
                var json = JsonConvert.SerializeObject(_db, Newtonsoft.Json.Formatting.Indented);
                File.WriteAllText(FilePath, json);
            }
            catch { /* no romper flujo */ }
        }

        public static string[] GetMaterial() =>
            _db.Material.Where(s => !string.IsNullOrWhiteSpace(s))
                        .Select(s => s.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();

        public static string[] GetDiametro() =>
            _db.Diametro.Where(s => !string.IsNullOrWhiteSpace(s))
                        .Select(s => s.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();

        public static void AddMaterial(string value)
        {
            var v = (value ?? "").Trim();
            if (v.Length == 0) return;
            if (!_db.Material.Any(x => string.Equals(x?.Trim(), v, StringComparison.OrdinalIgnoreCase)))
                _db.Material.Add(v);
        }

        public static void AddDiametro(string value)
        {
            var v = (value ?? "").Trim();
            if (v.Length == 0) return;
            if (!_db.Diametro.Any(x => string.Equals(x?.Trim(), v, StringComparison.OrdinalIgnoreCase)))
                _db.Diametro.Add(v);
        }
    }
}
