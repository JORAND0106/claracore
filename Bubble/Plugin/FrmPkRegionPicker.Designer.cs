using System.Drawing;
using System.Windows.Forms;

namespace SicoePresupuestoNET8
{
    partial class FrmPkRegionPicker
    {
        private System.ComponentModel.IContainer components = null;

        // ── Branding ──────────────────────────────────────────────────────────
        private Panel pnlHeader;
        private PictureBox pbLogo;
        private Label lblTitulo;
        private Label lblSubtitulo;
        private Panel pnlFooter;
        private Label lblCopyright;

        // ── Contenedor principal ──────────────────────────────────────────────
        private TabControl tabControl;
        private TabPage tabIndividual;
        private TabPage tabMasivo;

        // ── Tab Individual ────────────────────────────────────────────────────
        private Label lblPasoInd;
        private Button btnSeleccionarInd;
        private TextBox txtNombreInd;
        private Button btnGuardarInd;
        private Button btnCerrarInd;

        // ── Tab Masivo ────────────────────────────────────────────────────────
        private Label lblPasoMasivo;
        private Button btnSeleccionarMasivo;
        private Label lblInfoMasivo;
        private DataGridView dgvMasivo;
        private Button btnConfirmarMasivo;
        private Button btnCancelarMasivo;
        private Label lblPasoMuestreo;
        private TextBox txtPasoMuestreo;
        private Label lblPasoMuestreoM;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null)) components.Dispose();
            base.Dispose(disposing);
        }

        private void InitializeComponent()
        {
            pnlHeader = new Panel();
            pbLogo = new PictureBox();
            lblTitulo = new Label();
            lblSubtitulo = new Label();
            pnlFooter = new Panel();
            lblCopyright = new Label();
            tabControl = new TabControl();
            tabIndividual = new TabPage();
            lblPasoInd = new Label();
            btnSeleccionarInd = new Button();
            txtNombreInd = new TextBox();
            btnGuardarInd = new Button();
            btnCerrarInd = new Button();
            tabMasivo = new TabPage();
            lblPasoMasivo = new Label();
            btnSeleccionarMasivo = new Button();
            lblInfoMasivo = new Label();
            dgvMasivo = new DataGridView();
            btnConfirmarMasivo = new Button();
            btnCancelarMasivo = new Button();
            lblPasoMuestreo = new Label();
            txtPasoMuestreo = new TextBox();
            lblPasoMuestreoM = new Label();
            pnlHeader.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)pbLogo).BeginInit();
            pnlFooter.SuspendLayout();
            tabControl.SuspendLayout();
            tabIndividual.SuspendLayout();
            tabMasivo.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)dgvMasivo).BeginInit();
            SuspendLayout();
            // 
            // pnlHeader
            // 
            pnlHeader.BackColor = Color.FromArgb(188, 235, 240);
            pnlHeader.Controls.Add(pbLogo);
            pnlHeader.Controls.Add(lblTitulo);
            pnlHeader.Controls.Add(lblSubtitulo);
            pnlHeader.Dock = DockStyle.Top;
            pnlHeader.Location = new Point(0, 0);
            pnlHeader.Name = "pnlHeader";
            pnlHeader.Size = new Size(620, 72);
            pnlHeader.TabIndex = 0;
            // 
            // pbLogo
            // 
            pbLogo.BackColor = Color.White;
            pbLogo.BackgroundImage = Properties.Resources.SicoeCAD_;
            pbLogo.BackgroundImageLayout = ImageLayout.Stretch;
            pbLogo.Location = new Point(10, 8);
            pbLogo.Name = "pbLogo";
            pbLogo.Size = new Size(146, 56);
            pbLogo.SizeMode = PictureBoxSizeMode.Zoom;
            pbLogo.TabIndex = 0;
            pbLogo.TabStop = false;
            // 
            // lblTitulo
            // 
            lblTitulo.AutoSize = true;
            lblTitulo.Font = new Font("Segoe UI", 13F, FontStyle.Bold);
            lblTitulo.ForeColor = Color.Black;
            lblTitulo.Location = new Point(273, 10);
            lblTitulo.Name = "lblTitulo";
            lblTitulo.Size = new Size(289, 30);
            lblTitulo.TabIndex = 1;
            lblTitulo.Text = "Gestión de Regiones PK_ID";
            // 
            // lblSubtitulo
            // 
            lblSubtitulo.AutoSize = true;
            lblSubtitulo.Font = new Font("Segoe UI", 9F);
            lblSubtitulo.ForeColor = SystemColors.ControlText;
            lblSubtitulo.Location = new Point(244, 41);
            lblSubtitulo.Name = "lblSubtitulo";
            lblSubtitulo.Size = new Size(360, 20);
            lblSubtitulo.TabIndex = 2;
            lblSubtitulo.Text = "Asignación individual o masiva de polígonos a PK_ID";
            // 
            // pnlFooter
            // 
            pnlFooter.BackColor = Color.FromArgb(200, 220, 245);
            pnlFooter.Controls.Add(lblCopyright);
            pnlFooter.Dock = DockStyle.Bottom;
            pnlFooter.Location = new Point(0, 564);
            pnlFooter.Name = "pnlFooter";
            pnlFooter.Size = new Size(620, 26);
            pnlFooter.TabIndex = 1;
            // 
            // lblCopyright
            // 
            lblCopyright.Dock = DockStyle.Fill;
            lblCopyright.Font = new Font("Segoe UI", 8F);
            lblCopyright.ForeColor = Color.FromArgb(10, 33, 64);
            lblCopyright.Location = new Point(0, 0);
            lblCopyright.Name = "lblCopyright";
            lblCopyright.Size = new Size(620, 26);
            lblCopyright.TabIndex = 0;
            lblCopyright.Text = "© 2025 SicoeCAD  —  Todos los derechos reservados.";
            lblCopyright.TextAlign = ContentAlignment.MiddleCenter;
            // 
            // tabControl
            // 
            tabControl.Controls.Add(tabIndividual);
            tabControl.Controls.Add(tabMasivo);
            tabControl.Dock = DockStyle.Fill;
            tabControl.Font = new Font("Segoe UI", 9F);
            tabControl.Location = new Point(0, 72);
            tabControl.Name = "tabControl";
            tabControl.SelectedIndex = 0;
            tabControl.Size = new Size(620, 492);
            tabControl.TabIndex = 2;
            // 
            // tabIndividual
            // 
            tabIndividual.BackColor = Color.FromArgb(240, 247, 255);
            tabIndividual.Controls.Add(lblPasoInd);
            tabIndividual.Controls.Add(btnSeleccionarInd);
            tabIndividual.Controls.Add(txtNombreInd);
            tabIndividual.Controls.Add(btnGuardarInd);
            tabIndividual.Controls.Add(btnCerrarInd);
            tabIndividual.Location = new Point(4, 29);
            tabIndividual.Name = "tabIndividual";
            tabIndividual.Padding = new Padding(10);
            tabIndividual.Size = new Size(612, 459);
            tabIndividual.TabIndex = 0;
            tabIndividual.Text = "Individual";
            // 
            // lblPasoInd
            // 
            lblPasoInd.Font = new Font("Segoe UI", 9F);
            lblPasoInd.ForeColor = Color.FromArgb(10, 33, 64);
            lblPasoInd.Location = new Point(12, 16);
            lblPasoInd.Name = "lblPasoInd";
            lblPasoInd.Size = new Size(500, 36);
            lblPasoInd.TabIndex = 0;
            lblPasoInd.Text = "1) Haga clic en el botón de selección y elija un polígono en AutoCAD.\r\n2) Escriba o seleccione el PK_ID correspondiente y pulse Guardar.";
            // 
            // btnSeleccionarInd
            // 
            btnSeleccionarInd.BackColor = Color.FromArgb(224, 224, 224);
            btnSeleccionarInd.BackgroundImageLayout = ImageLayout.Stretch;
            btnSeleccionarInd.FlatStyle = FlatStyle.Flat;
            btnSeleccionarInd.Location = new Point(530, 12);
            btnSeleccionarInd.Name = "btnSeleccionarInd";
            btnSeleccionarInd.Size = new Size(60, 40);
            btnSeleccionarInd.TabIndex = 0;
            btnSeleccionarInd.Text = "Sel.";
            btnSeleccionarInd.UseVisualStyleBackColor = false;
            // 
            // txtNombreInd
            // 
            txtNombreInd.Enabled = false;
            txtNombreInd.Font = new Font("Segoe UI", 10F);
            txtNombreInd.Location = new Point(12, 62);
            txtNombreInd.Name = "txtNombreInd";
            txtNombreInd.Size = new Size(578, 30);
            txtNombreInd.TabIndex = 1;
            // 
            // btnGuardarInd
            // 
            btnGuardarInd.BackColor = Color.FromArgb(188, 235, 240);
            btnGuardarInd.Enabled = false;
            btnGuardarInd.FlatStyle = FlatStyle.Flat;
            btnGuardarInd.ForeColor = Color.Black;
            btnGuardarInd.Location = new Point(12, 100);
            btnGuardarInd.Name = "btnGuardarInd";
            btnGuardarInd.Size = new Size(120, 32);
            btnGuardarInd.TabIndex = 2;
            btnGuardarInd.Text = "Guardar";
            btnGuardarInd.UseVisualStyleBackColor = false;
            // 
            // btnCerrarInd
            // 
            btnCerrarInd.DialogResult = DialogResult.Cancel;
            btnCerrarInd.FlatStyle = FlatStyle.Flat;
            btnCerrarInd.Location = new Point(470, 100);
            btnCerrarInd.Name = "btnCerrarInd";
            btnCerrarInd.Size = new Size(120, 32);
            btnCerrarInd.TabIndex = 3;
            btnCerrarInd.Text = "Cerrar";
            // 
            // tabMasivo
            // 
            tabMasivo.BackColor = Color.FromArgb(240, 247, 255);
            tabMasivo.Controls.Add(lblPasoMasivo);
            tabMasivo.Controls.Add(btnSeleccionarMasivo);
            tabMasivo.Controls.Add(lblInfoMasivo);
            tabMasivo.Controls.Add(lblPasoMuestreo);
            tabMasivo.Controls.Add(txtPasoMuestreo);
            tabMasivo.Controls.Add(lblPasoMuestreoM);
            tabMasivo.Controls.Add(dgvMasivo);
            tabMasivo.Controls.Add(btnConfirmarMasivo);
            tabMasivo.Controls.Add(btnCancelarMasivo);
            tabMasivo.Location = new Point(4, 29);
            tabMasivo.Name = "tabMasivo";
            tabMasivo.Padding = new Padding(10);
            tabMasivo.Size = new Size(612, 459);
            tabMasivo.TabIndex = 1;
            tabMasivo.Text = "Masivo";
            // 
            // lblPasoMasivo
            // 
            lblPasoMasivo.Font = new Font("Segoe UI", 9F);
            lblPasoMasivo.ForeColor = Color.FromArgb(10, 33, 64);
            lblPasoMasivo.Location = new Point(12, 12);
            lblPasoMasivo.Name = "lblPasoMasivo";
            lblPasoMasivo.Size = new Size(453, 36);
            lblPasoMasivo.TabIndex = 0;
            lblPasoMasivo.Text = "1) Pulse \"Seleccionar polígonos\" y seleccione todos en AutoCAD.\r\n2) Asigne el PK_ID a cada fila en la tabla. 3) Pulse Confirmar.";
            // 
            // btnSeleccionarMasivo
            // 
            btnSeleccionarMasivo.BackColor = Color.FromArgb(188, 235, 240);
            btnSeleccionarMasivo.FlatStyle = FlatStyle.Flat;
            btnSeleccionarMasivo.ForeColor = Color.Black;
            btnSeleccionarMasivo.Location = new Point(471, 12);
            btnSeleccionarMasivo.Name = "btnSeleccionarMasivo";
            btnSeleccionarMasivo.Size = new Size(119, 36);
            btnSeleccionarMasivo.TabIndex = 0;
            btnSeleccionarMasivo.Text = "Seleccionar";
            btnSeleccionarMasivo.UseVisualStyleBackColor = false;
            // 
            // lblInfoMasivo
            // 
            lblInfoMasivo.BackColor = Color.White;
            lblInfoMasivo.BorderStyle = BorderStyle.FixedSingle;
            lblInfoMasivo.Font = new Font("Segoe UI", 9F);
            lblInfoMasivo.ForeColor = Color.FromArgb(26, 74, 140);
            lblInfoMasivo.Location = new Point(12, 82);
            lblInfoMasivo.Name = "lblInfoMasivo";
            lblInfoMasivo.Size = new Size(578, 22);
            lblInfoMasivo.TabIndex = 1;
            lblInfoMasivo.Text = "Sin selección activa.";
            lblInfoMasivo.TextAlign = ContentAlignment.MiddleLeft;
            // lblPasoMuestreo
            lblPasoMuestreo.AutoSize = true;
            lblPasoMuestreo.Font = new Font("Segoe UI", 9F);
            lblPasoMuestreo.ForeColor = Color.FromArgb(10, 33, 64);
            lblPasoMuestreo.Location = new Point(12, 54);
            lblPasoMuestreo.Name = "lblPasoMuestreo";
            lblPasoMuestreo.Text = "Paso de muestreo de curvas:";
            // txtPasoMuestreo
            txtPasoMuestreo.Location = new Point(210, 51);
            txtPasoMuestreo.Name = "txtPasoMuestreo";
            txtPasoMuestreo.Size = new Size(50, 22);
            txtPasoMuestreo.Text = "0.5";
            // lblPasoMuestreoM
            lblPasoMuestreoM.AutoSize = true;
            lblPasoMuestreoM.Location = new Point(266, 54);
            lblPasoMuestreoM.Name = "lblPasoMuestreoM";
            lblPasoMuestreoM.Text = "m  (0.5 = más preciso / 2.0 = más liviano)";
            // 
            // dgvMasivo
            // 
            dgvMasivo.AllowUserToAddRows = false;
            dgvMasivo.AllowUserToDeleteRows = false;
            dgvMasivo.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
            dgvMasivo.BackgroundColor = Color.White;
            dgvMasivo.ColumnHeadersHeight = 28;
            dgvMasivo.Location = new Point(12, 110);
            dgvMasivo.Name = "dgvMasivo";
            dgvMasivo.RowHeadersWidth = 40;
            dgvMasivo.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
            dgvMasivo.Size = new Size(578, 292);
            dgvMasivo.TabIndex = 1;
            // 
            // btnConfirmarMasivo
            // 
            btnConfirmarMasivo.BackColor = Color.FromArgb(188, 235, 240);
            btnConfirmarMasivo.Enabled = false;
            btnConfirmarMasivo.FlatStyle = FlatStyle.Flat;
            btnConfirmarMasivo.ForeColor = Color.Black;
            btnConfirmarMasivo.Location = new Point(12, 412);
            btnConfirmarMasivo.Name = "btnConfirmarMasivo";
            btnConfirmarMasivo.Size = new Size(130, 32);
            btnConfirmarMasivo.TabIndex = 2;
            btnConfirmarMasivo.Text = "Confirmar todo";
            btnConfirmarMasivo.UseVisualStyleBackColor = false;
            // 
            // btnCancelarMasivo
            // 
            btnCancelarMasivo.Enabled = false;
            btnCancelarMasivo.FlatStyle = FlatStyle.Flat;
            btnCancelarMasivo.Location = new Point(443, 412);
            btnCancelarMasivo.Name = "btnCancelarMasivo";
            btnCancelarMasivo.Size = new Size(147, 32);
            btnCancelarMasivo.TabIndex = 3;
            btnCancelarMasivo.Text = "Cancelar y limpiar";
            // 
            // FrmPkRegionPicker
            // 
            AcceptButton = btnGuardarInd;
            BackColor = Color.FromArgb(240, 247, 255);
            ClientSize = new Size(620, 590);
            Controls.Add(tabControl);
            Controls.Add(pnlHeader);
            Controls.Add(pnlFooter);
            Font = new Font("Segoe UI", 9F);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            Name = "FrmPkRegionPicker";
            StartPosition = FormStartPosition.CenterParent;
            Text = "SicoeCAD — Gestión de Regiones PK_ID";
            pnlHeader.ResumeLayout(false);
            pnlHeader.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)pbLogo).EndInit();
            pnlFooter.ResumeLayout(false);
            tabControl.ResumeLayout(false);
            tabIndividual.ResumeLayout(false);
            tabIndividual.PerformLayout();
            tabMasivo.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)dgvMasivo).EndInit();
            ResumeLayout(false);
        }
    }
}