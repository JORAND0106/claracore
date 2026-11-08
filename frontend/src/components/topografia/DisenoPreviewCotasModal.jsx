/**
 * Vista previa del diseño geométrico del tramo:
 * Abscisa | Ordenadas izquierda (elegibles) | Eje | Ordenadas derecha (elegibles).
 * Solo abscisas del tramo seleccionado.
 */
import { useEffect, useMemo, useState } from 'react'
import CcModalBrandHeader from '../CcModalBrandHeader'
import TopoExcelSheet from './TopoExcelSheet'
import { topoSheetStyles } from './topoSheetStyles'
import { IconClose } from './disenoDgIcons'
import { useTopoTheme, useTopoViewport } from './topografiaShared'

function fmtN(v, dec = 3) {
  if (v == null || v === '') return '—'
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(dec) : '—'
}

function fmtOrdenada(o) {
  const n = Number(o)
  if (!Number.isFinite(n)) return '—'
  if (Math.abs(n) < 1e-9) return '0.00'
  return n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2)
}

function nearlyEq(a, b) {
  return Math.abs(Number(a) - Number(b)) < 1e-6
}

function cotasEnAbscisa(cotasPorAbscisa, abscisa) {
  for (const [pk, cotas] of cotasPorAbscisa) {
    if (nearlyEq(pk, abscisa)) return cotas
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
  const sheet = useMemo(() => topoSheetStyles(ui.t), [ui.t])
  const { isCompact } = useTopoViewport()

  const absIni = eje?.abscisa_inicio != null ? Number(eje.abscisa_inicio) : null
  const absFin = eje?.abscisa_fin != null ? Number(eje.abscisa_fin) : null

  const rasanteTramo = useMemo(() => {
    const rows = Array.isArray(rasante) ? rasante : []
    if (absIni == null || absFin == null || !Number.isFinite(absIni) || !Number.isFinite(absFin)) {
      return rows
    }
    return rows.filter((r) => {
      const a = Number(r.abscisa)
      if (!Number.isFinite(a)) return false
      return a >= absIni - 1e-9 && a <= absFin + 1e-9
    })
  }, [rasante, absIni, absFin])

  const perfilTramo = useMemo(() => {
    const rows = Array.isArray(perfilPuntos) ? perfilPuntos : []
    if (absIni == null || absFin == null || !Number.isFinite(absIni) || !Number.isFinite(absFin)) {
      return rows
    }
    return rows.filter((p) => {
      const a = Number(p.abscisa)
      if (!Number.isFinite(a)) return false
      return a >= absIni - 1e-9 && a <= absFin + 1e-9
    })
  }, [perfilPuntos, absIni, absFin])

  const ordenadasDisponibles = useMemo(() => {
    const set = new Set()
    perfilTramo.forEach((p) => {
      const o = Number(p.ordenada)
      if (Number.isFinite(o)) set.add(o)
    })
    // Si no hay perfil, usar IZQ / EJE / DER del CSV
    if (!set.size && rasanteTramo.length) {
      set.add(-1) // marcadores sintéticos no; usamos claves especiales
    }
    return [...set].sort((a, b) => a - b)
  }, [perfilTramo, rasanteTramo])

  const tienePerfil = ordenadasDisponibles.length > 0 && perfilTramo.length > 0
  const izqDisponibles = useMemo(
    () => ordenadasDisponibles.filter((o) => o < -1e-9),
    [ordenadasDisponibles],
  )
  const derDisponibles = useMemo(
    () => ordenadasDisponibles.filter((o) => o > 1e-9),
    [ordenadasDisponibles],
  )
  const tieneEje = ordenadasDisponibles.some((o) => Math.abs(o) < 1e-9)

  const [izqSel, setIzqSel] = useState([])
  const [derSel, setDerSel] = useState([])

  useEffect(() => {
    if (!open) return
    setIzqSel(izqDisponibles)
    setDerSel(derDisponibles)
  }, [open, izqDisponibles, derDisponibles])

  const puntosPorAbscisa = useMemo(() => {
    const map = new Map()
    perfilTramo.forEach((p) => {
      const key = p.abscisa
      if (!map.has(key)) map.set(key, new Map())
      map.get(key).set(Number(p.ordenada), p.cota)
    })
    return map
  }, [perfilTramo])

  const toggleOrd = (lado, valor) => {
    const setter = lado === 'izq' ? setIzqSel : setDerSel
    setter((prev) => {
      const has = prev.some((o) => nearlyEq(o, valor))
      if (has) return prev.filter((o) => !nearlyEq(o, valor))
      return [...prev, valor].sort((a, b) => a - b)
    })
  }

  const columns = useMemo(() => {
    if (!tienePerfil) {
      return [
        { key: 'abs', label: 'Abscisa', width: 110 },
        { key: 'izq', label: 'Izquierda', width: 110 },
        { key: 'eje', label: 'Eje', width: 110 },
        { key: 'der', label: 'Derecha', width: 110 },
      ]
    }
    const cols = [{ key: 'abs', label: 'Abscisa', width: 110 }]
    izqSel.forEach((o) => cols.push({ key: `l:${o}`, label: fmtOrdenada(o), width: 88 }))
    cols.push({ key: 'eje', label: 'Eje', width: 96 })
    derSel.forEach((o) => cols.push({ key: `r:${o}`, label: fmtOrdenada(o), width: 88 }))
    return cols
  }, [tienePerfil, izqSel, derSel])

  if (!open) return null

  const chip = (active) => ({
    border: `1px solid ${active ? (ui.t?.primary || ui.accent) : (ui.t?.border || '#cbd5e1')}`,
    background: active ? `${ui.t?.primary || ui.accent}18` : 'transparent',
    color: ui.text,
    borderRadius: 8,
    padding: '4px 8px',
    fontSize: 'var(--cc-xs)',
    fontWeight: active ? 700 : 500,
    cursor: 'pointer',
  })

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
          width: 'min(1180px, 97vw)',
          maxHeight: '94vh',
          overflow: 'auto',
          padding: '18px 22px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <CcModalBrandHeader theme={ui.t} />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: '0 0 4px', color: ui.text, fontSize: 'var(--cc-lg)' }}>
              Vista previa del diseño geométrico
            </h3>
            <p style={{ margin: 0, fontSize: 'var(--cc-xs)', color: ui.textMuted, lineHeight: 1.45 }}>
              {eje?.nombre || 'Tramo'}
              {absIni != null && absFin != null
                ? ` · Abscisas ${fmtN(absIni, 2)} – ${fmtN(absFin, 2)}`
                : ''}
              {` · ${rasanteTramo.length} estación(es) del tramo`}
              {eje?.tipo_seccion && eje?.ancho_via_m
                ? ` · Sección ${eje.tipo_seccion} · ${fmtN(eje.ancho_via_m, 2)} m`
                : ''}
            </p>
          </div>
          <button
            type="button"
            title="Cerrar vista previa"
            aria-label="Cerrar vista previa"
            style={{
              ...ui.btnSecondary,
              width: 36, height: 36, padding: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={onClose}
          >
            <IconClose />
          </button>
        </div>

        {tienePerfil && (
          <div style={{
            marginTop: 14,
            display: 'grid',
            gap: 10,
            gridTemplateColumns: isCompact ? '1fr' : '1fr 1fr',
          }}>
            <div style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: `1px solid ${ui.t?.border || '#e2e8f0'}`,
              background: ui.t?.bg || 'transparent',
            }}>
              <div style={{ fontSize: 'var(--cc-xs)', fontWeight: 700, color: ui.text, marginBottom: 8 }}>
                Ordenadas a la izquierda
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {izqDisponibles.length ? izqDisponibles.map((o) => {
                  const on = izqSel.some((x) => nearlyEq(x, o))
                  return (
                    <button
                      key={`izq-${o}`}
                      type="button"
                      title={`${on ? 'Ocultar' : 'Mostrar'} ordenada ${fmtOrdenada(o)}`}
                      style={chip(on)}
                      onClick={() => toggleOrd('izq', o)}
                    >
                      {fmtOrdenada(o)}
                    </button>
                  )
                }) : (
                  <span style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>Sin ordenadas a la izquierda</span>
                )}
              </div>
            </div>
            <div style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: `1px solid ${ui.t?.border || '#e2e8f0'}`,
              background: ui.t?.bg || 'transparent',
            }}>
              <div style={{ fontSize: 'var(--cc-xs)', fontWeight: 700, color: ui.text, marginBottom: 8 }}>
                Ordenadas a la derecha
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {derDisponibles.length ? derDisponibles.map((o) => {
                  const on = derSel.some((x) => nearlyEq(x, o))
                  return (
                    <button
                      key={`der-${o}`}
                      type="button"
                      title={`${on ? 'Ocultar' : 'Mostrar'} ordenada ${fmtOrdenada(o)}`}
                      style={chip(on)}
                      onClick={() => toggleOrd('der', o)}
                    >
                      {fmtOrdenada(o)}
                    </button>
                  )
                }) : (
                  <span style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>Sin ordenadas a la derecha</span>
                )}
              </div>
            </div>
          </div>
        )}

        {!rasanteTramo.length ? (
          <p style={{ margin: '16px 0 0', color: ui.textMuted, fontSize: 'var(--cc-sm)' }}>
            No hay estaciones de diseño dentro de las abscisas del tramo.
          </p>
        ) : (
          <div style={{ marginTop: 14 }}>
            <TopoExcelSheet sheet={sheet} columns={columns} minWidth={Math.max(420, columns.length * 90)}>
              {rasanteTramo.map((r) => {
                const cotas = cotasEnAbscisa(puntosPorAbscisa, r.abscisa)
                return (
                  <tr key={r.id || `${r.tramo}-${r.abscisa}`}>
                    <td style={sheet.td}>{fmtN(r.abscisa, 2)}</td>
                    {tienePerfil ? (
                      <>
                        {izqSel.map((o) => (
                          <td key={`l-${o}`} style={sheet.td}>{fmtN(cotas?.get(o))}</td>
                        ))}
                        <td style={{ ...sheet.td, fontWeight: 700 }}>
                          {tieneEje
                            ? fmtN(cotas?.get(0) ?? cotas?.get(0.0) ?? r.cota_eje)
                            : fmtN(r.cota_eje)}
                        </td>
                        {derSel.map((o) => (
                          <td key={`r-${o}`} style={sheet.td}>{fmtN(cotas?.get(o))}</td>
                        ))}
                      </>
                    ) : (
                      <>
                        <td style={sheet.td}>{fmtN(r.cota_izquierda)}</td>
                        <td style={{ ...sheet.td, fontWeight: 700 }}>{fmtN(r.cota_eje)}</td>
                        <td style={sheet.td}>{fmtN(r.cota_derecha)}</td>
                      </>
                    )}
                  </tr>
                )
              })}
            </TopoExcelSheet>
          </div>
        )}
      </div>
    </div>
  )
}
