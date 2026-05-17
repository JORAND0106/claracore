using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.Colors;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Windows.Forms;
// using static System.Runtime.InteropServices.JavaScript.JSType; // no disponible en net48
using acApp = Autodesk.AutoCAD.ApplicationServices.Application;

namespace SicoePresupuestoNET8
{
    internal partial class FrmUnirPuntos : Form
    {
        private readonly Document _doc;
        private readonly List<int> _nodos = new();
        // Lote de entidades acumuladas (cada entidad es una secuencia de NODOS)
        // Lote de entidades acumuladas (cada entidad = lista de NODOS)
        private readonly List<List<int>> _entidades = new();

        // Recursos para el preview
        private readonly System.Drawing.Pen _penGuardadas = new System.Drawing.Pen(System.Drawing.Color.LightGray, 2f);
        private readonly System.Drawing.Pen _penActual = new System.Drawing.Pen(System.Drawing.Color.SteelBlue, 2.5f);
        private readonly System.Drawing.Brush _bruPunto = System.Drawing.Brushes.DarkRed;
        private string _previewEtiquetaText = null;
        private Point3d _previewEtiquetaPoint;
        private double _previewEtiquetaAngleRad = 0.0;
        private List<ObjectId> _ultimaInsercionIds = new();   // ← NUEVO
        private FrmInsertarBloque? _dlgIns;
        private bool _dlgInsWired = false; // ← nuevo
                                           // Pega esto en la clase FrmUnirPuntos (puede ser al final de la clase)
        private static bool _etiquetaAbierta = false;
        // Configuración de etiqueta por entidad guardada (paralelo a _entidades)
        private class LabelPlan
        {
            public bool Habilitado;
            public string Texto;
            public double Altura;
            public Point3d Anchor;
            public double AngRad;
            public bool UsaRecuadro;
        }
        private readonly List<List<LabelPlan>> _planesEtiqPorEntidad = new();  // índice = entidad guardada
        // Igual que los rectángulos guardados
        private readonly List<(int c, int r)> _entidadesCir2p = new();
        // Arco 3P (A=pt1, B=pt2, C=pt3)
        private readonly List<(int a, int b, int c)> _entidadesArc3p = new();
        // === Estado entre inserciones ===
        private static int? _ultimoNodoInsertado = null;



        public FrmUnirPuntos() : this(acApp.DocumentManager.MdiActiveDocument) { }

        public FrmUnirPuntos(Document docActual)
        {
            _doc = docActual;
            InitializeComponent();

            // ↓↓↓ NUEVO: autocompletar de capas para txtLayer
            ConfigurarAutoCompletarLayer();
            // Enlazar botón de bloques (nombre del control: Insblock)
            Insblock.Click += Insblock_Click;


            rbArc.CheckedChanged += (_, __) =>
            {
                if (rbArc.Checked)
                {
                    _nodos.Clear();
                    txtPrev.Clear();
                    txtNext.Clear();
                    RefreshSequenceText();
                    DibujarPreview();
                }
            };

            rbRec3p.CheckedChanged += (_, __) =>
            {
                if (rbRec3p.Checked)
                {
                    _nodos.Clear();
                    txtPrev.Clear();
                    txtNext.Clear();
                    RefreshSequenceText();
                    DibujarPreview();
                }
            };
            rbCir2p.CheckedChanged += (_, __) =>
            {
                if (rbCir2p.Checked)
                {
                    _nodos.Clear();
                    txtPrev.Clear();
                    txtNext.Clear();
                    RefreshSequenceText();
                    DibujarPreview();
                }
            };


        }

