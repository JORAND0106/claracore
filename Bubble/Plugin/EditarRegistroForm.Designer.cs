using System.Drawing;
using System.Windows.Forms;
using SicoePresupuestoNET8.Controls;

namespace SicoePresupuestoNET8
{
    partial class EditarRegistroForm
    {
        /// <summary>
        /// Required designer variable.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        // Nuevas declaraciones para Header y Footer
        private System.Windows.Forms.Panel pnlHeader;
        private System.Windows.Forms.Label lblTitulo;
        private System.Windows.Forms.Label lblContexto;
        private System.Windows.Forms.Panel pnlFooter;
        private System.Windows.Forms.Label lblCopyright;
        private System.Windows.Forms.PictureBox pbLogo; // <--- Nuevo control para el logo

        // Declaraciones existentes (reorganizadas para claridad)

        // GroupBoxes y Paneles principales
        private GroupBox gbDatos;
        private GroupBox gbAcciones;

        // Botones de acción
        private Button btnGuardar;
        private Button btnCancelar;

        // Combos para catálogos
        private ComboBox cbCapitulo, cbCompetencia, cbItem, cbUnd, cbDescripcion;

        // Labels para campos
        private Label lblCapitulo, lblCompetencia, lblItem, lblDescripcion, lblUnd,
                      lblNoInicio, lblNoFinal, lblTipoEjecucion, lblTipoEntidad, lblCapa,
                      lblCalzada, lblTramo, lblAreaLongNod, lblAncho, lblEspesor,
                      lblVlrUnitario, lblCantTotal, lblCostoDirecto, lblAbsIni, lblAbsFin, lblObservacion;

