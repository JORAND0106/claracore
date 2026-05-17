namespace SicoePresupuestoNET8
{
    partial class FrmPkFixerDescartados
    {
        /// <summary>
        /// Required designer variable.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        private System.Windows.Forms.Panel panelHeader;
        private System.Windows.Forms.Panel panelFooter;
        private System.Windows.Forms.Panel panelMain;
        private System.Windows.Forms.PictureBox picLogo;
        private System.Windows.Forms.Label lblTitulo;
        private System.Windows.Forms.Label lblSubtitulo;
        private System.Windows.Forms.Label lblFooter;
        private System.Windows.Forms.DataGridView dgvDescartados;
        private System.Windows.Forms.Panel panelButtons;
        private System.Windows.Forms.Button btnGuardar;
        private System.Windows.Forms.Button btnCancelar;
        private System.Windows.Forms.Button btnEliminarEnt;
        private System.Windows.Forms.Label lblInstruccion;
        private System.Windows.Forms.TableLayoutPanel tableMainLayout;

        private System.Windows.Forms.DataGridViewTextBoxColumn colHandleOriginal;
        private System.Windows.Forms.DataGridViewTextBoxColumn colAbsIni;
        private System.Windows.Forms.DataGridViewTextBoxColumn colAbsFin;
        private System.Windows.Forms.DataGridViewTextBoxColumn colCalzada;
        private System.Windows.Forms.DataGridViewTextBoxColumn colDimension;
        private System.Windows.Forms.DataGridViewTextBoxColumn colPkId;

        /// <summary>
        /// Clean up any resources being used.
        /// </summary>
        /// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>
        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        /// <summary>
        /// Required method for Designer support.
        /// Do not modify the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
            System.Windows.Forms.DataGridViewCellStyle dataGridViewCellStyle1 = new System.Windows.Forms.DataGridViewCellStyle();
            System.Windows.Forms.DataGridViewCellStyle dataGridViewCellStyle2 = new System.Windows.Forms.DataGridViewCellStyle();
            panelHeader = new System.Windows.Forms.Panel();
            picLogo = new System.Windows.Forms.PictureBox();
            lblTitulo = new System.Windows.Forms.Label();
            lblSubtitulo = new System.Windows.Forms.Label();
            panelFooter = new System.Windows.Forms.Panel();
            lblFooter = new System.Windows.Forms.Label();
            panelMain = new System.Windows.Forms.Panel();
            tableMainLayout = new System.Windows.Forms.TableLayoutPanel();
            lblInstruccion = new System.Windows.Forms.Label();
            dgvDescartados = new System.Windows.Forms.DataGridView();
            colHandleOriginal = new System.Windows.Forms.DataGridViewTextBoxColumn();
            colAbsIni = new System.Windows.Forms.DataGridViewTextBoxColumn();
            colAbsFin = new System.Windows.Forms.DataGridViewTextBoxColumn();
            colCalzada = new System.Windows.Forms.DataGridViewTextBoxColumn();
            colDimension = new System.Windows.Forms.DataGridViewTextBoxColumn();
            colPkId = new System.Windows.Forms.DataGridViewTextBoxColumn();
            panelButtons = new System.Windows.Forms.Panel();
            btnEliminarEnt = new System.Windows.Forms.Button();
            btnGuardar = new System.Windows.Forms.Button();
            btnCancelar = new System.Windows.Forms.Button();
            panelHeader.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)picLogo).BeginInit();
            panelFooter.SuspendLayout();
            panelMain.SuspendLayout();
            tableMainLayout.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)dgvDescartados).BeginInit();
            panelButtons.SuspendLayout();
            SuspendLayout();
            // 
            // panelHeader
            // 
            panelHeader.BackColor = System.Drawing.Color.FromArgb(0, 160, 176);
            panelHeader.Controls.Add(picLogo);
            panelHeader.Controls.Add(lblTitulo);
            panelHeader.Controls.Add(lblSubtitulo);
            panelHeader.Dock = System.Windows.Forms.DockStyle.Top;
            panelHeader.Location = new System.Drawing.Point(0, 0);
            panelHeader.Margin = new System.Windows.Forms.Padding(0);
            panelHeader.Name = "panelHeader";
            panelHeader.Size = new System.Drawing.Size(728, 85);
            panelHeader.TabIndex = 0;
            // 
            // picLogo
            // 
            picLogo.BackgroundImage = Properties.Resources.SicoeCAD;
            picLogo.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
            picLogo.Location = new System.Drawing.Point(14, 13);
            picLogo.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            picLogo.Name = "picLogo";
            picLogo.Size = new System.Drawing.Size(136, 64);
            picLogo.SizeMode = System.Windows.Forms.PictureBoxSizeMode.Zoom;
            picLogo.TabIndex = 0;
            picLogo.TabStop = false;
            // 
            // lblTitulo
            // 
            lblTitulo.AutoSize = true;
            lblTitulo.Font = new System.Drawing.Font("Segoe UI", 11F, System.Drawing.FontStyle.Bold);
            lblTitulo.ForeColor = System.Drawing.Color.White;
            lblTitulo.Location = new System.Drawing.Point(186, 13);
            lblTitulo.Name = "lblTitulo";
            lblTitulo.Size = new System.Drawing.Size(255, 25);
            lblTitulo.TabIndex = 1;
            lblTitulo.Text = "Vincular PK_ID descartados";
            // 
            // lblSubtitulo
            // 
            lblSubtitulo.AutoSize = true;
            lblSubtitulo.Font = new System.Drawing.Font("Segoe UI", 9F);
            lblSubtitulo.ForeColor = System.Drawing.Color.White;
            lblSubtitulo.Location = new System.Drawing.Point(186, 47);
            lblSubtitulo.Name = "lblSubtitulo";
            lblSubtitulo.Size = new System.Drawing.Size(522, 20);
            lblSubtitulo.TabIndex = 2;
            lblSubtitulo.Text = "Asigne manualmente el PK_ID a las entidades descartadas antes de continuar.";
            // 
            // panelFooter
            // 
            panelFooter.BackColor = System.Drawing.Color.FromArgb(235, 235, 235);
            panelFooter.Controls.Add(lblFooter);
            panelFooter.Dock = System.Windows.Forms.DockStyle.Bottom;
            panelFooter.Location = new System.Drawing.Point(0, 615);
            panelFooter.Margin = new System.Windows.Forms.Padding(0);
            panelFooter.Name = "panelFooter";
            panelFooter.Size = new System.Drawing.Size(728, 32);
            panelFooter.TabIndex = 1;
            // 
            // lblFooter
            // 
            lblFooter.Dock = System.Windows.Forms.DockStyle.Fill;
            lblFooter.Font = new System.Drawing.Font("Segoe UI", 8F);
            lblFooter.ForeColor = System.Drawing.Color.DimGray;
            lblFooter.Location = new System.Drawing.Point(0, 0);
            lblFooter.Name = "lblFooter";
            lblFooter.Size = new System.Drawing.Size(728, 32);
            lblFooter.TabIndex = 0;
            lblFooter.Text = "© 2025 SicoeCAD® – Derechos reservados. Uso autorizado únicamente para el proyecto licenciado.";
            lblFooter.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
            // 
            // panelMain
            // 
            panelMain.BackColor = System.Drawing.Color.White;
            panelMain.Controls.Add(tableMainLayout);
            panelMain.Dock = System.Windows.Forms.DockStyle.Fill;
            panelMain.Location = new System.Drawing.Point(0, 85);
            panelMain.Margin = new System.Windows.Forms.Padding(0);
            panelMain.Name = "panelMain";
            panelMain.Padding = new System.Windows.Forms.Padding(9, 11, 9, 11);
            panelMain.Size = new System.Drawing.Size(728, 530);
            panelMain.TabIndex = 2;
            // 
            // tableMainLayout
            // 
            tableMainLayout.ColumnCount = 1;
            tableMainLayout.ColumnStyles.Add(new System.Windows.Forms.ColumnStyle(System.Windows.Forms.SizeType.Percent, 100F));
            tableMainLayout.Controls.Add(lblInstruccion, 0, 0);
            tableMainLayout.Controls.Add(dgvDescartados, 0, 1);
            tableMainLayout.Controls.Add(panelButtons, 0, 2);
            tableMainLayout.Dock = System.Windows.Forms.DockStyle.Fill;
            tableMainLayout.Location = new System.Drawing.Point(9, 11);
            tableMainLayout.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            tableMainLayout.Name = "tableMainLayout";
            tableMainLayout.RowCount = 3;
            tableMainLayout.RowStyles.Add(new System.Windows.Forms.RowStyle(System.Windows.Forms.SizeType.Absolute, 53F));
            tableMainLayout.RowStyles.Add(new System.Windows.Forms.RowStyle(System.Windows.Forms.SizeType.Percent, 100F));
            tableMainLayout.RowStyles.Add(new System.Windows.Forms.RowStyle(System.Windows.Forms.SizeType.Absolute, 64F));
            tableMainLayout.Size = new System.Drawing.Size(710, 508);
            tableMainLayout.TabIndex = 0;
            // 
            // lblInstruccion
            // 
            lblInstruccion.Dock = System.Windows.Forms.DockStyle.Fill;
            lblInstruccion.Font = new System.Drawing.Font("Segoe UI", 9F);
            lblInstruccion.ForeColor = System.Drawing.Color.FromArgb(64, 64, 64);
            lblInstruccion.Location = new System.Drawing.Point(3, 0);
            lblInstruccion.Name = "lblInstruccion";
            lblInstruccion.Size = new System.Drawing.Size(704, 53);
            lblInstruccion.TabIndex = 0;
            lblInstruccion.Text = "Revise cada entidad descartada, haga doble clic para ubicarla en el plano y diligencie el campo PK_ID. No podrá continuar hasta completar todas las filas.";
            lblInstruccion.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
            // 
            // dgvDescartados
            // 
            dgvDescartados.AllowUserToAddRows = false;
            dgvDescartados.AllowUserToDeleteRows = false;
            dgvDescartados.AllowUserToResizeRows = false;
            dgvDescartados.BackgroundColor = System.Drawing.Color.White;
            dgvDescartados.CellBorderStyle = System.Windows.Forms.DataGridViewCellBorderStyle.SingleHorizontal;
            dataGridViewCellStyle1.Alignment = System.Windows.Forms.DataGridViewContentAlignment.MiddleLeft;
            dataGridViewCellStyle1.BackColor = System.Drawing.SystemColors.Control;
            dataGridViewCellStyle1.Font = new System.Drawing.Font("Segoe UI", 9F);
            dataGridViewCellStyle1.ForeColor = System.Drawing.SystemColors.WindowText;
            dataGridViewCellStyle1.SelectionBackColor = System.Drawing.SystemColors.Highlight;
            dataGridViewCellStyle1.SelectionForeColor = System.Drawing.SystemColors.HighlightText;
            dataGridViewCellStyle1.WrapMode = System.Windows.Forms.DataGridViewTriState.True;
            dgvDescartados.ColumnHeadersDefaultCellStyle = dataGridViewCellStyle1;
            dgvDescartados.ColumnHeadersHeightSizeMode = System.Windows.Forms.DataGridViewColumnHeadersHeightSizeMode.AutoSize;
            dgvDescartados.Columns.AddRange(new System.Windows.Forms.DataGridViewColumn[] { colHandleOriginal, colAbsIni, colAbsFin, colCalzada, colDimension, colPkId });
            dataGridViewCellStyle2.Alignment = System.Windows.Forms.DataGridViewContentAlignment.MiddleLeft;
            dataGridViewCellStyle2.BackColor = System.Drawing.SystemColors.Window;
            dataGridViewCellStyle2.Font = new System.Drawing.Font("Segoe UI", 9F);
            dataGridViewCellStyle2.ForeColor = System.Drawing.SystemColors.ControlText;
            dataGridViewCellStyle2.SelectionBackColor = System.Drawing.SystemColors.Highlight;
            dataGridViewCellStyle2.SelectionForeColor = System.Drawing.SystemColors.HighlightText;
            dataGridViewCellStyle2.WrapMode = System.Windows.Forms.DataGridViewTriState.False;
            dgvDescartados.DefaultCellStyle = dataGridViewCellStyle2;
            dgvDescartados.Dock = System.Windows.Forms.DockStyle.Fill;
            dgvDescartados.EditMode = System.Windows.Forms.DataGridViewEditMode.EditOnEnter;
            dgvDescartados.Location = new System.Drawing.Point(3, 57);
            dgvDescartados.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            dgvDescartados.MultiSelect = false;
            dgvDescartados.Name = "dgvDescartados";
            dgvDescartados.RowHeadersVisible = false;
            dgvDescartados.RowHeadersWidth = 51;
            dgvDescartados.RowTemplate.Height = 24;
            dgvDescartados.SelectionMode = System.Windows.Forms.DataGridViewSelectionMode.FullRowSelect;
            dgvDescartados.Size = new System.Drawing.Size(704, 383);
            dgvDescartados.TabIndex = 1;
            dgvDescartados.CellDoubleClick += dgvDescartados_CellDoubleClick;
            dgvDescartados.CellValidating += dgvDescartados_CellValidating;
            dgvDescartados.EditingControlShowing += dgvDescartados_EditingControlShowing;
            // 
            // colHandleOriginal
            // 
            colHandleOriginal.HeaderText = "HandleOriginal";
            colHandleOriginal.MinimumWidth = 6;
            colHandleOriginal.Name = "colHandleOriginal";
            colHandleOriginal.ReadOnly = true;
            colHandleOriginal.Visible = false;
            colHandleOriginal.Width = 125;
            // 
            // colAbsIni
            // 
            colAbsIni.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.AllCells;
            colAbsIni.HeaderText = "AbsInicio";
            colAbsIni.MinimumWidth = 6;
            colAbsIni.Name = "colAbsIni";
            colAbsIni.ReadOnly = true;
            colAbsIni.Width = 99;
            // 
            // colAbsFin
            // 
            colAbsFin.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.AllCells;
            colAbsFin.HeaderText = "AbsFin";
            colAbsFin.MinimumWidth = 6;
            colAbsFin.Name = "colAbsFin";
            colAbsFin.ReadOnly = true;
            colAbsFin.Width = 82;
            // 
            // colCalzada
            // 
            colCalzada.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.AllCells;
            colCalzada.HeaderText = "Calzada";
            colCalzada.MinimumWidth = 6;
            colCalzada.Name = "colCalzada";
            colCalzada.ReadOnly = true;
            colCalzada.Width = 91;
            // 
            // colDimension
            // 
            colDimension.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.AllCells;
            colDimension.HeaderText = "Dimensión";
            colDimension.MinimumWidth = 6;
            colDimension.Name = "colDimension";
            colDimension.ReadOnly = true;
            colDimension.Width = 109;
            // 
            // colPkId
            // 
            colPkId.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.Fill;
            colPkId.HeaderText = "PK_ID";
            colPkId.MinimumWidth = 6;
            colPkId.Name = "colPkId";
            // 
            // panelButtons
            // 
            panelButtons.Controls.Add(btnEliminarEnt);
            panelButtons.Controls.Add(btnGuardar);
            panelButtons.Controls.Add(btnCancelar);
            panelButtons.Dock = System.Windows.Forms.DockStyle.Fill;
            panelButtons.Location = new System.Drawing.Point(3, 448);
            panelButtons.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            panelButtons.Name = "panelButtons";
            panelButtons.Size = new System.Drawing.Size(704, 56);
            panelButtons.TabIndex = 2;
            // 
            // btnEliminarEnt
            // 
            btnEliminarEnt.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
            btnEliminarEnt.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            btnEliminarEnt.Location = new System.Drawing.Point(14, 15);
            btnEliminarEnt.Name = "btnEliminarEnt";
            btnEliminarEnt.Size = new System.Drawing.Size(114, 37);
            btnEliminarEnt.TabIndex = 2;
            btnEliminarEnt.Text = "Eliminar Ent";
            btnEliminarEnt.UseVisualStyleBackColor = true;
            btnEliminarEnt.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Bold);
            btnEliminarEnt.ForeColor = System.Drawing.Color.FromArgb(180, 0, 0);
            btnEliminarEnt.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            btnEliminarEnt.Click += btnEliminarEnt_Click;
            // 
            // btnGuardar
            // 
            btnGuardar.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
            btnGuardar.BackColor = System.Drawing.Color.FromArgb(0, 160, 176);
            btnGuardar.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            btnGuardar.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Bold);
            btnGuardar.ForeColor = System.Drawing.Color.White;
            btnGuardar.Location = new System.Drawing.Point(463, 15);
            btnGuardar.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            btnGuardar.Name = "btnGuardar";
            btnGuardar.Size = new System.Drawing.Size(114, 37);
            btnGuardar.TabIndex = 0;
            btnGuardar.Text = "Guardar";
            btnGuardar.UseVisualStyleBackColor = false;
            btnGuardar.Click += btnAceptar_Click;
            // 
            // btnCancelar
            // 
            btnCancelar.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
            btnCancelar.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            btnCancelar.Font = new System.Drawing.Font("Segoe UI", 9F);
            btnCancelar.Location = new System.Drawing.Point(584, 15);
            btnCancelar.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            btnCancelar.Name = "btnCancelar";
            btnCancelar.Size = new System.Drawing.Size(114, 37);
            btnCancelar.TabIndex = 1;
            btnCancelar.Text = "Cancelar";
            btnCancelar.UseVisualStyleBackColor = true;
            btnCancelar.Click += btnCancelar_Click;
            // 
            // FrmPkFixerDescartados
            // 
            AutoScaleDimensions = new System.Drawing.SizeF(8F, 20F);
            AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            BackColor = System.Drawing.Color.White;
            ClientSize = new System.Drawing.Size(728, 647);
            Controls.Add(panelMain);
            Controls.Add(panelFooter);
            Controls.Add(panelHeader);
            Font = new System.Drawing.Font("Segoe UI", 9F);
            FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedDialog;
            Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            MaximizeBox = false;
            MinimizeBox = false;
            Name = "FrmPkFixerDescartados";
            StartPosition = System.Windows.Forms.FormStartPosition.CenterParent;
            Text = "SICOE — Asignar PK_ID manual a entidades descartadas";
            panelHeader.ResumeLayout(false);
            panelHeader.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)picLogo).EndInit();
            panelFooter.ResumeLayout(false);
            panelMain.ResumeLayout(false);
            tableMainLayout.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)dgvDescartados).EndInit();
            panelButtons.ResumeLayout(false);
            ResumeLayout(false);

        }

        #endregion


    }
}
