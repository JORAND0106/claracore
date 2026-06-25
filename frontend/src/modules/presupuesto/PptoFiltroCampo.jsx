import { useMemo, useState } from 'react'
import {
  pptoFiltroPatchActivar,
  pptoFiltroPatchLimpiar,
  pptoFiltroPatchLista,
  pptoFiltroValoresLista,
  pptoMatchItemNumero,
} from './pptoFiltroCatalogo'

const defaultCatalogHelpers = {
  filtroValoresLista: pptoFiltroValoresLista,
  filtroPatchLista: pptoFiltroPatchLista,
  filtroPatchLimpiar: pptoFiltroPatchLimpiar,
  filtroPatchActivar: pptoFiltroPatchActivar,
  matchItemNumero: pptoMatchItemNumero,
}

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

function normalizeOpts(raw, def) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((o) => {
      if (o != null && typeof o === 'object') {
        const v = String(o.item ?? o.value ?? o.capitulo ?? '').trim()
        if (!v) return null
        // Opciones ya armadas (Sicoe semana/acta: título + periodo aparte)
        if ('descripcion' in o) {
          const label = String(o.label ?? v).trim() || v
          const descripcion = String(o.descripcion ?? '').trim()
          return { value: v, label, descripcion: descripcion || undefined }
        }
        const desc = String(o.descripcion ?? o.label ?? '').trim()
        return { value: v, label: desc && desc !== v ? `${v} — ${desc}` : v, descripcion: desc }
      }
      const s = String(o ?? '').trim()
      return s ? { value: s, label: s } : null
    })
    .filter(Boolean)
}

