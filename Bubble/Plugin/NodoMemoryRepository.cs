using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;

namespace SicoePresupuestoNET8
{
    /// <summary>
    /// Repositorio para guardar y recuperar nombres de nodos por capítulo.
    /// Los nombres se persisten en JSON para mantenerlos entre sesiones.
    /// </summary>
    internal static class NodoMemoryRepository
    {
        private static readonly string FilePath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "SicoeCAD",
            "NodosMemoria.json"
        );

        // Modelo interno: coordenadas por nodo
        internal sealed class NodoCoords
        {
            public double Norte { get; set; }
            public double Este { get; set; }
        }

        // capitulo → (nombreNodo → coords)
        private static Dictionary<string, Dictionary<string, NodoCoords>> _memoria = new();
        private static bool _cargado = false;

        /// <summary>
        /// Carga la memoria desde el archivo JSON.
        /// </summary>
        private static void CargarSiNoExiste()
        {
            if (_cargado) return;

            try
            {
                if (File.Exists(FilePath))
                {
                    string json = File.ReadAllText(FilePath);

                    // Intentar nuevo formato: { "CAP": { "NODO": { "Norte": 0, "Este": 0 } } }
                    try
                    {
                        var dicNuevo = JsonConvert.DeserializeObject
                        <Dictionary<string, Dictionary<string, NodoCoords>>>(json);
                        if (dicNuevo != null)
                        {
                            _memoria = dicNuevo;
                        }
                    }
                    catch
                    {
                        // Formato viejo (lista de strings) → migrar sin coords
                        try
                        {
                            var dicViejo = JsonConvert.DeserializeObject<Dictionary<string, List<string>>>(json);
                            if (dicViejo != null)
                            {
                                _memoria = dicViejo.ToDictionary(
                                    kvp => kvp.Key,
                                    kvp => kvp.Value.ToDictionary(
                                        n => n,
                                        _ => new NodoCoords(),
                                        StringComparer.OrdinalIgnoreCase)
                                );
                            }
                        }
                        catch { _memoria = new(); }
                    }
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Error cargando memoria de nodos: {ex.Message}");
                _memoria = new();
            }

            _cargado = true;
        }
        /// <summary>
        /// Guarda la memoria en el archivo JSON.
        /// </summary>
        private static void Guardar()
        {
            try
            {
                string dir = Path.GetDirectoryName(FilePath);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                    Directory.CreateDirectory(dir);

                var dicParaJson = _memoria.ToDictionary(
                                    kvp => kvp.Key,
                                    kvp => kvp.Value
                                        .OrderBy(n => n.Key, StringComparer.OrdinalIgnoreCase)
                                        .ToDictionary(n => n.Key, n => n.Value)
                                );

                string json = JsonConvert.SerializeObject(dicParaJson, Newtonsoft.Json.Formatting.Indented);

                File.WriteAllText(FilePath, json);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Error guardando memoria de nodos: {ex.Message}");
            }
        }

        /// <summary>
        /// Agrega un nombre de nodo a la memoria de un capítulo específico.
        /// </summary>
        public static void AgregarNodo(string capitulo, string nombreNodo,
                                               double norte = 0, double este = 0)
        {
            CargarSiNoExiste();

            if (string.IsNullOrWhiteSpace(capitulo) || string.IsNullOrWhiteSpace(nombreNodo))
                return;

            string key = capitulo.Trim().ToUpperInvariant();
            string nombre = nombreNodo.Trim().ToUpperInvariant();

            if (!_memoria.ContainsKey(key))
                _memoria[key] = new Dictionary<string, NodoCoords>(StringComparer.OrdinalIgnoreCase);

            _memoria[key][nombre] = new NodoCoords { Norte = norte, Este = este };
            Guardar();
        }

        /// <summary>
        /// Agrega múltiples nombres de nodos a un capítulo.
        /// </summary>
        public static void AgregarNodos(string capitulo,
                    IEnumerable<(string Nombre, double Norte, double Este)> nodos)
        {
            if (string.IsNullOrWhiteSpace(capitulo) || nodos == null)
                return;

            CargarSiNoExiste();

            string key = capitulo.Trim().ToUpperInvariant();

            if (!_memoria.ContainsKey(key))
                _memoria[key] = new Dictionary<string, NodoCoords>(StringComparer.OrdinalIgnoreCase);

            bool cambios = false;
            foreach (var (nombre, norte, este) in nodos)
            {
                if (!string.IsNullOrWhiteSpace(nombre))
                {
                    string nombreLimpio = nombre.Trim().ToUpperInvariant();
                    _memoria[key][nombreLimpio] = new NodoCoords { Norte = norte, Este = este };
                    cambios = true;
                }
            }

            if (cambios)
                Guardar();
        }

        /// <summary>
        /// Obtiene todos los nombres de nodos de un capítulo específico.
        /// </summary>
        public static List<string> ObtenerNodos(string capitulo)
        {
            CargarSiNoExiste();

            if (string.IsNullOrWhiteSpace(capitulo))
                return new List<string>();

            string key = capitulo.Trim().ToUpperInvariant();

            if (_memoria.TryGetValue(key, out var nodos))
            {
                return nodos.Keys
                    .OrderBy(n => n, StringComparer.OrdinalIgnoreCase)
                    .ToList();
            }

            return new List<string>();
        }
        public static List<string> ObtenerTodosLosNodos()
        {
            CargarSiNoExiste();
            return _memoria
                .SelectMany(kvp => kvp.Value.Keys)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(n => n)
                .ToList();
        }
        /// <summary>
        /// Verifica si existe un nodo en un capítulo específico.
        /// </summary>
        public static bool ExisteNodo(string capitulo, string nombreNodo)
        {
            CargarSiNoExiste();

            if (string.IsNullOrWhiteSpace(capitulo) || string.IsNullOrWhiteSpace(nombreNodo))
                return false;

            string key = capitulo.Trim().ToUpperInvariant();
            string nombre = nombreNodo.Trim().ToUpperInvariant();

            return _memoria.TryGetValue(key, out var nodos) && nodos.ContainsKey(nombre);
        }

        /// <summary>
        /// Limpia todos los nodos de un capítulo específico.
        /// </summary>
        public static void LimpiarCapitulo(string capitulo)
        {
            CargarSiNoExiste();

            if (string.IsNullOrWhiteSpace(capitulo))
                return;

            string key = capitulo.Trim().ToUpperInvariant();

            if (_memoria.Remove(key))
                Guardar();
        }
        /// <summary>
        /// Obtiene las coordenadas de un nodo específico.
        /// Retorna (0, 0, false) si no existe.
        /// </summary>
        public static (double Norte, double Este, bool Encontrado) ObtenerCoordenadas(
            string capitulo, string nombreNodo)
        {
            CargarSiNoExiste();

            if (string.IsNullOrWhiteSpace(capitulo) || string.IsNullOrWhiteSpace(nombreNodo))
                return (0, 0, false);

            string key = capitulo.Trim().ToUpperInvariant();
            string nombre = nombreNodo.Trim().ToUpperInvariant();

            if (_memoria.TryGetValue(key, out var nodos) &&
                nodos.TryGetValue(nombre, out var coords))
                return (coords.Norte, coords.Este, true);

            return (0, 0, false);
        }
        /// <summary>
        /// Limpia toda la memoria de nodos.
        /// </summary>
        public static void LimpiarTodo()
        {
            _memoria.Clear();
            _cargado = true;
            Guardar();
        }
    }
}