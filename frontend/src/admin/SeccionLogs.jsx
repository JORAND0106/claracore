import { useEffect, useRef, useState, startTransition } from 'react'
import { ChevronLeft, ChevronRight, Download, FilterX, RefreshCw } from 'lucide-react'
import { API_BASE } from '../apiBase'
import { tFrom } from '../theme/adminPanelTheme'
import { formatFechaLogBogota } from '../utils/fechaColombia'
import { useClaraViewport } from '../useClaraViewport'
import {
  ACCIONES_LOG,
  MODULOS_LOG,
  accionLegible,
  camposDeLog,
  cargaDeLog,
  registroDeLog,
  tonoAccion,
} from './logsModificacionesPresentacion'

const API = API_BASE
const LIMIT = 40

function IconBtn({ title, onClick, disabled, children, tok }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 36,
        height: 36,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '0 0 auto',
        borderRadius: 8,
        border: `1px solid ${tok.border}`,
        background: tok.bgCard,
        color: disabled ? tok.textMuted : tok.text,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        padding: 0,
      }}
    >
      {children}
    </button>
  )
}

function CampoValor({ etiqueta, valor, tok }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 'var(--cc-caption)', color: tok.textMuted, fontWeight: 700, marginBottom: 2 }}>{etiqueta}</div>
      <div style={{ fontSize: 'var(--cc-sm)', color: tok.text, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{valor}</div>
    </div>
  )
}

