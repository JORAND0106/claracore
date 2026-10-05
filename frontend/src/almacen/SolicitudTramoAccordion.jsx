import { Fragment, useEffect, useMemo, useState } from 'react'
import CcModalBrandHeader from '../components/CcModalBrandHeader'
import { btnSuccessStyle } from '../theme/adminPanelTheme'
import {
  AlmacenHelpIcon,
  almacenFormModalDialogStyle,
  fmtCant,
  useAlmacenApi,
  useAlmacenCompact,
  useAlmacenTheme,
} from './almacenShared'
import {
  clavePk,
  claveTramo,
  crearLineasPorPk,
  etiquetaGrupo,
  etiquetaTramo,
  nuevoGrupoId,
  saldoSeleccion,
} from './solicitudTramoSeleccion'

function ExcelHeader({ abbr, tip, style, align = 'left' }) {
  return (
    <th style={{ ...style, padding: '6px 8px', whiteSpace: 'nowrap', textAlign: align }} title={tip}>
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
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
 * Acordeón Tramo → PK-ID → registros de presupuesto.
 * Los niveles inferiores se piden al expandir. Al confirmar, una línea por PK-ID.
 */
export default function SolicitudTramoAccordion({
  capitulo,
  item,
  descripcion,
  esPrincipal,
  observacion,
  excludeSolicitudId,
  t,
  busy,
  onClose,
  onConfirm,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const compact = useAlmacenCompact()
  const [tramos, setTramos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openTramos, setOpenTramos] = useState({})
  const [openPks, setOpenPks] = useState({})
  const [pksByTramo, setPksByTramo] = useState({})
  const [regsByPk, setRegsByPk] = useState({})
  const [loadingKey, setLoadingKey] = useState('')
  const [selTramos, setSelTramos] = useState(() => new Set())
  const [selPks, setSelPks] = useState(() => new Set())
  const [selRegs, setSelRegs] = useState(() => new Set())
  const [cantidad, setCantidad] = useState('')
  const [cantidadTocada, setCantidadTocada] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [descLocal, setDescLocal] = useState(descripcion || '')
  const [prinLocal, setPrinLocal] = useState(esPrincipal !== false)
  const [obsLocal, setObsLocal] = useState(observacion || '')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    api.getPresupuestoTramos(capitulo, item, excludeSolicitudId)
      .then((res) => {
        if (!cancelled) setTramos(res?.tramos || [])
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'No se pudieron cargar los tramos.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [api, capitulo, item, excludeSolicitudId])

  const cargarPks = async (tramo) => {
    const key = claveTramo(tramo)
    if (pksByTramo[key]) return pksByTramo[key]
    setLoadingKey(`t:${key}`)
    const res = await api.getPresupuestoTramoPks(capitulo, item, tramo, excludeSolicitudId)
    const pks = res?.pks || []
    setPksByTramo((prev) => ({ ...prev, [key]: pks }))
    setLoadingKey('')
    return pks
  }

  const cargarRegs = async (tramo, pkId) => {
    const key = clavePk(tramo, pkId)
    if (regsByPk[key]) return regsByPk[key]
    setLoadingKey(`p:${key}`)
    const res = await api.getPresupuestoRegistros(capitulo, item, pkId, excludeSolicitudId)
    const regs = (res?.registros || []).map((r) => ({ ...r, tramo: claveTramo(tramo), pk_id: pkId }))
    setRegsByPk((prev) => ({ ...prev, [key]: regs }))
    setLoadingKey('')
    return regs
  }

  const toggleTramoOpen = async (tramo) => {
    const key = claveTramo(tramo)
    setOpenTramos((prev) => ({ ...prev, [key]: !prev[key] }))
    if (!pksByTramo[key]) {
      try {
        await cargarPks(tramo)
      } catch (e) {
        setError(e.message || 'No se pudieron cargar los PK-ID.')
      }
    }
  }

  const togglePkOpen = async (tramo, pkId) => {
    const key = clavePk(tramo, pkId)
    setOpenPks((prev) => ({ ...prev, [key]: !prev[key] }))
    if (!regsByPk[key]) {
      try {
        await cargarRegs(tramo, pkId)
      } catch (e) {
        setError(e.message || 'No se pudieron cargar los registros.')
      }
    }
  }

  const onToggleTramo = (tramo, checked) => {
    const key = claveTramo(tramo)
    setSelTramos((prev) => {
      const next = new Set(prev)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })
    if (!checked) {
      const pks = pksByTramo[key] || []
      setSelPks((prev) => {
        const next = new Set(prev)
        pks.forEach((p) => next.delete(clavePk(tramo, p.pk_id)))
        return next
      })
      setSelRegs((prev) => {
        const next = new Set(prev)
        pks.forEach((p) => {
          const regs = regsByPk[clavePk(tramo, p.pk_id)] || []
          regs.forEach((r) => next.delete(Number(r.presupuesto_id)))
        })
        return next
      })
    }
  }

  const onTogglePk = async (pk, checked) => {
    const tKey = claveTramo(pk.tramo)
    const pKey = clavePk(pk.tramo, pk.pk_id)
    if (!checked && selTramos.has(tKey)) {
      const hermanos = pksByTramo[tKey] || await cargarPks(pk.tramo)
      setSelTramos((prev) => {
        const next = new Set(prev)
        next.delete(tKey)
        return next
      })
      setSelPks((prev) => {
        const next = new Set(prev)
        hermanos.forEach((h) => {
          if (clavePk(h.tramo, h.pk_id) !== pKey) next.add(clavePk(h.tramo, h.pk_id))
        })
        next.delete(pKey)
        return next
      })
      return
    }
    setSelPks((prev) => {
      const next = new Set(prev)
      if (checked) next.add(pKey)
      else next.delete(pKey)
      return next
    })
    if (!checked) {
      const regs = regsByPk[pKey] || []
      setSelRegs((prev) => {
        const next = new Set(prev)
        regs.forEach((r) => next.delete(Number(r.presupuesto_id)))
        return next
      })
    }
  }

  const onToggleReg = async (tramo, pk, reg, checked) => {
    const pid = Number(reg.presupuesto_id)
    const tKey = claveTramo(tramo)
    const pKey = clavePk(tramo, pk.pk_id)
    const pkEntero = selTramos.has(tKey) || selPks.has(pKey)
    if (!checked && pkEntero) {
      let regs = regsByPk[pKey]
      if (!regs) regs = await cargarRegs(tramo, pk.pk_id)
      if (selTramos.has(tKey)) {
        const hermanos = pksByTramo[tKey] || await cargarPks(tramo)
        setSelTramos((prev) => {
          const next = new Set(prev)
          next.delete(tKey)
          return next
        })
        setSelPks((prev) => {
          const next = new Set(prev)
          hermanos.forEach((h) => {
            if (clavePk(h.tramo, h.pk_id) !== pKey) next.add(clavePk(h.tramo, h.pk_id))
          })
          return next
        })
      } else {
        setSelPks((prev) => {
          const next = new Set(prev)
          next.delete(pKey)
          return next
        })
      }
      setSelRegs((prev) => {
        const next = new Set(prev)
        regs.forEach((r) => {
          const id = Number(r.presupuesto_id)
          if (id !== pid) next.add(id)
        })
        next.delete(pid)
        return next
      })
      return
    }
    setSelRegs((prev) => {
      const next = new Set(prev)
      if (checked) next.add(pid)
      else next.delete(pid)
      return next
    })
  }

  const seleccion = useMemo(() => {
    const tramosSel = tramos.filter((t) => selTramos.has(claveTramo(t.tramo)))
    const pksSel = []
    Object.values(pksByTramo).forEach((lista) => {
      lista.forEach((p) => {
        if (selPks.has(clavePk(p.tramo, p.pk_id))) pksSel.push(p)
      })
    })
    const regsSel = []
    Object.values(regsByPk).forEach((lista) => {
      lista.forEach((r) => {
        if (selRegs.has(Number(r.presupuesto_id))) regsSel.push(r)
      })
    })
    return { tramos: tramosSel, pks: pksSel, registros: regsSel }
  }, [tramos, pksByTramo, regsByPk, selTramos, selPks, selRegs])

  const disponible = saldoSeleccion(seleccion)

  useEffect(() => {
    if (!cantidadTocada) setCantidad(disponible > 0 ? String(disponible) : '')
  }, [disponible, cantidadTocada])

  const pkMarcado = (tramo, pkId) => (
    selTramos.has(claveTramo(tramo)) || selPks.has(clavePk(tramo, pkId))
  )

  const regMarcado = (tramo, pkId, presupuestoId) => (
    pkMarcado(tramo, pkId) || selRegs.has(Number(presupuestoId))
  )

  const confirmar = async () => {
    const cant = Number(cantidad)
    if (!(cant > 0)) {
      setError('Indique una cantidad mayor a cero.')
      return
    }
    if (cant - disponible > 0.0001) {
      setError('La cantidad no puede superar el saldo disponible de lo seleccionado. Puede reducirla.')
      return
    }
    const material = String(descLocal || '').trim()
    if (material.length < 3) {
      setError('Describa el material (mínimo 3 caracteres) antes de generar las líneas.')
      return
    }
    setConfirmando(true)
    setError('')
    try {
      const grupos = []
      for (const t of seleccion.tramos) {
        const det = await api.getPresupuestoTramoDetalle(
          capitulo, item, t.tramo, excludeSolicitudId,
        )
        for (const pk of det?.pks || []) {
          grupos.push({
            pk_id: pk.pk_id,
            tramo: pk.tramo,
            saldo_disponible: pk.saldo_disponible,
            registros: pk.registros || [],
          })
        }
      }
      for (const p of seleccion.pks) {
        if (selTramos.has(claveTramo(p.tramo))) continue
        let regs = regsByPk[clavePk(p.tramo, p.pk_id)]
        if (!regs) regs = await cargarRegs(p.tramo, p.pk_id)
        grupos.push({
          pk_id: p.pk_id,
          tramo: p.tramo,
          saldo_disponible: p.saldo_disponible,
          registros: regs,
        })
      }
      const sueltos = new Map()
      for (const r of seleccion.registros) {
        if (selTramos.has(claveTramo(r.tramo))) continue
        if (selPks.has(clavePk(r.tramo, r.pk_id))) continue
        const key = clavePk(r.tramo, r.pk_id)
        if (!sueltos.has(key)) {
          sueltos.set(key, { pk_id: r.pk_id, tramo: r.tramo, registros: [] })
        }
        sueltos.get(key).registros.push(r)
      }
      sueltos.forEach((g) => grupos.push(g))
      if (!grupos.length) {
        setError('Seleccione un tramo, un PK-ID o al menos un registro.')
        setConfirmando(false)
        return
      }
      const tramosEtiqueta = grupos.map((g) => g.tramo)
      const lineas = crearLineasPorPk({
        cantidad: cant,
        gruposPk: grupos,
        grupoId: nuevoGrupoId(),
        grupoEtiqueta: etiquetaGrupo(tramosEtiqueta, material),
        plantilla: {
          presupuesto_capitulo: capitulo,
          presupuesto_item: item,
          descripcion_solicitada: material,
          es_principal: prinLocal !== false,
          observacion_residente: obsLocal || '',
        },
      })
      if (!lineas.length) {
        setError('No hay saldo disponible para generar líneas con esa selección.')
        setConfirmando(false)
        return
      }
      onConfirm?.(lineas)
    } catch (e) {
      setError(e.message || 'No se pudieron generar las líneas.')
      setConfirmando(false)
    }
  }

  const theme = t || {
    primary: ui.accent,
    border: '#e2e8f0',
    text: ui.text,
    textMuted: ui.textMuted,
    bgCard: ui.card?.background || '#fff',
  }
  const th = { ...ui.th, fontSize: 'var(--cc-xs)' }
  const td = { ...ui.td, padding: '4px 6px', fontSize: 'var(--cc-xs)' }
  const tdNum = { ...ui.tdNum, padding: '4px 6px', fontSize: 'var(--cc-xs)' }
  const ocupado = busy || confirmando

  return (
    <div
      className={compact ? 'cc-almacen-modal-overlay cc-almacen-modal-overlay--compact' : 'cc-almacen-modal-overlay'}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100040,
        display: 'flex',
        alignItems: compact ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: compact ? 0 : 20,
      }}
      onClick={() => !ocupado && onClose?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="solicitud-tramo-titulo"
        onClick={(e) => e.stopPropagation()}
        style={{
          ...almacenFormModalDialogStyle({ width: 'min(1100px, 100%)', compact }),
          maxHeight: compact ? '94vh' : '90vh',
          overflow: 'auto',
          padding: compact ? 16 : 22,
        }}
      >
        <CcModalBrandHeader theme={theme} />
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <div>
            <div id="solicitud-tramo-titulo" style={{ fontWeight: 800, fontSize: 'var(--cc-title)' }}>
              Cantidades por tramo
            </div>
            <div style={{ color: ui.textMuted, fontSize: 'var(--cc-sm)', marginTop: 4 }}>
              {capitulo} · {item}
            </div>
          </div>
          <button type="button" style={ui.btnSecondary} disabled={ocupado} onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </header>

        {error && (
          <div style={{
            color: '#991b1b',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            padding: '8px 10px',
            marginBottom: 10,
            fontSize: 'var(--cc-sm)',
            whiteSpace: 'pre-wrap',
          }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ color: ui.textMuted, fontSize: 'var(--cc-sm)' }}>Cargando tramos…</div>
        ) : tramos.length === 0 ? (
          <div style={{ color: ui.textMuted, fontSize: 'var(--cc-sm)' }}>
            No hay cantidades de presupuesto para este capítulo e ítem.
          </div>
        ) : (
          <div style={ui.sheetWrap} className="cc-almacen-table-scroll">
            <table style={{ ...ui.sheetTable, minWidth: 720 }}>
              <thead>
                <tr>
                  <ExcelHeader abbr="" tip="Seleccionar" style={{ ...th, width: 36 }} />
                  <ExcelHeader abbr="" tip="Expandir" style={{ ...th, width: 36 }} />
                  <ExcelHeader abbr="TRAMO" tip="Tramo con cantidades disponibles del ítem" style={th} />
                  <ExcelHeader abbr="PK" tip="Cantidad de PK-ID del tramo" style={th} align="right" />
                  <ExcelHeader abbr="PPTO" tip="Cantidad presupuestada" style={th} align="right" />
                  <ExcelHeader abbr="ACUM." tip="Cantidad ya solicitada" style={th} align="right" />
                  <ExcelHeader abbr="SALDO" tip="Saldo disponible" style={th} align="right" />
                </tr>
              </thead>
              <tbody>
                {tramos.map((trow) => {
                  const tKey = claveTramo(trow.tramo)
                  const abierto = !!openTramos[tKey]
                  const pks = pksByTramo[tKey] || []
                  const marcado = selTramos.has(tKey)
                  return (
                    <Fragment key={`t-${tKey}`}>
                      <tr style={{ background: marcado ? ui.accentSoft : undefined }}>
                        <td style={td}>
                          <input
                            type="checkbox"
                            checked={marcado}
                            aria-label={`Seleccionar ${etiquetaTramo(trow.tramo)}`}
                            disabled={ocupado}
                            onChange={(e) => onToggleTramo(trow.tramo, e.target.checked)}
                          />
                        </td>
                        <td style={td}>
                          <button
                            type="button"
                            style={{ ...ui.btnSecondary, padding: '2px 8px', minHeight: 0 }}
                            aria-label={`Expandir ${etiquetaTramo(trow.tramo)}`}
                            onClick={() => { void toggleTramoOpen(trow.tramo) }}
                          >
                            {abierto ? '▾' : '▸'}
                          </button>
                        </td>
                        <td style={{ ...td, fontWeight: 700 }}>{etiquetaTramo(trow.tramo)}</td>
                        <td style={tdNum}>{trow.pk_count}</td>
                        <td style={tdNum}>{fmtCant(trow.cant_total)} {trow.unidad || ''}</td>
                        <td style={tdNum}>{fmtCant(trow.cant_solicitada_acumulada)}</td>
                        <td style={{
                          ...tdNum,
                          color: trow.saldo_disponible < 0 ? 'var(--cc-color-danger)' : 'var(--cc-color-positive)',
                          fontWeight: 700,
                        }}
                        >
                          {fmtCant(trow.saldo_disponible)}
                        </td>
                      </tr>
                      {abierto && loadingKey === `t:${tKey}` && (
                        <tr key={`tload-${tKey}`}>
                          <td colSpan={7} style={{ ...td, color: ui.textMuted }}>Cargando PK-ID…</td>
                        </tr>
                      )}
                      {abierto && pks.map((pk) => {
                        const pKey = clavePk(pk.tramo, pk.pk_id)
                        const pkAbierto = !!openPks[pKey]
                        const regs = regsByPk[pKey] || []
                        const pkOn = pkMarcado(pk.tramo, pk.pk_id)
                        return (
                          <Fragment key={`p-${pKey}`}>
                            <tr style={{ background: pkOn ? `${ui.accent}10` : undefined }}>
                              <td style={td} />
                              <td style={td}>
                                <input
                                  type="checkbox"
                                  checked={pkOn}
                                  aria-label={`Seleccionar PK ${pk.pk_id}`}
                                  disabled={ocupado}
                                  onChange={(e) => { void onTogglePk(pk, e.target.checked) }}
                                />
                              </td>
                              <td style={td} colSpan={2}>
                                <button
                                  type="button"
                                  style={{ ...ui.btnSecondary, padding: '2px 8px', minHeight: 0, marginRight: 8 }}
                                  onClick={() => { void togglePkOpen(pk.tramo, pk.pk_id) }}
                                  aria-label={`Expandir PK ${pk.pk_id}`}
                                >
                                  {pkAbierto ? '▾' : '▸'}
                                </button>
                                PK {pk.pk_id}
                                <span style={{ color: ui.textMuted, marginLeft: 8 }}>
                                  {pk.registros_count} reg.
                                </span>
                              </td>
                              <td style={tdNum}>{fmtCant(pk.cant_total)}</td>
                              <td style={tdNum}>{fmtCant(pk.cant_solicitada_acumulada)}</td>
                              <td style={tdNum}>{fmtCant(pk.saldo_disponible)}</td>
                            </tr>
                            {pkAbierto && loadingKey === `p:${pKey}` && (
                              <tr key={`pload-${pKey}`}>
                                <td colSpan={7} style={{ ...td, color: ui.textMuted, paddingLeft: 48 }}>
                                  Cargando registros…
                                </td>
                              </tr>
                            )}
                            {pkAbierto && regs.map((r) => {
                              const on = regMarcado(pk.tramo, pk.pk_id, r.presupuesto_id)
                              return (
                                <tr key={`r-${r.presupuesto_id}`}>
                                  <td style={td} />
                                  <td style={td}>
                                    <input
                                      type="checkbox"
                                      checked={on}
                                      aria-label={`Seleccionar registro ${r.presupuesto_id}`}
                                      disabled={ocupado}
                                      onChange={(e) => {
                                        void onToggleReg(pk.tramo, pk, r, e.target.checked)
                                      }}
                                    />
                                  </td>
                                  <td style={{ ...td, paddingLeft: 28 }} colSpan={2}>
                                    {(r.abs_inicio || '—')} — {(r.abs_final || '—')}
                                  </td>
                                  <td style={tdNum}>{fmtCant(r.cant_total)}</td>
                                  <td style={tdNum}>{fmtCant(r.cant_solicitada_acumulada)}</td>
                                  <td style={tdNum}>{fmtCant(r.saldo_disponible)}</td>
                                </tr>
                              )
                            })}
                          </Fragment>
                        )
                      })}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          marginTop: 14,
          alignItems: 'flex-end',
        }}
        >
          <label style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, flex: '1 1 220px' }}>
            Material (se aplica a todas las líneas)
            <input
              style={{ ...ui.input, marginTop: 4, width: '100%' }}
              value={descLocal}
              disabled={ocupado}
              placeholder="Describa el material…"
              onChange={(e) => setDescLocal(e.target.value)}
            />
          </label>
          <label style={{
            fontSize: 'var(--cc-xs)',
            color: ui.textMuted,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            paddingBottom: 8,
          }}
          >
            <input
              type="checkbox"
              checked={prinLocal}
              disabled={ocupado}
              onChange={(e) => setPrinLocal(e.target.checked)}
            />
            Principal
          </label>
          <label style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, flex: '1 1 180px' }}>
            Observación
            <input
              style={{ ...ui.input, marginTop: 4, width: '100%' }}
              value={obsLocal}
              disabled={ocupado}
              onChange={(e) => setObsLocal(e.target.value)}
            />
          </label>
        </div>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'flex-end',
          marginTop: 10,
        }}
        >
          <div style={{ fontSize: 'var(--cc-sm)' }}>
            Disponible seleccionado:{' '}
            <strong>{fmtCant(disponible)}</strong>
          </div>
          <label style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
            Cantidad a pedir
            <input
              style={{ ...ui.input, marginTop: 4, width: 140, textAlign: 'right' }}
              type="number"
              min="0"
              max={disponible || undefined}
              step="any"
              value={cantidad}
              disabled={ocupado || !(disponible > 0)}
              onChange={(e) => {
                setCantidadTocada(true)
                setCantidad(e.target.value)
              }}
            />
          </label>
          <button
            type="button"
            style={{ ...btnSuccessStyle(ui.btnPrimary), padding: '10px 16px' }}
            disabled={ocupado || !(disponible > 0)}
            onClick={() => { void confirmar() }}
          >
            {confirmando ? 'Generando…' : 'Generar líneas por PK-ID'}
          </button>
        </div>
        <div style={{ marginTop: 8, fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
          Si pide menos que el total, el consumo se reparte entre los PK-ID y sus registros según el saldo de cada uno.
          El mapa sigue disponible como camino alterno.
        </div>
      </div>
    </div>
  )
}
