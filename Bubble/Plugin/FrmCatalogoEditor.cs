using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Globalization;
using System.Linq;
using System.Windows.Forms;

namespace SicoePresupuestoNET8
{
    public partial class FrmCatalogoEditor : Form
    {
        private BindingList<PresItem> _bind;

        public FrmCatalogoEditor()
        {
            InitializeComponent();

            // Enter = Aceptar, Esc = Cancelar
            this.AcceptButton = btnAceptar;
            this.CancelButton = btnCancelar;
            btnAceptar.DialogResult = DialogResult.OK;
            btnCancelar.DialogResult = DialogResult.Cancel;

            // Garantiza lista
            if (Commands.Catalogo == null)
                Commands.SetCatalogo(new List<PresItem>());

            // Enlazar grilla a una lista editable (misma instancia)
            _bind = new BindingList<PresItem>(Commands.Catalogo);
            dgvCatalogo.AutoGenerateColumns = false;
            dgvCatalogo.DataSource = _bind;

            dgvCatalogo.SelectionChanged += (s, e) => CargarSeleccionEnCampos();

            btnEliminarFila.Click += btnEliminarFila_Click;
            btnEditarRegistro.Click += btnEditarRegistro_Click;
        }

        // (opcional) por si quieres leer la lista modificada al cerrar con OK
        public System.Collections.Generic.List<PresItem> Items => _bind.ToList();


        private PresItem? ItemSeleccionado()
        {
            if (dgvCatalogo.CurrentRow?.DataBoundItem is PresItem it) return it;
            return null;
        }

        private void CargarSeleccionEnCampos()
        {
            var it = ItemSeleccionado();
            if (it == null) return;

            txtCapitulo.Text = it.Capitulo;
            txtCompetencia.Text = it.Competencia;
            txtItem.Text = it.Item;
            txtDescripcion.Text = it.Descripcion;
            txtUnd.Text = it.Und;
            txtVU.Text = it.ValorUnitario.ToString("0.##", CultureInfo.InvariantCulture);
        }

        private void btnEditarRegistro_Click(object? sender, EventArgs e)
        {
            var it = ItemSeleccionado();
            if (it == null)
            {
                MessageBox.Show("Selecciona una fila primero.", "SICOE",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            // Validaciones básicas
            if (string.IsNullOrWhiteSpace(txtCapitulo.Text) ||
                string.IsNullOrWhiteSpace(txtCompetencia.Text) ||
                string.IsNullOrWhiteSpace(txtItem.Text) ||
                string.IsNullOrWhiteSpace(txtUnd.Text))
            {
                MessageBox.Show("Capítulo, Competencia, Ítem y Und son obligatorios.",
                    "SICOE", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            decimal vu = ParseDecimalSafe(txtVU.Text);

            // Actualiza objeto enlazado
            it.Capitulo = txtCapitulo.Text.Trim();
            it.Competencia = txtCompetencia.Text.Trim();
            it.Item = txtItem.Text.Trim();
            it.Descripcion = txtDescripcion.Text.Trim();
            it.Und = txtUnd.Text.Trim();
            it.ValorUnitario = vu;

            dgvCatalogo.Refresh();
        }

        private void btnEliminarFila_Click(object? sender, EventArgs e)
        {
            var it = ItemSeleccionado();
            if (it == null) return;

            var r = MessageBox.Show($"¿Eliminar el ítem {it.Item}?",
                "SICOE", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
            if (r != DialogResult.Yes) return;

            _bind.Remove(it);     // esto actualiza Commands.Catalogo (es la misma lista)
            dgvCatalogo.Refresh();
        }
        private static decimal ParseDecimalSafe(string s)
        {
            if (string.IsNullOrWhiteSpace(s)) return 0m;
            s = s.Trim();

            // normalizar: admitir "1.234,56" o "1,234.56"
            if (s.Contains(",") && s.Contains("."))
            {
                int lastComma = s.LastIndexOf(',');
                int lastDot = s.LastIndexOf('.');
                if (lastComma > lastDot)
                    s = s.Replace(".", "").Replace(',', '.'); // "1.234,56" -> "1234.56"
                else
                    s = s.Replace(",", "");                   // "1,234.56" -> "1234.56"
            }
            else if (s.Contains(",")) // "1234,56"
            {
                s = s.Replace(',', '.');
            }

            return decimal.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture, out var v)
                   ? v
                   : 0m;
        }

    }
}
