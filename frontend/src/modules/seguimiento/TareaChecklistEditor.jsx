import { useRef, useState } from 'react'
import EsquemaEditorModal from './EsquemaEditorModal'
import { imagenSrc, openImageInNewTab } from './imagenUtils'

/** Editor de checklist: único contenedor de contenido de la tarea personal. */
export function newChecklistItem(partial = {}) {
  const id = partial.id || `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  return {
    id,
    texto: partial.texto || '',
    hecho: !!partial.hecho,
    fecha: partial.fecha || '',
    hora: partial.hora || '',
    imagen: partial.imagen || null,
    esquema: partial.esquema || null,
    notas: partial.notas || '',
    enlace: partial.enlace || '',
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
      esquema: it.esquema || null,
      notas: it.notas || it.comentario || '',
      enlace: it.enlace || it.link || '',
      orden: it.orden ?? i,
    }))
  }
  // Migración suave: descripción legacy → un sub-ítem (solo si existía)
  if ((item?.descripcion || '').trim()) {
    return [newChecklistItem({
      texto: item.descripcion,
      fecha: item.fecha_vencimiento ? String(item.fecha_vencimiento).slice(0, 10) : '',
      hora: item.hora_vencimiento ? String(item.hora_vencimiento).slice(0, 5) : '',
    })]
  }
  return []
}

export default function TareaChecklistEditor({
  t,
  value = [],
  onChange,
  disabled = false,
}) {
  // Controlado: no inventar ítems sintéticos en cada render (rompe el “agregar”)
  const items = Array.isArray(value) ? value : []
  const fileRefs = useRef({})
  const [esquemaIdx, setEsquemaIdx] = useState(null)

  const setAt = (idx, patch) => {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it))
    onChange?.(next)
  }

  const removeAt = (idx) => {
    onChange?.(items.filter((_, i) => i !== idx))
  }

  const add = () => {
    onChange?.([...items, newChecklistItem({ orden: items.length })])
  }

  const fileToSoporte = (file, idx) => {
    if (!file || !file.type?.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      setAt(idx, {
        imagen: {
          nombre: file.name || `captura-${Date.now()}.png`,
          data_uri: reader.result,
          mime_type: file.type || 'image/png',
          created_at: new Date().toISOString(),
          pending: true,
        },
      })
    }
    reader.readAsDataURL(file)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.length === 0 && (
        <div style={{
          padding: 14, borderRadius: 10, border: `1px dashed ${t.border}`,
          color: t.textMuted, fontSize: 'var(--cc-sm)',
        }}>
          Sin sub-ítems aún. Puede guardar solo con el título y agregar la checklist después.
        </div>
      )}

      {items.map((it, idx) => {
        const srcImg = imagenSrc(it.imagen)
        const srcEsquema = imagenSrc(it.esquema)
        return (
          <div
            key={it.id}
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
                <input
                  disabled={disabled}
                  value={it.texto}
                  onChange={(e) => setAt(idx, { texto: e.target.value })}
                  placeholder={`Título del sub-ítem ${idx + 1}`}
                  style={{
                    ...inp(t),
                    fontWeight: 600,
                    textDecoration: it.hecho ? 'line-through' : 'none',
                    opacity: it.hecho ? 0.75 : 1,
                  }}
                />

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: 8,
                  marginTop: 8,
                }}>
                  <div>
                    <label style={lbl(t)}>Fecha vencimiento</label>
                    <input type="date" disabled={disabled} value={it.fecha || ''} onChange={(e) => setAt(idx, { fecha: e.target.value })} style={inp(t)} />
                  </div>
                  <div>
                    <label style={lbl(t)}>Hora</label>
                    <input type="time" disabled={disabled} value={it.hora || ''} onChange={(e) => setAt(idx, { hora: e.target.value })} style={inp(t)} />
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10, alignItems: 'center' }}>
                  {!disabled && (
                    <>
                      <input
                        ref={(el) => { fileRefs.current[it.id] = el }}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) fileToSoporte(f, idx)
                          e.target.value = ''
                        }}
                      />
                      <button type="button" style={ghost(t)} onClick={() => fileRefs.current[it.id]?.click()}>
                        {srcImg ? 'Cambiar imagen' : 'Cargar imagen'}
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    style={ghost(t)}
                    disabled={!srcImg}
                    title={srcImg ? 'Abrir imagen de soporte' : 'Sin imagen de soporte'}
                    onClick={() => {
                      if (!openImageInNewTab(it.imagen)) {
                        window.alert('No se pudo abrir la imagen. Vuelva a cargarla o guarde el sub-ítem e intente de nuevo.')
                      }
                    }}
                  >
                    Ver imagen
                  </button>
                  {!disabled && (
                    <button type="button" style={primary(t)} onClick={() => setEsquemaIdx(idx)}>
                      Crear esquema
                    </button>
                  )}
                  {srcEsquema && (
                    <button
                      type="button"
                      style={ghost(t)}
                      onClick={() => {
                        if (!openImageInNewTab(it.esquema)) {
                          window.alert('No se pudo abrir el esquema.')
                        }
                      }}
                    >
                      Ver esquema
                    </button>
                  )}
                  {!disabled && srcImg && (
                    <button type="button" style={ghost(t)} onClick={() => setAt(idx, { imagen: null })}>Quitar imagen</button>
                  )}
                  {!disabled && srcEsquema && (
                    <button type="button" style={ghost(t)} onClick={() => setAt(idx, { esquema: null })}>Quitar esquema</button>
                  )}
                </div>

                {(srcImg || srcEsquema) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
                    {srcImg && (
                      <button type="button" onClick={() => openImageInNewTab(it.imagen)} style={thumbBtn(t)} title="Ver imagen">
                        <img src={srcImg} alt="soporte" style={thumbImg} />
                        <span style={thumbCap(t)}>Soporte</span>
                      </button>
                    )}
                    {srcEsquema && (
                      <button type="button" onClick={() => openImageInNewTab(it.esquema)} style={thumbBtn(t)} title="Ver esquema">
                        <img src={srcEsquema} alt="esquema" style={{ ...thumbImg, objectFit: 'contain', background: '#fff' }} />
                        <span style={thumbCap(t)}>Esquema</span>
                      </button>
                    )}
                  </div>
                )}

                <div style={{ marginTop: 10 }}>
                  <label style={lbl(t)}>Notas / comentario</label>
                  <textarea
                    rows={2}
                    disabled={disabled}
                    value={it.notas || ''}
                    onChange={(e) => setAt(idx, { notas: e.target.value })}
                    placeholder="Comentario propio de este sub-ítem…"
                    style={{ ...inp(t), resize: 'vertical' }}
                  />
                </div>
                <div style={{ marginTop: 8 }}>
                  <label style={lbl(t)}>Enlace</label>
                  <input
                    type="url"
                    disabled={disabled}
                    value={it.enlace || ''}
                    onChange={(e) => setAt(idx, { enlace: e.target.value })}
                    placeholder="https://…"
                    style={inp(t)}
                  />
                  {!!(it.enlace || '').trim() && (
                    <a
                      href={(it.enlace || '').trim()}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 'var(--cc-xs)', color: t.primary, display: 'inline-block', marginTop: 4 }}
                    >
                      Abrir enlace
                    </a>
                  )}
                </div>
              </div>
              {!disabled && (
                <button type="button" style={ghost(t)} title="Quitar sub-ítem" onClick={() => removeAt(idx)}>✕</button>
              )}
            </div>
          </div>
        )
      })}

      {!disabled && (
        <button type="button" style={{ ...primary(t), alignSelf: 'flex-start' }} onClick={add}>
          + Agregar sub-ítem
        </button>
      )}

      {esquemaIdx != null && items[esquemaIdx] && (
        <EsquemaEditorModal
          t={t}
          title={`Esquema · ${items[esquemaIdx].texto || `Sub-ítem ${esquemaIdx + 1}`}`}
          initialDataUri={imagenSrc(items[esquemaIdx].esquema)}
          onClose={() => setEsquemaIdx(null)}
          onSave={(dataUrl) => {
            setAt(esquemaIdx, {
              esquema: {
                nombre: `esquema-${items[esquemaIdx].id || Date.now()}.png`,
                data_uri: dataUrl,
                mime_type: 'image/png',
                created_at: new Date().toISOString(),
                pending: true,
                kind: 'esquema',
              },
            })
            setEsquemaIdx(null)
          }}
        />
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
function primary(t) {
  return {
    border: 'none', borderRadius: 8, padding: '8px 12px',
    cursor: 'pointer', background: t.primary, color: '#fff', fontWeight: 700, fontSize: 'var(--cc-sm)',
  }
}
const thumbImg = { display: 'block', width: 112, height: 72, objectFit: 'cover' }
function thumbBtn(t) {
  return {
    padding: 0, border: `1px solid ${t.border}`, borderRadius: 6,
    background: 'transparent', cursor: 'pointer', overflow: 'hidden', textAlign: 'left',
  }
}
function thumbCap(t) {
  return { display: 'block', fontSize: 10, padding: '2px 6px', color: t.textMuted }
}
