import { useCallback, useEffect, useState } from 'react'

import PoligonalModal from './PoligonalModal'

import PoligonalGrafico from './PoligonalGrafico'

import PoligonalCalculoTable from './PoligonalCalculoTable'

import PoligonalCierrePanel from './PoligonalCierrePanel'

import FirmaPerfilTopo from './FirmaPerfilTopo'

import TopoErrorModal from './TopoErrorModal'

import TopoConfirmModal from './TopoConfirmModal'

import { parseApiError, PermisoAviso, puede, useTopografiaApi, useTopoTheme } from './topografiaShared'

export default function PoligonalForm({ contratoId, token, permisos }) {
  const ui = useTopoTheme()
  const { api, downloadPdf } = useTopografiaApi(contratoId, token)

  const [lista, setLista] = useState([])

  const [sel, setSel] = useState(null)

  const [detalle, setDetalle] = useState(null)

  const [resultado, setResultado] = useState(null)

  const [errorModal, setErrorModal] = useState(null)

  const [modalOpen, setModalOpen] = useState(false)

  const [modalPoligonalId, setModalPoligonalId] = useState(null)

  const [puntosVerificados, setPuntosVerificados] = useState([])

  const [confirmEliminar, setConfirmEliminar] = useState(null)

  const [eliminando, setEliminando] = useState(false)

  const [refreshingVista, setRefreshingVista] = useState(false)

  const [vistaRev, setVistaRev] = useState(0)

  const [ajustando, setAjustando] = useState(false)

  const [pdfBusy, setPdfBusy] = useState(false)



  const showError = useCallback((err) => {

    setErrorModal(parseApiError(err?.message || String(err)))

  }, [])



  const cargarLista = useCallback(async () => {

    try {

      const data = await api('/poligonales')

      setLista(data || [])

    } catch (e) {

      showError(e)

    }

  }, [api, showError])



  const cargarDetalle = useCallback(async (id) => {

    setRefreshingVista(true)

    try {

      const data = await api(`/poligonales/${id}?_=${Date.now()}`)

      setDetalle(data)

      setSel(id)

      setVistaRev(Date.now())

      setResultado(null)

    } catch (e) {

      showError(e)

    } finally {

      setRefreshingVista(false)

    }

  }, [api, showError])



  useEffect(() => {

    cargarLista()

    api('/puntos/verificados').then(setPuntosVerificados).catch(() => {})

  }, [api, cargarLista])



  useEffect(() => {

    if (!lista.length || sel) return

    cargarDetalle(lista[0].id)

  }, [lista, sel, cargarDetalle])



  const abrirNueva = () => {

    setModalPoligonalId(null)

    setModalOpen(true)

  }



  const abrirEditar = (id) => {

    setModalPoligonalId(id || sel)

    setModalOpen(true)

  }



  const descargarPdfPoligonal = async () => {

    if (!sel) return

    setPdfBusy(true)

    try {

      await downloadPdf(`/poligonales/${sel}/pdf`, 'poligonal.pdf')

    } catch (e) {

      showError(e)

    } finally {

      setPdfBusy(false)

    }

  }



  const ajustarPoligonal = async () => {

    if (!sel) return

    setAjustando(true)

    try {

      await api(`/poligonales/${sel}/calcular`, { method: 'POST' })

      await cargarDetalle(sel)

    } catch (e) {

      showError(e)

    } finally {

      setAjustando(false)

    }

  }



  const validar = async () => {

    if (!sel) return

    try {

      await api(`/poligonales/${sel}/validar`, { method: 'POST' })

      cargarDetalle(sel)

      cargarLista()

    } catch (e) {

      showError(e)

    }

  }



  const confirmarEliminacion = async () => {

    const id = confirmEliminar?.id

    if (!id) return

    setEliminando(true)

    try {

      await api(`/poligonales/${id}`, { method: 'DELETE' })

      if (sel === id) {

        setSel(null)

        setDetalle(null)

        setResultado(null)

      }

      await cargarLista()

      setConfirmEliminar(null)

    } catch (e) {

      showError(e)

    } finally {

      setEliminando(false)

    }

  }



  const seleccionarTab = (id) => {

    if (sel === id && detalle) return

    cargarDetalle(id)

  }



  return (

    <div>

      <div style={ui.tabBar} role="tablist" aria-label="Poligonales del contrato">

        <PermisoAviso permisos={permisos} accion="crear">

          <button

            type="button"

            style={{ ...ui.tabBtn(false), borderStyle: 'dashed', color: ui.accent }}

            onClick={abrirNueva}

            title="Crear circuito en la libreta de cálculo"

          >

            + Nueva

          </button>

        </PermisoAviso>

        {lista.map((p) => {

          const active = sel === p.id

          return (

            <div key={p.id} style={{ display: 'inline-flex', alignItems: 'stretch', flexShrink: 0 }}>

              <button

                type="button"

                role="tab"

                aria-selected={active}

                style={ui.tabBtn(active)}

                onClick={() => seleccionarTab(p.id)}

                onDoubleClick={() => abrirEditar(p.id)}

                title={`${p.nombre} (${p.estado}). Doble clic: abrir libreta`}

              >

                <span>{p.nombre}</span>

                <small style={{ color: ui.textMuted, fontWeight: 400 }}>({p.estado})</small>

              </button>

              {puede(permisos, 'eliminar') && (

                <button

                  type="button"

                  title="Eliminar poligonal"

                  onClick={(e) => {

                    e.stopPropagation()

                    setConfirmEliminar({ id: p.id, nombre: p.nombre })

                  }}

                  style={{

                    ...ui.btnSecondary,

                    color: '#dc2626',

                    padding: '0 8px',

                    marginLeft: -4,

                    borderRadius: '0 8px 0 0',

                    alignSelf: 'stretch',

                  }}

                >

                  ×

                </button>

              )}

            </div>

          )

        })}

      </div>



      {!lista.length && (

        <p style={{ color: ui.textMuted, fontSize: 'var(--cc-sm)', margin: '0 0 12px' }}>

          Aún no hay poligonales. Pulse «+ Nueva» para comenzar.

        </p>

      )}



      {detalle ? (

        <div>

          <div style={{ ...ui.card, marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>{detalle.poligonal?.nombre}</h3>
            {detalle.cierre && (
              <div style={{ marginBottom: 12 }}>
                <PoligonalCierrePanel cierre={detalle.cierre} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
              <button
                type="button"
                style={ui.btnSecondary}
                title="Recalcula la cartera y el cierre desde el servidor (use tras guardar en la libreta)"
                onClick={() => cargarDetalle(sel)}
                disabled={!sel || refreshingVista}
              >
                {refreshingVista ? 'Actualizando…' : 'Actualizar vista'}
              </button>
              {puede(permisos, 'editar') && (
                <button type="button" style={ui.btnPrimary} onClick={() => abrirEditar(sel)}>
                  Editar en libreta
                </button>
              )}
              {puede(permisos, 'editar') && detalle?.cierre?.cerrado && (
                <button
                  type="button"
                    style={{ ...ui.btnPrimary, background: '#047857' }}
                  onClick={ajustarPoligonal}
                  disabled={ajustando}
                  title="Distribuye error angular y aplica Bowditch; guarda coordenadas ajustadas"
                >
                  {ajustando ? 'Ajustando…' : 'Corregir y ajustar'}
                </button>
              )}
              {puede(permisos, 'validar') && (
                <button
                  type="button"
                  style={ui.btnSecondary}
                  onClick={validar}
                  title={detalle?.poligonal?.ajustada_at ? 'Usa datos ajustados' : 'Requiere ajuste previo'}
                >
                  Validar
                </button>
              )}
              {puede(permisos, 'exportar') && (
                <button type="button" style={ui.btnSecondary} onClick={descargarPdfPoligonal} disabled={pdfBusy}>
                  {pdfBusy ? 'Generando PDF…' : 'PDF'}
                </button>
              )}
            </div>
          </div>



          <PoligonalCalculoTable

            key={vistaRev || sel}

            estaciones={detalle.estaciones}

            poligonal={detalle.poligonal}

            cierre={detalle.cierre}

            modoAjuste={!!detalle.poligonal?.ajustada_at}

          />



          <div style={{ marginTop: 12 }}>

            <PoligonalGrafico

              estaciones={detalle.estaciones}

              puntoInicial={detalle.punto_inicial}

              cierre={detalle.cierre}

            />

          </div>



          <PermisoAviso permisos={permisos} accion="editar">

            <div style={{ marginTop: 12 }}>

              <FirmaPerfilTopo api={api} poligonalId={sel} token={token} />

            </div>

          </PermisoAviso>

        </div>

      ) : lista.length > 0 && !refreshingVista ? (

        <p style={{ color: ui.textMuted, fontSize: 'var(--cc-sm)' }}>Seleccione una poligonal en las pestañas superiores.</p>

      ) : null}



      <PoligonalModal

        open={modalOpen}

        onClose={() => setModalOpen(false)}

        onSaved={(id) => {

          cargarLista()

          if (id) cargarDetalle(id)

        }}

        contratoId={contratoId}

        api={api}

        permisos={permisos}

        theme={ui.t}

        poligonalId={modalPoligonalId}

        initialDetalle={modalPoligonalId && detalle?.poligonal?.id === modalPoligonalId ? detalle : null}

        puntosVerificados={puntosVerificados}

      />



      {errorModal && (

        <TopoErrorModal theme={ui.t} titulo={errorModal.titulo} onClose={() => setErrorModal(null)}>

          {errorModal.mensaje}

        </TopoErrorModal>

      )}



      {confirmEliminar && (

        <TopoConfirmModal

          theme={ui.t}

          danger

          titulo="Eliminar poligonal"

          confirmLabel="Eliminar"

          cancelLabel="Cancelar"

          busy={eliminando}

          onConfirm={confirmarEliminacion}

          onCancel={() => { if (!eliminando) setConfirmEliminar(null) }}

        >

          ¿Eliminar la poligonal <strong>«{confirmEliminar.nombre}»</strong>? Se borraran sus armadas y puntos de la libreta.

          Los puntos ya enviados a la biblioteca se conservan. Esta accion no se puede deshacer.

        </TopoConfirmModal>

      )}

    </div>

  )

}

