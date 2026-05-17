using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

namespace SicoePresupuestoNET8
{
    // Form sin diseñador: se arma por código para que sea portable
    public sealed class FrmLicenseAdmin : Form
    {
        private readonly TextBox txtPass = new();
        private readonly DateTimePicker dtpUntil = new();
        private readonly Button btnSave = new();
        private readonly Button btnCancel = new();
        private readonly Label lblPolicy = new();
        private readonly PictureBox pbLogo = new();
        private readonly LinkLabel lnMail1 = new();
        private readonly LinkLabel lnMail2 = new();
        private readonly LinkLabel lnPhone = new();

        public FrmLicenseAdmin()
        {
            // ----- Ventana -----
            Text = "Licencia SICOE — Administración";
            StartPosition = FormStartPosition.CenterParent;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            ClientSize = new Size(760, 470);
            Font = new System.Drawing.Font("Segoe UI", 9F);
            KeyPreview = true;
            BackColor = Color.White;

            // diseño base
            var root = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 1,
                RowCount = 3,
                Padding = new Padding(14),
                BackColor = Color.White
            };
            root.RowStyles.Add(new RowStyle(SizeType.AutoSize)); // encabezado
            root.RowStyles.Add(new RowStyle(SizeType.AutoSize)); // grupo licencia
            root.RowStyles.Add(new RowStyle(SizeType.Percent, 100F)); // legal
            Controls.Add(root);

