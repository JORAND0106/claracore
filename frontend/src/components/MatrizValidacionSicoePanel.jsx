import { formatCOP } from '../utils/formatCOP'
import { getDashTypoUI } from '../typographyScale'
import {
  MATRIZ_VALIDACION_FILAS,
  dashMatrizThDesdeNiveles,
  matrizValorNivel,
  mergeMatrizBloque,
} from '../utils/matrizValidacionDisplay'

function themeIsDarkChrome(activeTheme) {
  return activeTheme === 'dark'
}

function actaVigenteLabel(matriz, loading, actaFiltroMatriz) {
  if (loading && actaFiltroMatriz === 'vigente') return 'Cargando acta en período…'
  const av = matriz?.acta_vigente
  const filtro = matriz?.filtro
  if (filtro === 'sin_vigente_todo_contrato') return 'Sin acta RPO en período (todo el contrato)'
  if (av?.numero_rpo != null) {
    const nom = (av.asignado_nombre || '').trim()
    return `Acta RPO ${av.numero_rpo}${nom ? ` · ${nom}` : ''}`
  }
  return 'Sin acta en período'
}

const TABLAS_MATRIZ = [
  {
    key: 'obra_ejecutada_directo_sin_aiu',
    titulo: 'Obra ejecutada directo sin AIU',
    sub: 'Sin ensayos/sondeos ni IVA · valor = Σ ROUND0(ROUND(Σcant,2)×VU listado) por capítulo+ítem',
  },
  {
    key: 'ensayos_sondeos_directo_sin_iva',
    titulo: 'Ensayos y sondeos directo sin IVA',
    sub: 'Caps. 14–15 o nombre con ensayo/sondeo · misma regla de valorización',
  },
]

function IntegridadAvisoBanner({ integridad, textColor, borderColor, onVerDetalle, tonoNeutral = false }) {
  if (!integridad?.tiene_inconsistencias) return null
  const n = integridad.n_registros_afectados ?? integridad.n_inconsistencias ?? 0
  const at = integridad.afectan_totales
  const st = integridad.valor_guardado_desactualizado
  const msg =
    integridad.aviso ||
    (tonoNeutral
      ? `Registros por revisar frente al listado de precios: ${n}.`
      : `${n} registro(s) inconsistentes vs listado de precios` +
        (integridad.impacto_plata != null
          ? ` (impacto ≈ ${formatCOP(integridad.impacto_plata)})`
          : '') +
        '.')
  return (
    <div
      role="status"
      style={{
        marginBottom: 12,
        padding: '10px 12px',
        borderRadius: 8,
        border: `1px solid ${borderColor || '#94a3b8'}`,
        background: tonoNeutral ? 'rgba(148, 163, 184, 0.12)' : 'rgba(245, 158, 11, 0.12)',
        color: textColor || '#334155',
        fontSize: 13,
        lineHeight: 1.4,
      }}
    >
      <strong>{tonoNeutral ? 'Revisión listado:' : 'Integridad listado:'}</strong> {msg}
      {at || st ? (
        <div style={{ marginTop: 4, fontSize: 12, opacity: 0.9 }}>
          {at ? `Afectan totales: ${at.n_registros ?? 0}. ` : ''}
          {st ? `Valor guardado desactualizado: ${st.n_registros ?? 0}.` : ''}
        </div>
      ) : null}
      {typeof onVerDetalle === 'function' ? (
        <>
          {' '}
          <button
            type="button"
            onClick={onVerDetalle}
            style={{
              background: 'transparent',
              border: 'none',
              color: tonoNeutral ? '#334155' : '#b45309',
              fontWeight: 700,
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0,
              fontSize: 'inherit',
            }}
          >
            Ver detalle
          </button>
        </>
      ) : null}
    </div>
  )
}

/**
 * Panel «Validación por rol · SICOE Obra» compartido entre Dashboard e informe periódico.
 * variant=dashboard: selector de acta y textos de ayuda.
 * variant=capture: vista fija para captura (fondo claro, acta vigente).
 */
