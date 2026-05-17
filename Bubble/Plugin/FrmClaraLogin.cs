using System;
using System.Collections.Generic;
// using System.Net.Http; // no usado — curl reemplaza HttpClient
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace SicoePresupuestoNET8
{
    public partial class FrmClaraLogin : Form
    {
        // ── Resultado que leerá FrmSicoePresupuesto ───────────────────────────
        public string BaseUrl { get; private set; } = "";
        public string Email { get; private set; } = "";
        public string Password { get; private set; } = "";
        public int ContratoId { get; private set; } = 0;
        public string Mode { get; private set; } = "append";
        public string TokenTemp { get; private set; } = "";   // evita segundo login
        public int UsuarioId { get; private set; } = 0;

        private sealed class ContratoItem
        {
            public int Id { get; set; }
            public string Numero { get; set; } = "";
            public string Nombre { get; set; } = "";
            public override string ToString() => $"{Numero}  —  {Nombre}";
        }

        // ── Archivo de preferencias ───────────────────────────────────────────
        private static readonly string _prefFile = System.IO.Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "SicoeCAD", "claracore_prefs.json");

        public FrmClaraLogin()
        {
            InitializeComponent();
            // ── NUEVO: evitar que quede oculto detrás de AutoCAD ──
            this.StartPosition = FormStartPosition.CenterScreen;
            this.TopMost = true;
            this.BringToFront();
            btnCargarContratos.Click += BtnCargarContratos_Click;
            btnEnviar.Click += BtnEnviar_Click;
            btnCancelar.Click += BtnCancelar_Click;
            CargarPreferencias();
            txtClaveReplace.TextChanged += (s, e) =>
            {
                rbReplace.Enabled = txtClaveReplace.Text == "CLARA2025";
                if (!rbReplace.Enabled) rbAppend.Checked = true;
            };
        }

        private void CargarPreferencias()
        {
            try
            {
                if (!System.IO.File.Exists(_prefFile)) return;
                var json = System.IO.File.ReadAllText(_prefFile);
                var r = JObject.Parse(json);
                if (r["url"] != null) txtUrl.Text = r["url"].Value<string>() ?? txtUrl.Text;
                if (r["email"] != null) txtEmail.Text = r["email"].Value<string>() ?? "";
                if (r["pass"] != null) txtPassword.Text =
                    Encoding.UTF8.GetString(Convert.FromBase64String(r["pass"].Value<string>() ?? ""));
                if (r["contratoId"] != null) _savedContratoId = r["contratoId"].Value<int>();
                if (r["contratoNombre"] != null) _savedContratoNombre = r["contratoNombre"].Value<string>() ?? "";
            }
            catch { }
        }

        private void GuardarPreferencias(int contratoId, string contratoNombre)
        {
            try
            {
                System.IO.Directory.CreateDirectory(System.IO.Path.GetDirectoryName(_prefFile)!);
                var obj = new
                {
                    url = txtUrl.Text.Trim(),
                    email = txtEmail.Text.Trim(),
                    pass = Convert.ToBase64String(Encoding.UTF8.GetBytes(txtPassword.Text)),
                    contratoId,
                    contratoNombre
                };
                System.IO.File.WriteAllText(_prefFile, JsonConvert.SerializeObject(obj));
            }
            catch { }
        }

        private int _savedContratoId = 0;
        private string _savedContratoNombre = "";
        private int _usuarioId = 0;   // se llena al hacer login

        // ── Cargar contratos ──────────────────────────────────────────────────
        private async void BtnCargarContratos_Click(object sender, EventArgs e)
        {
            if (string.IsNullOrWhiteSpace(txtEmail.Text) || string.IsNullOrWhiteSpace(txtPassword.Text))
            {
                MessageBox.Show("Ingresa correo y contraseña antes de cargar contratos.",
                    "Validación", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            btnCargarContratos.Enabled = false;
            btnCargarContratos.Text = "Cargando...";
            cmbContrato.Enabled = false;
            cmbContrato.Items.Clear();
            btnEnviar.Enabled = false;

            try
            {
                string url = txtUrl.Text.TrimEnd('/');
                string email = txtEmail.Text.Trim();
                string password = txtPassword.Text;

                // Task.Run evita el bloqueo de socket que AutoCAD aplica al hilo principal
                var (token, contratos) = await Task.Run(() =>
                {
                    // Login via curl para evitar bloqueo de socket de AutoCAD
                    var loginJson = CurlPost($"{url}/auth/login",
                                            JsonConvert.SerializeObject(new { email, password }), "");
                    var ld = JObject.Parse(loginJson);
                    var tok = ld["access_token"].Value<string>();

                    // Obtener usuario_id del login
                    int uid = 0;
                    if (ld["usuario"] != null && ld["usuario"]["id"] != null)
                        uid = ld["usuario"]["id"].Value<int>();
                    // Fallback: algunos endpoints devuelven el id directamente
                    if (uid == 0 && ld["id"] != null)
                        uid = ld["id"].Value<int>();
                    // Log para diagnóstico
                    if (uid == 0)
                        throw new Exception($"No se pudo obtener el ID de usuario.\nRespuesta login:\n{loginJson.Substring(0, Math.Min(200, loginJson.Length))}");

                    // Contratos solo del usuario autenticado
                    var contJson = CurlGet($"{url}/admin/usuario-contratos/{uid}", tok);
                    var list = new List<ContratoItem>();
                    var cd = JArray.Parse(contJson);
                    foreach (var el in cd)
                        list.Add(new ContratoItem
                        {
                            Id = el["id"].Value<int>(),
                            Numero = el["numero"]?.Value<string>() ?? "",
                            Nombre = el["contratista"]?.Value<string>() ?? "",
                        });

                    _usuarioId = uid;
                    return (tok, list);
                });

                TokenTemp = token;
                UsuarioId = _usuarioId;

                foreach (var c in contratos) cmbContrato.Items.Add(c);
                // Restaurar contrato guardado si existe
                if (_savedContratoId > 0)
                {
                    for (int i = 0; i < cmbContrato.Items.Count; i++)
                    {
                        if (cmbContrato.Items[i] is ContratoItem ci && ci.Id == _savedContratoId)
                        { cmbContrato.SelectedIndex = i; break; }
                    }
                }
                if (cmbContrato.SelectedIndex < 0 && cmbContrato.Items.Count > 0)
                    cmbContrato.SelectedIndex = 0;

                cmbContrato.Enabled = true;
                btnEnviar.Enabled = true;
                btnCargarContratos.Text = "✔ Contratos cargados";
            }
            catch (Exception ex)
            {
                btnCargarContratos.Text = "🔍 Cargar contratos";
                MessageBox.Show($"Error al cargar contratos:\n\n{ex.Message}",
                    "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                btnCargarContratos.Enabled = true;
            }
        }

        // ── Enviar ────────────────────────────────────────────────────────────
        private void BtnEnviar_Click(object sender, EventArgs e)
        {
            if (cmbContrato.SelectedItem is not ContratoItem ci)
            {
                MessageBox.Show("Selecciona un contrato.", "Validación",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            BaseUrl = txtUrl.Text.TrimEnd('/');
            Email = txtEmail.Text.Trim();
            Password = txtPassword.Text;
            ContratoId = ci.Id;
            Mode = rbReplace.Checked ? "replace" : "append";

            GuardarPreferencias(ci.Id, ci.ToString());

            DialogResult = DialogResult.OK;
            Close();
        }
        private static string CurlPost(string url, string jsonBody, string token)
        {
            var tmp = System.IO.Path.GetTempFileName() + ".json";
            System.IO.File.WriteAllText(tmp, jsonBody, Encoding.UTF8);
            var auth = string.IsNullOrEmpty(token) ? "" : $"-H \"Authorization: Bearer {token}\" ";
            var args = $"-s -X POST \"{url}\" {auth}" +
                       $"-H \"Content-Type: application/json\" --data-binary \"@{tmp}\"";
            var result = RunCurl(args);
            try { System.IO.File.Delete(tmp); } catch { }
            return result;
        }

        private static string CurlGet(string url, string token)
        {
            var args = $"-s \"{url}\" -H \"Authorization: Bearer {token}\"";
            return RunCurl(args);
        }

        private static string RunCurl(string args)
        {
            var psi = new System.Diagnostics.ProcessStartInfo
            {
                FileName = "curl.exe",
                Arguments = args,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            };
            using var proc = System.Diagnostics.Process.Start(psi)!;
            var output = proc.StandardOutput.ReadToEnd();
            proc.WaitForExit();
            return output;
        }
        private void BtnCancelar_Click(object? sender, EventArgs e)
        {
            DialogResult = DialogResult.Cancel;
            Close();
        }
    }
}