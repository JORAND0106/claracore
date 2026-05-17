namespace SicoeCAD
{
    partial class FrmSicoeCad
    {
        private System.ComponentModel.IContainer components = null;

        // Contenedores principales
        private System.Windows.Forms.Panel panelHeader;
        private System.Windows.Forms.Panel panelFooter;

        // Header
        private System.Windows.Forms.PictureBox pictureLogo;
        private System.Windows.Forms.Label lblTitulo;
        private System.Windows.Forms.Label lblSubtitulo;

        // Sección Hero (usando RoundedGroupBox)
        private SicoePresupuestoNET8.Controls.RoundedGroupBox grpHero;
        private System.Windows.Forms.PictureBox pictureAutor;
        private System.Windows.Forms.Label lblAutor;
        private System.Windows.Forms.Label lblBio;

        // Menú de módulos (usando RoundedGroupBox)
        private SicoePresupuestoNET8.Controls.RoundedGroupBox grpMenu;
        private System.Windows.Forms.TableLayoutPanel tlpMenu;
        private System.Windows.Forms.Button btnPresupuesto;
        private System.Windows.Forms.Button btnTopografia;
        private System.Windows.Forms.Button btnCatalogo;
        private System.Windows.Forms.Button btnUtilidades;
        private System.Windows.Forms.Button btnAyuda;
        private System.Windows.Forms.Button btnConfiguracion;
        private System.Windows.Forms.Label lblMenuTitulo;

        // Footer
        private System.Windows.Forms.LinkLabel lblVersion;
        private System.Windows.Forms.Label lblLicencia;
        private System.Windows.Forms.Label lblEstadoRuta;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
                components.Dispose();
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code
        private void InitializeComponent()
        {
            panelHeader = new System.Windows.Forms.Panel();
            pictureLogo = new System.Windows.Forms.PictureBox();
            lblTitulo = new System.Windows.Forms.Label();
            lblSubtitulo = new System.Windows.Forms.Label();
            grpHero = new SicoePresupuestoNET8.Controls.RoundedGroupBox();
            pictureAutor = new System.Windows.Forms.PictureBox();
            lblAutor = new System.Windows.Forms.Label();
            lblBio = new System.Windows.Forms.Label();
            lblMision = new System.Windows.Forms.Label();
            panelDivider = new System.Windows.Forms.Panel();
            lblContacto = new System.Windows.Forms.Label();
            lblPitch = new System.Windows.Forms.Label();
            grpMenu = new SicoePresupuestoNET8.Controls.RoundedGroupBox();
            lblMenuTitulo = new System.Windows.Forms.Label();
            tlpMenu = new System.Windows.Forms.TableLayoutPanel();
            btnPresupuesto = new System.Windows.Forms.Button();
            btnTopografia = new System.Windows.Forms.Button();
            btnCatalogo = new System.Windows.Forms.Button();
            btnUtilidades = new System.Windows.Forms.Button();
            btnAyuda = new System.Windows.Forms.Button();
            btnConfiguracion = new System.Windows.Forms.Button();
            panelFooter = new System.Windows.Forms.Panel();
            panelLicBar = new System.Windows.Forms.Panel();
            lblVersion = new System.Windows.Forms.LinkLabel();
            lblLicencia = new System.Windows.Forms.Label();
            lblEstadoRuta = new System.Windows.Forms.Label();
            panelHeader.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)pictureLogo).BeginInit();
            grpHero.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)pictureAutor).BeginInit();
            grpMenu.SuspendLayout();
            tlpMenu.SuspendLayout();
            panelFooter.SuspendLayout();
            SuspendLayout();
            // 
            // panelHeader
            // 
            panelHeader.BackColor = System.Drawing.Color.FromArgb(10, 33, 64);
            panelHeader.Controls.Add(pictureLogo);
            panelHeader.Controls.Add(lblTitulo);
            panelHeader.Controls.Add(lblSubtitulo);
            panelHeader.Dock = System.Windows.Forms.DockStyle.Top;
            panelHeader.Location = new System.Drawing.Point(0, 0);
            panelHeader.Name = "panelHeader";
            panelHeader.Size = new System.Drawing.Size(1020, 100);
            panelHeader.TabIndex = 2;
            panelHeader.Paint += panelHeader_Paint;
            // 
            // pictureLogo
            // 
            pictureLogo.Image = SicoePresupuestoNET8.Properties.Resources.SicoeCAD_21;
            pictureLogo.Location = new System.Drawing.Point(20, 14);
            pictureLogo.Name = "pictureLogo";
            pictureLogo.Size = new System.Drawing.Size(72, 72);
            pictureLogo.SizeMode = System.Windows.Forms.PictureBoxSizeMode.Zoom;
            pictureLogo.TabIndex = 0;
            pictureLogo.TabStop = false;
            // 
            // lblTitulo
            // 
            lblTitulo.Font = new System.Drawing.Font("Segoe UI", 18F, System.Drawing.FontStyle.Bold);
            lblTitulo.ForeColor = System.Drawing.Color.White;
            lblTitulo.Location = new System.Drawing.Point(106, 18);
            lblTitulo.Name = "lblTitulo";
            lblTitulo.Size = new System.Drawing.Size(894, 36);
            lblTitulo.TabIndex = 1;
            lblTitulo.Text = "SicoeCAD — Sistema Integrado de Control de Obra Ejecutada";
            // 
            // lblSubtitulo
            // 
            lblSubtitulo.Font = new System.Drawing.Font("Segoe UI", 10F);
            lblSubtitulo.ForeColor = System.Drawing.Color.FromArgb(163, 201, 240);
            lblSubtitulo.Location = new System.Drawing.Point(108, 58);
            lblSubtitulo.Name = "lblSubtitulo";
            lblSubtitulo.Size = new System.Drawing.Size(560, 22);
            lblSubtitulo.TabIndex = 2;
            lblSubtitulo.Text = "Plugin modular para AutoCAD · Presupuesto · Topografía · Control de Obra";
            // 
            // grpHero
            // 
            grpHero.BackColor = System.Drawing.Color.Transparent;
            grpHero.BackgroundColor = System.Drawing.Color.White;
            grpHero.BorderColor = System.Drawing.Color.FromArgb(200, 220, 245);
            grpHero.BorderRadius = 18;
            grpHero.BorderSize = 1;
            grpHero.Controls.Add(pictureAutor);
            grpHero.Controls.Add(lblAutor);
            grpHero.Controls.Add(lblBio);
            grpHero.Controls.Add(lblMision);
            grpHero.Controls.Add(panelDivider);
            grpHero.Controls.Add(lblContacto);
            grpHero.Font = new System.Drawing.Font("Segoe UI Semibold", 10F, System.Drawing.FontStyle.Bold);
            grpHero.ForeColor = System.Drawing.Color.FromArgb(26, 74, 140);
            grpHero.Location = new System.Drawing.Point(20, 116);
            grpHero.Name = "grpHero";
            grpHero.Padding = new System.Windows.Forms.Padding(14, 24, 14, 14);
            grpHero.Size = new System.Drawing.Size(610, 430);
            grpHero.TabIndex = 1;
            grpHero.TabStop = false;
            grpHero.Text = "  Acerca del Autor";
            // 
            // pictureAutor
            // 
            pictureAutor.Image = SicoePresupuestoNET8.Properties.Resources.SicoeCAD_1;
            pictureAutor.Location = new System.Drawing.Point(22, 42);
            pictureAutor.Name = "pictureAutor";
            pictureAutor.Size = new System.Drawing.Size(104, 104);
            pictureAutor.SizeMode = System.Windows.Forms.PictureBoxSizeMode.Zoom;
            pictureAutor.TabIndex = 0;
            pictureAutor.TabStop = false;
            // 
            // lblAutor
            // 
            lblAutor.Font = new System.Drawing.Font("Segoe UI Semibold", 13F, System.Drawing.FontStyle.Bold);
            lblAutor.ForeColor = System.Drawing.Color.FromArgb(10, 33, 64);
            lblAutor.Location = new System.Drawing.Point(140, 42);
            lblAutor.Name = "lblAutor";
            lblAutor.Size = new System.Drawing.Size(450, 28);
            lblAutor.TabIndex = 1;
            lblAutor.Text = "Jorge Andrés Jaimes Arenas";
            // 
            // lblBio
            // 
            lblBio.Font = new System.Drawing.Font("Segoe UI", 10F);
            lblBio.ForeColor = System.Drawing.Color.FromArgb(41, 128, 185);
            lblBio.Location = new System.Drawing.Point(140, 74);
            lblBio.Name = "lblBio";
            lblBio.Size = new System.Drawing.Size(450, 22);
            lblBio.TabIndex = 2;
            lblBio.Text = "CEO Desarrollador · ClaraCore";
            // 
            // lblMision
            // 
            lblMision.Font = new System.Drawing.Font("Segoe UI", 10F);
            lblMision.ForeColor = System.Drawing.Color.FromArgb(70, 90, 120);
            lblMision.Location = new System.Drawing.Point(22, 160);
            lblMision.Name = "lblMision";
            lblMision.Text =
                "SicoeCAD nació para transformar la manera en que los ingenieros\r\n" +
                "gestionan el control de obra. Integramos AutoCAD con ClaraCore,\r\n" +
                "nuestra plataforma en la nube, para que el levantamiento de cantidades,\r\n" +
                "el abscisado y el control presupuestal ocurran en tiempo real — sin\r\n" +
                "reprocesos, sin errores manuales, sin esperas.";
            lblMision.Size = new System.Drawing.Size(568, 120);
            lblMision.TabIndex = 3;
            // 
            // panelDivider
            // 
            panelDivider.BackColor = System.Drawing.Color.FromArgb(200, 220, 245);
            panelDivider.Location = new System.Drawing.Point(22, 294);
            panelDivider.Name = "panelDivider";
            panelDivider.Size = new System.Drawing.Size(568, 1);
            panelDivider.TabIndex = 4;
            // 
            // lblContacto
            // 
            lblContacto.Font = new System.Drawing.Font("Segoe UI", 9.5F);
            lblContacto.ForeColor = System.Drawing.Color.FromArgb(70, 90, 120);
            lblContacto.Location = new System.Drawing.Point(22, 306);
            lblContacto.Name = "lblContacto";
            lblContacto.Size = new System.Drawing.Size(568, 100);
            lblContacto.TabIndex = 5;
            lblContacto.Text = "📧  ajaimes@claracore.com\r\n📱  +57 301 553 3460 - +57 315 058 9825\r\n🌐  ClaraCore · Colombia\r\n© Todos los derechos reservados";
            // 
            // lblPitch
            // 
            lblPitch.Font = new System.Drawing.Font("Segoe UI Semibold", 12F, System.Drawing.FontStyle.Bold);
            lblPitch.ForeColor = System.Drawing.Color.FromArgb(10, 33, 64);
            lblPitch.Location = new System.Drawing.Point(20, 549);
            lblPitch.Name = "lblPitch";
            lblPitch.Size = new System.Drawing.Size(980, 63);
            lblPitch.TabIndex = 0;
            lblPitch.Text = "⚡  Levantamiento · Modelación · Control — todo en un clic. SicoeCAD convierte datos en decisiones y cantidades en dinero.";
            lblPitch.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
            // 
            // grpMenu
            // 
            grpMenu.BackColor = System.Drawing.Color.Transparent;
            grpMenu.BackgroundColor = System.Drawing.Color.White;
            grpMenu.BorderColor = System.Drawing.Color.FromArgb(200, 220, 245);
            grpMenu.BorderRadius = 18;
            grpMenu.BorderSize = 1;
            grpMenu.Controls.Add(lblMenuTitulo);
            grpMenu.Controls.Add(tlpMenu);
            grpMenu.Font = new System.Drawing.Font("Segoe UI Semibold", 10F, System.Drawing.FontStyle.Bold);
            grpMenu.ForeColor = System.Drawing.Color.FromArgb(26, 74, 140);
            grpMenu.Location = new System.Drawing.Point(648, 116);
            grpMenu.Name = "grpMenu";
            grpMenu.Padding = new System.Windows.Forms.Padding(14, 24, 14, 14);
            grpMenu.Size = new System.Drawing.Size(352, 430);
            grpMenu.TabIndex = 2;
            grpMenu.TabStop = false;
            grpMenu.Text = "  Módulos del Sistema";
            // 
            // lblMenuTitulo
            // 
            lblMenuTitulo.Font = new System.Drawing.Font("Segoe UI", 9.5F);
            lblMenuTitulo.ForeColor = System.Drawing.Color.FromArgb(120, 150, 190);
            lblMenuTitulo.Location = new System.Drawing.Point(18, 38);
            lblMenuTitulo.Name = "lblMenuTitulo";
            lblMenuTitulo.Size = new System.Drawing.Size(316, 20);
            lblMenuTitulo.TabIndex = 0;
            lblMenuTitulo.Text = "Selecciona un módulo para continuar";
            // 
            // tlpMenu
            // 
            tlpMenu.BackColor = System.Drawing.Color.Transparent;
            tlpMenu.ColumnCount = 2;
            tlpMenu.ColumnStyles.Add(new System.Windows.Forms.ColumnStyle(System.Windows.Forms.SizeType.Percent, 50F));
            tlpMenu.ColumnStyles.Add(new System.Windows.Forms.ColumnStyle(System.Windows.Forms.SizeType.Percent, 50F));
            tlpMenu.Controls.Add(btnPresupuesto, 0, 0);
            tlpMenu.Controls.Add(btnTopografia, 1, 0);
            tlpMenu.Controls.Add(btnCatalogo, 0, 1);
            tlpMenu.Controls.Add(btnUtilidades, 1, 1);
            tlpMenu.Controls.Add(btnAyuda, 0, 2);
            tlpMenu.Controls.Add(btnConfiguracion, 1, 2);
            tlpMenu.Location = new System.Drawing.Point(16, 66);
            tlpMenu.Name = "tlpMenu";
            tlpMenu.RowCount = 3;
            tlpMenu.RowStyles.Add(new System.Windows.Forms.RowStyle(System.Windows.Forms.SizeType.Percent, 33.33F));
            tlpMenu.RowStyles.Add(new System.Windows.Forms.RowStyle(System.Windows.Forms.SizeType.Percent, 33.33F));
            tlpMenu.RowStyles.Add(new System.Windows.Forms.RowStyle(System.Windows.Forms.SizeType.Percent, 33.33F));
            tlpMenu.Size = new System.Drawing.Size(320, 348);
            tlpMenu.TabIndex = 1;
            // 
            // btnPresupuesto
            // 
            btnPresupuesto.BackColor = System.Drawing.Color.FromArgb(10, 33, 64);
            btnPresupuesto.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            btnPresupuesto.FlatAppearance.BorderColor = System.Drawing.Color.FromArgb(41, 128, 185);
            btnPresupuesto.FlatAppearance.BorderSize = 1;
            btnPresupuesto.ForeColor = System.Drawing.Color.White;
            btnPresupuesto.Location = new System.Drawing.Point(3, 3);
            btnPresupuesto.Name = "btnPresupuesto";
            btnPresupuesto.Size = new System.Drawing.Size(148, 100);
            btnPresupuesto.TabIndex = 0;
            btnPresupuesto.Text = "Presupuesto";
            btnPresupuesto.UseVisualStyleBackColor = false;
            btnPresupuesto.Cursor = System.Windows.Forms.Cursors.Hand;
            // 
            // btnTopografia
            // 
            btnTopografia.BackColor = System.Drawing.Color.FromArgb(10, 33, 64);
            btnTopografia.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            btnTopografia.FlatAppearance.BorderColor = System.Drawing.Color.FromArgb(41, 128, 185);
            btnTopografia.FlatAppearance.BorderSize = 1;
            btnTopografia.ForeColor = System.Drawing.Color.White;
            btnTopografia.Location = new System.Drawing.Point(163, 3);
            btnTopografia.Name = "btnTopografia";
            btnTopografia.Size = new System.Drawing.Size(148, 100);
            btnTopografia.TabIndex = 1;
            btnTopografia.Text = "Topografía";
            btnTopografia.UseVisualStyleBackColor = false;
            btnTopografia.Cursor = System.Windows.Forms.Cursors.Hand;
            // 
            // btnCatalogo
            // 
            btnCatalogo.BackColor = System.Drawing.Color.FromArgb(10, 33, 64);
            btnCatalogo.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            btnCatalogo.FlatAppearance.BorderColor = System.Drawing.Color.FromArgb(41, 128, 185);
            btnCatalogo.FlatAppearance.BorderSize = 1;
            btnCatalogo.ForeColor = System.Drawing.Color.White;
            btnCatalogo.Location = new System.Drawing.Point(3, 119);
            btnCatalogo.Name = "btnCatalogo";
            btnCatalogo.Size = new System.Drawing.Size(148, 100);
            btnCatalogo.TabIndex = 2;
            btnCatalogo.Text = "Catálogo";
            btnCatalogo.UseVisualStyleBackColor = false;
            btnCatalogo.Cursor = System.Windows.Forms.Cursors.Hand;
            // 
            // btnUtilidades
            // 
            btnUtilidades.BackColor = System.Drawing.Color.FromArgb(10, 33, 64);
            btnUtilidades.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            btnUtilidades.FlatAppearance.BorderColor = System.Drawing.Color.FromArgb(41, 128, 185);
            btnUtilidades.FlatAppearance.BorderSize = 1;
            btnUtilidades.ForeColor = System.Drawing.Color.White;
            btnUtilidades.Location = new System.Drawing.Point(163, 119);
            btnUtilidades.Name = "btnUtilidades";
            btnUtilidades.Size = new System.Drawing.Size(148, 100);
            btnUtilidades.TabIndex = 3;
            btnUtilidades.Text = "Utilidades";
            btnUtilidades.UseVisualStyleBackColor = false;
            btnUtilidades.Cursor = System.Windows.Forms.Cursors.Hand;
            // 
            // btnAyuda
            // 
            btnAyuda.BackColor = System.Drawing.Color.FromArgb(10, 33, 64);
            btnAyuda.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            btnAyuda.FlatAppearance.BorderColor = System.Drawing.Color.FromArgb(41, 128, 185);
            btnAyuda.FlatAppearance.BorderSize = 1;
            btnAyuda.ForeColor = System.Drawing.Color.White;
            btnAyuda.Location = new System.Drawing.Point(3, 235);
            btnAyuda.Name = "btnAyuda";
            btnAyuda.Size = new System.Drawing.Size(148, 100);
            btnAyuda.TabIndex = 4;
            btnAyuda.Text = "Ayuda";
            btnAyuda.UseVisualStyleBackColor = false;
            btnAyuda.Cursor = System.Windows.Forms.Cursors.Hand;
            // 
            // btnConfiguracion
            // 
            btnConfiguracion.BackColor = System.Drawing.Color.FromArgb(10, 33, 64);
            btnConfiguracion.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            btnConfiguracion.FlatAppearance.BorderColor = System.Drawing.Color.FromArgb(41, 128, 185);
            btnConfiguracion.FlatAppearance.BorderSize = 1;
            btnConfiguracion.ForeColor = System.Drawing.Color.White;
            btnConfiguracion.Location = new System.Drawing.Point(163, 235);
            btnConfiguracion.Name = "btnConfiguracion";
            btnConfiguracion.Size = new System.Drawing.Size(148, 100);
            btnConfiguracion.TabIndex = 5;
            btnConfiguracion.Text = "Configuración";
            btnConfiguracion.UseVisualStyleBackColor = false;
            btnConfiguracion.Cursor = System.Windows.Forms.Cursors.Hand;
            // 
            // panelFooter
            // 
            panelFooter.BackColor = System.Drawing.Color.FromArgb(10, 33, 64);
            panelFooter.Controls.Add(panelLicBar);
            panelFooter.Controls.Add(lblVersion);
            panelFooter.Controls.Add(lblLicencia);
            panelFooter.Controls.Add(lblEstadoRuta);
            panelFooter.Dock = System.Windows.Forms.DockStyle.Bottom;
            panelFooter.Location = new System.Drawing.Point(0, 611);
            panelFooter.Name = "panelFooter";
            panelFooter.Size = new System.Drawing.Size(1020, 40);
            panelFooter.TabIndex = 3;
            // 
            // panelLicBar
            // 
            panelLicBar.BackColor = System.Drawing.Color.FromArgb(41, 128, 185);
            panelLicBar.Location = new System.Drawing.Point(0, 0);
            panelLicBar.Name = "panelLicBar";
            panelLicBar.Size = new System.Drawing.Size(4, 40);
            panelLicBar.TabIndex = 0;
            // 
            // lblVersion
            // 
            lblVersion.ActiveLinkColor = System.Drawing.Color.FromArgb(163, 201, 240);
            lblVersion.AutoSize = true;
            lblVersion.Font = new System.Drawing.Font("Segoe UI", 9F);
            lblVersion.ForeColor = System.Drawing.Color.FromArgb(163, 201, 240);
            lblVersion.LinkBehavior = System.Windows.Forms.LinkBehavior.HoverUnderline;
            lblVersion.LinkColor = System.Drawing.Color.FromArgb(163, 201, 240);
            lblVersion.Location = new System.Drawing.Point(14, 12);
            lblVersion.Name = "lblVersion";
            lblVersion.Size = new System.Drawing.Size(73, 20);
            lblVersion.TabIndex = 999;
            lblVersion.TabStop = true;
            lblVersion.Text = "Versión: ...";
            lblVersion.VisitedLinkColor = System.Drawing.Color.FromArgb(163, 201, 240);
            lblVersion.LinkClicked += lblVersion_LinkClicked;
            // 
            // lblLicencia
            // 
            lblLicencia.Font = new System.Drawing.Font("Segoe UI", 9F);
            lblLicencia.ForeColor = System.Drawing.Color.FromArgb(163, 201, 240);
            lblLicencia.Location = new System.Drawing.Point(160, 12);
            lblLicencia.Name = "lblLicencia";
            lblLicencia.Size = new System.Drawing.Size(400, 20);
            lblLicencia.TabIndex = 1000;
            lblLicencia.Text = "Licencia:";
            // 
            // lblEstadoRuta
            // 
            lblEstadoRuta.Font = new System.Drawing.Font("Segoe UI", 9F);
            lblEstadoRuta.ForeColor = System.Drawing.Color.FromArgb(120, 160, 200);
            lblEstadoRuta.Location = new System.Drawing.Point(580, 12);
            lblEstadoRuta.Name = "lblEstadoRuta";
            lblEstadoRuta.Size = new System.Drawing.Size(430, 20);
            lblEstadoRuta.TabIndex = 1001;
            lblEstadoRuta.Text = "Ruta de trabajo:";
            lblEstadoRuta.TextAlign = System.Drawing.ContentAlignment.MiddleRight;
            // 
            // FrmSicoeCad
            // 
            AutoScaleMode = System.Windows.Forms.AutoScaleMode.None;
            BackColor = System.Drawing.Color.FromArgb(240, 245, 252);
            ClientSize = new System.Drawing.Size(1020, 651);
            Controls.Add(lblPitch);
            Controls.Add(grpHero);
            Controls.Add(grpMenu);
            Controls.Add(panelHeader);
            Controls.Add(panelFooter);
            FormBorderStyle = System.Windows.Forms.FormBorderStyle.Fixed3D;
            MinimumSize = new System.Drawing.Size(1020, 640);
            Name = "FrmSicoeCad";
            StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
            Text = "SicoeCAD – Lanzador de Módulos";
            panelHeader.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)pictureLogo).EndInit();
            grpHero.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)pictureAutor).EndInit();
            grpMenu.ResumeLayout(false);
            tlpMenu.ResumeLayout(false);
            panelFooter.ResumeLayout(false);
            panelFooter.PerformLayout();
            ResumeLayout(false);
        }
        #endregion

        private System.Windows.Forms.Label lblPitch;
        private System.Windows.Forms.Label lblContacto;
        private System.Windows.Forms.Label lblMision;
        private System.Windows.Forms.Panel panelDivider;
        private System.Windows.Forms.Panel panelLicBar;
    }
}
