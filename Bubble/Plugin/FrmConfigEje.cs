using System;
using System.Globalization;
using System.Windows.Forms;

namespace SicoePresupuestoNET8
{
    public partial class FrmConfigEje : Form
    {
        public bool IsDouble => rbDoble.Checked;
        public string Orientation => rbNS.Checked ? "NS" : "EO";
        public double Interval { get; private set; } = 10.0;

        // Nuevas propiedades para las ordenadas
        public double OrdIzqA { get; private set; } = 20.0;
        public double OrdDerA { get; private set; } = 20.0;
        public double OrdIzqB { get; private set; } = 20.0;
        public double OrdDerB { get; private set; } = 20.0;
        public double AbsInicioA { get; private set; } = 0.0;
        public double AbsInicioB { get; private set; } = 0.0;

        public FrmConfigEje()
        {
            InitializeComponent();

            // Estado inicial visual
            UpdateUI();

            // Eventos
            rbDoble.CheckedChanged += (s, e) => UpdateUI();

            // Validación y Cierre
            btnContinuar.Click += (s, e) =>
            {
                if (ValidateAndSave())
                    this.DialogResult = DialogResult.OK;
                else
                    this.DialogResult = DialogResult.None; // Mantiene abierto si hay error
            };
        }

        private void UpdateUI()
        {
            bool doble = rbDoble.Checked;
            gbOrient.Enabled = doble;

            // Visibilidad de campos B
            lblTitB.Visible = doble;
            lblIzqB.Visible = doble;
            txtIzqB.Visible = doble;
            lblDerB.Visible = doble;
            txtDerB.Visible = doble;
            lblAbsInicioA.Visible = true;   // siempre visible
            txtAbsInicioA.Visible = true;   // siempre visible
            lblAbsInicioB.Visible = doble;
            txtAbsInicioB.Visible = doble;

            // Cambiar texto A para claridad
            lblTitA.Text = doble ? "Calzada A:" : "Calzada Única:";
        }

        private bool ValidateAndSave()
        {
            // Validar Intervalo
            if (!TryParse(txtIntervalo.Text, out double v) || v <= 0)
            {
                ShowError("El intervalo debe ser un número mayor que 0.");
                return false;
            }
            Interval = v;

            // Validar Ordenadas A
            if (!TryParse(txtIzqA.Text, out var izqA) || izqA < 0) { ShowError("Ordenada Izquierda A inválida."); return false; }
            if (!TryParse(txtDerA.Text, out var derA) || derA < 0) { ShowError("Ordenada Derecha A inválida."); return false; }
            OrdIzqA = izqA;
            OrdDerA = derA;

            // NUEVO — Abscisa inicial sector
            if (!TryParse(txtAbsInicioA.Text, out var absA) || absA < 0)
            { ShowError("Abscisa inicial A inválida."); return false; }
            AbsInicioA = absA;

            if (IsDouble)
            {
                if (!TryParse(txtAbsInicioB.Text, out var absB) || absB < 0)
                { ShowError("Abscisa inicial B inválida."); return false; }
                AbsInicioB = absB;
            }

            // Validar Ordenadas B (solo si es doble)
            if (IsDouble)
            {
                if (!TryParse(txtIzqB.Text, out var izqB) || izqB < 0) { ShowError("Ordenada Izquierda B inválida."); return false; }
                if (!TryParse(txtDerB.Text, out var derB) || derB < 0) { ShowError("Ordenada Derecha B inválida."); return false; }
                OrdIzqB = izqB;
                OrdDerB = derB;
            }

            return true;
        }

        private bool TryParse(string text, out double val)
        {
            return double.TryParse(text, NumberStyles.Any, CultureInfo.InvariantCulture, out val);
        }

        private void ShowError(string msg)
        {
            MessageBox.Show(msg, "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }
}