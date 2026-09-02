import { useCallback, useEffect, useRef, useState } from 'react'
import CcModalBrandHeader from './components/CcModalBrandHeader'
import { fetchConFallback, formatFetchError } from './fetchConFallback'
import { parseFoacExcelBuffer } from './foacExcelParse'
import { downloadAuditorExcelIndividual, downloadAuditorExcelLote } from './auditorExportExcel'

const HIST_PREFIX = 'cc_auditor_sst_hist_v1_'
const REVISADO_PREFIX = 'cc_auditor_sst_revisado_v1_'

function perm(u, n, c) {
  if (!u) return false
  if ((u.cargo_nombre || '').trim().toLowerCase() === 'desarrollador') return true
  const p = (u.permisos || []).find((x) => (x.funcion_nombre || '').toLowerCase() === n)
  return !!(p && p[c])
}

function esCargoDesarrollador(u) {
  return (u?.cargo_nombre || '').trim().toLowerCase() === 'desarrollador'
}

function esRespuestaLimiteAuditor(errObj) {
  if (!errObj?._error || errObj.status !== 403) return false
  const d = errObj.detail
  return !!(d && typeof d === 'object' && d.codigo === 'AUDITOR_LIMITE_GASTO')
}

function mensajeDetalle(errObj) {
  const d = errObj?.detail
  if (d && typeof d === 'object' && d.message) return String(d.message)
  return formatFetchError(errObj)
}

function normCedulaKey(c) {
  const d = String(c ?? '').replace(/\D/g, '')
  return d || String(c ?? '').trim()
}

function conteosHallazgos(hallazgos) {
  let ok = 0
  let disc = 0
  let nf = 0
  for (const h of hallazgos || []) {
    const e = String(h?.estado || '').toUpperCase()
    if (e === 'OK') ok += 1
    else if (e === 'DISCREPANCIA') disc += 1
    else if (e === 'NO ENCONTRADO') nf += 1
  }
  return { ok, disc, nf }
}

function iconoEstadoHallazgo(estado) {
  const e = String(estado || '').toUpperCase()
  if (e === 'OK') return '✅'
  if (e === 'DISCREPANCIA') return '⚠️'
  if (e === 'NO ENCONTRADO') return '❓'
  return '—'
}

function labelEstadoGrilla(merged) {
  if (merged.estado === 'running') return 'Analizando...'
  if (merged.estado === 'error') return '❌ Error'
  if (merged.estado === 'done') return '✅ Completado'
  return 'Sin analizar'
}

/** Combina última fila de Supabase + ejecución local en curso / error. */
function mergeAuditDisplay(cedKey, serverPorCedula, overrideByCedula) {
  const srv = serverPorCedula[cedKey]
  const loc = overrideByCedula[cedKey]
  if (loc?.estado === 'running') {
    return {
      estado: 'running',
      puntuacion: loc.puntuacion ?? (srv?.puntuacion != null ? srv.puntuacion : ''),
      resultadoApi: loc.resultadoApi || (srv?.resultado ? { resultado: srv.resultado, meta: {} } : null),
      errorMsg: loc.errorMsg || '',
    }
  }
  if (loc?.estado === 'error') {
    return {
      estado: 'error',
      puntuacion: '',
      resultadoApi: null,
      errorMsg: loc.errorMsg || 'Error',
    }
  }
  if (loc?.estado === 'done' && loc.resultadoApi) {
    return {
      estado: 'done',
      puntuacion: loc.resultadoApi?.resultado?.puntuacion ?? loc.puntuacion ?? '',
      resultadoApi: loc.resultadoApi,
      errorMsg: '',
    }
  }
  if (srv?.resultado) {
    return {
      estado: 'done',
      puntuacion: srv.puntuacion ?? '',
      resultadoApi: { resultado: srv.resultado, meta: { desde_nube: true } },
      errorMsg: '',
    }
  }
  return { estado: 'idle', puntuacion: '', resultadoApi: null, errorMsg: '' }
}

