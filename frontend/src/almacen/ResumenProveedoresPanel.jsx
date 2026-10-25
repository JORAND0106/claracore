import { useCallback, useEffect, useMemo, useState } from 'react'
import OcGeneradaMensajeModal from './OcGeneradaMensajeModal'
import OcNotificarProveedorModal from './OcNotificarProveedorModal'
import SolicitudDetalleModal from './SolicitudDetalleModal'
import { escucharCambiosAlmacen, publicarCambioAlmacen } from './almacenContratoEvento'
import { fmtCant, fmtMoneySolicitud as fmtMoney, useAlmacenApi, useAlmacenTheme } from './almacenShared'
import { ordenesDeRespuestaAprobar } from './ocGeneradaMensaje'
import { notificarProveedoresPayload } from './ocNotificarProveedor'
import { armarTarjetas, lineasSeleccionadasPorSolicitud } from './resumenProveedores'

const COLORES = {
  aprobado: { bg: '#dcfce7', fg: '#166534', label: 'Aprobados' },
  enviado: { bg: '#fef3c7', fg: '#92400e', label: 'Enviados' },
  rechazado: { bg: '#fee2e2', fg: '#991b1b', label: 'Rechazados' },
}

function dinero(verEconomicos, valor, lineas) {
  if (!verEconomicos || valor == null || !lineas) return ''
  return ` · ${fmtMoney(valor)}`
}

function Contador({ tipo, datos, verEconomicos }) {
  const color = COLORES[tipo]
  return (
    <span
      data-testid={`resumen-contador-${tipo}`}
      style={{
        background: color.bg,
        color: color.fg,
        borderRadius: 8,
        padding: '4px 8px',
        fontSize: 'var(--cc-xs)',
        fontWeight: 700,
      }}
    >
      {color.label}: {datos?.lineas || 0}
      {dinero(verEconomicos, datos?.valor, datos?.lineas)}
    </span>
  )
}

function LineaResumen({
  linea,
  verEconomicos,
  seleccionable,
  marcada,
  onToggle,
  onAbrirSolicitud,
  onAjustar,
}) {
  const ui = useAlmacenTheme()
  const quien = linea.solicitado_por_nombre || 'Sin registro'
  return (
    <div
      data-testid="resumen-linea"
      style={{
        display: 'grid',
        gridTemplateColumns: `${seleccionable ? '28px ' : ''}1fr${onAjustar ? ' auto' : ''}`,
        gap: 8,
        padding: '8px 0',
        borderTop: '1px solid #e2e8f0',
        fontSize: 'var(--cc-xs)',
      }}
    >
      {seleccionable && (
        <input
          type="checkbox"
          checked={marcada}
          aria-label={`Seleccionar línea ${linea.numero_linea || linea.id}`}
          onChange={(e) => onToggle(linea.id, e.target.checked)}
        />
      )}
      <div>
        <button
          type="button"
          data-testid="resumen-abrir-solicitud"
          onClick={() => onAbrirSolicitud(linea.solicitud_id)}
          style={{ ...ui.btnSecondary, padding: '2px 8px', minHeight: 0, height: 24, marginRight: 6 }}
        >
          Solicitud #{linea.consecutivo}
        </button>
        <span>{quien}</span>
        <div style={{ marginTop: 4 }}>
          {[linea.capitulo, linea.item].filter(Boolean).join(' · ') || 'Sin capítulo'}
          {' · '}
          {linea.insumo_codigo ? `${linea.insumo_codigo} — ` : ''}
          {linea.material_descripcion || 'Sin descripción'}
        </div>
        <div>
          {fmtCant(linea.cantidad)}{linea.unidad ? ` ${linea.unidad}` : ''}
          {verEconomicos && linea.valor != null ? ` · ${fmtMoney(linea.valor)}` : ''}
        </div>
        <div style={{ color: ui.textMuted }}>
          {linea.observacion ? `Observación: ${linea.observacion}` : 'Sin observación'}
          {' · '}
          {linea.justificacion ? `Justificación: ${linea.justificacion}` : 'Sin justificación'}
        </div>
        {linea.motivo_rechazo && (
          <div style={{ color: COLORES.rechazado.fg }}>Motivo: {linea.motivo_rechazo}</div>
        )}
      </div>
      {onAjustar && (
        <button type="button" style={{ ...ui.btnSecondary, height: 28 }} onClick={() => onAjustar(linea)}>
          Ajustar
        </button>
      )}
    </div>
  )
}

