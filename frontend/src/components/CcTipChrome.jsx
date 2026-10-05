import {
  CC_TOOLTIP_BRAND_NAME,
  CC_TOOLTIP_FAVICON_SRC,
} from './ccTooltipTheme.js'

/**
 * Chrome institucional reutilizable para popovers/tooltips custom (click o portal).
 * Usa las mismas CSS vars --cc-tip-* que CcTitleTooltips.
 *
 * @param {{ children: import('react').ReactNode, variant?: 'short'|'help', className?: string, style?: import('react').CSSProperties, [key: string]: unknown }} props
 */
export default function CcTipChrome({
  children,
  variant = 'help',
  className = '',
  style,
  ...rest
}) {
  const cls = [
    'cc-tip-chrome',
    variant === 'help' ? 'cc-tip-chrome--help' : 'cc-tip-chrome--short',
    className,
  ].filter(Boolean).join(' ')

  return (
    <div role="tooltip" className={cls} style={style} {...rest}>
      {variant === 'help' ? (
        <div className="cc-tip-chrome__brand">
          <img
            src={CC_TOOLTIP_FAVICON_SRC}
            alt=""
            width={18}
            height={18}
            draggable={false}
          />
          <span>{CC_TOOLTIP_BRAND_NAME}</span>
        </div>
      ) : null}
      <div className="cc-tip-chrome__body">{children}</div>
    </div>
  )
}
