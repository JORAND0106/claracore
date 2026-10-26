import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import CcModalBrandHeader from '../components/CcModalBrandHeader'
import { btnSuccessStyle } from '../theme/adminPanelTheme'
import { almacenContraste, estiloAvisoAlmacen } from './almacenContraste'
import {
  AlmacenHelpIcon,
  almacenFormModalDialogStyle,
  fmtCant,
  fmtCant2,
  useAlmacenApi,
  useAlmacenCompact,
  useAlmacenTheme,
} from './almacenShared'
import {
  calcularRepartoManual,
  clavePk,
  claveTramo,
  compararCantidadConSaldo,
  crearLineasPorPk,
  etiquetaGrupo,
  etiquetaTramo,
  lineasDesdePedido,
  nuevoGrupoId,
  saldoSeleccion,
} from './solicitudTramoSeleccion'

function textoCantidad(n) {
  if (n == null || !Number.isFinite(Number(n))) return ''
  const s = String(n)
  if (!/[eE]/.test(s)) return s
  return Number(n).toFixed(12).replace(/0+$/, '').replace(/\.$/, '')
}

function escrito(v) {
  return v != null && String(v).trim() !== ''
}

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
  insumoId,
  t,
  busy,
  onClose,
  onConfirm,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const contraste = almacenContraste(ui)
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
  const [manual, setManual] = useState({ tramo: {}, pk: {}, reg: {} })
  const [focoPedir, setFocoPedir] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const datosRef = useRef({ pks: {}, regs: {}, listo: new Set() })
  const cargaGen = useRef(0)
  const [descLocal, setDescLocal] = useState(descripcion || '')
  const [prinLocal, setPrinLocal] = useState(esPrincipal !== false)
  const [obsLocal, setObsLocal] = useState(observacion || '')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setPksByTramo({})
    setRegsByPk({})
    setManual({ tramo: {}, pk: {}, reg: {} })
    cargaGen.current += 1
    datosRef.current = { pks: {}, regs: {}, listo: new Set() }
    api.getPresupuestoTramos(capitulo, item, excludeSolicitudId, insumoId || undefined)
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
  }, [api, capitulo, item, excludeSolicitudId, insumoId])

  const cargarPks = async (tramo) => {
    const key = claveTramo(tramo)
    if (pksByTramo[key]) return pksByTramo[key]
    setLoadingKey(`t:${key}`)
    const res = await api.getPresupuestoTramoPks(capitulo, item, tramo, excludeSolicitudId, insumoId || undefined)
    const pks = res?.pks || []
    setPksByTramo((prev) => ({ ...prev, [key]: pks }))
    setLoadingKey('')
    return pks
  }

  const cargarRegs = async (tramo, pkId) => {
    const key = clavePk(tramo, pkId)
    if (regsByPk[key]) return regsByPk[key]
    setLoadingKey(`p:${key}`)
    const res = await api.getPresupuestoRegistros(capitulo, item, pkId, excludeSolicitudId, insumoId || undefined)
    const regs = (res?.registros || []).map((r) => ({ ...r, tramo: claveTramo(tramo), pk_id: pkId }))
    setRegsByPk((prev) => ({ ...prev, [key]: regs }))
    setLoadingKey('')
    return regs
  }

  useEffect(() => {
    datosRef.current = { ...datosRef.current, pks: pksByTramo, regs: regsByPk }
  }, [pksByTramo, regsByPk])

  const asegurarDetalle = async (tramo) => {
    const key = claveTramo(tramo)
    const gen = cargaGen.current
    if (datosRef.current.listo.has(key)) return datosRef.current
    const det = await api.getPresupuestoTramoDetalle(
      capitulo, item, tramo, excludeSolicitudId, insumoId || undefined,
    )
    if (gen !== cargaGen.current) return datosRef.current
    const pks = det?.pks || []
    const nextPks = { ...datosRef.current.pks, [key]: pks }
    const nextRegs = { ...datosRef.current.regs }
    pks.forEach((pk) => {
      const pKey = clavePk(pk.tramo ?? tramo, pk.pk_id)
      nextRegs[pKey] = (pk.registros || []).map((r) => ({
        ...r,
        tramo: claveTramo(pk.tramo ?? tramo),
        pk_id: pk.pk_id,
      }))
    })
    const listo = new Set(datosRef.current.listo)
    listo.add(key)
    datosRef.current = { pks: nextPks, regs: nextRegs, listo }
    setPksByTramo(nextPks)
    setRegsByPk(nextRegs)
    setOpenTramos((prev) => ({ ...prev, [key]: true }))
    return datosRef.current
  }

  const fijarManual = (nivel, key, valor) => {
    setManual((prev) => {
      const mapa = { ...prev[nivel] }
      if (!escrito(valor)) delete mapa[key]
      else mapa[key] = valor
      return { ...prev, [nivel]: mapa }
    })
  }

  const alEscribirPedir = (nivel, tramo, key, valor) => {
    fijarManual(nivel, key, valor)
    if (!escrito(valor) || nivel === 'reg') return
    void asegurarDetalle(tramo).catch((e) => {
      setError(e.message || 'No se pudieron cargar los PK-ID.')
    })
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

  const arbol = useMemo(() => tramos.map((trow) => {
    const tKey = claveTramo(trow.tramo)
    const pks = (pksByTramo[tKey] || []).map((pk) => {
      const pKey = clavePk(pk.tramo ?? trow.tramo, pk.pk_id)
      const regs = (regsByPk[pKey] || []).map((r) => ({
        key: String(r.presupuesto_id),
        saldo: Number(r.saldo_disponible) || 0,
      }))
      return { key: pKey, saldo: Number(pk.saldo_disponible) || 0, regs }
    })
    return { key: tKey, saldo: Number(trow.saldo_disponible) || 0, pks }
  }), [tramos, pksByTramo, regsByPk])

  const reparto = useMemo(() => calcularRepartoManual(arbol, manual), [arbol, manual])

  const hayPedirManual = useMemo(() => (
    ['tramo', 'pk', 'reg'].some((nivel) => (
      Object.values(manual[nivel] || {}).some((v) => Number(v) > 0)
    ))
  ), [manual])

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
    const material = String(descLocal || '').trim()
    if (material.length < 3) {
      setError('Describa el material (mínimo 3 caracteres) antes de generar las líneas.')
      return
    }
    const haySeleccion = Boolean(
      seleccion.tramos.length || seleccion.pks.length || seleccion.registros.length,
    )
    if (!hayPedirManual && !haySeleccion) {
      setError('Escriba una cantidad en Pedir o seleccione un tramo, un PK-ID o un registro.')
      return
    }
    const cant = Number(cantidad)
    if (haySeleccion && !(cant > 0) && !hayPedirManual) {
      setError('Indique una cantidad mayor a cero.')
      return
    }
    setConfirmando(true)
    setError('')
    try {
      const tramosACargar = []
      tramos.forEach((trow) => {
        const tKey = claveTramo(trow.tramo)
        const tocaTramo = escrito(manual.tramo[tKey])
        const tocaPk = (pksByTramo[tKey] || []).some((pk) => (
          escrito(manual.pk[clavePk(pk.tramo ?? trow.tramo, pk.pk_id)])
        ))
        if (tocaTramo || tocaPk) tramosACargar.push(trow.tramo)
      })
      for (const tramo of tramosACargar) {
        await asegurarDetalle(tramo)
      }
      const datos = datosRef.current
      const arbolActual = tramos.map((trow) => {
        const tKey = claveTramo(trow.tramo)
        const pks = (datos.pks[tKey] || []).map((pk) => {
          const pKey = clavePk(pk.tramo ?? trow.tramo, pk.pk_id)
          const regs = (datos.regs[pKey] || []).map((r) => ({
            key: String(r.presupuesto_id),
            saldo: Number(r.saldo_disponible) || 0,
          }))
          return { key: pKey, saldo: Number(pk.saldo_disponible) || 0, regs }
        })
        return { key: tKey, saldo: Number(trow.saldo_disponible) || 0, pks }
      })
      const calc = calcularRepartoManual(arbolActual, manual)
      const esPrincipal = compararCantidadConSaldo(prinLocal)
      const superaManual = ['tramo', 'pk', 'reg'].some((nivel) => (
        Object.entries(calc.excede[nivel] || {}).some(([k, v]) => v && Number(calc.pedir[nivel]?.[k]) > 0)
      ))
      const superaSel = haySeleccion && cant - disponible > 0.0001
      if (esPrincipal && (superaManual || superaSel) && String(obsLocal || '').trim().length < 15) {
        setError('La cantidad supera el saldo disponible. Escriba la justificación (mínimo 15 caracteres) en Observación para poder generarla.')
        setConfirmando(false)
        return
      }
      const plantilla = {
        presupuesto_capitulo: capitulo,
        presupuesto_item: item,
        descripcion_solicitada: material,
        es_principal: prinLocal !== false,
        observacion_residente: obsLocal || '',
      }
      const lineasManual = hayPedirManual
        ? lineasDesdePedido({
          tramos,
          pksByTramo: datos.pks,
          regsByPk: datos.regs,
          pedir: calc.pedir,
          plantilla,
          grupoId: 'pendiente',
          grupoEtiqueta: '',
        })
        : []
      const clavesManual = new Set(lineasManual.map((l) => clavePk(l.tramo, l.pk_id)))
      const grupos = []
      if (haySeleccion && cant > 0) {
        for (const t of seleccion.tramos) {
          const det = await api.getPresupuestoTramoDetalle(
            capitulo, item, t.tramo, excludeSolicitudId, insumoId || undefined,
          )
          for (const pk of det?.pks || []) {
            if (clavesManual.has(clavePk(pk.tramo, pk.pk_id))) continue
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
          if (clavesManual.has(clavePk(p.tramo, p.pk_id))) continue
          let regs = datos.regs[clavePk(p.tramo, p.pk_id)] || regsByPk[clavePk(p.tramo, p.pk_id)]
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
          if (clavesManual.has(clavePk(r.tramo, r.pk_id))) continue
          const key = clavePk(r.tramo, r.pk_id)
          if (!sueltos.has(key)) {
            sueltos.set(key, { pk_id: r.pk_id, tramo: r.tramo, registros: [] })
          }
          sueltos.get(key).registros.push(r)
        }
        sueltos.forEach((g) => grupos.push(g))
      }
      if (!lineasManual.length && !grupos.length) {
        setError(hayPedirManual
          ? 'No hay cantidades mayores a cero para generar líneas.'
          : 'Seleccione un tramo, un PK-ID o al menos un registro.')
        setConfirmando(false)
        return
      }
      const grupoId = nuevoGrupoId()
      const tramosEtiqueta = [
        ...lineasManual.map((l) => l.tramo),
        ...grupos.map((g) => g.tramo),
      ]
      const etiqueta = etiquetaGrupo(tramosEtiqueta, material)
      const lineasSel = grupos.length
        ? crearLineasPorPk({
          cantidad: cant,
          gruposPk: grupos,
          grupoId,
          grupoEtiqueta: etiqueta,
          plantilla,
        }).filter((l) => !clavesManual.has(clavePk(l.tramo, l.pk_id)))
        : []
      const lineas = [
        ...lineasManual.map((l) => ({ ...l, grupo_seleccion: grupoId, grupo_etiqueta: etiqueta })),
        ...lineasSel,
      ]
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
  const esPrincipal = compararCantidadConSaldo(prinLocal)
  const excedeFila = (nivel, key) => esPrincipal && Boolean(reparto.excede[nivel]?.[key])

  const valorPedir = (nivel, key) => {
    const draft = manual[nivel]?.[key]
    if (focoPedir === `${nivel}:${key}` && escrito(draft)) return draft
    const n = reparto.pedir[nivel]?.[key]
    if (n == null) return ''
    return textoCantidad(n)
  }

  const celdaPedir = (nivel, key, tramo, etiqueta) => {
    const excede = excedeFila(nivel, key)
    return (
      <td style={{ ...tdNum, background: excede ? '#fee2e2' : undefined, minWidth: 108 }}>
        <input
          aria-label={`Pedir ${etiqueta}`}
          aria-invalid={excede || undefined}
          title={excede ? 'Supera el saldo. Escriba la justificación en Observación.' : 'Cantidad a pedir'}
          type="number"
          min="0"
          step="any"
          value={valorPedir(nivel, key)}
          disabled={ocupado}
          onFocus={() => setFocoPedir(`${nivel}:${key}`)}
          onBlur={() => setFocoPedir('')}
          onChange={(e) => alEscribirPedir(nivel, tramo, key, e.target.value)}
          style={{ ...ui.input, width: 88, textAlign: 'right', padding: '2px 6px' }}
        />
        {excede ? (
          <div style={{ color: 'var(--cc-color-danger)', fontSize: 10, fontWeight: 700 }}>Supera el saldo</div>
        ) : null}
        {escrito(manual[nivel]?.[key]) ? (
          <button
            type="button"
            style={{ ...ui.btnSecondary, marginTop: 4, padding: '2px 6px', minHeight: 0, fontSize: 10 }}
            disabled={ocupado}
            onClick={() => fijarManual(nivel, key, '')}
          >
            Repartir de nuevo
          </button>
        ) : null}
      </td>
    )
  }

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
            ...estiloAvisoAlmacen(contraste, 'danger'),
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
            <table style={{ ...ui.sheetTable, minWidth: 860 }}>
              <thead>
                <tr>
                  <ExcelHeader abbr="" tip="Seleccionar" style={{ ...th, width: 36 }} />
                  <ExcelHeader abbr="" tip="Expandir" style={{ ...th, width: 36 }} />
                  <ExcelHeader abbr="TRAMO" tip="Tramo con cantidades disponibles del ítem" style={th} />
                  <ExcelHeader abbr="PK" tip="Cantidad de PK-ID del tramo" style={th} align="right" />
                  <ExcelHeader abbr="PPTO" tip="Cantidad presupuestada" style={th} align="right" />
                  <ExcelHeader abbr="ACUM." tip="Cantidad ya solicitada" style={th} align="right" />
                  <ExcelHeader abbr="SALDO" tip="Saldo disponible" style={th} align="right" />
                  <ExcelHeader abbr="Pedir" tip="Cantidad a pedir. En un tramo o PK-ID se reparte según el saldo." style={th} align="right" />
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
                      <tr style={{ background: excedeFila('tramo', tKey) ? '#fee2e2' : (marcado ? ui.accentSoft : undefined) }}>
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
                          {trow.conversion_banco_suelto ? fmtCant2(trow.saldo_disponible) : fmtCant(trow.saldo_disponible)}
                          {trow.conversion_banco_suelto && trow.texto_conversion ? (
                            <div style={{ fontWeight: 500, fontSize: 10, whiteSpace: 'normal', maxWidth: 240, color: ui.textMuted }}>
                              {trow.texto_conversion}
                            </div>
                          ) : null}
                        </td>
                        {celdaPedir('tramo', tKey, trow.tramo, etiquetaTramo(trow.tramo))}
                      </tr>
                      {abierto && loadingKey === `t:${tKey}` && (
                        <tr key={`tload-${tKey}`}>
                          <td colSpan={8} style={{ ...td, color: ui.textMuted }}>Cargando PK-ID…</td>
                        </tr>
                      )}
                      {abierto && pks.map((pk) => {
                        const pKey = clavePk(pk.tramo, pk.pk_id)
                        const pkAbierto = !!openPks[pKey]
                        const regs = regsByPk[pKey] || []
                        const pkOn = pkMarcado(pk.tramo, pk.pk_id)
                        return (
                          <Fragment key={`p-${pKey}`}>
                            <tr style={{ background: excedeFila('pk', pKey) ? '#fee2e2' : (pkOn ? `${ui.accent}10` : undefined) }}>
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
                              <td style={tdNum} title={pk.texto_conversion || ''}>
                                {pk.conversion_banco_suelto ? fmtCant2(pk.saldo_disponible) : fmtCant(pk.saldo_disponible)}
                              </td>
                              {celdaPedir('pk', pKey, pk.tramo, `PK ${pk.pk_id}`)}
                            </tr>
                            {pkAbierto && loadingKey === `p:${pKey}` && (
                              <tr key={`pload-${pKey}`}>
                                <td colSpan={8} style={{ ...td, color: ui.textMuted, paddingLeft: 48 }}>
                                  Cargando registros…
                                </td>
                              </tr>
                            )}
                            {pkAbierto && regs.map((r) => {
                              const on = regMarcado(pk.tramo, pk.pk_id, r.presupuesto_id)
                              return (
                                <tr key={`r-${r.presupuesto_id}`} style={{ background: excedeFila('reg', String(r.presupuesto_id)) ? '#fee2e2' : undefined }}>
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
                                  <td style={tdNum} title={r.texto_conversion || ''}>
                                    {r.conversion_banco_suelto ? fmtCant2(r.saldo_disponible) : fmtCant(r.saldo_disponible)}
                                  </td>
                                  {celdaPedir('reg', String(r.presupuesto_id), pk.tramo, `registro ${r.presupuesto_id}`)}
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
            <strong>{tramos.some((t) => t.conversion_banco_suelto) ? fmtCant2(disponible) : fmtCant(disponible)}</strong>
          </div>
          <label style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
            Cantidad a pedir
            <input
              style={{ ...ui.input, marginTop: 4, width: 140, textAlign: 'right' }}
              type="number"
              min="0"
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
            disabled={ocupado || (!hayPedirManual && !(disponible > 0))}
            onClick={() => { void confirmar() }}
          >
            {confirmando ? 'Generando…' : 'Generar líneas por PK-ID'}
          </button>
        </div>
        <div style={{ marginTop: 8, fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
          Si pide menos que el total, el consumo se reparte entre los PK-ID y sus registros según el saldo de cada uno.
          En Pedir puede escribir la cantidad del tramo, del PK-ID o del registro: se reparte al instante según el saldo y la suma coincide con lo escrito.
          Lo que fije a mano no se vuelve a mover; Repartir de nuevo devuelve ese nivel al reparto automático.
          Si también usa las casillas, la cantidad escrita en la fila manda.
          La alerta «Supera el saldo» y la justificación aplican solo a insumos Principales: si la casilla está marcada y pide más que el saldo, la fila se marca y escriba la justificación en Observación (mínimo 15 caracteres). Un insumo asociado no se compara contra el saldo ni descuenta presupuesto.
          El mapa sigue disponible como camino alterno.
          {tramos.some((t) => t.conversion_pendiente) && !insumoId ? (
            <div style={{ marginTop: 6 }}>
              Saldo sin conversión de banco a suelto: la línea aún no tiene insumo asignado. Se ajustará cuando se asigne el insumo.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
