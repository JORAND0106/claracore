// AutoCAD
using Autodesk.AutoCAD.ApplicationServices; // Document, DocumentCollectionEventArgs
using SicoePresupuestoNET8;
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;
using System.Linq;

// Alias para evitar choque con System.Windows.Forms.Application
using Autodesk.AutoCAD.ApplicationServices;
using acApp = Autodesk.AutoCAD.ApplicationServices.Application;   // alias AutoCAD
using winApp = System.Windows.Forms.Application;                  // alias WinForms


namespace SicoeCAD
{
    public partial class FrmSicoeCad : Form
    {
        private bool _acadHooksOn = false;
        private string? _lastFolder;
        public bool LaunchPresupuesto { get; private set; } = false;
        public bool LaunchTopografia { get; private set; } = false;

        public FrmSicoeCad()
        {
            InitializeComponent();
            this.Load += FrmSicoeCad_Load;
            this.FormClosed += FrmSicoeCad_FormClosed;

            // --- asociar botón Presupuesto - Topografía ---
            this.btnPresupuesto.Click += BtnPresupuesto_Click;
            this.btnTopografia.Click += BtnTopografia_Click;
            this.btnUtilidades.Click += BtnUtilidades_Click;


            var btn = this.Controls.Find("btnAyuda", true).FirstOrDefault() as Button;
            if (btn != null)
                btn.Click += BtnAyuda_Click;
            // --- disparador oculto de Biblioteca de métodos ---
            // pictureAutor es el PictureBox del logo mostrado en el panel de presentación.
            pictureAutor.Click += PictureAutor_Click;
        }
        // Requiere: using System.Linq;  (ver nota abajo)
        private void BtnPresupuesto_Click(object? sender, EventArgs e)
        {
            // Marca intención y cierra el launcher
            LaunchPresupuesto = true;
            this.Close();
        }
        private void BtnTopografia_Click(object? sender, EventArgs e)
        {
            LaunchTopografia = true;
            this.Close(); // cierra el launcher
        }
        // ===== Ayuda centralizada (abre FrmAyuda desde el lanzador) =====
        private void BtnAyuda_Click(object sender, EventArgs e)
        {
            using (var frm = new FrmAyuda()) // requiere using SicoePresupuestoNET8; si está en el mismo namespace, no hace falta
            {
                // Opcional: ir directo a una sección
                // frm.GoTo("presupuesto-actualizaciones"); // si expusiste GoTo como pública
                frm.StartPosition = FormStartPosition.CenterParent;
                frm.ShowDialog(this);
            }
        }
        private void BtnUtilidades_Click(object? sender, EventArgs e)
        {
            // 1) Desengancha hooks si quieres (ok)
            UnhookAcad();

            // 2) Oculta el launcher (NO lo cierres aún)
            this.Hide();

            // 3) Abre Utilidades de forma modal (bloquea hasta que el usuario cierre Utilidades)
            using (var f = new SicoeCAD.FrmUtilidades())
            {
                f.StartPosition = FormStartPosition.CenterScreen;
                f.ShowDialog(this);
            }

            // 4) Al cerrar Utilidades, ya puedes cerrar el launcher definitivamente
            this.Close();
        }
        private static void ConfigurarBotonModulo(SicoePresupuestoNET8.Controls.ElevatedButton b, string txt, int tab)
        {
            b.Anchor = System.Windows.Forms.AnchorStyles.None;
            b.BackColor = System.Drawing.Color.FromArgb(10, 33, 64);
            b.BaseColor = System.Drawing.Color.FromArgb(10, 33, 64);
            b.BorderColor = System.Drawing.Color.FromArgb(41, 128, 185);
            b.BorderSize = 1;
            b.CornerRadius = 14;
            b.DisabledColor = System.Drawing.Color.FromArgb(180, 190, 210);
            b.Elevation = 5;
            b.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            b.Font = new System.Drawing.Font("Segoe UI Semibold", 9.5F, System.Drawing.FontStyle.Bold);
            b.ForeColor = System.Drawing.Color.White;
            b.HoverColor = System.Drawing.Color.FromArgb(41, 128, 185);
            b.PressedColor = System.Drawing.Color.FromArgb(26, 100, 160);
            b.ShadowColor = System.Drawing.Color.FromArgb(60, 0, 0, 0);
            b.Size = new System.Drawing.Size(148, 100);
            b.Text = txt;
            b.TextColor = System.Drawing.Color.White;
            b.UseVisualStyleBackColor = false;
            b.TabIndex = tab;
        }

