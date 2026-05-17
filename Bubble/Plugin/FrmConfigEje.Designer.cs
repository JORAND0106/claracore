using System.Drawing;
using System.Windows.Forms;

namespace SicoePresupuestoNET8
{
    partial class FrmConfigEje
    {
        private System.ComponentModel.IContainer components = null;

        // Branding
        private Panel pnlHeader;
        private PictureBox pbLogo;
        private Label lblTitulo;
        private Label lblContexto;
        private Panel pnlFooter;
        private Label lblCopyright;

        // Controles
        private GroupBox gbTipo;
        private RadioButton rbUnica;
        private RadioButton rbDoble;

        private GroupBox gbOrient;
        private RadioButton rbNS;
        private RadioButton rbEO;

        private Label lblIntervalo;
        private TextBox txtIntervalo;
        private Label lblMetros;

        // --- NUEVOS CONTROLES PARA ORDENADAS ---
        private GroupBox gbOrdenadas;
        private Label lblTitA;
        private Label lblIzqA, lblDerA;
        private TextBox txtIzqA, txtDerA;

        private Label lblTitB; // Visible solo en doble
        private Label lblIzqB, lblDerB;
        private TextBox txtIzqB, txtDerB;
        // ---------------------------------------

        private Label lblAbsInicioA, lblAbsInicioB;
        private TextBox txtAbsInicioA, txtAbsInicioB;
        private Button btnContinuar;
        private Button btnCancelar;

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
            lblContexto = new Label();
            pnlFooter = new Panel();
            lblCopyright = new Label();
            gbTipo = new GroupBox();
            rbUnica = new RadioButton();
            rbDoble = new RadioButton();
            gbOrient = new GroupBox();
            rbEO = new RadioButton();
            rbNS = new RadioButton();
            lblIntervalo = new Label();
            txtIntervalo = new TextBox();
            lblMetros = new Label();
            gbOrdenadas = new GroupBox();
            lblTitA = new Label();
            lblIzqA = new Label();
            txtIzqA = new TextBox();
            lblDerA = new Label();
            txtDerA = new TextBox();
            lblTitB = new Label();
            lblIzqB = new Label();
            txtIzqB = new TextBox();
            lblDerB = new Label();
            txtDerB = new TextBox();
            lblAbsInicioA = new Label();
            txtAbsInicioA = new TextBox();
            lblAbsInicioB = new Label();
            txtAbsInicioB = new TextBox();
            btnContinuar = new Button();
            btnCancelar = new Button();
            pnlHeader.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)pbLogo).BeginInit();
            pnlFooter.SuspendLayout();
            gbTipo.SuspendLayout();
            gbOrient.SuspendLayout();
            gbOrdenadas.SuspendLayout();
            SuspendLayout();
            // 
            // pnlHeader
            // 
            pnlHeader.BackColor = SystemColors.ActiveBorder;
            pnlHeader.Controls.Add(pbLogo);
            pnlHeader.Controls.Add(lblTitulo);
            pnlHeader.Controls.Add(lblContexto);
            pnlHeader.Dock = DockStyle.Top;
            pnlHeader.Location = new Point(0, 0);
            pnlHeader.Name = "pnlHeader";
            pnlHeader.Size = new Size(458, 60);
            pnlHeader.TabIndex = 0;
            // 
            // pbLogo
            // 
            pbLogo.BackgroundImage = Properties.Resources.SicoeCAD1;
            pbLogo.BackgroundImageLayout = ImageLayout.Stretch;
            pbLogo.Location = new Point(10, 5);
            pbLogo.Name = "pbLogo";
            pbLogo.Size = new Size(128, 50);
            pbLogo.SizeMode = PictureBoxSizeMode.Zoom;
            pbLogo.TabIndex = 0;
            pbLogo.TabStop = false;
            // 
            // lblTitulo
            // 
            lblTitulo.AutoSize = true;
            lblTitulo.Font = new Font("Segoe UI", 12F, FontStyle.Bold);
            lblTitulo.ForeColor = Color.White;
            lblTitulo.Location = new Point(179, 5);
            lblTitulo.Name = "lblTitulo";
            lblTitulo.Size = new Size(214, 28);
            lblTitulo.TabIndex = 1;
            lblTitulo.Text = "Configuración del Eje";
            // 
            // lblContexto
            // 
            lblContexto.AutoSize = true;
            lblContexto.ForeColor = Color.White;
            lblContexto.Location = new Point(153, 35);
            lblContexto.Name = "lblContexto";
            lblContexto.Size = new Size(274, 20);
            lblContexto.TabIndex = 2;
            lblContexto.Text = "Defina tipo, orientación y anchos de vía.";
            // 
            // pnlFooter
            // 
            pnlFooter.BackColor = Color.FromArgb(220, 223, 230);
            pnlFooter.Controls.Add(lblCopyright);
            pnlFooter.Dock = DockStyle.Bottom;
            pnlFooter.Location = new Point(0, 479);
            pnlFooter.Name = "pnlFooter";
            pnlFooter.Size = new Size(458, 30);
            pnlFooter.TabIndex = 1;
            // 
            // lblCopyright
            // 
            lblCopyright.Dock = DockStyle.Fill;
            lblCopyright.Location = new Point(0, 0);
            lblCopyright.Name = "lblCopyright";
            lblCopyright.Size = new Size(458, 30);
            lblCopyright.TabIndex = 0;
            lblCopyright.Text = "© 2025 SicoeCAD. Todos los derechos reservados.";
            lblCopyright.TextAlign = ContentAlignment.MiddleCenter;
            // 
            // gbTipo
            // 
            gbTipo.BackColor = Color.White;
            gbTipo.Controls.Add(rbUnica);
            gbTipo.Controls.Add(rbDoble);
            gbTipo.Location = new Point(12, 66);
            gbTipo.Name = "gbTipo";
            gbTipo.Size = new Size(428, 60);
            gbTipo.TabIndex = 2;
            gbTipo.TabStop = false;
            gbTipo.Text = "Tipo de Vía";
            // 
            // rbUnica
            // 
            rbUnica.AutoSize = true;
            rbUnica.Checked = true;
            rbUnica.Location = new Point(20, 25);
            rbUnica.Name = "rbUnica";
            rbUnica.Size = new Size(124, 24);
            rbUnica.TabIndex = 0;
            rbUnica.TabStop = true;
            rbUnica.Text = "Calzada Única";
            // 
            // rbDoble
            // 
            rbDoble.AutoSize = true;
            rbDoble.Location = new Point(263, 25);
            rbDoble.Name = "rbDoble";
            rbDoble.Size = new Size(128, 24);
            rbDoble.TabIndex = 1;
            rbDoble.Text = "Doble Calzada";
            // 
            // gbOrient
            // 
            gbOrient.BackColor = Color.White;
            gbOrient.Controls.Add(rbEO);
            gbOrient.Controls.Add(rbNS);
            gbOrient.Enabled = false;
            gbOrient.Location = new Point(12, 132);
            gbOrient.Name = "gbOrient";
            gbOrient.Size = new Size(428, 60);
            gbOrient.TabIndex = 3;
            gbOrient.TabStop = false;
            gbOrient.Text = "Orientación (Doble Calzada)";
            // 
            // rbEO
            // 
            rbEO.AutoSize = true;
            rbEO.Checked = true;
            rbEO.Location = new Point(20, 25);
            rbEO.Name = "rbEO";
            rbEO.Size = new Size(160, 24);
            rbEO.TabIndex = 0;
            rbEO.TabStop = true;
            rbEO.Text = "Oriente - Occidente";
            // 
            // rbNS
            // 
            rbNS.AutoSize = true;
            rbNS.Location = new Point(278, 25);
            rbNS.Name = "rbNS";
            rbNS.Size = new Size(103, 24);
            rbNS.TabIndex = 1;
            rbNS.Text = "Norte - Sur";
            // 
            // lblIntervalo
            // 
            lblIntervalo.AutoSize = true;
            lblIntervalo.BackColor = Color.White;
            lblIntervalo.Location = new Point(14, 316);
            lblIntervalo.Name = "lblIntervalo";
            lblIntervalo.Size = new Size(163, 20);
            lblIntervalo.TabIndex = 4;
            lblIntervalo.Text = "Intervalo de Abscisado:";
            // 
            // txtIntervalo
            // 
            txtIntervalo.Location = new Point(191, 309);
            txtIntervalo.Name = "txtIntervalo";
            txtIntervalo.Size = new Size(60, 27);
            txtIntervalo.TabIndex = 5;
            txtIntervalo.Text = "10.00";
            // 
            // lblMetros
            // 
            lblMetros.AutoSize = true;
            lblMetros.Location = new Point(257, 312);
            lblMetros.Name = "lblMetros";
            lblMetros.Size = new Size(22, 20);
            lblMetros.TabIndex = 6;
            lblMetros.Text = "m";
            // 
            // gbOrdenadas
            // 
            gbOrdenadas.BackColor = Color.White;
            gbOrdenadas.Controls.Add(lblTitA);
            gbOrdenadas.Controls.Add(lblIzqA);
            gbOrdenadas.Controls.Add(txtIzqA);
            gbOrdenadas.Controls.Add(lblDerA);
            gbOrdenadas.Controls.Add(txtDerA);
            gbOrdenadas.Controls.Add(lblTitB);
            gbOrdenadas.Controls.Add(lblIzqB);
            gbOrdenadas.Controls.Add(txtIzqB);
            gbOrdenadas.Controls.Add(lblDerB);
            gbOrdenadas.Controls.Add(txtDerB);
            gbOrdenadas.Location = new Point(12, 198);
            gbOrdenadas.Name = "gbOrdenadas";
            gbOrdenadas.Size = new Size(428, 100);
            gbOrdenadas.TabIndex = 7;
            gbOrdenadas.TabStop = false;
            gbOrdenadas.Text = "Anchos de Vía / Ordenadas (m)";
            // 
            // lblTitA
            // 
            lblTitA.AutoSize = true;
            lblTitA.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            lblTitA.Location = new Point(10, 25);
            lblTitA.Name = "lblTitA";
            lblTitA.Size = new Size(135, 20);
            lblTitA.TabIndex = 0;
            lblTitA.Text = "Calzada A / Única:";
            // 
            // lblIzqA
            // 
            lblIzqA.AutoSize = true;
            lblIzqA.Location = new Point(188, 25);
            lblIzqA.Name = "lblIzqA";
            lblIzqA.Size = new Size(32, 20);
            lblIzqA.TabIndex = 1;
            lblIzqA.Text = "Izq:";
            // 
            // txtIzqA
            // 
            txtIzqA.Location = new Point(236, 22);
            txtIzqA.Name = "txtIzqA";
            txtIzqA.Size = new Size(50, 27);
            txtIzqA.TabIndex = 2;
            txtIzqA.Text = "20.00";
            // 
            // lblDerA
            // 
            lblDerA.AutoSize = true;
            lblDerA.Location = new Point(313, 22);
            lblDerA.Name = "lblDerA";
            lblDerA.Size = new Size(36, 20);
            lblDerA.TabIndex = 3;
            lblDerA.Text = "Der:";
            // 
            // txtDerA
            // 
            txtDerA.Location = new Point(355, 22);
            txtDerA.Name = "txtDerA";
            txtDerA.Size = new Size(50, 27);
            txtDerA.TabIndex = 4;
            txtDerA.Text = "20.00";
            // 
            // lblTitB
            // 
            lblTitB.AutoSize = true;
            lblTitB.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            lblTitB.Location = new Point(10, 60);
            lblTitB.Name = "lblTitB";
            lblTitB.Size = new Size(80, 20);
            lblTitB.TabIndex = 5;
            lblTitB.Text = "Calzada B:";
            // 
            // lblIzqB
            // 
            lblIzqB.AutoSize = true;
            lblIzqB.Location = new Point(188, 60);
            lblIzqB.Name = "lblIzqB";
            lblIzqB.Size = new Size(32, 20);
            lblIzqB.TabIndex = 6;
            lblIzqB.Text = "Izq:";
            // 
            // txtIzqB
            // 
            txtIzqB.Location = new Point(236, 57);
            txtIzqB.Name = "txtIzqB";
            txtIzqB.Size = new Size(50, 27);
            txtIzqB.TabIndex = 7;
            txtIzqB.Text = "20.00";
            // 
            // lblDerB
            // 
            lblDerB.AutoSize = true;
            lblDerB.Location = new Point(313, 57);
            lblDerB.Name = "lblDerB";
            lblDerB.Size = new Size(36, 20);
            lblDerB.TabIndex = 8;
            lblDerB.Text = "Der:";
            // 
            // txtDerB
            // 
            txtDerB.Location = new Point(355, 57);
            txtDerB.Name = "txtDerB";
            txtDerB.Size = new Size(50, 27);
            txtDerB.TabIndex = 9;
            txtDerB.Text = "20.00";
            // 
            // lblAbsInicioA
            // 
            lblAbsInicioA.AutoSize = true;
            lblAbsInicioA.Location = new Point(13, 353);
            lblAbsInicioA.Name = "lblAbsInicioA";
            lblAbsInicioA.Size = new Size(143, 20);
            lblAbsInicioA.TabIndex = 8;
            lblAbsInicioA.Text = "Abscisa inicio A (m):";
            // 
            // txtAbsInicioA
            // 
            txtAbsInicioA.Location = new Point(162, 350);
            txtAbsInicioA.Name = "txtAbsInicioA";
            txtAbsInicioA.Size = new Size(123, 27);
            txtAbsInicioA.TabIndex = 9;
            txtAbsInicioA.Text = "0";
            // 
            // lblAbsInicioB
            // 
            lblAbsInicioB.AutoSize = true;
            lblAbsInicioB.Location = new Point(14, 389);
            lblAbsInicioB.Name = "lblAbsInicioB";
            lblAbsInicioB.Size = new Size(142, 20);
            lblAbsInicioB.TabIndex = 10;
            lblAbsInicioB.Text = "Abscisa inicio B (m):";
            lblAbsInicioB.Visible = false;
            // 
            // txtAbsInicioB
            // 
            txtAbsInicioB.Location = new Point(162, 386);
            txtAbsInicioB.Name = "txtAbsInicioB";
            txtAbsInicioB.Size = new Size(123, 27);
            txtAbsInicioB.TabIndex = 11;
            txtAbsInicioB.Text = "0";
            txtAbsInicioB.Visible = false;
            // 
            // btnContinuar
            // 
            btnContinuar.BackColor = Color.FromArgb(0, 79, 152);
            btnContinuar.DialogResult = DialogResult.OK;
            btnContinuar.ForeColor = Color.White;
            btnContinuar.Location = new Point(117, 438);
            btnContinuar.Name = "btnContinuar";
            btnContinuar.Size = new Size(100, 35);
            btnContinuar.TabIndex = 8;
            btnContinuar.Text = "Continuar";
            btnContinuar.UseVisualStyleBackColor = false;
            // 
            // btnCancelar
            // 
            btnCancelar.DialogResult = DialogResult.Cancel;
            btnCancelar.Location = new Point(227, 438);
            btnCancelar.Name = "btnCancelar";
            btnCancelar.Size = new Size(90, 35);
            btnCancelar.TabIndex = 9;
            btnCancelar.Text = "Cancelar";
            // 
            // FrmConfigEje
            // 
            BackColor = Color.FromArgb(242, 247, 255);
            ClientSize = new Size(458, 509);
            Controls.Add(pnlHeader);
            Controls.Add(pnlFooter);
            Controls.Add(gbTipo);
            Controls.Add(gbOrient);
            Controls.Add(lblIntervalo);
            Controls.Add(txtIntervalo);
            Controls.Add(lblMetros);
            Controls.Add(gbOrdenadas);
            Controls.Add(lblAbsInicioA);
            Controls.Add(txtAbsInicioA);
            Controls.Add(lblAbsInicioB);
            Controls.Add(txtAbsInicioB);
            Controls.Add(btnContinuar);
            Controls.Add(btnCancelar);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            Name = "FrmConfigEje";
            StartPosition = FormStartPosition.CenterParent;
            Text = "Configuración del Eje";
            pnlHeader.ResumeLayout(false);
            pnlHeader.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)pbLogo).EndInit();
            pnlFooter.ResumeLayout(false);
            gbTipo.ResumeLayout(false);
            gbTipo.PerformLayout();
            gbOrient.ResumeLayout(false);
            gbOrient.PerformLayout();
            gbOrdenadas.ResumeLayout(false);
            gbOrdenadas.PerformLayout();
            ResumeLayout(false);
            PerformLayout();
        }
    }
}