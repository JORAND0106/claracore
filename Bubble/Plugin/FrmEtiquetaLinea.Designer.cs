using System.Drawing;
using System.Windows.Forms;

namespace SicoePresupuestoNET8
{
    partial class FrmEtiquetaLinea
    {
        private System.ComponentModel.IContainer components = null;

        private Label lblLongCalc;
        private Label lblRumboCalc;

        private CheckBox chkLongitud;
        private CheckBox chkDiametro;
        private CheckBox chkMaterial;
        private CheckBox chkPendiente;
        private CheckBox chkRumbo;
        private CheckBox chkVertices;

        private TextBox txtDiametro;
        private TextBox txtMaterial;
        private TextBox txtPendiente;
        private TextBox txtPrefijo;
        private TextBox txtNumerador;
        private Label lblPen;
        private Label lblPref;
        private Label lblNum;

        private NumericUpDown numAltura;

        private Button btnOK;
        private Button btnCancel;

        /// <summary>
        /// Limpiar los recursos que se estén usando.
        /// </summary>
        /// <param name="disposing">true si los recursos administrados se deben desechar; false en caso contrario.</param>
        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        private void InitializeComponent()
        {
            lblLongCalc = new Label();
            lblRumboCalc = new Label();
            chkLongitud = new CheckBox();
            chkDiametro = new CheckBox();
            chkMaterial = new CheckBox();
            txtMaterial = new TextBox();
            chkPendiente = new CheckBox();
            txtPendiente = new TextBox();
            chkRumbo = new CheckBox();
            chkVertices = new CheckBox();
            txtDiametro = new TextBox();
            lblPref = new Label();
            txtPrefijo = new TextBox();
            lblNum = new Label();
            txtNumerador = new TextBox();
            lblPen = new Label();
            numAltura = new NumericUpDown();
            btnOK = new Button();
            btnCancel = new Button();
            txlyrNodo = new TextBox();
            txNodoIni = new TextBox();
            txNodoFin = new TextBox();
            prefInicio = new TextBox();
            prefFin = new TextBox();
            ((System.ComponentModel.ISupportInitialize)numAltura).BeginInit();
            SuspendLayout();
            // 
            // lblLongCalc
            // 
            lblLongCalc.BackColor = SystemColors.GradientInactiveCaption;
            lblLongCalc.Location = new Point(128, 44);
            lblLongCalc.Name = "lblLongCalc";
            lblLongCalc.Size = new Size(187, 58);
            lblLongCalc.TabIndex = 0;
            // 
            // lblRumboCalc
            // 
            lblRumboCalc.BackColor = SystemColors.GradientInactiveCaption;
            lblRumboCalc.Location = new Point(128, 112);
            lblRumboCalc.Name = "lblRumboCalc";
            lblRumboCalc.Size = new Size(461, 27);
            lblRumboCalc.TabIndex = 1;
            // 
            // chkLongitud
            // 
            chkLongitud.Location = new Point(16, 63);
            chkLongitud.Name = "chkLongitud";
            chkLongitud.Size = new Size(106, 24);
            chkLongitud.TabIndex = 4;
            chkLongitud.Text = "Longitudes";
            // 
            // chkDiametro
            // 
            chkDiametro.Location = new Point(321, 78);
            chkDiametro.Name = "chkDiametro";
            chkDiametro.Size = new Size(117, 24);
            chkDiametro.TabIndex = 7;
            chkDiametro.Text = "Diámetro";
            chkDiametro.CheckedChanged += chkDiametro_CheckedChanged;
            // 
            // chkMaterial
            // 
            chkMaterial.Location = new Point(321, 43);
            chkMaterial.Name = "chkMaterial";
            chkMaterial.Size = new Size(117, 24);
            chkMaterial.TabIndex = 5;
            chkMaterial.Text = "Material";
            chkMaterial.CheckedChanged += chkMaterial_CheckedChanged;
            // 
            // txtMaterial
            // 
            txtMaterial.Enabled = false;
            txtMaterial.Location = new Point(444, 44);
            txtMaterial.Name = "txtMaterial";
            // PlaceholderText no disponible en net48
            txtMaterial.Size = new Size(145, 27);
            txtMaterial.TabIndex = 6;
            // 
            // chkPendiente
            // 
            chkPendiente.Location = new Point(287, 198);
            chkPendiente.Name = "chkPendiente";
            chkPendiente.Size = new Size(140, 24);
            chkPendiente.TabIndex = 12;
            chkPendiente.Text = "Pendiente (m%)";
            chkPendiente.CheckedChanged += chkPendiente_CheckedChanged;
            // 
            // txtPendiente
            // 
            txtPendiente.Enabled = false;
            txtPendiente.Location = new Point(490, 67);
            txtPendiente.Name = "txtPendiente";
            // PlaceholderText no disponible en net48
            txtPendiente.Size = new Size(60, 27);
            txtPendiente.TabIndex = 0;
            // 
            // chkRumbo
            // 
            chkRumbo.Location = new Point(16, 112);
            chkRumbo.Name = "chkRumbo";
            chkRumbo.Size = new Size(106, 24);
            chkRumbo.TabIndex = 9;
            chkRumbo.Text = "Rumbo";
            // 
            // chkVertices
            // 
            chkVertices.Location = new Point(16, 175);
            chkVertices.Name = "chkVertices";
            chkVertices.Size = new Size(140, 24);
            chkVertices.TabIndex = 11;
            chkVertices.Text = "Etiq. Vértices";
            chkVertices.CheckedChanged += chkVertices_CheckedChanged;
            // 
            // txtDiametro
            // 
            txtDiametro.Enabled = false;
            txtDiametro.Location = new Point(444, 76);
            txtDiametro.Name = "txtDiametro";
            // PlaceholderText no disponible en net48
            txtDiametro.Size = new Size(145, 27);
            txtDiametro.TabIndex = 8;
            // 
            // lblPref
            // 
            lblPref.Location = new Point(16, 202);
            lblPref.Name = "lblPref";
            lblPref.Size = new Size(120, 25);
            lblPref.TabIndex = 12;
            lblPref.Text = "Pref vértices:";
            // 
            // txtPrefijo
            // 
            txtPrefijo.Enabled = false;
            txtPrefijo.Location = new Point(16, 230);
            txtPrefijo.Name = "txtPrefijo";
            // PlaceholderText no disponible en net48
            txtPrefijo.Size = new Size(120, 27);
            txtPrefijo.TabIndex = 13;
            // 
            // lblNum
            // 
            lblNum.Location = new Point(142, 199);
            lblNum.Name = "lblNum";
            lblNum.Size = new Size(80, 23);
            lblNum.TabIndex = 14;
            lblNum.Text = "Numerador:";
            // 
            // txtNumerador
            // 
            txtNumerador.Enabled = false;
            txtNumerador.Location = new Point(142, 230);
            txtNumerador.Name = "txtNumerador";
            // PlaceholderText no disponible en net48
            txtNumerador.Size = new Size(60, 27);
            txtNumerador.TabIndex = 15;
            // 
            // lblPen
            // 
            lblPen.Location = new Point(287, 230);
            lblPen.Name = "lblPen";
            lblPen.Size = new Size(95, 23);
            lblPen.TabIndex = 16;
            lblPen.Text = "Altura texto:";
            // 
            // numAltura
            // 
            numAltura.DecimalPlaces = 2;
            numAltura.Increment = new decimal(new int[] { 1, 0, 0, 131072 });
            numAltura.Location = new Point(388, 227);
            numAltura.Maximum = new decimal(new int[] { 10, 0, 0, 0 });
            numAltura.Minimum = new decimal(new int[] { 1, 0, 0, 131072 });
            numAltura.Name = "numAltura";
            numAltura.Size = new Size(80, 27);
            numAltura.TabIndex = 13;
            numAltura.Value = new decimal(new int[] { 5, 0, 0, 131072 });
            // 
            // btnOK
            // 
            btnOK.Location = new Point(513, 194);
            btnOK.Name = "btnOK";
            btnOK.Size = new Size(80, 28);
            btnOK.TabIndex = 14;
            btnOK.Text = "Aceptar";
            btnOK.UseVisualStyleBackColor = true;
            btnOK.Click += bntOK_Click;
            // 
            // btnCancel
            // 
            btnCancel.DialogResult = DialogResult.Cancel;
            btnCancel.Location = new Point(513, 227);
            btnCancel.Name = "btnCancel";
            btnCancel.Size = new Size(80, 28);
            btnCancel.TabIndex = 15;
            btnCancel.Text = "Cancelar";
            btnCancel.UseVisualStyleBackColor = true;
            // 
            // txlyrNodo
            // 
            txlyrNodo.Location = new Point(16, 142);
            txlyrNodo.Name = "txlyrNodo";
            txlyrNodo.Size = new Size(577, 27);
            txlyrNodo.TabIndex = 10;
            // 
            // txNodoIni
            // 
            txNodoIni.Location = new Point(128, 10);
            txNodoIni.Name = "txNodoIni";
            // PlaceholderText no disponible en net48
            txNodoIni.Size = new Size(90, 27);
            txNodoIni.TabIndex = 1;
            // 
            // txNodoFin
            // 
            txNodoFin.Location = new Point(503, 10);
            txNodoFin.Name = "txNodoFin";
            // PlaceholderText no disponible en net48
            txNodoFin.Size = new Size(90, 27);
            txNodoFin.TabIndex = 3;
            // 
            // prefInicio
            // 
            prefInicio.AutoCompleteMode = AutoCompleteMode.SuggestAppend;
            prefInicio.AutoCompleteSource = AutoCompleteSource.CustomSource;
            prefInicio.BackColor = SystemColors.InactiveCaption;
            prefInicio.CharacterCasing = CharacterCasing.Upper;
            prefInicio.Location = new Point(16, 10);
            prefInicio.Name = "prefInicio";
            // PlaceholderText no disponible en net48
            prefInicio.Size = new Size(106, 27);
            prefInicio.TabIndex = 0;
            // 
            // prefFin
            // 
            prefFin.AutoCompleteMode = AutoCompleteMode.SuggestAppend;
            prefFin.AutoCompleteSource = AutoCompleteSource.CustomSource;
            prefFin.BackColor = SystemColors.InactiveCaption;
            prefFin.CharacterCasing = CharacterCasing.Upper;
            prefFin.Location = new Point(391, 10);
            prefFin.Name = "prefFin";
            // PlaceholderText no disponible en net48
            prefFin.Size = new Size(106, 27);
            prefFin.TabIndex = 2;
            // 
            // FrmEtiquetaLinea
            // 
            BackColor = Color.FromArgb(242, 247, 255);
            ClientSize = new Size(601, 262);
            Controls.Add(prefFin);
            Controls.Add(prefInicio);
            Controls.Add(txNodoFin);
            Controls.Add(txNodoIni);
            Controls.Add(txlyrNodo);
            Controls.Add(lblLongCalc);
            Controls.Add(lblRumboCalc);
            Controls.Add(chkLongitud);
            Controls.Add(chkDiametro);
            Controls.Add(chkMaterial);
            Controls.Add(chkPendiente);
            Controls.Add(chkRumbo);
            Controls.Add(chkVertices);
            Controls.Add(txtMaterial);
            Controls.Add(txtDiametro);
            Controls.Add(lblPref);
            Controls.Add(txtPrefijo);
            Controls.Add(lblNum);
            Controls.Add(txtNumerador);
            Controls.Add(lblPen);
            Controls.Add(numAltura);
            Controls.Add(btnOK);
            Controls.Add(btnCancel);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            Name = "FrmEtiquetaLinea";
            StartPosition = FormStartPosition.CenterParent;
            Text = "Indica las etiquetas a agregar";
            ((System.ComponentModel.ISupportInitialize)numAltura).EndInit();
            ResumeLayout(false);
            PerformLayout();
        }
        #region Event Handlers
        private void chkDiametro_CheckedChanged(object sender, System.EventArgs e)
        {
            this.txtDiametro.Enabled = this.chkDiametro.Checked;
        }
        private void chkMaterial_CheckedChanged(object sender, System.EventArgs e)
        {
            this.txtMaterial.Enabled = this.chkMaterial.Checked;
        }
        private void chkPendiente_CheckedChanged(object sender, System.EventArgs e)
        {
            this.txtPendiente.Enabled = this.chkPendiente.Checked;
        }
        private void chkVertices_CheckedChanged(object sender, System.EventArgs e)
        {
            this.txtPrefijo.Enabled = this.txtNumerador.Enabled = this.chkVertices.Checked;
        }

        #endregion

        private TextBox txlyrNodo;
        private TextBox txNodoIni;
        private TextBox txNodoFin;
        private TextBox prefInicio;
        private TextBox prefFin;
    }
}