import { useEffect, useRef, useState } from 'react'

export function FieldLabel({ label, hint, t, style }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, position: 'relative', ...style }}>
      {label}
      {hint && (
        <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
          <button
            type="button"
            aria-label={`Información: ${label}`}
            title={hint}
            onClick={() => setOpen((v) => !v)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'help',
              color: t.primary,
              fontSize: 'var(--cc-sm)',
              padding: 0,
              lineHeight: 1,
              opacity: 0.85,
            }}
          >
            ⓘ
          </button>
          {open && (
            <span
              role="tooltip"
              style={{
                position: 'absolute',
                left: '50%',
                bottom: 'calc(100% + 8px)',
                transform: 'translateX(-50%)',
                zIndex: 50,
                minWidth: 200,
                maxWidth: 280,
                padding: '10px 12px',
                background: t.bgCard,
                border: `1px solid ${t.border}`,
                borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                fontSize: 'var(--cc-sm)',
                color: t.text,
                fontWeight: 400,
                lineHeight: 1.45,
                textAlign: 'left',
              }}
            >
              {hint}
            </span>
          )}
        </span>
      )}
    </span>
  )
}

export const TX_FIELD_HINTS = {
  fecha: 'Fecha contable del movimiento: día en que se reconoce el ingreso o el egreso.',
  tipo: 'Ingreso: entrada de dinero o valor recibido. Egreso: gasto o salida de recursos.',
  valor_bruto: 'Monto base sin IVA. Si proviene de una orden de pago facturada, use el subtotal.',
  retencion_fuente_valor: 'Valor en pesos retenido en la fuente por el pagador, si aplica.',
  iva_tasa: 'Porcentaje de IVA en decimal (ej. 0.19 equivale al 19%).',
  iva_valor: 'Monto del IVA: recaudado en ingresos o pagado en egresos.',
  categoria: 'Clasifique el movimiento según el plan de cuentas (ingreso o egreso).',
  centro_costo_tipo: 'Empresa general: gastos/ingresos corporativos. Contrato: asignar a un contrato.',
  contrato: 'Contrato de licenciamiento u obra al que se imputa el movimiento.',
  fuente_ingreso: 'Licenciamiento o servicios; define la subcuenta de capitalización (20% del bruto).',
  notas: 'Comentarios opcionales: número de factura, beneficiario, referencia interna, etc.',
}