export default function ResumenProveedoresPanel({
  permisos,
  contratoId,
  refreshSignal = 0,
  onDataLoaded,
  onVerSolicitudes,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const verEconomicos = permisos?.verEconomicos === true
  const puedeAjustar = Boolean(
    permisos?.editar
    || permisos?.esDesarrollador
    || permisos?.esCargoAdministrador
    || permisos?.esContratistaGerencial
  )
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [misPedidos, setMisPedidos] = useState(false)
  const [abierta, setAbierta] = useState(null)
  const [sel, setSel] = useState(() => new Set())
  const [motivo, setMotivo] = useState('')
  const [busy, setBusy] = useState(false)
  const [notificar, setNotificar] = useState(null)
  const [avisoOc, setAvisoOc] = useState(null)
  const [detalleId, setDetalleId] = useState(null)
  const [ajuste, setAjuste] = useState(null)
  const [ofertas, setOfertas] = useState([])
  const [insumos, setInsumos] = useState([])

  const cargar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const r = await api.resumenProveedores()
      setData(r)
    } catch (e) {
      setError(e.message || 'No se pudo cargar el resumen.')
    } finally {
      setLoading(false)
      onDataLoaded?.()
    }
  }, [api, onDataLoaded])

  useEffect(() => { void cargar() }, [cargar, refreshSignal])

  useEffect(() => escucharCambiosAlmacen(contratoId, () => { void cargar() }), [contratoId, cargar])

  const tarjetas = useMemo(
    () => armarTarjetas(data?.lineas || [], data?.directorio || [], {
      q,
      misPedidos,
      userId: permisos?.userId,
      verEconomicos,
    }),
    [data, q, misPedidos, permisos?.userId, verEconomicos],
  )
  const tarjeta = tarjetas.find((t) => t.key === abierta) || null

  const avisar = () => publicarCambioAlmacen(contratoId, { origen: 'resumen' })

  const despues = async () => {
    avisar()
    await cargar()
  }

  const toggle = (id, checked) => {
    setSel((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const seleccion = (tarjeta?.enviados || []).filter((l) => sel.has(l.id))

  const generarOc = async (respuestas) => {
    if (!tarjeta || !seleccion.length) return
    const payload = notificarProveedoresPayload(notificar?.proveedores || [], respuestas)
    setBusy(true)
    setError('')
    try {
      const grupos = lineasSeleccionadasPorSolicitud(seleccion, seleccion.map((l) => l.id))
      const avisos = []
      let solAviso = null
      for (const grupo of grupos) {
        const r = await api.aprobarSolicitud(grupo.solicitudId, {
          aprobar_todos_pendientes: true,
          item_ids: grupo.itemIds,
          notificar_proveedores: payload,
        })
        const ocs = ordenesDeRespuestaAprobar(r)
        if (ocs.length) {
          solAviso = r
          avisos.push(...ocs)
        }
      }
      setNotificar(null)
      setSel(new Set())
      if (avisos.length && solAviso) {
        setAvisoOc({
          solicitudId: solAviso.id,
          sol: solAviso,
          ocs: avisos,
          envios: Array.isArray(solAviso.envios_oc) ? solAviso.envios_oc : [],
        })
      }
      await despues()
    } catch (e) {
      setError(e.message || 'No se pudo generar la OC.')
    } finally {
      setBusy(false)
    }
  }

  const aprobarSeleccion = async () => {
    if (!seleccion.length) return
    setBusy(true)
    setError('')
    try {
      for (const grupo of lineasSeleccionadasPorSolicitud(seleccion, seleccion.map((l) => l.id))) {
        await api.aprobarItemsBloque(grupo.solicitudId, grupo.itemIds)
      }
      setSel(new Set())
      await despues()
    } catch (e) {
      setError(e.message || 'No se pudo aprobar.')
    } finally {
      setBusy(false)
    }
  }

  const rechazarSeleccion = async () => {
    if (!seleccion.length) return
    if (motivo.trim().length < 3) {
      setError('Indique el motivo del rechazo.')
      return
    }
    setBusy(true)
    setError('')
    try {
      for (const grupo of lineasSeleccionadasPorSolicitud(seleccion, seleccion.map((l) => l.id))) {
        await api.rechazarLineasSolicitud(grupo.solicitudId, grupo.itemIds, motivo.trim())
      }
      setMotivo('')
      setSel(new Set())
      await despues()
    } catch (e) {
      setError(e.message || 'No se pudo rechazar.')
    } finally {
      setBusy(false)
    }
  }

  const abrirAjuste = async (linea) => {
    setAjuste({
      ...linea,
      cantidadDraft: String(linea.cantidad ?? ''),
      insumoId: linea.insumo_id,
      insumoTexto: linea.material_descripcion || '',
      proveedorId: linea.proveedor_id,
      proveedorNombre: linea.proveedor_nombre,
      numero: '',
    })
    setOfertas([])
    setInsumos([])
    if (linea.insumo_id) {
      try {
        const r = await api.listOfertasProveedorInsumo(linea.insumo_id)
        setOfertas(Array.isArray(r?.ofertas) ? r.ofertas : (Array.isArray(r) ? r : []))
      } catch {
        setOfertas([])
      }
    }
  }

  const buscarInsumo = async () => {
    const texto = String(ajuste?.insumoTexto || '').trim()
    if (texto.length < 2) return
    try {
      const rows = await api.searchInsumos(texto)
      setInsumos(Array.isArray(rows) ? rows.slice(0, 8) : [])
    } catch (e) {
      setError(e.message || 'No se pudo buscar el insumo.')
    }
  }

  const guardarAjuste = async () => {
    if (!ajuste) return
    const cant = Number(ajuste.cantidadDraft)
    if (!(cant > 0)) {
      setError('La cantidad debe ser mayor a cero.')
      return
    }
    const insumoCambio = String(ajuste.insumoId || '') !== String(ajuste.insumo_id || '')
    const cantCambio = Number(ajuste.cantidad) !== cant
    const provCambio = String(ajuste.proveedorId || '') !== String(ajuste.proveedor_id || '')
      || String(ajuste.proveedorNombre || '') !== String(ajuste.proveedor_nombre || '')
    if (ajuste.en_oc && provCambio) {
      setError('Esta línea ya hace parte de una orden de compra generada. El proveedor no se puede cambiar.')
      return
    }
    setBusy(true)
    setError('')
    try {
      if ((insumoCambio || cantCambio) && ajuste.insumoId) {
        const body = { insumo_id: Number(ajuste.insumoId), cantidad: cant }
        if (ajuste.proveedorId) body.proveedor_seleccionado_id = Number(ajuste.proveedorId)
        if (ajuste.proveedorNombre) body.proveedor_seleccionado_nombre = ajuste.proveedorNombre
        if (ajuste.numero) body.cotizacion_numero_seleccionada = ajuste.numero
        await api.mapearItemSolicitud(ajuste.solicitud_id, ajuste.id, body)
      }
      if (provCambio && !ajuste.en_oc) {
        await api.cambiarProveedorResumen(ajuste.solicitud_id, ajuste.id, {
          proveedor_seleccionado_id: ajuste.proveedorId || null,
          proveedor_seleccionado_nombre: ajuste.proveedorNombre || null,
          cotizacion_numero_seleccionada: ajuste.numero || null,
        })
      }
      setAjuste(null)
      await despues()
    } catch (e) {
      setError(e.message || 'No se pudo guardar el ajuste.')
    } finally {
      setBusy(false)
    }
  }

  const movidas = data?.movidas_por_agrupar

  return (
    <div data-testid="resumen-proveedores">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 'var(--cc-title)', fontWeight: 700 }}>Resumen por proveedor</div>
          <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
            Las líneas siguen en su solicitud. Aquí solo se ven por el proveedor guardado.
          </div>
        </div>
        <button
          type="button"
          data-testid="resumen-sin-insumo"
          style={ui.btnSecondary}
          onClick={() => onVerSolicitudes?.()}
          title="Esas líneas siguen en la grilla de Solicitudes, con el indicador Sin insumo."
        >
          Sin insumo por asignar: {data?.sin_insumo ?? '—'}
        </button>
      </div>

      {movidas?.disponible && movidas.solicitudes > 0 && (
        <p data-testid="resumen-movidas" style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
          {movidas.solicitudes} solicitud{movidas.solicitudes === 1 ? '' : 'es'} tienen líneas movidas por Agrupar
          {' '}({movidas.lineas} líneas). No se corrigen. El resumen las muestra por su proveedor guardado.
        </p>
      )}
      {movidas && movidas.disponible === false && (
        <p style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
          No se pudo contar las solicitudes con líneas movidas por Agrupar.
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input
          data-testid="resumen-buscar"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar proveedor, insumo, solicitud, capítulo…"
          style={{ ...ui.input, minWidth: 240, flex: 1 }}
        />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--cc-sm)' }}>
          <input
            data-testid="resumen-mis-pedidos"
            type="checkbox"
            checked={misPedidos}
            onChange={(e) => setMisPedidos(e.target.checked)}
          />
          Mis pedidos
        </label>
      </div>

      {error && <div style={{ color: '#991b1b', marginBottom: 8 }}>{error}</div>}
      {loading && <div style={{ color: ui.textMuted }}>Cargando resumen…</div>}

      {!loading && !tarjeta && (
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {tarjetas.length === 0 && (
            <div style={{ color: ui.textMuted }}>No hay líneas con insumo para este filtro.</div>
          )}
          {tarjetas.map((card) => (
            <button
              key={card.key}
              type="button"
              data-testid="resumen-proveedor"
              onClick={() => { setAbierta(card.key); setSel(new Set()) }}
              style={{ ...ui.card, textAlign: 'left', cursor: 'pointer', padding: 12 }}
            >
              <div style={{ fontWeight: 800 }}>{card.nombre}</div>
              <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, margin: '4px 0 8px' }}>
                {[card.contacto_nombre, card.contacto_email, card.contacto_telefono].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Contador tipo="aprobado" datos={card.contadores.aprobado} verEconomicos={verEconomicos} />
                <Contador tipo="enviado" datos={card.contadores.enviado} verEconomicos={verEconomicos} />
                <Contador tipo="rechazado" datos={card.contadores.rechazado} verEconomicos={verEconomicos} />
              </div>
            </button>
          ))}
        </div>
      )}

      {tarjeta && (
        <div>
          <button type="button" style={{ ...ui.btnSecondary, marginBottom: 10 }} onClick={() => setAbierta(null)}>
            ← Proveedores
          </button>
          <div style={{ fontWeight: 800, fontSize: 'var(--cc-title)' }}>{tarjeta.nombre}</div>
          <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginBottom: 10 }}>
            {[tarjeta.contacto_nombre, tarjeta.contacto_email, tarjeta.contacto_telefono].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
          </div>

          <section data-testid="resumen-enviados" style={{ ...ui.card, padding: 12, marginBottom: 10 }}>
            <div style={{ fontWeight: 800, color: COLORES.enviado.fg }}>
              Enviados (por revisar) · {tarjeta.enviados.length}
              {dinero(verEconomicos, tarjeta.contadores.enviado.valor, tarjeta.enviados.length)}
            </div>
            {(permisos?.validar || permisos?.puedeGenerarOc) && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {permisos?.puedeGenerarOc && permisos?.validar && (
                  <button
                    type="button"
                    data-testid="resumen-generar-oc"
                    style={ui.btnPrimary}
                    disabled={busy || seleccion.length === 0}
                    onClick={() => setNotificar({
                      proveedores: [{
                        key: tarjeta.proveedorId != null ? `id:${tarjeta.proveedorId}` : `nom:${tarjeta.nombre}`,
                        nombre: tarjeta.nombre,
                      }],
                    })}
                  >
                    Generar OC de la selección
                  </button>
                )}
                {permisos?.validar && (
                  <>
                    <button type="button" style={ui.btnSecondary} disabled={busy || seleccion.length === 0} onClick={aprobarSeleccion}>
                      Aprobar
                    </button>
                    <input
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Motivo del rechazo"
                      style={{ ...ui.input, minWidth: 180 }}
                    />
                    <button type="button" style={ui.btnSecondary} disabled={busy || seleccion.length === 0} onClick={rechazarSeleccion}>
                      Rechazar
                    </button>
                  </>
                )}
              </div>
            )}
            {tarjeta.enviados.map((linea) => (
              <LineaResumen
                key={linea.id}
                linea={linea}
                verEconomicos={verEconomicos}
                seleccionable={Boolean(permisos?.validar || permisos?.puedeGenerarOc)}
                marcada={sel.has(linea.id)}
                onToggle={toggle}
                onAbrirSolicitud={setDetalleId}
                onAjustar={puedeAjustar ? abrirAjuste : null}
              />
            ))}
          </section>

          <section data-testid="resumen-aprobados" style={{ ...ui.card, padding: 12, marginBottom: 10 }}>
            <div style={{ fontWeight: 800, color: COLORES.aprobado.fg }}>
              Aprobados · {tarjeta.contadores.aprobado.lineas}
              {dinero(verEconomicos, tarjeta.contadores.aprobado.valor, tarjeta.contadores.aprobado.lineas)}
            </div>
            {tarjeta.aprobados.map((grupo) => (
              <div key={grupo.key} data-testid="resumen-grupo-oc" style={{ marginTop: 8 }}>
                <div style={{ fontWeight: 700 }}>{grupo.titulo}</div>
                {grupo.lineas.map((linea) => (
                  <LineaResumen
                    key={linea.id}
                    linea={linea}
                    verEconomicos={verEconomicos}
                    onAbrirSolicitud={setDetalleId}
                    onAjustar={puedeAjustar ? abrirAjuste : null}
                  />
                ))}
              </div>
            ))}
          </section>

          <section data-testid="resumen-rechazados" style={{ ...ui.card, padding: 12 }}>
            <div style={{ fontWeight: 800, color: COLORES.rechazado.fg }}>
              Rechazados · {tarjeta.rechazados.length}
              {dinero(verEconomicos, tarjeta.contadores.rechazado.valor, tarjeta.rechazados.length)}
            </div>
            {tarjeta.rechazados.map((linea) => (
              <LineaResumen
                key={linea.id}
                linea={linea}
                verEconomicos={verEconomicos}
                onAbrirSolicitud={setDetalleId}
                onAjustar={puedeAjustar ? abrirAjuste : null}
              />
            ))}
          </section>
        </div>
      )}

      {notificar && (
        <OcNotificarProveedorModal
          proveedores={notificar.proveedores}
          busy={busy}
          error={error}
          onCancel={() => setNotificar(null)}
          onConfirm={generarOc}
        />
      )}
      {avisoOc && (
        <OcGeneradaMensajeModal
          solicitudId={avisoOc.solicitudId}
          sol={avisoOc.sol}
          ocs={avisoOc.ocs}
          envios={avisoOc.envios}
          onClose={() => setAvisoOc(null)}
        />
      )}
      {detalleId && (
        <SolicitudDetalleModal
          solicitudId={detalleId}
          permisos={permisos}
          onClose={() => setDetalleId(null)}
          onOcGenerada={() => { void despues() }}
          onUpdated={() => { void despues() }}
        />
      )}
      {ajuste && (
        <div
          role="dialog"
          aria-label="Ajustar línea"
          data-testid="resumen-ajustar"
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100050, padding: 16 }}
          onClick={() => !busy && setAjuste(null)}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ ...ui.card, width: 'min(520px, 100%)', padding: 16 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Ajustar línea de la solicitud #{ajuste.consecutivo}</div>
            <p style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
              La línea permanece en su solicitud y conserva a quien la pidió.
              {ajuste.en_oc ? ' Esta línea ya está en una OC: el proveedor de la orden no se modifica.' : ''}
            </p>
            <label style={{ display: 'block', fontSize: 'var(--cc-xs)', marginTop: 8 }}>
              Cantidad
              <input
                value={ajuste.cantidadDraft}
                onChange={(e) => setAjuste({ ...ajuste, cantidadDraft: e.target.value })}
                style={{ ...ui.input, width: '100%' }}
              />
            </label>
            <label style={{ display: 'block', fontSize: 'var(--cc-xs)', marginTop: 8 }}>
              Insumo
              <input
                value={ajuste.insumoTexto}
                onChange={(e) => setAjuste({ ...ajuste, insumoTexto: e.target.value })}
                style={{ ...ui.input, width: '100%' }}
              />
            </label>
            <button type="button" style={{ ...ui.btnSecondary, marginTop: 6 }} onClick={buscarInsumo}>Buscar insumo</button>
            {insumos.map((ins) => (
              <button
                key={ins.id || ins.insumo_id}
                type="button"
                style={{ ...ui.btnSecondary, display: 'block', marginTop: 4, width: '100%', textAlign: 'left' }}
                onClick={async () => {
                  const id = ins.insumo_id || ins.id
                  setAjuste({ ...ajuste, insumoId: id, insumoTexto: ins.descripcion || ins.codigo || ajuste.insumoTexto })
                  try {
                    const r = await api.listOfertasProveedorInsumo(id)
                    setOfertas(Array.isArray(r?.ofertas) ? r.ofertas : (Array.isArray(r) ? r : []))
                  } catch { setOfertas([]) }
                }}
              >
                {ins.codigo || ins.insumo_codigo || ''} {ins.descripcion || ins.material_descripcion || ''}
              </button>
            ))}
            <div style={{ marginTop: 8, fontSize: 'var(--cc-xs)' }}>Proveedor de este insumo</div>
            {ofertas.map((oferta) => (
              <label key={`${oferta.proveedor_id}-${oferta.numero}`} style={{ display: 'block', fontSize: 'var(--cc-xs)' }}>
                <input
                  type="radio"
                  name="proveedor-resumen"
                  checked={String(ajuste.proveedorId || '') === String(oferta.proveedor_id || '')}
                  onChange={() => setAjuste({
                    ...ajuste,
                    proveedorId: oferta.proveedor_id,
                    proveedorNombre: oferta.proveedor_nombre || oferta.proveedor,
                    numero: oferta.numero || '',
                  })}
                />
                {' '}{oferta.proveedor_nombre || oferta.proveedor}
                {verEconomicos && oferta.valor != null ? ` · ${fmtMoney(oferta.valor)}` : ''}
              </label>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" style={ui.btnPrimary} disabled={busy || !puedeAjustar} onClick={guardarAjuste}>
                Guardar
              </button>
              <button type="button" style={ui.btnSecondary} disabled={busy} onClick={() => setAjuste(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
