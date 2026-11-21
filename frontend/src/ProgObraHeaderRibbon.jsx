/** Ribbon de acciones del módulo Programación (vive en el panel del módulo, no en el header global). */
import { TrendingUp } from 'lucide-react'

const LUCIDE_ICONS = {
  TrendingUp,
}

export default function ProgObraHeaderRibbon({ t, items = [], busy = false, compact = false }) {
  if (!items.length) return null
  const size = compact ? 30 : 34
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        flexShrink: 0,
        flexWrap: 'wrap',
        maxWidth: '100%',
      }}
      role="toolbar"
      aria-label="Acciones de programación de obra"
    >
      {items.map((item) => {
        const off = item.disabled || busy
        const LucideIcon = item.lucideIcon ? LUCIDE_ICONS[item.lucideIcon] : null
        return (
          <button
            key={item.key}
            type="button"
            data-cc-tooltip={item.title}
            data-cc-tooltip-variant="short"
            aria-label={item.title}
            disabled={off}
            onClick={item.onClick}
            style={{
              width: size,
              height: size,
              padding: 0,
              fontSize: compact ? 14 : 16,
              lineHeight: 1,
              borderRadius: 8,
              border: `1px solid ${off ? (t.border || '#E5E7EB') : t.primary}`,
              background: off ? (t.bg || '#F3F4F6') : `${t.primary}10`,
              color: off ? (t.textMuted || '#9CA3AF') : t.primary,
              cursor: off ? 'not-allowed' : 'pointer',
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {LucideIcon ? <LucideIcon size={compact ? 16 : 18} aria-hidden /> : item.icon}
          </button>
        )
      })}
    </div>
  )
}
