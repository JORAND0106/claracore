/**
 * Panel lateral de ayuda — tutorial CPM / dependencias.
 */
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronRight, Globe, GitFork, Play, Eye, AlertTriangle } from 'lucide-react'

const TEAL = {
  bg: '#E6F7F3',
  border: '#1D9E75',
  text: '#0d6e56',
  hover: '#D4F0EA',
}

const TIPOS_TABLA = [
  { tipo: 'FS', nombre: 'Fin a Inicio', uso: 'Lo más común. B empieza cuando A termina.' },
  { tipo: 'SS', nombre: 'Inicio a Inicio', uso: 'B empieza cuando A empieza (trabajo en paralelo).' },
  { tipo: 'FF', nombre: 'Fin a Fin', uso: 'B termina cuando A termina.' },
  { tipo: 'SF', nombre: 'Inicio a Fin', uso: 'Raro. B termina cuando A empieza.' },
]

const PASOS = [
  {
    icon: Globe,
    title: 'Paso 1 — Define las dependencias globales',
    body: (
      <>
        Desde el panel lateral, establece la secuencia estándar que aplica a todos los sectores.
        <br />
        <em>Ejemplo: &quot;Excavación siempre va antes de Base Granular&quot;</em>
      </>
    ),
  },
  {
    icon: GitFork,
    title: 'Paso 2 — Ajusta dependencias específicas',
    body: (
      <>
        Si un sector tiene una secuencia diferente, defínela aquí en la tab Dependencias.
        <br />
        Las específicas tienen prioridad sobre las globales.
      </>
    ),
  },
  {
    icon: Play,
    title: 'Paso 3 — Calcula el CPM',
    body: (
      <>
        Haz clic en &quot;Calcular CPM&quot;. El sistema analizará todas las dependencias y calculará
        automáticamente qué actividades son críticas.
      </>
    ),
  },
  {
    icon: Eye,
    title: 'Paso 4 — Interpreta los resultados',
    body: (
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        <li>
          <strong style={{ color: '#ef4444' }}>Barra roja</strong> = Ruta crítica. Cualquier retraso aquí retrasa
          toda la obra.
        </li>
        <li>
          <strong>Barra con extensión gris</strong> = Tiene holgura. Puede retrasarse X días sin afectar el
          proyecto.
        </li>
        <li>
          <strong>En Gantt y tabla CPM:</strong> barras o filas en rojo = actividades en ruta crítica (no se resalta en el contorno del mapa).
        </li>
      </ul>
    ),
  },
]

