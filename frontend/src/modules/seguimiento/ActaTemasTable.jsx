import { htmlToPlainText, isRichTextEmpty } from './richTextUtils'
import { imagenSrc, openImageInNewTab } from './imagenUtils'

function iconSvgProps(size = 16) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }
}

function IconEdit() {
  return (
    <svg {...iconSvgProps()}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function IconClip() {
  return (
    <svg {...iconSvgProps()}>
      <path d="m21.4 11.6-8.8 8.8a5 5 0 0 1-7.1-7.1l9.2-9.2a3.2 3.2 0 0 1 4.5 4.5l-9.2 9.2a1.4 1.4 0 0 1-2-2l8.2-8.2" />
    </svg>
  )
}

function IconPlus() {
  return (
    <svg {...iconSvgProps()}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )
}

function iconBtn(t) {
  return {
    width: 30,
    height: 30,
    padding: 0,
    flex: '0 0 auto',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    cursor: 'pointer',
    border: `1px solid ${t.border}`,
    background: 'transparent',
    color: t.text,
  }
}

function truncate(text, max = 90) {
  const s = String(text || '').replace(/\s+/g, ' ').trim()
  if (!s) return '—'
  if (s.length <= max) return s
  return `${s.slice(0, max - 1).trim()}…`
}

/**
 * Tabla compacta de Temas (ideas) del acta.
 * El diligenciamiento completo se abre en TemaEditorModal vía onOpenTema.
 */
export default function ActaTemasTable({
  t,
  ideas = [],
  soloLectura = false,
  canCrearCompromiso = false,
  saving = false,
  viewportCompact = false,
  onOpenTema,
  onAgregarTema,
  onGenerarCompromiso,
  onVerAdjuntos,
}) {
  return (
    <div className="cc-seguim-temas-table">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
        {!soloLectura && (
          <button type="button" style={primary(t)} onClick={() => onAgregarTema?.()}>
            + Agregar tema
          </button>
        )}
      </div>
      {!ideas.length ? (
        <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>
          No hay temas. Agregue uno para redactar con el editor enriquecido.
        </div>
      ) : (
        <div
          className="cc-seguim-table-scroll"
          style={{
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            border: `1px solid ${t.border}`,
            borderRadius: 10,
            background: t.bgCard || t.bg || 'transparent',
          }}
        >
          <table
            className="cc-seguim-table cc-seguim-table--sheet"
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 'var(--cc-sm)',
              minWidth: viewportCompact ? 640 : 760,
              background: 'transparent',
            }}
          >
            <thead>
              <tr style={{ background: t.bg || `${t.primary}08`, color: t.textMuted, textAlign: 'left' }}>
                <th style={th}>#</th>
                <th style={th}>Interviniente</th>
                <th style={{ ...th, minWidth: 180 }}>Tema</th>
                <th style={{ ...th, textAlign: 'center' }}>Adjuntos</th>
                <th style={{ ...th, textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {ideas.map((idea, idx) => {
                const n = (idea.orden != null && idea.orden !== '' ? Number(idea.orden) : idx) + 1
                const titulo = String(idea.titulo || '').trim()
                const plano = htmlToPlainText(idea.texto || '')
                const preview = titulo || truncate(plano, 100)
                const imgs = Array.isArray(idea.imagenes) ? idea.imagenes : []
                const empty = isRichTextEmpty(idea.texto)
                return (
                  <tr
                    key={idea._key || idea.id || `idea-${idx}`}
                    style={{
                      borderTop: `1px solid ${t.border}`,
                      background: t.bgCard || 'transparent',
                      cursor: 'pointer',
                    }}
                    onClick={() => onOpenTema?.(idx)}
                    title="Abrir diligenciamiento del tema"
                  >
                    <td data-label="#" style={{ ...td, fontWeight: 700, color: t.textMuted }}>{n}</td>
                    <td data-label="Interviniente" style={td}>
                      <span style={{ color: t.text }}>
                        {String(idea.quien_dijo || '').trim() || '—'}
                      </span>
                    </td>
                    <td data-label="Tema" style={{ ...td, maxWidth: 280 }} title={plano || titulo}>
                      <div style={{ fontWeight: 600, color: t.text, lineHeight: 1.35 }}>{preview}</div>
                      {titulo && plano && plano !== titulo && (
                        <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginTop: 2 }}>
                          {truncate(plano, 80)}
                        </div>
                      )}
                    </td>
                    <td data-label="Adjuntos" style={{ ...td, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        style={{
                          ...iconBtn(t),
                          position: 'relative',
                          opacity: imgs.length ? 1 : 0.4,
                        }}
                        title={imgs.length ? `Ver ${imgs.length} adjunto(s)` : 'Sin adjuntos'}
                        aria-label="Ver adjuntos del tema"
                        disabled={!imgs.length}
                        onClick={() => onVerAdjuntos?.(idx)}
                      >
                        <IconClip />
                        {imgs.length > 0 && (
                          <span style={{
                            position: 'absolute',
                            right: 2,
                            bottom: 2,
                            fontSize: 9,
                            fontWeight: 800,
                            color: t.primary,
                            lineHeight: 1,
                          }}
                          >
                            {imgs.length}
                          </span>
                        )}
                      </button>
                    </td>
                    <td data-label="Acciones" style={{ ...td, whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'inline-flex', gap: 4 }}>
                        <button
                          type="button"
                          style={iconBtn(t)}
                          title="Redactar / editar tema"
                          aria-label="Editar tema"
                          onClick={() => onOpenTema?.(idx)}
                        >
                          <IconEdit />
                        </button>
                        {canCrearCompromiso && !soloLectura && (
                          <button
                            type="button"
                            style={iconBtn(t)}
                            title="Generar compromiso desde este tema"
                            aria-label="Generar compromiso"
                            disabled={saving || empty}
                            onClick={() => onGenerarCompromiso?.(idx)}
                          >
                            <IconPlus />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Mini galería de adjuntos de un tema (esquemas/gráficos). */
export function TemaAdjuntosPanel({ t, imagenes = [], onClose, viewportCompact = false }) {
  const imgs = Array.isArray(imagenes) ? imagenes : []
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 12200,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex',
        alignItems: viewportCompact ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: viewportCompact ? 0 : 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div style={{
        width: viewportCompact ? '100%' : 'min(520px, 96vw)',
        maxHeight: '90vh',
        overflow: 'auto',
        background: t.bgCard,
        borderRadius: viewportCompact ? '12px 12px 0 0' : 12,
        border: `1px solid ${t.border}`,
        padding: 16,
        boxShadow: t.shadow,
      }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, color: t.text }}>Adjuntos del tema</div>
          <button type="button" onClick={onClose} style={ghost(t)}>Cerrar</button>
        </div>
        {imgs.length === 0 ? (
          <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>Sin adjuntos.</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {imgs.map((im, i) => {
              const src = imagenSrc(im)
              return (
                <button
                  key={`${im.blob_path || im.nombre || 'img'}-${i}`}
                  type="button"
                  title={im.nombre || 'Ver'}
                  onClick={() => openImageInNewTab(im)}
                  style={{
                    width: 120,
                    height: 96,
                    padding: 0,
                    border: `1px solid ${t.border}`,
                    borderRadius: 8,
                    background: t.bg || '#fff',
                    overflow: 'hidden',
                    cursor: src ? 'pointer' : 'default',
                  }}
                >
                  {src ? (
                    <img src={src} alt={im.nombre || 'Adjunto'} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <span style={{ fontSize: 11, color: t.textMuted }}>{im.nombre || 'Sin vista'}</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const th = { padding: '7px 8px', fontWeight: 700, whiteSpace: 'nowrap', fontSize: 'var(--cc-xs)' }
const td = { padding: '6px 8px', verticalAlign: 'middle', color: 'inherit' }

function primary(t) {
  return { border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', background: t.primary, color: '#fff', fontWeight: 700, fontSize: 'var(--cc-sm)' }
}
function ghost(t) {
  return { border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 12px', cursor: 'pointer', background: 'transparent', color: t.text, fontSize: 'var(--cc-sm)' }
}
