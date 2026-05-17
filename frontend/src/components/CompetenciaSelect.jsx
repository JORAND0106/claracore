import { useCallback, useEffect, useState } from 'react'

const OPT_AGREGAR = '__agregar_entidad__'

/**
 * Dropdown de competencia con ICCU + lista del contrato + «Agregar entidad».
 * Requiere GET/POST /contratos/{id}/competencias
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
}) {
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(false)

  const recargar = useCallback(async () => {
    if (!contratoId || !call) return
    setLoading(true)
    try {
      const data = await call('GET', `/contratos/${contratoId}/competencias`)
      const arr = Array.isArray(data?.competencias) ? data.competencias : []
      setLista(arr)
    } catch {
      setLista(['EAB', 'ENEL-CODENSA', 'ETB', 'Gas Natural', 'ICCU', 'IDU', 'MOVISTAR'])
    } finally {
      setLoading(false)
    }
  }, [contratoId, call])

  useEffect(() => { recargar() }, [recargar])

  const handleChange = async (e) => {
    const v = e.target.value
    if (v !== OPT_AGREGAR) {
      onChange(v)
      return
    }
    const nombre = window.prompt('Nombre de la nueva entidad (competencia):')
    if (!nombre || !String(nombre).trim()) return
    try {
      await call('POST', `/contratos/${contratoId}/competencias`, { nombre: String(nombre).trim() })
      await recargar()
      onChange(String(nombre).trim())
    } catch (err) {
      window.alert(err?.message || 'No se pudo guardar la entidad.')
    }
  }

  return (
    <select
      value={value || ''}
      disabled={disabled || loading}
      onChange={handleChange}
      style={style}
    >
      {allowEmpty && <option value="">{placeholder}</option>}
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
