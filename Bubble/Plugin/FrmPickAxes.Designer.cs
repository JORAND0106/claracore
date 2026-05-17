using System.Drawing;
using System.Windows.Forms;

namespace SicoePresupuestoNET8
{
    partial class FrmPickAxes
    {
        private System.ComponentModel.IContainer components = null;

        // Branding
        private Panel pnlHeader;
        private PictureBox pbLogo;
        private Label lblTitulo;
        private Label lblContexto;
        private Panel pnlFooter;
        private Label lblCopyright;

        // Controles Funcionales
        private GroupBox gbA, gbB;
        private Label lblA, lblPkA, lblB, lblPkB, lblTip;
        private Button btnSelA, btnPkA, btnSelB, btnPkB, btnInvertir, btnLimpiar, btnOk, btnCancel;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null)) components.Dispose();
            base.Dispose(disposing);
        }

        private void InitializeComponent()
        {
            this.pnlHeader = new Panel();
            this.pbLogo = new PictureBox();
            this.lblTitulo = new Label();
            this.lblContexto = new Label();
            this.pnlFooter = new Panel();
            this.lblCopyright = new Label();

            this.lblTip = new Label();
            this.gbA = new GroupBox();
            this.btnSelA = new Button();
            this.btnPkA = new Button();
            this.lblA = new Label();
            this.lblPkA = new Label();
            this.gbB = new GroupBox();
            this.btnSelB = new Button();
            this.btnPkB = new Button();
            this.lblB = new Label();
            this.lblPkB = new Label();
            this.btnInvertir = new Button();
            this.btnLimpiar = new Button();
            this.btnOk = new Button();
            this.btnCancel = new Button();

            this.pnlHeader.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.pbLogo)).BeginInit();
            this.gbA.SuspendLayout();
            this.gbB.SuspendLayout();
            this.pnlFooter.SuspendLayout();
            this.SuspendLayout();

            // --- Header ---
            this.pnlHeader.BackColor = Color.FromArgb(0, 79, 152);
            this.pnlHeader.Controls.Add(this.pbLogo);
            this.pnlHeader.Controls.Add(this.lblTitulo);
            this.pnlHeader.Controls.Add(this.lblContexto);
            this.pnlHeader.Dock = DockStyle.Top;
            this.pnlHeader.Size = new Size(520, 60);

            this.pbLogo.Location = new Point(10, 5);
            this.pbLogo.Size = new Size(50, 50);
            this.pbLogo.SizeMode = PictureBoxSizeMode.Zoom;

            this.lblTitulo.AutoSize = true;
            this.lblTitulo.ForeColor = Color.White;
            this.lblTitulo.Font = new Font("Segoe UI", 12F, FontStyle.Bold);
            this.lblTitulo.Location = new Point(70, 8);
            this.lblTitulo.Text = "Asistente de Selección de Ejes";

            this.lblContexto.AutoSize = true;
            this.lblContexto.ForeColor = Color.White;
            this.lblContexto.Location = new Point(70, 35);
            this.lblContexto.Text = "Seleccione la polilínea del eje y el punto cero (PK0).";

            // --- Tip ---
            this.lblTip.Location = new Point(12, 70);
            this.lblTip.Size = new Size(500, 40);
            this.lblTip.Text = "Instrucciones...";

            // --- GroupBox A ---
            this.gbA.Location = new Point(12, 120); // Posición base, se ajustará en lógica
            this.gbA.Size = new Size(496, 70);
            this.gbA.Text = "Calzada A";

            this.btnSelA.Location = new Point(10, 25);
            this.btnSelA.Size = new Size(130, 28);
            this.btnSelA.Text = "Seleccionar Eje A";

            this.btnPkA.Location = new Point(150, 25);
            this.btnPkA.Size = new Size(100, 28);
            this.btnPkA.Text = "Tomar PK0";
            this.btnPkA.Enabled = false;

            this.lblA.Location = new Point(260, 20);
            this.lblA.AutoSize = true;
            this.lblA.ForeColor = Color.DarkRed;
            this.lblA.Text = "Eje: Sin definir";

            this.lblPkA.Location = new Point(260, 40);
            this.lblPkA.AutoSize = true;
            this.lblPkA.ForeColor = Color.DarkRed;
            this.lblPkA.Text = "PK0: Sin definir";

            this.gbA.Controls.AddRange(new Control[] { btnSelA, btnPkA, lblA, lblPkA });

            // --- GroupBox B ---
            this.gbB.Location = new Point(12, 195);
            this.gbB.Size = new Size(496, 70);
            this.gbB.Text = "Calzada B";
            this.gbB.Visible = false;

            this.btnSelB.Location = new Point(10, 25);
            this.btnSelB.Size = new Size(130, 28);
            this.btnSelB.Text = "Seleccionar Eje B";

            this.btnPkB.Location = new Point(150, 25);
            this.btnPkB.Size = new Size(100, 28);
            this.btnPkB.Text = "Tomar PK0";
            this.btnPkB.Enabled = false;

            this.lblB.Location = new Point(260, 20);
            this.lblB.AutoSize = true;
            this.lblB.ForeColor = Color.DarkRed;
            this.lblB.Text = "Eje: Sin definir";

            this.lblPkB.Location = new Point(260, 40);
            this.lblPkB.AutoSize = true;
            this.lblPkB.ForeColor = Color.DarkRed;
            this.lblPkB.Text = "PK0: Sin definir";

            this.gbB.Controls.AddRange(new Control[] { btnSelB, btnPkB, lblB, lblPkB });

            // --- Botones Inferiores ---
            this.btnInvertir.Location = new Point(12, 280);
            this.btnInvertir.Size = new Size(90, 30);
            this.btnInvertir.Text = "Invertir A/B";
            this.btnInvertir.Enabled = false;

            this.btnLimpiar.Location = new Point(110, 280);
            this.btnLimpiar.Size = new Size(80, 30);
            this.btnLimpiar.Text = "Limpiar";

            this.btnOk.Location = new Point(320, 280);
            this.btnOk.Size = new Size(90, 30);
            this.btnOk.Text = "Aceptar";
            this.btnOk.DialogResult = DialogResult.OK;
            this.btnOk.Enabled = false;
            this.btnOk.BackColor = Color.FromArgb(0, 79, 152);
            this.btnOk.ForeColor = Color.White;

            this.btnCancel.Location = new Point(418, 280);
            this.btnCancel.Size = new Size(90, 30);
            this.btnCancel.Text = "Cancelar";
            this.btnCancel.DialogResult = DialogResult.Cancel;

            // --- Footer ---
            this.pnlFooter.BackColor = Color.FromArgb(220, 223, 230);
            this.pnlFooter.Controls.Add(this.lblCopyright);
            this.pnlFooter.Dock = DockStyle.Bottom;
            this.pnlFooter.Size = new Size(520, 30);

            this.lblCopyright.Dock = DockStyle.Fill;
            this.lblCopyright.TextAlign = ContentAlignment.MiddleCenter;
            this.lblCopyright.Text = "© 2025 SicoeCAD. Todos los derechos reservados.";

            // --- Form ---
            this.ClientSize = new Size(520, 350);
            this.Controls.Add(pnlHeader);
            this.Controls.Add(pnlFooter);
            this.Controls.Add(lblTip);
            this.Controls.Add(gbA);
            this.Controls.Add(gbB);
            this.Controls.Add(btnInvertir);
            this.Controls.Add(btnLimpiar);
            this.Controls.Add(btnOk);
            this.Controls.Add(btnCancel);

            this.StartPosition = FormStartPosition.CenterParent;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.Text = "Selección de Ejes";

            this.pnlHeader.ResumeLayout(false);
            this.pnlHeader.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)(this.pbLogo)).EndInit();
            this.gbA.ResumeLayout(false);
            this.gbA.PerformLayout();
            this.gbB.ResumeLayout(false);
            this.gbB.PerformLayout();
            this.pnlFooter.ResumeLayout(false);
            this.ResumeLayout(false);
        }
    }
}