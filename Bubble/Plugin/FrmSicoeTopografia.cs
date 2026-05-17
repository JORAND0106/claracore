using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Windows.Forms;
using acApp = Autodesk.AutoCAD.ApplicationServices.Application;
// Alias para evitar conflicto con Autodesk.DatabaseServices.DataTable
using WinDataTable = System.Data.DataTable;

namespace SicoePresupuestoNET8
{
    public partial class FrmSicoeTopografia : Form
    {
        private readonly Document _doc;
        private readonly Timer _liveTimer = new Timer { Interval = 800 }; // 0.8 s
        private FrmDuplicados? _frmDuplicados;

        public FrmSicoeTopografia()
        {
            InitializeComponent();

            // Wire-up UI
            btnSeleccionarCsv.Click += BtnSeleccionarCsv_Click;
            btnImportar.Click += BtnImportar_Click;
            btnUnir1.Click += BtnUnir_Click;
            DelDuplicate.Click += DelDuplicate_Click;

            rdbXYZ.Checked = true;
            lblEstado.Text = "Listo para importar.";

            _doc = acApp.DocumentManager.MdiActiveDocument;

            // Cargar contador inicial desde dibujo (escaneo + xrecord)
            try
            {
                using (_doc.LockDocument())
                using (var tr = _doc.Database.TransactionManager.StartTransaction())
                {
                    Tx_Contador.Text = ComputeNextFromDrawing(_doc.Database, tr).ToString();
                    tr.Commit();
                }
            }
            catch { Tx_Contador.Text = "1"; }

            // Normaliza entrada manual
            Tx_Contador.Leave += (s, e) =>
            {
                if (!int.TryParse(Tx_Contador.Text?.Trim(), out var n) || n < 1)
                    Tx_Contador.Text = "1";
            };

            // Actualización en vivo (no bloquea navegación)
            _liveTimer.Tick += (s, e) =>
            {
                try
                {
                    using (_doc.LockDocument())
                    using (var tr = _doc.Database.TransactionManager.StartTransaction())
                    {
                        var next = ComputeNextFromDrawing(_doc.Database, tr);
                        if (!Tx_Contador.Focused) // no sobrescribir si el usuario está editando
                            Tx_Contador.Text = next.ToString();
                        tr.Commit();
                    }
                }
                catch { /* silencioso */ }
            };
            _liveTimer.Start();

            // Limpieza al cerrar
            this.FormClosed += (s, e) => _liveTimer?.Stop();
        }

