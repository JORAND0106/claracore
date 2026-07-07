/**
 * Alertas Desarrollador — órdenes de pago (generación mensual + seguimiento emitidas).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { buildContratoUiTheme, isDarkMode, tFrom } from "./theme/adminPanelTheme";

const LS_POSPONER_SEG = "cc_admin_alert_op_seg_posponer";
const LS_POSPONER_GEN = "cc_admin_alert_op_gen_posponer";

function bogotaTodayKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

function tomorrowBogotaKey() {
  const today = bogotaTodayKey();
  const [y, m, d] = today.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1, 12, 0, 0));
  return next.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

function loadGenPospuestoHasta() {
  try {
    const raw = localStorage.getItem(LS_POSPONER_GEN);
    if (!raw) return null;
    const today = bogotaTodayKey();
    if (raw <= today) {
      localStorage.removeItem(LS_POSPONER_GEN);
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

function saveGenPospuestoHasta(mostrarDesde) {
  localStorage.setItem(LS_POSPONER_GEN, mostrarDesde);
  return mostrarDesde;
}

function genEstaPospuesto(hasta) {
  return !!hasta && bogotaTodayKey() < hasta;
}

function loadPospuestosSeg() {
  try {
    const raw = localStorage.getItem(LS_POSPONER_SEG);
    if (!raw) return {};
    const map = JSON.parse(raw);
    if (!map || typeof map !== "object") return {};
    const today = bogotaTodayKey();
    const cleaned = {};
    for (const [id, fecha] of Object.entries(map)) {
      if (typeof fecha === "string" && fecha > today) cleaned[id] = fecha;
    }
    if (Object.keys(cleaned).length !== Object.keys(map).length) {
      localStorage.setItem(LS_POSPONER_SEG, JSON.stringify(cleaned));
    }
    return cleaned;
  } catch {
    return {};
  }
}

function savePospuestoSeg(ordenId, mostrarDesde) {
  const map = loadPospuestosSeg();
  map[String(ordenId)] = mostrarDesde;
  localStorage.setItem(LS_POSPONER_SEG, JSON.stringify(map));
  return map;
}

function filtrarOrdenesSeguimiento(ordenes, pospuestos) {
  const today = bogotaTodayKey();
  return (ordenes || []).filter((o) => {
    const fecha = pospuestos[String(o.orden_id)];
    return !fecha || today >= fecha;
  });
}

function fmtFechaCorta(iso) {
  if (!iso) return "—";
  try {
    const s = String(iso).trim().slice(0, 10);
    const [y, m, d] = s.split("-");
    if (!y || !m || !d) return s;
    return `${d}/${m}/${y}`;
  } catch {
    return String(iso);
  }
}

function fmtFechaHora(iso) {
  if (!iso) return "—";
  try {
    let s = String(iso).trim().replace(" ", "T");
    if (!/Z$/i.test(s) && !/[+-]\d{2}/.test(s) && /^\d{4}-\d{2}-\d{2}T/.test(s)) s += "Z";
    return new Date(s).toLocaleString("es-CO", {
      dateStyle: "short",
      timeStyle: "short",
      hour12: true,
      timeZone: "America/Bogota",
    });
  } catch {
    return String(iso);
  }
}

function overlayStyle(zIndex = 10050) {
  return {
    position: "fixed",
    inset: 0,
    zIndex,
    background: "rgba(5,12,18,0.88)",
    backdropFilter: "blur(6px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  };
}

function modalBox(theme, t, maxW = 920) {
  const dark = isDarkMode(theme);
  return {
    width: `min(${maxW}px, 96vw)`,
    maxHeight: "90vh",
    borderRadius: 14,
    background: dark ? "#0b1920" : t.bg,
    border: `1px solid ${t.border}`,
    boxShadow: dark ? "0 40px 100px rgba(0,0,0,0.65)" : "0 32px 64px rgba(15,23,42,0.18)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  };
}

export function ContratoOrdenesPagoAlertasDev({
  call,
  isDeveloper,
  theme = "dark",
  t: tProp = null,
  onIrAlContrato = null,
}) {
  const t = useMemo(() => tProp || tFrom(theme, null), [tProp, theme]);
  const ui = useMemo(() => buildContratoUiTheme(theme, t), [theme, t]);
  const { font } = ui;

  const [alertas, setAlertas] = useState(null);
  const [pospuestosSeg, setPospuestosSeg] = useState(() => loadPospuestosSeg());
  const [genPospuestoHasta, setGenPospuestoHasta] = useState(() => loadGenPospuestoHasta());
  const [segDismissed, setSegDismissed] = useState(false);
  const [showGen, setShowGen] = useState(false);
  const [showSeg, setShowSeg] = useState(false);
  const [msg, setMsg] = useState(null);
  const [generandoId, setGenerandoId] = useState(null);
  const [accionId, setAccionId] = useState(null);

  const cargar = useCallback(async () => {
    if (!isDeveloper) return;
    try {
      const data = await call("GET", "/admin/ordenes-pago/alertas");
      setAlertas(data);
    } catch {
      setAlertas(null);
    }
  }, [call, isDeveloper]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (!isDeveloper || !alertas) return;
    const gen = alertas.generacion_mensual;
    const seg = alertas.seguimiento;
    const segVisibles = filtrarOrdenesSeguimiento(seg?.ordenes, pospuestosSeg);
    const hayGen =
      gen?.mostrar && (gen.pendientes?.length || 0) > 0 && !genEstaPospuesto(genPospuestoHasta);

    if (hayGen) {
      setShowGen(true);
      setShowSeg(false);
      return;
    }
    setShowGen(false);
    if (seg?.mostrar && segVisibles.length > 0 && !segDismissed) {
      setShowSeg(true);
    } else {
      setShowSeg(false);
    }
  }, [alertas, isDeveloper, pospuestosSeg, genPospuestoHasta, segDismissed]);

  function cerrarGeneracion() {
    setShowGen(false);
    const seg = alertas?.seguimiento;
    const segVisibles = filtrarOrdenesSeguimiento(seg?.ordenes, pospuestosSeg);
    if (seg?.mostrar && segVisibles.length > 0 && !segDismissed) setShowSeg(true);
  }

  function posponerGeneracionParaManana() {
    const manana = tomorrowBogotaKey();
    setGenPospuestoHasta(saveGenPospuestoHasta(manana));
    setShowGen(false);
    const seg = alertas?.seguimiento;
    const segVisibles = filtrarOrdenesSeguimiento(seg?.ordenes, pospuestosSeg);
    if (seg?.mostrar && segVisibles.length > 0 && !segDismissed) setShowSeg(true);
  }

  function irAlContrato(fila) {
    if (!fila?.contrato_id || typeof onIrAlContrato !== "function") return;
    setShowGen(false);
    onIrAlContrato(fila.contrato_id);
  }

  function cerrarSeguimiento() {
    setSegDismissed(true);
    setShowSeg(false);
  }

  function posponerSegParaManana(orden) {
    const manana = tomorrowBogotaKey();
    const next = savePospuestoSeg(orden.orden_id, manana);
    setPospuestosSeg(next);
    const seg = alertas?.seguimiento;
    const restantes = filtrarOrdenesSeguimiento(seg?.ordenes, next);
    if (restantes.length === 0) setShowSeg(false);
  }

  async function generarYEnviar(fila) {
    if (!fila?.puede_enviar) {
      setMsg({ type: "error", text: "Configure correos de notificación en el contrato antes de enviar." });
      return;
    }
    setGenerandoId(fila.contrato_id);
    setMsg(null);
    try {
      await call("POST", `/admin/contratos/${fila.contrato_id}/ordenes-pago/generar`, {
        periodo_inicio: fila.periodo_inicio,
        periodo_fin: fila.periodo_fin,
        fecha_emision: fila.fecha_emision,
        fecha_vencimiento: fila.fecha_vencimiento,
      });
      await cargar();
      setMsg({ type: "success", text: `Orden generada y enviada — contrato ${fila.numero}.` });
    } catch (e) {
      await cargar();
      setMsg({ type: "error", text: e.message || "No se pudo generar y enviar." });
    } finally {
      setGenerandoId(null);
    }
  }

  async function reenviarOrden(orden) {
    setAccionId(`r-${orden.orden_id}`);
    setMsg(null);
    try {
      await call("POST", `/admin/contratos/${orden.contrato_id}/ordenes-pago/${orden.orden_id}/reenviar-correo`);
      await cargar();
      setMsg({ type: "success", text: `Correo reenviado — corte ${String(orden.numero_corte).padStart(3, "0")}.` });
    } catch (e) {
      setMsg({ type: "error", text: e.message || "No se pudo reenviar." });
    } finally {
      setAccionId(null);
    }
  }

  async function marcarAprobada(orden) {
    setAccionId(`a-${orden.orden_id}`);
    setMsg(null);
    try {
      await call("PATCH", `/admin/contratos/${orden.contrato_id}/ordenes-pago/${orden.orden_id}/estado`, {
        estado: "aprobada",
      });
      await cargar();
      setMsg({ type: "success", text: `Orden corte ${String(orden.numero_corte).padStart(3, "0")} marcada como aprobada.` });
    } catch (e) {
      setMsg({ type: "error", text: e.message || "No se pudo actualizar el estado." });
    } finally {
      setAccionId(null);
    }
  }

  if (!isDeveloper) return null;

  const pendientesGen = alertas?.generacion_mensual?.pendientes || [];
  const ordenesSeg = filtrarOrdenesSeguimiento(alertas?.seguimiento?.ordenes, pospuestosSeg);

  const th = {
    textAlign: "left",
    padding: "8px 10px",
    color: ui.textMuted,
    fontSize: font.caption,
    textTransform: "uppercase",
    borderBottom: `1px solid ${ui.border}`,
    fontWeight: 700,
  };
  const td = {
    padding: "8px 10px",
    borderBottom: `1px solid ${ui.border}`,
    color: ui.text,
    fontSize: font.sm,
    verticalAlign: "middle",
  };

  const btnPrimary = {
    background: ui.primary,
    border: "none",
    borderRadius: 6,
    padding: "6px 12px",
    color: "#fff",
    fontWeight: 700,
    fontSize: font.caption,
    cursor: "pointer",
  };
  const btnGhost = (color = ui.textMuted) => ({
    background: "transparent",
    border: `1px solid ${ui.border}`,
    borderRadius: 6,
    padding: "6px 10px",
    color,
    fontSize: font.caption,
    cursor: "pointer",
  });

  return createPortal(
    <>
      {showGen && pendientesGen.length > 0 && (
        <div style={overlayStyle()} onClick={(e) => e.target === e.currentTarget && cerrarGeneracion()}>
          <div style={modalBox(theme, t)} onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                padding: "16px 20px",
                borderBottom: `1px solid ${ui.border}`,
                background: `${ui.primary}18`,
              }}
            >
              <div style={{ fontSize: font.title, fontWeight: 700, color: ui.primary }}>
                Órdenes de pago pendientes de generar
              </div>
              <div style={{ fontSize: font.sm, color: ui.textMuted, marginTop: 6, lineHeight: 1.45 }}>
                Primeros 7 días del mes — contratos con licenciamiento listo y sin orden del período sugerido.
              </div>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "12px 16px" }}>
              {msg && (
                <div
                  style={{
                    marginBottom: 10,
                    padding: "8px 12px",
                    borderRadius: 8,
                    fontSize: font.sm,
                    background: msg.type === "error" ? ui.errorBg : ui.successBg,
                    color: msg.type === "error" ? ui.errorText : ui.successText,
                  }}
                >
                  {msg.text}
                </div>
              )}
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Contrato", "Período sugerido", "Vencimiento", ""].map((h) => (
                      <th key={h || "acc"} style={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pendientesGen.map((f) => (
                    <tr key={f.contrato_id}>
                      <td style={td}>
                        <div style={{ fontWeight: 700 }}>{f.numero}</div>
                        {f.nombre && f.nombre !== f.numero && (
                          <div style={{ fontSize: font.caption, color: ui.textMuted, marginTop: 2 }}>{f.nombre}</div>
                        )}
                      </td>
                      <td style={{ ...td, color: ui.textMuted }}>
                        {fmtFechaCorta(f.periodo_inicio)} — {fmtFechaCorta(f.periodo_fin)}
                      </td>
                      <td style={td}>{fmtFechaCorta(f.fecha_vencimiento)}</td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" }}>
                          {typeof onIrAlContrato === "function" && (
                            <button
                              type="button"
                              disabled={generandoId != null}
                              onClick={() => irAlContrato(f)}
                              style={btnGhost(ui.primary)}
                            >
                              Ir al contrato
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={generandoId != null}
                            onClick={() => void generarYEnviar(f)}
                            style={{
                              ...btnPrimary,
                              opacity: generandoId === f.contrato_id ? 0.7 : f.puede_enviar ? 1 : 0.55,
                              cursor: generandoId != null ? "wait" : "pointer",
                            }}
                            title={f.puede_enviar ? "" : "Configure correos de notificación en el contrato"}
                          >
                            {generandoId === f.contrato_id ? "Enviando…" : "Generar y enviar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div
              style={{
                padding: "12px 16px",
                borderTop: `1px solid ${ui.border}`,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <button type="button" onClick={posponerGeneracionParaManana} style={btnGhost()}>
                Posponer para mañana
              </button>
              <button type="button" onClick={cerrarGeneracion} style={btnGhost(ui.primary)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {showSeg && !showGen && ordenesSeg.length > 0 && (
        <div style={overlayStyle(10049)} onClick={(e) => e.target === e.currentTarget && cerrarSeguimiento()}>
          <div style={modalBox(theme, t)} onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                padding: "16px 20px",
                borderBottom: `1px solid ${ui.border}`,
                background: `${ui.warnText}15`,
              }}
            >
              <div style={{ fontSize: font.title, fontWeight: 700, color: ui.warnText }}>
                Seguimiento — órdenes emitidas sin respuesta
              </div>
              <div style={{ fontSize: font.sm, color: ui.textMuted, marginTop: 6, lineHeight: 1.45 }}>
                Órdenes en estado Emitida con más de 24 horas desde el último envío por correo.
              </div>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "12px 16px" }}>
              {msg && (
                <div
                  style={{
                    marginBottom: 10,
                    padding: "8px 12px",
                    borderRadius: 8,
                    fontSize: font.sm,
                    background: msg.type === "error" ? ui.errorBg : ui.successBg,
                    color: msg.type === "error" ? ui.errorText : ui.successText,
                  }}
                >
                  {msg.text}
                </div>
              )}
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Contrato", "Corte", "Último envío", "Acciones"].map((h) => (
                      <th key={h} style={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ordenesSeg.map((o) => (
                    <tr key={o.orden_id}>
                      <td style={td}>
                        <div style={{ fontWeight: 700 }}>{o.numero_contrato}</div>
                        {o.nombre_contrato && (
                          <div style={{ fontSize: font.caption, color: ui.textMuted, marginTop: 2 }}>
                            {o.nombre_contrato}
                          </div>
                        )}
                      </td>
                      <td style={td}>{String(o.numero_corte).padStart(3, "0")}</td>
                      <td style={{ ...td, color: ui.textMuted }}>{fmtFechaHora(o.ultimo_envio_at)}</td>
                      <td style={td}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          <button
                            type="button"
                            disabled={accionId != null}
                            onClick={() => void reenviarOrden(o)}
                            style={{ ...btnGhost(ui.warnText), fontWeight: 700 }}
                          >
                            {accionId === `r-${o.orden_id}` ? "…" : "Reenviar"}
                          </button>
                          <button
                            type="button"
                            disabled={accionId != null}
                            onClick={() => void marcarAprobada(o)}
                            style={{ ...btnGhost("#10B981"), fontWeight: 700 }}
                          >
                            {accionId === `a-${o.orden_id}` ? "…" : "Marcar como aprobada"}
                          </button>
                          <button
                            type="button"
                            disabled={accionId != null}
                            onClick={() => posponerSegParaManana(o)}
                            style={btnGhost()}
                            title="No mostrar en esta alerta hasta mañana"
                          >
                            Posponer para mañana
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "12px 16px", borderTop: `1px solid ${ui.border}`, textAlign: "right" }}>
              <button type="button" onClick={cerrarSeguimiento} style={btnGhost(ui.primary)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