            // ----- Encabezado -----
            var header = new TableLayoutPanel
            {
                Dock = DockStyle.Top,
                ColumnCount = 2,
                AutoSize = true,
                Padding = new Padding(0, 0, 0, 6)
            };
            header.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));  // logo
            header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            root.Controls.Add(header, 0, 0);

            // Logo: como el PNG es blanco, le doy fondo oscuro para que se vea
            pbLogo.Size = new Size(180, 44);
            pbLogo.BackColor = Color.FromArgb(40, 44, 52);
            pbLogo.SizeMode = PictureBoxSizeMode.Zoom;
            pbLogo.Margin = new Padding(0, 0, 12, 0);
            CargarLogo();
            header.Controls.Add(pbLogo, 0, 0);
            header.SetRowSpan(pbLogo, 2);

            var lblTitle = new Label
            {
                AutoSize = true,
                Font = new System.Drawing.Font("Segoe UI Semibold", 19F, FontStyle.Bold),
                Text = "SICOE — Presupuesto de Obra",
                ForeColor = Color.Black,
                Margin = new Padding(0, 0, 0, 8)
            };
            header.Controls.Add(lblTitle, 1, 0);

            var meta = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                AutoSize = true,
                Margin = new Padding(0),
            };
            meta.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            meta.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            header.Controls.Add(meta, 1, 1);

            var lblCreated = new Label
            {
                AutoSize = true,
                Text = "Creado por: Jorge Andrés Jaimes Arenas\nCEO Acromant S.A.S. • Derechos reservados ©",
                Margin = new Padding(0, 0, 0, 6)
            };
            meta.Controls.Add(lblCreated, 0, 0);
            meta.SetColumnSpan(lblCreated, 2);

            var flowLinks = new FlowLayoutPanel
            {
                AutoSize = true,
                Dock = DockStyle.Fill,
                WrapContents = true,
                Margin = new Padding(0, 0, 0, 0)
            };

            // Links
            lnMail1.Text = "proyectos@acromant.com";
            lnMail1.LinkClicked += (_, __) => Abrir("mailto:proyectos@acromant.com");

            lnMail2.Text = "jjaimesarenas@gmail.com";
            lnMail2.LinkClicked += (_, __) => Abrir("mailto:jjaimesarenas@gmail.com");

            lnPhone.Text = "+57 301 553 3460";
            lnPhone.LinkClicked += (_, __) => Abrir("tel:+573015533460");

            foreach (var ln in new[] { lnMail1, lnMail2, lnPhone })
            {
                ln.AutoSize = true;
                ln.Margin = new Padding(0, 0, 16, 0);
                flowLinks.Controls.Add(ln);
            }
            meta.Controls.Add(flowLinks, 0, 1);
            meta.SetColumnSpan(flowLinks, 2);

            var lblCopy = new Label
            {
                AutoSize = true,
                ForeColor = Color.DimGray,
                Text = "© Acromant S.A.S.  Todos los derechos reservados.",
                Margin = new Padding(0, 5, 0, 8)
            };
            root.Controls.Add(lblCopy, 0, 0);
            lblCopy.BringToFront();

            // ----- Grupo licencia -----
            var group = new GroupBox
            {
                Text = "Actualizar licencia",
                Dock = DockStyle.Top,
                AutoSize = true,
                Padding = new Padding(12),
                Margin = new Padding(0, 12, 0, 8)
            };
            root.Controls.Add(group, 0, 1);

            var grid = new TableLayoutPanel
            {
                Dock = DockStyle.Top,
                ColumnCount = 3,
                AutoSize = true
            };
            grid.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            grid.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            group.Controls.Add(grid);

            // contraseña
            grid.Controls.Add(new Label { Text = "Contraseña:", AutoSize = true, Margin = new Padding(0, 6, 8, 0) }, 0, 0);
            txtPass.Width = 380;
            txtPass.UseSystemPasswordChar = true;
            // PlaceholderText no disponible en net48
            grid.Controls.Add(txtPass, 1, 0);

            // “válida hasta”
            grid.Controls.Add(new Label { Text = "Válida hasta:", AutoSize = true, Margin = new Padding(0, 10, 8, 0) }, 0, 1);
            dtpUntil.Format = DateTimePickerFormat.Short;
            dtpUntil.Width = 140;
            dtpUntil.Value = DateTime.Today.AddYears(1);
            grid.Controls.Add(dtpUntil, 1, 1);

            // botón guardar
            btnSave.Text = "Guardar licencia";
            btnSave.AutoSize = true;                      // se ajusta al texto
            btnSave.AutoSizeMode = AutoSizeMode.GrowAndShrink;
            btnSave.Margin = new Padding(0, 12, 0, 0);
            btnSave.Click += (_, __) => Guardar();
            grid.Controls.Add(btnSave, 1, 2);

            // cancelar
            btnCancel.Text = "Cancelar";
            btnCancel.AutoSize = true;
            btnCancel.AutoSizeMode = AutoSizeMode.GrowAndShrink;
            btnCancel.Margin = new Padding(12, 12, 0, 0);
            btnCancel.Click += (_, __) => DialogResult = DialogResult.Cancel;
            grid.Controls.Add(btnCancel, 2, 2);

            // ----- Bloque legal (envoltura ancha y cómoda) -----
            lblPolicy.Text =
                "Protección de datos: al actualizar esta licencia usted autoriza el tratamiento de los datos " +
                "estrictamente para validación de uso del software, conforme a la Ley 1581 de 2012 (Colombia) " +
                "y normas aplicables. La información no se comparte con terceros. El uso no autorizado, " +
                "ingeniería inversa, reventa o distribución no autorizada son causales de terminación y acciones legales.";
            lblPolicy.AutoSize = true;
            lblPolicy.MaximumSize = new Size(ClientSize.Width - 28, 0); // 28 = padding lateral (14+14)
            lblPolicy.Margin = new Padding(0, 6, 0, 0);
            root.Controls.Add(lblPolicy, 0, 2);

            // Ajuste de envoltura al redimensionar
            Resize += (_, __) => lblPolicy.MaximumSize = new Size(ClientSize.Width - 28, 0);

            // Teclas rápidas
            KeyDown += FrmLicenseAdmin_KeyDown;
        }

        private void CargarLogo()
            {
                // 1) Intento cargar desde Resources sin requerir la clase en compilación
                try
                {
                    var asm = Assembly.GetExecutingAssembly();
                    var ns = typeof(FrmLicenseAdmin).Namespace ?? "SicoePresupuestoNET8";
                    // Busca una clase tipo "<Namespace>.Properties.Resources"
                    var resType = asm.GetType(ns + ".Properties.Resources");
                    if (resType != null)
                    {
                        var prop = resType.GetProperty("LogoAcromant", BindingFlags.Public | BindingFlags.Static);
                        if (prop?.GetValue(null) is Image imgFromRes)
                        {
                            pbLogo.Image = imgFromRes;
                            return;
                        }
                    }
                }
                catch { /* si no existe Resources, seguimos con el fallback */ }

                // 2) Fallback: buscar el PNG junto al .dll/.exe
                try
                {
                    string exeDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location)!;
                    string[] candidates =
                    {
                    "Acromant Logotipo Blanco.png",
                    "Acromant_Logotipo_Blanco.png",
                    "Acromant.png"
                };
                    foreach (var name in candidates)
                    {
                        string path = Path.Combine(exeDir, name);
                        if (File.Exists(path))
                        {
                            pbLogo.Image = Image.FromFile(path);
                            return;
                        }
                    }
                }
                catch { /* ignorar */ }

                // Si no se encontró, simplemente dejamos el PictureBox sin imagen.
            }


            private void Guardar()
                {
                    if (!LicenseService.VerifyAdminPassword(txtPass.Text))
                    {
                        MessageBox.Show(this, "Contraseña incorrecta.", "SICOE",
                            MessageBoxButtons.OK, MessageBoxIcon.Warning);
                        txtPass.Focus(); txtPass.SelectAll();
                        return;
                    }

                    // NOTA: LicenseService trabaja en UTC; convierto la fecha ingresada (local) a fin de día local -> UTC
                    var localEnd = dtpUntil.Value.Date.AddDays(1).AddTicks(-1);
                    LicenseService.SaveExpiration(localEnd.ToUniversalTime());

                    MessageBox.Show(this, "Licencia actualizada correctamente.", "SICOE",
                        MessageBoxButtons.OK, MessageBoxIcon.Information);
                    DialogResult = DialogResult.OK;
                }

                private void FrmLicenseAdmin_KeyDown(object? sender, KeyEventArgs e)
                {
                    // Atajos de soporte (opcional): Ctrl+Shift+Delete resetea y abre / Ctrl+L abrir admin
                    if (e.Control && e.Shift && e.KeyCode == Keys.Delete)
                    {
                        LicenseService.ResetAndPrompt(this);
                        e.Handled = true;
                    }
                    if (e.Control && e.KeyCode == Keys.L)
                    {
                        LicenseService.ShowAdminDialog(this, force: true);
                        e.Handled = true;
                    }
                }

                private static void Abrir(string url)
                {
                    try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
                    catch { }
                }
            }
        }
