/**
 * Selector de ítem de cobro en la planilla.
 * Usa el mismo listado que SICOE Obra (`listado-precios-busqueda`).
 * No se imprime en PDF ni Excel: solo vive en esta tabla.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { API_BASE } from '../../../apiBase'
import CcAnchoredListbox from '../../CcAnchoredListbox'
import { etiquetaItem } from './planillaTuberiaItemSicoe'
import { planillaSurfaceFromUi } from './planillaTuberiaTheme'

export default function PlanillaTuberiaItemCobro({
  contratoId,
  token,
  item,
  onSelect,
  disabled = false,
  heredado = false,
  tituloPermiso = '',
  ui = null,
  t = null,
}) {
  const reactId = useId().replace(/:/g, '')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [lista, setLista] = useState([])
  const [buscando, setBuscando] = useState(false)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)
  const etiqueta = etiquetaItem(item)
  const surf = planillaSurfaceFromUi(ui || { t: t || {} })
  const themeT = t || surf.t || {}

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (ev) => {
      if (wrapRef.current && !wrapRef.current.contains(ev.target)) {
        const tip = document.getElementById(`cc-anchored-item-cobro-${reactId}`)
        if (tip && tip.contains(ev.target)) return
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open, reactId])

  useEffect(() => {
    if (!open || disabled || !contratoId) return undefined
    const texto = q.trim()
    if (texto.length < 1) {
      setLista([])
      return undefined
    }
    let cancel = false
    const timer = setTimeout(async () => {
      setBuscando(true)
      try {
        const p = new URLSearchParams({ q: texto })
        const res = await fetch(
          `${API_BASE}/sicoe-obra/${contratoId}/listado-precios-busqueda?${p.toString()}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        )
        const data = res.ok ? await res.json() : []
        if (!cancel) setLista(Array.isArray(data) ? data.slice(0, 30) : [])
      } catch {
        if (!cancel) setLista([])
      } finally {
        if (!cancel) setBuscando(false)
      }
    }, 280)
    return () => {
      cancel = true
      clearTimeout(timer)
    }
  }, [q, open, disabled, contratoId, token])

  if (heredado) {
    return (
      <span
        title={etiqueta ? `Mismo ítem de la línea a la que descuenta: ${etiqueta}` : 'Toma el ítem de la línea a la que descuenta'}
        style={{
          display: 'block',
          fontSize: 'var(--cc-xxs)',
          lineHeight: 1.2,
          color: etiqueta ? 'inherit' : surf.textMuted,
          maxWidth: 180,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {etiqueta || '—'}
      </span>
    )
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', minWidth: 120 }}>
      <input
        ref={inputRef}
        id={`item-cobro-${reactId}`}
        disabled={disabled}
        value={open ? q : etiqueta}
        placeholder={disabled ? 'Sin permiso' : 'Buscar ítem'}
        title={tituloPermiso || etiqueta || 'Ítem de cobro del listado de SICOE Obra'}
        onFocus={() => {
          if (disabled) return
          setQ(item?.item_numero || '')
          setOpen(true)
        }}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          height: 22,
          border: `1px solid ${surf.border}`,
          borderRadius: 4,
          padding: '0 4px',
          fontSize: 'var(--cc-xxs)',
          background: disabled ? surf.inputBg : surf.cardBg,
          color: surf.text,
        }}
      />
      <CcAnchoredListbox
        open={open && !disabled}
        anchorRef={inputRef}
        t={themeT}
        maxHeight={180}
        id={`cc-anchored-item-cobro-${reactId}`}
        data-testid="planilla-item-cobro-listbox"
      >
        {buscando && (
          <div style={{ padding: 6, fontSize: 11, color: surf.textMuted }}>Buscando…</div>
        )}
        {!buscando && lista.length === 0 && (
          <div style={{ padding: 6, fontSize: 11, color: surf.textMuted }}>Sin coincidencias</div>
        )}
        {lista.map((it) => (
          <button
            key={it.id || it.item_numero}
            type="button"
            role="option"
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect?.({
                item_listado_id: it.id,
                item_numero: it.item_numero,
                descripcion: it.descripcion,
                unidad: it.unidad,
                precio_unitario: it.precio_unitario,
                capitulo: it.capitulo,
              })
              setOpen(false)
              setQ('')
            }}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              border: 'none',
              background: 'transparent',
              padding: '4px 6px',
              cursor: 'pointer',
              fontSize: 11,
              color: surf.text,
            }}
          >
            <strong>{it.item_numero}</strong>
            {it.descripcion ? ` · ${it.descripcion}` : ''}
            {it.capitulo ? <span style={{ color: surf.textMuted }}> · {it.capitulo}</span> : ''}
          </button>
        ))}
      </CcAnchoredListbox>
    </div>
  )
}
