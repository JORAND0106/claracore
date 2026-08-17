import { useEffect, useState } from 'react'
import AlmacenFiltrosModal, { FiltroCampo, filtroInputStyle } from './AlmacenFiltrosModal'
import {
  EMPTY_SOLICITUDES_FILTROS,
  opcionesEstadoSolicitud,
} from './solicitudesFiltros'

export default function SolicitudesFiltrosModal({
  theme,
  filtros,
  onClose,
  onApply,
}) {
  const [draft, setDraft] = useState(() => ({ ...EMPTY_SOLICITUDES_FILTROS, ...filtros }))
  const inp = filtroInputStyle(theme)

  useEffect(() => {
    setDraft({ ...EMPTY_SOLICITUDES_FILTROS, ...filtros })
  }, [filtros])

  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }))

  return (
    <AlmacenFiltrosModal
      theme={theme}
      titulo="Filtros · Solicitudes"
      onClose={onClose}
      onClear={() => {
        setDraft({ ...EMPTY_SOLICITUDES_FILTROS })
        onApply({ ...EMPTY_SOLICITUDES_FILTROS })
      }}
      onApply={() => onApply({ ...draft })}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FiltroCampo label="Fecha desde">
          <input
            type="date"
            value={draft.fecha_desde}
            onChange={(e) => set('fecha_desde', e.target.value)}
            style={inp}
          />
        </FiltroCampo>
        <FiltroCampo label="Fecha hasta">
          <input
            type="date"
            value={draft.fecha_hasta}
            onChange={(e) => set('fecha_hasta', e.target.value)}
            style={inp}
          />
        </FiltroCampo>
      </div>

      <FiltroCampo label="Estado">
        <select
          value={draft.estado}
          onChange={(e) => set('estado', e.target.value)}
          style={inp}
        >
          {opcionesEstadoSolicitud().map((o) => (
            <option key={o.value || 'all'} value={o.value}>{o.label}</option>
          ))}
        </select>
      </FiltroCampo>

      <FiltroCampo label="Solicitante">
        <input
          type="text"
          value={draft.solicitante}
          onChange={(e) => set('solicitante', e.target.value)}
          placeholder="Nombre…"
          style={inp}
        />
      </FiltroCampo>

      <FiltroCampo label="Título">
        <input
          type="text"
          value={draft.titulo}
          onChange={(e) => set('titulo', e.target.value)}
          placeholder="Texto del título…"
          style={inp}
        />
      </FiltroCampo>

      <FiltroCampo label="Orden de compra">
        <select
          value={draft.con_oc}
          onChange={(e) => set('con_oc', e.target.value)}
          style={inp}
        >
          <option value="">Todas</option>
          <option value="si">Con OC</option>
          <option value="no">Sin OC</option>
        </select>
      </FiltroCampo>

      <FiltroCampo label="N.º OC">
        <input
          type="text"
          value={draft.numero_oc}
          onChange={(e) => set('numero_oc', e.target.value)}
          placeholder="Número de OC…"
          style={inp}
        />
      </FiltroCampo>
    </AlmacenFiltrosModal>
  )
}
