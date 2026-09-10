import { useEffect, useMemo, useState } from 'react'

const MESES = [
  { v: '01', l: 'Enero' }, { v: '02', l: 'Febrero' }, { v: '03', l: 'Marzo' },
  { v: '04', l: 'Abril' }, { v: '05', l: 'Mayo' }, { v: '06', l: 'Junio' },
  { v: '07', l: 'Julio' }, { v: '08', l: 'Agosto' }, { v: '09', l: 'Septiembre' },
  { v: '10', l: 'Octubre' }, { v: '11', l: 'Noviembre' }, { v: '12', l: 'Diciembre' },
]

function daysInMonth(y, m) {
  const yi = Number(y)
  const mi = Number(m)
  if (!yi || !mi) return 31
  return new Date(yi, mi, 0).getDate()
}

function parseParts(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return { y: '', mo: '', d: '' }
  return { y: m[1], mo: m[2], d: m[3] }
}

/**
 * Selector de fecha Año / Mes / Día (estándar del módulo Recursos Humanos).
 */
export default function RrhhDateSelect({
  value = '',
  onChange,
  disabled = false,
  selectStyle,
  minYear = 1920,
  maxYear: maxYearProp,
  ariaPrefix = 'Fecha',
}) {
  const today = new Date()
  const maxYear = maxYearProp ?? today.getFullYear()
  const parts = parseParts(value)
  const [y, setY] = useState(parts.y)
  const [mo, setMo] = useState(parts.mo)
  const [d, setD] = useState(parts.d)

  useEffect(() => {
    const p = parseParts(value)
    setY(p.y)
    setMo(p.mo)
    setD(p.d)
  }, [value])

  const years = useMemo(() => {
    const out = []
    const hi = Math.max(maxYear, minYear)
    const lo = Math.min(maxYear, minYear)
    for (let i = hi; i >= lo; i -= 1) out.push(String(i))
    return out
  }, [maxYear, minYear])

  const maxDay = daysInMonth(y, mo)
  const days = useMemo(() => {
    const out = []
    for (let i = 1; i <= maxDay; i += 1) out.push(String(i).padStart(2, '0'))
    return out
  }, [maxDay])

  const emit = (ny, nmo, nd) => {
    setY(ny)
    setMo(nmo)
    setD(nd)
    if (ny && nmo && nd) {
      const dim = daysInMonth(ny, nmo)
      const dayNum = Math.min(Number(nd), dim)
      const day = String(dayNum).padStart(2, '0')
      onChange?.(`${ny}-${nmo}-${day}`)
    } else {
      onChange?.('')
    }
  }

  const sel = {
    ...selectStyle,
    flex: '1 1 0',
    minWidth: 0,
  }

  return (
    <div style={{ display: 'flex', gap: 4, width: '100%', alignItems: 'center' }}>
      <select
        style={sel}
        disabled={disabled}
        value={y}
        aria-label={`${ariaPrefix}: año`}
        onChange={(e) => emit(e.target.value, mo, d)}
      >
        <option value="">Año</option>
        {years.map((yr) => <option key={yr} value={yr}>{yr}</option>)}
      </select>
      <select
        style={sel}
        disabled={disabled}
        value={mo}
        aria-label={`${ariaPrefix}: mes`}
        onChange={(e) => emit(y, e.target.value, d)}
      >
        <option value="">Mes</option>
        {MESES.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
      </select>
      <select
        style={sel}
        disabled={disabled}
        value={d && Number(d) > maxDay ? String(maxDay).padStart(2, '0') : d}
        aria-label={`${ariaPrefix}: día`}
        onChange={(e) => emit(y, mo, e.target.value)}
      >
        <option value="">Día</option>
        {days.map((dd) => <option key={dd} value={dd}>{Number(dd)}</option>)}
      </select>
    </div>
  )
}
