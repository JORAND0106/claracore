using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Windows.Forms;

namespace SicoePresupuestoNET8
{
    /// <summary>
    /// Servicio de licencia: lectura/escritura/verificación y UI de administración.
    /// Archivo: %APPDATA%\SICOE\license.dat
    /// Firma: HMAC-SHA256 + DPAPI (usuario actual)
    /// </summary>
    public static class LicenseService
    {
        // === CONFIGURACIÓN ===
        // Cambia la contraseña maestra aquí:
        public const string AdminPassword = "Cuervo_1256#SICOE";

        // Ruta del archivo de licencia (visible para reset)
        public static string AppFolder =>
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "SICOE");

        public static string LicenseFilePath => Path.Combine(AppFolder, "license.dat");

        // Clave secreta para HMAC (interna al binario). Puedes cambiar la semilla si lo deseas.
        private static readonly byte[] HmacKey = ComputeHmacKey();
        private static byte[] ComputeHmacKey()
        {
            using (var h = SHA256.Create())
                return h.ComputeHash(Encoding.UTF8.GetBytes("SICOE|Acromant|Lic2025|Semilla⎈-3e7a9b2a"));
        }

        // === API PÚBLICA ===

        /// <summary>
        /// Se llama al inicio (por ejemplo, en FrmSicoePresupuesto_Load).
        /// Si no hay licencia o está vencida, abre el admin. Devuelve true si
        /// hay licencia válida; false si el usuario cancela.
        /// </summary>
        public static bool CheckOrPrompt(IWin32Window owner)
        {
            if (TryReadExpiration(out var expiresUtc, out _))
            {
                if (DateTime.UtcNow <= expiresUtc)
                    return true;
                // vencida => abre admin
            }

            using (var f = new FrmLicenseAdmin())
            {
                var dr = f.ShowDialog(owner);
                if (dr != DialogResult.OK)
                    return false;
            }

            // Relee: si sigue inválida, falla.
            if (TryReadExpiration(out var expiresAgainUtc, out _))
                return DateTime.UtcNow <= expiresAgainUtc;

            return false;
        }

        /// <summary>
        /// Valida la contraseña del administrador.
        /// </summary>
        public static bool VerifyAdminPassword(string input)
            => string.Equals((input ?? "").Trim(), AdminPassword, StringComparison.Ordinal);

        /// <summary>
        /// Guarda la fecha de vencimiento (hora normalizada a UTC 00:00).
        /// </summary>
        public static void SaveExpiration(DateTime untilLocal)
        {
            var expiresUtc = untilLocal.Date.ToUniversalTime();

            var payload = expiresUtc.Ticks.ToString(); // payload simple
            var mac = ComputeMac(payload);             // HMAC

            var joined = $"{payload}|{mac}";
            var plaintext = Encoding.UTF8.GetBytes(joined);

            // DPAPI por usuario: impide copiar/editar fácilmente en otra máquina/usuario
            var protectedBytes = ProtectedData.Protect(plaintext, null, DataProtectionScope.CurrentUser);

            var dir = Path.GetDirectoryName(LicenseFilePath)!;
            if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
            File.WriteAllBytes(LicenseFilePath, protectedBytes);
        }

        /// <summary>
        /// Borra la licencia para forzar el diálogo al iniciar.
        /// </summary>
        public static void ResetLicense()
        {
            try { if (File.Exists(LicenseFilePath)) File.Delete(LicenseFilePath); }
            catch { /* no crítico */ }
        }

        /// <summary>
        /// Abre el formulario de admin a voluntad (por ejemplo, desde un menú).
        /// </summary>
        public static void ForceAdminDialog(IWin32Window owner)
        {
            using var f = new FrmLicenseAdmin();
            f.ShowDialog(owner);
        }

        /// <summary>
        /// Lee la fecha de vencimiento. Devuelve false si no existe/está corrupto.
        /// </summary>
        public static bool TryReadExpiration(out DateTime expiresUtc, out string? error)
        {
            expiresUtc = DateTime.MinValue;
            error = null;

            try
            {
                if (!File.Exists(LicenseFilePath))
                {
                    error = "No existe archivo de licencia.";
                    return false;
                }

                var raw = File.ReadAllBytes(LicenseFilePath);
                var plain = ProtectedData.Unprotect(raw, null, DataProtectionScope.CurrentUser);
                var joined = Encoding.UTF8.GetString(plain);

                var parts = joined.Split('|');
                if (parts.Length != 2)
                {
                    error = "Archivo de licencia inválido (formato).";
                    return false;
                }

                var payload = parts[0];
                var mac = parts[1];

                if (!VerifyMac(payload, mac))
                {
                    error = "Integridad de licencia inválida (firma).";
                    return false;
                }

                if (!long.TryParse(payload, out long ticks))
                {
                    error = "Contenido de licencia inválido (ticks).";
                    return false;
                }

                expiresUtc = new DateTime(ticks, DateTimeKind.Utc);
                return true;
            }
            catch (CryptographicException)
            {
                error = "No se pudo desencriptar (usuario distinto o archivo alterado).";
                return false;
            }
            catch (Exception ex)
            {
                error = ex.Message;
                return false;
            }
        }

        // === HELPERS ===
        private static string ComputeMac(string payload)
        {
            using var h = new HMACSHA256(HmacKey);
            var bytes = h.ComputeHash(Encoding.UTF8.GetBytes(payload));
            return Convert.ToBase64String(bytes);
        }

        private static bool VerifyMac(string payload, string macB64)
        {
            try
            {
                var expected = ComputeMac(payload);
                // comparación con tiempo constante
                var a = Convert.FromBase64String(expected);
                var b = Convert.FromBase64String(macB64);
                if (a.Length != b.Length) return false;

                int diff = 0;
                for (int i = 0; i < a.Length; i++)
                    diff |= a[i] ^ b[i];

                return diff == 0;
            }
            catch
            {
                return false;
            }
        }
        // --- Compat (envoltorios para llamadas antiguas) ---
        public static void ResetAndPrompt(IWin32Window owner)
        {
            ResetLicense();
            ForceAdminDialog(owner);
        }

        public static void ShowAdminDialog(IWin32Window owner, bool force = false)
        {
            // 'force' no hace falta; siempre abre
            ForceAdminDialog(owner);
        }

    }
}
