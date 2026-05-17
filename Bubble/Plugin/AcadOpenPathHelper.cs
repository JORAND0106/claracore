using System;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using acApp = Autodesk.AutoCAD.ApplicationServices;

namespace SicoePresupuestoNET8
{
    /// <summary>
    /// Elegir archivos desde plugins AutoCAD sin colgar el explorador en Descargas/OneDrive.
    /// Pegar ruta = método fiable; Examinar abre en carpeta segura (Documentos / última ruta local).
    /// </summary>
    internal static class AcadOpenPathHelper
    {
        private sealed class HwndWrapper : IWin32Window
        {
            public HwndWrapper(IntPtr h) => Handle = h;
            public IntPtr Handle { get; }
        }

        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        internal static bool TryPickOpenFile(
            string title,
            string filter,
            out string? filePath,
            string? lastPath = null,
            Form? ownerForm = null)
        {
            filePath = null;
            using var dlg = new FrmAcadOpenPath(title, filter, lastPath, isSave: false);
            if (!ShowPathDialog(dlg, ownerForm))
                return false;

            filePath = dlg.SelectedPath;
            return !string.IsNullOrWhiteSpace(filePath) && File.Exists(filePath);
        }

        private static bool ShowPathDialog(FrmAcadOpenPath dlg, Form? ownerForm)
        {
            try
            {
                if (ownerForm != null && ownerForm.Visible && !ownerForm.IsDisposed)
                    return dlg.ShowDialog(ownerForm) == DialogResult.OK;

                var h = acApp.Application.MainWindow?.Handle ?? IntPtr.Zero;
                if (h != IntPtr.Zero)
                    return dlg.ShowDialog(new HwndWrapper(h)) == DialogResult.OK;
            }
            catch { /* fallback */ }

            return dlg.ShowDialog() == DialogResult.OK;
        }

        internal static string? GetSafeInitialDirectory(string? pathHint)
        {
            static bool IsRisky(string p)
            {
                if (string.IsNullOrWhiteSpace(p)) return true;
                var u = p.ToUpperInvariant();
                return u.Contains("ONEDRIVE") || u.Contains("\\DOWNLOADS") || u.Contains("\\DESCARGAS");
            }

            if (!string.IsNullOrWhiteSpace(pathHint))
            {
                var dir = Path.GetDirectoryName(pathHint.Trim().Trim('"'));
                if (!string.IsNullOrEmpty(dir) && Directory.Exists(dir) && !IsRisky(dir))
                    return dir;
            }

            var docs = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
            if (Directory.Exists(docs)) return docs;

            var tmp = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                "ClaraCore");
            try
            {
                if (!Directory.Exists(tmp)) Directory.CreateDirectory(tmp);
                return tmp;
            }
            catch
            {
                return Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            }
        }

        private sealed class FrmAcadOpenPath : Form
        {
            private readonly TextBox _txt;
            private readonly string _filter;
            private readonly bool _isSave;
            public string? SelectedPath { get; private set; }

            public FrmAcadOpenPath(string title, string filter, string? initialPath, bool isSave)
            {
                _filter = filter;
                _isSave = isSave;
                Text = title;
                FormBorderStyle = FormBorderStyle.FixedDialog;
                MaximizeBox = MinimizeBox = false;
                StartPosition = FormStartPosition.CenterScreen;
                ClientSize = new Size(640, 130);
                Font = new Font("Segoe UI", 9F);

                var lbl = new Label
                {
                    Text = "Pegue la ruta del archivo (Explorador → clic derecho → Copiar como ruta)\n" +
                           "o use Examinar (abre en Documentos, no en Descargas).",
                    Location = new Point(12, 10),
                    Size = new Size(610, 36),
                };

                _txt = new TextBox
                {
                    Location = new Point(12, 50),
                    Size = new Size(500, 27),
                    Anchor = AnchorStyles.Left | AnchorStyles.Top | AnchorStyles.Right,
                };
                if (!string.IsNullOrWhiteSpace(initialPath))
                    _txt.Text = initialPath;

                var btnBrowse = new Button
                {
                    Text = "Examinar…",
                    Location = new Point(518, 48),
                    Size = new Size(100, 30),
                    Anchor = AnchorStyles.Top | AnchorStyles.Right,
                };
                btnBrowse.Click += (_, __) => Browse();

                var btnOk = new Button
                {
                    Text = "Abrir",
                    Location = new Point(432, 88),
                    Size = new Size(88, 30),
                    DialogResult = DialogResult.OK,
                };
                var btnCancel = new Button
                {
                    Text = "Cancelar",
                    Location = new Point(530, 88),
                    Size = new Size(88, 30),
                    DialogResult = DialogResult.Cancel,
                };
                AcceptButton = btnOk;
                CancelButton = btnCancel;
                btnOk.Click += (_, __) => ConfirmOk();

                Controls.AddRange(new Control[] { lbl, _txt, btnBrowse, btnOk, btnCancel });
            }

            private void Browse()
            {
                var owner = new HwndWrapper(
                    acApp.Application.MainWindow?.Handle ?? GetForegroundWindow());

                if (_isSave)
                {
                    using var sfd = new SaveFileDialog
                    {
                        Title = Text,
                        Filter = _filter,
                        FilterIndex = 1,
                        RestoreDirectory = true,
                    };
                    var dir = GetSafeInitialDirectory(_txt.Text);
                    if (!string.IsNullOrEmpty(dir)) sfd.InitialDirectory = dir;
                    if (sfd.ShowDialog(owner) == DialogResult.OK)
                        _txt.Text = sfd.FileName;
                    return;
                }

                using var ofd = new OpenFileDialog
                {
                    Title = Text,
                    Filter = _filter,
                    FilterIndex = 1,
                    CheckFileExists = true,
                    RestoreDirectory = true,
                };
                var safeDir = GetSafeInitialDirectory(_txt.Text);
                if (!string.IsNullOrEmpty(safeDir)) ofd.InitialDirectory = safeDir;
                if (ofd.ShowDialog(owner) == DialogResult.OK)
                    _txt.Text = ofd.FileName;
            }

            private void ConfirmOk()
            {
                var p = (_txt.Text ?? "").Trim().Trim('"');
                if (string.IsNullOrWhiteSpace(p) || (!_isSave && !File.Exists(p)))
                {
                    MessageBox.Show(this,
                        _isSave ? "Indique una ruta de guardado." : "Archivo no encontrado.",
                        "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    DialogResult = DialogResult.None;
                    return;
                }
                SelectedPath = p;
            }
        }
    }
}
