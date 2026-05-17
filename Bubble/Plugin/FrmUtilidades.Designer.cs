namespace SicoeCAD
{
    partial class FrmUtilidades
    {
        private System.ComponentModel.IContainer components = null;

        private System.Windows.Forms.Panel pnlHeader;
        private System.Windows.Forms.PictureBox picLogo;
        private System.Windows.Forms.Label lblTitulo;
        private System.Windows.Forms.Label lblSubtitulo;

        private System.Windows.Forms.Panel pnlBody;
        private System.Windows.Forms.Panel pnlTilesHost;
        private System.Windows.Forms.FlowLayoutPanel flpTiles;

        private System.Windows.Forms.Button btnAcotadoEspecial;
        private System.Windows.Forms.Button btnOffsetInteligente;
        private System.Windows.Forms.Button btnImportarPuntos;
        private System.Windows.Forms.Button btnConfigRapida;

        private System.Windows.Forms.Panel pnlFooter;
        private System.Windows.Forms.Label lblSeguridad;
        private System.Windows.Forms.Button btnCerrar;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
                components.Dispose();
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        private void InitializeComponent()
        {
            pnlHeader = new System.Windows.Forms.Panel();
            picLogo = new System.Windows.Forms.PictureBox();
            lblSubtitulo = new System.Windows.Forms.Label();
            lblTitulo = new System.Windows.Forms.Label();
            pnlBody = new System.Windows.Forms.Panel();
            pnlTilesHost = new System.Windows.Forms.Panel();
            flpTiles = new System.Windows.Forms.FlowLayoutPanel();
            btnAcotadoEspecial = new System.Windows.Forms.Button();
            btnOffsetInteligente = new System.Windows.Forms.Button();
            btnImportarPuntos = new System.Windows.Forms.Button();
            btnConfigRapida = new System.Windows.Forms.Button();
            pnlFooter = new System.Windows.Forms.Panel();
            btnInicio = new System.Windows.Forms.Button();
            btnCerrar = new System.Windows.Forms.Button();
            lblSeguridad = new System.Windows.Forms.Label();
            pnlHeader.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)picLogo).BeginInit();
            pnlBody.SuspendLayout();
            pnlTilesHost.SuspendLayout();
            flpTiles.SuspendLayout();
            pnlFooter.SuspendLayout();
            SuspendLayout();
            // 
            // pnlHeader
            // 
            pnlHeader.BackColor = System.Drawing.Color.FromArgb(188, 235, 240);
            pnlHeader.BorderStyle = System.Windows.Forms.BorderStyle.Fixed3D;
            pnlHeader.Controls.Add(picLogo);
            pnlHeader.Controls.Add(lblSubtitulo);
            pnlHeader.Controls.Add(lblTitulo);
            pnlHeader.Dock = System.Windows.Forms.DockStyle.Top;
            pnlHeader.Location = new System.Drawing.Point(0, 0);
            pnlHeader.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            pnlHeader.Name = "pnlHeader";
            pnlHeader.Padding = new System.Windows.Forms.Padding(16, 13, 16, 13);
            pnlHeader.Size = new System.Drawing.Size(846, 115);
            pnlHeader.TabIndex = 0;
            // 
            // picLogo
            // 
            picLogo.BackgroundImage = SicoePresupuestoNET8.Properties.Resources.SicoeCAD;
            picLogo.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Zoom;
            picLogo.Location = new System.Drawing.Point(18, 16);
            picLogo.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            picLogo.Name = "picLogo";
            picLogo.Size = new System.Drawing.Size(225, 85);
            picLogo.SizeMode = System.Windows.Forms.PictureBoxSizeMode.Zoom;
            picLogo.TabIndex = 2;
            picLogo.TabStop = false;
            // 
            // lblSubtitulo
            // 
            lblSubtitulo.AutoSize = true;
            lblSubtitulo.Font = new System.Drawing.Font("Segoe UI", 10F);
            lblSubtitulo.Location = new System.Drawing.Point(491, 75);
            lblSubtitulo.Name = "lblSubtitulo";
            lblSubtitulo.Size = new System.Drawing.Size(309, 23);
            lblSubtitulo.TabIndex = 1;
            lblSubtitulo.Text = "Biblioteca de herramientas y utilidades ";
            // 
            // lblTitulo
            // 
            lblTitulo.AutoSize = true;
            lblTitulo.Font = new System.Drawing.Font("Segoe UI", 18F, System.Drawing.FontStyle.Bold);
            lblTitulo.Location = new System.Drawing.Point(503, 25);
            lblTitulo.Name = "lblTitulo";
            lblTitulo.Size = new System.Drawing.Size(306, 41);
            lblTitulo.TabIndex = 0;
            lblTitulo.Text = "Utilidades SicoeCAD";
            // 
            // pnlBody
            // 
            pnlBody.BackColor = System.Drawing.Color.FromArgb(229, 247, 248);
            pnlBody.Controls.Add(pnlTilesHost);
            pnlBody.Dock = System.Windows.Forms.DockStyle.Fill;
            pnlBody.Location = new System.Drawing.Point(0, 115);
            pnlBody.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            pnlBody.Name = "pnlBody";
            pnlBody.Padding = new System.Windows.Forms.Padding(21, 19, 21, 19);
            pnlBody.Size = new System.Drawing.Size(846, 546);
            pnlBody.TabIndex = 1;
            // 
            // pnlTilesHost
            // 
            pnlTilesHost.BackColor = System.Drawing.Color.FromArgb(188, 235, 240);
            pnlTilesHost.Controls.Add(flpTiles);
            pnlTilesHost.Dock = System.Windows.Forms.DockStyle.Fill;
            pnlTilesHost.Location = new System.Drawing.Point(21, 19);
            pnlTilesHost.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            pnlTilesHost.Name = "pnlTilesHost";
            pnlTilesHost.Padding = new System.Windows.Forms.Padding(9, 11, 9, 11);
            pnlTilesHost.Size = new System.Drawing.Size(804, 508);
            pnlTilesHost.TabIndex = 0;
            // 
            // flpTiles
            // 
            flpTiles.BackColor = System.Drawing.Color.FromArgb(229, 247, 248);
            flpTiles.Controls.Add(btnAcotadoEspecial);
            flpTiles.Controls.Add(btnOffsetInteligente);
            flpTiles.Controls.Add(btnImportarPuntos);
            flpTiles.Controls.Add(btnConfigRapida);
            flpTiles.Dock = System.Windows.Forms.DockStyle.Fill;
            flpTiles.Location = new System.Drawing.Point(9, 11);
            flpTiles.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            flpTiles.Name = "flpTiles";
            flpTiles.Padding = new System.Windows.Forms.Padding(7, 8, 7, 8);
            flpTiles.Size = new System.Drawing.Size(786, 486);
            flpTiles.TabIndex = 0;
            // 
            // btnAcotadoEspecial
            // 
            btnAcotadoEspecial.BackColor = System.Drawing.Color.FromArgb(188, 235, 240);
            btnAcotadoEspecial.Font = new System.Drawing.Font("Inter SemiBold", 12F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
            btnAcotadoEspecial.Image = SicoePresupuestoNET8.Properties.Resources.Acotado;
            btnAcotadoEspecial.ImageAlign = System.Drawing.ContentAlignment.TopCenter;
            btnAcotadoEspecial.Location = new System.Drawing.Point(14, 16);
            btnAcotadoEspecial.Margin = new System.Windows.Forms.Padding(7, 8, 7, 8);
            btnAcotadoEspecial.Name = "btnAcotadoEspecial";
            btnAcotadoEspecial.RightToLeft = System.Windows.Forms.RightToLeft.Yes;
            btnAcotadoEspecial.Size = new System.Drawing.Size(343, 160);
            btnAcotadoEspecial.TabIndex = 0;
            btnAcotadoEspecial.Text = "Acotado Especial\r\n";
            btnAcotadoEspecial.TextAlign = System.Drawing.ContentAlignment.BottomRight;
            btnAcotadoEspecial.UseVisualStyleBackColor = false;
            // 
            // btnOffsetInteligente
            // 
            btnOffsetInteligente.BackColor = System.Drawing.Color.FromArgb(188, 235, 240);
            btnOffsetInteligente.Font = new System.Drawing.Font("Segoe UI Semibold", 12F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
            btnOffsetInteligente.Location = new System.Drawing.Point(371, 16);
            btnOffsetInteligente.Margin = new System.Windows.Forms.Padding(7, 8, 7, 8);
            btnOffsetInteligente.Name = "btnOffsetInteligente";
            btnOffsetInteligente.Size = new System.Drawing.Size(343, 160);
            btnOffsetInteligente.TabIndex = 1;
            btnOffsetInteligente.Text = "Offset Inteligente";
            btnOffsetInteligente.TextAlign = System.Drawing.ContentAlignment.BottomLeft;
            btnOffsetInteligente.UseVisualStyleBackColor = false;
            // 
            // btnImportarPuntos
            // 
            btnImportarPuntos.BackColor = System.Drawing.Color.FromArgb(188, 235, 240);
            btnImportarPuntos.Location = new System.Drawing.Point(14, 192);
            btnImportarPuntos.Margin = new System.Windows.Forms.Padding(7, 8, 7, 8);
            btnImportarPuntos.Name = "btnImportarPuntos";
            btnImportarPuntos.Size = new System.Drawing.Size(343, 160);
            btnImportarPuntos.TabIndex = 2;
            btnImportarPuntos.Text = "\r\n(Próximamente)";
            btnImportarPuntos.UseVisualStyleBackColor = false;
            // 
            // btnConfigRapida
            // 
            btnConfigRapida.BackColor = System.Drawing.Color.FromArgb(188, 235, 240);
            btnConfigRapida.Location = new System.Drawing.Point(371, 192);
            btnConfigRapida.Margin = new System.Windows.Forms.Padding(7, 8, 7, 8);
            btnConfigRapida.Name = "btnConfigRapida";
            btnConfigRapida.Size = new System.Drawing.Size(343, 160);
            btnConfigRapida.TabIndex = 3;
            btnConfigRapida.Text = "(Próximamente)";
            btnConfigRapida.UseVisualStyleBackColor = false;
            // 
            // pnlFooter
            // 
            pnlFooter.BorderStyle = System.Windows.Forms.BorderStyle.Fixed3D;
            pnlFooter.Controls.Add(btnInicio);
            pnlFooter.Controls.Add(btnCerrar);
            pnlFooter.Controls.Add(lblSeguridad);
            pnlFooter.Dock = System.Windows.Forms.DockStyle.Bottom;
            pnlFooter.Location = new System.Drawing.Point(0, 661);
            pnlFooter.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            pnlFooter.Name = "pnlFooter";
            pnlFooter.Padding = new System.Windows.Forms.Padding(16, 13, 16, 13);
            pnlFooter.Size = new System.Drawing.Size(846, 91);
            pnlFooter.TabIndex = 2;
            // 
            // btnInicio
            // 
            btnInicio.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
            btnInicio.Location = new System.Drawing.Point(573, 5);
            btnInicio.Name = "btnInicio";
            btnInicio.Size = new System.Drawing.Size(114, 40);
            btnInicio.TabIndex = 2;
            btnInicio.Text = "Sicoe Inicio";
            btnInicio.UseVisualStyleBackColor = true;
            // 
            // btnCerrar
            // 
            btnCerrar.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
            btnCerrar.Location = new System.Drawing.Point(718, 6);
            btnCerrar.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            btnCerrar.Name = "btnCerrar";
            btnCerrar.Size = new System.Drawing.Size(114, 40);
            btnCerrar.TabIndex = 1;
            btnCerrar.Text = "Cerrar";
            btnCerrar.UseVisualStyleBackColor = true;
            // 
            // lblSeguridad
            // 
            lblSeguridad.AutoSize = true;
            lblSeguridad.Dock = System.Windows.Forms.DockStyle.Bottom;
            lblSeguridad.Location = new System.Drawing.Point(16, 54);
            lblSeguridad.Name = "lblSeguridad";
            lblSeguridad.Size = new System.Drawing.Size(671, 20);
            lblSeguridad.TabIndex = 0;
            lblSeguridad.Text = "© 2025 SicoeCAD® – Derechos reservados. Uso autorizado únicamente para el proyecto licenciado.";
            // 
            // FrmUtilidades
            // 
            AutoScaleDimensions = new System.Drawing.SizeF(8F, 20F);
            AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            ClientSize = new System.Drawing.Size(846, 752);
            Controls.Add(pnlBody);
            Controls.Add(pnlHeader);
            Controls.Add(pnlFooter);
            FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedDialog;
            Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            MaximizeBox = false;
            MinimizeBox = false;
            Name = "FrmUtilidades";
            StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
            Text = "SICOE – Utilidades";
            pnlHeader.ResumeLayout(false);
            pnlHeader.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)picLogo).EndInit();
            pnlBody.ResumeLayout(false);
            pnlTilesHost.ResumeLayout(false);
            flpTiles.ResumeLayout(false);
            pnlFooter.ResumeLayout(false);
            pnlFooter.PerformLayout();
            ResumeLayout(false);

        }

        #endregion

        private System.Windows.Forms.Button btnInicio;
    }
}
