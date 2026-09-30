/**
 * Documentos contractuales de licenciamiento — solo cargo Desarrollador.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE } from "./apiBase";
import { formatCOP } from "./utils/formatCOP";
import CcConfirmModal from "./components/CcConfirmModal";
import { buildContratoUiTheme, tFrom } from "./theme/adminPanelTheme";
import TopoExcelSheet from "./components/topografia/TopoExcelSheet";
import { topoSheetStyles } from "./components/topografia/topoSheetStyles";

const DOC_ESTADOS = [
  { id: "borrador", label: "Borrador", color: "#94a3b8" },
  { id: "generado", label: "Generado", color: "#00afc5" },
  { id: "enviado", label: "Enviado", color: "#F59E0B" },
  { id: "firmado", label: "Firmado", color: "#10B981" },
];

const LIC_VACIO = {
  razon_social: "",
  nit: "",
  representante_nombre: "",
  representante_cedula: "",
  direccion: "",
  email_notificaciones: "",
  identificacion_obra: "",
  fecha_inicio_licencia: "",
  valor_mensual: "",
  valor_mensual_iva_incluido: false,
};

/** Valor antes de IVA en pesos enteros (misma lógica que backend). */
function calcularValorNetoMensual(digitado, ivaIncluido, tasaIva) {
  if (digitado == null || digitado === "" || !Number.isFinite(Number(digitado))) return null;
  const v = Number(digitado);
  if (v < 0) return null;
  if (ivaIncluido) {
    const divisor = 1 + (Number(tasaIva) || 0);
    if (divisor <= 0) return null;
    return Math.round(v / divisor);
  }
  return Math.round(v);
}

function licenciatarioAFormulario(lic, resumen, contratoNumero) {
  const numero = (resumen?.contrato?.numero || contratoNumero || "").trim();
  const digitado =
    lic?.valor_mensual_digitado != null
      ? lic.valor_mensual_digitado
      : lic?.valor_mensual;
  return {
    razon_social: lic?.razon_social ?? "",
    nit: lic?.nit ?? "",
    representante_nombre: lic?.representante_nombre ?? "",
    representante_cedula: lic?.representante_cedula ?? "",
    direccion: lic?.direccion ?? "",
    email_notificaciones: lic?.email_notificaciones ?? "",
    identificacion_obra:
      (lic?.identificacion_obra || "").trim() ||
      (lic?.identificacion_obra_sugerida || "").trim() ||
      numero,
    fecha_inicio_licencia: lic?.fecha_inicio_licencia
      ? String(lic.fecha_inicio_licencia).trim().slice(0, 10)
      : "",
    valor_mensual: digitado != null && digitado !== "" ? String(digitado) : "",
    valor_mensual_iva_incluido: !!lic?.valor_mensual_iva_incluido,
  };
}

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

