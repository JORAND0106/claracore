using System.Windows.Forms;
using System.Drawing;

namespace SicoePresupuestoNET8
{
    partial class FrmUnirPuntos
    {
        private System.ComponentModel.IContainer components = null;

        private GroupBox grpModo;
        private RadioButton rbLinea;
        private RadioButton rbPline;
        private RadioButton rbPline3d;
        private CheckBox chkCerrar;

        private Label lblPrev;
        private TextBox txtPrev;
        private Label lblNext;
        private TextBox txtNext;

        private Button btnAgregar;
        private Button btnDeshacer;

        private Label lblLayer;

        private Label lblCapitulo;
        private ComboBox cbCapitulo;
        private Label lblCompetencia;
        private ComboBox cbCompetencia;

        private TextBox txtSecuencia;

        private Button btnDibujar;
        private Button btnGuardarEntidad;
        private Label lblEntidades;
        private PictureBox picPreview;
        private Button btnCerrar;
        private Label lblInfo;
        private CheckBox chkCortarNodos;   // NUEVO


        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null)) components.Dispose();
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code
        private void InitializeComponent()
        {
            components = new System.ComponentModel.Container();
            grpModo = new GroupBox();
            rbArc = new RadioButton();
            rbCir2p = new RadioButton();
            rbRec3p = new RadioButton();
            rbLinea = new RadioButton();
            rbPline = new RadioButton();
            rbPline3d = new RadioButton();
            chkCerrar = new CheckBox();
            chkCortarNodos = new CheckBox();
            lblPrev = new Label();
            txtPrev = new TextBox();
            lblNext = new Label();
            txtNext = new TextBox();
            btnDeshacer = new Button();
            btnAgregar = new Button();
            lblLayer = new Label();
            lblCapitulo = new Label();
            cbCapitulo = new ComboBox();
            lblCompetencia = new Label();
            cbCompetencia = new ComboBox();
            txtSecuencia = new TextBox();
            btnDibujar = new Button();
            btnCerrar = new Button();
            lblInfo = new Label();
            btnGuardarEntidad = new Button();
            lblEntidades = new Label();
            picPreview = new PictureBox();
            txtLayer = new TextBox();
            grpBloques = new GroupBox();
            Insblock = new Button();
            toolTip1 = new ToolTip(components);
            grpModo.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)picPreview).BeginInit();
            grpBloques.SuspendLayout();
            SuspendLayout();
            // 
            // grpModo
            // 
            grpModo.BackColor = Color.White;
            grpModo.Controls.Add(rbArc);
            grpModo.Controls.Add(rbCir2p);
            grpModo.Controls.Add(rbRec3p);
            grpModo.Controls.Add(rbLinea);
            grpModo.Controls.Add(rbPline);
            grpModo.Controls.Add(rbPline3d);
            grpModo.Controls.Add(chkCerrar);
            grpModo.Controls.Add(chkCortarNodos);
            grpModo.ForeColor = Color.Black;
            grpModo.Location = new Point(12, 12);
            grpModo.Name = "grpModo";
            grpModo.Size = new Size(511, 90);
            grpModo.TabIndex = 0;
            grpModo.TabStop = false;
            grpModo.Text = "Modo de Dibujo";
            // 
            // rbArc
            // 
            rbArc.AutoSize = true;
            rbArc.Location = new Point(246, 55);
            rbArc.Name = "rbArc";
            rbArc.Size = new Size(61, 24);
            rbArc.TabIndex = 7;
            rbArc.TabStop = true;
            rbArc.Text = "Arco";
            rbArc.UseVisualStyleBackColor = true;
            // 
            // rbCir2p
            // 
            rbCir2p.AutoSize = true;
            rbCir2p.Location = new Point(136, 55);
            rbCir2p.Name = "rbCir2p";
            rbCir2p.Size = new Size(104, 24);
            rbCir2p.TabIndex = 6;
            rbCir2p.TabStop = true;
            rbCir2p.Text = "Cir 2Puntos";
            rbCir2p.UseVisualStyleBackColor = true;
            // 
            // rbRec3p
            // 
            rbRec3p.AutoSize = true;
            rbRec3p.Location = new Point(20, 55);
            rbRec3p.Name = "rbRec3p";
            rbRec3p.Size = new Size(110, 24);
            rbRec3p.TabIndex = 5;
            rbRec3p.TabStop = true;
            rbRec3p.Text = "Rec 3Puntos";
            rbRec3p.UseVisualStyleBackColor = true;
            // 
            // rbLinea
            // 
            rbLinea.AutoSize = true;
            rbLinea.Checked = true;
            rbLinea.Location = new Point(20, 25);
            rbLinea.Name = "rbLinea";
            rbLinea.Size = new Size(65, 24);
            rbLinea.TabIndex = 0;
            rbLinea.TabStop = true;
            rbLinea.Text = "Línea";
            rbLinea.UseVisualStyleBackColor = true;
            // 
            // rbPline
            // 
            rbPline.AutoSize = true;
            rbPline.Location = new Point(100, 25);
            rbPline.Name = "rbPline";
            rbPline.Size = new Size(86, 24);
            rbPline.TabIndex = 1;
            rbPline.Text = "Polilínea";
            rbPline.UseVisualStyleBackColor = true;
            // 
            // rbPline3d
            // 
            rbPline3d.AutoSize = true;
            rbPline3d.Location = new Point(190, 25);
            rbPline3d.Name = "rbPline3d";
            rbPline3d.Size = new Size(109, 24);
            rbPline3d.TabIndex = 2;
            rbPline3d.Text = "Polilínea 3D";
            rbPline3d.UseVisualStyleBackColor = true;
            // 
            // chkCerrar
            // 
            chkCerrar.AutoSize = true;
            chkCerrar.Location = new Point(380, 55);
            chkCerrar.Name = "chkCerrar";
            chkCerrar.Size = new Size(71, 24);
            chkCerrar.TabIndex = 3;
            chkCerrar.Text = "Cerrar";
            chkCerrar.UseVisualStyleBackColor = true;
            // 
            // chkCortarNodos
            // 
            chkCortarNodos.AutoSize = true;
            chkCortarNodos.Location = new Point(380, 25);
            chkCortarNodos.Name = "chkCortarNodos";
            chkCortarNodos.Size = new Size(120, 24);
            chkCortarNodos.TabIndex = 4;
            chkCortarNodos.Text = "Cortar Nodos";
            chkCortarNodos.UseVisualStyleBackColor = true;
            // 
            // lblPrev
            // 
            lblPrev.AutoSize = true;
            lblPrev.Location = new Point(317, 582);
            lblPrev.Name = "lblPrev";
            lblPrev.Size = new Size(108, 20);
            lblPrev.TabIndex = 1;
            lblPrev.Text = "Punto Anterior:";
            // 
            // txtPrev
            // 
            txtPrev.BackColor = Color.LightGray;
            txtPrev.Location = new Point(446, 579);
            txtPrev.Name = "txtPrev";
            txtPrev.ReadOnly = true;
            txtPrev.Size = new Size(120, 27);
            txtPrev.TabIndex = 2;
            // 
            // lblNext
            // 
            lblNext.AutoSize = true;
            lblNext.Location = new Point(317, 615);
            lblNext.Name = "lblNext";
            lblNext.Size = new Size(116, 20);
            lblNext.TabIndex = 3;
            lblNext.Text = "Siguiente Punto:";
            // 
            // txtNext
            // 
            txtNext.Location = new Point(446, 612);
            txtNext.Name = "txtNext";
            txtNext.Size = new Size(120, 27);
            txtNext.TabIndex = 4;
            txtNext.KeyDown += TxtNext_KeyDown;
            // 
            // btnDeshacer
            // 
            btnDeshacer.Location = new Point(572, 612);
            btnDeshacer.Name = "btnDeshacer";
            btnDeshacer.Size = new Size(80, 28);
            btnDeshacer.TabIndex = 6;
            btnDeshacer.Text = "Deshacer";
            btnDeshacer.UseVisualStyleBackColor = true;
            btnDeshacer.Click += BtnDeshacer_Click;
            // 
            // btnAgregar
            // 
            btnAgregar.Location = new Point(572, 582);
            btnAgregar.Name = "btnAgregar";
            btnAgregar.Size = new Size(80, 28);
            btnAgregar.TabIndex = 5;
            btnAgregar.Text = "Agregar";
            btnAgregar.UseVisualStyleBackColor = true;
            btnAgregar.Click += BtnAgregar_Click;
            // 
            // lblLayer
            // 
            lblLayer.AutoSize = true;
            lblLayer.Location = new Point(14, 111);
            lblLayer.Name = "lblLayer";
            lblLayer.Size = new Size(46, 20);
            lblLayer.TabIndex = 7;
            lblLayer.Text = "Capa:";
            // 
            // lblCapitulo
            // 
            lblCapitulo.AutoSize = true;
            lblCapitulo.Location = new Point(504, 111);
            lblCapitulo.Name = "lblCapitulo";
            lblCapitulo.Size = new Size(68, 20);
            lblCapitulo.TabIndex = 9;
            lblCapitulo.Text = "Capítulo:";
            // 
            // cbCapitulo
            // 
            cbCapitulo.DropDownStyle = ComboBoxStyle.DropDownList;
            cbCapitulo.Location = new Point(578, 108);
            cbCapitulo.Name = "cbCapitulo";
            cbCapitulo.Size = new Size(150, 28);
            cbCapitulo.TabIndex = 10;
            // 
            // lblCompetencia
            // 
            lblCompetencia.AutoSize = true;
            lblCompetencia.Location = new Point(748, 111);
            lblCompetencia.Name = "lblCompetencia";
            lblCompetencia.Size = new Size(100, 20);
            lblCompetencia.TabIndex = 11;
            lblCompetencia.Text = "Competencia:";
            // 
            // cbCompetencia
            // 
            cbCompetencia.DropDownStyle = ComboBoxStyle.DropDownList;
            cbCompetencia.Location = new Point(854, 108);
            cbCompetencia.Name = "cbCompetencia";
            cbCompetencia.Size = new Size(150, 28);
            cbCompetencia.TabIndex = 12;
            // 
            // txtSecuencia
            // 
            txtSecuencia.BackColor = Color.White;
            txtSecuencia.Location = new Point(12, 161);
            txtSecuencia.Multiline = true;
            txtSecuencia.Name = "txtSecuencia";
            txtSecuencia.ReadOnly = true;
            txtSecuencia.ScrollBars = ScrollBars.Both;
            txtSecuencia.Size = new Size(299, 412);
            txtSecuencia.TabIndex = 13;
            // 
            // btnDibujar
            // 
            btnDibujar.Location = new Point(835, 582);
            btnDibujar.Name = "btnDibujar";
            btnDibujar.Size = new Size(80, 30);
            btnDibujar.TabIndex = 14;
            btnDibujar.Text = "Dibujar";
            btnDibujar.UseVisualStyleBackColor = true;
            btnDibujar.Click += BtnDibujar_Click;
            // 
            // btnCerrar
            // 
            btnCerrar.Location = new Point(925, 582);
            btnCerrar.Name = "btnCerrar";
            btnCerrar.Size = new Size(80, 30);
            btnCerrar.TabIndex = 15;
            btnCerrar.Text = "Cerrar";
            btnCerrar.UseVisualStyleBackColor = true;
            btnCerrar.Click += BtnCerrar_Click;
            // 
            // lblInfo
            // 
            lblInfo.AutoSize = true;
            lblInfo.ForeColor = Color.Blue;
            lblInfo.Location = new Point(14, 615);
            lblInfo.Name = "lblInfo";
            lblInfo.Size = new Size(258, 20);
            lblInfo.TabIndex = 16;
            lblInfo.Text = "Ingrese los puntos para unir por nodo";
            // 
            // btnGuardarEntidad
            // 
            btnGuardarEntidad.Location = new Point(14, 584);
            btnGuardarEntidad.Name = "btnGuardarEntidad";
            btnGuardarEntidad.Size = new Size(160, 28);
            btnGuardarEntidad.TabIndex = 13;
            btnGuardarEntidad.Text = "Guardar entidad (+)";
            btnGuardarEntidad.UseVisualStyleBackColor = true;
            btnGuardarEntidad.Click += BtnGuardarEntidad_Click;
            // 
            // lblEntidades
            // 
            lblEntidades.AutoSize = true;
            lblEntidades.Location = new Point(182, 589);
            lblEntidades.Name = "lblEntidades";
            lblEntidades.Size = new Size(89, 20);
            lblEntidades.TabIndex = 13;
            lblEntidades.Text = "Entidades: 0";
            // 
            // picPreview
            // 
            picPreview.BackColor = Color.White;
            picPreview.BorderStyle = BorderStyle.FixedSingle;
            picPreview.Location = new Point(317, 161);
            picPreview.Name = "picPreview";
            picPreview.Size = new Size(688, 412);
            picPreview.TabIndex = 13;
            picPreview.TabStop = false;
            // 
            // txtLayer
            // 
            txtLayer.Location = new Point(66, 111);
            txtLayer.Name = "txtLayer";
            txtLayer.Size = new Size(432, 27);
            txtLayer.TabIndex = 17;
            // 
            // grpBloques
            // 
            grpBloques.BackColor = Color.White;
            grpBloques.Controls.Add(Insblock);
            grpBloques.Location = new Point(529, 12);
            grpBloques.Name = "grpBloques";
            grpBloques.Size = new Size(475, 90);
            grpBloques.TabIndex = 18;
            grpBloques.TabStop = false;
            grpBloques.Text = "Bloques";
            // 
            // Insblock
            // 
            Insblock.BackgroundImage = Properties.Resources.Inserta_orienta;
            Insblock.BackgroundImageLayout = ImageLayout.Stretch;
            Insblock.Location = new Point(6, 26);
            Insblock.Name = "Insblock";
            Insblock.Size = new Size(30, 30);
            Insblock.TabIndex = 0;
            toolTip1.SetToolTip(Insblock, "Inserta y orienta Bloques");
            Insblock.UseVisualStyleBackColor = true;
            // 
            // FrmUnirPuntos
            // 
            AcceptButton = btnAgregar;
            AutoScaleMode = AutoScaleMode.None;
            BackColor = Color.FromArgb(244, 248, 255);
            CancelButton = btnCerrar;
            ClientSize = new Size(1017, 655);
            Controls.Add(grpBloques);
            Controls.Add(txtLayer);
            Controls.Add(btnGuardarEntidad);
            Controls.Add(lblEntidades);
            Controls.Add(picPreview);
            Controls.Add(grpModo);
            Controls.Add(lblPrev);
            Controls.Add(txtPrev);
            Controls.Add(lblNext);
            Controls.Add(txtNext);
            Controls.Add(btnDeshacer);
            Controls.Add(btnAgregar);
            Controls.Add(lblLayer);
            Controls.Add(lblCapitulo);
            Controls.Add(cbCapitulo);
            Controls.Add(lblCompetencia);
            Controls.Add(cbCompetencia);
            Controls.Add(txtSecuencia);
            Controls.Add(btnDibujar);
            Controls.Add(btnCerrar);
            Controls.Add(lblInfo);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            Name = "FrmUnirPuntos";
            StartPosition = FormStartPosition.CenterParent;
            Text = "Unir puntos por NODO";
            grpModo.ResumeLayout(false);
            grpModo.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)picPreview).EndInit();
            grpBloques.ResumeLayout(false);
            ResumeLayout(false);
            PerformLayout();
        }
        #endregion

        private RadioButton rbRec3p;
        private RadioButton rbCir2p;
        private TextBox txtLayer;
        private RadioButton rbArc;
        private GroupBox grpBloques;
        private Button Insblock;
        private ToolTip toolTip1;
    }
}