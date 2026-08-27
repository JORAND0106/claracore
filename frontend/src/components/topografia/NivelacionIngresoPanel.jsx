/**
 * Panel de ingreso compacto V+ | Vi | V− (patrón Poligonal → dominio nivelación).
 */
import { useMemo } from 'react'
import {
  ABSCISA_NUMERICA_MSG,
  diagnosticoHilosIncongruentes,
  distanciaTaquimetrica,
  hilosIncongruentes,
} from '../../utils/topografia_nivelacion'
import TopoExcelSheet from './TopoExcelSheet'
import {
  AlertaHilos,
  HilosInputs,
  LecturaInput,
  TIPOS_PUNTO_NIV,
  estiloCampo,
  fmtN,
  styleInputCartera,
} from './nivelacionUiShared'

const LABELS = { vplus: 'V+ (vista atrás)', vi: 'Vi (intermedia)', vminus: 'V− (vista adelante)' }

function BloqueVista({
  bk,
  borrador,
  onBloque,
  onPatch,
  esAutomatico,
  ui,
  bloques,
  disabled,
  conDistancia,
}) {
  const bloque = borrador[bk] || {}
  const diag = esAutomatico ? diagnosticoHilosIncongruentes(bloque, 'automatico') : null
  const alerta = Boolean(diag)
  const accent = bloques[bk]?.accent || ui.accent
  const distCalc = conDistancia && esAutomatico
    ? distanciaTaquimetrica(bloque.hS, bloque.hI)
    : null
  const distKey = bk === 'vplus' ? 'dist_vplus_m' : 'dist_vminus_m'

  return (
    <div
      style={{
        minWidth: 0,
        padding: 8,
        borderRadius: 8,
        border: `1px solid ${bloques[bk]?.border || ui.border}`,
        background: bloques[bk]?.bg || 'transparent',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ fontSize: 'var(--cc-xs)', fontWeight: 800, color: accent, letterSpacing: '0.02em' }}>
        {LABELS[bk]}
      </div>
      {esAutomatico ? (
        <HilosInputs
          bloque={bloque}
          onChange={(b) => onBloque(bk, b)}
          disabled={disabled}
          ui={ui}
          alerta={alerta}
          bloques={bloques}
          bk={bk}
          diagMsg={diag?.msg}
        />
      ) : (
        <LecturaInput
          bloque={bloque}
          onChange={(b) => onBloque(bk, b)}
          disabled={disabled}
          ui={ui}
          alerta={false}
          bloques={bloques}
          bk={bk}
        />
      )}
      {conDistancia && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 'var(--cc-xxs)', fontWeight: 700, color: ui.textMuted, flexShrink: 0 }}>
            Dist
          </span>
          {esAutomatico ? (
            <span style={{ fontSize: 'var(--cc-sm)', fontWeight: 600 }}>{fmtN(distCalc, 2)} m</span>
          ) : (
            <input
              value={borrador[distKey] ?? ''}
              disabled={disabled}
              onChange={(e) => onPatch({ [distKey]: e.target.value })}
              style={styleInputCartera(ui, bloques, bk, { flex: 1, textAlign: 'center', minWidth: 0 })}
              placeholder="m"
              title={`Distancia ${bk === 'vplus' ? 'V+' : 'V−'} (m)`}
            />
          )}
        </div>
      )}
      {alerta && <AlertaHilos title={diag.msg} compact />}
    </div>
  )
}

