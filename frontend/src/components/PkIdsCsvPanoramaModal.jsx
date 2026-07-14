/**
 * Panorama maestro PK-ID: vínculos SICOE / Presupuesto y eliminación segura.
 */
import { useMemo, useState } from "react";
import CcConfirmModal from "./CcConfirmModal";

const ESTADO_LABEL = {
  nuevo: "Nuevo",
  actualizar: "Actualizar",
  igual: "Sin cambios",
  solo_maestro: "Solo en maestro",
  maestro: "En maestro",
};

const ESTADO_COLOR = {
  nuevo: "var(--cc-color-success, #16a34a)",
  actualizar: "var(--cc-color-warn, #d97706)",
  igual: "var(--cc-almacen-text-muted, #64748b)",
  solo_maestro: "var(--cc-color-danger, #dc2626)",
  maestro: "var(--cc-almacen-text-muted, #64748b)",
};

function fmtVal(v) {
  if (v == null || v === "") return "—";
  return String(v);
}

function SicoeBadge({ refs, theme }) {
  const total = refs?.total ?? 0;
  if (!total) return null;
  return (
    <span
      title={`${refs.reportes ?? 0} reportes · ${refs.registros ?? 0} registros`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: "var(--cc-caption, 11px)",
        fontWeight: 800,
        padding: "2px 8px",
        borderRadius: 999,
        background: `color-mix(in srgb, ${theme.sicoe} 18%, ${theme.bgCard})`,
        color: theme.sicoe,
        border: `1px solid color-mix(in srgb, ${theme.sicoe} 35%, transparent)`,
        whiteSpace: "nowrap",
      }}
    >
      SICOE {total}
    </span>
  );
}

function PresupuestoBadge({ refs, theme }) {
  const total = refs?.total ?? 0;
  if (!total) return null;
  return (
    <span
      title={`${refs.presupuesto_obra ?? 0} Presupuesto de Obra · ${refs.obra_ejecutada ?? 0} Obra Ejecutada`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: "var(--cc-caption, 11px)",
        fontWeight: 800,
        padding: "2px 8px",
        borderRadius: 999,
        background: `color-mix(in srgb, ${theme.presupuesto} 16%, ${theme.bgCard})`,
        color: theme.presupuesto,
        border: `1px solid color-mix(in srgb, ${theme.presupuesto} 35%, transparent)`,
        whiteSpace: "nowrap",
      }}
    >
      PPTO {total}
    </span>
  );
}

function VinculosCell({ f, theme }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
      <SicoeBadge refs={f.sicoe_refs} theme={theme} />
      <PresupuestoBadge refs={f.presupuesto_refs} theme={theme} />
      {!f.en_uso && f.maestro_id != null && (
        <span style={{ fontSize: "var(--cc-caption, 11px)", color: theme.muted, fontWeight: 600 }}>
          Sin uso
        </span>
      )}
    </div>
  );
}

