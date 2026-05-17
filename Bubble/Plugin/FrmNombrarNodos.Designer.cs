using System;
using System.Windows.Forms;
using System.Drawing;

namespace SicoePresupuestoNET8
{
    partial class FrmNombrarNodos
    {
        private System.ComponentModel.IContainer components = null;

        // CONTROLES PRINCIPALES
        private DataGridView _grid;
        private Button _btnCargar;
        private Button _btnInforme;
        private Panel panelHeader;
        private Panel panelHeaderAccent;
        private Panel panelResumen;
        private Label lblFooter;

        // ENCABEZADO
        private PictureBox picLogo;
        private Label lblTitulo;
        private Label lblDescripcion;

        // PANEL RESUMEN
        private PictureBox picPreview;
        private Panel panelPreviewCard;
        private Button btnAgregarImagen;
        private GroupBox grpInfoNodo;
        private GroupBox grpCantidades;
        private ToolTip toolTip1;

        // INFO NODO
        private Label lblInfoTitulo;
        private Label lblNombreNodoLabel;
        private Label lblNombreNodoValor;
        private Label lblAbsNodoLabel;
        private Label lblAbsNodoValor;
        private Label lblRasanteLabel;
        private Label lblRasanteValor;
        private Label lblClaveSalidaLabel;
        private Label lblClaveSalidaValor;
        private Label lblDiametroLabel;
        private Label lblDiametroValor;
        private Label lblAncho1Label;
        private Label lblAncho1Valor;
        private Label lblAncho2Label;
        private Label lblAncho2Valor;
        private Label lblAlturaExcLabel;
        private Label lblAlturaExcValor;
        private Label lblAreaExcLabel;
        private Label lblAreaExcValor;
        private Label lblAreaPerimLabel;
        private Label lblAreaPerimValor;
        private Label lblModoAltura;

        // CANTIDADES
        private TableLayoutPanel tblCantidades;
        private CheckBox chkExcav;
        private Label lblExcav;
        private ComboBox cmbExcav;
        private TextBox txtExcav;
        private CheckBox chkRellenoPerim;
        private Label lblRellenoPerim;
        private ComboBox cmbRellenoPerim;
        private TextBox txtRellenoPerim;
        private CheckBox chkEntibado;
        private Label lblEntibado;
        private ComboBox cmbEntibado;
        private TextBox txtEntibado;
        private CheckBox chkNodo;
        private Label lblNodo;
        private ComboBox cmbNodo;
        private TextBox txtNodo;
        private CheckBox chkMamposteria;
        private Label lblMamposteria;
        private ComboBox cmbMamposteria;
        private TextBox txtMamposteria;
        private CheckBox chkPlacaFondo;
        private Label lblPlacaFondo;
        private ComboBox cmbPlacaFondo;
        private TextBox txtPlacaFondo;
        private CheckBox chkPasos;
        private Label lblPasos;
        private ComboBox cmbPasos;
        private TextBox txtPasos;
        private CheckBox chkCanjuela;
        private Label lblCanjuela;
        private ComboBox cmbCanjuela;
        private TextBox txtCanjuela;
        private CheckBox chkAplicarTodosNodos;

        private Panel panelFooterBar;

        #region Windows Form Designer generated code

