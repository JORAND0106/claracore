// FrmDuplicados.Designer.cs
using System.Windows.Forms;
using System.Windows.Forms.DataVisualization.Charting;

namespace SicoePresupuestoNET8
{
    partial class FrmDuplicados
    {
        private System.ComponentModel.IContainer components = null;
        private System.Windows.Forms.DataGridView dgvDuplicados;
        private System.Windows.Forms.Button btnEliminarSeleccionados;
        private System.Windows.Forms.Button btnZoomSeleccion;
        private System.Windows.Forms.TextBox txtFiltro;
        private System.Windows.Forms.Label lblFiltro;
        private System.Windows.Forms.StatusStrip statusStrip1;
        private System.Windows.Forms.ToolStripStatusLabel lblTotal;
        private System.Windows.Forms.ToolStripStatusLabel lblSeleccionados;

        private System.Windows.Forms.DataGridViewCheckBoxColumn colChk;
        private System.Windows.Forms.DataGridViewTextBoxColumn colPunto;
        private System.Windows.Forms.DataGridViewTextBoxColumn colNorte;
        private System.Windows.Forms.DataGridViewTextBoxColumn colEste;
        private System.Windows.Forms.DataGridViewTextBoxColumn colCota;
        private System.Windows.Forms.DataGridViewTextBoxColumn colDescripcion;
        private System.Windows.Forms.DataGridViewTextBoxColumn colBloque;
        private System.Windows.Forms.DataGridViewTextBoxColumn colIdRef;
        private System.Windows.Forms.DataGridViewTextBoxColumn colDistPair;
        // Panel resumen + chart
        private System.Windows.Forms.Panel pnlResumen;
        private System.Windows.Forms.Button btnToggleResumen;
        private System.Windows.Forms.Label lblResTitulo;
        private System.Windows.Forms.Label lblResTot;
        private System.Windows.Forms.Label lblResDup;
        private System.Windows.Forms.Label lblResGrps;
        private System.Windows.Forms.Label lblResMin;
        private System.Windows.Forms.Label lblResAvg;
        private System.Windows.Forms.Label lblResMax;
        private System.Windows.Forms.DataVisualization.Charting.Chart chartDist;

