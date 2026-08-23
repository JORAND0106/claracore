import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  debeRegistrarTipoMaterialNuevo,
  filtrarTiposMaterial,
  mergeTiposMaterialOpts,
  normalizeTiposMaterialRows,
} from './materialTipoCatalogo.js'

/**
 * Autocompletado de «Tipo de material» — catálogo propio de Bitácora de Obra
 * por contrato (`seguimiento_bitacora_tipo_material`).
 *
 * Independiente del catálogo de insumos de Almacén: este componente solo llama
 * listBitacoraTiposMaterial / upsertBitacoraTipoMaterial.
 *
 * - Al escribir, el valor se propaga al padre (Guardar no pierde el texto).
 * - Al salir del campo con un valor nuevo, se registra en el catálogo Bitácora.
 * - El desplegable usa position:fixed (portal) para no quedar recortado por
 *   overflow:auto de la grilla Excel.
 */
export default function MaterialTipoCatalogSelect({
  t,
  api,
  value = '',
  onChange,
  disabled = false,
  placeholder = 'Buscar o registrar tipo…',
  inputStyle = null,
}) {
  const [q, setQ] = useState(value || '')
  const [allOpts, setAllOpts] = useState([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [aviso, setAviso] = useState('')
  const [menuBox, setMenuBox] = useState(null)
  const registeringRef = useRef(false)
  const inputRef = useRef(null)
  const allOptsRef = useRef([])

  const setOptsMerged = useCallback((incoming) => {
    setAllOpts((prev) => {
      const next = mergeTiposMaterialOpts(prev, incoming)
      allOptsRef.current = next
      return next
    })
  }, [])

  const loadCatalog = useCallback(async () => {
    if (!api?.listBitacoraTiposMaterial) {
      setAllOpts([])
      allOptsRef.current = []
      return
    }
    try {
      // Sin filtro: catálogo completo del contrato (solo Bitácora).
      const rows = await api.listBitacoraTiposMaterial('')
      const normalized = normalizeTiposMaterialRows(rows)
      setAllOpts(normalized)
      allOptsRef.current = normalized
    } catch {
      setAllOpts([])
      allOptsRef.current = []
    }
  }, [api])

  useEffect(() => {
    setQ(value || '')
  }, [value])

  useEffect(() => {
    void loadCatalog()
  }, [loadCatalog])

  const filtered = filtrarTiposMaterial(allOpts, q)

  const updateMenuBox = useCallback(() => {
    const el = inputRef.current
    if (!el || !open) {
      setMenuBox(null)
      return
    }
    const r = el.getBoundingClientRect()
    setMenuBox({
      top: r.bottom + 2,
      left: r.left,
      width: Math.max(r.width, 160),
    })
  }, [open])

  useLayoutEffect(() => {
    updateMenuBox()
  }, [updateMenuBox, filtered.length, q])

  useEffect(() => {
    if (!open) return undefined
    const onWin = () => updateMenuBox()
    window.addEventListener('resize', onWin)
    window.addEventListener('scroll', onWin, true)
    return () => {
      window.removeEventListener('resize', onWin)
      window.removeEventListener('scroll', onWin, true)
    }
  }, [open, updateMenuBox])

  const pick = (row) => {
    const nombre = row?.nombre || ''
    onChange?.(nombre)
    setQ(nombre)
    setOpen(false)
    setAviso('')
  }

  const registrarNuevo = async (nombre) => {
    const n = String(nombre || '').trim()
    if (!n || !api?.upsertBitacoraTipoMaterial) {
      onChange?.(n)
      setQ(n)
      return
    }
    if (registeringRef.current) return
    registeringRef.current = true
    setBusy(true)
    setAviso('')
    try {
      const row = await api.upsertBitacoraTipoMaterial({ nombre: n })
      if (row && row.nombre && row.ok !== false) {
        setOptsMerged([row])
        pick(row)
        setAviso('Tipo agregado al catálogo de Bitácora (este contrato).')
        void loadCatalog()
      } else if (row && row.ok === false) {
        onChange?.(n)
        setQ(n)
        setAviso(row.detail || 'No se pudo guardar en el catálogo; el valor quedó en el reporte.')
      } else {
        // Optimistic: conservar en sugerencias locales aunque la API no devuelva fila.
        setOptsMerged([{ id: `local-${n}`, nombre: n }])
        onChange?.(n)
        setQ(n)
      }
      setOpen(false)
    } catch (e) {
      onChange?.(n)
      setQ(n)
      setOpen(false)
      setAviso(e.message || 'No se pudo registrar el tipo en el catálogo de Bitácora')
    } finally {
      setBusy(false)
      registeringRef.current = false
    }
  }

  const onBlurCommit = () => {
    setTimeout(() => {
      setOpen(false)
      const decision = debeRegistrarTipoMaterialNuevo(q, value, allOptsRef.current)
      if (decision.action === 'clear') {
        onChange?.('')
        return
      }
      if (decision.action === 'pick') {
        pick(decision.row)
        return
      }
      onChange?.(decision.nombre)
      void registrarNuevo(decision.nombre)
    }, 150)
  }

  const inp = inputStyle || {
    background: t.bg,
    color: t.text,
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 'var(--cc-sm)',
    width: '100%',
    boxSizing: 'border-box',
  }

  const menu = open && menuBox && filtered.length > 0
    ? createPortal(
      <div
        role="listbox"
        style={{
          position: 'fixed',
          zIndex: 10050,
          top: menuBox.top,
          left: menuBox.left,
          width: menuBox.width,
          maxHeight: 200,
          overflow: 'auto',
          background: t.bgCard || t.bg || '#fff',
          border: `1px solid ${t.border}`,
          borderRadius: 6,
          boxShadow: '0 8px 24px rgba(0,0,0,0.16)',
        }}
      >
        {filtered.map((o) => (
          <button
            key={o.id != null ? String(o.id) : o.nombre}
            type="button"
            role="option"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(o)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '6px 8px',
              border: 'none',
              background: 'transparent',
              color: t.text,
              cursor: 'pointer',
              fontSize: 'var(--cc-sm)',
            }}
          >
            {o.nombre}
          </button>
        ))}
      </div>,
      document.body,
    )
    : null

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        disabled={disabled || busy}
        value={q}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          const v = e.target.value
          setQ(v)
          setOpen(true)
          setAviso('')
          onChange?.(v)
        }}
        onFocus={() => {
          setOpen(true)
          void loadCatalog()
        }}
        onBlur={onBlurCommit}
        style={inp}
      />
      {menu}
      {aviso ? (
        <div style={{
          marginTop: 4, fontSize: 10, color: t.textMuted, lineHeight: 1.3,
        }}
        >
          {aviso}
        </div>
      ) : null}
    </div>
  )
}