        private void InitializeComponent()
        {
            // ─── PALETA IDÉNTICA A FrmNombrarTramo ────────────────────────────
            var colorHeader = Color.FromArgb(25, 70, 150);
            var colorHeaderLine = Color.FromArgb(200, 215, 235);
            var colorBgForm = Color.FromArgb(245, 246, 248);
            var colorBgCard = Color.White;
            var colorBorde = Color.FromArgb(218, 220, 224);
            var colorTexto = Color.FromArgb(60, 65, 72);
            var colorTextoSec = Color.FromArgb(120, 126, 135);
            var colorValorBg = Color.FromArgb(248, 249, 250);
            var colorGridHdr = Color.FromArgb(80, 90, 105);
            var colorFooterBg = Color.FromArgb(72, 78, 88);
            var colorBtnPrimary = Color.FromArgb(35, 80, 165);
            var colorBtnSecBg = Color.FromArgb(238, 239, 241);
            var colorBtnSecFore = Color.FromArgb(70, 75, 85);
            // ──────────────────────────────────────────────────────────────────

            components = new System.ComponentModel.Container();
            _grid = new DataGridView();
            _btnCargar = new Button();
            _btnInforme = new Button();
            panelHeader = new Panel();
            panelHeaderAccent = new Panel();
            picLogo = new PictureBox();
            lblTitulo = new Label();
            lblDescripcion = new Label();
            panelResumen = new Panel();
            grpInfoNodo = new GroupBox();
            lblInfoTitulo = new Label();
            lblNombreNodoLabel = new Label(); lblNombreNodoValor = new Label();
            lblAbsNodoLabel = new Label(); lblAbsNodoValor = new Label();
            lblRasanteLabel = new Label(); lblRasanteValor = new Label();
            lblClaveSalidaLabel = new Label(); lblClaveSalidaValor = new Label();
            lblDiametroLabel = new Label(); lblDiametroValor = new Label();
            lblAncho1Label = new Label(); lblAncho1Valor = new Label();
            lblAncho2Label = new Label(); lblAncho2Valor = new Label();
            lblAlturaExcLabel = new Label(); lblAlturaExcValor = new Label();
            lblAreaExcLabel = new Label(); lblAreaExcValor = new Label();
            lblAreaPerimLabel = new Label(); lblAreaPerimValor = new Label();
            lblModoAltura = new Label();
            btnAgregarImagen = new Button();
            picPreview = new PictureBox();
            panelPreviewCard = new Panel();
            grpCantidades = new GroupBox();
            tblCantidades = new TableLayoutPanel();
            chkExcav = new CheckBox(); lblExcav = new Label(); cmbExcav = new ComboBox(); txtExcav = new TextBox();
            chkRellenoPerim = new CheckBox(); lblRellenoPerim = new Label(); cmbRellenoPerim = new ComboBox(); txtRellenoPerim = new TextBox();
            chkEntibado = new CheckBox(); lblEntibado = new Label(); cmbEntibado = new ComboBox(); txtEntibado = new TextBox();
            chkNodo = new CheckBox(); lblNodo = new Label(); cmbNodo = new ComboBox(); txtNodo = new TextBox();
            chkMamposteria = new CheckBox(); lblMamposteria = new Label(); cmbMamposteria = new ComboBox(); txtMamposteria = new TextBox();
            chkPlacaFondo = new CheckBox(); lblPlacaFondo = new Label(); cmbPlacaFondo = new ComboBox(); txtPlacaFondo = new TextBox();
            chkPasos = new CheckBox(); lblPasos = new Label(); cmbPasos = new ComboBox(); txtPasos = new TextBox();
            chkCanjuela = new CheckBox(); lblCanjuela = new Label(); cmbCanjuela = new ComboBox(); txtCanjuela = new TextBox();
            chkAplicarTodosNodos = new CheckBox();
            lblFooter = new Label();
            toolTip1 = new ToolTip(components);
            panelFooterBar = new Panel();

            ((System.ComponentModel.ISupportInitialize)_grid).BeginInit();
            panelHeader.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)picLogo).BeginInit();
            panelResumen.SuspendLayout();
            panelPreviewCard.SuspendLayout();
            grpInfoNodo.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)picPreview).BeginInit();
            grpCantidades.SuspendLayout();
            tblCantidades.SuspendLayout();
            panelFooterBar.SuspendLayout();
            SuspendLayout();

            // FORM
            AutoScaleDimensions = new SizeF(8F, 20F);
            AutoScaleMode = AutoScaleMode.Font;
            BackColor = colorBgForm;
            ClientSize = new Size(1200, 660);
            Font = new Font("Segoe UI", 9F);
            Name = "FrmNombrarNodos";
            StartPosition = FormStartPosition.CenterParent;
            Text = "Información de nodos";

            // HEADER
            panelHeader.BackColor = colorHeader;
            panelHeader.Dock = DockStyle.Top;
            panelHeader.Name = "panelHeader";
            panelHeader.Padding = new Padding(10, 8, 10, 0);
            panelHeader.Size = new Size(1200, 78);
            panelHeader.TabIndex = 0;
            panelHeader.Controls.Add(picLogo);
            panelHeader.Controls.Add(lblTitulo);
            panelHeader.Controls.Add(lblDescripcion);
            panelHeader.Controls.Add(panelHeaderAccent);

            panelHeaderAccent.BackColor = colorHeaderLine;
            panelHeaderAccent.Dock = DockStyle.Bottom;
            panelHeaderAccent.Height = 1;
            panelHeaderAccent.Name = "panelHeaderAccent";

            picLogo.BackgroundImage = Properties.Resources.SicoeCAD1;
            picLogo.BackgroundImageLayout = ImageLayout.Stretch;
            picLogo.Location = new Point(14, 11);
            picLogo.Name = "picLogo";
            picLogo.Size = new Size(128, 52);
            picLogo.SizeMode = PictureBoxSizeMode.Zoom;
            picLogo.TabIndex = 0;
            picLogo.TabStop = false;

            lblTitulo.Font = new Font("Segoe UI", 12F, FontStyle.Bold);
            lblTitulo.ForeColor = Color.White;
            lblTitulo.Location = new Point(150, 10);
            lblTitulo.Name = "lblTitulo";
            lblTitulo.Size = new Size(1032, 32);
            lblTitulo.TabIndex = 1;
            lblTitulo.Text = "Información de nodos";
            lblTitulo.TextAlign = ContentAlignment.MiddleCenter;

            lblDescripcion.Font = new Font("Segoe UI", 8.5F, FontStyle.Italic);
            lblDescripcion.ForeColor = Color.FromArgb(200, 215, 240);
            lblDescripcion.Location = new Point(150, 44);
            lblDescripcion.Name = "lblDescripcion";
            lblDescripcion.Size = new Size(1032, 24);
            lblDescripcion.TabIndex = 2;
            lblDescripcion.Text = "Asigne nombres de nodo, parámetros geométricos y vincule los ítems de presupuesto asociados a cada nodo.";
            lblDescripcion.TextAlign = ContentAlignment.TopCenter;

            // PANEL RESUMEN
            panelResumen.BackColor = colorBgForm;
            panelResumen.Dock = DockStyle.Top;
            panelResumen.Name = "panelResumen";
            panelResumen.Padding = new Padding(10, 10, 10, 10);
            panelResumen.Size = new Size(1200, 262);
            panelResumen.TabIndex = 1;
            panelResumen.Controls.Add(grpCantidades);
            panelResumen.Controls.Add(grpInfoNodo);
            panelResumen.Controls.Add(panelPreviewCard);

            // PREVIEW CARD — igual que FrmNombrarTramo
            panelPreviewCard.BackColor = colorBgCard;
            panelPreviewCard.BorderStyle = BorderStyle.None;
            panelPreviewCard.Dock = DockStyle.Left;
            panelPreviewCard.Name = "panelPreviewCard";
            panelPreviewCard.Padding = new Padding(3);
            panelPreviewCard.Size = new Size(242, 242);
            panelPreviewCard.TabIndex = 0;
            panelPreviewCard.Controls.Add(picPreview);
            panelPreviewCard.Controls.Add(btnAgregarImagen);
            panelPreviewCard.Paint += (s, e) => {
                var rc = panelPreviewCard.ClientRectangle;
                rc.Width--; rc.Height--;
                using var p = new System.Drawing.Pen(colorBorde, 1f);
                e.Graphics.DrawRectangle(p, rc);
            };

            picPreview.BackColor = Color.FromArgb(252, 252, 253);
            picPreview.BorderStyle = BorderStyle.None;
            picPreview.Dock = DockStyle.Fill;
            picPreview.Name = "picPreview";
            picPreview.Size = new Size(236, 236);
            picPreview.SizeMode = PictureBoxSizeMode.Zoom;
            picPreview.TabIndex = 0;
            picPreview.TabStop = false;

            btnAgregarImagen.BackColor = colorBorde;
            btnAgregarImagen.FlatStyle = FlatStyle.Flat;
            btnAgregarImagen.FlatAppearance.BorderSize = 0;
            btnAgregarImagen.Font = new Font("Segoe UI", 8F);
            btnAgregarImagen.ForeColor = colorTextoSec;
            btnAgregarImagen.Location = new Point(3, 3);
            btnAgregarImagen.Name = "btnAgregarImagen";
            btnAgregarImagen.Size = new Size(24, 22);
            btnAgregarImagen.TabIndex = 1;
            btnAgregarImagen.Text = "+";
            btnAgregarImagen.UseVisualStyleBackColor = false;
            toolTip1.SetToolTip(btnAgregarImagen, "Agregar gráfico de referencia del nodo");
            btnAgregarImagen.Click += BtnAgregarImagen_Click;

            // GRP INFO NODO
            grpInfoNodo.BackColor = colorBgCard;
            grpInfoNodo.Font = new Font("Segoe UI", 8.5F, FontStyle.Bold);
            grpInfoNodo.ForeColor = colorTexto;
            grpInfoNodo.Location = new Point(262, 10);
            grpInfoNodo.Name = "grpInfoNodo";
            grpInfoNodo.Padding = new Padding(8, 12, 8, 8);
            grpInfoNodo.Size = new Size(342, 242);
            grpInfoNodo.TabIndex = 2;
            grpInfoNodo.TabStop = false;
            grpInfoNodo.Text = "  Información del nodo";
            grpInfoNodo.Controls.Add(lblInfoTitulo);
            grpInfoNodo.Controls.Add(lblNombreNodoLabel); grpInfoNodo.Controls.Add(lblNombreNodoValor);
            grpInfoNodo.Controls.Add(lblAbsNodoLabel); grpInfoNodo.Controls.Add(lblAbsNodoValor);
            grpInfoNodo.Controls.Add(lblRasanteLabel); grpInfoNodo.Controls.Add(lblRasanteValor);
            grpInfoNodo.Controls.Add(lblClaveSalidaLabel); grpInfoNodo.Controls.Add(lblClaveSalidaValor);
            grpInfoNodo.Controls.Add(lblDiametroLabel); grpInfoNodo.Controls.Add(lblDiametroValor);
            grpInfoNodo.Controls.Add(lblAncho1Label); grpInfoNodo.Controls.Add(lblAncho1Valor);
            grpInfoNodo.Controls.Add(lblAncho2Label); grpInfoNodo.Controls.Add(lblAncho2Valor);
            grpInfoNodo.Controls.Add(lblAlturaExcLabel); grpInfoNodo.Controls.Add(lblAlturaExcValor);
            grpInfoNodo.Controls.Add(lblAreaExcLabel); grpInfoNodo.Controls.Add(lblAreaExcValor);
            grpInfoNodo.Controls.Add(lblAreaPerimLabel); grpInfoNodo.Controls.Add(lblAreaPerimValor);
            grpInfoNodo.Controls.Add(lblModoAltura);

            // Título del panel info
            lblInfoTitulo.Font = new Font("Segoe UI", 8.5F, FontStyle.Bold);
            lblInfoTitulo.ForeColor = colorTexto;
            lblInfoTitulo.Location = new Point(10, 20);
            lblInfoTitulo.Name = "lblInfoTitulo";
            lblInfoTitulo.Size = new Size(200, 18);
            lblInfoTitulo.TabIndex = 0;
            lblInfoTitulo.Text = "Nodo seleccionado";
            lblInfoTitulo.TextAlign = ContentAlignment.MiddleLeft;

            // Columna izquierda: 9 filas de label + valor (x=10 / x=140)
            (Label lN, Label lV, string nN, string nV, string txt,
             int y, int tiN, int tiV, int wV)[] infoFilas = {
                (lblNombreNodoLabel, lblNombreNodoValor,  "lblNombreNodoLabel",  "lblNombreNodoValor",  "Nombre nodo:",        45, 1,  2,  170),
                (lblAbsNodoLabel,    lblAbsNodoValor,     "lblAbsNodoLabel",     "lblAbsNodoValor",     "Abscisa nodo:",       65, 3,  4,  170),
                (lblRasanteLabel,    lblRasanteValor,     "lblRasanteLabel",     "lblRasanteValor",     "Rasante (m):",        85, 5,  6,   80),
                (lblClaveSalidaLabel,lblClaveSalidaValor, "lblClaveSalidaLabel", "lblClaveSalidaValor", "Clave salida (m):",  105, 7,  8,   80),
                (lblDiametroLabel,   lblDiametroValor,    "lblDiametroLabel",    "lblDiametroValor",    "Diámetro salida (m):",125, 9, 10,   80),
                (lblAncho1Label,     lblAncho1Valor,      "lblAncho1Label",      "lblAncho1Valor",      "Área Externa (m²):",       145,11, 12,   80),
                (lblAncho2Label,     lblAncho2Valor,      "lblAncho2Label",      "lblAncho2Valor",      "Área Interna (m²):",       165,13, 14,   80),
                (lblAlturaExcLabel,  lblAlturaExcValor,   "lblAlturaExcLabel",   "lblAlturaExcValor",   "Altura exc. (m):",   185,15, 16,   80),
                (lblAreaExcLabel,    lblAreaExcValor,     "lblAreaExcLabel",     "lblAreaExcValor",     "Área exc. (m²):",    205,17, 18,   80),
            };

            foreach (var f in infoFilas)
            {
                f.lN.Font = new Font("Segoe UI", 8.5F);
                f.lN.ForeColor = colorTextoSec;
                f.lN.Location = new Point(10, f.y);
                f.lN.Name = f.nN;
                f.lN.Size = new Size(128, 18);
                f.lN.TabIndex = f.tiN;
                f.lN.Text = f.txt;

                f.lV.BackColor = colorValorBg;
                f.lV.BorderStyle = BorderStyle.None;
                f.lV.Font = new Font("Segoe UI", 8.5F);
                f.lV.ForeColor = colorTexto;
                f.lV.Location = new Point(140, f.y);
                f.lV.Name = f.nV;
                f.lV.Size = new Size(f.wV, 18);
                f.lV.TabIndex = f.tiV;
                f.lV.TextAlign = ContentAlignment.MiddleRight;
                f.lV.Padding = new Padding(0, 0, 4, 0);
            }

            // Columna derecha: Área perimetral (posición original conservada x=226)
            lblAreaPerimLabel.Font = new Font("Segoe UI", 8.5F);
            lblAreaPerimLabel.ForeColor = colorTextoSec;
            lblAreaPerimLabel.Location = new Point(226, 96);
            lblAreaPerimLabel.Name = "lblAreaPerimLabel";
            lblAreaPerimLabel.Size = new Size(94, 38);
            lblAreaPerimLabel.TabIndex = 19;
            lblAreaPerimLabel.Text = "Área Rell. Perim (m²):";
            lblAreaPerimLabel.TextAlign = ContentAlignment.MiddleCenter;

            lblAreaPerimValor.BackColor = colorValorBg;
            lblAreaPerimValor.BorderStyle = BorderStyle.None;
            lblAreaPerimValor.Font = new Font("Segoe UI", 8.5F);
            lblAreaPerimValor.ForeColor = colorTexto;
            lblAreaPerimValor.Location = new Point(226, 134);
            lblAreaPerimValor.Name = "lblAreaPerimValor";
            lblAreaPerimValor.Size = new Size(98, 31);
            lblAreaPerimValor.TabIndex = 20;
            lblAreaPerimValor.TextAlign = ContentAlignment.MiddleRight;
            lblAreaPerimValor.Padding = new Padding(0, 0, 4, 0);

            lblModoAltura.Font = new Font("Segoe UI", 8F, FontStyle.Italic);
            lblModoAltura.ForeColor = colorTextoSec;
            lblModoAltura.Location = new Point(226, 165);
            lblModoAltura.Name = "lblModoAltura";
            lblModoAltura.Size = new Size(94, 58);
            lblModoAltura.TabIndex = 21;
            lblModoAltura.Text = "Altura auto calculada";
            lblModoAltura.TextAlign = ContentAlignment.MiddleCenter;

            // GRP CANTIDADES
            grpCantidades.BackColor = colorBgCard;
            grpCantidades.Dock = DockStyle.Right;
            grpCantidades.Font = new Font("Segoe UI", 8.5F, FontStyle.Bold);
            grpCantidades.ForeColor = colorTexto;
            grpCantidades.Name = "grpCantidades";
            grpCantidades.Padding = new Padding(6, 12, 6, 6);
            grpCantidades.Size = new Size(576, 242);
            grpCantidades.TabIndex = 3;
            grpCantidades.TabStop = false;
            grpCantidades.Text = "  Cantidades del nodo  (vinculación a presupuesto)";
            grpCantidades.Controls.Add(tblCantidades);
            grpCantidades.Controls.Add(chkAplicarTodosNodos);

            // Posición en barra del título del GroupBox (y=0), igual que FrmNombrarTramo
            chkAplicarTodosNodos.AutoSize = true;
            chkAplicarTodosNodos.Font = new Font("Segoe UI", 8.5F);
            chkAplicarTodosNodos.ForeColor = colorTextoSec;
            chkAplicarTodosNodos.Location = new Point(370, 0);
            chkAplicarTodosNodos.Name = "chkAplicarTodosNodos";
            chkAplicarTodosNodos.Size = new Size(210, 22);
            chkAplicarTodosNodos.TabIndex = 1;
            chkAplicarTodosNodos.Text = "Aplicar a todos los nodos";
            chkAplicarTodosNodos.CheckedChanged += ChkAplicarTodosNodos_CheckedChanged;

            // TABLA CANTIDADES — 8 filas, col2 = 180px (igual que original)
            tblCantidades.BackColor = colorBgCard;
            tblCantidades.ColumnCount = 4;
            tblCantidades.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 28F));
            tblCantidades.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 180F));
            tblCantidades.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 70F));
            tblCantidades.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 30F));
            tblCantidades.Dock = DockStyle.Fill;
            tblCantidades.Location = new Point(6, 24);
            tblCantidades.Name = "tblCantidades";
            tblCantidades.RowCount = 8;
            for (int r = 0; r < 8; r++)
                tblCantidades.RowStyles.Add(new RowStyle(SizeType.Absolute, 26F));
            tblCantidades.Size = new Size(578, 210);
            tblCantidades.TabIndex = 0;

            tblCantidades.Controls.Add(chkExcav, 0, 0); tblCantidades.Controls.Add(lblExcav, 1, 0); tblCantidades.Controls.Add(cmbExcav, 2, 0); tblCantidades.Controls.Add(txtExcav, 3, 0);
            tblCantidades.Controls.Add(chkRellenoPerim, 0, 1); tblCantidades.Controls.Add(lblRellenoPerim, 1, 1); tblCantidades.Controls.Add(cmbRellenoPerim, 2, 1); tblCantidades.Controls.Add(txtRellenoPerim, 3, 1);
            tblCantidades.Controls.Add(chkEntibado, 0, 2); tblCantidades.Controls.Add(lblEntibado, 1, 2); tblCantidades.Controls.Add(cmbEntibado, 2, 2); tblCantidades.Controls.Add(txtEntibado, 3, 2);
            tblCantidades.Controls.Add(chkNodo, 0, 3); tblCantidades.Controls.Add(lblNodo, 1, 3); tblCantidades.Controls.Add(cmbNodo, 2, 3); tblCantidades.Controls.Add(txtNodo, 3, 3);
            tblCantidades.Controls.Add(chkMamposteria, 0, 4); tblCantidades.Controls.Add(lblMamposteria, 1, 4); tblCantidades.Controls.Add(cmbMamposteria, 2, 4); tblCantidades.Controls.Add(txtMamposteria, 3, 4);
            tblCantidades.Controls.Add(chkPlacaFondo, 0, 5); tblCantidades.Controls.Add(lblPlacaFondo, 1, 5); tblCantidades.Controls.Add(cmbPlacaFondo, 2, 5); tblCantidades.Controls.Add(txtPlacaFondo, 3, 5);
            tblCantidades.Controls.Add(chkPasos, 0, 6); tblCantidades.Controls.Add(lblPasos, 1, 6); tblCantidades.Controls.Add(cmbPasos, 2, 6); tblCantidades.Controls.Add(txtPasos, 3, 6);
            tblCantidades.Controls.Add(chkCanjuela, 0, 7); tblCantidades.Controls.Add(lblCanjuela, 1, 7); tblCantidades.Controls.Add(cmbCanjuela, 2, 7); tblCantidades.Controls.Add(txtCanjuela, 3, 7);

            // Estilos filas de cantidades
            // NOTA: todos los combos usan DropDownList (a diferencia de FrmNombrarTramo)
            // Todos los checkboxes comparten ChkCantidades_CheckedChanged
            (CheckBox chk, Label lbl, ComboBox cmb, TextBox txt,
             string nChk, string nLbl, string nCmb, string nTxt,
             string texto, string tip, int tiChk, int tiCmb, int tiTxt)[] filas = {
                (chkExcav,        lblExcav,        cmbExcav,        txtExcav,        "chkExcav",        "lblExcav",        "cmbExcav",        "txtExcav",        "Excavación (m³)",          "Volumen de excavación del nodo (m³).",                        0,  2,  3),
                (chkRellenoPerim, lblRellenoPerim, cmbRellenoPerim, txtRellenoPerim, "chkRellenoPerim", "lblRellenoPerim", "cmbRellenoPerim", "txtRellenoPerim", "Relleno perimetral (m³)",  "Volumen de relleno perimetral del nodo (m³).",                4,  6,  7),
                (chkEntibado,     lblEntibado,     cmbEntibado,     txtEntibado,     "chkEntibado",     "lblEntibado",     "cmbEntibado",     "txtEntibado",     "Entibado (m²)",            "Área entibada en paredes del nodo (m²).",                     8, 10, 11),
                (chkNodo,         lblNodo,         cmbNodo,         txtNodo,         "chkNodo",         "lblNodo",         "cmbNodo",         "txtNodo",         "Caja/Camara/Pozo (und)",   "Nodo como ítem unitario.",                                   12, 14, 15),
                (chkMamposteria,  lblMamposteria,  cmbMamposteria,  txtMamposteria,  "chkMamposteria",  "lblMamposteria",  "cmbMamposteria",  "txtMamposteria",  "Mampostería",              "Mampostería de muros del nodo (m³ o m según diseño).",       16, 18, 19),
                (chkPlacaFondo,   lblPlacaFondo,   cmbPlacaFondo,   txtPlacaFondo,   "chkPlacaFondo",   "lblPlacaFondo",  "cmbPlacaFondo",   "txtPlacaFondo",   "Placa de fondo (und)",     "Placa de fondo del nodo (unidad).",                          20, 22, 23),
                (chkPasos,        lblPasos,        cmbPasos,        txtPasos,        "chkPasos",        "lblPasos",        "cmbPasos",        "txtPasos",        "Pasos (und)",              "Cantidad de pasos metálicos del nodo.",                      24, 26, 27),
                (chkCanjuela,     lblCanjuela,     cmbCanjuela,     txtCanjuela,     "chkCanjuela",     "lblCanjuela",     "cmbCanjuela",     "txtCanjuela",     "Cañuela (und)",            "Cañuela del nodo (unidad).",                                 28, 30, 31),
            };

            foreach (var f in filas)
            {
                f.chk.Anchor = AnchorStyles.Left; f.chk.Name = f.nChk;
                f.chk.Size = new Size(22, 18); f.chk.TabIndex = f.tiChk;
                toolTip1.SetToolTip(f.chk, f.tip);
                f.chk.CheckedChanged += ChkCantidades_CheckedChanged;   // handler único

                f.lbl.Anchor = AnchorStyles.Left; f.lbl.AutoSize = true;
                f.lbl.Font = new Font("Segoe UI", 8.5F);
                f.lbl.ForeColor = colorTexto;
                f.lbl.Name = f.nLbl; f.lbl.TabIndex = f.tiChk + 1; f.lbl.Text = f.texto;

                f.cmb.Anchor = AnchorStyles.Left | AnchorStyles.Right;
                f.cmb.AutoCompleteMode = AutoCompleteMode.SuggestAppend;
                f.cmb.AutoCompleteSource = AutoCompleteSource.ListItems;
                f.cmb.DropDownStyle = ComboBoxStyle.DropDownList;   // igual que original
                f.cmb.FlatStyle = FlatStyle.Flat;
                f.cmb.Font = new Font("Segoe UI", 8.5F);
                f.cmb.BackColor = Color.White;
                f.cmb.Name = f.nCmb;
                f.cmb.Size = new Size(100, 24);
                f.cmb.TabIndex = f.tiCmb;

                f.txt.Anchor = AnchorStyles.Left | AnchorStyles.Right;
                f.txt.BackColor = colorValorBg;
                f.txt.BorderStyle = BorderStyle.FixedSingle;
                f.txt.Font = new Font("Segoe UI", 8.5F);
                f.txt.ForeColor = colorTexto;
                f.txt.Name = f.nTxt; f.txt.ReadOnly = true;
                f.txt.Size = new Size(100, 24); f.txt.TabIndex = f.tiTxt;
                f.txt.TextAlign = HorizontalAlignment.Right;
            }

            // GRID — 3 eventos (igual que original, más que FrmNombrarTramo)
            _grid.AllowUserToAddRows = false;
            _grid.AllowUserToDeleteRows = false;
            _grid.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            _grid.BackgroundColor = colorBgForm;
            _grid.BorderStyle = BorderStyle.None;
            _grid.ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.AutoSize;
            _grid.ColumnHeadersDefaultCellStyle.BackColor = colorGridHdr;
            _grid.ColumnHeadersDefaultCellStyle.ForeColor = Color.White;
            _grid.ColumnHeadersDefaultCellStyle.Font = new Font("Segoe UI", 8.5F, FontStyle.Bold);
            _grid.DefaultCellStyle.BackColor = Color.White;
            _grid.DefaultCellStyle.SelectionBackColor = Color.FromArgb(228, 232, 240);
            _grid.DefaultCellStyle.SelectionForeColor = colorTexto;
            _grid.DefaultCellStyle.Font = new Font("Segoe UI", 8.5F);
            _grid.GridColor = Color.FromArgb(225, 226, 228);
            _grid.Location = new Point(0, 340);
            _grid.MultiSelect = false;
            _grid.Name = "_grid";
            _grid.RowHeadersVisible = false;
            _grid.RowHeadersWidth = 51;
            _grid.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
            _grid.Size = new Size(1200, 210);
            _grid.TabIndex = 2;
            _grid.EnableHeadersVisualStyles = false;
            _grid.CellBeginEdit += Grid_CellBeginEdit;
            _grid.CellEndEdit += Grid_CellEndEdit;
            _grid.SelectionChanged += Grid_SelectionChanged;

            // FOOTER BAR — idéntico a FrmNombrarTramo
            panelFooterBar.BackColor = colorFooterBg;
            panelFooterBar.Dock = DockStyle.Bottom;
            panelFooterBar.Height = 94;
            panelFooterBar.Name = "panelFooterBar";
            panelFooterBar.Padding = new Padding(12, 7, 12, 5);
            panelFooterBar.Controls.Add(_btnCargar);
            panelFooterBar.Controls.Add(_btnInforme);
            panelFooterBar.Controls.Add(lblFooter);

            _btnCargar.BackColor = colorBtnPrimary;
            _btnCargar.Dock = DockStyle.Top;
            _btnCargar.FlatStyle = FlatStyle.Flat;
            _btnCargar.FlatAppearance.BorderColor = Color.FromArgb(60, 100, 180);
            _btnCargar.FlatAppearance.BorderSize = 1;
            _btnCargar.FlatAppearance.MouseOverBackColor = Color.FromArgb(45, 95, 175);
            _btnCargar.Font = new Font("Segoe UI", 9.5F, FontStyle.Bold);
            _btnCargar.ForeColor = Color.White;
            _btnCargar.Name = "_btnCargar";
            _btnCargar.Size = new Size(1176, 36);
            _btnCargar.TabIndex = 3;
            _btnCargar.Text = "▶   Enviar a presupuesto";
            _btnCargar.UseVisualStyleBackColor = false;
            _btnCargar.Click += BtnCargar_Click;

            lblFooter.Dock = DockStyle.Bottom;
            lblFooter.Font = new Font("Segoe UI", 7.5F, FontStyle.Italic);
            lblFooter.ForeColor = Color.FromArgb(150, 155, 165);
            lblFooter.BackColor = Color.Transparent;
            lblFooter.Name = "lblFooter";
            lblFooter.Size = new Size(1176, 18);
            lblFooter.TabIndex = 5;
            lblFooter.Text = "© 2025 SicoeCAD® – Derechos reservados. Uso autorizado únicamente para el proyecto licenciado.";
            lblFooter.TextAlign = ContentAlignment.MiddleCenter;

            // ARMAR FORM
            Controls.Add(_grid);
            Controls.Add(panelResumen);
            Controls.Add(panelHeader);
            Controls.Add(panelFooterBar);

            ((System.ComponentModel.ISupportInitialize)_grid).EndInit();
            panelHeader.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)picLogo).EndInit();
            panelResumen.ResumeLayout(false);
            panelPreviewCard.ResumeLayout(false);
            grpInfoNodo.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)picPreview).EndInit();
            grpCantidades.ResumeLayout(false);
            grpCantidades.PerformLayout();
            tblCantidades.ResumeLayout(false);
            tblCantidades.PerformLayout();
            panelFooterBar.ResumeLayout(false);
            ResumeLayout(false);
        }

        #endregion
    }
}