function TagsLista({ lista, onRemove, t, labelFn }) {
  if (!lista.length) return null
  const tagStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    background: t.primary + '18',
    border: `1px solid ${t.primary}44`,
    borderRadius: 12,
    padding: '2px 8px',
    fontSize: 'var(--cc-caption)',
    color: t.text,
    maxWidth: '100%',
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
      {lista.map((v) => (
        <span key={v} style={tagStyle} title={String(v)}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
            {labelFn ? labelFn(v) : v}
          </span>
          <button
            type="button"
            onClick={() => onRemove(v)}
            style={{ background: 'transparent', border: 'none', color: t.textMuted, cursor: 'pointer', padding: 0, flexShrink: 0 }}
            aria-label={`Quitar ${v}`}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  )
}

function ItemPickerInline({ opts, lista, onChangeLista, t, allowFreeText = false, placeholder = 'Buscar ítem…' }) {
  const [busq, setBusq] = useState('')
  const [open, setOpen] = useState(false)

  const disponibles = useMemo(
    () => opts.filter((o) => !lista.some((v) => pptoMatchItemNumero(v, o.value))),
    [opts, lista],
  )

  const filtrados = useMemo(() => {
    const q = busq.trim().toLowerCase()
    if (!q) return []
    return disponibles.filter(
      (o) =>
        o.value.toLowerCase().includes(q) ||
        (o.descripcion || '').toLowerCase().includes(q),
    )
  }, [disponibles, busq])

  const pick = (val) => {
    if (!val || lista.some((v) => pptoMatchItemNumero(v, val))) return
    onChangeLista([...lista, val])
    setBusq('')
    setOpen(false)
  }

  return (
    <div>
      <TagsLista lista={lista} onRemove={(v) => onChangeLista(lista.filter((x) => x !== v))} t={t} />
      <input
        value={busq}
        onChange={(e) => { setBusq(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        style={inp(t)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          const q = busq.trim()
          if (filtrados[0]) pick(filtrados[0].value)
          else if (allowFreeText && q && !lista.some((v) => pptoMatchItemNumero(v, q))) {
            onChangeLista([...lista, q])
            setBusq('')
            setOpen(false)
          }
        }}
      />
      {!busq.trim() && lista.length === 0 && (
        <div style={{ marginTop: 4, fontSize: 'var(--cc-caption)', color: t.textMuted }}>
          Escriba el número o descripción del ítem para ver opciones.
        </div>
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
    </div>
  )
}

function AutocompleteSingle({ opts, value, onChange, t, placeholder }) {
  const [busq, setBusq] = useState('')
  const [open, setOpen] = useState(false)

  const valStr = String(value ?? '').trim()
  const selected = opts.find((o) => String(o.value) === valStr)

  const filtrados = useMemo(() => {
    const q = (open ? busq : valStr).trim().toLowerCase()
    const base = q
      ? opts.filter(
          (o) =>
            o.value.toLowerCase().includes(q) ||
            (o.label || '').toLowerCase().includes(q),
        )
      : opts
    return base.slice(0, 50)
  }, [opts, busq, valStr, open])

  const pick = (val) => {
    onChange(String(val ?? '').trim())
    setBusq('')
    setOpen(false)
  }

  const display = open
    ? busq
    : selected
      ? (selected.descripcion ? `${selected.label} — ${selected.descripcion}` : selected.label)
      : valStr

  return (
    <div>
      <input
        value={display}
        onChange={(e) => {
          setBusq(e.target.value)
          setOpen(true)
          onChange(e.target.value)
        }}
        onFocus={() => {
          setOpen(true)
          setBusq(valStr)
        }}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
        placeholder={placeholder || 'Escribir o elegir…'}
        style={inp(t)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && filtrados[0]) {
            e.preventDefault()
            pick(filtrados[0].value)
          }
          if (e.key === 'Escape') setOpen(false)
        }}
      />
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
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o.value)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: String(o.value) === valStr ? `${t.primary}12` : 'transparent',
                border: 'none',
                borderBottom: `1px solid ${t.border}44`,
                padding: '8px 10px',
                cursor: 'pointer',
                color: t.text,
                fontSize: 'var(--cc-sm)',
              }}
            >
              <strong style={{ color: t.primary }}>{o.label || o.value}</strong>
              {o.descripcion ? (
                <span style={{ display: 'block', fontSize: 'var(--cc-caption)', color: t.textMuted, fontWeight: 400 }}>
                  {o.descripcion}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function MultiSelectAdd({ opts, lista, onChangeLista, t, labelFn }) {
  const [pickAdd, setPickAdd] = useState('')

  const disponibles = useMemo(
    () => opts.filter((o) => !lista.includes(o.value)),
    [opts, lista],
  )

  const agregar = (val) => {
    const v = String(val ?? '').trim()
    if (!v || lista.includes(v)) return
    onChangeLista([...lista, v])
    setPickAdd('')
  }

  return (
    <div>
      <TagsLista
        lista={lista}
        onRemove={(v) => onChangeLista(lista.filter((x) => x !== v))}
        t={t}
        labelFn={labelFn}
      />
      <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
        <select
          value={pickAdd}
          onChange={(e) => setPickAdd(e.target.value)}
          style={{ ...inp(t), flex: 1, minWidth: 0 }}
        >
          <option value="">— Elegir y agregar —</option>
          {disponibles.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={!pickAdd}
          onClick={() => agregar(pickAdd)}
          title="Agregar valor"
          style={{
            flexShrink: 0,
            minWidth: 40,
            background: t.primary,
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontWeight: 700,
            fontSize: 'var(--cc-md)',
            cursor: pickAdd ? 'pointer' : 'not-allowed',
            opacity: pickAdd ? 1 : 0.45,
          }}
        >
          +
        </button>
      </div>
    </div>
  )
}

/**
 * Campo de filtro inline (modal).
 */
export default function PptoFiltroCampo({ def, f, onChange, t, opciones, itemLabels, catalogHelpers }) {
  const h = catalogHelpers || defaultCatalogHelpers
  const lista = h.filtroValoresLista(def, f)

  const opts = useMemo(() => {
    if (def.key === 'item') {
      return normalizeOpts(opciones.items_opciones || opciones.items || [], def)
    }
    const raw = def.opcionesKey ? (opciones[def.opcionesKey] || []) : []
    return normalizeOpts(raw, def)
  }, [def, opciones])

  const patchLista = (nextLista) => {
    onChange({ ...h.filtroPatchLista(def, nextLista), ...h.filtroPatchActivar(def) })
  }

  const limpiarCampo = () => {
    onChange(h.filtroPatchLimpiar(def))
  }

  const valorSelect = def.tipo === 'select' || def.tipo === 'boolean'
    ? String(f[def.campoFObra] ?? '')
    : ''

  const labelItem = (v) => (def.key === 'item' && itemLabels?.[v] ? itemLabels[v] : v)

  return (
    <div style={{ marginBottom: 0, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
        <label style={{ fontSize: 'var(--cc-sm)', fontWeight: 700, color: t.text }}>{def.label}</label>
        {lista.length > 0 || valorSelect || (def.tipo === 'autocomplete' && String(f[def.campoFObra] ?? '').trim()) ? (
          <button
            type="button"
            onClick={limpiarCampo}
            style={{ background: 'transparent', border: 'none', color: t.textMuted, fontSize: 'var(--cc-caption)', cursor: 'pointer', textDecoration: 'underline', flexShrink: 0 }}
          >
            Limpiar
          </button>
        ) : null}
      </div>

      {(def.tipo === 'select_multi' || def.key === 'item') && (
        def.key === 'item' ? (
          <ItemPickerInline
            opts={opts}
            lista={lista}
            onChangeLista={patchLista}
            t={t}
            allowFreeText
            placeholder="Escriba para buscar ítem…"
          />
        ) : (
          <MultiSelectAdd opts={opts} lista={lista} onChangeLista={patchLista} t={t} labelFn={labelItem} />
        )
      )}

      {(def.tipo === 'rango_numerico' || def.key === 'abs_inicio') && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={f[def.campoFObra] ?? ''}
            onChange={(e) => onChange({ [def.campoFObra]: e.target.value, ...h.filtroPatchActivar(def) })}
            placeholder="Desde"
            style={inp(t)}
          />
          <span style={{ color: t.textMuted, flexShrink: 0 }}>–</span>
          <input
            value={f[def.campoFObraHasta] ?? ''}
            onChange={(e) => onChange({ [def.campoFObraHasta]: e.target.value, ...h.filtroPatchActivar(def) })}
            placeholder="Hasta"
            style={inp(t)}
          />
        </div>
      )}

      {def.tipo === 'text' && (
        <input
          value={f[def.campoFObra] ?? ''}
          onChange={(e) => onChange({ [def.campoFObra]: e.target.value, ...h.filtroPatchActivar(def) })}
          style={inp(t)}
          placeholder={def.key === 'pk_id' ? 'Ej. PK o ID' : ''}
        />
      )}

      {def.tipo === 'autocomplete' && (
        <AutocompleteSingle
          opts={opts}
          value={f[def.campoFObra] ?? ''}
          onChange={(v) => onChange({ [def.campoFObra]: v, ...h.filtroPatchActivar(def) })}
          t={t}
          placeholder={def.key === 'semana' ? 'Nº de semana…' : def.key === 'acta_rpo' ? 'Nº acta RPO…' : 'Escribir o elegir…'}
        />
      )}

      {def.tipo === 'select' && (
        <select
          value={valorSelect}
          onChange={(e) => onChange({ [def.campoFObra]: e.target.value, ...h.filtroPatchActivar(def) })}
          style={inp(t)}
        >
          <option value="">— Todos —</option>
          {opts.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}

      {def.tipo === 'boolean' && (
        <select
          value={valorSelect}
          onChange={(e) => {
            const v = e.target.value
            onChange({
              [def.campoFObra]: v === 'true' ? true : v === 'false' ? false : '',
              ...h.filtroPatchActivar(def),
            })
          }}
          style={inp(t)}
        >
          <option value="">—</option>
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
      )}
    </div>
  )
}
