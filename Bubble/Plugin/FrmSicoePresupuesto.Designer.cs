using System.Drawing;
using System.Windows.Forms;
using System.ComponentModel;

namespace SicoePresupuestoNET8
{
    partial class FrmSicoePresupuesto
    {
        private System.ComponentModel.IContainer components = null;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
                components.Dispose();
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        private void InitializeComponent()
        {
            rbNodo = new RadioButton();
            rbLongitud = new RadioButton();
            rbArea = new RadioButton();
            label4 = new Label();
            cmbUnd = new ComboBox();
            label3 = new Label();
            cmbItem = new ComboBox();
            label2 = new Label();
            cmbCompetencia = new ComboBox();
            label1 = new Label();
            cmbCapitulo = new ComboBox();
            btnCapasCsv = new Button();
            label5 = new Label();
            txt_contador = new TextBox();
            lblCapa = new Label();
            lblAltText = new Label();
            txtAltText = new TextBox();
            lblAncho = new Label();
            txtAncho = new TextBox();
            lblEspesor = new Label();
            txtEspesor = new TextBox();
            lblNoInicio = new Label();
            txtNoInicio = new TextBox();
            lblNoFinal = new Label();
            txtNoFinal = new TextBox();
            lblObservacion = new Label();
            txtObservacion = new TextBox();
            btnBorrar = new Button();
            rbEjecPresupuesto = new RadioButton();
            rbEjecObra = new RadioButton();
            BtnAgritem = new Button();
            btnCargueEje = new Button();
            btnGenerarAbscisado = new Button();
            dgvPrecargados = new DataGridView();
            lblXlsxRuta = new Label();
            txtXlsxRuta = new TextBox();
            gbTipoEntidad = new SicoePresupuestoNET8.Controls.RoundedGroupBox();
            groupBox1 = new SicoePresupuestoNET8.Controls.RoundedGroupBox();
            groupBoxInfo = new SicoePresupuestoNET8.Controls.RoundedGroupBox();
            groupBoxParametros = new SicoePresupuestoNET8.Controls.RoundedGroupBox();
            gbTipoEjecucion = new SicoePresupuestoNET8.Controls.RoundedGroupBox();
            roundedGroupBox1 = new SicoePresupuestoNET8.Controls.RoundedGroupBox();
            btnSyncExcel = new SicoePresupuestoNET8.Controls.ElevatedButton();
            btnSeleccionEntidad = new SicoePresupuestoNET8.Controls.ElevatedButton();
            groupBoxLista = new SicoePresupuestoNET8.Controls.RoundedGroupBox();
            btnEditar = new SicoePresupuestoNET8.Controls.ElevatedButton();
            btnAgregar = new SicoePresupuestoNET8.Controls.ElevatedButton();
            gbExportXlsx = new SicoePresupuestoNET8.Controls.RoundedGroupBox();
            btnXlsmExaminar = new SicoePresupuestoNET8.Controls.ElevatedButton();
            btnCrearXlsm = new SicoePresupuestoNET8.Controls.ElevatedButton();
            GbItemPre = new SicoePresupuestoNET8.Controls.RoundedGroupBox();
            btnayuda = new SicoePresupuestoNET8.Controls.ElevatedButton();
            btnbuscar = new SicoePresupuestoNET8.Controls.ElevatedButton();
            pnlHeader = new Panel();
            pbLogo = new PictureBox();
            lblTitulo = new Label();
            lblContexto = new Label();
            pnlFooter = new Panel();
            lblCopyright = new Label();
            lblContadorExp = new Label();
            lblCostoDirExp = new Label();
            ((ISupportInitialize)dgvPrecargados).BeginInit();
            gbTipoEntidad.SuspendLayout();
            groupBox1.SuspendLayout();
            groupBoxInfo.SuspendLayout();
            groupBoxParametros.SuspendLayout();
            gbTipoEjecucion.SuspendLayout();
            roundedGroupBox1.SuspendLayout();
            groupBoxLista.SuspendLayout();
            gbExportXlsx.SuspendLayout();
            GbItemPre.SuspendLayout();
            pnlHeader.SuspendLayout();
            ((ISupportInitialize)pbLogo).BeginInit();
            pnlFooter.SuspendLayout();
            SuspendLayout();
            // 
            // rbNodo
            // 
            rbNodo.AutoSize = true;
            rbNodo.BackColor = Color.White;
            rbNodo.Location = new Point(173, 32);
            rbNodo.Name = "rbNodo";
            rbNodo.Size = new Size(68, 24);
            rbNodo.TabIndex = 2;
            rbNodo.Text = "Nodo";
            rbNodo.UseVisualStyleBackColor = false;
            // 
            // rbLongitud
            // 
            rbLongitud.AutoSize = true;
            rbLongitud.BackColor = Color.White;
            rbLongitud.Location = new Point(81, 32);
            rbLongitud.Name = "rbLongitud";
            rbLongitud.Size = new Size(89, 24);
            rbLongitud.TabIndex = 1;
            rbLongitud.Text = "Longitud";
            rbLongitud.UseVisualStyleBackColor = false;
            // 
            // rbArea
            // 
            rbArea.AutoSize = true;
            rbArea.BackColor = Color.White;
            rbArea.Location = new Point(14, 32);
            rbArea.Name = "rbArea";
            rbArea.Size = new Size(61, 24);
            rbArea.TabIndex = 0;
            rbArea.Text = "Área";
            rbArea.UseVisualStyleBackColor = false;
            // 
            // label4
            // 
            label4.AutoSize = true;
            label4.Location = new Point(588, 30);
            label4.Name = "label4";
            label4.Size = new Size(39, 20);
            label4.TabIndex = 7;
            label4.Text = "Und:";
            // 
            // cmbUnd
            // 
            cmbUnd.DropDownStyle = ComboBoxStyle.DropDownList;
            cmbUnd.FormattingEnabled = true;
            cmbUnd.Location = new Point(633, 26);
            cmbUnd.Name = "cmbUnd";
            cmbUnd.Size = new Size(110, 28);
            cmbUnd.TabIndex = 3;
            // 
            // label3
            // 
            label3.AutoSize = true;
            label3.Location = new Point(17, 63);
            label3.Name = "label3";
            label3.Size = new Size(42, 20);
            label3.TabIndex = 5;
            label3.Text = "Ítem:";
            // 
            // cmbItem
            // 
            cmbItem.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            cmbItem.FormattingEnabled = true;
            cmbItem.Location = new Point(83, 59);
            cmbItem.MaxDropDownItems = 16;
            cmbItem.Name = "cmbItem";
            cmbItem.Size = new Size(680, 28);
            cmbItem.TabIndex = 2;
            cmbItem.TextUpdate += cmbItem_TextUpdate;
            // 
            // label2
            // 
            label2.AutoSize = true;
            label2.Location = new Point(368, 30);
            label2.Name = "label2";
            label2.Size = new Size(100, 20);
            label2.TabIndex = 3;
            label2.Text = "Competencia:";
            // 
            // cmbCompetencia
            // 
            cmbCompetencia.DropDownStyle = ComboBoxStyle.DropDownList;
            cmbCompetencia.FormattingEnabled = true;
            cmbCompetencia.Location = new Point(469, 26);
            cmbCompetencia.Name = "cmbCompetencia";
            cmbCompetencia.Size = new Size(110, 28);
            cmbCompetencia.TabIndex = 1;
            // 
            // label1
            // 
            label1.AutoSize = true;
            label1.Location = new Point(17, 30);
            label1.Name = "label1";
            label1.Size = new Size(68, 20);
            label1.TabIndex = 1;
            label1.Text = "Capítulo:";
            // 
            // cmbCapitulo
            // 
            cmbCapitulo.DropDownStyle = ComboBoxStyle.DropDownList;
            cmbCapitulo.FormattingEnabled = true;
            cmbCapitulo.Location = new Point(83, 26);
            cmbCapitulo.Name = "cmbCapitulo";
            cmbCapitulo.Size = new Size(270, 28);
            cmbCapitulo.TabIndex = 0;
            // 
            // btnCapasCsv
            // 
            btnCapasCsv.BackColor = Color.FromArgb(38, 50, 56);
            btnCapasCsv.Font = new Font("Microsoft Sans Serif", 9F);
            btnCapasCsv.ForeColor = Color.White;
            btnCapasCsv.Location = new Point(93, 25);
            btnCapasCsv.Name = "btnCapasCsv";
            btnCapasCsv.Size = new Size(54, 29);
            btnCapasCsv.TabIndex = 0;
            btnCapasCsv.Text = "CSV";
            btnCapasCsv.UseVisualStyleBackColor = false;
            // 
            // label5
            // 
            label5.AutoSize = true;
            label5.Location = new Point(500, 32);
            label5.Name = "label5";
            label5.Size = new Size(43, 20);
            label5.TabIndex = 17;
            label5.Text = "Cont.";
            // 
            // txt_contador
            // 
            txt_contador.Location = new Point(549, 27);
            txt_contador.Name = "txt_contador";
            txt_contador.Size = new Size(52, 27);
            txt_contador.TabIndex = 5;
            // 
            // lblCapa
            // 
            lblCapa.AutoSize = true;
            lblCapa.Font = new Font("Segoe UI", 7.8F, FontStyle.Regular, GraphicsUnit.Point, 0);
            lblCapa.Location = new Point(15, 32);
            lblCapa.Name = "lblCapa";
            lblCapa.Size = new Size(79, 17);
            lblCapa.TabIndex = 0;
            lblCapa.Text = "Pk_Id/Sector";
            // 
            // lblAltText
            // 
            lblAltText.AutoSize = true;
            lblAltText.Location = new Point(153, 29);
            lblAltText.Name = "lblAltText";
            lblAltText.Size = new Size(58, 20);
            lblAltText.TabIndex = 2;
            lblAltText.Text = "Alt.Text";
            // 
            // txtAltText
            // 
            txtAltText.Location = new Point(210, 27);
            txtAltText.MaxLength = 20;
            txtAltText.Name = "txtAltText";
            txtAltText.Size = new Size(60, 27);
            txtAltText.TabIndex = 2;
            // 
            // lblAncho
            // 
            lblAncho.AutoSize = true;
            lblAncho.Location = new Point(270, 32);
            lblAncho.Name = "lblAncho";
            lblAncho.Size = new Size(51, 20);
            lblAncho.TabIndex = 6;
            lblAncho.Text = "Ancho";
            // 
            // txtAncho
            // 
            txtAncho.Location = new Point(322, 27);
            txtAncho.MaxLength = 10;
            txtAncho.Name = "txtAncho";
            txtAncho.Size = new Size(59, 27);
            txtAncho.TabIndex = 3;
            // 
            // lblEspesor
            // 
            lblEspesor.AutoSize = true;
            lblEspesor.Location = new Point(382, 32);
            lblEspesor.Name = "lblEspesor";
            lblEspesor.Size = new Size(60, 20);
            lblEspesor.TabIndex = 8;
            lblEspesor.Text = "Espesor";
            // 
            // txtEspesor
            // 
            txtEspesor.Location = new Point(442, 27);
            txtEspesor.MaxLength = 10;
            txtEspesor.Name = "txtEspesor";
            txtEspesor.Size = new Size(58, 27);
            txtEspesor.TabIndex = 4;
            // 
            // lblNoInicio
            // 
            lblNoInicio.AutoSize = true;
            lblNoInicio.Location = new Point(600, 14);
            lblNoInicio.Name = "lblNoInicio";
            lblNoInicio.Size = new Size(72, 20);
            lblNoInicio.TabIndex = 10;
            lblNoInicio.Text = "No. Inicio";
            // 
            // txtNoInicio
            // 
            txtNoInicio.Location = new Point(674, 11);
            txtNoInicio.MaxLength = 10;
            txtNoInicio.Name = "txtNoInicio";
            txtNoInicio.Size = new Size(88, 27);
            txtNoInicio.TabIndex = 6;
            // 
            // lblNoFinal
            // 
            lblNoFinal.AutoSize = true;
            lblNoFinal.Location = new Point(605, 41);
            lblNoFinal.Name = "lblNoFinal";
            lblNoFinal.Size = new Size(67, 20);
            lblNoFinal.TabIndex = 12;
            lblNoFinal.Text = "No. Final";
            // 
            // txtNoFinal
            // 
            txtNoFinal.Location = new Point(673, 38);
            txtNoFinal.MaxLength = 10;
            txtNoFinal.Name = "txtNoFinal";
            txtNoFinal.Size = new Size(88, 27);
            txtNoFinal.TabIndex = 7;
            // 
            // lblObservacion
            // 
            lblObservacion.AutoSize = true;
            lblObservacion.Location = new Point(17, 70);
            lblObservacion.Name = "lblObservacion";
            lblObservacion.Size = new Size(91, 20);
            lblObservacion.TabIndex = 14;
            lblObservacion.Text = "Observación";
            // 
            // txtObservacion
            // 
            txtObservacion.Location = new Point(114, 67);
            txtObservacion.MaxLength = 500;
            txtObservacion.Name = "txtObservacion";
            txtObservacion.ScrollBars = ScrollBars.Vertical;
            txtObservacion.Size = new Size(655, 27);
            txtObservacion.TabIndex = 8;
            // 
            // btnBorrar
            // 
            btnBorrar.Location = new Point(287, 36);
            btnBorrar.Name = "btnBorrar";
            btnBorrar.Size = new Size(86, 30);
            btnBorrar.TabIndex = 5;
            btnBorrar.Text = "Borrar";
            btnBorrar.UseVisualStyleBackColor = true;
            // 
            // rbEjecPresupuesto
            // 
            rbEjecPresupuesto.AutoSize = true;
            rbEjecPresupuesto.Location = new Point(15, 51);
            rbEjecPresupuesto.Name = "rbEjecPresupuesto";
            rbEjecPresupuesto.Size = new Size(168, 24);
            rbEjecPresupuesto.TabIndex = 1;
            rbEjecPresupuesto.Text = "Presupuesto de Obra";
            rbEjecPresupuesto.UseVisualStyleBackColor = true;
            // 
            // rbEjecObra
            // 
            rbEjecObra.AutoSize = true;
            rbEjecObra.Location = new Point(15, 27);
            rbEjecObra.Name = "rbEjecObra";
            rbEjecObra.Size = new Size(132, 24);
            rbEjecObra.TabIndex = 0;
            rbEjecObra.Text = "Obra Ejecutada";
            rbEjecObra.UseVisualStyleBackColor = true;
            // 
            // BtnAgritem
            // 
            BtnAgritem.Font = new Font("Showcard Gothic", 13.8F, FontStyle.Regular, GraphicsUnit.Point, 0);
            BtnAgritem.Location = new Point(128, 37);
            BtnAgritem.Name = "BtnAgritem";
            BtnAgritem.Size = new Size(38, 29);
            BtnAgritem.TabIndex = 3;
            BtnAgritem.Text = "+";
            BtnAgritem.TextImageRelation = TextImageRelation.TextAboveImage;
            BtnAgritem.UseVisualStyleBackColor = true;
            // 
            // btnCargueEje
            // 
            btnCargueEje.BackColor = Color.FromArgb(38, 50, 56);
            btnCargueEje.Font = new Font("Microsoft Sans Serif", 9F);
            btnCargueEje.ForeColor = Color.White;
            btnCargueEje.Location = new Point(52, 27);
            btnCargueEje.Name = "btnCargueEje";
            btnCargueEje.Size = new Size(94, 29);
            btnCargueEje.TabIndex = 99;
            btnCargueEje.Text = "CargueEje";
            btnCargueEje.UseVisualStyleBackColor = false;
            // 
            // btnGenerarAbscisado
            // 
            btnGenerarAbscisado.Location = new Point(52, 56);
            btnGenerarAbscisado.Name = "btnGenerarAbscisado";
            btnGenerarAbscisado.Size = new Size(94, 24);
            btnGenerarAbscisado.TabIndex = 100;
            btnGenerarAbscisado.Text = "Generar abscisado";
            btnGenerarAbscisado.UseVisualStyleBackColor = true;
            btnGenerarAbscisado.Click += btnGenerarAbscisado_Click;
            // 
            // dgvPrecargados
            // 
            dgvPrecargados.AllowUserToAddRows = false;
            dgvPrecargados.AllowUserToDeleteRows = false;
            dgvPrecargados.AllowUserToResizeRows = false;
            dgvPrecargados.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            dgvPrecargados.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
            dgvPrecargados.AutoSizeRowsMode = DataGridViewAutoSizeRowsMode.AllCells;
            dgvPrecargados.BackgroundColor = Color.FromArgb(188, 235, 240);
            dgvPrecargados.ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.AutoSize;
            dgvPrecargados.GridColor = SystemColors.InactiveBorder;
            dgvPrecargados.Location = new Point(15, 26);
            dgvPrecargados.Name = "dgvPrecargados";
            dgvPrecargados.ReadOnly = true;
            dgvPrecargados.RowHeadersVisible = false;
            dgvPrecargados.RowHeadersWidth = 51;
            dgvPrecargados.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
            dgvPrecargados.Size = new Size(1104, 65);
            dgvPrecargados.TabIndex = 0;
            // 
            // lblXlsxRuta
            // 
            lblXlsxRuta.AutoSize = true;
            lblXlsxRuta.Location = new Point(17, 39);
            lblXlsxRuta.Name = "lblXlsxRuta";
            lblXlsxRuta.Size = new Size(42, 20);
            lblXlsxRuta.TabIndex = 2;
            lblXlsxRuta.Text = "Ruta:";
            // 
            // txtXlsxRuta
            // 
            txtXlsxRuta.Location = new Point(17, 62);
            txtXlsxRuta.Name = "txtXlsxRuta";
            txtXlsxRuta.Size = new Size(744, 27);
            txtXlsxRuta.TabIndex = 2;
            // 
            // gbTipoEntidad
            // 
            gbTipoEntidad.BackColor = Color.FromArgb(242, 247, 255);
            gbTipoEntidad.BackgroundColor = Color.White;
            gbTipoEntidad.BorderColor = Color.FromArgb(188, 235, 240);
            gbTipoEntidad.BorderRadius = 30;
            gbTipoEntidad.BorderSize = 1;
            gbTipoEntidad.Controls.Add(rbNodo);
            gbTipoEntidad.Controls.Add(rbArea);
            gbTipoEntidad.Controls.Add(rbLongitud);
            gbTipoEntidad.Location = new Point(15, 71);
            gbTipoEntidad.Name = "gbTipoEntidad";
            gbTipoEntidad.Padding = new Padding(12, 24, 12, 12);
            gbTipoEntidad.Size = new Size(258, 83);
            gbTipoEntidad.TabIndex = 0;
            gbTipoEntidad.TabStop = false;
            gbTipoEntidad.Text = "Tipo de Entidad";
            // 
            // groupBox1
            // 
            groupBox1.BackColor = Color.Transparent;
            groupBox1.BackgroundColor = Color.White;
            groupBox1.BorderColor = Color.FromArgb(188, 235, 240);
            groupBox1.BorderRadius = 30;
            groupBox1.BorderSize = 1;
            groupBox1.Controls.Add(btnCargueEje);
            groupBox1.Controls.Add(btnGenerarAbscisado);
            groupBox1.Location = new Point(603, 71);
            groupBox1.Name = "groupBox1";
            groupBox1.Padding = new Padding(12, 24, 12, 12);
            groupBox1.Size = new Size(188, 83);
            groupBox1.TabIndex = 2;
            groupBox1.TabStop = false;
            groupBox1.Text = "Cargue Eje Proyecto";
            // 
            // groupBoxInfo
            // 
            groupBoxInfo.BackColor = Color.Transparent;
            groupBoxInfo.BackgroundColor = Color.White;
            groupBoxInfo.BorderColor = Color.FromArgb(188, 235, 240);
            groupBoxInfo.BorderRadius = 30;
            groupBoxInfo.BorderSize = 1;
            groupBoxInfo.Controls.Add(label4);
            groupBoxInfo.Controls.Add(cmbCapitulo);
            groupBoxInfo.Controls.Add(cmbUnd);
            groupBoxInfo.Controls.Add(label1);
            groupBoxInfo.Controls.Add(label3);
            groupBoxInfo.Controls.Add(cmbCompetencia);
            groupBoxInfo.Controls.Add(cmbItem);
            groupBoxInfo.Controls.Add(label2);
            groupBoxInfo.Location = new Point(15, 160);
            groupBoxInfo.Name = "groupBoxInfo";
            groupBoxInfo.Padding = new Padding(12, 24, 12, 12);
            groupBoxInfo.Size = new Size(777, 95);
            groupBoxInfo.TabIndex = 3;
            groupBoxInfo.TabStop = false;
            groupBoxInfo.Text = "Info Presupuestal";
            // 
            // groupBoxParametros
            // 
            groupBoxParametros.BackColor = Color.Transparent;
            groupBoxParametros.BackgroundColor = Color.White;
            groupBoxParametros.BorderColor = Color.FromArgb(188, 235, 240);
            groupBoxParametros.BorderRadius = 30;
            groupBoxParametros.BorderSize = 1;
            groupBoxParametros.Controls.Add(btnCapasCsv);
            groupBoxParametros.Controls.Add(lblCapa);
            groupBoxParametros.Controls.Add(txtObservacion);
            groupBoxParametros.Controls.Add(label5);
            groupBoxParametros.Controls.Add(lblObservacion);
            groupBoxParametros.Controls.Add(txt_contador);
            groupBoxParametros.Controls.Add(txtNoFinal);
            groupBoxParametros.Controls.Add(lblNoFinal);
            groupBoxParametros.Controls.Add(lblAltText);
            groupBoxParametros.Controls.Add(txtNoInicio);
            groupBoxParametros.Controls.Add(txtAltText);
            groupBoxParametros.Controls.Add(lblNoInicio);
            groupBoxParametros.Controls.Add(lblAncho);
            groupBoxParametros.Controls.Add(txtEspesor);
            groupBoxParametros.Controls.Add(txtAncho);
            groupBoxParametros.Controls.Add(lblEspesor);
            groupBoxParametros.Location = new Point(15, 260);
            groupBoxParametros.Name = "groupBoxParametros";
            groupBoxParametros.Padding = new Padding(12, 24, 12, 12);
            groupBoxParametros.Size = new Size(777, 105);
            groupBoxParametros.TabIndex = 4;
            groupBoxParametros.TabStop = false;
            groupBoxParametros.Text = "Parámetros";
            // 
            // gbTipoEjecucion
            // 
            gbTipoEjecucion.BackColor = Color.Transparent;
            gbTipoEjecucion.BackgroundColor = Color.White;
            gbTipoEjecucion.BorderColor = Color.FromArgb(188, 235, 240);
            gbTipoEjecucion.BorderRadius = 30;
            gbTipoEjecucion.BorderSize = 1;
            gbTipoEjecucion.Controls.Add(rbEjecPresupuesto);
            gbTipoEjecucion.Controls.Add(rbEjecObra);
            gbTipoEjecucion.Location = new Point(15, 370);
            gbTipoEjecucion.Name = "gbTipoEjecucion";
            gbTipoEjecucion.Padding = new Padding(12, 24, 12, 12);
            gbTipoEjecucion.Size = new Size(194, 80);
            gbTipoEjecucion.TabIndex = 5;
            gbTipoEjecucion.TabStop = false;
            gbTipoEjecucion.Text = "Tipo de Ejecución";
            // 
            // roundedGroupBox1
            // 
            roundedGroupBox1.BackColor = Color.Transparent;
            roundedGroupBox1.BackgroundColor = Color.White;
            roundedGroupBox1.BorderColor = Color.FromArgb(188, 235, 240);
            roundedGroupBox1.BorderRadius = 30;
            roundedGroupBox1.BorderSize = 1;
            roundedGroupBox1.Controls.Add(btnSyncExcel);
            roundedGroupBox1.Controls.Add(btnSeleccionEntidad);
            roundedGroupBox1.Controls.Add(BtnAgritem);
            roundedGroupBox1.Controls.Add(btnBorrar);
            roundedGroupBox1.Location = new Point(215, 371);
            roundedGroupBox1.Name = "roundedGroupBox1";
            roundedGroupBox1.Padding = new Padding(12, 24, 12, 12);
            roundedGroupBox1.Size = new Size(410, 80);
            roundedGroupBox1.TabIndex = 6;
            roundedGroupBox1.TabStop = false;
            roundedGroupBox1.Text = "Aspecto";
            // 
            // btnSyncExcel
            // 
            btnSyncExcel.BackColor = Color.Transparent;
            btnSyncExcel.BaseColor = Color.Lime;
            btnSyncExcel.BorderColor = Color.FromArgb(220, 223, 230);
            btnSyncExcel.BorderSize = 1;
            btnSyncExcel.CornerRadius = 14;
            btnSyncExcel.DisabledColor = Color.FromArgb(200, 205, 210);
            btnSyncExcel.Elevation = 6;
            btnSyncExcel.FlatStyle = FlatStyle.Flat;
            btnSyncExcel.ForeColor = Color.White;
            btnSyncExcel.HoverColor = Color.FromArgb(27, 105, 232);
            btnSyncExcel.Location = new Point(183, 36);
            btnSyncExcel.Name = "btnSyncExcel";
            btnSyncExcel.Padding = new Padding(12, 6, 12, 6);
            btnSyncExcel.PressedColor = Color.FromArgb(21, 92, 210);
            btnSyncExcel.ShadowColor = Color.FromArgb(80, 0, 0, 0);
            btnSyncExcel.Size = new Size(74, 30);
            btnSyncExcel.TabIndex = 3;
            btnSyncExcel.Text = "Sinc.";
            btnSyncExcel.TextColor = Color.White;
            btnSyncExcel.UseVisualStyleBackColor = false;
            btnSyncExcel.Click += btnSyncExcel_Click;
            // 
            // btnSeleccionEntidad
            // 
            btnSeleccionEntidad.BackColor = Color.Transparent;
            btnSeleccionEntidad.BaseColor = Color.Black;
            btnSeleccionEntidad.BorderColor = Color.FromArgb(220, 223, 230);
            btnSeleccionEntidad.BorderSize = 1;
            btnSeleccionEntidad.CornerRadius = 14;
            btnSeleccionEntidad.DisabledColor = Color.FromArgb(200, 205, 210);
            btnSeleccionEntidad.Elevation = 6;
            btnSeleccionEntidad.FlatStyle = FlatStyle.Flat;
            btnSeleccionEntidad.ForeColor = Color.White;
            btnSeleccionEntidad.HoverColor = Color.FromArgb(27, 105, 232);
            btnSeleccionEntidad.Location = new Point(12, 41);
            btnSeleccionEntidad.Name = "btnSeleccionEntidad";
            btnSeleccionEntidad.Padding = new Padding(12, 6, 12, 6);
            btnSeleccionEntidad.PressedColor = Color.FromArgb(21, 92, 210);
            btnSeleccionEntidad.ShadowColor = Color.FromArgb(80, 0, 0, 0);
            btnSeleccionEntidad.Size = new Size(109, 25);
            btnSeleccionEntidad.TabIndex = 0;
            btnSeleccionEntidad.Text = "Sel. Entidad";
            btnSeleccionEntidad.TextColor = Color.White;
            btnSeleccionEntidad.UseVisualStyleBackColor = false;
            // 
            // groupBoxLista
            // 
            groupBoxLista.BackColor = Color.Transparent;
            groupBoxLista.BackgroundColor = Color.White;
            groupBoxLista.BorderColor = Color.FromArgb(188, 235, 240);
            groupBoxLista.BorderRadius = 30;
            groupBoxLista.BorderSize = 1;
            groupBoxLista.Controls.Add(btnEditar);
            groupBoxLista.Controls.Add(btnAgregar);
            groupBoxLista.Location = new Point(281, 71);
            groupBoxLista.Name = "groupBoxLista";
            groupBoxLista.Padding = new Padding(12, 24, 12, 12);
            groupBoxLista.Size = new Size(202, 83);
            groupBoxLista.TabIndex = 1;
            groupBoxLista.TabStop = false;
            groupBoxLista.Text = "Listado de Precios";
            // 
            // btnEditar
            // 
            btnEditar.BackColor = Color.White;
            btnEditar.BaseColor = Color.LightGray;
            btnEditar.BorderColor = Color.White;
            btnEditar.BorderSize = 1;
            btnEditar.CornerRadius = 14;
            btnEditar.DisabledColor = Color.FromArgb(200, 205, 210);
            btnEditar.Elevation = 6;
            btnEditar.FlatAppearance.BorderSize = 0;
            btnEditar.FlatStyle = FlatStyle.Flat;
            btnEditar.Font = new Font("Segoe UI", 9F, FontStyle.Bold, GraphicsUnit.Point, 0);
            btnEditar.ForeColor = Color.White;
            btnEditar.HoverColor = Color.FromArgb(27, 105, 232);
            btnEditar.Location = new Point(106, 43);
            btnEditar.Name = "btnEditar";
            btnEditar.Padding = new Padding(12, 6, 12, 6);
            btnEditar.PressedColor = Color.FromArgb(21, 92, 210);
            btnEditar.ShadowColor = Color.FromArgb(80, 0, 0, 0);
            btnEditar.Size = new Size(85, 25);
            btnEditar.TabIndex = 61;
            btnEditar.Text = "Editar";
            btnEditar.TextColor = Color.White;
            btnEditar.UseVisualStyleBackColor = false;
            // 
            // btnAgregar
            // 
            btnAgregar.BackColor = Color.FromArgb(38, 50, 56);
            btnAgregar.BaseColor = Color.FromArgb(38, 50, 56);
            btnAgregar.BorderColor = Color.White;
            btnAgregar.BorderSize = 1;
            btnAgregar.CornerRadius = 14;
            btnAgregar.DisabledColor = Color.FromArgb(200, 205, 210);
            btnAgregar.Elevation = 6;
            btnAgregar.FlatAppearance.BorderSize = 0;
            btnAgregar.FlatStyle = FlatStyle.Flat;
            btnAgregar.ForeColor = Color.White;
            btnAgregar.HoverColor = Color.FromArgb(27, 105, 232);
            btnAgregar.Location = new Point(15, 43);
            btnAgregar.Name = "btnAgregar";
            btnAgregar.Padding = new Padding(12, 6, 12, 6);
            btnAgregar.PressedColor = Color.FromArgb(21, 92, 210);
            btnAgregar.ShadowColor = Color.FromArgb(80, 0, 0, 0);
            btnAgregar.Size = new Size(85, 25);
            btnAgregar.TabIndex = 60;
            btnAgregar.Text = "Agregar";
            btnAgregar.TextColor = Color.White;
            btnAgregar.UseVisualStyleBackColor = false;
            // 
            // gbExportXlsx
            // 
            gbExportXlsx.BackColor = Color.Transparent;
            gbExportXlsx.BackgroundColor = Color.White;
            gbExportXlsx.BorderColor = Color.FromArgb(188, 235, 240);
            gbExportXlsx.BorderRadius = 30;
            gbExportXlsx.BorderSize = 1;
            gbExportXlsx.Controls.Add(lblCostoDirExp);
            gbExportXlsx.Controls.Add(lblContadorExp);
            gbExportXlsx.Controls.Add(btnXlsmExaminar);
            gbExportXlsx.Controls.Add(btnCrearXlsm);
            gbExportXlsx.Controls.Add(lblXlsxRuta);
            gbExportXlsx.Controls.Add(txtXlsxRuta);
            gbExportXlsx.Location = new Point(15, 456);
            gbExportXlsx.Name = "gbExportXlsx";
            gbExportXlsx.Padding = new Padding(12, 24, 12, 12);
            gbExportXlsx.Size = new Size(776, 98);
            gbExportXlsx.TabIndex = 7;
            gbExportXlsx.TabStop = false;
            gbExportXlsx.Text = "Exporta a Excel (.xlsx)";
            // 
            // btnXlsmExaminar
            // 
            btnXlsmExaminar.BackColor = Color.Transparent;
            btnXlsmExaminar.BaseColor = Color.Black;
            btnXlsmExaminar.BorderColor = Color.FromArgb(220, 223, 230);
            btnXlsmExaminar.BorderSize = 1;
            btnXlsmExaminar.CornerRadius = 14;
            btnXlsmExaminar.DisabledColor = Color.FromArgb(200, 205, 210);
            btnXlsmExaminar.Elevation = 6;
            btnXlsmExaminar.FlatStyle = FlatStyle.Flat;
            btnXlsmExaminar.ForeColor = Color.White;
            btnXlsmExaminar.HoverColor = Color.FromArgb(27, 105, 232);
            btnXlsmExaminar.Location = new Point(587, 19);
            btnXlsmExaminar.Name = "btnXlsmExaminar";
            btnXlsmExaminar.Padding = new Padding(12, 6, 12, 6);
            btnXlsmExaminar.PressedColor = Color.FromArgb(21, 92, 210);
            btnXlsmExaminar.ShadowColor = Color.FromArgb(80, 0, 0, 0);
            btnXlsmExaminar.Size = new Size(85, 25);
            btnXlsmExaminar.TabIndex = 0;
            btnXlsmExaminar.Text = "Examinar";
            btnXlsmExaminar.TextColor = Color.White;
            btnXlsmExaminar.UseVisualStyleBackColor = false;
            btnXlsmExaminar.Click += btnXlsmExaminar_Click;
            // 
            // btnCrearXlsm
            // 
            btnCrearXlsm.BackColor = Color.FromArgb(188, 235, 240);
            btnCrearXlsm.BaseColor = Color.FromArgb(188, 235, 240);
            btnCrearXlsm.BorderColor = Color.FromArgb(220, 223, 230);
            btnCrearXlsm.BorderSize = 1;
            btnCrearXlsm.CornerRadius = 14;
            btnCrearXlsm.DisabledColor = Color.FromArgb(200, 205, 210);
            btnCrearXlsm.Elevation = 6;
            btnCrearXlsm.FlatStyle = FlatStyle.Flat;
            btnCrearXlsm.ForeColor = Color.Black;
            btnCrearXlsm.HoverColor = Color.FromArgb(27, 105, 232);
            btnCrearXlsm.Location = new Point(678, 18);
            btnCrearXlsm.Name = "btnCrearXlsm";
            btnCrearXlsm.Padding = new Padding(12, 6, 12, 6);
            btnCrearXlsm.PressedColor = Color.FromArgb(21, 92, 210);
            btnCrearXlsm.ShadowColor = Color.FromArgb(80, 0, 0, 0);
            btnCrearXlsm.Size = new Size(85, 25);
            btnCrearXlsm.TabIndex = 0;
            btnCrearXlsm.Text = "Exportar";
            btnCrearXlsm.TextColor = Color.Black;
            btnCrearXlsm.UseVisualStyleBackColor = false;
            btnCrearXlsm.Click += btnCrearXlsm_Click;
            // 
            // GbItemPre
            // 
            GbItemPre.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            GbItemPre.BackColor = Color.Transparent;
            GbItemPre.BackgroundColor = Color.White;
            GbItemPre.BorderColor = Color.FromArgb(188, 235, 240);
            GbItemPre.BorderRadius = 30;
            GbItemPre.BorderSize = 1;
            GbItemPre.Controls.Add(dgvPrecargados);
            GbItemPre.Location = new Point(15, 554);
            GbItemPre.Name = "GbItemPre";
            GbItemPre.Padding = new Padding(12, 24, 12, 12);
            GbItemPre.Size = new Size(1131, 103);
            GbItemPre.TabIndex = 8;
            GbItemPre.TabStop = false;
            GbItemPre.Text = "Item's Precargados";
            // 
            // btnayuda
            // 
            btnayuda.BackColor = Color.FromArgb(38, 50, 56);
            btnayuda.BaseColor = Color.FromArgb(38, 50, 56);
            btnayuda.BorderColor = Color.FromArgb(220, 223, 230);
            btnayuda.BorderSize = 1;
            btnayuda.CornerRadius = 14;
            btnayuda.DisabledColor = Color.FromArgb(200, 205, 210);
            btnayuda.Elevation = 6;
            btnayuda.FlatAppearance.BorderSize = 0;
            btnayuda.FlatStyle = FlatStyle.Flat;
            btnayuda.ForeColor = Color.White;
            btnayuda.HoverColor = Color.FromArgb(27, 105, 232);
            btnayuda.Location = new Point(509, 85);
            btnayuda.Name = "btnayuda";
            btnayuda.Padding = new Padding(12, 6, 12, 6);
            btnayuda.PressedColor = Color.FromArgb(21, 92, 210);
            btnayuda.ShadowColor = Color.FromArgb(80, 0, 0, 0);
            btnayuda.Size = new Size(85, 25);
            btnayuda.TabIndex = 60;
            btnayuda.Text = "Ayuda (?)";
            btnayuda.TextColor = Color.White;
            btnayuda.UseVisualStyleBackColor = false;
            // 
            // btnbuscar
            // 
            btnbuscar.BackColor = Color.FromArgb(38, 50, 56);
            btnbuscar.BaseColor = Color.FromArgb(38, 50, 56);
            btnbuscar.BorderColor = Color.FromArgb(220, 223, 230);
            btnbuscar.BorderSize = 1;
            btnbuscar.CornerRadius = 14;
            btnbuscar.DisabledColor = Color.FromArgb(200, 205, 210);
            btnbuscar.Elevation = 6;
            btnbuscar.FlatAppearance.BorderSize = 0;
            btnbuscar.FlatStyle = FlatStyle.Flat;
            btnbuscar.ForeColor = Color.White;
            btnbuscar.HoverColor = Color.FromArgb(27, 105, 232);
            btnbuscar.Location = new Point(509, 117);
            btnbuscar.Name = "btnbuscar";
            btnbuscar.Padding = new Padding(12, 6, 12, 6);
            btnbuscar.PressedColor = Color.FromArgb(21, 92, 210);
            btnbuscar.ShadowColor = Color.FromArgb(80, 0, 0, 0);
            btnbuscar.Size = new Size(85, 25);
            btnbuscar.TabIndex = 61;
            btnbuscar.Text = "Buscar";
            btnbuscar.TextColor = Color.White;
            btnbuscar.UseVisualStyleBackColor = false;
            // 
            // pnlHeader
            // 
            pnlHeader.BackColor = Color.FromArgb(188, 235, 240);
            pnlHeader.BorderStyle = BorderStyle.Fixed3D;
            pnlHeader.Controls.Add(pbLogo);
            pnlHeader.Controls.Add(lblTitulo);
            pnlHeader.Controls.Add(lblContexto);
            pnlHeader.Dock = DockStyle.Top;
            pnlHeader.Location = new Point(0, 0);
            pnlHeader.Name = "pnlHeader";
            pnlHeader.Size = new Size(1151, 65);
            pnlHeader.TabIndex = 0;
            // 
            // pbLogo
            // 
            pbLogo.BackgroundImage = Properties.Resources.SicoeCAD1;
            pbLogo.BackgroundImageLayout = ImageLayout.Zoom;
            pbLogo.Location = new Point(10, 5);
            pbLogo.Name = "pbLogo";
            pbLogo.Size = new Size(120, 50);
            pbLogo.SizeMode = PictureBoxSizeMode.Zoom;
            pbLogo.TabIndex = 0;
            pbLogo.TabStop = false;
            // 
            // lblTitulo
            // 
            lblTitulo.AutoSize = true;
            lblTitulo.Font = new Font("Segoe UI", 12F, FontStyle.Bold);
            lblTitulo.ForeColor = Color.Black;
            lblTitulo.Location = new Point(216, 7);
            lblTitulo.Name = "lblTitulo";
            lblTitulo.Size = new Size(306, 28);
            lblTitulo.TabIndex = 1;
            lblTitulo.Text = "Presupuesto de Obra SicoeCAD";
            // 
            // lblContexto
            // 
            lblContexto.AutoSize = true;
            lblContexto.Font = new Font("Segoe UI", 9F);
            lblContexto.ForeColor = Color.Black;
            lblContexto.Location = new Point(168, 35);
            lblContexto.Name = "lblContexto";
            lblContexto.Size = new Size(454, 20);
            lblContexto.TabIndex = 2;
            lblContexto.Text = "Módulo de cantidades desde planos y exporte a Excel para control.";
            // 
            // pnlFooter
            // 
            pnlFooter.BackColor = Color.FromArgb(220, 223, 230);
            pnlFooter.Controls.Add(lblCopyright);
            pnlFooter.Dock = DockStyle.Bottom;
            pnlFooter.Location = new Point(0, 661);
            pnlFooter.Name = "pnlFooter";
            pnlFooter.Size = new Size(1151, 30);
            pnlFooter.TabIndex = 1;
            // 
            // lblCopyright
            // 
            lblCopyright.Dock = DockStyle.Fill;
            lblCopyright.Font = new Font("Segoe UI", 8F);
            lblCopyright.ForeColor = Color.FromArgb(60, 64, 72);
            lblCopyright.Location = new Point(0, 0);
            lblCopyright.Name = "lblCopyright";
            lblCopyright.Size = new Size(1151, 30);
            lblCopyright.TabIndex = 0;
            lblCopyright.Text = "© 2025 SicoeCAD® – Derechos reservados. Uso autorizado únicamente para el proyecto licenciado.";
            lblCopyright.TextAlign = ContentAlignment.MiddleCenter;
            // 
            // lblContadorExp
            // 
            lblContadorExp.AutoSize = true;
            lblContadorExp.BorderStyle = BorderStyle.FixedSingle;
            lblContadorExp.Location = new Point(182, 23);
            lblContadorExp.Name = "lblContadorExp";
            lblContadorExp.Size = new Size(73, 22);
            lblContadorExp.TabIndex = 62;
            lblContadorExp.Text = "Contador";
            // 
            // lblCostoDirExp
            // 
            lblCostoDirExp.AutoSize = true;
            lblCostoDirExp.BorderStyle = BorderStyle.FixedSingle;
            lblCostoDirExp.Location = new Point(280, 23);
            lblCostoDirExp.Name = "lblCostoDirExp";
            lblCostoDirExp.Size = new Size(102, 22);
            lblCostoDirExp.TabIndex = 63;
            lblCostoDirExp.Text = "Costo Directo";
            // 
            // FrmSicoePresupuesto
            // 
            AutoScaleDimensions = new SizeF(8F, 20F);
            AutoScaleMode = AutoScaleMode.Font;
            BackColor = Color.FromArgb(229, 247, 248);
            ClientSize = new Size(1151, 691);
            Controls.Add(btnbuscar);
            Controls.Add(btnayuda);
            Controls.Add(GbItemPre);
            Controls.Add(gbExportXlsx);
            Controls.Add(groupBoxLista);
            Controls.Add(roundedGroupBox1);
            Controls.Add(gbTipoEjecucion);
            Controls.Add(groupBoxParametros);
            Controls.Add(groupBoxInfo);
            Controls.Add(groupBox1);
            Controls.Add(gbTipoEntidad);
            Controls.Add(pnlFooter);
            Controls.Add(pnlHeader);
            Font = new Font("Segoe UI", 9F);
            ForeColor = Color.FromArgb(15, 23, 42);
            Name = "FrmSicoePresupuesto";
            Text = "Presupuesto de Obra SicoeCAD";
            Load += FrmSicoePresupuesto_Load;
            ((ISupportInitialize)dgvPrecargados).EndInit();
            gbTipoEntidad.ResumeLayout(false);
            gbTipoEntidad.PerformLayout();
            groupBox1.ResumeLayout(false);
            groupBoxInfo.ResumeLayout(false);
            groupBoxInfo.PerformLayout();
            groupBoxParametros.ResumeLayout(false);
            groupBoxParametros.PerformLayout();
            gbTipoEjecucion.ResumeLayout(false);
            gbTipoEjecucion.PerformLayout();
            roundedGroupBox1.ResumeLayout(false);
            groupBoxLista.ResumeLayout(false);
            gbExportXlsx.ResumeLayout(false);
            gbExportXlsx.PerformLayout();
            GbItemPre.ResumeLayout(false);
            pnlHeader.ResumeLayout(false);
            pnlHeader.PerformLayout();
            ((ISupportInitialize)pbLogo).EndInit();
            pnlFooter.ResumeLayout(false);
            ResumeLayout(false);

        }

