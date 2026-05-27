using System;
using System.Windows.Forms;

namespace ClaraLink
{
    public partial class FrmClaraLink : Form
    {
        private NotifyIcon _tray = null!;

        private System.Threading.SynchronizationContext? _ctx;

        public FrmClaraLink(string? uriInicial = null)
        {
            InitializeComponent();

            // Capturar contexto UI ANTES de crear el tray
            _ctx = System.Threading.SynchronizationContext.Current;

            // Forzar creación del handle aunque el form no se muestre
            var _ = this.Handle;

            ConfigurarTray();

            // Escuchar URIs que lleguen de otros procesos
            Program.IniciarServidorPipe(uri =>
            {
                _ctx?.Post(_ => ProcesarUri(uri), null);
            });

            if (uriInicial != null)
                ProcesarUri(uriInicial);
        }

        private void ProcesarUri(string uri)
        {
            try
            {
                ZoomHandler.EjecutarDesdeUri(uri);
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    $"ClaraLink no pudo procesar el enlace:\n{ex.Message}",
                    "ClaraLink",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
            }
        }

        private void ConfigurarTray()
        {
            _tray = new NotifyIcon
            {
                Icon = SystemIcons.Application,
                Text = "ClaraLink — Activo",
                Visible = true,
            };

            var menu = new ContextMenuStrip();
            menu.Items.Add("📋 ClaraLink activo", null, null).Enabled = false;
            menu.Items.Add("-");
            menu.Items.Add("❌ Cerrar", null, (s, e) => { _tray.Visible = false; Application.Exit(); });
            _tray.ContextMenuStrip = menu;

            // Doble click en el tray → mostrar mensaje
            _tray.DoubleClick += (s, e) => MessageBox.Show(
                "ClaraLink está activo.\nHaz click en cualquier registro de ClaraCore para hacer zoom en AutoCAD.",
                "ClaraLink", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        protected override void SetVisibleCore(bool value)
        {
            // Nunca mostrar la ventana — solo vivir en la bandeja
            base.SetVisibleCore(false);
        }

    }
}