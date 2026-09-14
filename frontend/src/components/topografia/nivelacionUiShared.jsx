/**
 * Estilos y piezas UI compartidas del captura de Circuito de Nivelación.
 */
import { HILO_INPUT_WIDTH } from '../../utils/topografia_nivelacion'

/** Selectores focuseables para Enter→Tab en captura de nivelación. */
const ENTER_AS_TAB_SELECTOR = [
  'input:not([disabled]):not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
].join(',')

function esVisibleParaFoco(el) {
  if (!el || el.disabled) return false
  if (el.getAttribute?.('tabindex') === '-1') return false
  if (el.offsetParent != null) return true
  return el.getClientRects?.().length > 0
}

/**
 * Enter avanza al siguiente campo (como Tab); Shift+Enter al anterior.
 * No intercepta botones ni atajos con modificadores.
 */
export function handleEnterAsTab(e, rootEl) {
  if (e.key !== 'Enter' || e.defaultPrevented) return
  if (e.ctrlKey || e.metaKey || e.altKey) return
  const target = e.target
  if (!target || !rootEl || typeof rootEl.contains !== 'function' || !rootEl.contains(target)) return
  const tag = String(target.tagName || '').toUpperCase()
  if (tag === 'BUTTON' || tag === 'A') return
  const typ = String(target.type || '').toLowerCase()
  if (typ === 'button' || typ === 'submit' || typ === 'reset' || typ === 'checkbox' || typ === 'radio') return

  e.preventDefault()
  const nodes = [...rootEl.querySelectorAll(ENTER_AS_TAB_SELECTOR)].filter(esVisibleParaFoco)
  const idx = nodes.indexOf(target)
  if (idx < 0) return
  const next = e.shiftKey ? nodes[idx - 1] : nodes[idx + 1]
  if (!next) return
  next.focus()
  if (typeof next.select === 'function' && String(next.tagName).toUpperCase() === 'INPUT') {
    try { next.select() } catch { /* ignore */ }
  }
}

export const TIPOS_PUNTO_NIV = [
  { v: 'estacion', l: 'Estación' },
  { v: 'auxiliar', l: 'Auxiliar' },
  { v: 'cambio', l: 'Cambio' },
]

export const ESTILO_CAMPO_ALERTA = {
  border: '2px solid #dc2626',
  background: 'rgba(220,38,38,0.14)',
  boxShadow: '0 0 0 1px rgba(220,38,38,0.35)',
  color: 'inherit',
}

export function estiloCampo(base, alerta) {
  return alerta ? { ...base, ...ESTILO_CAMPO_ALERTA } : base
}

export function fmtN(v, dec = 4) {
  if (v == null || v === '' || Number.isNaN(v)) return '—'
  return Number(v).toFixed(dec)
}

/** Dist. acum. / Abs. circuito debajo de V− (preview en vivo). */
export function PreviewAbscisadoVminus({ preview, ui }) {
  if (!preview) return null
  const muted = ui?.textMuted || '#64748B'
  return (
    <div
      role="status"
      data-testid="niv-preview-abscisado-vminus"
      style={{
        marginTop: 4,
        padding: '4px 6px',
        borderRadius: 6,
        fontSize: 'var(--cc-xxs)',
        fontWeight: 600,
        lineHeight: 1.35,
        color: muted,
        background: 'rgba(14,124,134,0.06)',
        border: '1px solid rgba(14,124,134,0.18)',
      }}
      title="Cálculo preliminar mientras diligencia V− (misma regla que Dist. acum. / Abs. circuito de la cartera)"
    >
      Dist. acum. {fmtN(preview.distancia_acumulada, 2)} m
      {' · '}
      Abs. {fmtN(preview.abscisa_circuito, 2)} m
    </div>
  )
}

export function styleInputHilo(ui, bloques, bk, hk, { alerta = false, opacity = 1 } = {}) {
  const medio = hk === 'hM'
  const bg = alerta
    ? undefined
    : (medio ? (bloques[bk]?.inputMed || `${ui.accent}22`) : (bloques[bk]?.inputTint || ui.compactInput.background))
  return estiloCampo({
    ...ui.compactInput,
    width: HILO_INPUT_WIDTH,
    minWidth: HILO_INPUT_WIDTH,
    padding: '2px 6px',
    textAlign: 'center',
    color: ui.text,
    opacity,
    fontWeight: medio && !alerta ? 600 : 400,
    ...(bg != null ? { background: bg } : {}),
  }, alerta)
}

export function styleInputCartera(ui, bloques, bk, extra = {}, alerta = false) {
  return estiloCampo({
    ...ui.compactInput,
    color: ui.text,
    background: bloques[bk]?.inputTint || ui.compactInput.background,
    ...extra,
  }, alerta)
}

export function AlertaHilos({ title, compact = false }) {
  if (compact) {
    return (
      <div
        role="status"
        style={{
          marginTop: 4,
          padding: '4px 6px',
          borderRadius: 6,
          fontSize: 'var(--cc-xxs)',
          fontWeight: 600,
          lineHeight: 1.35,
          color: '#991b1b',
          background: 'rgba(220,38,38,0.12)',
          border: '1px solid rgba(220,38,38,0.35)',
        }}
      >
        {title}
      </div>
    )
  }
  return (
    <span
      title={title}
      aria-label={title}
      style={{
        display: 'inline-flex',
        width: 14,
        height: 14,
        borderRadius: '50%',
        background: '#dc2626',
        color: '#fff',
        fontSize: 9,
        fontWeight: 700,
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'help',
        marginLeft: 2,
        flexShrink: 0,
        verticalAlign: 'middle',
      }}
    >
      !
    </span>
  )
}

/** Campos HS/HM/HI de un bloque (automático). */
export function HilosInputs({ bloque, onChange, disabled, ui, alerta, bloques, bk = 'vplus', diagMsg }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: 2, alignItems: 'center', justifyContent: 'center' }}>
        {['hS', 'hM', 'hI'].map((k) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center' }}>
            <input
              title={['Superior', 'Medio', 'Inferior'][['hS', 'hM', 'hI'].indexOf(k)]}
              disabled={disabled}
              value={bloque?.[k] ?? ''}
              onChange={(e) => onChange({ ...bloque, [k]: e.target.value })}
              style={styleInputHilo(ui, bloques, bk, k, { alerta, opacity: disabled && !alerta ? 0.45 : 1 })}
              placeholder={k === 'hS' ? 'S' : k === 'hM' ? 'M' : 'I'}
            />
            {k === 'hM' && alerta && <AlertaHilos title={diagMsg || 'Hilos inconsistentes'} />}
          </span>
        ))}
      </div>
      {alerta && diagMsg && (
        <span style={{ fontSize: 'var(--cc-xxs)', color: '#991b1b', fontWeight: 600, textAlign: 'center', lineHeight: 1.25 }}>
          {String(diagMsg).split(':')[0]}
        </span>
      )}
    </div>
  )
}

export function LecturaInput({ bloque, onChange, disabled, ui, alerta, bloques, bk = 'vplus' }) {
  return (
    <input
      disabled={disabled}
      value={bloque?.lectura ?? ''}
      onChange={(e) => onChange({ ...bloque, lectura: e.target.value })}
      style={styleInputCartera(ui, bloques, bk, { width: 72, textAlign: 'center' }, alerta)}
      placeholder="M"
      title="Lectura hilo medio (electrónico)"
    />
  )
}
