import { useEffect, useMemo, useState } from 'react'
import { btnSuccessStyle } from '../theme/adminPanelTheme'
import CcConfirmModal from '../components/CcConfirmModal'
import ExpedienteCompraModal from './ExpedienteCompraModal'
import SolicitudItemDetalleCard from './SolicitudItemDetalleCard'
import {
  ESTADO_SOLICITUD_LABEL,
  useAlmacenApi,
  useAlmacenCompact,
  useAlmacenTheme,
} from './almacenShared'

/**
 * Vista/modal de revisión y aprobación de una solicitud enviada.
 * Reemplaza la pestaña separada de Validación.
 */
export default function SolicitudRevisionModal({
  solicitudId,
  solicitudInicial,
  permisos,
  token,
  t,
  contratoId,
  onClose,
  onUpdated,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const compact = useAlmacenCompact()
  const [sol, setSol] = useState(solicitudInicial || null)
  const [motivo, setMotivo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmAprobar, setConfirmAprobar] = useState(false)
  const [expedienteOcId, setExpedienteOcId] = useState(null)
  const [loading, setLoading] = useState(!solicitudInicial)

  const theme = t || {
    primary: ui.accent,
    border: '#e2e8f0',
    text: ui.text,
    textMuted: ui.textMuted,
    bgCard: ui.card?.background || '#fff',
  }

  const modalTheme = useMemo(() => ({
    primary: ui.accent,
    bgCard: ui.card?.background || '#fff',
    border: '#e2e8f0',
    text: ui.text,
    textMuted: ui.textMuted,
  }), [ui])

  useEffect(() => {
    if (!solicitudId) return
    setLoading(true)
    api.getSolicitud(solicitudId)
      .then(setSol)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [api, solicitudId])

  const puedeValidar = permisos?.validar && sol?.estado === 'enviada'

  const ejecutarAprobar = async () => {
    if (!sol) return
    setBusy(true)
    setError('')
    try {
      const r = await api.aprobarSolicitud(sol.id, {})
      setConfirmAprobar(false)
      onUpdated?.(r)
      const oc = r.orden_compra_generada || r.orden_compra
      if (oc?.id) {
        setExpedienteOcId(oc.id)
      } else {
        onClose?.()
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const rechazar = async () => {
    if (!sol) return
    if (!motivo.trim()) {
      setError('Indique el motivo del rechazo.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const r = await api.rechazarSolicitud(sol.id, motivo)
      onUpdated?.(r)
      onClose?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const items = sol?.items || []
  const superaPresupuesto = items.some((it) => it.supera_presupuesto || it.contexto_presupuesto?.supera_presupuesto)
  const superaNegociado = items.some((it) => it.supera_negociado || it.contexto_negociado?.supera_negociado)

  return (
    <div
      className={compact ? 'cc-almacen-modal-overlay cc-almacen-modal-overlay--compact' : 'cc-almacen-modal-overlay'}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100010,
        background: 'rgba(15, 23, 42, 0.52)',
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
        className={compact ? 'cc-almacen-modal-sheet' : ''}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: compact ? '100%' : 'min(920px, 100%)',
          maxHeight: compact ? '96dvh' : '92vh',
          overflow: 'auto',
          background: theme.bgCard || '#fff',
          border: compact ? 'none' : `1px solid ${theme.border || '#e2e8f0'}`,
          borderRadius: compact ? '16px 16px 0 0' : 14,
          boxShadow: compact ? '0 -12px 40px rgba(0,0,0,0.25)' : '0 24px 64px rgba(0,0,0,0.28)',
          padding: compact ? '16px 16px calc(16px + env(safe-area-inset-bottom, 0px))' : 20,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 'var(--cc-title)', fontWeight: 800 }}>
              Revisar solicitud #{sol?.consecutivo || '…'}
            </div>
            <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginTop: 4 }}>
              {sol?.estado ? ESTADO_SOLICITUD_LABEL[sol.estado] : ''}
              {sol?.solicitante_nombre ? ` · Solicitada por ${sol.solicitante_nombre}` : ''}
            </div>
          </div>
          <button type="button" style={ui.btnSecondary} disabled={busy} onClick={onClose}>✕ Cerrar</button>
        </div>

        {loading && <div style={{ color: ui.textMuted, marginBottom: 12 }}>Cargando…</div>}
        {error && <div style={{ color: '#dc2626', marginBottom: 12 }}>{error}</div>}

        {superaPresupuesto && (
          <div style={{
            background: '#fef2f2',
            border: '2px solid #dc2626',
            color: '#991b1b',
            padding: 12,
            borderRadius: 8,
            marginBottom: 12,
            fontWeight: 700,
            fontSize: 'var(--cc-sm)',
          }}
          >
            ⚠ Esta solicitud supera el presupuesto disponible en uno o más ítems/PK-ID.
            Revise las líneas marcadas antes de aprobar y generar la Orden de Compra.
          </div>
        )}

        {superaNegociado && (
          <div style={{
            background: '#fef2f2',
            border: '2px solid #dc2626',
            color: '#991b1b',
            padding: 12,
            borderRadius: 8,
            marginBottom: 12,
            fontWeight: 700,
            fontSize: 'var(--cc-sm)',
          }}
          >
            ⚠ Una o más líneas superan la cantidad negociada con el proveedor.
            Revise las líneas marcadas antes de aprobar.
          </div>
        )}

        {items.map((it, idx) => (
          <SolicitudItemDetalleCard
            key={it.id ?? idx}
            item={{
              ...it,
              presupuesto_capitulo: it.capitulo,
              presupuesto_item: it.item,
              insumo: { label: it.material_descripcion },
              preview: {
                contexto_presupuesto: it.contexto_presupuesto,
                analisis_valor: it.analisis_valor,
                supera_presupuesto: it.supera_presupuesto,
                contexto_negociado: it.contexto_negociado,
                supera_negociado: it.supera_negociado,
              },
            }}
            consecutivo={sol?.consecutivo}
            lineIndex={idx + 1}
            contratoId={contratoId}
            token={token}
            theme={theme}
            compact={false}
            accordion
            defaultExpanded={false}
          />
        ))}

        {puedeValidar && (
          <>
            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted }}>Motivo rechazo (si aplica)</label>
              <input
                style={{ ...ui.input, marginTop: 4 }}
                value={motivo}
                disabled={busy}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <button
                type="button"
                style={btnSuccessStyle(ui.btnPrimary)}
                disabled={busy}
                onClick={() => setConfirmAprobar(true)}
              >
                ✓ Aprobar y generar OC
              </button>
              <button
                type="button"
                style={{ ...ui.btnPrimary, background: '#dc2626' }}
                disabled={busy}
                onClick={rechazar}
              >
                ✕ Rechazar
              </button>
            </div>
          </>
        )}

        {!puedeValidar && sol?.estado !== 'enviada' && (
          <div style={{ marginTop: 12, fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
            Esta solicitud ya no está pendiente de aprobación.
          </div>
        )}
      </div>

      {confirmAprobar && (
        <CcConfirmModal
          theme={modalTheme}
          titulo="Aprobar solicitud"
          tipo="info"
          confirmar="Aprobar y generar OC"
          cancelar="Cancelar"
          procesando={busy}
          onCancel={() => !busy && setConfirmAprobar(false)}
          onConfirm={ejecutarAprobar}
        >
          ¿Aprobar solicitud #{sol?.consecutivo}? Se generará la Orden de Compra automáticamente.
        </CcConfirmModal>
      )}

      {expedienteOcId && (
        <ExpedienteCompraModal
          ocId={expedienteOcId}
          token={token}
          onClose={() => {
            setExpedienteOcId(null)
            onClose?.()
          }}
        />
      )}
    </div>
  )
}
