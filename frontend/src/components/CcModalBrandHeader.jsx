/**
 * Cinta de marca ClaraCore para encabezados de popups/modales.
 * Usa el favicon institucional (ícono circular sin texto) + wordmark "ClaraCore".
 */
import {
  CC_MODAL_BRAND_FONT,
  CC_MODAL_BRAND_ICON_PX,
  CC_MODAL_BRAND_NAME,
  CC_MODAL_FAVICON_SRC,
  ccModalBrandHeaderStyle,
  claraCoreBrandTextColor,
} from './ccModalBrandTheme.js'

export {
  CC_MODAL_FAVICON_SRC,
  CC_MODAL_BRAND_NAME,
  CC_MODAL_BRAND_ICON_PX,
  CC_MODAL_BRAND_FONT,
  resolveModalThemeIsDark,
  claraCoreBrandTextColor,
  ccModalBrandHeaderStyle,
} from './ccModalBrandTheme.js'

/**
 * @param {{ theme?: object|string, style?: object, className?: string }} props
 */
export default function CcModalBrandHeader({ theme, style, className }) {
  const color = claraCoreBrandTextColor(theme)
  return (
    <div
      className={className}
      data-cc-modal-brand="1"
      role="banner"
      aria-label="ClaraCore"
      style={{ ...ccModalBrandHeaderStyle(theme), ...(style || {}) }}
    >
      <img
        src={CC_MODAL_FAVICON_SRC}
        alt=""
        width={CC_MODAL_BRAND_ICON_PX}
        height={CC_MODAL_BRAND_ICON_PX}
        draggable={false}
        style={{
          width: CC_MODAL_BRAND_ICON_PX,
          height: CC_MODAL_BRAND_ICON_PX,
          objectFit: 'contain',
          flexShrink: 0,
          display: 'block',
        }}
      />
      <span
        style={{
          fontSize: CC_MODAL_BRAND_FONT,
          fontWeight: 800,
          letterSpacing: '0.02em',
          color,
          lineHeight: 1.2,
          userSelect: 'none',
        }}
      >
        {CC_MODAL_BRAND_NAME}
      </span>
    </div>
  )
}
