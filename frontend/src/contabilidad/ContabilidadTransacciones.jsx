import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Paperclip } from 'lucide-react'
import { API_BASE } from '../apiBase'
import { contabGet, contabOcrFactura, contabSend } from './contabilidadApi'
import { prepareSoporteConPeso } from './contabilidadImageCompress'
import { FieldLabel, TX_FIELD_HINTS } from './ContabilidadFieldLabel'
import SoportePreviewModal from './SoportePreviewModal'
import { fmtBytes, fmtCOP, labelPesoSoporte } from './contabilidadUi'
import { useContabilidadViewport } from './useContabilidadViewport'

const EMPTY_FORM = {
  fecha: new Date().toISOString().slice(0, 10),
  tipo: 'ingreso',
  valor_bruto: '',
  retencion_pct: '',
  retencion_fuente_valor: '',
  iva_pct: '',
  iva_valor: '0',
  propina_activa: false,
  propina_pct: '10',
  propina: '0',
  categoria_id: '',
  centro_costo_tipo: 'empresa',
  contrato_id: '',
  fuente_ingreso: 'licenciamiento',
  proveedor_razon_social: '',
  proveedor_nit_base: '',
  proveedor_nit_dv: '',
  notas: '',
}

function splitNit(raw) {
  const s = String(raw || '').trim()
  if (!s) return { base: '', dv: '' }
  if (s.includes('-')) {
    const [a, b = ''] = s.split('-')
    return { base: a.replace(/\D/g, ''), dv: b.replace(/\D/g, '').slice(0, 1) }
  }
  const digits = s.replace(/\D/g, '')
  if (digits.length >= 6) return { base: digits.slice(0, -1), dv: digits.slice(-1) }
  return { base: digits, dv: '' }
}

function joinNit(base, dv) {
  const b = String(base || '').replace(/\D/g, '')
  const d = String(dv || '').replace(/\D/g, '').slice(0, 1)
  if (!b) return ''
  return d ? `${b}-${d}` : b
}