        // Inputs de texto personalizados (OutlinedTextBox)
        private OutlinedTextBox txtNoInicio, txtNoFinal, txtTipoEjecucion, txtTipoEntidad, txtCapa,
                                txtCalzada, txtTramo, txtAreaLongNod, txtAncho, txtEspesor,
                                txtVlrUnitario, txtCantTotal, txtCostoDirecto, txtAbsIni, txtAbsFin, txtObservacion;

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
            pnlHeader = new Panel();
            pbLogo = new PictureBox();
            lblTitulo = new Label();
            lblContexto = new Label();
            gbDatos = new GroupBox();
            lblCapitulo = new Label();
            cbCapitulo = new ComboBox();
            lblCompetencia = new Label();
            cbCompetencia = new ComboBox();
            lblItem = new Label();
            cbItem = new ComboBox();
            lblDescripcion = new Label();
            cbDescripcion = new ComboBox();
            lblUnd = new Label();
            cbUnd = new ComboBox();
            lblNoInicio = new Label();
            txtNoInicio = new OutlinedTextBox();
            lblNoFinal = new Label();
            txtNoFinal = new OutlinedTextBox();
            lblTipoEjecucion = new Label();
            txtTipoEjecucion = new OutlinedTextBox();
            lblTipoEntidad = new Label();
            txtTipoEntidad = new OutlinedTextBox();
            lblCapa = new Label();
            txtCapa = new OutlinedTextBox();
            lblCalzada = new Label();
            txtCalzada = new OutlinedTextBox();
            lblTramo = new Label();
            txtTramo = new OutlinedTextBox();
            lblAreaLongNod = new Label();
            txtAreaLongNod = new OutlinedTextBox();
            lblAncho = new Label();
            txtAncho = new OutlinedTextBox();
            lblEspesor = new Label();
            txtEspesor = new OutlinedTextBox();
            lblVlrUnitario = new Label();
            txtVlrUnitario = new OutlinedTextBox();
            lblCantTotal = new Label();
            txtCantTotal = new OutlinedTextBox();
            lblCostoDirecto = new Label();
            txtCostoDirecto = new OutlinedTextBox();
            lblAbsIni = new Label();
            txtAbsIni = new OutlinedTextBox();
            lblAbsFin = new Label();
            txtAbsFin = new OutlinedTextBox();
            lblObservacion = new Label();
            txtObservacion = new OutlinedTextBox();
            gbAcciones = new GroupBox();
            btnCancelar = new Button();
            btnGuardar = new Button();
            pnlFooter = new Panel();
            lblCopyright = new Label();
            pnlHeader.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)pbLogo).BeginInit();
            gbDatos.SuspendLayout();
            gbAcciones.SuspendLayout();
            pnlFooter.SuspendLayout();
            SuspendLayout();
            // 
            // pnlHeader
            // 
            pnlHeader.BackColor = SystemColors.ActiveBorder;
            pnlHeader.Controls.Add(pbLogo);
            pnlHeader.Controls.Add(lblTitulo);
            pnlHeader.Controls.Add(lblContexto);
            pnlHeader.Dock = DockStyle.Top;
            pnlHeader.Location = new Point(0, 0);
            pnlHeader.Name = "pnlHeader";
            pnlHeader.Size = new Size(1120, 60);
            pnlHeader.TabIndex = 22;
            // 
            // pbLogo
            // 
            pbLogo.BackgroundImage = Properties.Resources.SicoeCAD1;
            pbLogo.BackgroundImageLayout = ImageLayout.Zoom;
            pbLogo.Location = new Point(10, 5);
            pbLogo.Name = "pbLogo";
            pbLogo.Size = new Size(120, 50);
            pbLogo.SizeMode = PictureBoxSizeMode.Zoom;
            pbLogo.TabIndex = 2;
            pbLogo.TabStop = false;
            // 
            // lblTitulo
            // 
            lblTitulo.AutoSize = true;
            lblTitulo.Font = new Font("Segoe UI", 12F, FontStyle.Bold);
            lblTitulo.ForeColor = Color.White;
            lblTitulo.Location = new Point(136, 7);
            lblTitulo.Name = "lblTitulo";
            lblTitulo.Size = new Size(153, 28);
            lblTitulo.TabIndex = 0;
            lblTitulo.Text = "Editar Registro";
            // 
            // lblContexto
            // 
            lblContexto.AutoSize = true;
            lblContexto.Font = new Font("Segoe UI", 9F);
            lblContexto.ForeColor = Color.White;
            lblContexto.Location = new Point(140, 35);
            lblContexto.Name = "lblContexto";
            lblContexto.Size = new Size(526, 20);
            lblContexto.TabIndex = 1;
            lblContexto.Text = "Edición de datos de un registro de componente de obra y recálculo de costos.";
            // 
            // gbDatos
            // 
            gbDatos.BackColor = Color.FromArgb(229, 247, 248);
            gbDatos.Controls.Add(lblCapitulo);
            gbDatos.Controls.Add(cbCapitulo);
            gbDatos.Controls.Add(lblCompetencia);
            gbDatos.Controls.Add(cbCompetencia);
            gbDatos.Controls.Add(lblItem);
            gbDatos.Controls.Add(cbItem);
            gbDatos.Controls.Add(lblDescripcion);
            gbDatos.Controls.Add(cbDescripcion);
            gbDatos.Controls.Add(lblUnd);
            gbDatos.Controls.Add(cbUnd);
            gbDatos.Controls.Add(lblNoInicio);
            gbDatos.Controls.Add(txtNoInicio);
            gbDatos.Controls.Add(lblNoFinal);
            gbDatos.Controls.Add(txtNoFinal);
            gbDatos.Controls.Add(lblTipoEjecucion);
            gbDatos.Controls.Add(txtTipoEjecucion);
            gbDatos.Controls.Add(lblTipoEntidad);
            gbDatos.Controls.Add(txtTipoEntidad);
            gbDatos.Controls.Add(lblCapa);
            gbDatos.Controls.Add(txtCapa);
            gbDatos.Controls.Add(lblCalzada);
            gbDatos.Controls.Add(txtCalzada);
            gbDatos.Controls.Add(lblTramo);
            gbDatos.Controls.Add(txtTramo);
            gbDatos.Controls.Add(lblAreaLongNod);
            gbDatos.Controls.Add(txtAreaLongNod);
            gbDatos.Controls.Add(lblAncho);
            gbDatos.Controls.Add(txtAncho);
            gbDatos.Controls.Add(lblEspesor);
            gbDatos.Controls.Add(txtEspesor);
            gbDatos.Controls.Add(lblVlrUnitario);
            gbDatos.Controls.Add(txtVlrUnitario);
            gbDatos.Controls.Add(lblCantTotal);
            gbDatos.Controls.Add(txtCantTotal);
            gbDatos.Controls.Add(lblCostoDirecto);
            gbDatos.Controls.Add(txtCostoDirecto);
            gbDatos.Controls.Add(lblAbsIni);
            gbDatos.Controls.Add(txtAbsIni);
            gbDatos.Controls.Add(lblAbsFin);
            gbDatos.Controls.Add(txtAbsFin);
            gbDatos.Controls.Add(lblObservacion);
            gbDatos.Controls.Add(txtObservacion);
            gbDatos.Dock = DockStyle.Fill;
            gbDatos.Location = new Point(0, 60);
            gbDatos.Margin = new Padding(3, 4, 3, 4);
            gbDatos.Name = "gbDatos";
            gbDatos.Padding = new Padding(3, 4, 3, 4);
            gbDatos.Size = new Size(1120, 695);
            gbDatos.TabIndex = 0;
            gbDatos.TabStop = false;
            gbDatos.Text = "Datos del Registro";
            // 
            // lblCapitulo
            // 
            lblCapitulo.AutoSize = true;
            lblCapitulo.Location = new Point(34, 47);
            lblCapitulo.Name = "lblCapitulo";
            lblCapitulo.Size = new Size(68, 20);
            lblCapitulo.TabIndex = 0;
            lblCapitulo.Text = "Capítulo:";
            // 
            // cbCapitulo
            // 
            cbCapitulo.DropDownStyle = ComboBoxStyle.DropDownList;
            cbCapitulo.FormattingEnabled = true;
            cbCapitulo.Location = new Point(137, 43);
            cbCapitulo.Margin = new Padding(3, 4, 3, 4);
            cbCapitulo.Name = "cbCapitulo";
            cbCapitulo.Size = new Size(365, 28);
            cbCapitulo.TabIndex = 1;
            // 
            // lblCompetencia
            // 
            lblCompetencia.AutoSize = true;
            lblCompetencia.Location = new Point(549, 47);
            lblCompetencia.Name = "lblCompetencia";
            lblCompetencia.Size = new Size(100, 20);
            lblCompetencia.TabIndex = 2;
            lblCompetencia.Text = "Competencia:";
            // 
            // cbCompetencia
            // 
            cbCompetencia.DropDownStyle = ComboBoxStyle.DropDownList;
            cbCompetencia.FormattingEnabled = true;
            cbCompetencia.Location = new Point(663, 43);
            cbCompetencia.Margin = new Padding(3, 4, 3, 4);
            cbCompetencia.Name = "cbCompetencia";
            cbCompetencia.Size = new Size(365, 28);
            cbCompetencia.TabIndex = 2;
            // 
            // lblItem
            // 
            lblItem.AutoSize = true;
            lblItem.Location = new Point(34, 93);
            lblItem.Name = "lblItem";
            lblItem.Size = new Size(42, 20);
            lblItem.TabIndex = 3;
            lblItem.Text = "Ítem:";
            // 
            // cbItem
            // 
            cbItem.DropDownStyle = ComboBoxStyle.DropDownList;
            cbItem.FormattingEnabled = true;
            cbItem.Location = new Point(137, 89);
            cbItem.Margin = new Padding(3, 4, 3, 4);
            cbItem.Name = "cbItem";
            cbItem.Size = new Size(365, 28);
            cbItem.TabIndex = 3;
            // 
            // lblDescripcion
            // 
            lblDescripcion.AutoSize = true;
            lblDescripcion.Location = new Point(549, 93);
            lblDescripcion.Name = "lblDescripcion";
            lblDescripcion.Size = new Size(90, 20);
            lblDescripcion.TabIndex = 4;
            lblDescripcion.Text = "Descripción:";
            // 
            // cbDescripcion
            // 
            cbDescripcion.DropDownStyle = ComboBoxStyle.DropDownList;
            cbDescripcion.FormattingEnabled = true;
            cbDescripcion.Location = new Point(663, 89);
            cbDescripcion.Margin = new Padding(3, 4, 3, 4);
            cbDescripcion.Name = "cbDescripcion";
            cbDescripcion.Size = new Size(365, 28);
            cbDescripcion.TabIndex = 4;
            // 
            // lblUnd
            // 
            lblUnd.AutoSize = true;
            lblUnd.Location = new Point(34, 140);
            lblUnd.Name = "lblUnd";
            lblUnd.Size = new Size(39, 20);
            lblUnd.TabIndex = 5;
            lblUnd.Text = "Und:";
            // 
            // cbUnd
            // 
            cbUnd.DropDownStyle = ComboBoxStyle.DropDownList;
            cbUnd.FormattingEnabled = true;
            cbUnd.Location = new Point(137, 136);
            cbUnd.Margin = new Padding(3, 4, 3, 4);
            cbUnd.Name = "cbUnd";
            cbUnd.Size = new Size(365, 28);
            cbUnd.TabIndex = 5;
            // 
            // lblNoInicio
            // 
            lblNoInicio.AutoSize = true;
            lblNoInicio.Location = new Point(549, 140);
            lblNoInicio.Name = "lblNoInicio";
            lblNoInicio.Size = new Size(75, 20);
            lblNoInicio.TabIndex = 6;
            lblNoInicio.Text = "No. Inicio:";
            // 
            // txtNoInicio
            // 
            txtNoInicio.BorderColor = Color.FromArgb(220, 223, 230);
            txtNoInicio.BorderRadius = 10;
            txtNoInicio.BorderStyle = BorderStyle.None;
            txtNoInicio.BorderThickness = 1;
            txtNoInicio.FocusColor = Color.FromArgb(33, 118, 255);
            txtNoInicio.ForeColor = Color.Gray;
            txtNoInicio.Location = new Point(663, 136);
            txtNoInicio.Margin = new Padding(3, 4, 3, 4);
            txtNoInicio.Name = "txtNoInicio";
            txtNoInicio.Placeholder = "";
            txtNoInicio.Size = new Size(366, 20);
            txtNoInicio.TabIndex = 6;
            // 
            // lblNoFinal
            // 
            lblNoFinal.AutoSize = true;
            lblNoFinal.Location = new Point(34, 187);
            lblNoFinal.Name = "lblNoFinal";
            lblNoFinal.Size = new Size(70, 20);
            lblNoFinal.TabIndex = 7;
            lblNoFinal.Text = "No. Final:";
            // 
            // txtNoFinal
            // 
            txtNoFinal.BorderColor = Color.FromArgb(220, 223, 230);
            txtNoFinal.BorderRadius = 10;
            txtNoFinal.BorderStyle = BorderStyle.None;
            txtNoFinal.BorderThickness = 1;
            txtNoFinal.FocusColor = Color.FromArgb(33, 118, 255);
            txtNoFinal.ForeColor = Color.Gray;
            txtNoFinal.Location = new Point(137, 183);
            txtNoFinal.Margin = new Padding(3, 4, 3, 4);
            txtNoFinal.Name = "txtNoFinal";
            txtNoFinal.Placeholder = "";
            txtNoFinal.Size = new Size(366, 20);
            txtNoFinal.TabIndex = 7;
            // 
            // lblTipoEjecucion
            // 
            lblTipoEjecucion.AutoSize = true;
            lblTipoEjecucion.Location = new Point(549, 187);
            lblTipoEjecucion.Name = "lblTipoEjecucion";
            lblTipoEjecucion.Size = new Size(109, 20);
            lblTipoEjecucion.TabIndex = 8;
            lblTipoEjecucion.Text = "Tipo Ejecución:";
            // 
            // txtTipoEjecucion
            // 
            txtTipoEjecucion.BorderColor = Color.FromArgb(220, 223, 230);
            txtTipoEjecucion.BorderRadius = 10;
            txtTipoEjecucion.BorderStyle = BorderStyle.None;
            txtTipoEjecucion.BorderThickness = 1;
            txtTipoEjecucion.FocusColor = Color.FromArgb(33, 118, 255);
            txtTipoEjecucion.ForeColor = Color.Gray;
            txtTipoEjecucion.Location = new Point(663, 183);
            txtTipoEjecucion.Margin = new Padding(3, 4, 3, 4);
            txtTipoEjecucion.Name = "txtTipoEjecucion";
            txtTipoEjecucion.Placeholder = "";
            txtTipoEjecucion.Size = new Size(366, 20);
            txtTipoEjecucion.TabIndex = 8;
            // 
            // lblTipoEntidad
            // 
            lblTipoEntidad.AutoSize = true;
            lblTipoEntidad.Location = new Point(34, 233);
            lblTipoEntidad.Name = "lblTipoEntidad";
            lblTipoEntidad.Size = new Size(97, 20);
            lblTipoEntidad.TabIndex = 9;
            lblTipoEntidad.Text = "Tipo Entidad:";
            // 
            // txtTipoEntidad
            // 
            txtTipoEntidad.BorderColor = Color.FromArgb(220, 223, 230);
            txtTipoEntidad.BorderRadius = 10;
            txtTipoEntidad.BorderStyle = BorderStyle.None;
            txtTipoEntidad.BorderThickness = 1;
            txtTipoEntidad.FocusColor = Color.FromArgb(33, 118, 255);
            txtTipoEntidad.ForeColor = Color.Gray;
            txtTipoEntidad.Location = new Point(137, 229);
            txtTipoEntidad.Margin = new Padding(3, 4, 3, 4);
            txtTipoEntidad.Name = "txtTipoEntidad";
            txtTipoEntidad.Placeholder = "";
            txtTipoEntidad.Size = new Size(366, 20);
            txtTipoEntidad.TabIndex = 9;
            // 
            // lblCapa
            // 
            lblCapa.AutoSize = true;
            lblCapa.Location = new Point(549, 233);
            lblCapa.Name = "lblCapa";
            lblCapa.Size = new Size(94, 20);
            lblCapa.TabIndex = 10;
            lblCapa.Text = "Pk_Id / Capa:";
            // 
            // txtCapa
            // 
            txtCapa.BorderColor = Color.FromArgb(220, 223, 230);
            txtCapa.BorderRadius = 10;
            txtCapa.BorderStyle = BorderStyle.None;
            txtCapa.BorderThickness = 1;
            txtCapa.FocusColor = Color.FromArgb(33, 118, 255);
            txtCapa.ForeColor = Color.Gray;
            txtCapa.Location = new Point(663, 229);
            txtCapa.Margin = new Padding(3, 4, 3, 4);
            txtCapa.Name = "txtCapa";
            txtCapa.Placeholder = "";
            txtCapa.ReadOnly = true;
            txtCapa.Size = new Size(366, 20);
            txtCapa.TabIndex = 10;
            // 
            // lblCalzada
            // 
            lblCalzada.AutoSize = true;
            lblCalzada.Location = new Point(34, 280);
            lblCalzada.Name = "lblCalzada";
            lblCalzada.Size = new Size(65, 20);
            lblCalzada.TabIndex = 11;
            lblCalzada.Text = "Calzada:";
            // 
            // txtCalzada
            // 
            txtCalzada.BorderColor = Color.FromArgb(220, 223, 230);
            txtCalzada.BorderRadius = 10;
            txtCalzada.BorderStyle = BorderStyle.None;
            txtCalzada.BorderThickness = 1;
            txtCalzada.FocusColor = Color.FromArgb(33, 118, 255);
            txtCalzada.ForeColor = Color.Gray;
            txtCalzada.Location = new Point(137, 276);
            txtCalzada.Margin = new Padding(3, 4, 3, 4);
            txtCalzada.Name = "txtCalzada";
            txtCalzada.Placeholder = "";
            txtCalzada.Size = new Size(366, 20);
            txtCalzada.TabIndex = 11;
            // 
            // lblTramo
            // 
            lblTramo.AutoSize = true;
            lblTramo.Location = new Point(549, 280);
            lblTramo.Name = "lblTramo";
            lblTramo.Size = new Size(54, 20);
            lblTramo.TabIndex = 12;
            lblTramo.Text = "Tramo:";
            // 
            // txtTramo
            // 
            txtTramo.BorderColor = Color.FromArgb(220, 223, 230);
            txtTramo.BorderRadius = 10;
            txtTramo.BorderStyle = BorderStyle.None;
            txtTramo.BorderThickness = 1;
            txtTramo.FocusColor = Color.FromArgb(33, 118, 255);
            txtTramo.ForeColor = Color.Gray;
            txtTramo.Location = new Point(663, 276);
            txtTramo.Margin = new Padding(3, 4, 3, 4);
            txtTramo.Name = "txtTramo";
            txtTramo.Placeholder = "";
            txtTramo.Size = new Size(366, 20);
            txtTramo.TabIndex = 12;
            // 
            // lblAreaLongNod
            // 
            lblAreaLongNod.AutoSize = true;
            lblAreaLongNod.Location = new Point(34, 327);
            lblAreaLongNod.Name = "lblAreaLongNod";
            lblAreaLongNod.Size = new Size(117, 20);
            lblAreaLongNod.TabIndex = 13;
            lblAreaLongNod.Text = "Area/Long/Nod:";
            // 
            // txtAreaLongNod
            // 
            txtAreaLongNod.BorderColor = Color.FromArgb(220, 223, 230);
            txtAreaLongNod.BorderRadius = 10;
            txtAreaLongNod.BorderStyle = BorderStyle.None;
            txtAreaLongNod.BorderThickness = 1;
            txtAreaLongNod.FocusColor = Color.FromArgb(33, 118, 255);
            txtAreaLongNod.ForeColor = Color.Gray;
            txtAreaLongNod.Location = new Point(137, 323);
            txtAreaLongNod.Margin = new Padding(3, 4, 3, 4);
            txtAreaLongNod.Name = "txtAreaLongNod";
            txtAreaLongNod.Placeholder = "";
            txtAreaLongNod.Size = new Size(366, 20);
            txtAreaLongNod.TabIndex = 13;
            // 
            // lblAncho
            // 
            lblAncho.AutoSize = true;
            lblAncho.Location = new Point(549, 327);
            lblAncho.Name = "lblAncho";
            lblAncho.Size = new Size(54, 20);
            lblAncho.TabIndex = 14;
            lblAncho.Text = "Ancho:";
            // 
            // txtAncho
            // 
            txtAncho.BorderColor = Color.FromArgb(220, 223, 230);
            txtAncho.BorderRadius = 10;
            txtAncho.BorderStyle = BorderStyle.None;
            txtAncho.BorderThickness = 1;
            txtAncho.FocusColor = Color.FromArgb(33, 118, 255);
            txtAncho.ForeColor = Color.Gray;
            txtAncho.Location = new Point(663, 323);
            txtAncho.Margin = new Padding(3, 4, 3, 4);
            txtAncho.Name = "txtAncho";
            txtAncho.Placeholder = "";
            txtAncho.Size = new Size(366, 20);
            txtAncho.TabIndex = 14;
            // 
            // lblEspesor
            // 
            lblEspesor.AutoSize = true;
            lblEspesor.Location = new Point(34, 373);
            lblEspesor.Name = "lblEspesor";
            lblEspesor.Size = new Size(63, 20);
            lblEspesor.TabIndex = 15;
            lblEspesor.Text = "Espesor:";
            // 
            // txtEspesor
            // 
            txtEspesor.BorderColor = Color.FromArgb(220, 223, 230);
            txtEspesor.BorderRadius = 10;
            txtEspesor.BorderStyle = BorderStyle.None;
            txtEspesor.BorderThickness = 1;
            txtEspesor.FocusColor = Color.FromArgb(33, 118, 255);
            txtEspesor.ForeColor = Color.Gray;
            txtEspesor.Location = new Point(137, 369);
            txtEspesor.Margin = new Padding(3, 4, 3, 4);
            txtEspesor.Name = "txtEspesor";
            txtEspesor.Placeholder = "";
            txtEspesor.Size = new Size(366, 20);
            txtEspesor.TabIndex = 15;
            // 
            // lblVlrUnitario
            // 
            lblVlrUnitario.AutoSize = true;
            lblVlrUnitario.Location = new Point(549, 373);
            lblVlrUnitario.Name = "lblVlrUnitario";
            lblVlrUnitario.Size = new Size(87, 20);
            lblVlrUnitario.TabIndex = 16;
            lblVlrUnitario.Text = "Vlr Unitario:";
            // 
            // txtVlrUnitario
            // 
            txtVlrUnitario.BorderColor = Color.FromArgb(220, 223, 230);
            txtVlrUnitario.BorderRadius = 10;
            txtVlrUnitario.BorderStyle = BorderStyle.None;
            txtVlrUnitario.BorderThickness = 1;
            txtVlrUnitario.FocusColor = Color.FromArgb(33, 118, 255);
            txtVlrUnitario.ForeColor = Color.Gray;
            txtVlrUnitario.Location = new Point(663, 369);
            txtVlrUnitario.Margin = new Padding(3, 4, 3, 4);
            txtVlrUnitario.Name = "txtVlrUnitario";
            txtVlrUnitario.Placeholder = "";
            txtVlrUnitario.Size = new Size(366, 20);
            txtVlrUnitario.TabIndex = 16;
            // 
            // lblCantTotal
            // 
            lblCantTotal.AutoSize = true;
            lblCantTotal.Location = new Point(34, 420);
            lblCantTotal.Name = "lblCantTotal";
            lblCantTotal.Size = new Size(82, 20);
            lblCantTotal.TabIndex = 17;
            lblCantTotal.Text = "Cant. Total:";
            // 
            // txtCantTotal
            // 
            txtCantTotal.BorderColor = Color.FromArgb(220, 223, 230);
            txtCantTotal.BorderRadius = 10;
            txtCantTotal.BorderStyle = BorderStyle.None;
            txtCantTotal.BorderThickness = 1;
            txtCantTotal.FocusColor = Color.FromArgb(33, 118, 255);
            txtCantTotal.ForeColor = Color.Gray;
            txtCantTotal.Location = new Point(137, 416);
            txtCantTotal.Margin = new Padding(3, 4, 3, 4);
            txtCantTotal.Name = "txtCantTotal";
            txtCantTotal.Placeholder = "";
            txtCantTotal.ReadOnly = true;
            txtCantTotal.Size = new Size(366, 20);
            txtCantTotal.TabIndex = 17;
            // 
            // lblCostoDirecto
            // 
            lblCostoDirecto.AutoSize = true;
            lblCostoDirecto.Location = new Point(549, 420);
            lblCostoDirecto.Name = "lblCostoDirecto";
            lblCostoDirecto.Size = new Size(103, 20);
            lblCostoDirecto.TabIndex = 18;
            lblCostoDirecto.Text = "Costo Directo:";
            // 
            // txtCostoDirecto
            // 
            txtCostoDirecto.BorderColor = Color.FromArgb(220, 223, 230);
            txtCostoDirecto.BorderRadius = 10;
            txtCostoDirecto.BorderStyle = BorderStyle.None;
            txtCostoDirecto.BorderThickness = 1;
            txtCostoDirecto.FocusColor = Color.FromArgb(33, 118, 255);
            txtCostoDirecto.ForeColor = Color.Gray;
            txtCostoDirecto.Location = new Point(663, 416);
            txtCostoDirecto.Margin = new Padding(3, 4, 3, 4);
            txtCostoDirecto.Name = "txtCostoDirecto";
            txtCostoDirecto.Placeholder = "";
            txtCostoDirecto.ReadOnly = true;
            txtCostoDirecto.Size = new Size(366, 20);
            txtCostoDirecto.TabIndex = 18;
            // 
            // lblAbsIni
            // 
            lblAbsIni.AutoSize = true;
            lblAbsIni.Location = new Point(34, 467);
            lblAbsIni.Name = "lblAbsIni";
            lblAbsIni.Size = new Size(60, 20);
            lblAbsIni.TabIndex = 19;
            lblAbsIni.Text = "Abs. Ini:";
            // 
            // txtAbsIni
            // 
            txtAbsIni.BorderColor = Color.FromArgb(220, 223, 230);
            txtAbsIni.BorderRadius = 10;
            txtAbsIni.BorderStyle = BorderStyle.None;
            txtAbsIni.BorderThickness = 1;
            txtAbsIni.FocusColor = Color.FromArgb(33, 118, 255);
            txtAbsIni.ForeColor = Color.Gray;
            txtAbsIni.Location = new Point(137, 463);
            txtAbsIni.Margin = new Padding(3, 4, 3, 4);
            txtAbsIni.Name = "txtAbsIni";
            txtAbsIni.Placeholder = "";
            txtAbsIni.ReadOnly = true;
            txtAbsIni.Size = new Size(366, 20);
            txtAbsIni.TabIndex = 19;
            // 
            // lblAbsFin
            // 
            lblAbsFin.AutoSize = true;
            lblAbsFin.Location = new Point(549, 467);
            lblAbsFin.Name = "lblAbsFin";
            lblAbsFin.Size = new Size(63, 20);
            lblAbsFin.TabIndex = 20;
            lblAbsFin.Text = "Abs. Fin:";
            // 
            // txtAbsFin
            // 
            txtAbsFin.BorderColor = Color.FromArgb(220, 223, 230);
            txtAbsFin.BorderRadius = 10;
            txtAbsFin.BorderStyle = BorderStyle.None;
            txtAbsFin.BorderThickness = 1;
            txtAbsFin.FocusColor = Color.FromArgb(33, 118, 255);
            txtAbsFin.ForeColor = Color.Gray;
            txtAbsFin.Location = new Point(663, 463);
            txtAbsFin.Margin = new Padding(3, 4, 3, 4);
            txtAbsFin.Name = "txtAbsFin";
            txtAbsFin.Placeholder = "";
            txtAbsFin.ReadOnly = true;
            txtAbsFin.Size = new Size(366, 20);
            txtAbsFin.TabIndex = 20;
            // 
            // lblObservacion
            // 
            lblObservacion.AutoSize = true;
            lblObservacion.Location = new Point(34, 513);
            lblObservacion.Name = "lblObservacion";
            lblObservacion.Size = new Size(94, 20);
            lblObservacion.TabIndex = 21;
            lblObservacion.Text = "Observación:";
            // 
            // txtObservacion
            // 
            txtObservacion.BorderColor = Color.FromArgb(220, 223, 230);
            txtObservacion.BorderRadius = 10;
            txtObservacion.BorderStyle = BorderStyle.None;
            txtObservacion.BorderThickness = 1;
            txtObservacion.FocusColor = Color.FromArgb(33, 118, 255);
            txtObservacion.ForeColor = Color.Gray;
            txtObservacion.Location = new Point(137, 509);
            txtObservacion.Margin = new Padding(3, 4, 3, 4);
            txtObservacion.Name = "txtObservacion";
            txtObservacion.Placeholder = "";
            txtObservacion.Size = new Size(891, 20);
            txtObservacion.TabIndex = 21;
            // 
            // gbAcciones
            // 
            gbAcciones.Controls.Add(btnCancelar);
            gbAcciones.Controls.Add(btnGuardar);
            gbAcciones.Dock = DockStyle.Bottom;
            gbAcciones.Location = new Point(0, 701);
            gbAcciones.Margin = new Padding(3, 4, 3, 4);
            gbAcciones.Name = "gbAcciones";
            gbAcciones.Padding = new Padding(3, 4, 3, 4);
            gbAcciones.Size = new Size(1120, 54);
            gbAcciones.TabIndex = 1;
            gbAcciones.TabStop = false;
            // 
            // btnCancelar
            // 
            btnCancelar.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
            btnCancelar.BackColor = Color.FromArgb(38, 50, 56);
            btnCancelar.DialogResult = DialogResult.Cancel;
            btnCancelar.FlatAppearance.BorderSize = 0;
            btnCancelar.FlatStyle = FlatStyle.Flat;
            btnCancelar.ForeColor = SystemColors.HighlightText;
            btnCancelar.Location = new Point(834, 13);
            btnCancelar.Margin = new Padding(3, 4, 3, 4);
            btnCancelar.Name = "btnCancelar";
            btnCancelar.Size = new Size(137, 30);
            btnCancelar.TabIndex = 1;
            btnCancelar.Text = "Cancelar";
            btnCancelar.UseVisualStyleBackColor = false;
            // 
            // btnGuardar
            // 
            btnGuardar.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
            btnGuardar.BackColor = Color.FromArgb(33, 118, 255);
            btnGuardar.ForeColor = Color.White;
            btnGuardar.Location = new Point(977, 11);
            btnGuardar.Margin = new Padding(3, 4, 3, 4);
            btnGuardar.Name = "btnGuardar";
            btnGuardar.Size = new Size(137, 35);
            btnGuardar.TabIndex = 0;
            btnGuardar.Text = "Guardar";
            btnGuardar.UseVisualStyleBackColor = false;
            // 
            // pnlFooter
            // 
            pnlFooter.BackColor = Color.FromArgb(220, 223, 230);
            pnlFooter.Controls.Add(lblCopyright);
            pnlFooter.Dock = DockStyle.Bottom;
            pnlFooter.Location = new Point(0, 755);
            pnlFooter.Name = "pnlFooter";
            pnlFooter.Size = new Size(1120, 30);
            pnlFooter.TabIndex = 23;
            // 
            // lblCopyright
            // 
            lblCopyright.Dock = DockStyle.Fill;
            lblCopyright.Font = new Font("Segoe UI", 8F);
            lblCopyright.ForeColor = Color.FromArgb(60, 64, 72);
            lblCopyright.Location = new Point(0, 0);
            lblCopyright.Name = "lblCopyright";
            lblCopyright.Size = new Size(1120, 30);
            lblCopyright.TabIndex = 0;
            lblCopyright.Text = "Protección de Software y Copyright © 2024. Todos los derechos reservados.";
            lblCopyright.TextAlign = ContentAlignment.MiddleCenter;
            // 
            // EditarRegistroForm
            // 
            AutoScaleDimensions = new SizeF(8F, 20F);
            AutoScaleMode = AutoScaleMode.Font;
            BackColor = Color.FromArgb(188, 235, 240);
            ClientSize = new Size(1120, 785);
            Controls.Add(gbAcciones);
            Controls.Add(gbDatos);
            Controls.Add(pnlHeader);
            Controls.Add(pnlFooter);
            Margin = new Padding(3, 4, 3, 4);
            Name = "EditarRegistroForm";
            Text = "Editar Registro";
            pnlHeader.ResumeLayout(false);
            pnlHeader.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)pbLogo).EndInit();
            gbDatos.ResumeLayout(false);
            gbDatos.PerformLayout();
            gbAcciones.ResumeLayout(false);
            pnlFooter.ResumeLayout(false);
            ResumeLayout(false);
        }

        #endregion
    }
}