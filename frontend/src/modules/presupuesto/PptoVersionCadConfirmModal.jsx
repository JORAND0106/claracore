import CcModalBrandHeader from '../../components/CcModalBrandHeader'
/**
 * Modal de confirmación antes de importar desde ClaraCAD en modo biblioteca de versión.
 */
export default function PptoVersionCadConfirmModal({
  open,
  onCancel,
  onConfirm,
  t,
  versionActiva,
  itemCount = 0,
  busy = false,
}) {
  if (!open || !versionActiva) return null

  const etiqueta = versionActiva.etiqueta || `Versión ${versionActiva.numero_version ?? ''}`.trim()

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 12000,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={() => !busy && onCancel()}
    >
      <div
        style={{
          maxWidth: 520,
          width: '100%',
          background: t.bgCard,
          borderRadius: 14,
          border: '2px solid #B45309',
          boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >        <CcModalBrandHeader theme={t} />

        <div style={{ padding: '18px 20px', background: '#F59E0B18', borderBottom: '1px solid #F59E0B55' }}>
          <div style={{ fontSize: 'var(--cc-body)', fontWeight: 900, color: '#B45309' }}>
            ⚠ Importación ClaraCAD en versión de biblioteca
          </div>
        </div>
        <div style={{ padding: '18px 20px', color: t.text, fontSize: 'var(--cc-sm)', lineHeight: 1.55 }}>
          <p style={{ margin: '0 0 12px' }}>
            Está trabajando en la versión <strong style={{ color: t.primary }}>«{etiqueta}»</strong>
            {versionActiva.numero_version != null ? (
              <span style={{ color: t.textMuted }}> (V{versionActiva.numero_version})</span>
            ) : null}
            , no en el presupuesto vivo.
          </p>
          <p style={{ margin: '0 0 12px' }}>
            Las cantidades recibidas desde ClaraCAD se cargarán sobre{' '}
            <strong>esta versión específica</strong> en la biblioteca de la versión.
            El presupuesto vivo no se modificará.
          </p>
          {itemCount > 0 ? (
            <p style={{ margin: 0, color: t.textMuted, fontSize: 'var(--cc-caption)' }}>
              Registros en el lote: {itemCount.toLocaleString('es-CO')}
            </p>
          ) : null}
        </div>
        <div
          style={{
            padding: '14px 20px',
            borderTop: `1px solid ${t.border}`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              padding: '8px 16px',
              border: `1px solid ${t.border}`,
              borderRadius: 8,
              background: 'transparent',
              color: t.textMuted,
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={{
              padding: '8px 18px',
              border: 'none',
              borderRadius: 8,
              background: busy ? '#94a3b8' : '#B45309',
              color: '#fff',
              fontWeight: 800,
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            {busy ? '⏳ Importando…' : 'Sí, cargar en esta versión'}
          </button>
        </div>
      </div>
    </div>
  )
}
