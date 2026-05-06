import { useEffect, useRef, useState } from 'react'
import { fetchConFallback, formatFetchError } from './fetchConFallback'
import { parseFoacExcelBuffer } from './foacExcelParse'
import { downloadAuditorExcelIndividual, downloadAuditorExcelLote } from './auditorExportExcel'

const HIST_PREFIX = 'cc_auditor_sst_hist_v1_'

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

export default function ModuloAuditorSST({ usuario, t }) {
  const cid = usuario?.contrato_id
  const puedeAuditar = perm(usuario, 'auditor sst (ia)', 'ver')
  const puedeImportar = perm(usuario, 'auditor sst (ia)', 'crear')
  const [tab, setTab] = useState('auditar')
  const [filasExcel, setFilasExcel] = useState([])
  const [selIdx, setSelIdx] = useState(null)
  const [pdfs, setPdfs] = useState([])
  const [modoLote, setModoLote] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [lote, setLote] = useState(null)
  const [hist, setHist] = useState(null)
  const [histCargando, setHistCargando] = useState(false)
  const [err, setErr] = useState('')
  const filePdf = useRef(null)
  const fileXls = useRef(null)
  const fileXlsAuditar = useRef(null)
  const auditorPollRef = useRef(null)
  const [progreso, setProgreso] = useState(null)
  const [claveAuditorDev, setClaveAuditorDev] = useState('')
  const [busyDesbloq, setBusyDesbloq] = useState(false)
  const [gastoResumen, setGastoResumen] = useState(null)
  const [contratoDetalle, setContratoDetalle] = useState(null)
  const selIdxRef = useRef(null)
  const ultimoErrorApiRef = useRef(null)
  selIdxRef.current = selIdx

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

  if (!cid) return <div style={{ color: t.textMuted }}>Selecciona contrato.</div>
  if (!puedeAuditar && !puedeImportar) {
    return <div style={{ color: t.textMuted }}>Sin permiso «Auditor SST (IA)». Activa Ver u Crear en Admin → Control de accesos.</div>
  }

  const card = { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: 16, marginBottom: 12 }

  /** Contexto para encabezado del Excel (colores tema + datos contrato). */
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

  function recordIndividualResult(resp) {
    if (!cid || !resp?.resultado) return
    const idx = selIdxRef.current
    pushLocalHist({
      id: `local-${Date.now()}`,
      created_at: new Date().toISOString(),
      colaborador_nombre: resp.resultado.colaborador_identificado || (idx != null ? filasExcel[idx]?.nombre : '') || '—',
      colaborador_cedula: String(resp.resultado.cedula_identificada || (idx != null ? filasExcel[idx]?.cedula : '') || ''),
      puntuacion: resp.resultado.puntuacion,
      tipo: 'individual',
      snapshot: {
        kind: 'individual',
        payload: resp,
        rosterRow: idx != null ? filasExcel[idx] : null,
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
      setSelIdx(null)
    }
    reader.readAsArrayBuffer(file)
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

  async function auditar() {
    if (!pdfs.length) return
    if (!filasExcel.length) return
    if (!modoLote && selIdx === null) return
    if (auditorPollRef.current) {
      clearTimeout(auditorPollRef.current)
      auditorPollRef.current = null
    }
    const useJobCola = !modoLote && pdfs.length >= 2

    setBusy(true)
    setErr('')
    ultimoErrorApiRef.current = null
    setResultado(null)
    setLote(null)
    setProgreso(null)

    const rosterJson = JSON.stringify(filasExcel)
    const fd = new FormData()
    if (!modoLote) {
      fd.append('colaborador_id', String(selIdx))
      fd.append('origen', 'excel')
      fd.append('personal_excel_json', rosterJson)
    } else {
      fd.append('personal_excel_json', rosterJson)
    }
    pdfs.forEach((f) => fd.append('pdfs', f))

    try {
      if (useJobCola) {
        setProgreso({ pct: 2, msg: 'Iniciando trabajo en segundo plano…' })
        const init = await fetchConFallback(`/sst/${cid}/auditar-individual-job`, { method: 'POST', body: fd })
        if (init?._error) {
          ultimoErrorApiRef.current = init
          setErr(mensajeDetalle(init))
          setBusy(false)
          setProgreso(null)
          return
        }
        const jobId = init.job_id
        if (!jobId) {
          setErr('El servidor no devolvió job_id.')
          setBusy(false)
          setProgreso(null)
          return
        }
        const poll = async () => {
          const st = await fetchConFallback(`/sst/${cid}/auditoria-job/${jobId}`)
          if (st?._error) {
            ultimoErrorApiRef.current = st
            setErr(mensajeDetalle(st))
            setBusy(false)
            setProgreso(null)
            return
          }
          setProgreso({
            pct: Math.min(100, Math.max(0, st.pct ?? 0)),
            msg: st.message || '',
          })
          if (st.status === 'listo') {
            const res = st.result
            setResultado(res)
            recordIndividualResult(res)
            setBusy(false)
            setProgreso(null)
            return
          }
          if (st.status === 'error') {
            ultimoErrorApiRef.current =
              st.error_codigo === 'AUDITOR_LIMITE_GASTO'
                ? { _error: true, status: 403, detail: { message: st.error || '', codigo: st.error_codigo } }
                : null
            setErr(st.error || 'Error en la auditoría.')
            setBusy(false)
            setProgreso(null)
            return
          }
          auditorPollRef.current = setTimeout(poll, 1100)
        }
        auditorPollRef.current = setTimeout(poll, 500)
        return
      }

      const path = modoLote ? `/sst/${cid}/auditar-lote` : `/sst/${cid}/auditar`
      const r = await fetchConFallback(path, { method: 'POST', body: fd })
      if (r?._error) {
        ultimoErrorApiRef.current = r
        setErr(mensajeDetalle(r))
      } else if (modoLote) {
        setLote(r)
        recordLoteResult(r)
      } else {
        setResultado(r)
        recordIndividualResult(r)
      }
    } finally {
      if (!useJobCola) setBusy(false)
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

  const ejecutarDisabled = busy || !pdfs.length || !filasExcel.length || (!modoLote && selIdx === null)
  const ejecutarHint =
    ejecutarDisabled && !busy
      ? !filasExcel.length
        ? 'Carga el Excel FOAC con la nómina (misma plantilla que en Importar).'
        : !pdfs.length
          ? 'Selecciona al menos un PDF.'
          : !modoLote && selIdx === null
            ? 'Selecciona un colaborador de la lista.'
            : ''
      : ''

  return (
    <div style={{ color: t.text, fontSize: 'var(--cc-sm)' }}>
      <h2 style={{ color: t.primary, fontSize: 'var(--cc-h2)' }}>Auditor SST (IA)</h2>
      <p style={{ color: t.textMuted, fontSize: 'var(--cc-label)', marginBottom: 12 }}>
        Auditoría directa con el Excel en memoria y los PDFs. El <strong>historial de sesión</strong> y la{' '}
        <strong>exportación a Excel</strong> funcionan sin migrar tablas a Supabase. Si ejecutas el SQL del módulo SST,
        también verás historial persistido en la nube.
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
            <div style={{ color: t.textMuted, fontSize: 'var(--cc-label)', marginBottom: 6 }}>1. Excel FOAC (nómina para comparar)</div>
            <input
              ref={fileXlsAuditar}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => ingestExcelFile(e.target.files?.[0])}
            />
            {filasExcel.length > 0 && (
              <span style={{ marginLeft: 10, color: t.primary }}>{filasExcel.length} personas</span>
            )}
          </div>
          <label style={{ marginRight: 12 }}>
            <input type="radio" checked={!modoLote} onChange={() => setModoLote(false)} /> Individual
          </label>
          <label>
            <input type="radio" checked={modoLote} onChange={() => setModoLote(true)} /> Lote (máx. 20 PDFs)
          </label>
          {!modoLote && (
            <div style={{ marginTop: 12, maxHeight: 240, overflow: 'auto', border: `1px solid ${t.border}`, borderRadius: 8 }}>
              {filasExcel.length === 0 && <div style={{ padding: 12, color: t.textMuted }}>Carga el Excel para listar colaboradores.</div>}
              {filasExcel.map((p, i) => (
                <div
                  key={`${p.cedula}-${i}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelIdx(i)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setSelIdx(i)
                  }}
                  style={{
                    padding: 8,
                    cursor: 'pointer',
                    background: selIdx === i ? t.primary + '22' : 'transparent',
                  }}
                >
                  {p.nombre} · {p.cedula}
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <div style={{ color: t.textMuted, fontSize: 'var(--cc-label)', marginBottom: 6 }}>2. PDFs del expediente</div>
            <input ref={filePdf} type="file" accept=".pdf" multiple onChange={(e) => setPdfs(Array.from(e.target.files || []))} />
            {pdfs.length > 0 && <div style={{ marginTop: 8 }}>{pdfs.map((f) => f.name).join(', ')}</div>}
          </div>
          {ejecutarHint && <div style={{ marginTop: 10, fontSize: 'var(--cc-label)', color: '#B45309' }}>{ejecutarHint}</div>}
          {modoLote && pdfs.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 'var(--cc-label)', color: t.textMuted, maxWidth: 560, lineHeight: 1.45 }}>
              En <strong>lote</strong> se envía todo en una petición y el servidor procesa cada PDF con IA (puede tardar varios minutos
              con muchos archivos). No cierres la pestaña. Si aparece «Failed to fetch» al usar Vite en local, reinicia{' '}
              <code style={{ fontSize: '0.9em' }}>npm run dev</code> tras actualizar: el proxy ya permite esperas largas (30 min).
            </div>
          )}
          <button
            type="button"
            disabled={ejecutarDisabled}
            onClick={auditar}
            style={{
              marginTop: 16,
              padding: '12px 20px',
              background: ejecutarDisabled ? t.border : t.primary,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: ejecutarDisabled ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? (progreso ? `Procesando… ${progreso.pct}%` : 'Procesando…') : 'Ejecutar'}
          </button>
          {busy && progreso && (
            <div style={{ marginTop: 14, maxWidth: 480 }}>
              <div
                style={{
                  height: 10,
                  borderRadius: 99,
                  background: t.border,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${progreso.pct}%`,
                    background: t.primary,
                    borderRadius: 99,
                    transition: 'width 0.7s ease',
                  }}
                />
              </div>
              <div style={{ marginTop: 6, fontSize: 'var(--cc-label)', color: t.textMuted }}>{progreso.msg}</div>
            </div>
          )}
          {resultado?.meta?.persistido === false && (
            <div style={{ marginTop: 8, color: t.textMuted, fontSize: 'var(--cc-label)' }}>
              Resultado guardado en historial de esta sesión (navegador). Descarga Excel abajo.
            </div>
          )}
          {resultado?.resultado && (
            <>
              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() =>
                    downloadAuditorExcelIndividual(resultado, selIdx != null ? filasExcel[selIdx] : null, ctxExport()).catch((e) =>
                      setErr(String(e?.message || e)),
                    )
                  }
                  style={{ padding: '10px 16px', background: t.primary, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
                >
                  Descargar Excel (resultado)
                </button>
              </div>
              <div style={{ marginTop: 14, padding: 12, borderRadius: 8, border: `1px solid ${t.border}`, background: t.bgCard }}>
                <div style={{ fontSize: 'var(--cc-label)', color: t.textMuted, marginBottom: 6 }}>Resumen</div>
                <div style={{ color: t.text }}>
                  {resultado.resultado.puntuacion != null && resultado.resultado.puntuacion !== '' ? (
                    <strong>Puntuación: {resultado.resultado.puntuacion}%</strong>
                  ) : null}
                  {resultado.resultado.resumen ? (
                    <div style={{ marginTop: 8, fontSize: 'var(--cc-sm)', whiteSpace: 'pre-wrap' }}>{resultado.resultado.resumen}</div>
                  ) : (
                    <div style={{ marginTop: 8, color: t.textMuted, fontSize: 'var(--cc-label)' }}>Descarga el Excel para ver el detalle por campo.</div>
                  )}
                </div>
              </div>
            </>
          )}
          {lote?.resultados && (
            <>
              <div style={{ marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => downloadAuditorExcelLote(lote, ctxExport()).catch((e) => setErr(String(e?.message || e)))}
                  style={{ padding: '10px 16px', background: t.primary, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
                >
                  Descargar Excel (lote)
                </button>
              </div>
              <div style={{ marginTop: 12, fontSize: 'var(--cc-label)', color: t.textMuted }}>
                Procesados {lote.resultados.length} archivo{lote.resultados.length === 1 ? '' : 's'}. El detalle por persona y checklist está en el Excel.
              </div>
            </>
          )}
        </div>
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
                {(hist.historial || []).length === 0 && <div style={{ color: t.textMuted }}>Aún no hay ejecuciones. Realiza una auditoría o ejecuta el SQL en Supabase para historial en nube.</div>}
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
