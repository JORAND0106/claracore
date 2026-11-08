import { useCallback, useEffect, useMemo, useState } from 'react'
import DisenoCrearTramoModal from './DisenoCrearTramoModal'
import { DisenoNuevaEstructuraModal, sumEspesores } from './DisenoEstructuraPanel'
import DisenoPreviewCotasModal from './DisenoPreviewCotasModal'
import DisenoTramoDetalleModal from './DisenoTramoDetalleModal'
import DisenoTramoMapaPkModal from './DisenoTramoMapaPkModal'
import {
  IconEdit,
  IconEye,
  IconLayers,
  IconPlusMap,
  IconTrash,
} from './disenoDgIcons'
import TopoConfirmModal from './TopoConfirmModal'
import TopoErrorModal from './TopoErrorModal'
import TopoExcelSheet from './TopoExcelSheet'
import { topoSheetStyles } from './topoSheetStyles'
import {
  parseApiError,
  PanelColapsable,
  PermisoAviso,
  puede,
  TopoHelpIcon,
  useTopografiaApi,
  useTopoTheme,
} from './topografiaShared'

const AYUDA_MODULO_DISENO =
  'Defina las estructuras de vía una sola vez a nivel del contrato. Cree tramos desde el mapa '
  + '(seleccionando pk_ID), asigne estructuras por sector y cargue el diseño geométrico desde el detalle del tramo.'

function fmtN(v, dec = 3) {
  if (v == null || v === '') return '—'
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(dec) : '—'
}

function IconBtn({ title, onClick, disabled, danger, primary, children, style }) {
  const ui = useTopoTheme()
  const base = primary ? ui.btnPrimary : ui.btnSecondary
  return (
    <button
      type="button"
      className="cc-topo-touch-btn"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...base,
        width: 40,
        height: 40,
        padding: 0,
        minWidth: 40,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: danger ? '#dc2626' : (primary ? undefined : ui.text),
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  )
}

const TRAMO_COLS = [
  { key: 'tramo', label: 'Tramo' },
  { key: 'abs', label: 'Abscisa inicio – fin', width: 160 },
  { key: 'est', label: 'Estructura(s) · espesor total' },
  { key: 'dg', label: 'Diseño geométrico', width: 160 },
  { key: 'acc', label: '', width: 44 },
]

