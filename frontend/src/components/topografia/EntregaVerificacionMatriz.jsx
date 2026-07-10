import { Fragment, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { cotaReferenciaEnOrdenada, hiDesdeCotaVplus, resolveHiEntrega } from '../../utils/entrega_dg_bloques'
import { PermisoAviso, puede, TopoTableScroll, useTopoViewport } from './topografiaShared'

const VI_W = 65

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

/** ok | bajo (Δ < −tol) | alto (Δ > +tol) */
function estadoTolerancia(delta, tolM) {
  if (delta == null) return null
  const t = Number(tolM ?? 0.01)
  const d = Number(delta)
  if (Math.abs(d) <= t) return 'ok'
  return d < 0 ? 'bajo' : 'alto'
}

function estiloTolerancia(estado, { okColor, bajoColor, altoColor, muted, text }) {
  if (estado == null) return { color: muted, flecha: '', title: '' }
  if (estado === 'ok') return { color: text ?? okColor, flecha: '', title: 'Dentro de tolerancia' }
  if (estado === 'bajo') {
    return { color: bajoColor, flecha: '▼ ', title: 'Por debajo del diseño (fuera de tolerancia)' }
  }
  return { color: altoColor, flecha: '▲ ', title: 'Por encima del diseño (fuera de tolerancia)' }
}

function draftFromMatriz(matriz, ordenadasCols) {
  const v = {}
  const ins = {}
  matriz.forEach((f) => {
    const k = String(f.abscisa)
    const row = {}
    ordenadasCols.forEach((col) => {
      row[col.key] = f.terreno?.[col.key]?.vi ?? ''
    })
    v[k] = row
    if (f.instrumento?.es_cambio) {
      const i = f.instrumento
      ins[k] = {
        bloque_id: i.bloque_id,
        punto_biblioteca_id: i.punto_biblioteca_id ?? '',
        v_mas: i.v_mas ?? '',
        cota_punto: i.cota_punto ?? '',
      }
    }
  })
  return { v, ins }
}

const EntregaVerificacionMatriz = forwardRef(function EntregaVerificacionMatriz({
  ui,
  detalle,
  permisos,
  busy,
  puntosNiv,
  onGuardarCartera,
  onAddBloque,
  onRecalcular,
  scrollToAbscisa,
  addingBloqueAt,
  onDirtyChange,
}, ref) {
  const { isCompact } = useTopoViewport()
  const entrega = detalle?.entrega
  const bloques = detalle?.bloques || []
  const capas = detalle?.capas || []
  const matriz = detalle?.matriz || []
  const ordenadasCols = detalle?.ordenadas_cols || []
  const anchoVia = detalle?.eje?.ancho_via_m
  const sobreAncho = detalle?.capa?.sobre_ancho_m
  const anchoEfectivo = anchoVia != null
    ? Number(anchoVia) + (Number(sobreAncho) || 0)
    : null
  const analisis = detalle?.analisis || {}
  const espesorDiseno = analisis.espesor_diseno_m

  const [viDraft, setViDraft] = useState({})
  const [instDraft, setInstDraft] = useState({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const rowRefs = useRef({})
  const viInputRefs = useRef([])

  const t = ui.t || {}
  const rowViBg = t.inputBg || ui.card?.background
  const rowDisBg = `${ui.accent}0c`
  const rowTerBg = ui.card?.background || t.bgCard
  const instBg = `${ui.accent}10`
  const warnColor = t?.warn || '#b45309'
  const okColor = t?.success || '#047857'
  const bajoTolColor = t?.link || '#2563eb'
  const altoTolColor = '#c026d3'
  const tolEstilo = { okColor, bajoColor: bajoTolColor, altoColor: altoTolColor, muted: ui.textMuted, text: ui.text }

  const loadedEntregaRef = useRef(null)

  useEffect(() => {
    if (!entrega?.id) {
      setViDraft({})
      setInstDraft({})
      setDirty(false)
      loadedEntregaRef.current = null
      return
    }
    if (!matriz.length) return

    const entregaCambio = loadedEntregaRef.current !== entrega.id
    if (entregaCambio) {
      loadedEntregaRef.current = entrega.id
      const { v, ins } = draftFromMatriz(matriz, ordenadasCols)
      setViDraft(v)
      setInstDraft(ins)
      setDirty(false)
      return
    }

    if (!dirty) {
      const { v, ins } = draftFromMatriz(matriz, ordenadasCols)
      setViDraft(v)
      setInstDraft(ins)
    }
  }, [entrega?.id, matriz, ordenadasCols, dirty])

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  useEffect(() => {
    if (scrollToAbscisa == null) return
    rowRefs.current[String(scrollToAbscisa)]?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  }, [scrollToAbscisa, matriz])

  const capaLabel = analisis?.capa_nombre || detalle?.capa?.nombre || entrega?.capa_nombre || 'Capa'
  const capaIdx = entrega?.indice_capa ?? 0
  const esModoTerreno = analisis?.modo === 'terreno'
  const indiceTerreno = capas.length
  const referenciaLabel = (analisis?.referencia_nombre || 'Referencia')
    .replace(/\s*\(campo\)\s*/gi, '')
    .replace(/\s*\(diseño\)\s*/gi, '')
    .trim()
  const refEsTerrenoNatural = !esModoTerreno && (
    analisis?.referencia_es_terreno_natural === true
    || analisis?.referencia_entrega_indice === indiceTerreno
    || analisis?.referencia_indice == null
  )
  const usaRefCampo = Boolean(analisis?.referencia_usa_campo)
  const muestraFilaRef = !esModoTerreno && espesorDiseno != null
  const muestraMetricas = muestraFilaRef && anchoEfectivo != null
  const filasPorAbscisa = esModoTerreno ? 3 : (muestraFilaRef ? 4 : 3)
  const puedeEditar = puede(permisos, 'editar')
  const tol = entrega?.tolerancia_m

  const th = (extra = {}) => ({
    ...ui.th,
    textAlign: 'center',
    fontSize: 'var(--cc-xs)',
    whiteSpace: 'nowrap',
    padding: '5px 6px',
    ...extra,
  })

  const cell = (extra = {}) => ({
    ...ui.td,
    textAlign: 'center',
    padding: '3px 5px',
    fontSize: 'var(--cc-xs)',
    verticalAlign: 'middle',
    ...extra,
  })

  const rowLabel = (extra = {}) => cell({
    color: ui.textMuted,
    fontSize: 'var(--cc-sm)',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    padding: '4px 8px',
    ...extra,
  })

  const inp = (w = VI_W) => ({
    ...ui.inputStyle,
    width: w,
    minWidth: w,
    maxWidth: w,
    padding: '2px 4px',
    textAlign: 'center',
    fontSize: 'var(--cc-xs)',
    boxSizing: 'border-box',
  })

  const hiFila = useCallback((f) => resolveHiEntrega({
    bloques,
    matriz,
    abscisa: f.abscisa,
    abscisaDesde: entrega?.abscisa_desde,
    instDraft,
    instrumentoFallback: f.instrumento,
  }), [bloques, matriz, entrega?.abscisa_desde, instDraft])

  const cotaCampo = useCallback((hi, vi) => {
    const h = parseNum(hi)
    const v = parseNum(vi)
    if (h == null || v == null) return null
    return h - v
  }, [])

  const cotaCampoFila = useCallback((f, colKey, hi, vi) => {
    const live = cotaCampo(hi, vi)
    if (live != null) return live
    const saved = f.terreno?.[colKey]?.cota
    return saved != null ? Number(saved) : null
  }, [cotaCampo])

  const cotaDisenoInferior = useCallback((f, colKey) => {
    const v = f.diseno?.[colKey]
    return v != null ? Number(v) : null
  }, [])

  const cotaDisenoSuperior = useCallback((f, colKey) => {
    const inf = cotaDisenoInferior(f, colKey)
    if (inf == null) return null
    if (espesorDiseno != null && !esModoTerreno) return inf + Number(espesorDiseno)
    return inf
  }, [cotaDisenoInferior, espesorDiseno, esModoTerreno])

  const cotaReferenciaDiseno = useCallback((f, col) => (
    cotaReferenciaEnOrdenada(f, col, ordenadasCols, 'diseno')
  ), [ordenadasCols])

  const cotaTerrenoNaturalCampo = useCallback((f, col) => {
    const direct = f.referencia_campo?.[col.key]
    if (direct != null && direct !== '') return Number(direct)
    return cotaReferenciaEnOrdenada(f, col, ordenadasCols, 'campo')
  }, [ordenadasCols])

  /** Δ posición: cota campo (superior) − cota diseño superior. */
  const deltaCotaPosicion = useCallback((f, colKey, hi, vi) => {
    const cot = cotaCampoFila(f, colKey, hi, vi)
    const cotDis = cotaDisenoSuperior(f, colKey)
    if (cot == null || cotDis == null) return null
    return cot - cotDis
  }, [cotaCampoFila, cotaDisenoSuperior])

  /** Δ cota topográfica: |campo − cota diseño (inf.)|. */
  const deltaCotaCapa = useCallback((f, colKey, hi, vi) => {
    const cot = cotaCampoFila(f, colKey, hi, vi)
    const cotDis = cotaDisenoInferior(f, colKey)
    if (cot == null || cotDis == null) return null
    return Math.abs(Number(cot) - Number(cotDis))
  }, [cotaCampoFila, cotaDisenoInferior])

  /** Espesor de diseño vs referencia: |diseño sup. − ref. (diseño)|. */
  const espesorDisenoRefOrdenada = useCallback((f, col) => {
    const cotSup = cotaDisenoSuperior(f, col.key)
    const cotRef = cotaReferenciaDiseno(f, col) ?? cotaDisenoInferior(f, col.key)
    if (cotSup == null || cotRef == null) return null
    return Math.abs(Number(cotSup) - Number(cotRef))
  }, [cotaDisenoSuperior, cotaReferenciaDiseno, cotaDisenoInferior])

  const deltaCota = useCallback((f, colKey, hi, vi) => {
    if (refEsTerrenoNatural) return deltaCotaCapa(f, colKey, hi, vi)
    const d = deltaCotaPosicion(f, colKey, hi, vi)
    return d == null ? null : Math.abs(d)
  }, [refEsTerrenoNatural, deltaCotaCapa, deltaCotaPosicion])

  /** |Terreno natural (campo) − Diseño (inf.)| — fila referencia / Área. */
  const deltaTerrenoNaturalVsDiseno = useCallback((f, col) => {
    const cotTer = cotaTerrenoNaturalCampo(f, col)
    const cotDis = cotaDisenoInferior(f, col.key)
    if (cotTer == null || cotDis == null) return null
    return Math.abs(Number(cotTer) - Number(cotDis))
  }, [cotaTerrenoNaturalCampo, cotaDisenoInferior])

  /** Δ capa vs diseño inferior: cota campo (capa) − cota diseño — fila capa / CUMPLE. */
  const deltaCapaVsDiseno = useCallback((f, colKey, hi, vi) => {
    const cot = cotaCampoFila(f, colKey, hi, vi)
    const cotDis = cotaDisenoInferior(f, colKey)
    if (cot == null || cotDis == null) return null
    return Number(cot) - Number(cotDis)
  }, [cotaCampoFila, cotaDisenoInferior])

  const metricasSeccion = useMemo(() => {
    if (!muestraMetricas) return []
    const ancho = Number(anchoEfectivo)
    const areas = matriz.map((f) => {
      const efectivos = ordenadasCols
        .map((col) => deltaTerrenoNaturalVsDiseno(f, col))
        .filter((v) => v != null)
      if (!efectivos.length) return null
      const prom = efectivos.reduce((a, b) => a + b, 0) / efectivos.length
      return prom * ancho
    })
    return matriz.map((f, i) => {
      const area = areas[i]
      let volumen = null
      if (i > 0 && areas[i - 1] != null && area != null) {
        const L = Math.abs(Number(f.abscisa) - Number(matriz[i - 1].abscisa))
        volumen = ((areas[i - 1] + area) / 2) * L
      }
      return { area, volumen }
    })
  }, [
    muestraMetricas,
    matriz,
    ordenadasCols,
    deltaTerrenoNaturalVsDiseno,
    anchoEfectivo,
  ])

  const patchInst = (abscisa, patch) => {
    const k = String(abscisa)
    const fila = matriz.find((f) => String(f.abscisa) === k)
    setInstDraft((prev) => {
      const cur = prev[k] || {}
      return {
        ...prev,
        [k]: {
          ...cur,
          ...patch,
          bloque_id: patch.bloque_id ?? cur.bloque_id ?? fila?.instrumento?.bloque_id ?? fila?.bloque_id,
        },
      }
    })
    setDirty(true)
  }

  const onPuntoSelect = (abscisa, bloqueId, puntoId) => {
    const p = puntosNiv.find((x) => x.id === puntoId)
    patchInst(abscisa, {
      bloque_id: bloqueId,
      punto_biblioteca_id: puntoId,
      cota_punto: p?.cota != null ? String(p.cota) : '',
    })
  }

  const buildCarteraPayload = () => {
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
      .filter(([k]) => matriz.find((f) => String(f.abscisa) === k && f.instrumento?.es_cambio))
      .map(([k, d]) => {
        const fila = matriz.find((f) => String(f.abscisa) === k)
        const id = d.bloque_id || fila?.instrumento?.bloque_id || fila?.bloque_id
        const hi = hiDesdeCotaVplus(d.cota_punto, d.v_mas)
        return {
          id,
          punto_biblioteca_id: d.punto_biblioteca_id || null,
          v_mas: parseNum(d.v_mas),
          altura_instrumento: hi ?? parseNum(d.altura_instrumento),
          cota_punto: parseNum(d.cota_punto),
        }
      })
      .filter((b) => b.id && bloqueIds.has(b.id))

    return { filas, bloques: bloquesPayload }
  }

  const focusViInput = (index) => {
    const el = viInputRefs.current[index]
    if (el) {
      el.focus()
      el.select?.()
    }
  }

  const onViEnter = (filaIdx, colIdx) => (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const next = filaIdx * ordenadasCols.length + colIdx + 1
    if (next < matriz.length * ordenadasCols.length) {
      focusViInput(next)
    }
  }

  const guardarCartera = async () => {
    if (!onGuardarCartera) return false
    setSaving(true)
    try {
      await onGuardarCartera(buildCarteraPayload())
      setDirty(false)
      return true
    } finally {
      setSaving(false)
    }
  }

  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const guardarRef = useRef(guardarCartera)
  guardarRef.current = guardarCartera

  useImperativeHandle(ref, () => ({
    isDirty: () => dirtyRef.current,
    saveCartera: () => guardarRef.current(),
  }), [])

  if (!entrega) return null

  const nTrans = ordenadasCols.length

  return (
    <div style={{ ...ui.card, padding: '14px 16px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px', alignItems: 'center', marginBottom: 10 }}>
        <h4 style={{ margin: 0, fontSize: 'var(--cc-base)', color: ui.text }}>
          Verificación de estructura de vía
        </h4>
        <select
          value={String(capaIdx)}
          disabled
          style={{ ...ui.inputStyle, minWidth: 130, fontSize: 'var(--cc-xs)', padding: '3px 6px' }}
        >
          {capas.map((c, i) => (
            <option key={i} value={String(i)}>{c.nombre} ({fmtN(c.espesor_m, 3)} m)</option>
          ))}
          <option value={String(indiceTerreno)}>Terreno natural</option>
        </select>
        {esModoTerreno ? (
          <span style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
            Comparación vs diseño geométrico importado — solo diferencia de cota
          </span>
        ) : analisis.referencia_nombre && (
          <span style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
            Espesor vs {analisis.referencia_nombre}
            {usaRefCampo ? ' · cotas de campo' : ''}
            {refEsTerrenoNatural ? ' · esp. |diseño−ref.|' : ''}
            {' · diseño '}{fmtN(espesorDiseno, 3)} m · tol ±{fmtN(tol, 3)} m
          </span>
        )}
        <div className="cc-topo-actions-bar" style={{ marginLeft: isCompact ? 0 : 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', width: isCompact ? '100%' : undefined }}>
          {dirty && (
            <span style={{ fontSize: 'var(--cc-xs)', color: warnColor }}>Cambios sin guardar</span>
          )}
          {puedeEditar && (
            <>
              <button
                type="button"
                className="cc-topo-touch-btn"
                style={ui.btnPrimary}
                onClick={guardarCartera}
                disabled={busy || saving}
              >
                {saving ? 'Guardando…' : 'Guardar cartera'}
              </button>
              <button
                type="button"
                style={ui.btnSecondary}
                onClick={onRecalcular}
                disabled={busy || saving}
              >
                Recalcular
              </button>
            </>
          )}
        </div>
      </div>

      <TopoTableScroll maxHeight={580}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 + nTrans * 80 }}>
          <thead>
            <tr>
              <th style={th()}>Tramo</th>
              <th style={th()}>Abs</th>
              <th style={th({ minWidth: 56 })} />
              {ordenadasCols.map((col) => (
                <th key={col.key} style={th()} title={`Ordenada ${col.label} m`}>{col.label}</th>
              ))}
              {ordenadasCols.map((col) => (
                <th key={`d-${col.key}`} style={th()}>Dif {col.label}</th>
              ))}
              <th style={th()}>Ancho</th>
              {muestraMetricas && (
                <>
                  <th style={th()} title={refEsTerrenoNatural
                    ? 'Promedio |esp. campo| × ancho (esp. real, sin tope diseño)'
                    : 'Promedio min(esp. campo, esp. diseño) × ancho'}
                  >
                    Área
                  </th>
                  <th style={th()} title="Promedio áreas con abscisa anterior × longitud tramo">Volumen</th>
                </>
              )}
              <th style={th({ background: instBg })}>Punto</th>
              <th style={th({ background: instBg })}>H. Inst</th>
              <th style={th({ background: instBg })}>V+</th>
              <th style={th({ background: instBg })}>Cota</th>
              <th style={th({ background: instBg, width: 32 })}>+</th>
            </tr>
          </thead>
          <tbody>
            {matriz.map((f, filaIdx) => {
              const k = String(f.abscisa)
              const draft = viDraft[k] || {}
              const ins = f.instrumento || {}
              const esCambio = Boolean(ins.es_cambio)
              const instD = instDraft[k] || {}
              const hi = hiFila(f)
              const bloqueId = instD.bloque_id || ins.bloque_id
              const rs = filasPorAbscisa

              const renderInst = () => {
                const hiShow = esCambio
                  ? (hiDesdeCotaVplus(instD.cota_punto, instD.v_mas) ?? ins.altura_instrumento)
                  : null
                return (
                  <>
                    <td style={cell({ background: instBg, verticalAlign: 'middle' })} rowSpan={rs}>
                      {esCambio && puedeEditar ? (
                        <select
                          value={instD.punto_biblioteca_id ?? ''}
                          onChange={(e) => onPuntoSelect(f.abscisa, bloqueId, e.target.value)}
                          style={{ ...inp(72), maxWidth: 88 }}
                        >
                          <option value="">—</option>
                          {puntosNiv.map((p) => (
                            <option key={p.id} value={p.id}>{p.nombre}</option>
                          ))}
                        </select>
                      ) : (
                        <span style={{ color: ui.textMuted }}>{esCambio ? (ins.nombre_punto || '—') : ''}</span>
                      )}
                    </td>
                    <td style={cell({ background: instBg, color: ui.textMuted, verticalAlign: 'middle' })} rowSpan={rs}>
                      {esCambio ? fmtN(hiShow, 3) : ''}
                    </td>
                    <td style={cell({ background: instBg, verticalAlign: 'middle' })} rowSpan={rs}>
                      {esCambio && puedeEditar ? (
                        <input
                          value={instD.v_mas ?? ''}
                          onChange={(e) => patchInst(f.abscisa, { bloque_id: bloqueId, v_mas: e.target.value })}
                          style={inp(52)}
                          placeholder="0.00"
                          autoComplete="off"
                        />
                      ) : (esCambio ? fmtN(ins.v_mas, 3) : '')}
                    </td>
                    <td style={cell({ background: instBg, color: ui.textMuted, verticalAlign: 'middle' })} rowSpan={rs}>
                      {esCambio ? fmtN(instD.cota_punto ?? ins.cota_punto, 3) : ''}
                    </td>
                    <td style={cell({ background: instBg, padding: 2, verticalAlign: 'middle' })} rowSpan={rs}>
                      <PermisoAviso permisos={permisos} accion="editar">
                        <button
                          type="button"
                          title="Agregar cambio de instrumento en esta abscisa"
                          onClick={() => onAddBloque?.(f.abscisa)}
                          disabled={busy || saving || addingBloqueAt != null}
                          style={{ ...ui.btnSecondary, padding: '0 5px', fontSize: '13px', lineHeight: 1.2, minWidth: 0 }}
                        >
                          {addingBloqueAt === f.abscisa ? '…' : '+'}
                        </button>
                      </PermisoAviso>
                    </td>
                  </>
                )
              }

              return (
                <Fragment key={k}>
                  <tr ref={(el) => { rowRefs.current[k] = el }} style={{ background: rowViBg }}>
                    <td style={cell({ fontWeight: 600 })} rowSpan={rs}>{f.tramo || '—'}</td>
                    <td style={cell({ fontWeight: 700 })} rowSpan={rs}>{fmtN(f.abscisa, 2)}</td>
                    <td style={rowLabel()}>Vi</td>
                    {ordenadasCols.map((col, colIdx) => (
                      <td key={`vi-${col.key}`} style={cell()}>
                        {puedeEditar ? (
                          <input
                            ref={(el) => { viInputRefs.current[filaIdx * ordenadasCols.length + colIdx] = el }}
                            value={draft[col.key] ?? ''}
                            onChange={(e) => {
                              setViDraft((p) => ({
                                ...p,
                                [k]: { ...(p[k] || {}), [col.key]: e.target.value },
                              }))
                              setDirty(true)
                            }}
                            onKeyDown={onViEnter(filaIdx, colIdx)}
                            style={inp(VI_W)}
                            autoComplete="off"
                          />
                        ) : fmtN(f.terreno?.[col.key]?.vi, 3)}
                      </td>
                    ))}
                    <td style={cell()} colSpan={nTrans} />
                    <td style={cell({ color: ui.textMuted })} rowSpan={rs}>{fmtN(anchoEfectivo, 1)}</td>
                    {muestraMetricas && (
                      <>
                        <td style={cell({ fontWeight: 600 })} rowSpan={rs} title="Prom. |diseño − terreno| (fila Terreno natural) × ancho">
                          {fmtN(metricasSeccion[filaIdx]?.area, 3)}
                        </td>
                        <td style={cell({ fontWeight: 600 })} rowSpan={rs} title="Promedio áreas × longitud desde abscisa anterior">
                          {fmtN(metricasSeccion[filaIdx]?.volumen, 3)}
                        </td>
                      </>
                    )}
                    {renderInst()}
                  </tr>

                  <tr style={{ background: rowDisBg }}>
                    <td style={rowLabel()}>Diseño</td>
                    {ordenadasCols.map((col) => (
                      <td key={`dis-${col.key}`} style={cell()} title={esModoTerreno
                        ? 'Cota de rasante importada'
                        : 'Cota inferior de capa (rasante − esp. acumulado incl. capa)'}>
                        {fmtN(f.diseno?.[col.key], 3)}
                      </td>
                    ))}
                    {ordenadasCols.map((col) => {
                      if (esModoTerreno) {
                        return <td key={`pd-${col.key}`} style={cell()} />
                      }
                      const dRaj = deltaCapaVsDiseno(f, col.key, hi, draft[col.key])
                      const est = estadoTolerancia(dRaj, tol)
                      const { color, flecha, title: tolTitle } = estiloTolerancia(est, tolEstilo)
                      return (
                        <td
                          key={`pd-${col.key}`}
                          style={{
                            ...cell(),
                            color: dRaj == null ? ui.textMuted : est === 'ok' ? okColor : color,
                            fontWeight: dRaj != null ? 600 : 400,
                          }}
                          title={dRaj != null
                            ? `${capaLabel} − diseño: CUMPLE si |Δ| ≤ ±${fmtN(tol, 3)} m. ${tolTitle}`
                            : ''}
                        >
                          {dRaj != null ? (
                            <>
                              {flecha}
                              {est === 'ok' ? 'CUMPLE' : 'NO CUMPLE'}
                            </>
                          ) : '—'}
                        </td>
                      )
                    })}
                  </tr>

                  {muestraFilaRef && (
                    <tr style={{ background: `${ui.accent}08` }}>
                      <td style={rowLabel()} title={`Cotas de referencia (${referenciaLabel})`}>
                        {referenciaLabel}
                      </td>
                      {ordenadasCols.map((col) => {
                        const directCampo = f.referencia_campo?.[col.key]
                        const refCampo = cotaReferenciaEnOrdenada(f, col, ordenadasCols, 'campo')
                        const refDiseno = cotaReferenciaEnOrdenada(f, col, ordenadasCols, 'diseno')
                        const refVal = refCampo ?? refDiseno
                        const esCampoDirecto = directCampo != null && directCampo !== ''
                        const esCampoInterp = !esCampoDirecto && refCampo != null
                        let title = 'Cota de referencia (diseño interpolada)'
                        if (esCampoDirecto) title = 'Cota de campo (entrega previa)'
                        else if (esCampoInterp) {
                          title = 'Cota de campo interpolada (sobre-ancho)'
                        } else if (refDiseno != null) title = 'Cota de referencia (diseño interpolada)'
                        return (
                          <td
                            key={`ref-${col.key}`}
                            style={cell({ color: ui.textMuted, fontStyle: esCampoInterp ? 'italic' : 'normal' })}
                            title={title}
                          >
                            {fmtN(refVal, 3)}
                          </td>
                        )
                      })}
                      {ordenadasCols.map((col) => {
                        const dTer = deltaTerrenoNaturalVsDiseno(f, col)
                        return (
                          <td
                            key={`re-${col.key}`}
                            style={{
                              ...cell(),
                              color: dTer == null ? ui.textMuted : ui.text,
                              fontWeight: dTer != null ? 600 : 400,
                            }}
                            title="|Terreno natural (campo) − Diseño inferior|"
                          >
                            {fmtN(dTer, 3)}
                          </td>
                        )
                      })}
                    </tr>
                  )}

                  <tr style={{ background: rowTerBg }}>
                    <td style={rowLabel()} title={`Cotas de campo — ${capaLabel}`}>{capaLabel}</td>
                    {ordenadasCols.map((col) => (
                      <td key={`ter-${col.key}`} style={cell()} title="Cota de campo medida (H. Inst − Vi)">
                        {fmtN(cotaCampoFila(f, col.key, hi, draft[col.key]), 3)}
                      </td>
                    ))}
                    {ordenadasCols.map((col) => {
                      const d = muestraFilaRef
                        ? deltaCapaVsDiseno(f, col.key, hi, draft[col.key])
                        : deltaCota(f, col.key, hi, draft[col.key])
                      const est = refEsTerrenoNatural ? estadoTolerancia(d, tol) : null
                      const { color, flecha, title: tolTitle } = estiloTolerancia(est, tolEstilo)
                      return (
                        <td
                          key={`df-${col.key}`}
                          style={{
                            ...cell(),
                            color: d == null ? ui.textMuted : est === 'ok' || est == null ? ui.text : color,
                            fontWeight: d != null ? 600 : 400,
                          }}
                          title={muestraFilaRef
                            ? `Δ = ${capaLabel} − diseño (CUMPLE si |Δ| ≤ ±${fmtN(tol, 3)} m). ${tolTitle}`
                            : '|cota campo − cota diseño|'}
                        >
                          {d != null ? (
                            <>
                              {flecha}
                              {fmtN(d, 3)}
                            </>
                          ) : '—'}
                        </td>
                      )
                    })}
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
        {!matriz.length && (
          <p style={{ margin: '12px 0 0', fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
            No hay estaciones en el rango de abscisas.
          </p>
        )}
      </TopoTableScroll>
      <p style={{ margin: '10px 0 0', fontSize: 'var(--cc-sm)', color: ui.textMuted, lineHeight: 1.5 }}>
        Vi / Diseño{!esModoTerreno && espesorDiseno != null ? ` / ${referenciaLabel}` : ''} / {capaLabel} por ordenada transversal.
        {esModoTerreno
          ? ' Diferencia = cota campo − cota diseño (rasante importada). No aplica cumplimiento por tolerancia.'
          : ` Diseño/Dif: CUMPLE si |${capaLabel} − diseño| ≤ ±${fmtN(tol, 3)} m. ▼ azul = por debajo; ▲ fucsia = por encima. ${referenciaLabel}: cotas campo. ${capaLabel}: Dif = ${capaLabel} − diseño. Área = prom. |${referenciaLabel} − diseño| × ancho.`}
      </p>
    </div>
  )
})

export default EntregaVerificacionMatriz
