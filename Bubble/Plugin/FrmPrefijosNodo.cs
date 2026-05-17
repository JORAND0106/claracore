using System;
using System.Windows.Forms;

namespace SicoePresupuestoNET8
{
    /// <summary>
    /// Popup opcional que pide prefijo y contador inicial para nodos rápidos.
    /// Si el usuario deja el prefijo vacío o pulsa "Sin prefijo", Aplicar = false.
    /// </summary>
    internal sealed partial class FrmPrefijosNodo : Form
    {
        // ── Resultado público ──
        public bool Aplicar { get; private set; } = false;
        public string Prefijo { get; private set; } = "";
        public int ContadorInicial { get; private set; } = 1;

        // ── Controles ──
        private readonly ComboBox cmbPrefijo = new();
        private readonly NumericUpDown nudContador = new();
        private readonly Button btnOk = new();
        private readonly Button btnSaltar = new();
        private readonly Label lblHint = new();

        public FrmPrefijosNodo()
        {
            Text = "Prefijo de nodo rápido";
            FormBorderStyle = FormBorderStyle.FixedDialog;
            StartPosition = FormStartPosition.CenterParent;
            MaximizeBox = false;
            MinimizeBox = false;
            ClientSize = new System.Drawing.Size(380, 160);

            // ── Label Prefijo ──
            var lblP = new Label
            {
                Text = "Prefijo:",
                Left = 12,
                Top = 20,
                AutoSize = true
            };

            // ── ComboBox Prefijo con autocomplete ──
            cmbPrefijo.Left = 110;
            cmbPrefijo.Top = 16;
            cmbPrefijo.Width = 250;
            cmbPrefijo.DropDownStyle = ComboBoxStyle.DropDown;
            cmbPrefijo.AutoCompleteMode = AutoCompleteMode.SuggestAppend;
            cmbPrefijo.AutoCompleteSource = AutoCompleteSource.ListItems;

            foreach (var p in NodoPrefijosStore.GetPrefijos())
                cmbPrefijo.Items.Add(p);

            cmbPrefijo.SelectedIndexChanged += (s, e) => ActualizarContador();
            cmbPrefijo.Leave += (s, e) => ActualizarContador();

            // ── Label Contador ──
            var lblC = new Label
            {
                Text = "Contador inicial:",
                Left = 12,
                Top = 62,
                AutoSize = true
            };

            // ── NumericUpDown Contador ──
            nudContador.Left = 140;
            nudContador.Top = 58;
            nudContador.Width = 90;
            nudContador.Minimum = 1;
            nudContador.Maximum = 99999;
            nudContador.Value = 1;

            // ── Hint ──
            lblHint.Text = "Si dejas el prefijo vacío el flujo continúa sin prefijo.";
            lblHint.Left = 12;
            lblHint.Top = 100;
            lblHint.Width = 350;
            lblHint.AutoSize = false;
            lblHint.ForeColor = System.Drawing.Color.Gray;
            lblHint.Font = new System.Drawing.Font("Segoe UI", 7.5f);

            // ── Botones ──
            btnOk.Text = "Aplicar";
            btnOk.Left = 190; btnOk.Top = 124; btnOk.Width = 85;

            btnSaltar.Text = "Sin prefijo";
            btnSaltar.Left = 284; btnSaltar.Top = 124; btnSaltar.Width = 84;

            btnOk.Click += BtnOk_Click;
            btnSaltar.Click += BtnSaltar_Click;

            // ESC = sin prefijo
            KeyPreview = true;
            KeyDown += (s, e) =>
            {
                if (e.KeyCode == Keys.Escape) { Aplicar = false; Close(); }
            };

            Controls.AddRange(new Control[]
            {
                lblP, cmbPrefijo,
                lblC, nudContador,
                lblHint,
                btnOk, btnSaltar
            });
        }

        private void ActualizarContador()
        {
            string pref = cmbPrefijo.Text.Trim();
            if (string.IsNullOrWhiteSpace(pref)) return;

            int ultimo = NodoPrefijosStore.GetUltimoContador(pref);
            nudContador.Value = Math.Max(1, ultimo + 1);
        }

        private void BtnOk_Click(object? s, EventArgs e)
        {
            string pref = cmbPrefijo.Text.Trim();
            if (string.IsNullOrWhiteSpace(pref))
            {
                Aplicar = false;
            }
            else
            {
                Aplicar = true;
                Prefijo = pref;
                ContadorInicial = (int)nudContador.Value;
            }
            Close();
        }

        private void BtnSaltar_Click(object? s, EventArgs e)
        {
            Aplicar = false;
            Close();
        }
    }
}