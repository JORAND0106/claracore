using SicoePresupuestoNET8;
using System;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

namespace SicoeCAD
{
    public partial class FrmUtilidades : Form
    {
        public FrmUtilidades()
        {
            InitializeComponent();

            ApplyThemeAndTiles();

            // Eventos
            btnCerrar.Click += (s, e) => this.Close();
            btnAcotadoEspecial.Click += BtnAcotadoEspecial_Click;
            btnInicio.Click += BtnInicio_Click;
            btnOffsetInteligente.Click += btnOffsetInteligente_Click;


            btnImportarPuntos.Click += (s, e) =>
                MessageBox.Show("Función en desarrollo.", "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Information);

            btnConfigRapida.Click += (s, e) =>
                MessageBox.Show("Función en desarrollo.", "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private void BtnAcotadoEspecial_Click(object? sender, EventArgs e)
        {
            // 1) Cerrar definitivamente el formulario de Utilidades
            this.Close();

            // 2) Abrir Acotado cuando Utilidades ya no existe
            this.BeginInvoke(new Action(() =>
            {
                using (var f = new FrmAcotado())
                {
                    f.StartPosition = FormStartPosition.CenterScreen;
                    f.ShowDialog();
                }
            }));
        }
        private void btnOffsetInteligente_Click(object? sender, EventArgs e)
        {
            try
            {
                // 1) Para el usuario: “cerrar” utilidades (ocultar)
                this.Hide();

                // 2) Crear el form de Offset
                var frm = new SicoePresupuestoNET8.FrmOffsetInteligente();

                // 3) Cuando Offset cierre, cerramos Utilidades definitivamente
                frm.FormClosed += (_, __) =>
                {
                    try { this.Close(); } catch { /* no-op */ }
                };

                // 4) Mostrar MODELESS (permite navegar el CAD)
                var mw = Autodesk.AutoCAD.ApplicationServices.Application.MainWindow;
                if (mw != null)
                    Autodesk.AutoCAD.ApplicationServices.Application.ShowModelessDialog(mw.Handle, frm);
                else
                    Autodesk.AutoCAD.ApplicationServices.Application.ShowModelessDialog(frm);
            }
            catch (System.Exception ex)
            {
                MessageBox.Show("No se pudo abrir Offset Inteligente:\n" + ex.Message,
                    "SicoeCAD", MessageBoxButtons.OK, MessageBoxIcon.Error);

                // Si falló, volver a mostrar Utilidades
                try { this.Show(); } catch { /* no-op */ }
            }
        }


        private void ApplyThemeAndTiles()
        {
            // === COLORES BASE (alineados con tus formularios tipo SICOE) ===
            // Si tienes RGB exactos del Presupuesto/Launcher, me los pasas y los clavo idénticos.
            var baseBack = Color.FromArgb(233, 246, 250);   // fondo general
            var headerBack = Color.FromArgb(196, 235, 243); // header
            var footerBack = Color.FromArgb(196, 235, 243); // footer

            this.BackColor = baseBack;
            pnlBody.BackColor = baseBack;
            pnlTilesHost.BackColor = baseBack;

            pnlHeader.BackColor = headerBack;
            pnlFooter.BackColor = footerBack;

            // === LOGO ===
            // Opción A (recomendada): si ya tienes el logo en Resources, asigna aquí:
            // picLogo.Image = Properties.Resources.SicoeLogo;
            //
            // Opción B: buscar un PNG junto a la DLL (no revienta si no existe)
            TryLoadLogoNearDll();

            var tileBack = Color.FromArgb(188, 235, 240);
            StyleTile(btnAcotadoEspecial, tileBack);
            StyleTile(btnOffsetInteligente, tileBack);
            StyleTile(btnImportarPuntos, tileBack);
            StyleTile(btnConfigRapida, tileBack);


            // “Acotado” como primera herramienta habilitada
            btnAcotadoEspecial.Enabled = true;

            // Las demás quedan visibles pero sin operación (por ahora)
            btnOffsetInteligente.Enabled = true;
            btnImportarPuntos.Enabled = true;
            btnConfigRapida.Enabled = true;
        }

        private void StyleTile(Button b, Color back)
        {
            b.FlatStyle = FlatStyle.Flat;
            b.FlatAppearance.BorderSize = 0;
            b.BackColor = back;
            b.ForeColor = Color.Black;
            b.Font = new Font("Segoe UI", 12F, FontStyle.Bold, GraphicsUnit.Point);
            b.Cursor = Cursors.Hand;
            b.TextAlign = ContentAlignment.MiddleLeft;
            b.Padding = new Padding(16, 10, 10, 10);
        }

        private void TryLoadLogoNearDll()
        {
            try
            {
                // Busca un archivo logo en la misma carpeta de la DLL:
                // SicoeCAD_logo.png (puedes renombrarlo así)
                var dll = Assembly.GetExecutingAssembly().Location;
                var dir = Path.GetDirectoryName(dll) ?? "";
                var logoPath = Path.Combine(dir, "SicoeCAD_logo.png");

                if (File.Exists(logoPath))
                {
                    using var bmpTemp = new Bitmap(logoPath);
                    picLogo.Image = new Bitmap(bmpTemp);
                }
            }
            catch
            {
                // si falla, no hace nada: no debe tumbar el form
            }
        }
        private void BtnInicio_Click(object? sender, EventArgs e)
        {
            // Cierra Utilidades y vuelve al lanzador principal
            this.Hide();

            using (var frm = new FrmSicoeCad())
            {
                frm.StartPosition = FormStartPosition.CenterScreen;
                frm.ShowDialog();
            }

            this.Close();
        }

    }
}

