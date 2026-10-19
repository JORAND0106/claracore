/**
 * Barra compacta por categorías en celular.
 * Guardar / cerrar / deshacer siempre visibles; el resto en menús por grupo.
 */
import { useEffect, useRef, useState } from 'react'
import { ESQUEMA_PHONE_TOOL_CATEGORIES } from './esquemaMobileLayout.js'

function chipStyle(t, active) {
  return {
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minWidth: 56,
    minHeight: 44,
    padding: '4px 8px',
    borderRadius: 10,
    border: `1px solid ${active ? (t.primary || '#0f766e') : (t.border || '#cbd5e1')}`,
    background: active
      ? `color-mix(in srgb, ${t.primary || '#0f766e'} 16%, #fff)`
      : (t.bgCard || '#fff'),
    color: t.text,
    fontSize: 10,
    fontWeight: 700,
    lineHeight: 1.1,
    cursor: 'pointer',
    flexShrink: 0,
  }
}

function iconOnly(t, active, disabled) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    minWidth: 44,
    padding: 0,
    borderRadius: 10,
    border: `1px solid ${active ? (t.primary || '#0f766e') : (t.border || '#cbd5e1')}`,
    background: active
      ? `color-mix(in srgb, ${t.primary || '#0f766e'} 16%, #fff)`
      : (t.bgCard || '#fff'),
    color: t.text,
    opacity: disabled ? 0.4 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
    flexShrink: 0,
  }
}

/**
 * @param {{
 *   t: object,
 *   title?: string,
 *   canUndo?: boolean,
 *   canRedo?: boolean,
 *   onUndo?: () => void,
 *   onRedo?: () => void,
 *   onSave?: () => void,
 *   onClose?: () => void,
 *   saveDisabled?: boolean,
 *   saveBusy?: boolean,
 *   categories?: Array<{ id: string, label: string, items: Array<{
 *     id: string, label: string, Icon?: any, active?: boolean, disabled?: boolean, onClick?: () => void, testId?: string
 *   }> }>,
 *   trailing?: React.ReactNode,
 * }} props
 */
export function EsquemaPhoneToolbar({
  t,
  title = 'Esquema',
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onSave,
  onClose,
  saveDisabled = false,
  saveBusy = false,
  categories = null,
  trailing = null,
  IconUndo = null,
  IconRedo = null,
  IconSave = null,
  IconClose = null,
}) {
  const [openId, setOpenId] = useState(null)
  const rootRef = useRef(null)
  const cats = categories || ESQUEMA_PHONE_TOOL_CATEGORIES.map((c) => ({ ...c, items: [] }))

  useEffect(() => {
    if (!openId) return
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpenId(null)
    }
    document.addEventListener('pointerdown', onDoc, true)
    return () => document.removeEventListener('pointerdown', onDoc, true)
  }, [openId])

  const openCat = cats.find((c) => c.id === openId)

  return (
    <div
      ref={rootRef}
      data-testid="esquema-phone-toolbar"
      style={{
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderBottom: `1px solid ${t.border || '#cbd5e1'}`,
        background: t.bgCard || '#fff',
        position: 'relative',
        zIndex: 30,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
          minHeight: 52,
        }}
      >
        <button
          type="button"
          title="Deshacer"
          aria-label="Deshacer"
          disabled={!canUndo}
          onClick={onUndo}
          style={iconOnly(t, false, !canUndo)}
          data-testid="esquema-phone-undo"
        >
          {IconUndo ? <IconUndo /> : '↩'}
        </button>
        <button
          type="button"
          title="Rehacer"
          aria-label="Rehacer"
          disabled={!canRedo}
          onClick={onRedo}
          style={iconOnly(t, false, !canRedo)}
          data-testid="esquema-phone-redo"
        >
          {IconRedo ? <IconRedo /> : '↪'}
        </button>

        <div
          data-testid="esquema-phone-toolbar-scroll"
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-x',
            paddingBottom: 2,
          }}
        >
          <span style={{
            fontWeight: 800,
            fontSize: 12,
            color: t.text,
            whiteSpace: 'nowrap',
            flexShrink: 0,
            maxWidth: 88,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          >
            {title}
          </span>
          {cats.map((cat) => (
            <button
              key={cat.id}
              type="button"
              data-testid={`esquema-phone-cat-${cat.id}`}
              aria-expanded={openId === cat.id}
              onClick={() => setOpenId((cur) => (cur === cat.id ? null : cat.id))}
              style={chipStyle(t, openId === cat.id)}
            >
              <span aria-hidden style={{ fontSize: 14 }}>▦</span>
              <span>{cat.label}</span>
            </button>
          ))}
          {trailing}
        </div>

        <button
          type="button"
          title="Guardar"
          aria-label="Guardar"
          disabled={saveDisabled || saveBusy}
          onClick={onSave}
          style={iconOnly(t, false, saveDisabled || saveBusy)}
          data-testid="esquema-phone-save"
        >
          {IconSave ? <IconSave /> : 'G'}
        </button>
        <button
          type="button"
          title="Cerrar"
          aria-label="Cerrar"
          onClick={onClose}
          style={iconOnly(t, false, false)}
          data-testid="esquema-phone-close"
        >
          {IconClose ? <IconClose /> : '×'}
        </button>
      </div>

      {openCat ? (
        <div
          data-testid="esquema-phone-cat-menu"
          data-cat={openCat.id}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            padding: '8px 10px 10px',
            borderTop: `1px solid ${t.border || '#e2e8f0'}`,
            background: t.bgMuted || '#f8fafc',
            maxHeight: '42vh',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {(openCat.items || []).map((item) => {
            const Icon = item.Icon
            return (
              <button
                key={item.id}
                type="button"
                title={item.label}
                aria-label={item.label}
                disabled={item.disabled}
                data-testid={item.testId || `esquema-phone-tool-${item.id}`}
                aria-pressed={!!item.active}
                onClick={() => {
                  item.onClick?.()
                  setOpenId(null)
                }}
                style={{
                  ...chipStyle(t, !!item.active),
                  minWidth: 72,
                  opacity: item.disabled ? 0.4 : 1,
                }}
              >
                {Icon ? <Icon /> : <span aria-hidden>•</span>}
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
