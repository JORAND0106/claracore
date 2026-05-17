using System;
using System.Windows.Forms;

namespace SicoePresupuestoNET8
{
    partial class FrmNombrarTramo
    {
        private System.ComponentModel.IContainer components = null;

        private System.Windows.Forms.DataGridView _grid;
        private System.Windows.Forms.Button _btnCargar;
        private System.Windows.Forms.Button _btnInforme;
        private System.Windows.Forms.Button _btnAyuda;
        private System.Windows.Forms.Panel panelResumen;
        private System.Windows.Forms.Label lblResumen;
        private PictureBox picPreview;
        private Button btnAgregarImagen;
        private ToolTip toolTip1;

        private Panel panelHeader;
        private Panel panelHeaderAccent;
        private PictureBox picLogo;
        private Label lblTitulo;
        private Label lblDescripcion;

        private GroupBox grpInfoTramo;
        private Label lblRasantePromLabel;
        private Label lblClavePromLabel;
        private Label lblFondoExcLabel;
        private Label lblAlturaExcLabel;
        private Label lblPendienteLabel;
        private Label lblAreaTubLabel;
        private Label lblRasantePromValor;
        private Label lblClavePromValor;
        private Label lblFondoExcValor;
        private Label lblAlturaExcValor;
        private Label lblPendienteValor;
        private Label lblAreaTubValor;
        private Label lblAreaSegAtraqueLabel;
        private Label lblAreaSegRellenoLabel;
        private Label lblAreaSegAtraqueValor;
        private Label lblAreaSegRellenoValor;

        private GroupBox grpCantidades;
        private TableLayoutPanel tblCantidades;

        private CheckBox chkExcav;
        private CheckBox chkAtraque;
        private CheckBox chkLong;
        private CheckBox chkRelleno;
        private CheckBox chkEntibado;
        private CheckBox chkCinta;
        private CheckBox chkOtros;
        private Label lblExcav;
        private Label lblAtraque;
        private Label lblLong;
        private Label lblRelleno;
        private Label lblEntibado;
        private Label lblCinta;
        private Label lblOtros;
        private ComboBox cmbExcav;
        private ComboBox cmbAtraque;
        private ComboBox cmbLong;
        private ComboBox cmbRelleno;
        private ComboBox cmbEntibado;
        private ComboBox cmbCinta;
        private ComboBox cmbOtros;
        private TextBox txtExcav;
        private TextBox txtAtraque;
        private TextBox txtLong;
        private TextBox txtRelleno;
        private TextBox txtEntibado;
        private TextBox txtCinta;
        private TextBox txtOtros;

        private CheckBox chkCampana1;
        private Label lblCampana1;
        private ComboBox cmbCampana1;
        private TextBox txtCampana1;
        private CheckBox chkCampana2;
        private Label lblCampana2;
        private ComboBox cmbCampana2;
        private TextBox txtCampana2;

