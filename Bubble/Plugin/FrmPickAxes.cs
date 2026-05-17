using System;
using System.Drawing;
using System.Windows.Forms;
using acApp = Autodesk.AutoCAD.ApplicationServices;
using acDb = Autodesk.AutoCAD.DatabaseServices;
using acEd = Autodesk.AutoCAD.EditorInput;
using acGeo = Autodesk.AutoCAD.Geometry;

namespace SicoePresupuestoNET8
{
    public partial class FrmPickAxes : Form
    {
        private readonly bool _esDoble;
        private readonly string _orient;
        private readonly string _nomA;
        private readonly string _nomB;

        // Propiedades Públicas (para que FrmCargueEje las lea)
        public acDb.ObjectId AxisA { get; private set; } = acDb.ObjectId.Null;
        public acDb.ObjectId AxisB { get; private set; } = acDb.ObjectId.Null;
        public acGeo.Point3d Pk0A { get; private set; } = acGeo.Point3d.Origin;
        public acGeo.Point3d Pk0B { get; private set; } = acGeo.Point3d.Origin;
        public double Pk0DistA { get; private set; } = 0.0;
        public double Pk0DistB { get; private set; } = 0.0;
        public string NombreA => _nomA;
        public string NombreB => _nomB;

        public FrmPickAxes(bool esDoble, string orient, string nomA, string nomB)
        {
            _esDoble = esDoble;
            _orient = orient ?? "";
            _nomA = string.IsNullOrWhiteSpace(nomA) ? "Única" : nomA;
            _nomB = string.IsNullOrWhiteSpace(nomB) ? "-" : nomB;

            InitializeComponent(); // Carga el designer
            ConfigureDynamicUI();  // Ajusta layout

            // Eventos
            btnSelA.Click += (s, e) => HandlePickAxis(true);
            btnPkA.Click += (s, e) => HandlePickPk(true);
            btnSelB.Click += (s, e) => HandlePickAxis(false);
            btnPkB.Click += (s, e) => HandlePickPk(false);

            btnInvertir.Click += (s, e) => { InvertAB(); CheckReady(); };
            btnLimpiar.Click += (s, e) => ResetAll();

            FormClosed += (s, e) => { Unhighlight(AxisA); Unhighlight(AxisB); };
        }

        private void ConfigureDynamicUI()
        {
            lblTip.Text = _esDoble
               ? $"Orientación: {(_orient == "NS" ? "Norte–Sur" : "Oriente–Occidente")}.\nSeleccione ejes para {_nomA} y {_nomB}."
               : "Seleccione el eje y el punto PK 0+000.00 sobre el eje.";

            if (_esDoble)
            {
                gbA.Text = $"Calzada A ({_nomA})";
                gbB.Text = $"Calzada B ({_nomB})";
                gbB.Visible = true;

                // Ajustar posiciones
                gbA.Location = new Point(12, 110);
                gbB.Location = new Point(12, 190);
                SetButtonsY(270);
                this.ClientSize = new Size(520, 330);
            }
            else
            {
                gbA.Text = "Calzada Única";
                gbB.Visible = false;
                gbA.Location = new Point(12, 110);
                SetButtonsY(190);
                this.ClientSize = new Size(520, 250);
            }
        }

        private void SetButtonsY(int y)
        {
            btnInvertir.Location = new Point(12, y);
            btnLimpiar.Location = new Point(110, y);
            btnOk.Location = new Point(320, y);
            btnCancel.Location = new Point(418, y);
        }

        // --- Lógica de AutoCAD ---
        private void HandlePickAxis(bool isA)
        {
            if (PickAxis(out var id))
            {
                if (isA) AxisA = id; else AxisB = id;
                UpdateLabels();
                if (isA) btnPkA.Enabled = true; else btnPkB.Enabled = true;
                CheckReady();
            }
        }

        private void HandlePickPk(bool isA)
        {
            var axis = isA ? AxisA : AxisB;
            if (PickPk(axis, out var pt, out var dist))
            {
                if (isA) { Pk0A = pt; Pk0DistA = dist; }
                else { Pk0B = pt; Pk0DistB = dist; }
                UpdateLabels();
                CheckReady();
            }
        }

        private bool PickAxis(out acDb.ObjectId axis)
        {
            axis = acDb.ObjectId.Null;
            var ed = acApp.Application.DocumentManager.MdiActiveDocument.Editor;
            this.Hide();
            try
            {
                var peo = new acEd.PromptEntityOptions("\nSeleccione una curva (Línea/Polilínea/Arco):");
                peo.SetRejectMessage("\nDebe ser una curva.");
                peo.AddAllowedClass(typeof(acDb.Curve), false);
                var pr = ed.GetEntity(peo);
                if (pr.Status == acEd.PromptStatus.OK)
                {
                    axis = pr.ObjectId;
                    Highlight(axis);
                    return true;
                }
                return false;
            }
            finally { this.Show(); }
        }

