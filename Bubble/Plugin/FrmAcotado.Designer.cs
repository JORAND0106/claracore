using System;
using System.Drawing;
using System.Windows.Forms;

namespace SicoeCAD
{
    partial class FrmAcotado
    {
        private System.ComponentModel.IContainer components = null;
        private Label lblSel;
        private TextBox txtSeleccion;
        private Label lblCapa;
        private ComboBox cboCapa;
        private Label lblDesfase;
        private TextBox txtDesfase;
        private Label lblAlttext;
        private TextBox txtAlttext;
        private Button btnSeleccionar;
        private Button btnAcotar;
        private Button btnDeshacer;
        private Button btnCerrar;
        private CheckBox chkAlineado;
        private CheckBox chkHorizontal;
        private CheckBox chkVertical;
        private CheckBox chkAngular;
        private CheckBox chkOrdX;
        private CheckBox chkOrdY;
        private CheckBox chkLongArco;
        private CheckBox chkRadio;
        private CheckBox chkDiametro;
        private CheckBox chkEntreEntidades;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
                components.Dispose();
            base.Dispose(disposing);
        }

        private void InitializeComponent()
        {
            lblSel = new Label();
            txtSeleccion = new TextBox();
            lblCapa = new Label();
            cboCapa = new ComboBox();
            lblDesfase = new Label();
            txtDesfase = new TextBox();
            btnSeleccionar = new Button();
            btnAcotar = new Button();
            btnDeshacer = new Button();
            btnCerrar = new Button();
            chkEntreEntidades = new CheckBox();
            chkAlineado = new CheckBox();
            chkHorizontal = new CheckBox();
            chkVertical = new CheckBox();
            chkAngular = new CheckBox();
            chkOrdX = new CheckBox();
            chkOrdY = new CheckBox();
            chkLongArco = new CheckBox();
            chkRadio = new CheckBox();
            chkDiametro = new CheckBox();
            lblAlttext = new Label();
            txtAlttext = new TextBox();
            gbrAcotado = new GroupBox();
            gbrAcotado.SuspendLayout();
            SuspendLayout();
            // 
            // lblSel
            // 
            lblSel.AutoSize = true;
            lblSel.Location = new Point(25, 20);
            lblSel.Name = "lblSel";
            lblSel.Size = new Size(210, 20);
            lblSel.TabIndex = 0;
            lblSel.Text = "Seleccione entidades a acotar:";
            // 
            // txtSeleccion
            // 
            txtSeleccion.BackColor = Color.FromArgb(242, 247, 255);
            txtSeleccion.Location = new Point(28, 42);
            txtSeleccion.Name = "txtSeleccion";
            txtSeleccion.ReadOnly = true;
            txtSeleccion.Size = new Size(478, 27);
            txtSeleccion.TabIndex = 1;
            txtSeleccion.Text = "0 entidades";
            // 
            // lblCapa
            // 
            lblCapa.AutoSize = true;
            lblCapa.Location = new Point(25, 75);
            lblCapa.Name = "lblCapa";
            lblCapa.Size = new Size(99, 20);
            lblCapa.TabIndex = 2;
            lblCapa.Text = "Capa destino:";
            // 
            // cboCapa
            // 
            cboCapa.AutoCompleteMode = AutoCompleteMode.SuggestAppend;
            cboCapa.AutoCompleteSource = AutoCompleteSource.ListItems;
            cboCapa.Location = new Point(155, 74);
            cboCapa.Name = "cboCapa";
            cboCapa.Size = new Size(351, 28);
            cboCapa.TabIndex = 0;
            // 
            // lblDesfase
            // 
            lblDesfase.AutoSize = true;
            lblDesfase.Location = new Point(25, 105);
            lblDesfase.Name = "lblDesfase";
            lblDesfase.Size = new Size(175, 20);
            lblDesfase.TabIndex = 4;
            lblDesfase.Text = "Distancia de desfase (m):";
            // 
            // txtDesfase
            // 
            txtDesfase.Location = new Point(206, 105);
            txtDesfase.Name = "txtDesfase";
            txtDesfase.Size = new Size(80, 27);
            txtDesfase.TabIndex = 1;
            txtDesfase.Text = "1.25";
            // 
            // btnSeleccionar
            // 
            btnSeleccionar.BackColor = Color.FromArgb(59, 89, 152);
            btnSeleccionar.FlatStyle = FlatStyle.Flat;
            btnSeleccionar.ForeColor = Color.White;
            btnSeleccionar.Location = new Point(28, 333);
            btnSeleccionar.Name = "btnSeleccionar";
            btnSeleccionar.Size = new Size(100, 28);
            btnSeleccionar.TabIndex = 14;
            btnSeleccionar.Text = "Seleccionar";
            btnSeleccionar.UseVisualStyleBackColor = false;
            btnSeleccionar.Click += BtnSeleccionar_Click;
            // 
            // btnAcotar
            // 
            btnAcotar.BackColor = Color.FromArgb(41, 128, 185);
            btnAcotar.FlatStyle = FlatStyle.Flat;
            btnAcotar.ForeColor = Color.White;
            btnAcotar.Location = new Point(150, 333);
            btnAcotar.Name = "btnAcotar";
            btnAcotar.Size = new Size(100, 28);
            btnAcotar.TabIndex = 15;
            btnAcotar.Text = "Acotar";
            btnAcotar.UseVisualStyleBackColor = false;
            btnAcotar.Click += BtnAcotar_Click;
            // 
            // btnDeshacer
            // 
            btnDeshacer.BackColor = Color.FromArgb(231, 76, 60);
            btnDeshacer.FlatStyle = FlatStyle.Flat;
            btnDeshacer.ForeColor = Color.White;
            btnDeshacer.Location = new Point(272, 333);
            btnDeshacer.Name = "btnDeshacer";
            btnDeshacer.Size = new Size(100, 28);
            btnDeshacer.TabIndex = 16;
            btnDeshacer.Text = "Deshacer";
            btnDeshacer.UseVisualStyleBackColor = false;
            btnDeshacer.Click += BtnDeshacer_Click;
            // 
            // btnCerrar
            // 
            btnCerrar.BackColor = Color.FromArgb(127, 140, 141);
            btnCerrar.FlatStyle = FlatStyle.Flat;
            btnCerrar.ForeColor = Color.White;
            btnCerrar.Location = new Point(393, 333);
            btnCerrar.Name = "btnCerrar";
            btnCerrar.Size = new Size(100, 28);
            btnCerrar.TabIndex = 17;
            btnCerrar.Text = "Cerrar";
            btnCerrar.UseVisualStyleBackColor = false;
            btnCerrar.Click += BtnCerrar_Click;
            // 
            // chkEntreEntidades
            // 
            chkEntreEntidades.AutoSize = true;
            chkEntreEntidades.Location = new Point(28, 303);
            chkEntreEntidades.Name = "chkEntreEntidades";
            chkEntreEntidades.Size = new Size(241, 24);
            chkEntreEntidades.TabIndex = 13;
            chkEntreEntidades.Text = "Incluir distancia entre entidades";
            // 
            // chkAlineado
            // 
            chkAlineado.Location = new Point(49, 49);
            chkAlineado.Name = "chkAlineado";
            chkAlineado.Size = new Size(104, 24);
            chkAlineado.TabIndex = 4;
            chkAlineado.Text = "Alineado";
            // 
            // chkHorizontal
            // 
            chkHorizontal.Location = new Point(49, 79);
            chkHorizontal.Name = "chkHorizontal";
            chkHorizontal.Size = new Size(104, 24);
            chkHorizontal.TabIndex = 5;
            chkHorizontal.Text = "Horizontal";
            // 
            // chkVertical
            // 
            chkVertical.Location = new Point(49, 109);
            chkVertical.Name = "chkVertical";
            chkVertical.Size = new Size(104, 24);
            chkVertical.TabIndex = 6;
            chkVertical.Text = "Vertical";
            // 
            // chkAngular
            // 
            chkAngular.Location = new Point(165, 49);
            chkAngular.Name = "chkAngular";
            chkAngular.Size = new Size(104, 24);
            chkAngular.TabIndex = 7;
            chkAngular.Text = "Angular";
            // 
            // chkOrdX
            // 
            chkOrdX.Location = new Point(284, 49);
            chkOrdX.Name = "chkOrdX";
            chkOrdX.Size = new Size(155, 24);
            chkOrdX.TabIndex = 10;
            chkOrdX.Text = "Este";
            // 
            // chkOrdY
            // 
            chkOrdY.Location = new Point(284, 79);
            chkOrdY.Name = "chkOrdY";
            chkOrdY.Size = new Size(155, 24);
            chkOrdY.TabIndex = 11;
            chkOrdY.Text = "Norte";
            // 
            // chkLongArco
            // 
            chkLongArco.Location = new Point(284, 109);
            chkLongArco.Name = "chkLongArco";
            chkLongArco.Size = new Size(155, 24);
            chkLongArco.TabIndex = 12;
            chkLongArco.Text = "Longitud de Arco";
            // 
            // chkRadio
            // 
            chkRadio.Location = new Point(165, 109);
            chkRadio.Name = "chkRadio";
            chkRadio.Size = new Size(106, 24);
            chkRadio.TabIndex = 9;
            chkRadio.Text = "Radio";
            // 
            // chkDiametro
            // 
            chkDiametro.Location = new Point(165, 79);
            chkDiametro.Name = "chkDiametro";
            chkDiametro.Size = new Size(104, 24);
            chkDiametro.TabIndex = 8;
            chkDiametro.Text = "Diámetro";
            // 
            // lblAlttext
            // 
            lblAlttext.AutoSize = true;
            lblAlttext.Location = new Point(303, 108);
            lblAlttext.Name = "lblAlttext";
            lblAlttext.Size = new Size(117, 20);
            lblAlttext.TabIndex = 6;
            lblAlttext.Text = "Altura texto (m):";
            // 
            // txtAlttext
            // 
            txtAlttext.Location = new Point(428, 105);
            txtAlttext.Name = "txtAlttext";
            txtAlttext.Size = new Size(78, 27);
            txtAlttext.TabIndex = 2;
            txtAlttext.Text = "1.00";
            // 
            // gbrAcotado
            // 
            gbrAcotado.BackColor = Color.FromArgb(242, 247, 255);
            gbrAcotado.Controls.Add(chkAlineado);
            gbrAcotado.Controls.Add(chkDiametro);
            gbrAcotado.Controls.Add(chkRadio);
            gbrAcotado.Controls.Add(chkLongArco);
            gbrAcotado.Controls.Add(chkOrdY);
            gbrAcotado.Controls.Add(chkOrdX);
            gbrAcotado.Controls.Add(chkAngular);
            gbrAcotado.Controls.Add(chkVertical);
            gbrAcotado.Controls.Add(chkHorizontal);
            gbrAcotado.FlatStyle = FlatStyle.Popup;
            gbrAcotado.Location = new Point(28, 138);
            gbrAcotado.Name = "gbrAcotado";
            gbrAcotado.Size = new Size(478, 159);
            gbrAcotado.TabIndex = 3;
            gbrAcotado.TabStop = false;
            gbrAcotado.Text = "Tipos de Acotado";
            // 
            // FrmAcotado
            // 
            BackColor = Color.FromArgb(242, 247, 255);
            ClientSize = new Size(524, 377);
            Controls.Add(gbrAcotado);
            Controls.Add(lblSel);
            Controls.Add(txtSeleccion);
            Controls.Add(lblCapa);
            Controls.Add(cboCapa);
            Controls.Add(lblDesfase);
            Controls.Add(txtDesfase);
            Controls.Add(lblAlttext);
            Controls.Add(txtAlttext);
            Controls.Add(chkEntreEntidades);
            Controls.Add(btnSeleccionar);
            Controls.Add(btnAcotar);
            Controls.Add(btnDeshacer);
            Controls.Add(btnCerrar);
            Name = "FrmAcotado";
            StartPosition = FormStartPosition.CenterScreen;
            Text = "Acotado Automático - SICOE";
            gbrAcotado.ResumeLayout(false);
            ResumeLayout(false);
            PerformLayout();
        }
        private GroupBox gbrAcotado;
    }
}
