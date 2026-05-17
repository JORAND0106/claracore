using System;
using System.ComponentModel;
using System.Drawing;
using System.Windows.Forms;

namespace SicoePresupuestoNET8
{
    partial class FrmOffsetInteligente
    {
        private IContainer components = null;

        private Panel panelHeader;
        private PictureBox picLogo;
        private Label lblTitulo;
        private Label lblDescripcion;

        private GroupBox grpSeleccion;
        private Button btnSeleccionar;
        private Label lblSeleccionInfo;

        private GroupBox grpParametros;
        private Label lblDistancia;
        private TextBox txtDistancia;
        private Label lblModo;
        private ComboBox cmbModo;
        private CheckBox chkCapaNueva;
        private Label lblLayer;
        private TextBox txtLayer;

        private GroupBox grpLados;
        private CheckBox chkIzq;
        private CheckBox chkDer;
        private CheckBox chkSup;
        private CheckBox chkInf;
        private CheckBox chkAutoNoOffsetLadosComunes;

        private GroupBox grpOpciones;
        private CheckBox chkMantenerCurvas;
        private CheckBox chkNoExplote;
        private CheckBox chkPrevisualizar;

        private Button btnEjecutar;
        private Button btnCerrar;

        private Label lblFooter;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
                components.Dispose();
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        private void InitializeComponent()
        {
            panelHeader = new Panel();
            picLogo = new PictureBox();
            lblTitulo = new Label();
            lblDescripcion = new Label();
            grpSeleccion = new GroupBox();
            btnSeleccionar = new Button();
            lblSeleccionInfo = new Label();
            grpParametros = new GroupBox();
            lblDistancia = new Label();
            txtDistancia = new TextBox();
            lblModo = new Label();
            cmbModo = new ComboBox();
            chkCapaNueva = new CheckBox();
            lblLayer = new Label();
            txtLayer = new TextBox();
            grpLados = new GroupBox();
            chkIzq = new CheckBox();
            chkDer = new CheckBox();
            chkSup = new CheckBox();
            chkInf = new CheckBox();
            chkAutoNoOffsetLadosComunes = new CheckBox();
            grpOpciones = new GroupBox();
            chkMantenerCurvas = new CheckBox();
            chkNoExplote = new CheckBox();
            chkPrevisualizar = new CheckBox();
            btnEjecutar = new Button();
            btnCerrar = new Button();
            lblFooter = new Label();
            panelHeader.SuspendLayout();
            ((ISupportInitialize)picLogo).BeginInit();
            grpSeleccion.SuspendLayout();
            grpParametros.SuspendLayout();
            grpLados.SuspendLayout();
            grpOpciones.SuspendLayout();
            SuspendLayout();
            // 
            // panelHeader
            // 
            panelHeader.BackColor = Color.FromArgb(0, 138, 154);
            panelHeader.Controls.Add(picLogo);
            panelHeader.Controls.Add(lblTitulo);
            panelHeader.Controls.Add(lblDescripcion);
            panelHeader.Dock = DockStyle.Top;
            panelHeader.Location = new Point(0, 0);
            panelHeader.Name = "panelHeader";
            panelHeader.Padding = new Padding(10, 8, 10, 8);
            panelHeader.Size = new Size(980, 78);
            panelHeader.TabIndex = 0;
            // 
            // picLogo
            // 
            picLogo.Location = new Point(12, 12);
            picLogo.Name = "picLogo";
            picLogo.Size = new Size(130, 55);
            picLogo.SizeMode = PictureBoxSizeMode.Zoom;
            picLogo.TabIndex = 0;
            picLogo.TabStop = false;
            // 
            // lblTitulo
            // 
            lblTitulo.Font = new Font("Segoe UI", 12F, FontStyle.Bold);
            lblTitulo.ForeColor = Color.White;
            lblTitulo.Location = new Point(150, 10);
            lblTitulo.Name = "lblTitulo";
            lblTitulo.Size = new Size(820, 32);
            lblTitulo.TabIndex = 1;
            lblTitulo.Text = "Offset inteligente";
            lblTitulo.TextAlign = ContentAlignment.MiddleLeft;
            // 
            // lblDescripcion
            // 
            lblDescripcion.Font = new Font("Segoe UI", 9F);
            lblDescripcion.ForeColor = Color.White;
            lblDescripcion.Location = new Point(150, 40);
            lblDescripcion.Name = "lblDescripcion";
            lblDescripcion.Size = new Size(820, 24);
            lblDescripcion.TabIndex = 2;
            lblDescripcion.Text = "Seleccione entidades y defina lados a desfasar. (UI sin lógica en esta fase)";
            lblDescripcion.TextAlign = ContentAlignment.MiddleLeft;
            // 
            // grpSeleccion
            // 
            grpSeleccion.Controls.Add(btnSeleccionar);
            grpSeleccion.Controls.Add(lblSeleccionInfo);
            grpSeleccion.Font = new Font("Segoe UI", 9F);
            grpSeleccion.Location = new Point(12, 90);
            grpSeleccion.Name = "grpSeleccion";
            grpSeleccion.Size = new Size(520, 92);
            grpSeleccion.TabIndex = 1;
            grpSeleccion.TabStop = false;
            grpSeleccion.Text = "Selección";
            // 
            // btnSeleccionar
            // 
            btnSeleccionar.Location = new Point(14, 28);
            btnSeleccionar.Name = "btnSeleccionar";
            btnSeleccionar.Size = new Size(180, 32);
            btnSeleccionar.TabIndex = 0;
            btnSeleccionar.Text = "Seleccionar entidades...";
            btnSeleccionar.UseVisualStyleBackColor = true;
            // 
            // lblSeleccionInfo
            // 
            lblSeleccionInfo.Location = new Point(210, 34);
            lblSeleccionInfo.Name = "lblSeleccionInfo";
            lblSeleccionInfo.Size = new Size(290, 22);
            lblSeleccionInfo.TabIndex = 1;
            lblSeleccionInfo.Text = "0 entidad(es) seleccionada(s).";
            // 
            // grpParametros
            // 
            grpParametros.Controls.Add(lblDistancia);
            grpParametros.Controls.Add(txtDistancia);
            grpParametros.Controls.Add(lblModo);
            grpParametros.Controls.Add(cmbModo);
            grpParametros.Controls.Add(chkCapaNueva);
            grpParametros.Controls.Add(lblLayer);
            grpParametros.Controls.Add(txtLayer);
            grpParametros.Font = new Font("Segoe UI", 9F);
            grpParametros.Location = new Point(12, 190);
            grpParametros.Name = "grpParametros";
            grpParametros.Size = new Size(520, 150);
            grpParametros.TabIndex = 2;
            grpParametros.TabStop = false;
            grpParametros.Text = "Parámetros";
            // 
            // lblDistancia
            // 
            lblDistancia.Location = new Point(14, 32);
            lblDistancia.Name = "lblDistancia";
            lblDistancia.Size = new Size(120, 22);
            lblDistancia.TabIndex = 0;
            lblDistancia.Text = "Distancia (m):";
            // 
            // txtDistancia
            // 
            txtDistancia.Location = new Point(140, 30);
            txtDistancia.Name = "txtDistancia";
            txtDistancia.Size = new Size(90, 27);
            txtDistancia.TabIndex = 1;
            txtDistancia.Text = "0.20";
            txtDistancia.TextAlign = HorizontalAlignment.Right;
            // 
            // lblModo
            // 
            lblModo.Location = new Point(250, 32);
            lblModo.Name = "lblModo";
            lblModo.Size = new Size(60, 22);
            lblModo.TabIndex = 2;
            lblModo.Text = "Modo:";
            // 
            // cmbModo
            // 
            cmbModo.DropDownStyle = ComboBoxStyle.DropDownList;
            cmbModo.FormattingEnabled = true;
            cmbModo.Location = new Point(310, 30);
            cmbModo.Name = "cmbModo";
            cmbModo.Size = new Size(190, 28);
            cmbModo.TabIndex = 3;
            // 
            // chkCapaNueva
            // 
            chkCapaNueva.Location = new Point(14, 70);
            chkCapaNueva.Name = "chkCapaNueva";
            chkCapaNueva.Size = new Size(250, 24);
            chkCapaNueva.TabIndex = 4;
            chkCapaNueva.Text = "Crear resultado en capa nueva";
            chkCapaNueva.UseVisualStyleBackColor = true;
            // 
            // lblLayer
            // 
            lblLayer.Location = new Point(14, 102);
            lblLayer.Name = "lblLayer";
            lblLayer.Size = new Size(120, 22);
            lblLayer.TabIndex = 5;
            lblLayer.Text = "Layer destino:";
            // 
            // txtLayer
            // 
            txtLayer.Location = new Point(140, 100);
            txtLayer.Name = "txtLayer";
            txtLayer.Size = new Size(360, 27);
            txtLayer.TabIndex = 6;
            txtLayer.Text = "SICOE_OFFSET_INTELIGENTE";
            // 
            // grpLados
            // 
            grpLados.Controls.Add(chkIzq);
            grpLados.Controls.Add(chkDer);
            grpLados.Controls.Add(chkSup);
            grpLados.Controls.Add(chkInf);
            grpLados.Controls.Add(chkAutoNoOffsetLadosComunes);
            grpLados.Font = new Font("Segoe UI", 9F);
            grpLados.Location = new Point(548, 90);
            grpLados.Name = "grpLados";
            grpLados.Size = new Size(420, 150);
            grpLados.TabIndex = 3;
            grpLados.TabStop = false;
            grpLados.Text = "Lados a desfasar (por entidad)";
            // 
            // chkIzq
            // 
            chkIzq.Location = new Point(16, 30);
            chkIzq.Name = "chkIzq";
            chkIzq.Size = new Size(120, 24);
            chkIzq.TabIndex = 0;
            chkIzq.Text = "Izquierdo";
            chkIzq.UseVisualStyleBackColor = true;
            // 
            // chkDer
            // 
            chkDer.Location = new Point(160, 30);
            chkDer.Name = "chkDer";
            chkDer.Size = new Size(120, 24);
            chkDer.TabIndex = 1;
            chkDer.Text = "Derecho";
            chkDer.UseVisualStyleBackColor = true;
            // 
            // chkSup
            // 
            chkSup.Location = new Point(16, 60);
            chkSup.Name = "chkSup";
            chkSup.Size = new Size(120, 24);
            chkSup.TabIndex = 2;
            chkSup.Text = "Superior";
            chkSup.UseVisualStyleBackColor = true;
            // 
            // chkInf
            // 
            chkInf.Location = new Point(160, 60);
            chkInf.Name = "chkInf";
            chkInf.Size = new Size(120, 24);
            chkInf.TabIndex = 3;
            chkInf.Text = "Inferior";
            chkInf.UseVisualStyleBackColor = true;
            // 
            // chkAutoNoOffsetLadosComunes
            // 
            chkAutoNoOffsetLadosComunes.Location = new Point(16, 98);
            chkAutoNoOffsetLadosComunes.Name = "chkAutoNoOffsetLadosComunes";
            chkAutoNoOffsetLadosComunes.Size = new Size(390, 40);
            chkAutoNoOffsetLadosComunes.TabIndex = 4;
            chkAutoNoOffsetLadosComunes.Text = "Detectar lado común (no desfasar bordes compartidos)";
            chkAutoNoOffsetLadosComunes.TextAlign = ContentAlignment.BottomLeft;
            chkAutoNoOffsetLadosComunes.UseVisualStyleBackColor = true;
            // 
            // grpOpciones
            // 
            grpOpciones.Controls.Add(chkMantenerCurvas);
            grpOpciones.Controls.Add(chkNoExplote);
            grpOpciones.Controls.Add(chkPrevisualizar);
            grpOpciones.Font = new Font("Segoe UI", 9F);
            grpOpciones.Location = new Point(548, 250);
            grpOpciones.Name = "grpOpciones";
            grpOpciones.Size = new Size(420, 90);
            grpOpciones.TabIndex = 4;
            grpOpciones.TabStop = false;
            grpOpciones.Text = "Opciones";
            // 
            // chkMantenerCurvas
            // 
            chkMantenerCurvas.Location = new Point(16, 26);
            chkMantenerCurvas.Name = "chkMantenerCurvas";
            chkMantenerCurvas.Size = new Size(360, 24);
            chkMantenerCurvas.TabIndex = 0;
            chkMantenerCurvas.Text = "Mantener curvas (arcos/splines) sin explotar";
            chkMantenerCurvas.UseVisualStyleBackColor = true;
            // 
            // chkNoExplote
            // 
            chkNoExplote.Location = new Point(16, 50);
            chkNoExplote.Name = "chkNoExplote";
            chkNoExplote.Size = new Size(180, 24);
            chkNoExplote.TabIndex = 1;
            chkNoExplote.Text = "No explotar entidades";
            chkNoExplote.UseVisualStyleBackColor = true;
            // 
            // chkPrevisualizar
            // 
            chkPrevisualizar.Location = new Point(210, 50);
            chkPrevisualizar.Name = "chkPrevisualizar";
            chkPrevisualizar.Size = new Size(200, 24);
            chkPrevisualizar.TabIndex = 2;
            chkPrevisualizar.Text = "Previsualizar (fase futura)";
            chkPrevisualizar.UseVisualStyleBackColor = true;
            // 
            // btnEjecutar
            // 
            btnEjecutar.Location = new Point(548, 352);
            btnEjecutar.Name = "btnEjecutar";
            btnEjecutar.Size = new Size(160, 36);
            btnEjecutar.TabIndex = 5;
            btnEjecutar.Text = "Ejecutar";
            btnEjecutar.UseVisualStyleBackColor = true;
            // 
            // btnCerrar
            // 
            btnCerrar.DialogResult = DialogResult.Cancel;
            btnCerrar.Location = new Point(808, 352);
            btnCerrar.Name = "btnCerrar";
            btnCerrar.Size = new Size(160, 36);
            btnCerrar.TabIndex = 6;
            btnCerrar.Text = "Cerrar";
            btnCerrar.UseVisualStyleBackColor = true;
            // 
            // lblFooter
            // 
            lblFooter.BackColor = SystemColors.ActiveBorder;
            lblFooter.Dock = DockStyle.Bottom;
            lblFooter.Font = new Font("Segoe UI", 8F, FontStyle.Italic);
            lblFooter.ForeColor = Color.DimGray;
            lblFooter.Location = new Point(0, 408);
            lblFooter.Name = "lblFooter";
            lblFooter.Size = new Size(980, 22);
            lblFooter.TabIndex = 7;
            lblFooter.Text = "© 2025 SicoeCAD® – Derechos reservados. Uso autorizado únicamente para el proyecto licenciado.";
            lblFooter.TextAlign = ContentAlignment.MiddleCenter;
            // 
            // FrmOffsetInteligente
            // 
            AutoScaleDimensions = new SizeF(8F, 20F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(980, 430);
            Controls.Add(btnCerrar);
            Controls.Add(btnEjecutar);
            Controls.Add(grpOpciones);
            Controls.Add(grpLados);
            Controls.Add(grpParametros);
            Controls.Add(grpSeleccion);
            Controls.Add(lblFooter);
            Controls.Add(panelHeader);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            Name = "FrmOffsetInteligente";
            StartPosition = FormStartPosition.CenterParent;
            Text = "SicoeCAD - Offset inteligente";
            panelHeader.ResumeLayout(false);
            ((ISupportInitialize)picLogo).EndInit();
            grpSeleccion.ResumeLayout(false);
            grpParametros.ResumeLayout(false);
            grpParametros.PerformLayout();
            grpLados.ResumeLayout(false);
            grpOpciones.ResumeLayout(false);
            ResumeLayout(false);
        }

        #endregion
    }
}
