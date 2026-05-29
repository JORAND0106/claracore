import { useEffect, useMemo, useState } from 'react'
import { pptoMatchItemNumero } from '../presupuesto/pptoFiltroCatalogo'
import { fetchSicoeItemsSugerencias } from './sicoeFiltrosApi'

const inp = (t) => ({
  background: t.inputBg,
  border: `1px solid ${t.border}`,
  borderRadius: 6,
  padding: '6px 10px',
  color: t.text,
  fontSize: 'var(--cc-sm)',
  width: '100%',
  boxSizing: 'border-box',
})

function TagsLista({ lista, onRemove, t, labelFn }) {
  if (!lista.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
      {lista.map((v) => (
        <span
          key={v}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            background: `${t.primary}18`,
            border: `1px solid ${t.primary}44`,
            borderRadius: 12,
            padding: '2px 8px',
            fontSize: 'var(--cc-caption)',
            color: t.text,
          }}
        >
          <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {labelFn ? labelFn(v) : v}
          </span>
          <button
            type="button"
            onClick={() => onRemove(v)}
            style={{ background: 'transparent', border: 'none', color: t.textMuted, cursor: 'pointer', padding: 0 }}
            aria-label={`Quitar ${v}`}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  )
}

/** Ítem con sugerencias remotas (acta / capítulo / semana), no solo lista precargada. */
export default function SicoeItemPickerInline({
  t,
  contratoId,
  token,
  lista,
  onChangeLista,
  itemLabels = {},
  acta_rpo = '',
  capitulo = '',
  semana = '',
  opcionesLocales = [],
}) {
  const [busq, setBusq] = useState('')
  const [open, setOpen] = useState(false)
  const [remotas, setRemotas] = useState([])
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (!contratoId || !token) return
    let cancelled = false
    const q = busq.trim()
    if (q.length < 1 && !acta_rpo && !capitulo) {
      setRemotas([])
      return
    }
    setCargando(true)
    const timer = setTimeout(() => {
      fetchSicoeItemsSugerencias(contratoId, token, {
        q,
        capitulo: capitulo || undefined,
        acta_rpo: acta_rpo || undefined,
        semana: semana || undefined,
      })
        .then((rows) => {
          if (!cancelled) setRemotas(Array.isArray(rows) ? rows : [])
        })
        .catch(() => { if (!cancelled) setRemotas([]) })
        .finally(() => { if (!cancelled) setCargando(false) })
    }, 280)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [busq, contratoId, token, acta_rpo, capitulo, semana])

  const opts = useMemo(() => {
    const m = new Map()
    for (const o of opcionesLocales || []) {
      const v = String(o.item ?? o.value ?? '').trim()
      if (!v) continue
      m.set(v, { value: v, descripcion: o.descripcion || itemLabels[v] || '' })
    }
    for (const r of remotas) {
      const v = String(r.item_numero ?? r.item ?? '').trim()
      if (!v) continue
      if (!m.has(v)) m.set(v, { value: v, descripcion: r.item_descripcion || r.descripcion || '' })
    }
    return [...m.values()]
  }, [opcionesLocales, remotas, itemLabels])

  const disponibles = useMemo(
    () => opts.filter((o) => !lista.some((v) => pptoMatchItemNumero(v, o.value))),
    [opts, lista],
  )

  const filtrados = useMemo(() => {
    const q = busq.trim().toLowerCase()
    const base = q
      ? disponibles.filter(
          (o) =>
            o.value.toLowerCase().includes(q) ||
            (o.descripcion || '').toLowerCase().includes(q),
        )
      : disponibles
    return base.slice(0, 60)
  }, [disponibles, busq])

  const pick = (val) => {
    if (!val || lista.some((v) => pptoMatchItemNumero(v, val))) return
    onChangeLista([...lista, val])
    setBusq('')
    setOpen(false)
  }

  const labelItem = (v) => itemLabels[v] || opts.find((o) => o.value === v)?.descripcion || v

  return (
    <div>
      <TagsLista lista={lista} onRemove={(v) => onChangeLista(lista.filter((x) => x !== v))} t={t} labelFn={labelItem} />
      <input
        value={busq}
        onChange={(e) => { setBusq(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={acta_rpo || capitulo ? 'Buscar ítem (acta/capítulo)…' : 'Indique acta o capítulo para buscar ítems…'}
        style={inp(t)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          const q = busq.trim()
          if (filtrados[0]) pick(filtrados[0].value)
          else if (q && (acta_rpo || capitulo)) pick(q)
        }}
      />
      {cargando && (
        <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginTop: 4 }}>Buscando ítems…</div>
      )}
      {open && filtrados.length > 0 && (
        <div
          style={{
            marginTop: 4,
            maxHeight: 140,
            overflowY: 'auto',
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            background: t.bgCard,
          }}
        >
          {filtrados.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => pick(o.value)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                borderBottom: `1px solid ${t.border}44`,
                padding: '8px 10px',
                cursor: 'pointer',
                color: t.text,
                fontSize: 'var(--cc-sm)',
              }}
            >
              <strong style={{ color: t.primary }}>{o.value}</strong>
              {o.descripcion ? (
                <span style={{ display: 'block', fontSize: 'var(--cc-caption)', color: t.textMuted }}>{o.descripcion}</span>
              ) : null}
            </button>
          ))}
        </div>
      )}
      {open && !cargando && busq.trim() && filtrados.length === 0 && (acta_rpo || capitulo) && (
        <button
          type="button"
          onClick={() => pick(busq.trim())}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            marginTop: 4,
            background: `${t.primary}12`,
            border: `1px solid ${t.primary}44`,
            borderRadius: 8,
            padding: '8px 10px',
            cursor: 'pointer',
            color: t.text,
            fontSize: 'var(--cc-sm)',
          }}
        >
          Usar ítem «<strong style={{ color: t.primary }}>{busq.trim()}</strong>»
        </button>
      )}
      {open && !cargando && busq.trim() && filtrados.length === 0 && !(acta_rpo || capitulo) && (
        <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginTop: 4 }}>
          Indique acta RPO o capítulo para buscar ítems.
        </div>
      )}
    </div>
  )
}
