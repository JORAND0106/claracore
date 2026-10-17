/**
 * Panel lateral izquierdo del editor de esquema: secciones apilables
 * (propiedades, cálculo de volúmenes, coordenadas…) estilo hoja / Excel.
 */
import React, { useState } from 'react'

export function EsquemaContextSidebar({
  t,
  ui,
  width = 300,
  collapsed = false,
  onToggleCollapsed,
  onResizePointerDown = null,
  children,
}) {
  if (collapsed) {
    return (
      <div
        data-testid="esquema-context-sidebar-collapsed"
        style={{
          flexShrink: 0,
          width: 36,
          borderRight: `1px solid ${t.border}`,
          background: t.bgCard || '#fff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 8,
          gap: 6,
        }}
      >
        <button
          type="button"
          title="Mostrar paneles"
          data-cc-tooltip="Mostrar paneles"
          data-cc-tooltip-variant="short"
          aria-label="Mostrar paneles laterales"
          data-testid="esquema-context-sidebar-expand"
          onClick={onToggleCollapsed}
          style={{
            width: 28,
            height: 28,
            minWidth: 28,
            padding: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            borderRadius: 6,
            border: `1px solid ${t.border}`,
            background: t.bg || '#fff',
            color: t.text,
            cursor: 'pointer',
          }}
        >
          »
        </button>
      </div>
    )
  }

  return (
    <aside
      data-testid="esquema-context-sidebar"
      style={{
        flexShrink: 0,
        width,
        maxWidth: 'min(56vw, 560px)',
        height: '100%',
        minHeight: 0,
        borderRight: `1px solid ${t.border}`,
        background: t.bgCard || '#fff',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 4,
        boxSizing: 'border-box',
      }}
    >
      {typeof onResizePointerDown === 'function' ? (
        <div
          data-testid="esquema-context-sidebar-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Ajustar ancho del panel lateral"
          onPointerDown={onResizePointerDown}
          style={{
            position: 'absolute',
            top: 0,
            right: -3,
            width: 8,
            height: '100%',
            cursor: 'col-resize',
            zIndex: 6,
            touchAction: 'none',
          }}
        />
      ) : null}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          padding: '8px 10px',
          borderBottom: `1px solid ${t.border}`,
          background: `color-mix(in srgb, ${t.primary || '#0077B6'} 8%, ${t.bgCard || '#fff'})`,
        }}
      >
        <strong style={{ fontSize: 11, color: t.text, letterSpacing: '0.04em' }}>PANELES</strong>
        {typeof onToggleCollapsed === 'function' ? (
          <button
            type="button"
            title="Ocultar paneles"
            data-cc-tooltip="Ocultar paneles"
            data-cc-tooltip-variant="short"
            aria-label="Ocultar paneles laterales"
            data-testid="esquema-context-sidebar-collapse"
            onClick={onToggleCollapsed}
            style={{
              ...ghostBtn(t),
              width: 28,
              height: 28,
              minWidth: 28,
              padding: 0,
            }}
          >
            «
          </button>
        ) : null}
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          background: ui?.wrap || t.bgMuted || '#f8fafc',
        }}
      >
        {children}
      </div>
    </aside>
  )
}

/**
 * Sección expandible/contráctil dentro del panel lateral.
 */
export function EsquemaSidebarSection({
  t,
  id,
  title,
  open = true,
  onToggle,
  children,
  badge = null,
}) {
  const [localOpen, setLocalOpen] = useState(open)
  const isControlled = typeof onToggle === 'function'
  const expanded = isControlled ? open : localOpen
  const toggle = () => {
    if (isControlled) onToggle(!open)
    else setLocalOpen((v) => !v)
  }

  return (
    <section
      data-testid={`esquema-sidebar-section-${id}`}
      data-open={expanded ? '1' : '0'}
      style={{
        flexShrink: 0,
        borderBottom: `1px solid ${t.border}`,
        background: t.bgCard || '#fff',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <button
        type="button"
        data-testid={`esquema-sidebar-section-toggle-${id}`}
        onClick={toggle}
        title={expanded ? `Contraer ${title}` : `Expandir ${title}`}
        data-cc-tooltip={expanded ? `Contraer ${title}` : `Expandir ${title}`}
        data-cc-tooltip-variant="short"
        aria-expanded={expanded}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '8px 10px',
          border: 'none',
          background: `color-mix(in srgb, ${t.primary || '#0077B6'} 10%, ${t.bgCard || '#fff'})`,
          color: t.primary || '#0f766e',
          fontWeight: 800,
          fontSize: 12,
          cursor: 'pointer',
          textAlign: 'left',
          boxSizing: 'border-box',
        }}
      >
        <span aria-hidden style={{ width: 14, fontSize: 10 }}>{expanded ? '▼' : '▶'}</span>
        <span style={{ flex: 1 }}>{title}</span>
        {badge != null ? (
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '1px 6px',
            borderRadius: 999,
            background: t.bgHover || 'rgba(15,23,42,0.06)',
            color: t.textMuted || '#64748b',
          }}
          >
            {badge}
          </span>
        ) : null}
      </button>
      {expanded ? (
        <div
          data-testid={`esquema-sidebar-section-body-${id}`}
          style={{
            padding: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            minHeight: 0,
            boxSizing: 'border-box',
          }}
        >
          {children}
        </div>
      ) : null}
    </section>
  )
}

function ghostBtn(t) {
  return {
    borderRadius: 6,
    border: `1px solid ${t.border}`,
    background: 'transparent',
    color: t.text,
    fontWeight: 800,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  }
}