        private bool PickPk(acDb.ObjectId axisId, out acGeo.Point3d pt, out double dist)
        {
            pt = acGeo.Point3d.Origin; dist = 0;
            if (axisId.IsNull) return false;

            var ed = acApp.Application.DocumentManager.MdiActiveDocument.Editor;
            var db = acApp.Application.DocumentManager.MdiActiveDocument.Database;
            this.Hide();
            try
            {
                var ppr = ed.GetPoint("\nIndique el punto PK 0+000.00 sobre el eje:");
                if (ppr.Status == acEd.PromptStatus.OK)
                {
                    using var tr = db.TransactionManager.StartTransaction();
                    var crv = (acDb.Curve)tr.GetObject(axisId, acDb.OpenMode.ForRead);
                    var proj = crv.GetClosestPointTo(ppr.Value, false);
                    double par = crv.GetParameterAtPoint(proj);
                    dist = crv.GetDistanceAtParameter(par); // <--- CORRECTO
                    pt = proj;
                    tr.Commit();
                    return true;
                }
                return false;
            }
            finally { this.Show(); }
        }

        private void UpdateLabels()
        {
            lblA.Text = AxisA.IsNull ? "Eje: -" : "Eje: Seleccionado";
            lblPkA.Text = (Pk0A == acGeo.Point3d.Origin) ? "PK0: -" : "PK0: Definido";
            lblB.Text = AxisB.IsNull ? "Eje: -" : "Eje: Seleccionado";
            lblPkB.Text = (Pk0B == acGeo.Point3d.Origin) ? "PK0: -" : "PK0: Definido";
        }

        private void CheckReady()
        {
            bool ok = _esDoble
                ? (!AxisA.IsNull && !AxisB.IsNull && Pk0A != acGeo.Point3d.Origin && Pk0B != acGeo.Point3d.Origin)
                : (!AxisA.IsNull && Pk0A != acGeo.Point3d.Origin);

            btnOk.Enabled = ok;
            btnInvertir.Enabled = _esDoble;

            // NUEVO: Validar geografía si todo está listo
            if (ok && _esDoble) AutoDetectSwap();
        }

        private void ResetAll()
        {
            Unhighlight(AxisA); Unhighlight(AxisB);
            AxisA = AxisB = acDb.ObjectId.Null;
            Pk0A = Pk0B = acGeo.Point3d.Origin;
            UpdateLabels();
            btnPkA.Enabled = btnPkB.Enabled = btnOk.Enabled = false;
        }

        private void InvertAB()
        {
            (AxisA, AxisB) = (AxisB, AxisA);
            (Pk0A, Pk0B) = (Pk0B, Pk0A);
            (Pk0DistA, Pk0DistB) = (Pk0DistB, Pk0DistA);
            UpdateLabels();
        }

        private static void Highlight(acDb.ObjectId id)
        {
            if (id.IsNull) return;
            var db = acApp.Application.DocumentManager.MdiActiveDocument.Database;
            using var tr = db.TransactionManager.StartTransaction();
            if (tr.GetObject(id, acDb.OpenMode.ForRead, false, true) is acDb.Entity ent) ent.Highlight();
            tr.Commit();
        }
        private static void Unhighlight(acDb.ObjectId id)
        {
            if (id.IsNull) return;
            var db = acApp.Application.DocumentManager.MdiActiveDocument.Database;
            using var tr = db.TransactionManager.StartTransaction();
            if (tr.GetObject(id, acDb.OpenMode.ForRead, false, true) is acDb.Entity ent) ent.Unhighlight();
            tr.Commit();
        }
        private void AutoDetectSwap()
        {
            // Solo validamos si es doble calzada y ya tenemos ambos puntos
            if (!_esDoble) return;
            if (Pk0A == acGeo.Point3d.Origin || Pk0B == acGeo.Point3d.Origin) return;

            bool sugerir = false;
            string msg = "";

            // Caso: Oriente-Occidente (Vías Verticales, separadas en X)
            // A = Oriental (Debe tener Mayor X)
            // B = Occidental (Debe tener Menor X)
            if (_orient == "EO")
            {
                if (Pk0A.X < Pk0B.X)
                {
                    sugerir = true;
                    msg = "La Calzada A (Oriental) está geométricamente al OESTE (Izquierda) de la B.";
                }
            }
            // Caso: Norte-Sur (Vías Horizontales, separadas en Y)
            // A = Norte (Debe tener Mayor Y)
            // B = Sur (Debe tener Menor Y)
            else if (_orient == "NS")
            {
                if (Pk0A.Y < Pk0B.Y)
                {
                    sugerir = true;
                    msg = "La Calzada A (Norte) está geométricamente al SUR (Abajo) de la B.";
                }
            }

            if (sugerir)
            {
                var r = MessageBox.Show(this,
                    $"Inconsistencia Geográfica Detectada:\n{msg}\n\n" +
                    "¿Deseas invertir la asignación (A <-> B) automáticamente?",
                    "Validación SICOE", MessageBoxButtons.YesNo, MessageBoxIcon.Question);

                if (r == DialogResult.Yes) InvertAB();
            }
        }
    }
}