/**
 * Popup festivo de cumpleaños del mes — collage + descarga PDF.
 * Plantilla visual rotada cada 4 meses (4 diseños).
 */
import { useState } from 'react'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import {
  MENSAJE_MOTIVACIONAL_DEFAULT,
  nombreMesEs,
  plantillaCumpleanosFromPayload,
} from './rrhhCumpleanos'

export default function CumpleanosFestivoModal({
  open,
  onClose,
  cumpleanos,
  api,
  theme,
  tTok,
  flash,
}) {
  const [busyPdf, setBusyPdf] = useState(false)
  if (!open) return null

  const items = Array.isArray(cumpleanos?.items) ? cumpleanos.items : []
  const pal = plantillaCumpleanosFromPayload(cumpleanos)
  const mesLabel = nombreMesEs(cumpleanos?.mes)
  const titulo = mesLabel
    ? `Cumpleaños de ${mesLabel}${cumpleanos?.anio ? ` ${cumpleanos.anio}` : ''}`
    : 'Cumpleaños del mes'
  const mensaje = (cumpleanos?.mensaje_motivacional || '').trim() || MENSAJE_MOTIVACIONAL_DEFAULT

  const descargarPdf = async () => {
    if (!api?.downloadBlob || !api?.cumpleanosMesPdfUrl) return
    setBusyPdf(true)
    try {
      const mes = cumpleanos?.mes || new Date().getMonth() + 1
      await api.downloadBlob(
        api.cumpleanosMesPdfUrl(),
        `cumpleanos_${String(mes).padStart(2, '0')}.pdf`,
      )
      flash?.('success', 'PDF de cumpleaños descargado.')
    } catch (e) {
      flash?.('error', e.message || 'No se pudo descargar el PDF.')
    } finally {
      setBusyPdf(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10020,
        background: 'rgba(15,23,42,0.55)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
      }}
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(920px, 98vw)',
          maxHeight: '94vh',
          borderRadius: 16,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(15,23,42,0.25)',
          background: pal.cardBg,
          border: `1px solid ${tTok?.border || '#BAE6FD'}`,
        }}
      >
        <CcModalBrandHeader theme={theme} />
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            background: pal.bg,
            padding: '18px 20px 20px',
            position: 'relative',
          }}
        >
          {/* Decoración festiva */}
          <div
            aria-hidden
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 10,
              fontSize: 22,
              marginBottom: 6,
              letterSpacing: 2,
            }}
          >
            {pal.decor.map((d, i) => (
              <span key={`${d}-${i}`} style={{ transform: i % 2 ? 'rotate(-8deg)' : 'rotate(8deg)', display: 'inline-block' }}>
                {d}
              </span>
            ))}
          </div>

          <h2
            style={{
              margin: '0 0 8px',
              textAlign: 'center',
              fontSize: 'var(--cc-h2)',
              fontWeight: 900,
              color: pal.accent,
              letterSpacing: '-0.02em',
            }}
          >
            {titulo}
          </h2>
          <p
            style={{
              margin: '0 auto 16px',
              maxWidth: 560,
              textAlign: 'center',
              fontSize: 'var(--cc-sm)',
              lineHeight: 1.45,
              color: pal.muted,
              fontWeight: 600,
            }}
          >
            {mensaje}
          </p>

          {items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '28px 12px', color: pal.muted, fontWeight: 600 }}>
              Ningún colaborador activo cumple años este mes.
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                gap: 12,
                alignItems: 'stretch',
              }}
            >
              {items.map((row, idx) => {
                const rot = ((idx % 5) - 2) * 1.4
                return (
                  <div
                    key={row.id ?? `${row.nombre_completo}-${row.dia}`}
                    style={{
                      background: pal.cardBg,
                      border: `2px solid ${pal.cardBorder}`,
                      borderRadius: 14,
                      padding: '14px 12px 12px',
                      textAlign: 'center',
                      transform: `rotate(${rot}deg)`,
                      boxShadow: '0 4px 14px rgba(15,23,42,0.08)',
                      minHeight: 118,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      gap: 4,
                    }}
                  >
                    <div style={{ fontSize: 22, fontWeight: 900, color: pal.accent, fontVariantNumeric: 'tabular-nums' }}>
                      {String(row.dia).padStart(2, '0')}
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 'var(--cc-sm)', color: pal.text, lineHeight: 1.25 }}>
                      {row.nombre_completo || row.primer_nombre || '—'}
                    </div>
                    <div style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: pal.muted, marginTop: 2 }}>
                      {row.empresa_abrev || row.empresa_nombre || '—'}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div
          style={{
            padding: '12px 16px',
            borderTop: `1px solid ${tTok?.border || '#BAE6FD'}`,
            background: tTok?.bgCard || '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 'var(--cc-caption)', color: tTok?.textMuted, fontWeight: 600 }}>
            {pal.nombre} · {items.length} cumpleañero{items.length === 1 ? '' : 's'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: `1px solid ${tTok?.border || '#BAE6FD'}`,
                borderRadius: 8,
                padding: '8px 14px',
                fontWeight: 700,
                color: tTok?.textMuted || '#4A7FA5',
                cursor: 'pointer',
              }}
            >
              Cerrar
            </button>
            <button
              type="button"
              disabled={busyPdf}
              onClick={descargarPdf}
              style={{
                background: pal.btn,
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '8px 14px',
                fontWeight: 800,
                cursor: busyPdf ? 'wait' : 'pointer',
                opacity: busyPdf ? 0.7 : 1,
              }}
            >
              {busyPdf ? 'Generando…' : 'Descargar PDF'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Botón compacto de resalte en la barra de acciones. */
export function CumpleanosMesButton({ count, onClick, tTok }) {
  const n = Number(count) || 0
  return (
    <button
      type="button"
      onClick={onClick}
      title="Ver cumpleaños del mes"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: `linear-gradient(135deg, ${tTok?.primary || '#0077B6'} 0%, ${tTok?.primaryLight || '#00B4C6'} 100%)`,
        color: '#fff',
        border: 'none',
        borderRadius: 10,
        padding: '8px 14px',
        fontWeight: 800,
        fontSize: 'var(--cc-sm)',
        cursor: 'pointer',
        boxShadow: '0 2px 10px rgba(0,119,182,0.28)',
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden>🎂</span>
      Cumpleaños del mes
      {n > 0 && (
        <span
          style={{
            background: 'rgba(255,255,255,0.25)',
            borderRadius: 999,
            padding: '1px 7px',
            fontSize: 'var(--cc-caption)',
            fontWeight: 900,
          }}
        >
          {n}
        </span>
      )}
    </button>
  )
}
