import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { fetchConFallback, formatFetchError } from './fetchConFallback'

function perm(u, n, c) {
  if (!u) return false
  if ((u.cargo_nombre || '').toLowerCase() === 'desarrollador') return true
  const p = (u.permisos || []).find((x) => (x.funcion_nombre || '').toLowerCase() === n)
  return !!(p && p[c])
}

export default function ModuloAuditorSST({ usuario, t }) {
  const cid = usuario?.contrato_id
  const puedeAuditar = perm(usuario, 'auditor sst (ia)', 'ver')
  const puedeImportar = perm(usuario, 'auditor sst (ia)', 'crear')
  const [tab, setTab] = useState('auditar')
  const [personal, setPersonal] = useState([])
  const [fuente, setFuente] = useState('bd')
  const [sel, setSel] = useState(null)
  const [pdfs, setPdfs] = useState([])
  const [modoLote, setModoLote] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [lote, setLote] = useState(null)
  const [hist, setHist] = useState(null)
  const [histCargando, setHistCargando] = useState(false)
  const [err, setErr] = useState('')
  const [filasExcel, setFilasExcel] = useState([])
  const filePdf = useRef(null)
  const fileXls = useRef(null)

  useEffect(() => {
    if (!puedeAuditar && puedeImportar) setTab('importar')
  }, [puedeAuditar, puedeImportar])

  async function cargarPersonal() {
    const r = await fetchConFallback(`/sst/${cid}/personal-auditoria`)
    if (r?._error) {
      setErr(formatFetchError(r))
      return
    }
    if (r.personal) {
      setPersonal(r.personal)
      setFuente(r.fuente || 'bd')
    }
  }

  async function cargarHist() {
    setHistCargando(true)
    setErr('')
    const r = await fetchConFallback(`/sst/${cid}/auditorias-historial`)
    setHistCargando(false)
    if (r?._error) setErr(formatFetchError(r))
    else setHist(r)
  }

  useEffect(() => {
    if (cid && puedeAuditar) cargarPersonal()
  }, [cid, puedeAuditar])

  if (!cid) return <div style={{ color: t.textMuted }}>Selecciona contrato.</div>
  if (!puedeAuditar && !puedeImportar) {
    return <div style={{ color: t.textMuted }}>Sin permiso «Auditor SST (IA)». Activa Ver u Crear en Admin → Control de accesos.</div>
  }

  const card = { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: 16, marginBottom: 12 }

  function handleExcel(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: 'array', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      const COL_MAP = {
        0: 'numero',
        1: 'empresa',
        4: 'tipo_contrato',
        7: 'nombre',
        12: 'cedula',
        16: 'edad',
        18: 'sexo',
        20: 'localidad_residencia',
        23: 'cargo',
        26: 'fecha_ingreso',
        28: 'fecha_retiro',
        30: 'arl',
        32: 'clase_riesgo_arl',
        33: 'fecha_afiliacion_arl',
        35: 'eps',
        37: 'afp',
        39: 'fecha_examen_ingreso',
        41: 'fecha_examen_periodico',
        44: 'fecha_examen_egreso',
        46: 'concepto_medico',
      }
      const filas = []
      raw.forEach((row) => {
        const num = row[0]
        const nombre = row[7]
        if (num && String(num).trim().match(/^\d+$/) && nombre && String(nombre).trim().length > 3) {
          const obj = {}
          Object.entries(COL_MAP).forEach(([idx, campo]) => {
            let v = row[parseInt(idx, 10)]
            if (v instanceof Date) v = v.toLocaleDateString('es-CO')
            obj[campo] = v !== undefined && v !== null && String(v).trim() !== '' ? String(v).trim() : null
          })
          filas.push(obj)
        }
      })
      setFilasExcel(filas)
    }
    reader.readAsArrayBuffer(file)
  }

  async function importar() {
    setBusy(true)
    setErr('')
    const r = await fetchConFallback(`/sst/${cid}/importar-excel`, { method: 'POST', body: { filas: filasExcel } })
    setBusy(false)
    if (r?._error) setErr(formatFetchError(r))
    else {
      alert(`Importados: ${r.importados}`)
      cargarPersonal()
    }
  }

  async function auditar() {
    if (!pdfs.length) return
    if (!modoLote && !sel) return
    setBusy(true)
    setErr('')
    setResultado(null)
    setLote(null)
    try {
      const fd = new FormData()
      if (!modoLote) {
        fd.append('colaborador_id', String(sel.id))
        fd.append('origen', fuente === 'importado' ? 'importado' : 'bd')
      }
      pdfs.forEach((f) => fd.append('pdfs', f))
      const path = modoLote ? `/sst/${cid}/auditar-lote` : `/sst/${cid}/auditar`
      const r = await fetchConFallback(path, { method: 'POST', body: fd })
      if (r?._error) setErr(formatFetchError(r))
      else if (modoLote) setLote(r)
      else setResultado(r)
    } finally {
      setBusy(false)
    }
  }

  const ejecutarDisabled =
    busy || !pdfs.length || (!modoLote && !sel)
  const ejecutarHint = ejecutarDisabled && !busy
    ? !pdfs.length
      ? 'Selecciona al menos un PDF.'
      : !modoLote && !sel
        ? 'Selecciona un colaborador de la lista o activa modo Lote.'
        : ''
    : ''

  return (
    <div style={{ color: t.text, fontSize: 'var(--cc-sm)' }}>
      <h2 style={{ color: t.primary, fontSize: 'var(--cc-h2)' }}>Auditor SST (IA)</h2>
      <p style={{ color: t.textMuted, fontSize: 'var(--cc-label)', marginBottom: 12 }}>
        Permisos: <strong>Ver</strong> = auditar e historial; <strong>Crear</strong> = importar Excel FOAC.
      </p>
      {err && <div style={{ ...card, background: '#FEF2F2', color: '#B91C1C', whiteSpace: 'pre-wrap' }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {['auditar', 'importar', 'historial'].map((k) => (
          <button
            key={k}
            type="button"
            disabled={k === 'importar' && !puedeImportar}
            onClick={() => {
              setTab(k)
              if (k === 'historial') cargarHist()
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
          <input ref={fileXls} type="file" accept=".xlsx,.xls" onChange={handleExcel} />
          {filasExcel.length > 0 && (
            <button type="button" disabled={busy} onClick={importar} style={{ marginTop: 12, padding: '10px 16px', background: t.primary, color: '#fff', border: 'none', borderRadius: 8 }}>
              Importar {filasExcel.length} filas
            </button>
          )}
        </div>
      )}

      {tab === 'auditar' && puedeAuditar && (
        <div style={card}>
          <label style={{ marginRight: 12 }}>
            <input type="radio" checked={!modoLote} onChange={() => setModoLote(false)} /> Individual
          </label>
          <label>
            <input type="radio" checked={modoLote} onChange={() => setModoLote(true)} /> Lote (máx. 20 PDFs)
          </label>
          {!modoLote && (
            <div style={{ marginTop: 12, maxHeight: 200, overflow: 'auto', border: `1px solid ${t.border}`, borderRadius: 8 }}>
              {personal.length === 0 && <div style={{ padding: 12, color: t.textMuted }}>Sin personal en SST ni importado. Importa Excel o crea personal en el módulo SST.</div>}
              {personal.map((p) => (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSel(p)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setSel(p) }}
                  style={{ padding: 8, cursor: 'pointer', background: sel?.id === p.id ? t.primary + '22' : 'transparent' }}
                >
                  {p.nombre} · {p.cedula}
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <input ref={filePdf} type="file" accept=".pdf" multiple onChange={(e) => setPdfs(Array.from(e.target.files || []))} />
            {pdfs.length > 0 && <div style={{ marginTop: 8 }}>{pdfs.map((f) => f.name).join(', ')}</div>}
          </div>
          {ejecutarHint && (
            <div style={{ marginTop: 10, fontSize: 'var(--cc-label)', color: '#B45309' }}>{ejecutarHint}</div>
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
            {busy ? 'Procesando…' : 'Ejecutar'}
          </button>
          {resultado?.resultado && (
            <pre style={{ marginTop: 16, fontSize: 'var(--cc-label)', overflow: 'auto', maxHeight: 400 }}>{JSON.stringify(resultado.resultado, null, 2)}</pre>
          )}
          {resultado?.meta && (
            <div style={{ marginTop: 8, color: t.textMuted, fontSize: 'var(--cc-label)' }}>
              Tokens: {resultado.meta.tokens_usados} · USD ~{resultado.meta.costo_usd} · COP ~{resultado.meta.costo_cop_aprox}
            </div>
          )}
          {lote?.resultados && (
            <pre style={{ marginTop: 16, fontSize: 'var(--cc-label)', overflow: 'auto', maxHeight: 400 }}>{JSON.stringify(lote, null, 2)}</pre>
          )}
        </div>
      )}

      {tab === 'historial' && puedeAuditar && (
        <div style={card}>
          {histCargando && <div style={{ color: t.textMuted }}>Cargando historial…</div>}
          {!histCargando && hist && (
            <>
              <div style={{ marginBottom: 8 }}>Total USD aprox: {hist.totales?.costo_usd_total} · COP ~{hist.totales?.costo_cop_total}</div>
              <div style={{ maxHeight: 360, overflow: 'auto' }}>
                {(hist.historial || []).length === 0 && <div style={{ color: t.textMuted }}>Aún no hay auditorías.</div>}
                {(hist.historial || []).slice(0, 80).map((h) => (
                  <div key={h.id} style={{ borderBottom: `1px solid ${t.border}`, padding: '6px 0' }}>
                    {h.created_at} · {h.colaborador_nombre} · {h.puntuacion}% · ${h.costo_usd}
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