        #endregion
        private RadioButton rbNodo;
        private RadioButton rbLongitud;
        private RadioButton rbArea;
        private Label label1;
        private ComboBox cmbCapitulo;
        private Label label2;
        private ComboBox cmbCompetencia;
        private Label label3;
        private ComboBox cmbItem;
        private Label label4;
        private ComboBox cmbUnd;
        private Label lblCapa;
        private Label lblAltText;
        private TextBox txtAltText;
        private Label lblAncho;
        private TextBox txtAncho;
        private Label lblEspesor;
        private TextBox txtEspesor;
        private Label lblNoInicio;
        private TextBox txtNoInicio;
        private Label lblNoFinal;
        private TextBox txtNoFinal;
        private Label lblObservacion;
        private TextBox txtObservacion;
        private TextBox txt_contador;
        private Label label5;
        private Button btnBorrar;
        private RadioButton rbEjecObra;
        private RadioButton rbEjecPresupuesto;
        private Button BtnAgritem;

        private Button btnCargueEje;
        private Button btnGenerarAbscisado;
        private DataGridView dgvPrecargados;
        private DataGridViewTextBoxColumn colTipo;
        private DataGridViewTextBoxColumn colItem;
        private DataGridViewTextBoxColumn colDescripcion;
        private DataGridViewTextBoxColumn colCantUnd;
        private DataGridViewTextBoxColumn colCantTotal;
        private DataGridViewTextBoxColumn colCostoDirecto;
        private System.Windows.Forms.Label lblXlsxRuta;
        private System.Windows.Forms.TextBox txtXlsxRuta;
        private Button btnCapasCsv;
        private Controls.RoundedGroupBox gbTipoEntidad;
        private Controls.RoundedGroupBox groupBox1;
        private Controls.RoundedGroupBox groupBoxInfo;
        private Controls.RoundedGroupBox groupBoxParametros;
        private Controls.RoundedGroupBox gbTipoEjecucion;
        private Controls.RoundedGroupBox roundedGroupBox1;
        private Controls.RoundedGroupBox groupBoxLista;
        private Controls.RoundedGroupBox gbExportXlsx;
        private Controls.RoundedGroupBox GbItemPre;
        private Controls.ElevatedButton btnAgregar;
        private Controls.ElevatedButton btnEditar;
        private Controls.ElevatedButton btnCrearXlsm;
        private Controls.ElevatedButton btnXlsmExaminar;
        private Controls.ElevatedButton btnayuda;
        private Controls.ElevatedButton btnSeleccionEntidad;
        private Controls.ElevatedButton btnbuscar;
        private Controls.ElevatedButton btnSyncExcel;
        private System.Windows.Forms.Panel pnlHeader;
        private System.Windows.Forms.Panel pnlFooter;
        private System.Windows.Forms.PictureBox pbLogo;
        private System.Windows.Forms.Label lblTitulo;
        private System.Windows.Forms.Label lblContexto;
        private System.Windows.Forms.Label lblCopyright;
        private Label lblContadorExp;
        private Label lblCostoDirExp;
    }
}
