using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;

namespace SicoePresupuestoNET8
{
    /// <summary>
    /// Persiste el historial de prefijos de nodo rápido y el último contador usado por prefijo.
    /// Archivo: %AppData%\SICOE\nodo_prefijos.json
    /// </summary>
    internal static class NodoPrefijosStore
    {
        private static string FilePath =>
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                         "SICOE", "nodo_prefijos.json");

        // clave = prefijo, valor = último contador usado (el próximo será este + 1)
        private static Dictionary<string, int> _cache
            = new(StringComparer.OrdinalIgnoreCase);
        private static bool _loaded = false;

        private static void EnsureLoaded()
        {
            if (_loaded) return;
            _loaded = true;
            try
            {
                if (File.Exists(FilePath))
                {
                    var json = File.ReadAllText(FilePath);
                    var d = JsonConvert.DeserializeObject<Dictionary<string, int>>(json);
                    if (d != null)
                        _cache = new Dictionary<string, int>(d, StringComparer.OrdinalIgnoreCase);
                }
            }
            catch { _cache = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase); }
        }

        /// <summary>Lista de prefijos guardados, ordenados alfabéticamente.</summary>
        public static List<string> GetPrefijos()
        {
            EnsureLoaded();
            return _cache.Keys.OrderBy(k => k, StringComparer.OrdinalIgnoreCase).ToList();
        }

        /// <summary>Devuelve el último contador USADO para ese prefijo (0 si es nuevo).</summary>
        public static int GetUltimoContador(string prefijo)
        {
            EnsureLoaded();
            return _cache.TryGetValue(prefijo, out int v) ? v : 0;
        }

        /// <summary>Guarda el contador que quedó al finalizar el lote.</summary>
        public static void Save(string prefijo, int contadorSiguiente)
        {
            if (string.IsNullOrWhiteSpace(prefijo)) return;
            EnsureLoaded();
            _cache[prefijo] = Math.Max(1, contadorSiguiente - 1); // guarda el ÚLTIMO usado
            try
            {
                var dir = Path.GetDirectoryName(FilePath)!;
                if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                File.WriteAllText(FilePath,
                    JsonConvert.SerializeObject(_cache, Formatting.Indented));
            }
            catch { }
        }
    }
}