        private Panel panelPreviewCard;
        private Panel panelFooterBar;
        private Label lblFooter;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null)) components.Dispose();
            base.Dispose(disposing);
        }

        #region Código generado por el Diseñador de Windows Forms

        private void InitializeComponent()
        {
            // ─── PALETA: header azul, todo lo demás blanco/gris ───────────────
            var colorHeader = System.Drawing.Color.FromArgb(25, 70, 150);   // azul SOLO para header
            var colorHeaderLine = System.Drawing.Color.FromArgb(200, 215, 235);   // línea separadora pálida
            var colorBgForm = System.Drawing.Color.FromArgb(245, 246, 248);   // gris muy claro, neutro
            var colorBgCard = System.Drawing.Color.White;
            var colorBorde = System.Drawing.Color.FromArgb(218, 220, 224);   // gris borde sutil
            var colorTexto = System.Drawing.Color.FromArgb(60, 65, 72);   // gris oscuro legible
            var colorTextoSec = System.Drawing.Color.FromArgb(120, 126, 135);   // gris medio
            var colorValorBg = System.Drawing.Color.FromArgb(248, 249, 250);   // casi blanco
            var colorGridHdr = System.Drawing.Color.FromArgb(80, 90, 105);   // gris oscuro (NO azul)
            var colorFooterBg = System.Drawing.Color.FromArgb(72, 78, 88);   // gris oscuro neutro
            var colorBtnPrimary = System.Drawing.Color.FromArgb(35, 80, 165);   // azul, solo en botón principal
            var colorBtnSecBg = System.Drawing.Color.FromArgb(238, 239, 241);   // gris claro botón secundario
            var colorBtnSecFore = System.Drawing.Color.FromArgb(70, 75, 85);   // gris texto botón secundario
            // ──────────────────────────────────────────────────────────────────

            components = new System.ComponentModel.Container();
            _grid = new DataGridView();
            panelResumen = new Panel();
            grpCantidades = new GroupBox();
            chkAplicarTodos = new CheckBox();
            tblCantidades = new TableLayoutPanel();
            chkExcav = new CheckBox(); lblExcav = new Label(); cmbExcav = new ComboBox(); txtExcav = new TextBox();
            chkAtraque = new CheckBox(); lblAtraque = new Label(); cmbAtraque = new ComboBox(); txtAtraque = new TextBox();
            chkLong = new CheckBox(); lblLong = new Label(); cmbLong = new ComboBox(); txtLong = new TextBox();
            chkRelleno = new CheckBox(); lblRelleno = new Label(); cmbRelleno = new ComboBox(); txtRelleno = new TextBox();
            chkEntibado = new CheckBox(); lblEntibado = new Label(); cmbEntibado = new ComboBox(); txtEntibado = new TextBox();
            chkCinta = new CheckBox(); lblCinta = new Label(); cmbCinta = new ComboBox(); txtCinta = new TextBox();
            chkOtros = new CheckBox(); lblOtros = new Label(); cmbOtros = new ComboBox(); txtOtros = new TextBox();
            chkCampana1 = new CheckBox(); lblCampana1 = new Label(); cmbCampana1 = new ComboBox(); txtCampana1 = new TextBox();
            chkCampana2 = new CheckBox(); lblCampana2 = new Label(); cmbCampana2 = new ComboBox(); txtCampana2 = new TextBox();
            btnAgregarImagen = new Button();
            picPreview = new PictureBox();
            panelPreviewCard = new Panel();
            grpInfoTramo = new GroupBox();
            lblRasantePromLabel = new Label(); lblClavePromLabel = new Label(); lblFondoExcLabel = new Label();
            lblAlturaExcLabel = new Label(); lblPendienteLabel = new Label(); lblAreaTubLabel = new Label();
            lblAreaSegAtraqueLabel = new Label(); lblAreaSegRellenoLabel = new Label();
            lblRasantePromValor = new Label(); lblClavePromValor = new Label(); lblFondoExcValor = new Label();
            lblAlturaExcValor = new Label(); lblPendienteValor = new Label(); lblAreaTubValor = new Label();
            lblAreaSegAtraqueValor = new Label(); lblAreaSegRellenoValor = new Label();
            lblResumen = new Label();
            _btnCargar = new Button();
            _btnInforme = new Button();
            _btnAyuda = new Button();
            toolTip1 = new ToolTip(components);
            panelHeader = new Panel();
            panelHeaderAccent = new Panel();
            picLogo = new PictureBox();
            lblTitulo = new Label();
            lblDescripcion = new Label();
            panelFooterBar = new Panel();
            lblFooter = new Label();

            ((System.ComponentModel.ISupportInitialize)_grid).BeginInit();
            panelResumen.SuspendLayout();
            grpCantidades.SuspendLayout();
            tblCantidades.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)picPreview).BeginInit();
            panelPreviewCard.SuspendLayout();
            grpInfoTramo.SuspendLayout();
            panelHeader.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)picLogo).BeginInit();
            panelFooterBar.SuspendLayout();
            SuspendLayout();

            // FORM
            AutoScaleDimensions = new System.Drawing.SizeF(8F, 20F);
            AutoScaleMode = AutoScaleMode.Font;
            BackColor = colorBgForm;
            ClientSize = new System.Drawing.Size(1200, 670);
            Font = new System.Drawing.Font("Segoe UI", 9F);
            Name = "FrmNombrarTramo";
            StartPosition = FormStartPosition.CenterParent;
            Text = "Información tramos de Tubería";

            // HEADER — único bloque con azul
            panelHeader.BackColor = colorHeader;
            panelHeader.Dock = DockStyle.Top;
            panelHeader.Name = "panelHeader";
            panelHeader.Padding = new Padding(10, 8, 10, 0);
            panelHeader.Size = new System.Drawing.Size(1200, 78);
            panelHeader.TabIndex = 6;
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
            picLogo.Location = new System.Drawing.Point(14, 11);
            picLogo.Name = "picLogo";
            picLogo.Size = new System.Drawing.Size(128, 52);
            picLogo.SizeMode = PictureBoxSizeMode.Zoom;
            picLogo.TabIndex = 0;
            picLogo.TabStop = false;

            lblTitulo.Font = new System.Drawing.Font("Segoe UI", 12F, System.Drawing.FontStyle.Bold);
            lblTitulo.ForeColor = System.Drawing.Color.White;
            lblTitulo.Location = new System.Drawing.Point(150, 10);
            lblTitulo.Name = "lblTitulo";
            lblTitulo.Size = new System.Drawing.Size(1032, 32);
            lblTitulo.TabIndex = 1;
            lblTitulo.Text = "Información de tramos de tubería";
            lblTitulo.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;

            lblDescripcion.Font = new System.Drawing.Font("Segoe UI", 8.5F, System.Drawing.FontStyle.Italic);
            lblDescripcion.ForeColor = System.Drawing.Color.FromArgb(200, 215, 240);
            lblDescripcion.Location = new System.Drawing.Point(150, 44);
            lblDescripcion.Name = "lblDescripcion";
            lblDescripcion.Size = new System.Drawing.Size(1032, 24);
            lblDescripcion.TabIndex = 2;
            lblDescripcion.Text = "Asigne nombres de tramo y vincule los ítems de presupuesto para cada tramo calculado.";
            lblDescripcion.TextAlign = System.Drawing.ContentAlignment.TopCenter;

            // PANEL RESUMEN — gris neutro
            panelResumen.BackColor = colorBgForm;
            panelResumen.Dock = DockStyle.Top;
            panelResumen.Name = "panelResumen";
            panelResumen.Padding = new Padding(10, 10, 10, 10);
            panelResumen.Size = new System.Drawing.Size(1200, 298);
            panelResumen.TabIndex = 5;
            panelResumen.Controls.Add(grpCantidades);
            panelResumen.Controls.Add(panelPreviewCard);
            panelResumen.Controls.Add(grpInfoTramo);

            // PREVIEW CARD
            panelPreviewCard.BackColor = colorBgCard;
            panelPreviewCard.BorderStyle = BorderStyle.None;
            panelPreviewCard.Dock = DockStyle.Left;
            panelPreviewCard.Name = "panelPreviewCard";
            panelPreviewCard.Padding = new Padding(3);
            panelPreviewCard.Size = new System.Drawing.Size(242, 278);
            panelPreviewCard.TabIndex = 4;
            panelPreviewCard.Controls.Add(picPreview);
            panelPreviewCard.Controls.Add(btnAgregarImagen);
            panelPreviewCard.Paint += (s, e) => {
                var rc = panelPreviewCard.ClientRectangle;
                rc.Width--; rc.Height--;
                using var p = new System.Drawing.Pen(colorBorde, 1f);
                e.Graphics.DrawRectangle(p, rc);
            };

            picPreview.BackColor = System.Drawing.Color.FromArgb(252, 252, 253);
            picPreview.BorderStyle = BorderStyle.None;
            picPreview.Dock = DockStyle.Fill;
            picPreview.Name = "picPreview";
            picPreview.SizeMode = PictureBoxSizeMode.Zoom;
            picPreview.TabIndex = 4;
            picPreview.TabStop = false;

            btnAgregarImagen.BackColor = colorBorde;
            btnAgregarImagen.FlatStyle = FlatStyle.Flat;
            btnAgregarImagen.FlatAppearance.BorderSize = 0;
            btnAgregarImagen.Font = new System.Drawing.Font("Segoe UI", 8F);
            btnAgregarImagen.ForeColor = colorTextoSec;
            btnAgregarImagen.Location = new System.Drawing.Point(3, 3);
            btnAgregarImagen.Name = "btnAgregarImagen";
            btnAgregarImagen.Size = new System.Drawing.Size(24, 22);
            btnAgregarImagen.TabIndex = 2;
            btnAgregarImagen.Text = "+";
            btnAgregarImagen.UseVisualStyleBackColor = false;
            toolTip1.SetToolTip(btnAgregarImagen, "Agregar gráfico del tramo");
            btnAgregarImagen.Click += BtnAgregarImagen_Click;

            // GRP INFO TRAMO — blanco, título gris
            grpInfoTramo.BackColor = colorBgCard;
            grpInfoTramo.Font = new System.Drawing.Font("Segoe UI", 8.5F, System.Drawing.FontStyle.Bold);
            grpInfoTramo.ForeColor = colorTexto;
            grpInfoTramo.Location = new System.Drawing.Point(262, 10);
            grpInfoTramo.Name = "grpInfoTramo";
            grpInfoTramo.Padding = new Padding(8, 12, 8, 8);
            grpInfoTramo.Size = new System.Drawing.Size(318, 280);
            grpInfoTramo.TabIndex = 1;
            grpInfoTramo.TabStop = false;
            grpInfoTramo.Text = "  Información de tramo";
            grpInfoTramo.Controls.Add(lblAreaTubLabel); grpInfoTramo.Controls.Add(lblAreaTubValor);
            grpInfoTramo.Controls.Add(lblPendienteLabel); grpInfoTramo.Controls.Add(lblPendienteValor);
            grpInfoTramo.Controls.Add(lblRasantePromLabel); grpInfoTramo.Controls.Add(lblRasantePromValor);
            grpInfoTramo.Controls.Add(lblClavePromLabel); grpInfoTramo.Controls.Add(lblClavePromValor);
            grpInfoTramo.Controls.Add(lblFondoExcLabel); grpInfoTramo.Controls.Add(lblFondoExcValor);
            grpInfoTramo.Controls.Add(lblAlturaExcLabel); grpInfoTramo.Controls.Add(lblAlturaExcValor);
            grpInfoTramo.Controls.Add(lblAreaSegAtraqueLabel); grpInfoTramo.Controls.Add(lblAreaSegAtraqueValor);
            grpInfoTramo.Controls.Add(lblAreaSegRellenoLabel); grpInfoTramo.Controls.Add(lblAreaSegRellenoValor);

            string[] textoN = { "Área externa tubería (m²):", "Pendiente m(%):",
                                  "Rasante promedio (m):", "Clave promedio (m):",
                                  "Fondo excavación prom.:", "Altura de excavación (m):",
                                  "Área neta atraque (m²):", "Área neta relleno (m²):" };
            string[] nombreN = { "lblAreaTubLabel","lblPendienteLabel","lblRasantePromLabel",
                                  "lblClavePromLabel","lblFondoExcLabel","lblAlturaExcLabel",
                                  "lblAreaSegAtraqueLabel","lblAreaSegRellenoLabel" };
            string[] nombreV = { "lblAreaTubValor","lblPendienteValor","lblRasantePromValor",
                                  "lblClavePromValor","lblFondoExcValor","lblAlturaExcValor",
                                  "lblAreaSegAtraqueValor","lblAreaSegRellenoValor" };
            int[] tiN = { 6, 5, 1, 2, 3, 4, 13, 15 };
            int[] tiV = { 12, 11, 7, 8, 9, 10, 14, 16 };
            Label[] arrN = { lblAreaTubLabel,lblPendienteLabel,lblRasantePromLabel,
                              lblClavePromLabel,lblFondoExcLabel,lblAlturaExcLabel,
                              lblAreaSegAtraqueLabel,lblAreaSegRellenoLabel };
            Label[] arrV = { lblAreaTubValor,lblPendienteValor,lblRasantePromValor,
                              lblClavePromValor,lblFondoExcValor,lblAlturaExcValor,
                              lblAreaSegAtraqueValor,lblAreaSegRellenoValor };

            int rowH = 30, yStart = 26;
            for (int i = 0; i < 8; i++)
            {
                arrN[i].Font = new System.Drawing.Font("Segoe UI", 8.5F);
                arrN[i].ForeColor = colorTextoSec;
                arrN[i].Location = new System.Drawing.Point(8, yStart + i * rowH + 4);
                arrN[i].Size = new System.Drawing.Size(160, 20);
                arrN[i].Text = textoN[i];
                arrN[i].Name = nombreN[i];
                arrN[i].TabIndex = tiN[i];

                arrV[i].BackColor = colorValorBg;
                arrV[i].BorderStyle = BorderStyle.None;
                arrV[i].Font = new System.Drawing.Font("Segoe UI", 8.5F);
                arrV[i].ForeColor = colorTexto;
                arrV[i].Location = new System.Drawing.Point(170, yStart + i * rowH + 3);
                arrV[i].Size = new System.Drawing.Size(138, 22);
                arrV[i].TextAlign = System.Drawing.ContentAlignment.MiddleRight;
                arrV[i].Padding = new Padding(0, 0, 6, 0);
                arrV[i].Name = nombreV[i];
                arrV[i].TabIndex = tiV[i];
            }

            // GRP CANTIDADES
            grpCantidades.BackColor = colorBgCard;
            grpCantidades.Dock = DockStyle.Right;
            grpCantidades.Font = new System.Drawing.Font("Segoe UI", 8.5F, System.Drawing.FontStyle.Bold);
            grpCantidades.ForeColor = colorTexto;
            grpCantidades.Location = new System.Drawing.Point(580, 10);
            grpCantidades.Name = "grpCantidades";
            grpCantidades.Padding = new Padding(6, 12, 6, 6);
            grpCantidades.Size = new System.Drawing.Size(610, 278);
            grpCantidades.TabIndex = 0;
            grpCantidades.TabStop = false;
            grpCantidades.Text = "  Cantidades del tramo  (vinculación a presupuesto)";
            grpCantidades.Controls.Add(chkAplicarTodos);
            grpCantidades.Controls.Add(tblCantidades);

            chkAplicarTodos.AutoSize = true;
            chkAplicarTodos.Font = new System.Drawing.Font("Segoe UI", 8.5F);
            chkAplicarTodos.ForeColor = colorTextoSec;
            chkAplicarTodos.Location = new System.Drawing.Point(386, 0);
            chkAplicarTodos.Name = "chkAplicarTodos";
            chkAplicarTodos.Size = new System.Drawing.Size(210, 22);
            chkAplicarTodos.TabIndex = 1;
            chkAplicarTodos.Text = "Aplicar a todos los tramos";
            chkAplicarTodos.UseVisualStyleBackColor = true;

            // TABLA
            tblCantidades.BackColor = colorBgCard;
            tblCantidades.ColumnCount = 4;
            tblCantidades.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 28F));
            tblCantidades.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 122F));
            tblCantidades.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 60F));
            tblCantidades.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 40F));
            tblCantidades.Dock = DockStyle.Fill;
            tblCantidades.Location = new System.Drawing.Point(6, 24);
            tblCantidades.Name = "tblCantidades";
            tblCantidades.RowCount = 9;
            for (int r = 0; r < 9; r++)
                tblCantidades.RowStyles.Add(new RowStyle(SizeType.Absolute, 26F));
            tblCantidades.Size = new System.Drawing.Size(598, 248);
            tblCantidades.TabIndex = 0;

            tblCantidades.Controls.Add(chkExcav, 0, 0); tblCantidades.Controls.Add(lblExcav, 1, 0); tblCantidades.Controls.Add(cmbExcav, 2, 0); tblCantidades.Controls.Add(txtExcav, 3, 0);
            tblCantidades.Controls.Add(chkAtraque, 0, 1); tblCantidades.Controls.Add(lblAtraque, 1, 1); tblCantidades.Controls.Add(cmbAtraque, 2, 1); tblCantidades.Controls.Add(txtAtraque, 3, 1);
            tblCantidades.Controls.Add(chkLong, 0, 2); tblCantidades.Controls.Add(lblLong, 1, 2); tblCantidades.Controls.Add(cmbLong, 2, 2); tblCantidades.Controls.Add(txtLong, 3, 2);
            tblCantidades.Controls.Add(chkRelleno, 0, 3); tblCantidades.Controls.Add(lblRelleno, 1, 3); tblCantidades.Controls.Add(cmbRelleno, 2, 3); tblCantidades.Controls.Add(txtRelleno, 3, 3);
            tblCantidades.Controls.Add(chkEntibado, 0, 4); tblCantidades.Controls.Add(lblEntibado, 1, 4); tblCantidades.Controls.Add(cmbEntibado, 2, 4); tblCantidades.Controls.Add(txtEntibado, 3, 4);
            tblCantidades.Controls.Add(chkCinta, 0, 5); tblCantidades.Controls.Add(lblCinta, 1, 5); tblCantidades.Controls.Add(cmbCinta, 2, 5); tblCantidades.Controls.Add(txtCinta, 3, 5);
            tblCantidades.Controls.Add(chkOtros, 0, 6); tblCantidades.Controls.Add(lblOtros, 1, 6); tblCantidades.Controls.Add(cmbOtros, 2, 6); tblCantidades.Controls.Add(txtOtros, 3, 6);
            tblCantidades.Controls.Add(chkCampana1, 0, 7); tblCantidades.Controls.Add(lblCampana1, 1, 7); tblCantidades.Controls.Add(cmbCampana1, 2, 7); tblCantidades.Controls.Add(txtCampana1, 3, 7);
            tblCantidades.Controls.Add(chkCampana2, 0, 8); tblCantidades.Controls.Add(lblCampana2, 1, 8); tblCantidades.Controls.Add(cmbCampana2, 2, 8); tblCantidades.Controls.Add(txtCampana2, 3, 8);

            (CheckBox chk, Label lbl, ComboBox cmb, TextBox txt,
             string nChk, string nLbl, string nCmb, string nTxt,
             string texto, string tip, int tiChk, int tiCmb, int tiTxt)[] filas = {
                (chkExcav,    lblExcav,    cmbExcav,    txtExcav,    "chkExcav",    "lblExcav",    "cmbExcav",    "txtExcav",    "Excavación",        "Volumen de excavación del tramo (Long × Ancho × Altura).",                        0,  2,  3),
                (chkAtraque,  lblAtraque,  cmbAtraque,  txtAtraque,  "chkAtraque",  "lblAtraque",  "cmbAtraque",  "txtAtraque",  "Atraque",           "Volumen de atraque según altura de atraque y área de tuberías.",                   4,  6,  7),
                (chkLong,     lblLong,     cmbLong,     txtLong,     "chkLong",     "lblLong",     "cmbLong",     "txtLong",     "Longitud tubería",  "Longitud total del tramo de tubería.",                                             8, 10, 11),
                (chkRelleno,  lblRelleno,  cmbRelleno,  txtRelleno,  "chkRelleno",  "lblRelleno",  "cmbRelleno",  "txtRelleno",  "Relleno granular",  "Volumen para relleno granular asociado al tramo.",                                12, 14, 15),
                (chkEntibado, lblEntibado, cmbEntibado, txtEntibado, "chkEntibado", "lblEntibado", "cmbEntibado", "txtEntibado", "Entibado",          "Área entibada en dos caras, aplicable si la altura excavación > 1.5 m.",          16, 18, 19),
                (chkCinta,    lblCinta,    cmbCinta,    txtCinta,    "chkCinta",    "lblCinta",    "cmbCinta",    "txtCinta",    "Cinta señalización","Longitud de cinta de señalización sobre la tubería.",                              20, 22, 23),
                (chkOtros,    lblOtros,    cmbOtros,    txtOtros,    "chkOtros",    "lblOtros",    "cmbOtros",    "txtOtros",    "Otros",             "Conceptos adicionales no contemplados en el cálculo automático. Cantidad manual.", 24, 26, 27),
                (chkCampana1, lblCampana1, cmbCampana1, txtCampana1, "chkCampana1", "lblCampana1", "cmbCampana1", "txtCampana1", "Campanas 1",        "Campana 1: cantidad entera (UND) digitada manualmente.",                          28, 30, 31),
                (chkCampana2, lblCampana2, cmbCampana2, txtCampana2, "chkCampana2", "lblCampana2", "cmbCampana2", "txtCampana2", "Campanas 2",        "Campana 2: cantidad entera (UND) digitada manualmente.",                          32, 34, 35),
            };

            foreach (var f in filas)
            {
                f.chk.Anchor = AnchorStyles.Left; f.chk.Name = f.nChk;
                f.chk.Size = new System.Drawing.Size(22, 18); f.chk.TabIndex = f.tiChk;
                toolTip1.SetToolTip(f.chk, f.tip);

                f.lbl.Anchor = AnchorStyles.Left; f.lbl.AutoSize = true;
                f.lbl.Font = new System.Drawing.Font("Segoe UI", 8.5F);
                f.lbl.ForeColor = colorTexto;
                f.lbl.Name = f.nLbl; f.lbl.TabIndex = f.tiChk + 1; f.lbl.Text = f.texto;

                f.cmb.Anchor = AnchorStyles.Left | AnchorStyles.Right;
                f.cmb.AutoCompleteMode = AutoCompleteMode.SuggestAppend;
                f.cmb.AutoCompleteSource = AutoCompleteSource.ListItems;
                f.cmb.FlatStyle = FlatStyle.Flat;
                f.cmb.Font = new System.Drawing.Font("Segoe UI", 8.5F);
                f.cmb.BackColor = System.Drawing.Color.White;
                f.cmb.Name = f.nCmb; f.cmb.Size = new System.Drawing.Size(100, 24); f.cmb.TabIndex = f.tiCmb;

                f.txt.Anchor = AnchorStyles.Left | AnchorStyles.Right;
                f.txt.BackColor = colorValorBg;
                f.txt.BorderStyle = BorderStyle.FixedSingle;
                f.txt.Font = new System.Drawing.Font("Segoe UI", 8.5F);
                f.txt.ForeColor = colorTexto;
                f.txt.Name = f.nTxt; f.txt.ReadOnly = true;
                f.txt.Size = new System.Drawing.Size(100, 24); f.txt.TabIndex = f.tiTxt;
                f.txt.TextAlign = HorizontalAlignment.Right;
            }

            chkExcav.CheckedChanged += ChkExcav_CheckedChanged;
            chkAtraque.CheckedChanged += ChkAtraque_CheckedChanged;
            chkLong.CheckedChanged += ChkLong_CheckedChanged;
            chkRelleno.CheckedChanged += ChkRelleno_CheckedChanged;
            chkEntibado.CheckedChanged += ChkEntibado_CheckedChanged;
            chkCinta.CheckedChanged += ChkCinta_CheckedChanged;
            chkOtros.CheckedChanged += ChkOtros_CheckedChanged;
            chkCampana1.CheckedChanged += ChkCampana1_CheckedChanged;
            chkCampana2.CheckedChanged += ChkCampana2_CheckedChanged;

            cmbExcav.SelectedIndexChanged += CmbExcav_SelectedIndexChanged;
            cmbAtraque.SelectedIndexChanged += CmbAtraque_SelectedIndexChanged;
            cmbLong.SelectedIndexChanged += CmbLong_SelectedIndexChanged;
            cmbRelleno.SelectedIndexChanged += CmbRelleno_SelectedIndexChanged;
            cmbEntibado.SelectedIndexChanged += CmbEntibado_SelectedIndexChanged;
            cmbCinta.SelectedIndexChanged += CmbCinta_SelectedIndexChanged;
            cmbOtros.SelectedIndexChanged += CmbOtros_SelectedIndexChanged;
            cmbCampana1.SelectedIndexChanged += CmbCampana1_SelectedIndexChanged;
            cmbCampana2.SelectedIndexChanged += CmbCampana2_SelectedIndexChanged;

            txtOtros.ReadOnly = false; txtOtros.Validated += TxtOtros_Validated;
            txtCampana1.ReadOnly = true; txtCampana1.KeyPress += TxtCampana1_KeyPress; txtCampana1.Validated += TxtCampana1_Validated;
            txtCampana2.ReadOnly = true; txtCampana2.KeyPress += TxtCampana2_KeyPress; txtCampana2.Validated += TxtCampana2_Validated;

            // GRID — headers gris oscuro (no azul), cuerpo blanco
            _grid.AllowUserToAddRows = false;
            _grid.AllowUserToDeleteRows = false;
            _grid.BackgroundColor = colorBgForm;
            _grid.BorderStyle = BorderStyle.None;
            _grid.ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.AutoSize;
            _grid.ColumnHeadersDefaultCellStyle.BackColor = colorGridHdr;
            _grid.ColumnHeadersDefaultCellStyle.ForeColor = System.Drawing.Color.White;
            _grid.ColumnHeadersDefaultCellStyle.Font = new System.Drawing.Font("Segoe UI", 8.5F, System.Drawing.FontStyle.Bold);
            _grid.DefaultCellStyle.BackColor = System.Drawing.Color.White;
            _grid.DefaultCellStyle.SelectionBackColor = System.Drawing.Color.FromArgb(228, 232, 240);
            _grid.DefaultCellStyle.SelectionForeColor = colorTexto;
            _grid.DefaultCellStyle.Font = new System.Drawing.Font("Segoe UI", 8.5F);
            _grid.GridColor = System.Drawing.Color.FromArgb(225, 226, 228);
            _grid.Dock = DockStyle.Fill;
            _grid.MultiSelect = false;
            _grid.Name = "_grid";
            _grid.RowHeadersVisible = false;
            _grid.RowHeadersWidth = 51;
            _grid.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
            _grid.TabIndex = 0;
            _grid.EnableHeadersVisualStyles = false;

            // FOOTER — gris oscuro neutro
            panelFooterBar.BackColor = colorFooterBg;
            panelFooterBar.Dock = DockStyle.Bottom;
            panelFooterBar.Height = 94;
            panelFooterBar.Name = "panelFooterBar";
            panelFooterBar.Padding = new Padding(12, 7, 12, 5);
            panelFooterBar.Controls.Add(_btnCargar);
            panelFooterBar.Controls.Add(_btnInforme);
            panelFooterBar.Controls.Add(_btnAyuda);
            panelFooterBar.Controls.Add(lblFooter);

            // Botón principal — azul, pero es el único elemento azul del footer
            _btnCargar.BackColor = colorBtnPrimary;
            _btnCargar.Dock = DockStyle.Top;
            _btnCargar.FlatStyle = FlatStyle.Flat;
            _btnCargar.FlatAppearance.BorderColor = System.Drawing.Color.FromArgb(60, 100, 180);
            _btnCargar.FlatAppearance.BorderSize = 1;
            _btnCargar.FlatAppearance.MouseOverBackColor = System.Drawing.Color.FromArgb(45, 95, 175);
            _btnCargar.Font = new System.Drawing.Font("Segoe UI", 9.5F, System.Drawing.FontStyle.Bold);
            _btnCargar.ForeColor = System.Drawing.Color.White;
            _btnCargar.Name = "_btnCargar";
            _btnCargar.Size = new System.Drawing.Size(1176, 36);
            _btnCargar.TabIndex = 1;
            _btnCargar.Text = "▶   Cargar a Presupuesto";
            _btnCargar.UseVisualStyleBackColor = false;
            _btnCargar.Click += BtnCargar_Click;

            _btnAyuda.Dock = DockStyle.Top;
            _btnAyuda.FlatStyle = FlatStyle.Flat;
            _btnAyuda.BackColor = System.Drawing.Color.FromArgb(240, 247, 255);
            _btnAyuda.ForeColor = System.Drawing.Color.FromArgb(10, 33, 64);
            _btnAyuda.FlatAppearance.BorderColor = System.Drawing.Color.FromArgb(163, 201, 240);
            _btnAyuda.Font = new System.Drawing.Font("Segoe UI", 9F);
            _btnAyuda.Name = "_btnAyuda";
            _btnAyuda.Size = new System.Drawing.Size(1176, 28);
            _btnAyuda.TabIndex = 4;
            _btnAyuda.Text = "❓  Ayuda — ¿Cómo llenar este formulario?";
            _btnAyuda.UseVisualStyleBackColor = false;
            _btnAyuda.Click += BtnAyuda_Click;

            lblFooter.Dock = DockStyle.Bottom;
            lblFooter.Font = new System.Drawing.Font("Segoe UI", 7.5F, System.Drawing.FontStyle.Italic);
            lblFooter.ForeColor = System.Drawing.Color.FromArgb(150, 155, 165);
            lblFooter.BackColor = System.Drawing.Color.Transparent;
            lblFooter.Name = "lblFooter";
            lblFooter.Size = new System.Drawing.Size(1176, 18);
            lblFooter.TabIndex = 3;
            lblFooter.Text = "© 2025 SicoeCAD® – Derechos reservados. Uso autorizado únicamente para el proyecto licenciado.";
            lblFooter.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;

            lblResumen.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            lblResumen.Name = "lblResumen";
            lblResumen.Size = new System.Drawing.Size(800, 20);
            lblResumen.TabIndex = 0;
            lblResumen.Visible = false;

            Controls.Add(_grid);
            Controls.Add(panelResumen);
            Controls.Add(panelHeader);
            Controls.Add(panelFooterBar);

            ((System.ComponentModel.ISupportInitialize)_grid).EndInit();
            panelResumen.ResumeLayout(false);
            grpCantidades.ResumeLayout(false);
            grpCantidades.PerformLayout();
            tblCantidades.ResumeLayout(false);
            tblCantidades.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)picPreview).EndInit();
            panelPreviewCard.ResumeLayout(false);
            grpInfoTramo.ResumeLayout(false);
            panelHeader.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)picLogo).EndInit();
            panelFooterBar.ResumeLayout(false);
            ResumeLayout(false);
        }

        #endregion

        private CheckBox chkAplicarTodos;
    }
}