function PasoCard({ paso, t }) {
  const Icon = paso.icon
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        padding: '10px 12px',
        marginBottom: 10,
        borderRadius: 8,
        border: `1px solid ${t.border}`,
        background: t.bg,
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: TEAL.bg,
          border: `1px solid ${TEAL.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: TEAL.text,
        }}
      >
        <Icon size={14} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 'var(--cc-caption)', color: t.text, marginBottom: 4 }}>
          {paso.title}
        </div>
        <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, lineHeight: 1.5 }}>{paso.body}</div>
      </div>
    </div>
  )
}

function AccordionItem({ id, title, openId, onToggle, t, children }) {
  const open = openId === id
  const [hover, setHover] = useState(false)

  return (
    <div
      style={{
        borderBottom: `1px solid ${t.border}`,
      }}
    >
      <button
        type="button"
        onClick={() => onToggle(id)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '11px 4px',
          border: 'none',
          background: hover ? TEAL.hover : 'transparent',
          cursor: 'pointer',
          textAlign: 'left',
          borderRadius: 6,
          transition: 'background 0.15s ease',
        }}
      >
        <ChevronRight
          size={16}
          color={TEAL.text}
          style={{
            flexShrink: 0,
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.22s ease',
          }}
        />
        <span style={{ fontWeight: 600, fontSize: 'var(--cc-caption)', color: t.text, lineHeight: 1.35 }}>
          {title}
        </span>
      </button>
      <div
        style={{
          display: 'grid',
          gridTemplateRows: open ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.28s ease',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          <div
            style={{
              padding: '0 4px 14px 24px',
              fontSize: 'var(--cc-caption)',
              color: t.textMuted,
              lineHeight: 1.55,
              opacity: open ? 1 : 0,
              transition: 'opacity 0.22s ease',
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

export function DepAyudaButton({ onClick, t, title = 'Ayuda sobre dependencias CPM' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
        padding: 0,
        fontSize: 'var(--cc-md)',
        fontWeight: 700,
        borderRadius: 6,
        border: `1px solid ${TEAL.border}`,
        background: TEAL.bg,
        color: TEAL.text,
        cursor: 'pointer',
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      ?
    </button>
  )
}

export default function ProgObraDepAyuda({ open, onClose, t }) {
  const [openId, setOpenId] = useState(null)

  useEffect(() => {
    if (!open) setOpenId(null)
  }, [open])

  const handleToggle = (id) => {
    setOpenId((prev) => (prev === id ? null : id))
  }

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <>
      <div
        role="presentation"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 210000,
          background: 'rgba(0,0,0,0.35)',
        }}
      />
      <aside
        role="dialog"
        aria-labelledby="dep-ayuda-title"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(440px, 92vw)',
          zIndex: 210001,
          background: t.bgCard,
          borderLeft: `1px solid ${t.border}`,
          boxShadow: '-8px 0 24px rgba(0,0,0,0.15)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderBottom: `1px solid ${t.border}`,
            flexShrink: 0,
          }}
        >
          <div id="dep-ayuda-title" style={{ fontWeight: 700, fontSize: 'var(--cc-md)', color: t.text }}>
            Guía de dependencias CPM
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ayuda"
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: t.textMuted,
              padding: 4,
              display: 'flex',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px 16px' }}>
          <AccordionItem id="deps" title="¿Qué son las dependencias?" openId={openId} onToggle={handleToggle} t={t}>
            <p style={{ margin: '0 0 8px' }}>
              Las dependencias definen el orden en que deben ejecutarse los capítulos de obra. Por ejemplo: la base
              granular no puede colocarse antes de terminar la excavación.
            </p>
            <p style={{ margin: 0 }}>
              Puede definir dependencias <strong style={{ color: t.text }}>globales</strong> (misma secuencia en todos
              los PKs) o <strong style={{ color: t.text }}>específicas</strong> entre PKs concretos desde el modal de
              programación.
            </p>
          </AccordionItem>

          <AccordionItem id="tipos" title="Tipos de dependencia (FS / SS / FF / SF)" openId={openId} onToggle={handleToggle} t={t}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 'var(--cc-caption)',
              }}
            >
              <thead>
                <tr style={{ borderBottom: `1px solid ${t.border}` }}>
                  {['Tipo', 'Nombre', 'Cuándo usarlo'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '6px 8px',
                        textAlign: 'left',
                        fontWeight: 600,
                        color: t.textMuted,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TIPOS_TABLA.map((row) => (
                  <tr key={row.tipo} style={{ borderBottom: `1px solid ${t.border}33` }}>
                    <td style={{ padding: '6px 8px', fontWeight: 700, color: TEAL.border }}>{row.tipo}</td>
                    <td style={{ padding: '6px 8px', color: t.text }}>{row.nombre}</td>
                    <td style={{ padding: '6px 8px', color: t.textMuted }}>{row.uso}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AccordionItem>

          <AccordionItem id="lag" title="¿Qué es el Lag?" openId={openId} onToggle={handleToggle} t={t}>
            <p style={{ margin: 0 }}>
              Días hábiles de espera entre una actividad y la siguiente. Ejemplo: lag = 3 en una dependencia FS
              significa que B empieza 3 días hábiles después de que A termina. Puede ser{' '}
              <strong style={{ color: t.text }}>negativo</strong> para permitir solapamiento.
            </p>
          </AccordionItem>

          <AccordionItem id="cpm" title="¿Qué es el CPM?" openId={openId} onToggle={handleToggle} t={t}>
            <p style={{ margin: 0 }}>
              CPM significa <strong style={{ color: t.text }}>Método de la Ruta Crítica</strong> (Critical Path
              Method). Es una técnica usada mundialmente en construcción para identificar qué actividades no pueden
              retrasarse sin afectar la fecha de entrega del proyecto.
            </p>
          </AccordionItem>

          <AccordionItem id="pasos" title="Cómo usar — paso a paso" openId={openId} onToggle={handleToggle} t={t}>
            {PASOS.map((paso) => (
              <PasoCard key={paso.title} paso={paso} t={t} />
            ))}
          </AccordionItem>

          <AccordionItem id="ejemplo" title="Ejemplo práctico de obra vial" openId={openId} onToggle={handleToggle} t={t}>
            <p style={{ margin: '0 0 10px', fontWeight: 600, color: t.text }}>
              Pavimentación de un sector
            </p>
            <div
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: 11,
                lineHeight: 1.65,
                padding: '12px 14px',
                borderRadius: 8,
                background: t.bg,
                border: `1px solid ${t.border}`,
                color: t.text,
                overflowX: 'auto',
              }}
            >
              <div>Cap. 1: Excavación&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;████ (días 1-5)</div>
              <div>Cap. 2: Base Granular&nbsp;&nbsp;&nbsp;&nbsp;FS&nbsp;&nbsp;&nbsp;&nbsp;████ (días 6-10)</div>
              <div>Cap. 3: Pavimento&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;FS&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;████ (días 11-15)</div>
              <div>Cap. 4: Señalización&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;FS&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;██ (días 16-17)</div>
              <div style={{ marginTop: 10, color: t.textMuted }}>
                → Todos están en ruta crítica (holgura = 0)
                <br />
                → Si Excavación se retrasa 2 días, la entrega se retrasa 2 días.
              </div>
            </div>
          </AccordionItem>

          <AccordionItem id="desactualizado" title={'¿Qué significa "CPM desactualizado"?'} openId={openId} onToggle={handleToggle} t={t}>
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                padding: '10px 12px',
                borderRadius: 8,
                background: '#FEF3C7',
                border: '1px solid #FDE68A',
                color: '#92400E',
              }}
            >
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ margin: 0 }}>
                Aparece cuando agregaste o cambiaste fechas o dependencias desde el último cálculo. Haz clic en{' '}
                <strong>&quot;Calcular CPM&quot;</strong> para actualizar los resultados.
              </p>
            </div>
          </AccordionItem>

          <AccordionItem id="ruta" title="¿Qué es la Ruta Crítica?" openId={openId} onToggle={handleToggle} t={t}>
            <p style={{ margin: 0 }}>
              La secuencia de actividades que determina la duración mínima del proyecto. Cualquier retraso en la ruta
              crítica retrasa toda la obra. En el Gantt y la tabla CPM se resalta en rojo.
            </p>
          </AccordionItem>

          <AccordionItem id="holgura" title="¿Qué es la Holgura?" openId={openId} onToggle={handleToggle} t={t}>
            <p style={{ margin: 0 }}>
              Los días que puede retrasarse una actividad sin afectar la fecha de entrega del proyecto. En el Gantt se
              muestra como una extensión semitransparente después de la barra programada.
            </p>
          </AccordionItem>
        </div>
      </aside>
    </>,
    document.body,
  )
}
