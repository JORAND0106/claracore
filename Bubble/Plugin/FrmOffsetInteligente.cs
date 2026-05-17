using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Windows.Forms;

using AcApp = Autodesk.AutoCAD.ApplicationServices.Application;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;

namespace SicoePresupuestoNET8
{
    public partial class FrmOffsetInteligente : Form
    {
        private readonly List<ObjectId> _seleccion = new();

        public FrmOffsetInteligente()
        {
            InitializeComponent();

            // ================================
            // Carga de opciones del Combo Modo
            // ================================
            cmbModo.Items.Clear();
            cmbModo.Items.Add("Hacia afuera");
            cmbModo.Items.Add("Hacia adentro");
            cmbModo.Items.Add("Ambos (dos offsets)");
            cmbModo.SelectedIndex = 0;

            // ================================
            // Eventos
            // ================================
            btnSeleccionar.Click += BtnSeleccionar_Click;
            btnEjecutar.Click += BtnEjecutar_Click;
            btnCerrar.Click += (_, __) => Close();

            // ================================
            // Defaults
            // ================================
            chkMantenerCurvas.Checked = true;
            chkNoExplote.Checked = true;

            ActualizarUISeleccion();
        }


        private void ActualizarUISeleccion()
        {
            lblSeleccionInfo.Text = $"{_seleccion.Count} entidad(es) seleccionada(s).";
        }

        // ==========================================================
        // 1) Seleccionar entidades
        // ==========================================================
        private void BtnSeleccionar_Click(object? sender, EventArgs e)
        {
            try
            {
                var doc = AcApp.DocumentManager.MdiActiveDocument;
                if (doc == null) return;

                var ed = doc.Editor;

                // Ocultamos el form para evitar que estorbe la selección
                this.Hide();

                var pso = new PromptSelectionOptions
                {
                    MessageForAdding = "\nSeleccione entidades (polilíneas cerradas / líneas / arcos / splines) para Offset Inteligente: ",
                    AllowDuplicates = false
                };

                // Filtro: curvas en general. (Polyline/LWPolyline/Line/Arc/Circle/Spline/Ellipse)
                var tvs = new TypedValue[]
                {
                    new TypedValue((int)DxfCode.Start, "LWPOLYLINE,POLYLINE,LINE,ARC,CIRCLE,SPLINE,ELLIPSE")
                };
                var filter = new SelectionFilter(tvs);

                var res = ed.GetSelection(pso, filter);

                if (res.Status == PromptStatus.OK)
                {
                    _seleccion.Clear();
                    _seleccion.AddRange(res.Value.GetObjectIds());
                }
                else if (res.Status == PromptStatus.Cancel)
                {
                    // No hacer nada, solo volver
                }

                ActualizarUISeleccion();
            }
            finally
            {
                this.Show();
                this.Activate();
            }
        }

        // ==========================================================
        // 2) Ejecutar lógica de Offset Inteligente (WCS)
        // ==========================================================
        private void BtnEjecutar_Click(object? sender, EventArgs e)
        {
            if (_seleccion.Count == 0)
            {
                MessageBox.Show("Debe seleccionar al menos una entidad.", "SicoeCAD", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            if (!TryParseDouble(txtDistancia.Text, out var distancia) || distancia <= 0)
            {
                MessageBox.Show("La distancia debe ser un número mayor que 0.\nEjemplo: 0.20", "SicoeCAD", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            var modo = cmbModo.SelectedIndex switch
            {
                0 => OffsetModo.HaciaAfuera,
                1 => OffsetModo.HaciaAdentro,
                2 => OffsetModo.Ambos,
                _ => OffsetModo.HaciaAfuera
            };

            var lados = new LadosSeleccion
            {
                Izquierdo = chkIzq.Checked,
                Derecho = chkDer.Checked,
                Superior = chkSup.Checked,
                Inferior = chkInf.Checked
            };

            if (!lados.Izquierdo && !lados.Derecho && !lados.Superior && !lados.Inferior)
            {
                MessageBox.Show("Debe marcar al menos un lado (Izquierdo/Derecho/Superior/Inferior).", "SicoeCAD",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            var opciones = new OffsetOpciones
            {
                DetectarLadosComunes = chkAutoNoOffsetLadosComunes.Checked,
                MantenerCurvas = chkMantenerCurvas.Checked,
                NoExplote = chkNoExplote.Checked,
                CrearCapaNueva = chkCapaNueva.Checked,
                LayerDestino = (txtLayer.Text ?? "").Trim()
            };

            if (opciones.CrearCapaNueva && string.IsNullOrWhiteSpace(opciones.LayerDestino))
            {
                MessageBox.Show("Si activa 'Crear resultado en capa nueva', debe indicar el Layer destino.", "SicoeCAD",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            try
            {
                var doc = AcApp.DocumentManager.MdiActiveDocument;
                if (doc == null) return;

                using (doc.LockDocument())
                {
                    var service = new OffsetInteligenteService();
                    var resultado = service.Ejecutar(_seleccion, distancia, modo, lados, opciones);
                    doc.Editor.Regen();
                    doc.Editor.UpdateScreen();

                    MessageBox.Show(
                        $"Proceso finalizado.\n\n" +
                        $"Procesadas: {resultado.Procesadas}\n" +
                        $"Creadas: {resultado.Creadas}\n" +
                        $"Omitidas: {resultado.Omitidas}\n\n" +
                        $"{resultado.MensajeResumen}",
                        "SicoeCAD",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information
                    );
                    // ================================
                    // Reset de selección y contador
                    // ================================
                    _seleccion.Clear();
                    ActualizarUISeleccion();

                }
            }
            catch (System.Exception ex)
            {
                MessageBox.Show($"Error ejecutando Offset Inteligente:\n{ex.Message}", "SicoeCAD",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static bool TryParseDouble(string? s, out double value)
        {
            value = 0;
            if (string.IsNullOrWhiteSpace(s)) return false;

            // Soporta "0.20" y "0,20"
            s = s.Trim();
            if (double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out value))
                return true;
            if (double.TryParse(s, NumberStyles.Float, CultureInfo.GetCultureInfo("es-CO"), out value))
                return true;
            if (double.TryParse(s.Replace(',', '.'), NumberStyles.Float, CultureInfo.InvariantCulture, out value))
                return true;

            return false;
        }
    }

    // ==========================================================
    // DTOs / Tipos de soporte
    // ==========================================================
    public enum OffsetModo { HaciaAfuera, HaciaAdentro, Ambos }

    public sealed class LadosSeleccion
    {
        public bool Izquierdo { get; set; }
        public bool Derecho { get; set; }
        public bool Superior { get; set; }
        public bool Inferior { get; set; }
    }

    public sealed class OffsetOpciones
    {
        public bool DetectarLadosComunes { get; set; }
        public bool MantenerCurvas { get; set; }
        public bool NoExplote { get; set; }
        public bool CrearCapaNueva { get; set; }
        public string LayerDestino { get; set; } = "";
    }

    public sealed class OffsetResultado
    {
        public int Procesadas { get; set; }
        public int Creadas { get; set; }
        public int Omitidas { get; set; }
        public string MensajeResumen { get; set; } = "";
    }
}
