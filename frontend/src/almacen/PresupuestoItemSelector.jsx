import { useEffect, useMemo, useRef, useState } from 'react'
import { AlmacenFieldLabel, useAlmacenApi, useAlmacenTheme } from './almacenShared'

export function normPptoItem(item) {
  return String(item || '').trim().replace(/\.+$/, '')
}

function itemLabel(p) {
  const desc = (p.descripcion || '').trim()
  const short = desc.length > 48 ? `${desc.slice(0, 48)}…` : desc
  return `${p.item} — ${short}`
}

export default function PresupuestoItemSelector({
  capitulo,
  item,
  onChange,
  disabled,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const [capitulos, setCapitulos] = useState([])
  const [itemsCap, setItemsCap] = useState([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [itemQuery, setItemQuery] = useState('')
  const [open, setOpen] = useState(false)
  const blurTimer = useRef(null)

  useEffect(() => {
    api.getListadoCapitulos().then(setCapitulos).catch(() => setCapitulos([]))
  }, [api])

  useEffect(() => {
    if (!capitulo) {
      setItemsCap([])
      return
    }
    setLoadingItems(true)
    api.getListadoItems(capitulo)
      .then(setItemsCap)
      .catch(() => setItemsCap([]))
      .finally(() => setLoadingItems(false))
  }, [api, capitulo])

  useEffect(() => {
    if (!item) {
      setItemQuery('')
      return
    }
    const row = itemsCap.find((p) => normPptoItem(p.item) === normPptoItem(item))
    setItemQuery(row ? itemLabel(row) : String(item))
  }, [item, itemsCap])

  const filtered = useMemo(() => {
    const q = itemQuery.trim().toLowerCase()
    if (!q) return itemsCap.slice(0, 40)
    return itemsCap.filter((p) => {
      const hay = `${p.item} ${p.descripcion || ''}`.toLowerCase()
      return hay.includes(q)
    }).slice(0, 40)
  }, [itemsCap, itemQuery])

  const pickItem = (p) => {
    onChange?.({ capitulo, item: p.item })
    setItemQuery(itemLabel(p))
    setOpen(false)
  }

  const onCapChange = (cap) => {
    onChange?.({ capitulo: cap, item: '' })
    setItemQuery('')
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 0.9fr) minmax(160px, 1.4fr)', gap: 8 }}>
      <div>
        <AlmacenFieldLabel icon="📂" label="Capítulo" compact />
        <select
          style={{ ...ui.input, padding: '6px 8px', fontSize: 'var(--cc-sm)' }}
          value={capitulo || ''}
          disabled={disabled}
          onChange={(e) => onCapChange(e.target.value)}
        >
          <option value="">Capítulo…</option>
          {capitulos.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div style={{ position: 'relative' }}>
        <AlmacenFieldLabel icon="📋" label="Ítem de cobro" compact ayuda="Escriba número o descripción del ítem." />
        <input
          style={{ ...ui.input, padding: '6px 8px', fontSize: 'var(--cc-sm)' }}
          value={itemQuery}
          disabled={disabled || !capitulo || loadingItems}
          placeholder={!capitulo ? 'Elija capítulo' : loadingItems ? 'Cargando…' : 'Buscar ítem…'}
          onChange={(e) => {
            setItemQuery(e.target.value)
            setOpen(true)
            if (!e.target.value.trim()) onChange?.({ capitulo, item: '' })
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            clearTimeout(blurTimer.current)
            blurTimer.current = setTimeout(() => setOpen(false), 160)
          }}
        />
        {open && !disabled && capitulo && filtered.length > 0 && (
          <div style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '100%',
            marginTop: 2,
            zIndex: 30,
            maxHeight: 160,
            overflowY: 'auto',
            background: '#fff',
            border: `1px solid ${ui.textMuted}44`,
            borderRadius: 6,
            boxShadow: '0 4px 12px #0002',
          }}
          >
            {filtered.map((p) => (
              <button
                key={normPptoItem(p.item)}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickItem(p)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 8px',
                  border: 'none',
                  borderBottom: '1px solid #eee',
                  background: normPptoItem(p.item) === normPptoItem(item) ? `${ui.accentSoft}` : 'transparent',
                  cursor: 'pointer',
                  fontSize: 'var(--cc-xs)',
                }}
              >
                {itemLabel(p)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function findPresupuestoId(pptoItems, capitulo, item, pkId) {
  if (!capitulo || !item || !pkId) return null
  const want = normPptoItem(item)
  const row = (pptoItems || []).find(
    (p) => p.capitulo === capitulo
      && normPptoItem(p.item) === want
      && String(p.pk_id || '') === String(pkId),
  )
  return row?.id ?? null
}
