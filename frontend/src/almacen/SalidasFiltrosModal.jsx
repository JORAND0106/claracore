import { useEffect, useState } from 'react'
import AlmacenFiltrosModal, { FiltroCampo, filtroInputStyle } from './AlmacenFiltrosModal'
import { EMPTY_SALIDAS_FILTROS } from './salidasFiltros'

export default function SalidasFiltrosModal({
  theme,
  filtros,
  onClose,
  onApply,
}) {
  const [draft, setDraft] = useState(() => ({ ...EMPTY_SALIDAS_FILTROS, ...filtros }))
  const inp = filtroInputStyle(theme)

  useEffect(() => {
    setDraft({ ...EMPTY_SALIDAS_FILTROS, ...filtros })
  }, [filtros])

  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }))

  return (
    <AlmacenFiltrosModal
      theme={theme}
      titulo="Filtros · Salidas"
      onClose={onClose}
      onClear={() => {
        setDraft({ ...EMPTY_SALIDAS_FILTROS })
        onApply({ ...EMPTY_SALIDAS_FILTROS })
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

      <FiltroCampo label="PK-ID">
        <input type="text" value={draft.pk_id} onChange={(e) => set('pk_id', e.target.value)} placeholder="PK-ID…" style={inp} />
      </FiltroCampo>

      <FiltroCampo label="Material">
        <input type="text" value={draft.material} onChange={(e) => set('material', e.target.value)} placeholder="Descripción…" style={inp} />
      </FiltroCampo>

      <FiltroCampo label="N.º OC">
        <input type="text" value={draft.numero_oc} onChange={(e) => set('numero_oc', e.target.value)} placeholder="Orden de compra…" style={inp} />
      </FiltroCampo>

      <FiltroCampo label="Receptor">
        <input type="text" value={draft.receptor} onChange={(e) => set('receptor', e.target.value)} placeholder="Quién recibe…" style={inp} />
      </FiltroCampo>

      <FiltroCampo label="Despachador">
        <input type="text" value={draft.despachador} onChange={(e) => set('despachador', e.target.value)} placeholder="Quién despacha…" style={inp} />
      </FiltroCampo>

      <FiltroCampo label="Devolución">
        <select value={draft.con_devolucion} onChange={(e) => set('con_devolucion', e.target.value)} style={inp}>
          <option value="">Todas</option>
          <option value="si">Con devolución</option>
          <option value="no">Sin devolución</option>
        </select>
      </FiltroCampo>

      <FiltroCampo label="N.º salida">
        <input type="text" value={draft.numero_salida} onChange={(e) => set('numero_salida', e.target.value)} placeholder="Código o número…" style={inp} />
      </FiltroCampo>
    </AlmacenFiltrosModal>
  )
}
