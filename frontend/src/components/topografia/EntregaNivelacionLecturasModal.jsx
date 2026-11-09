/**
 * Popup exclusivo de nivelación (modo cartera por lecturas):
 * izquierda = amarre + Vi por abscisa/ordenada; derecha = resultados en vivo.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import CcModalBrandHeader from '../CcModalBrandHeader'
import { cotaReferenciaEnOrdenada, hiDesdeCotaVplus, resolveHiEntrega } from '../../utils/entrega_dg_bloques'
import EntregaCarteraCargaModal from './EntregaCarteraCargaModal'
import { IconClose, IconUpload } from './disenoDgIcons'
import { topoSheetStyles } from './topoSheetStyles'
import { PermisoAviso, puede, themeColorScheme, useTopoTheme } from './topografiaShared'

function fmtN(v, dec = 3) {
  if (v == null || v === '') return '—'
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(dec) : '—'
}

function parseNum(v) {
  if (v === '' || v == null) return null
  const n = parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function estadoTol(delta, tolM) {
  if (delta == null) return null
  const t = Number(tolM ?? 0.01)
  const d = Number(delta)
  if (Math.abs(d) <= t) return 'ok'
  return d < 0 ? 'bajo' : 'alto'
}

function IconBtn({ title, onClick, disabled, children, danger, ui }) {
  const border = ui.t?.border || '#cbd5e1'
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'transparent',
        color: danger ? '#dc2626' : ui.text,
        border: `1px solid ${danger ? '#fca5a5' : border}`,
        borderRadius: 8,
        width: 36,
        height: 36,
        padding: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  )
}

function draftInicial(matriz, ordenadasCols, bloques) {
  const vi = {}
  const inst = {}
  matriz.forEach((f) => {
    const k = String(f.abscisa)
    const row = {}
    ordenadasCols.forEach((col) => {
      row[col.key] = f.terreno?.[col.key]?.vi ?? ''
    })
    vi[k] = row
    if (f.instrumento?.es_cambio) {
      const i = f.instrumento
      inst[k] = {
        bloque_id: i.bloque_id,
        punto_biblioteca_id: i.punto_biblioteca_id ?? '',
        nombre_punto: i.nombre_punto ?? '',
        v_mas: i.v_mas ?? '',
        cota_punto: i.cota_punto ?? '',
      }
    }
  })
  // Bloques sin fila de cambio en matriz
  ;(bloques || []).forEach((b) => {
    if (b.abscisa_inicio == null) return
    const k = String(b.abscisa_inicio)
    if (!inst[k]) {
      inst[k] = {
        bloque_id: b.id,
        punto_biblioteca_id: b.punto_biblioteca_id ?? '',
        nombre_punto: b.nombre_punto ?? '',
        v_mas: b.v_mas ?? '',
        cota_punto: b.cota_punto ?? '',
        _insertado: false,
      }
    }
  })
  return { vi, inst }
}

export default function EntregaNivelacionLecturasModal({
  open,
  detalle,
  permisos,
  puntosNiv = [],
  busy = false,
  zIndex = 100080,
  abrirCarga = false,
  onAbrirCargaConsumida,
  onDirtyChange,
  onGuardar,
  onAddBloque,
  onClose,
  addingBloqueAt = null,
}) {
  const ui = useTopoTheme()
  const sheet = useMemo(() => topoSheetStyles(ui.t), [ui.t])
  const entrega = detalle?.entrega
  const matriz = detalle?.matriz || []
  const ordenadasCols = detalle?.ordenadas_cols || []
  const bloques = detalle?.bloques || []
  const analisis = detalle?.analisis || {}
  const tol = entrega?.tolerancia_m
  const capaLabel = analisis?.capa_nombre || detalle?.capa?.nombre || entrega?.capa_nombre || 'Capa'
  const espesorDiseno = analisis.espesor_diseno_m
  const referenciaLabel = (analisis?.referencia_nombre || 'Referencia')
    .replace(/\s*\(campo\)\s*/gi, '')
    .replace(/\s*\(diseño\)\s*/gi, '')
    .trim()
  const muestraFilaRef = analisis?.modo !== 'terreno' && espesorDiseno != null
  const puedeEditar = puede(permisos, 'editar')

  const [viDraft, setViDraft] = useState({})
  const [instDraft, setInstDraft] = useState({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [cargaOpen, setCargaOpen] = useState(false)
  const [aviso, setAviso] = useState(null)
  const [loadedId, setLoadedId] = useState(null)

  useEffect(() => {
    if (!open || !entrega?.id) return
    if (loadedId !== entrega.id) {
      const { vi, inst } = draftInicial(matriz, ordenadasCols, bloques)
      setViDraft(vi)
      setInstDraft(inst)
      setDirty(false)
      setAviso(null)
      setLoadedId(entrega.id)
      return
    }
    // Nuevos amarres / refresco de matriz: fusionar sin perder borrador sucio.
    setInstDraft((prev) => {
      const { inst } = draftInicial(matriz, ordenadasCols, bloques)
      return { ...inst, ...prev }
    })
    if (!dirty) {
      const { vi } = draftInicial(matriz, ordenadasCols, bloques)
      setViDraft(vi)
    }
  }, [open, entrega?.id, matriz, ordenadasCols, bloques, loadedId, dirty])

  useEffect(() => {
    if (!open) {
      setLoadedId(null)
      setCargaOpen(false)
      onDirtyChange?.(false)
    }
  }, [open, onDirtyChange])

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  useEffect(() => {
    if (open && abrirCarga) {
      setCargaOpen(true)
      onAbrirCargaConsumida?.()
    }
  }, [open, abrirCarga, onAbrirCargaConsumida])

  const patchInst = (abscisa, patch) => {
    const k = String(abscisa)
    setInstDraft((prev) => ({
      ...prev,
      [k]: { ...(prev[k] || {}), ...patch },
    }))
    setDirty(true)
  }

  const hiEn = useCallback((abscisa) => resolveHiEntrega({
    bloques,
    matriz,
    abscisa,
    abscisaDesde: entrega?.abscisa_desde,
    instDraft,
    instrumentoFallback: matriz.find((f) => String(f.abscisa) === String(abscisa))?.instrumento,
  }), [bloques, matriz, entrega?.abscisa_desde, instDraft])

  const cotaLive = useCallback((abscisa, colKey) => {
    const hi = hiEn(abscisa)
    const vi = parseNum(viDraft[String(abscisa)]?.[colKey])
    if (hi == null || vi == null) {
      const f = matriz.find((r) => String(r.abscisa) === String(abscisa))
      const saved = f?.terreno?.[colKey]?.cota
      return saved != null ? Number(saved) : null
    }
    return hi - vi
  }, [hiEn, viDraft, matriz])

  const buildPayload = () => {
    const filas = matriz.map((f) => {
      const k = String(f.abscisa)
      const draft = viDraft[k] || {}
      const lecturas = ordenadasCols.map((col) => ({
        ordenada: col.ordenada,
        vi: parseNum(draft[col.key]),
      }))
      return {
        abscisa: f.abscisa,
        bloque_id: f.instrumento?.bloque_id || f.bloque_id || null,
        lecturas,
      }
    }).filter((f) => f.lecturas.some((l) => l.vi != null))

    const bloqueIds = new Set((bloques || []).map((b) => b.id))
    const bloquesPayload = Object.entries(instDraft)
      .map(([k, d]) => {
        const fila = matriz.find((f) => String(f.abscisa) === k)
        const id = d.bloque_id || fila?.instrumento?.bloque_id || fila?.bloque_id
        const hi = hiDesdeCotaVplus(d.cota_punto, d.v_mas)
        return {
          id,
          punto_biblioteca_id: d.punto_biblioteca_id || null,
          nombre_punto: (d.nombre_punto || '').trim() || null,
          v_mas: parseNum(d.v_mas),
          altura_instrumento: hi ?? parseNum(d.altura_instrumento),
          cota_punto: parseNum(d.cota_punto),
        }
      })
      .filter((b) => b.id && bloqueIds.has(b.id))

    return { filas, bloques: bloquesPayload, modo_cartera: 'lecturas' }
  }

  const guardar = async () => {
    if (!onGuardar) return
    setSaving(true)
    setAviso(null)
    try {
      await onGuardar(buildPayload())
      setDirty(false)
      setAviso({ tipo: 'ok', texto: 'Cartera guardada correctamente.' })
    } catch (e) {
      setAviso({ tipo: 'error', texto: e?.message || 'No se pudo guardar la cartera.' })
    } finally {
      setSaving(false)
    }
  }

  const aplicarCarga = (parsed) => {
    setViDraft((prev) => {
      const next = { ...prev }
      ;(parsed.filas || []).forEach((fila) => {
        const k = String(fila.abscisa)
        const row = { ...(next[k] || {}) }
        ;(fila.lecturas || []).forEach((l) => {
          const col = ordenadasCols.find((c) => Math.abs(Number(c.ordenada) - Number(l.ordenada)) < 1e-6)
          if (!col) return
          const val = l.vi != null ? l.vi : l.cota
          if (val != null) row[col.key] = String(val)
        })
        next[k] = row
      })
      return next
    })
    setDirty(true)
    setCargaOpen(false)
    setAviso({
      tipo: 'ok',
      texto: `Cargadas ${parsed.abscisas} abscisa(s) y ${parsed.cotas} lectura(s). Guarde para confirmar en el servidor.`,
    })
  }

  const cerrar = () => {
    if (dirty && !window.confirm('Hay cambios sin guardar en la nivelación. ¿Cerrar de todos modos?')) return
    onClose?.()
  }

  const th = (extra = {}) => ({
    ...sheet.th, textAlign: 'center', fontSize: 'var(--cc-xs)', whiteSpace: 'nowrap', padding: '5px 6px', ...extra,
  })
  const td = (extra = {}) => ({
    ...sheet.td, textAlign: 'center', padding: '3px 5px', fontSize: 'var(--cc-xs)', verticalAlign: 'middle', ...extra,
  })
  const inp = (w = 64) => ({
    ...sheet.cellInp, width: w, minWidth: w, maxWidth: w, padding: '2px 4px', textAlign: 'center', fontSize: 'var(--cc-xs)',
  })

  // Filas de cartera: intercalamos amarre insertado + abscisas
  const filasCartera = useMemo(() => {
    const absList = matriz.map((f) => Number(f.abscisa))
    const amarreKeys = Object.keys(instDraft)
      .map(Number)
      .filter((a) => Number.isFinite(a))
      .sort((a, b) => a - b)
    const out = []
    const seenAmarre = new Set()
    absList.forEach((ab) => {
      // amarres exactamente en esta abscisa (cambio de instrumento)
      amarreKeys.forEach((ak) => {
        if (Math.abs(ak - ab) < 1e-6 && !seenAmarre.has(ak)) {
          out.push({ tipo: 'amarre', abscisa: ak })
          seenAmarre.add(ak)
        }
      })
      out.push({ tipo: 'abscisa', abscisa: ab })
    })
    amarreKeys.forEach((ak) => {
      if (!seenAmarre.has(ak)) out.push({ tipo: 'amarre', abscisa: ak })
    })
    return out
  }, [matriz, instDraft])

  if (!open || !detalle) return null

  const okColor = ui.t?.success || '#16a34a'
  const bajoColor = '#2563eb'
  const altoColor = '#c026d3'

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nivelación por lecturas"
        style={{
          position: 'fixed', inset: 0, zIndex,
          background: 'rgba(15,23,42,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 12, overflow: 'hidden',
        }}
        onClick={cerrar}
      >
        <div
          style={{
            ...ui.card,
            width: 'min(1280px, 98vw)',
            maxHeight: 'calc(100vh - 24px)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minWidth: 0,
            padding: 0,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <CcModalBrandHeader theme={ui.t} />
          <div style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${ui.t?.border || '#e2e8f0'}`,
            display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
            flexShrink: 0,
          }}>
            <h3 style={{ margin: 0, flex: 1, fontSize: 'var(--cc-base)', color: ui.text }}>
              Nivelación — {entrega?.nombre || 'Entrega'}
            </h3>
            {dirty && <span style={{ fontSize: 'var(--cc-xs)', color: '#b45309' }}>Cambios sin guardar</span>}
            <PermisoAviso permisos={permisos} accion="editar">
              <IconBtn ui={ui} title="Cargar cartera (Excel / CSV / pegado)" disabled={busy || saving} onClick={() => setCargaOpen(true)}>
                <IconUpload />
              </IconBtn>
            </PermisoAviso>
            <PermisoAviso permisos={permisos} accion="editar">
              <button
                type="button"
                title="Guardar cartera de nivelación"
                style={{ ...ui.btnPrimary, opacity: saving ? 0.7 : 1 }}
                disabled={busy || saving || !puedeEditar}
                onClick={() => { void guardar() }}
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </PermisoAviso>
            <IconBtn ui={ui} title="Cerrar nivelación" onClick={(e) => { e.stopPropagation(); cerrar() }}>
              <IconClose />
            </IconBtn>
          </div>

          {aviso && (
            <div role="alert" style={{
              margin: '8px 16px 0', padding: '8px 10px', borderRadius: 8, fontSize: 'var(--cc-xs)',
              border: `1px solid ${aviso.tipo === 'ok' ? '#86efac' : '#fca5a5'}`,
              background: aviso.tipo === 'ok' ? '#f0fdf4' : '#fef2f2',
              color: aviso.tipo === 'ok' ? '#166534' : '#991b1b',
              flexShrink: 0,
            }}>
              {aviso.texto}
            </div>
          )}

          <div style={{
            flex: 1, minHeight: 0, minWidth: 0,
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.15fr)',
            gap: 0,
            overflow: 'hidden',
          }}>
            {/* IZQUIERDA: cartera */}
            <div style={{
              minWidth: 0, minHeight: 0, overflow: 'auto',
              borderRight: `1px solid ${ui.t?.border || '#e2e8f0'}`,
              padding: '12px 14px',
              WebkitOverflowScrolling: 'touch',
              colorScheme: themeColorScheme(ui.t),
            }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 'var(--cc-sm)', color: ui.text }}>Cartera de lecturas</h4>
              <p style={{ margin: '0 0 10px', fontSize: 'var(--cc-xs)', color: ui.textMuted, lineHeight: 1.4 }}>
                Amarre (punto + V+) calcula H. Inst. Cada Vi se convierte en cota al instante a la derecha.
              </p>

              <div style={{ ...sheet.sheetWrap, overflow: 'auto', maxHeight: '100%' }}>
                <table style={{ ...sheet.sheetTable, width: '100%', minWidth: 420 + ordenadasCols.length * 70 }}>
                  <thead>
                    <tr>
                      <th style={th()}>Tipo</th>
                      <th style={th()}>Abs</th>
                      <th style={th()}>Punto</th>
                      <th style={th()}>V+</th>
                      <th style={th()}>Cota</th>
                      <th style={th()}>H.Inst</th>
                      {ordenadasCols.map((col) => (
                        <th key={col.key} style={th()} title={`Vi en ordenada ${col.label}`}>
                          Vi {col.label}
                        </th>
                      ))}
                      <th style={th({ width: 36 })}>+</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasCartera.map((row) => {
                      const k = String(row.abscisa)
                      if (row.tipo === 'amarre') {
                        const d = instDraft[k] || {}
                        const hi = hiDesdeCotaVplus(d.cota_punto, d.v_mas)
                        return (
                          <tr key={`am-${k}`} style={{ background: `${ui.accent}12` }}>
                            <td style={td({ fontWeight: 700, color: ui.accent })}>Amarre</td>
                            <td style={td({ fontWeight: 700 })}>{fmtN(row.abscisa, 2)}</td>
                            <td style={td()}>
                              {puedeEditar ? (
                                <div style={{ display: 'grid', gap: 4 }}>
                                  <select
                                    value={d.punto_biblioteca_id || ''}
                                    title="Punto de biblioteca o nuevo"
                                    onChange={(e) => {
                                      const id = e.target.value
                                      const p = puntosNiv.find((x) => x.id === id)
                                      patchInst(row.abscisa, {
                                        punto_biblioteca_id: id,
                                        nombre_punto: p?.nombre || d.nombre_punto || '',
                                        cota_punto: p?.cota != null ? String(p.cota) : (d.cota_punto || ''),
                                      })
                                    }}
                                    style={{ ...sheet.cellSelect, width: 88, fontSize: 'var(--cc-xs)' }}
                                  >
                                    <option value="">Nuevo…</option>
                                    {puntosNiv.map((p) => (
                                      <option key={p.id} value={p.id}>{p.nombre}</option>
                                    ))}
                                  </select>
                                  {!d.punto_biblioteca_id && (
                                    <input
                                      value={d.nombre_punto || ''}
                                      onChange={(e) => patchInst(row.abscisa, { nombre_punto: e.target.value, punto_biblioteca_id: '' })}
                                      style={inp(88)}
                                      placeholder="Nombre"
                                      title="Nombre del punto nuevo"
                                    />
                                  )}
                                </div>
                              ) : (d.nombre_punto || '—')}
                            </td>
                            <td style={td()}>
                              {puedeEditar ? (
                                <input
                                  value={d.v_mas ?? ''}
                                  onChange={(e) => patchInst(row.abscisa, { v_mas: e.target.value })}
                                  style={inp(52)}
                                  placeholder="0.00"
                                  title="V+"
                                />
                              ) : fmtN(d.v_mas, 3)}
                            </td>
                            <td style={td()}>
                              {puedeEditar ? (
                                <input
                                  value={d.cota_punto ?? ''}
                                  onChange={(e) => patchInst(row.abscisa, { cota_punto: e.target.value })}
                                  style={inp(64)}
                                  placeholder="Cota"
                                  title="Cota del amarre"
                                />
                              ) : fmtN(d.cota_punto, 3)}
                            </td>
                            <td style={td({ fontWeight: 700 })}>{fmtN(hi, 3)}</td>
                            {ordenadasCols.map((col) => (
                              <td key={col.key} style={td({ color: ui.textMuted })}>—</td>
                            ))}
                            <td style={td()} />
                          </tr>
                        )
                      }

                      const f = matriz.find((r) => Math.abs(Number(r.abscisa) - row.abscisa) < 1e-9)
                      const draft = viDraft[k] || {}
                      const hi = hiEn(row.abscisa)
                      return (
                        <tr key={`ab-${k}`}>
                          <td style={td({ color: ui.textMuted })}>Lectura</td>
                          <td style={td({ fontWeight: 700 })}>{fmtN(row.abscisa, 2)}</td>
                          <td style={td()} colSpan={3}>
                            <span style={{ color: ui.textMuted, fontSize: 'var(--cc-xs)' }}>
                              HI vigente {fmtN(hi, 3)}
                            </span>
                          </td>
                          <td style={td({ color: ui.textMuted })}>{fmtN(hi, 3)}</td>
                          {ordenadasCols.map((col) => (
                            <td key={col.key} style={td()}>
                              {puedeEditar ? (
                                <input
                                  value={draft[col.key] ?? ''}
                                  onChange={(e) => {
                                    setViDraft((p) => ({
                                      ...p,
                                      [k]: { ...(p[k] || {}), [col.key]: e.target.value },
                                    }))
                                    setDirty(true)
                                  }}
                                  style={inp(58)}
                                  placeholder="Vi"
                                  title={`Lectura Vi en ${col.label}`}
                                  autoComplete="off"
                                />
                              ) : fmtN(f?.terreno?.[col.key]?.vi, 3)}
                            </td>
                          ))}
                          <td style={td()}>
                            <PermisoAviso permisos={permisos} accion="editar">
                              <IconBtn
                                ui={ui}
                                title="Insertar amarre en esta abscisa"
                                disabled={busy || saving || addingBloqueAt != null}
                                onClick={() => onAddBloque?.(row.abscisa)}
                              >
                                {addingBloqueAt === row.abscisa ? '…' : '+'}
                              </IconBtn>
                            </PermisoAviso>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* DERECHA: resultados en vivo */}
            <div style={{
              minWidth: 0, minHeight: 0, overflow: 'auto',
              padding: '12px 14px',
              WebkitOverflowScrolling: 'touch',
              colorScheme: themeColorScheme(ui.t),
            }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 'var(--cc-sm)', color: ui.text }}>Resultados</h4>
              <p style={{ margin: '0 0 10px', fontSize: 'var(--cc-xs)', color: ui.textMuted, lineHeight: 1.4 }}>
                Diseño{muestraFilaRef ? ` · ${referenciaLabel}` : ''} · {capaLabel}
                {espesorDiseno != null ? ` · esp. diseño ${fmtN(espesorDiseno, 3)} m` : ''}
                {' · tol ±'}{fmtN(tol, 3)} m
              </p>
              <div style={{ ...sheet.sheetWrap, overflow: 'auto' }}>
                <table style={{ ...sheet.sheetTable, width: '100%', minWidth: 480 + ordenadasCols.length * 90 }}>
                  <thead>
                    <tr>
                      <th style={th()}>Abs</th>
                      <th style={th()} />
                      {ordenadasCols.map((col) => (
                        <th key={col.key} style={th()}>{col.label}</th>
                      ))}
                      {ordenadasCols.map((col) => (
                        <th key={`d-${col.key}`} style={th()}>Dif {col.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matriz.map((f) => {
                      const k = String(f.abscisa)
                      const rowSpan = muestraFilaRef ? 3 : 2
                      return (
                        <Fragment key={k}>
                          <tr>
                            <td style={td({ fontWeight: 700 })} rowSpan={rowSpan}>{fmtN(f.abscisa, 2)}</td>
                            <td style={td({ fontWeight: 600, color: ui.textMuted })}>Diseño</td>
                            {ordenadasCols.map((col) => (
                              <td key={col.key} style={td()}>{fmtN(f.diseno?.[col.key], 3)}</td>
                            ))}
                            {ordenadasCols.map((col) => {
                              const cot = cotaLive(f.abscisa, col.key)
                              const dis = f.diseno?.[col.key]
                              const d = cot != null && dis != null ? Number(cot) - Number(dis) : null
                              const est = estadoTol(d, tol)
                              return (
                                <td
                                  key={`pd-${col.key}`}
                                  style={{
                                    ...td(),
                                    fontWeight: d != null ? 700 : 400,
                                    color: est === 'ok' ? okColor : est === 'bajo' ? bajoColor : est === 'alto' ? altoColor : ui.textMuted,
                                  }}
                                >
                                  {d == null ? '—' : (est === 'ok' ? 'CUMPLE' : 'NO CUMPLE')}
                                </td>
                              )
                            })}
                          </tr>
                          {muestraFilaRef && (
                            <tr>
                              <td style={td({ fontWeight: 600, color: ui.textMuted })}>{referenciaLabel}</td>
                              {ordenadasCols.map((col) => {
                                const refCampo = cotaReferenciaEnOrdenada(f, col, ordenadasCols, 'campo')
                                const refDiseno = cotaReferenciaEnOrdenada(f, col, ordenadasCols, 'diseno')
                                return (
                                  <td key={col.key} style={td({ color: ui.textMuted })}>
                                    {fmtN(refCampo ?? refDiseno, 3)}
                                  </td>
                                )
                              })}
                              {ordenadasCols.map((col) => (
                                <td key={`rd-${col.key}`} style={td({ color: ui.textMuted })}>—</td>
                              ))}
                            </tr>
                          )}
                          <tr>
                            <td style={td({ fontWeight: 600, color: ui.textMuted })}>{capaLabel}</td>
                            {ordenadasCols.map((col) => (
                              <td key={col.key} style={td({ fontWeight: 600 })}>
                                {fmtN(cotaLive(f.abscisa, col.key), 3)}
                              </td>
                            ))}
                            {ordenadasCols.map((col) => {
                              const cot = cotaLive(f.abscisa, col.key)
                              const dis = f.diseno?.[col.key]
                              const d = cot != null && dis != null ? Number(cot) - Number(dis) : null
                              const est = estadoTol(d, tol)
                              return (
                                <td
                                  key={`df-${col.key}`}
                                  style={{
                                    ...td(),
                                    color: est === 'bajo' ? bajoColor : est === 'alto' ? altoColor : ui.text,
                                    fontWeight: d != null ? 600 : 400,
                                  }}
                                >
                                  {d == null ? '—' : `${est === 'bajo' ? '▼ ' : est === 'alto' ? '▲ ' : ''}${fmtN(d, 3)}`}
                                </td>
                              )
                            })}
                          </tr>
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      <EntregaCarteraCargaModal
        open={cargaOpen}
        modo="lecturas"
        ordenadasCols={ordenadasCols}
        zIndex={zIndex + 20}
        onClose={() => setCargaOpen(false)}
        onApply={async (parsed) => { aplicarCarga(parsed) }}
      />
    </>
  )
}
