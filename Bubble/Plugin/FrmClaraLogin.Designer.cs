namespace SicoePresupuestoNET8
{
    partial class FrmClaraLogin
    {
        private System.ComponentModel.IContainer components = null;

        private System.Windows.Forms.Panel pnlHeader;
        private System.Windows.Forms.Label lblHeaderTitle;
        private System.Windows.Forms.Label lblHeaderSub;
        private System.Windows.Forms.Panel pnlBody;
        private System.Windows.Forms.Label lblUrl;
        private System.Windows.Forms.TextBox txtUrl;
        private System.Windows.Forms.Label lblEmail;
        private System.Windows.Forms.TextBox txtEmail;
        private System.Windows.Forms.Label lblPassword;
        private System.Windows.Forms.TextBox txtPassword;
        private System.Windows.Forms.Button btnCargarContratos;
        private System.Windows.Forms.Label lblContrato;
        private System.Windows.Forms.ComboBox cmbContrato;
        private System.Windows.Forms.Label lblModo;
        private System.Windows.Forms.RadioButton rbReplace;
        private System.Windows.Forms.TextBox txtClaveReplace;
        private System.Windows.Forms.RadioButton rbAppend;
        private System.Windows.Forms.Panel pnlFooter;
        private System.Windows.Forms.Label lblFooter;
        private System.Windows.Forms.Button btnEnviar;
        private System.Windows.Forms.Button btnCancelar;

        protected override void Dispose(bool disposing)
        {
            if (disposing && components != null) components.Dispose();
            base.Dispose(disposing);
        }

        private void InitializeComponent()
        {
            pnlHeader = new System.Windows.Forms.Panel();
            lblHeaderSub = new System.Windows.Forms.Label();
            lblHeaderTitle = new System.Windows.Forms.Label();
            pnlBody = new System.Windows.Forms.Panel();
            rbAppend = new System.Windows.Forms.RadioButton();
            rbReplace = new System.Windows.Forms.RadioButton();
            lblModo = new System.Windows.Forms.Label();
            cmbContrato = new System.Windows.Forms.ComboBox();
            lblContrato = new System.Windows.Forms.Label();
            btnCargarContratos = new System.Windows.Forms.Button();
            txtPassword = new System.Windows.Forms.TextBox();
            lblPassword = new System.Windows.Forms.Label();
            txtEmail = new System.Windows.Forms.TextBox();
            lblEmail = new System.Windows.Forms.Label();
            txtUrl = new System.Windows.Forms.TextBox();
            lblUrl = new System.Windows.Forms.Label();
            pnlFooter = new System.Windows.Forms.Panel();
            btnEnviar = new System.Windows.Forms.Button();
            btnCancelar = new System.Windows.Forms.Button();
            lblFooter = new System.Windows.Forms.Label();
            pnlHeader.SuspendLayout();
            pnlBody.SuspendLayout();
            pnlFooter.SuspendLayout();
            SuspendLayout();
            // 
            // pnlHeader
            // 
            pnlHeader.BackColor = System.Drawing.Color.FromArgb(0, 172, 193);
            pnlHeader.Controls.Add(lblHeaderSub);
            pnlHeader.Controls.Add(lblHeaderTitle);
            pnlHeader.Dock = System.Windows.Forms.DockStyle.Top;
            pnlHeader.Location = new System.Drawing.Point(0, 0);
            pnlHeader.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            pnlHeader.Name = "pnlHeader";
            pnlHeader.Size = new System.Drawing.Size(629, 93);
            pnlHeader.TabIndex = 0;
            // 
            // lblHeaderSub
            // 
            lblHeaderSub.AutoSize = true;
            lblHeaderSub.Font = new System.Drawing.Font("Segoe UI", 7.5F);
            lblHeaderSub.ForeColor = System.Drawing.Color.FromArgb(210, 255, 255);
            lblHeaderSub.Location = new System.Drawing.Point(18, 56);
            lblHeaderSub.Name = "lblHeaderSub";
            lblHeaderSub.Size = new System.Drawing.Size(334, 17);
            lblHeaderSub.TabIndex = 1;
            lblHeaderSub.Text = "Envía los registros de la grilla directamente a ClaraCore";
            // 
            // lblHeaderTitle
            // 
            lblHeaderTitle.AutoSize = true;
            lblHeaderTitle.Font = new System.Drawing.Font("Segoe UI", 13F, System.Drawing.FontStyle.Bold);
            lblHeaderTitle.ForeColor = System.Drawing.Color.White;
            lblHeaderTitle.Location = new System.Drawing.Point(16, 16);
            lblHeaderTitle.Name = "lblHeaderTitle";
            lblHeaderTitle.Size = new System.Drawing.Size(278, 30);
            lblHeaderTitle.TabIndex = 0;
            lblHeaderTitle.Text = "Sincronizar con ClaraCore";
            // 
            // pnlBody
            // 
            pnlBody.BackColor = System.Drawing.Color.FromArgb(224, 247, 250);
            pnlBody.Controls.Add(rbAppend);
            pnlBody.Controls.Add(rbReplace);
            pnlBody.Controls.Add(lblModo);
            pnlBody.Controls.Add(cmbContrato);
            pnlBody.Controls.Add(lblContrato);
            pnlBody.Controls.Add(btnCargarContratos);
            pnlBody.Controls.Add(txtPassword);
            pnlBody.Controls.Add(lblPassword);
            pnlBody.Controls.Add(txtEmail);
            pnlBody.Controls.Add(lblEmail);
            pnlBody.Controls.Add(txtUrl);
            pnlBody.Controls.Add(lblUrl);
            pnlBody.Location = new System.Drawing.Point(0, 93);
            pnlBody.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            pnlBody.Name = "pnlBody";
            pnlBody.Size = new System.Drawing.Size(607, 471);
            pnlBody.TabIndex = 1;
            // 
            // rbAppend
            // 
            rbAppend.AutoSize = true;
            rbAppend.Checked = true;
            rbAppend.Font = new System.Drawing.Font("Segoe UI", 9F);
            rbAppend.Location = new System.Drawing.Point(23, 432);
            rbAppend.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            rbAppend.Name = "rbAppend";
            rbAppend.Size = new System.Drawing.Size(198, 24);
            rbAppend.TabIndex = 11;
            rbAppend.TabStop = true;
            rbAppend.Text = "Agregar al final (append)";
            // 
            // rbReplace
            // 
            // rbReplace
            this.rbReplace.AutoSize = true;
            this.rbReplace.Enabled = false;
            this.rbReplace.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.rbReplace.Location = new System.Drawing.Point(20, 300);
            this.rbReplace.Name = "rbReplace";
            this.rbReplace.Size = new System.Drawing.Size(200, 19);
            this.rbReplace.TabIndex = 10;
            this.rbReplace.Text = "Reemplazar todo (replace)";

            // txtClaveReplace
            this.txtClaveReplace = new System.Windows.Forms.TextBox();
            this.txtClaveReplace.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
            this.txtClaveReplace.Font = new System.Drawing.Font("Segoe UI", 8.5F);
            this.txtClaveReplace.Location = new System.Drawing.Point(230, 297);
            this.txtClaveReplace.Name = "txtClaveReplace";
            this.txtClaveReplace.Size = new System.Drawing.Size(130, 22);
            this.txtClaveReplace.UseSystemPasswordChar = true;
            // PlaceholderText no disponible en net48;
            this.txtClaveReplace.TabIndex = 12;
            pnlBody.Controls.Add(this.txtClaveReplace);
            // 
            // lblModo
            // 
            lblModo.AutoSize = true;
            lblModo.Font = new System.Drawing.Font("Segoe UI", 8.5F, System.Drawing.FontStyle.Bold);
            lblModo.ForeColor = System.Drawing.Color.FromArgb(0, 100, 120);
            lblModo.Location = new System.Drawing.Point(23, 371);
            lblModo.Name = "lblModo";
            lblModo.Size = new System.Drawing.Size(164, 20);
            lblModo.TabIndex = 9;
            lblModo.Text = "Modo de importación:";
            // 
            // cmbContrato
            // 
            cmbContrato.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            cmbContrato.Enabled = false;
            cmbContrato.Font = new System.Drawing.Font("Segoe UI", 9F);
            cmbContrato.Location = new System.Drawing.Point(23, 323);
            cmbContrato.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            cmbContrato.Name = "cmbContrato";
            cmbContrato.Size = new System.Drawing.Size(451, 28);
            cmbContrato.TabIndex = 8;
            // 
            // lblContrato
            // 
            lblContrato.AutoSize = true;
            lblContrato.Font = new System.Drawing.Font("Segoe UI", 8.5F, System.Drawing.FontStyle.Bold);
            lblContrato.ForeColor = System.Drawing.Color.FromArgb(0, 100, 120);
            lblContrato.Location = new System.Drawing.Point(23, 296);
            lblContrato.Name = "lblContrato";
            lblContrato.Size = new System.Drawing.Size(75, 20);
            lblContrato.TabIndex = 7;
            lblContrato.Text = "Contrato:";
            // 
            // btnCargarContratos
            // 
            btnCargarContratos.BackColor = System.Drawing.Color.FromArgb(0, 172, 193);
            btnCargarContratos.Cursor = System.Windows.Forms.Cursors.Hand;
            btnCargarContratos.FlatAppearance.BorderSize = 0;
            btnCargarContratos.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            btnCargarContratos.Font = new System.Drawing.Font("Segoe UI", 8.5F, System.Drawing.FontStyle.Bold);
            btnCargarContratos.ForeColor = System.Drawing.Color.White;
            btnCargarContratos.Location = new System.Drawing.Point(23, 237);
            btnCargarContratos.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            btnCargarContratos.Name = "btnCargarContratos";
            btnCargarContratos.Size = new System.Drawing.Size(200, 40);
            btnCargarContratos.TabIndex = 6;
            btnCargarContratos.Text = "🔍  Cargar contratos";
            btnCargarContratos.UseVisualStyleBackColor = false;
            // 
            // txtPassword
            // 
            txtPassword.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
            txtPassword.Font = new System.Drawing.Font("Segoe UI", 9F);
            txtPassword.Location = new System.Drawing.Point(23, 189);
            txtPassword.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            txtPassword.Name = "txtPassword";
            txtPassword.Size = new System.Drawing.Size(451, 27);
            txtPassword.TabIndex = 5;
            txtPassword.UseSystemPasswordChar = true;
            // 
            // lblPassword
            // 
            lblPassword.AutoSize = true;
            lblPassword.Font = new System.Drawing.Font("Segoe UI", 8.5F, System.Drawing.FontStyle.Bold);
            lblPassword.ForeColor = System.Drawing.Color.FromArgb(0, 100, 120);
            lblPassword.Location = new System.Drawing.Point(23, 163);
            lblPassword.Name = "lblPassword";
            lblPassword.Size = new System.Drawing.Size(92, 20);
            lblPassword.TabIndex = 4;
            lblPassword.Text = "Contraseña:";
            // 
            // txtEmail
            // 
            txtEmail.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
            txtEmail.Font = new System.Drawing.Font("Segoe UI", 9F);
            txtEmail.Location = new System.Drawing.Point(23, 117);
            txtEmail.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            txtEmail.Name = "txtEmail";
            txtEmail.Size = new System.Drawing.Size(451, 27);
            txtEmail.TabIndex = 3;
            // 
            // lblEmail
            // 
            lblEmail.AutoSize = true;
            lblEmail.Font = new System.Drawing.Font("Segoe UI", 8.5F, System.Drawing.FontStyle.Bold);
            lblEmail.ForeColor = System.Drawing.Color.FromArgb(0, 100, 120);
            lblEmail.Location = new System.Drawing.Point(23, 91);
            lblEmail.Name = "lblEmail";
            lblEmail.Size = new System.Drawing.Size(141, 20);
            lblEmail.TabIndex = 2;
            lblEmail.Text = "Correo electrónico:";
            // 
            // txtUrl
            // 
            txtUrl.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
            txtUrl.Font = new System.Drawing.Font("Segoe UI", 9F);
            txtUrl.Location = new System.Drawing.Point(23, 45);
            txtUrl.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            txtUrl.Name = "txtUrl";
            txtUrl.Size = new System.Drawing.Size(451, 27);
            txtUrl.TabIndex = 1;
            txtUrl.Text = "https://claracore-backend.azurewebsites.net";
            // 
            // lblUrl
            // 
            lblUrl.AutoSize = true;
            lblUrl.Font = new System.Drawing.Font("Segoe UI", 8.5F, System.Drawing.FontStyle.Bold);
            lblUrl.ForeColor = System.Drawing.Color.FromArgb(0, 100, 120);
            lblUrl.Location = new System.Drawing.Point(23, 19);
            lblUrl.Name = "lblUrl";
            lblUrl.Size = new System.Drawing.Size(130, 20);
            lblUrl.TabIndex = 0;
            lblUrl.Text = "URL del servidor:";
            // 
            // pnlFooter
            // 
            pnlFooter.BackColor = System.Drawing.Color.FromArgb(0, 131, 148);
            pnlFooter.Controls.Add(btnEnviar);
            pnlFooter.Controls.Add(btnCancelar);
            pnlFooter.Controls.Add(lblFooter);
            pnlFooter.Dock = System.Windows.Forms.DockStyle.Bottom;
            pnlFooter.Location = new System.Drawing.Point(0, 596);
            pnlFooter.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            pnlFooter.Name = "pnlFooter";
            pnlFooter.Size = new System.Drawing.Size(629, 80);
            pnlFooter.TabIndex = 2;
            // 
            // btnEnviar
            // 
            btnEnviar.BackColor = System.Drawing.Color.White;
            btnEnviar.Cursor = System.Windows.Forms.Cursors.Hand;
            btnEnviar.Enabled = false;
            btnEnviar.FlatAppearance.BorderSize = 0;
            btnEnviar.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            btnEnviar.Font = new System.Drawing.Font("Segoe UI", 9.5F, System.Drawing.FontStyle.Bold);
            btnEnviar.ForeColor = System.Drawing.Color.FromArgb(0, 131, 148);
            btnEnviar.Location = new System.Drawing.Point(16, 17);
            btnEnviar.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            btnEnviar.Name = "btnEnviar";
            btnEnviar.Size = new System.Drawing.Size(194, 45);
            btnEnviar.TabIndex = 0;
            btnEnviar.Text = "✔  Conectar y Enviar";
            btnEnviar.UseVisualStyleBackColor = false;
            // 
            // btnCancelar
            // 
            btnCancelar.BackColor = System.Drawing.Color.FromArgb(0, 100, 120);
            btnCancelar.Cursor = System.Windows.Forms.Cursors.Hand;
            btnCancelar.FlatAppearance.BorderSize = 0;
            btnCancelar.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            btnCancelar.Font = new System.Drawing.Font("Segoe UI", 9F);
            btnCancelar.ForeColor = System.Drawing.Color.White;
            btnCancelar.Location = new System.Drawing.Point(222, 17);
            btnCancelar.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            btnCancelar.Name = "btnCancelar";
            btnCancelar.Size = new System.Drawing.Size(114, 45);
            btnCancelar.TabIndex = 1;
            btnCancelar.Text = "Cancelar";
            btnCancelar.UseVisualStyleBackColor = false;
            // 
            // lblFooter
            // 
            lblFooter.AutoSize = true;
            lblFooter.Font = new System.Drawing.Font("Segoe UI", 7.5F);
            lblFooter.ForeColor = System.Drawing.Color.FromArgb(180, 230, 235);
            lblFooter.Location = new System.Drawing.Point(347, 32);
            lblFooter.Name = "lblFooter";
            lblFooter.Size = new System.Drawing.Size(281, 17);
            lblFooter.TabIndex = 2;
            lblFooter.Text = "SicoeCAD® — Todos los derechos reservados";
            // 
            // FrmClaraLogin
            // 
            AutoScaleDimensions = new System.Drawing.SizeF(8F, 20F);
            AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            BackColor = System.Drawing.Color.FromArgb(224, 247, 250);
            ClientSize = new System.Drawing.Size(629, 676);
            Controls.Add(pnlBody);
            Controls.Add(pnlHeader);
            Controls.Add(pnlFooter);
            FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedDialog;
            Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            MaximizeBox = false;
            MinimizeBox = false;
            Name = "FrmClaraLogin";
            StartPosition = System.Windows.Forms.FormStartPosition.CenterParent;
            Text = "SicoeCAD → ClaraCore";
            pnlHeader.ResumeLayout(false);
            pnlHeader.PerformLayout();
            pnlBody.ResumeLayout(false);
            pnlBody.PerformLayout();
            pnlFooter.ResumeLayout(false);
            pnlFooter.PerformLayout();
            ResumeLayout(false);
        }
    }
}