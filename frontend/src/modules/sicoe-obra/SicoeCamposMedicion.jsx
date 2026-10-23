/**
 * Campos de medición SICOE: estándar (L|A|E|C) o varilla (L|Ø|Peso|C)
 * cuando unidad = Kg.
 */
import {
  SICOE_VARILLA_DIAMETROS,
  calcularCantidadRegistro,
  sicoeFmtDiametroDisplay,
  sicoeKgPendienteRecaptura,
  sicoePesoKgMPorDiametro,
  sicoeUnidadEsKg,
  sicoeValidarDiametroOError,
} from './sicoeVarilla.js'
import { formatearCantidadTotal, formatearDimension } from './sicoeCantidadRedondeo.js'

const labBase = (t) => ({
  fontSize: 'var(--cc-label)',
  fontWeight: 600,
  color: t.textMuted,
  display: 'block',
  marginBottom: 4,
})

/**
 * @param {object} props
 * @param {object} props.t tema
 * @param {boolean} props.editable
 * @param {string|null} props.unidad
 * @param {boolean|null} props.esVarilla
 * @param {function} props.onEsVarillaChange (true|false) => void
 * @param {string|number} props.longitud
 * @param {string|number} props.ancho
 * @param {string|number} props.espesor
 * @param {string|number} props.cantidad
 * @param {string} props.diametroVarilla
 * @param {function} props.onChange ({ longitud?, ancho?, espesor?, cantidad?, diametro_varilla?, es_varilla? }) => void
 * @param {boolean} [props.compact]
 * @param {boolean} [props.showPendienteBanner]
 * @param {object} [props.registro] para RO / pendiente
 */
