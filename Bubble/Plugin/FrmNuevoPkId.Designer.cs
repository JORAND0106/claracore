using System.Windows.Forms;
using System.Drawing;

namespace SicoePresupuestoNET8
{
    partial class FrmNuevoPkId
    {
        private System.ComponentModel.IContainer components = null;
        private Button btnOk, btnCancel;

        private void InitializeComponent()
        {
            lblPk = new Label();
            lblCiv = new Label();
            lblUbic = new Label();
            lblTramo = new Label();
            lblInfra = new Label();
            lblCostado = new Label();
            lblAbsIni = new Label();
            lblAbsFin = new Label();
            txtPk = new TextBox();
            txtCiv = new TextBox();
            txtUbic = new TextBox();
            cbTramo = new ComboBox();
            cbInfra = new ComboBox();
            cbCostado = new ComboBox();
            txtAbsIni = new TextBox();
            txtAbsFin = new TextBox();
            btnOk = new Button();
            btnCancel = new Button();
            SuspendLayout();
            // 
            // lblPk
            // 
            lblPk.Location = new Point(52, 21);
            lblPk.Name = "lblPk";
            lblPk.Size = new Size(74, 24);
            lblPk.TabIndex = 0;
            lblPk.Text = "PK_ID";
            lblPk.TextAlign = ContentAlignment.MiddleRight;
            // 
            // lblCiv
            // 
            lblCiv.Location = new Point(294, 21);
            lblCiv.Name = "lblCiv";
            lblCiv.Size = new Size(42, 24);
            lblCiv.TabIndex = 1;
            lblCiv.Text = "CIV";
            lblCiv.TextAlign = ContentAlignment.MiddleRight;
            // 
            // lblUbic
            // 
            lblUbic.Location = new Point(32, 57);
            lblUbic.Name = "lblUbic";
            lblUbic.Size = new Size(94, 24);
            lblUbic.TabIndex = 2;
            lblUbic.Text = "Ubicación";
            lblUbic.TextAlign = ContentAlignment.MiddleRight;
            // 
            // lblTramo
            // 
            lblTramo.Location = new Point(32, 93);
            lblTramo.Name = "lblTramo";
            lblTramo.Size = new Size(94, 24);
            lblTramo.TabIndex = 3;
            lblTramo.Text = "Tramo";
            lblTramo.TextAlign = ContentAlignment.MiddleRight;
            // 
            // lblInfra
            // 
            lblInfra.Location = new Point(2, 134);
            lblInfra.Name = "lblInfra";
            lblInfra.Size = new Size(124, 24);
            lblInfra.TabIndex = 4;
            lblInfra.Text = "Infraestructura";
            lblInfra.TextAlign = ContentAlignment.MiddleRight;
            // 
            // lblCostado
            // 
            lblCostado.Location = new Point(281, 134);
            lblCostado.Name = "lblCostado";
            lblCostado.Size = new Size(76, 24);
            lblCostado.TabIndex = 5;
            lblCostado.Text = "Costado";
            lblCostado.TextAlign = ContentAlignment.MiddleRight;
            // 
            // lblAbsIni
            // 
            lblAbsIni.Location = new Point(32, 176);
            lblAbsIni.Name = "lblAbsIni";
            lblAbsIni.Size = new Size(94, 24);
            lblAbsIni.TabIndex = 6;
            lblAbsIni.Text = "Abs. Inicio";
            lblAbsIni.TextAlign = ContentAlignment.MiddleRight;
            // 
            // lblAbsFin
            // 
            lblAbsFin.Location = new Point(250, 176);
            lblAbsFin.Name = "lblAbsFin";
            lblAbsFin.Size = new Size(94, 24);
            lblAbsFin.TabIndex = 7;
            lblAbsFin.Text = "Abs. Final";
            lblAbsFin.TextAlign = ContentAlignment.MiddleRight;
            // 
            // txtPk
            // 
            txtPk.BorderStyle = BorderStyle.FixedSingle;
            txtPk.Location = new Point(138, 21);
            txtPk.Name = "txtPk";
            txtPk.Size = new Size(150, 30);
            txtPk.TabIndex = 10;
            // 
            // txtCiv
            // 
            txtCiv.BorderStyle = BorderStyle.FixedSingle;
            txtCiv.Location = new Point(342, 21);
            txtCiv.Name = "txtCiv";
            txtCiv.Size = new Size(150, 30);
            txtCiv.TabIndex = 11;
            // 
            // txtUbic
            // 
            txtUbic.BorderStyle = BorderStyle.FixedSingle;
            txtUbic.Location = new Point(138, 57);
            txtUbic.Name = "txtUbic";
            txtUbic.Size = new Size(354, 30);
            txtUbic.TabIndex = 12;
            // 
            // cbTramo
            // 
            cbTramo.DropDownStyle = ComboBoxStyle.DropDownList;
            cbTramo.Location = new Point(138, 93);
            cbTramo.Name = "cbTramo";
            cbTramo.Size = new Size(354, 31);
            cbTramo.TabIndex = 13;
            // 
            // cbInfra
            // 
            cbInfra.DropDownStyle = ComboBoxStyle.DropDownList;
            cbInfra.Location = new Point(138, 134);
            cbInfra.Name = "cbInfra";
            cbInfra.Size = new Size(137, 31);
            cbInfra.TabIndex = 14;
            // 
            // cbCostado
            // 
            cbCostado.DropDownStyle = ComboBoxStyle.DropDownList;
            cbCostado.Location = new Point(363, 134);
            cbCostado.Name = "cbCostado";
            cbCostado.Size = new Size(129, 31);
            cbCostado.TabIndex = 15;
            // 
            // txtAbsIni
            // 
            txtAbsIni.BorderStyle = BorderStyle.FixedSingle;
            txtAbsIni.Location = new Point(138, 176);
            txtAbsIni.Name = "txtAbsIni";
            txtAbsIni.Size = new Size(106, 30);
            txtAbsIni.TabIndex = 16;
            // 
            // txtAbsFin
            // 
            txtAbsFin.BorderStyle = BorderStyle.FixedSingle;
            txtAbsFin.Location = new Point(356, 176);
            txtAbsFin.Name = "txtAbsFin";
            txtAbsFin.Size = new Size(136, 30);
            txtAbsFin.TabIndex = 17;
            // 
            // btnOk
            // 
            btnOk.BackColor = Color.FromArgb(98, 144, 220);
            btnOk.DialogResult = DialogResult.OK;
            btnOk.ForeColor = SystemColors.ButtonHighlight;
            btnOk.Location = new Point(378, 223);
            btnOk.Name = "btnOk";
            btnOk.Size = new Size(110, 34);
            btnOk.TabIndex = 90;
            btnOk.Text = "Aceptar";
            btnOk.UseVisualStyleBackColor = false;
            // 
            // btnCancel
            // 
            btnCancel.BackColor = Color.FromArgb(98, 144, 220);
            btnCancel.DialogResult = DialogResult.Cancel;
            btnCancel.ForeColor = SystemColors.ButtonHighlight;
            btnCancel.Location = new Point(106, 223);
            btnCancel.Name = "btnCancel";
            btnCancel.Size = new Size(110, 34);
            btnCancel.TabIndex = 89;
            btnCancel.Text = "Cancelar";
            btnCancel.UseVisualStyleBackColor = false;
            // 
            // FrmNuevoPkId
            // 
            AutoScaleMode = AutoScaleMode.None;
            BackColor = Color.FromArgb(242, 247, 255);
            ClientSize = new Size(548, 278);
            Controls.Add(lblPk);
            Controls.Add(lblCiv);
            Controls.Add(lblUbic);
            Controls.Add(lblTramo);
            Controls.Add(lblInfra);
            Controls.Add(lblCostado);
            Controls.Add(lblAbsIni);
            Controls.Add(lblAbsFin);
            Controls.Add(txtPk);
            Controls.Add(txtCiv);
            Controls.Add(txtUbic);
            Controls.Add(cbTramo);
            Controls.Add(cbInfra);
            Controls.Add(cbCostado);
            Controls.Add(txtAbsIni);
            Controls.Add(txtAbsFin);
            Controls.Add(btnCancel);
            Controls.Add(btnOk);
            Font = new Font("Segoe UI", 10F);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            Name = "FrmNuevoPkId";
            StartPosition = FormStartPosition.CenterParent;
            Text = "Nuevo PK_ID";
            ResumeLayout(false);
            PerformLayout();
        }




        private FlowLayoutPanel flp;
        private TextBox txtAbsFin;
        private Label lblAbsFin;
        private TextBox txtAbsIni;
        private Label lblAbsIni;
        private ComboBox cbCostado;
        private Label lblCostado;
        private ComboBox cbInfra;
        private Label lblInfra;
        private ComboBox cbTramo;
        private Label lblTramo;
        private TextBox txtUbic;
        private Label lblUbic;
        private TextBox txtCiv;
        private Label lblCiv;
        private TextBox txtPk;
        private Label lblPk;
        private TableLayoutPanel tlp;
    }
}
