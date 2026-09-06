import { useEffect, useMemo, useState } from 'react'
import CcModalBrandHeader from '../components/CcModalBrandHeader'
import { btnSuccessStyle } from '../theme/adminPanelTheme'
import InsumoSearchTable from './InsumoSearchTable'
import SolicitudLineaMapaModal from './SolicitudLineaMapaModal'
import TablaRentabilidadAcumulada from './TablaRentabilidadAcumulada'
import {
  descripcionItemPresupuesto,
  itemPuedeValidar,
  puedeAbrirRevisionLinea,
  rentabilidadDesdeAnalisis,
  textoLibreSolicitudItem,
} from './solicitudDetalleHelpers'
import {
  AlmacenHelpIcon,
  almacenFormModalDialogStyle,
  fmtCant,
  useAlmacenApi,
  useAlmacenCompact,
  useAlmacenTheme,
} from './almacenShared'

const LINEA_MODAL_WIDTH = 'min(1622px, 100%)'

function ExcelHeader({ abbr, tip, style, align = 'left' }) {
  return (
    <th
      style={{
        ...style,
        padding: '6px 8px',
        height: 34,
        whiteSpace: 'nowrap',
        textAlign: align,
        verticalAlign: 'middle',
      }}
      title={tip}
    >
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
        width: '100%',
      }}
      >
        <span style={{ fontWeight: 700, letterSpacing: '0.02em' }}>{abbr}</span>
        {tip ? <AlmacenHelpIcon ayuda={tip} /> : null}
      </span>
    </th>
  )
}

/**
 * Modal enfocado en la revisión Gerencial de una línea.
 * Campos editables en fila tipo Excel; descripción del ítem en bloque propio.
 */
