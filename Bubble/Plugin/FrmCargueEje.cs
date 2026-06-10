using System;
using System.Collections.Generic;
using System.Drawing; // Asegura System.Drawing.Color
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using System.Windows.Forms;

// Alias de AutoCAD restaurados
using acApp = Autodesk.AutoCAD.ApplicationServices; // Nota: acApp apunta a Application directamente para simplificar o al namespace
using acDb = Autodesk.AutoCAD.DatabaseServices;
using acEd = Autodesk.AutoCAD.EditorInput;
using acGeo = Autodesk.AutoCAD.Geometry;

// Alias explícito para evitar ambigüedades futuras si vuelves a importar OpenXml
using SysColor = System.Drawing.Color;

namespace SicoePresupuestoNET8
{
    public partial class FrmCargueEje : Form
    {
        public List<AxisContext> Axes { get; private set; } = new List<AxisContext>();
        private static string FilePath => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "SicoeCAD", "axes_v2.json");

        public FrmCargueEje()
        {
            InitializeComponent();
            SetupGrid();
            LoadData();

            btnAgregar.Click += BtnAgregar_Click;
            btnEliminar.Click += BtnEliminar_Click;
            btnCerrar.Click += (s, e) => { SaveData(); this.DialogResult = DialogResult.OK; };

            // Cargar logo si existe en recursos
            // pbLogo.Image = Properties.Resources.SicoeCAD; 
        }

        private void SetupGrid()
        {
            dgvEjes.Columns.Add("Eje", "Eje");
            dgvEjes.Columns.Add("NombreB", "Nombre B");
            dgvEjes.Columns.Add("Tipo", "Tipo");
            dgvEjes.Columns.Add("PK0", "Info sector");
        }

        private void RefreshGrid()
        {
            dgvEjes.Rows.Clear();
            for (int i = 0; i < Axes.Count; i++)
            {
                var ax = Axes[i];
                string tipo = ax.IsDouble ? "Doble" : "Única";
                string absIni = PkFormatter.ToPkString(ax.AbsInicioA);
                string pkInfo = $"Abs. inicio: {absIni} | Int: {ax.IntervaloPk}m";
                dgvEjes.Rows.Add($"Eje {i + 1}", ax.NombreB, tipo, pkInfo);
            }

            // Feedback Visual (Observación 4)
            if (Axes.Count > 0)
            {
                // Opción A: Cambiar texto de un label si existe
                // lblEstado.Text = "Ejes cargados correctamente"; 
                // lblEstado.ForeColor = Color.ForestGreen;

                // Opción B: Cambiar título ventana (seguro)
                this.Text = $"Gestión de Ejes - {Axes.Count} Cargados (OK)";
            }
            else
            {
                this.Text = "Gestión de Ejes - Sin datos";
            }
        }

        // --- REEMPLAZAR BtnAgregar_Click CON ESTO ---
        private void BtnAgregar_Click(object sender, EventArgs e)
        {
            // 1. Usar el nuevo formulario diseñado
            using var frmConfig = new FrmConfigEje();
            if (frmConfig.ShowDialog(this) != DialogResult.OK) return;

            // Capturar datos en variables locales
            bool esDoble = frmConfig.IsDouble;
            string orient = frmConfig.Orientation;
            double intervalo = frmConfig.Interval;

            // Capturar las ordenadas y abscisas iniciales definidas por el usuario
            double absInicioA = frmConfig.AbsInicioA;
            double absInicioB = frmConfig.AbsInicioB;
            double oizqA = frmConfig.OrdIzqA;
            double oderA = frmConfig.OrdDerA;
            double oizqB = frmConfig.OrdIzqB;
            double oderB = frmConfig.OrdDerB;

            // 2. Definir nombres: sector secuencial + calzada si es doble
            int numEje = Axes.Count + 1;
            string nomA = $"Eje {numEje}";
            string nomB = "";

            if (esDoble)
            {
                if (orient == "EO")
                {
                    nomA = $"Eje {numEje} - Oriental";
                    nomB = "Occidental";
                }
                else
                {
                    nomA = $"Eje {numEje} - Norte";
                    nomB = "Sur";
                }
            }

            // 3. Lanzar Asistente de Selección
            using var wiz = new FrmPickAxes(esDoble, orient, nomA, nomB);

            if (wiz.ShowDialog(this) == DialogResult.OK)
            {
                // Crear objeto con los datos recolectados
                var ax = new AxisContext
                {
                    IsDouble = esDoble,
                    Orientacion = orient,
                    AxisA = wiz.AxisA,
                    AxisB = wiz.AxisB,
                    Pk0A = wiz.Pk0A,
                    Pk0B = wiz.Pk0B,
                    Pk0DistA = wiz.Pk0DistA,
                    Pk0DistB = wiz.Pk0DistB,
                    NombreA = wiz.NombreA,
                    NombreB = wiz.NombreB,
                    IntervaloPk = intervalo,

                    // Asignar las ordenadas configuradas por el usuario
                    OrdIzq_A = oizqA,
                    OrdDer_A = oderA,
                    OrdIzq_B = oizqB,
                    OrdDer_B = oderB,
                    AbsInicioA = absInicioA,
                    AbsInicioB = absInicioB
                };

                var doc = acApp.Application.DocumentManager.MdiActiveDocument;
                if (doc != null)
                {
                    using var tr = doc.Database.TransactionManager.StartTransaction();
                    if (tr.GetObject(ax.AxisA, acDb.OpenMode.ForRead) is acDb.Curve crvA)
                        AxisMath.RefreshChainageDirection(ax, crvA);
                    tr.Commit();
                }

                Axes.Add(ax);
                RefreshGrid();
                SaveData();
                UpdateAxesCountDisplay();
            }
        }

