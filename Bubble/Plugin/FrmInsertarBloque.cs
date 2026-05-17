using Autodesk.AutoCAD.ApplicationServices;
using System;
using System.Windows.Forms;

namespace SicoePresupuestoNET8
{
    internal partial class FrmInsertarBloque : Form
    {
        private readonly Autodesk.AutoCAD.ApplicationServices.Document _doc;
        public event EventHandler UndoRequested;   // ← NUEVO
        // Evitar cierres no deseados

        // Señal para reabrir UnirPuntos cuando se cancele
        public event EventHandler CanceledByUser;
        private bool _modoUnir = false;

        // Nuevo evento para solicitar unión con otro nodo
        public sealed class UnirArgs : EventArgs
        {
            public int NodoDestino { get; }
            public UnirArgs(int nodoDestino) => NodoDestino = nodoDestino;
        }
        public event EventHandler<UnirArgs>? UnirRequested;
        /// <summary>
        /// Restablece el modo normal: rojo OFF, verdes ON.
        /// </summary>
        public void ResetModoNormal()
        {
            _modoUnir = false;
            // rojo OFF
            txtnewnodo.Enabled = false;
            txtnewnodo.Clear();

            // verdes ON
            cboBloque.Enabled = true;
            txtNodoLL.Enabled = true;
            txtNodoLR.Enabled = true;

            txtNodoLL.Focus();
        }

        /// <summary>
        /// Activa el modo "Unir con OTRO nodo".
        /// Habilita txtnewnodo y deshabilita cboBloque, txtNodoLL y txtNodoLR.
        /// </summary>
        public void SetModoUnir()
        {
            _modoUnir = true;
            // rojo ON
            txtnewnodo.Enabled = true;
            txtnewnodo.ReadOnly = false;
            txtnewnodo.Clear();
            txtnewnodo.Focus();

            // verde OFF
            cboBloque.Enabled = false;
            txtNodoLL.Enabled = false;
            txtNodoLR.Enabled = false;
        }
        // Inserción repetible sin cerrar
        public class InsertArgs : EventArgs
        {
            public string BlockName { get; init; }
            public int NodoLL { get; init; }
            public int NodoLR { get; init; }
        }
        public event EventHandler<InsertArgs> InsertRequested;

        public string BlockName => cboBloque.SelectedItem?.ToString() ?? "";
        public int NodoInferiorIzq => int.TryParse(txtNodoLL.Text.Trim(), out var n) ? n : 0;
        public int NodoInferiorDer => int.TryParse(txtNodoLR.Text.Trim(), out var n) ? n : 0;

        public FrmInsertarBloque(Autodesk.AutoCAD.ApplicationServices.Document doc)
        {
            InitializeComponent();
            _doc = doc;

            // No permitir cierre automático por Enter/Esc
            this.AcceptButton = null;
            this.CancelButton = null;
            this.KeyPreview = true;
            nodoDeshacer.Click += nodoDeshacer_Click;   // ← NUEVO
            // Navegación con Enter
            txtNodoLL.KeyDown += (s, e) =>
            {
                if (e.KeyCode == Keys.Enter)
                {
                    e.SuppressKeyPress = true;
                    txtNodoLR.Focus();
                    txtNodoLR.SelectAll();
                }
            };
            txtNodoLR.KeyDown += (s, e) =>
            {
                if (e.KeyCode == Keys.Enter)
                {
                    e.SuppressKeyPress = true;
                    BtnOk_Click(s, EventArgs.Empty);   // equivalente a Aceptar
                }
            };



            // Cargar lista de bloques
            try
            {
                using (_doc.LockDocument())
                using (var tr = _doc.Database.TransactionManager.StartTransaction())
                {
                    var names = FrmUnirPuntos.GetBlockNames(_doc.Database, tr);
                    cboBloque.Items.AddRange(names.ToArray());
                    tr.Commit();
                }
                if (cboBloque.Items.Count > 0) cboBloque.SelectedIndex = 0;
            }
            catch { }
            // Estado inicial: rojo OFF, verde ON
            txtnewnodo.Enabled = false;
            cboBloque.Enabled = true;
            txtNodoLL.Enabled = true;
            txtNodoLR.Enabled = true;

        }

        // Aceptar: dispara inserción y NO cierra
        // Aceptar: dispara inserción o unión según el modo
        // Aceptar: dispara inserción o unión según el modo
        // Aceptar: inserción o unión; el formulario NO se cierra en modo unir.
        // Se restablece automáticamente al modo normal después de unir.
        private void BtnOk_Click(object sender, EventArgs e)
        {
            if (_modoUnir)
            {
                if (!int.TryParse(txtnewnodo.Text?.Trim(), out var nd) || nd <= 0)
                {
                    MessageBox.Show("Digite un NODO destino válido.", "SICOE",
                        MessageBoxButtons.OK, MessageBoxIcon.Information);
                    txtnewnodo.Focus();
                    txtnewnodo.SelectAll();
                    return;
                }

                // Dispara evento al host y vuelve al modo normal sin cerrar el form
                UnirRequested?.Invoke(this, new UnirArgs(nd));
                ResetModoNormal();
                return;
            }

            // Modo normal (insertar bloque por NODO)
            if (cboBloque.SelectedItem == null ||
                !int.TryParse(txtNodoLL.Text?.Trim(), out var nLL) ||
                !int.TryParse(txtNodoLR.Text?.Trim(), out var nLR))
            {
                MessageBox.Show("Complete Bloque, Nodo inferior IZQ y DER.", "SICOE",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            InsertRequested?.Invoke(this, new InsertArgs
            {
                BlockName = cboBloque.SelectedItem.ToString()!,
                NodoLL = nLL,
                NodoLR = nLR
            });

            // Listo para siguiente ciclo
            txtNodoLL.Clear();
            txtNodoLR.Clear();
            txtNodoLL.Focus();
        }



        // Cancelar: marcar cierre permitido y notificar para reabrir UnirPuntos
        private void BtnCancel_Click(object sender, EventArgs e)
        {
            // no cerrar; solo ocultar para que no quede 'Disposed'
            this.Hide();
            CanceledByUser?.Invoke(this, EventArgs.Empty);
        }

        private void nodoDeshacer_Click(object? sender, EventArgs e)
    => UndoRequested?.Invoke(this, EventArgs.Empty);  // ← NUEVO
        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            // Evita dejar el form en estado Disposed
            if (e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                this.Hide();
                return;
            }
            base.OnFormClosing(e);
        }

    }



}
