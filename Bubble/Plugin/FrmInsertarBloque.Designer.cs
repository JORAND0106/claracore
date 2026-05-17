namespace SicoePresupuestoNET8
{
    partial class FrmInsertarBloque
    {
        private System.ComponentModel.IContainer components = null;
        private System.Windows.Forms.ComboBox cboBloque;
        private System.Windows.Forms.TextBox txtNodoLL;
        private System.Windows.Forms.TextBox txtNodoLR;
        private System.Windows.Forms.Button btnOk;
        private System.Windows.Forms.Button btnCancel;
        private System.Windows.Forms.Label lblBloque;
        private System.Windows.Forms.Label lblNodoLL;
        private System.Windows.Forms.Label lblNodoLR;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
                components.Dispose();
            base.Dispose(disposing);
        }

        private void InitializeComponent()
        {
            components = new System.ComponentModel.Container();
            cboBloque = new System.Windows.Forms.ComboBox();
            txtNodoLL = new System.Windows.Forms.TextBox();
            txtNodoLR = new System.Windows.Forms.TextBox();
            btnOk = new System.Windows.Forms.Button();
            btnCancel = new System.Windows.Forms.Button();
            lblBloque = new System.Windows.Forms.Label();
            lblNodoLL = new System.Windows.Forms.Label();
            lblNodoLR = new System.Windows.Forms.Label();
            nodoDeshacer = new System.Windows.Forms.Button();
            toolTip1 = new System.Windows.Forms.ToolTip(components);
            txtnewnodo = new System.Windows.Forms.TextBox();
            lblnewnod = new System.Windows.Forms.Label();
            SuspendLayout();
            // 
            // cboBloque
            // 
            cboBloque.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            cboBloque.Location = new System.Drawing.Point(150, 12);
            cboBloque.Name = "cboBloque";
            cboBloque.Size = new System.Drawing.Size(230, 28);
            cboBloque.TabIndex = 1;
            // 
            // txtNodoLL
            // 
            txtNodoLL.Location = new System.Drawing.Point(250, 52);
            txtNodoLL.Name = "txtNodoLL";
            txtNodoLL.Size = new System.Drawing.Size(130, 27);
            txtNodoLL.TabIndex = 3;
            // 
            // txtNodoLR
            // 
            txtNodoLR.Location = new System.Drawing.Point(250, 87);
            txtNodoLR.Name = "txtNodoLR";
            txtNodoLR.Size = new System.Drawing.Size(130, 27);
            txtNodoLR.TabIndex = 5;
            // 
            // btnOk
            // 
            btnOk.Location = new System.Drawing.Point(189, 184);
            btnOk.Name = "btnOk";
            btnOk.Size = new System.Drawing.Size(94, 30);
            btnOk.TabIndex = 6;
            btnOk.Text = "Aceptar";
            btnOk.Click += BtnOk_Click;
            // 
            // btnCancel
            // 
            btnCancel.Location = new System.Drawing.Point(289, 184);
            btnCancel.Name = "btnCancel";
            btnCancel.Size = new System.Drawing.Size(90, 30);
            btnCancel.TabIndex = 7;
            btnCancel.Text = "Cancelar";
            btnCancel.Click += BtnCancel_Click;
            // 
            // lblBloque
            // 
            lblBloque.AutoSize = true;
            lblBloque.Location = new System.Drawing.Point(15, 15);
            lblBloque.Name = "lblBloque";
            lblBloque.Size = new System.Drawing.Size(59, 20);
            lblBloque.TabIndex = 0;
            lblBloque.Text = "Bloque:";
            // 
            // lblNodoLL
            // 
            lblNodoLL.AutoSize = true;
            lblNodoLL.Location = new System.Drawing.Point(15, 55);
            lblNodoLL.Name = "lblNodoLL";
            lblNodoLL.Size = new System.Drawing.Size(203, 20);
            lblNodoLL.TabIndex = 2;
            lblNodoLL.Text = "Nodo inferior IZQ (inserción):";
            // 
            // lblNodoLR
            // 
            lblNodoLR.AutoSize = true;
            lblNodoLR.Location = new System.Drawing.Point(15, 90);
            lblNodoLR.Name = "lblNodoLR";
            lblNodoLR.Size = new System.Drawing.Size(223, 20);
            lblNodoLR.TabIndex = 4;
            lblNodoLR.Text = "Nodo inferior DER (orientación):";
            // 
            // nodoDeshacer
            // 
            nodoDeshacer.BackgroundImage = Properties.Resources.deshacer_insertar;
            nodoDeshacer.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
            nodoDeshacer.FlatStyle = System.Windows.Forms.FlatStyle.Popup;
            nodoDeshacer.Location = new System.Drawing.Point(16, 187);
            nodoDeshacer.Name = "nodoDeshacer";
            nodoDeshacer.Size = new System.Drawing.Size(30, 30);
            nodoDeshacer.TabIndex = 8;
            toolTip1.SetToolTip(nodoDeshacer, "Deshacer importar bloque");
            nodoDeshacer.UseVisualStyleBackColor = true;
            // 
            // txtnewnodo
            // 
            txtnewnodo.Location = new System.Drawing.Point(250, 120);
            txtnewnodo.Name = "txtnewnodo";
            txtnewnodo.Size = new System.Drawing.Size(130, 27);
            txtnewnodo.TabIndex = 9;
            // 
            // lblnewnod
            // 
            lblnewnod.AutoSize = true;
            lblnewnod.Location = new System.Drawing.Point(15, 123);
            lblnewnod.Name = "lblnewnod";
            lblnewnod.Size = new System.Drawing.Size(130, 20);
            lblnewnod.TabIndex = 10;
            lblnewnod.Text = "Digite nodo a unir";
            // 
            // FrmInsertarBloque
            // 
            BackColor = System.Drawing.Color.FromArgb(242, 247, 255);
            ClientSize = new System.Drawing.Size(420, 364);
            Controls.Add(lblnewnod);
            Controls.Add(txtnewnodo);
            Controls.Add(nodoDeshacer);
            Controls.Add(lblBloque);
            Controls.Add(cboBloque);
            Controls.Add(lblNodoLL);
            Controls.Add(txtNodoLL);
            Controls.Add(lblNodoLR);
            Controls.Add(txtNodoLR);
            Controls.Add(btnOk);
            Controls.Add(btnCancel);
            FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            Name = "FrmInsertarBloque";
            StartPosition = System.Windows.Forms.FormStartPosition.CenterParent;
            Text = "Insertar bloque por NODO";
            ResumeLayout(false);
            PerformLayout();
        }
        private System.Windows.Forms.Button nodoDeshacer;
        private System.Windows.Forms.ToolTip toolTip1;
        private System.Windows.Forms.TextBox txtnewnodo;
        private System.Windows.Forms.Label lblnewnod;
    }
}