export default function NivelacionIngresoPanel({
  borrador,
  onChange,
  onAgregar,
  onElegirPk,
  esAutomatico,
  disabled,
  busy = false,
  ui,
  bloques,
  sheet,
  isCompact,
  bmInicialNombre = '',
  esPrimeraFila = false,
  puedeAgregar = true,
  tituloHint = '',
}) {
  const panelCol = { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }

  const updateBloque = (bk, bloque) => onChange({ ...borrador, [bk]: bloque })
  const patch = (p) => onChange({ ...borrador, ...p })

  const nombreLocked = esPrimeraFila && Boolean(bmInicialNombre)
  const tipoLocked = esPrimeraFila

  const hilosAvisos = useMemo(() => {
    if (!esAutomatico) return []
    return ['vplus', 'vi', 'vminus']
      .map((bk) => {
        if (!hilosIncongruentes(borrador[bk], 'automatico')) return null
        const d = diagnosticoHilosIncongruentes(borrador[bk], 'automatico')
        return d?.msg ? `${LABELS[bk].split(' ')[0]}: ${d.msg}` : null
      })
      .filter(Boolean)
  }, [borrador, esAutomatico])

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isCompact ? '1fr' : 'minmax(0, 1fr) minmax(0, 1.4fr)',
        gap: 10,
        padding: 10,
        borderRadius: 10,
        border: `1px solid ${ui.accent}55`,
        background: `${ui.accent}08`,
        marginBottom: 12,
      }}
    >
      {/* Identificación del punto */}
      <div style={{ ...panelCol, ...(!isCompact ? { borderRight: `1px solid ${sheet.border}`, paddingRight: 10 } : null) }}>
        <TopoExcelSheet
          title="Lectura actual — identificación"
          columns={[
            { key: 'c', label: 'Campo', width: '38%' },
            { key: 'v', label: 'Valor', width: '62%' },
          ]}
          minWidth={isCompact ? undefined : 280}
          compact={isCompact}
        >
          <tr>
            <td style={sheet.td}>Punto</td>
            <td style={sheet.td}>
              {nombreLocked ? (
                <span style={{ fontWeight: 700 }} title="BM de amarre (biblioteca)">{bmInicialNombre}</span>
              ) : (
                <input
                  value={borrador.nombre_punto || ''}
                  disabled={disabled}
                  onChange={(e) => patch({ nombre_punto: e.target.value })}
                  style={estiloCampo({ ...ui.compactInput, color: ui.text, width: '100%', boxSizing: 'border-box' }, false)}
                  placeholder="Nombre del punto"
                />
              )}
            </td>
          </tr>
          <tr>
            <td style={sheet.td}>Tipo</td>
            <td style={sheet.td}>
              {tipoLocked ? (
                <span style={{ fontWeight: 700 }}>BM</span>
              ) : (
                <select
                  value={borrador.tipo_punto || ''}
                  disabled={disabled}
                  onChange={(e) => patch({ tipo_punto: e.target.value })}
                  style={{ ...ui.compactInput, color: ui.text, width: '100%', boxSizing: 'border-box' }}
                >
                  <option value="">—</option>
                  {TIPOS_PUNTO_NIV.map(({ v, l }) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              )}
            </td>
          </tr>
          <tr>
            <td style={sheet.td}>Abscisa / PK</td>
            <td style={sheet.td}>
              <button
                type="button"
                disabled={disabled}
                onClick={onElegirPk}
                style={{
                  ...ui.btnSecondary,
                  width: '100%',
                  boxSizing: 'border-box',
                  fontSize: 'var(--cc-xs)',
                  padding: '4px 6px',
                  textAlign: 'left',
                }}
                title={borrador.ubicacion_pk ? `PK ${borrador.ubicacion_pk}` : ABSCISA_NUMERICA_MSG}
              >
                {borrador.ubicacion_pk || borrador.abscisa || '📍 Elegir PK'}
              </button>
            </td>
          </tr>
          <tr>
            <td style={sheet.td}>Descripción</td>
            <td style={sheet.td}>
              <input
                value={borrador.descripcion_punto || ''}
                disabled={disabled}
                onChange={(e) => patch({ descripcion_punto: e.target.value })}
                style={{ ...ui.compactInput, color: ui.text, width: '100%', boxSizing: 'border-box' }}
                placeholder="Descripción del punto"
              />
            </td>
          </tr>
        </TopoExcelSheet>
        {tituloHint ? (
          <p style={{ margin: 0, fontSize: 'var(--cc-xs)', color: ui.textMuted, lineHeight: 1.35 }}>{tituloHint}</p>
        ) : null}
      </div>

      {/* V+ | Vi | V− */}
      <div style={panelCol}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isCompact ? '1fr' : '1fr 1fr 1fr',
            gap: 8,
          }}
        >
          <BloqueVista
            bk="vplus"
            borrador={borrador}
            onBloque={updateBloque}
            onPatch={patch}
            esAutomatico={esAutomatico}
            ui={ui}
            bloques={bloques}
            disabled={disabled}
            conDistancia
          />
          <BloqueVista
            bk="vi"
            borrador={borrador}
            onBloque={updateBloque}
            onPatch={patch}
            esAutomatico={esAutomatico}
            ui={ui}
            bloques={bloques}
            disabled={disabled}
            conDistancia={false}
          />
          <BloqueVista
            bk="vminus"
            borrador={borrador}
            onBloque={updateBloque}
            onPatch={patch}
            esAutomatico={esAutomatico}
            ui={ui}
            bloques={bloques}
            disabled={disabled}
            conDistancia
          />
        </div>
        {hilosAvisos.length > 0 && (
          <div
            role="status"
            style={{
              padding: '6px 8px',
              borderRadius: 6,
              fontSize: 'var(--cc-xs)',
              color: '#991b1b',
              background: 'rgba(220,38,38,0.1)',
              border: '1px solid rgba(220,38,38,0.3)',
            }}
          >
            {hilosAvisos[0]}
          </div>
        )}
        <button
          type="button"
          className="cc-topo-touch-btn"
          style={{ ...ui.btnPrimary, alignSelf: isCompact ? 'stretch' : 'flex-end', minWidth: 160 }}
          disabled={disabled || busy || !puedeAgregar}
          onClick={onAgregar}
          title={!puedeAgregar ? 'No se puede agregar en el estado actual' : 'Validar y agregar a la cartera'}
        >
          Agregar lectura
        </button>
      </div>
    </div>
  )
}
