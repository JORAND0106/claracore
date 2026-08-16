import { useEffect, useMemo, useState } from 'react'
import { btnSuccessStyle } from '../theme/adminPanelTheme'
import InsumoSearchTable from './InsumoSearchTable'
import {
  itemPuedeValidar,
  textoLibreSolicitudItem,
} from './solicitudDetalleHelpers'
import {
  AlmacenFieldLabel,
  almacenFormModalDialogStyle,
  fmtCant,
  useAlmacenApi,
  useAlmacenCompact,
  useAlmacenTheme,
} from './almacenShared'

/**
 * Modal enfocado en la revisión Gerencial de una línea:
 * texto libre RO, insumo, cantidad, costo/cobro, comentarios, aprobar/rechazar.
 */
export default function SolicitudLineaRevisionModal({
  sol,
  item,
  permisos,
  onClose,
  onUpdated,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const compact = useAlmacenCompact()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [motivo, setMotivo] = useState('')
  const [draft, setDraft] = useState({
    insumo: null,
    cantidad: '',
    valor_compra_unitario: '',
    vlr_unitario_cobro: '',
  })

  const puedeEditar = itemPuedeValidar(item, sol, permisos)
  const verEconomicos = permisos?.verEconomicos !== false

  useEffect(() => {
    if (!item) return
    setMotivo('')
    setError('')
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

  const metaLinea = useMemo(() => {
    if (!item) return ''
    const parts = [
      item.capitulo && item.item ? `${item.capitulo} · ${item.item}` : null,
      item.unidad ? `Und: ${item.unidad}` : null,
      item.pk_id ? `PK ${item.pk_id}` : null,
    ].filter(Boolean)
    return parts.join(' · ')
  }, [item])

  if (!item || !sol) return null

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
      if (r) {
        onUpdated?.(r)
      }
    } catch (e) {
      setError(e.message || 'No se pudo guardar el mapeo.')
    } finally {
      setBusy(false)
    }
  }

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
        padding: compact ? 0 : 16,
      }}
      onClick={() => !busy && onClose?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="solicitud-linea-revision-title"
        className={compact ? 'cc-almacen-modal-sheet' : ''}
        onClick={(e) => e.stopPropagation()}
        style={{
          ...almacenFormModalDialogStyle({ width: 'min(720px, 100%)', compact }),
          maxHeight: compact ? '92vh' : '90vh',
          overflow: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div id="solicitud-linea-revision-title" style={{ fontSize: 'var(--cc-title)', fontWeight: 800 }}>
              Revisión de línea {item.numero_linea != null ? `#${item.numero_linea}` : ''}
            </div>
            {metaLinea && (
              <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginTop: 2 }}>
                {metaLinea}
              </div>
            )}
          </div>
          <button
            type="button"
            style={{ ...ui.btnSecondary, padding: '6px 12px', flexShrink: 0 }}
            disabled={busy}
            onClick={onClose}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {error && (
          <div style={{
            color: '#991b1b',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            padding: '8px 10px',
            marginBottom: 10,
            fontSize: 'var(--cc-sm)',
          }}
          >
            {error}
          </div>
        )}

        <div style={{
          marginBottom: 12,
          padding: '10px 12px',
          borderRadius: 8,
          background: `${ui.accentSoft}`,
          border: `1px solid ${ui.textMuted}22`,
        }}
        >
          <div style={{ fontSize: 'var(--cc-xs)', fontWeight: 700, color: ui.textMuted, marginBottom: 4 }}>
            Descripción del Contratista
          </div>
          <div style={{ fontSize: 'var(--cc-sm)', whiteSpace: 'pre-wrap' }}>
            {textoLibreSolicitudItem(item) || '—'}
          </div>
        </div>

        {puedeEditar ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <InsumoSearchTable
              value={draft.insumo}
              disabled={busy}
              onChange={(ins) => setDraft((d) => ({
                ...d,
                insumo: ins,
                valor_compra_unitario: ins?.tiene_precio_compra
                  ? String(ins.valor_compra_referencia ?? '')
                  : d.valor_compra_unitario,
              }))}
            />

            <div style={{
              display: 'grid',
              gridTemplateColumns: compact ? '1fr' : (verEconomicos ? 'repeat(3, minmax(0, 1fr))' : '1fr'),
              gap: 8,
            }}
            >
              <div>
                <AlmacenFieldLabel icon="🔢" label="Cantidad" compact />
                <input
                  style={{ ...ui.input, padding: '6px 8px', fontSize: 'var(--cc-sm)' }}
                  type="number"
                  min="0"
                  step="any"
                  value={draft.cantidad}
                  disabled={busy}
                  onChange={(e) => setDraft((d) => ({ ...d, cantidad: e.target.value }))}
                />
              </div>
              {verEconomicos && (
                <>
                  <div>
                    <AlmacenFieldLabel icon="💵" label="Costo de compra" compact ayuda="Valor unitario de adquisición." />
                    <input
                      style={{ ...ui.input, padding: '6px 8px', fontSize: 'var(--cc-sm)' }}
                      type="number"
                      min="0"
                      step="any"
                      value={draft.valor_compra_unitario}
                      disabled={busy}
                      onChange={(e) => setDraft((d) => ({ ...d, valor_compra_unitario: e.target.value }))}
                    />
                  </div>
                  <div>
                    <AlmacenFieldLabel icon="💰" label="Valor de cobro" compact ayuda="Valor unitario a cobrar." />
                    <input
                      style={{ ...ui.input, padding: '6px 8px', fontSize: 'var(--cc-sm)' }}
                      type="number"
                      min="0"
                      step="any"
                      value={draft.vlr_unitario_cobro}
                      disabled={busy}
                      onChange={(e) => setDraft((d) => ({ ...d, vlr_unitario_cobro: e.target.value }))}
                    />
                  </div>
                </>
              )}
            </div>

            <div>
              <AlmacenFieldLabel icon="💬" label="Comentarios" compact ayuda="Motivo si rechaza este ítem." />
              <textarea
                style={{
                  ...ui.input,
                  minHeight: 72,
                  resize: 'vertical',
                  width: '100%',
                  boxSizing: 'border-box',
                  fontSize: 'var(--cc-sm)',
                }}
                placeholder="Motivo si rechaza este ítem…"
                value={motivo}
                disabled={busy}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              <button
                type="button"
                style={{ ...ui.btnSecondary, padding: '8px 12px' }}
                disabled={busy}
                onClick={() => { void soloGuardar() }}
              >
                {busy ? 'Guardando…' : 'Guardar mapeo'}
              </button>
              <button
                type="button"
                style={btnSuccessStyle(ui.btnPrimary)}
                disabled={busy}
                onClick={() => { void validar('aprobar') }}
              >
                ✓ Aprobar ítem
              </button>
              <button
                type="button"
                style={{ ...ui.btnSecondary, color: '#dc2626', borderColor: '#dc262666' }}
                disabled={busy}
                onClick={() => { void validar('rechazar') }}
              >
                ✕ Rechazar ítem
              </button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
            <div style={{ marginBottom: 8 }}>
              Insumo: <strong style={{ color: ui.text }}>{item.material_descripcion || '—'}</strong>
            </div>
            <div style={{ marginBottom: 8 }}>
              Cantidad: <strong style={{ color: ui.text }}>{fmtCant(item.cantidad)} {item.unidad || ''}</strong>
            </div>
            {verEconomicos && (
              <div style={{ marginBottom: 8 }}>
                Costo: {fmtCant(item.valor_compra_unitario)} · Cobro: {fmtCant(item.vlr_unitario_cobro)}
              </div>
            )}
            <div>Esta línea ya no admite revisión (aprobada, rechazada o con OC).</div>
          </div>
        )}
      </div>
    </div>
  )
}
