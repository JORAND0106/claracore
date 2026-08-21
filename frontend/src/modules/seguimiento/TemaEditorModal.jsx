import QuienDijoAutocomplete from './QuienDijoAutocomplete'
import TemaRichEditor from './TemaRichEditor'
import { imagenSrc, openImageInNewTab } from './imagenUtils'
import { isRichTextEmpty } from './richTextUtils'
import { seguimientoModalOverlayStyle, seguimientoModalSheetStyle } from './seguimientoShared'

function normalizeIdeaImagenes(raw) {
  return Array.isArray(raw) ? raw.filter(Boolean) : []
}

/**
 * Popup ancho para diligenciar un tema completo (reutiliza el editor enriquecido existente).
 */
export default function TemaEditorModal({
  t,
  idea,
  ideaIdx,
  soloLectura = false,
  canCrearCompromiso = false,
  saving = false,
  asistenteOpciones = [],
  viewportCompact = false,
  onClose,
  onPatch,
  onAddImagen,
  onRemoveImagen,
  onPasteImage,
  onOpenClara,
  onOpenEsquema,
  onGenerarCompromiso,
  onQuitar,
}) {
  const imgs = normalizeIdeaImagenes(idea?.imagenes)

  return (
    <div
      role="dialog"
      aria-modal="true"
      className={viewportCompact ? 'cc-seguim-modal-overlay cc-seguim-modal-overlay--compact' : 'cc-seguim-modal-overlay'}
      style={{ ...seguimientoModalOverlayStyle(viewportCompact), zIndex: 12150 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div
        className={viewportCompact ? 'cc-seguim-modal-sheet' : 'cc-seguim-modal-sheet--desktop'}
        style={{
          ...seguimientoModalSheetStyle(viewportCompact, { wide: true }),
          width: viewportCompact ? '100%' : 'min(960px, 98vw)',
          background: t.bgCard,
          border: viewportCompact ? 'none' : `1px solid ${t.border}`,
          boxShadow: t.shadow,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 700, fontSize: 'var(--cc-title)', color: t.text }}>
            Tema {(idea?.orden != null ? Number(idea.orden) : ideaIdx) + 1}
            {idea?.titulo ? `: ${idea.titulo}` : ''}
          </div>
          <button type="button" onClick={onClose} style={ghost(t)}>Cerrar</button>
        </div>

        <div onPaste={(e) => onPasteImage?.(e)}>
          <Field t={t} label="Interviniente">
            <QuienDijoAutocomplete
              t={t}
              disabled={soloLectura}
              value={idea?.quien_dijo || ''}
              options={asistenteOpciones}
              placeholder={asistenteOpciones.length
                ? 'Seleccione un asistente o digite el nombre…'
                : 'Registre asistentes o digite el nombre…'}
              style={inp(t)}
              onChange={(quien_dijo) => onPatch?.({ quien_dijo })}
            />
          </Field>

          <TemaRichEditor
            t={t}
            value={idea?.texto || ''}
            editable={!soloLectura}
            placeholder=""
            onChange={(html) => onPatch?.({ texto: html })}
            onPasteImage={(file) => {
              if (soloLectura || !file) return
              const named = new File(
                [file],
                file.name || `captura-${Date.now()}.png`,
                { type: file.type || 'image/png' },
              )
              onAddImagen?.(named)
            }}
          />

          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 'var(--cc-xs)', fontWeight: 700, color: t.textMuted }}>
                Esquemas y gráficos
              </div>
              {!soloLectura && imgs.length < 8 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <label style={{ ...ghost(t), display: 'inline-flex', alignItems: 'center', cursor: 'pointer', margin: 0 }}>
                    + Adjuntar
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) onAddImagen?.(f)
                        e.target.value = ''
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    style={ghost(t)}
                    title="Abrir editor de esquema"
                    onClick={() => onOpenEsquema?.()}
                  >
                    Dibujar esquema
                  </button>
                </div>
              )}
            </div>
            {imgs.length === 0 ? (
              <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted }}>
                Opcional: adjuntar archivo, pegar captura (Ctrl+V) o dibujar.
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {imgs.map((im, imgIdx) => {
                  const src = imagenSrc(im)
                  return (
                    <div
                      key={`${im.blob_path || im.nombre || 'img'}-${imgIdx}`}
                      style={{ width: 88, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}
                    >
                      <button
                        type="button"
                        title={im.nombre || 'Ver imagen'}
                        onClick={() => openImageInNewTab(im)}
                        style={{
                          width: 88,
                          height: 72,
                          padding: 0,
                          border: `1px solid ${t.border}`,
                          borderRadius: 8,
                          background: t.bg || '#fff',
                          overflow: 'hidden',
                          cursor: src ? 'pointer' : 'default',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {src ? (
                          <img src={src} alt={im.nombre || 'Esquema'} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        ) : (
                          <span style={{ fontSize: 10, color: t.textMuted, padding: 4 }}>Sin vista</span>
                        )}
                      </button>
                      <div style={{
                        fontSize: 10,
                        color: t.textMuted,
                        maxWidth: 88,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      >
                        {im.pending ? 'Pendiente' : (im.nombre || 'Esquema')}
                      </div>
                      {!soloLectura && (
                        <button
                          type="button"
                          style={{ ...ghost(t), padding: '2px 8px', fontSize: 11 }}
                          onClick={() => onRemoveImagen?.(imgIdx)}
                        >
                          Quitar
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            {!soloLectura && (
              <button type="button" style={ghost(t)} onClick={() => onOpenClara?.()}>
                Redactar con Clara
              </button>
            )}
            {!soloLectura && canCrearCompromiso && (
              <button
                type="button"
                style={primary(t)}
                disabled={saving || isRichTextEmpty(idea?.texto)}
                onClick={() => onGenerarCompromiso?.()}
              >
                Generar compromiso
              </button>
            )}
            {!soloLectura && (
              <button
                type="button"
                style={{ ...ghost(t), color: 'var(--cc-color-danger,#b91c1c)', borderColor: 'var(--cc-color-danger,#b91c1c)' }}
                onClick={() => {
                  if (!window.confirm('¿Quitar este tema del acta?')) return
                  onQuitar?.()
                }}
              >
                Quitar tema
              </button>
            )}
            <button type="button" style={{ ...ghost(t), marginLeft: 'auto' }} onClick={onClose}>
              Listo
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ t, label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 'var(--cc-label)', color: t.textMuted, fontWeight: 600, marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function inp(t) {
  return {
    width: '100%', boxSizing: 'border-box', fontSize: 'var(--cc-input)',
    padding: '8px 10px', borderRadius: 8, border: `1px solid ${t.border}`,
    background: t.bg || '#fff', color: t.text,
  }
}
function primary(t) {
  return { border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', background: t.primary, color: '#fff', fontWeight: 700, fontSize: 'var(--cc-sm)' }
}
function ghost(t) {
  return { border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 12px', cursor: 'pointer', background: 'transparent', color: t.text, fontSize: 'var(--cc-sm)' }
}
