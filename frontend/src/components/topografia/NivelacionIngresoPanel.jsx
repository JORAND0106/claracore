/**
 * Panel de ingreso compacto V+ | Vi | V− (patrón Poligonal → dominio nivelación).
 */
import { useMemo, useRef } from 'react'
import {
  ABSCISA_NUMERICA_MSG,
  autocompletarDesdeIda,
  diagnosticoHilosIncongruentes,
  distanciaTaquimetrica,
  filaHilosSeparacionBloqueante,
  previewAbscisadoCaptura,
} from '../../utils/topografia_nivelacion'
import TopoExcelSheet from './TopoExcelSheet'
import {
  AlertaHilos,
  HilosInputs,
  LecturaInput,
  PreviewAbscisadoVminus,
  TIPOS_PUNTO_NIV,
  estiloCampo,
  fmtN,
  handleEnterAsTab,
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
  previewAbscisado = null,
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
          diagMsg={diag?.tooltip || diag?.msg}
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
      {bk === 'vminus' && previewAbscisado ? (
        <PreviewAbscisadoVminus preview={previewAbscisado} ui={ui} />
      ) : null}
      {alerta && (
        <AlertaHilos title={diag.msg} tip={diag.tooltip || diag.msg} compact />
      )}
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
  modoContra = false,
  filasIdaParaAutocomplete = null,
  sugerenciasPuntos = null,
  filas = [],
  tipoNivel = 'electronico',
  cotasBiblioteca = {},
}) {
  const rootRef = useRef(null)
  const panelCol = { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }

  const updateBloque = (bk, bloque) => onChange({ ...borrador, [bk]: bloque })
  const patch = (p) => onChange({ ...borrador, ...p })

  const nombreLocked = !modoContra && esPrimeraFila && Boolean(bmInicialNombre)
  const tipoLocked = !modoContra && esPrimeraFila
  const metaDesdeIda = modoContra
  const listId = modoContra ? 'topo-niv-contra-puntos' : undefined

  const previewAbscisado = useMemo(
    () => previewAbscisadoCaptura(filas, borrador, tipoNivel, cotasBiblioteca),
    [filas, borrador, tipoNivel, cotasBiblioteca],
  )

  const onNombreInput = (valor) => {
    if (!modoContra || !filasIdaParaAutocomplete) {
      patch({ nombre_punto: valor })
      return
    }
    const meta = autocompletarDesdeIda(valor, filasIdaParaAutocomplete)
    if (meta) {
      patch({ ...meta, nombre_punto: meta.nombre_punto })
    } else {
      patch({
        nombre_punto: valor,
        tipo_punto: '',
        abscisa: '',
        descripcion_punto: '',
        ubicacion_pk_id: null,
        ubicacion_pk: '',
        ubicacion_tramo: '',
        ubicacion_costado: '',
        ubicacion_infraestructura: '',
        ubicacion_lat: null,
        ubicacion_lng: null,
        punto_biblioteca_id: null,
      })
    }
  }

  const hilosBloqueantes = useMemo(
    () => (esAutomatico ? filaHilosSeparacionBloqueante(borrador, 'automatico') : false),
    [borrador, esAutomatico],
  )

  const nombresSugeridos = sugerenciasPuntos
    || (filasIdaParaAutocomplete
      ? [...new Set((filasIdaParaAutocomplete || []).map((f) => (f.nombre_punto || '').trim()).filter(Boolean))]
      : [])

  return (
    <div
      ref={rootRef}
      onKeyDown={(e) => handleEnterAsTab(e, rootRef.current)}
      style={{
        display: 'grid',
        gridTemplateColumns: isCompact ? '1fr' : 'minmax(0, 1fr) minmax(0, 1.4fr)',
        gap: 10,
        padding: 10,
        borderRadius: 10,
        border: `1px solid ${modoContra ? '#7c3aed55' : `${ui.accent}55`}`,
        background: modoContra ? 'rgba(124,58,237,0.06)' : `${ui.accent}08`,
        marginBottom: 12,
      }}
    >
      {/* Identificación del punto */}
      <div style={{ ...panelCol, ...(!isCompact ? { borderRight: `1px solid ${sheet.border}`, paddingRight: 10 } : null) }}>
        <TopoExcelSheet
          title={modoContra ? 'Contranivelación — identificación' : 'Lectura actual — identificación'}
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
                <>
                  <input
                    value={borrador.nombre_punto || ''}
                    disabled={disabled}
                    list={listId}
                    onChange={(e) => onNombreInput(e.target.value)}
                    style={estiloCampo({ ...ui.compactInput, color: ui.text, width: '100%', boxSizing: 'border-box' }, false)}
                    placeholder={modoContra ? 'Nombre (solo puntos de la ida)' : 'Nombre del punto'}
                    autoComplete="off"
                  />
                  {listId && nombresSugeridos.length > 0 && (
                    <datalist id={listId}>
                      {nombresSugeridos.map((n) => (
                        <option key={n} value={n} />
                      ))}
                    </datalist>
                  )}
                </>
              )}
            </td>
          </tr>
          <tr>
            <td style={sheet.td}>Tipo</td>
            <td style={sheet.td}>
              {tipoLocked || metaDesdeIda ? (
                <span style={{ fontWeight: 700 }}>{tipoLocked ? 'BM' : (borrador.tipo_punto || '—')}</span>
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
              {metaDesdeIda ? (
                <span style={{ fontSize: 'var(--cc-sm)' }}>
                  {borrador.ubicacion_pk || borrador.abscisa || '—'}
                </span>
              ) : (
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
              )}
            </td>
          </tr>
          {esPrimeraFila && !modoContra ? (
            <tr>
              <td style={sheet.td}>Abscisa inicial</td>
              <td style={sheet.td}>
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={borrador.abscisa_inicial ?? ''}
                  disabled={disabled}
                  onChange={(e) => patch({ abscisa_inicial: e.target.value })}
                  style={{ ...ui.compactInput, color: ui.text, width: '100%', boxSizing: 'border-box' }}
                  placeholder="m (punto de partida del circuito)"
                  title="Abscisa de campo del BM / punto de inicio. La distancia acumulada del perfil parte de aquí."
                />
              </td>
            </tr>
          ) : null}
          <tr>
            <td style={sheet.td}>Descripción</td>
            <td style={sheet.td}>
              {metaDesdeIda ? (
                <span style={{ fontSize: 'var(--cc-sm)' }}>{borrador.descripcion_punto || '—'}</span>
              ) : (
                <input
                  value={borrador.descripcion_punto || ''}
                  disabled={disabled}
                  onChange={(e) => patch({ descripcion_punto: e.target.value })}
                  style={{ ...ui.compactInput, color: ui.text, width: '100%', boxSizing: 'border-box' }}
                  placeholder="Descripción del punto"
                />
              )}
            </td>
          </tr>
        </TopoExcelSheet>
        {tituloHint ? (
          <p style={{ margin: 0, fontSize: 'var(--cc-xs)', color: ui.textMuted, lineHeight: 1.35 }}>{tituloHint}</p>
        ) : (
          <p style={{ margin: 0, fontSize: 'var(--cc-xs)', color: ui.textMuted, lineHeight: 1.35 }}>
            {modoContra
              ? 'Escriba el nombre de un punto de la ida: Tipo, PK y Descripción se completan solos.'
              : esPrimeraFila
                ? 'Indique la abscisa inicial (m) del BM: es el origen del abscisado acumulado del circuito.'
                : 'Vi se agrega como fila propia (punto distinto), justo después de la estación con V+.'}
          </p>
        )}
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
            previewAbscisado={previewAbscisado}
          />
        </div>
        <button
          type="button"
          className="cc-topo-touch-btn"
          style={{ ...ui.btnPrimary, alignSelf: isCompact ? 'stretch' : 'flex-end', minWidth: 160 }}
          disabled={disabled || busy || !puedeAgregar || hilosBloqueantes}
          onClick={onAgregar}
          title={hilosBloqueantes
            ? 'Corrija la separación de hilos (Δ > 2 mm) antes de agregar'
            : (!puedeAgregar ? 'No se puede agregar en el estado actual' : 'Validar y agregar a la cartera')}
          data-testid={hilosBloqueantes ? 'niv-hilos-sep-bloqueo' : undefined}
        >
          Agregar lectura
        </button>
      </div>
    </div>
  )
}
