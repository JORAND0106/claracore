import { createPortal } from 'react-dom'
import { useAnchoredDropdown, CC_ANCHORED_DROPDOWN_Z } from '../hooks/useAnchoredDropdown'

/**
 * Listbox anclado a un input vía portal en document.body.
 * Evita que overflow/z-index de modales oculten el listado (p. ej. capítulo
 * en generación de reporte SicoeObra). Usa tokens de tema (Claro/Oscuro/…).
 *
 * @param {{
 *   open: boolean,
 *   anchorRef: { current: Element|null },
 *   t: { bgCard?: string, border?: string, shadow?: string },
 *   maxHeight?: number,
 *   zIndex?: number,
 *   children: import('react').ReactNode,
 *   id?: string,
 *   role?: string,
 *   'data-testid'?: string,
 *   className?: string,
 * }} props
 */
export default function CcAnchoredListbox({
  open,
  anchorRef,
  t,
  maxHeight = 280,
  zIndex = CC_ANCHORED_DROPDOWN_Z,
  children,
  id,
  role = 'listbox',
  className,
  'data-testid': testId,
}) {
  const dropdownStyle = useAnchoredDropdown(open, anchorRef, { maxHeight, zIndex })
  if (!open || !dropdownStyle || typeof document === 'undefined') return null

  const theme = t || {}
  return createPortal(
    <div
      id={id}
      role={role}
      className={className}
      data-testid={testId}
      style={{
        ...dropdownStyle,
        background: theme.bgCard || '#0F1923',
        border: `1px solid ${theme.border || '#334155'}`,
        borderRadius: 8,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        boxShadow: theme.shadow || '0 8px 24px rgba(0,0,0,0.35)',
      }}
    >
      {children}
    </div>,
    document.body,
  )
}

export { CC_ANCHORED_DROPDOWN_Z }