        private void panelHeader_Paint(object sender, System.Windows.Forms.PaintEventArgs e)
        {
            using (var br = new System.Drawing.Drawing2D.LinearGradientBrush(
                panelHeader.ClientRectangle,
                System.Drawing.Color.FromArgb(10, 33, 64),
                System.Drawing.Color.FromArgb(26, 74, 140),
                System.Drawing.Drawing2D.LinearGradientMode.Horizontal))
                e.Graphics.FillRectangle(br, panelHeader.ClientRectangle);
            using (var pen = new System.Drawing.Pen(System.Drawing.Color.FromArgb(41, 128, 185), 3))
                e.Graphics.DrawLine(pen, 0, panelHeader.Height - 3, panelHeader.Width, panelHeader.Height - 3);
        }

        // ================== EVENTOS DE FORM ==================
        private void FrmSicoeCad_Load(object? sender, EventArgs e)
        {
            // 1) Validar licencia ANTES de inicializar nada más
            //    (usa el mismo servicio LicenseService que ya tienes)
            if (!LicenseService.CheckOrPrompt(this))
            {
                // Sin licencia válida o usuario canceló → cerrar el lanzador
                MessageBox.Show(this,
                    "No se encontró una licencia válida para SicoeCAD.\n\n" +
                    "El módulo se cerrará.",
                    "SICOE",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);

                // Cierra el formulario y no continúa con la inicialización
                this.Close();
                return;
            }

            // 2) Si la licencia ES válida, continúas como antes
            InitVersionAuto();   // versión y link a changelog
            InitRutaTracking();  // ruta de trabajo viva

            // Texto base de licencia (puedes ajustarlo si quieres mostrar fecha, etc.)
            lblLicencia.Text = "Licencia: SICOE – Uso interno";
        }

        private void FrmSicoeCad_FormClosed(object? sender, FormClosedEventArgs e)
        {
            UnhookAcad();
        }
        // ================== VERSIÓN AUTOMÁTICA ==================
        void InitVersionAuto()
        {
            // 1) Lee la versión informativa del ensamblado (1.0.3+build …)
            var asm = Assembly.GetExecutingAssembly();
            string ver = asm.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
                         ?? asm.GetName().Version?.ToString()
                         ?? "1.0.0";

            // 2) Muestra en el label
            lblVersion.Text = $"Versión: {ver}";
            // Si es un LinkLabel, también actualiza el vínculo para que se note que es clickeable
            if (lblVersion is LinkLabel ll)
            {
                ll.Links.Clear();
                ll.LinkArea = new LinkArea(9, ver.Length); // subraya la parte de la versión
            }
        }
        // ================== RUTA DE TRABAJO VIVA ==================
        private void InitRutaTracking()
        {
            try
            {
                // Estado inicial según documento activo
                UpdateRutaTrabajo(acApp.DocumentManager.MdiActiveDocument);

                // Suscribir eventos de AutoCAD (una sola vez)
                if (!_acadHooksOn)
                {
                    acApp.DocumentManager.DocumentActivated += DM_DocumentActivated;
                    acApp.DocumentManager.DocumentCreated += DM_DocumentCreated;
                    acApp.DocumentManager.DocumentToBeDestroyed += DM_DocumentToBeDestroyed;
                    _acadHooksOn = true;
                }

                // Click en la ruta para abrir carpeta
                lblEstadoRuta.Cursor = Cursors.Hand;
                lblEstadoRuta.Click += (s, e) =>
                {
                    string path = _lastFolder ?? "";
                    if (!string.IsNullOrWhiteSpace(path) && Directory.Exists(path))
                        Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
                };
            }
            catch (Exception ex)
            {
                lblEstadoRuta.Text = $"Ruta de trabajo: (error) {ex.Message}";
            }
        }

        private void UnhookAcad()
        {
            if (_acadHooksOn)
            {
                acApp.DocumentManager.DocumentActivated -= DM_DocumentActivated;
                acApp.DocumentManager.DocumentCreated -= DM_DocumentCreated;
                acApp.DocumentManager.DocumentToBeDestroyed -= DM_DocumentToBeDestroyed;
                _acadHooksOn = false;
            }
        }

        // ---- Handlers de AutoCAD ----
        private void DM_DocumentActivated(object? sender, DocumentCollectionEventArgs e)
            => UpdateRutaTrabajo(e?.Document);

        private void DM_DocumentCreated(object? sender, DocumentCollectionEventArgs e)
            => UpdateRutaTrabajo(e?.Document);

