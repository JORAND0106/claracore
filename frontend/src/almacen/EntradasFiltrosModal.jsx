import { useEffect, useState } from 'react'
import AlmacenFiltrosModal, { FiltroCampo, filtroInputStyle } from './AlmacenFiltrosModal'
import { EMPTY_ENTRADAS_FILTROS } from './entradasFiltros'

export default function EntradasFiltrosModal({
  theme,
  filtros,
  onClose,
  onApply,
}) {
  const [draft, setDraft] = useState(() => ({ ...EMPTY_ENTRADAS_FILTROS, ...filtros }))
  const inp = filtroInputStyle(theme)

  useEffect(() => {
    setDraft({ ...EMPTY_ENTRADAS_FILTROS, ...filtros })
  }, [filtros])

  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }))

  return (
    <AlmacenFiltrosModal
      theme={theme}
      titulo="Filtros · Entradas"
      onClose={onClose}
      onClear={() => {
        setDraft({ ...EMPTY_ENTRADAS_FILTROS })
        onApply({ ...EMPTY_ENTRADAS_FILTROS })
      }}
      onApply={() => onApply({ ...draft })}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FiltroCampo label="Fecha desde">
          <input type="date" value={draft.fecha_desde} onChange={(e) => set('fecha_desde', e.target.value)} style={inp} />
        </FiltroCampo>
        <FiltroCampo label="Fecha hasta">
          <input type="date" value={draft.fecha_hasta} onChange={(e) => set('fecha_hasta', e.target.value)} style={inp} />
        </FiltroCampo>
      </div>

      <FiltroCampo label="Tipo">
        <select value={draft.tipo} onChange={(e) => set('tipo', e.target.value)} style={inp}>
          <option value="">Todos</option>
          <option value="recibo">Recibo</option>
          <option value="disposicion">Disposición</option>
        </select>
      </FiltroCampo>

      <FiltroCampo label="Remisión / documento">
        <input type="text" value={draft.remision} onChange={(e) => set('remision', e.target.value)} placeholder="N.º remisión…" style={inp} />
      </FiltroCampo>

      <FiltroCampo label="N.º OC">
        <input type="text" value={draft.numero_oc} onChange={(e) => set('numero_oc', e.target.value)} placeholder="Orden de compra…" style={inp} />
      </FiltroCampo>

      <FiltroCampo label="Insumo">
        <input type="text" value={draft.insumo} onChange={(e) => set('insumo', e.target.value)} placeholder="Material / descripción…" style={inp} />
      </FiltroCampo>

      <FiltroCampo label="Proveedor">
        <input type="text" value={draft.proveedor} onChange={(e) => set('proveedor', e.target.value)} placeholder="Proveedor…" style={inp} />
      </FiltroCampo>

      <FiltroCampo label="Usuario que registró">
        <input type="text" value={draft.usuario} onChange={(e) => set('usuario', e.target.value)} placeholder="Nombre…" style={inp} />
      </FiltroCampo>

      <FiltroCampo label="PK / sector">
        <input type="text" value={draft.pk_id} onChange={(e) => set('pk_id', e.target.value)} placeholder="PK-ID…" style={inp} />
      </FiltroCampo>

      <FiltroCampo label="Alerta de saldo">
        <select value={draft.alerta_saldo} onChange={(e) => set('alerta_saldo', e.target.value)} style={inp}>
          <option value="">Todas</option>
          <option value="normal">Normal</option>
          <option value="naranja">Naranja</option>
          <option value="rojo">Rojo</option>
        </select>
      </FiltroCampo>
    </AlmacenFiltrosModal>
  )
}
