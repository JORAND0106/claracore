import { useState } from 'react'
import AlmacenItemMapaPreview from './AlmacenItemMapaPreview'
import LineaResumenEconomico from './LineaResumenEconomico'
import {
  fmtCant,
  formatSolicitudLinea,
  useAlmacenTheme,
} from './almacenShared'

function fmtAbscisa(absIni, absFin) {
  const a = (absIni || '').trim()
  const b = (absFin || '').trim()
  if (a && b && a !== b) return `${a} → ${b}`
  return a || b || '—'
}

export default function SolicitudItemDetalleCard({
  item,
  consecutivo,
  lineIndex,
  contratoId,
  token,
  theme,
  compact = false,
  accordion = true,
  defaultExpanded = false,
}) {
  const ui = useAlmacenTheme()
  const [expanded, setExpanded] = useState(!accordion || defaultExpanded)
  const ctx = item.preview?.contexto_presupuesto || item.contexto_presupuesto
  const ctxNeg = item.preview?.contexto_negociado || item.contexto_negociado
  const analisis = item.preview?.analisis_valor || item.analisis_valor
  const supera = item.preview?.supera_presupuesto || item.supera_presupuesto || ctx?.supera_presupuesto
  const superaNeg = item.preview?.supera_negociado || item.supera_negociado || ctxNeg?.supera_negociado
  const alerta = supera || superaNeg
  const numeroLinea = item.numero_linea ?? lineIndex
  const pkLabel = item.pk_label || item.pk_id || ''
  const absIni = item.abs_inicio_display || ctx?.abs_inicio || item.abscisa_inicial
  const absFin = item.abs_final_display || ctx?.abs_final || item.abscisa_final
  const observacion = (item.observacion_residente || '').trim()
  const material = item.insumo?.label || item.material_descripcion || '—'
  const absResumen = fmtAbscisa(absIni, absFin)

  const toggle = () => {
    if (accordion) setExpanded((v) => !v)
  }

  const headerContent = (
    <>
      <div style={{
        fontSize: 'var(--cc-xs)',
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: ui.accent,
        marginBottom: 4,
      }}
      >
        {formatSolicitudLinea(consecutivo, numeroLinea)}
      </div>
      <div style={{ fontWeight: 700, fontSize: 'var(--cc-sm)' }}>
        {item.presupuesto_capitulo || item.capitulo} · {item.presupuesto_item || item.item} — {material}
      </div>
      <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginTop: 2 }}>
        Cantidad: {fmtCant(item.cantidad)} {item.unidad || ctx?.unidad || ''}
        {item.es_recurrente ? ' · Compra recurrente' : ''}
        {accordion && !expanded && absResumen !== '—' && (
          <span> · Abscisa: {absResumen}</span>
        )}
      </div>
      {alerta && !expanded && (
        <div style={{ color: '#dc2626', fontWeight: 700, fontSize: 'var(--cc-xs)', marginTop: 4 }}>
          {supera && superaNeg ? '⚠ Supera presupuesto y cantidad negociada' : superaNeg ? '⚠ Supera cantidad negociada' : '⚠ Supera presupuesto'}
        </div>
      )}
    </>
  )

  const bodyContent = (
    <>
      {supera && (
        <div style={{ color: '#dc2626', fontWeight: 800, marginBottom: 8, fontSize: 'var(--cc-sm)' }}>
          ⚠ Supera presupuesto disponible en este PK-ID
        </div>
      )}
      {superaNeg && ctxNeg?.tiene_negociado && (
        <div style={{ color: '#dc2626', fontWeight: 800, marginBottom: 8, fontSize: 'var(--cc-sm)' }}>
          ⚠ Supera cantidad negociada con el proveedor ({fmtCant(ctxNeg.consumo_total_despues)} / {fmtCant(ctxNeg.cantidad_negociada)} {ctxNeg.unidad})
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: compact ? '1fr' : '1fr 1fr',
        gap: 12,
        marginBottom: 10,
      }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <div style={{ fontSize: 'var(--cc-xs)', fontWeight: 700, color: ui.text, marginBottom: 2 }}>
              📏 Abscisa
            </div>
            <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 600 }}>{absResumen}</div>
            {item.costado && (
              <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginTop: 2 }}>
                Costado: {item.costado}
              </div>
            )}
          </div>

          {observacion && (
            <div>
              <div style={{ fontSize: 'var(--cc-xs)', fontWeight: 700, color: ui.text, marginBottom: 2 }}>
                💬 Observación del solicitante
              </div>
              <div style={{ fontSize: 'var(--cc-sm)', whiteSpace: 'pre-wrap' }}>{observacion}</div>
            </div>
          )}

          <div>
            <div style={{ fontSize: 'var(--cc-xs)', fontWeight: 700, color: ui.text, marginBottom: 2 }}>
              🛣️ Tramo
            </div>
            <div style={{ fontSize: 'var(--cc-sm)' }}>{item.tramo || ctx?.tramo || '—'}</div>
          </div>

          <div>
            <div style={{ fontSize: 'var(--cc-xs)', fontWeight: 700, color: ui.textMuted, marginBottom: 2 }}>
              PK-ID (referencia)
            </div>
            <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>{pkLabel || '—'}</div>
          </div>
        </div>

        {!compact && pkLabel && (
          <AlmacenItemMapaPreview
            t={theme}
            token={token}
            contratoId={contratoId}
            pkLabel={pkLabel}
            height={200}
          />
        )}
      </div>

      {ctxNeg?.tiene_negociado && (
        <div style={{
          fontSize: 'var(--cc-xs)',
          color: superaNeg ? '#991b1b' : ui.textMuted,
          padding: '8px 10px',
          borderRadius: 6,
          background: superaNeg ? '#fff' : `${ui.accentSoft}`,
          marginBottom: analisis ? 6 : 0,
        }}
        >
          Negociado: {fmtCant(ctxNeg.cantidad_negociada)} {ctxNeg.unidad} ·
          Consumido: {fmtCant(ctxNeg.consumo_total_despues)} ·
          Saldo: <strong>{fmtCant(ctxNeg.saldo_negociado_despues)}</strong>
        </div>
      )}

      {ctx && (
        <div style={{
          fontSize: 'var(--cc-xs)',
          color: supera ? '#991b1b' : ui.textMuted,
          padding: '8px 10px',
          borderRadius: 6,
          background: supera ? '#fff' : `${ui.accentSoft}`,
          marginBottom: analisis ? 6 : 0,
        }}
        >
          Presupuestado: {fmtCant(ctx.cant_presupuestada)} ·
          Solicitado acum.: {fmtCant(ctx.cant_solicitada_acumulada)} ·
          Saldo: <strong>{fmtCant(ctx.saldo_disponible_despues)}</strong>
        </div>
      )}

      {analisis && (
        <LineaResumenEconomico analisis={analisis} color={ui.textMuted} />
      )}

      {item.proveedor_catalogo && (
        <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginTop: 6 }}>
          Proveedor catálogo: {item.proveedor_catalogo}
        </div>
      )}
    </>
  )

  return (
    <div
      style={{
        border: alerta ? '2px solid #dc2626' : `1px solid ${ui.textMuted}33`,
        borderRadius: 10,
        marginBottom: compact ? 8 : 10,
        background: alerta ? '#fef2f2' : `${ui.accentSoft}88`,
        overflow: 'hidden',
      }}
    >
      {accordion ? (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          style={{
            width: '100%',
            textAlign: 'left',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: compact ? '10px 12px' : '12px 14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 8,
            color: 'inherit',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>{headerContent}</div>
          <span style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, flexShrink: 0, marginTop: 2 }} aria-hidden>
            {expanded ? '▾' : '▸'}
          </span>
        </button>
      ) : (
        <div style={{ padding: compact ? 10 : 14 }}>{headerContent}</div>
      )}

      {(!accordion || expanded) && (
        <div style={{ padding: accordion ? '0 14px 14px' : 0, paddingTop: accordion ? 0 : undefined }}>
          {bodyContent}
        </div>
      )}
    </div>
  )
}
