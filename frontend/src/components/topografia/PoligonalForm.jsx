import { useCallback, useEffect, useState } from 'react'
import PoligonalModal from './PoligonalModal'
import PoligonalGrafico from './PoligonalGrafico'
import PoligonalCalculoTable from './PoligonalCalculoTable'
import FirmaDigital from './FirmaDigital'
import TopoErrorModal from './TopoErrorModal'
import { btnPrimary, btnSecondary, card, parseApiError, PermisoAviso, puede, Semaforo, useTopografiaApi } from './topografiaShared'

export default function PoligonalForm({ contratoId, token, permisos, t: theme }) {
  const { api, downloadPdf } = useTopografiaApi(contratoId, token)
  const [lista, setLista] = useState([])
  const [sel, setSel] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [errorModal, setErrorModal] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalPoligonalId, setModalPoligonalId] = useState(null)
  const [puntosVerificados, setPuntosVerificados] = useState([])

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
    try {
      const data = await api(`/poligonales/${id}`)
      setDetalle(data)
      setSel(id)
      setResultado(null)
    } catch (e) {
      showError(e)
    }
  }, [api, showError])

  useEffect(() => {
    cargarLista()
    api('/puntos/verificados').then(setPuntosVerificados).catch(() => {})
  }, [api, cargarLista])

  const abrirNueva = () => {
    setModalPoligonalId(null)
    setModalOpen(true)
  }

  const abrirEditar = (id) => {
    setModalPoligonalId(id)
    setModalOpen(true)
  }

  const calcular = async () => {
    if (!sel) return
    try {
      const res = await api(`/poligonales/${sel}/calcular`, { method: 'POST' })
      setResultado(res)
      cargarDetalle(sel)
    } catch (e) {
      showError(e)
    }
  }

  const validar = async () => {
    if (!sel) return
    try {
      await api(`/poligonales/${sel}/validar`, { method: 'POST' })
      cargarDetalle(sel)
    } catch (e) {
      showError(e)
    }
  }

  const guardarFirma = async (firma) => {
    if (!sel) return
    try {
      await api(`/poligonales/${sel}/firma`, {
        method: 'POST',
        body: JSON.stringify({
          nombre_firmante: 'Topografo',
          cargo_firmante: 'Topografo',
          firma_base64: firma,
        }),
      })
    } catch (e) {
      showError(e)
    }
  }

  return (
    <div>
      <PermisoAviso permisos={permisos} accion="crear">
        <div style={{ marginBottom: 16 }}>
          <button type="button" style={btnPrimary} onClick={abrirNueva}>
            Nueva poligonal
          </button>
          <p style={{ margin: '8px 0 0', fontSize: 'var(--cc-sm)', color: '#64748b' }}>
            Cree el circuito en la libreta de calculo: agregue puntos secuencialmente hasta completar la poligonal.
          </p>
        </div>
      </PermisoAviso>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
        <div style={card}>
          <h4 style={{ marginTop: 0 }}>Circuitos</h4>
          {!lista.length && (
            <p style={{ color: '#64748b', fontSize: 'var(--cc-sm)' }}>Aun no hay poligonales. Pulse «Nueva poligonal» para comenzar.</p>
          )}
          {lista.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => cargarDetalle(p.id)}
              onDoubleClick={() => abrirEditar(p.id)}
              style={{
                ...btnSecondary,
                display: 'block',
                width: '100%',
                marginBottom: 6,
                textAlign: 'left',
                background: sel === p.id ? '#eff6ff' : '#fff',
              }}
            >
              {p.nombre} <small>({p.estado})</small>
            </button>
          ))}
          {sel && puede(permisos, 'editar') && (
            <button type="button" style={{ ...btnSecondary, width: '100%', marginTop: 8 }} onClick={() => abrirEditar(sel)}>
              Abrir libreta
            </button>
          )}
        </div>

        {detalle && (
          <div>
            <div style={{ ...card, marginBottom: 16 }}>
              <h3 style={{ marginTop: 0 }}>{detalle.poligonal?.nombre}</h3>
              <p>
                Precision: 1:{Math.round(detalle.poligonal?.precision_relativa || 0)} | Error: {detalle.poligonal?.error_lineal ?? '—'} m
              </p>
              {resultado && <Semaforo ok={resultado.admisible} labelOk="Cierre admisible" labelBad="Cierre inadmisible" />}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                {puede(permisos, 'editar') && <button type="button" style={btnPrimary} onClick={calcular}>Calcular</button>}
                {puede(permisos, 'editar') && (
                  <button type="button" style={btnSecondary} onClick={() => abrirEditar(sel)}>Editar en libreta</button>
                )}
                {puede(permisos, 'validar') && <button type="button" style={btnSecondary} onClick={validar}>Validar</button>}
                {puede(permisos, 'exportar') && (
                  <button type="button" style={btnSecondary} onClick={() => downloadPdf(`/poligonales/${sel}/pdf`, 'poligonal.pdf')}>PDF</button>
                )}
              </div>
            </div>

            <PoligonalCalculoTable
              estaciones={detalle.estaciones}
              poligonal={detalle.poligonal}
              resultado={resultado}
            />

            <div style={{ marginTop: 16 }}>
              <PoligonalGrafico estaciones={detalle.estaciones} />
            </div>

            <PermisoAviso permisos={permisos} accion="editar">
              <div style={{ marginTop: 16 }}>
                <FirmaDigital onConfirm={guardarFirma} />
              </div>
            </PermisoAviso>
          </div>
        )}
      </div>

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
        theme={theme}
        poligonalId={modalPoligonalId}
        puntosVerificados={puntosVerificados}
      />

      {errorModal && (
        <TopoErrorModal theme={theme} titulo={errorModal.titulo} onClose={() => setErrorModal(null)}>
          {errorModal.mensaje}
        </TopoErrorModal>
      )}
    </div>
  )
}
