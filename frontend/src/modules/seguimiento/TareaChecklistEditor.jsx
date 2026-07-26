/** Editor de checklist de tarea: texto, hecho, fecha/hora e imagen por sub-ítem. */
export function newChecklistItem(partial = {}) {
  return {
    id: partial.id || `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    texto: partial.texto || '',
    hecho: !!partial.hecho,
    fecha: partial.fecha || '',
    hora: partial.hora || '',
    imagen: partial.imagen || null,
    orden: partial.orden ?? 0,
  }
}

export function seedChecklistFromItem(item) {
  const libres = item?.campos_libres && typeof item.campos_libres === 'object' ? item.campos_libres : {}
  const raw = Array.isArray(libres.checklist) ? libres.checklist : []
  if (raw.length) {
    return raw.map((it, i) => newChecklistItem({
      id: it.id,
      texto: it.texto || '',
      hecho: !!it.hecho,
      fecha: it.fecha ? String(it.fecha).slice(0, 10) : '',
      hora: it.hora ? String(it.hora).slice(0, 5) : '',
      imagen: it.imagen || null,
      orden: it.orden ?? i,
    }))
  }
  if ((item?.descripcion || '').trim()) {
    return [newChecklistItem({
      texto: item.descripcion,
      fecha: item.fecha_vencimiento ? String(item.fecha_vencimiento).slice(0, 10) : '',
      hora: item.hora_vencimiento ? String(item.hora_vencimiento).slice(0, 5) : '',
    })]
  }
  return [newChecklistItem()]
}

function imagenSrc(im) {
  if (!im) return null
  return im.data_uri || im.url || im.blob_url || null
}

export default function TareaChecklistEditor({
  t,
  value = [],
  onChange,
  disabled = false,
  onPickImage,
}) {
  const items = Array.isArray(value) && value.length ? value : [newChecklistItem()]

  const setAt = (idx, patch) => {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it))
    onChange?.(next)
  }

  const removeAt = (idx) => {
    if (items.length <= 1) {
      onChange?.([newChecklistItem()])
      return
    }
    onChange?.(items.filter((_, i) => i !== idx))
  }

  const add = () => onChange?.([...items, newChecklistItem()])

  const fileToItem = (file, idx) => {
    if (!file || !file.type?.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const data_uri = reader.result
      const imagen = {
        nombre: file.name || `captura-${Date.now()}.png`,
        data_uri,
        mime_type: file.type || 'image/png',
        created_at: new Date().toISOString(),
        pending: true, // subir al guardar / crear
      }
      setAt(idx, { imagen })
      onPickImage?.(idx, imagen)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((it, idx) => {
        const src = imagenSrc(it.imagen)
        return (
          <div
            key={it.id || idx}
            style={{
              border: `1px solid ${t.border}`,
              borderRadius: 10,
              padding: 12,
              background: t.bg || `${t.primary}06`,
            }}
          >
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <input
                type="checkbox"
                checked={!!it.hecho}
                disabled={disabled}
                onChange={(e) => setAt(idx, { hecho: e.target.checked })}
                style={{ marginTop: 10, width: 18, height: 18, cursor: disabled ? 'default' : 'pointer' }}
                title="Hecho"
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <textarea
                  rows={2}
                  disabled={disabled}
                  value={it.texto}
                  onChange={(e) => setAt(idx, { texto: e.target.value })}
                  placeholder={`Sub-ítem ${idx + 1}: qué hay que hacer…`}
                  style={{
                    width: '100%', boxSizing: 'border-box', fontSize: 'var(--cc-input)',
                    padding: '8px 10px', borderRadius: 8, border: `1px solid ${t.border}`,
                    background: t.bgCard || '#fff', color: t.text, resize: 'vertical',
                    textDecoration: it.hecho ? 'line-through' : 'none',
                    opacity: it.hecho ? 0.75 : 1,
                  }}
                />
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: 8,
                  marginTop: 8,
                  alignItems: 'end',
                }}>
                  <div>
                    <label style={lbl(t)}>Fecha vencimiento</label>
                    <input
                      type="date"
                      disabled={disabled}
                      value={it.fecha || ''}
                      onChange={(e) => setAt(idx, { fecha: e.target.value })}
                      style={inp(t)}
                    />
                  </div>
                  <div>
                    <label style={lbl(t)}>Hora</label>
                    <input
                      type="time"
                      disabled={disabled}
                      value={it.hora || ''}
                      onChange={(e) => setAt(idx, { hora: e.target.value })}
                      style={inp(t)}
                    />
                  </div>
                  <div>
                    <label style={lbl(t)}>Captura / pantallazo</label>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={disabled}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) fileToItem(f, idx)
                        e.target.value = ''
                      }}
                      style={{ fontSize: 'var(--cc-xs)', color: t.text, width: '100%' }}
                    />
                  </div>
                </div>
                {src && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => window.open(src, '_blank', 'noopener,noreferrer')}
                      style={{
                        padding: 0, border: `1px solid ${t.border}`, borderRadius: 6,
                        background: 'transparent', cursor: 'pointer', overflow: 'hidden',
                      }}
                    >
                      <img src={src} alt={it.imagen?.nombre || ''} style={{ display: 'block', width: 120, height: 80, objectFit: 'cover' }} />
                    </button>
                    {!disabled && (
                      <button type="button" style={ghost(t)} onClick={() => setAt(idx, { imagen: null })}>
                        Quitar imagen
                      </button>
                    )}
                  </div>
                )}
              </div>
              {!disabled && (
                <button type="button" style={ghost(t)} title="Quitar sub-ítem" onClick={() => removeAt(idx)}>✕</button>
              )}
            </div>
          </div>
        )
      })}
      {!disabled && (
        <button type="button" style={ghost(t)} onClick={add}>+ Agregar sub-ítem</button>
      )}
    </div>
  )
}

function lbl(t) {
  return { display: 'block', fontSize: 'var(--cc-xs)', color: t.textMuted, fontWeight: 600, marginBottom: 4 }
}
function inp(t) {
  return {
    width: '100%', boxSizing: 'border-box', fontSize: 'var(--cc-input)',
    padding: '8px 10px', borderRadius: 8, border: `1px solid ${t.border}`,
    background: t.bgCard || t.bg || '#fff', color: t.text,
  }
}
function ghost(t) {
  return {
    border: `1px solid ${t.border}`, borderRadius: 8, padding: '6px 10px',
    cursor: 'pointer', background: 'transparent', color: t.text, fontSize: 'var(--cc-sm)',
  }
}
