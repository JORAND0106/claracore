using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Windows.Forms;
using static SicoePresupuestoNET8.Commands; // para llamar directo GetCapitulos(), etc.


namespace SicoePresupuestoNET8
{
    public partial class EditarRegistroForm : Form
    {
        private readonly FrmSicoePresupuesto.GridRow _row;
        public EditarRegistroForm(FrmSicoePresupuesto.GridRow row)
        {
            _row = row ?? throw new ArgumentNullException(nameof(row));

            InitializeComponent();

            // 1) Catálogo y cascada
            CargarCatalogoEnCombos();
            PreCargarCascadaDesdeRow();

            // 2) Cargar valores y bloquear
            CargarDesdeModelo();
            BloquearCamposNoEditables();

            // 3) Cablear eventos
            CablearCascadaCatalogo();
            CablearEventosCalculo();

            // 4) Guardar / Cancelar (cableado DIRECTO, sin depender del designer)
            btnGuardar.Click -= BtnGuardar_Click;
            btnGuardar.Click += (_, __) => GuardarYSalir();

            btnCancelar.Click -= BtnCancelar_Click;
            btnCancelar.Click += (_, __) =>
            {
                this.DialogResult = DialogResult.Cancel;
                this.Close();
            };

            // 5) Precarga segura (si la sigues usando)
            _preloading = true;
            CargarCatalogoEnCombos();
            PrecargarCombosDesdeRow();
            _preloading = false;
        }

        // evita que se ejecuten manejadores mientras precargamos
        private bool _preloading = false;

        private void BtnGuardar_Click(object sender, System.EventArgs e)
        {
            // Antes hacía throw NotImplementedException; ahora reutilizamos la lógica central
            GuardarYSalir();
        }

        private void BtnCancelar_Click(object sender, System.EventArgs e)
        {
            this.DialogResult = System.Windows.Forms.DialogResult.Cancel;
            this.Close();
        }

        // Para que el diseñador abra el form
        public EditarRegistroForm()
        {
            InitializeComponent();
        }

        private void CargarDesdeModelo()
        {
            // Combos (si tienen ítems cargados)
            void Sel(ComboBox cb, string? v)
            {
                if (cb.Items.Count == 0) return;
                var text = (v ?? "").Trim();
                var idx = cb.FindStringExact(text);
                cb.SelectedIndex = idx >= 0 ? idx : -1;
            }
            if (_row == null) return;

            // Texto
            Sel(cbCapitulo, _row.Capitulo);
            Sel(cbCompetencia, _row.Competencia);
            Sel(cbItem, _row.Item);
            Sel(cbDescripcion, _row.Descripcion);
            Sel(cbUnd, _row.Und);
            // Tras setear selección, refresca datos de catálogo (und/v.unitario)
            ActualizarDesdeCatalogo();
            txtNoInicio.Text = _row.NoInicio ?? "";
            txtNoFinal.Text = _row.NoFinal ?? "";
            txtTipoEjecucion.Text = _row.TipoEjecucion ?? "";
            txtTipoEntidad.Text = _row.TipoEntidad ?? "";
            txtCapa.Text = _row.PK_ID ?? "";
            txtCalzada.Text = _row.Calzada ?? "";
            txtTramo.Text = _row.Tramo ?? "";
            txtObservacion.Text = _row.Observacion ?? "";

            // Abscisas (texto)
            txtAbsIni.Text = _row.AbsIni ?? "";
            txtAbsFin.Text = _row.AbsFin ?? "";

            // Numéricos
            var ci = CultureInfo.InvariantCulture;
            txtAreaLongNod.Text = _row.AreaLongNod.ToString("0.########", ci);
            txtAncho.Text = _row.Ancho.ToString("0.########", ci);
            txtEspesor.Text = _row.Espesor.ToString("0.########", ci);
            txtCantTotal.Text = _row.CantTotal.ToString("0.##", ci);
            txtVlrUnitario.Text = ((double)_row.VlrUnitario).ToString("0.########", ci);
            txtCostoDirecto.Text = _row.CostoDirecto.ToString("0", ci);
        }
        // Bloquea los campos que no deben editarse manualmente
        private void BloquearCamposNoEditables()
        {
            // helper local para admitir TextBox, nuestro OutlinedTextBox y ComboBox
            void SetRO(Control c, bool ro = true)
            {
                switch (c)
                {
                    // Primero el tipo más derivado
                    case SicoePresupuestoNET8.Controls.OutlinedTextBox otb:
                        otb.ReadOnly = ro;
                        otb.TabStop = !ro;
                        break;

                    case System.Windows.Forms.ComboBox cb:
                        cb.Enabled = !ro;  // para combos usamos Enabled
                        break;

                    // Al final el tipo base
                    case System.Windows.Forms.TextBoxBase tb:
                        tb.ReadOnly = ro;
                        tb.TabStop = !ro;
                        break;

                    default:
                        break;
                }
            }


            // ===== Campos a bloquear (los marcados en la imagen) =====
            // Izquierda
            SetRO(txtTipoEntidad);     // Tipo de Entidad
            SetRO(txtCalzada);         // Calzada
            SetRO(txtAreaLongNod);     // Area/Long/Nod
            SetRO(txtCantTotal);       // Cant.Total
            SetRO(txtAbsIni);          // Abs.Ini

            // Derecha
            SetRO(txtTramo);           // Tramo
            SetRO(txtVlrUnitario);     // Vlr Unitario
            SetRO(txtCostoDirecto);    // Costo Directo
            SetRO(txtAbsFin);          // Abs.Fin
        }