export default function DisenoGeometricoForm({ contratoId, token, permisos }) {
  const ui = useTopoTheme()
  const sheet = useMemo(() => topoSheetStyles(ui.t), [ui.t])
  const { api } = useTopografiaApi(contratoId, token)

  const [lista, setLista] = useState([])
  const [estructuras, setEstructuras] = useState([])
  const [estructurasAbiertas, setEstructurasAbiertas] = useState(true)
  const [busy, setBusy] = useState(false)
  const [errorModal, setErrorModal] = useState(null)

  const [mapaOpen, setMapaOpen] = useState(false)
  const [pksPendientes, setPksPendientes] = useState([])
  const [crearOpen, setCrearOpen] = useState(false)
  const [editandoTramo, setEditandoTramo] = useState(null)

  const [detalle, setDetalle] = useState(null)
  const [detalleResumen, setDetalleResumen] = useState(null)
  const [detalleOpen, setDetalleOpen] = useState(false)
  const [detalleLoading, setDetalleLoading] = useState(false)

  const [modalEstructura, setModalEstructura] = useState(null) // null | { mode, estructura? }
  const [confirmEliminar, setConfirmEliminar] = useState(null)
  const [confirmEliminarEst, setConfirmEliminarEst] = useState(null)
  const [previewDesdeGrilla, setPreviewDesdeGrilla] = useState(null)
  const [previewLoadingId, setPreviewLoadingId] = useState(null)

  const showError = useCallback((err) => {
    setErrorModal(parseApiError(err?.message || String(err)))
  }, [])

  const cargarLista = useCallback(async () => {
    try {
      const data = await api(`/diseno-geometrico/ejes?_=${Date.now()}`)
      setLista(Array.isArray(data) ? data : [])
    } catch (e) {
      showError(e)
    }
  }, [api, showError])

  const cargarEstructuras = useCallback(async () => {
    try {
      const data = await api(`/diseno-geometrico/estructuras?_=${Date.now()}`)
      setEstructuras(Array.isArray(data) ? data : [])
    } catch (e) {
      showError(e)
    }
  }, [api, showError])

  useEffect(() => {
    cargarLista()
    cargarEstructuras()
  }, [cargarLista, cargarEstructuras])

  const abrirDetalle = (rowOrId) => {
    const id = typeof rowOrId === 'object' ? rowOrId?.id : rowOrId
    if (!id) return
    const resumen = typeof rowOrId === 'object'
      ? rowOrId
      : (lista.find((r) => r.id === id) || { id, nombre: 'Tramo' })
    // Abrir de inmediato: un solo clic, con estado de carga si el detalle tarda.
    setDetalleResumen(resumen)
    setDetalle(null)
    setDetalleOpen(true)
    setDetalleLoading(true)
    api(`/diseno-geometrico/ejes/${id}?_=${Date.now()}`)
      .then((data) => {
        setDetalle(data)
        setDetalleResumen(data?.eje || resumen)
      })
      .catch((e) => {
        showError(e)
        setDetalleOpen(false)
      })
      .finally(() => setDetalleLoading(false))
  }

  const recargarDetalle = async (id) => {
    setDetalleLoading(true)
    try {
      const data = await api(`/diseno-geometrico/ejes/${id}?_=${Date.now()}`)
      setDetalle(data)
      setDetalleResumen(data?.eje || null)
      await cargarLista()
      return data
    } finally {
      setDetalleLoading(false)
    }
  }

  const iniciarCrearTramo = () => {
    if (!puede(permisos, 'crear')) return
    setEditandoTramo(null)
    setPksPendientes([])
    setMapaOpen(true)
  }

  const onMapaConfirm = (pks) => {
    setPksPendientes(pks || [])
    setMapaOpen(false)
    setCrearOpen(true)
  }

  const guardarTramo = async (payload) => {
    setBusy(true)
    try {
      if (editandoTramo?.eje?.id) {
        const data = await api(`/diseno-geometrico/ejes/${editandoTramo.eje.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        setDetalle(data)
        setDetalleOpen(true)
      } else {
        const data = await api('/diseno-geometrico/ejes', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        setDetalle(data)
        setDetalleOpen(true)
      }
      setCrearOpen(false)
      setEditandoTramo(null)
      setPksPendientes([])
      await cargarLista()
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const eliminarTramo = async () => {
    const id = confirmEliminar?.id
    if (!id) return
    setBusy(true)
    try {
      await api(`/diseno-geometrico/ejes/${id}`, { method: 'DELETE' })
      if (detalle?.eje?.id === id) {
        setDetalle(null)
        setDetalleOpen(false)
      }
      setConfirmEliminar(null)
      await cargarLista()
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const guardarEstructuraContrato = async (nombre, capas) => {
    setBusy(true)
    try {
      if (modalEstructura?.mode === 'edit' && modalEstructura.estructura?.id) {
        await api(`/diseno-geometrico/estructuras/${modalEstructura.estructura.id}`, {
          method: 'PUT',
          body: JSON.stringify({ nombre, capas }),
        })
      } else {
        await api('/diseno-geometrico/estructuras', {
          method: 'POST',
          body: JSON.stringify({ nombre, capas }),
        })
      }
      setModalEstructura(null)
      await cargarEstructuras()
      await cargarLista()
      if (detalle?.eje?.id) await recargarDetalle(detalle.eje.id)
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const eliminarEstructura = async () => {
    const id = confirmEliminarEst?.id
    if (!id) return
    setBusy(true)
    try {
      await api(`/diseno-geometrico/estructuras/${id}`, { method: 'DELETE' })
      setConfirmEliminarEst(null)
      await cargarEstructuras()
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const abrirPreviewDesdeGrilla = async (row) => {
    if (!row?.diseno_cargado && !(row.filas_rasante > 0)) return
    setPreviewLoadingId(row.id)
    try {
      const data = await api(`/diseno-geometrico/ejes/${row.id}?_=${Date.now()}`)
      setPreviewDesdeGrilla(data)
    } catch (e) {
      showError(e)
    } finally {
      setPreviewLoadingId(null)
    }
  }

  const estructurasLabel = (row) => {
    const items = row.espesor_total_estructuras_m || row.estructuras_resumen || []
    if (items.length) {
      return items.map((e) => {
        const esp = e.espesor_total_m != null ? Number(e.espesor_total_m).toFixed(3) : '—'
        return `${e.nombre} (Σ ${esp} m)`
      }).join(' · ')
    }
    if (row.estructura_vigente_nombre) return row.estructura_vigente_nombre
    return '—'
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ margin: 0, flex: '1 1 auto', fontSize: 'var(--cc-lg)', color: ui.text }}>
          Configuración DG
        </h3>
        <TopoHelpIcon ayuda={AYUDA_MODULO_DISENO} />
        <PermisoAviso permisos={permisos} accion="crear">
          {puede(permisos, 'crear') && (
            <IconBtn title="Crear tramo (seleccionar pk_ID en el mapa)" onClick={iniciarCrearTramo} primary disabled={busy}>
              <IconPlusMap />
            </IconBtn>
          )}
        </PermisoAviso>
      </div>

      <PanelColapsable
        ui={ui}
        titulo="Estructuras del contrato"
        abierto={estructurasAbiertas}
        onToggle={() => setEstructurasAbiertas((v) => !v)}
        resumen={`${estructuras.length} estructura(s)`}
        style={{ marginBottom: 16 }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <p style={{ margin: 0, flex: 1, fontSize: 'var(--cc-xs)', color: ui.textMuted, lineHeight: 1.45 }}>
            Se definen una sola vez y quedan disponibles para todos los tramos. Primera capa = terminado / rasante.
          </p>
          <PermisoAviso permisos={permisos} accion="crear">
            {puede(permisos, 'crear') && (
              <IconBtn
                title="Nueva estructura del contrato"
                onClick={() => setModalEstructura({ mode: 'create' })}
                primary
                disabled={busy}
              >
                <IconLayers />
              </IconBtn>
            )}
          </PermisoAviso>
        </div>

        {!estructuras.length ? (
          <p style={{ margin: 0, fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
            Aún no hay estructuras. Créelas antes de configurar tramos.
          </p>
        ) : (
          <TopoExcelSheet
            sheet={sheet}
            columns={[
              { key: 'nom', label: 'Estructura' },
              { key: 'cap', label: 'Capas', width: 70 },
              { key: 'esp', label: 'Espesor total', width: 120 },
              { key: 'acc', label: '', width: 80 },
            ]}
            minWidth={420}
          >
            {estructuras.map((e) => (
              <tr key={e.id}>
                <td style={sheet.td}>{e.nombre}</td>
                <td style={sheet.td}>{(e.capas || []).length}</td>
                <td style={sheet.td}>
                  {e.espesor_total_m != null
                    ? `${Number(e.espesor_total_m).toFixed(3)} m`
                    : `${sumEspesores((e.capas || []).map((c) => ({ espesor_m: c.espesor_m }))).toFixed(3)} m`}
                </td>
                <td style={sheet.td}>
                  <div style={{ display: 'inline-flex', gap: 4 }}>
                    {puede(permisos, 'editar') && (
                      <IconBtn
                        title="Editar estructura"
                        onClick={() => setModalEstructura({ mode: 'edit', estructura: e })}
                        disabled={busy}
                        style={{ width: 32, height: 32, minWidth: 32 }}
                      >
                        <IconEdit width={16} height={16} />
                      </IconBtn>
                    )}
                    {puede(permisos, 'eliminar') && (
                      <IconBtn
                        title="Eliminar estructura"
                        danger
                        onClick={() => setConfirmEliminarEst({ id: e.id, nombre: e.nombre })}
                        disabled={busy}
                        style={{ width: 32, height: 32, minWidth: 32 }}
                      >
                        <IconTrash width={16} height={16} />
                      </IconBtn>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </TopoExcelSheet>
        )}
      </PanelColapsable>

      <div style={{ ...ui.card, padding: '14px 16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <h4 style={{ margin: 0, flex: 1, fontSize: 'var(--cc-base)', color: ui.text }}>Tramos</h4>
          <span style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>{lista.length} registro(s)</span>
        </div>

        {!lista.length ? (
          <p style={{ margin: 0, fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
            Aún no hay tramos. Use el botón de crear tramo para seleccionar pk_ID en el mapa.
          </p>
        ) : (
          <TopoExcelSheet sheet={sheet} columns={TRAMO_COLS} minWidth={640}>
            {lista.map((row) => {
              const cargado = !!(row.diseno_cargado || (row.filas_rasante || 0) > 0)
              return (
                <tr
                  key={row.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => abrirDetalle(row)}
                  title="Ver detalle del tramo"
                >
                  <td style={sheet.td}>
                    <strong style={{ color: ui.text }}>{row.nombre || '—'}</strong>
                  </td>
                  <td style={sheet.td}>
                    {fmtN(row.abscisa_inicio ?? row.abscisa_min, 2)} – {fmtN(row.abscisa_fin ?? row.abscisa_max, 2)}
                  </td>
                  <td style={sheet.td}>{estructurasLabel(row)}</td>
                  <td style={sheet.td} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      <span style={{
                        fontWeight: 700,
                        fontSize: 'var(--cc-xs)',
                        color: cargado ? (ui.t?.success || '#16a34a') : (ui.t?.warn || '#b45309'),
                      }}>
                        {cargado ? 'Cargado' : 'Pendiente'}
                      </span>
                      {cargado && (
                        <IconBtn
                          title="Vista previa del diseño geométrico"
                          onClick={() => abrirPreviewDesdeGrilla(row)}
                          disabled={previewLoadingId === row.id}
                          style={{ width: 32, height: 32, minWidth: 32 }}
                        >
                          <IconEye width={16} height={16} />
                        </IconBtn>
                      )}
                    </div>
                  </td>
                  <td style={sheet.td} onClick={(e) => e.stopPropagation()}>
                    {puede(permisos, 'eliminar') && (
                      <IconBtn
                        title="Eliminar tramo"
                        danger
                        onClick={() => setConfirmEliminar({ id: row.id, nombre: row.nombre })}
                        disabled={busy}
                        style={{ width: 32, height: 32, minWidth: 32 }}
                      >
                        <IconTrash width={16} height={16} />
                      </IconBtn>
                    )}
                  </td>
                </tr>
              )
            })}
          </TopoExcelSheet>
        )}
      </div>

      {mapaOpen && (
        <DisenoTramoMapaPkModal
          t={ui.t}
          token={token}
          contratoId={contratoId}
          initialPks={pksPendientes}
          onConfirm={onMapaConfirm}
          onClose={() => setMapaOpen(false)}
        />
      )}

      <DisenoCrearTramoModal
        open={crearOpen}
        pks={pksPendientes}
        estructuras={estructuras}
        initial={editandoTramo ? {
          id: editandoTramo.eje?.id,
          nombre: editandoTramo.eje?.nombre,
          abscisa_inicio: editandoTramo.eje?.abscisa_inicio,
          abscisa_fin: editandoTramo.eje?.abscisa_fin,
          sectores: editandoTramo.sectores,
        } : null}
        saving={busy}
        onSave={guardarTramo}
        onBackToMap={() => {
          setCrearOpen(false)
          setMapaOpen(true)
        }}
        onClose={() => {
          if (!busy) {
            setCrearOpen(false)
            setEditandoTramo(null)
          }
        }}
      />

      <DisenoTramoDetalleModal
        open={detalleOpen}
        detalle={detalle}
        loading={detalleLoading}
        resumen={detalleResumen}
        contratoId={contratoId}
        token={token}
        permisos={permisos}
        busy={busy}
        api={api}
        onReload={recargarDetalle}
        onEdit={(d) => {
          if (!d) return
          setDetalleOpen(false)
          setEditandoTramo(d)
          setPksPendientes((d.pks || []).map((p) => ({
            ...p,
            ubicacion_pk: p.pk_label,
            ubicacion_pk_id: p.pk_id,
            ubicacion_tramo: p.tramo_plataforma,
            ubicacion_costado: p.costado,
            ubicacion_infraestructura: p.infraestructura,
            ubicacion_lat: p.lat,
            ubicacion_lng: p.lng,
          })))
          setCrearOpen(true)
        }}
        onClose={() => {
          if (!busy && !detalleLoading) {
            setDetalleOpen(false)
            setDetalle(null)
            setDetalleResumen(null)
          }
        }}
        onError={showError}
      />

      <DisenoNuevaEstructuraModal
        open={!!modalEstructura}
        saving={busy}
        titulo={modalEstructura?.mode === 'edit' ? 'Editar estructura del contrato' : 'Nueva estructura del contrato'}
        descripcion="Capas de arriba hacia abajo. Primera capa = terminado / rasante. Queda disponible para todos los tramos."
        initialNombre={modalEstructura?.estructura?.nombre || ''}
        initialCapas={modalEstructura?.estructura?.capas || null}
        onSave={guardarEstructuraContrato}
        onClose={() => { if (!busy) setModalEstructura(null) }}
      />

      <DisenoPreviewCotasModal
        open={!!previewDesdeGrilla}
        eje={previewDesdeGrilla?.eje}
        rasante={previewDesdeGrilla?.rasante || []}
        perfilPuntos={previewDesdeGrilla?.perfil_puntos || []}
        onClose={() => setPreviewDesdeGrilla(null)}
      />

      {confirmEliminar && (
        <TopoConfirmModal
          theme={ui.t}
          titulo="Eliminar tramo"
          confirmLabel={busy ? 'Eliminando…' : 'Eliminar'}
          onCancel={() => { if (!busy) setConfirmEliminar(null) }}
          onConfirm={eliminarTramo}
        >
          ¿Eliminar el tramo <strong>«{confirmEliminar.nombre}»</strong> y su diseño geométrico?
        </TopoConfirmModal>
      )}

      {confirmEliminarEst && (
        <TopoConfirmModal
          theme={ui.t}
          titulo="Eliminar estructura"
          confirmLabel={busy ? 'Eliminando…' : 'Eliminar'}
          onCancel={() => { if (!busy) setConfirmEliminarEst(null) }}
          onConfirm={eliminarEstructura}
        >
          ¿Eliminar la estructura <strong>«{confirmEliminarEst.nombre}»</strong> del contrato?
          No debe estar asignada a ningún tramo.
        </TopoConfirmModal>
      )}

      {errorModal && (
        <TopoErrorModal theme={ui.t} titulo={errorModal.titulo} onClose={() => setErrorModal(null)}>
          {errorModal.mensaje}
        </TopoErrorModal>
      )}
    </div>
  )
}
