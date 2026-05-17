namespace SicoePresupuestoNET8
{
    partial class FrmCatalogoEditor
    {
        /// <summary>
        /// Required designer variable.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

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
        /// Required method for Designer support - do not modify
        /// the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
            this.dgvCatalogo = new System.Windows.Forms.DataGridView();
            this.colCap = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.colComp = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.colItem = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.colDesc = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.colUnd = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.colVU = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.btnEliminarFila = new System.Windows.Forms.Button();
            this.btnAceptar = new System.Windows.Forms.Button();
            this.btnCancelar = new System.Windows.Forms.Button();
            this.lblCap = new System.Windows.Forms.Label();
            this.lblComp = new System.Windows.Forms.Label();
            this.lblItem = new System.Windows.Forms.Label();
            this.lblDesc = new System.Windows.Forms.Label();
            this.lblUnd = new System.Windows.Forms.Label();
            this.lblVU = new System.Windows.Forms.Label();
            this.txtCapitulo = new System.Windows.Forms.TextBox();
            this.txtCompetencia = new System.Windows.Forms.TextBox();
            this.txtItem = new System.Windows.Forms.TextBox();
            this.txtDescripcion = new System.Windows.Forms.TextBox();
            this.txtUnd = new System.Windows.Forms.TextBox();
            this.txtVU = new System.Windows.Forms.TextBox();
            this.btnEditarRegistro = new System.Windows.Forms.Button();
            ((System.ComponentModel.ISupportInitialize)(this.dgvCatalogo)).BeginInit();
            this.SuspendLayout();
            // 
            // dgvCatalogo
            // 
            this.dgvCatalogo.AllowUserToAddRows = false;
            this.dgvCatalogo.AllowUserToDeleteRows = false;
            this.dgvCatalogo.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left)
            | System.Windows.Forms.AnchorStyles.Right)));
            this.dgvCatalogo.AutoSizeColumnsMode = System.Windows.Forms.DataGridViewAutoSizeColumnsMode.Fill;
            this.dgvCatalogo.ColumnHeadersHeightSizeMode = System.Windows.Forms.DataGridViewColumnHeadersHeightSizeMode.AutoSize;
            this.dgvCatalogo.Columns.AddRange(new System.Windows.Forms.DataGridViewColumn[] {
            this.colCap,
            this.colComp,
            this.colItem,
            this.colDesc,
            this.colUnd,
            this.colVU});
            this.dgvCatalogo.Location = new System.Drawing.Point(12, 12);
            this.dgvCatalogo.MultiSelect = false;
            this.dgvCatalogo.Name = "dgvCatalogo";
            this.dgvCatalogo.ReadOnly = true;
            this.dgvCatalogo.RowHeadersVisible = false;
            this.dgvCatalogo.RowTemplate.Height = 25;
            this.dgvCatalogo.SelectionMode = System.Windows.Forms.DataGridViewSelectionMode.FullRowSelect;
            this.dgvCatalogo.Size = new System.Drawing.Size(840, 280);
            this.dgvCatalogo.TabIndex = 0;
            // 
            // colCap
            // 
            this.colCap.DataPropertyName = "Capitulo";
            this.colCap.HeaderText = "Capítulo";
            this.colCap.Name = "colCap";
            this.colCap.ReadOnly = true;
            // 
            // colComp
            // 
            this.colComp.DataPropertyName = "Competencia";
            this.colComp.HeaderText = "Competencia";
            this.colComp.Name = "colComp";
            this.colComp.ReadOnly = true;
            // 
            // colItem
            // 
            this.colItem.DataPropertyName = "Item";
            this.colItem.HeaderText = "Ítem";
            this.colItem.Name = "colItem";
            this.colItem.ReadOnly = true;
            // 
            // colDesc
            // 
            this.colDesc.DataPropertyName = "Descripcion";
            this.colDesc.HeaderText = "Descripción";
            this.colDesc.Name = "colDesc";
            this.colDesc.ReadOnly = true;
            // 
            // colUnd
            // 
            this.colUnd.DataPropertyName = "Und";
            this.colUnd.HeaderText = "Und";
            this.colUnd.Name = "colUnd";
            this.colUnd.ReadOnly = true;
            // 
            // colVU
            // 
            this.colVU.DataPropertyName = "ValorUnitario";
            this.colVU.HeaderText = "V. Unitario";
            this.colVU.Name = "colVU";
            this.colVU.ReadOnly = true;
            // 
            // btnEliminarFila
            // 
            this.btnEliminarFila.Location = new System.Drawing.Point(12, 429);
            this.btnEliminarFila.Name = "btnEliminarFila";
            this.btnEliminarFila.Size = new System.Drawing.Size(110, 32);
            this.btnEliminarFila.TabIndex = 7;
            this.btnEliminarFila.Text = "Eliminar fila";
            this.btnEliminarFila.UseVisualStyleBackColor = true;
            // 
            // btnAceptar
            // 
            this.btnAceptar.Anchor = ((System.Windows.Forms.AnchorStyles)((System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Right)));
            this.btnAceptar.Location = new System.Drawing.Point(654, 429);
            this.btnAceptar.Name = "btnAceptar";
            this.btnAceptar.Size = new System.Drawing.Size(90, 32);
            this.btnAceptar.TabIndex = 8;
            this.btnAceptar.Text = "Aceptar";
            this.btnAceptar.UseVisualStyleBackColor = true;
            // 
            // btnCancelar
            // 
            this.btnCancelar.Anchor = ((System.Windows.Forms.AnchorStyles)((System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Right)));
            this.btnCancelar.Location = new System.Drawing.Point(762, 429);
            this.btnCancelar.Name = "btnCancelar";
            this.btnCancelar.Size = new System.Drawing.Size(90, 32);
            this.btnCancelar.TabIndex = 9;
            this.btnCancelar.Text = "Cancelar";
            this.btnCancelar.UseVisualStyleBackColor = true;
            // 
            // Labels y TextBoxes (edición)
            // 
            this.lblCap.AutoSize = true;
            this.lblCap.Location = new System.Drawing.Point(12, 306);
            this.lblCap.Name = "lblCap";
            this.lblCap.Size = new System.Drawing.Size(58, 15);
            this.lblCap.Text = "Capítulo:";
            this.txtCapitulo.Location = new System.Drawing.Point(90, 302);
            this.txtCapitulo.Size = new System.Drawing.Size(160, 23);

            this.lblComp.AutoSize = true;
            this.lblComp.Location = new System.Drawing.Point(260, 306);
            this.lblComp.Name = "lblComp";
            this.lblComp.Size = new System.Drawing.Size(84, 15);
            this.lblComp.Text = "Competencia:";
            this.txtCompetencia.Location = new System.Drawing.Point(350, 302);
            this.txtCompetencia.Size = new System.Drawing.Size(120, 23);

            this.lblItem.AutoSize = true;
            this.lblItem.Location = new System.Drawing.Point(480, 306);
            this.lblItem.Text = "Ítem:";
            this.txtItem.Location = new System.Drawing.Point(520, 302);
            this.txtItem.Size = new System.Drawing.Size(120, 23);

            this.lblUnd.AutoSize = true;
            this.lblUnd.Location = new System.Drawing.Point(650, 306);
            this.lblUnd.Text = "Und:";
            this.txtUnd.Location = new System.Drawing.Point(690, 302);
            this.txtUnd.Size = new System.Drawing.Size(80, 23);

            this.lblDesc.AutoSize = true;
            this.lblDesc.Location = new System.Drawing.Point(12, 338);
            this.lblDesc.Text = "Descripción:";
            this.txtDescripcion.Location = new System.Drawing.Point(90, 334);
            this.txtDescripcion.Size = new System.Drawing.Size(680, 23);

            this.lblVU.AutoSize = true;
            this.lblVU.Location = new System.Drawing.Point(12, 370);
            this.lblVU.Text = "V. Unitario:";
            this.txtVU.Location = new System.Drawing.Point(90, 366);
            this.txtVU.Size = new System.Drawing.Size(120, 23);

            this.btnEditarRegistro.Location = new System.Drawing.Point(220, 364);
            this.btnEditarRegistro.Name = "btnEditarRegistro";
            this.btnEditarRegistro.Size = new System.Drawing.Size(120, 28);
            this.btnEditarRegistro.Text = "Editar registro";
            this.btnEditarRegistro.UseVisualStyleBackColor = true;

            // 
            // FrmCatalogoEditor
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 15F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.ClientSize = new System.Drawing.Size(864, 473);
            this.Controls.Add(this.btnEditarRegistro);
            this.Controls.Add(this.txtVU);
            this.Controls.Add(this.txtUnd);
            this.Controls.Add(this.txtDescripcion);
            this.Controls.Add(this.txtItem);
            this.Controls.Add(this.txtCompetencia);
            this.Controls.Add(this.txtCapitulo);
            this.Controls.Add(this.lblVU);
            this.Controls.Add(this.lblUnd);
            this.Controls.Add(this.lblDesc);
            this.Controls.Add(this.lblItem);
            this.Controls.Add(this.lblComp);
            this.Controls.Add(this.lblCap);
            this.Controls.Add(this.btnCancelar);
            this.Controls.Add(this.btnAceptar);
            this.Controls.Add(this.btnEliminarFila);
            this.Controls.Add(this.dgvCatalogo);
            this.MinimizeBox = false;
            this.Name = "FrmCatalogoEditor";
            this.StartPosition = System.Windows.Forms.FormStartPosition.CenterParent;
            this.Text = "Editor de Catálogo SICOE";
            ((System.ComponentModel.ISupportInitialize)(this.dgvCatalogo)).EndInit();
            this.ResumeLayout(false);
            this.PerformLayout();

        }

        #endregion

        private System.Windows.Forms.DataGridView dgvCatalogo;
        private System.Windows.Forms.Button btnEliminarFila;
        private System.Windows.Forms.Button btnAceptar;
        private System.Windows.Forms.Button btnCancelar;

        private System.Windows.Forms.DataGridViewTextBoxColumn colCap;
        private System.Windows.Forms.DataGridViewTextBoxColumn colComp;
        private System.Windows.Forms.DataGridViewTextBoxColumn colItem;
        private System.Windows.Forms.DataGridViewTextBoxColumn colDesc;
        private System.Windows.Forms.DataGridViewTextBoxColumn colUnd;
        private System.Windows.Forms.DataGridViewTextBoxColumn colVU;

        private System.Windows.Forms.Label lblCap;
        private System.Windows.Forms.Label lblComp;
        private System.Windows.Forms.Label lblItem;
        private System.Windows.Forms.Label lblDesc;
        private System.Windows.Forms.Label lblUnd;
        private System.Windows.Forms.Label lblVU;

        private System.Windows.Forms.TextBox txtCapitulo;
        private System.Windows.Forms.TextBox txtCompetencia;
        private System.Windows.Forms.TextBox txtItem;
        private System.Windows.Forms.TextBox txtDescripcion;
        private System.Windows.Forms.TextBox txtUnd;
        private System.Windows.Forms.TextBox txtVU;

        private System.Windows.Forms.Button btnEditarRegistro;
    }
}
