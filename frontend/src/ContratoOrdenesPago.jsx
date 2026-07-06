/**
 * Órdenes de pago — licenciamiento ClaraCore (solo Desarrollador).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE } from "./apiBase";
import { formatCOP } from "./utils/formatCOP";
import CcConfirmModal from "./components/CcConfirmModal";
import CcDatePickerInput, { normalizeDateInputValue } from "./components/CcDatePickerInput";
import { ContratoDocumentosPanel } from "./ContratoDocumentosContractuales";
import { buildContratoUiTheme, CC_TYPO } from "./theme/adminPanelTheme";

const ORDEN_ESTADOS = [
  { id: "emitida", label: "Emitida", color: "#00afc5" },
  { id: "aprobada", label: "Aprobada", color: "#10B981" },
  { id: "facturada", label: "Facturada", color: "#6366F1" },
  { id: "anulada", label: "Anulada", color: "#94a3b8" },
];

const CONFIG_VACIO = {
  plan_descripcion: "",
  tipo_periodo: "mensual",
  dia_vencimiento: "7",
  logo_receptor: "contratista",
  autorizo_usuario_id: "",
  autorizo_nombre: "",
  autorizo_cargo: "",
  correos_notificacion: [],
};

const PERIODO_VACIO = {
  periodo_inicio: "",
  periodo_fin: "",
  fecha_emision: "",
  fecha_vencimiento: "",
  descripcion_servicio: "",
};

const inp = {
  width: "100%",
  background: "#0a1628",
  border: "1.5px solid #1E3A5F",
  borderRadius: 8,
  padding: "9px 12px",
  color: "#E0F2FE",
  fontSize: CC_TYPO.input,
  outline: "none",
  boxSizing: "border-box",
  marginBottom: 10,
};
const lbl = {
  fontSize: CC_TYPO.label,
  fontWeight: 700,
  color: "#4a7a87",
  letterSpacing: 1,
  display: "block",
  marginBottom: 4,
};

function fmtFecha(iso) {
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

function estadoOrdenMeta(id) {
  return ORDEN_ESTADOS.find((e) => e.id === id) || ORDEN_ESTADOS[0];
}

async function fetchAutenticado(token, path, init = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    let msg = "Error del servidor";
    if (typeof err.detail === "string") msg = err.detail;
    else if (Array.isArray(err.detail)) msg = err.detail.map((e) => e.msg).join(", ");
    throw new Error(msg);
  }
  return res;
}

async function descargarOrden(token, contratoId, ordenId, { inline = false, nombre } = {}) {
  const res = await fetchAutenticado(
    token,
    `/admin/contratos/${contratoId}/ordenes-pago/${ordenId}/archivo?inline=${inline ? "1" : "0"}`,
  );
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  if (inline) {
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre || `orden_pago_${ordenId}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

function configAFormulario(cfg) {
  const correos = Array.isArray(cfg?.correos_notificacion) ? cfg.correos_notificacion : [];
  return {
    plan_descripcion: cfg?.plan_descripcion ?? "",
    tipo_periodo: cfg?.tipo_periodo || "mensual",
    dia_vencimiento: cfg?.dia_vencimiento != null ? String(cfg.dia_vencimiento) : "7",
    logo_receptor: cfg?.logo_receptor || "contratista",
    autorizo_usuario_id: cfg?.autorizo_usuario_id != null ? String(cfg.autorizo_usuario_id) : "",
    autorizo_nombre: cfg?.autorizo_nombre ?? "",
    autorizo_cargo: cfg?.autorizo_cargo ?? "",
    correos_notificacion: correos,
  };
}

function nombreUsuario(u) {
  return `${u?.nombre || ""} ${u?.apellidos || ""}`.trim() || u?.email || `Usuario #${u?.id}`;
}

function correoValido(email) {
  const e = (email || "").trim();
  return e.length > 3 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
}

function periodoDesdeSugerencia(sug, descServicio) {
  if (!sug) return { ...PERIODO_VACIO, descripcion_servicio: descServicio || "" };
  return {
    periodo_inicio: normalizeDateInputValue(sug.periodo_inicio),
    periodo_fin: normalizeDateInputValue(sug.periodo_fin),
    fecha_emision: normalizeDateInputValue(sug.fecha_emision),
    fecha_vencimiento: normalizeDateInputValue(sug.fecha_vencimiento),
    descripcion_servicio: descServicio || "",
  };
}

/** Panel de órdenes de pago en detalle de contrato. */
export function ContratoOrdenesPagoPanel({
  call,
  token,
  contratoId,
  contratoNumero,
  embedded = false,
  uiTheme = null,
  theme = "dark",
  t: tProp = null,
}) {
  const ui = useMemo(() => uiTheme || buildContratoUiTheme(theme, tProp), [uiTheme, theme, tProp]);
  const { inp, lbl, confirmTheme, font } = ui;
  const cardStyle = {
    marginBottom: 16,
    padding: 12,
    background: ui.bg,
    border: `1px solid ${ui.border}`,
    borderRadius: 8,
    fontSize: font.body,
    color: ui.text,
    lineHeight: 1.6,
  };

  const [resumen, setResumen] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [cfgForm, setCfgForm] = useState(CONFIG_VACIO);
  const [nuevoCorreo, setNuevoCorreo] = useState("");
  const [periodoForm, setPeriodoForm] = useState(PERIODO_VACIO);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [guardandoCfg, setGuardandoCfg] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [confirmGenerar, setConfirmGenerar] = useState(null);
  const [confirmEliminar, setConfirmEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);

  const cargar = useCallback(async () => {
    if (!contratoId) return;
    setLoading(true);
    try {
      const [data, users] = await Promise.all([
        call("GET", `/admin/contratos/${contratoId}/ordenes-pago`),
        call("GET", "/admin/todos-usuarios").catch(() => []),
      ]);
      setResumen(data);
      setUsuarios(Array.isArray(users) ? users.filter((u) => u.activo !== false) : []);
      const cfg = configAFormulario(data?.config);
      setCfgForm(cfg);
      setPeriodoForm(periodoDesdeSugerencia(data?.sugerencia_periodo, cfg.plan_descripcion));
    } catch (e) {
      setMsg({ type: "error", text: e.message || "No se pudo cargar órdenes de pago" });
    } finally {
      setLoading(false);
    }
  }, [call, contratoId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  function seleccionarAutorizador(userId) {
    if (!userId) {
      setCfgForm((f) => ({
        ...f,
        autorizo_usuario_id: "",
        autorizo_nombre: "",
        autorizo_cargo: "",
      }));
      return;
    }
    const u = usuarios.find((x) => String(x.id) === String(userId));
    if (!u) return;
    setCfgForm((f) => ({
      ...f,
      autorizo_usuario_id: String(userId),
      autorizo_nombre: nombreUsuario(u),
      autorizo_cargo: u.cargo_nombre || "",
    }));
  }

  function agregarCorreo() {
    const email = nuevoCorreo.trim().toLowerCase();
    if (!correoValido(email)) {
      setMsg({ type: "error", text: "Indique un correo electrónico válido." });
      return;
    }
    if (cfgForm.correos_notificacion.some((c) => c.toLowerCase() === email)) {
      setMsg({ type: "error", text: "Ese correo ya está en la lista." });
      return;
    }
    setCfgForm((f) => ({ ...f, correos_notificacion: [...f.correos_notificacion, email] }));
    setNuevoCorreo("");
    setMsg(null);
  }

  function quitarCorreo(email) {
    setCfgForm((f) => ({
      ...f,
      correos_notificacion: f.correos_notificacion.filter((c) => c !== email),
    }));
  }

  async function guardarConfig() {
    setGuardandoCfg(true);
    setMsg(null);
    try {
      const body = {
        plan_descripcion: cfgForm.plan_descripcion.trim() || null,
        tipo_periodo: cfgForm.tipo_periodo,
        dia_vencimiento: Number(cfgForm.dia_vencimiento) || 7,
        logo_receptor: cfgForm.logo_receptor,
        autorizo_usuario_id: cfgForm.autorizo_usuario_id ? Number(cfgForm.autorizo_usuario_id) : null,
        autorizo_nombre: cfgForm.autorizo_nombre.trim() || null,
        autorizo_cargo: cfgForm.autorizo_cargo.trim() || null,
        correos_notificacion: cfgForm.correos_notificacion,
      };
      await call("PUT", `/admin/contratos/${contratoId}/ordenes-pago/config`, body);
      await cargar();
      setMsg({ type: "success", text: "Configuración de cobro guardada." });
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setGuardandoCfg(false);
    }
  }

  function solicitarGenerar() {
    if (!resumen?.validacion_generacion?.listo) {
      setMsg({
        type: "error",
        text: "Complete licenciatario (razón social, NIT, valor mensual > 0) y objeto del contrato en Documentos contractuales.",
      });
      return;
    }
    if (!periodoForm.periodo_inicio || !periodoForm.periodo_fin || !periodoForm.fecha_vencimiento) {
      setMsg({ type: "error", text: "Indique período de corte y fecha de vencimiento." });
      return;
    }
    setConfirmGenerar({
      periodo: { ...periodoForm },
      montos: resumen?.montos_preview,
      cartera: resumen?.saldo_cartera ?? 0,
      proximoCorte: resumen?.sugerencia_periodo?.proximo_numero_corte,
    });
  }

  async function generarOrden(payload) {
    setGenerando(true);
    setMsg(null);
    try {
      const body = {
        periodo_inicio: normalizeDateInputValue(payload.periodo_inicio),
        periodo_fin: normalizeDateInputValue(payload.periodo_fin),
        fecha_emision: normalizeDateInputValue(payload.fecha_emision) || undefined,
        fecha_vencimiento: normalizeDateInputValue(payload.fecha_vencimiento),
        descripcion_servicio: (payload.descripcion_servicio || "").trim() || null,
      };
      if (!body.periodo_inicio || !body.periodo_fin || !body.fecha_vencimiento) {
        throw new Error("Indique período de corte y fecha de vencimiento.");
      }
      const data = await call("POST", `/admin/contratos/${contratoId}/ordenes-pago/generar`, body);
      setConfirmGenerar(null);
      await cargar();
      const corte = data?.orden?.numero_corte;
      setMsg({
        type: "success",
        text: corte
          ? `Orden de pago generada — corte N.° ${String(corte).padStart(3, "0")}.`
          : "Orden de pago generada correctamente.",
      });
    } catch (e) {
      setMsg({ type: "error", text: e.message || "No se pudo generar la orden de pago." });
    } finally {
      setGenerando(false);
    }
  }

  async function confirmarGeneracion() {
    if (!confirmGenerar?.periodo) return;
    await generarOrden(confirmGenerar.periodo);
  }

  async function cambiarEstadoOrden(ordenId, nuevoEstado) {
    setCambiandoEstado(true);
    setMsg(null);
    try {
      await call("PATCH", `/admin/contratos/${contratoId}/ordenes-pago/${ordenId}/estado`, {
        estado: nuevoEstado,
      });
      await cargar();
      setMsg({
        type: "success",
        text: `Estado actualizado a «${estadoOrdenMeta(nuevoEstado).label}».`,
      });
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setCambiandoEstado(false);
    }
  }

  function maxCorteLocal() {
    const lista = resumen?.historial || [];
    if (!lista.length) return 0;
    return Math.max(...lista.map((o) => Number(o.numero_corte) || 0));
  }

  function solicitarEliminarOrden(orden) {
    const maxC = maxCorteLocal();
    setConfirmEliminar({
      orden,
      esMax: Number(orden.numero_corte) === maxC,
    });
  }

  async function ejecutarEliminarOrden() {
    if (!confirmEliminar?.orden) return;
    const { orden } = confirmEliminar;
    setEliminando(true);
    setMsg(null);
    try {
      const data = await call("DELETE", `/admin/contratos/${contratoId}/ordenes-pago/${orden.id}`);
      setConfirmEliminar(null);
      await cargar();
      const corte = String(data?.numero_corte ?? orden.numero_corte).padStart(3, "0");
      setMsg({
        type: "success",
        text: data?.consecutivo_liberado
          ? `Orden corte N.° ${corte} eliminada. El consecutivo quedó libre para reutilizarse.`
          : `Orden corte N.° ${corte} eliminada. El consecutivo queda como hueco no reutilizable.`,
      });
    } catch (e) {
      setMsg({ type: "error", text: e.message || "No se pudo eliminar la orden de pago" });
    } finally {
      setEliminando(false);
    }
  }

  const montos = resumen?.montos_preview;
  const ivaEtiqueta = resumen?.iva_porcentaje_etiqueta || "19%";
  const listo = !!resumen?.validacion_generacion?.listo;
  const historial = resumen?.historial || [];

  return (
    <div
      style={
        embedded
          ? undefined
          : {
              marginTop: 20,
              paddingTop: 20,
              borderTop: `1px solid ${ui.border}`,
            }
      }
    >
      <div style={{ fontSize: font.title, fontWeight: 700, color: ui.primary, marginBottom: 4 }}>
        💳 Órdenes de pago
      </div>
      <div style={{ fontSize: font.caption, color: ui.textMuted, marginBottom: 14, lineHeight: 1.45 }}>
        Cortes de cobro por licenciamiento — {contratoNumero ? `contrato ${contratoNumero}` : `ID ${contratoId}`}.
        Solo Desarrollador.
      </div>

      {loading ? (
        <div style={{ color: ui.textMuted, fontSize: font.body }}>Cargando órdenes de pago…</div>
      ) : (
        <>
          {!listo && (
            <div
              style={{
                background: ui.warnBg,
                color: ui.warnText,
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: font.sm,
                marginBottom: 12,
                lineHeight: 1.45,
              }}
            >
              Antes de generar, complete en «Documentos contractuales»: razón social y NIT del licenciatario, valor
              mensual mayor a cero y objeto del contrato.
            </div>
          )}

          {msg && (
            <div
              style={{
                background: msg.type === "error" ? ui.errorBg : ui.successBg,
                color: msg.type === "error" ? ui.errorText : ui.successText,
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: font.body,
                marginBottom: 12,
              }}
            >
              {msg.text}
            </div>
          )}

          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: font.body, fontWeight: 700, color: ui.text, marginBottom: 10 }}>
                Configuración de cobro
              </div>

              <label style={lbl}>DESCRIPCIÓN DEL PLAN / SERVICIO (PDF)</label>
              <textarea
                style={{ ...inp, minHeight: 56, resize: "vertical", marginBottom: 12 }}
                value={cfgForm.plan_descripcion}
                onChange={(e) => {
                  const v = e.target.value;
                  setCfgForm((f) => ({ ...f, plan_descripcion: v }));
                  setPeriodoForm((p) => ({ ...p, descripcion_servicio: v }));
                }}
              />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  gap: "0 16px",
                  marginBottom: 12,
                }}
              >
                <div>
                  <label style={lbl}>TIPO DE PERÍODO</label>
                  <select
                    style={inp}
                    value={cfgForm.tipo_periodo}
                    onChange={(e) => setCfgForm((f) => ({ ...f, tipo_periodo: e.target.value }))}
                  >
                    <option value="mensual">Mensual</option>
                    <option value="quincenal">Quincenal</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>DÍA DE VENCIMIENTO</label>
                  <input
                    style={inp}
                    type="number"
                    min="1"
                    max="28"
                    value={cfgForm.dia_vencimiento}
                    onChange={(e) => setCfgForm((f) => ({ ...f, dia_vencimiento: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={lbl}>LOGO RECEPTOR</label>
                  <select
                    style={inp}
                    value={cfgForm.logo_receptor}
                    onChange={(e) => setCfgForm((f) => ({ ...f, logo_receptor: e.target.value }))}
                  >
                    <option value="contratista">Contratista</option>
                    <option value="interventoria">Interventoría</option>
                    <option value="ninguno">Ninguno</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>AUTORIZA (USUARIO)</label>
                  <select
                    style={inp}
                    value={cfgForm.autorizo_usuario_id}
                    onChange={(e) => seleccionarAutorizador(e.target.value)}
                  >
                    <option value="">— Seleccionar usuario —</option>
                    {usuarios.map((u) => (
                      <option key={u.id} value={String(u.id)}>
                        {nombreUsuario(u)}
                        {u.cargo_nombre ? ` · ${u.cargo_nombre}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0 16px",
                  marginBottom: 12,
                }}
              >
                <div>
                  <label style={lbl}>NOMBRE EN PDF</label>
                  <input style={{ ...inp, opacity: 0.85 }} value={cfgForm.autorizo_nombre} readOnly placeholder="Se completa al seleccionar usuario" />
                </div>
                <div>
                  <label style={lbl}>CARGO EN PDF</label>
                  <input style={{ ...inp, opacity: 0.85 }} value={cfgForm.autorizo_cargo} readOnly placeholder="Se completa al seleccionar usuario" />
                </div>
              </div>

              <label style={lbl}>CORREOS DE NOTIFICACIÓN</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <input
                  style={{ ...inp, flex: "1 1 220px", marginBottom: 0 }}
                  type="email"
                  placeholder="correo@empresa.com"
                  value={nuevoCorreo}
                  onChange={(e) => setNuevoCorreo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      agregarCorreo();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={agregarCorreo}
                  style={{
                    background: ui.cardSubtle,
                    border: `1px solid ${ui.tabBorderActive}`,
                    borderRadius: 8,
                    padding: "8px 14px",
                    color: ui.primary,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontSize: font.sm,
                    flexShrink: 0,
                  }}
                >
                  Agregar
                </button>
              </div>
              {cfgForm.correos_notificacion.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                  {cfgForm.correos_notificacion.map((email) => (
                    <span
                      key={email}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 10px",
                        borderRadius: 16,
                        background: ui.cardSubtle,
                        border: `1px solid ${ui.border}`,
                        fontSize: font.caption,
                        color: ui.text,
                      }}
                    >
                      {email}
                      <button
                        type="button"
                        onClick={() => quitarCorreo(email)}
                        style={{
                          background: "none",
                          border: "none",
                          color: ui.errorText,
                          cursor: "pointer",
                          fontSize: font.caption,
                          padding: 0,
                          lineHeight: 1,
                        }}
                        title="Quitar correo"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: font.caption, color: ui.textMuted, marginBottom: 12 }}>
                  Sin correos registrados. Se usarán en un paso posterior para el envío automático.
                </div>
              )}

              <button
                type="button"
                disabled={guardandoCfg}
                onClick={() => void guardarConfig()}
                style={{
                  background: ui.cardSubtle,
                  border: `1px solid ${ui.tabBorderActive}`,
                  borderRadius: 8,
                  padding: "8px 16px",
                  color: ui.primary,
                  fontWeight: 700,
                  cursor: guardandoCfg ? "wait" : "pointer",
                  fontSize: font.sm,
                }}
              >
                {guardandoCfg ? "Guardando…" : "Guardar configuración"}
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
                gap: 20,
                marginBottom: 20,
                alignItems: "start",
              }}
            >
              <div>
                <div style={{ fontSize: font.body, fontWeight: 700, color: ui.text, marginBottom: 10 }}>
                  Próximo corte
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: "0 16px",
                  }}
                >
                  <div>
                    <label style={lbl}>PERÍODO INICIO</label>
                    <CcDatePickerInput
                      style={inp}
                      value={periodoForm.periodo_inicio}
                      onChange={(v) => setPeriodoForm((p) => ({ ...p, periodo_inicio: v }))}
                      aria-label="Período inicio"
                    />
                  </div>
                  <div>
                    <label style={lbl}>PERÍODO FIN</label>
                    <CcDatePickerInput
                      style={inp}
                      value={periodoForm.periodo_fin}
                      onChange={(v) => setPeriodoForm((p) => ({ ...p, periodo_fin: v }))}
                      aria-label="Período fin"
                    />
                  </div>
                  <div>
                    <label style={lbl}>FECHA EMISIÓN</label>
                    <CcDatePickerInput
                      style={inp}
                      value={periodoForm.fecha_emision}
                      onChange={(v) => setPeriodoForm((p) => ({ ...p, fecha_emision: v }))}
                      aria-label="Fecha de emisión"
                    />
                  </div>
                  <div>
                    <label style={lbl}>FECHA VENCIMIENTO</label>
                    <CcDatePickerInput
                      style={inp}
                      value={periodoForm.fecha_vencimiento}
                      onChange={(v) => setPeriodoForm((p) => ({ ...p, fecha_vencimiento: v }))}
                      aria-label="Fecha de vencimiento"
                    />
                  </div>
                </div>
                <label style={lbl}>DESCRIPCIÓN EN ESTE CORTE (opcional)</label>
                <input
                  style={inp}
                  value={periodoForm.descripcion_servicio}
                  onChange={(e) => setPeriodoForm((p) => ({ ...p, descripcion_servicio: e.target.value }))}
                />
                <button
                  type="button"
                  disabled={generando}
                  onClick={solicitarGenerar}
                  style={{
                    background: ui.primary,
                    border: "none",
                    borderRadius: 8,
                    padding: "10px 18px",
                    color: "#fff",
                    fontWeight: 700,
                    cursor: generando ? "wait" : "pointer",
                    opacity: generando || !listo ? 0.65 : 1,
                    fontSize: font.body,
                  }}
                >
                  {generando ? "Generando PDF…" : "Generar orden de pago"}
                </button>
              </div>

              <div>
                <div style={{ fontSize: font.body, fontWeight: 700, color: ui.text, marginBottom: 12 }}>
                  Vista previa de montos
                </div>
                <div style={{ ...cardStyle, marginBottom: 0 }}>
                  {montos ? (
                    <>
                      <div>Subtotal licencia: {formatCOP(montos.subtotal)}</div>
                      <div>
                        IVA ({ivaEtiqueta}): {formatCOP(montos.iva_valor)}
                      </div>
                      <div>Total período: {formatCOP(montos.total)}</div>
                      <div style={{ color: ui.warnText }}>
                        Cartera pendiente: {formatCOP(resumen?.saldo_cartera ?? 0)}
                      </div>
                      <div style={{ fontWeight: 700, color: ui.primary, marginTop: 6 }}>
                        Total a pagar (este corte): {formatCOP(montos.total)}
                      </div>
                      {resumen?.sugerencia_periodo?.proximo_numero_corte != null && (
                        <div style={{ marginTop: 8, color: ui.textMuted, fontSize: font.caption }}>
                          Próximo corte N.° {String(resumen.sugerencia_periodo.proximo_numero_corte).padStart(3, "0")}
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ color: ui.textMuted }}>Sin valor mensual válido para calcular montos.</div>
                  )}
                </div>
              </div>
            </div>

            <div>
              <div style={{ fontSize: font.body, fontWeight: 700, color: ui.text, marginBottom: 8 }}>
                Historial de órdenes
              </div>
              {historial.length === 0 ? (
                <div style={{ fontSize: font.sm, color: ui.textMuted }}>Aún no hay órdenes generadas.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: font.caption, tableLayout: "fixed" }}>
                    <colgroup>
                      <col style={{ width: "8%" }} />
                      <col style={{ width: "22%" }} />
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "44%" }} />
                    </colgroup>
                    <thead>
                      <tr>
                        {["Corte", "Período", "Total", "Estado", "Acciones"].map((h) => (
                          <th
                            key={h}
                            style={{
                              textAlign: "left",
                              color: ui.textMuted,
                              padding: "6px 8px",
                              borderBottom: `1px solid ${ui.border}`,
                              fontSize: font.caption,
                              textTransform: "uppercase",
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {historial.map((o) => {
                        const est = estadoOrdenMeta(o.estado);
                        return (
                          <tr key={o.id}>
                            <td style={{ padding: "8px", color: ui.text, borderBottom: `1px solid ${ui.border}`, verticalAlign: "top" }}>
                              {String(o.numero_corte).padStart(3, "0")}
                            </td>
                            <td style={{ padding: "8px", color: ui.textMuted, borderBottom: `1px solid ${ui.border}`, verticalAlign: "top" }}>
                              {fmtFechaCorta(o.periodo_inicio)} — {fmtFechaCorta(o.periodo_fin)}
                            </td>
                            <td style={{ padding: "8px", color: ui.text, borderBottom: `1px solid ${ui.border}`, verticalAlign: "top" }}>
                              {formatCOP(o.total ?? o.total_a_pagar)}
                            </td>
                            <td style={{ padding: "8px", borderBottom: `1px solid ${ui.border}`, verticalAlign: "top" }}>
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "2px 8px",
                                  borderRadius: 10,
                                  fontSize: font.caption,
                                  fontWeight: 700,
                                  background: `${est.color}22`,
                                  color: est.color,
                                  border: `1px solid ${est.color}55`,
                                }}
                              >
                                {est.label}
                              </span>
                            </td>
                            <td style={{ padding: "8px", borderBottom: `1px solid ${ui.border}`, verticalAlign: "top" }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void descargarOrden(token, contratoId, o.id, {
                                        inline: true,
                                        nombre: o.nombre_archivo,
                                      })
                                    }
                                    style={{
                                      background: ui.cardSubtle,
                                      border: `1px solid ${ui.tabBorderActive}`,
                                      borderRadius: 5,
                                      padding: "3px 8px",
                                      color: ui.primary,
                                      fontSize: font.caption,
                                      cursor: "pointer",
                                    }}
                                  >
                                    Ver
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void descargarOrden(token, contratoId, o.id, { nombre: o.nombre_archivo })
                                    }
                                    style={{
                                      background: "transparent",
                                      border: `1px solid ${ui.border}`,
                                      borderRadius: 5,
                                      padding: "3px 8px",
                                      color: ui.textMuted,
                                      fontSize: font.caption,
                                      cursor: "pointer",
                                    }}
                                  >
                                    PDF
                                  </button>
                                  <button
                                    type="button"
                                    disabled={eliminando || cambiandoEstado}
                                    onClick={() => solicitarEliminarOrden(o)}
                                    style={{
                                      background: `${ui.errorText}15`,
                                      border: `1px solid ${ui.errorText}55`,
                                      borderRadius: 5,
                                      padding: "3px 8px",
                                      color: ui.errorText,
                                      fontSize: font.caption,
                                      cursor: eliminando ? "wait" : "pointer",
                                    }}
                                  >
                                    Eliminar
                                  </button>
                                </div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                  {ORDEN_ESTADOS.filter((e) => e.id !== o.estado).map((e) => (
                                    <button
                                      key={e.id}
                                      type="button"
                                      disabled={cambiandoEstado}
                                      onClick={() => void cambiarEstadoOrden(o.id, e.id)}
                                      title={`Marcar como ${e.label}`}
                                      style={{
                                        background: "transparent",
                                        border: `1px solid ${e.color}44`,
                                        borderRadius: 5,
                                        padding: "3px 6px",
                                        color: e.color,
                                        fontSize: font.caption,
                                        cursor: cambiandoEstado ? "wait" : "pointer",
                                      }}
                                    >
                                      {e.label}
                                    </button>
                                  ))}
                                </div>
                                <div style={{ fontSize: font.caption, color: ui.textMuted }}>{fmtFecha(o.created_at)}</div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {confirmGenerar && (
        <CcConfirmModal
          theme={confirmTheme}
          titulo="Generar orden de pago"
          tipo="info"
          confirmar="Generar PDF"
          cancelar="Cancelar"
          procesando={generando}
          onCancel={() => {
            if (!generando) setConfirmGenerar(null);
          }}
          onConfirm={confirmarGeneracion}
        >
          <div style={{ fontSize: font.body, lineHeight: 1.55, color: confirmTheme.textMuted }}>
            <p style={{ margin: "0 0 10px 0" }}>
              Corte N.°{" "}
              <strong style={{ color: confirmTheme.text }}>
                {confirmGenerar.proximoCorte != null
                  ? String(confirmGenerar.proximoCorte).padStart(3, "0")
                  : "—"}
              </strong>
            </p>
            <p style={{ margin: "0 0 6px 0" }}>
              Período: {fmtFechaCorta(confirmGenerar.periodo.periodo_inicio)} —{" "}
              {fmtFechaCorta(confirmGenerar.periodo.periodo_fin)}
            </p>
            <p style={{ margin: "0 0 6px 0" }}>
              Vencimiento: {fmtFechaCorta(confirmGenerar.periodo.fecha_vencimiento)}
            </p>
            {confirmGenerar.montos && (
              <p style={{ margin: "10px 0 0 0", color: confirmTheme.text }}>
                Total a pagar (este corte):{" "}
                <strong>{formatCOP(confirmGenerar.montos.total)}</strong>
                {confirmGenerar.cartera > 0 && (
                  <span style={{ display: "block", fontSize: font.sm, color: confirmTheme.textMuted, marginTop: 4 }}>
                    Cartera pendiente de cortes anteriores (informativo): {formatCOP(confirmGenerar.cartera)}
                  </span>
                )}
              </p>
            )}
          </div>
        </CcConfirmModal>
      )}
      {confirmEliminar && (
        <CcConfirmModal
          theme={confirmTheme}
          titulo="Eliminar orden de pago"
          tipo="danger"
          confirmar="Eliminar orden"
          cancelar="Cancelar"
          procesando={eliminando}
          onCancel={() => {
            if (!eliminando) setConfirmEliminar(null);
          }}
          onConfirm={() => void ejecutarEliminarOrden()}
        >
          <p style={{ margin: "0 0 10px 0", color: confirmTheme.text }}>
            ¿Eliminar la orden de pago corte N.°{" "}
            <strong>{String(confirmEliminar.orden.numero_corte).padStart(3, "0")}</strong>?
          </p>
          <p style={{ margin: 0, color: confirmTheme.textMuted, lineHeight: 1.5 }}>
            {confirmEliminar.esMax
              ? `Es el consecutivo máximo actual: al eliminarla, el corte N.° ${String(confirmEliminar.orden.numero_corte).padStart(3, "0")} quedará libre para reutilizarse.`
              : `No es el consecutivo máximo: al eliminarla, el corte N.° ${String(confirmEliminar.orden.numero_corte).padStart(3, "0")} quedará como hueco no reutilizable (existen cortes posteriores).`}
          </p>
        </CcConfirmModal>
      )}
    </div>
  );
}

const TABS_LICENCIA = [
  { id: "documentos", label: "Documentos contractuales" },
  { id: "ordenes", label: "Órdenes de pago" },
];

/** Pestañas Documentos contractuales | Órdenes de pago (Desarrollador). */
export function ContratoLicenciaDevPanel({ call, token, contratoId, contratoNumero }) {
  const [tab, setTab] = useState("documentos");

  return (
    <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid rgba(0,175,197,0.25)" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {TABS_LICENCIA.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              background: tab === t.id ? "rgba(0,175,197,0.2)" : "transparent",
              border: `1px solid ${tab === t.id ? "rgba(0,175,197,0.55)" : "rgba(0,175,197,0.25)"}`,
              borderRadius: 8,
              padding: "8px 16px",
              color: tab === t.id ? "#00afc5" : "#8acdd8",
              fontSize: font.sm,
              fontWeight: tab === t.id ? 700 : 500,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "documentos" && (
        <ContratoDocumentosPanel
          call={call}
          token={token}
          contratoId={contratoId}
          contratoNumero={contratoNumero}
          embedded
        />
      )}
      {tab === "ordenes" && (
        <ContratoOrdenesPagoPanel
          call={call}
          token={token}
          contratoId={contratoId}
          contratoNumero={contratoNumero}
          embedded
        />
      )}
    </div>
  );
}