        private void DM_DocumentToBeDestroyed(object? sender, DocumentCollectionEventArgs e)
        {
            // Al cerrar, puede cambiar el activo; refresca en background
            ThreadPool.QueueUserWorkItem(_ =>
                UpdateRutaTrabajo(acApp.DocumentManager.MdiActiveDocument));
        }

        private void UpdateRutaTrabajo(Document? doc)
        {
            try
            {
                string texto;
                if (doc == null)
                {
                    _lastFolder = null;
                    texto = "Ruta de trabajo: (sin dibujo activo)";
                }
                else
                {
                    string name = doc.Name ?? "";
                    string folder = string.IsNullOrWhiteSpace(name) ? "" : (Path.GetDirectoryName(name) ?? "");
                    _lastFolder = Directory.Exists(folder) ? folder : null;

                    string file = Path.GetFileName(name);
                    string shortFolder = AbreviarRuta(folder, 60);
                    texto = string.IsNullOrEmpty(file)
                        ? "Ruta de trabajo: (dibujo sin nombre)"
                        : $"Ruta de trabajo: {shortFolder}\\{file}";
                }

                SetSafeLabelText(lblEstadoRuta, texto);
            }
            catch (Exception ex)
            {
                SetSafeLabelText(lblEstadoRuta, $"Ruta de trabajo: (error) {ex.Message}");
            }
        }

        // ---- Helpers ----
        private static void SetSafeLabelText(Label lbl, string text)
        {
            if (lbl.InvokeRequired) lbl.BeginInvoke(new Action(() => lbl.Text = text));
            else lbl.Text = text;
        }
        private void PictureAutor_Click(object? sender, EventArgs e)
        {
            try
            {
                // 1) Genera / actualiza el HTML de biblioteca para FrmSicoePresupuesto
                MethodDocLibrary.AppendFrmSicoePresupuestoDoc();

                // 2) Resuelve la ruta física del archivo HTML junto a la DLL del plugin
                var asmPath = typeof(MethodDocLibrary).Assembly.Location;
                var folder = Path.GetDirectoryName(asmPath) ?? Environment.CurrentDirectory;
                var html = Path.Combine(folder, "SicoeCAD_MethodLibrary.html");

                // 3) Si existe, abrir con el navegador predeterminado
                if (File.Exists(html))
                {
                    Process.Start(new ProcessStartInfo(html) { UseShellExecute = true });
                }
                else
                {
                    MessageBox.Show(this,
                        "Se intentó generar la biblioteca de métodos, pero no se encontró el archivo HTML.\n" +
                        "Verifique permisos de escritura en la carpeta del plugin.",
                        "SicoeCAD – Biblioteca de métodos",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Warning);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show(this,
                    "No se pudo generar o abrir la biblioteca de métodos:\n" + ex.Message,
                    "SicoeCAD – Biblioteca de métodos",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
        }

        private static string AbreviarRuta(string path, int maxChars)
        {
            if (string.IsNullOrWhiteSpace(path)) return "(sin carpeta)";
            if (path.Length <= maxChars) return path;

            try
            {
                string root = Path.GetPathRoot(path) ?? "";
                string rest = path.Substring(root.Length).Trim('\\');
                var parts = rest.Split('\\');
                if (parts.Length <= 2) return path;

                string last = parts[parts.Length - 1];
                string mid = "...";
                string candidate = $"{root}{mid}\\{last}";
                if (candidate.Length <= maxChars) return candidate;

                if (last.Length > 20) last = last.Substring(last.Length - 20);
                return $"{root}{mid}\\{last}";
            }
            catch
            {
                return path;
            }
        }
        private void lblVersion_LinkClicked(object? sender, LinkLabelLinkClickedEventArgs e)
        {
            try
            {
                // Carpeta de la DLL realmente cargada por NETLOAD
                string folder = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location) ?? "";
                string html = Path.Combine(folder, "changelog.html");

                // Si por alguna razón no existe (primera vez), crea una mínima plantilla.
                if (!File.Exists(html))
                {
                    const string tpl = "<!doctype html><html><head><meta charset='utf-8'/>" +
                                       "<title>SICOE - Notas de versión</title></head>" +
                                       "<body style='font-family:Segoe UI,Arial,sans-serif'>" +
                                       "<h2>SICOE – Notas de versión</h2>" +
                                       "<ul id='log'><li>Inicializado.</li></ul></body></html>";
                    File.WriteAllText(html, tpl);
                }

                // Abrir con el navegador predeterminado
                Process.Start(new ProcessStartInfo(html) { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "No se pudo abrir el historial de versión:\n" + ex.Message,
                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
    }
}