export default function PkIdsCsvPanoramaModal({
  open,
  onClose,
  theme,
  titulo = "Panorama maestro PK-ID",
  subtitulo = null,
  data = null,
  loading = false,
  error = null,
  contratoId = null,
  onEliminarSinUso = null,
  onEliminarPk = null,
  onRefresh = null,
  eliminando = false,
}) {
  const [filtro, setFiltro] = useState("todos");
  const [buscar, setBuscar] = useState("");
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [confirmOne, setConfirmOne] = useState(null);

  const filas = data?.filas ?? [];
  const resumen = data?.resumen ?? {};
  const columnas = data?.columnas_csv ?? [];
  const eliminables = resumen.eliminables ?? resumen.sin_uso ?? 0;

  const filasVisibles = useMemo(() => {
    let rows = filas;
    if (filtro === "cambios") rows = rows.filter((f) => f.estado === "actualizar" || f.estado === "nuevo");
    else if (filtro === "sicoe") rows = rows.filter((f) => (f.sicoe_refs?.total ?? 0) > 0);
    else if (filtro === "presupuesto") rows = rows.filter((f) => (f.presupuesto_refs?.total ?? 0) > 0);
    else if (filtro === "sin_uso") rows = rows.filter((f) => f.eliminable);
    else if (filtro === "solo_maestro") rows = rows.filter((f) => f.estado === "solo_maestro");
    else if (filtro !== "todos") rows = rows.filter((f) => f.estado === filtro);

    const q = buscar.trim().toLowerCase();
    if (q) rows = rows.filter((f) => String(f.pk_id || "").toLowerCase().includes(q));
    return rows;
  }, [filas, filtro, buscar]);

  if (!open) return null;

  const t = theme || {};
  const surface = t.bgCard || "#fff";
  const border = t.border || "#e2e8f0";
  const text = t.text || "#0f172a";
  const muted = t.textMuted || "#64748b";
  const overlay = t.overlay || "rgba(15, 23, 42, 0.48)";
  const primary = t.primary || "#0077B6";
  const sicoeColor = t.warn || "#d97706";
  const presupuestoColor = t.presupuesto || "#6366f1";
  const danger = t.danger || "#dc2626";
  const badgeTheme = { bgCard: surface, sicoe: sicoeColor, presupuesto: presupuestoColor, muted };

  const chip = (active, label, count) => (
    <button
      type="button"
      onClick={() => setFiltro(active)}
      style={{
        background: active === filtro ? `color-mix(in srgb, ${primary} 14%, ${surface})` : "transparent",
        color: active === filtro ? primary : muted,
        border: `1px solid ${active === filtro ? primary : border}`,
        borderRadius: 999,
        padding: "5px 10px",
        fontSize: "var(--cc-caption, 11px)",
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {label}{count != null ? ` (${count})` : ""}
    </button>
  );

  function rowBg(f) {
    const s = (f.sicoe_refs?.total ?? 0) > 0;
    const p = (f.presupuesto_refs?.total ?? 0) > 0;
    if (s && p) {
      return `linear-gradient(90deg, color-mix(in srgb, ${sicoeColor} 9%, ${surface}) 0%, color-mix(in srgb, ${presupuestoColor} 9%, ${surface}) 100%)`;
    }
    if (s) return `color-mix(in srgb, ${sicoeColor} 10%, ${surface})`;
    if (p) return `color-mix(in srgb, ${presupuestoColor} 10%, ${surface})`;
    if (f.estado === "solo_maestro") return `color-mix(in srgb, ${danger} 5%, ${surface})`;
    return "transparent";
  }

  async function handleBulkDelete() {
    if (!onEliminarSinUso) return;
    await onEliminarSinUso();
    setConfirmBulk(false);
  }

  async function handleOneDelete() {
    if (!confirmOne || !onEliminarPk) return;
    await onEliminarPk(confirmOne.maestro_id, confirmOne.pk_id);
    setConfirmOne(null);
  }

  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 100030,
          background: overlay,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "min(1180px, 100%)",
            maxHeight: "min(88vh, 900px)",
            display: "flex",
            flexDirection: "column",
            background: surface,
            border: `1px solid ${border}`,
            borderRadius: 14,
            boxShadow: t.shadow || "0 24px 64px rgba(0,0,0,0.28)",
            color: text,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "16px 20px 12px",
              borderBottom: `1px solid ${border}`,
              background: `color-mix(in srgb, ${primary} 10%, ${surface})`,
            }}
          >
            <div style={{ fontSize: "var(--cc-body)", fontWeight: 800, color: primary }}>{titulo}</div>
            {subtitulo && (
              <div style={{ fontSize: "var(--cc-sm)", color: muted, marginTop: 4, lineHeight: 1.4 }}>{subtitulo}</div>
            )}
            {!loading && !error && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8, fontSize: "var(--cc-caption)" }}>
                <span style={{ color: sicoeColor, fontWeight: 700 }}>■ SICOE</span>
                <span style={{ color: presupuestoColor, fontWeight: 700 }}>■ Presupuesto</span>
              </div>
            )}
          </div>

          <div style={{ padding: "12px 20px", borderBottom: `1px solid ${border}` }}>
            {loading ? (
              <div style={{ fontSize: "var(--cc-sm)", color: muted }}>Cargando panorama…</div>
            ) : error ? (
              <div style={{ fontSize: "var(--cc-sm)", color: danger }}>{error}</div>
            ) : (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                  {data?.modo === "comparar" ? (
                    <>
                      {chip("todos", "Todos", resumen.total_filas)}
                      {chip("actualizar", "Con cambios", resumen.actualizar)}
                      {chip("nuevo", "Nuevos", resumen.nuevos)}
                      {chip("igual", "Sin cambios", resumen.igual)}
                      {chip("solo_maestro", "Solo maestro", resumen.solo_maestro)}
                      {chip("sicoe", "Con SICOE", resumen.con_sicoe_refs)}
                      {chip("presupuesto", "Con Presupuesto", resumen.con_presupuesto_refs)}
                      {chip("sin_uso", "Sin uso", resumen.eliminables)}
                    </>
                  ) : (
                    <>
                      {chip("todos", "Todos", resumen.total_maestro ?? resumen.total_filas)}
                      {chip("sicoe", "Con SICOE", resumen.con_sicoe_refs)}
                      {chip("presupuesto", "Con Presupuesto", resumen.con_presupuesto_refs)}
                      {chip("sin_uso", "Sin uso", resumen.eliminables)}
                    </>
                  )}
                </div>
                {data?.modo === "comparar" && (resumen.actualizar ?? 0) > 0 && (
                  <div style={{ fontSize: "var(--cc-sm)", color: sicoeColor, fontWeight: 600, marginBottom: 8, lineHeight: 1.4 }}>
                    {resumen.actualizar} PK tienen columnas distintas en el CSV. Use Sincronizar para aplicar esos cambios.
                  </div>
                )}
                {(resumen.solo_maestro_eliminables ?? 0) > 0 && data?.modo === "comparar" && (
                  <div style={{ fontSize: "var(--cc-sm)", color: muted, marginBottom: 8, lineHeight: 1.4 }}>
                    {resumen.solo_maestro_eliminables} PK están solo en maestro y sin uso — puede eliminarlos para alinear con el CSV.
                  </div>
                )}
                <input
                  type="search"
                  value={buscar}
                  onChange={(e) => setBuscar(e.target.value)}
                  placeholder="Buscar por CAPA / PK…"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    background: t.inputBg || surface,
                    border: `1px solid ${border}`,
                    borderRadius: 8,
                    padding: "8px 12px",
                    color: text,
                    fontSize: "var(--cc-sm)",
                  }}
                />
              </>
            )}
          </div>

          <div style={{ flex: 1, overflow: "auto", padding: "0 20px" }}>
            {!loading && !error && (
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "var(--cc-caption, 11px)",
                  marginBottom: 12,
                }}
              >
                <thead>
                  <tr style={{ position: "sticky", top: 0, background: surface, zIndex: 1 }}>
                    <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: `2px solid ${border}`, color: muted }}>CAPA</th>
                    <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: `2px solid ${border}`, color: muted }}>Estado</th>
                    <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: `2px solid ${border}`, color: muted }}>Vínculos</th>
                    {onEliminarPk && (
                      <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: `2px solid ${border}`, color: muted, width: 72 }} />
                    )}
                    {columnas.map((col) => (
                      <th
                        key={col}
                        style={{ textAlign: "left", padding: "10px 8px", borderBottom: `2px solid ${border}`, color: muted, minWidth: 88 }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filasVisibles.length === 0 ? (
                    <tr>
                      <td colSpan={3 + columnas.length + (onEliminarPk ? 1 : 0)} style={{ padding: 16, color: muted, textAlign: "center" }}>
                        Sin filas para este filtro.
                      </td>
                    </tr>
                  ) : (
                    filasVisibles.map((f) => (
                      <tr key={`${f.pk_id}-${f.estado}-${f.maestro_id ?? "n"}`} style={{ background: rowBg(f) }}>
                        <td style={{ padding: "8px", borderBottom: `1px solid ${border}`, fontWeight: 700, verticalAlign: "top" }}>
                          {f.pk_id}
                        </td>
                        <td style={{ padding: "8px", borderBottom: `1px solid ${border}`, verticalAlign: "top" }}>
                          <span style={{ color: ESTADO_COLOR[f.estado] || muted, fontWeight: 700 }}>
                            {ESTADO_LABEL[f.estado] || f.estado}
                          </span>
                          {(f.cambios?.length ?? 0) > 0 && (
                            <div style={{ color: muted, marginTop: 4, lineHeight: 1.35 }}>
                              {f.cambios.map((c) => (
                                <div key={c.campo}>
                                  {c.campo}: {fmtVal(c.maestro)} → {fmtVal(c.csv)}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "8px", borderBottom: `1px solid ${border}`, verticalAlign: "top" }}>
                          <VinculosCell f={f} theme={badgeTheme} />
                        </td>
                        {onEliminarPk && (
                          <td style={{ padding: "8px", borderBottom: `1px solid ${border}`, verticalAlign: "top" }}>
                            {f.eliminable && (
                              <button
                                type="button"
                                disabled={eliminando}
                                title={`Eliminar PK ${f.pk_id}`}
                                onClick={() => setConfirmOne({ maestro_id: f.maestro_id, pk_id: f.pk_id })}
                                style={{
                                  background: "transparent",
                                  border: `1px solid ${danger}`,
                                  color: danger,
                                  borderRadius: 6,
                                  padding: "4px 8px",
                                  fontSize: "var(--cc-caption, 11px)",
                                  fontWeight: 700,
                                  cursor: eliminando ? "wait" : "pointer",
                                  opacity: eliminando ? 0.6 : 1,
                                }}
                              >
                                Eliminar
                              </button>
                            )}
                          </td>
                        )}
                        {columnas.map((colLabel) => {
                          const colKey = Object.entries(f.columnas || {}).find(([, v]) => v?.etiqueta === colLabel)?.[0];
                          const cell = colKey ? f.columnas[colKey] : null;
                          const cambio = (f.cambios || []).some((c) => c.campo === colLabel);
                          return (
                            <td
                              key={colLabel}
                              style={{
                                padding: "8px",
                                borderBottom: `1px solid ${border}`,
                                verticalAlign: "top",
                                background: cambio ? `color-mix(in srgb, ${sicoeColor} 12%, transparent)` : undefined,
                              }}
                            >
                              {data?.modo === "comparar" ? (
                                <>
                                  <div style={{ color: muted }}>M: {fmtVal(cell?.maestro)}</div>
                                  <div style={{ color: cambio ? sicoeColor : text, fontWeight: cambio ? 700 : 400 }}>
                                    C: {fmtVal(cell?.csv)}
                                  </div>
                                </>
                              ) : (
                                fmtVal(cell?.maestro)
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>

          <div
            style={{
              padding: "12px 20px 16px",
              borderTop: `1px solid ${border}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {onEliminarSinUso && contratoId && eliminables > 0 && (
                <button
                  type="button"
                  disabled={eliminando || loading}
                  onClick={() => setConfirmBulk(true)}
                  style={{
                    background: "transparent",
                    color: danger,
                    border: `1px solid ${danger}`,
                    borderRadius: 8,
                    padding: "8px 14px",
                    fontSize: "var(--cc-sm)",
                    fontWeight: 700,
                    cursor: eliminando ? "wait" : "pointer",
                    opacity: eliminando ? 0.6 : 1,
                  }}
                >
                  Eliminar sin uso ({eliminables})
                </button>
              )}
              {onRefresh && (
                <button
                  type="button"
                  disabled={loading || eliminando}
                  onClick={() => void onRefresh()}
                  style={{
                    background: "transparent",
                    color: primary,
                    border: `1px solid ${border}`,
                    borderRadius: 8,
                    padding: "8px 14px",
                    fontSize: "var(--cc-sm)",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Actualizar
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: primary,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "8px 18px",
                fontSize: "var(--cc-sm)",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>

      {confirmBulk && (
        <CcConfirmModal
          theme={t}
          zIndex={100040}
          tipo="danger"
          titulo="Eliminar PK sin uso"
          confirmar={eliminando ? "Eliminando…" : `Eliminar ${eliminables} PK`}
          cancelar="Cancelar"
          procesando={eliminando}
          onConfirm={() => void handleBulkDelete()}
          onCancel={() => setConfirmBulk(false)}
        >
          <p style={{ margin: "0 0 10px" }}>
            Se eliminarán {eliminables} PK del maestro que no tienen registros en SICOE ni ítems en Presupuesto.
          </p>
          <p style={{ margin: 0, fontWeight: 700, color: danger }}>
            Los PK con vínculos (badges SICOE o PPTO) no se eliminarán.
          </p>
        </CcConfirmModal>
      )}

      {confirmOne && (
        <CcConfirmModal
          theme={t}
          zIndex={100040}
          tipo="danger"
          titulo={`Eliminar PK ${confirmOne.pk_id}`}
          confirmar={eliminando ? "Eliminando…" : "Eliminar"}
          cancelar="Cancelar"
          procesando={eliminando}
          onConfirm={() => void handleOneDelete()}
          onCancel={() => setConfirmOne(null)}
        >
          <p style={{ margin: 0 }}>
            ¿Eliminar <strong>{confirmOne.pk_id}</strong> del maestro? Solo está permitido si no tiene vínculos SICOE ni Presupuesto.
          </p>
        </CcConfirmModal>
      )}
    </>
  );
}