        private void CablearEventosCalculo()
        {
            // recalcular cuando cambien factores
            txtAreaLongNod.TextChanged += (_, __) => Recalcular();
            txtAncho.TextChanged += (_, __) => Recalcular();
            txtEspesor.TextChanged += (_, __) => Recalcular();
            txtVlrUnitario.TextChanged += (_, __) => Recalcular();
        }

        private void Recalcular()
        {
            // CantTotal = Area/Long/Nod * Ancho * Espesor
            // CostoDirecto = CantTotal * VlrUnitario
            double area = ParseOrZero(txtAreaLongNod.Text);
            double ancho = ParseOrZero(txtAncho.Text);
            double esp = ParseOrZero(txtEspesor.Text);
            double vu = ParseOrZero(txtVlrUnitario.Text);

            double cant = Math.Round(area * ancho * esp, 2, MidpointRounding.AwayFromZero);
            double costo = Math.Round(cant * vu, 0, MidpointRounding.AwayFromZero);

            txtCantTotal.Text = cant.ToString("0.##", CultureInfo.InvariantCulture);
            txtCostoDirecto.Text = costo.ToString("0", CultureInfo.InvariantCulture);
        }

        private static double ParseOrZero(string? s)
        {
            if (string.IsNullOrWhiteSpace(s)) return 0;
            var t = s.Trim();
            if (t.Contains(",") && !t.Contains(".")) t = t.Replace(',', '.'); // normaliza coma decimal
            t = t.Replace(" ", ""); // quita espacios
            return double.TryParse(t, NumberStyles.Any, CultureInfo.InvariantCulture, out var v) ? v : 0;
        }

        private void GuardarYSalir()
        {
            // Si por alguna razón no tenemos fila, solo cerramos
            if (_row == null)
            {
                this.DialogResult = DialogResult.OK;
                this.Close();
                return;
            }

            // Devuelve: Seleccionado > Texto del combo > valor actual del modelo > ""
            static string Pick(ComboBox cb, string? current)
            {
                var s = cb.SelectedItem?.ToString();
                if (!string.IsNullOrWhiteSpace(s)) return s!;
                s = cb.Text;
                if (!string.IsNullOrWhiteSpace(s)) return s!;
                return current ?? string.Empty;
            }

            // Toma SIEMPRE desde los combos
            _row.Capitulo = Pick(cbCapitulo, _row.Capitulo);
            _row.Competencia = Pick(cbCompetencia, _row.Competencia);
            _row.Item = Pick(cbItem, _row.Item);
            _row.Descripcion = Pick(cbDescripcion, _row.Descripcion);
            _row.Und = Pick(cbUnd, _row.Und);
            // ===== REGLAS SICOE (OBLIGATORIAS) =====
            // 1) ID_Pol = Item_(contador)   Ej: 2.03_3025
            // 2) LayerEnt = Cap5_Competencia_Item  Ej: 3PAVI_IDU_3.01
            // 3) LayerTxt = txt_Cap5_Competencia_Item  Ej: txt_3PAVI_IDU_3.01

            AplicarReglasSicoeDerivadas();

            // Texto
            _row.NoInicio = txtNoInicio.Text.Trim();
            _row.NoFinal = txtNoFinal.Text.Trim();
            _row.TipoEjecucion = txtTipoEjecucion.Text.Trim();
            _row.TipoEntidad = txtTipoEntidad.Text.Trim();
            _row.PK_ID = txtCapa.Text.Trim();
            _row.Calzada = txtCalzada.Text.Trim();
            _row.Tramo = txtTramo.Text.Trim();
            _row.Observacion = txtObservacion.Text.Trim();

            // Abscisas
            _row.AbsIni = txtAbsIni.Text.Trim();
            _row.AbsFin = txtAbsFin.Text.Trim();

            // Numéricos
            _row.AreaLongNod = ParseOrZero(txtAreaLongNod.Text);
            _row.Ancho = ParseOrZero(txtAncho.Text);
            _row.Espesor = ParseOrZero(txtEspesor.Text);
            _row.CantTotal = ParseOrZero(txtCantTotal.Text);
            _row.CostoDirecto = ParseOrZero(txtCostoDirecto.Text);
            _row.VlrUnitario = (decimal)ParseOrZero(txtVlrUnitario.Text);

            // IMPORTANTE: cerrar devolviendo OK
            this.DialogResult = DialogResult.OK;
            this.Close();
        }
        private static string BuildIdPolFromItem(string? currentIdPol, string? newItem)
        {
            var item = (newItem ?? "").Trim().ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(item))
                return (currentIdPol ?? "").Trim().ToUpperInvariant();

