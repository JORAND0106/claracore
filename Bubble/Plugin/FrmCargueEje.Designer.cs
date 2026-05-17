using System.Drawing;
using System.Windows.Forms;

namespace SicoePresupuestoNET8
{
    partial class FrmCargueEje
    {
        private System.ComponentModel.IContainer components = null;

        // Branding
        private Panel pnlHeader;
        private PictureBox pbLogo;
        private Label lblTitulo;
        private Panel pnlFooter;
        private Label lblCopyright;

        // UI Principal
        private DataGridView dgvEjes;
        private Button btnAgregar;
        private Button btnEliminar;
        private Button btnCerrar;

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
            pnlFooter = new Panel();
            lblCopyright = new Label();
            dgvEjes = new DataGridView();
            btnAgregar = new Button();
            btnEliminar = new Button();
            btnCerrar = new Button();
            pnlHeader.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)pbLogo).BeginInit();
            pnlFooter.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)dgvEjes).BeginInit();
            SuspendLayout();
            // 
            // pnlHeader
            // 
            pnlHeader.BackColor = SystemColors.ActiveBorder;
            pnlHeader.Controls.Add(pbLogo);
            pnlHeader.Controls.Add(lblTitulo);
            pnlHeader.Dock = DockStyle.Top;
            pnlHeader.Location = new Point(0, 0);
            pnlHeader.Name = "pnlHeader";
            pnlHeader.Size = new Size(599, 60);
            pnlHeader.TabIndex = 0;
            // 
            // pbLogo
            // 
            pbLogo.BackgroundImage = Properties.Resources.SicoeCAD1;
            pbLogo.BackgroundImageLayout = ImageLayout.Stretch;
            pbLogo.Location = new Point(10, 5);
            pbLogo.Name = "pbLogo";
            pbLogo.Size = new Size(122, 50);
            pbLogo.SizeMode = PictureBoxSizeMode.Zoom;
            pbLogo.TabIndex = 0;
            pbLogo.TabStop = false;
            // 
            // lblTitulo
            // 
            lblTitulo.AutoSize = true;
            lblTitulo.Font = new Font("Segoe UI", 12F, FontStyle.Bold);
            lblTitulo.ForeColor = Color.White;
            lblTitulo.Location = new Point(186, 9);
            lblTitulo.Name = "lblTitulo";
            lblTitulo.Size = new Size(317, 28);
            lblTitulo.TabIndex = 1;
            lblTitulo.Text = "Administrador de Ejes SicoeCAD";
            // 
            // pnlFooter
            // 
            pnlFooter.BackColor = Color.FromArgb(220, 223, 230);
            pnlFooter.Controls.Add(lblCopyright);
            pnlFooter.Dock = DockStyle.Bottom;
            pnlFooter.Location = new Point(0, 370);
            pnlFooter.Name = "pnlFooter";
            pnlFooter.Size = new Size(599, 30);
            pnlFooter.TabIndex = 1;
            // 
            // lblCopyright
            // 
            lblCopyright.Dock = DockStyle.Fill;
            lblCopyright.Location = new Point(0, 0);
            lblCopyright.Name = "lblCopyright";
            lblCopyright.Size = new Size(599, 30);
            lblCopyright.TabIndex = 0;
            lblCopyright.Text = "© 2025 SicoeCAD. Todos los derechos reservados.";
            lblCopyright.TextAlign = ContentAlignment.MiddleCenter;
            // 
            // dgvEjes
            // 
            dgvEjes.AllowUserToAddRows = false;
            dgvEjes.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
            dgvEjes.ColumnHeadersHeight = 29;
            dgvEjes.Location = new Point(12, 70);
            dgvEjes.Name = "dgvEjes";
            dgvEjes.ReadOnly = true;
            dgvEjes.RowHeadersWidth = 51;
            dgvEjes.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
            dgvEjes.Size = new Size(576, 250);
            dgvEjes.TabIndex = 2;
            // 
            // btnAgregar
            // 
            btnAgregar.BackColor = Color.FromArgb(0, 79, 152);
            btnAgregar.ForeColor = Color.White;
            btnAgregar.Location = new Point(12, 330);
            btnAgregar.Name = "btnAgregar";
            btnAgregar.Size = new Size(120, 35);
            btnAgregar.TabIndex = 3;
            btnAgregar.Text = "Agregar Eje";
            btnAgregar.UseVisualStyleBackColor = false;
            // 
            // btnEliminar
            // 
            btnEliminar.BackColor = Color.PaleTurquoise;
            btnEliminar.Location = new Point(140, 330);
            btnEliminar.Name = "btnEliminar";
            btnEliminar.Size = new Size(100, 35);
            btnEliminar.TabIndex = 4;
            btnEliminar.Text = "Eliminar";
            btnEliminar.UseVisualStyleBackColor = false;
            // 
            // btnCerrar
            // 
            btnCerrar.BackColor = Color.PaleTurquoise;
            btnCerrar.DialogResult = DialogResult.OK;
            btnCerrar.Location = new Point(488, 330);
            btnCerrar.Name = "btnCerrar";
            btnCerrar.Size = new Size(100, 35);
            btnCerrar.TabIndex = 5;
            btnCerrar.Text = "Cerrar";
            btnCerrar.UseVisualStyleBackColor = false;
            // 
            // FrmCargueEje
            // 
            BackColor = Color.FromArgb(229, 247, 248);
            ClientSize = new Size(599, 400);
            Controls.Add(pnlHeader);
            Controls.Add(pnlFooter);
            Controls.Add(dgvEjes);
            Controls.Add(btnAgregar);
            Controls.Add(btnEliminar);
            Controls.Add(btnCerrar);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            Name = "FrmCargueEje";
            StartPosition = FormStartPosition.CenterParent;
            Text = "Gestión de Ejes";
            pnlHeader.ResumeLayout(false);
            pnlHeader.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)pbLogo).EndInit();
            pnlFooter.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)dgvEjes).EndInit();
            ResumeLayout(false);
        }
    }
}