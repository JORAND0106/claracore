using System.Windows.Forms;
using System.Drawing;

namespace SicoePresupuestoNET8
{
    partial class FrmGestorSeleccionEntidades
    {
        private System.ComponentModel.IContainer components = null;

        private Panel panHeader;
        private Label lblTitulo;
        private Label lblDescripcion;
        private CheckBox chkSeleccionarTodo;
        private DataGridView dgvEntidades;
        private Button btnAgregar;
        private Button btnQuitar;
        private Button btnQuitarDuplicadas; // NUEVO
        private Button btnUnificarCapa; // NUEVO
        private Button btnAceptar;
        private Button btnCancelar;
        private Button btnRestablecerDuplicados; // NUEVO
        private Label lblResumen;
        private Label lblFooter;

        private DataGridViewCheckBoxColumn colDel; 
        private DataGridViewTextBoxColumn colNum;
        private DataGridViewTextBoxColumn colPkId;
        private DataGridViewTextBoxColumn colTipoCad;
        private DataGridViewTextBoxColumn colDimension;
        private DataGridViewTextBoxColumn colAbscisa;
        private DataGridViewTextBoxColumn colCalzada;
        private DataGridViewTextBoxColumn colCapa;    // NUEVO


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
            panHeader = new Panel();
            pbLogo = new PictureBox();
            lblTitulo = new Label();
            lblDescripcion = new Label();
            chkSeleccionarTodo = new CheckBox();
            dgvEntidades = new DataGridView();
            colDel = new DataGridViewCheckBoxColumn();
            colNum = new DataGridViewTextBoxColumn();
            colPkId = new DataGridViewTextBoxColumn();
            colTipoCad = new DataGridViewTextBoxColumn();
            colDimension = new DataGridViewTextBoxColumn();
            colAbscisa = new DataGridViewTextBoxColumn();
            colCalzada = new DataGridViewTextBoxColumn();
            colCapa = new DataGridViewTextBoxColumn();
            btnAgregar = new Button();
            btnQuitar = new Button();
            btnQuitarDuplicadas = new Button();
            btnUnificarCapa = new Button();
            btnAceptar = new Button();
            btnCancelar = new Button();
            lblResumen = new Label();
            lblFooter = new Label();
            btnRestablecerDuplicados = new Button();
            btnSeparar = new Button();
            panHeader.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)pbLogo).BeginInit();
            ((System.ComponentModel.ISupportInitialize)dgvEntidades).BeginInit();
            SuspendLayout();
            // 
            // panHeader
            // 
            panHeader.BackColor = Color.FromArgb(0, 154, 166);
            panHeader.Controls.Add(pbLogo);
            panHeader.Controls.Add(lblTitulo);
            panHeader.Dock = DockStyle.Top;
            panHeader.Location = new Point(0, 0);
            panHeader.Margin = new Padding(3, 4, 3, 4);
            panHeader.Name = "panHeader";
            panHeader.Size = new Size(924, 69);
            panHeader.TabIndex = 0;
            // 
            // pbLogo
            // 
            pbLogo.BackColor = Color.FromArgb(224, 224, 224);
            pbLogo.BackgroundImage = Properties.Resources.SicoeCAD1;
            pbLogo.BackgroundImageLayout = ImageLayout.Zoom;
            pbLogo.BorderStyle = BorderStyle.Fixed3D;
            pbLogo.Location = new Point(35, 3);
            pbLogo.Name = "pbLogo";
            pbLogo.Size = new Size(140, 63);
            pbLogo.SizeMode = PictureBoxSizeMode.Zoom;
            pbLogo.TabIndex = 1;
            pbLogo.TabStop = false;
            // 
            // lblTitulo
            // 
            lblTitulo.BackColor = Color.FromArgb(224, 224, 224);
            lblTitulo.BorderStyle = BorderStyle.Fixed3D;
            lblTitulo.Dock = DockStyle.Fill;
            lblTitulo.Font = new Font("Segoe UI", 11F, FontStyle.Bold);
            lblTitulo.ForeColor = Color.Black;
            lblTitulo.Location = new Point(0, 0);
            lblTitulo.Name = "lblTitulo";
            lblTitulo.Size = new Size(924, 69);
            lblTitulo.TabIndex = 0;
            lblTitulo.Text = "Gestor de selección de entidades";
            lblTitulo.TextAlign = ContentAlignment.MiddleCenter;
            // 
            // lblDescripcion
            // 
            lblDescripcion.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            lblDescripcion.Font = new Font("Segoe UI", 9F);
            lblDescripcion.Location = new Point(188, 77);
            lblDescripcion.Name = "lblDescripcion";
            lblDescripcion.Size = new Size(590, 40);
            lblDescripcion.TabIndex = 1;
            lblDescripcion.Text = "Revise, y selecciona las entidades que quedarán definitivas";
            lblDescripcion.TextAlign = ContentAlignment.MiddleLeft;
            // 
            // chkSeleccionarTodo
            // 
            chkSeleccionarTodo.AutoSize = true;
            chkSeleccionarTodo.Location = new Point(14, 86);
            chkSeleccionarTodo.Name = "chkSeleccionarTodo";
            chkSeleccionarTodo.Size = new Size(108, 24);
            chkSeleccionarTodo.TabIndex = 20;
            chkSeleccionarTodo.Text = "Sel. / Desel.";
            chkSeleccionarTodo.UseVisualStyleBackColor = true;
            chkSeleccionarTodo.CheckedChanged += chkSeleccionarTodo_CheckedChanged;
            // 
            // dgvEntidades
            // 
            dgvEntidades.AllowUserToAddRows = false;
            dgvEntidades.AllowUserToDeleteRows = false;
            dgvEntidades.AllowUserToResizeRows = false;
            dgvEntidades.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            dgvEntidades.BackgroundColor = Color.White;
            dgvEntidades.ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.AutoSize;
            dgvEntidades.Columns.AddRange(new DataGridViewColumn[] { colDel, colNum, colPkId, colTipoCad, colDimension, colAbscisa, colCalzada, colCapa });
            dgvEntidades.Location = new Point(14, 121);
            dgvEntidades.Margin = new Padding(3, 4, 3, 4);
            dgvEntidades.Name = "dgvEntidades";
            dgvEntidades.RowHeadersVisible = false;
            dgvEntidades.RowHeadersWidth = 51;
            dgvEntidades.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
            dgvEntidades.Size = new Size(764, 272);
            dgvEntidades.TabIndex = 2;
            dgvEntidades.CellDoubleClick += dgvEntidades_CellDoubleClick;
            // 
            // colDel
            // 
            colDel.HeaderText = "Del";
            colDel.MinimumWidth = 6;
            colDel.Name = "colDel";
            colDel.Width = 45;
            // 
            // colNum
            // 
            colNum.HeaderText = "#";
            colNum.MinimumWidth = 6;
            colNum.Name = "colNum";
            colNum.ReadOnly = true;
            colNum.Width = 47;
            // 
            // colPkId
            // 
            colPkId.HeaderText = "PK_ID";
            colPkId.MinimumWidth = 6;
            colPkId.Name = "colPkId";
            colPkId.ReadOnly = true;
            colPkId.Width = 76;
            // 
            // colTipoCad
            // 
            colTipoCad.HeaderText = "Tipo CAD";
            colTipoCad.MinimumWidth = 6;
            colTipoCad.Name = "colTipoCad";
            colTipoCad.ReadOnly = true;
            colTipoCad.Width = 94;
            // 
            // colDimension
            // 
            colDimension.HeaderText = "Dimensión aprox.";
            colDimension.MinimumWidth = 6;
            colDimension.Name = "colDimension";
            colDimension.ReadOnly = true;
            colDimension.Width = 141;
            // 
            // colAbscisa
            // 
            colAbscisa.HeaderText = "Abscisa";
            colAbscisa.MinimumWidth = 6;
            colAbscisa.Name = "colAbscisa";
            colAbscisa.ReadOnly = true;
            colAbscisa.Width = 88;
            // 
            // colCalzada
            // 
            colCalzada.HeaderText = "Calzada";
            colCalzada.MinimumWidth = 6;
            colCalzada.Name = "colCalzada";
            colCalzada.ReadOnly = true;
            colCalzada.Width = 91;
            // 
            // colCapa
            // 
            colCapa.HeaderText = "Capa";
            colCapa.MinimumWidth = 6;
            colCapa.Name = "colCapa";
            colCapa.ReadOnly = true;
            colCapa.Width = 83;
            // 
            // btnAgregar
            // 
            btnAgregar.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            btnAgregar.Location = new Point(791, 150);
            btnAgregar.Margin = new Padding(3, 4, 3, 4);
            btnAgregar.Name = "btnAgregar";
            btnAgregar.Size = new Size(120, 30);
            btnAgregar.TabIndex = 3;
            btnAgregar.Text = "Agregar...";
            btnAgregar.UseVisualStyleBackColor = true;
            btnAgregar.Click += btnAgregar_Click;
            // 
            // btnQuitar
            // 
            btnQuitar.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            btnQuitar.Location = new Point(791, 188);
            btnQuitar.Margin = new Padding(3, 4, 3, 4);
            btnQuitar.Name = "btnQuitar";
            btnQuitar.Size = new Size(120, 30);
            btnQuitar.TabIndex = 4;
            btnQuitar.Text = "Quitar";
            btnQuitar.UseVisualStyleBackColor = true;
            btnQuitar.Click += btnQuitar_Click;
            // 
            // btnQuitarDuplicadas
            // 
            btnQuitarDuplicadas.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            btnQuitarDuplicadas.Location = new Point(791, 226);
            btnQuitarDuplicadas.Margin = new Padding(3, 4, 3, 4);
            btnQuitarDuplicadas.Name = "btnQuitarDuplicadas";
            btnQuitarDuplicadas.Size = new Size(120, 30);
            btnQuitarDuplicadas.TabIndex = 5;
            btnQuitarDuplicadas.Text = "Quitar DUP";
            btnQuitarDuplicadas.UseVisualStyleBackColor = true;
            btnQuitarDuplicadas.Click += btnQuitarDuplicadas_Click;
            // 
            // btnUnificarCapa
            // 
            btnUnificarCapa.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            btnUnificarCapa.Location = new Point(791, 263);
            btnUnificarCapa.Name = "btnUnificarCapa";
            btnUnificarCapa.Size = new Size(120, 30);
            btnUnificarCapa.TabIndex = 0;
            btnUnificarCapa.Text = "Renombrar Ent.";
            btnUnificarCapa.UseVisualStyleBackColor = true;
            btnUnificarCapa.Click += btnUnificarCapa_Click;
            // 
            // btnAceptar
            // 
            btnAceptar.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
            btnAceptar.DialogResult = DialogResult.OK;
            btnAceptar.Location = new Point(701, 441);
            btnAceptar.Margin = new Padding(3, 4, 3, 4);
            btnAceptar.Name = "btnAceptar";
            btnAceptar.Size = new Size(103, 37);
            btnAceptar.TabIndex = 6;
            btnAceptar.Text = "Aceptar";
            btnAceptar.UseVisualStyleBackColor = true;
            btnAceptar.Click += btnAceptar_Click;
            // 
            // btnCancelar
            // 
            btnCancelar.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
            btnCancelar.DialogResult = DialogResult.Cancel;
            btnCancelar.Location = new Point(810, 441);
            btnCancelar.Margin = new Padding(3, 4, 3, 4);
            btnCancelar.Name = "btnCancelar";
            btnCancelar.Size = new Size(103, 37);
            btnCancelar.TabIndex = 7;
            btnCancelar.Text = "Cancelar";
            btnCancelar.UseVisualStyleBackColor = true;
            // 
            // lblResumen
            // 
            lblResumen.Anchor = AnchorStyles.Bottom | AnchorStyles.Left;
            lblResumen.Font = new Font("Segoe UI", 9F);
            lblResumen.Location = new Point(14, 405);
            lblResumen.Name = "lblResumen";
            lblResumen.Size = new Size(711, 31);
            lblResumen.TabIndex = 5;
            lblResumen.Text = "Entidades en la lista: 0";
            lblResumen.TextAlign = ContentAlignment.MiddleLeft;
            // 
            // lblFooter
            // 
            lblFooter.BackColor = Color.FromArgb(224, 224, 224);
            lblFooter.Dock = DockStyle.Bottom;
            lblFooter.Font = new Font("Segoe UI", 8F);
            lblFooter.ForeColor = Color.DimGray;
            lblFooter.Location = new Point(0, 485);
            lblFooter.Name = "lblFooter";
            lblFooter.Size = new Size(924, 27);
            lblFooter.TabIndex = 8;
            lblFooter.Text = "© 2025 SicoeCAD – Módulo de presupuesto. Uso autorizado únicamente para el proyecto licenciado.";
            lblFooter.TextAlign = ContentAlignment.MiddleCenter;
            // 
            // btnRestablecerDuplicados
            // 
            btnRestablecerDuplicados.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            btnRestablecerDuplicados.Location = new Point(791, 299);
            btnRestablecerDuplicados.Name = "btnRestablecerDuplicados";
            btnRestablecerDuplicados.Size = new Size(120, 30);
            btnRestablecerDuplicados.TabIndex = 21;
            btnRestablecerDuplicados.Text = "Reest. duplic.";
            btnRestablecerDuplicados.UseVisualStyleBackColor = true;
            btnRestablecerDuplicados.Click += btnRestablecerDuplicados_Click;
            // 
            // btnSeparar
            // 
            btnSeparar.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            btnSeparar.Location = new Point(791, 335);
            btnSeparar.Name = "btnSeparar";
            btnSeparar.Size = new Size(120, 30);
            btnSeparar.TabIndex = 22;
            btnSeparar.Text = "Separa x PK_ID";
            btnSeparar.UseVisualStyleBackColor = true;
            // 
            // FrmGestorSeleccionEntidades
            // 
            AcceptButton = btnAceptar;
            AutoScaleDimensions = new SizeF(8F, 20F);
            AutoScaleMode = AutoScaleMode.Font;
            BackColor = Color.FromArgb(229, 247, 248);
            ClientSize = new Size(924, 512);
            Controls.Add(btnSeparar);
            Controls.Add(btnRestablecerDuplicados);
            Controls.Add(lblFooter);
            Controls.Add(lblResumen);
            Controls.Add(btnCancelar);
            Controls.Add(btnAceptar);
            Controls.Add(btnQuitar);
            Controls.Add(btnQuitarDuplicadas);
            Controls.Add(btnUnificarCapa);
            Controls.Add(btnAgregar);
            Controls.Add(dgvEntidades);
            Controls.Add(lblDescripcion);
            Controls.Add(chkSeleccionarTodo);
            Controls.Add(panHeader);
            Margin = new Padding(3, 4, 3, 4);
            MaximizeBox = false;
            MinimizeBox = false;
            Name = "FrmGestorSeleccionEntidades";
            StartPosition = FormStartPosition.CenterParent;
            Text = "Gestor de selección de entidades";
            panHeader.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)pbLogo).EndInit();
            ((System.ComponentModel.ISupportInitialize)dgvEntidades).EndInit();
            ResumeLayout(false);
            PerformLayout();
        }
        private PictureBox pbLogo;
        private Button btnSeparar;
    }
}