function estadoMeta(id) {
  return DOC_ESTADOS.find((e) => e.id === id) || DOC_ESTADOS[0];
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

async function descargarArchivo(token, contratoId, docId, { inline = false, nombre } = {}) {
  const res = await fetchAutenticado(
    token,
    `/admin/contratos/${contratoId}/documentos-contractuales/archivo/${docId}?inline=${inline ? "1" : "0"}`,
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
  a.download = nombre || `documento_${docId}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Vista matricial — todos los contratos. */
export function ContratoDocumentosMatriz({ call, token, contratos, onIrAContrato, theme = "dark", t: tProp = null }) {
  const [filas, setFilas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [filtro, setFiltro] = useState("todos");
  const tok = useMemo(() => tFrom(theme, tProp), [theme, tProp]);
  const sheet = useMemo(() => topoSheetStyles(tok), [tok]);

  const cargar = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const data = await call("GET", "/admin/contratos/documentos-contractuales/matriz");
      setFilas(Array.isArray(data?.filas) ? data.filas : []);
    } catch (e) {
      setMsg({ type: "error", text: e.message || "No se pudo cargar la matriz" });
      setFilas([]);
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const visibles = filas.filter((f) => {
    if (filtro === "sin_generar") return (f.doc_contractual_estado || "borrador") === "borrador";
    if (filtro === "pendiente_firma") return !f.tiene_documento_firmado;
    if (filtro === "enviado") return f.doc_contractual_estado === "enviado";
    return true;
  });

  const btnFiltro = (activo) => ({
    background: activo ? `color-mix(in srgb, ${tok.primary} 18%, transparent)` : "transparent",
    border: `1px solid ${activo ? `${tok.primary}88` : sheet.border}`,
    borderRadius: 4,
    padding: "5px 12px",
    color: activo ? tok.primary : tok.textMuted,
    fontSize: "var(--cc-caption)",
    fontWeight: activo ? 800 : 500,
    cursor: "pointer",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  });

  return (
    <div style={{ padding: "8px 4px 24px", fontSize: "var(--cc-body)", color: tok.text }}>
      <div style={{ fontSize: "var(--cc-title)", fontWeight: 800, color: tok.primary, marginBottom: 6 }}>
        Control documentos contractuales
      </div>
      <div style={{ fontSize: "var(--cc-sm)", color: tok.textMuted, marginBottom: 16, lineHeight: 1.45 }}>
        Resumen de licenciamiento por contrato: estado documental, último movimiento y documento firmado cargado.
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14, alignItems: "center" }}>
        {[
          { id: "todos", label: "Todos" },
          { id: "sin_generar", label: "Sin generar" },
          { id: "pendiente_firma", label: "Sin firmado" },
          { id: "enviado", label: "Enviados" },
        ].map((opt) => (
          <button key={opt.id} type="button" onClick={() => setFiltro(opt.id)} style={btnFiltro(filtro === opt.id)}>
            {opt.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void cargar()}
          disabled={loading}
          style={{
            marginLeft: "auto",
            background: "transparent",
            border: `1px solid ${sheet.border}`,
            borderRadius: 4,
            padding: "5px 12px",
            color: tok.textMuted,
            fontSize: "var(--cc-caption)",
            cursor: loading ? "wait" : "pointer",
          }}
        >
          {loading ? "Cargando…" : "↻ Actualizar"}
        </button>
      </div>

      {msg && (
        <div
          style={{
            background: msg.type === "error" ? "color-mix(in srgb, #ef4444 12%, transparent)" : "color-mix(in srgb, #10b981 12%, transparent)",
            color: msg.type === "error" ? "#ef4444" : "var(--cc-color-success)",
            borderRadius: 4,
            padding: "10px 14px",
            fontSize: "var(--cc-body)",
            marginBottom: 12,
            border: `1px solid ${sheet.border}`,
          }}
        >
          {msg.text}
        </div>
      )}

      <div style={{ ...sheet.sheetWrap, maxHeight: "min(72vh, 720px)" }} className="cc-admin-table-scroll">
        <table style={{ ...sheet.sheetTable, tableLayout: "auto", minWidth: 720 }}>
          <thead>
            <tr>
              {["Contrato", "Contratista", "Estado doc.", "Último movimiento", "Firmado", "Acciones"].map((h) => (
                <th key={h} style={sheet.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ ...sheet.td, color: tok.textMuted, textAlign: "center" }}>
                  Cargando…
                </td>
              </tr>
            ) : visibles.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ ...sheet.td, color: tok.textMuted, textAlign: "center" }}>
                  No hay registros con el filtro seleccionado.
                </td>
              </tr>
            ) : (
              visibles.map((f) => {
                const est = estadoMeta(f.doc_contractual_estado || "borrador");
                const mov = f.ultimo_movimiento_documento_at || f.doc_contractual_updated_at;
                return (
                  <tr key={f.contrato_id}>
                    <td style={{ ...sheet.td, fontWeight: 800, color: tok.primary }}>{f.numero || f.contrato_id}</td>
                    <td style={sheet.td}>{f.contratista || "—"}</td>
                    <td style={sheet.td}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontSize: "var(--cc-caption)",
                          fontWeight: 700,
                          background: `${est.color}22`,
                          color: est.color,
                          border: `1px solid ${est.color}55`,
                        }}
                      >
                        {est.label}
                      </span>
                    </td>
                    <td style={{ ...sheet.td, fontSize: "var(--cc-caption)", color: tok.textMuted }}>{fmtFecha(mov)}</td>
                    <td style={sheet.td}>{f.tiene_documento_firmado ? "✅ Sí" : "—"}</td>
                    <td style={sheet.td}>
                      {onIrAContrato && (
                        <button
                          type="button"
                          onClick={() => onIrAContrato(f.contrato_id)}
                          style={{
                            background: "transparent",
                            border: `1px solid ${sheet.border}`,
                            borderRadius: 4,
                            padding: "3px 8px",
                            color: tok.primary,
                            fontSize: "var(--cc-caption)",
                            cursor: "pointer",
                            fontWeight: 700,
                          }}
                        >
                          Abrir contrato
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Panel en detalle de contrato (modo edición). */
export function ContratoDocumentosPanel({
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
  const { confirmTheme, font, fileDrop: fileDropStyle } = ui;
  const sheet = useMemo(() => topoSheetStyles(ui.tok || tProp), [ui.tok, tProp]);
  const cellInp = useMemo(() => ({ ...sheet.cellInp, textAlign: "left", minHeight: 32, height: "auto", marginBottom: 0 }), [sheet]);

  const [resumen, setResumen] = useState(null);
  const [licForm, setLicForm] = useState(LIC_VACIO);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [generando, setGenerando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [confirmEstado, setConfirmEstado] = useState(null);
  const [confirmEliminar, setConfirmEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);
  const fileInputRef = useRef(null);

  const cargar = useCallback(async () => {
    if (!contratoId) return;
    setLoading(true);
    setMsg(null);
    try {
      const data = await call("GET", `/admin/contratos/${contratoId}/documentos-contractuales`);
      setResumen(data);
      setLicForm(licenciatarioAFormulario(data?.licenciatario, data, contratoNumero));
    } catch (e) {
      setMsg({ type: "error", text: e.message || "No se pudo cargar documentos contractuales" });
    } finally {
      setLoading(false);
    }
  }, [call, contratoId, contratoNumero]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function prefillDesdeContrato() {
    try {
      const data = await call("GET", `/admin/contratos/${contratoId}/documentos-contractuales/licenciatario-prefill`);
      setLicForm(
        licenciatarioAFormulario(
          data,
          { iva_tasa: data?.iva_tasa, contrato: { numero: contratoNumero || data?.identificacion_obra } },
          contratoNumero,
        ),
      );
      setMsg({ type: "success", text: "Datos del contrato aplicados al formulario del licenciatario." });
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    }
  }

  function payloadLicenciatario() {
    const vm = licForm.valor_mensual.trim();
    const digitado = vm === "" ? null : Number(vm);
    return {
      razon_social: licForm.razon_social,
      nit: licForm.nit || null,
      representante_nombre: licForm.representante_nombre || null,
      representante_cedula: licForm.representante_cedula || null,
      direccion: licForm.direccion || null,
      email_notificaciones: licForm.email_notificaciones || null,
      identificacion_obra: licForm.identificacion_obra || null,
      fecha_inicio_licencia: licForm.fecha_inicio_licencia.trim() || null,
      valor_mensual_digitado: digitado,
      valor_mensual_iva_incluido: !!licForm.valor_mensual_iva_incluido,
    };
  }

  const ivaTasa = resumen?.iva_tasa ?? 0.19;
  const ivaEtiqueta = resumen?.iva_porcentaje_etiqueta || "19%";
  const valorNetoContrato = useMemo(
    () =>
      calcularValorNetoMensual(
        licForm.valor_mensual.trim() === "" ? null : Number(licForm.valor_mensual),
        licForm.valor_mensual_iva_incluido,
        ivaTasa,
      ),
    [licForm.valor_mensual, licForm.valor_mensual_iva_incluido, ivaTasa],
  );

  async function cambiarEstado(nuevoEstado) {
    setCambiandoEstado(true);
    setMsg(null);
    try {
      await call("PATCH", `/admin/contratos/${contratoId}/documentos-contractuales/estado`, {
        estado: nuevoEstado,
      });
      await cargar();
      setMsg({ type: "success", text: `Estado actualizado a «${estadoMeta(nuevoEstado).label}».` });
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setCambiandoEstado(false);
    }
  }

  function solicitarConfirmacionEstado(sugerencia, mensaje) {
    if (!sugerencia) return;
    setConfirmEstado({
      sugerencia,
      mensaje: mensaje || "¿Desea actualizar el estado documental?",
    });
  }

  async function generarPdf() {
    setGenerando(true);
    setMsg(null);
    try {
      const body = payloadLicenciatario();
      const data = await call("POST", `/admin/contratos/${contratoId}/documentos-contractuales/generar`, body);
      await cargar();
      setMsg({ type: "success", text: "Contrato de licenciamiento generado correctamente." });
      solicitarConfirmacionEstado(data?.sugerencia_estado, data?.mensaje_sugerencia);
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setGenerando(false);
    }
  }

  async function subirFirmado(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendo(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetchAutenticado(
        token,
        `/admin/contratos/${contratoId}/documentos-contractuales/firmado`,
        { method: "POST", body: fd },
      );
      const data = await res.json();
      await cargar();
      setMsg({ type: "success", text: "Documento firmado cargado correctamente." });
      solicitarConfirmacionEstado(data?.sugerencia_estado, data?.mensaje_sugerencia);
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    } finally {
      setSubiendo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function maxVersionLocal(tipo) {
    const lista = tipo === "firmado" ? resumen?.historial_firmados : resumen?.historial_generados;
    if (!lista?.length) return 0;
    return Math.max(...lista.map((d) => Number(d.version_num) || 0));
  }

  function solicitarEliminar(doc, tipoLabel) {
    const tipo = (doc.tipo || (tipoLabel === "Firmados" ? "firmado" : "generado")).toLowerCase();
    const maxV = maxVersionLocal(tipo);
    const esMax = Number(doc.version_num) === maxV;
    setConfirmEliminar({
      doc,
      tipo,
      esMax,
      label: tipoLabel || (tipo === "firmado" ? "firmado" : "generado"),
    });
  }

  async function ejecutarEliminar() {
    if (!confirmEliminar?.doc) return;
    const { doc } = confirmEliminar;
    setEliminando(true);
    setMsg(null);
    try {
      const data = await call(
        "DELETE",
        `/admin/contratos/${contratoId}/documentos-contractuales/${doc.id}`,
      );
      setConfirmEliminar(null);
      await cargar();
      const liberado = data?.consecutivo_liberado;
      const v = data?.version_num ?? doc.version_num;
      setMsg({
        type: "success",
        text: liberado
          ? `Documento v${v} eliminado. El consecutivo quedó libre para reutilizarse.`
          : `Documento v${v} eliminado. El consecutivo queda como hueco no reutilizable.`,
      });
    } catch (e) {
      setMsg({ type: "error", text: e.message || "No se pudo eliminar el documento" });
    } finally {
      setEliminando(false);
    }
  }

  function btnDocAccion(extra = {}) {
    return {
      background: ui.cardSubtle,
      border: `1px solid ${ui.tabBorderActive}`,
      borderRadius: 6,
      padding: "5px 12px",
      color: ui.primary,
      fontSize: font.sm,
      cursor: "pointer",
      ...extra,
    };
  }

  function btnEliminar(extra = {}) {
    return {
      background: `${ui.errorText}15`,
      border: `1px solid ${ui.errorText}55`,
      borderRadius: 6,
      padding: "5px 12px",
      color: ui.errorText,
      fontSize: font.sm,
      cursor: extra.disabled ? "wait" : "pointer",
      ...extra,
    };
  }

  const estadoActual = resumen?.doc_contractual_estado || "borrador";
  const est = estadoMeta(estadoActual);
  const ultimoGen = resumen?.ultimo_generado;
  const ultimoFirm = resumen?.ultimo_firmado;

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
        📄 Documentos contractuales
      </div>
      <div style={{ fontSize: font.caption, color: ui.textMuted, marginBottom: 14, lineHeight: 1.45 }}>
        Licenciamiento ClaraCore para {contratoNumero ? `contrato ${contratoNumero}` : `ID ${contratoId}`}. Solo Desarrollador.
      </div>

      {loading ? (
        <div style={{ color: ui.textMuted, fontSize: font.body }}>Cargando gestión documental…</div>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "center",
              marginBottom: 16,
              padding: "12px 14px",
              background: ui.cardSubtle,
              border: `1px solid ${ui.border}`,
              borderRadius: 8,
            }}
          >
            <div>
              <div style={{ fontSize: font.caption, color: ui.textMuted, letterSpacing: 0.8 }}>ESTADO DOCUMENTAL</div>
              <span
                style={{
                  display: "inline-block",
                  marginTop: 4,
                  padding: "3px 10px",
                  borderRadius: 12,
                  fontSize: font.sm,
                  fontWeight: 700,
                  background: `${est.color}22`,
                  color: est.color,
                  border: `1px solid ${est.color}55`,
                }}
              >
                {est.label}
              </span>
            </div>
            <div style={{ fontSize: font.caption, color: ui.textMuted }}>
              Último movimiento: {fmtFecha(resumen?.doc_contractual_updated_at)}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginLeft: "auto" }}>
              {DOC_ESTADOS.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  disabled={cambiandoEstado || estadoActual === e.id}
                  onClick={() => void cambiarEstado(e.id)}
                  title={`Marcar como ${e.label}`}
                  style={{
                    background: estadoActual === e.id ? `${e.color}33` : "transparent",
                    border: `1px solid ${e.color}66`,
                    borderRadius: 6,
                    padding: "4px 10px",
                    color: e.color,
                    fontSize: font.caption,
                    cursor: cambiandoEstado ? "wait" : "pointer",
                    opacity: estadoActual === e.id ? 1 : 0.85,
                  }}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>

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

          <div style={{ fontSize: font.body }}>
            <div style={{ marginBottom: 20 }}>
              <TopoExcelSheet
                sheet={sheet}
                title="Datos del licenciatario"
                titleRight={
                  <button
                    type="button"
                    onClick={() => void prefillDesdeContrato()}
                    style={{
                      background: "transparent",
                      border: `1px solid ${sheet.border}`,
                      borderRadius: 4,
                      padding: "4px 10px",
                      color: ui.primary,
                      fontSize: "var(--cc-caption)",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    Usar datos del contrato
                  </button>
                }
                columns={[
                  { key: "razon", label: "Razón social *", compactFull: true },
                  { key: "nit", label: "NIT" },
                  { key: "rep", label: "Representante legal" },
                  { key: "ced", label: "Cédula representante" },
                  { key: "dir", label: "Dirección" },
                  { key: "email", label: "Correo notificaciones" },
                  { key: "obra", label: "Identificación contrato / obra" },
                  { key: "fecha", label: "Fecha inicio licencia" },
                  { key: "valor", label: "Valor mensual licencia (COP)" },
                  { key: "iva", label: "IVA incluido" },
                ]}
                cells={[
                  <input key="razon" style={cellInp} value={licForm.razon_social} onChange={(e) => setLicForm((f) => ({ ...f, razon_social: e.target.value }))} />,
                  <input key="nit" style={cellInp} value={licForm.nit} onChange={(e) => setLicForm((f) => ({ ...f, nit: e.target.value }))} />,
                  <input key="rep" style={cellInp} value={licForm.representante_nombre} onChange={(e) => setLicForm((f) => ({ ...f, representante_nombre: e.target.value }))} />,
                  <input key="ced" style={cellInp} value={licForm.representante_cedula} onChange={(e) => setLicForm((f) => ({ ...f, representante_cedula: e.target.value }))} />,
                  <input key="dir" style={cellInp} value={licForm.direccion} onChange={(e) => setLicForm((f) => ({ ...f, direccion: e.target.value }))} />,
                  <input key="email" style={cellInp} type="email" value={licForm.email_notificaciones} onChange={(e) => setLicForm((f) => ({ ...f, email_notificaciones: e.target.value }))} />,
                  <input key="obra" style={cellInp} value={licForm.identificacion_obra} onChange={(e) => setLicForm((f) => ({ ...f, identificacion_obra: e.target.value }))} />,
                  <input
                    key="fecha"
                    style={cellInp}
                    type="date"
                    value={licForm.fecha_inicio_licencia}
                    onChange={(e) => setLicForm((f) => ({ ...f, fecha_inicio_licencia: e.target.value }))}
                  />,
                  <input
                    key="valor"
                    style={cellInp}
                    type="number"
                    min="0"
                    step="1"
                    value={licForm.valor_mensual}
                    onChange={(e) => setLicForm((f) => ({ ...f, valor_mensual: e.target.value }))}
                  />,
                  <label key="iva" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: font.sm, color: ui.text, cursor: "pointer", padding: "4px 2px" }}>
                    <input
                      type="checkbox"
                      checked={!!licForm.valor_mensual_iva_incluido}
                      onChange={(e) => setLicForm((f) => ({ ...f, valor_mensual_iva_incluido: e.target.checked }))}
                      style={{ width: 16, height: 16, accentColor: ui.primary }}
                    />
                    IVA incluido
                    <span style={{ color: ui.textMuted, fontSize: "var(--cc-caption)" }}>(IVA: {ivaEtiqueta})</span>
                  </label>,
                ]}
              />

              {licForm.valor_mensual !== "" && !Number.isNaN(Number(licForm.valor_mensual)) && (
                <div style={{ fontSize: font.caption, color: ui.successText, marginBottom: 10, lineHeight: 1.45 }}>
                  {licForm.valor_mensual_iva_incluido ? (
                    <>
                      Valor digitado (con IVA): {formatCOP(licForm.valor_mensual)}
                      {" · "}
                      <strong style={{ color: ui.primary }}>
                        Valor en contrato (antes de IVA):{" "}
                        {valorNetoContrato != null ? formatCOP(valorNetoContrato) : "—"}
                      </strong>
                    </>
                  ) : (
                    <>
                      Valor digitado (antes de IVA): {formatCOP(licForm.valor_mensual)}
                      {" · "}
                      <span style={{ color: ui.textMuted }}>
                        Se usará tal cual en el PDF (+ IVA {ivaEtiqueta}).
                      </span>
                    </>
                  )}
                </div>
              )}

              <button
                type="button"
                disabled={generando || !licForm.razon_social.trim()}
                onClick={() => void generarPdf()}
                style={{
                  background: ui.primary,
                  border: "none",
                  borderRadius: 4,
                  padding: "10px 18px",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: generando ? "wait" : "pointer",
                  opacity: generando || !licForm.razon_social.trim() ? 0.65 : 1,
                  fontSize: font.body,
                }}
              >
                {generando ? "Generando…" : ultimoGen ? "Actualizar datos y regenerar PDF" : "Generar contrato de licenciamiento"}
              </button>
            </div>

            <TopoExcelSheet
              sheet={sheet}
              title="Documentos"
              columns={[
                { key: "gen", label: "Último PDF generado", width: "33%" },
                { key: "firm", label: "Documento firmado", width: "33%" },
                { key: "hist", label: "Historial de versiones", width: "34%" },
              ]}
              cells={[
                <div key="gen" style={{ padding: 4, fontSize: font.sm }}>
                  {ultimoGen ? (
                    <>
                      <div style={{ color: ui.text, marginBottom: 4 }}>
                        v{ultimoGen.version_num} · {fmtFecha(ultimoGen.created_at)}
                      </div>
                      <div style={{ fontSize: "var(--cc-caption)", color: ui.textMuted, marginBottom: 8 }}>
                        {(ultimoGen.tamano_bytes / 1024).toFixed(1)} KB
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button type="button" onClick={() => void descargarArchivo(token, contratoId, ultimoGen.id, { inline: true, nombre: ultimoGen.nombre_archivo })} style={btnDocAccion()}>Ver PDF</button>
                        <button type="button" onClick={() => void descargarArchivo(token, contratoId, ultimoGen.id, { nombre: ultimoGen.nombre_archivo })} style={{ ...btnDocAccion(), background: "transparent", border: `1px solid ${sheet.border}` }}>Descargar</button>
                        <button type="button" disabled={eliminando} onClick={() => solicitarEliminar(ultimoGen, "generado")} style={btnEliminar({ disabled: eliminando })}>Eliminar</button>
                      </div>
                    </>
                  ) : (
                    <div style={{ color: ui.textMuted }}>Aún no se ha generado el contrato de licenciamiento.</div>
                  )}
                </div>,
                <div key="firm" style={{ padding: 4, fontSize: font.sm }}>
                  {ultimoFirm ? (
                    <>
                      <div style={{ color: ui.text, marginBottom: 4 }}>
                        v{ultimoFirm.version_num} · {fmtFecha(ultimoFirm.created_at)}
                      </div>
                      <div style={{ fontSize: "var(--cc-caption)", color: ui.textMuted, marginBottom: 8 }}>{ultimoFirm.nombre_archivo || "documento_firmado.pdf"}</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                        <button type="button" onClick={() => void descargarArchivo(token, contratoId, ultimoFirm.id, { inline: true, nombre: ultimoFirm.nombre_archivo })} style={{ ...btnDocAccion(), color: ui.successText, border: `1px solid ${ui.successText}55`, background: `${ui.successText}15` }}>Ver firmado</button>
                        <button type="button" disabled={eliminando} onClick={() => solicitarEliminar(ultimoFirm, "firmado")} style={btnEliminar({ disabled: eliminando })}>Eliminar</button>
                      </div>
                    </>
                  ) : (
                    <div style={{ color: ui.textMuted, marginBottom: 8 }}>No hay documento firmado cargado.</div>
                  )}
                  <label style={{ ...fileDropStyle, marginBottom: 0, cursor: subiendo ? "wait" : "pointer", color: ui.successText, border: `2px dashed ${ui.successText}55` }}>
                    {subiendo ? "Subiendo…" : "📎 Subir contrato firmado (PDF o imagen, máx. 20 MB)"}
                    <input ref={fileInputRef} type="file" accept=".pdf,image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={(e) => void subirFirmado(e)} disabled={subiendo} />
                  </label>
                </div>,
                <div key="hist" style={{ padding: 4, fontSize: "var(--cc-caption)", color: ui.text, maxHeight: 260, overflowY: "auto" }}>
                  <div style={{ fontWeight: 700, color: ui.textMuted, marginBottom: 6 }}>Generados</div>
                  {(resumen?.historial_generados || []).length === 0 ? (
                    <div style={{ color: ui.textMuted, marginBottom: 10 }}>—</div>
                  ) : (
                    <div style={{ marginBottom: 12 }}>
                      {(resumen.historial_generados || []).map((d) => (
                        <div key={d.id} style={{ marginBottom: 8, lineHeight: 1.45 }}>
                          <div>v{d.version_num} · {fmtFecha(d.created_at)}</div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
                            <button type="button" onClick={() => void descargarArchivo(token, contratoId, d.id, { nombre: d.nombre_archivo })} style={{ background: "none", border: "none", color: ui.primary, cursor: "pointer", fontSize: "var(--cc-caption)", padding: 0, textDecoration: "underline" }}>descargar</button>
                            <button type="button" disabled={eliminando} onClick={() => solicitarEliminar(d, "generado")} style={{ background: "none", border: "none", color: ui.errorText, cursor: eliminando ? "wait" : "pointer", fontSize: "var(--cc-caption)", padding: 0, textDecoration: "underline" }}>eliminar</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ fontWeight: 700, color: ui.textMuted, marginBottom: 6 }}>Firmados</div>
                  {(resumen?.historial_firmados || []).length === 0 ? (
                    <div style={{ color: ui.textMuted }}>—</div>
                  ) : (
                    <div>
                      {(resumen.historial_firmados || []).map((d) => (
                        <div key={d.id} style={{ marginBottom: 8, lineHeight: 1.45 }}>
                          <div>v{d.version_num} · {fmtFecha(d.created_at)} · {d.nombre_archivo || "PDF"}</div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
                            <button type="button" onClick={() => void descargarArchivo(token, contratoId, d.id, { nombre: d.nombre_archivo })} style={{ background: "none", border: "none", color: ui.successText, cursor: "pointer", fontSize: "var(--cc-caption)", padding: 0, textDecoration: "underline" }}>descargar</button>
                            <button type="button" disabled={eliminando} onClick={() => solicitarEliminar(d, "firmado")} style={{ background: "none", border: "none", color: ui.errorText, cursor: eliminando ? "wait" : "pointer", fontSize: "var(--cc-caption)", padding: 0, textDecoration: "underline" }}>eliminar</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>,
              ]}
            />
          </div>
        </>
      )}
      {confirmEstado && (
        <CcConfirmModal
          theme={confirmTheme}
          titulo="Actualizar estado documental"
          tipo="info"
          confirmar={`Marcar como «${estadoMeta(confirmEstado.sugerencia).label}»`}
          cancelar="No, mantener estado"
          onCancel={() => setConfirmEstado(null)}
          onConfirm={async () => {
            const sug = confirmEstado.sugerencia;
            setConfirmEstado(null);
            await cambiarEstado(sug);
          }}
        >
          <p style={{ margin: "0 0 8px 0" }}>{confirmEstado.mensaje}</p>
          <p style={{ margin: 0, color: confirmTheme.textMuted }}>
            ¿Desea actualizar el estado documental a «{estadoMeta(confirmEstado.sugerencia).label}»?
          </p>
        </CcConfirmModal>
      )}
      {confirmEliminar && (
        <CcConfirmModal
          theme={confirmTheme}
          titulo="Eliminar documento"
          tipo="danger"
          confirmar="Eliminar documento"
          cancelar="Cancelar"
          procesando={eliminando}
          onCancel={() => {
            if (!eliminando) setConfirmEliminar(null);
          }}
          onConfirm={() => void ejecutarEliminar()}
        >
          <p style={{ margin: "0 0 10px 0", color: confirmTheme.text }}>
            ¿Eliminar el documento <strong>v{confirmEliminar.doc.version_num}</strong> ({confirmEliminar.label})?
          </p>
          <p style={{ margin: 0, color: confirmTheme.textMuted, lineHeight: 1.5 }}>
            {confirmEliminar.esMax
              ? `Es el consecutivo máximo actual: al eliminarlo, la versión v${confirmEliminar.doc.version_num} quedará libre para reutilizarse en el próximo documento.`
              : `No es el consecutivo máximo: al eliminarlo, la versión v${confirmEliminar.doc.version_num} quedará como hueco no reutilizable (existen versiones posteriores).`}
          </p>
        </CcConfirmModal>
      )}
    </div>
  );
}