        /// <summary>
        /// Limpieza de recursos.
        /// </summary>
        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        /// <summary>
        /// Inicialización de controles (WinForms Designer).
        /// </summary>
        private void InitializeComponent()
        {
            components = new System.ComponentModel.Container();
            dgvDuplicados = new DataGridView();
            colChk = new DataGridViewCheckBoxColumn();
            colPunto = new DataGridViewTextBoxColumn();
            colNorte = new DataGridViewTextBoxColumn();
            colEste = new DataGridViewTextBoxColumn();
            colCota = new DataGridViewTextBoxColumn();
            colDescripcion = new DataGridViewTextBoxColumn();
            colBloque = new DataGridViewTextBoxColumn();
            colIdRef = new DataGridViewTextBoxColumn();
            colDistPair = new DataGridViewTextBoxColumn();
            btnEliminarSeleccionados = new Button();
            btnZoomSeleccion = new Button();
            txtFiltro = new TextBox();
            lblFiltro = new Label();
            statusStrip1 = new StatusStrip();
            lblTotal = new ToolStripStatusLabel();
            lblSeleccionados = new ToolStripStatusLabel();
            toolTip1 = new ToolTip(components);
            btnReinciar = new Button();
            numTolerance = new NumericUpDown();
            lbl_tolerancia = new Label();
            pnlResumen = new Panel();
            ((System.ComponentModel.ISupportInitialize)dgvDuplicados).BeginInit();
            statusStrip1.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)numTolerance).BeginInit();
            SuspendLayout();
            // 
            // dgvDuplicados
            // 
            dgvDuplicados.AllowUserToAddRows = false;
            dgvDuplicados.AllowUserToDeleteRows = false;
            dgvDuplicados.AllowUserToResizeRows = false;
            dgvDuplicados.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            dgvDuplicados.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
            dgvDuplicados.BackgroundColor = System.Drawing.Color.FromArgb(224, 236, 255);
            dgvDuplicados.ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.AutoSize;
            dgvDuplicados.Columns.AddRange(new DataGridViewColumn[] { colChk, colPunto, colNorte, colEste, colCota, colDescripcion, colBloque, colIdRef, colDistPair });
            dgvDuplicados.Location = new System.Drawing.Point(12, 46);
            dgvDuplicados.MultiSelect = false;
            dgvDuplicados.Name = "dgvDuplicados";
            dgvDuplicados.RowHeadersVisible = false;
            dgvDuplicados.RowHeadersWidth = 51;
            dgvDuplicados.RowTemplate.Height = 24;
            dgvDuplicados.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
            dgvDuplicados.Size = new System.Drawing.Size(726, 478);
            dgvDuplicados.TabIndex = 1;
            dgvDuplicados.CellDoubleClick += dgvDuplicados_CellDoubleClick;
            dgvDuplicados.CurrentCellDirtyStateChanged += dgvDuplicados_CurrentCellDirtyStateChanged;
            // 
            // colChk
            // 
            colChk.DataPropertyName = "Chk";
            colChk.FillWeight = 35F;
            colChk.HeaderText = "Chk";
            colChk.MinimumWidth = 6;
            colChk.Name = "colChk";
            // 
            // colPunto
            // 
            colPunto.DataPropertyName = "Punto";
            colPunto.FillWeight = 60F;
            colPunto.HeaderText = "Punto";
            colPunto.MinimumWidth = 6;
            colPunto.Name = "colPunto";
            // 
            // colNorte
            // 
            colNorte.DataPropertyName = "Norte";
            colNorte.FillWeight = 90F;
            colNorte.HeaderText = "Norte";
            colNorte.MinimumWidth = 6;
            colNorte.Name = "colNorte";
            // 
            // colEste
            // 
            colEste.DataPropertyName = "Este";
            colEste.FillWeight = 90F;
            colEste.HeaderText = "Este";
            colEste.MinimumWidth = 6;
            colEste.Name = "colEste";
            // 
            // colCota
            // 
            colCota.DataPropertyName = "Cota";
            colCota.FillWeight = 90F;
            colCota.HeaderText = "Cota";
            colCota.MinimumWidth = 6;
            colCota.Name = "colCota";
            // 
            // colDescripcion
            // 
            colDescripcion.DataPropertyName = "Descripcion";
            colDescripcion.FillWeight = 140F;
            colDescripcion.HeaderText = "Descripción";
            colDescripcion.MinimumWidth = 6;
            colDescripcion.Name = "colDescripcion";
            // 
            // colBloque
            // 
            colBloque.DataPropertyName = "Bloque";
            colBloque.FillWeight = 110F;
            colBloque.HeaderText = "Bloque";
            colBloque.MinimumWidth = 6;
            colBloque.Name = "colBloque";
            // 
            // colIdRef
            // 
            colIdRef.DataPropertyName = "IdRef";
            colIdRef.HeaderText = "IdRef";
            colIdRef.MinimumWidth = 6;
            colIdRef.Name = "colIdRef";
            colIdRef.Visible = false;
            // 
            // colDistPair
            // 
            colDistPair.DataPropertyName = "DistPair";
            colDistPair.FillWeight = 80F;
            colDistPair.HeaderText = "Dist. Entre Nodos";
            colDistPair.MinimumWidth = 6;
            colDistPair.Name = "colDistPair";
            colDistPair.ReadOnly = true;
            // 
            // btnEliminarSeleccionados
            // 
            btnEliminarSeleccionados.BackgroundImage = Properties.Resources.Eliminar_Seleccionados;
            btnEliminarSeleccionados.BackgroundImageLayout = ImageLayout.Zoom;
            btnEliminarSeleccionados.Location = new System.Drawing.Point(104, 5);
            btnEliminarSeleccionados.Name = "btnEliminarSeleccionados";
            btnEliminarSeleccionados.Size = new System.Drawing.Size(40, 40);
            btnEliminarSeleccionados.TabIndex = 4;
            toolTip1.SetToolTip(btnEliminarSeleccionados, "Eliminar Nodos seleccionados");
            btnEliminarSeleccionados.UseVisualStyleBackColor = true;
            btnEliminarSeleccionados.Click += btnEliminarSeleccionados_Click;
            // 
            // btnZoomSeleccion
            // 
            btnZoomSeleccion.BackgroundImage = Properties.Resources.zoom;
            btnZoomSeleccion.BackgroundImageLayout = ImageLayout.Stretch;
            btnZoomSeleccion.Location = new System.Drawing.Point(58, 5);
            btnZoomSeleccion.Name = "btnZoomSeleccion";
            btnZoomSeleccion.Size = new System.Drawing.Size(40, 40);
            btnZoomSeleccion.TabIndex = 3;
            toolTip1.SetToolTip(btnZoomSeleccion, "Localiza nodo");
            btnZoomSeleccion.UseVisualStyleBackColor = true;
            btnZoomSeleccion.Click += btnZoomSeleccion_Click;
            // 
            // txtFiltro
            // 
            txtFiltro.Location = new System.Drawing.Point(206, 12);
            txtFiltro.Name = "txtFiltro";
            txtFiltro.Size = new System.Drawing.Size(150, 27);
            txtFiltro.TabIndex = 0;
            txtFiltro.TextChanged += txtFiltro_TextChanged;
            // 
            // lblFiltro
            // 
            lblFiltro.AutoSize = true;
            lblFiltro.Location = new System.Drawing.Point(154, 15);
            lblFiltro.Name = "lblFiltro";
            lblFiltro.Size = new System.Drawing.Size(46, 20);
            lblFiltro.TabIndex = 5;
            lblFiltro.Text = "Filtro:";
            // 
            // statusStrip1
            // 
            statusStrip1.BackColor = System.Drawing.Color.FromArgb(224, 236, 255);
            statusStrip1.ImageScalingSize = new System.Drawing.Size(20, 20);
            statusStrip1.Items.AddRange(new ToolStripItem[] { lblTotal, lblSeleccionados });
            statusStrip1.Location = new System.Drawing.Point(0, 537);
            statusStrip1.Name = "statusStrip1";
            statusStrip1.Size = new System.Drawing.Size(744, 26);
            statusStrip1.TabIndex = 4;
            // 
            // lblTotal
            // 
            lblTotal.Name = "lblTotal";
            lblTotal.Size = new System.Drawing.Size(97, 20);
            lblTotal.Text = "Total: 0 items";
            // 
            // lblSeleccionados
            // 
            lblSeleccionados.Name = "lblSeleccionados";
            lblSeleccionados.Size = new System.Drawing.Size(129, 20);
            lblSeleccionados.Text = "Marcados: 0 items";
            // 
            // btnReinciar
            // 
            btnReinciar.BackgroundImage = Properties.Resources.reinciiar;
            btnReinciar.BackgroundImageLayout = ImageLayout.Stretch;
            btnReinciar.Location = new System.Drawing.Point(12, 5);
            btnReinciar.Name = "btnReinciar";
            btnReinciar.Size = new System.Drawing.Size(40, 40);
            btnReinciar.TabIndex = 2;
            toolTip1.SetToolTip(btnReinciar, "Reiniciar Flujo");
            btnReinciar.UseVisualStyleBackColor = true;
            btnReinciar.Click += btnReiniciar_Click;
            // 
            // numTolerance
            // 
            numTolerance.Location = new System.Drawing.Point(475, 13);
            numTolerance.Name = "numTolerance";
            numTolerance.Size = new System.Drawing.Size(150, 27);
            numTolerance.TabIndex = 7;
            // 
            // lbl_tolerancia
            // 
            lbl_tolerancia.AutoSize = true;
            lbl_tolerancia.Location = new System.Drawing.Point(362, 15);
            lbl_tolerancia.Name = "lbl_tolerancia";
            lbl_tolerancia.Size = new System.Drawing.Size(107, 20);
            lbl_tolerancia.TabIndex = 8;
            lbl_tolerancia.Text = "Tolerancia (m):";
            // 
            // pnlResumen
            // 
            pnlResumen.BackColor = System.Drawing.Color.White;
            pnlResumen.Dock = DockStyle.Right;
            pnlResumen.Location = new System.Drawing.Point(744, 0);
            pnlResumen.Name = "pnlResumen";
            pnlResumen.Size = new System.Drawing.Size(260, 563);
            pnlResumen.TabIndex = 9;
            // 
            // FrmDuplicados
            // 
            AutoScaleDimensions = new System.Drawing.SizeF(8F, 20F);
            AutoScaleMode = AutoScaleMode.Font;
            BackColor = System.Drawing.Color.FromArgb(242, 247, 255);
            ClientSize = new System.Drawing.Size(1004, 563);
            Controls.Add(lbl_tolerancia);
            Controls.Add(numTolerance);
            Controls.Add(statusStrip1);
            Controls.Add(lblFiltro);
            Controls.Add(txtFiltro);
            Controls.Add(btnZoomSeleccion);
            Controls.Add(btnEliminarSeleccionados);
            Controls.Add(btnReinciar);
            Controls.Add(dgvDuplicados);
            Controls.Add(pnlResumen);
            MinimizeBox = false;
            Name = "FrmDuplicados";
            ShowInTaskbar = false;
            Text = "Depurar nodos duplicados";
            ((System.ComponentModel.ISupportInitialize)dgvDuplicados).EndInit();
            statusStrip1.ResumeLayout(false);
            statusStrip1.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)numTolerance).EndInit();
            ResumeLayout(false);
            PerformLayout();


        }
        private ToolTip toolTip1;
        private Button btnReinciar;
        private NumericUpDown numTolerance;
        private Label lbl_tolerancia;
    }
}