function TarjetaLog({ log, tok, apilado }) {
  const campos = camposDeLog(log)
  const carga = cargaDeLog(log)
  const color = tonoAccion(log.accion)
  const quien = [log.usuario_nombre || '—', log.cargo_nombre].filter(Boolean).join(' · ')
  return (
    <article
      style={{
        background: tok.bgCard,
        border: `1px solid ${tok.border}`,
        borderRadius: 12,
        padding: apilado ? 12 : 14,
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <span style={{
          background: `${color}22`,
          color,
          border: `1px solid ${color}55`,
          borderRadius: 999,
          padding: '2px 10px',
          fontSize: 'var(--cc-caption)',
          fontWeight: 800,
        }}
        >
          {accionLegible(log)}
        </span>
        <strong style={{ color: tok.text, fontSize: 'var(--cc-sm)' }}>{quien}</strong>
        <span style={{ color: tok.textMuted, fontSize: 'var(--cc-caption)' }}>{formatFechaLogBogota(log.created_at)}</span>
        <span style={{
          border: `1px solid ${tok.border}`,
          borderRadius: 6,
          padding: '1px 8px',
          fontSize: 'var(--cc-caption)',
          color: tok.text,
        }}
        >
          {log.modulo || '—'}
        </span>
        {carga && (
          <span title={`Carga ${carga.id}`} style={{ fontSize: 'var(--cc-caption)', color: tok.textMuted }}>
            Carga {carga.corto}
          </span>
        )}
      </div>
      <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 700, color: tok.text, marginBottom: 10, wordBreak: 'break-word' }}>
        {registroDeLog(log)}
      </div>
      {campos.length === 0 ? (
        <div style={{ fontSize: 'var(--cc-sm)', color: tok.textMuted }}>Sin campos registrados</div>
      ) : apilado ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {campos.map((c, i) => (
            <div key={`${c.etiqueta}-${i}`} style={{ borderTop: `1px solid ${tok.border}`, paddingTop: 8 }}>
              <div style={{ fontWeight: 800, color: tok.text, fontSize: 'var(--cc-sm)', marginBottom: 6 }}>{c.etiqueta}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                <CampoValor etiqueta="Valor anterior" valor={c.anterior} tok={tok} />
                <CampoValor etiqueta="Valor nuevo" valor={c.nuevo} tok={tok} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Campo', 'Valor anterior', 'Valor nuevo'].map((h) => (
                  <th key={h} style={{
                    textAlign: 'left',
                    fontSize: 'var(--cc-caption)',
                    color: tok.textMuted,
                    fontWeight: 800,
                    padding: '6px 8px',
                    borderBottom: `1px solid ${tok.border}`,
                  }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {campos.map((c, i) => (
                <tr key={`${c.etiqueta}-${i}`}>
                  <td style={{ padding: '7px 8px', fontSize: 'var(--cc-sm)', color: tok.text, fontWeight: 700, verticalAlign: 'top', width: '22%' }}>{c.etiqueta}</td>
                  <td style={{ padding: '7px 8px', fontSize: 'var(--cc-sm)', color: tok.text, verticalAlign: 'top', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.anterior}</td>
                  <td style={{ padding: '7px 8px', fontSize: 'var(--cc-sm)', color: tok.text, verticalAlign: 'top', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.nuevo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  )
}

export default function SeccionLogs({ call, theme, t: tProp, user = null }) {
  void call
  const tok = tFrom(theme, tProp)
  const vp = useClaraViewport()
  const apilado = vp.isMobile || vp.isTablet || vp.isLandscapeMobile
  const token = localStorage.getItem('cc_token') || sessionStorage.getItem('cc_token')

  const [logs, setLogs] = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(false)
  const [filtUsuario, setFiltUsuario] = useState('')
  const [filtModulo, setFiltModulo] = useState('')
  const [filtAccion, setFiltAccion] = useState('')
  const [filtDesde, setFiltDesde] = useState('')
  const [filtHasta, setFiltHasta] = useState('')
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [offset, setOffset] = useState(0)
  const lastPayload = useRef('')

  useEffect(() => {
    const timer = setTimeout(() => setQ(qInput.trim()), 350)
    return () => clearTimeout(timer)
  }, [qInput])

  useEffect(() => {
    fetch(`${API}/logs/usuarios-lista`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then(setUsuarios)
      .catch(() => {})
  }, [token])

  useEffect(() => {
    cargar(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtUsuario, filtModulo, filtAccion, filtDesde, filtHasta, q])

  function paramsDe(off) {
    const params = new URLSearchParams({
      limit: String(LIMIT),
      offset: String(off),
      categoria: 'datos',
    })
    if (filtUsuario) params.set('usuario_id', filtUsuario)
    if (filtModulo) params.set('modulo', filtModulo)
    if (filtAccion) params.set('accion', filtAccion)
    if (filtDesde) params.set('fecha_desde', filtDesde)
    if (filtHasta) params.set('fecha_hasta', filtHasta)
    if (q) params.set('q', q)
    return params
  }

  async function cargar(off = 0, opts = {}) {
    const { silent = false } = opts
    if (!silent) {
      setLoading(true)
      setOffset(off)
    }
    const data = await fetch(`${API}/logs?${paramsDe(off)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
    const nextJson = JSON.stringify(data)
    if (silent && nextJson === lastPayload.current) return
    lastPayload.current = nextJson
    if (silent) startTransition(() => setLogs(data))
    else {
      setLogs(data)
      setLoading(false)
    }
  }

  function limpiar() {
    setFiltUsuario('')
    setFiltModulo('')
    setFiltAccion('')
    setFiltDesde('')
    setFiltHasta('')
    setQInput('')
    setQ('')
  }

  async function descargar() {
    const params = paramsDe(0)
    params.delete('limit')
    params.delete('offset')
    params.set('max_rows', '8000')
    if (user?.contrato_id) params.set('contrato_id', String(user.contrato_id))
    try {
      const r = await fetch(`${API}/logs/export.xlsx?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!r.ok) return
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const cd = r.headers.get('content-disposition') || ''
      const m = cd.match(/filename="?([^";]+)"?/i)
      a.download = m?.[1] || 'claracore_logs.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch { /* la descarga no debe romper la vista */ }
  }

  const control = {
    background: tok.inputBg,
    border: `1px solid ${tok.border}`,
    borderRadius: 8,
    padding: '6px 10px',
    color: tok.text,
    fontSize: 'var(--cc-sm)',
    minWidth: 0,
    flex: '1 1 150px',
    maxWidth: '100%',
  }

  return (
    <div style={{ minWidth: 0, width: '100%' }}>
      <p style={{ margin: '0 0 12px', color: tok.textMuted, fontSize: 'var(--cc-sm)', lineHeight: 1.45 }}>
        Cada fila es un registro que se creó, editó, eliminó o entró en una carga. Si una edición tocó varios campos, aparecen todos, con el valor anterior y el nuevo.
      </p>
      <div style={{
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        alignItems: 'center',
        marginBottom: 14,
        padding: 12,
        background: tok.bgCard,
        borderRadius: 10,
        border: `1px solid ${tok.border}`,
      }}
      >
        <select value={filtUsuario} onChange={(e) => setFiltUsuario(e.target.value)} style={control} aria-label="Usuario">
          <option value="">Todos los usuarios</option>
          {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre} · {u.cargo}</option>)}
        </select>
        <select value={filtModulo} onChange={(e) => setFiltModulo(e.target.value)} style={control} aria-label="Módulo">
          <option value="">Todos los módulos</option>
          {MODULOS_LOG.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={filtAccion} onChange={(e) => setFiltAccion(e.target.value)} style={control} aria-label="Acción">
          <option value="">Todas las acciones</option>
          {ACCIONES_LOG.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        <input type="date" value={filtDesde} onChange={(e) => setFiltDesde(e.target.value)} style={control} aria-label="Desde" />
        <input type="date" value={filtHasta} onChange={(e) => setFiltHasta(e.target.value)} style={control} aria-label="Hasta" />
        <input
          type="search"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="Buscar registro, campo o valor"
          aria-label="Buscar registro, campo o valor"
          style={{ ...control, flex: '1 1 220px' }}
        />
        <IconBtn title="Limpiar filtros" onClick={limpiar} tok={tok}>
          <FilterX size={16} aria-hidden="true" />
        </IconBtn>
        <IconBtn title="Actualizar" onClick={() => cargar(0)} tok={tok}>
          <RefreshCw size={16} aria-hidden="true" />
        </IconBtn>
        <IconBtn title="Descargar Excel" onClick={descargar} tok={tok}>
          <Download size={16} aria-hidden="true" />
        </IconBtn>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 32, color: tok.textMuted, fontSize: 'var(--cc-sm)' }}>Cargando…</div>
      ) : logs.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: 32,
          color: tok.textMuted,
          fontSize: 'var(--cc-sm)',
          border: `1px solid ${tok.border}`,
          borderRadius: 12,
          background: tok.bgCard,
        }}
        >
          Sin modificaciones con estos filtros. El historial anterior a este registro no se reconstruye.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          {logs.map((log) => (
            <TarjetaLog key={log.id} log={log} tok={tok} apilado={apilado} />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 14 }}>
        <IconBtn title="Página anterior" onClick={() => cargar(Math.max(0, offset - LIMIT))} disabled={offset === 0} tok={tok}>
          <ChevronLeft size={16} aria-hidden="true" />
        </IconBtn>
        <span style={{ fontSize: 'var(--cc-sm)', color: tok.textMuted }}>
          Página {Math.floor(offset / LIMIT) + 1}
          {logs.length ? ` · ${logs.length} registros` : ''}
        </span>
        <IconBtn title="Página siguiente" onClick={() => cargar(offset + LIMIT)} disabled={logs.length < LIMIT} tok={tok}>
          <ChevronRight size={16} aria-hidden="true" />
        </IconBtn>
      </div>
    </div>
  )
}
