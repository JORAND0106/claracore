/**
 * Reexporta el hook compartido (portal / flip / visualViewport).
 * Conserva SEGUIMIENTO_DROPDOWN_Z para no romper imports existentes.
 */
export {
  useAnchoredDropdown,
  CC_ANCHORED_DROPDOWN_Z as SEGUIMIENTO_DROPDOWN_Z,
} from '../../hooks/useAnchoredDropdown'
