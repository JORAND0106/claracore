import { useCallback, useEffect, useRef, useState } from 'react'

const OPT_AGREGAR = '__agregar_entidad__'

const FALLBACK_COMPETENCIAS = ['EAB', 'ENEL-CODENSA', 'ETB', 'Gas Natural', 'ICCU', 'IDU', 'MOVISTAR']

/**
 * Dropdown de competencia con ICCU + lista del contrato + «Agregar entidad».
 * Requiere GET/POST /contratos/{id}/competencias (salvo si se pasa `opciones`).
 */
export default function CompetenciaSelect({
  contratoId,
  call,
  value,
  onChange,
  disabled = false,
  style = {},
  placeholder = '-- Selecciona --',
  allowEmpty = true,
  /** Si se pasa, no se vuelve a pedir GET /competencias (evita parpadeos en SICOE). */
  opciones = null,
}) {
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(false)
  const callRef = useRef(call)
  callRef.current = call

  const recargarRemoto = useCallback(async () => {
    if (!contratoId || !callRef.current) return
    setLoading(true)
    try {
      const data = await callRef.current('GET', `/contratos/${contratoId}/competencias`)
      const arr = Array.isArray(data?.competencias) ? data.competencias : []
      setLista(arr)
    } catch {
      setLista(FALLBACK_COMPETENCIAS)
    } finally {
      setLoading(false)
    }
  }, [contratoId])

  useEffect(() => {
    if (opciones != null) {
      setLista(Array.isArray(opciones) ? opciones : [])
      setLoading(false)
      return
    }
    void recargarRemoto()
  }, [contratoId, opciones, recargarRemoto])

  const handleChange = async (e) => {
    const v = e.target.value
    if (v !== OPT_AGREGAR) {
      onChange(v)
      return
    }
    const nombre = window.prompt('Nombre de la nueva entidad (competencia):')
    if (!nombre || !String(nombre).trim()) return
    try {
      await callRef.current('POST', `/contratos/${contratoId}/competencias`, { nombre: String(nombre).trim() })
      const nombreTrim = String(nombre).trim()
      if (Array.isArray(opciones)) {
        setLista((prev) => {
          if (prev.includes(nombreTrim)) return prev
          return [...prev, nombreTrim].sort((a, b) => a.localeCompare(b, 'es'))
        })
        onChange(nombreTrim)
      } else {
        await recargarRemoto()
        onChange(nombreTrim)
      }
    } catch (err) {
      window.alert(err?.message || 'No se pudo guardar la entidad.')
    }
  }

  const stopBubble = (e) => {
    e.stopPropagation()
  }

  return (
    <select
      value={value || ''}
      disabled={disabled}
      onChange={handleChange}
      onMouseDown={stopBubble}
      onClick={stopBubble}
      onKeyDown={stopBubble}
      style={{
        ...style,
        opacity: disabled ? (style.opacity ?? 0.65) : (loading ? 0.85 : style.opacity),
      }}
      title={loading ? 'Cargando competencias…' : undefined}
    >
      {allowEmpty && (
        <option value="">
          {loading && !lista.length ? 'Cargando…' : placeholder}
        </option>
      )}
      {lista.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
      {value && !lista.includes(value) && (
        <option value={value}>{value}</option>
      )}
      <option value={OPT_AGREGAR}>+ Agregar entidad…</option>
    </select>
  )
}

export { OPT_AGREGAR }
