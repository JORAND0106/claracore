using System;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json;

namespace SicoePresupuestoNET8
{
    internal static class PkCatalogStore
    {
        private sealed class Model
        {
            public List<string> Tramos { get; set; } = new();
            public List<string> Infra { get; set; } = new();
        }

        private static readonly string _path = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "SicoePresupuestoNET8", "pk_catalog.json");

        private static Model _m = new();

        public static IReadOnlyList<string> Tramos => _m.Tramos;
        public static IReadOnlyList<string> Infra => _m.Infra;

        public static void Load()
        {
            try
            {
                if (!File.Exists(_path))
                {
                    _m = new Model
                    {
                        Tramos = new() { "TRAMO 1", "TRAMO 2" },
                        Infra = new() { "CALZADA", "SEPARADOR", "ANDEN", "CICLORUTA", "POMPEYANO" }
                    };
                    Save();
                    return;
                }
                var json = File.ReadAllText(_path);
                _m = JsonConvert.DeserializeObject<Model>(json) ?? new Model();
            }
            catch { _m = new Model(); }
        }

        public static void Save()
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
                var json = JsonConvert.SerializeObject(_m, Newtonsoft.Json.Formatting.Indented);
                File.WriteAllText(_path, json);
            }
            catch { }
        }

        public static void AddTramo(string v)
        {
            if (string.IsNullOrWhiteSpace(v)) return;
            if (!_m.Tramos.Exists(s => s.Equals(v, StringComparison.OrdinalIgnoreCase)))
                _m.Tramos.Add(v.Trim());
            Save();
        }

        public static void AddInfra(string v)
        {
            if (string.IsNullOrWhiteSpace(v)) return;
            if (!_m.Infra.Exists(s => s.Equals(v, StringComparison.OrdinalIgnoreCase)))
                _m.Infra.Add(v.Trim());
            Save();
        }
    }
}