export default function SicoeCamposMedicion({
  t,
  editable = false,
  unidad = null,
  esVarilla = null,
  onEsVarillaChange,
  longitud = '',
  ancho = '',
  espesor = '',
  cantidad = '',
  diametroVarilla = '',
  onChange,
  compact = false,
  /** Una sola línea horizontal (ventana compacta). */
  layoutLinea = false,
  showPendienteBanner = true,
  registro = null,
  cantTotalOverride = null,
  /** Campos extra al final de la línea (Vlr Un, Costo directo). */
  extrasLinea = null,
}) {
  const esKg = sicoeUnidadEsKg(unidad)
  const pendiente = esKg && (esVarilla == null) && (
    showPendienteBanner || sicoeKgPendienteRecaptura(registro || { unidad, es_varilla: esVarilla })
  )
  const modoVarilla = esKg && esVarilla === true
  const peso = modoVarilla ? (sicoePesoKgMPorDiametro(diametroVarilla) ?? '') : ''
  const cantTotal = cantTotalOverride != null
    ? cantTotalOverride
    : calcularCantidadRegistro({
      es_varilla: modoVarilla ? true : false,
      longitud,
      ancho,
      espesor,
      cantidad,
      diametro_varilla: diametroVarilla,
      peso_kg_m: peso === '' ? null : peso,
    })

  const inpSt = {
    width: '100%',
    padding: compact ? '6px 8px' : '8px 10px',
    borderRadius: 8,
    fontSize: 'var(--cc-sm)',
    background: t.bg,
    color: t.text,
    border: `1px solid ${t.border}`,
    outline: 'none',
    boxSizing: 'border-box',
  }
  const labSt = labBase(t)
  const gridCols = modoVarilla
    ? 'repeat(auto-fit, minmax(88px, 1fr))'
    : 'repeat(auto-fit, minmax(88px, 1fr))'

  const set = (patch) => onChange?.(patch)

  const elegir = (val) => {
    onEsVarillaChange?.(val)
    if (val === true) {
      set({
        es_varilla: true,
        ancho: null,
        espesor: null,
        diametro_varilla: diametroVarilla || '',
      })
    } else {
      set({
        es_varilla: false,
        diametro_varilla: null,
        peso_kg_m: null,
      })
    }
  }

  const diamErr = modoVarilla && String(diametroVarilla || '').trim()
    ? sicoeValidarDiametroOError(diametroVarilla)
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 8 : 10 }}>
      {esKg && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          padding: pendiente ? '10px 12px' : 0,
          background: pendiente ? 'rgba(245,158,11,0.12)' : 'transparent',
          border: pendiente ? '1px solid rgba(245,158,11,0.45)' : 'none',
          borderRadius: 8,
        }}>
          <span style={{ fontSize: 'var(--cc-label)', fontWeight: 800, color: pendiente ? '#b45309' : t.textMuted }}>
            {pendiente ? 'Pendiente de recaptura — ¿Es varilla?' : 'Esquema (Kg)'}
          </span>
          {editable ? (
            <>
              <button
                type="button"
                onClick={() => elegir(true)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: `1px solid ${esVarilla === true ? t.primary : t.border}`,
                  background: esVarilla === true ? t.primary : 'transparent',
                  color: esVarilla === true ? '#fff' : t.text,
                  fontWeight: 800,
                  fontSize: 'var(--cc-caption)',
                  cursor: 'pointer',
                }}
              >
                Varilla
              </button>
              <button
                type="button"
                onClick={() => elegir(false)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: `1px solid ${esVarilla === false ? t.primary : t.border}`,
                  background: esVarilla === false ? t.primary : 'transparent',
                  color: esVarilla === false ? '#fff' : t.text,
                  fontWeight: 800,
                  fontSize: 'var(--cc-caption)',
                  cursor: 'pointer',
                }}
              >
                No es varilla
              </button>
            </>
          ) : (
            <span style={{ fontWeight: 800, color: t.text }}>
              {esVarilla === true ? 'Varilla' : esVarilla === false ? 'No es varilla' : 'Sin definir'}
            </span>
          )}
        </div>
      )}

      {(!esKg || esVarilla != null) && (
        <div
          className={layoutLinea ? 'cc-sicoe-medicion-linea' : undefined}
          style={layoutLinea ? {
            display: 'flex',
            flexWrap: 'nowrap',
            gap: 6,
            alignItems: 'flex-end',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            paddingBottom: 2,
          } : { display: 'grid', gridTemplateColumns: gridCols, gap: compact ? 4 : 10 }}
        >
          {editable ? (
            <>
              <div>
                <label style={labSt}>{layoutLinea ? 'Long' : 'Longitud'}</label>
                <input
                  type="number"
                  step="0.001"
                  inputMode="decimal"
                  value={longitud ?? ''}
                  onChange={(e) => set({ longitud: e.target.value })}
                  placeholder="m"
                  style={inpSt}
                />
              </div>
              {modoVarilla ? (
                <>
                  <div>
                    <label style={labSt}>{layoutLinea ? 'Ø' : 'Diámetro Ø'}</label>
                    <input
                      list="sicoe-varilla-diametros"
                      value={diametroVarilla ?? ''}
                      onChange={(e) => set({ diametro_varilla: e.target.value })}
                      placeholder="p. ej. 3/8"
                      style={{
                        ...inpSt,
                        borderColor: diamErr && !diamErr.ok ? '#dc2626' : t.border,
                      }}
                      aria-label="Diámetro en fracciones de pulgada"
                    />
                    <datalist id="sicoe-varilla-diametros">
                      {SICOE_VARILLA_DIAMETROS.map((d) => (
                        <option key={d} value={d} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label style={labSt}>{layoutLinea ? 'Peso' : 'Peso (kg/m)'}</label>
                    <input
                      value={peso === '' ? '' : Number(peso).toFixed(2)}
                      readOnly
                      disabled
                      style={{ ...inpSt, opacity: 0.85, fontFamily: 'ui-monospace, Consolas, monospace' }}
                      title="Autocalculado NTC 2289"
                    />
                  </div>
                  <div>
                    <label style={labSt}>{layoutLinea ? 'Cant' : 'Cantidad'}</label>
                    <input
                      type="number"
                      step="0.001"
                      inputMode="decimal"
                      value={cantidad ?? ''}
                      onChange={(e) => set({ cantidad: e.target.value })}
                      placeholder="varillas"
                      style={inpSt}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label style={labSt}>Ancho</label>
                    <input
                      type="number"
                      step="0.001"
                      inputMode="decimal"
                      value={ancho ?? ''}
                      onChange={(e) => set({ ancho: e.target.value })}
                      placeholder="m"
                      style={inpSt}
                    />
                  </div>
                  <div>
                    <label style={labSt}>{layoutLinea ? 'Espe' : 'Espesor'}</label>
                    <input
                      type="number"
                      step="0.001"
                      inputMode="decimal"
                      value={espesor ?? ''}
                      onChange={(e) => set({ espesor: e.target.value })}
                      placeholder="m"
                      style={inpSt}
                    />
                  </div>
                  <div>
                    <label style={labSt}>{layoutLinea ? 'Cant' : 'Cantidad'}</label>
                    <input
                      type="number"
                      step="0.001"
                      inputMode="decimal"
                      value={cantidad ?? ''}
                      onChange={(e) => set({ cantidad: e.target.value })}
                      placeholder="und"
                      style={inpSt}
                    />
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <Ro t={t} label={layoutLinea ? 'Long' : 'Longitud'} valor={formatearDimension(longitud, { locale: false, empty: null })} linea={layoutLinea} />
              {modoVarilla ? (
                <>
                  <Ro t={t} label={layoutLinea ? 'Ø' : 'Diámetro Ø'} valor={sicoeFmtDiametroDisplay(diametroVarilla, { empty: null })} linea={layoutLinea} />
                  <Ro t={t} label={layoutLinea ? 'Peso' : 'Peso (kg/m)'} valor={peso === '' ? null : Number(peso).toFixed(2)} linea={layoutLinea} />
                  <Ro t={t} label={layoutLinea ? 'Cant' : 'Cantidad'} valor={formatearDimension(cantidad, { locale: false, empty: null })} linea={layoutLinea} />
                </>
              ) : (
                <>
                  <Ro t={t} label="Ancho" valor={formatearDimension(ancho, { locale: false, empty: null })} linea={layoutLinea} />
                  <Ro t={t} label={layoutLinea ? 'Espe' : 'Espesor'} valor={formatearDimension(espesor, { locale: false, empty: null })} linea={layoutLinea} />
                  <Ro t={t} label={layoutLinea ? 'Cant' : 'Cantidad'} valor={formatearDimension(cantidad, { locale: false, empty: null })} linea={layoutLinea} />
                </>
              )}
            </>
          )}
          <Ro t={t} label={layoutLinea ? 'Cant Total' : 'Cant. Total'} valor={formatearCantidadTotal(cantTotal, { locale: false })} color={t.primary} linea={layoutLinea} />
          {layoutLinea && Array.isArray(extrasLinea) ? extrasLinea.map((ex, i) => (
            <Ro key={ex?.label || i} t={t} label={ex.label} valor={ex.valor} color={ex.color} linea />
          )) : null}
        </div>
      )}

      {diamErr && !diamErr.ok && (
        <div style={{
          fontSize: 'var(--cc-caption)',
          color: '#b91c1c',
          fontWeight: 700,
          lineHeight: 1.4,
        }}>
          {diamErr.error}
        </div>
      )}

      {modoVarilla && (
        <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>
          Cant. Total = Longitud × Peso (kg/m) × Cantidad · pesos NTC 2289
        </div>
      )}
    </div>
  )
}

function Ro({ t, label, valor, color, linea = false }) {
  return (
    <div style={linea ? { flex: '0 0 auto', minWidth: 72 } : undefined}>
      <div style={{ ...labBase(t), marginBottom: linea ? 2 : 4, whiteSpace: linea ? 'nowrap' : undefined }}>{label}</div>
      <div style={{
        padding: linea ? '4px 6px' : '8px 10px',
        borderRadius: 8,
        background: t.bg,
        border: `1px solid ${t.border}`,
        fontWeight: 700,
        color: color || t.text,
        fontSize: 'var(--cc-sm)',
        minHeight: linea ? 30 : 36,
        boxSizing: 'border-box',
        whiteSpace: 'nowrap',
      }}>
        {valor == null || valor === '' ? '—' : valor}
      </div>
    </div>
  )
}
