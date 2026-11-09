/**
 * Popup para elegir la hoja de un Excel de diseño geométrico.
 * Se apila por encima del detalle del tramo (zIndex alto).
 */
import CcModalBrandHeader from '../CcModalBrandHeader'
import { IconClose } from './disenoDgIcons'
import { useTopoTheme } from './topografiaShared'

export default function DisenoExcelHojaModal({
  open,
  nombreArchivo,
  hojas = [],
  selected = '',
  onSelect,
  onConfirm,
  onClose,
  zIndex = 100085,
}) {
  const ui = useTopoTheme()
  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Seleccionar hoja del Excel"
      style={{
        position: 'fixed', inset: 0, zIndex,
        background: 'rgba(15,23,42,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          ...ui.card,
          width: 'min(440px, 94vw)',
          maxHeight: '86vh',
          overflow: 'auto',
          padding: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <CcModalBrandHeader theme={ui.t} />
        <div style={{
          padding: '14px 18px 10px',
          borderBottom: `1px solid ${ui.t?.border || '#e2e8f0'}`,
          display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, color: ui.text, fontSize: 'var(--cc-base)' }}>
              Seleccionar hoja
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--cc-xs)', color: ui.textMuted, lineHeight: 1.45 }}>
              {nombreArchivo
                ? `El archivo «${nombreArchivo}» tiene varias hojas. Elija cuál importar.`
                : 'Elija la hoja del Excel que desea importar.'}
            </p>
          </div>
          <button
            type="button"
            title="Cerrar"
            aria-label="Cerrar"
            onClick={onClose}
            style={{
              ...ui.btnSecondary,
              width: 36, height: 36, padding: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <IconClose />
          </button>
        </div>

        <div style={{ padding: '14px 18px 18px' }}>
          <div style={{ display: 'grid', gap: 8 }}>
            {hojas.map((h) => {
              const on = selected === h
              return (
                <button
                  key={h}
                  type="button"
                  title={`Importar hoja «${h}»`}
                  aria-label={`Importar hoja «${h}»`}
                  aria-pressed={on}
                  onClick={() => onSelect?.(h)}
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: `1.5px solid ${on ? (ui.t?.primary || ui.accent) : (ui.t?.border || '#e2e8f0')}`,
                    background: on ? `${ui.t?.primary || ui.accent}14` : 'transparent',
                    color: ui.text,
                    fontWeight: on ? 700 : 500,
                    fontSize: 'var(--cc-sm)',
                    cursor: 'pointer',
                  }}
                >
                  {h}
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" style={ui.btnSecondary} onClick={onClose} title="Cancelar">
              Cancelar
            </button>
            <button
              type="button"
              style={ui.btnPrimary}
              disabled={!selected}
              title="Continuar con la hoja seleccionada"
              onClick={() => selected && onConfirm?.(selected)}
            >
              Continuar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
