/** Ribbon compacto de acciones — barra superior (Programación de obra). */
import { TrendingUp } from 'lucide-react'

const LUCIDE_ICONS = {
  TrendingUp,
}

export default function ProgObraHeaderRibbon({ t, items = [], busy = false }) {
  if (!items.length) return null
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        flexShrink: 0,
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
            title={item.title}
            aria-label={item.title}
            disabled={off}
            onClick={item.onClick}
            style={{
              width: 34,
              height: 34,
              padding: 0,
              fontSize: 16,
              lineHeight: 1,
              borderRadius: 8,
              border: `1px solid ${off ? '#E5E7EB' : t.primary}`,
              background: off ? '#F3F4F6' : `${t.primary}10`,
              color: off ? '#9CA3AF' : t.primary,
              cursor: off ? 'not-allowed' : 'pointer',
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {LucideIcon ? <LucideIcon size={18} aria-hidden /> : item.icon}
          </button>
        )
      })}
    </div>
  )
}