        private FrmUnirPuntos _frmUnir;   // instancia modeless reutilizable
        #region UI events
        private void BtnSeleccionarCsv_Click(object sender, EventArgs e)
        {
            using var ofd = new OpenFileDialog
            {
                Title = "Seleccionar archivo CSV",
                Filter = "CSV (*.csv)|*.csv|Texto (*.txt)|*.txt|Todos (*.*)|*.*",
                RestoreDirectory = true
            };
            if (ofd.ShowDialog(this) == DialogResult.OK)
            {
                txtRutaCsv.Text = ofd.FileName;
                try
                {
                    var dt = BuildEmptyPreview();
                    LoadCsvPreview(ofd.FileName, chkTieneEncabezado.Checked, formatoEsteNorte: rdbYXZ.Checked, dt);
                    dgvPreview.DataSource = dt;
                    lblEstado.Text = $"Cargadas {dt.Rows.Count} filas para previsualización.";
                }
                catch (Exception ex)
                {
                    MessageBox.Show(this, "Error leyendo CSV: " + ex.Message, "Topografía", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
        }

        private void BtnImportar_Click(object sender, EventArgs e)
        {
            try
            {
                lblEstado.Text = "Importando…";
                lblEstado.Refresh();

                var csvPath = txtRutaCsv.Text?.Trim();
                if (string.IsNullOrWhiteSpace(csvPath) || !File.Exists(csvPath))
                {
                    MessageBox.Show(this, "Selecciona un CSV válido.", "Topografía",
                        MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                bool tieneHeader = chkTieneEncabezado.Checked;
                bool formatoEsteNorte = rdbYXZ.Checked; // true => ESTE,NORTE,COTA ; false => NORTE,ESTE,COTA
                double altura = (double)nudAltura.Value;

                // Leer “desde qué número empezar” ingresado por el usuario
                int? startFrom = null;
                if (int.TryParse(Tx_Contador.Text?.Trim(), out var val) && val > 0)
                    startFrom = val;

                var doc = acApp.DocumentManager.MdiActiveDocument;

                int finalNext;
                using (_doc.LockDocument())
                {
                    finalNext = ImportarCsvComoCadPoints(_doc, csvPath, tieneHeader, formatoEsteNorte, altura, startFrom);
                }
                // Refresca desde dibujo para que coincida si otros módulos también insertaron nodos
                using (_doc.LockDocument())
                using (var tr = _doc.Database.TransactionManager.StartTransaction())
                {
                    Tx_Contador.Text = ComputeNextFromDrawing(_doc.Database, tr).ToString();
                    tr.Commit();
                }


                lblEstado.Text = "Importación completada.";
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "Error importando puntos: " + ex.Message,
                    "Topografía", MessageBoxButtons.OK, MessageBoxIcon.Error);
                lblEstado.Text = "Error.";
            }
        }

        #endregion
        // ----------------- UNIR (Line / Polyline) -----------------
        private void BtnUnir_Click(object sender, EventArgs e)
        {
            var doc = acApp.DocumentManager.MdiActiveDocument;

            if (_frmUnir == null || _frmUnir.IsDisposed)
            {
                _frmUnir = new FrmUnirPuntos(doc)
                {
                    TopMost = true,          // siempre visible sobre AutoCAD
                    ShowInTaskbar = false    // no ocupa la barra de tareas
                };

                // abrir como NO modal dentro de AutoCAD
                acApp.ShowModelessDialog(_frmUnir);
            }
            else
            {
                if (!_frmUnir.Visible) _frmUnir.Show();
                _frmUnir.TopMost = true;
                _frmUnir.Activate();         // traer al frente
            }
        }
        // DelDuplicate_Click - pegar método completo
        private void DelDuplicate_Click(object? sender, EventArgs e)
        {
            var doc = Autodesk.AutoCAD.ApplicationServices.Application.DocumentManager.MdiActiveDocument;
            var ed = doc.Editor;
            var db = doc.Database;

            try
            {
                // 1) Si ya hay formulario abierto, solo lo traemos al frente y salimos.
                if (_frmDuplicados != null && !_frmDuplicados.IsDisposed)
                {
                    _frmDuplicados.WindowState = FormWindowState.Normal;
                    _frmDuplicados.BringToFront();
                    _frmDuplicados.Focus();
                    return;
                }

                // 2) Pedir selección una sola vez por flujo
                var pso = new PromptSelectionOptions
                {
                    MessageForAdding = "\nSeleccione bloques con NODO/DESC (Ventana/Cruz/Click). Enter para finalizar:",
                    MessageForRemoval = "\nQuite de la selección:"
                };

                var res = ed.GetSelection(pso, TopoHelpers.BlockRefFilter());
                if (res.Status != PromptStatus.OK)
                {
                    ed.WriteMessage("\nOperación cancelada.");
                    return;
                }

                var raw = TopoHelpers.ExtractNodoItems(db, ed, res.Value).ToList();
                if (raw.Count == 0)
                {
                    ed.WriteMessage("\nNo se hallaron referencias de bloque válidas con atributos NODO y DESC.");
                    return;
                }

                // 3) Crear la instancia única y enganchar eventos en ESA instancia
                _frmDuplicados = new FrmDuplicados(db, ed, raw, initialToleranceMeters: 0.05)
                {
                    StartPosition = FormStartPosition.CenterScreen
                };

                _frmDuplicados.Eliminados += (s, count) =>
                {
                    // Actualiza contador Tx_Contador usando XRecord
                    using var tr = db.TransactionManager.StartTransaction();
                    int maxNodo = 0;

                    var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
                    var ms = (BlockTableRecord)tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForRead);
                    foreach (ObjectId id in ms)
                    {
                        var br = tr.GetObject(id, OpenMode.ForRead) as BlockReference;
                        if (br == null) continue;
                        if (!TopoHelpers.TryReadNodoDesc(br, tr, out var nodo, out _)) continue;
                        if (nodo > maxNodo) maxNodo = nodo;
                    }

                    var next = maxNodo + 1;
                    TopoHelpers.SaveNextPointNumber(db, tr, next);
                    tr.Commit();

                    var tx = this.Controls.Find("Tx_Contador", true).FirstOrDefault() as TextBox;
                    if (tx != null) tx.Text = next.ToString();
                };

                _frmDuplicados.FormClosed += (s, e2) => _frmDuplicados = null;

                // 4) Mostrar modeless. No llamar ShowModelessDialog ni crear otra instancia.
                _frmDuplicados.Show();
            }
            catch (System.Exception ex)
            {
                ed.WriteMessage($"\n[DelDuplicate] Error: {ex.Message}");
            }
        }



        // lee valor de atributo TAG en bloque, null si no existe
        private string ReadAttributeFromBlock(BlockReference br, Transaction tr, string tag)
        {
            try
            {
                if (br == null) return null;
                var btrDef = (BlockTableRecord)tr.GetObject(br.BlockTableRecord, OpenMode.ForRead);
                foreach (ObjectId id in br.AttributeCollection)
                {
                    var ar = (AttributeReference)tr.GetObject(id, OpenMode.ForRead);
                    if (ar.Tag.Equals(tag, StringComparison.OrdinalIgnoreCase))
                        return ar.TextString;
                }
                // Si no está en referencia, intentar buscar AttributeDefinitions en el block definition (fallback)
                foreach (ObjectId id in btrDef)
                {
                    if (tr.GetObject(id, OpenMode.ForRead) is AttributeDefinition ad && !ad.Constant)
                    {
                        if (ad.Tag.Equals(tag, StringComparison.OrdinalIgnoreCase))
                            return ad.TextString;
                    }
                }
            }
            catch { /* ignore */ }
            return null;
        }

        // prompt simple para elegir tipo
        private string PromptForUnionType()
        {
            var options = MessageBox.Show("Elija tipo UNIR: Yes = LINE, No = POLYLINE\n(Yes=Line, No=Polyline, Cancel=Salir)", "Unir", MessageBoxButtons.YesNoCancel, MessageBoxIcon.Question);
            if (options == DialogResult.Cancel) return null;
            return (options == DialogResult.Yes) ? "LINE" : "POLYLINE";
        }

        #region CSV preview
        private static WinDataTable BuildEmptyPreview()
        {
            var dt = new WinDataTable();
            dt.Columns.Add("NORTE", typeof(double));
            dt.Columns.Add("ESTE", typeof(double));
            dt.Columns.Add("COTA", typeof(double));
            dt.Columns.Add("DESCRIPCION", typeof(string));
            dt.Columns.Add("BLOQUE", typeof(string));
            return dt;
        }

        private static void LoadCsvPreview(string csvPath, bool hasHeader, bool formatoEsteNorte, WinDataTable dt)
        {
            // Auto-detección de encabezado: si el usuario NO marcó encabezado pero la primera
            // línea no tiene 3 primeros valores parseables como doubles, la tratamos como header.
            var lines = File.ReadAllLines(csvPath);
            if (lines.Length == 0) return;

            int startIndex = 0;
            if (!hasHeader)
            {
                // comprobamos la primera línea: si los 3 primeros tokens NO son números, asumimos header
                var first = lines[0].Replace("\"", "").Trim();
                var tokens = SplitFlexible(first);
                bool firstIsHeader = true;
                if (tokens.Length >= 3)
                {
                    double a, b, c;
                    // intentamos parsear tokens 0..2 (usando ambos ordenes)
                    if (DoubleTryBoth(tokens[0], out a) && DoubleTryBoth(tokens[1], out b) && DoubleTryBoth(tokens[2], out c))
                        firstIsHeader = false;
                }
                if (firstIsHeader) startIndex = 1;
            }
            else
            {
                startIndex = 1;
            }

            var ci = CultureInfo.InvariantCulture;
            for (int i = startIndex; i < lines.Length; i++)
            {
                var raw = lines[i].Trim();
                if (raw.Length == 0) continue;
                var parts = SplitFlexible(raw);
                if (parts.Length < 3) continue; // mínimo X,Y,Z

                for (int k = 0; k < parts.Length; k++) parts[k] = parts[k].Trim();

                double norte = 0, este = 0, cota = 0;
                string desc = parts.Length > 3 ? parts[3] : "";
                string bloque = parts.Length > 4 ? parts[4] : "";

                bool ok = true;
                if (formatoEsteNorte)
                {
                    ok &= DoubleTryBoth(parts[0], out este);
                    ok &= DoubleTryBoth(parts[1], out norte);
                    ok &= DoubleTryBoth(parts[2], out cota);
                }
                else
                {
                    ok &= DoubleTryBoth(parts[0], out norte);
                    ok &= DoubleTryBoth(parts[1], out este);
                    ok &= DoubleTryBoth(parts[2], out cota);
                }
                if (!ok) continue;

                dt.Rows.Add(norte, este, cota, desc, bloque);
            }
        }

        // helper local
        private static bool DoubleTryBoth(string s, out double v)
        {
            // admite 1.234 y 1,234
            s = (s ?? "").Trim();
            if (double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out v)) return true;
            var s2 = s.Replace(',', '.');
            return double.TryParse(s2, NumberStyles.Float, CultureInfo.InvariantCulture, out v);
        }
        private static string[] SplitFlexible(string line)
        {
            // Parte por ; y por , y usamos el que más columnas dé
            var s1 = line.Split(';');
            var s2 = line.Split(',');
            return (s1.Length >= s2.Length) ? s1 : s2;
        }

        private static bool TryParseDouble(string s, out double value)
        {
            // Soporta "1234.56" y también "1234,56"
            s = (s ?? "").Trim();
            s = s.Replace(',', '.'); // normalizamos a punto
            return double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out value);
        }
        #endregion

        #region Import core (sin Editor)
        private static readonly string NEXT_POINT_KEY = "SICOE_NEXT_POINT";
        private static readonly string PTO_BLOCK_NAME = "SICOE_PTO";

        private static int ImportarCsvComoCadPoints(
            Document doc,
            string csvPath,
            bool hasHeader,
            bool formatoEsteNorte,
            double textHeight,
            int? startFrom)   // ← NUEVO
        {
            var db = doc.Database;

            // Parseo del CSV (auto-header si aplica)
            var allLines = File.ReadAllLines(csvPath);
            if (allLines.Length == 0) return startFrom.HasValue ? startFrom.Value : 1;

            int startIndex = 0;
            if (!hasHeader)
            {
                var first = allLines[0].Replace("\"", "").Trim();
                var tokens = SplitFlexible(first);
                bool firstIsHeader = true;
                if (tokens.Length >= 3)
                {
                    double a, b, c;
                    if (DoubleTryBoth(tokens[0], out a) && DoubleTryBoth(tokens[1], out b) && DoubleTryBoth(tokens[2], out c))
                        firstIsHeader = false;
                }
                if (firstIsHeader) startIndex = 1;
            }
            else startIndex = 1;

            var filas = new List<(double x, double y, double z, string desc, string bloq)>();
            for (int i = startIndex; i < allLines.Length; i++)
            {
                var line = allLines[i].Trim();
                if (line.Length == 0) continue;
                var parts = SplitFlexible(line);
                if (parts.Length < 3) continue;
                for (int k = 0; k < parts.Length; k++) parts[k] = parts[k].Trim();

                double norte = 0, este = 0, cota = 0;
                string desc = parts.Length > 3 ? parts[3] : "";
                string bloq = parts.Length > 4 ? parts[4] : "";

                bool ok = true;
                if (formatoEsteNorte)
                {
                    ok &= DoubleTryBoth(parts[0], out este);
                    ok &= DoubleTryBoth(parts[1], out norte);
                    ok &= DoubleTryBoth(parts[2], out cota);
                }
                else
                {
                    ok &= DoubleTryBoth(parts[0], out norte);
                    ok &= DoubleTryBoth(parts[1], out este);
                    ok &= DoubleTryBoth(parts[2], out cota);
                }
                if (!ok) continue;

                filas.Add((este, norte, cota, desc, bloq));
            }

            if (filas.Count == 0) return startFrom.HasValue ? startFrom.Value : 1;

            int next; // consecutivo a usar
            using (var tr = db.TransactionManager.StartTransaction())
            {
                var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
                var btr = (BlockTableRecord)tr.GetObject(db.CurrentSpaceId, OpenMode.ForWrite);

                const string layerNodos = "nodos_top_sic";
                EnsureLayer(db, tr, layerNodos, Autodesk.AutoCAD.Colors.Color.FromRgb(240, 240, 240));

                ObjectId blkId = EnsurePtoBlock(db, tr, 1.0);

                var bdef = (BlockTableRecord)tr.GetObject(blkId, OpenMode.ForRead);
                double baseHeight = 1.0;
                foreach (ObjectId id in bdef)
                {
                    if (tr.GetObject(id, OpenMode.ForRead) is AttributeDefinition ad
                        && ad.Tag.Equals("NODO", StringComparison.OrdinalIgnoreCase))
                    {
                        baseHeight = ad.Height > 0 ? ad.Height : 1.0;
                        break;
                    }
                }
                double scale = textHeight / baseHeight;

                // Punto de partida: lo que escriba el usuario o el valor almacenado
                next = startFrom ?? GetNextPointNumber(db, tr);

                foreach (var f in filas)
                {
                    var p = new Autodesk.AutoCAD.Geometry.Point3d(f.x, f.y, f.z);

                    var br = new BlockReference(p, blkId)
                    {
                        Layer = layerNodos,
                        ScaleFactors = new Scale3d(scale)
                    };
                    btr.AppendEntity(br);
                    tr.AddNewlyCreatedDBObject(br, true);

                    foreach (ObjectId id in bdef)
                    {
                        if (tr.GetObject(id, OpenMode.ForRead) is AttributeDefinition ad && !ad.Constant)
                        {
                            using var ar = new AttributeReference();
                            ar.SetAttributeFromBlock(ad, br.BlockTransform);

                            if (ad.Tag.Equals("NODO", StringComparison.OrdinalIgnoreCase))
                                ar.TextString = $"{next}";
                            else if (ad.Tag.Equals("DESC", StringComparison.OrdinalIgnoreCase))
                                ar.TextString = f.desc ?? string.Empty;

                            br.AttributeCollection.AppendAttribute(ar);
                            tr.AddNewlyCreatedDBObject(ar, true);
                        }
                    }

                    if (!string.IsNullOrWhiteSpace(f.bloq) && bt.Has(f.bloq.Trim()))
                    {
                        var brLib = new BlockReference(p, bt[f.bloq.Trim()]);
                        btr.AppendEntity(brLib);
                        tr.AddNewlyCreatedDBObject(brLib, true);
                    }

                    next++;
                }

                // Guardar el nuevo “siguiente”
                SaveNextPointNumber(db, tr, next);
                tr.Commit();
            }

            return next; // el próximo disponible después de importar
        }
        /// <summary>
        /// Crea (si no existe) el bloque SICOE_PTO con ALTURA BASE = 1.0.
        /// El tamaño final se controla escalando la BlockReference (ver ImportarCsvComoCadPoints).
        /// </summary>
        private static ObjectId EnsurePtoBlock(Database db, Transaction tr, double baseTextHeight /*usar 1.0*/)
        {
            var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
            if (bt.Has(PTO_BLOCK_NAME))
                return bt[PTO_BLOCK_NAME];

            bt.UpgradeOpen();
            var bdef = new BlockTableRecord
            {
                Name = PTO_BLOCK_NAME,
                Origin = Point3d.Origin
            };
            ObjectId blkId = bt.Add(bdef);
            tr.AddNewlyCreatedDBObject(bdef, true);

            // Símbolo: círculo + X (basado en altura = 1.0)
            double r = baseTextHeight * 0.18;
            var circ = new Circle(Point3d.Origin, Vector3d.ZAxis, r);
            bdef.AppendEntity(circ); tr.AddNewlyCreatedDBObject(circ, true);

            var l1 = new Line(new Point3d(-r * 0.9, -r * 0.9, 0), new Point3d(r * 0.9, r * 0.9, 0));
            var l2 = new Line(new Point3d(-r * 0.9, r * 0.9, 0), new Point3d(r * 0.9, -r * 0.9, 0));
            bdef.AppendEntity(l1); tr.AddNewlyCreatedDBObject(l1, true);
            bdef.AppendEntity(l2); tr.AddNewlyCreatedDBObject(l2, true);

            // Atributo NODO (arriba)
            var adNodo = new AttributeDefinition
            {
                Tag = "NODO",
                Prompt = "NODO",
                TextString = "P0",
                Height = baseTextHeight,                 // 1.0
                Justify = AttachmentPoint.BottomCenter,
                AlignmentPoint = new Point3d(0, baseTextHeight * 0.85, 0),
                Invisible = false
            };
            adNodo.SetDatabaseDefaults();
            bdef.AppendEntity(adNodo); tr.AddNewlyCreatedDBObject(adNodo, true);

            // Atributo DESC (abajo)
            var adDesc = new AttributeDefinition
            {
                Tag = "DESC",
                Prompt = "DESC",
                TextString = "DESC",
                Height = baseTextHeight,                 // 1.0
                Justify = AttachmentPoint.TopCenter,
                AlignmentPoint = new Point3d(0, -baseTextHeight * 0.85, 0),
                Invisible = false
            };
            adDesc.SetDatabaseDefaults();
            bdef.AppendEntity(adDesc); tr.AddNewlyCreatedDBObject(adDesc, true);

            return blkId;
        }

        private static int GetNextPointNumber(Database db, Transaction tr)
        {
            var nod = (DBDictionary)tr.GetObject(db.NamedObjectsDictionaryId, OpenMode.ForRead);
            if (!nod.Contains(NEXT_POINT_KEY))
                return 1;

            var xrId = (ObjectId)nod.GetAt(NEXT_POINT_KEY);
            var xr = (Xrecord)tr.GetObject(xrId, OpenMode.ForRead);
            if (xr.Data == null) return 1;

            var tvs = xr.Data.AsArray();
            if (tvs.Length == 0) return 1;

            return tvs[0].Value is int i ? i : 1;
        }

        private static void SaveNextPointNumber(Database db, Transaction tr, int next)
        {
            var nod = (DBDictionary)tr.GetObject(db.NamedObjectsDictionaryId, OpenMode.ForRead);
            nod.UpgradeOpen();

            Xrecord xr;
            if (nod.Contains(NEXT_POINT_KEY))
            {
                xr = (Xrecord)tr.GetObject(nod.GetAt(NEXT_POINT_KEY), OpenMode.ForWrite);
            }
            else
            {
                xr = new Xrecord();
                nod.SetAt(NEXT_POINT_KEY, xr);
                tr.AddNewlyCreatedDBObject(xr, true);
            }

            var rb = new ResultBuffer(new TypedValue((int)DxfCode.Int32, next));
            xr.Data = rb;
        }
        #endregion
        private static void EnsureLayer(Database db, Transaction tr, string layerName, Autodesk.AutoCAD.Colors.Color color)
        {
            var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
            if (lt.Has(layerName)) return;

            lt.UpgradeOpen();
            var ltr = new LayerTableRecord { Name = layerName, Color = color };
            lt.Add(ltr);
            tr.AddNewlyCreatedDBObject(ltr, true);
        }
        // Devuelve el siguiente consecutivo disponible teniendo en cuenta TODO lo ya dibujado.
        // Toma el mayor entre: (max atributo NODO en el dibujo) + 1  y  el XRecord guardado.
        private static int ComputeNextFromDrawing(Database db, Transaction tr)
        {
            int nextFromXrec = GetNextPointNumber(db, tr); // lo que esté guardado
            int maxInModel = 0;

            var btr = (BlockTableRecord)tr.GetObject(db.CurrentSpaceId, OpenMode.ForRead);
            foreach (ObjectId id in btr)
            {
                if (tr.GetObject(id, OpenMode.ForRead) is BlockReference br)
                {
                    // Revisa atributos del bloque buscando TAG = NODO
                    foreach (ObjectId aid in br.AttributeCollection)
                    {
                        if (tr.GetObject(aid, OpenMode.ForRead) is AttributeReference ar)
                        {
                            if (ar.Tag.Equals("NODO", StringComparison.OrdinalIgnoreCase))
                            {
                                if (int.TryParse((ar.TextString ?? "").Trim(), out int n) && n > maxInModel)
                                    maxInModel = n;
                            }
                        }
                    }
                }
            }

            int nextFromScan = (maxInModel > 0) ? maxInModel + 1 : 1;
            return Math.Max(nextFromScan, nextFromXrec);
        }
        private static void ZoomObjectIds(Editor ed, Database db, IEnumerable<ObjectId> ids)
        {
            using (var tr = db.TransactionManager.StartTransaction())
            {
                var extOk = false;
                var ext = new Extents3d();
                foreach (var id in ids)
                {
                    var ent = tr.GetObject(id, OpenMode.ForRead, false) as Entity;
                    if (ent == null) continue;
                    try
                    {
                        if (!extOk) { ext = ent.GeometricExtents; extOk = true; }
                        else ext.AddExtents(ent.GeometricExtents);
                    }
                    catch { }
                }
                tr.Commit();
                if (extOk) TopoHelpers.ZoomToExtents(ed, ext);
            }
        }

    }
}