export default function ModuloAuditorSST({ usuario, t }) {
  const cid = usuario?.contrato_id
  const puedeAuditar = perm(usuario, 'auditor sst (ia)', 'ver')
  const puedeImportar = perm(usuario, 'auditor sst (ia)', 'crear')
  const [tab, setTab] = useState('auditar')
  const [filasExcel, setFilasExcel] = useState([])
  const [pdfByCedula, setPdfByCedula] = useState({})
  const [serverByCedula, setServerByCedula] = useState({})
  const [overrideByCedula, setOverrideByCedula] = useState({})
  const [busyMasivo, setBusyMasivo] = useState(false)
  const [err, setErr] = useState('')
  const [hist, setHist] = useState(null)
  const [histCargando, setHistCargando] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileXls = useRef(null)
  const fileXlsAuditar = useRef(null)
  const auditorPollRef = useRef(null)
  const [progreso, setProgreso] = useState(null)
  const [claveAuditorDev, setClaveAuditorDev] = useState('')
  const [busyDesbloq, setBusyDesbloq] = useState(false)
  const [gastoResumen, setGastoResumen] = useState(null)
  const [contratoDetalle, setContratoDetalle] = useState(null)
  const ultimoErrorApiRef = useRef(null)
  const [modalVer, setModalVer] = useState(null)
  const [expandedCampo, setExpandedCampo] = useState(null)
  const pdfInputRefs = useRef({})
  const [revisadoMap, setRevisadoMap] = useState({})
  const [selectedRowIndices, setSelectedRowIndices] = useState(() => new Set())
  const selectAllCheckboxRef = useRef(null)

  const [legacyModoLote, setLegacyModoLote] = useState(false)
  const [legacySelIdx, setLegacySelIdx] = useState(null)
  const [legacyPdfs, setLegacyPdfs] = useState([])
  const [legacyBusy, setLegacyBusy] = useState(false)
  const [legacyProgreso, setLegacyProgreso] = useState(null)
  const [legacyResultado, setLegacyResultado] = useState(null)
  const [legacyLote, setLegacyLote] = useState(null)
  const legacyFilePdf = useRef(null)
  const legacySelIdxRef = useRef(null)
  legacySelIdxRef.current = legacySelIdx

  useEffect(() => {
    if (!puedeAuditar && puedeImportar) setTab('importar')
  }, [puedeAuditar, puedeImportar])

  useEffect(
    () => () => {
      if (auditorPollRef.current) clearTimeout(auditorPollRef.current)
    },
    [],
  )

  useEffect(() => {
    if (!cid) {
      setContratoDetalle(null)
      return
    }
    let alive = true
    ;(async () => {
      const r = await fetchConFallback(`/contratos/${cid}`)
      if (alive && !r?._error) setContratoDetalle(r)
    })()
    return () => {
      alive = false
    }
  }, [cid])

  const cargarAuditoriasServidor = useCallback(async () => {
    if (!cid || !puedeAuditar) return
    const r = await fetchConFallback(`/sst/${cid}/auditorias-por-cedula`)
    if (r?._error) {
      setServerByCedula({})
      return
    }
    setServerByCedula(r.por_cedula || {})
  }, [cid, puedeAuditar])

  useEffect(() => {
    void cargarAuditoriasServidor()
  }, [cargarAuditoriasServidor])

  useEffect(() => {
    if (!cid) {
      setRevisadoMap({})
      return
    }
    try {
      const raw = localStorage.getItem(`${REVISADO_PREFIX}${cid}`)
      setRevisadoMap(raw ? JSON.parse(raw) : {})
    } catch {
      setRevisadoMap({})
    }
  }, [cid])

  useEffect(() => {
    const el = selectAllCheckboxRef.current
    if (!el) return
    const n = filasExcel.length
    const sel = selectedRowIndices.size
    el.indeterminate = n > 0 && sel > 0 && sel < n
  }, [filasExcel.length, selectedRowIndices])

  if (!cid) return <div style={{ color: t.textMuted }}>Selecciona contrato.</div>
  if (!puedeAuditar && !puedeImportar) {
    return <div style={{ color: t.textMuted }}>Sin permiso «Auditor (IA)». Activa Ver u Crear en Admin → Control de accesos.</div>
  }

  const card = { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: 16, marginBottom: 12 }

  function ctxExport() {
    const u = usuario || {}
    const cn = (u.cargo_nombre || '').trim().toLowerCase()
    let residente =
      (contratoDetalle?.residente_sst_nombre || contratoDetalle?.residente_sst || '').trim() ||
      (contratoDetalle?.datos_residente_sst && String(contratoDetalle.datos_residente_sst)) ||
      ''
    if (!residente && cn.includes('residente') && (cn.includes('sst') || cn.includes('hseq') || cn.includes('seguridad'))) {
      residente = [u.nombre, u.apellidos].filter(Boolean).join(' ').trim() || u.email || residente
    }
    return {
      theme: {
        primary: t.primary || '#0077B6',
        primaryLight: t.primaryLight || t.primary || '#00B4C6',
        bgCard: t.bgCard || '#FFFFFF',
        text: t.text || '#0F2942',
        textMuted: t.textMuted || '#4A7FA5',
        border: t.border || '#BAE6FD',
      },
      contrato: contratoDetalle,
      residenteSst: residente,
      generatedAt: new Date(),
    }
  }

  function histKey() {
    return `${HIST_PREFIX}${cid}`
  }

  function loadLocalHist() {
    try {
      const raw = localStorage.getItem(histKey())
      const arr = raw ? JSON.parse(raw) : []
      return Array.isArray(arr) ? arr : []
    } catch {
      return []
    }
  }

  function pushLocalHist(entry) {
    const arr = loadLocalHist()
    arr.unshift(entry)
    localStorage.setItem(histKey(), JSON.stringify(arr.slice(0, 80)))
  }

  function recordIndividualResult(resp, rowIdx, rosterRow) {
    if (!cid || !resp?.resultado) return
    pushLocalHist({
      id: `local-${Date.now()}`,
      created_at: new Date().toISOString(),
      colaborador_nombre: resp.resultado.colaborador_identificado || rosterRow?.nombre || '—',
      colaborador_cedula: String(resp.resultado.cedula_identificada || rosterRow?.cedula || ''),
      puntuacion: resp.resultado.puntuacion,
      tipo: 'individual',
      snapshot: {
        kind: 'individual',
        payload: resp,
        rosterRow: rosterRow ?? (rowIdx != null ? filasExcel[rowIdx] : null),
      },
    })
  }

  function recordLoteResult(resp) {
    if (!cid || !resp?.resultados) return
    const n = resp.resultados.length
    pushLocalHist({
      id: `local-lote-${Date.now()}`,
      created_at: new Date().toISOString(),
      colaborador_nombre: `Lote (${n} archivo${n === 1 ? '' : 's'})`,
      colaborador_cedula: '',
      puntuacion: '—',
      tipo: 'lote',
      snapshot: { kind: 'lote', payload: resp },
    })
  }

  function ingestExcelFile(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const buf = ev.target.result
      if (!(buf instanceof ArrayBuffer)) return
      const filas = parseFoacExcelBuffer(buf)
      setFilasExcel(filas)
    }
    reader.readAsArrayBuffer(file)
  }

  function ingestExcelAuditar(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const buf = ev.target.result
      if (!(buf instanceof ArrayBuffer)) return
      const filas = parseFoacExcelBuffer(buf)
      setFilasExcel(filas)
      setPdfByCedula({})
      setOverrideByCedula({})
      setSelectedRowIndices(new Set())
      void cargarAuditoriasServidor()
    }
    reader.readAsArrayBuffer(file)
  }

  function marcarResultadosRevisados(cedKey) {
    if (!cid || !cedKey) return
    try {
      const storageKey = `${REVISADO_PREFIX}${cid}`
      const raw = localStorage.getItem(storageKey)
      const obj = raw && typeof raw === 'string' ? JSON.parse(raw) : {}
      obj[cedKey] = true
      localStorage.setItem(storageKey, JSON.stringify(obj))
    } catch {
      /* ignore */
    }
    setRevisadoMap((prev) => ({ ...prev, [cedKey]: true }))
  }

  function abrirModalResultados(payload) {
    marcarResultadosRevisados(payload.cedKey)
    setModalVer(payload)
  }

  function limpiarFilasGrilla(indicesToRemove) {
    const toRemove = indicesToRemove instanceof Set ? indicesToRemove : new Set(indicesToRemove)
    const remaining = filasExcel.filter((_, i) => !toRemove.has(i))
    const remainingKeys = new Set(remaining.map((f) => normCedulaKey(f.cedula)))
    setFilasExcel(remaining)
    setPdfByCedula((prev) => {
      const n = { ...prev }
      Object.keys(n).forEach((k) => {
        if (!remainingKeys.has(k)) delete n[k]
      })
      return n
    })
    setOverrideByCedula((prev) => {
      const n = { ...prev }
      Object.keys(n).forEach((k) => {
        if (!remainingKeys.has(k)) delete n[k]
      })
      return n
    })
    setSelectedRowIndices(new Set())
  }

  function limpiarSeleccionadosOVista() {
    if (selectedRowIndices.size > 0) {
      limpiarFilasGrilla(selectedRowIndices)
      return
    }
    if (!window.confirm('¿Limpiar toda la grilla? Esto no elimina datos de Supabase.')) return
    setFilasExcel([])
    setPdfByCedula({})
    setOverrideByCedula({})
    setSelectedRowIndices(new Set())
  }

  async function cargarHist() {
    setHistCargando(true)
    setErr('')
    const r = await fetchConFallback(`/sst/${cid}/auditorias-historial`)
    const localRows = loadLocalHist().map((h) => ({
      ...h,
      fuente: 'local',
    }))

    let apiRows = []
    let tablasOk = true
    let extraMsg = null

    if (r?._error) {
      tablasOk = false
      extraMsg = formatFetchError(r)
    } else {
      apiRows = (r.historial || []).map((h) => ({ ...h, fuente: 'bd' }))
      tablasOk = r.tablas_disponibles !== false
      if (r.mensaje) extraMsg = r.mensaje
    }

    const merged = [...localRows, ...apiRows].sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
    )
    const esDev = esCargoDesarrollador(usuario)
    const totales = { auditorias: merged.length }
    if (esDev) {
      const costoUsd = merged.reduce((s, x) => s + Number(x.costo_usd || 0), 0)
      const tokens = merged.reduce((s, x) => s + Number(x.tokens_usados || 0), 0)
      totales.costo_usd_total = Math.round(costoUsd * 10000) / 10000
      totales.costo_cop_total = Math.round(costoUsd * 4200)
      totales.tokens_total = tokens
    }

    setHist({
      historial: merged,
      totales,
      tablas_disponibles: tablasOk,
      mensaje: extraMsg,
      aviso_local: localRows.length > 0,
    })
    setHistCargando(false)
  }

  async function cargarGastoResumenDev() {
    if (!esCargoDesarrollador(usuario)) return
    const r = await fetchConFallback('/sst/auditor-gasto-resumen')
    if (!r?._error) setGastoResumen(r)
  }

  async function desbloquearAuditorUso() {
    setBusyDesbloq(true)
    setErr('')
    const r = await fetchConFallback('/sst/auditor-desbloquear', { method: 'POST', body: { clave: claveAuditorDev } })
    setBusyDesbloq(false)
    if (r?._error) {
      setErr(mensajeDetalle(r))
      return
    }
    setClaveAuditorDev('')
    setErr('')
    ultimoErrorApiRef.current = null
    alert(r.mensaje || 'Listo.')
    await cargarGastoResumenDev()
  }

  async function importar() {
    setBusy(true)
    setErr('')
    const r = await fetchConFallback(`/sst/${cid}/importar-excel`, { method: 'POST', body: { filas: filasExcel } })
    setBusy(false)
    if (r?._error) setErr(formatFetchError(r))
    else alert(`Importados: ${r.importados}`)
  }

  const pollAuditorJob = useCallback(
    (jobId, cedKey, rowIdx, fila) =>
      new Promise((resolve, reject) => {
        const poll = async () => {
          const st = await fetchConFallback(`/sst/${cid}/auditoria-job/${jobId}`)
          if (st?._error) {
            reject(st)
            return
          }
          setProgreso({ pct: Math.min(100, Math.max(0, st.pct ?? 0)), msg: st.message || '', cedKey })
          if (st.status === 'listo') {
            const res = st.result
            resolve({ res, cedKey, rowIdx, fila })
            return
          }
          if (st.status === 'error') {
            ultimoErrorApiRef.current =
              st.error_codigo === 'AUDITOR_LIMITE_GASTO'
                ? { _error: true, status: 403, detail: { message: st.error || '', codigo: st.error_codigo } }
                : null
            reject(new Error(st.error || 'Error en la auditoría.'))
            return
          }
          auditorPollRef.current = setTimeout(poll, 1100)
        }
        auditorPollRef.current = setTimeout(poll, 400)
      }),
    [cid],
  )

  const ejecutarAnalisisFila = useCallback(
    async (rowIndex) => {
      const fila = filasExcel[rowIndex]
      if (!fila) return
      const cedKey = normCedulaKey(fila.cedula)
      const files = pdfByCedula[cedKey] || []
      if (!files.length) return
      setErr('')
      ultimoErrorApiRef.current = null
      setOverrideByCedula((o) => ({ ...o, [cedKey]: { ...o[cedKey], estado: 'running', errorMsg: '' } }))
      const rosterJson = JSON.stringify(filasExcel)
      const fd = new FormData()
      fd.append('colaborador_id', String(rowIndex))
      fd.append('origen', 'excel')
      fd.append('personal_excel_json', rosterJson)
      files.forEach((f) => fd.append('pdfs', f))
      try {
        if (files.length >= 2) {
          const init = await fetchConFallback(`/sst/${cid}/auditar-individual-job`, { method: 'POST', body: fd })
          if (init?._error) {
            ultimoErrorApiRef.current = init
            throw new Error(mensajeDetalle(init))
          }
          const jobId = init.job_id
          if (!jobId) throw new Error('El servidor no devolvió job_id.')
          const { res } = await pollAuditorJob(jobId, cedKey, rowIndex, fila)
          setOverrideByCedula((o) => ({
            ...o,
            [cedKey]: {
              estado: 'done',
              resultadoApi: res,
              puntuacion: res?.resultado?.puntuacion,
            },
          }))
          recordIndividualResult(res, rowIndex, fila)
          void cargarAuditoriasServidor()
        } else {
          const r = await fetchConFallback(`/sst/${cid}/auditar`, { method: 'POST', body: fd })
          if (r?._error) {
            ultimoErrorApiRef.current = r
            throw new Error(mensajeDetalle(r))
          }
          setOverrideByCedula((o) => ({
            ...o,
            [cedKey]: {
              estado: 'done',
              resultadoApi: r,
              puntuacion: r?.resultado?.puntuacion,
            },
          }))
          recordIndividualResult(r, rowIndex, fila)
          void cargarAuditoriasServidor()
        }
      } catch (e) {
        const msg = e?.message || String(e)
        setOverrideByCedula((o) => ({ ...o, [cedKey]: { estado: 'error', errorMsg: msg, resultadoApi: null } }))
        setErr(msg)
      } finally {
        if (auditorPollRef.current) {
          clearTimeout(auditorPollRef.current)
          auditorPollRef.current = null
        }
        setProgreso(null)
      }
    },
    [cid, filasExcel, pdfByCedula, pollAuditorJob, cargarAuditoriasServidor],
  )

  async function ejecutarMasivo() {
    if (!filasExcel.length || busyMasivo) return
    setBusyMasivo(true)
    setErr('')
    try {
      for (let i = 0; i < filasExcel.length; i += 1) {
        const fila = filasExcel[i]
        const k = normCedulaKey(fila.cedula)
        const files = pdfByCedula[k] || []
        if (!files.length) continue
        await ejecutarAnalisisFila(i)
      }
    } finally {
      setBusyMasivo(false)
    }
  }

  async function legacyAuditar() {
    if (!legacyPdfs.length || !filasExcel.length) return
    if (!legacyModoLote && legacySelIdx === null) return
    if (auditorPollRef.current) {
      clearTimeout(auditorPollRef.current)
      auditorPollRef.current = null
    }
    const useJobCola = !legacyModoLote && legacyPdfs.length >= 2
    setLegacyBusy(true)
    setErr('')
    ultimoErrorApiRef.current = null
    setLegacyResultado(null)
    setLegacyLote(null)
    setLegacyProgreso(null)
    const rosterJson = JSON.stringify(filasExcel)
    const fd = new FormData()
    if (!legacyModoLote) {
      fd.append('colaborador_id', String(legacySelIdx))
      fd.append('origen', 'excel')
      fd.append('personal_excel_json', rosterJson)
    } else {
      fd.append('personal_excel_json', rosterJson)
    }
    legacyPdfs.forEach((f) => fd.append('pdfs', f))
    try {
      if (useJobCola) {
        setLegacyProgreso({ pct: 2, msg: 'Iniciando trabajo en segundo plano…' })
        const init = await fetchConFallback(`/sst/${cid}/auditar-individual-job`, { method: 'POST', body: fd })
        if (init?._error) {
          ultimoErrorApiRef.current = init
          setErr(mensajeDetalle(init))
          setLegacyBusy(false)
          setLegacyProgreso(null)
          return
        }
        const jobId = init.job_id
        if (!jobId) {
          setErr('El servidor no devolvió job_id.')
          setLegacyBusy(false)
          setLegacyProgreso(null)
          return
        }
        const poll = async () => {
          const st = await fetchConFallback(`/sst/${cid}/auditoria-job/${jobId}`)
          if (st?._error) {
            ultimoErrorApiRef.current = st
            setErr(mensajeDetalle(st))
            setLegacyBusy(false)
            setLegacyProgreso(null)
            return
          }
          setLegacyProgreso({
            pct: Math.min(100, Math.max(0, st.pct ?? 0)),
            msg: st.message || '',
          })
          if (st.status === 'listo') {
            const res = st.result
            setLegacyResultado(res)
            recordIndividualResult(res, legacySelIdxRef.current, filasExcel[legacySelIdxRef.current])
            setLegacyBusy(false)
            setLegacyProgreso(null)
            void cargarAuditoriasServidor()
            return
          }
          if (st.status === 'error') {
            ultimoErrorApiRef.current =
              st.error_codigo === 'AUDITOR_LIMITE_GASTO'
                ? { _error: true, status: 403, detail: { message: st.error || '', codigo: st.error_codigo } }
                : null
            setErr(st.error || 'Error en la auditoría.')
            setLegacyBusy(false)
            setLegacyProgreso(null)
            return
          }
          auditorPollRef.current = setTimeout(poll, 1100)
        }
        auditorPollRef.current = setTimeout(poll, 500)
        return
      }
      const path = legacyModoLote ? `/sst/${cid}/auditar-lote` : `/sst/${cid}/auditar`
      const r = await fetchConFallback(path, { method: 'POST', body: fd })
      if (r?._error) {
        ultimoErrorApiRef.current = r
        setErr(mensajeDetalle(r))
      } else if (legacyModoLote) {
        setLegacyLote(r)
        recordLoteResult(r)
      } else {
        setLegacyResultado(r)
        recordIndividualResult(r, legacySelIdx, filasExcel[legacySelIdx])
      }
      void cargarAuditoriasServidor()
    } finally {
      if (!useJobCola) setLegacyBusy(false)
    }
  }

  function exportarDesdeSnapshot(snap) {
    ;(async () => {
      try {
        if (snap?.kind === 'individual' && snap.payload)
          await downloadAuditorExcelIndividual(snap.payload, snap.rosterRow ?? null, ctxExport())
        else if (snap?.kind === 'lote' && snap.payload) await downloadAuditorExcelLote(snap.payload, ctxExport())
      } catch (e) {
        setErr(String(e?.message || e))
      }
    })()
  }

  function limpiarHistorialLocal() {
    if (!window.confirm('¿Borrar el historial de auditorías guardado solo en este navegador?')) return
    localStorage.removeItem(histKey())
    cargarHist()
  }

  const legacyEjecutarDisabled =
    legacyBusy || !legacyPdfs.length || !filasExcel.length || (!legacyModoLote && legacySelIdx === null)

  const th = {
    padding: '10px 8px',
    textAlign: 'left',
    fontSize: 'var(--cc-caption)',
    fontWeight: 700,
    color: t.textMuted,
    borderBottom: `1.5px solid ${t.border}`,
    background: t.bg,
  }
  const td = {
    padding: '8px',
    fontSize: 'var(--cc-sm)',
    color: t.text,
    borderBottom: `1px solid ${t.border}`,
    verticalAlign: 'middle',
  }

  const masivoPosible = filasExcel.some((f) => {
    const k = normCedulaKey(f.cedula)
    return (pdfByCedula[k] || []).length > 0
  })

  return (
    <div style={{ color: t.text, fontSize: 'var(--cc-sm)' }}>
      <h2 style={{ color: t.primary, fontSize: 'var(--cc-h2)' }}>Auditor (IA)</h2>
      <p style={{ color: t.textMuted, fontSize: 'var(--cc-label)', marginBottom: 12 }}>
        Compare la nómina FOAC con PDFs por colaborador. Los resultados completos se guardan en Supabase cuando la tabla{' '}
        <code style={{ fontSize: 'var(--cc-caption)' }}>sst_auditorias</code> incluye <code style={{ fontSize: 'var(--cc-caption)' }}>resultado_json</code>{' '}
        (ejecute el SQL de migración si aún no lo hizo). El historial local y la exportación a Excel siguen disponibles.
      </p>
      {err && (
        <div style={{ ...card, background: '#FEF2F2', color: '#B91C1C', whiteSpace: 'pre-wrap' }}>
          <div>{err}</div>
          {esRespuestaLimiteAuditor(ultimoErrorApiRef.current) && esCargoDesarrollador(usuario) && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${t.border}` }}>
              <div style={{ fontSize: 'var(--cc-label)', marginBottom: 8, color: '#444' }}>
                Autorización (desarrollador): introduce la clave configurada en el servidor (<code>AUDITOR_DEV_CLAVE</code>) y reinicia el
                contador de uso.
              </div>
              <input
                type="password"
                value={claveAuditorDev}
                onChange={(e) => setClaveAuditorDev(e.target.value)}
                placeholder="Clave"
                style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${t.border}`, width: 'min(320px, 100%)', marginRight: 8 }}
              />
              <button
                type="button"
                disabled={busyDesbloq || !claveAuditorDev.trim()}
                onClick={desbloquearAuditorUso}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: t.primary,
                  color: '#fff',
                  cursor: busyDesbloq ? 'wait' : 'pointer',
                }}
              >
                {busyDesbloq ? 'Comprobando…' : 'Autorizar y continuar'}
              </button>
            </div>
          )}
          {esRespuestaLimiteAuditor(ultimoErrorApiRef.current) && !esCargoDesarrollador(usuario) && (
            <div style={{ marginTop: 12, fontSize: 'var(--cc-label)', color: '#444' }}>
              Pide a un usuario con cargo <strong>Desarrollador</strong> que autorice el uso desde su cuenta.
            </div>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {['auditar', 'importar', 'historial'].map((k) => (
          <button
            key={k}
            type="button"
            disabled={k === 'importar' && !puedeImportar}
            onClick={() => {
              setTab(k)
              if (k === 'historial') {
                cargarHist()
                cargarGastoResumenDev()
              }
            }}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: `1px solid ${tab === k ? t.primary : t.border}`,
              background: tab === k ? t.primary + '22' : 'transparent',
              color: tab === k ? t.primary : t.textMuted,
              cursor: 'pointer',
            }}
          >
            {k === 'auditar' ? 'Auditar' : k === 'importar' ? 'Importar' : 'Historial'}
          </button>
        ))}
      </div>

      {tab === 'importar' && puedeImportar && (
        <div style={card}>
          <input ref={fileXls} type="file" accept=".xlsx,.xls" onChange={(e) => ingestExcelFile(e.target.files?.[0])} />
          {filasExcel.length > 0 && (
            <button type="button" disabled={busy} onClick={importar} style={{ marginTop: 12, padding: '10px 16px', background: t.primary, color: '#fff', border: 'none', borderRadius: 8 }}>
              Importar {filasExcel.length} filas a Supabase
            </button>
          )}
          <p style={{ marginTop: 12, color: t.textMuted, fontSize: 'var(--cc-label)' }}>Opcional: persiste la nómina cuando la BD tenga las tablas SST.</p>
        </div>
      )}

      {tab === 'auditar' && puedeAuditar && (
        <div style={card}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: t.textMuted, fontSize: 'var(--cc-label)', marginBottom: 6 }}>Excel FOAC (nómina)</div>
            <input ref={fileXlsAuditar} type="file" accept=".xlsx,.xls" onChange={(e) => ingestExcelAuditar(e.target.files?.[0])} />
            {filasExcel.length > 0 && (
              <span style={{ marginLeft: 10, color: t.primary }}>{filasExcel.length} personas</span>
            )}
          </div>

          {filasExcel.length > 0 && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                <button
                  type="button"
                  disabled={busyMasivo || !masivoPosible}
                  onClick={() => void ejecutarMasivo()}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 8,
                    border: 'none',
                    background: busyMasivo || !masivoPosible ? t.border : t.primary,
                    color: '#fff',
                    fontWeight: 700,
                    cursor: busyMasivo || !masivoPosible ? 'not-allowed' : 'pointer',
                    fontSize: 'var(--cc-label)',
                  }}
                >
                  {busyMasivo ? 'Ejecutando masivo…' : '▶▶ Ejecutar análisis masivo'}
                </button>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: filasExcel.length ? 'pointer' : 'not-allowed',
                    fontSize: 'var(--cc-caption)',
                    color: t.textMuted,
                  }}
                >
                  <input
                    ref={selectAllCheckboxRef}
                    type="checkbox"
                    disabled={!filasExcel.length}
                    checked={filasExcel.length > 0 && selectedRowIndices.size === filasExcel.length}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedRowIndices(new Set(filasExcel.map((_, idx) => idx)))
                      else setSelectedRowIndices(new Set())
                    }}
                  />
                  Seleccionar todos
                </label>
                <button
                  type="button"
                  onClick={limpiarSeleccionadosOVista}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: `1px solid ${t.border}`,
                    background: t.bgCard,
                    color: t.text,
                    cursor: 'pointer',
                    fontSize: 'var(--cc-caption)',
                    fontWeight: 600,
                  }}
                >
                  🗑 Limpiar seleccionados
                </button>
                <span style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>Solo filas con PDF cargado. Secuencial para estabilidad.</span>
              </div>

              {progreso?.cedKey && (
                <div style={{ marginBottom: 12, maxWidth: 480 }}>
                  <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginBottom: 4 }}>
                    Cola IA… {progreso.msg}
                  </div>
                  <div style={{ height: 8, borderRadius: 99, background: t.border, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${progreso.pct}%`, background: t.primary, transition: 'width 0.5s ease' }} />
                  </div>
                </div>
              )}

              <div style={{ overflowX: 'auto', border: `1px solid ${t.border}`, borderRadius: 10, background: t.bg }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, width: 44, textAlign: 'center' }} aria-label="Seleccionar fila" />
                      <th style={th}>Número</th>
                      <th style={th}>Cédula</th>
                      <th style={th}>Nombre</th>
                      <th style={th}>Empresa</th>
                      <th style={th}>Cargo</th>
                      <th style={th}>Estado</th>
                      <th style={th}>Puntuación</th>
                      <th style={th}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasExcel.map((fila, i) => {
                      const cedKey = normCedulaKey(fila.cedula)
                      const merged = mergeAuditDisplay(cedKey, serverByCedula, overrideByCedula)
                      const pdfsRow = pdfByCedula[cedKey] || []
                      const tienePdf = pdfsRow.length > 0
                      const puedeAnalizar = tienePdf && merged.estado !== 'running' && !busyMasivo
                      const verOk = merged.estado === 'done' && merged.resultadoApi
                      const n = Number(merged.puntuacion)
                      const pct =
                        merged.puntuacion !== '' && merged.puntuacion != null && Number.isFinite(n)
                          ? `${n}%`
                          : '—'
                      const completado = merged.estado === 'done'
                      const yaRevisado = !!revisadoMap[cedKey]
                      const filaResaltada = completado && !yaRevisado
                      const rowBg = filaResaltada ? '#fffbeb' : 'transparent'
                      return (
                        <tr key={`${cedKey}-${i}`} style={{ background: rowBg }}>
                          <td style={{ ...td, textAlign: 'center', width: 44 }}>
                            <input
                              type="checkbox"
                              checked={selectedRowIndices.has(i)}
                              onChange={() => {
                                setSelectedRowIndices((prev) => {
                                  const n = new Set(prev)
                                  if (n.has(i)) n.delete(i)
                                  else n.add(i)
                                  return n
                                })
                              }}
                              aria-label={`Seleccionar fila ${i + 1}`}
                            />
                          </td>
                          <td style={td}>{fila.numero || '—'}</td>
                          <td style={td}>{fila.cedula || '—'}</td>
                          <td style={td}>{fila.nombre || '—'}</td>
                          <td style={td}>{fila.empresa || '—'}</td>
                          <td style={td}>{fila.cargo || '—'}</td>
                          <td style={td}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontWeight: 600 }}>{labelEstadoGrilla(merged)}</span>
                              {completado &&
                                (yaRevisado ? (
                                  <span
                                    style={{
                                      padding: '3px 10px',
                                      borderRadius: 8,
                                      fontSize: 'var(--cc-caption)',
                                      fontWeight: 700,
                                      background: '#dcfce7',
                                      color: '#166534',
                                      border: `1px solid #bbf7d0`,
                                    }}
                                  >
                                    ✅ Revisado
                                  </span>
                                ) : (
                                  <span
                                    style={{
                                      padding: '3px 10px',
                                      borderRadius: 8,
                                      fontSize: 'var(--cc-caption)',
                                      fontWeight: 700,
                                      background: '#fef3c7',
                                      color: '#a16207',
                                      border: `1px solid #fde68a`,
                                    }}
                                  >
                                    ⚪ Pendiente revisar
                                  </span>
                                ))}
                            </div>
                            {merged.estado === 'error' && merged.errorMsg && (
                              <div style={{ fontSize: 'var(--cc-caption)', color: '#B91C1C', marginTop: 4 }}>{merged.errorMsg}</div>
                            )}
                          </td>
                          <td style={{ ...td, fontWeight: 700 }}>{pct}</td>
                          <td style={{ ...td, whiteSpace: 'nowrap' }}>
                            <input
                              ref={(el) => {
                                pdfInputRefs.current[cedKey] = el
                              }}
                              type="file"
                              accept="application/pdf,.pdf"
                              multiple
                              style={{ display: 'none' }}
                              onChange={(e) => {
                                const fs = Array.from(e.target.files || [])
                                setPdfByCedula((p) => ({ ...p, [cedKey]: fs }))
                                e.target.value = ''
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => pdfInputRefs.current[cedKey]?.click()}
                              style={{
                                marginRight: 6,
                                padding: '6px 10px',
                                borderRadius: 8,
                                border: `1px solid ${t.border}`,
                                background: t.bgCard,
                                cursor: 'pointer',
                                fontSize: 'var(--cc-caption)',
                              }}
                            >
                              📎 Cargar PDF
                            </button>
                            {tienePdf && (
                              <span style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, display: 'block', marginTop: 4 }}>
                                {pdfsRow.map((x) => x.name).join(', ')}
                              </span>
                            )}
                            <button
                              type="button"
                              disabled={!puedeAnalizar}
                              onClick={() => void ejecutarAnalisisFila(i)}
                              style={{
                                marginTop: 6,
                                marginRight: 6,
                                padding: '6px 10px',
                                borderRadius: 8,
                                border: 'none',
                                background: puedeAnalizar ? t.primary : t.border,
                                color: '#fff',
                                cursor: puedeAnalizar ? 'pointer' : 'not-allowed',
                                fontSize: 'var(--cc-caption)',
                                fontWeight: 700,
                              }}
                            >
                              ▶ Analizar
                            </button>
                            {verOk && (
                              <button
                                type="button"
                                onClick={() =>
                                  abrirModalResultados({
                                    cedKey,
                                    fila,
                                    resultadoApi: merged.resultadoApi,
                                  })
                                }
                                style={{
                                  marginTop: 6,
                                  padding: '6px 10px',
                                  borderRadius: 8,
                                  border: `1px solid ${t.primary}`,
                                  background: `${t.primary}18`,
                                  color: t.primary,
                                  cursor: 'pointer',
                                  fontSize: 'var(--cc-caption)',
                                  fontWeight: 700,
                                }}
                              >
                                👁 Ver resultados
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <details style={{ marginTop: 20 }}>
            <summary style={{ cursor: 'pointer', color: t.textMuted, fontSize: 'var(--cc-label)', fontWeight: 600 }}>
              Modo clásico — lista + lote de PDFs (sin asignar por fila)
            </summary>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${t.border}` }}>
              <label style={{ marginRight: 12 }}>
                <input type="radio" checked={!legacyModoLote} onChange={() => setLegacyModoLote(false)} /> Individual
              </label>
              <label>
                <input type="radio" checked={legacyModoLote} onChange={() => setLegacyModoLote(true)} /> Lote (máx. 20 PDFs)
              </label>
              {!legacyModoLote && (
                <div style={{ marginTop: 12, maxHeight: 200, overflow: 'auto', border: `1px solid ${t.border}`, borderRadius: 8 }}>
                  {filasExcel.length === 0 && <div style={{ padding: 12, color: t.textMuted }}>Cargue el Excel arriba.</div>}
                  {filasExcel.map((p, idx) => (
                    <div
                      key={`leg-${p.cedula}-${idx}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setLegacySelIdx(idx)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setLegacySelIdx(idx)
                      }}
                      style={{
                        padding: 8,
                        cursor: 'pointer',
                        background: legacySelIdx === idx ? t.primary + '22' : 'transparent',
                      }}
                    >
                      {p.nombre} · {p.cedula}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 12 }}>
                <div style={{ color: t.textMuted, fontSize: 'var(--cc-label)', marginBottom: 6 }}>PDFs</div>
                <input ref={legacyFilePdf} type="file" accept=".pdf" multiple onChange={(e) => setLegacyPdfs(Array.from(e.target.files || []))} />
                {legacyPdfs.length > 0 && <div style={{ marginTop: 8 }}>{legacyPdfs.map((f) => f.name).join(', ')}</div>}
              </div>
              <button
                type="button"
                disabled={legacyEjecutarDisabled}
                onClick={() => void legacyAuditar()}
                style={{
                  marginTop: 14,
                  padding: '10px 18px',
                  background: legacyEjecutarDisabled ? t.border : t.primary,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  cursor: legacyEjecutarDisabled ? 'not-allowed' : 'pointer',
                  fontWeight: 700,
                }}
              >
                {legacyBusy ? (legacyProgreso ? `Procesando… ${legacyProgreso.pct}%` : 'Procesando…') : 'Ejecutar (clásico)'}
              </button>
              {legacyBusy && legacyProgreso && (
                <div style={{ marginTop: 10, maxWidth: 420 }}>
                  <div style={{ height: 8, borderRadius: 99, background: t.border, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${legacyProgreso.pct}%`, background: t.primary }} />
                  </div>
                  <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginTop: 4 }}>{legacyProgreso.msg}</div>
                </div>
              )}
              {legacyResultado?.resultado && (
                <div style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={() =>
                      downloadAuditorExcelIndividual(legacyResultado, legacySelIdx != null ? filasExcel[legacySelIdx] : null, ctxExport()).catch(
                        (e) => setErr(String(e?.message || e)),
                      )
                    }
                    style={{ padding: '8px 14px', background: t.primary, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
                  >
                    Descargar Excel (resultado)
                  </button>
                </div>
              )}
              {legacyLote?.resultados && (
                <div style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={() => downloadAuditorExcelLote(legacyLote, ctxExport()).catch((e) => setErr(String(e?.message || e)))}
                    style={{ padding: '8px 14px', background: t.primary, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
                  >
                    Descargar Excel (lote)
                  </button>
                </div>
              )}
            </div>
          </details>
        </div>
      )}

      {modalVer && (
        <ModalResultadoAuditor
          t={t}
          card={card}
          modalVer={modalVer}
          onClose={() => {
            setModalVer(null)
            setExpandedCampo(null)
          }}
          ctxExport={ctxExport}
          expandedCampo={expandedCampo}
          setExpandedCampo={setExpandedCampo}
          onPdfSelectedForRecarga={(files) => {
            if (!modalVer) return
            const ck = modalVer.cedKey
            const fs = Array.from(files || [])
            if (!fs.length) return
            setPdfByCedula((p) => ({ ...p, [ck]: fs }))
            const idx = filasExcel.findIndex((f) => normCedulaKey(f.cedula) === ck)
            setModalVer(null)
            if (idx >= 0) void ejecutarAnalisisFila(idx)
          }}
        />
      )}

      {tab === 'historial' && puedeAuditar && (
        <div style={card}>
          {histCargando && <div style={{ color: t.textMuted }}>Cargando historial…</div>}
          {!histCargando && hist && (
            <>
              {hist.tablas_disponibles === false && (
                <div style={{ marginBottom: 12, padding: 12, background: `${t.primary}18`, borderRadius: 8, color: t.text, fontSize: 'var(--cc-label)' }}>
                  {hist.mensaje ||
                    'Las tablas de auditoría aún no están en Supabase. Las filas «navegador» son análisis recientes en este equipo.'}
                </div>
              )}
              {hist.aviso_local && hist.tablas_disponibles !== false && (
                <div style={{ marginBottom: 12, fontSize: 'var(--cc-label)', color: t.textMuted }}>
                  Incluye ejecuciones guardadas en este navegador y, si aplica, en la base de datos.
                </div>
              )}
              {esCargoDesarrollador(usuario) && gastoResumen && (
                <div
                  style={{
                    marginBottom: 12,
                    padding: 12,
                    background: `${t.primary}12`,
                    borderRadius: 8,
                    fontSize: 'var(--cc-label)',
                    color: t.text,
                  }}
                >
                  Gasto acumulado (API, USD): {gastoResumen.acumulado_usd} / tope {gastoResumen.cap_usd}
                  {gastoResumen.bloqueado ? ' · bloqueado hasta autorizar' : ''}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <div>
                  {esCargoDesarrollador(usuario) ? (
                    <>
                      Total USD aprox (historial listado): {hist.totales?.costo_usd_total ?? '—'} · COP ~
                      {hist.totales?.costo_cop_total ?? '—'} · tokens {hist.totales?.tokens_total ?? '—'} · ejecuciones{' '}
                      {hist.totales?.auditorias ?? 0}
                    </>
                  ) : (
                    <>Ejecuciones en lista: {hist.totales?.auditorias ?? 0}</>
                  )}
                </div>
                <button
                  type="button"
                  onClick={limpiarHistorialLocal}
                  style={{ padding: '6px 12px', border: `1px solid ${t.border}`, borderRadius: 8, background: 'transparent', color: t.textMuted, cursor: 'pointer' }}
                >
                  Borrar historial local
                </button>
              </div>
              <div style={{ maxHeight: 420, overflow: 'auto' }}>
                {(hist.historial || []).length === 0 && <div style={{ color: t.textMuted }}>Aún no hay ejecuciones.</div>}
                {(hist.historial || []).slice(0, 100).map((h) => (
                  <div
                    key={`${h.fuente || 'bd'}-${h.id}`}
                    style={{ borderBottom: `1px solid ${t.border}`, padding: '10px 0', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}
                  >
                    <span style={{ flex: 1, minWidth: 200 }}>
                      <span style={{ color: t.textMuted, fontSize: 'var(--cc-label)' }}>{h.fuente === 'local' ? 'Navegador' : 'Nube'}</span>
                      {' · '}
                      {h.created_at} · {h.colaborador_nombre} · {h.puntuacion}%
                      {esCargoDesarrollador(usuario) && (
                        <>
                          {' '}
                          · ${h.costo_usd != null && h.costo_usd !== '' ? h.costo_usd : '—'}
                        </>
                      )}
                    </span>
                    {h.snapshot && (
                      <button
                        type="button"
                        onClick={() => exportarDesdeSnapshot(h.snapshot)}
                        style={{ padding: '6px 12px', background: t.primary, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 'var(--cc-label)' }}
                      >
                        Excel
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ModalResultadoAuditor({
  t,
  card,
  modalVer,
  onClose,
  ctxExport,
  expandedCampo,
  setExpandedCampo,
  onPdfSelectedForRecarga,
}) {
  const recargaInputRef = useRef(null)
  const res = modalVer?.resultadoApi?.resultado || {}
  const nombre = res.colaborador_identificado || modalVer.fila?.nombre || '—'
  const cedula = res.cedula_identificada || modalVer.fila?.cedula || '—'
  const empresa = modalVer.fila?.empresa || '—'
  const pun = Number(res.puntuacion)
  const punOk = Number.isFinite(pun)
  const punColor =
    !punOk ? { bg: t.bg, fg: t.textMuted } : pun >= 80 ? { bg: '#dcfce7', fg: '#166534' } : pun >= 60 ? { bg: '#fef9c3', fg: '#a16207' } : { bg: '#fee2e2', fg: '#b91c1c' }
  const hall = res.hallazgos || []
  const { ok, disc, nf } = conteosHallazgos(hall)
  const alertas = res.alertas_criticas || []
  const conclusion = res.conclusion || res.resumen || ''

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{
          ...card,
          maxWidth: 920,
          width: '100%',
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          marginBottom: 0,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <CcModalBrandHeader theme={t} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'var(--cc-md)', fontWeight: 800, color: t.text }}>{nombre}</div>
            <div style={{ fontSize: 'var(--cc-label)', color: t.textMuted, marginTop: 4 }}>
              CC {cedula} · {empresa}
            </div>
            <div
              style={{
                marginTop: 10,
                display: 'inline-block',
                padding: '8px 14px',
                borderRadius: 10,
                fontWeight: 800,
                fontSize: 'var(--cc-label)',
                background: punColor.bg,
                color: punColor.fg,
              }}
            >
              Puntuación: {punOk ? `${pun}%` : '—'}
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 'var(--cc-lg)', cursor: 'pointer', color: t.textMuted }}>
            ✕
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
          <div style={{ padding: 12, borderRadius: 10, border: `1px solid ${t.border}`, background: t.bg, marginBottom: 12 }}>
            <div style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted, marginBottom: 8 }}>Resumen</div>
            <div style={{ fontSize: 'var(--cc-sm)', color: t.text, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{conclusion || '—'}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              <span style={{ padding: '4px 10px', borderRadius: 8, background: '#dcfce7', color: '#166534', fontWeight: 700, fontSize: 'var(--cc-caption)' }}>OK: {ok}</span>
              <span style={{ padding: '4px 10px', borderRadius: 8, background: '#fef3c7', color: '#b45309', fontWeight: 700, fontSize: 'var(--cc-caption)' }}>Discrepancia: {disc}</span>
              <span style={{ padding: '4px 10px', borderRadius: 8, background: '#e2e8f0', color: '#475569', fontWeight: 700, fontSize: 'var(--cc-caption)' }}>No encontrado: {nf}</span>
            </div>
          </div>

          {alertas.length > 0 && (
            <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', fontSize: 'var(--cc-sm)', fontWeight: 600 }}>
              <div style={{ marginBottom: 6 }}>Alertas críticas</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {alertas.map((a, i) => (
                  <li key={i}>{typeof a === 'string' ? a : JSON.stringify(a)}</li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted, marginBottom: 8 }}>Detalle por campo</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)' }}>
            <thead>
              <tr style={{ background: t.bg }}>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: `1px solid ${t.border}` }}>Campo</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: `1px solid ${t.border}` }}>Estado</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: `1px solid ${t.border}` }}>Valor sistema</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: `1px solid ${t.border}` }}>Valor documento</th>
                <th style={{ width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {hall.map((h, idx) => {
                const key = `${h.campo}-${idx}`
                const exp = expandedCampo === key
                return (
                  <FragmentRow key={key} h={h} exp={exp} onToggle={() => setExpandedCampo(exp ? null : key)} t={t} />
                )
              })}
            </tbody>
          </table>
        </div>

        <input
          ref={recargaInputRef}
          type="file"
          accept=".pdf"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            onPdfSelectedForRecarga(e.target.files)
            e.target.value = ''
          }}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTop: `1px solid ${t.border}` }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              onClick={() =>
                downloadAuditorExcelIndividual(modalVer.resultadoApi, modalVer.fila, ctxExport()).catch(() => {})
              }
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: `1px solid ${t.border}`,
                background: 'transparent',
                color: t.textMuted,
                cursor: 'pointer',
                fontSize: 'var(--cc-caption)',
              }}
            >
              Descargar Excel
            </button>
            <button
              type="button"
              onClick={() => recargaInputRef.current?.click()}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: `1px solid ${t.primary}`,
                background: `${t.primary}12`,
                color: t.primary,
                cursor: 'pointer',
                fontSize: 'var(--cc-caption)',
                fontWeight: 700,
              }}
            >
              📎 Recargar PDF y reanalizar
            </button>
          </div>
          <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, background: t.primary, color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

function FragmentRow({ h, exp, onToggle, t }) {
  return (
    <>
      <tr style={{ background: exp ? `${t.primary}08` : 'transparent' }}>
        <td style={{ padding: 8, borderBottom: `1px solid ${t.border}`, fontWeight: 600 }}>{h.campo || '—'}</td>
        <td style={{ padding: 8, borderBottom: `1px solid ${t.border}` }}>
          {iconoEstadoHallazgo(h.estado)} {h.estado || '—'}
        </td>
        <td style={{ padding: 8, borderBottom: `1px solid ${t.border}`, maxWidth: 180, wordBreak: 'break-word' }}>{h.valor_bd ?? '—'}</td>
        <td style={{ padding: 8, borderBottom: `1px solid ${t.border}`, maxWidth: 180, wordBreak: 'break-word' }}>{h.valor_pdf ?? '—'}</td>
        <td style={{ padding: 8, borderBottom: `1px solid ${t.border}` }}>
          <button type="button" onClick={onToggle} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: t.primary }}>
            {exp ? '▾' : '▸'}
          </button>
        </td>
      </tr>
      {exp && (
        <tr>
          <td colSpan={5} style={{ padding: '10px 12px 14px', borderBottom: `1px solid ${t.border}`, background: t.bg, fontSize: 'var(--cc-caption)', color: t.text, lineHeight: 1.5 }}>
            <strong>Detalle:</strong> {h.detalle || '—'}
          </td>
        </tr>
      )}
    </>
  )
}