            var cur = (currentIdPol ?? "").Trim().ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(cur))
            {
                // Si no hay ID previo, no inventamos consecutivo aquí.
                // Devolvemos solo el ítem (o podrías decidir dejarlo vacío).
                return item;
            }

            // Caso típico: "3.05_123" -> al cambiar ítem: "3.06_123"
            var idx = cur.LastIndexOf('_');
            if (idx > 0 && idx < cur.Length - 1)
            {
                var suf = cur.Substring(idx + 1).Trim();   // consecutivo (o lo que venga después del "_")
                if (!string.IsNullOrWhiteSpace(suf))
                    return $"{item}_{suf}";
            }

            // Si no tiene "_", lo dejamos igual para no romper identificadores antiguos.
            return cur;
        }
        private void AplicarReglasSicoeDerivadas()
        {
            if (_row == null) return;

            string capitulo = (_row.Capitulo ?? "").Trim();
            string competencia = (_row.Competencia ?? "").Trim().ToUpperInvariant();
            string item = (_row.Item ?? "").Trim().ToUpperInvariant();

            // Cap5: primeros 5 caracteres "útiles" del capítulo (solo letras/números), ej: "3.PAVIMENTOS" -> "3PAVI"
            string cap5 = BuildCap5(capitulo);

            // 1) ID_Pol = Item_(contador)
            // El contador se toma del ID_Pol anterior (lo que venga después del último "_").
            // Ej: si era "3.01_3025" y cambias ítem a "2.03", queda "2.03_3025".
            _row.ID_Pol = BuildIdPol_ItemContador(_row.ID_Pol, item);

            // 2) LayerEnt = Cap5_Competencia_Item
            _row.LayerEnt = BuildLayerEnt(cap5, competencia, item);

            // 3) LayerTxt = txt_Cap5_Competencia_Item
            _row.LayerTxt = BuildLayerTxt(cap5, competencia, item);

            // Si en tu form tienes textbox/label para mostrar ID_Pol o layers, aquí los actualizas.
            // (Descomenta y ajusta nombres si existen)
            // txtIDPol.Text = _row.ID_Pol;
            // txtLayerEnt.Text = _row.LayerEnt;
            // txtLayerTxt.Text = _row.LayerTxt;
        }
        private static string BuildCap5(string capitulo)
        {
            if (string.IsNullOrWhiteSpace(capitulo)) return "";

            // Tomar solo letras y números (quita ".", espacios, etc.)
            var limpio = new string(capitulo
                .Trim()
                .ToUpperInvariant()
                .Where(char.IsLetterOrDigit)
                .ToArray());

            if (limpio.Length <= 5) return limpio;
            return limpio.Substring(0, 5);
        }

        private static string BuildIdPol_ItemContador(string? currentIdPol, string newItemUpper)
        {
            string item = (newItemUpper ?? "").Trim().ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(item))
                return (currentIdPol ?? "").Trim().ToUpperInvariant();

            string cur = (currentIdPol ?? "").Trim().ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(cur))
            {
                // Si no hay ID previo, no inventamos contador aquí.
                // (Si quieres inventarlo, tendría que venir de la lógica global del sistema)
                return item;
            }

            // Extraer contador: lo que esté después del último "_"
            int idx = cur.LastIndexOf('_');
            if (idx > 0 && idx < cur.Length - 1)
            {
                string contador = cur.Substring(idx + 1).Trim();
                if (!string.IsNullOrWhiteSpace(contador))
                    return $"{item}_{contador}";
            }

            // Si el ID anterior no tenía "_" no lo tocamos para no romper casos viejos.
            return cur;
        }

        private static string BuildLayerEnt(string cap5, string competenciaUpper, string itemUpper)
        {
            string cap = (cap5 ?? "").Trim().ToUpperInvariant();
            string comp = (competenciaUpper ?? "").Trim().ToUpperInvariant();
            string item = (itemUpper ?? "").Trim().ToUpperInvariant();

            string layer = $"{cap}_{comp}_{item}";
            if (layer.Length > 255) layer = layer.Substring(0, 255);
            return layer;
        }

        private static string BuildLayerTxt(string cap5, string competenciaUpper, string itemUpper)
        {
            string cap = (cap5 ?? "").Trim().ToUpperInvariant();
            string comp = (competenciaUpper ?? "").Trim().ToUpperInvariant();
            string item = (itemUpper ?? "").Trim().ToUpperInvariant();

            string layer = $"txt_{cap}_{comp}_{item}";
            if (layer.Length > 255) layer = layer.Substring(0, 255);
            return layer;
        }


        private void CargarCatalogoEnCombos()
        {
            // Capítulo es la raíz de la cascada
            var caps = GetCapitulos();
            cbCapitulo.Items.Clear();
            cbCapitulo.Items.AddRange(caps.Cast<object>().ToArray());

            // arranca vaciando los demás
            cbCompetencia.Items.Clear();
            cbItem.Items.Clear();
            cbDescripcion.Items.Clear();
            cbUnd.Items.Clear();
        }
        private void PreCargarCascadaDesdeRow()
        {
            if (_row == null) return;

            // 1) Capítulos ya están cargados por CargarCatalogoEnCombos()
            if (!string.IsNullOrWhiteSpace(_row.Capitulo))
            {
                var iCap = cbCapitulo.FindStringExact(_row.Capitulo.Trim());
                if (iCap >= 0) cbCapitulo.SelectedIndex = iCap; else cbCapitulo.Text = _row.Capitulo.Trim();
            }

            // 2) Competencias según capítulo
            var cap = cbCapitulo.SelectedItem?.ToString() ?? cbCapitulo.Text ?? "";
            var comps = string.IsNullOrWhiteSpace(cap) ? new() : GetCompetencias(cap);
            cbCompetencia.Items.Clear();
            cbCompetencia.Items.AddRange(comps.Cast<object>().ToArray());
            if (!string.IsNullOrWhiteSpace(_row.Competencia))
            {
                var iComp = cbCompetencia.FindStringExact(_row.Competencia.Trim());
                if (iComp >= 0) cbCompetencia.SelectedIndex = iComp; else cbCompetencia.Text = _row.Competencia.Trim();
            }

            // 3) Ítems según capítulo + competencia
            var comp = cbCompetencia.SelectedItem?.ToString() ?? cbCompetencia.Text ?? "";
            var items = (string.IsNullOrWhiteSpace(cap) || string.IsNullOrWhiteSpace(comp)) ? new() : GetItems(cap, comp);
            cbItem.Items.Clear();
            cbItem.Items.AddRange(items.Cast<object>().ToArray());
            if (!string.IsNullOrWhiteSpace(_row.Item))
            {
                var iItem = cbItem.FindStringExact(_row.Item.Trim());
                if (iItem >= 0) cbItem.SelectedIndex = iItem; else cbItem.Text = _row.Item.Trim();
            }

            // 4) Descripciones según cap + comp + item
            var item = cbItem.SelectedItem?.ToString() ?? cbItem.Text ?? "";
            var descs = (string.IsNullOrWhiteSpace(cap) || string.IsNullOrWhiteSpace(comp) || string.IsNullOrWhiteSpace(item))
                        ? new()
                        : GetDescripciones(cap, comp, item);
            cbDescripcion.Items.Clear();
            cbDescripcion.Items.AddRange(descs.Cast<object>().ToArray());
            if (!string.IsNullOrWhiteSpace(_row.Descripcion))
            {
                var iDesc = cbDescripcion.FindStringExact(_row.Descripcion.Trim());
                if (iDesc >= 0) cbDescripcion.SelectedIndex = iDesc; else cbDescripcion.Text = _row.Descripcion.Trim();
            }

            // 5) UND y Vlr Unitario desde catálogo (si existen)
            ActualizarDesdeCatalogo();
        }

        private void CablearCascadaCatalogo()
        {
            cbCapitulo.SelectedIndexChanged += (_, __) =>
            {
                if (_preloading) return;
                var cap = cbCapitulo.SelectedItem?.ToString() ?? cbCapitulo.Text ?? "";
                var comps = string.IsNullOrWhiteSpace(cap) ? new() : GetCompetencias(cap);

                cbCompetencia.Items.Clear();
                cbCompetencia.Items.AddRange(comps.Cast<object>().ToArray());

                cbItem.Items.Clear();
                cbDescripcion.Items.Clear();
                cbUnd.Items.Clear();
                ActualizarDesdeCatalogo();
                // refresca reglas derivadas al cambiar capítulo
                AplicarReglasSicoeDerivadas();

            };

            cbCompetencia.SelectedIndexChanged += (_, __) =>
            {
                if (_preloading) return;
                var cap = cbCapitulo.SelectedItem?.ToString() ?? cbCapitulo.Text ?? "";
                var comp = cbCompetencia.SelectedItem?.ToString() ?? cbCompetencia.Text ?? "";
                var items = (string.IsNullOrWhiteSpace(cap) || string.IsNullOrWhiteSpace(comp)) ? new() : GetItems(cap, comp);

                cbItem.Items.Clear();
                cbItem.Items.AddRange(items.Cast<object>().ToArray());

                cbDescripcion.Items.Clear();
                cbUnd.Items.Clear();
                ActualizarDesdeCatalogo();
                // refresca reglas derivadas al cambiar capítulo
                AplicarReglasSicoeDerivadas();

            };

            cbItem.SelectedIndexChanged += (_, __) =>
            {
                if (_preloading) return;

                var cap = cbCapitulo.SelectedItem?.ToString() ?? cbCapitulo.Text ?? "";
                var comp = cbCompetencia.SelectedItem?.ToString() ?? cbCompetencia.Text ?? "";
                var item = cbItem.SelectedItem?.ToString() ?? cbItem.Text ?? "";

                var descs = (string.IsNullOrWhiteSpace(cap) || string.IsNullOrWhiteSpace(comp) || string.IsNullOrWhiteSpace(item))
                    ? new()
                    : GetDescripciones(cap, comp, item);

                cbDescripcion.Items.Clear();
                cbDescripcion.Items.AddRange(descs.Cast<object>().ToArray());

                ActualizarDesdeCatalogo();
                // refresca reglas derivadas al cambiar capítulo
                AplicarReglasSicoeDerivadas();


                // ===== NUEVO: refrescar preview de ID_Pol =====
                var nuevoId = BuildIdPolFromItem(_row?.ID_Pol, item);
                if (_row != null) _row.ID_Pol = nuevoId;

                // Si tienes textbox de ID en el form, actualízalo:
                // txtIdPol.Text = nuevoId;
            };


            cbDescripcion.SelectedIndexChanged += (_, __) => ActualizarDesdeCatalogo();
        }
        private void ActualizarDesdeCatalogo()
        {
            var cap = cbCapitulo.SelectedItem?.ToString() ?? cbCapitulo.Text ?? "";
            var comp = cbCompetencia.SelectedItem?.ToString() ?? cbCompetencia.Text ?? "";
            var item = cbItem.SelectedItem?.ToString() ?? cbItem.Text ?? "";
            var desc = cbDescripcion.SelectedItem?.ToString() ?? cbDescripcion.Text ?? "";

            var it = FindPresItem(cap, comp, item, string.IsNullOrWhiteSpace(desc) ? null : desc);
            if (it == null)
                it = FindPresItem(cap, comp, item); // sin descripción (primer match)

            // UND
            cbUnd.Items.Clear();
            if (!string.IsNullOrWhiteSpace(it?.Und))
            {
                cbUnd.Items.Add(it.Und);
                cbUnd.SelectedIndex = 0;
            }

            // Valor Unitario
            if (it != null)
                txtVlrUnitario.Text = ((double)it.ValorUnitario).ToString("0.########", System.Globalization.CultureInfo.InvariantCulture);
        }


        private void PrecargarCombosDesdeRow()
        {
            if (_row == null) return;

            // 1) CAPÍTULO
            var caps = (Commands.Catalogo ?? new List<PresItem>())  // ← AQUÍ
                .Select(p => p.Capitulo?.Trim() ?? "")
                .Where(s => s != "")
                .Distinct()
                .OrderBy(s => s)
                .ToList();

            cbCapitulo.Items.Clear();
            cbCapitulo.Items.AddRange(caps.Cast<object>().ToArray());
            if (!string.IsNullOrWhiteSpace(_row.Capitulo))
            {
                int i = cbCapitulo.FindStringExact(_row.Capitulo.Trim());
                cbCapitulo.SelectedIndex = (i >= 0) ? i : -1;
                if (i < 0) cbCapitulo.Text = _row.Capitulo.Trim();
            }

            // 2) COMPETENCIA
            string cap = cbCapitulo.SelectedItem?.ToString() ?? cbCapitulo.Text ?? "";
            var comps = (Commands.Catalogo ?? new List<PresItem>())  // ← AQUÍ
                .Where(p => (p.Capitulo ?? "") == cap)
                .Select(p => p.Competencia?.Trim() ?? "")
                .Where(s => s != "")
                .Distinct()
                .OrderBy(s => s).ToList();
            cbCompetencia.Items.Clear();
            cbCompetencia.Items.AddRange(comps.Cast<object>().ToArray());
            if (!string.IsNullOrWhiteSpace(_row.Competencia))
            {
                int i = cbCompetencia.FindStringExact(_row.Competencia.Trim());
                cbCompetencia.SelectedIndex = (i >= 0) ? i : -1;
                if (i < 0) cbCompetencia.Text = _row.Competencia.Trim();
            }

            // 3) ITEM
            string comp = cbCompetencia.SelectedItem?.ToString() ?? cbCompetencia.Text ?? "";
            var items = (Commands.Catalogo ?? new List<PresItem>())  // ← AQUÍ
                .Where(p => (p.Capitulo ?? "") == cap && (p.Competencia ?? "") == comp)
                .Select(p => p.Item?.Trim() ?? "")
                .Where(s => s != "")
                .Distinct()
                .OrderBy(s => s).ToList();
            cbItem.Items.Clear();
            cbItem.Items.AddRange(items.Cast<object>().ToArray());
            if (!string.IsNullOrWhiteSpace(_row.Item))
            {
                int i = cbItem.FindStringExact(_row.Item.Trim());
                cbItem.SelectedIndex = (i >= 0) ? i : -1;
                if (i < 0) cbItem.Text = _row.Item.Trim();
            }

            // 4) DESCRIPCIÓN
            string item = cbItem.SelectedItem?.ToString() ?? cbItem.Text ?? "";
            var descs = (Commands.Catalogo ?? new List<PresItem>())  // ← AQUÍ
                .Where(p => (p.Capitulo ?? "") == cap && (p.Competencia ?? "") == comp && (p.Item ?? "") == item)
                .Select(p => p.Descripcion?.Trim() ?? "")
                .Where(s => s != "")
                .Distinct()
                .OrderBy(s => s).ToList();
            cbDescripcion.Items.Clear();
            cbDescripcion.Items.AddRange(descs.Cast<object>().ToArray());
            if (!string.IsNullOrWhiteSpace(_row.Descripcion))
            {
                int i = cbDescripcion.FindStringExact(_row.Descripcion.Trim());
                cbDescripcion.SelectedIndex = (i >= 0) ? i : -1;
                if (i < 0) cbDescripcion.Text = _row.Descripcion.Trim();
            }

            // 5) UND y VlrUnitario
            var cat = (Commands.Catalogo ?? new List<PresItem>())  // ← AQUÍ
                .FirstOrDefault(p =>
                    (p.Capitulo ?? "") == cap &&
                    (p.Competencia ?? "") == comp &&
                    (p.Item ?? "") == item &&
                    (p.Descripcion ?? "") == (cbDescripcion.SelectedItem?.ToString() ?? cbDescripcion.Text ?? "")
                );
            if (cat != null)
            {
                cbUnd.Items.Clear();
                if (!string.IsNullOrWhiteSpace(cat.Und))
                    cbUnd.Items.Add(cat.Und.Trim());
                cbUnd.SelectedIndex = cbUnd.Items.Count > 0 ? 0 : -1;

                txtVlrUnitario.Text = cat.ValorUnitario.ToString(System.Globalization.CultureInfo.InvariantCulture);
            }
        }
    }
}