export default function SolicitudLineaRevisionModal({
  sol,
  item,
  permisos,
  token,
  contratoId,
  t,
  onClose,
  onUpdated,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const compact = useAlmacenCompact()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [motivo, setMotivo] = useState('')
  const [mapaOpen, setMapaOpen] = useState(false)
  const [draft, setDraft] = useState({
    insumo: null,
    cantidad: '',
    valor_compra_unitario: '',
    vlr_unitario_cobro: '',
  })

  const puedeEditar = itemPuedeValidar(item, sol, permisos)
  const verEconomicos = permisos?.verEconomicos !== false
  const puedeAbrir = puedeAbrirRevisionLinea(permisos)

  useEffect(() => {
    if (!item) return
    setMotivo('')
    setError('')
    setMapaOpen(false)
    setDraft({
      insumo: item.insumo_id
        ? {
          insumo_id: item.insumo_id,
          listado_precio_id: item.listado_precio_id,
          label: item.material_descripcion,
          unidad: item.unidad,
          valor_compra_referencia: item.valor_compra_unitario,
          tiene_precio_compra: Number(item.valor_compra_unitario) > 0,
        }
        : null,
      cantidad: item.cantidad != null ? String(item.cantidad) : '',
      valor_compra_unitario: item.valor_compra_unitario != null && item.valor_compra_unitario !== ''
        ? String(item.valor_compra_unitario)
        : '',
      vlr_unitario_cobro: item.vlr_unitario_cobro != null && item.vlr_unitario_cobro !== ''
        ? String(item.vlr_unitario_cobro)
        : '',
    })
  }, [item?.id, item?.insumo_id, item?.cantidad, item?.valor_compra_unitario, item?.vlr_unitario_cobro, item?.material_descripcion])

  const descItem = useMemo(() => descripcionItemPresupuesto(item), [item])

  const metaLinea = useMemo(() => {
    if (!item) return ''
    const parts = [
      item.capitulo && item.item ? `${item.capitulo} · ${item.item}` : null,
      item.unidad ? `Und: ${item.unidad}` : null,
      item.pk_id ? `PK ${item.pk_id}` : null,
    ].filter(Boolean)
    return parts.join(' · ')
  }, [item])

  const tablaRentabilidad = useMemo(() => {
    if (!item) return null
    const raw = item.analisis_rentabilidad || item.preview?.analisis_rentabilidad
    if (raw) return raw
    const analisis = item.analisis_valor || item.preview?.analisis_valor
    if (analisis) {
      return rentabilidadDesdeAnalisis(analisis, {
        numeroOc: sol?.orden_compra?.numero_oc ?? item.numero_oc ?? null,
        consecutivo: sol?.consecutivo,
      })
    }
    const cant = Number(draft.cantidad)
    const vuCobro = Number(draft.vlr_unitario_cobro)
    const vuCosto = Number(draft.valor_compra_unitario)
    if (!(cant > 0)) return null
    if (!(vuCobro > 0) && !(vuCosto > 0)) return null
    const cobroLinea = cant * (vuCobro > 0 ? vuCobro : 0)
    const costoLinea = cant * (vuCosto > 0 ? vuCosto : 0)
    return rentabilidadDesdeAnalisis({
      cantidad: cant,
      valor_cobro_unitario: vuCobro > 0 ? vuCobro : 0,
      valor_cobro_linea: cobroLinea,
      costo_insumo_unitario: vuCosto > 0 ? vuCosto : 0,
      costo_insumo_linea: costoLinea,
      utilidad_estimada_linea: cobroLinea - costoLinea,
      rentabilidad_pct: cobroLinea > 0 ? ((cobroLinea - costoLinea) / cobroLinea) * 100 : null,
      tiene_precio_compra: vuCosto > 0,
    }, {
      numeroOc: sol?.orden_compra?.numero_oc ?? null,
      consecutivo: sol?.consecutivo,
    })
  }, [item, draft.cantidad, draft.vlr_unitario_cobro, draft.valor_compra_unitario, sol?.consecutivo, sol?.orden_compra?.numero_oc])

  if (!puedeAbrir || !item || !sol) return null

  const theme = t || {
    primary: ui.accent,
    border: '#e2e8f0',
    text: ui.text,
    textMuted: ui.textMuted,
    bgCard: ui.card?.background || '#fff',
  }

  const cellInp = {
    ...ui.input,
    width: '100%',
    minWidth: 0,
    padding: '4px 6px',
    fontSize: 'var(--cc-xs)',
    height: 30,
    boxSizing: 'border-box',
  }
  const td = { ...ui.td, padding: '4px 6px', verticalAlign: 'middle' }
  const th = { ...ui.th, fontSize: 'var(--cc-xs)' }

  const guardarMapeo = async () => {
    if (!draft.insumo?.insumo_id) {
      setError('Seleccione el insumo del catálogo.')
      return null
    }
    const cant = Number(draft.cantidad)
    if (!(cant > 0)) {
      setError('La cantidad debe ser mayor a cero.')
      return null
    }
    const costo = Number(draft.valor_compra_unitario)
    if (!(costo > 0)) {
      setError('Defina el costo de compra unitario.')
      return null
    }
    const body = {
      insumo_id: Number(draft.insumo.insumo_id),
      cantidad: cant,
      valor_compra_unitario: costo,
    }
    if (draft.vlr_unitario_cobro !== '') {
      body.vlr_unitario_cobro = Number(draft.vlr_unitario_cobro)
    }
    return api.mapearItemSolicitud(sol.id, item.id, body)
  }

  const validar = async (accion) => {
    if (!puedeEditar) return
    if (accion === 'rechazar' && !motivo.trim()) {
      setError('Indique el motivo del rechazo del ítem.')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (accion === 'aprobar') {
        const mapped = await guardarMapeo()
        if (!mapped) return
      }
      const r = await api.validarItemSolicitud(sol.id, item.id, {
        accion,
        motivo: accion === 'rechazar' ? motivo : undefined,
      })
      onUpdated?.(r)
      onClose?.()
    } catch (e) {
      setError(e.message || 'No se pudo validar el ítem.')
    } finally {
      setBusy(false)
    }
  }

  const soloGuardar = async () => {
    if (!puedeEditar) return
    setBusy(true)
    setError('')
    try {
      const r = await guardarMapeo()
      if (r) onUpdated?.(r)
    } catch (e) {
      setError(e.message || 'No se pudo guardar el mapeo.')
    } finally {
      setBusy(false)
    }
  }

  const dialogBorder = `1px solid ${ui.textMuted}40`
  const descContratista = textoLibreSolicitudItem(item) || '—'

  return (
    <div
      className={compact ? 'cc-almacen-modal-overlay cc-almacen-modal-overlay--compact' : 'cc-almacen-modal-overlay'}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100035,
        display: 'flex',
        alignItems: compact ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: compact ? 0 : 20,
      }}
      onClick={() => !busy && !mapaOpen && onClose?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="solicitud-linea-revision-title"
        className={compact ? 'cc-almacen-modal-sheet' : ''}
        onClick={(e) => e.stopPropagation()}
        style={{
          ...almacenFormModalDialogStyle({ width: LINEA_MODAL_WIDTH, compact }),
          maxHeight: compact ? '94vh' : '92vh',
          overflow: 'auto',
          overflowX: 'visible',
          border: dialogBorder,
          boxShadow: '0 24px 64px rgba(15, 23, 42, 0.28)',
          padding: compact ? '16px 16px calc(16px + env(safe-area-inset-bottom, 0px))' : '22px 24px 24px',
        }}
      >
        <CcModalBrandHeader theme={t} />
        <header style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 14,
          paddingBottom: 12,
          borderBottom: `1px solid ${ui.textMuted}33`,
        }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div id="solicitud-linea-revision-title" style={{ fontSize: 'var(--cc-title)', fontWeight: 800 }}>
              Revisión de línea {item.numero_linea != null ? `#${item.numero_linea}` : ''}
            </div>
            {metaLinea && (
              <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginTop: 4 }}>
                {metaLinea}
              </div>
            )}
            {descItem && (
              <div style={{
                fontSize: 'var(--cc-sm)',
                fontWeight: 600,
                color: ui.text,
                marginTop: 6,
                lineHeight: 1.4,
                padding: '8px 10px',
                borderRadius: 6,
                background: `${ui.accentSoft}`,
                border: `1px solid ${ui.textMuted}22`,
              }}
              >
                {descItem}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'flex-start' }}>
            <button
              type="button"
              style={{ ...ui.btnSecondary, padding: '8px 14px' }}
              disabled={busy || !item.pk_id}
              title={item.pk_id ? 'Ver ubicación en mapa' : 'Sin PK-ID'}
              onClick={() => setMapaOpen(true)}
            >
              🗺️ Mapa
            </button>
            <button
              type="button"
              style={{ ...ui.btnSecondary, padding: '8px 14px' }}
              disabled={busy}
              onClick={onClose}
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
        </header>

        {error && (
          <div style={{
            color: '#991b1b',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            padding: '10px 12px',
            marginBottom: 14,
            fontSize: 'var(--cc-sm)',
          }}
          >
            {error}
          </div>
        )}

        {puedeEditar ? (
          <>
            <div style={{ ...ui.sheetWrap, overflow: 'visible', marginBottom: 12 }} className="cc-almacen-table-scroll">
              <table style={{ ...ui.sheetTable, minWidth: verEconomicos ? 920 : 640, tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: 220 }} />
                  <col style={{ width: 280 }} />
                  <col style={{ width: 88 }} />
                  {verEconomicos && <col style={{ width: 110 }} />}
                  {verEconomicos && <col style={{ width: 110 }} />}
                </colgroup>
                <thead>
                  <tr>
                    <ExcelHeader abbr="DESC. CONTRATISTA" tip="Descripción del material solicitada por el Contratista" style={th} />
                    <ExcelHeader abbr="INSUMO" tip="Insumo del catálogo administrativo" style={th} />
                    <ExcelHeader abbr="CANT." tip="Cantidad solicitada" style={th} align="right" />
                    {verEconomicos && (
                      <ExcelHeader abbr="COSTO" tip="Costo de compra unitario" style={th} align="right" />
                    )}
                    {verEconomicos && (
                      <ExcelHeader abbr="COBRO" tip="Valor unitario de cobro" style={th} align="right" />
                    )}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={td}>
                      <div
                        title={descContratista}
                        style={{
                          fontSize: 'var(--cc-xs)',
                          lineHeight: 1.35,
                          maxHeight: 64,
                          overflow: 'auto',
                          whiteSpace: 'pre-wrap',
                          padding: '4px 2px',
                        }}
                      >
                        {descContratista}
                      </div>
                    </td>
                    <td style={{ ...td, overflow: 'visible' }}>
                      <InsumoSearchTable
                        hideLabel
                        value={draft.insumo}
                        disabled={busy}
                        suggestFrom={descContratista !== '—' ? descContratista : ''}
                        inputStyle={{ padding: '4px 6px', fontSize: 'var(--cc-xs)', height: 30 }}
                        onChange={(ins) => setDraft((d) => ({
                          ...d,
                          insumo: ins,
                          valor_compra_unitario: ins?.tiene_precio_compra
                            ? String(ins.valor_compra_referencia ?? '')
                            : d.valor_compra_unitario,
                        }))}
                      />
                    </td>
                    <td style={td}>
                      <input
                        style={{ ...cellInp, textAlign: 'right' }}
                        type="number"
                        min="0"
                        step="any"
                        value={draft.cantidad}
                        disabled={busy}
                        onChange={(e) => setDraft((d) => ({ ...d, cantidad: e.target.value }))}
                      />
                    </td>
                    {verEconomicos && (
                      <td style={td}>
                        <input
                          style={{ ...cellInp, textAlign: 'right' }}
                          type="number"
                          min="0"
                          step="any"
                          value={draft.valor_compra_unitario}
                          disabled={busy}
                          onChange={(e) => setDraft((d) => ({ ...d, valor_compra_unitario: e.target.value }))}
                        />
                      </td>
                    )}
                    {verEconomicos && (
                      <td style={td}>
                        <input
                          style={{ ...cellInp, textAlign: 'right' }}
                          type="number"
                          min="0"
                          step="any"
                          value={draft.vlr_unitario_cobro}
                          disabled={busy}
                          onChange={(e) => setDraft((d) => ({ ...d, vlr_unitario_cobro: e.target.value }))}
                        />
                      </td>
                    )}
                  </tr>
                </tbody>
              </table>
            </div>

            {verEconomicos && tablaRentabilidad && (
              <div style={{ marginBottom: 12 }}>
                <TablaRentabilidadAcumulada
                  analisisRentabilidad={tablaRentabilidad}
                  proveedorCatalogo={item.proveedor_catalogo}
                  verEconomicos={verEconomicos}
                  defaultExpanded={false}
                />
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <textarea
                style={{
                  ...ui.input,
                  minHeight: 72,
                  resize: 'vertical',
                  width: '100%',
                  boxSizing: 'border-box',
                  fontSize: 'var(--cc-sm)',
                  padding: '10px 12px',
                  lineHeight: 1.45,
                }}
                placeholder="Motivo si rechaza este ítem…"
                value={motivo}
                disabled={busy}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </div>

            <div style={{
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              alignItems: 'center',
              paddingTop: 4,
            }}
            >
              <button
                type="button"
                style={{ ...ui.btnSecondary, padding: '10px 16px' }}
                disabled={busy}
                onClick={() => { void soloGuardar() }}
              >
                {busy ? 'Guardando…' : 'Guardar mapeo'}
              </button>
              <button
                type="button"
                style={{ ...btnSuccessStyle(ui.btnPrimary), padding: '10px 18px' }}
                disabled={busy}
                onClick={() => { void validar('aprobar') }}
              >
                ✓ Aprobar ítem
              </button>
              <button
                type="button"
                style={{ ...ui.btnSecondary, color: '#dc2626', borderColor: '#dc262666', padding: '10px 16px' }}
                disabled={busy}
                onClick={() => { void validar('rechazar') }}
              >
                ✕ Rechazar ítem
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ ...ui.sheetWrap, marginBottom: 10 }} className="cc-almacen-table-scroll">
              <table style={{ ...ui.sheetTable, minWidth: verEconomicos ? 560 : 360, tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: 280 }} />
                  <col style={{ width: 100 }} />
                  {verEconomicos && <col style={{ width: 100 }} />}
                  {verEconomicos && <col style={{ width: 100 }} />}
                </colgroup>
                <thead>
                  <tr>
                    <ExcelHeader abbr="INSUMO" tip="Insumo asignado" style={th} />
                    <ExcelHeader abbr="CANT." tip="Cantidad" style={th} align="right" />
                    {verEconomicos && <ExcelHeader abbr="COSTO" tip="Costo de compra" style={th} align="right" />}
                    {verEconomicos && <ExcelHeader abbr="COBRO" tip="Valor de cobro" style={th} align="right" />}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={td}>
                      <span title={item.material_descripcion || ''} style={{ fontSize: 'var(--cc-xs)' }}>
                        {item.material_descripcion || '—'}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtCant(item.cantidad)}{item.unidad ? ` ${item.unidad}` : ''}
                    </td>
                    {verEconomicos && (
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtCant(item.valor_compra_unitario)}
                      </td>
                    )}
                    {verEconomicos && (
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtCant(item.vlr_unitario_cobro)}
                      </td>
                    )}
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginBottom: 10 }}>
              Esta línea ya no admite revisión (aprobada, rechazada o con OC).
            </div>
            {verEconomicos && tablaRentabilidad && (
              <TablaRentabilidadAcumulada
                analisisRentabilidad={tablaRentabilidad}
                proveedorCatalogo={item.proveedor_catalogo}
                verEconomicos={verEconomicos}
                defaultExpanded={false}
              />
            )}
          </>
        )}
      </div>

      {mapaOpen && (
        <SolicitudLineaMapaModal
          item={item}
          token={token}
          contratoId={contratoId}
          t={theme}
          onClose={() => setMapaOpen(false)}
        />
      )}
    </div>
  )
}
