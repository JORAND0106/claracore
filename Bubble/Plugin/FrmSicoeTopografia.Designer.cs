namespace SicoePresupuestoNET8
{
    partial class FrmSicoeTopografia
    {
        private System.ComponentModel.IContainer components = null;

        private System.Windows.Forms.Panel panelHeader;
        private System.Windows.Forms.Label lblTitulo;
        private System.Windows.Forms.Label lblSub;

        private System.Windows.Forms.GroupBox grpFormato;
        private System.Windows.Forms.RadioButton rdbXYZ;
        private System.Windows.Forms.RadioButton rdbYXZ;
        private System.Windows.Forms.CheckBox chkTieneEncabezado;

        private System.Windows.Forms.Button btnSeleccionarCsv;
        private System.Windows.Forms.TextBox txtRutaCsv;

        private System.Windows.Forms.DataGridView dgvPreview;

        private System.Windows.Forms.Button btnImportar;
        private System.Windows.Forms.Label lblEstado;


        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null)) components.Dispose();
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code
        private void InitializeComponent()
        {
            components = new System.ComponentModel.Container();
            panelHeader = new System.Windows.Forms.Panel();
            lblTitulo = new System.Windows.Forms.Label();
            lblSub = new System.Windows.Forms.Label();
            grpFormato = new System.Windows.Forms.GroupBox();
            label1 = new System.Windows.Forms.Label();
            Tx_Contador = new System.Windows.Forms.TextBox();
            rdbXYZ = new System.Windows.Forms.RadioButton();
            rdbYXZ = new System.Windows.Forms.RadioButton();
            chkTieneEncabezado = new System.Windows.Forms.CheckBox();
            btnSeleccionarCsv = new System.Windows.Forms.Button();
            txtRutaCsv = new System.Windows.Forms.TextBox();
            dgvPreview = new System.Windows.Forms.DataGridView();
            btnImportar = new System.Windows.Forms.Button();
            lblEstado = new System.Windows.Forms.Label();
            lblAltura = new System.Windows.Forms.Label();
            nudAltura = new System.Windows.Forms.NumericUpDown();
            btnUnir1 = new System.Windows.Forms.Button();
            toolTip1 = new System.Windows.Forms.ToolTip(components);
            DelDuplicate = new System.Windows.Forms.Button();
            panelHeader.SuspendLayout();
            grpFormato.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)dgvPreview).BeginInit();
            ((System.ComponentModel.ISupportInitialize)nudAltura).BeginInit();
            SuspendLayout();
            // 
            // panelHeader
            // 
            panelHeader.BackColor = System.Drawing.Color.FromArgb(224, 236, 255);
            panelHeader.Controls.Add(lblTitulo);
            panelHeader.Controls.Add(lblSub);
            panelHeader.Dock = System.Windows.Forms.DockStyle.Top;
            panelHeader.Location = new System.Drawing.Point(0, 0);
            panelHeader.Name = "panelHeader";
            panelHeader.Size = new System.Drawing.Size(963, 76);
            panelHeader.TabIndex = 0;
            // 
            // lblTitulo
            // 
            lblTitulo.Font = new System.Drawing.Font("Segoe UI Semibold", 14.5F, System.Drawing.FontStyle.Bold);
            lblTitulo.ForeColor = System.Drawing.Color.FromArgb(20, 40, 70);
            lblTitulo.Location = new System.Drawing.Point(18, 12);
            lblTitulo.Name = "lblTitulo";
            lblTitulo.Size = new System.Drawing.Size(640, 28);
            lblTitulo.TabIndex = 0;
            lblTitulo.Text = "Importar puntos (CSV) a CAD";
            // 
            // lblSub
            // 
            lblSub.Font = new System.Drawing.Font("Segoe UI", 9.5F);
            lblSub.ForeColor = System.Drawing.Color.FromArgb(90, 120, 160);
            lblSub.Location = new System.Drawing.Point(20, 44);
            lblSub.Name = "lblSub";
            lblSub.Size = new System.Drawing.Size(720, 22);
            lblSub.TabIndex = 1;
            lblSub.Text = "Formatos: Este,Norte,Cota,Descripción,Bloque  |  Norte,Este,Cota,Descripción,Bloque";
            // 
            // grpFormato
            // 
            grpFormato.Controls.Add(label1);
            grpFormato.Controls.Add(Tx_Contador);
            grpFormato.Controls.Add(rdbXYZ);
            grpFormato.Controls.Add(rdbYXZ);
            grpFormato.Controls.Add(chkTieneEncabezado);
            grpFormato.Font = new System.Drawing.Font("Segoe UI", 9.5F);
            grpFormato.Location = new System.Drawing.Point(20, 92);
            grpFormato.Name = "grpFormato";
            grpFormato.Size = new System.Drawing.Size(622, 98);
            grpFormato.TabIndex = 1;
            grpFormato.TabStop = false;
            grpFormato.Text = "Formato del CSV";
            // 
            // label1
            // 
            label1.AutoSize = true;
            label1.Location = new System.Drawing.Point(361, 50);
            label1.Name = "label1";
            label1.Size = new System.Drawing.Size(166, 21);
            label1.TabIndex = 4;
            label1.Text = "El próximo nodo será...";
            // 
            // Tx_Contador
            // 
            Tx_Contador.BackColor = System.Drawing.SystemColors.InactiveCaption;
            Tx_Contador.Font = new System.Drawing.Font("Segoe UI", 7.8F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
            Tx_Contador.Location = new System.Drawing.Point(533, 50);
            Tx_Contador.Name = "Tx_Contador";
            Tx_Contador.Size = new System.Drawing.Size(83, 25);
            Tx_Contador.TabIndex = 3;
            // 
            // rdbXYZ
            // 
            rdbXYZ.AutoSize = true;
            rdbXYZ.Checked = true;
            rdbXYZ.Location = new System.Drawing.Point(18, 26);
            rdbXYZ.Name = "rdbXYZ";
            rdbXYZ.Size = new System.Drawing.Size(337, 25);
            rdbXYZ.TabIndex = 0;
            rdbXYZ.TabStop = true;
            rdbXYZ.Text = "NORTE, ESTE, COTA, DESCRIPCION, BLOQUE";
            // 
            // rdbYXZ
            // 
            rdbYXZ.AutoSize = true;
            rdbYXZ.Location = new System.Drawing.Point(18, 52);
            rdbYXZ.Name = "rdbYXZ";
            rdbYXZ.Size = new System.Drawing.Size(337, 25);
            rdbYXZ.TabIndex = 1;
            rdbYXZ.Text = "ESTE, NORTE, COTA, DESCRIPCION, BLOQUE";
            // 
            // chkTieneEncabezado
            // 
            chkTieneEncabezado.AutoSize = true;
            chkTieneEncabezado.Location = new System.Drawing.Point(393, 22);
            chkTieneEncabezado.Name = "chkTieneEncabezado";
            chkTieneEncabezado.Size = new System.Drawing.Size(223, 25);
            chkTieneEncabezado.TabIndex = 2;
            chkTieneEncabezado.Text = "El archivo tiene encabezado";
            // 
            // btnSeleccionarCsv
            // 
            btnSeleccionarCsv.Location = new System.Drawing.Point(788, 124);
            btnSeleccionarCsv.Name = "btnSeleccionarCsv";
            btnSeleccionarCsv.Size = new System.Drawing.Size(146, 30);
            btnSeleccionarCsv.TabIndex = 2;
            btnSeleccionarCsv.Text = "Seleccionar CSV…";
            // 
            // txtRutaCsv
            // 
            txtRutaCsv.Location = new System.Drawing.Point(642, 160);
            txtRutaCsv.Name = "txtRutaCsv";
            txtRutaCsv.ReadOnly = true;
            txtRutaCsv.Size = new System.Drawing.Size(294, 27);
            txtRutaCsv.TabIndex = 3;
            // 
            // dgvPreview
            // 
            dgvPreview.AllowUserToAddRows = false;
            dgvPreview.AllowUserToDeleteRows = false;
            dgvPreview.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left | System.Windows.Forms.AnchorStyles.Right;
            dgvPreview.AutoSizeColumnsMode = System.Windows.Forms.DataGridViewAutoSizeColumnsMode.Fill;
            dgvPreview.ColumnHeadersHeight = 29;
            dgvPreview.Location = new System.Drawing.Point(20, 196);
            dgvPreview.Name = "dgvPreview";
            dgvPreview.ReadOnly = true;
            dgvPreview.RowHeadersVisible = false;
            dgvPreview.RowHeadersWidth = 51;
            dgvPreview.SelectionMode = System.Windows.Forms.DataGridViewSelectionMode.FullRowSelect;
            dgvPreview.Size = new System.Drawing.Size(923, 252);
            dgvPreview.TabIndex = 4;
            // 
            // btnImportar
            // 
            btnImportar.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
            btnImportar.BackColor = System.Drawing.Color.Navy;
            btnImportar.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
            btnImportar.ForeColor = System.Drawing.SystemColors.Control;
            btnImportar.Location = new System.Drawing.Point(12, 454);
            btnImportar.Name = "btnImportar";
            btnImportar.Size = new System.Drawing.Size(160, 34);
            btnImportar.TabIndex = 5;
            btnImportar.Text = "Importar a CAD";
            btnImportar.UseVisualStyleBackColor = false;
            // 
            // lblEstado
            // 
            lblEstado.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
            lblEstado.ForeColor = System.Drawing.Color.FromArgb(80, 110, 150);
            lblEstado.Location = new System.Drawing.Point(188, 460);
            lblEstado.Name = "lblEstado";
            lblEstado.Size = new System.Drawing.Size(662, 22);
            lblEstado.TabIndex = 6;
            lblEstado.Text = "Listo para importar.";
            // 
            // lblAltura
            // 
            lblAltura.Location = new System.Drawing.Point(714, 93);
            lblAltura.Name = "lblAltura";
            lblAltura.Size = new System.Drawing.Size(120, 24);
            lblAltura.TabIndex = 0;
            lblAltura.Text = "Altura de texto:";
            // 
            // nudAltura
            // 
            nudAltura.DecimalPlaces = 2;
            nudAltura.Increment = new decimal(new int[] { 1, 0, 0, 131072 });
            nudAltura.Location = new System.Drawing.Point(834, 91);
            nudAltura.Maximum = new decimal(new int[] { 1000, 0, 0, 0 });
            nudAltura.Minimum = new decimal(new int[] { 1, 0, 0, 131072 });
            nudAltura.Name = "nudAltura";
            nudAltura.Size = new System.Drawing.Size(100, 27);
            nudAltura.TabIndex = 1;
            nudAltura.Value = new decimal(new int[] { 10, 0, 0, 131072 });
            // 
            // btnUnir1
            // 
            btnUnir1.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
            btnUnir1.BackgroundImage = Properties.Resources.unir;
            btnUnir1.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
            btnUnir1.Location = new System.Drawing.Point(902, 454);
            btnUnir1.Name = "btnUnir1";
            btnUnir1.Size = new System.Drawing.Size(40, 40);
            btnUnir1.TabIndex = 8;
            toolTip1.SetToolTip(btnUnir1, "Unir Puntos por Topografía");
            btnUnir1.UseVisualStyleBackColor = true;
            // 
            // DelDuplicate
            // 
            DelDuplicate.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
            DelDuplicate.BackgroundImage = Properties.Resources.Duplicado;
            DelDuplicate.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Zoom;
            DelDuplicate.Location = new System.Drawing.Point(856, 454);
            DelDuplicate.Name = "DelDuplicate";
            DelDuplicate.Size = new System.Drawing.Size(40, 40);
            DelDuplicate.TabIndex = 9;
            toolTip1.SetToolTip(DelDuplicate, "Eliminar Nodos Duplicados");
            DelDuplicate.UseVisualStyleBackColor = true;
            // 
            // FrmSicoeTopografia
            // 
            AutoScaleMode = System.Windows.Forms.AutoScaleMode.None;
            BackColor = System.Drawing.Color.FromArgb(242, 247, 255);
            ClientSize = new System.Drawing.Size(963, 500);
            Controls.Add(DelDuplicate);
            Controls.Add(btnUnir1);
            Controls.Add(lblAltura);
            Controls.Add(nudAltura);
            Controls.Add(panelHeader);
            Controls.Add(grpFormato);
            Controls.Add(btnSeleccionarCsv);
            Controls.Add(txtRutaCsv);
            Controls.Add(dgvPreview);
            Controls.Add(btnImportar);
            Controls.Add(lblEstado);
            Name = "FrmSicoeTopografia";
            StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
            Text = "Topografía – Importar Nube de Puntos (CSV)";
            panelHeader.ResumeLayout(false);
            grpFormato.ResumeLayout(false);
            grpFormato.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)dgvPreview).EndInit();
            ((System.ComponentModel.ISupportInitialize)nudAltura).EndInit();
            ResumeLayout(false);
            PerformLayout();
        }
        #endregion

        private System.Windows.Forms.Label lblAltura;
        private System.Windows.Forms.NumericUpDown nudAltura;
        private System.Windows.Forms.Button btnUnir1;
        private System.Windows.Forms.ToolTip toolTip1;
        private System.Windows.Forms.TextBox Tx_Contador;
        private System.Windows.Forms.Label label1;
        private System.Windows.Forms.Button DelDuplicate;
    }
}