        // ====== UI ======
        private void TxtNext_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Enter)
            {
                e.SuppressKeyPress = true;
                BtnAgregar_Click(sender, EventArgs.Empty);
            }
        }

        private void BtnAgregar_Click(object sender, EventArgs e)
        {
            // No avisar si está vacío: solo enfocar y salir
            if (string.IsNullOrWhiteSpace(txtNext.Text))
            {
                txtNext.Focus();
                return;
            }
            if (!int.TryParse(txtNext.Text.Trim(), out int nodo) || nodo <= 0)
            {
                MessageBox.Show(this, "Ingresa un número de NODO válido.", "Unir",
                                MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            // --- MODO Arco 3P: máximo 3 nodos ---
            if (rbArc.Checked && _nodos.Count >= 3)
            {
                MessageBox.Show(this, "Arco (3 puntos) solo admite 3 nodos.", "Unir",
                                MessageBoxButtons.OK, MessageBoxIcon.Information);
                txtNext.SelectAll();
                return;
            }
            // Restricción para “Línea”: sólo 2 puntos
            if (rbLinea.Checked && _nodos.Count >= 2)
            {
                MessageBox.Show(this, "Cambie la entidad a Polilínea y continúe (Línea sólo admite 2 puntos).", "Unir", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                txtNext.SelectAll();
                return;
            }
            // --- MODO Rectángulo 3P: máximo 3 nodos ---
            if (rbRec3p.Checked && _nodos.Count >= 3)
            {
                MessageBox.Show(this, "Rectángulo (3 puntos) solo admite 3 nodos.", "Unir", MessageBoxButtons.OK, MessageBoxIcon.Information);
                txtNext.SelectAll();
                return;
            }
            // **Círculo 2P: 2 nodos máx (pre-check)**
            if (rbCir2p.Checked && _nodos.Count >= 2)
            { MessageBox.Show(this, "Círculo (2 puntos) solo admite 2 nodos.", "Unir", MessageBoxButtons.OK, MessageBoxIcon.Information);
                txtNext.SelectAll();
                return;
            }
            
            // 1) Probar agregando el nodo
            _nodos.Add(nodo);

            // 2) Valida auto-intersección de la secuencia ACTUAL (no compara con acumuladas)
            if (_nodos.Count >= 4) // recién puede cruzarse cuando hay al menos 3 tramos
            {
                if (SecuenciaActualTieneCruce(out (int iA, int iB, Point3d P) cruce))
                {
                    // 3) Preguntar al usuario
                    var msg = $"Se detecta cruce entre los tramos [{cruce.iA}-{cruce.iA + 1}] y [{cruce.iB}-{cruce.iB + 1}].\n" +
                              "¿Deseas continuar con esta acción?";
                    var r = MessageBox.Show(this, msg, "Cruce detectado", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);

                    if (r == DialogResult.No)
                    {
                        // 4) Deshacer el último punto si el usuario NO acepta el cruce
                        _nodos.RemoveAt(_nodos.Count - 1);
                        // Actualizar UI y salir
                        RefreshSequenceText();
                        txtPrev.Text = _nodos.Count > 0 ? _nodos[_nodos.Count - 1].ToString() : "";
                        txtNext.SelectAll();
                        DibujarPreview();
                        return;
                    }
                    // Si responde Sí, seguimos con el punto agregado
                }
            }
            // Si es Arco 3P y ya tengo 3 nodos, refrescar y previsualizar
            if (rbArc.Checked && _nodos.Count == 3)
            {
                RefreshSequenceText();
                txtPrev.Text = nodo.ToString();
                txtNext.Clear();
                txtNext.Focus();
                DibujarPreview();
                return;
            }
            // Si es Rectángulo 3P y ya tengo 3 nodos, refrescar preview específico
            if (rbRec3p.Checked && _nodos.Count == 3)
            {
                RefreshSequenceText();
                txtPrev.Text = nodo.ToString();
                txtNext.Clear();
                txtNext.Focus();
                DibujarPreview(); // DibujarPreview calculará el rectángulo con los 3 nodos
                return; // no ejecutes la lógica de cruces propia de polilínea
            }
            // --- CÍRCULO 2P: máximo 2 nodos ---
            if (rbCir2p.Checked && _nodos.Count == 2)
            { RefreshSequenceText();
                txtPrev.Text = nodo.ToString();
                txtNext.Clear();
                txtNext.Focus();
                DibujarPreview();
                return;
            }

            // Flujo normal
            RefreshSequenceText();
            txtPrev.Text = nodo.ToString();
            txtNext.Clear();
            txtNext.Focus();
            DibujarPreview();
            return;
        }
        private void BtnDeshacer_Click(object sender, EventArgs e)
        {
            if (_nodos.Count > 0)
            {
                _nodos.RemoveAt(_nodos.Count - 1);
                txtPrev.Text = _nodos.Count > 0 ? _nodos[_nodos.Count - 1].ToString() : "";
                ActualizarSecuenciaText();
                DibujarPreview();
            }
        }
        // --- Rectángulo 3 puntos ---
        private readonly List<(int a, int b, int c)> _entidadesRect3p = new(); // entidades guardadas tipo rectángulo

        private void RefreshSequenceText()
        {
            if (_nodos.Count == 0) { txtSecuencia.Clear(); return; }

            var sb = new StringBuilder();
            sb.Append("Secuencia:\r\n");

            const int porLinea = 8; // salto cada 8 nodos
            for (int i = 0; i < _nodos.Count; i++)
            {
                sb.Append(_nodos[i]);
                if (i < _nodos.Count - 1) sb.Append("  →  ");

                if ((i + 1) % porLinea == 0 && i < _nodos.Count - 1)
                    sb.AppendLine();
            }

            txtSecuencia.Text = sb.ToString();
        }

        // ====== Dibujar ======
        private void BtnGuardarEntidad_Click(object sender, EventArgs e)
        {
            if (_nodos == null || _nodos.Count < 2)
            {
                MessageBox.Show(this, "Agrega al menos dos NODOS antes de guardar la entidad.", "Unir", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            // --- Guardar entidad: Arco 3P ---
            if (rbArc.Checked)
            {
                if (_nodos.Count != 3)
                {
                    MessageBox.Show(this, "Debes digitar exactamente 3 NODOS para el arco.",
                                    "Unir", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                _entidadesArc3p.Add((_nodos[0], _nodos[1], _nodos[2]));

                _nodos.Clear(); txtPrev.Text = ""; txtNext.Text = "";
                txtNext.Focus();
                RefreshSequenceText();
                lblEntidades.Text = $"Entidades: {_entidades.Count + _entidadesRect3p.Count + _entidadesCir2p.Count + _entidadesArc3p.Count}";
                _previewEtiquetaText = null;
                DibujarPreview();
                return; // no sigas con línea/polilínea
            }

            // --- Guardar entidad: Círculo 2P ---
            if (rbCir2p.Checked)
            {
                if (_nodos.Count != 2)
                {
                    MessageBox.Show(this, "Debes digitar exactamente 2 NODOS (centro y punto sobre el radio).",
                                    "Unir", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                _entidadesCir2p.Add((_nodos[0], _nodos[1]));

                // limpieza y UI
                _nodos.Clear(); txtPrev.Text = ""; txtNext.Text = "";
                txtNext.Focus();
                RefreshSequenceText();
                lblEntidades.Text = $"Entidades: {_entidades.Count + _entidadesRect3p.Count + _entidadesCir2p.Count}";
                _previewEtiquetaText = null;
                DibujarPreview();
                return; // no sigas con la lógica de líneas/polilíneas
            }

            // --- Guardar entidad: Rectángulo 3P ---
            if (rbRec3p.Checked)
            {
                if (_nodos.Count != 3)
                {
                    MessageBox.Show(this, "Debes digitar exactamente 3 NODOS para el rectángulo.", "Unir", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                _entidadesRect3p.Add((_nodos[0], _nodos[1], _nodos[2]));

                // limpieza y UI
                _nodos.Clear(); txtPrev.Text = ""; txtNext.Text = "";
                RefreshSequenceText();
                lblEntidades.Text = $"Entidades: {_entidades.Count + _entidadesRect3p.Count}";
                _previewEtiquetaText = null;
                DibujarPreview();
                return; // no sigas con el flujo de línea/polilínea
            }

            // 1) Tomar copia de la entidad actual
            var entidad = new List<int>(_nodos);

            // 2) Preguntar etiquetado según el modo
            bool esLinea = rbLinea.Checked;
            bool esPline = rbPline.Checked;

            // calcular puntos
            var pts = new List<Point3d>();
            using (_doc.LockDocument())
            using (var tr = _doc.Database.TransactionManager.StartTransaction())
            {
                foreach (var n in entidad)
                    if (TryGetPointByNode(_doc.Database, tr, n, out var p)) pts.Add(p);
                tr.Commit();
            }

            LabelPlan plan = new LabelPlan { Habilitado = false };

            if (pts.Count >= 2 && (esLinea || esPline))
            {
                // === SI NO SE VA A CORTAR: flujo normal de etiquetado ===
                if (!chkCortarNodos.Checked)
                {
                    var r = MessageBox.Show(this, "¿Esta entidad requiere etiquetarse?", "Etiquetar",
                                            MessageBoxButtons.YesNo, MessageBoxIcon.Question);
                    if (r == DialogResult.Yes)
                    {
                        double L = 0;
                        for (int i = 0; i < pts.Count - 1; i++) L += HorizontalDistance(pts[i], pts[i + 1]);
                        bool closed = esPline && chkCerrar.Checked && pts.Count >= 3;
                        if (closed) L += HorizontalDistance(pts[pts.Count - 1], pts[0]);

                        Point3d mid; double ang, lSeg;
                        if (esLinea)
                        {
                            mid = new Point3d((pts[0].X + pts[1].X) / 2.0, (pts[0].Y + pts[1].Y) / 2.0, 0);
                            ang = Math.Atan2(pts[1].Y - pts[0].Y, pts[1].X - pts[0].X);
                            lSeg = L;
                        }
                        else
                        {
                            (mid, ang) = GetAnchorOnLongestSegment(pts, closed, out lSeg);
                        }

                        string rumbo = CalcularRumbo(pts[0], pts[1]);

                        // Muestra también Lu (igual a Lt cuando no se corta)
                        using var dlgEtiqueta = new FrmEtiquetaLinea(L, rumbo, L);

                        dlgEtiqueta.TopMost = true;
                        dlgEtiqueta.ShowInTaskbar = false;
                        dlgEtiqueta.StartPosition = FormStartPosition.CenterScreen;
                        dlgEtiqueta.BringToFront();
                        dlgEtiqueta.Activate();

                        string textoEtiqueta = null;

                        if (dlgEtiqueta.ShowDialog(this) == DialogResult.OK)



                        {
                            textoEtiqueta = dlgEtiqueta.BuildEtiquetaText();

                            string prefIni = (dlgEtiqueta.PrefIniText ?? "").Trim().ToUpperInvariant();
                            string prefFin = (dlgEtiqueta.PrefFinText ?? "").Trim().ToUpperInvariant();
                            string numIni = (dlgEtiqueta.NodoIniText ?? "").Trim().ToUpperInvariant();
                            string numFin = (dlgEtiqueta.NodoFinText ?? "").Trim().ToUpperInvariant();

                            string nodoIniFull = string.IsNullOrWhiteSpace(numIni) ? "" : $"{prefIni}-{numIni}";
                            string nodoFinFull = string.IsNullOrWhiteSpace(numFin) ? "" : $"{prefFin}-{numFin}";

                            bool hayBautizo = !string.IsNullOrWhiteSpace(nodoIniFull) || !string.IsNullOrWhiteSpace(nodoFinFull);

                            var pA = pts[0];
                            var pB = (rbPline.Checked && chkCerrar.Checked && pts.Count >= 3) ? pts[0] : pts[pts.Count - 1];
                            double angAB = Math.Atan2(pB.Y - pA.Y, pB.X - pA.X);

                            string capaSalida =
                                !string.IsNullOrWhiteSpace(dlgEtiqueta.LayerDestino) ? dlgEtiqueta.LayerDestino :
                                !string.IsNullOrWhiteSpace(txtLayer.Text) ? txtLayer.Text.Trim() : "0";

                            double hTxt = dlgEtiqueta.AlturaTexto > 0 ? dlgEtiqueta.AlturaTexto : 0.15;

                            if (hayBautizo)
                            {
                                var db = Autodesk.AutoCAD.ApplicationServices.Application.DocumentManager.MdiActiveDocument.Database;
                                using (var trN = db.TransactionManager.StartTransaction())
                                {
                                    EnsureLayer(db, trN, capaSalida, null);

                                    var btrN = (Autodesk.AutoCAD.DatabaseServices.BlockTableRecord)
                                               trN.GetObject(db.CurrentSpaceId, Autodesk.AutoCAD.DatabaseServices.OpenMode.ForWrite);

                                    void PonerTexto(string cont, Point3d pos)
                                    {
                                        var t = new DBText
                                        {
                                            TextString = cont,
                                            Height = hTxt,
                                            Layer = capaSalida,
                                            Rotation = angAB,
                                            HorizontalMode = TextHorizontalMode.TextCenter,
                                            VerticalMode = TextVerticalMode.TextVerticalMid,
                                            AlignmentPoint = pos,
                                            Position = pos
                                        };
                                        btrN.AppendEntity(t);
                                        trN.AddNewlyCreatedDBObject(t, true);
                                        t.AdjustAlignment(db);
                                    }

                                    if (!string.IsNullOrWhiteSpace(nodoIniFull)) PonerTexto(nodoIniFull, pA);
                                    if (!string.IsNullOrWhiteSpace(nodoFinFull)) PonerTexto(nodoFinFull, pB);

                                    trN.Commit();
                                }
                            }
                        }
                    }
                }

                // === SI SE VA A CORTAR: bautizo y etiqueta por tramo ===
                else
                {
                    var ptsTramos = new List<Point3d>();

                    using (_doc.LockDocument())
                    using (var tr = _doc.Database.TransactionManager.StartTransaction())
                    {
                        foreach (var n in entidad)
                            if (TryGetPointByNode(_doc.Database, tr, n, out var p))
                                ptsTramos.Add(p);

                        List<LabelPlan> planesCorte = null;   // <-- agrega esta línea
                        if (ptsTramos.Count >= 2)
                        {
                            planesCorte = new List<LabelPlan>();


                            for (int i = 0; i < ptsTramos.Count - 1; i++)
                            {
                                var pA = ptsTramos[i];
                                var pB = ptsTramos[i + 1];
                                double angTramo = Math.Atan2(pB.Y - pA.Y, pB.X - pA.X);
                                double ltSeg = HorizontalDistance(pA, pB);
                                string rumbo = CalcularRumbo(pA, pB);

                                // puntos recortados para Lu
                                Point3d pAOut = GetTrimmedPoint(_doc.Database, tr, pA, pB);
                                Point3d pBIn = GetTrimmedPoint(_doc.Database, tr, pB, pA);
                                double luSeg = HorizontalDistance(pAOut, pBIn);


                                using var dlgTramo = new FrmEtiquetaLinea(ltSeg, rumbo, luSeg) { Text = $"Etiqueta del tramo {i + 1}" };
                                dlgTramo.TopMost = true;
                                dlgTramo.StartPosition = FormStartPosition.CenterScreen;
                                dlgTramo.BringToFront();
                                dlgTramo.Activate();

                                if (dlgTramo.ShowDialog(this) == DialogResult.OK)


                                {
                                    string texto = dlgTramo.BuildEtiquetaText();
                                    double h = dlgTramo.AlturaTexto > 0 ? dlgTramo.AlturaTexto : 0.15;
                                    double estimAncho = texto.Length * 0.6 * h;
                                    bool usaRecuadro = estimAncho > ltSeg * 0.9;

                                    double nx = -Math.Sin(angTramo), ny = Math.Cos(angTramo);
                                    var mid = new Point3d((pA.X + pB.X) / 2, (pA.Y + pB.Y) / 2, 0);
                                    var arriba = new Point3d(mid.X + nx * h, mid.Y + ny * h, 0);

                                    string prefIni = (dlgTramo.PrefIniText ?? "").Trim().ToUpperInvariant();
                                    string prefFin = (dlgTramo.PrefFinText ?? "").Trim().ToUpperInvariant();
                                    string numIni = (dlgTramo.NodoIniText ?? "").Trim().ToUpperInvariant();
                                    string numFin = (dlgTramo.NodoFinText ?? "").Trim().ToUpperInvariant();

                                    string nodoIniFull = string.IsNullOrWhiteSpace(numIni) ? "" : $"{prefIni}-{numIni}";
                                    string nodoFinFull = string.IsNullOrWhiteSpace(numFin) ? "" : $"{prefFin}-{numFin}";
                                    bool hayBautizo = !string.IsNullOrWhiteSpace(nodoIniFull) || !string.IsNullOrWhiteSpace(nodoFinFull);

                                    string capaSalida =
                                        !string.IsNullOrWhiteSpace(dlgTramo.LayerDestino) ? dlgTramo.LayerDestino :
                                        !string.IsNullOrWhiteSpace(txtLayer.Text) ? txtLayer.Text.Trim() : "0";

                                    if (hayBautizo)
                                    {
                                        // Capturas locales
                                        double angLocal = angTramo;
                                        Point3d pALocal = pA, pBLocal = pB;
                                        string capaLocal = capaSalida, nodoIniLocal = nodoIniFull, nodoFinLocal = nodoFinFull;
                                        double hLocal = h;

                                        EventHandler handler = null;
                                        handler = (s, e) =>
                                        {
                                            Autodesk.AutoCAD.ApplicationServices.Application.Idle -= handler; // EVITA BUCLE

                                            var db = Autodesk.AutoCAD.ApplicationServices.Application.DocumentManager.MdiActiveDocument.Database;
                                            using (var trN = db.TransactionManager.StartTransaction())
                                            {
                                                EnsureLayer(db, trN, capaLocal, null);
                                                var btrN = (BlockTableRecord)trN.GetObject(db.CurrentSpaceId, OpenMode.ForWrite);

                                                if (!string.IsNullOrWhiteSpace(nodoIniLocal))
                                                {
                                                    var t = new DBText
                                                    {
                                                        TextString = nodoIniLocal,   // en el segundo bloque usa nodoFinLocal
                                                        Height = hLocal,
                                                        Layer = capaLocal,
                                                        Rotation = angLocal
                                                    };
                                                    t.HorizontalMode = TextHorizontalMode.TextCenter;
                                                    t.VerticalMode = TextVerticalMode.TextVerticalMid;
                                                    t.AlignmentPoint = pALocal;      // en el segundo bloque usa pBLocal
                                                    t.Position = t.AlignmentPoint;

                                                    btrN.AppendEntity(t);
                                                    trN.AddNewlyCreatedDBObject(t, true);
                                                    t.AdjustAlignment(db);

                                                }

                                                if (!string.IsNullOrWhiteSpace(nodoFinLocal))
                                                {
                                                    var t2 = new DBText
                                                    {
                                                        TextString = nodoFinLocal,
                                                        Height = hLocal,
                                                        Layer = capaLocal,
                                                        Rotation = angLocal
                                                    };
                                                    t2.HorizontalMode = TextHorizontalMode.TextCenter;
                                                    t2.VerticalMode = TextVerticalMode.TextVerticalMid;
                                                    t2.AlignmentPoint = pBLocal;      // punto del nodo FIN
                                                    t2.Position = t2.AlignmentPoint;

                                                    btrN.AppendEntity(t2);
                                                    trN.AddNewlyCreatedDBObject(t2, true);
                                                    t2.AdjustAlignment(db);
                                                }


                                                trN.Commit();
                                            }
                                        };

                                        Autodesk.AutoCAD.ApplicationServices.Application.Idle += handler;
                                    }

                                    planesCorte.Add(new LabelPlan
                                    {
                                        Habilitado = true,
                                        Texto = texto,
                                        Altura = h,
                                        Anchor = arriba,
                                        AngRad = angTramo,
                                        UsaRecuadro = usaRecuadro
                                    });
                                }
                                else
                                {
                                    planesCorte.Add(new LabelPlan { Habilitado = false });
                                }
                            }

                            _planesEtiqPorEntidad.Add(planesCorte);
                        }

                        tr.Commit();
                        // --- limpiar UI y SALIR cuando "Cortar Nodos" está activo ---
                        _entidades.Add(entidad);
                        _nodos.Clear();
                        txtPrev.Text = "";
                        txtNext.Text = "";
                        txtNext.Focus();
                        RefreshSequenceText();
                        lblEntidades.Text = $"Entidades: {_entidades.Count + _entidadesRect3p.Count}";
                        _previewEtiquetaText = null;
                        DibujarPreview();
                        return; // evita ejecutar el bloque "3) Guardar..." de más abajo

                    }
                }
            }

            // 3) Guardar entidad + plan y limpiar secuencia actual
            _entidades.Add(entidad);
            var planesDeEstaEntidad = new List<LabelPlan>();

            bool cortarAhora = chkCortarNodos.Checked;
            if (!cortarAhora)
            {
                // El flujo anterior (1 solo plan)
                planesDeEstaEntidad.Add(plan);   // puede venir Habilitado=false si no quisiste etiquetar
            }
            else
            {
                // -- NUEVO: pedir etiqueta por CADA tramo al guardar --
                // 1) recolectar puntos WCS de la secuencia
                var ptsTramos = new List<Point3d>();

                // UNA SOLA TRANSACCIÓN para todo el proceso
                using (_doc.LockDocument())
                using (var tr = _doc.Database.TransactionManager.StartTransaction())
                {
                    // Recolectar todos los puntos
                    foreach (var n in entidad)
                    {
                        if (TryGetPointByNode(_doc.Database, tr, n, out var p))
                            ptsTramos.Add(p);
                    }

                    if (ptsTramos.Count >= 2)
                    {
                        Point3d lastAOut = Point3d.Origin, lastBIn = Point3d.Origin, lastB = Point3d.Origin;
                        var angIn = new double[ptsTramos.Count];
                        var angOut = new double[ptsTramos.Count];
                        var hasIn = new bool[ptsTramos.Count];
                        var hasOut = new bool[ptsTramos.Count];

                        const double OFFSET_PERP = 0.0; // ó Math.PI/2 si tu bloque va transversal

                        for (int i = 0; i < ptsTramos.Count - 1; i++)
                        {
                            var pA = ptsTramos[i];
                            var pB = ptsTramos[i + 1];

                            // Calcular puntos de corte (dentro de la misma transacción)
                            Point3d pAOut = GetTrimmedPoint(_doc.Database, tr, pA, pB);
                            Point3d pBIn = GetTrimmedPoint(_doc.Database, tr, pB, pA);

                            // Lu = distancia útil entre ejes recortados
                            double luSeg = HorizontalDistance(pAOut, pBIn);
                            if (luSeg <= 1e-6) continue;

                            // Lt = distancia total entre nodos originales
                            double ltSeg = HorizontalDistance(pA, pB);

                            // ancla y orientación
                            var mid = new Point3d((pAOut.X + pBIn.X) * 0.5, (pAOut.Y + pBIn.Y) * 0.5, 0);
                            double ang = Math.Atan2(pBIn.Y - pAOut.Y, pBIn.X - pAOut.X);

                            // rumbo para el tramo
                            string rumbo = CalcularRumbo(pAOut, pBIn);

                            // diálogo con Lt y Lu
                            int nodoA = entidad[i], nodoB = entidad[i + 1];
                            using var dlg = new FrmEtiquetaLinea(ltSeg, rumbo, luSeg) { Text = $"Etiqueta del tramo {nodoA} - {nodoB}" };

                            if (dlg.ShowDialog(this) == DialogResult.OK)
                            {
                                string texto = dlg.BuildEtiquetaText();
                                double h = dlg.AlturaTexto;
                                double estimAncho = texto.Length * 0.6 * h;

                                const double OFF_FACT = 1.6;
                                double nx = -Math.Sin(ang), ny = Math.Cos(ang);
                                var arriba = new Point3d(mid.X + nx * h * OFF_FACT, mid.Y + ny * h * OFF_FACT, 0);


                                // comparar contra la longitud útil del tramo (no contra una variable inexistente)
                                bool usaRecuadro = estimAncho > luSeg * 0.9;

                                planesDeEstaEntidad.Add(new LabelPlan
                                {
                                    Habilitado = true,
                                    Texto = texto,
                                    Altura = h,
                                    Anchor = arriba,
                                    AngRad = ang,
                                    UsaRecuadro = usaRecuadro
                                });
                            }
                            else
                            {
                                planesDeEstaEntidad.Add(new LabelPlan { Habilitado = false });
                            }



                            // orientar el bloque CSV del ÚLTIMO nodo con el rumbo del último tramo
                            if (!lastAOut.Equals(Point3d.Origin) && !lastBIn.Equals(Point3d.Origin))
                        {
                            double angLast = Math.Atan2(lastBIn.Y - lastAOut.Y, lastBIn.X - lastAOut.X);

                        }
                        for (int k = 0; k < ptsTramos.Count; k++)
                        {
                            double rot;
                            if (hasIn[k] && hasOut[k]) rot = Bisector(angIn[k], angOut[k]);  // vértice interior
                            else if (hasOut[k]) rot = angOut[k];                     // primer nodo
                            else rot = angIn[k];                      // último nodo


                        }

                    }
                    tr.Commit(); // Confirmar todos los cambios al final
                } // Aquí se cierra la transacción y el lock del documento
            }

                // guarda todos los planes de esta entidad
                _planesEtiqPorEntidad.Add(planesDeEstaEntidad ?? new List<LabelPlan>());


                // Limpieza de UI
                // limpieza y UI
                _nodos.Clear();
                txtPrev.Text = "";
                txtNext.Text = "";
                txtNext.Focus();            // <-- enfoca para empezar el siguiente
                RefreshSequenceText();
                lblEntidades.Text = $"Entidades: {_entidades.Count + _entidadesRect3p.Count}";
                _previewEtiquetaText = null;
                DibujarPreview();
                return;
        }
    }
        private void BtnDibujar_Click(object sender, EventArgs e)
        {
            try
            {
                // Rectángulos guardados: cada tupla (a,b,c) se dibuja como polilínea cerrada 4 vértices
                var rects = new List<(Point3d A, Point3d B, Point3d C, Point3d D)>();
                var lotes = (_entidades.Count > 0) ? _entidades : new List<List<int>> { new List<int>(_nodos) };
                // Si dibujo lo acumulado, ya tengo planes de etiqueta (_planesEtiq)
                bool usandoGuardadas = (_entidades.Count > 0);

                if (lotes.Count == 0 || lotes.All(l => l.Count < 2))
                {
                    MessageBox.Show(this, "No hay entidades para dibujar.", "Unir", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                bool modoLinea = rbLinea.Checked;
                bool modoPline = rbPline.Checked;
                bool modoPline3d = rbPline3d.Checked;
                bool modoRec3p = rbRec3p.Checked;   // <-- NUEVO
                bool cerrar = chkCerrar.Checked;
                bool cerrarPl = chkCerrar.Checked;
                bool cortar = chkCortarNodos.Checked;

                string outLayer = (txtLayer.Text ?? "").Trim();

                if (string.IsNullOrWhiteSpace(txtLayer.Text))
                {
                    MessageBox.Show(this, "Indica la capa de salida.", "Unir");
                    return;
                }


                string cap = cbCapitulo.SelectedItem?.ToString() ?? "";
                string com = cbCompetencia.SelectedItem?.ToString() ?? "";

                using (_doc.LockDocument())
                using (var tr = _doc.Database.TransactionManager.StartTransaction())
                {
                    EnsureLayer(_doc.Database, tr, outLayer, null);
                    var btr = (BlockTableRecord)tr.GetObject(_doc.Database.CurrentSpaceId, OpenMode.ForWrite);

                    int idxEntidad = 0;
                    // Dibujar los ARCOS 3P guardados
                    foreach (var t in _entidadesArc3p)
                    {
                        if (TryGetPointByNode(_doc.Database, tr, t.a, out var p1) &&
                            TryGetPointByNode(_doc.Database, tr, t.b, out var p2) &&
                            TryGetPointByNode(_doc.Database, tr, t.c, out var p3))
                        {
                            var arc = BuildArcFrom3Points(p1, p2, p3, out bool ok);
                            if (ok)
                            {
                                arc.Layer = outLayer;
                                btr.AppendEntity(arc);
                                tr.AddNewlyCreatedDBObject(arc, true);
                                AttachMetadata(arc, tr, cap, com);
                            }
                        }
                    }

                    // Resolver los rectángulos guardados a coordenadas
                    foreach (var t in _entidadesRect3p)
                    {
                        if (TryGetPointByNode(_doc.Database, tr, t.a, out var p1) &&
                            TryGetPointByNode(_doc.Database, tr, t.b, out var p2) &&
                            TryGetPointByNode(_doc.Database, tr, t.c, out var p3))
                        {
                            var (A, B, C, D) = BuildRectFrom3Points(p1, p2, p3);
                            rects.Add((A, B, C, D));
                        }
                    }
                    if (rbArc.Checked && _entidades.Count == 0 && _nodos.Count == 3)
                    {
                        if (TryGetPointByNode(_doc.Database, tr, _nodos[0], out var p1) &&
                            TryGetPointByNode(_doc.Database, tr, _nodos[1], out var p2) &&
                            TryGetPointByNode(_doc.Database, tr, _nodos[2], out var p3))
                        {
                            var arc = BuildArcFrom3Points(p1, p2, p3, out bool ok);
                            if (ok)
                            {
                                arc.Layer = outLayer;
                                btr.AppendEntity(arc);
                                tr.AddNewlyCreatedDBObject(arc, true);
                                AttachMetadata(arc, tr, cap, com);
                            }
                        }
                    }

                    // Dibujar los CÍRCULOS 2P guardados
                    foreach (var t in _entidadesCir2p)
                    {
                        if (TryGetPointByNode(_doc.Database, tr, t.c, out var c) &&
                            TryGetPointByNode(_doc.Database, tr, t.r, out var p))
                        {
                            double r = Math.Sqrt((p.X - c.X) * (p.X - c.X) + (p.Y - c.Y) * (p.Y - c.Y));
                            var circle = new Circle(new Point3d(c.X, c.Y, 0), Vector3d.ZAxis, r) { Layer = outLayer };
                            btr.AppendEntity(circle);
                            tr.AddNewlyCreatedDBObject(circle, true);
                            AttachMetadata(circle, tr, cap, com);
                        }
                    }
                    if (rbCir2p.Checked && _entidades.Count == 0 && _nodos.Count == 2)
                    {
                        if (TryGetPointByNode(_doc.Database, tr, _nodos[0], out var c) &&
                            TryGetPointByNode(_doc.Database, tr, _nodos[1], out var p))
                        {
                            double r = Math.Sqrt((p.X - c.X) * (p.X - c.X) + (p.Y - c.Y) * (p.Y - c.Y));
                            var circle = new Circle(new Point3d(c.X, c.Y, 0), Vector3d.ZAxis, r) { Layer = outLayer };
                            btr.AppendEntity(circle);
                            tr.AddNewlyCreatedDBObject(circle, true);
                            AttachMetadata(circle, tr, cap, com);
                        }
                    }

                    foreach (var sec in lotes)
                    {
                        // planes de etiqueta guardados para ESTA entidad (pueden ser 1 o "por tramo")
                        var planesDeEsta =
                            (usandoGuardadas && idxEntidad < _planesEtiqPorEntidad.Count)
                                ? _planesEtiqPorEntidad[idxEntidad]
                                : new List<LabelPlan>(); // nunca null

                        LabelPlan planUnico = (planesDeEsta.Count > 0) ? planesDeEsta[0] : null;


                        // Obtener puntos/blocks del NODO:
                        var pts = new List<Point3d>();
                        var brsNodo = new List<BlockReference>();
                        foreach (int n in sec)
                        {
                            if (!TryGetPointByNode(_doc.Database, tr, n, out var p) ||
                                !TryGetBlockByNode(_doc.Database, tr, n, out var brN))
                            {
                                MessageBox.Show(this, $"NODO {n} no encontrado. Se omite la entidad.", "Unir", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                                pts.Clear();
                                break;
                            }
                            pts.Add(p);
                            brsNodo.Add(brN);
                        }
                        if (pts.Count < 2) continue;

                        // === Dibujo según "cortar" ===
                        if (cortar)
                        {
                            var angIn = new double[pts.Count];
                            var angOut = new double[pts.Count];
                            var hasIn = new bool[pts.Count];
                            var hasOut = new bool[pts.Count];

                            const double OFFSET_PERP = 0.0; // ó Math.PI/2 si tu bloque va transversal

                            for (int i = 0; i < pts.Count - 1; i++)
                            {
                                var pA = pts[i];
                                var pB = pts[i + 1];

                                // Cortes A/B
                                // Cortes A/B usando CSV o NODO
                                Point3d pAOut = GetTrimmedPoint(_doc.Database, tr, pA, pB);
                                Point3d pBIn = GetTrimmedPoint(_doc.Database, tr, pB, pA);



                                // Dibuja el tramo
                                Entity seg = modoPline3d
                                    ? new Line(new Point3d(pAOut.X, pAOut.Y, pA.Z), new Point3d(pBIn.X, pBIn.Y, pB.Z)) { Layer = outLayer }
                                    : new Line(new Point3d(pAOut.X, pAOut.Y, 0), new Point3d(pBIn.X, pBIn.Y, 0)) { Layer = outLayer };
                                btr.AppendEntity(seg);
                                tr.AddNewlyCreatedDBObject(seg, true);
                                AttachMetadata(seg, tr, cap, com);

                                // ===== ETIQUETA POR TRAMO =====
                                double Lseg = HorizontalDistance(pAOut, pBIn);
                                if (Lseg <= 1e-6) continue;

                                var mid = new Point3d((pAOut.X + pBIn.X) / 2.0, (pAOut.Y + pBIn.Y) / 2.0, 0);
                                double ang = Math.Atan2(pBIn.Y - pAOut.Y, pBIn.X - pAOut.X);

                                angOut[i] = ang; hasOut[i] = true;
                                angIn[i + 1] = ang; hasIn[i + 1] = true;

                                // si hay plan guardado para este tramo, úsalo
                                LabelPlan planTramo = (i < planesDeEsta.Count) ? planesDeEsta[i] : null;

                                if (planTramo != null && planTramo.Habilitado)
                                {
                                    // ¿cabe alineado?
                                    double estimAncho = planTramo.Texto.Length * 0.6 * planTramo.Altura;
                                    bool cabe = estimAncho <= Lseg * 0.9;

                                    if (cabe)
                                    {
                                        // texto alineado, subido a la normal
                                        var mt = new MText
                                        {
                                            Contents = planTramo.Texto,   // ya trae \P si es multilínea
                                            TextHeight = planTramo.Altura,
                                            Location = planTramo.Anchor,  // el Anchor ya lo guardamos "arriba"
                                            Rotation = planTramo.AngRad,
                                            Attachment = AttachmentPoint.MiddleCenter,
                                            Layer = outLayer
                                        };
                                        btr.AppendEntity(mt);
                                        tr.AddNewlyCreatedDBObject(mt, true);
                                    }
                                    else
                                    {
                                        // leader corto (sin recuadro)
                                        ColocarLeaderConRecuadro(btr, tr, planTramo.Texto, planTramo.Altura, planTramo.Anchor, planTramo.AngRad, outLayer);
                                    }
                                }
                                else if (!usandoGuardadas) // solo si NO venimos de "Guardar entidad"
                                {
                                    // dibujando "al vuelo": pregunta y etiqueta
                                    // Lu = distancia útil entre ejes recortados (pAOut–pBIn)
                                    double luSeg = HorizontalDistance(pAOut, pBIn);

                                    // Lt = distancia total entre nodos originales (pA–pB)
                                    double ltSeg = HorizontalDistance(pA, pB);

                                    string rumbo = CalcularRumbo(pAOut, pBIn);
                                    using var dlg = new FrmEtiquetaLinea(ltSeg, rumbo, luSeg)
                                    {
                                        Text = $"Etiqueta del tramo {sec[i]} - {sec[i + 1]}"
                                    };

                                    if (dlg.ShowDialog(this) == DialogResult.OK)
                                    {
                                        string texto = dlg.BuildEtiquetaText();
                                        // === ETIQUETAS DE NODOS EN EL EJE (LONGITUD TOTAL) ===
                                        var nodoIniFull = string.IsNullOrWhiteSpace(dlg.NodoIniText) ? "" : $"{dlg.PrefIniText}-{dlg.NodoIniText}";
                                        var nodoFinFull = string.IsNullOrWhiteSpace(dlg.NodoFinText) ? "" : $"{dlg.PrefFinText}-{dlg.NodoFinText}";

                                        if (!string.IsNullOrWhiteSpace(nodoIniFull) || !string.IsNullOrWhiteSpace(nodoFinFull))
                                        {
                                            var db = Autodesk.AutoCAD.ApplicationServices.Application.DocumentManager.MdiActiveDocument.Database;
                                            using (var trN = db.TransactionManager.StartTransaction())
                                            {
                                                string capaSalida = string.IsNullOrWhiteSpace(outLayer) ? "0" : outLayer;
                                                EnsureLayer(db, trN, capaSalida, null);

                                                var btrN = (Autodesk.AutoCAD.DatabaseServices.BlockTableRecord)
                                                           trN.GetObject(db.CurrentSpaceId, Autodesk.AutoCAD.DatabaseServices.OpenMode.ForWrite);

                                                double angAB = Math.Atan2(pB.Y - pA.Y, pB.X - pA.X);
                                                double hTxt = dlg.AlturaTexto; if (hTxt <= 0) hTxt = 0.05;

                                                if (!string.IsNullOrWhiteSpace(nodoIniFull))
                                                {
                                                    var t = new Autodesk.AutoCAD.DatabaseServices.DBText();
                                                    t.SetDatabaseDefaults();
                                                    t.TextString = nodoIniFull;
                                                    t.Height = hTxt;
                                                    t.Layer = capaSalida;
                                                    t.Rotation = angAB;
                                                    t.Position = new Autodesk.AutoCAD.Geometry.Point3d(pA.X, pA.Y, 0);
                                                    t.HorizontalMode = Autodesk.AutoCAD.DatabaseServices.TextHorizontalMode.TextCenter;
                                                    t.VerticalMode = Autodesk.AutoCAD.DatabaseServices.TextVerticalMode.TextVerticalMid;
                                                    t.AlignmentPoint = new Autodesk.AutoCAD.Geometry.Point3d(pA.X, pA.Y, 0);
                                                    btrN.AppendEntity(t);
                                                    trN.AddNewlyCreatedDBObject(t, true);
                                                    t.AdjustAlignment(db);
                                                }

                                                if (!string.IsNullOrWhiteSpace(nodoFinFull))
                                                {
                                                    var t = new Autodesk.AutoCAD.DatabaseServices.DBText();
                                                    t.SetDatabaseDefaults();
                                                    t.TextString = nodoFinFull;
                                                    t.Height = hTxt;
                                                    t.Layer = capaSalida;
                                                    t.Rotation = angAB;
                                                    t.Position = new Autodesk.AutoCAD.Geometry.Point3d(pB.X, pB.Y, 0);
                                                    t.HorizontalMode = Autodesk.AutoCAD.DatabaseServices.TextHorizontalMode.TextCenter;
                                                    t.VerticalMode = Autodesk.AutoCAD.DatabaseServices.TextVerticalMode.TextVerticalMid;
                                                    t.AlignmentPoint = new Autodesk.AutoCAD.Geometry.Point3d(pB.X, pB.Y, 0);
                                                    btrN.AppendEntity(t);
                                                    trN.AddNewlyCreatedDBObject(t, true);
                                                    t.AdjustAlignment(db);
                                                }
                                                trN.Commit();
                                            }
                                        }
                                        double h = dlg.AlturaTexto;
                                        double estimAncho = texto.Length * 0.6 * h;
                                        bool cabe = estimAncho <= Lseg * 0.9;

                                        // subir a la normal
                                        const double OFF_FACT = 1.6;
                                        var nx = -Math.Sin(ang); var ny = Math.Cos(ang);
                                        var arriba = new Point3d(mid.X + nx * h * OFF_FACT, mid.Y + ny * h * OFF_FACT, 0);


                                        if (cabe)
                                        {
                                            var mt = new MText
                                            {
                                                Contents = texto,
                                                TextHeight = h,
                                                Location = arriba,
                                                Rotation = ang,
                                                Attachment = AttachmentPoint.MiddleCenter,
                                                Layer = outLayer
                                            };
                                            btr.AppendEntity(mt);
                                            tr.AddNewlyCreatedDBObject(mt, true);
                                        }
                                        else
                                        {
                                            ColocarLeaderConRecuadro(btr, tr, texto, h, arriba, ang, outLayer);
                                        }

                                        if (dlg.MarcarVertices)
                                        {
                                            string pref = dlg.PrefijoVertices?.Trim() ?? "";
                                            int nn = dlg.NumeradorInicial;
                                            foreach (var p in new[] { pAOut, pBIn })
                                            {
                                                var dbt = new DBText
                                                {
                                                    TextString = pref + (nn++).ToString(),
                                                    Height = dlg.AlturaTexto * 0.75,
                                                    Position = new Point3d(p.X, p.Y, 0),
                                                    Layer = outLayer
                                                };
                                                btr.AppendEntity(dbt);
                                                tr.AddNewlyCreatedDBObject(dbt, true);
                                            }
                                        }

                                    }
                                }
                            // ===== FIN ETIQUETA POR TRAMO =====
                            } // fin for cortar


                        }
                        else
                        {
                            // Comportamiento anterior: 1 sola entidad
                            Entity created;
                            // ANTES de los else-if (Línea / Polilínea / Polilínea3D):
                            if (rbRec3p.Checked)
                            {
                                if (sec.Count < 3) { idxEntidad++; continue; }

                                if (!TryGetPointByNode(_doc.Database, tr, sec[0], out var A) ||
                                    !TryGetPointByNode(_doc.Database, tr, sec[1], out var B) ||
                                    !TryGetPointByNode(_doc.Database, tr, sec[2], out var C))
                                { idxEntidad++; continue; }

                                // Base AB (unidad) y su perpendicular
                                var ux = B.X - A.X; var uy = B.Y - A.Y;
                                var lenAB = Math.Sqrt(ux * ux + uy * uy);
                                if (lenAB < 1e-9) { idxEntidad++; continue; }
                                ux /= lenAB; uy /= lenAB;
                                var vx = -uy; var vy = ux; // +90°

                                // Altura = componente perpendicular de AC
                                var acx = C.X - A.X; var acy = C.Y - A.Y;
                                var h = acx * vx + acy * vy; // offset

                                // Esquinas: A, B, B+h*v, A+h*v  (C solo define h)
                                var A0 = new Point3d(A.X, A.Y, 0);
                                var B0 = new Point3d(B.X, B.Y, 0);
                                var C0 = new Point3d(B.X + vx * h, B.Y + vy * h, 0);
                                var D0 = new Point3d(A.X + vx * h, A.Y + vy * h, 0);

                                var pl = new Polyline();
                                pl.AddVertexAt(0, new Point2d(A0.X, A0.Y), 0, 0, 0);
                                pl.AddVertexAt(1, new Point2d(B0.X, B0.Y), 0, 0, 0);
                                pl.AddVertexAt(2, new Point2d(C0.X, C0.Y), 0, 0, 0);
                                pl.AddVertexAt(3, new Point2d(D0.X, D0.Y), 0, 0, 0);
                                pl.Closed = true;
                                pl.Layer = outLayer;
                                btr.AppendEntity(pl);
                                tr.AddNewlyCreatedDBObject(pl, true);
                                AttachMetadata(pl, tr, cap, com);

                                // orientar CSV de A y B con la base AB
                                double angAB = Math.Atan2(B0.Y - A0.Y, B0.X - A0.X);
                                OrientCsvBlockAt(_doc.Database, tr, A0, angAB);
                                OrientCsvBlockAt(_doc.Database, tr, B0, angAB);

                                idxEntidad++;
                                continue; // evita caer en la rama Polilínea
                            }

                            if (rbCir2p.Checked)
                            {
                                tr.Commit();
                                // refresco y limpieza igual que al final del método
                                try { _doc.Editor.Regen(); _doc.Editor.UpdateScreen(); acApp.UpdateScreen(); } catch { }
                                _entidades.Clear();
                                _nodos.Clear();
                                txtPrev.Text = ""; txtNext.Text = "";
                                _entidadesRect3p.Clear();
                                _entidadesCir2p.Clear();
                                lblEntidades.Text = "Entidades: 0";
                                ActualizarSecuenciaText();
                                DibujarPreview();
                                return;   // ← evita el foreach de “lotes”
                            }
                            
                            if (modoRec3p)
                            {
                                if (sec.Count < 3) { idxEntidad++; continue; }

                                if (!TryGetPointByNode(_doc.Database, tr, sec[0], out var A) ||
                                    !TryGetPointByNode(_doc.Database, tr, sec[1], out var B) ||
                                    !TryGetPointByNode(_doc.Database, tr, sec[2], out var C))
                                { idxEntidad++; continue; }

                                // base AB unitario
                                var ux = B.X - A.X; var uy = B.Y - A.Y;
                                var len = Math.Sqrt(ux * ux + uy * uy);
                                if (len < 1e-9) { idxEntidad++; continue; }
                                ux /= len; uy /= len;

                                // perpendicular (+90°)
                                var vx = -uy; var vy = ux;

                                // descomponer AC
                                var acx = C.X - A.X; var acy = C.Y - A.Y;
                                var w = acx * ux + acy * uy;   // sobre AB
                                var h = acx * vx + acy * vy;   // offset perpendicular

                                // cuatro esquinas A-B'-C'-D'
                                var A0 = A;
                                var B0 = new Point3d(A.X + ux * w, A.Y + uy * w, 0);
                                var C0 = new Point3d(B0.X + vx * h, B0.Y + vy * h, 0);
                                var D0 = new Point3d(A.X + vx * h, A.Y + vy * h, 0);

                                // polilínea cerrada
                                var pl = new Polyline();
                                pl.AddVertexAt(0, new Point2d(A0.X, A0.Y), 0, 0, 0);
                                pl.AddVertexAt(1, new Point2d(B0.X, B0.Y), 0, 0, 0);
                                pl.AddVertexAt(2, new Point2d(C0.X, C0.Y), 0, 0, 0);
                                pl.AddVertexAt(3, new Point2d(D0.X, D0.Y), 0, 0, 0);
                                pl.Closed = true;
                                pl.Layer = outLayer;

                                btr.AppendEntity(pl);
                                tr.AddNewlyCreatedDBObject(pl, true);
                                AttachMetadata(pl, tr, cap, com);

                                // opcional: orientar CSV en A y B según AB
                                double angAB = Math.Atan2(B0.Y - A0.Y, B0.X - A0.X);
                                OrientCsvBlockAt(_doc.Database, tr, A0, angAB);
                                OrientCsvBlockAt(_doc.Database, tr, B0, angAB);

                                idxEntidad++;
                                continue;   // **** EVITA que después caiga en Polilínea y te dibuje el triángulo ****
                            }

                            if (modoLinea)
                            {
                                // 1) Crear línea
                                created = new Line(pts[0], pts[1]) { Layer = outLayer };
                                btr.AppendEntity(created);
                                tr.AddNewlyCreatedDBObject(created, true);
                                double angSeg = Math.Atan2(pts[1].Y - pts[0].Y, pts[1].X - pts[0].X);


                                // 2) ¿Tengo plan ya definido? → NO preguntar; coloco etiqueta.
                                if (planUnico != null && planUnico.Habilitado)
                                {
                                    if (!planUnico.UsaRecuadro)
                                    {
                                        var mt = new MText
                                        {
                                            Contents = planUnico.Texto,
                                            TextHeight = planUnico.Altura,
                                            Location = planUnico.Anchor,    // punto "arriba" ya calculado al guardar
                                            Rotation = planUnico.AngRad,
                                            Attachment = AttachmentPoint.MiddleCenter,
                                            Layer = outLayer
                                        };
                                        btr.AppendEntity(mt);
                                        tr.AddNewlyCreatedDBObject(mt, true);
                                    }
                                    else
                                    {
                                        ColocarLeaderConRecuadro(btr, tr, planUnico.Texto, planUnico.Altura, planUnico.Anchor, planUnico.AngRad, outLayer);
                                    }
                                }
                                // 3) Si NO hay plan y estoy dibujando "al vuelo" (sin Guardar entidad), pregunto.
                                else if (!usandoGuardadas)
                                {
                                    var resp = MessageBox.Show(this, "¿Esta entidad requiere etiquetarse?", "Etiquetar",
                                                               MessageBoxButtons.YesNo, MessageBoxIcon.Question);
                                    if (resp == DialogResult.Yes)
                                    {
                                        double longitud = HorizontalDistance(pts[0], pts[1]);
                                        var mid = new Point3d((pts[0].X + pts[1].X) / 2.0, (pts[0].Y + pts[1].Y) / 2.0, 0);
                                        double ang = Math.Atan2(pts[1].Y - pts[0].Y, pts[1].X - pts[0].X);
                                        string rumbo = CalcularRumbo(pts[0], pts[1]);

                                        using var dlg = new FrmEtiquetaLinea(longitud, rumbo, null);
                                        if (dlg.ShowDialog(this) == DialogResult.OK)
                                        {
                                            double lSeg = longitud;   // para 'Línea' el tramo activo es toda la línea
                                                                      // 1) Texto del diálogo (multilínea con \P)
                                            string texto = dlg.BuildEtiquetaText();
                                            double h = dlg.AlturaTexto;
                                            double estimAncho = texto.Length * 0.6 * h;  // aproximación

                                            // 2) Ancla arriba de la línea
                                            double nx = -Math.Sin(ang), ny = Math.Cos(ang);
                                            Point3d arriba = new Point3d(mid.X + nx * h * 0.9, mid.Y + ny * h * 0.9, 0);

                                            // 3) ¿cabe el texto?
                                            bool cabe = estimAncho <= lSeg * 0.9;

                                            if (cabe)
                                            {
                                                // Etiqueta ALINEADA a la línea, SIN leader
                                                string textoInline = texto.Replace("\\P", "   ");

                                                var mt = new MText
                                                {
                                                    Contents = textoInline,
                                                    TextHeight = h,
                                                    Location = arriba,
                                                    Rotation = ang,
                                                    Attachment = AttachmentPoint.MiddleCenter,
                                                    Layer = outLayer
                                                };
                                                btr.AppendEntity(mt);
                                                tr.AddNewlyCreatedDBObject(mt, true);
                                            }
                                            else
                                            {
                                                // No cabe → Leader multilínea (sin recuadro)
                                                ColocarLeaderConRecuadro(btr, tr, texto, h, arriba, ang, outLayer);
                                            }

                                            // marcar vértices (opcional)
                                            if (dlg.MarcarVertices)
                                            {
                                                string pref = dlg.PrefijoVertices?.Trim() ?? "";
                                                int n = dlg.NumeradorInicial;
                                                foreach (var p in new[] { pts[0], pts[1] })
                                                {
                                                    var dbt = new DBText
                                                    {
                                                        TextString = pref + (n++).ToString(),
                                                        Height = dlg.AlturaTexto * 0.75,
                                                        Position = new Point3d(p.X, p.Y, 0),
                                                        Layer = outLayer
                                                    };
                                                    btr.AppendEntity(dbt);
                                                    tr.AddNewlyCreatedDBObject(dbt, true);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            else if (modoPline)
                            {
                                // 1) Crear polilínea
                                var pl = new Polyline();
                                for (int i = 0; i < pts.Count; i++)
                                    pl.AddVertexAt(i, new Point2d(pts[i].X, pts[i].Y), 0, 0, 0);
                                pl.Closed = cerrar && pts.Count >= 3;
                                pl.Layer = outLayer;
                                btr.AppendEntity(pl);
                                tr.AddNewlyCreatedDBObject(pl, true);
                                created = pl;

                                // orientar bloques CSV en cada vértice según su tramo saliente/entrante
                                for (int i = 0; i < pts.Count - 1; i++)
                                {
                                    double ang = Math.Atan2(pts[i + 1].Y - pts[i].Y, pts[i + 1].X - pts[i].X);

                                }

                                if (pl.Closed)
                                {
                                    // último vértice usa el último tramo que cierra
                                    double angLast = Math.Atan2(pts[0].Y - pts[pts.Count - 1].Y, pts[0].X - pts[pts.Count - 1].X);

                                }
                                else
                                {
                                    // poli abierta: último vértice usa el tramo entrante
                                    double angLast = Math.Atan2(pts[pts.Count - 1].Y - pts[pts.Count - 2].Y, pts[pts.Count - 1].X - pts[pts.Count - 2].X);

                                }

                                // 2) Si tengo plan, NO pregunto: coloco etiqueta
                                if (planUnico != null && planUnico.Habilitado)
                                {
                                    if (!planUnico.UsaRecuadro)
                                    {
                                        var mt = new MText
                                        {
                                            Contents = planUnico.Texto,
                                            TextHeight = planUnico.Altura,
                                            Location = planUnico.Anchor,
                                            Rotation = planUnico.AngRad,
                                            Attachment = AttachmentPoint.MiddleCenter,
                                            Layer = outLayer
                                        };
                                        btr.AppendEntity(mt);
                                        tr.AddNewlyCreatedDBObject(mt, true);
                                    }
                                    else
                                    {
                                        ColocarLeaderConRecuadro(btr, tr, planUnico.Texto, planUnico.Altura, planUnico.Anchor, planUnico.AngRad, outLayer);
                                    }
                                }
                                // 3) Si NO hay plan y dibujo "al vuelo", pregunto.
                                else if (!usandoGuardadas)
                                {
                                    // Longitud real (considera cierre)
                                    double longitud = 0.0;
                                    for (int i = 0; i < pts.Count - 1; i++)
                                        longitud += HorizontalDistance(pts[i], pts[i + 1]);
                                    if (pl.Closed)
                                        longitud += HorizontalDistance(pts[pts.Count - 1], pts[0]);

                                    // Ancla en el tramo más largo
                                    double lSeg;
                                    var (mid, ang) = GetAnchorOnLongestSegment(pts, pl.Closed, out lSeg);
                                    string rumbo = CalcularRumbo(pts[0], pts[1]);

                                    var resp = MessageBox.Show(this, "¿Esta entidad requiere etiquetarse?", "Etiquetar",
                                                               MessageBoxButtons.YesNo, MessageBoxIcon.Question);
                                    if (resp == DialogResult.Yes)
                                    {
                                        using var dlg = new FrmEtiquetaLinea(longitud, rumbo, null);
                                        if (dlg.ShowDialog(this) == DialogResult.OK)
                                        {
                                            // 1) Texto del diálogo (multilínea con \P)
                                            string texto = dlg.BuildEtiquetaText();
                                            double h = dlg.AlturaTexto;
                                            double estimAncho = texto.Length * 0.6 * h;

                                            // 2) Ancla arriba de la línea
                                            double nx = -Math.Sin(ang), ny = Math.Cos(ang);
                                            Point3d arriba = new Point3d(mid.X + nx * h * 0.9, mid.Y + ny * h * 0.9, 0);

                                            // 3) ¿cabe el texto?
                                            bool cabe = estimAncho <= lSeg * 0.9;

                                            if (cabe)
                                            {
                                                // Etiqueta ALINEADA a la línea, SIN leader
                                                string textoInline = texto.Replace("\\P", "   ");

                                                var mt = new MText
                                                {
                                                    Contents = textoInline,
                                                    TextHeight = h,
                                                    Location = arriba,
                                                    Rotation = ang,
                                                    Attachment = AttachmentPoint.MiddleCenter,
                                                    Layer = outLayer
                                                };
                                                btr.AppendEntity(mt);
                                                tr.AddNewlyCreatedDBObject(mt, true);
                                            }
                                            else
                                            {
                                                // No cabe → Leader multilínea (sin recuadro)
                                                ColocarLeaderConRecuadro(btr, tr, texto, h, arriba, ang, outLayer);
                                            }

                                            if (dlg.MarcarVertices)
                                            {
                                                string pref = dlg.PrefijoVertices?.Trim() ?? "";
                                                int n = dlg.NumeradorInicial;
                                                foreach (var p in pts)
                                                {
                                                    var dbt = new DBText
                                                    {
                                                        TextString = pref + (n++).ToString(),
                                                        Height = dlg.AlturaTexto * 0.75,
                                                        Position = new Point3d(p.X, p.Y, 0),
                                                        Layer = outLayer
                                                    };
                                                    btr.AppendEntity(dbt);
                                                    tr.AddNewlyCreatedDBObject(dbt, true);
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            else // modoPline3d
                            {
                                var coll = new Point3dCollection(pts.ToArray());
                                var pl3d = new Polyline3d(Poly3dType.SimplePoly, coll, cerrarPl && pts.Count >= 3) { Layer = outLayer };
                                btr.AppendEntity(pl3d);
                                tr.AddNewlyCreatedDBObject(pl3d, true);
                                created = pl3d;

                                for (int i = 0; i < pts.Count - 1; i++)
                                {
                                    double ang = Math.Atan2(pts[i + 1].Y - pts[i].Y, pts[i + 1].X - pts[i].X);

                                }

                                if (pl3d.Closed)
                                {
                                    double angLast = Math.Atan2(pts[0].Y - pts[pts.Count - 1].Y, pts[0].X - pts[pts.Count - 1].X);

                                }
                                else
                                {
                                    double angLast = Math.Atan2(pts[pts.Count - 1].Y - pts[pts.Count - 2].Y, pts[pts.Count - 1].X - pts[pts.Count - 2].X);

                                }

                                // === Pregunta de etiquetado (solo Polilínea3D) ===
                                var resp = MessageBox.Show(this, "¿Esta entidad requiere etiquetarse?", "Etiquetar", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
                                if (resp == DialogResult.Yes)
                                {
                                    // Longitud real (si está cerrada se suma el último tramo)
                                    double longitud = 0.0;
                                    for (int i = 0; i < pts.Count - 1; i++)
                                        longitud += HorizontalDistance(pts[i], pts[i + 1]);
                                    if (pl3d.Closed)
                                        longitud += HorizontalDistance(pts[pts.Count - 1], pts[0]);

                                    // Punto medio y ángulo local
                                    double lSeg;
                                    var (mid, ang) = GetAnchorOnLongestSegment(pts, pl3d.Closed, out lSeg);
                                    string rumbo = CalcularRumbo(pts[0], pts[1]);

                                    using var dlg = new FrmEtiquetaLinea(longitud, rumbo, null);
                                    if (dlg.ShowDialog(this) == DialogResult.OK)
                                    {
                                        // 1) Composición del texto según checkboxes seleccionados
                                        string texto = dlg.BuildEtiquetaText();

                                        // 2) Vista previa de la etiqueta (antes de escribir a CAD)
                                        _previewEtiquetaText = texto;
                                        _previewEtiquetaPoint = mid;
                                        _previewEtiquetaAngleRad = ang;
                                        DibujarPreview();

                                        // 3) Insertar en CAD
                                        double h = dlg.AlturaTexto;
                                        double estimAncho = texto.Length * 0.6 * h;

                                        // longitud del tramo "local" donde cae el punto medio
                                        double lMinTramo = 999999;
                                        for (int i = 0; i < pts.Count - 1 + (pl3d.Closed ? 1 : 0); i++)
                                            lMinTramo = Math.Min(lMinTramo,
                                                HorizontalDistance(pts[i % pts.Count], pts[(i + 1) % pts.Count]));

                                        bool usaRecuadro = estimAncho > lMinTramo * 0.9;

                                        if (!usaRecuadro)
                                        {
                                            var mt = new MText
                                            {
                                                Contents = texto,
                                                TextHeight = h,
                                                Location = mid,
                                                Rotation = ang,
                                                Attachment = AttachmentPoint.MiddleCenter,
                                                Layer = outLayer
                                            };
                                            btr.AppendEntity(mt);
                                            tr.AddNewlyCreatedDBObject(mt, true);
                                        }
                                        else
                                        {
                                            // Recuadro + señalador (MLeader) a un costado
                                            double dx = Math.Cos(ang), dy = Math.Sin(ang);
                                            var pOffset = new Point3d(mid.X - dy * 2.0 * h, mid.Y + dx * 2.0 * h, 0);

                                            // MLeader con texto
                                            var mle = new MLeader();
                                            mle.ContentType = ContentType.MTextContent;
                                            var mtx = new MText { TextHeight = h, Contents = texto };
                                            mle.MText = mtx;
                                            int ln = mle.AddLeader();
                                            int li = mle.AddLeaderLine(ln);
                                            mle.AddFirstVertex(li, pOffset);
                                            mle.AddLastVertex(li, mid);
                                            mle.Layer = outLayer;
                                            btr.AppendEntity(mle);
                                            tr.AddNewlyCreatedDBObject(mle, true);

                                            // Recuadro (simple rectángulo alrededor del MText simulado)
                                            double w = estimAncho + 2.0 * h * 0.3;
                                            double hh = h + 2.0 * h * 0.2;
                                            var p0 = new Point3d(pOffset.X - w / 2, pOffset.Y - hh / 2, 0);
                                            var p1 = new Point3d(pOffset.X + w / 2, pOffset.Y - hh / 2, 0);
                                            var p2 = new Point3d(pOffset.X + w / 2, pOffset.Y + hh / 2, 0);
                                            var p3 = new Point3d(pOffset.X - w / 2, pOffset.Y + hh / 2, 0);

                                            var rect = new Polyline();
                                            rect.AddVertexAt(0, new Point2d(p0.X, p0.Y), 0, 0, 0);
                                            rect.AddVertexAt(1, new Point2d(p1.X, p1.Y), 0, 0, 0);
                                            rect.AddVertexAt(2, new Point2d(p2.X, p2.Y), 0, 0, 0);
                                            rect.AddVertexAt(3, new Point2d(p3.X, p3.Y), 0, 0, 0);
                                            rect.Closed = true;
                                            rect.Layer = outLayer;
                                            btr.AppendEntity(rect);
                                            tr.AddNewlyCreatedDBObject(rect, true);
                                        }

                                        // 4) Marcado de vértices si se seleccionó
                                        if (dlg.MarcarVertices)
                                        {
                                            string pref = dlg.PrefijoVertices?.Trim() ?? "";
                                            int n = dlg.NumeradorInicial;
                                            foreach (var p in pts)
                                            {
                                                var dbt = new DBText
                                                {
                                                    TextString = pref + (n++).ToString(),
                                                    Height = dlg.AlturaTexto * 0.75,
                                                    Position = new Point3d(p.X, p.Y, 0),
                                                    Layer = outLayer
                                                };
                                                btr.AppendEntity(dbt);
                                                tr.AddNewlyCreatedDBObject(dbt, true);
                                            }
                                        }
                                    }
                                }
                            } // fin else modoPline3d
                            AttachMetadata(created, tr, cap, com);
                        } // fin else (no cortar)

                        idxEntidad++;
                    } // fin foreach sec in lotes
                      // Dibujar los rectángulos 3P como polilíneas cerradas
                    foreach (var r in rects)
                    {
                        var pl = new Polyline();
                        pl.AddVertexAt(0, new Point2d(r.A.X, r.A.Y), 0, 0, 0);
                        pl.AddVertexAt(1, new Point2d(r.B.X, r.B.Y), 0, 0, 0);
                        pl.AddVertexAt(2, new Point2d(r.C.X, r.C.Y), 0, 0, 0);
                        pl.AddVertexAt(3, new Point2d(r.D.X, r.D.Y), 0, 0, 0);
                        pl.Closed = true;
                        pl.Layer = outLayer;
                        btr.AppendEntity(pl);
                        tr.AddNewlyCreatedDBObject(pl, true);
                        AttachMetadata(pl, tr, cap, com);
                    }

                    tr.Commit();
                    // Forzar refresco inmediato del dibujo
                    try
                    {
                        _doc.Editor.Regen();          // fuerza regeneración
                        _doc.Editor.UpdateScreen();   // y repinta
                        acApp.UpdateScreen();         // extra, por si el editor está ocupado
                    }
                    catch { /* tolerante */ }

                } // fin using transaction

                // Limpieza post-dibujo
                _entidades.Clear();
                _nodos.Clear();
                txtPrev.Text = "";
                txtNext.Text = "";
                lblEntidades.Text = "Entidades: 0";
                ActualizarSecuenciaText();
                DibujarPreview();
                _entidadesRect3p.Clear();
                _entidadesCir2p.Clear();
                lblEntidades.Text = "Entidades: 0";

            }
            catch (System.Exception ex)
            {
                MessageBox.Show(this, "Error dibujando: " + ex.Message, "Unir", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        /// Devuelve el BlockReference del BLOQUE DE CATÁLOGO cuyo centro de extents coincide
        /// con la posición del NODO (posNodo). NO devuelve el bloque del NODO.
        /// Si no se encuentra, retorna false y brOut = null.
        // Devuelve el BlockReference del BLOQUE DE CATÁLOGO asociado al NODO ubicado en posNodo.
        // Regla: elegir SIEMPRE el bloque NO-NODO cuyo centro de extents esté más cercano a posNodo,
        // priorizando los que están marcados con SICOE_CATBLK. No usa "inside"; se basa en distancia al centro.
        private static bool TryGetCsvBlockAt(Database db, Transaction tr, Point3d posNodo, out BlockReference brOut)
        {
            brOut = null;
            BlockReference bestMarked = null; double d2Marked = double.MaxValue;
            BlockReference bestAny = null; double d2Any = double.MaxValue;

            var space = (BlockTableRecord)tr.GetObject(db.CurrentSpaceId, OpenMode.ForRead);
            foreach (ObjectId id in space)
            {
                if (tr.GetObject(id, OpenMode.ForRead) is not BlockReference br) continue;

                // saltar BLOQUE NODO
                bool esNodo = false;
                if (br.AttributeCollection != null)
                    foreach (ObjectId aid in br.AttributeCollection)
                        if (tr.GetObject(aid, OpenMode.ForRead) is AttributeReference ar &&
                            ar.Tag.Equals("NODO", StringComparison.OrdinalIgnoreCase)) { esNodo = true; break; }
                if (esNodo) continue;

                Extents3d ext; try { ext = br.GeometricExtents; } catch { continue; }
                double cx = 0.5 * (ext.MinPoint.X + ext.MaxPoint.X);
                double cy = 0.5 * (ext.MinPoint.Y + ext.MaxPoint.Y);
                double dx = posNodo.X - cx, dy = posNodo.Y - cy, d2 = dx * dx + dy * dy;

                bool marcado = HasCatalogMark(tr, br);
                if (marcado)
                {
                    if (d2 < d2Marked) { d2Marked = d2; bestMarked = br; }
                }
                else
                {
                    if (d2 < d2Any) { d2Any = d2; bestAny = br; }
                }
            }
            brOut = bestMarked ?? bestAny;
            return brOut != null;
        }


        // ====== Helpers CAD ======
        private static bool TryGetPointByNode(Database db, Transaction tr, int node, out Point3d pt)
        {
            pt = Point3d.Origin;
            var btr = (BlockTableRecord)tr.GetObject(db.CurrentSpaceId, OpenMode.ForRead);
            foreach (ObjectId id in btr)
            {
                if (!(tr.GetObject(id, OpenMode.ForRead) is BlockReference br)) continue;
                if (br.AttributeCollection == null || br.AttributeCollection.Count == 0) continue;

                foreach (ObjectId aid in br.AttributeCollection)
                {
                    if (!(tr.GetObject(aid, OpenMode.ForRead) is AttributeReference ar)) continue;
                    if (!ar.Tag.Equals("NODO", StringComparison.OrdinalIgnoreCase)) continue;

                    if (int.TryParse(ar.TextString?.Trim(), out int n) && n == node)
                    {
                        pt = br.Position;
                        return true;
                    }
                }
            }
            return false;
        }
        // Devuelve el BlockReference cuyo atributo NODO == node
        // === Helpers: localizar bloque por NODO (lee el atributo NODO) ===
        private static bool TryGetBlockByNode(Database db, Transaction tr, int node, out BlockReference brOut)
        {
            brOut = null;
            var btr = (BlockTableRecord)tr.GetObject(db.CurrentSpaceId, OpenMode.ForRead);
            foreach (ObjectId id in btr)
            {
                if (!(tr.GetObject(id, OpenMode.ForRead) is BlockReference br)) continue;
                if (br.AttributeCollection == null || br.AttributeCollection.Count == 0) continue;

                foreach (ObjectId aid in br.AttributeCollection)
                {
                    if (!(tr.GetObject(aid, OpenMode.ForRead) is AttributeReference ar)) continue;
                    if (!ar.Tag.Equals("NODO", StringComparison.OrdinalIgnoreCase)) continue;

                    if (int.TryParse(ar.TextString?.Trim(), out int n) && n == node)
                    {
                        brOut = br;
                        return true;
                    }
                }
            }
            return false;
        }
        private void BtnCerrar_Click(object sender, EventArgs e)
        {
            // No disponer el formulario para que pueda re-mostrarse luego
            this.Hide();
        }


        private static void EnsureLayer(Database db, Transaction tr, string layerName, Autodesk.AutoCAD.Colors.Color colorOrNull)

        {
            var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
            if (lt.Has(layerName)) return;

            lt.UpgradeOpen();
            var ltr = new LayerTableRecord { Name = layerName };
            if (colorOrNull != null) ltr.Color = colorOrNull;
            var id = lt.Add(ltr);
            tr.AddNewlyCreatedDBObject(ltr, true);
        }
        private static void AttachMetadata(Entity ent, Transaction tr, string capitulo, string competencia)
        {
            const string KEY = "SICOE_META";

            if (!ent.ExtensionDictionary.IsValid)
            {
                ent.UpgradeOpen();
                ent.CreateExtensionDictionary();
            }

            var ext = (DBDictionary)tr.GetObject(ent.ExtensionDictionary, OpenMode.ForRead);

            Xrecord xr;
            if (ext.Contains(KEY))
            {
                ext.UpgradeOpen();
                xr = (Xrecord)tr.GetObject(ext.GetAt(KEY), OpenMode.ForWrite);
            }
            else
            {
                ext.UpgradeOpen();
                xr = new Xrecord();
                ext.SetAt(KEY, xr);
                tr.AddNewlyCreatedDBObject(xr, true);
            }

            xr.Data = new ResultBuffer(
                new TypedValue((int)DxfCode.Text, capitulo ?? ""),
                new TypedValue((int)DxfCode.Text, competencia ?? "")
            );
        }


        /// <summary>
        /// Calcula dónde el rayo (origin → target) intersecta el AABB.
        /// OVERSHOOT = 0 para medición exacta al borde del bloque.
        /// </summary>
        private static Point3d TrimAtExtents(Point3d origin, Point3d target, Extents3d ext)
        {
            const double EPS = 1e-9;

            var dir = new Vector2d(target.X - origin.X, target.Y - origin.Y);
            if (dir.Length < EPS) return origin;

            double dx = dir.X, dy = dir.Y;

            // AABB exacto (sin padding)
            double xmin = Math.Min(ext.MinPoint.X, ext.MaxPoint.X);
            double xmax = Math.Max(ext.MinPoint.X, ext.MaxPoint.X);
            double ymin = Math.Min(ext.MinPoint.Y, ext.MaxPoint.Y);
            double ymax = Math.Max(ext.MinPoint.Y, ext.MaxPoint.Y);

            var candidates = new List<Point3d>();

            // Intersección con los 4 lados del rectángulo
            if (Math.Abs(dx) > EPS)
            {
                // Lado izquierdo (x = xmin)
                double t1 = (xmin - origin.X) / dx;
                double y1 = origin.Y + t1 * dy;
                if (t1 >= 0 && y1 >= ymin && y1 <= ymax)
                    candidates.Add(new Point3d(xmin, y1, 0));

                // Lado derecho (x = xmax)
                double t2 = (xmax - origin.X) / dx;
                double y2 = origin.Y + t2 * dy;
                if (t2 >= 0 && y2 >= ymin && y2 <= ymax)
                    candidates.Add(new Point3d(xmax, y2, 0));
            }

            if (Math.Abs(dy) > EPS)
            {
                // Lado inferior (y = ymin)
                double t3 = (ymin - origin.Y) / dy;
                double x3 = origin.X + t3 * dx;
                if (t3 >= 0 && x3 >= xmin && x3 <= xmax)
                    candidates.Add(new Point3d(x3, ymin, 0));

                // Lado superior (y = ymax)
                double t4 = (ymax - origin.Y) / dy;
                double x4 = origin.X + t4 * dx;
                if (t4 >= 0 && x4 >= xmin && x4 <= xmax)
                    candidates.Add(new Point3d(x4, ymax, 0));
            }

            if (candidates.Count == 0) return origin;

            // Ordenar por distancia desde origin y tomar la más cercana
            candidates.Sort((a, b) =>
            {
                double da = (a.X - origin.X) * (a.X - origin.X) + (a.Y - origin.Y) * (a.Y - origin.Y);
                double db = (b.X - origin.X) * (b.X - origin.X) + (b.Y - origin.Y) * (b.Y - origin.Y);
                return da.CompareTo(db);
            });

            var hit = candidates[0];

            // OVERSHOOT = 0 (medición exacta)
            // Si necesitas un micro-gap visual, cambia a 0.001
            double push = 0.0;

            double len = Math.Sqrt(dx * dx + dy * dy);
            if (len > EPS)
            {
                double ux = dx / len, uy = dy / len;
                return new Point3d(hit.X + ux * push, hit.Y + uy * push, hit.Z);
            }

            return hit;
        }
        private void ActualizarSecuenciaText()
        {
            var sb = new System.Text.StringBuilder();
            sb.AppendLine("Secuencia actual:");
            if (_nodos.Count > 0) sb.AppendLine(string.Join(" -> ", _nodos));
            else sb.AppendLine("(vacía)");

            if (_entidades.Count > 0)
            {
                sb.AppendLine();
                sb.AppendLine("Acumuladas:");
                for (int i = 0; i < _entidades.Count; i++)
                    sb.AppendLine($"[{i + 1}] " + string.Join(" -> ", _entidades[i]));
            }
            txtSecuencia.Text = sb.ToString();
        }
        private void DibujarPreview()
        {
            if (picPreview == null || picPreview.Width < 10 || picPreview.Height < 10) return;

            // 1) Recolectar puntos WCS de TODAS las entidades (acumuladas + actual)
            // 1) Recolectar puntos WCS + etiqueta (número de NODO)
            var conjuntos = new List<List<(Point3d P, string L)>>();
            try
            {
                using (_doc?.LockDocument())
                using (var tr = _doc?.Database?.TransactionManager?.StartTransaction())
                {
                    if (tr == null) { picPreview.Image = null; return; }

                    // Acumuladas
                    foreach (var sec in _entidades)
                    {
                        var ptsLab = new List<(Point3d, string)>();
                        foreach (var n in sec)
                            if (TryGetPointByNode(_doc.Database, tr, n, out var p))
                                ptsLab.Add((p, n.ToString()));
                        if (ptsLab.Count >= 2) conjuntos.Add(ptsLab);
                    }

                    // Actual
                    if (_nodos.Count >= 2)
                    {
                        var ptsLabA = new List<(Point3d, string)>();
                        foreach (var n in _nodos)
                            if (TryGetPointByNode(_doc.Database, tr, n, out var p))
                                ptsLabA.Add((p, n.ToString()));
                        if (ptsLabA.Count >= 2) conjuntos.Add(ptsLabA);
                    }
                    tr.Commit();
                }
            }
            catch { picPreview.Image = null; return; }

            if (conjuntos.Count == 0) { picPreview.Image = null; return; }
            // 2) Rectángulos guardados (gris)
            try
            {
                using (_doc?.LockDocument())
                using (var tr = _doc?.Database?.TransactionManager?.StartTransaction())
                {
                    foreach (var t in _entidadesRect3p)
                    {
                        if (TryGetPointByNode(_doc.Database, tr, t.a, out var p1) &&
                            TryGetPointByNode(_doc.Database, tr, t.b, out var p2) &&
                            TryGetPointByNode(_doc.Database, tr, t.c, out var p3))
                        {
                            var (A, B, C, D) = BuildRectFrom3Points(p1, p2, p3);
                            conjuntos.Add(new List<(Point3d, string)> { (A, ""), (B, ""), (C, ""), (D, ""), (A, "") });
                        }
                    }
                    tr?.Commit();
                }
            }
            catch { /* preview tolerante */ }
            // --- Preview: ARCO 3P actual (orden correcto: pasa por el 2° punto) ---
            if (rbArc.Checked && _nodos.Count == 3)
            {
                try
                {
                    using (_doc?.LockDocument())
                    using (var tr = _doc?.Database?.TransactionManager?.StartTransaction())
                    {
                        if (tr != null &&
                            TryGetPointByNode(_doc.Database, tr, _nodos[0], out var p1) &&
                            TryGetPointByNode(_doc.Database, tr, _nodos[1], out var p2) &&
                            TryGetPointByNode(_doc.Database, tr, _nodos[2], out var p3))
                        {
                            var ca = new CircularArc3d(p1, p2, p3);
                            var C = ca.Center;
                            double r = ca.Radius;

                            double a1 = Math.Atan2(p1.Y - C.Y, p1.X - C.X);
                            double a2 = Math.Atan2(p2.Y - C.Y, p2.X - C.X);
                            double a3 = Math.Atan2(p3.Y - C.Y, p3.X - C.X);

                            double Norm(double a) { while (a < 0) a += 2 * Math.PI; while (a >= 2 * Math.PI) a -= 2 * Math.PI; return a; }
                            bool BetweenCCW(double s, double m, double e)
                            { s = Norm(s); m = Norm(m); e = Norm(e); if (e < s) e += 2 * Math.PI; if (m < s) m += 2 * Math.PI; return m >= s && m <= e; }

                            double start = a1, end = a3;
                            if (!BetweenCCW(a1, a2, a3)) { start = a3; end = a1; }

                            double sweep = end - start; if (sweep <= 0) sweep += 2 * Math.PI;

                            const int N = 64;
                            var poly = new List<(Point3d, string)>();
                            for (int i = 0; i <= N; i++)
                            {
                                double a = start + sweep * i / N;
                                poly.Add((new Point3d(C.X + r * Math.Cos(a), C.Y + r * Math.Sin(a), 0), ""));
                            }
                            conjuntos.Add(poly); // última => azul
                        }
                        tr?.Commit();
                    }
                }
                catch { /* tolerante */ }
            }


            // 3) Rectángulo 3P actual (azul si hay 3 nodos)
            if (rbRec3p.Checked && _nodos.Count == 3)
            {
                try
                {
                    using (_doc?.LockDocument())
                    using (var tr = _doc?.Database?.TransactionManager?.StartTransaction())
                    {
                        if (tr != null &&
                            TryGetPointByNode(_doc.Database, tr, _nodos[0], out var p1) &&
                            TryGetPointByNode(_doc.Database, tr, _nodos[1], out var p2) &&
                            TryGetPointByNode(_doc.Database, tr, _nodos[2], out var p3))
                        {
                            var (A, B, C, D) = BuildRectFrom3Points(p1, p2, p3);
                            var rect = new List<(Point3d, string)> { (A, ""), (B, ""), (C, ""), (D, ""), (A, "") };
                            conjuntos.Add(rect); // último => azul
                        }
                        tr?.Commit();
                    }
                }
                catch { /* preview tolerante */ }
            }
            // --- Preview: CÍRCULO 2P actual ---
            if (rbCir2p.Checked && _nodos.Count == 2)
            {
                try
                {
                    using (_doc?.LockDocument())
                    using (var tr = _doc?.Database?.TransactionManager?.StartTransaction())
                    {
                        if (tr != null &&
                            TryGetPointByNode(_doc.Database, tr, _nodos[0], out var c) &&
                            TryGetPointByNode(_doc.Database, tr, _nodos[1], out var p))
                        {
                            // Aproximamos el círculo con un polígono (preview)
                            const int N = 64;
                            var poly = new List<(Point3d, string)>();
                            double r = Math.Sqrt((p.X - c.X) * (p.X - c.X) + (p.Y - c.Y) * (p.Y - c.Y));
                            for (int i = 0; i <= N; i++)
                            {
                                double a = 2 * Math.PI * i / N;
                                poly.Add((new Point3d(c.X + r * Math.Cos(a), c.Y + r * Math.Sin(a), 0), ""));
                            }
                            conjuntos.Add(poly); // última => azul
                        }
                        tr?.Commit();
                    }
                }
                catch { /* tolerante */ }
            }
            // --- Preview: CÍRCULOS guardados ---
            try
            {
                using (_doc?.LockDocument())
                using (var tr = _doc?.Database?.TransactionManager?.StartTransaction())
                {
                    foreach (var t in _entidadesCir2p)
                    {
                        if (TryGetPointByNode(_doc.Database, tr, t.c, out var c) &&
                            TryGetPointByNode(_doc.Database, tr, t.r, out var p))
                        {
                            const int N = 64;
                            var poly = new List<(Point3d, string)>();
                            double r = Math.Sqrt((p.X - c.X) * (p.X - c.X) + (p.Y - c.Y) * (p.Y - c.Y));
                            for (int i = 0; i <= N; i++)
                            {
                                double a = 2 * Math.PI * i / N;
                                poly.Add((new Point3d(c.X + r * Math.Cos(a), c.Y + r * Math.Sin(a), 0), ""));
                            }
                            conjuntos.Add(poly); // en gris porque no es la última “actual”
                        }
                    }
                    tr?.Commit();
                }
            }
            catch { /* tolerante */ }

            // 2) Extents y transformación a panel
            double xmin = double.MaxValue, ymin = double.MaxValue, xmax = double.MinValue, ymax = double.MinValue;
            foreach (var ls in conjuntos)
                foreach (var t in ls) { var p = t.P; xmin = Math.Min(xmin, p.X); ymin = Math.Min(ymin, p.Y); xmax = Math.Max(xmax, p.X); ymax = Math.Max(ymax, p.Y); }

            double w = Math.Max(1, xmax - xmin), h = Math.Max(1, ymax - ymin);
            var bmp = new Bitmap(picPreview.Width, picPreview.Height);
            using var g = Graphics.FromImage(bmp);
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            g.Clear(System.Drawing.Color.White);


            float pad = 8f;
            float sx = (float)((bmp.Width - 2 * pad) / w);
            float sy = (float)((bmp.Height - 2 * pad) / h);
            float s = Math.Min(sx, sy);

            PointF Map(Point3d p)
                => new PointF(
                    pad + (float)((p.X - xmin) * s),
                    // invertir Y para ver “normal” en pantalla
                    bmp.Height - pad - (float)((p.Y - ymin) * s));

            // 3) Dibujar: acumuladas en gris, actual en azul
            using var font = new System.Drawing.Font("Segoe UI", 8f, System.Drawing.FontStyle.Regular);
            int idx = 0;
            foreach (var ls in conjuntos)
            {
                var pen = (++idx == conjuntos.Count && _nodos.Count >= 2) ? _penActual : _penGuardadas;

                // líneas
                for (int i = 0; i < ls.Count - 1; i++)
                    g.DrawLine(pen, Map(ls[i].P), Map(ls[i + 1].P));

                // puntos + etiquetas
                foreach (var t in ls)
                {
                    var m = Map(t.P);
                    g.FillEllipse(_bruPunto, m.X - 2, m.Y - 2, 4, 4);
                    g.DrawString(t.L, font, System.Drawing.Brushes.Black, m.X + 4, m.Y - 10); // número de NODO
                }
            }
            // === Dibujo de la etiqueta en el preview (si existe) ===
            if (!string.IsNullOrWhiteSpace(_previewEtiquetaText))
            {
                using var font2 = new System.Drawing.Font("Segoe UI", 9f, System.Drawing.FontStyle.Regular);
                var m = Map(_previewEtiquetaPoint);

                g.TranslateTransform(m.X, m.Y);
                g.RotateTransform((float)(_previewEtiquetaAngleRad * 180.0 / Math.PI));

                var sz = g.MeasureString(_previewEtiquetaText, font2);
                g.DrawString(_previewEtiquetaText,
                             font2,
                             System.Drawing.Brushes.Black,
                             -sz.Width / 2f, -sz.Height / 2f);

                g.ResetTransform();
            }
            // === Etiquetas planeadas (de entidades guardadas) ===
            using var fontPlan = new System.Drawing.Font("Segoe UI", 9f, System.Drawing.FontStyle.Regular);

            for (int e = 0; e < _planesEtiqPorEntidad.Count; e++)
            {
                foreach (var plan in _planesEtiqPorEntidad[e])
                {
                    if (!plan.Habilitado) continue;

                    // Colocación relativa al ancla del plan
                    var mapped = Map(plan.Anchor);

                    // Si NO usa recuadro: dibuja el texto rotado en el ancla
                    if (!plan.UsaRecuadro)
                    {
                        g.TranslateTransform(mapped.X, mapped.Y);
                        g.RotateTransform((float)(plan.AngRad * 180.0 / Math.PI));

                        var sz = g.MeasureString(plan.Texto, fontPlan);
                        g.DrawString(plan.Texto, fontPlan, System.Drawing.Brushes.Black,
                                     -sz.Width / 2f, -sz.Height / 2f);

                        g.ResetTransform();
                        continue;
                    }

                    // Con recuadro: dibuja líder corto y caja a un costado (sin rotar el canvas)
                    g.ResetTransform();

                    var nx = -Math.Sin(plan.AngRad);
                    var ny = Math.Cos(plan.AngRad);
                    var tx = Math.Cos(plan.AngRad);
                    var ty = Math.Sin(plan.AngRad);

                    var szBox = g.MeasureString(plan.Texto, fontPlan);
                    float boxW = szBox.Width + 10f;
                    float boxH = szBox.Height + 6f;

                    // Caja desplazada hacia la normal y un poco a lo largo del tramo
                    var box = new System.Drawing.PointF(
                        mapped.X - (float)(ny * 20.0) - (float)(tx * (boxW / 2f)),
                        mapped.Y + (float)(nx * 20.0) - (float)(ty * (boxW / 2f)));

                    // Leader hasta el centro de la caja
                    g.DrawLine(System.Drawing.Pens.Black,
                               mapped,
                               new System.Drawing.PointF(box.X + boxW / 2f, box.Y + boxH / 2f));

                    // Rectángulo del recuadro
                    g.DrawRectangle(System.Drawing.Pens.Black, box.X, box.Y, boxW, boxH);

                    // Texto dentro de la caja (sin rotar)
                    g.DrawString(plan.Texto, fontPlan, System.Drawing.Brushes.Black,
                                 box.X + 5f, box.Y + 3f);
                }
            }
            // 4) Presentar
            picPreview.Image = bmp;
        }
        private static string CalcularRumbo(Point3d a, Point3d b)
        {
            double dx = b.X - a.X, dy = b.Y - a.Y;
            string ns = dy >= 0 ? "N" : "S";
            string ew = dx >= 0 ? "E" : "W";
            double ang = Math.Abs(Math.Atan2(Math.Abs(dx), Math.Abs(dy))); // 0..pi/2

            int deg = (int)(ang * 180.0 / Math.PI);
            int min = (int)((ang * 180.0 / Math.PI - deg) * 60.0);
            int sec = (int)Math.Round((((ang * 180.0 / Math.PI - deg) * 60.0) - min) * 60.0);
            if (sec == 60) { sec = 0; min++; }
            if (min == 60) { min = 0; deg++; }

            return $"{ns} {deg:00}°{min:00}'{sec:00}\" {ew}";
        }
        private bool SecuenciaActualTieneCruce(out (int iA, int iB, Point3d P) cruce)
        {
            cruce = (-1, -1, Point3d.Origin);
            if (_nodos.Count < 4) return false;

            // 1) Obtener coordenadas de todos los nodos actuales
            var pts = new List<Point3d>(_nodos.Count);
            using (_doc.LockDocument())
            using (var tr = _doc.Database.TransactionManager.StartTransaction())
            {
                foreach (var n in _nodos)
                {
                    if (!TryGetPointByNode(_doc.Database, tr, n, out var p))
                        return false; // si falla algún punto, no validamos cruces
                    pts.Add(p);
                }
                tr.Commit();
            }

            // 2) Revisar intersección entre el último tramo y todos los previos no adyacentes
            int last = pts.Count - 1;
            var A = pts[last - 1];
            var B = pts[last];

            for (int i = 0; i < last - 2; i++)    // no comparar con el penúltimo tramo (adyacente)
            {
                var C = pts[i];
                var D = pts[i + 1];

                if (SegmentsIntersect(A, B, C, D, out var pX))
                {
                    cruce = (i, last - 1, pX);
                    return true;
                }
            }
            return false;
        }
        /// <summary>
        /// Intersección de segmentos AB con CD en 2D (usa X,Y; ignora Z).
        /// Devuelve true si se cruzan en el interior (o borde) y devuelve el punto de cruce aproximado.
        /// </summary>
        private static bool SegmentsIntersect(Point3d a, Point3d b, Point3d c, Point3d d, out Point3d pX)
        {
            pX = Point3d.Origin;

            // Basado en orientación y solapamiento paramétrico
            double o1 = Orient(a, b, c);
            double o2 = Orient(a, b, d);
            double o3 = Orient(c, d, a);
            double o4 = Orient(c, d, b);

            bool general = (o1 * o2 < 0) && (o3 * o4 < 0);

            if (!general)
            {
                // Casos colineales y toques en extremos (permitimos borde como cruce)
                if (o1 == 0 && OnSegment(a, b, c)) { pX = c; return true; }
                if (o2 == 0 && OnSegment(a, b, d)) { pX = d; return true; }
                if (o3 == 0 && OnSegment(c, d, a)) { pX = a; return true; }
                if (o4 == 0 && OnSegment(c, d, b)) { pX = b; return true; }
                return false;
            }

            // Intersección propia: calcular punto por intersección de rectas
            double den = (b.X - a.X) * (d.Y - c.Y) - (b.Y - a.Y) * (d.X - c.X);
            if (Math.Abs(den) < 1e-12) return true; // casi paralelas: ya sabemos que se cruzan

            double ua = ((c.X - a.X) * (d.Y - c.Y) - (c.Y - a.Y) * (d.X - c.X)) / den;
            double ix = a.X + ua * (b.X - a.X);
            double iy = a.Y + ua * (b.Y - a.Y);
            pX = new Point3d(ix, iy, 0);
            return true;

            // --- helpers locales ---
            static double Orient(Point3d p, Point3d q, Point3d r)
                => ((q.X - p.X) * (r.Y - p.Y)) - ((q.Y - p.Y) * (r.X - p.X));

            static bool OnSegment(Point3d p, Point3d q, Point3d r)
                => Math.Min(p.X, q.X) - 1e-9 <= r.X && r.X <= Math.Max(p.X, q.X) + 1e-9
                && Math.Min(p.Y, q.Y) - 1e-9 <= r.Y && r.Y <= Math.Max(p.Y, q.Y) + 1e-9;
        }
        // Ancla en el lado (segmento) más largo: punto medio + ángulo del segmento y longitud
        private static (Point3d mid, double ang) GetAnchorOnLongestSegment(List<Point3d> pts, bool closed, out double segLen)
        {
            segLen = 0;
            int segs = pts.Count - 1 + (closed ? 1 : 0);
            int imax = 0;
            for (int i = 0; i < segs; i++)
            {
                double li = HorizontalDistance(pts[i % pts.Count], pts[(i + 1) % pts.Count]);
                if (li > segLen) { segLen = li; imax = i; }
            }
            var a = pts[imax % pts.Count];
            var b = pts[(imax + 1) % pts.Count];
            var mid = new Point3d((a.X + b.X) / 2.0, (a.Y + b.Y) / 2.0, 0);
            double ang = Math.Atan2(b.Y - a.Y, b.X - a.X);
            return (mid, ang);
        }
        private static void ColocarLeaderConRecuadro(
            BlockTableRecord btr, Transaction tr,
            string texto, double h,
            Point3d anchorArriba, double ang,
            string outLayer)
        {
            // 1) MText multilínea (AutoCAD usa \P como salto de párrafo)
            var mtx = new MText
            {
                Contents = texto,          // ya vendrá con "\P" entre campos
                TextHeight = h,
                Attachment = AttachmentPoint.MiddleCenter,
                Location = anchorArriba
            };

            // 2) MLeader pegado al ancla (landing gap corto y dogleg corto)
            var mle = new MLeader
            {
                ContentType = ContentType.MTextContent,
                MText = mtx,
                Layer = outLayer,

                // acercar el contenido al vértice
                LandingGap = 0.10,   // <<----- equivalente al "Landing gap" del panel de propiedades
                DoglegLength = 0.10   // brazo cortico
            };

            int ln = mle.AddLeader();
            int li = mle.AddLeaderLine(ln);

            // primer vértice: en el ancla "arriba"
            mle.AddFirstVertex(li, anchorArriba);

            // segundo vértice: un toque hacia la dirección del tramo (0.5*h)
            var dx = Math.Cos(ang);
            var dy = Math.Sin(ang);
            var haciaTramo = new Point3d(
                anchorArriba.X + dx * (0.5 * h),
                anchorArriba.Y + dy * (0.5 * h),
                0);
            mle.AddLastVertex(li, haciaTramo);

            btr.AppendEntity(mle);
            tr.AddNewlyCreatedDBObject(mle, true);

            // (SIN recuadro)
        }
        // Orienta el BLOQUE de catálogo ubicado en el centro de extents coincidente con posNodo
        private static void OrientCsvBlockAt(Database db, Transaction tr, Point3d posNodo, double angRad)
        {
            if (TryGetCsvBlockAt(db, tr, posNodo, out var brCsv))
            {
                brCsv.UpgradeOpen();
                brCsv.Rotation = angRad;
                brCsv.DowngradeOpen();
            }
        }

        private static double Bisector(double aIn, double aOut)
        {
            // bisector robusto en [-pi, pi]
            double d = NormAng(aOut - aIn);
            return NormAng(aIn + d / 2.0);
        }
        private static double NormAng(double a)
        {
            while (a <= -Math.PI) a += 2 * Math.PI;
            while (a > Math.PI) a -= 2 * Math.PI;
            return a;
        }

        // Busca en la definición del bloque el DBText cuyo contenido sea "1A" o "1B"
        // y devuelve el vector (def-space) desde el basepoint del bloque hacia esa marca.
        private static bool TryGetMarkerVectorDef(Transaction tr, BlockReference br, string label, out Vector2d v)
        {
            v = new Vector2d(1, 0); // fallback
            var bdef = (BlockTableRecord)tr.GetObject(br.BlockTableRecord, OpenMode.ForRead);
            foreach (ObjectId id in bdef)
            {
                if (tr.GetObject(id, OpenMode.ForRead) is DBText t)
                {
                    var txt = (t.TextString ?? "").Trim();
                    if (txt.Equals(label, StringComparison.OrdinalIgnoreCase))
                    {
                        // En espacio de definición, el basepoint del bloque es (0,0,0)
                        var p = t.Position;
                        v = new Vector2d(p.X, p.Y);
                        if (v.Length < 1e-9) v = new Vector2d(1, 0);
                        return true;
                    }
                }
            }
            return false;
        }

        // Rotación necesaria para alinear la marca elegida con el ángulo objetivo (en WCS)
        private static double ComputeRotationFromMarker(Transaction tr, BlockReference br, string markerLabel, double targetAngleRad)
        {
            if (!TryGetMarkerVectorDef(tr, br, markerLabel, out var vDef))
                return targetAngleRad; // si no hay marca, caer en "mirar al tramo"

            var angDef = Math.Atan2(vDef.Y, vDef.X);  // ángulo del vector 1A/1B en el bloque (def-space)
                                                      // rot = objetivo - como-está-dibujado
            return NormAng(targetAngleRad - angDef);
        }
        // Distancia horizontal (solo XY), ignora Z
        private static double HorizontalDistance(Point3d a, Point3d b)
        {
            double dx = b.X - a.X;
            double dy = b.Y - a.Y;
            return Math.Sqrt(dx * dx + dy * dy);
        }
        // Devuelve los 4 vértices ortogonales A,B,C,D a partir de 3 puntos:
        // P1=Punto A, P2=Punto B (base) y P3 define el offset perpendicular.
        private static (Point3d A, Point3d B, Point3d C, Point3d D)
            BuildRectFrom3Points(Point3d p1, Point3d p2, Point3d p3)
        {
            var ax = p1.X; var ay = p1.Y;
            var bx = p2.X; var by = p2.Y;

            // vector base AB y unitarios
            double ux = bx - ax, uy = by - ay;
            double len = Math.Sqrt(ux * ux + uy * uy);
            if (len < 1e-9) return (p1, p2, p2, p1); // degenerado

            ux /= len; uy /= len;

            // perpendicular (rotar 90° ccw)
            double vx = -uy, vy = ux;

            // distancia perpendicular de P3 a la recta AB (con signo)
            double wx = p3.X - ax, wy = p3.Y - ay;
            double ancho = wx * vx + wy * vy; // proyección sobre la normal (signada)

            var A = new Point3d(ax, ay, 0);
            var B = new Point3d(bx, by, 0);
            var D = new Point3d(ax + vx * ancho, ay + vy * ancho, 0);
            var C = new Point3d(bx + vx * ancho, by + vy * ancho, 0);

            return (A, B, C, D);
        }
        private void ConfigurarAutoCompletarLayer()
        {
            try
            {
                var lista = new List<string>();
                using (_doc?.LockDocument())
                using (var tr = _doc?.Database?.TransactionManager?.StartTransaction())
                {
                    if (tr == null) return;
                    var lt = (LayerTable)tr.GetObject(_doc.Database.LayerTableId, OpenMode.ForRead);
                    foreach (ObjectId id in lt)
                    {
                        var ltr = (LayerTableRecord)tr.GetObject(id, OpenMode.ForRead);
                        if (!string.IsNullOrWhiteSpace(ltr.Name)) lista.Add(ltr.Name);
                    }
                    tr.Commit();
                }

                var acs = new AutoCompleteStringCollection();
                acs.AddRange(lista.OrderBy(s => s, StringComparer.OrdinalIgnoreCase).ToArray());

                // txtLayer es el nuevo TextBox que reemplaza al combo cbLayer
                txtLayer.AutoCompleteMode = AutoCompleteMode.SuggestAppend;
                txtLayer.AutoCompleteSource = AutoCompleteSource.CustomSource;
                txtLayer.AutoCompleteCustomSource = acs;
            }
            catch { /* tolerante */ }
        }

        private static double Norm2Pi(double a)
        {
            while (a < 0) a += 2 * Math.PI;
            while (a >= 2 * Math.PI) a -= 2 * Math.PI;
            return a;
        }
        private static bool IsBetweenCCW(double a1, double a2, double a3)
        {
            a1 = Norm2Pi(a1); a2 = Norm2Pi(a2); a3 = Norm2Pi(a3);
            if (a3 < a1) a3 += 2 * Math.PI;
            if (a2 < a1) a2 += 2 * Math.PI;
            return a2 >= a1 && a2 <= a3;
        }
        private static Arc BuildArcFrom3Points(Point3d p1, Point3d p2, Point3d p3, out bool ok)
        {
            ok = false;
            // Colinealidad rápida
            double area2 = (p2.X - p1.X) * (p3.Y - p1.Y) - (p2.Y - p1.Y) * (p3.X - p1.X);
            if (Math.Abs(area2) < 1e-9) return new Arc();

            var ca = new CircularArc3d(p1, p2, p3);
            var C = ca.Center;
            double r = ca.Radius;

            double a1 = Math.Atan2(p1.Y - C.Y, p1.X - C.X);
            double a2 = Math.Atan2(p2.Y - C.Y, p2.X - C.X);
            double a3 = Math.Atan2(p3.Y - C.Y, p3.X - C.X);

            // Barrida CCW que pase por p2; si no, usa la otra (equivale a invertir start/end)
            double start = a1, end = a3;
            if (!IsBetweenCCW(a1, a2, a3)) { start = a3; end = a1; }

            var arc = new Arc(C, Vector3d.ZAxis, r, start, end);
            ok = true;
            return arc;
        }
        // === Bloques: abrir diálogo, leer nodos y colocar bloque ===
        private void Insblock_Click(object sender, EventArgs e)
        {
            // Crear o reutilizar
            if (_dlgIns == null || _dlgIns.IsDisposed)
            {
                _dlgIns = new FrmInsertarBloque(_doc)
                {
                    TopMost = false,
                    ShowInTaskbar = true
                };
                _dlgInsWired = false; // fuerza re-cableo al crear de nuevo
            }

            var dlg = _dlgIns;

            // Cableo una sola vez
            if (!_dlgInsWired)
            {
                _dlgInsWired = true;

                dlg.InsertRequested += (_, args) =>
                {
                    try
                    {
                        var capa = (txtLayer?.Text ?? "0").Trim();
                        InsertarBloquePorNodos(args.BlockName, args.NodoLL, args.NodoLR, capa, dlg);
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show(dlg, "Error al insertar: " + ex.Message, "Bloques",
                                        MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                };

                dlg.UndoRequested += (_, __) =>
                {
                    try { DeshacerUltimaInsercion(); }
                    catch (Exception ex)
                    {
                        MessageBox.Show(dlg, "No se pudo deshacer: " + ex.Message, "Bloques",
                                        MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                };

                dlg.CanceledByUser += (_, __) =>
                {
                    if (!this.IsDisposed)
                    {
                        this.Show();
                        this.Activate();
                    }
                };
            }

            // Mostrar selector de bloques sin duplicar suscripciones
            this.Hide();
            dlg.Show();
            dlg.Activate();
        }


        private void InsertarBloquePorNodos(string blkName, int nodoLL, int nodoLR, string outLayer, FrmInsertarBloque owner)
        {
            {
                int nodoActualCreado = -1; // # de NODO creado en esta inserción

                using (_doc.LockDocument())
                using (var tr = _doc.Database.TransactionManager.StartTransaction())
                {
                    // 1) Nodos base
                    if (!TryGetPointByNode(_doc.Database, tr, nodoLL, out var pLL))
                        throw new Exception($"Nodo {nodoLL} no existe.");
                    if (!TryGetPointByNode(_doc.Database, tr, nodoLR, out var pLR))
                        throw new Exception($"Nodo {nodoLR} no existe.");

                    // 2) Bloque a insertar
                    var bt = (BlockTable)tr.GetObject(_doc.Database.BlockTableId, OpenMode.ForRead);
                    if (!bt.Has(blkName))
                        throw new Exception($"El bloque \"{blkName}\" no está en el dibujo.");

                    // 3) Capa salida
                    if (!string.IsNullOrWhiteSpace(outLayer))
                        EnsureLayer(_doc.Database, tr, outLayer, null);

                    // 4) Rotación base: LR→LL
                    double ang = Math.Atan2(pLL.Y - pLR.Y, pLL.X - pLR.X);

                    // 5) Insertar bloque principal en LL
                    var space = (BlockTableRecord)tr.GetObject(_doc.Database.CurrentSpaceId, OpenMode.ForWrite);
                    var br = new BlockReference(pLL, bt[blkName])
                    {
                        Rotation = ang,
                        ScaleFactors = new Scale3d(1, 1, 1),
                        Layer = string.IsNullOrWhiteSpace(outLayer) ? "0" : outLayer
                    };
                    space.AppendEntity(br);
                    tr.AddNewlyCreatedDBObject(br, true);
                    MarkAsCatalogBlock(tr, br);
                    var idCatalogo = br.ObjectId; // para deshacer

                    // 5.1 Atributos
                    var bdef = (BlockTableRecord)tr.GetObject(bt[blkName], OpenMode.ForRead);
                    if (bdef.HasAttributeDefinitions)
                    {
                        foreach (ObjectId id in bdef)
                        {
                            if (tr.GetObject(id, OpenMode.ForRead) is AttributeDefinition ad && !ad.Constant)
                            {
                                var ar = new AttributeReference
                                {
                                    Position = ad.Position.TransformBy(br.BlockTransform),
                                    Tag = ad.Tag,
                                    TextString = ad.TextString,
                                    Height = ad.Height,
                                    Rotation = ad.Rotation + ang,
                                    Layer = br.Layer
                                };
                                br.AttributeCollection.AppendAttribute(ar);
                                tr.AddNewlyCreatedDBObject(ar, true);
                            }
                        }
                    }

                    // 6) Centro WCS del bloque insertado
                    br.RecordGraphicsModified(true);
                    Extents3d ext = br.GeometricExtents;
                    var pMid = new Point3d(
                        (ext.MinPoint.X + ext.MaxPoint.X) * 0.5,
                        (ext.MinPoint.Y + ext.MaxPoint.Y) * 0.5,
                        0);

                    // 7) Insertar BLOQUE NODO y numerarlo
                    if (!TryGetNodeBlockName(_doc.Database, tr, out string nodeBlkName))
                        throw new Exception("No se encontró un bloque de NODO con atributo 'NODO'.");

                    // capas dedicadas con color fijo
                    const string LYR_NODO_SIMB = "SIC_NODO_SIMBOLO";
                    const string LYR_NODO_NUM = "SIC_NODO_NUM";
                    const string LYR_NODO_DESC = "SIC_NODO_DESC";
                    var cVerde = Autodesk.AutoCAD.Colors.Color.FromColorIndex(ColorMethod.ByAci, 3);
                    var cRojo = Autodesk.AutoCAD.Colors.Color.FromColorIndex(ColorMethod.ByAci, 1);
                    var cAzul = Autodesk.AutoCAD.Colors.Color.FromColorIndex(ColorMethod.ByAci, 5);
                    EnsureLayerForceColor(_doc.Database, tr, LYR_NODO_SIMB, cVerde);
                    EnsureLayerForceColor(_doc.Database, tr, LYR_NODO_NUM, cRojo);
                    EnsureLayerForceColor(_doc.Database, tr, LYR_NODO_DESC, cAzul);

                    // número a usar (max+1)
                    nodoActualCreado = GetNextNodeNumber(_doc.Database, tr);

                    var idNodo = InsertNodeSymbol(
                        _doc.Database, tr, space,
                        nodeBlkName,
                        pos: pMid,
                        numero: nodoActualCreado,
                        desc: blkName,
                        textHeight: 0.15,
                        offset: 0.15,
                        layerSimbolo: LYR_NODO_SIMB,
                        layerNumero: LYR_NODO_NUM,
                        layerDesc: LYR_NODO_DESC
                    );

                    // registrar ids para deshacer
                    _ultimaInsercionIds = new List<ObjectId> { idCatalogo, idNodo };

                    tr.Commit();
                }

                try { _doc.Editor.Regen(); _doc.Editor.UpdateScreen(); acApp.UpdateScreen(); } catch { }

                // 8) Unir opcionalmente con otro nodo — SIN abrir más formularios
                string layerJoin = string.IsNullOrWhiteSpace(outLayer) ? "0" : outLayer;

                // Desenganchar handlers previos para evitar duplicados
                owner.UnirRequested -= Owner_UnirRequested;
                owner.InsertRequested -= Owner_InsertRequested;

                // Re-enganchar handlers locales
                owner.UnirRequested += Owner_UnirRequested;
                owner.InsertRequested += Owner_InsertRequested;

                // Si existe “último nodo”, ofrecer unirlo
                if (_ultimoNodoInsertado.HasValue)
                {
                    var unirUlt = MessageBox.Show(
                        "¿Desea unir este bloque con el último que insertaste?",
                        "SICOE", MessageBoxButtons.YesNo, MessageBoxIcon.Question);

                    if (unirUlt == DialogResult.Yes)
                    {
                        var nodoDestino = _ultimoNodoInsertado.Value;
                        UnirYEtiquetarBloques(_doc, nodoDestino, nodoActualCreado, layerJoin);
                        _ultimoNodoInsertado = nodoActualCreado;
                        return;
                    }
                }

                // Activar modo “Unir con OTRO nodo” en el MISMO formulario si el usuario quiere
                var unirOtro = MessageBox.Show(
                    "¿Desea unir este bloque con OTRO nodo existente?",
                    "SICOE", MessageBoxButtons.YesNo, MessageBoxIcon.Question);

                if (unirOtro == DialogResult.Yes)
                {
                    owner.SetModoUnir(); // habilita la caja roja y deshabilita los campos superiores
                }

                // ---- handlers locales ----
                void Owner_UnirRequested(object? s, FrmInsertarBloque.UnirArgs e)
                {
                    try
                    {
                        using (_doc.LockDocument())
                        using (var tr = _doc.Database.TransactionManager.StartTransaction())
                        {
                            if (!TryGetPointByNode(_doc.Database, tr, e.NodoDestino, out var _))
                            {
                                MessageBox.Show("El NODO especificado no existe.", "SICOE",
                                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                                tr.Commit();
                                return;
                            }
                            tr.Commit();
                        }

                        UnirYEtiquetarBloques(_doc, e.NodoDestino, nodoActualCreado, layerJoin);
                        owner.ResetModoNormal();
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show("Error uniendo/etiquetando: " + ex.Message, "SICOE",
                            MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                    finally
                    {
                        owner.UnirRequested -= Owner_UnirRequested; // limpia para no duplicar
                    }
                }

                void Owner_InsertRequested(object? s, FrmInsertarBloque.InsertArgs e)
                {
                    // No hacer nada aquí para evitar recursión
                }

                // actualizar el “último” SIEMPRE al final
                _ultimoNodoInsertado = nodoActualCreado;
            }


        }
        private void DeshacerUltimaInsercion()
        {
            if (_ultimaInsercionIds == null || _ultimaInsercionIds.Count == 0) return;

            using (_doc.LockDocument())
            using (var tr = _doc.Database.TransactionManager.StartTransaction())
            {
                foreach (var id in _ultimaInsercionIds.Distinct())
                {
                    if (!id.IsValid) continue;
                    var dbobj = tr.GetObject(id, OpenMode.ForWrite, false) as Entity;
                    if (dbobj != null && !dbobj.IsErased) dbobj.Erase();
                }
                tr.Commit();
            }
            try { _doc.Editor.Regen(); _doc.Editor.UpdateScreen(); acApp.UpdateScreen(); } catch { }

            _ultimaInsercionIds.Clear();
            _ultimoNodoInsertado = null; // evita uniones con un nodo ya deshecho
        }



        // Listar nombres de bloques válidos (sin anónimos, sin xref, sin layouts)
        internal static List<string> GetBlockNames(Database db, Transaction tr)
        {
            var r = new List<string>();
            var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
            foreach (ObjectId id in bt)
            {
                var btr = (BlockTableRecord)tr.GetObject(id, OpenMode.ForRead);
                if (btr.IsLayout || btr.IsAnonymous || btr.IsFromExternalReference || btr.IsDependent) continue;
                if (!string.IsNullOrWhiteSpace(btr.Name)) r.Add(btr.Name);
            }
            r.Sort(StringComparer.OrdinalIgnoreCase);
            return r;
        }
        // Busca en la tabla de bloques uno cuya DEFINICIÓN tenga un AttributeDefinition con tag "NODO".
        private static bool TryGetNodeBlockName(Database db, Transaction tr, out string name)
        {
            name = null;
            var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
            foreach (ObjectId id in bt)
            {
                var btr = (BlockTableRecord)tr.GetObject(id, OpenMode.ForRead);
                if (btr.IsLayout || btr.IsFromExternalReference) continue;
                bool hasNodo = false;
                foreach (ObjectId eid in btr)
                {
                    if (tr.GetObject(eid, OpenMode.ForRead) is AttributeDefinition ad &&
                        ad.Tag.Equals("NODO", StringComparison.OrdinalIgnoreCase))
                    { hasNodo = true; break; }
                }
                if (hasNodo) { name = btr.Name; return true; }
            }
            return false;
        }

        // Devuelve la capa de un NODO existente, para reutilizarla.
        private static string GetSampleNodeLayer(Database db, Transaction tr)
        {
            var space = (BlockTableRecord)tr.GetObject(db.CurrentSpaceId, OpenMode.ForRead);
            foreach (ObjectId id in space)
            {
                if (tr.GetObject(id, OpenMode.ForRead) is BlockReference br &&
                    br.AttributeCollection != null && br.AttributeCollection.Count > 0)
                {
                    foreach (ObjectId aid in br.AttributeCollection)
                    {
                        if (tr.GetObject(aid, OpenMode.ForRead) is AttributeReference ar &&
                            ar.Tag.Equals("NODO", StringComparison.OrdinalIgnoreCase))
                            return br.Layer;
                    }
                }
            }
            return null;
        }

        // Busca el máximo número de NODO y retorna max+1. Si no hay, retorna 1.
        private static int GetNextNodeNumber(Database db, Transaction tr)
        {
            int max = 0;
            var space = (BlockTableRecord)tr.GetObject(db.CurrentSpaceId, OpenMode.ForRead);
            foreach (ObjectId id in space)
            {
                if (tr.GetObject(id, OpenMode.ForRead) is BlockReference br &&
                    br.AttributeCollection != null && br.AttributeCollection.Count > 0)
                {
                    foreach (ObjectId aid in br.AttributeCollection)
                    {
                        if (tr.GetObject(aid, OpenMode.ForRead) is AttributeReference ar &&
                            ar.Tag.Equals("NODO", StringComparison.OrdinalIgnoreCase) &&
                            int.TryParse(ar.TextString?.Trim(), out int n))
                        { if (n > max) max = n; }
                    }
                }
            }
            return max + 1;
        }

        // Inserta SOLO el bloque del nodo y escribe sus atributos (NODO y DESC)
        // Acerca los textos al símbolo usando "offset".
        private static ObjectId InsertNodeSymbol(

            Database db, Transaction tr, BlockTableRecord space,
            string nodeBlkName,
            Point3d pos, int numero, string desc,
            double textHeight, double offset,
            string layerSimbolo, string layerNumero, string layerDesc)
        {
            var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);

            // 1) Insertar el bloque del nodo
            var brN = new BlockReference(pos, bt[nodeBlkName])
            {
                Layer = layerSimbolo,
                Rotation = 0.0,
                // escala proporcional si tu símbolo fue dibujado a 0.15
                ScaleFactors = new Scale3d(textHeight * 0.1 / 0.15)

            };
            space.AppendEntity(brN);
            tr.AddNewlyCreatedDBObject(brN, true);

            // 2) Crear los atributos del bloque (NODO y DESC) SIN DBText externos
            var bdef = (BlockTableRecord)tr.GetObject(bt[nodeBlkName], OpenMode.ForRead);
            if (bdef.HasAttributeDefinitions)
            {
                foreach (ObjectId id in bdef)
                {
                    if (tr.GetObject(id, OpenMode.ForRead) is not AttributeDefinition ad || ad.Constant)
                        continue;

                    // Clonar definición → referencia
                    var ar = new AttributeReference();
                    ar.SetAttributeFromBlock(ad, brN.BlockTransform);

                    // Forzar altura y capa por tipo
                    ar.Height = textHeight;

                    // NODO arriba, centrado
                    if (ad.Tag.Equals("NODO", StringComparison.OrdinalIgnoreCase))
                    {
                        ar.Tag = ad.Tag;
                        ar.TextString = numero.ToString();
                        ar.Layer = string.IsNullOrWhiteSpace(layerNumero) ? layerSimbolo : layerNumero;

                        // Reposicionar relativo al punto del bloque
                        ar.Position = new Point3d(pos.X, pos.Y + offset, 0);
                        ar.AlignmentPoint = ar.Position;
                        ar.HorizontalMode = TextHorizontalMode.TextCenter;
                        ar.VerticalMode = TextVerticalMode.TextVerticalMid;
                    }
                    // DESC/DESCRIPCION abajo, centrado
                    else if (ad.Tag.Equals("DESC", StringComparison.OrdinalIgnoreCase) ||
                             ad.Tag.Equals("DESCRIPCION", StringComparison.OrdinalIgnoreCase))
                    {
                        ar.Tag = ad.Tag;
                        ar.TextString = desc ?? string.Empty;
                        ar.Layer = string.IsNullOrWhiteSpace(layerDesc) ? layerSimbolo : layerDesc;

                        ar.Position = new Point3d(pos.X, pos.Y - offset, 0);
                        ar.AlignmentPoint = ar.Position;
                        ar.HorizontalMode = TextHorizontalMode.TextCenter;
                        ar.VerticalMode = TextVerticalMode.TextVerticalMid;
                    }
                    else
                    {
                        // Otros atributos del bloque (si los hay)
                        ar.Layer = layerSimbolo;
                    }

                    brN.AttributeCollection.AppendAttribute(ar);
                    tr.AddNewlyCreatedDBObject(ar, true);
                }
            }

            // 3) NO crear DBText externos. Todo queda dentro del bloque.
            return brN.ObjectId;

        }

        private static void EnsureLayerForceColor(Database db, Transaction tr, string layerName, Autodesk.AutoCAD.Colors.Color color)
        {
            var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
            if (!lt.Has(layerName))
            {
                lt.UpgradeOpen();
                var ltr = new LayerTableRecord { Name = layerName, Color = color };
                lt.Add(ltr);
                tr.AddNewlyCreatedDBObject(ltr, true);
                return;
            }
            // existe → actualizar color
            var ltrEx = (LayerTableRecord)tr.GetObject(lt[layerName], OpenMode.ForWrite);
            ltrEx.Color = color;
        }
        // Bloque del NODO en esa posición (sí tiene atributo NODO)
        private static bool TryGetNodeBlockAt(Database db, Transaction tr, Point3d posNodo, out BlockReference brOut)
        {
            brOut = null;
            const double EPS = 1e-6;
            var btr = (BlockTableRecord)tr.GetObject(db.CurrentSpaceId, OpenMode.ForRead);
            foreach (ObjectId id in btr)
            {
                if (tr.GetObject(id, OpenMode.ForRead) is not BlockReference br) continue;
                if (br.Position.DistanceTo(posNodo) > EPS) continue;

                bool esNodo = false;
                if (br.AttributeCollection != null && br.AttributeCollection.Count > 0)
                {
                    foreach (ObjectId aid in br.AttributeCollection)
                    {
                        if (tr.GetObject(aid, OpenMode.ForRead) is not AttributeReference ar) continue;
                        if (ar.Tag.Equals("NODO", StringComparison.OrdinalIgnoreCase)) { esNodo = true; break; }
                    }
                }
                if (!esNodo) continue;

                brOut = br;
                return true;
            }
            return false;
        }




        private const string CAT_MARK_KEY = "SICOE_CATBLK";

        private static void MarkAsCatalogBlock(Transaction tr, BlockReference br)
        {
            br.UpgradeOpen();
            if (!br.ExtensionDictionary.IsValid) br.CreateExtensionDictionary();
            var dict = (DBDictionary)tr.GetObject(br.ExtensionDictionary, OpenMode.ForWrite);

            if (!dict.Contains(CAT_MARK_KEY))
            {
                var xr = new Xrecord { Data = new ResultBuffer(new TypedValue((int)DxfCode.Text, "1")) };
                dict.SetAt(CAT_MARK_KEY, xr);
                tr.AddNewlyCreatedDBObject(xr, true);
            }
            br.DowngradeOpen();
        }

        private static bool HasCatalogMark(Transaction tr, BlockReference br)
        {
            try
            {
                if (!br.ExtensionDictionary.IsValid) return false;
                var dict = (DBDictionary)tr.GetObject(br.ExtensionDictionary, OpenMode.ForRead);
                return dict.Contains(CAT_MARK_KEY);
            }
            catch { return false; }
        }
        private static void OrientNodeBlockAt(Database db, Transaction tr, Point3d posNodo, double angRad)
        {
            if (TryGetNodeBlockAt(db, tr, posNodo, out var brNodo))
            {
                brNodo.UpgradeOpen();
                brNodo.Rotation = angRad;
                brNodo.DowngradeOpen();
            }
        }
        // Unión y etiquetado sin depender del formulario (no usa 'this')
        public static void UnirYEtiquetarBloques(
            Autodesk.AutoCAD.ApplicationServices.Document doc,
            int nodoA, int nodoB, string outLayer)
        {
            using (doc.LockDocument())
            using (var tr = doc.Database.TransactionManager.StartTransaction())
            {
                // 1) Centros de los NODOS
                if (!TryGetPointByNode(doc.Database, tr, nodoA, out var pA))
                    throw new System.Exception($"Nodo {nodoA} no existe.");
                if (!TryGetPointByNode(doc.Database, tr, nodoB, out var pB))
                    throw new System.Exception($"Nodo {nodoB} no existe.");

                // 2) Capa y espacio
                EnsureLayer(doc.Database, tr, string.IsNullOrWhiteSpace(outLayer) ? "0" : outLayer, null);
                var btr = (BlockTableRecord)tr.GetObject(doc.Database.CurrentSpaceId, OpenMode.ForWrite);

                // 3) Recorte real
                var pAout = GetTrimmedPoint(doc.Database, tr, pA, pB);
                var pBin = GetTrimmedPoint(doc.Database, tr, pB, pA);

                // 4) Línea útil
                // Extiende levemente para asegurar contacto con el borde
                const double EPS = 2e-3; // 1 mm si trabajas en metros; ajusta si usas otras unidades
                var dir = new Vector2d(pBin.X - pAout.X, pBin.Y - pAout.Y);
                var len = Math.Max(Math.Sqrt(dir.X * dir.X + dir.Y * dir.Y), 1e-9);
                var ux = dir.X / len;
                var uy = dir.Y / len;

                var pIni = new Point3d(pAout.X - ux * EPS, pAout.Y - uy * EPS, 0);
                var pFin = new Point3d(pBin.X + ux * EPS, pBin.Y + uy * EPS, 0);

                var ln = new Line(pIni, pFin) { Layer = string.IsNullOrWhiteSpace(outLayer) ? "0" : outLayer };
                btr.AppendEntity(ln);
                tr.AddNewlyCreatedDBObject(ln, true);


                // 5) Lt/Lu
                double luSeg = HorizontalDistance(pAout, pBin);  // útil
                double ltSeg = HorizontalDistance(pA, pB);    // total

                if (luSeg > 1e-6)
                {
                    var mid = new Point3d((pAout.X + pBin.X) * 0.5, (pAout.Y + pBin.Y) * 0.5, 0);
                    double ang = Math.Atan2(pBin.Y - pAout.Y, pBin.X - pAout.X);
                    string rumbo = CalcularRumbo(pAout, pBin);

                    using var dlg = new FrmEtiquetaLinea(ltSeg, rumbo, luSeg)
                    {
                        Text = $"Etiqueta del tramo {nodoA} - {nodoB}"
                    };

                    // NUNCA usar ShowDialog(this) aquí
                    if (dlg.ShowDialog() == DialogResult.OK)
                    {
                        string texto = dlg.BuildEtiquetaText();
                        // === ETIQUETAS DE NODOS EN EL EJE (LONGITUD TOTAL) ===
                        var nodoIniFull = string.IsNullOrWhiteSpace(dlg.NodoIniText) ? "" : $"{dlg.PrefIniText}-{dlg.NodoIniText}";
                        var nodoFinFull = string.IsNullOrWhiteSpace(dlg.NodoFinText) ? "" : $"{dlg.PrefFinText}-{dlg.NodoFinText}";

                        if (!string.IsNullOrWhiteSpace(nodoIniFull) || !string.IsNullOrWhiteSpace(nodoFinFull))
                        {
                            var db = Autodesk.AutoCAD.ApplicationServices.Application.DocumentManager.MdiActiveDocument.Database;
                            using (var trN = db.TransactionManager.StartTransaction())
                            {
                                string capaSalida = string.IsNullOrWhiteSpace(outLayer) ? "0" : outLayer;
                                EnsureLayer(db, trN, capaSalida, null);

                                var btrN = (Autodesk.AutoCAD.DatabaseServices.BlockTableRecord)
                                           trN.GetObject(db.CurrentSpaceId, Autodesk.AutoCAD.DatabaseServices.OpenMode.ForWrite);

                                double angAB = Math.Atan2(pB.Y - pA.Y, pB.X - pA.X);
                                double hTxt = dlg.AlturaTexto; if (hTxt <= 0) hTxt = 0.05;

                                if (!string.IsNullOrWhiteSpace(nodoIniFull))
                                {
                                    var t = new Autodesk.AutoCAD.DatabaseServices.DBText();
                                    t.SetDatabaseDefaults();
                                    t.TextString = nodoIniFull;
                                    t.Height = hTxt;
                                    t.Layer = capaSalida;
                                    t.Rotation = angAB;
                                    t.Position = new Autodesk.AutoCAD.Geometry.Point3d(pA.X, pA.Y, 0);
                                    t.HorizontalMode = Autodesk.AutoCAD.DatabaseServices.TextHorizontalMode.TextCenter;
                                    t.VerticalMode = Autodesk.AutoCAD.DatabaseServices.TextVerticalMode.TextVerticalMid;
                                    t.AlignmentPoint = new Autodesk.AutoCAD.Geometry.Point3d(pA.X, pA.Y, 0);
                                    btrN.AppendEntity(t);
                                    trN.AddNewlyCreatedDBObject(t, true);
                                    t.AdjustAlignment(db);
                                }

                                if (!string.IsNullOrWhiteSpace(nodoFinFull))
                                {
                                    var t = new Autodesk.AutoCAD.DatabaseServices.DBText();
                                    t.SetDatabaseDefaults();
                                    t.TextString = nodoFinFull;
                                    t.Height = hTxt;
                                    t.Layer = capaSalida;
                                    t.Rotation = angAB;
                                    t.Position = new Autodesk.AutoCAD.Geometry.Point3d(pB.X, pB.Y, 0);
                                    t.HorizontalMode = Autodesk.AutoCAD.DatabaseServices.TextHorizontalMode.TextCenter;
                                    t.VerticalMode = Autodesk.AutoCAD.DatabaseServices.TextVerticalMode.TextVerticalMid;
                                    t.AlignmentPoint = new Autodesk.AutoCAD.Geometry.Point3d(pB.X, pB.Y, 0);
                                    btrN.AppendEntity(t);
                                    trN.AddNewlyCreatedDBObject(t, true);
                                    t.AdjustAlignment(db);
                                }
                                trN.Commit();
                            }
                        }

                        double h = dlg.AlturaTexto;


                        double estimAncho = texto.Length * 0.6 * h;
                        bool cabe = estimAncho <= luSeg * 0.9;

                        // separar el texto de la línea para evitar que “se monte”
                        const double OFF_FACT = 1.6;   // 1.6*h ≈ despeje claro
                        double nx = -Math.Sin(ang), ny = Math.Cos(ang);
                        var arriba = new Point3d(mid.X + nx * h * OFF_FACT, mid.Y + ny * h * OFF_FACT, 0);


                        if (cabe)
                        {
                            var mt = new MText
                            {
                                Contents = texto,
                                TextHeight = h,
                                Location = arriba,
                                Rotation = ang,
                                Attachment = AttachmentPoint.MiddleCenter,
                                Layer = string.IsNullOrWhiteSpace(outLayer) ? "0" : outLayer,

                                // máscara ligera para que la línea no atraviese el texto
                                BackgroundFill = true,
                                UseBackgroundColor = true,
                                BackgroundScaleFactor = 1.15
                            };
                            btr.AppendEntity(mt);
                            tr.AddNewlyCreatedDBObject(mt, true);
                        }
                        else
                        {
                            ColocarLeaderConRecuadro(btr, tr, texto, h, arriba, ang,
                                string.IsNullOrWhiteSpace(outLayer) ? "0" : outLayer);
                        }
                    }
                }

                tr.Commit();
            }

            try { doc.Editor.Regen(); doc.Editor.UpdateScreen(); acApp.UpdateScreen(); } catch { }
        }
        // Recorta el tramo en la cara del BLOQUE CATÁLOGO; si falla, intenta con el bloque NODO;
        // si no hay bloque, no recorta. Usa intersección rayo–cara del rectángulo del definition.
        private static Point3d GetTrimmedPoint(
            Database db,
            Transaction tr,
            Point3d posNodo,
            Point3d hacia)
        {
            // Dirección del rayo
            var dir = new Vector3d(hacia.X - posNodo.X, hacia.Y - posNodo.Y, 0);
            if (dir.Length < 1e-6) return posNodo;

            // 1) Prioridad: bloque de catálogo (el que representa CSxxx, etc.)
            if (TryGetCsvBlockAt(db, tr, posNodo, out var brCsv))
            {
                if (RayHitBlockFace(tr, brCsv, posNodo, hacia, out var hitCsv))
                    return hitCsv;
            }

            // 2) Alternativa: bloque del NODO
            if (TryGetNodeBlockAt(db, tr, posNodo, out var brNodo))
            {
                if (RayHitBlockFace(tr, brNodo, posNodo, hacia, out var hitNodo))
                    return hitNodo;
            }

            // 3) Sin bloque: no recorta
            return posNodo;
        }
        // Interseca un rayo (from→toward) con la CARA del bloque (en WCS) usando
        // el rectángulo de la definición transformado por el BlockTransform.
        // Devuelve el impacto más cercano con t>0.
        private static bool RayHitBlockFace(
            Transaction tr,
            BlockReference br,
            Point3d from,
            Point3d toward,
            out Point3d hit)
        {
            hit = Point3d.Origin;

            // 1) Extents de la DEFINICIÓN del bloque (en su SCU local)
            var bdef = (BlockTableRecord)tr.GetObject(br.BlockTableRecord, OpenMode.ForRead);
            Extents3d defExt;
            try
            {
                // calcular extents acumulando las entidades de la definición
                var acc = new Extents3d();
                bool first = true;
                foreach (ObjectId id in bdef)
                {
                    if (!id.IsValid) continue;
                    if (tr.GetObject(id, OpenMode.ForRead) is Entity ent)
                    {
                        try
                        {
                            var e = ent.GeometricExtents;
                            if (first) { acc = e; first = false; }
                            else acc.AddExtents(e);
                        }
                        catch { /* entidades sin extents */ }
                    }
                }
                if (first) return false; // definición vacía
                defExt = acc;
            }
            catch { return false; }

            // 2) Rectángulo de la definición llevado a WCS con la transformación de la instancia
            var m = br.BlockTransform;
            var p0 = new Point3d(defExt.MinPoint.X, defExt.MinPoint.Y, 0.0).TransformBy(m);
            var p1 = new Point3d(defExt.MaxPoint.X, defExt.MinPoint.Y, 0.0).TransformBy(m);
            var p2 = new Point3d(defExt.MaxPoint.X, defExt.MaxPoint.Y, 0.0).TransformBy(m);
            var p3 = new Point3d(defExt.MinPoint.X, defExt.MaxPoint.Y, 0.0).TransformBy(m);

            // 3) Rayo en 2D
            var dir = new Vector2d(toward.X - from.X, toward.Y - from.Y);
            var dlen = Math.Sqrt(dir.X * dir.X + dir.Y * dir.Y);
            if (dlen < 1e-9) return false;
            var ux = dir.X / dlen;
            var uy = dir.Y / dlen;

            // 4) Intersección rayo-segmento (devuelve t>0)
            static bool RaySegHit(Point3d rf, double ux, double uy, Point3d a, Point3d b, out double t, out Point3d ph)
            {
                t = 0; ph = Point3d.Origin;
                double x1 = a.X, y1 = a.Y, x2 = b.X, y2 = b.Y;
                double rx = ux, ry = uy;
                double sx = x2 - x1, sy = y2 - y1;

                double det = (-rx * sy + ry * sx);
                if (Math.Abs(det) < 1e-12) return false; // paralelos

                double t1 = (-sy * (x1 - rf.X) + sx * (y1 - rf.Y)) / det;
                double u1 = (-ry * (x1 - rf.X) + rx * (y1 - rf.Y)) / det;

                if (t1 > 1e-9 && u1 >= -1e-9 && u1 <= 1 + 1e-9)
                {
                    t = t1;
                    ph = new Point3d(rf.X + rx * t1, rf.Y + ry * t1, 0);
                    return true;
                }
                return false;
            }

            // 5) Probar contra las 4 caras y tomar el impacto más cercano
            double bestT = double.MaxValue; Point3d best = Point3d.Origin; bool ok = false;
            (Point3d A, Point3d B)[] edges = new[] { (p0, p1), (p1, p2), (p2, p3), (p3, p0) };
            foreach (var (A, B) in edges)
            {
                if (RaySegHit(from, ux, uy, A, B, out double t, out Point3d ph))
                {
                    if (t < bestT) { bestT = t; best = ph; ok = true; }
                }
            }
            if (ok) hit = best;
            return ok;
        }
        #region Helpers de recorte por CARA del bloque

        // Extents del "definition" del bloque (en espacio de bloque), ignorando atributos.
        // Se devuelve true si se pudo calcular.
        private static bool TryGetDefinitionExtents(Transaction tr, BlockReference br, out Extents3d defExt)
        {
            defExt = default;
            bool has = false;

            var bdef = (BlockTableRecord)tr.GetObject(br.BlockTableRecord, OpenMode.ForRead);
            foreach (ObjectId id in bdef)
            {
                if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent) continue;
                if (ent is AttributeDefinition) continue;

                try
                {
                    var ex = ent.GeometricExtents;
                    if (!has) { defExt = ex; has = true; }
                    else { defExt.AddExtents(ex); }
                }
                catch { /* entidades sin extents */ }
            }
            return has;
        }

        // Intersección exacta rayo–CARA del bloque (rectángulo del definition transformado por BlockTransform).

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                this.Show();       // asegurar visible
                this.Activate();
                return;
            }
            base.OnFormClosing(e);
        }


        #endregion


    }
}
