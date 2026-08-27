import { useCallback, useEffect, useMemo, useState } from 'react'
import ActaCompromisosAbiertosTable from './ActaCompromisosAbiertosTable'
import ItemDetalleModal from './ItemDetalleModal'
import TareaFormModal from './TareaFormModal'
import BandejaResumenLinea from './BandejaResumenLinea'
import { ESTADOS } from './seguimientoTheme'
import {
  resumenVencimientoBandeja,
  sortByProximidadVencimiento,
} from './vencimientoLevels'

/**
 * Bandeja: misma tabla sheet que compromisos (inline), sin abrir detalle al clic de fila.
 * El detalle completo (checklist, multi-asignación) queda en el icono ojo.
 */
export default function BandejaPanel({ t, api, usuario, usuarios = [], permisos, compact = false, viewportCompact = false }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filtros, setFiltros] = useState({
    estado: '',
    origen: '',
    fecha_desde: '',
    fecha_hasta: '',
    responsable_id: '',
    incluir_cerrados: false,
    solo_mias: false,
    q: '',
  })
  const [detalleId, setDetalleId] = useState(null)
  const [showTarea, setShowTarea] = useState(false)
  const [abierto, setAbierto] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      Object.entries(filtros).forEach(([k, v]) => {
        if (v === true || v === false) {
          if (v) params[k] = 'true'
          return
        }
        if (v) params[k] = v
      })
      const data = await api.listBandeja(params)
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e.message || 'Error al cargar bandeja')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [api, filtros])

  useEffect(() => { load() }, [load])

  const sorted = useMemo(() => sortByProximidadVencimiento(rows), [rows])
  const resumen = useMemo(() => resumenVencimientoBandeja(sorted), [sorted])

  return (
    <div className={viewportCompact ? 'cc-seguim-bandeja cc-seguim-bandeja--compact' : 'cc-seguim-bandeja'}>
      {!compact && (
        <div className="cc-seguim-filters" style={{
          display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'flex-end',
        }}
        >
          <Filter t={t} label="Palabras clave" className="cc-seguim-filter cc-seguim-filter--wide">
            <input
              value={filtros.q}
              onChange={(e) => setFiltros((f) => ({ ...f, q: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') load() }}
              placeholder="Título, descripción, notas…"
              style={{ ...inp(t), minWidth: viewportCompact ? 0 : 200, width: '100%' }}
            />
          </Filter>
          <Filter t={t} label="Estado" className="cc-seguim-filter">
            <select value={filtros.estado} onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value }))} style={{ ...inp(t), width: '100%' }}>
              {ESTADOS.map((x) => <option key={x.value || 'all'} value={x.value}>{x.label}</option>)}
            </select>
          </Filter>
          <Filter t={t} label="Origen" className="cc-seguim-filter">
            <select value={filtros.origen} onChange={(e) => setFiltros((f) => ({ ...f, origen: e.target.value }))} style={{ ...inp(t), width: '100%' }}>
              <option value="">Todos</option>
              <option value="compromiso">Compromisos</option>
              <option value="tarea">Tareas</option>
            </select>
          </Filter>
          <Filter t={t} label="Desde" className="cc-seguim-filter">
            <input
              type="date"
              className="cc-seguim-date"
              value={filtros.fecha_desde}
              onChange={(e) => setFiltros((f) => ({ ...f, fecha_desde: e.target.value }))}
              style={{ ...inp(t), width: '100%' }}
            />
          </Filter>
          <Filter t={t} label="Hasta" className="cc-seguim-filter">
            <input
              type="date"
              className="cc-seguim-date"
              value={filtros.fecha_hasta}
              onChange={(e) => setFiltros((f) => ({ ...f, fecha_hasta: e.target.value }))}
              style={{ ...inp(t), width: '100%' }}
            />
          </Filter>
          <label className="cc-seguim-filter cc-seguim-filter--check" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--cc-sm)', color: t.text, marginBottom: 4 }}>
            <input
              type="checkbox"
              checked={!!filtros.incluir_cerrados}
              onChange={(e) => setFiltros((f) => ({ ...f, incluir_cerrados: e.target.checked }))}
            />
            Incluir cumplidos / cancelados
          </label>
          <label
            className="cc-seguim-filter cc-seguim-filter--check"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--cc-sm)', color: t.text, marginBottom: 4 }}
            title="Solo tareas y compromisos que creó, tiene asignados o solicitó"
          >
            <input
              type="checkbox"
              checked={!!filtros.solo_mias}
              onChange={(e) => setFiltros((f) => ({ ...f, solo_mias: e.target.checked }))}
            />
            Solo mis actividades
          </label>
          <div className="cc-seguim-filter-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" onClick={load} style={ghost(t)}>Buscar</button>
            {permisos?.crear && (
              <button type="button" onClick={() => setShowTarea(true)} style={primary(t)}>+ Nueva tarea</button>
            )}
          </div>
        </div>
      )}

      {permisos?.esDesarrollador && !compact && (
        <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginBottom: 8 }}>
          Vista Desarrollador: acceso completo a compromisos, tareas, justificaciones y aprobaciones.
        </div>
      )}
      {permisos?.esGerencial && !permisos?.esDesarrollador && !compact && (
        <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginBottom: 8 }}>
          Vista gerencial: incluye compromisos y tareas de usuarios bajo su gestión.
        </div>
      )}

      {error && <div style={{ color: 'var(--cc-color-danger,#b91c1c)', fontSize: 'var(--cc-sm)' }}>{error}</div>}

      <div style={{
        background: t.bgCard,
        border: `1px solid ${t.border}`,
        borderRadius: 10,
        overflow: 'hidden',
      }}
      >
        <BandejaResumenLinea
          t={t}
          resumen={resumen}
          abierto={abierto}
          onToggle={() => setAbierto((v) => !v)}
          titulo="Bandeja"
          loading={loading}
          emptyLabel="No hay ítems en la bandeja"
        />
        {abierto && (
          <div style={{ padding: '0 10px 10px' }}>
            {loading ? (
              <div style={{ color: t.textMuted, fontSize: 'var(--cc-body)' }}>Cargando bandeja…</div>
            ) : (
              <ActaCompromisosAbiertosTable
                t={t}
                api={api}
                items={sorted}
                emptyMessage="No hay ítems en la bandeja."
                showActaOrigen
                showOrigenBadge
                textoColumnaLabel="Tema"
                permitirArchivar={false}
                filtrarArchivados={false}
                usuario={usuario}
                usuarios={usuarios}
                permisos={permisos}
                viewportCompact={viewportCompact}
                onOpenDetalle={(item) => setDetalleId(item.id)}
                onChanged={load}
              />
            )}
          </div>
        )}
      </div>

      {detalleId != null && (
        <ItemDetalleModal
          t={t}
          api={api}
          itemId={detalleId}
          usuario={usuario}
          usuarios={usuarios}
          permisos={permisos}
          viewportCompact={viewportCompact}
          onClose={() => setDetalleId(null)}
          onChanged={load}
        />
      )}
      {showTarea && (
        <TareaFormModal
          t={t}
          api={api}
          usuario={usuario}
          usuarios={usuarios}
          viewportCompact={viewportCompact}
          onClose={() => setShowTarea(false)}
          onCreated={() => { setShowTarea(false); load() }}
        />
      )}
    </div>
  )
}

function Filter({ t, label, children, className = '' }) {
  return (
    <div className={className}>
      <div style={{ fontSize: 'var(--cc-label)', color: t.textMuted, fontWeight: 600, marginBottom: 2 }}>{label}</div>
      {children}
    </div>
  )
}
function inp(t) {
  return {
    fontSize: 'var(--cc-input)', padding: '6px 8px', borderRadius: 8,
    border: `1px solid ${t.border}`, background: t.bgCard, color: t.text,
    boxSizing: 'border-box',
  }
}
function primary(t) {
  return { border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', background: t.primary, color: '#fff', fontWeight: 700, fontSize: 'var(--cc-sm)' }
}
function ghost(t) {
  return { border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 12px', cursor: 'pointer', background: 'transparent', color: t.text, fontSize: 'var(--cc-sm)' }
}
