import { useCallback, useEffect, useState } from 'react'

import PoligonalModal from './PoligonalModal'
import PoligonalResumen from './PoligonalResumen'

import TopoErrorModal from './TopoErrorModal'

import TopoConfirmModal from './TopoConfirmModal'

import { parseApiError, PermisoAviso, puede, useTopografiaApi, useTopoTheme } from './topografiaShared'

export default function PoligonalForm({ contratoId, token, permisos, usuario }) {
  const ui = useTopoTheme()
  const { api, downloadPdf } = useTopografiaApi(contratoId, token)

  const [lista, setLista] = useState([])

  const [sel, setSel] = useState(null)

  const [detalle, setDetalle] = useState(null)

  const [resultado, setResultado] = useState(null)

  const [errorModal, setErrorModal] = useState(null)

  const [modalOpen, setModalOpen] = useState(false)

  const [modalModo, setModalModo] = useState('editar')

  const [modalPoligonalId, setModalPoligonalId] = useState(null)

  const [puntosVerificados, setPuntosVerificados] = useState([])

  const [confirmEliminar, setConfirmEliminar] = useState(null)

  const [eliminando, setEliminando] = useState(false)

  const [refreshingVista, setRefreshingVista] = useState(false)

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
    setModalModo('editar')
    setModalOpen(true)
  }

  const abrirEditar = (id) => {
    setModalPoligonalId(id || sel)
    setModalModo('editar')
    setModalOpen(true)
  }

  const abrirVer = (id) => {
    setModalPoligonalId(id || sel)
    setModalModo('ver')
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

                onDoubleClick={() => (p.estado === 'cerrado' || (p.nivel2_estado || '') === 'Aprobado' || p.biblioteca_at ? abrirVer(p.id) : abrirEditar(p.id))}

                title={`${p.nombre} (${p.estado}). Doble clic: abrir libreta`}

              >

                <span>{p.nombre}</span>

                <small style={{ color: ui.textMuted, fontWeight: 400 }}>({p.estado}{p.nivel1_estado && p.nivel1_estado !== 'No Revisado' ? ` · C:${p.nivel1_estado}` : ''}{p.nivel2_estado && p.nivel2_estado !== 'No Revisado' ? ` · I:${p.nivel2_estado}` : ''})</small>

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



      {detalle ? (() => {
        const pol = detalle.poligonal || {}
        const sellada = (pol.nivel2_estado || '') === 'Aprobado' || Boolean(pol.biblioteca_at)
        const terminada = pol.estado === 'cerrado'
        return (
        <div>
          <div style={{ ...ui.card, padding: '12px 14px', marginBottom: 12 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px 16px' }}>
            <PoligonalResumen poligonal={pol} cierre={detalle.cierre} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0, alignSelf: 'flex-start' }}>
              <button
                type="button"
                style={ui.btnSecondary}
                title="Recalcula el resumen desde el servidor"
                onClick={() => cargarDetalle(sel)}
                disabled={!sel || refreshingVista}
              >
                {refreshingVista ? 'Actualizando…' : 'Actualizar'}
              </button>
              {puede(permisos, 'editar') && !sellada && !terminada && (
                <button type="button" style={ui.btnPrimary} onClick={() => abrirEditar(sel)} title="Libreta de cálculo, armadas y terminar poligonal">
                  Editar poligonal
                </button>
              )}
              {(terminada && !sellada) && (
                <button type="button" style={ui.btnPrimary} onClick={() => abrirVer(sel)} title="Coordenadas calculadas, ajuste y validación contratista / interventoría">
                  Validar poligonal
                </button>
              )}
              {sellada && (
                <button type="button" style={ui.btnPrimary} onClick={() => abrirVer(sel)} title="Coordenadas y validación (solo lectura)">
                  Ver poligonal
                </button>
              )}
              {puede(permisos, 'exportar') && (
                <button type="button" style={ui.btnSecondary} onClick={descargarPdfPoligonal} disabled={pdfBusy}>
                  {pdfBusy ? 'Generando PDF…' : 'PDF'}
                </button>
              )}
            </div>
            </div>
          </div>
        </div>
        )
      })() : lista.length > 0 && !refreshingVista ? (

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

        usuario={usuario}

        modoInicial={modalModo}

        token={token}

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

