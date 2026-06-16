import { useCallback, useState } from 'react'
import {
  chipEstadoValidacion,
  determinarNivelValidacionTopo,
  useTopoTheme,
} from './topografiaShared'
import PoligonalValidacionComentarioModal from './PoligonalValidacionComentarioModal'

const BTNS = [
  { estado: 'Aprobado', icon: '✅', color: '#16a34a' },
  { estado: 'Pendiente', icon: '🟡', color: '#d97706' },
  { estado: 'Rechazado', icon: '🔴', color: '#dc2626' },
]

function PanelNivel({ titulo, ayuda, estadoActual, habilitado, busy, bloqueado, aviso, onValidar }) {
  const ui = useTopoTheme()
  const chip = chipEstadoValidacion(estadoActual)
  return (
    <div style={{ background: ui.t?.bg || '#fff', borderRadius: 10, padding: 14, border: `1px solid ${ui.t?.border || '#e2e8f0'}`, minWidth: 0, flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span
          style={{ fontSize: 'var(--cc-xs)', fontWeight: 800, color: ui.textMuted, letterSpacing: '0.5px', textTransform: 'uppercase' }}
          title={ayuda}
        >
          🚦 {titulo}
        </span>
        <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 'var(--cc-xs)', fontWeight: 600, background: chip.bg, color: chip.color }}>
          {chip.label}
        </span>
      </div>
      {aviso && !habilitado && (
        <p style={{ margin: '0 0 8px', fontSize: 'var(--cc-xs)', color: '#b45309' }}>{aviso}</p>
      )}
      {habilitado && !bloqueado && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {BTNS.map(({ estado, icon, color }) => {
            const activo = estadoActual === estado
            return (
              <button
                key={estado}
                type="button"
                disabled={busy}
                onClick={() => onValidar(estado)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 8,
                  fontSize: 'var(--cc-xs)',
                  fontWeight: 700,
                  cursor: busy ? 'wait' : 'pointer',
                  background: activo ? `${color}22` : 'transparent',
                  color,
                  border: activo ? `2px solid ${color}` : `1.5px solid ${color}55`,
                }}
              >
                {icon} {estado}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function PoligonalValidacionPanel({
  poligonal,
  cierre,
  permisos,
  usuario,
  contratoId,
  token,
  api,
  onActualizado,
  onError,
  soloLectura = false,
  validarPathPrefix = null,
  requisitosN1Ok = true,
  avisoRequisitosN1 = null,
  avisoPreValidacion = null,
}) {
  const ui = useTopoTheme()
  const [busy, setBusy] = useState(false)
  const [modalVal, setModalVal] = useState(null)

  const pol = poligonal || {}
  const nv = determinarNivelValidacionTopo(usuario, permisos)
  const terminada = pol.estado === 'cerrado'
  const ajustada = Boolean(pol.ajustada_at)
  const cierreOk = cierre?.cerrado && cierre?.admisible_lineal
  const listaValidar = terminada && ajustada && cierreOk
  const n1Aprobado = (pol.nivel1_estado || '') === 'Aprobado'
  const sellada = (pol.nivel2_estado || '') === 'Aprobado' || Boolean(pol.biblioteca_at)

  const habilitadoN1 = !soloLectura && listaValidar && !sellada && requisitosN1Ok && (nv.esDev || (nv.puedeValidar && nv.niveles.includes(1)))
  const habilitadoN2 = !soloLectura && listaValidar && !sellada && n1Aprobado && (nv.esDev || (nv.puedeValidar && nv.niveles.includes(2)))

  const basePath = validarPathPrefix || `/poligonales/${pol.id}`
  const esNivelacion = basePath.includes('nivelacion')

  const ejecutar = useCallback(async (nivel, estado, comentario_data) => {
    setBusy(true)
    try {
      await api(`${basePath}/validar-nivel${nivel}`, {
        method: 'PUT',
        body: JSON.stringify({ estado, comentario_data: comentario_data || undefined }),
      })
      setModalVal(null)
      onActualizado?.()
    } catch (e) {
      onError?.(e)
    } finally {
      setBusy(false)
    }
  }, [api, basePath, onActualizado, onError])

  const onValidarNivel = (nivel) => (estado) => {
    setModalVal({ nivel, estado })
  }

  if (!poligonal?.id && !soloLectura) return null

  const avisoGeneral = avisoPreValidacion
    || (!terminada && !soloLectura
      ? (esNivelacion
        ? 'Termine la nivelación (cierre admisible) antes de validar.'
        : 'Termine la poligonal antes de validar.')
      : null)

  return (
    <div style={{ marginTop: 12 }}>
      {avisoGeneral && !sellada && (
        <p style={{ margin: '0 0 8px', fontSize: 'var(--cc-xs)', color: '#b45309' }}>{avisoGeneral}</p>
      )}
      {nv.esDev && !soloLectura && listaValidar && !sellada && (
        <p style={{ margin: '0 0 8px', fontSize: 'var(--cc-xs)', color: '#64748b' }} title="Como desarrollador puede validar contratista e interventoría en sus paneles">
          Modo desarrollador: puede validar ambos niveles. Interventoría se habilita tras aprobar contratista.
        </p>
      )}

      {!listaValidar && !soloLectura && terminada && (
        <p style={{ margin: '0 0 8px', fontSize: 'var(--cc-xs)', color: '#b45309' }} title="Verifique el cierre antes de validar">
          {!ajustada
            ? (esNivelacion ? 'Ejecute «Guardar y calcular» antes de validar.' : 'Ejecute «Corregir y ajustar» antes de validar.')
            : !cierreOk
              ? 'El cierre debe ser admisible.'
              : ''}
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, alignItems: 'stretch' }}>
        <PanelNivel
          titulo="Contratista"
          ayuda="Primera aprobación del circuito topográfico (contratista / topógrafo)."
          estadoActual={pol.nivel1_estado}
          habilitado={habilitadoN1}
          busy={busy}
          bloqueado={sellada}
          aviso={
            !requisitosN1Ok && !sellada && listaValidar
              ? avisoRequisitosN1
              : null
          }
          onValidar={onValidarNivel(1)}
        />

        <PanelNivel
          titulo="Interventoría"
          ayuda="Segunda aprobación. Al aprobar, las coordenadas ajustadas se publican en la biblioteca."
          estadoActual={pol.nivel2_estado}
          habilitado={habilitadoN2}
          busy={busy}
          bloqueado={sellada}
          aviso={
            !habilitadoN2 && !sellada && n1Aprobado && !listaValidar
              ? 'Ejecute «Corregir y ajustar» antes de validar.'
              : !habilitadoN2 && !sellada && !n1Aprobado
                ? 'Requiere aprobación de contratista.'
                : null
          }
          onValidar={onValidarNivel(2)}
        />
      </div>

      <PoligonalValidacionComentarioModal
        open={Boolean(modalVal)}
        estado={modalVal?.estado}
        nivel={modalVal?.nivel}
        contratoId={contratoId}
        token={token}
        onCancel={() => setModalVal(null)}
        onConfirm={(comentario_data) => ejecutar(modalVal.nivel, modalVal.estado, comentario_data)}
      />
    </div>
  )
}
