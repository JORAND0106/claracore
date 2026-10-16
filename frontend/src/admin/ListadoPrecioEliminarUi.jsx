/**
 * Confirmación de baja y popup de uso del Listado de Precios.
 * Ambos se montan en document.body para quedar completos, por encima del panel.
 */
import { createPortal } from 'react-dom'
import CcConfirmModal from '../components/CcConfirmModal'
import CcModalBrandHeader from '../components/CcModalBrandHeader'

const Z_BLOQUEO = 100250
const Z_CONFIRMAR = 100260

function fmtCantidad(value) {
  if (value == null || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value)
  return n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtAbs(inicio, fin) {
  if ((inicio == null || inicio === '') && (fin == null || fin === '')) return ''
  const lado = (v) => (v == null || v === '' ? '—' : String(v))
  return `Abs ${lado(inicio)}–${lado(fin)}`
}

export function lineaIdentidadRegistro(row) {
  const partes = []
  if (row?.pk) partes.push(`PK ${row.pk}`)
  if (row?.id_pol) partes.push(`Id ${row.id_pol}`)
  if (row?.numero_registro) partes.push(`Reg. ${row.numero_registro}`)
  if (row?.tramo) partes.push(`Tramo ${row.tramo}`)
  if (row?.calzada) partes.push(row.calzada)
  const abs = fmtAbs(row?.abs_inicio, row?.abs_final)
  if (abs) partes.push(abs)
  if (row?.reporte_id != null && row.reporte_id !== '') partes.push(`Reporte ${row.reporte_id}`)
  if (row?.acta) partes.push(`Acta ${row.acta}`)
  if (row?.registro) partes.push(`Registro ${row.registro}`)
  if (row?.id != null) partes.push(`#${row.id}`)
  return partes.join(' · ') || '—'
}

function SeccionRegistros({ titulo, subtitulo, total, truncado, rows, theme }) {
  const border = theme.border || '#E2E8F0'
  const text = theme.text || '#0F172A'
  const muted = theme.textMuted || '#64748B'
  const card = theme.inputBg || theme.bg || '#F8FAFC'
  return (
    <section style={{ marginTop: 14 }}>
      <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 800, color: text }}>{titulo}</div>
      <div style={{ fontSize: 'var(--cc-caption)', color: muted, marginTop: 2 }}>{subtitulo}</div>
      {total === 0 ? (
        <div style={{ fontSize: 'var(--cc-sm)', color: muted, marginTop: 8 }}>Sin registros.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {rows.map((row, index) => (
            <article
              key={`${row.origen || 'r'}-${row.id ?? index}`}
              style={{
                border: `1px solid ${border}`,
                borderRadius: 10,
                background: card,
                padding: '8px 10px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: 'var(--cc-color-danger, #b91c1c)' }}>
                    {row.tipo || 'Registro'}
                  </div>
                  <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 700, color: text }}>
                    {row.item || '—'}
                    {row.capitulo ? ` · ${row.capitulo}` : ''}
                    {row.competencia ? ` · ${row.competencia}` : ''}
                  </div>
                  {row.descripcion ? (
                    <div style={{ fontSize: 'var(--cc-caption)', color: muted, marginTop: 2 }}>
                      {row.descripcion}
                    </div>
                  ) : null}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 'var(--cc-caption)', color: muted }}>Cantidad</div>
                  <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 800, color: text }}>
                    {fmtCantidad(row.cantidad)}{row.unidad ? ` ${row.unidad}` : ''}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 'var(--cc-caption)', color: muted, marginTop: 6, lineHeight: 1.4 }}>
                {lineaIdentidadRegistro(row)}
              </div>
            </article>
          ))}
          {truncado ? (
            <div style={{ fontSize: 'var(--cc-caption)', color: muted }}>
              Se muestran {rows.length.toLocaleString('es-CO')} de {total.toLocaleString('es-CO')} registros.
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}

function PopupUsoPrecio({ theme, item, uso, onClose }) {
  const t = theme || {}
  const surface = t.bgCard || '#ffffff'
  const text = t.text || '#0F172A'
  const border = t.border || '#E2E8F0'
  const danger = '#DC2626'
  const dangerText = 'var(--cc-color-danger, #DC2626)'
  const tituloItem = [item?.item_numero || uso?.item_numero, item?.descripcion || uso?.descripcion]
    .filter(Boolean)
    .join(' — ')
  const presupuesto = uso?.presupuesto || []
  const cobrados = uso?.cobrados || []
  const nodo = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: Z_BLOQUEO,
        background: t.overlay || 'rgba(15, 23, 42, 0.48)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        overflow: 'auto',
        fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
        fontSize: 'var(--cc-body)',
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cc-precio-uso-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 880,
          maxHeight: 'min(92vh, 900px)',
          display: 'flex',
          flexDirection: 'column',
          background: surface,
          border: `1px solid ${border}`,
          borderRadius: 14,
          boxShadow: t.shadow || '0 24px 64px rgba(0,0,0,0.28)',
          overflow: 'hidden',
          color: text,
        }}
      >
        <CcModalBrandHeader theme={t} />
        <div
          style={{
            flexShrink: 0,
            padding: '14px 18px 12px',
            background: `color-mix(in srgb, ${danger} 12%, ${surface})`,
            borderBottom: `1px solid ${border}`,
          }}
        >
          <div id="cc-precio-uso-title" style={{ fontSize: 'var(--cc-body)', fontWeight: 800, color: dangerText }}>
            No se puede eliminar
          </div>
          {tituloItem ? (
            <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 700, color: text, marginTop: 4 }}>{tituloItem}</div>
          ) : null}
        </div>
        <div style={{ padding: '14px 18px 8px', overflowY: 'auto', minHeight: 0, flex: '1 1 auto' }}>
          <div style={{ fontSize: 'var(--cc-sm)', lineHeight: 1.45, color: text }}>
            {uso?.message || 'No se puede eliminar este precio porque tiene cantidades en presupuesto o cantidades cobradas.'}
            {' '}Esos registros usan este ítem como precio de referencia.
          </div>
          <SeccionRegistros
            titulo={`En presupuesto (${(uso?.presupuesto_total ?? presupuesto.length).toLocaleString('es-CO')})`}
            subtitulo="Presupuesto de Obra y Obra Ejecutada"
            total={uso?.presupuesto_total ?? presupuesto.length}
            truncado={!!uso?.presupuesto_truncado}
            rows={presupuesto}
            theme={t}
          />
          <SeccionRegistros
            titulo={`Cobrados (${(uso?.cobrados_total ?? cobrados.length).toLocaleString('es-CO')})`}
            subtitulo="Cantidades cobradas"
            total={uso?.cobrados_total ?? cobrados.length}
            truncado={!!uso?.cobrados_truncado}
            rows={cobrados}
            theme={t}
          />
        </div>
        <div style={{ flexShrink: 0, padding: '12px 18px 16px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: danger,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 18px',
              fontSize: 'var(--cc-sm)',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
  return createPortal(nodo, document.body)
}

export default function ListadoPrecioEliminarDialogs({
  theme,
  confirmItem,
  bloqueo,
  eliminando,
  onCancelConfirm,
  onConfirm,
  onCloseBloqueo,
}) {
  const item = confirmItem
  const desc = (item?.descripcion || '').trim()
  const etiqueta = [item?.item_numero, desc].filter(Boolean).join(' — ')
  return (
    <>
      {item && createPortal(
        <CcConfirmModal
          theme={theme}
          tipo="danger"
          titulo="Eliminar precio"
          confirmar="Eliminar"
          cancelar="Cancelar"
          zIndex={Z_CONFIRMAR}
          procesando={eliminando}
          onCancel={onCancelConfirm}
          onConfirm={onConfirm}
        >
          {`¿Eliminar el precio ${etiqueta || 'seleccionado'}? Esta acción no se puede deshacer.`}
        </CcConfirmModal>,
        document.body,
      )}
      {bloqueo && (
        <PopupUsoPrecio
          theme={theme}
          item={bloqueo.item}
          uso={bloqueo.uso}
          onClose={onCloseBloqueo}
        />
      )}
    </>
  )
}