        private void BtnEliminar_Click(object sender, EventArgs e)
        {
            if (dgvEjes.SelectedRows.Count > 0)
            {
                int idx = dgvEjes.SelectedRows[0].Index;
                Axes.RemoveAt(idx);
                RefreshGrid();
                SaveData();
            }
        }

        private void SaveData()
        {
            try
            {
                // 1. Pasar datos de objetos a texto/números antes de guardar
                foreach (var ax in Axes)
                {
                    if (ax.AxisA != acDb.ObjectId.Null) ax.HandleA = ax.AxisA.Handle.ToString();
                    if (ax.AxisB != acDb.ObjectId.Null) ax.HandleB = ax.AxisB.Handle.ToString();

                    ax.XA = ax.Pk0A.X; ax.YA = ax.Pk0A.Y; ax.ZA = ax.Pk0A.Z;
                    ax.XB = ax.Pk0B.X; ax.YB = ax.Pk0B.Y; ax.ZB = ax.Pk0B.Z;
                }

                // 2. Guardar
                var dir = Path.GetDirectoryName(FilePath);
                if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);

                string json = JsonConvert.SerializeObject(Axes, Newtonsoft.Json.Formatting.Indented);
                File.WriteAllText(FilePath, json);
            }
            catch (Exception ex) { MessageBox.Show("Error guardando ejes: " + ex.Message); }
        }

        private void LoadData()
        {
            try
            {
                if (!File.Exists(FilePath)) return;
                var json = File.ReadAllText(FilePath);
                var loaded = JsonConvert.DeserializeObject<List<AxisContext>>(json);

                if (loaded != null)
                {
                    Axes = loaded;

                    // 3. Reconstruir objetos AutoCAD al cargar
                    var doc = acApp.Application.DocumentManager.MdiActiveDocument; // Usando alias acApp definido arriba
                    if (doc != null)
                    {
                        var db = doc.Database;
                        using (var tr = db.TransactionManager.StartTransaction())
                        {
                            foreach (var ax in Axes)
                            {
                                ax.AxisA = ResolveObjectId(db, ax.HandleA);
                                ax.AxisB = ResolveObjectId(db, ax.HandleB);
                                ax.Pk0A = new acGeo.Point3d(ax.XA, ax.YA, ax.ZA);
                                ax.Pk0B = new acGeo.Point3d(ax.XB, ax.YB, ax.ZB);

                                if (tr.GetObject(ax.AxisA, acDb.OpenMode.ForRead) is acDb.Curve crvA)
                                    AxisMath.RefreshChainageDirection(ax, crvA);
                            }
                            tr.Commit();
                        }
                    }
                }
                RefreshGrid();
                UpdateAxesCountDisplay();
            }
            catch { /* Ignorar errores de carga inicial */ }
        }

        // Helper necesario
        private acDb.ObjectId ResolveObjectId(acDb.Database db, string handleStr)
        {
            if (string.IsNullOrWhiteSpace(handleStr)) return acDb.ObjectId.Null;
            try
            {
                long ln = Convert.ToInt64(handleStr, 16);
                return db.GetObjectId(false, new acDb.Handle(ln), 0);
            }
            catch { return acDb.ObjectId.Null; }
        }

        // Asegúrate de tener el método UpdateAxesCountDisplay (si no lo tienes, agrégalo)
        private void UpdateAxesCountDisplay()
        {
            if (Axes.Count > 0)
            {
                // Si tienes lblEstado definido en el designer:
                if (this.Controls.Find("lblEstado", true).FirstOrDefault() is Label lbl)
                {
                    lbl.Text = $"{Axes.Count} Eje(s) Cargados";
                    lbl.ForeColor = Color.ForestGreen;
                }
            }
        }

    }
}