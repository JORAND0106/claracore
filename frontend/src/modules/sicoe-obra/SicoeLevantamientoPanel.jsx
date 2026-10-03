/**
 * Panel de levantamiento + dibujo sobre el plano semáforo.
 * Herramientas alineadas al esquema: unir puntos, línea, polígono, estilos de trazo.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { API_BASE } from '../../apiBase'
import { LINE_STYLE_OPTIONS } from '../../components/esquema/esquemaLineStyle'
import {
  aplicarHuellaPrecisa,
  cargarLevantamientoReporte,
  fetchHuellasIndicadores,
  fetchLevantamientoMapa,
  fetchRegistrosDeReporte,
  parseLevantamientoFile,
} from './sicoeLevantamientoApi'
import {
  syncLevantamientoDrawLayer,
  syncLevantamientoPuntosLayer,
} from './sicoeLevantamientoMapaLayer'

const TOOLS = [
  { id: 'seleccion', label: 'Seleccionar' },
  { id: 'unir', label: 'Unir puntos' },
  { id: 'linea', label: 'Línea' },
  { id: 'area', label: 'Polígono' },
  { id: 'punto', label: 'Punto' },
]

const EMPTY_FC = { type: 'FeatureCollection', features: [] }

function snapToNearestFeature(fc, lng, lat, maxM = 8) {
  // Aprox grados: 1° lat ≈ 111 km; usamos umbral en grados ~ maxM/111000
  const thr = maxM / 111000
  let best = null
  let bestD = Infinity
  for (const f of fc?.features || []) {
    const c = f?.geometry?.coordinates
    if (!Array.isArray(c) || c.length < 2) continue
    const d = Math.hypot(c[0] - lng, c[1] - lat)
    if (d < bestD) {
      bestD = d
      best = { lng: c[0], lat: c[1], props: f.properties }
    }
  }
  if (best && bestD <= thr) return best
  return null
}

export default function SicoeLevantamientoPanel({
  t,
  contratoId,
  token,
  getMap,
  mapReady,
  puedeDibujar = false,
}) {
  const [abierto, setAbierto] = useState(false)
  const [mostrarPts, setMostrarPts] = useState(true)
  const [reporteId, setReporteId] = useState('')
  const [registros, setRegistros] = useState([])
  const [registroId, setRegistroId] = useState('')
  const [puntosFc, setPuntosFc] = useState(EMPTY_FC)
  const [tool, setTool] = useState('unir')
  const [lineStyle, setLineStyle] = useState('continua')
  const [vertices, setVertices] = useState([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [indicadores, setIndicadores] = useState(null)
  const [subiendo, setSubiendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const puntosRef = useRef(EMPTY_FC)
  const toolRef = useRef(tool)
  const vertsRef = useRef(vertices)
  const clickBoundRef = useRef(false)

  toolRef.current = tool
  vertsRef.current = vertices
  puntosRef.current = puntosFc

  const draft = useMemo(
    () => ({
      vertices,
      geometriaTipo: tool === 'unir' ? 'linea' : tool,
      lineStyle,
    }),
    [vertices, tool, lineStyle],
  )

  const refreshIndicadores = useCallback(async () => {
    if (!contratoId) return
    try {
      const ind = await fetchHuellasIndicadores(contratoId, token)
      setIndicadores(ind)
    } catch { /* ignore */ }
  }, [contratoId, token])

  const cargarPuntos = useCallback(async (rid) => {
    if (!contratoId) return
    setLoading(true)
    setErr('')
    try {
      const fc = await fetchLevantamientoMapa(contratoId, token, {
        reporteId: rid ? Number(rid) : undefined,
      })
      setPuntosFc(fc?.type === 'FeatureCollection' ? fc : EMPTY_FC)
    } catch (e) {
      setErr(e?.message || 'No se pudieron cargar puntos')
      setPuntosFc(EMPTY_FC)
    } finally {
      setLoading(false)
    }
  }, [contratoId, token])

  const cargarRegistros = useCallback(async (rid) => {
    if (!contratoId || !rid) {
      setRegistros([])
      return
    }
    try {
      const { registros: regs } = await fetchRegistrosDeReporte(contratoId, Number(rid), token)
      setRegistros(regs)
      if (regs.length === 1) setRegistroId(String(regs[0].id))
    } catch (e) {
      setErr(e?.message || 'No se pudieron cargar registros')
      setRegistros([])
    }
  }, [contratoId, token])

  useEffect(() => {
    if (!abierto) return
    void cargarPuntos(reporteId)
    void refreshIndicadores()
  }, [abierto, reporteId, cargarPuntos, refreshIndicadores])

  useEffect(() => {
    if (!abierto || !reporteId) return
    void cargarRegistros(reporteId)
  }, [abierto, reporteId, cargarRegistros])

  // Sync capas
  useEffect(() => {
    const map = typeof getMap === 'function' ? getMap() : null
    if (!map || !mapReady) return
    syncLevantamientoPuntosLayer(map, puntosFc, abierto && mostrarPts)
    syncLevantamientoDrawLayer(map, draft, abierto && vertices.length > 0)
  }, [abierto, mostrarPts, puntosFc, draft, vertices.length, getMap, mapReady])

  // Click handler dibujo
  useEffect(() => {
    const map = typeof getMap === 'function' ? getMap() : null
    if (!map || !mapReady || !abierto || !puedeDibujar) {
      clickBoundRef.current = false
      return undefined
    }
    if (clickBoundRef.current) return undefined
    const onClick = (e) => {
      const mode = toolRef.current
      if (mode === 'seleccion') return
      const { lng, lat } = e.lngLat || {}
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
      let pt = { lng, lat }
      if (mode === 'unir') {
        const snap = snapToNearestFeature(puntosRef.current, lng, lat, 12)
        if (!snap) {
          setMsg('Pulse cerca de un punto del levantamiento para unir.')
          return
        }
        pt = { lng: snap.lng, lat: snap.lat, label: snap.props?.label }
      }
      setVertices((prev) => {
        if (mode === 'punto') return [pt]
        return [...prev, pt]
      })
      setMsg('')
    }
    map.on('click', onClick)
    clickBoundRef.current = true
    return () => {
      try { map.off('click', onClick) } catch { /* ignore */ }
      clickBoundRef.current = false
    }
  }, [abierto, puedeDibujar, getMap, mapReady, tool])

  useEffect(() => () => {
    const map = typeof getMap === 'function' ? getMap() : null
    syncLevantamientoPuntosLayer(map, EMPTY_FC, false)
    syncLevantamientoDrawLayer(map, null, false)
  }, [getMap])

  const onUpload = async (file) => {
    if (!file || !reporteId) {
      setErr('Indique el ID del reporte y elija un archivo.')
      return
    }
    setSubiendo(true)
    setErr('')
    setMsg('')
    try {
      const puntos = await parseLevantamientoFile(file)
      if (!puntos.length) throw new Error('El archivo no tiene puntos válidos.')
      const res = await cargarLevantamientoReporte({
        contratoId,
        reporteId: Number(reporteId),
        token,
        puntos,
        reemplazar: true,
        validarUbicacion: true,
      })
      const nRech = (res.rechazados || []).length
      setMsg(
        `Cargados ${res.insertados} punto(s)`
        + (nRech ? ` · ${nRech} rechazado(s) por ubicación` : ''),
      )
      if (res.geojson) setPuntosFc(res.geojson)
      else await cargarPuntos(reporteId)
    } catch (e) {
      const rech = e?.detail?.rechazados
      setErr(
        e?.message
        + (Array.isArray(rech) && rech.length
          ? `: ${rech.slice(0, 3).map((x) => x.mensaje || x.punto).join('; ')}`
          : ''),
      )
    } finally {
      setSubiendo(false)
    }
  }

  const onGuardarHuella = async () => {
    if (!registroId) {
      setErr('Seleccione el registro al que asociar la huella.')
      return
    }
    if (!vertices.length) {
      setErr('Dibuje al menos un vértice.')
      return
    }
    const geoTipo = tool === 'unir' ? 'linea' : (tool === 'seleccion' ? 'area' : tool)
    setGuardando(true)
    setErr('')
    try {
      const res = await aplicarHuellaPrecisa({
        contratoId,
        registroId: Number(registroId),
        token,
        geometriaTipo: geoTipo === 'punto' ? 'punto' : (geoTipo === 'linea' ? 'linea' : 'area'),
        vertices,
        lineStyle,
      })
      const nHall = (res.hallazgos || []).length
      setMsg(
        `Huella precisa guardada`
        + (nHall ? ` · ${nHall} hallazgo(s) de auditoría` : ''),
      )
      setVertices([])
      await refreshIndicadores()
      // Refrescar capa de huellas del mapa padre
      try {
        const map = typeof getMap === 'function' ? getMap() : null
        const src = map?.getSource?.('sicoe-huellas')
        if (src && contratoId) {
          const r = await fetch(
            `${API_BASE}/sicoe-obra/${contratoId}/huellas?incluir_eje=false&incluir_nodos=false`,
            { headers: token ? { Authorization: `Bearer ${token}` } : {} },
          )
          if (r.ok) {
            const data = await r.json()
            src.setData({
              type: 'FeatureCollection',
              features: data?.features || data?.huellas || [],
            })
          }
        }
      } catch { /* ignore */ }
    } catch (e) {
      setErr(e?.message || 'No se pudo guardar la huella')
    } finally {
      setGuardando(false)
    }
  }

  const indC = indicadores?.contrato
  const indU = indicadores?.usuario

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        style={{
          position: 'absolute', top: 12, right: 12, zIndex: 6,
          background: `${t.bgCard}F2`, border: `1px solid ${t.border}`,
          borderRadius: 10, padding: '8px 12px', cursor: 'pointer',
          color: t.text, fontWeight: 700, fontSize: 'var(--cc-caption)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
        }}
      >
        Levantamiento
        {indC ? ` · ${indC.precisas || 0} precisas` : ''}
      </button>
    )
  }

  return (
    <div
      style={{
        position: 'absolute', top: 12, right: 12, zIndex: 7,
        width: 'min(340px, calc(100% - 24px))',
        maxHeight: 'calc(100% - 24px)',
        overflowY: 'auto',
        background: `${t.bgCard}F7`,
        border: `1px solid ${t.border}`,
        borderRadius: 12,
        padding: 12,
        boxShadow: '0 4px 20px rgba(0,0,0,0.22)',
        color: t.text,
        fontSize: 'var(--cc-caption)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 'var(--cc-sm)' }}>Levantamiento / dibujo</div>
        <button
          type="button"
          onClick={() => { setAbierto(false); setVertices([]) }}
          style={{ background: 'transparent', border: 'none', color: t.textMuted, cursor: 'pointer', fontWeight: 700 }}
        >
          Cerrar
        </button>
      </div>

      {indC && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6,
          marginBottom: 10, padding: 8, borderRadius: 8,
          background: t.bg, border: `1px solid ${t.border}`,
        }}>
          <div>
            <div style={{ color: t.textMuted, fontSize: 'var(--cc-caption)' }}>Contrato</div>
            <div style={{ fontWeight: 700 }}>
              {indC.precisas} precisas · {indC.aproximadas} aprox.
            </div>
          </div>
          <div>
            <div style={{ color: t.textMuted, fontSize: 'var(--cc-caption)' }}>Mis registros</div>
            <div style={{ fontWeight: 700 }}>
              {indU?.precisas ?? 0} precisas · {indU?.aproximadas ?? 0} aprox.
            </div>
          </div>
        </div>
      )}

      <label style={{ display: 'block', marginBottom: 6, color: t.textMuted }}>Reporte ID</label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input
          value={reporteId}
          onChange={(e) => setReporteId(e.target.value.replace(/\D/g, ''))}
          placeholder="Ej. 1234"
          style={{
            flex: 1, background: t.bg, border: `1px solid ${t.border}`,
            borderRadius: 8, padding: '6px 8px', color: t.text,
          }}
        />
        <button
          type="button"
          onClick={() => void cargarPuntos(reporteId)}
          disabled={loading}
          style={{
            background: t.primary, color: '#fff', border: 'none',
            borderRadius: 8, padding: '6px 10px', fontWeight: 700, cursor: 'pointer',
          }}
        >
          Ver
        </button>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={mostrarPts} onChange={(e) => setMostrarPts(e.target.checked)} />
        Puntos en mapa{puntosFc.features?.length ? ` (${puntosFc.features.length})` : ''}
      </label>

      {puedeDibujar && (
        <>
          <div style={{ marginBottom: 8 }}>
            <label style={{
              display: 'inline-block',
              background: 'transparent',
              border: `1px dashed ${t.border}`,
              borderRadius: 8,
              padding: '7px 12px',
              cursor: subiendo || !reporteId ? 'not-allowed' : 'pointer',
              opacity: subiendo || !reporteId ? 0.5 : 1,
            }}>
              {subiendo ? 'Cargando…' : 'Cargar archivo (.csv / .xlsx)'}
              <input
                type="file"
                accept=".csv,.txt,.xlsx,.xls"
                style={{ display: 'none' }}
                disabled={subiendo || !reporteId}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) void onUpload(f)
                }}
              />
            </label>
          </div>

          <div style={{ color: t.textMuted, marginBottom: 6 }}>Herramienta</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {TOOLS.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => { setTool(x.id); if (x.id === 'punto') setVertices([]) }}
                style={{
                  background: tool === x.id ? t.primary : t.bg,
                  color: tool === x.id ? '#fff' : t.text,
                  border: `1px solid ${tool === x.id ? t.primary : t.border}`,
                  borderRadius: 6,
                  padding: '4px 8px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: 'var(--cc-caption)',
                }}
              >
                {x.label}
              </button>
            ))}
          </div>

          <label style={{ display: 'block', marginBottom: 4, color: t.textMuted }}>Estilo de línea</label>
          <select
            value={lineStyle}
            onChange={(e) => setLineStyle(e.target.value)}
            style={{
              width: '100%', marginBottom: 8, background: t.bg,
              border: `1px solid ${t.border}`, borderRadius: 8,
              padding: '6px 8px', color: t.text,
            }}
          >
            {LINE_STYLE_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>

          <label style={{ display: 'block', marginBottom: 4, color: t.textMuted }}>Registro destino</label>
          <select
            value={registroId}
            onChange={(e) => setRegistroId(e.target.value)}
            style={{
              width: '100%', marginBottom: 8, background: t.bg,
              border: `1px solid ${t.border}`, borderRadius: 8,
              padding: '6px 8px', color: t.text,
            }}
          >
            <option value="">— Seleccione —</option>
            {registros.map((r) => (
              <option key={r.id} value={r.id}>
                #{r.numero_registro || r.id}
                {r.item_numero ? ` · ${r.item_numero}` : ''}
                {r.huella_precision ? ` · ${r.huella_precision}` : ''}
              </option>
            ))}
          </select>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            <button
              type="button"
              onClick={() => setVertices((v) => v.slice(0, -1))}
              disabled={!vertices.length}
              style={{
                background: t.bg, border: `1px solid ${t.border}`, color: t.text,
                borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontWeight: 600,
              }}
            >
              Deshacer ({vertices.length})
            </button>
            <button
              type="button"
              onClick={() => setVertices([])}
              disabled={!vertices.length}
              style={{
                background: t.bg, border: `1px solid ${t.border}`, color: t.textMuted,
                borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
              }}
            >
              Limpiar
            </button>
            <button
              type="button"
              onClick={() => void onGuardarHuella()}
              disabled={guardando || !vertices.length || !registroId}
              style={{
                background: t.primary, color: '#fff', border: 'none',
                borderRadius: 8, padding: '6px 12px', fontWeight: 700,
                cursor: 'pointer', opacity: guardando ? 0.6 : 1,
              }}
            >
              {guardando ? 'Guardando…' : 'Guardar huella precisa'}
            </button>
          </div>
        </>
      )}

      {!puedeDibujar && (
        <div style={{ color: t.textMuted, marginBottom: 6 }}>
          Puede ver puntos. Para dibujar necesita permiso de editar gráfico del registro.
        </div>
      )}

      {msg && (
        <div style={{
          marginTop: 6, padding: '6px 8px', borderRadius: 8,
          background: '#10B98122', color: '#059669', fontWeight: 600,
        }}>
          {msg}
        </div>
      )}
      {err && (
        <div style={{
          marginTop: 6, padding: '6px 8px', borderRadius: 8,
          background: '#EF444422', color: '#DC2626', fontWeight: 600,
        }}>
          {err}
        </div>
      )}
    </div>
  )
}
