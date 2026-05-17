using DocumentFormat.OpenXml.Drawing.Charts;
using System;
using System.ComponentModel;
using System.Linq;
using System.Windows.Forms;

namespace SicoePresupuestoNET8
{
    public partial class FrmNuevoPkId : Form
    {
        public CapaInfo? Result { get; private set; }

        public FrmNuevoPkId()
        
        {
            InitializeComponent();

            // Combos básicos si vienen vacíos
            if (cbTramo.Items.Count == 0)
                cbTramo.Items.AddRange(new object[] { "TRAMO 1", "TRAMO 2" });
            if (cbInfra.Items.Count == 0)
                cbInfra.Items.AddRange(new object[] { "CALZADA", "SEPARADOR", "ANDEN", "CICLORUTA" });
            if (cbCostado.Items.Count == 0)
                cbCostado.Items.AddRange(new object[] { "NORTE", "SUR", "ORIENTE", "OCCIDENTE" });

            // Botón aceptar: valida, crea Result y cierra
            btnOk.Click += (_, __) =>
            {
                if (!Validar(out var msg))
                {
                    MessageBox.Show(this, msg, "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    this.DialogResult = DialogResult.None;   // evita cierre si no es válido
                    return;
                }

                Result = new CapaInfo
                {
                    CAPA = txtPk.Text.Trim(),
                    CIV = txtCiv.Text.Trim(),
                    UBICACION = txtUbic.Text.Trim(),
                    TRAMO = cbTramo.SelectedItem?.ToString() ?? cbTramo.Text,
                    INFRAESTRUCTURA = cbInfra.SelectedItem?.ToString() ?? cbInfra.Text,
                    COSTADO = cbCostado.SelectedItem?.ToString() ?? cbCostado.Text,
                    ABS_INICIO = txtAbsIni.Text.Trim(),
                    ABS_FINAL = txtAbsFin.Text.Trim(),
                };
                // btnOk ya tiene DialogResult=OK en el Designer
                // no hace falta setear nada más
            };

        }

        private static string? Prompt(string title)
        {
            using var f = new Form { Text = title, Width = 360, Height = 130, StartPosition = FormStartPosition.CenterParent };
            var tb = new TextBox { Dock = DockStyle.Top, Margin = new Padding(8) };
            var ok = new Button { Text = "OK", DialogResult = DialogResult.OK, Dock = DockStyle.Bottom };
            f.Controls.Add(tb); f.Controls.Add(ok);
            return f.ShowDialog() == DialogResult.OK ? tb.Text : null;
        }

        private bool Validar(out string msg)
        {
            msg = "";
            if (string.IsNullOrWhiteSpace(txtPk.Text)) { msg = "PK_ID es obligatorio."; return false; }
            if (string.IsNullOrWhiteSpace(txtCiv.Text)) { msg = "CIV es obligatorio."; return false; }
            if (string.IsNullOrWhiteSpace(txtUbic.Text)) { msg = "Ubicación es obligatoria."; return false; }
            if (string.IsNullOrWhiteSpace(txtAbsIni.Text)) { msg = "AbsInicio es obligatorio."; return false; }
            if (string.IsNullOrWhiteSpace(txtAbsFin.Text)) { msg = "AbsFinal es obligatorio."; return false; }
            return true;
        }
    }
}