export default function MatrizValidacionSicoePanel({
  matriz,
  loading = false,
  niveles,
  t,
  activeTheme,
  fontSize = 'normal',
  variant = 'dashboard',
  actaFiltroMatriz = 'vigente',
  actasListaMatriz = [],
  onActaFiltroChange,
  /** Solo Admin/Desarrollador: el aviso de integridad ya no va en el tablero público. */
  showIntegridad = false,
  onVerIntegridad,
}) {
  const du = getDashTypoUI(fontSize)
  const fmtD = (n) => (n != null ? formatCOP(n) : '—')
  const isDark = themeIsDarkChrome(activeTheme)
  const isCapture = variant === 'capture'
  const textColor = isCapture ? '#0f172a' : t.text
  const textMuted = isCapture ? '#64748b' : t.textMuted
  const borderColor = isCapture ? '#cbd5e1' : t.border
  const textOnPastel = isDark && !isCapture ? '#0f172a' : isCapture ? '#0f172a' : t.text

  const naMat =
    Array.isArray(matriz?.niveles_activos) && matriz.niveles_activos.length
      ? [...matriz.niveles_activos].sort((a, b) => a - b)
      : Array.isArray(niveles?.niveles_activos) && niveles.niveles_activos.length
        ? [...niveles.niveles_activos].sort((a, b) => a - b)
        : [1, 2, 3]
  const colsMatriz = [...naMat].sort((a, b) => b - a)
  const nMinMat = naMat[0] ?? 1

  const renderTabla = (titulo, bloque, sub) => {
    const b = mergeMatrizBloque(bloque, colsMatriz)
    return (
      <div key={titulo} style={{ marginBottom: 18 }}>
        <div
          style={{
            fontSize: du.sub,
            fontWeight: 800,
            color: textColor,
            marginBottom: 4,
            letterSpacing: '0.3px',
          }}
        >
          {titulo}
        </div>
        {sub ? (
          <div style={{ fontSize: du.sub, color: textMuted, marginBottom: 8, lineHeight: 1.35 }}>
            {sub}
          </div>
        ) : null}
        <div className={isCapture ? undefined : 'cc-dash-table-wrap'} style={isCapture ? undefined : { overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: du.table,
              minWidth: Math.max(280, 120 + colsMatriz.length * 100),
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '6px 4px',
                    borderBottom: `1px solid ${borderColor}`,
                    color: textMuted,
                    textTransform: 'uppercase',
                    fontSize: du.table,
                  }}
                >
                  Estado
                </th>
                {colsMatriz.map((n) => (
                  <th
                    key={n}
                    style={{
                      textAlign: 'right',
                      padding: '6px 4px',
                      borderBottom: `1px solid ${borderColor}`,
                      color: textMuted,
                      textTransform: 'uppercase',
                      fontSize: du.table,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {dashMatrizThDesdeNiveles(niveles, n)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATRIZ_VALIDACION_FILAS.map((row) => {
                const d = b[row.key] || {}
                const tc = row.dark ? '#f9fafb' : textOnPastel
                const tcLabel = row.dark ? '#fff' : textOnPastel
                const label = row.dynamicLabel ? `PENDIENTE N${nMinMat}` : row.label
                return (
                  <tr key={row.key} style={{ background: row.bg }}>
                    <td
                      style={{
                        padding: '6px 4px',
                        fontWeight: 700,
                        color: tcLabel,
                        fontSize: du.rowLabel,
                      }}
                    >
                      {label}
                    </td>
                    {colsMatriz.map((n) => (
                      <td
                        key={n}
                        style={{
                          textAlign: 'right',
                          padding: '6px 4px',
                          color: tc,
                          fontWeight: 600,
                          fontSize: du.table,
                        }}
                      >
                        {fmtD(matrizValorNivel(d, n, row.key === 'pendiente_item'))}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const actaLabel = actaVigenteLabel(matriz, loading, actaFiltroMatriz)

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: du.title, fontWeight: 700, color: textColor }}>
          Validación por rol · SICOE Obra
        </div>
        {!isCapture && (
          <div style={{ fontSize: du.sub, color: textMuted, marginTop: 4 }}>
            Por defecto se usa el acta RPO cuyo período incluye hoy. Cada celda = estado en ese nivel
            (con prerrequisitos aprobados). Valor = ROUND0(ROUND(Σcant,2)×VU listado) por capítulo+ítem —
            misma regla que Ppto vs Cobro / Total Cobrado para el mismo acta, nivel y capítulos.
          </div>
        )}
        {isCapture ? (
          <div style={{ fontSize: du.sub, color: textMuted, marginTop: 4 }}>
            {actaLabel}
            {loading ? ' · Actualizando…' : ''}
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 10 }}>
            <span style={{ fontSize: du.sub, color: textMuted }}>Acta RPO:</span>
            <select
              className={`cc-dashboard-acta-select cc-dashboard-acta-select--${isDark ? 'dark' : 'light'}`}
              value={actaFiltroMatriz}
              onChange={(e) => onActaFiltroChange?.(e.target.value)}
              style={{
                fontSize: du.body,
                padding: '6px 10px',
                borderRadius: 6,
                border: `1px solid ${t.border}`,
                background: t.bgCard,
                color: t.text,
                maxWidth: 'min(420px, 100%)',
                minHeight: 32,
                cursor: 'pointer',
                colorScheme: isDark ? 'dark' : 'light',
              }}
            >
              <option value="vigente" style={{ background: t.bgCard, color: t.text }}>
                {actaLabel}
              </option>
              <option value="all" style={{ background: t.bgCard, color: t.text }}>
                Todo el contrato (histórico)
              </option>
              {(() => {
                const rpoRows = (actasListaMatriz || []).filter(
                  (a) => a && String(a.tipo_grupo || '').toUpperCase() === 'RPO' && a.numero_rpo != null && a.numero_rpo !== '',
                )
                const nums = rpoRows.map((a) => Number(a.numero_rpo)).filter((n) => !Number.isNaN(n))
                const sorted =
                  nums.length === rpoRows.length
                    ? [...new Set(nums)].sort((a, b) => b - a)
                    : [...new Set(rpoRows.map((a) => a.numero_rpo))].sort((a, b) =>
                        String(b).localeCompare(String(a), undefined, { numeric: true }),
                      )
                return sorted.map((n) => {
                  const row = rpoRows.find((r) => String(r.numero_rpo) === String(n))
                  const nom = (row?.asignado_nombre || '').trim()
                  const lab = `Acta RPO ${n}${nom ? ` · ${nom}` : ''}`
                  return (
                    <option key={n} value={String(n)} style={{ background: t.bgCard, color: t.text }}>
                      {lab}
                    </option>
                  )
                })
              })()}
            </select>
            {loading && <span style={{ fontSize: du.sub, color: textMuted }}>Cargando…</span>}
          </div>
        )}
      </div>

      {showIntegridad ? (
        <IntegridadAvisoBanner
          integridad={matriz?.integridad}
          textColor={isCapture ? '#334155' : t.text}
          borderColor="#94a3b8"
          tonoNeutral
          onVerDetalle={onVerIntegridad}
        />
      ) : null}

      {!matriz && !loading ? (
        <div style={{ fontSize: du.body, color: textMuted, padding: '12px 0' }}>Sin datos de validación.</div>
      ) : (
        <>
          {!isCapture && (
            <div style={{ marginBottom: 12, fontSize: du.sub, color: textMuted, lineHeight: 1.35 }}>
              Columnas según niveles de validación del contrato (
              {colsMatriz
                .slice()
                .sort((a, b) => a - b)
                .map((n) => `N${n}`)
                .join(' · ')}
              ). En cada fila, el monto en una columna N refleja el estado de validación en ese nivel (con
              prerequisitos aprobados en niveles inferiores).
            </div>
          )}
          {TABLAS_MATRIZ.map(({ key, titulo, sub }) => renderTabla(titulo, matriz?.[key], sub))}
        </>
      )}
    </>
  )
}

export { IntegridadAvisoBanner }
