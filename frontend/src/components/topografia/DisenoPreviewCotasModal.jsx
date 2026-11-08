/**
 * Vista previa de cotas del diseño geométrico cargado (rasante / perfil).
 */
import { useMemo } from 'react'
import CcModalBrandHeader from '../CcModalBrandHeader'
import { useTopoTheme, useTopoViewport } from './topografiaShared'

function fmtN(v, dec = 3) {
  if (v == null || v === '') return '—'
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(dec) : '—'
}

function fmtOrdenadaCol(o) {
  const n = Number(o)
  if (!Number.isFinite(n)) return '—'
  if (Math.abs(n) < 1e-9) return '0.00'
  return n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2)
}

function cotasEnAbscisa(cotasPorAbscisa, abscisa) {
  for (const [pk, cotas] of cotasPorAbscisa) {
    if (Math.abs(pk - abscisa) < 1e-6) return cotas
  }
  return null
}

export default function DisenoPreviewCotasModal({
  open,
  eje,
  rasante = [],
  perfilPuntos = [],
  onClose,
  zIndex = 100070,
}) {
  const ui = useTopoTheme()
  const { isCompact } = useTopoViewport()

  const puntosPorAbscisa = useMemo(() => {
    const map = new Map()
    perfilPuntos.forEach((p) => {
      const key = p.abscisa
      if (!map.has(key)) map.set(key, new Map())
      map.get(key).set(p.ordenada, p.cota)
    })
    return map
  }, [perfilPuntos])

  const columnasOrdenada = useMemo(() => {
    if (!perfilPuntos.length) return null
    return [...new Set(perfilPuntos.map((p) => p.ordenada))].sort((a, b) => a - b)
  }, [perfilPuntos])

  const ordenadasReferencia = useMemo(() => {
    const set = new Set()
    perfilPuntos.filter((p) => p.es_referencia).forEach((p) => set.add(p.ordenada))
    return set
  }, [perfilPuntos])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex,
        background: 'rgba(15,23,42,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          ...ui.card,
          width: 'min(1100px, 96vw)',
          maxHeight: '92vh',
          overflow: 'auto',
          padding: '18px 22px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <CcModalBrandHeader theme={ui.t} />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: '0 0 4px', color: ui.text, fontSize: 'var(--cc-base)' }}>
              Vista previa de cotas
            </h3>
            <p style={{ margin: 0, fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
              {eje?.nombre || 'Tramo'} · {rasante.length} estaciones
              {eje?.tipo_seccion && eje?.ancho_via_m
                ? ` · Sección ${eje.tipo_seccion} · ${fmtN(eje.ancho_via_m, 2)} m`
                : ''}
            </p>
          </div>
          <button
            type="button"
            title="Cerrar vista previa"
            aria-label="Cerrar vista previa"
            style={ui.btnSecondary}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {!rasante.length ? (
          <p style={{ margin: '16px 0 0', color: ui.textMuted, fontSize: 'var(--cc-sm)' }}>
            No hay diseño geométrico cargado.
          </p>
        ) : (
          <div
            style={{
              marginTop: 14,
              overflowX: 'auto',
              maxHeight: isCompact ? 'min(60dvh, 480px)' : 520,
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
            }}
            className="cc-topo-table-scroll"
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-xs)' }}>
              <thead>
                <tr>
                  <th style={ui.th}>Tramo CSV</th>
                  <th style={ui.th}>Abscisa</th>
                  {columnasOrdenada ? (
                    columnasOrdenada.map((o) => (
                      <th
                        key={o}
                        style={{ ...ui.th, fontWeight: ordenadasReferencia.has(o) ? 700 : 500 }}
                        title={ordenadasReferencia.has(o) ? 'Referencia CSV' : 'Intermedia'}
                      >
                        {fmtOrdenadaCol(o)}
                      </th>
                    ))
                  ) : (
                    <>
                      <th style={ui.th}>Izquierda</th>
                      <th style={ui.th}>Eje</th>
                      <th style={ui.th}>Derecha</th>
                    </>
                  )}
                  <th style={ui.th}>Ancho</th>
                </tr>
              </thead>
              <tbody>
                {rasante.slice(0, 200).map((r) => {
                  const cotas = cotasEnAbscisa(puntosPorAbscisa, r.abscisa)
                  return (
                    <tr key={r.id || `${r.tramo}-${r.abscisa}`}>
                      <td style={ui.td}>{r.tramo || '—'}</td>
                      <td style={ui.td}>{fmtN(r.abscisa, 2)}</td>
                      {columnasOrdenada ? (
                        columnasOrdenada.map((o) => (
                          <td key={o} style={{ ...ui.td, fontWeight: ordenadasReferencia.has(o) ? 600 : 400 }}>
                            {fmtN(cotas?.get(o))}
                          </td>
                        ))
                      ) : (
                        <>
                          <td style={ui.td}>{fmtN(r.cota_izquierda)}</td>
                          <td style={ui.td}>{fmtN(r.cota_eje)}</td>
                          <td style={ui.td}>{fmtN(r.cota_derecha)}</td>
                        </>
                      )}
                      <td style={ui.td}>{fmtN(r.ancho, 2)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {rasante.length > 200 && (
          <p style={{ margin: '8px 0 0', fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
            Mostrando 200 de {rasante.length} estaciones.
          </p>
        )}
      </div>
    </div>
  )
}
