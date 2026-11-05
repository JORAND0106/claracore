import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, Users, X } from 'lucide-react'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import { CC_ANCHORED_DROPDOWN_Z } from '../../hooks/useAnchoredDropdown'
import UserSearchSelect, { nombreUser } from './UserSearchSelect'
import { useSeguimientoCompact } from './seguimientoShared'

/**
 * Popup de exportación del Plan: uno / varios / todos los colaboradores
 * (solo vista amplia: gerencial, administrativo, desarrollador).
 */
export default function PlanActividadesExportModal({
  t,
  usuarios = [],
  onClose,
  onExport,
}) {
  const compact = useSeguimientoCompact()
  const [selected, setSelected] = useState([])
  const [todos, setTodos] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const catalogo = useMemo(
    () => (usuarios || []).filter((u) => Number(u.id) > 0),
    [usuarios],
  )
  const totalColaboradores = catalogo.length

  const disponibles = useMemo(
    () => catalogo.filter((u) => {
      if (todos) return false
      return !selected.some((s) => Number(s.id) === Number(u.id))
    }),
    [catalogo, selected, todos],
  )

  function addUser(u) {
    if (!u?.id) return
    setTodos(false)
    setSelected((prev) => (
      prev.some((x) => Number(x.id) === Number(u.id))
        ? prev
        : [...prev, { id: Number(u.id), nombre: nombreUser(u) }]
    ))
  }

  function removeUser(id) {
    setSelected((prev) => prev.filter((x) => Number(x.id) !== Number(id)))
  }

  async function descargar() {
    setError('')
    if (!todos && !selected.length) {
      setError('Elija «Todos» o al menos un colaborador.')
      return
    }
    if (todos && !totalColaboradores) {
      setError('No hay colaboradores para exportar.')
      return
    }
    setBusy(true)
    try {
      // Con «Todos» se envían IDs explícitos + flag: el backend une ambos
      // para no quedar en una sola hoja si el catálogo remoto falla.
      const allIds = catalogo.map((u) => Number(u.id))
      await onExport?.({
        todos,
        colaborador_ids: todos ? allIds : selected.map((s) => Number(s.id)),
      })
      onClose?.()
    } catch (e) {
      setError(e?.message || 'No se pudo exportar')
    } finally {
      setBusy(false)
    }
  }

  const iconBtn = (primary = false) => ({
    width: compact ? 44 : 40,
    height: compact ? 44 : 40,
    borderRadius: 10,
    border: `1px solid ${primary ? t.primary : t.border}`,
    background: primary ? t.primary : 'transparent',
    color: primary ? '#fff' : t.text,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: busy ? 'wait' : 'pointer',
    opacity: busy ? 0.6 : 1,
    padding: 0,
  })

  const node = (
    <div
      role="presentation"
      data-cc-plan-export-overlay="1"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100070,
        background: t.overlay || 'rgba(15,23,42,0.48)',
        display: 'flex',
        alignItems: compact ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: compact ? 0 : 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Exportar Plan de actividades"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: compact ? '100%' : 'min(480px, 96vw)',
          maxHeight: compact ? '88dvh' : '90vh',
          overflow: 'auto',
          background: t.bgCard || t.bg || '#fff',
          border: `1px solid ${t.border}`,
          borderRadius: compact ? '14px 14px 0 0' : 14,
          boxShadow: t.shadow || '0 24px 64px rgba(0,0,0,0.28)',
        }}
      >
        <CcModalBrandHeader theme={t} />
        <div style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${t.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
        >
          <div style={{ fontSize: 'var(--cc-h3)', fontWeight: 800, color: t.text }}>
            Exportar Excel
          </div>
          <button
            type="button"
            title="Cerrar"
            data-cc-tooltip="Cerrar"
            data-cc-tooltip-variant="short"
            aria-label="Cerrar"
            onClick={onClose}
            style={iconBtn(false)}
          >
            <X size={18} strokeWidth={2.2} aria-hidden />
          </button>
        </div>

        <div style={{ padding: '14px 16px 18px', display: 'grid', gap: 12 }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 'var(--cc-sm)',
            color: t.text,
            fontWeight: 700,
            cursor: 'pointer',
          }}
          >
            <input
              type="checkbox"
              checked={todos}
              onChange={(e) => {
                const on = e.target.checked
                setTodos(on)
                if (on) setSelected([])
              }}
            />
            <Users size={16} strokeWidth={2.2} aria-hidden />
            Todos
            {totalColaboradores > 0 ? ` (${totalColaboradores})` : ''}
          </label>

          {todos ? (
            <div
              title={`Todos (${totalColaboradores})`}
              data-cc-tooltip={`Todos (${totalColaboradores})`}
              data-cc-tooltip-variant="short"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                border: `1px solid ${t.primary}`,
                background: `${t.primary}14`,
                color: t.text,
                borderRadius: 999,
                padding: '4px 12px',
                fontSize: 'var(--cc-xs)',
                fontWeight: 800,
                width: 'fit-content',
              }}
            >
              <Users size={13} strokeWidth={2.2} aria-hidden />
              Todos ({totalColaboradores})
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {selected.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    title="Quitar"
                    data-cc-tooltip="Quitar"
                    data-cc-tooltip-variant="short"
                    onClick={() => removeUser(s.id)}
                    style={{
                      border: `1px solid ${t.primary}`,
                      background: `${t.primary}14`,
                      color: t.text,
                      borderRadius: 999,
                      padding: '4px 10px',
                      fontSize: 'var(--cc-xs)',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {s.nombre} ×
                  </button>
                ))}
              </div>
              <UserSearchSelect
                key={`exp-search-${selected.map((s) => s.id).join('-') || 'empty'}`}
                t={t}
                usuarios={disponibles}
                valueId={null}
                valueNombre=""
                mode="strict"
                placeholder={selected.length ? 'Agregar otro…' : 'Buscar colaborador…'}
                dropdownZIndex={CC_ANCHORED_DROPDOWN_Z}
                maxHeight={compact ? 180 : 240}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  fontSize: 'var(--cc-sm)',
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: `1px solid ${t.border}`,
                  background: t.inputBg || t.bg || '#fff',
                  color: t.text,
                  fontWeight: 600,
                }}
                onSelect={addUser}
              />
            </>
          )}

          {error && (
            <div style={{ color: t.danger || '#dc2626', fontSize: 'var(--cc-sm)', fontWeight: 700 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              type="button"
              title="Cancelar"
              data-cc-tooltip="Cancelar"
              data-cc-tooltip-variant="short"
              aria-label="Cancelar"
              onClick={onClose}
              style={iconBtn(false)}
            >
              <X size={18} strokeWidth={2.2} aria-hidden />
            </button>
            <button
              type="button"
              title={busy ? 'Descargando…' : 'Descargar'}
              data-cc-tooltip={busy ? 'Descargando…' : 'Descargar'}
              data-cc-tooltip-variant="short"
              aria-label={busy ? 'Descargando…' : 'Descargar'}
              disabled={busy}
              onClick={() => void descargar()}
              style={iconBtn(true)}
            >
              <Download size={18} strokeWidth={2.2} aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return node
  return createPortal(node, document.body)
}
