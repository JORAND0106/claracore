import { useClaraViewport, CLARA_BP } from '../useClaraViewport'
import CcModalBrandHeader from './CcModalBrandHeader'
import { logosContratoParaTarjeta } from '../utils/usuarioLogosContrato'

function columnasSelector(width) {
  if (width <= CLARA_BP.mobileMax) return 1
  if (width <= 900) return 2
  if (width <= 1100) return 3
  return 4
}

/**
 * Popup de selección de contrato al login (multi-contrato):
 * grilla ancha de tarjetas cuadradas con logos en miniatura.
 */
export default function ModalSelectorContrato({ t, contratos = [], onSelect }) {
  const { width } = useClaraViewport()
  const cols = columnasSelector(width)
  const modalWidth = width <= CLARA_BP.mobileMax ? '100%' : '960px'
  const pad = width <= CLARA_BP.mobileMax ? '20px' : '32px'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: t.overlay,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: width <= CLARA_BP.mobileMax ? 12 : 20,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="selector-contrato-titulo"
        style={{
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: 20,
          padding: pad,
          width: modalWidth,
          maxWidth: '96vw',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
          animation: 'modalIn 0.25s ease',
          boxSizing: 'border-box',
        }}
      >        <CcModalBrandHeader theme={t} />

        <div
          id="selector-contrato-titulo"
          style={{ fontSize: 'var(--cc-lg)', fontWeight: 700, color: t.primary, marginBottom: 6 }}
        >
          🏗️ Selecciona el contrato
        </div>
        <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginBottom: 18, lineHeight: 1.4 }}>
          Tienes acceso a varios contratos. Elige a cuál ingresar.
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gap: width <= CLARA_BP.mobileMax ? 10 : 14,
          }}
        >
          {(contratos || []).map((c) => {
            const logos = logosContratoParaTarjeta(c)
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect?.(c.id)}
                title={c.numero}
                style={{
                  aspectRatio: '1 / 1',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  justifyContent: 'space-between',
                  gap: 8,
                  width: '100%',
                  background: t.inputBg,
                  border: `1.5px solid ${t.border}`,
                  borderRadius: 14,
                  padding: width <= CLARA_BP.mobileMax ? '12px 12px 10px' : '14px 14px 12px',
                  color: t.text,
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontWeight: 500,
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = t.primary
                  e.currentTarget.style.boxShadow = `0 8px 22px ${t.primary}22`
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = t.border
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <div style={{ minHeight: 0, flex: '1 1 auto', overflow: 'hidden' }}>
                  <div
                    style={{
                      fontSize: 'var(--cc-body)',
                      fontWeight: 700,
                      color: t.text,
                      lineHeight: 1.25,
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    📋 {c.numero}
                  </div>
                  {c.contratista && (
                    <div
                      style={{
                        fontSize: 'var(--cc-sm)',
                        color: t.textMuted,
                        marginTop: 4,
                        lineHeight: 1.3,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {c.contratista}
                    </div>
                  )}
                </div>

                {logos.length > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      flexShrink: 0,
                      paddingTop: 4,
                      borderTop: `1px solid ${t.border}`,
                    }}
                  >
                    {logos.map((logo) => (
                      <img
                        key={logo.key}
                        src={logo.src}
                        alt={logo.label}
                        title={logo.label}
                        loading="lazy"
                        style={{
                          width: 40,
                          height: 40,
                          objectFit: 'contain',
                          borderRadius: 8,
                          background: '#fff',
                          border: `1px solid ${t.border}`,
                          padding: 3,
                          boxSizing: 'border-box',
                        }}
                      />
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