function numOrZero(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return 0
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

/** Solo montos > 0; vacío / 0 / negativo → 0 (no afectan el total). */
function positiveAmount(raw) {
  const n = numOrZero(raw)
  return n > 0 ? n : 0
}

function parsePct(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const n = Number(s.replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

function calcMontoFromPct(brutoRaw, pctRaw) {
  const pct = parsePct(pctRaw)
  if (pct == null) return null
  const bruto = Number(String(brutoRaw ?? '').replace(',', '.'))
  if (!Number.isFinite(bruto) || bruto < 0) return 0
  return Math.round(bruto * (pct / 100))
}

/**
 * Retención efectiva: solo si el usuario ingresó % > 0 o valor > 0.
 * Si ambos están vacíos o en cero → 0 (no descuenta).
 */
function effectiveRetencion(form) {
  const pct = parsePct(form.retencion_pct)
  if (pct != null && pct > 0) {
    const calc = calcMontoFromPct(form.valor_bruto, form.retencion_pct)
    return calc != null && calc > 0 ? calc : 0
  }
  return positiveAmount(form.retencion_fuente_valor)
}

/** Total = Valor Bruto + IVA + Propina − Retención (solo si > 0). */
function calcTotalFactura(form) {
  const bruto = numOrZero(form.valor_bruto)
  const ret = effectiveRetencion(form)
  const iva = positiveAmount(form.iva_valor)
  const tip = form.propina_activa ? positiveAmount(form.propina) : 0
  return Math.round(bruto + iva + tip - ret)
}

/** Fuera del padre: si se define dentro, cada setState remonta inputs y se pierde el foco. */
function TxField({ name, label, t, lblStyle, suggested, children }) {
  return (
    <label style={{
      display: 'block',
      borderRadius: 8,
      outline: suggested ? `2px solid ${t.primary}66` : undefined,
      background: suggested ? `${t.primary}12` : undefined,
      padding: suggested ? 6 : 0,
      boxSizing: 'border-box',
    }}>
      <span style={lblStyle}>
        <FieldLabel label={label} hint={TX_FIELD_HINTS[name]} t={t} />
        {suggested ? (
          <span style={{ marginLeft: 6, fontSize: '0.85em', color: t.primary, fontWeight: 700 }}>OCR</span>
        ) : null}
      </span>
      {children}
    </label>
  )
}

function labelContrato(c) {
  if (!c) return '—'
  const num = c.numero || c.id
  const nombre = (c.objeto || c.nombre || '').trim()
  return nombre ? `${num} — ${nombre}` : String(num)
}

function labelCentroCosto(tx) {
  if ((tx?.centro_costo_tipo || '') === 'contrato') {
    return labelContrato(tx.contrato) || (tx.contrato_id ? `Contrato #${tx.contrato_id}` : 'Contrato')
  }
  return 'Empresa general'
}

function tasaFromPct(pctRaw) {
  const pct = parsePct(pctRaw)
  if (pct == null || pct <= 0) return 0
  return pct / 100
}

function pctFromTasa(tasa) {
  const n = Number(tasa)
  if (!Number.isFinite(n) || n <= 0) return ''
  const pct = n * 100
  return Number.isInteger(pct) ? String(pct) : String(Number(pct.toFixed(4)))
}

function applyAutoCalculos(form) {
  const next = { ...form }
  const retPct = parsePct(form.retencion_pct)
  if (retPct != null && retPct > 0) {
    const retCalc = calcMontoFromPct(form.valor_bruto, form.retencion_pct)
    if (retCalc != null) next.retencion_fuente_valor = String(retCalc)
  } else if (!(String(form.retencion_pct ?? '').trim()) || retPct === 0) {
    // % vacío o 0: no descontar. Si el valor quedó en 0, dejar vacío.
    if (!positiveAmount(form.retencion_fuente_valor)) next.retencion_fuente_valor = ''
  }

  const ivaCalc = calcMontoFromPct(form.valor_bruto, form.iva_pct)
  if (ivaCalc != null) next.iva_valor = String(ivaCalc)

  if (next.propina_activa) {
    // Solo recalcular desde % si hay porcentaje (sugerencia). Si el usuario editó el valor
    // (propina_pct vacío), respetar el monto manual.
    const tipCalc = calcMontoFromPct(form.valor_bruto, form.propina_pct)
    if (tipCalc != null) next.propina = String(tipCalc)
  } else {
    next.propina = '0'
  }
  return next
}

function TxDetailBlock({ tx, t }) {
  return (
    <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, lineHeight: 1.45 }}>
      <div><strong style={{ color: t.text }}>Fecha:</strong> {tx.fecha}</div>
      <div>
        <strong style={{ color: t.text }}>Tipo:</strong>{' '}
        <span style={{ color: tx.tipo === 'ingreso' ? '#10B981' : '#EF4444', fontWeight: 700, textTransform: 'capitalize' }}>
          {tx.tipo}
        </span>
      </div>
      <div><strong style={{ color: t.text }}>Bruto:</strong> {fmtCOP(tx.valor_bruto)}</div>
      <div><strong style={{ color: t.text }}>Retención:</strong> {fmtCOP(tx.retencion_fuente_valor)}</div>
      <div><strong style={{ color: t.text }}>IVA:</strong> {fmtCOP(tx.iva_valor)}</div>
      <div><strong style={{ color: t.text }}>Propina:</strong> {fmtCOP(tx.propina || 0)}</div>
      <div><strong style={{ color: t.text }}>Total:</strong> {fmtCOP(tx.valor_neto)}</div>
      <div><strong style={{ color: t.text }}>Categoría:</strong> {tx.categoria?.nombre || '—'}</div>
      <div><strong style={{ color: t.text }}>Centro:</strong> {labelCentroCosto(tx)}</div>
      <div>
        <strong style={{ color: t.text }}>Proveedor:</strong>{' '}
        {tx.tipo === 'egreso' ? (tx.proveedor_razon_social || '—') : '—'}
      </div>
      <div>
        <strong style={{ color: t.text }}>NIT:</strong>{' '}
        {tx.tipo === 'egreso' ? (tx.proveedor_nit || '—') : '—'}
      </div>
      <div><strong style={{ color: t.text }}>Origen:</strong> {tx.origen || '—'}</div>
      <div><strong style={{ color: t.text }}>Notas:</strong> {tx.notas || '—'}</div>
      <div>
        <strong style={{ color: t.text }}>Soporte:</strong>{' '}
        {tx.soporte_nombre_archivo
          ? `${tx.soporte_nombre_archivo}${tx.soporte_tamano_bytes ? ` (${fmtBytes(tx.soporte_tamano_bytes)})` : ''}`
          : 'Sin adjunto'}
      </div>
    </div>
  )
}

const TransaccionFormPanel = memo(function TransaccionFormPanel({
  t,
  form,
  editId,
  isMobile,
  isTablet,
  busy,
  catsIngreso,
  catsEgreso,
  contratos,
  soportePendiente,
  ocrStatus,
  ocrSuggested,
  ocrMessage,
  cameraRef,
  fileRef,
  replaceRef,
  formRef,
  inp,
  lbl,
  btn,
  onPatchForm,
  onTipoChange,
  onCentroCostoChange,
  onSoporteFile,
  onReplaceSoporte,
  onGuardar,
  onCancelar,
}) {
  const formGridCols = isMobile
    ? '1fr'
    : isTablet
      ? 'repeat(2, minmax(0, 1fr))'
      : 'repeat(auto-fill, minmax(180px, 1fr))'

  const retAuto = parsePct(form.retencion_pct) != null
  const ivaAuto = parsePct(form.iva_pct) != null
  const totalFactura = calcTotalFactura(form)
  const sug = ocrSuggested || {}

  return (
    <div
      ref={formRef}
      style={{
        background: t.bgCard,
        border: `1px solid ${t.primary}44`,
        borderRadius: 12,
        padding: isMobile ? 14 : 16,
        marginBottom: 16,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 12, color: t.primary }}>
        {editId ? 'Editar transacción' : 'Nueva transacción'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: formGridCols, gap: 12 }}>
        <TxField name="tipo" label="Tipo" t={t} lblStyle={lbl}>
          <select style={inp} value={form.tipo} onChange={(e) => onTipoChange(e.target.value)}>
            <option value="ingreso">Ingreso</option>
            <option value="egreso">Egreso</option>
          </select>
        </TxField>
        <TxField name="fecha" label="Fecha" t={t} lblStyle={lbl} suggested={!!sug.fecha}>
          <input
            type="date"
            style={inp}
            value={form.fecha}
            onChange={(e) => onPatchForm({ fecha: e.target.value })}
          />
        </TxField>

        {form.tipo === 'egreso' && (
          <>
            <TxField name="proveedor_razon_social" label="Razón social proveedor *" t={t} lblStyle={lbl} suggested={!!sug.proveedor_razon_social}>
              <input
                type="text"
                style={inp}
                value={form.proveedor_razon_social}
                onChange={(e) => onPatchForm({ proveedor_razon_social: e.target.value })}
                required
                maxLength={255}
                placeholder="Nombre del proveedor"
                autoFocus={!editId}
              />
            </TxField>
            <div style={{
              gridColumn: isMobile ? '1 / -1' : undefined,
              borderRadius: 8,
              outline: sug.proveedor_nit ? `2px solid ${t.primary}66` : undefined,
              background: sug.proveedor_nit ? `${t.primary}12` : undefined,
              padding: sug.proveedor_nit ? 6 : 0,
            }}>
              <div style={lbl}>
                <FieldLabel label="NIT proveedor *" hint={TX_FIELD_HINTS.proveedor_nit} t={t} />
                {sug.proveedor_nit ? (
                  <span style={{ marginLeft: 6, fontSize: '0.85em', color: t.primary, fontWeight: 700 }}>OCR</span>
                ) : null}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  inputMode="numeric"
                  style={{ ...inp, flex: '1 1 auto' }}
                  value={form.proveedor_nit_base}
                  onChange={(e) => onPatchForm({ proveedor_nit_base: e.target.value.replace(/\D/g, '') })}
                  required
                  placeholder="NIT"
                />
                <span style={{ fontWeight: 700, color: t.textMuted }}>—</span>
                <input
                  type="number"
                  inputMode="numeric"
                  style={{ ...inp, width: 64, flex: '0 0 64px' }}
                  value={form.proveedor_nit_dv}
                  onChange={(e) => onPatchForm({ proveedor_nit_dv: e.target.value.replace(/\D/g, '').slice(0, 1) })}
                  maxLength={1}
                  placeholder="DV"
                  title="Dígito de verificación"
                />
              </div>
            </div>
          </>
        )}

        <TxField name="valor_bruto" label="Valor bruto" t={t} lblStyle={lbl} suggested={!!sug.valor_bruto}>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="1"
            style={inp}
            value={form.valor_bruto}
            onChange={(e) => onPatchForm({ valor_bruto: e.target.value })}
            autoFocus={!editId && form.tipo !== 'egreso'}
          />
        </TxField>
        <TxField name="retencion_pct" label="Retención % (opcional)" t={t} lblStyle={lbl}>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            style={inp}
            value={form.retencion_pct}
            onChange={(e) => {
              const v = e.target.value
              // Al vaciar el %, limpiar el valor calculado para que no siga descontando.
              if (!String(v).trim()) onPatchForm({ retencion_pct: '', retencion_fuente_valor: '' })
              else onPatchForm({ retencion_pct: v })
            }}
            placeholder="Ej. 2.5"
          />
        </TxField>
        <TxField name="retencion_fuente_valor" label="Retención valor" t={t} lblStyle={lbl} suggested={!!sug.retencion_fuente_valor}>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            style={{ ...inp, opacity: retAuto ? 0.85 : 1 }}
            value={form.retencion_fuente_valor}
            onChange={(e) => onPatchForm({ retencion_pct: '', retencion_fuente_valor: e.target.value })}
            readOnly={retAuto}
            title={retAuto ? 'Calculado desde el porcentaje' : undefined}
            placeholder="0"
          />
        </TxField>
        <TxField name="iva_pct" label="IVA % (opcional)" t={t} lblStyle={lbl} suggested={!!sug.iva_pct}>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            style={inp}
            value={form.iva_pct}
            onChange={(e) => onPatchForm({ iva_pct: e.target.value })}
            placeholder="Ej. 19"
          />
        </TxField>
        <TxField name="iva_valor" label="IVA valor" t={t} lblStyle={lbl} suggested={!!sug.iva_valor}>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            style={{ ...inp, opacity: ivaAuto ? 0.85 : 1 }}
            value={form.iva_valor}
            onChange={(e) => onPatchForm({ iva_valor: e.target.value })}
            readOnly={ivaAuto}
            title={ivaAuto ? 'Calculado desde el porcentaje' : undefined}
          />
        </TxField>

        <div style={{ gridColumn: isMobile ? '1 / -1' : undefined }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: form.propina_activa ? 8 : 0 }}>
            <input
              type="checkbox"
              checked={!!form.propina_activa}
              onChange={(e) => {
                const on = e.target.checked
                if (on) {
                  const pct = form.propina_pct || '10'
                  const tipCalc = calcMontoFromPct(form.valor_bruto, pct)
                  onPatchForm({
                    propina_activa: true,
                    propina_pct: pct,
                    propina: tipCalc != null ? String(tipCalc) : form.propina || '0',
                  })
                } else {
                  onPatchForm({ propina_activa: false, propina: '0' })
                }
              }}
              style={{ width: 18, height: 18 }}
            />
            <span style={{ fontSize: 'var(--cc-sm)', fontWeight: 600, color: t.text }}>
              Incluir propina (sugerencia 10% del bruto, editable)
            </span>
          </label>
          {form.propina_activa && (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginTop: 8 }}>
              <TxField name="propina" label="Propina % (sugerido)" t={t} lblStyle={lbl}>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  style={inp}
                  value={form.propina_pct}
                  onChange={(e) => onPatchForm({ propina_pct: e.target.value })}
                  placeholder="10"
                />
              </TxField>
              <TxField name="propina" label="Propina valor" t={t} lblStyle={lbl}>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  style={inp}
                  value={form.propina}
                  onChange={(e) => onPatchForm({ propina_pct: '', propina: e.target.value })}
                  placeholder="Monto editable"
                />
              </TxField>
            </div>
          )}
        </div>

        <TxField name="categoria" label="Categoría" t={t} lblStyle={lbl}>
          <select
            style={inp}
            value={form.categoria_id}
            onChange={(e) => onPatchForm({ categoria_id: e.target.value })}
          >
            <option value="">—</option>
            {(form.tipo === 'ingreso' ? catsIngreso : catsEgreso).map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </TxField>
        <TxField name="centro_costo" label="Centro de costo" t={t} lblStyle={lbl}>
          <select
            style={inp}
            value={form.centro_costo_tipo === 'contrato' ? form.contrato_id : 'empresa'}
            onChange={(e) => onCentroCostoChange(e.target.value)}
          >
            <option value="empresa">Empresa general</option>
            {contratos.map((c) => (
              <option key={c.id} value={String(c.id)}>{labelContrato(c)}</option>
            ))}
          </select>
        </TxField>
        {form.tipo === 'ingreso' && (
          <TxField name="fuente_ingreso" label="Fuente ingreso" t={t} lblStyle={lbl}>
            <select
              style={inp}
              value={form.fuente_ingreso}
              onChange={(e) => onPatchForm({ fuente_ingreso: e.target.value })}
            >
              <option value="licenciamiento">Licenciamiento</option>
              <option value="servicios">Servicios</option>
            </select>
          </TxField>
        )}
      </div>

      <div style={{
        marginTop: 14,
        padding: '12px 14px',
        borderRadius: 10,
        border: `1px solid ${t.primary}55`,
        background: `${t.primary}10`,
      }}>
        <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginBottom: 4 }}>
          <FieldLabel label="Total de la factura" hint={TX_FIELD_HINTS.total_factura} t={t} />
        </div>
        <div style={{ fontWeight: 800, fontSize: 'var(--cc-lg)', color: t.primary }}>
          {fmtCOP(totalFactura)}
        </div>
        <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginTop: 4 }}>
          Bruto + IVA + Propina − Retención
        </div>
      </div>

      <label style={{ display: 'block', marginTop: 12 }}>
        <span style={lbl}><FieldLabel label="Notas" hint={TX_FIELD_HINTS.notas} t={t} /></span>
        <textarea
          style={{ ...inp, minHeight: 60 }}
          value={form.notas}
          onChange={(e) => onPatchForm({ notas: e.target.value })}
        />
      </label>

      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 600, color: t.textMuted, marginBottom: 8 }}>
          Soporte / recibo
          {form.tipo === 'egreso' ? ' · OCR automático al adjuntar' : ''}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            style={{ ...btn(true), flex: isMobile ? '1 1 140px' : undefined }}
            onClick={() => cameraRef.current?.click()}
          >
            <Camera size={18} strokeWidth={2.2} /> Tomar foto
          </button>
          <button
            type="button"
            style={{ ...btn(false), flex: isMobile ? '1 1 140px' : undefined }}
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip size={16} strokeWidth={2.2} /> {isMobile ? 'Galería / PDF' : 'Adjuntar archivo'}
          </button>
          {editId && typeof onReplaceSoporte === 'function' && (
            <button
              type="button"
              style={{ ...btn(false), flex: isMobile ? '1 1 140px' : undefined }}
              onClick={() => replaceRef?.current?.click()}
            >
              🔁 Reemplazar imagen
            </button>
          )}
        </div>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            onSoporteFile(e.target.files?.[0], { fromCamera: true })
            e.target.value = ''
          }}
        />
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,image/*"
          hidden
          onChange={(e) => {
            onSoporteFile(e.target.files?.[0], { fromCamera: false })
            e.target.value = ''
          }}
        />
        {editId && (
          <input
            ref={replaceRef}
            type="file"
            accept=".pdf,image/*"
            hidden
            onChange={(e) => {
              onReplaceSoporte?.(e.target.files?.[0], { fromCamera: false })
              e.target.value = ''
            }}
          />
        )}
        {ocrStatus === 'loading' && (
          <div style={{ marginTop: 8, fontSize: 'var(--cc-sm)', color: t.textMuted }}>
            Leyendo factura (OCR)… puede tardar unos segundos. Puede seguir editando el formulario.
          </div>
        )}
        {ocrMessage && ocrStatus !== 'loading' && (
          <div style={{
            marginTop: 8,
            fontSize: 'var(--cc-sm)',
            fontWeight: 600,
            color: ocrStatus === 'ok' ? t.primary : (ocrStatus === 'fail' ? '#EF4444' : t.textMuted),
            padding: '8px 10px',
            borderRadius: 8,
            border: `1px solid ${ocrStatus === 'ok' ? t.primary + '55' : (ocrStatus === 'fail' ? '#EF444466' : t.border)}`,
            background: ocrStatus === 'ok' ? t.primary + '10' : (ocrStatus === 'fail' ? '#EF444412' : t.bg),
          }}>
            {ocrMessage}
          </div>
        )}
        {soportePendiente?.file && (
          <div style={{ marginTop: 8, fontSize: 'var(--cc-sm)', color: t.primary, fontWeight: 600 }}>
            ✓ {soportePendiente.file.name || 'Archivo listo'}
            {soportePendiente.wasCropped ? ' · documento recortado' : ''}
            {' · '}
            {labelPesoSoporte(soportePendiente)}
            {editId ? ' · se subirá al reemplazar' : ' · se subirá al guardar'}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <button type="button" style={{ ...btn(true), flex: isMobile ? '1 1 120px' : undefined }} disabled={busy} onClick={onGuardar}>
          {busy ? 'Guardando…' : (editId ? 'Guardar' : 'Crear')}
        </button>
        <button
          type="button"
          style={{ ...btn(false), flex: isMobile ? '1 1 100px' : undefined }}
          onClick={onCancelar}
        >
          Cancelar
        </button>
      </div>
    </div>
  )
})

export default function ContabilidadTransacciones({ t, token, esDeveloper, viewport }) {
  const vpHook = useContabilidadViewport()
  const { isMobile, isTablet } = viewport || vpHook
  const [items, setItems] = useState([])
  const [categorias, setCategorias] = useState([])
  const [contratos, setContratos] = useState([])
  const [ordenesPendientes, setOrdenesPendientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [busy, setBusy] = useState(false)
  const [soportePendiente, setSoportePendiente] = useState(null)
  const [soporteInlineInfo, setSoporteInlineInfo] = useState('')
  const [ocrStatus, setOcrStatus] = useState('') // '' | loading | ok | fail | empty
  const [ocrSuggested, setOcrSuggested] = useState({})
  const [ocrMessage, setOcrMessage] = useState('')
  const [previewTxId, setPreviewTxId] = useState(null)
  const [replaceBusy, setReplaceBusy] = useState(false)
  const [preview, setPreview] = useState({
    open: false, loading: false, error: '', nombre: '', mime: '', blobUrl: null,
  })
  const previewUrlRef = useRef(null)
  const formRef = useRef(null)
  const cameraRef = useRef(null)
  const fileRef = useRef(null)
  const replaceRef = useRef(null)
  const formTipoRef = useRef(form.tipo)
  formTipoRef.current = form.tipo

  const cerrarPreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setPreviewTxId(null)
    setPreview({ open: false, loading: false, error: '', nombre: '', mime: '', blobUrl: null })
  }, [])

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
  }, [])

  const abrirPreview = useCallback(async (tx) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setPreviewTxId(tx.id)
    setPreview({
      open: true,
      loading: true,
      error: '',
      nombre: tx.soporte_nombre_archivo || 'Soporte',
      mime: tx.soporte_mime_type || '',
      blobUrl: null,
    })
    try {
      const r = await fetch(`${API_BASE}/contabilidad/transacciones/${tx.id}/soporte`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!r.ok) throw new Error('No se pudo cargar el soporte')
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      previewUrlRef.current = url
      setPreview((p) => ({
        ...p,
        loading: false,
        blobUrl: url,
        mime: tx.soporte_mime_type || blob.type || '',
      }))
    } catch (e) {
      setPreview((p) => ({ ...p, loading: false, error: e.message || 'Error al cargar' }))
    }
  }, [token])

  const descargarPreview = useCallback(() => {
    setPreview((p) => {
      if (!p.blobUrl || !p.nombre) return p
      const a = document.createElement('a')
      a.href = p.blobUrl
      a.download = p.nombre
      a.click()
      return p
    })
  }, [])

  const catsIngreso = useMemo(() => categorias.filter((c) => c.tipo === 'ingreso'), [categorias])
  const catsEgreso = useMemo(() => categorias.filter((c) => c.tipo === 'egreso'), [categorias])

  const cargar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [tx, cat, cont, ord] = await Promise.all([
        contabGet('/transacciones', token, { estado: 'activa', limit: 500, tipo: filtroTipo || undefined }),
        contabGet('/categorias', token),
        contabGet('/contratos', token),
        contabGet('/ordenes-pago/pendientes', token),
      ])
      setItems(tx.items || [])
      setCategorias(cat.items || [])
      setContratos(cont.items || [])
      setOrdenesPendientes(ord.items || [])
    } catch (e) {
      setError(e.message || 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [token, filtroTipo])

  useEffect(() => { cargar() }, [cargar])

  const scrollToForm = useCallback(() => {
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  const applyOcrSugerencias = useCallback((sugerencias) => {
    if (!sugerencias || typeof sugerencias !== 'object') return
    const flags = {}
    setForm((prev) => {
      const patch = {}
      if (sugerencias.proveedor_razon_social) {
        patch.proveedor_razon_social = String(sugerencias.proveedor_razon_social)
        flags.proveedor_razon_social = true
      }
      if (sugerencias.proveedor_nit) {
        const nit = splitNit(sugerencias.proveedor_nit)
        patch.proveedor_nit_base = nit.base
        patch.proveedor_nit_dv = nit.dv
        flags.proveedor_nit = true
      }
      if (sugerencias.fecha) {
        patch.fecha = String(sugerencias.fecha).slice(0, 10)
        flags.fecha = true
      }
      if (sugerencias.valor_bruto != null) {
        patch.valor_bruto = String(Math.round(Number(sugerencias.valor_bruto) || 0))
        flags.valor_bruto = true
      }
      if (sugerencias.iva_valor != null) {
        patch.iva_valor = String(Math.round(Number(sugerencias.iva_valor) || 0))
        patch.iva_pct = ''
        flags.iva_valor = true
      }
      if (sugerencias.iva_pct != null) {
        patch.iva_pct = String(sugerencias.iva_pct)
        flags.iva_pct = true
      }
      if (sugerencias.retencion_fuente_valor != null) {
        patch.retencion_fuente_valor = String(Math.round(Number(sugerencias.retencion_fuente_valor) || 0))
        patch.retencion_pct = ''
        flags.retencion_fuente_valor = true
      }
      setOcrSuggested(flags)
      return applyAutoCalculos({ ...prev, ...patch })
    })
  }, [])

  const runOcrIfEgreso = useCallback(async (file) => {
    if (formTipoRef.current !== 'egreso' || !file) return null
    setOcrStatus('loading')
    setOcrMessage('Leyendo factura con Azure Document Intelligence…')
    try {
      const result = await contabOcrFactura(token, file, { timeoutMs: 60000 })
      if (result?.ok && result.sugerencias && Object.keys(result.sugerencias).length) {
        applyOcrSugerencias(result.sugerencias)
        setOcrStatus('ok')
        setOcrMessage(result.mensaje || 'OCR completado. Revise los campos resaltados.')
      } else if (result?.status === 'no_fields') {
        setOcrStatus('empty')
        setOcrMessage(result.mensaje || 'OCR no detectó campos. Complete manualmente.')
      } else {
        setOcrStatus('fail')
        const detail = result?.error_detalle ? ` (${result.error_detalle})` : ''
        setOcrMessage((result?.mensaje || 'OCR falló.') + detail)
      }
      return result
    } catch (e) {
      setOcrStatus('fail')
      setOcrMessage(`OCR falló: ${e?.message || e}`)
      return null
    }
  }, [token, applyOcrSugerencias])

  const abrirNueva = useCallback((tipoPreferido) => {
    const tipo = tipoPreferido || 'egreso'
    const cats = tipo === 'egreso' ? catsEgreso : catsIngreso
    setEditId(null)
    setSoportePendiente(null)
    setOcrStatus('')
    setOcrSuggested({})
    setOcrMessage('')
    setForm(applyAutoCalculos({
      ...EMPTY_FORM,
      fecha: new Date().toISOString().slice(0, 10),
      tipo,
      categoria_id: cats[0]?.id || '',
      iva_pct: '19',
    }))
    setShowForm(true)
    scrollToForm()
  }, [catsEgreso, catsIngreso, scrollToForm])

  const abrirEditar = useCallback((tx) => {
    setEditId(tx.id)
    setSoportePendiente(null)
    setOcrStatus('')
    setOcrSuggested({})
    setOcrMessage('')
    const retPct = pctFromTasa(tx.retencion_fuente_tasa)
    const ivaPct = pctFromTasa(tx.iva_tasa)
    const nit = splitNit(tx.proveedor_nit)
    const tip = Math.round(Number(tx.propina) || 0)
    setForm(applyAutoCalculos({
      fecha: tx.fecha,
      tipo: tx.tipo,
      valor_bruto: String(tx.valor_bruto ?? ''),
      retencion_pct: retPct,
      retencion_fuente_valor: String(Math.round(Number(tx.retencion_fuente_valor) || 0) || ''),
      iva_pct: ivaPct,
      iva_valor: String(Math.round(Number(tx.iva_valor) || 0)),
      propina_activa: tip > 0,
      propina_pct: tip > 0 ? '' : '10',
      propina: String(tip),
      categoria_id: String(tx.categoria_id ?? ''),
      centro_costo_tipo: tx.centro_costo_tipo || 'empresa',
      contrato_id: tx.contrato_id ? String(tx.contrato_id) : '',
      fuente_ingreso: tx.fuente_ingreso || 'licenciamiento',
      proveedor_razon_social: tx.proveedor_razon_social || '',
      proveedor_nit_base: nit.base,
      proveedor_nit_dv: nit.dv,
      notas: tx.notas || '',
    }))
    setShowForm(true)
    scrollToForm()
  }, [scrollToForm])

  const onPatchForm = useCallback((patch) => {
    setForm((prev) => applyAutoCalculos({ ...prev, ...patch }))
    setOcrSuggested((prev) => {
      if (!prev || !Object.keys(prev).length) return prev
      const next = { ...prev }
      Object.keys(patch).forEach((k) => {
        if (k === 'proveedor_nit_base' || k === 'proveedor_nit_dv') delete next.proveedor_nit
        else delete next[k]
      })
      return next
    })
  }, [])

  const onTipoChange = useCallback((tipo) => {
    setForm((prev) => {
      const cats = tipo === 'egreso' ? catsEgreso : catsIngreso
      return applyAutoCalculos({
        ...prev,
        tipo,
        categoria_id: cats[0]?.id || '',
        proveedor_razon_social: tipo === 'egreso' ? prev.proveedor_razon_social : '',
        proveedor_nit_base: tipo === 'egreso' ? prev.proveedor_nit_base : '',
        proveedor_nit_dv: tipo === 'egreso' ? prev.proveedor_nit_dv : '',
      })
    })
    setOcrSuggested({})
  }, [catsEgreso, catsIngreso])

  const onCentroCostoChange = useCallback((value) => {
    setForm((prev) => {
      if (value === 'empresa' || !value) {
        return { ...prev, centro_costo_tipo: 'empresa', contrato_id: '' }
      }
      return { ...prev, centro_costo_tipo: 'contrato', contrato_id: value }
    })
  }, [])

  const payloadFromForm = useCallback(() => {
    const retencionValor = effectiveRetencion(form)
    const ivaPct = parsePct(form.iva_pct)
    const ivaValor = positiveAmount(form.iva_valor)
    return {
      fecha: form.fecha,
      tipo: form.tipo,
      valor_bruto: numOrZero(form.valor_bruto),
      retencion_fuente_tasa: retencionValor > 0 && parsePct(form.retencion_pct) > 0
        ? tasaFromPct(form.retencion_pct)
        : 0,
      retencion_fuente_valor: retencionValor,
      iva_tasa: ivaPct != null && ivaPct > 0 ? tasaFromPct(form.iva_pct) : 0,
      iva_valor: ivaValor,
      propina: form.propina_activa ? positiveAmount(form.propina) : 0,
      categoria_id: Number(form.categoria_id),
      centro_costo_tipo: form.centro_costo_tipo,
      contrato_id: form.centro_costo_tipo === 'contrato' ? Number(form.contrato_id) : null,
      fuente_ingreso: form.tipo === 'ingreso' ? form.fuente_ingreso : null,
      proveedor_razon_social: form.tipo === 'egreso' ? (form.proveedor_razon_social || null) : null,
      proveedor_nit: form.tipo === 'egreso' ? (joinNit(form.proveedor_nit_base, form.proveedor_nit_dv) || null) : null,
      notas: form.notas || null,
    }
  }, [form])

  const onSoporteFile = useCallback(async (file, { fromCamera = false } = {}) => {
    if (!file) return
    // 1) OCR primero (egreso) para obtener sugerencias + crop bbox
    // 2) Luego comprimir (y recortar si Azure devolvió bbox)
    let crop = null
    let ocrResult = null
    if (formTipoRef.current === 'egreso') {
      ocrResult = await runOcrIfEgreso(file)
      crop = ocrResult?.crop || null
    }
    try {
      const prepared = await prepareSoporteConPeso(file, 800 * 1024, { crop })
      setSoportePendiente(prepared)
    } catch {
      setSoportePendiente({
        file,
        originalBytes: file.size,
        compressedBytes: file.size,
        wasCompressed: false,
        wasCropped: false,
      })
    }
  }, [runOcrIfEgreso])

  const subirSoporteReplace = useCallback(async (txId, file, { fromCamera = false } = {}) => {
    if (!file || !txId) return
    setReplaceBusy(true)
    setBusy(true)
    try {
      let crop = null
      if (formTipoRef.current === 'egreso' || showForm) {
        const ocrResult = await runOcrIfEgreso(file)
        crop = ocrResult?.crop || null
      }
      const prepared = await prepareSoporteConPeso(file, 800 * 1024, { crop })
      const fd = new FormData()
      fd.append('archivo', prepared.file)
      await contabSend(`/transacciones/${txId}/soporte`, token, { method: 'POST', formData: fd })
      await cargar()
      if (preview.open && previewTxId === txId) {
        await abrirPreview({ id: txId, soporte_nombre_archivo: prepared.file.name, soporte_mime_type: prepared.file.type })
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setReplaceBusy(false)
      setBusy(false)
    }
  }, [token, cargar, runOcrIfEgreso, showForm, preview.open, previewTxId, abrirPreview])

  const onReplaceFromForm = useCallback(async (file, opts) => {
    if (editId) await subirSoporteReplace(editId, file, opts)
    else await onSoporteFile(file, opts)
  }, [editId, subirSoporteReplace, onSoporteFile])

  const onCancelar = useCallback(() => {
    setShowForm(false)
    setSoportePendiente(null)
    setOcrStatus('')
    setOcrSuggested({})
    setOcrMessage('')
  }, [])

  const guardar = useCallback(async () => {
    if (form.tipo === 'egreso') {
      if (!(form.proveedor_razon_social || '').trim()) {
        setError('La razón social del proveedor es obligatoria en egresos.')
        return
      }
      if (!(form.proveedor_nit_base || '').trim()) {
        setError('El NIT del proveedor es obligatorio en egresos.')
        return
      }
    }
    if (form.centro_costo_tipo === 'contrato' && !form.contrato_id) {
      setError('Seleccione un contrato para el centro de costo.')
      return
    }
    setBusy(true)
    setError('')
    try {
      let txId = editId
      const body = payloadFromForm()
      if (editId) {
        await contabSend(`/transacciones/${editId}`, token, { method: 'PATCH', body })
      } else {
        const created = await contabSend('/transacciones', token, { body })
        txId = created?.id
      }
      if (!editId && txId && soportePendiente?.file) {
        const fd = new FormData()
        fd.append('archivo', soportePendiente.file)
        await contabSend(`/transacciones/${txId}/soporte`, token, { method: 'POST', formData: fd })
      }
      setShowForm(false)
      setSoportePendiente(null)
      setOcrStatus('')
      setOcrSuggested({})
      setOcrMessage('')
      await cargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }, [form, editId, payloadFromForm, soportePendiente, token, cargar])

  const anular = useCallback(async (id) => {
    if (!window.confirm('¿Anular esta transacción?')) return
    setBusy(true)
    try {
      await contabSend(`/transacciones/${id}/anular`, token, { method: 'POST' })
      await cargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }, [token, cargar])

  const desdeOrden = useCallback(async (ordenId) => {
    setBusy(true)
    try {
      await contabSend(`/transacciones/desde-orden/${ordenId}`, token, { body: {} })
      await cargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }, [token, cargar])

  const subirSoporte = useCallback(async (txId, file, { fromCamera = false } = {}) => {
    if (!file) return
    setBusy(true)
    setSoporteInlineInfo('')
    try {
      let crop = null
      // OCR solo si el formulario abierto es egreso; en listado no forzamos OCR de egreso
      if (showForm && formTipoRef.current === 'egreso') {
        const ocrResult = await runOcrIfEgreso(file)
        crop = ocrResult?.crop || null
      }
      const prepared = await prepareSoporteConPeso(file, 800 * 1024, { crop })
      setSoporteInlineInfo([
        prepared.wasCropped ? 'documento recortado' : null,
        labelPesoSoporte(prepared),
      ].filter(Boolean).join(' · '))
      const fd = new FormData()
      fd.append('archivo', prepared.file)
      await contabSend(`/transacciones/${txId}/soporte`, token, { method: 'POST', formData: fd })
      await cargar()
      setSoporteInlineInfo('')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }, [token, cargar, runOcrIfEgreso, showForm])

  const touchPad = isMobile ? '12px 14px' : '8px 10px'
  const touchMin = isMobile ? 44 : undefined
  const inp = useMemo(() => ({
    background: t.inputBg,
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    padding: touchPad,
    color: t.text,
    fontSize: isMobile ? '16px' : 'var(--cc-sm)',
    width: '100%',
    boxSizing: 'border-box',
    minHeight: touchMin,
  }), [t.inputBg, t.border, t.text, touchPad, isMobile, touchMin])

  const lbl = useMemo(() => ({
    fontSize: 'var(--cc-sm)', color: t.textMuted, marginBottom: 4, display: 'block',
  }), [t.textMuted])

  const btn = useCallback((primary) => ({
    background: primary ? t.primary : 'transparent',
    color: primary ? '#fff' : t.primary,
    border: primary ? 'none' : `1.5px solid ${t.primary}`,
    borderRadius: 10,
    padding: isMobile ? '12px 16px' : '8px 14px',
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: 'var(--cc-sm)',
    minHeight: touchMin,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  }), [t.primary, isMobile, touchMin])

  return (
    <div>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'center',
        position: isMobile ? 'sticky' : 'static',
        top: isMobile ? 0 : undefined,
        zIndex: isMobile ? 5 : undefined,
        background: isMobile ? t.bg : undefined,
        paddingTop: isMobile ? 4 : 0,
        paddingBottom: isMobile ? 8 : 0,
      }}>
        <button type="button" style={{ ...btn(true), flex: isMobile ? '1 1 160px' : undefined }} onClick={() => abrirNueva('egreso')}>
          + {isMobile ? 'Egreso rápido' : 'Nueva transacción'}
        </button>
        <button type="button" style={{ ...btn(false), flex: isMobile ? '0 0 auto' : undefined }} onClick={() => abrirNueva('ingreso')}>
          Ingreso
        </button>
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} style={{ ...inp, width: isMobile ? '100%' : 'auto', flex: isMobile ? '1 1 100%' : undefined }}>
          <option value="">Todos los tipos</option>
          <option value="ingreso">Ingresos</option>
          <option value="egreso">Egresos</option>
        </select>
        <button type="button" style={btn(false)} onClick={cargar}>↻ Actualizar</button>
      </div>

      {ordenesPendientes.length > 0 && (
        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: t.text, marginBottom: 8 }}>Órdenes facturadas sin vincular ({ordenesPendientes.length})</div>
          {ordenesPendientes.slice(0, 5).map((o) => (
            <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: `1px solid ${t.border}`, fontSize: 'var(--cc-sm)', flexWrap: 'wrap' }}>
              <span style={{ color: t.text }}>
                Corte #{o.numero_corte} · {fmtCOP(o.subtotal)} + IVA {fmtCOP(o.iva_valor)}
                {o.contrato?.numero ? ` · ${o.contrato.numero}` : ''}
              </span>
              <button type="button" style={btn(true)} disabled={busy} onClick={() => desdeOrden(o.id)}>Crear ingreso</button>
            </div>
          ))}
        </div>
      )}

      {error && <div style={{ color: '#EF4444', marginBottom: 12, fontSize: 'var(--cc-sm)' }}>{error}</div>}

      {showForm && (
        <TransaccionFormPanel
          t={t}
          form={form}
          editId={editId}
          isMobile={isMobile}
          isTablet={isTablet}
          busy={busy}
          catsIngreso={catsIngreso}
          catsEgreso={catsEgreso}
          contratos={contratos}
          soportePendiente={soportePendiente}
          ocrStatus={ocrStatus}
          ocrSuggested={ocrSuggested}
          ocrMessage={ocrMessage}
          cameraRef={cameraRef}
          fileRef={fileRef}
          replaceRef={replaceRef}
          formRef={formRef}
          inp={inp}
          lbl={lbl}
          btn={btn}
          onPatchForm={onPatchForm}
          onTipoChange={onTipoChange}
          onCentroCostoChange={onCentroCostoChange}
          onSoporteFile={onSoporteFile}
          onReplaceSoporte={onReplaceFromForm}
          onGuardar={guardar}
          onCancelar={onCancelar}
        />
      )}

      {loading ? (
        <div style={{ color: t.textMuted }}>Cargando…</div>
      ) : isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {soporteInlineInfo && (
            <div style={{ fontSize: 'var(--cc-sm)', color: t.primary, fontWeight: 600 }}>
              Preparando soporte… {soporteInlineInfo}
            </div>
          )}
          {items.map((tx) => (
            <div
              key={tx.id}
              style={{
                background: t.bgCard,
                border: `1px solid ${t.border}`,
                borderRadius: 12,
                padding: 14,
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 'var(--cc-md)', color: t.text, marginBottom: 8 }}>
                {fmtCOP(tx.valor_neto)}
              </div>
              <TxDetailBlock tx={tx} t={t} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 10 }}>
                {tx.soporte_nombre_archivo ? (
                  <button type="button" style={btn(false)} onClick={() => abrirPreview(tx)}>
                    📎 Ver soporte
                    {tx.soporte_tamano_bytes ? (
                      <span style={{ marginLeft: 6, fontWeight: 500, color: t.textMuted }}>
                        ({fmtBytes(tx.soporte_tamano_bytes)})
                      </span>
                    ) : null}
                  </button>
                ) : (
                  <>
                    <button type="button" style={btn(true)} onClick={() => {
                      const el = document.getElementById(`cam-tx-${tx.id}`)
                      el?.click()
                    }}>
                      <Camera size={16} /> Foto
                    </button>
                    <label style={{ ...btn(false), cursor: 'pointer' }}>
                      📤 Archivo
                      <input
                        type="file"
                        accept=".pdf,image/*"
                        hidden
                        onChange={(e) => subirSoporte(tx.id, e.target.files?.[0], { fromCamera: false })}
                      />
                    </label>
                    <input
                      id={`cam-tx-${tx.id}`}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      hidden
                      onChange={(e) => {
                        subirSoporte(tx.id, e.target.files?.[0], { fromCamera: true })
                        e.target.value = ''
                      }}
                    />
                  </>
                )}
                <button type="button" style={btn(false)} onClick={() => abrirEditar(tx)}>✎</button>
                <button type="button" style={{ ...btn(false), color: '#EF4444', borderColor: '#EF4444' }} onClick={() => anular(tx.id)}>✕</button>
              </div>
            </div>
          ))}
          {!items.length && (
            <div style={{ padding: 28, textAlign: 'center', color: t.textMuted }}>
              Sin transacciones. Use «Egreso rápido» para registrar el primer recibo.
            </div>
          )}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {soporteInlineInfo && (
            <div style={{ fontSize: 'var(--cc-sm)', color: t.primary, fontWeight: 600, marginBottom: 8 }}>
              Preparando soporte… {soporteInlineInfo}
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)', minWidth: isTablet ? 980 : undefined }}>
            <thead>
              <tr style={{ background: t.primary + '18', color: t.text }}>
                {['Fecha', 'Tipo', 'Bruto', 'Retención', 'IVA', 'Propina', 'Total', 'Categoría', 'Centro', 'Proveedor', 'NIT', 'Origen', 'Notas', 'Soporte', ''].map((h) => (
                  <th key={h || 'acciones'} style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((tx) => (
                <tr key={tx.id} style={{ borderBottom: `1px solid ${t.border}` }}>
                  <td style={{ padding: '8px' }}>{tx.fecha}</td>
                  <td style={{ padding: '8px', color: tx.tipo === 'ingreso' ? '#10B981' : '#EF4444', fontWeight: 600 }}>{tx.tipo}</td>
                  <td style={{ padding: '8px' }}>{fmtCOP(tx.valor_bruto)}</td>
                  <td style={{ padding: '8px' }}>{fmtCOP(tx.retencion_fuente_valor)}</td>
                  <td style={{ padding: '8px' }}>{fmtCOP(tx.iva_valor)}</td>
                  <td style={{ padding: '8px' }}>{fmtCOP(tx.propina || 0)}</td>
                  <td style={{ padding: '8px', fontWeight: 600 }}>{fmtCOP(tx.valor_neto)}</td>
                  <td style={{ padding: '8px' }}>{tx.categoria?.nombre || '—'}</td>
                  <td style={{ padding: '8px', maxWidth: 180 }} title={labelCentroCosto(tx)}>{labelCentroCosto(tx)}</td>
                  <td style={{ padding: '8px', maxWidth: 160 }} title={tx.proveedor_razon_social || ''}>
                    {tx.tipo === 'egreso' ? (tx.proveedor_razon_social || '—') : '—'}
                  </td>
                  <td style={{ padding: '8px' }}>
                    {tx.tipo === 'egreso' ? (tx.proveedor_nit || '—') : '—'}
                  </td>
                  <td style={{ padding: '8px' }}>{tx.origen || '—'}</td>
                  <td style={{ padding: '8px', maxWidth: 160 }} title={tx.notas || ''}>
                    {tx.notas ? (tx.notas.length > 40 ? `${tx.notas.slice(0, 40)}…` : tx.notas) : '—'}
                  </td>
                  <td style={{ padding: '8px' }}>
                    {tx.soporte_nombre_archivo ? (
                      <button
                        type="button"
                        title={`Ver soporte${tx.soporte_tamano_bytes ? ` (${fmtBytes(tx.soporte_tamano_bytes)})` : ''}`}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer', color: t.primary,
                          padding: 0, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'inherit',
                        }}
                        onClick={() => abrirPreview(tx)}
                      >
                        <span>📎</span>
                        {tx.soporte_tamano_bytes ? (
                          <span style={{ color: t.textMuted, fontWeight: 500, fontSize: 'var(--cc-xs)' }}>
                            {fmtBytes(tx.soporte_tamano_bytes)}
                          </span>
                        ) : null}
                      </button>
                    ) : (
                      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <button
                          type="button"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, padding: 0 }}
                          title="Tomar foto"
                          onClick={() => document.getElementById(`cam-tx-d-${tx.id}`)?.click()}
                        >
                          📷
                        </button>
                        <label style={{ cursor: 'pointer', color: t.textMuted }} title="Adjuntar archivo">
                          📤
                          <input
                            type="file"
                            accept=".pdf,image/*"
                            hidden
                            onChange={(e) => subirSoporte(tx.id, e.target.files?.[0], { fromCamera: false })}
                          />
                        </label>
                        <input
                          id={`cam-tx-d-${tx.id}`}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          hidden
                          onChange={(e) => {
                            subirSoporte(tx.id, e.target.files?.[0], { fromCamera: true })
                            e.target.value = ''
                          }}
                        />
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                    <button type="button" style={{ ...btn(false), padding: '4px 8px', marginRight: 4, minHeight: undefined }} onClick={() => abrirEditar(tx)}>✎</button>
                    <button type="button" style={{ ...btn(false), padding: '4px 8px', color: '#EF4444', borderColor: '#EF4444', minHeight: undefined }} onClick={() => anular(tx.id)}>✕</button>
                  </td>
                </tr>
              ))}
              {!items.length && (
                <tr><td colSpan={15} style={{ padding: 24, textAlign: 'center', color: t.textMuted }}>Sin transacciones</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <SoportePreviewModal
        t={t}
        open={preview.open}
        loading={preview.loading}
        error={preview.error}
        nombre={preview.nombre}
        mime={preview.mime}
        blobUrl={preview.blobUrl}
        onClose={cerrarPreview}
        onDownload={descargarPreview}
        onReplace={previewTxId ? (file, opts) => subirSoporteReplace(previewTxId, file, opts) : undefined}
        replaceBusy={replaceBusy}
      />
    </div>
  )
}
