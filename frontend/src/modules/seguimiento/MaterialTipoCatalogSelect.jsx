import { useCallback, useEffect, useRef, useState } from 'react'
import { debeRegistrarTipoMaterialNuevo } from './materialTipoCatalogo.js'

/**
 * Catálogo reutilizable de tipo de material por contrato.
 * - Al escribir, el valor se propaga al padre (para que Guardar no pierda el texto).
 * - Al salir del campo con un valor nuevo, se registra automáticamente en el catálogo.
 * - Si ya existe, se selecciona desde las sugerencias.
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
  const [opts, setOpts] = useState([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [aviso, setAviso] = useState('')
  const registeringRef = useRef(false)

  const load = useCallback(async (needle) => {
    if (!api?.listBitacoraTiposMaterial) {
      setOpts([])
      return
    }
    try {
      const rows = await api.listBitacoraTiposMaterial(needle || '')
      setOpts(Array.isArray(rows) ? rows : [])
    } catch {
      setOpts([])
    }
  }, [api])

  useEffect(() => {
    setQ(value || '')
  }, [value])

  useEffect(() => {
    if (!open) return undefined
    const tmr = setTimeout(() => { void load(q) }, 200)
    return () => clearTimeout(tmr)
  }, [q, open, load])

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
      if (row && row.nombre) {
        pick(row)
        setAviso('Tipo agregado al catálogo del contrato.')
        void load('')
      } else if (row && row.ok === false) {
        // Valor ya queda en el formulario; el catálogo falló (p. ej. migración pendiente).
        onChange?.(n)
        setQ(n)
        setAviso(row.detail || 'No se pudo guardar en el catálogo; el valor quedó en el reporte.')
      } else {
        onChange?.(n)
        setQ(n)
      }
      setOpen(false)
    } catch (e) {
      onChange?.(n)
      setQ(n)
      setOpen(false)
      setAviso(e.message || 'No se pudo registrar el tipo en el catálogo')
    } finally {
      setBusy(false)
      registeringRef.current = false
    }
  }

  const onBlurCommit = () => {
    setTimeout(() => {
      setOpen(false)
      const decision = debeRegistrarTipoMaterialNuevo(q, value, opts)
      if (decision.action === 'clear') {
        onChange?.('')
        return
      }
      if (decision.action === 'pick') {
        pick(decision.row)
        return
      }
      // Propagar siempre al padre y registrar en catálogo (upsert idempotente).
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

  return (
    <div style={{ position: 'relative' }}>
      <input
        disabled={disabled || busy}
        value={q}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value
          setQ(v)
          setOpen(true)
          setAviso('')
          // Mantener el padre sincronizado para que Guardar no pierda el texto.
          onChange?.(v)
        }}
        onFocus={() => { setOpen(true); void load(q) }}
        onBlur={onBlurCommit}
        style={inp}
      />
      {open && opts.length > 0 && (
        <div style={{
          position: 'absolute', zIndex: 40, left: 0, right: 0, top: '100%',
          marginTop: 2, maxHeight: 160, overflow: 'auto',
          background: t.bgCard || t.bg, border: `1px solid ${t.border}`, borderRadius: 6,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        }}>
          {opts.map((o) => (
            <button
              key={o.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '6px 8px', border: 'none', background: 'transparent',
                color: t.text, cursor: 'pointer', fontSize: 'var(--cc-sm)',
              }}
            >
              {o.nombre}
            </button>
          ))}
        </div>
      )}
      {aviso ? (
        <div style={{
          marginTop: 4, fontSize: 10, color: t.textMuted, lineHeight: 1.3,
        }}>
          {aviso}
        </div>
      ) : null}
    </div>
  )
}
