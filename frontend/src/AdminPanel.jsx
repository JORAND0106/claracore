import { useState, useEffect, useCallback, useRef, useMemo, startTransition } from "react";
import * as XLSX from "xlsx";
import mapboxgl from "mapbox-gl";
import { API_BASE } from "./apiBase";
import { formatCOP } from "./utils/formatCOP";
import { sanitizePlanoFeatureCollection } from "./geoPlanoSanitize";
import ModuloNube from "./ModuloNube";

// ─── CONFIG ────────────────────────────────────────────────────────────────
const API = API_BASE;

/**
 * Fechas de logs / API (Postgres, ISO). Si el string no trae huso (Z u offset),
 * se asume UTC — evita que el navegador lo interprete como hora local y desalinee Bogotá.
 * Salida siempre en zona Colombia.
 */
function formatFechaLogBogota(iso) {
  if (iso == null || iso === "") return "—"
  try {
    let s = String(iso).trim().replace(" ", "T")
    const hasZone = /Z$/i.test(s) || /[+-]\d{2}:\d{2}$/.test(s) || /[+-]\d{4}$/.test(s)
    if (!hasZone && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
      s = `${s}Z`
    }
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return String(iso)
    return d.toLocaleString("es-CO", {
      dateStyle: "short",
      timeStyle: "short",
      hour12: true,
      timeZone: "America/Bogota",
    })
  } catch {
    return String(iso)
  }
}

/** JSON para pegar en Cursor/soporte sin capturas de pantalla. */
function truncParaPortapapeles(val, max = 2000) {
  if (val == null) return null
  const s = typeof val === "string" ? val : JSON.stringify(val)
  return s.length <= max ? s : `${s.slice(0, max)}…(truncado)`
}

function buildPortapapelesDiagnostico(data) {
  const clone = JSON.parse(JSON.stringify(data || {}))
  const acortaDetalle = (rows) => {
    if (!Array.isArray(rows)) return rows
    return rows.map((r) => {
      const o = { ...r }
      if (o.detalle != null) o.detalle = truncParaPortapapeles(o.detalle, 2500)
      return o
    })
  }
  if (clone.errores_sistema) clone.errores_sistema = acortaDetalle(clone.errores_sistema)
  if (clone.alertas) clone.alertas = acortaDetalle(clone.alertas)
  const payload = {
    _tipo: "claracore_diagnostico_plataforma",
    _version: 2,
    _pegar: "Copiar este bloque completo en el chat de soporte o en Cursor para diagnóstico.",
    exportado_en_cliente_utc: new Date().toISOString(),
    cliente: typeof window !== "undefined"
      ? {
          origin: window.location.origin,
          path: window.location.pathname,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        }
      : {},
    diagnostico: clone,
  }
  return JSON.stringify(payload, null, 2)
}

const ACCIONES = ["ver", "crear", "editar", "eliminar", "validar", "exportar"];

/** Icono sugerido según tipo de novedad (módulo Inicio) */
const NOVEDAD_ICONO_POR_TIPO = {
  actualización: "📢",
  mejora: "✨",
  corrección: "🔧",
  aviso: "⚠️",
};
/** Catálogo amplio para elegir en el panel (emoji Unicode) */
const NOVEDAD_ICONOS_CATALOGO = [
  "📢", "✨", "🔧", "⚠️", "🎉", "📣", "💡", "🔍", "📊", "🏗️", "🛠️", "✅", "📌",
  "🚀", "📄", "🔐", "🌟", "💬", "📝", "🎯", "🔗", "☁️", "📋", "🦺", "⛑️",
  "🌍", "🚧", "📐", "🔔", "💼", "📈", "🧭", "⚙️", "🗂️", "📎", "🏁", "⭐",
];

/** Alineado con `themes` en `App.jsx` (claro / oscuro / descanso) */
const THEME = {
  light: {
    bg: "#F0F9FF", bgCard: "#FFFFFF", border: "#BAE6FD", text: "#0F2942", textMuted: "#4A7FA5", primary: "#0077B6", primaryLight: "#00B4C6",
    shadow: "0 2px 12px rgba(0,119,182,0.10)", headerBg: "#FFFFFF", inputBg: "#F8FAFC",
  },
  dark: {
    bg: "#0A1628", bgCard: "#0F2038", border: "#1E3A5F", text: "#E0F2FE", textMuted: "#7FB3D3", primary: "#00B4C6", primaryLight: "#00D4E8",
    shadow: "0 2px 12px rgba(0,0,0,0.40)", headerBg: "#0F2038", inputBg: "#0A1628",
  },
  rest: {
    bg: "#E8E0D5", bgCard: "#F2EDE4", border: "#C9B8A4", text: "#2A2318", textMuted: "#5C5346", primary: "#0E7490", primaryLight: "#14B8A6",
    shadow: "0 2px 12px rgba(42,35,24,0.12)", headerBg: "#EDE6DC", inputBg: "#FAF6EF",
  },
}

function tFrom(m, t) {
  if (t && t.text) return t
  if (m && THEME[m]) return THEME[m]
  return THEME.light
}

function isDarkMode(m) { return m === "dark" }
function isRestMode(m) { return m === "rest" }
function isLightTheme(m) { return m === "light" || m === "rest" }

// ─── TOKENS DE COLOR (objeto t del dashboard o clave de tema) ─────────────
const C = (themeOrT) => {
  let t;
  if (typeof themeOrT === "string") t = THEME[themeOrT] || THEME.light;
  else if (themeOrT && themeOrT.text) t = themeOrT;
  else t = THEME.light;
  return {
    textPrimary:   t.text,
    textSecondary: t.textMuted,
    textMuted:     t.textMuted,
    textTable:     t.text,
    bgCard:        t.bgCard,
    bgInput:       t.inputBg,
    borderColor:   t.border,
  }
}

// ─── ESTILOS BASE: tipografía = var(--cc-*) (Pequeña / Mediana / Grande) ───
const S = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 9999,
    background: "rgba(10,18,25,0.82)",
    backdropFilter: "blur(6px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
    fontSize: "var(--cc-body)",
    lineHeight: 1.35,
  },
  panel: (m, t) => {
    const tok = tFrom(m, t);
    return {
      width: "min(1320px, 98vw)",
      height: "min(900px, 96vh)",
      background: isDarkMode(m) ? "#0e1c24" : tok.bg,
      borderRadius: 12,
      display: "flex",
      overflow: "hidden",
      boxShadow: isDarkMode(m) ? "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,175,197,0.15)" : `0 24px 64px ${isRestMode(m) ? "rgba(42,35,24,0.2)" : "rgba(0,0,0,0.12)"}, 0 0 0 1px ${tok.border}99`,
    };
  },
  sidebar: (m, t) => {
    const tok = tFrom(m, t);
    const bg = isDarkMode(m) ? "#081318" : isRestMode(m) ? "#D9CEC0" : "#E0F2FE";
    return {
      width: 200, minWidth: 200,
      background: bg,
      borderRight: `1px solid ${tok.border}`,
      display: "flex", flexDirection: "column",
      padding: "14px 0",
    };
  },
  sidebarHeader: (m, t) => {
    const tok = tFrom(m, t);
    return {
      padding: "0 16px 14px",
      borderBottom: `1px solid ${isDarkMode(m) ? "rgba(0,175,197,0.1)" : tok.border}88`,
      marginBottom: 10,
    };
  },
  logoSub: (m, t) => ({ fontSize: "var(--cc-caption)", color: tFrom(m, t).textMuted, letterSpacing: 1, marginTop: 2 }),
  navItem: (active, m, t) => {
    const tok = tFrom(m, t);
    return {
      display: "flex", alignItems: "center", gap: 8,
      padding: "6px 14px", cursor: "pointer",
      background: active ? (isRestMode(m) ? "rgba(14,116,144,0.12)" : "rgba(0,119,182,0.1)") : "transparent",
      borderLeft: active ? `3px solid ${tok.primary}` : "3px solid transparent",
      color: active ? tok.primary : tok.textMuted,
      fontSize: "var(--cc-sm)", fontWeight: active ? 600 : 500,
      transition: "all 0.18s", userSelect: "none",
    };
  },
  navDot: (active, m, t) => ({
    width: 6, height: 6, borderRadius: "50%",
    background: active ? tFrom(m, t).primary : tFrom(m, t).textMuted,
    flexShrink: 0, opacity: active ? 1 : 0.5,
  }),
  sidebarFooter: (m, t) => {
    const tok = tFrom(m, t);
    return {
      marginTop: "auto", padding: "10px 14px",
      borderTop: `1px solid ${isDarkMode(m) ? "rgba(0,175,197,0.08)" : tok.border}66`,
    };
  },
  userTag: (m, t) => ({ fontSize: "var(--cc-caption)", color: tFrom(m, t).textMuted }),
  userName: (m, t) => ({ fontSize: "var(--cc-sm)", color: tFrom(m, t).text, fontWeight: 600, marginTop: 2 }),
  content: {
    flex: 1, display: "flex", flexDirection: "column", overflow: "hidden",
  },
  contentHeader: (m, t) => {
    const tok = tFrom(m, t);
    return {
      padding: "8px 18px 8px",
      borderBottom: `1px solid ${tok.border}`,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      background: isDarkMode(m) ? "#0b1920" : tok.bgCard,
    };
  },
  contentTitle: (m, t) => {
    const tok = tFrom(m, t);
    return {
      fontSize: "var(--cc-h2)", fontWeight: 700, color: tok.text,
      fontFamily: "'Rajdhani', sans-serif", letterSpacing: 0.4,
    };
  },
  contentSub: (m, t) => {
    const tok = tFrom(m, t);
    return {
      fontSize: "var(--cc-sm)", color: tok.textMuted, marginTop: 2, lineHeight: 1.35,
    };
  },
  closeBtn: (m, t) => {
    const tok = tFrom(m, t);
    return {
      width: 32, height: 32, borderRadius: 6,
      background: isDarkMode(m) ? "rgba(0,175,197,0.08)" : (isRestMode(m) ? "rgba(14,116,144,0.1)" : "rgba(0,119,182,0.08)"),
      border: `1px solid ${tok.border}`,
      color: tok.primary, fontSize: "var(--cc-md)", cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s",
    };
  },
  scrollArea: (m, t) => {
    const tok = tFrom(m, t);
    return {
      flex: 1, overflowY: "auto", padding: "10px 16px",
      scrollbarWidth: "thin", scrollbarColor: isDarkMode(m) ? "#1e3a44 transparent" : `${tok.border} transparent`,
      background: isDarkMode(m) ? "transparent" : isRestMode(m) ? "#EEE8DF" : "#F8FAFC",
    };
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "var(--cc-sm)", lineHeight: 1.3 },
  th: (m, t) => {
    const tok = tFrom(m, t);
    if (isRestMode(m)) {
      return {
        textAlign: "left", padding: "4px 8px",
        background: "#2E2A25", color: "rgba(242,235,224,0.9)",
        fontSize: "var(--cc-label)", fontWeight: 600, letterSpacing: 0.5,
        textTransform: "uppercase",
        borderBottom: `1px solid ${tok.border}`,
      };
    }
    if (!isDarkMode(m)) {
      return {
        textAlign: "left", padding: "4px 8px",
        background: "#081318", color: "#4a8a96",
        fontSize: "var(--cc-label)", fontWeight: 600, letterSpacing: 0.5,
        textTransform: "uppercase",
        borderBottom: "1px solid rgba(0,175,197,0.12)",
      };
    }
    return {
      textAlign: "left", padding: "4px 8px",
      background: "#020617", color: "#4a8a96",
      fontSize: "var(--cc-label)", fontWeight: 600, letterSpacing: 0.5,
      textTransform: "uppercase",
      borderBottom: "1px solid rgba(0,175,197,0.12)",
    };
  },
  td: (m, t) => {
    const tok = tFrom(m, t);
    return {
      padding: "5px 8px", fontSize: "var(--cc-sm)",
      color: tok.text,
      borderBottom: isDarkMode(m) ? "1px solid rgba(255,255,255,0.04)" : `1px solid ${isRestMode(m) ? "rgba(201,184,164,0.45)" : "#E0F2FE"}`,
      verticalAlign: "middle",
    };
  },
  badge: (estado) => ({
    display: "inline-block", padding: "2px 8px", borderRadius: 20,
    fontSize: "var(--cc-caption)", fontWeight: 600,
    background: estado === "pendiente" ? "rgba(245,158,11,0.15)"
      : estado === "aprobado" ? "rgba(34,197,94,0.15)"
      : "rgba(239,68,68,0.15)",
    color: estado === "pendiente" ? "#f59e0b"
      : estado === "aprobado" ? "#22c55e"
      : "#ef4444",
  }),
  btn: (variant = "primary", sm = false) => ({
    padding: sm ? "4px 10px" : "6px 14px",
    borderRadius: 6, cursor: "pointer",
    fontSize: sm ? "var(--cc-caption)" : "var(--cc-sm)", fontWeight: 600,
    border: "1px solid",
    transition: "all 0.15s",
    ...(variant === "primary" ? {
      background: "#00afc5", borderColor: "#00afc5", color: "#081318",
    } : variant === "success" ? {
      background: "rgba(34,197,94,0.12)", borderColor: "rgba(34,197,94,0.4)", color: "#22c55e",
    } : variant === "danger" ? {
      background: "rgba(239,68,68,0.12)", borderColor: "rgba(239,68,68,0.4)", color: "#ef4444",
    } : variant === "ghost" ? {
      background: "transparent", borderColor: "rgba(0,175,197,0.2)", color: "#8acdd8",
    } : {
      background: "rgba(0,175,197,0.08)", borderColor: "rgba(0,175,197,0.2)", color: "#00afc5",
    }),
  }),
  input: {
    background: "#081318", border: "1px solid rgba(0,175,197,0.2)",
    borderRadius: 6, color: "#c0dde3", fontSize: "var(--cc-input)",
    padding: "5px 10px", outline: "none", width: "100%",
  },
  select: {
    background: "#081318", border: "1px solid rgba(0,175,197,0.2)",
    borderRadius: 6, color: "#c0dde3", fontSize: "var(--cc-sm)",
    padding: "4px 8px", outline: "none", cursor: "pointer",
  },
  card: {
    background: "#0b1920", border: "1px solid rgba(0,175,197,0.1)",
    borderRadius: 8, padding: "12px 16px", marginBottom: 10,
  },
  cardTitle: { fontSize: "var(--cc-sm)", fontWeight: 600, color: "#8acdd8", marginBottom: 8 },
  chip: (active) => ({
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "2px 8px", borderRadius: 20, cursor: "pointer",
    fontSize: "var(--cc-caption)", fontWeight: 600, userSelect: "none",
    border: "1px solid",
    transition: "all 0.15s",
    background: active ? "rgba(0,175,197,0.18)" : "rgba(255,255,255,0.03)",
    borderColor: active ? "#00afc5" : "rgba(255,255,255,0.1)",
    color: active ? "#00afc5" : "#4a7a87",
  }),
  alert: (type) => ({
    padding: "8px 12px", borderRadius: 6, fontSize: "var(--cc-sm)",
    marginBottom: 12,
    background: type === "success" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
    border: `1px solid ${type === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
    color: type === "success" ? "#22c55e" : "#ef4444",
  }),
  empty: {
    textAlign: "center", padding: "28px 0",
    color: "#2a4a54", fontSize: "var(--cc-body)",
  },
};

// ─── HOOK: llamadas a la API ───────────────────────────────────────────────
/** Fallos de red / timeout: el navegador suele mostrar CORS aunque el origen esté permitido. Azure en frío puede tardar >1 min en la 1.ª respuesta. */
function _esFalloRedTransitorio(e) {
  if (!e) return false;
  if (e instanceof TypeError) return true;
  if (e.name === "AbortError") return true;
  const msg = String(e.message || "");
  if (msg.includes("Failed to fetch")) return true;
  if (msg.includes("NetworkError") || msg.includes("Network request failed")) return true;
  return false;
}

function _sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function useApi(token, opts = {}) {
  const { maxRetries = 5, timeoutMs = 55000 } = opts;
  /** body puede ser null; reqOpts opcional: { timeoutMs, maxRetries } por petición (p. ej. cierre de acta RPO que puede tardar minutos). */
  const call = useCallback(async (method, path, body = null, reqOpts = null) => {
    const url = `${API}${path}`;
    const optsFetch = {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
    if (body) optsFetch.body = JSON.stringify(body);
    const intentos = reqOpts?.maxRetries ?? maxRetries;
    const timeoutPorIntentoMs =
      reqOpts && typeof reqOpts.timeoutMs === "number" ? reqOpts.timeoutMs : timeoutMs;
    let res;
    for (let i = 0; i < intentos; i++) {
      const intentoOpts = {};
      if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
        intentoOpts.signal = AbortSignal.timeout(timeoutPorIntentoMs);
      }
      try {
        res = await fetch(url, { ...optsFetch, ...intentoOpts });
        break;
      } catch (e) {
        if (!_esFalloRedTransitorio(e) || i === intentos - 1) {
          const raw = e && e.message ? String(e.message) : String(e);
          if (_esFalloRedTransitorio(e)) {
            throw new Error(
              `Sin conexión con el backend (${url}). Si es la primera carga del día, el servidor en Azure puede tardar más de un minuto en despertar: espera y vuelve a abrir el panel. ` +
                `Comprueba también red/VPN, bloqueadores y que el despliegue use la misma URL de API (VITE_API_URL).`,
            );
          }
          throw e instanceof Error ? e : new Error(raw);
        }
        await _sleep(1200 * (i + 1) + Math.random() * 400);
      }
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      // detail puede ser string (mensaje) o lista de objetos (errores de validación Pydantic)
      let msg = "Error del servidor";
      if (typeof err.detail === "string") msg = err.detail;
      else if (Array.isArray(err.detail)) msg = err.detail.map(e => e.msg).join(", ");
      else if (err.message) msg = err.message;
      throw new Error(msg);
    }
    const raw = await res.text();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      if (raw.trim().startsWith("<!")) {
        throw new Error(
          "El servidor devolvió HTML en lugar de JSON. Si trabajas en local, comprueba el proxy de Vite (ruta reenviada a FastAPI) o que VITE_API_URL apunte al API.",
        );
      }
      throw new Error("Respuesta no válida (no es JSON).");
    }
  }, [token, maxRetries, timeoutMs]);
  return call;
}

// Ejecuta fn en intervalo; fn se actualiza sin reiniciar el timer
function usePolling(fn, intervalMs) {
  const ref = useRef(fn);
  useEffect(() => { ref.current = fn; }, [fn]);
  useEffect(() => {
    const id = setInterval(() => ref.current(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

// ─── SECCIÓN 1: Gestión de Usuarios ───────────────────────────────────────
function SeccionUsuarios({ call, cargos, theme, userId }) {
  const [usuarios, setUsuarios] = useState([]);
  const [roles, setRoles] = useState([]);
  const [contratos, setContratos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(null);
  const [expandido, setExpandido] = useState(null);
  const [ucContratos, setUcContratos] = useState({});
  const [addingContrato, setAddingContrato] = useState({});
  const [subcontratistas, setSubcontratistas] = useState({});
  const [verifInactBusy, setVerifInactBusy] = useState(false);

  const col = C(theme);

  const cargar = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [udata, rdata, cdata] = await Promise.all([
        call("GET", "/admin/todos-usuarios"),
        call("GET", "/roles").catch(() => []),
        call("GET", "/admin/contratos-resumen").catch(() => []),
      ]);
      // Backend ya filtra Desarrollador (invisible para otros) pero lo muestra al propio Desarrollador
      setUsuarios(udata);
      setRoles(rdata);
      setContratos(cdata);
      const initEdits = {};
      udata.forEach(u => {
        initEdits[u.id] = {
          cargo_id: u.cargo_id || "",
          rol_id: u.rol_id || "",
          contrato_id: u.contrato_id || "",
          estado: u.estado || "",
          subcontratista_id: u.subcontratista_id || "",
          politicas_aceptadas: u.politicas_aceptadas === true,
        };
      });
      setEdits(prev => {
        const merged = { ...initEdits };
        Object.keys(prev).forEach(uid => { if (merged[uid]) merged[uid] = { ...merged[uid], ...prev[uid] }; });
        return merged;
      });
    } catch (e) {
      if (!silent) setMsg({ type: "error", text: e.message });
    } finally { if (!silent) setLoading(false); }
  }, [call]);

  useEffect(() => {
    cargar();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ejecutarVerificarInactividad = async () => {
    if (!window.confirm(
      "Esta acción revisa usuarios aprobados (excepto cargos de dirección/admin) con más de 7 días sin un registro LOGIN en el sistema, y los pone en estado pendiente / inactivos.\n\n¿Ejecutar ahora?"
    )) return;
    setVerifInactBusy(true);
    try {
      const r = await call("POST", "/admin/verificar-inactividad");
      const n = r && typeof r.afectados === "number" ? r.afectados : 0;
      setMsg({
        type: "success",
        text: n
          ? `Verificación completada: ${n} usuario(s) pasaron a pendiente por inactividad (revisa y reactiva si aplica).`
          : "Verificación completada: ningún usuario afectado.",
      });
      await cargar(true);
    } catch (e) {
      setMsg({ type: "error", text: e.message || "No se pudo ejecutar la verificación." });
    } finally {
      setVerifInactBusy(false);
    }
  };
  const setEdit = (uid, field, val) => setEdits(e => ({ ...e, [uid]: { ...e[uid], [field]: val } }));

  const guardar = async (uid) => {
    setSaving(uid);
    const e = edits[uid];
    const orig = usuarios.find(x => x.id === uid);
    // Convertir "" a null para campos int — Pydantic rechaza string vacío en Optional[int]
    const payload = {
      cargo_id:          e.cargo_id          ? parseInt(e.cargo_id)          : null,
      rol_id:            e.rol_id            ? parseInt(e.rol_id)            : null,
      contrato_id:       e.contrato_id       ? parseInt(e.contrato_id)       : null,
      estado:            e.estado            || null,
      subcontratista_id: e.subcontratista_id ? parseInt(e.subcontratista_id) : null,
    };
    if (orig && e.politicas_aceptadas !== undefined && e.politicas_aceptadas !== (orig.politicas_aceptadas === true)) {
      payload.politicas_aceptadas = e.politicas_aceptadas;
    }
    try {
      await call("PUT", `/admin/usuarios/${uid}`, payload);
      setMsg({ type: "success", text: "Usuario actualizado." });
      cargar(true);
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally { setSaving(null); }
  };

  const cargarUcContratos = async (uid) => {
    try {
      const data = await call("GET", `/admin/usuario-contratos/${uid}`);
      setUcContratos(p => ({ ...p, [uid]: data }));
    } catch { setUcContratos(p => ({ ...p, [uid]: [] })); }
  };

  const toggleExpandir = (uid) => {
    if (expandido === uid) { setExpandido(null); return; }
    setExpandido(uid);
    cargarUcContratos(uid);
    const u = usuarios.find(x => x.id === uid);
    if (u && u.cargo_nombre && u.cargo_nombre.toLowerCase() === 'subcontratista') {
      cargarSubcontratistas(uid, u.contrato_id);
    }
  };

  const agregarContrato = async (uid) => {
    const cid = addingContrato[uid];
    if (!cid) return;
    try {
      await call("POST", "/admin/usuario-contratos", { usuario_id: uid, contrato_id: parseInt(cid) });
      setMsg({ type: "success", text: "Contrato asignado." });
      cargarUcContratos(uid);
      setAddingContrato(p => ({ ...p, [uid]: "" }));
    } catch (e) { setMsg({ type: "error", text: e.message }); }
  };

  const quitarContrato = async (uid, cid) => {
    if (!window.confirm("¿Quitar este contrato al usuario?")) return;
    try {
      await call("DELETE", `/admin/usuario-contratos/${uid}/${cid}`);
      cargarUcContratos(uid);
    } catch (e) { setMsg({ type: "error", text: e.message }); }
  };

  const cargarSubcontratistas = async (uid, contrato_id) => {
    if (!contrato_id) return;
    try {
      const data = await call("GET", `/subcontratistas/${contrato_id}`);
      setSubcontratistas(p => ({ ...p, [uid]: data }));
    } catch { setSubcontratistas(p => ({ ...p, [uid]: [] })); }
  };

  const asignarSubcontratista = async (uid, subcontratista_id) => {
    try {
      await call("PUT", `/admin/usuarios/${uid}`, { subcontratista_id: subcontratista_id ? parseInt(subcontratista_id) : null });
      setMsg({ type: "success", text: "Subcontratista asignado." });
      setEdit(uid, "subcontratista_id", subcontratista_id);
      cargar(true);
    } catch (e) { setMsg({ type: "error", text: e.message }); }
  };

  const estadoBadge = { pendiente: "#f59e0b", aprobado: "#22c55e", rechazado: "#ef4444" };
  const tdStyle = S.td(theme);

  return (
    <div>
      {msg && (
        <div style={S.alert(msg.type)}>
          {msg.text}
          <span onClick={() => setMsg(null)} style={{ float: "right", cursor: "pointer", opacity: 0.6 }}>✕</span>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
        <button
          type="button"
          style={{ ...S.btn("ghost", true), opacity: verifInactBusy ? 0.7 : 1 }}
          disabled={verifInactBusy}
          onClick={() => void ejecutarVerificarInactividad()}
          title="Antes se ejecutaba sola al abrir esta pestaña y podía saturar el servidor. Úsala solo cuando quieras aplicar la política de 7 días."
        >
          {verifInactBusy ? "Verificando…" : "⏱ Verificar inactividad (7 días)"}
        </button>
        <span style={{ fontSize: "var(--cc-caption)", color: col.textSecondary, maxWidth: 520, lineHeight: 1.35 }}>
          El listado ya no ejecuta esta comprobación en automático (evita bloqueos largos y desactivaciones masivas si había problemas con los logs de LOGIN).
        </span>
      </div>
      {loading ? (
        <div style={S.empty}><div style={{ color: "#00afc5" }}>Cargando...</div></div>
      ) : usuarios.length === 0 ? (
        <div style={S.empty}>No hay usuarios registrados.</div>
      ) : (
        <table style={S.table}>
          <thead>
            <tr>
              {["Usuario", "Estado", "Cargo", "Rol", "Contrato principal", "Políticas", "Acciones"].map(h => (
                <th key={h} style={S.th(theme)}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usuarios.map(u => (
              <>
                <tr key={u.id}>
                  <td style={tdStyle}>
                    <div style={{ color: col.textPrimary, fontWeight: 500 }}>{u.nombre} {u.apellidos}</div>
                    <div style={{ fontSize: 11, color: col.textSecondary }}>{u.email}</div>
                  </td>
                  <td style={tdStyle}>
                    <select style={{ ...S.select, minWidth: 110, color: estadoBadge[edits[u.id]?.estado] || col.textTable }}
                      value={edits[u.id]?.estado || ""}
                      onChange={e => setEdit(u.id, "estado", e.target.value)}>
                      <option value="pendiente">🟡 Pendiente</option>
                      <option value="aprobado">🟢 Aprobado</option>
                      <option value="rechazado">🔴 Rechazado</option>
                    </select>
                  </td>
                  <td style={tdStyle}>
                    <select style={{ ...S.select, minWidth: 140 }}
                      value={edits[u.id]?.cargo_id || ""}
                      onChange={e => setEdit(u.id, "cargo_id", e.target.value)}>
                      <option value="">Sin cargo</option>
                      {cargos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </td>
                  <td style={tdStyle}>
                    <select style={{ ...S.select, minWidth: 130 }}
                      value={edits[u.id]?.rol_id || ""}
                      onChange={e => setEdit(u.id, "rol_id", e.target.value)}>
                      <option value="">Sin rol</option>
                      {roles.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                    </select>
                  </td>
                  <td style={tdStyle}>
                    <select style={{ ...S.select, minWidth: 150 }}
                      value={edits[u.id]?.contrato_id || ""}
                      onChange={e => setEdit(u.id, "contrato_id", e.target.value)}>
                      <option value="">Sin contrato</option>
                      {contratos.map(c => <option key={c.id} value={c.id}>{c.numero}</option>)}
                    </select>
                  </td>
                  <td style={tdStyle}>
                    <select
                      style={{ ...S.select, minWidth: 118 }}
                      value={edits[u.id]?.politicas_aceptadas ? "si" : "no"}
                      onChange={e => setEdit(u.id, "politicas_aceptadas", e.target.value === "si")}
                    >
                      <option value="si">Sí</option>
                      <option value="no">Pendiente</option>
                    </select>
                    <div style={{ fontSize: 10, color: col.textSecondary, marginTop: 6, lineHeight: 1.35 }}>
                      {u.politicas_version ? <>v{u.politicas_version}</> : "—"}
                      {u.politicas_fecha ? (
                        <span style={{ display: "block" }}>
                          {new Date(u.politicas_fecha).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button style={S.btn("primary", true)} disabled={saving === u.id} onClick={() => guardar(u.id)}>
                        {saving === u.id ? "..." : "💾"}
                      </button>
                      <button style={S.btn("ghost", true)} title="Gestionar contratos" onClick={() => toggleExpandir(u.id)}>
                        {expandido === u.id ? "▲" : "📋"}
                      </button>
                    </div>
                  </td>
                </tr>
                {expandido === u.id && (
                  <tr key={`uc-${u.id}`}>
                    <td colSpan={7} style={{ ...tdStyle, background: "rgba(0,175,197,0.04)", padding: "12px 20px" }}>
                      <div style={{ fontSize: 12, color: "#00afc5", marginBottom: 8, fontWeight: 600 }}>
                        Contratos autorizados para {u.nombre}:
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                        {(ucContratos[u.id] || []).map(c => (
                          <span key={c.id} style={{ background: "rgba(0,175,197,0.1)", border: "1px solid rgba(0,175,197,0.3)", borderRadius: 6, padding: "4px 10px", fontSize: 12, color: "#8acdd8", display: "flex", alignItems: "center", gap: 6 }}>
                            {c.numero}
                            <span style={{ cursor: "pointer", color: "#ef4444", fontWeight: 700 }} onClick={() => quitarContrato(u.id, c.id)}>×</span>
                          </span>
                        ))}
                        {(ucContratos[u.id] || []).length === 0 && <span style={{ color: col.textSecondary, fontSize: 12 }}>Sin contratos asignados</span>}
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <select style={{ ...S.select, minWidth: 180 }}
                          value={addingContrato[u.id] || ""}
                          onChange={e => setAddingContrato(p => ({ ...p, [u.id]: e.target.value }))}>
                          <option value="">+ Agregar contrato...</option>
                          {contratos.map(c => <option key={c.id} value={c.id}>{c.numero}</option>)}
                        </select>
                        <button style={S.btn("primary", true)} onClick={() => agregarContrato(u.id)}>Asignar</button>
                      </div>
                      {u.cargo_nombre && u.cargo_nombre.toLowerCase() === 'subcontratista' && (
                        <div style={{ marginTop: 16, borderTop: "1px solid rgba(0,175,197,0.15)", paddingTop: 12 }}>
                          <div style={{ fontSize: 12, color: "#00afc5", marginBottom: 8, fontWeight: 600 }}>
                            Subcontratista asignado:
                          </div>
                          {u.subcontratista_id ? (
                            <div style={{ fontSize: 12, color: col.textSecondary, marginBottom: 8 }}>
                              Actual: {(subcontratistas[u.id] || []).find(s => s.id === u.subcontratista_id)?.razon_social || `ID ${u.subcontratista_id}`}
                            </div>
                          ) : (
                            <div style={{ fontSize: 12, color: "#f59e0b", marginBottom: 8 }}>Sin subcontratista asignado — el usuario no tiene acceso.</div>
                          )}
                          <div style={{ display: "flex", gap: 8 }}>
                            <select style={{ ...S.select, minWidth: 220 }}
                              value={edits[u.id]?.subcontratista_id || ""}
                              onChange={e => setEdit(u.id, "subcontratista_id", e.target.value)}>
                              <option value="">Sin subcontratista</option>
                              {(subcontratistas[u.id] || []).map(s => (
                                <option key={s.id} value={s.id}>{s.razon_social}</option>
                              ))}
                            </select>
                            <button style={S.btn("primary", true)}
                              onClick={() => asignarSubcontratista(u.id, edits[u.id]?.subcontratista_id)}>
                              Asignar
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── SECCIÓN 2: CRUD Cargos ────────────────────────────────────────────────
function SeccionCargos({ call, cargos, recargarCargos, theme }) {
  const [nuevo, setNuevo] = useState("");
  const [msg, setMsg] = useState(null);
  const [eliminando, setEliminando] = useState(null);
  const col = C(theme);
  const tdStyle = S.td(theme);

  const crear = async () => {
    const nombre = nuevo.trim();
    if (!nombre) return;
    try {
      await call("POST", "/admin/cargos", { nombre });
      setMsg({ type: "success", text: `Cargo "${nombre}" creado.` });
      setNuevo("");
      recargarCargos();
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    }
  };

  const eliminar = async (id, nombre) => {
    if (!window.confirm(`¿Eliminar el cargo "${nombre}"? Los usuarios con este cargo perderán el acceso.`)) return;
    setEliminando(id);
    try {
      await call("DELETE", `/admin/cargos/${id}`);
      setMsg({ type: "success", text: `Cargo "${nombre}" eliminado.` });
      recargarCargos();
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setEliminando(null);
    }
  };

  return (
    <div>
      {msg && (
        <div style={S.alert(msg.type)}>
          {msg.text}
          <span onClick={() => setMsg(null)} style={{ float: "right", cursor: "pointer", opacity: 0.6 }}>✕</span>
        </div>
      )}
      <div style={S.card}>
        <div style={S.cardTitle}>Nuevo cargo</div>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            style={{ ...S.input, flex: 1 }}
            placeholder="Nombre del cargo (ej: Residente de obra)"
            value={nuevo}
            onChange={e => setNuevo(e.target.value)}
            onKeyDown={e => e.key === "Enter" && crear()}
          />
          <button style={{ ...S.btn("primary"), whiteSpace: "nowrap" }} onClick={crear}>
            + Agregar
          </button>
        </div>
      </div>
      <table style={S.table}>
        <thead>
          <tr>
            {["#", "Nombre del cargo", "Acción"].map(h => <th key={h} style={S.th(theme)}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {cargos.map((c, i) => (
            <tr key={c.id}>
              <td style={{ ...tdStyle, color: col.textMuted, width: 40 }}>{i + 1}</td>
              <td style={tdStyle}><span style={{ color: col.textTable }}>{c.nombre}</span></td>
              <td style={tdStyle}>
                <button style={S.btn("danger", true)} disabled={eliminando === c.id} onClick={() => eliminar(c.id, c.nombre)}>
                  {eliminando === c.id ? "..." : "Eliminar"}
                </button>
              </td>
            </tr>
          ))}
          {cargos.length === 0 && (
            <tr><td colSpan={3} style={{ ...tdStyle, ...S.empty }}>Sin cargos registrados.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── SECCIÓN 3: Control de accesos ─────────────────────────────────────────
function SeccionPermisos({ call, cargos, theme }) {
  const [cargoId, setCargoId] = useState("");
  const [funciones, setFunciones] = useState([]);
  const [permisos, setPermisos] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const col = C(theme);

  const cargarPermisos = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    try {
      const [fns, perms] = await Promise.all([
        call("GET", "/funciones").catch(() => []),
        call("GET", `/admin/permisos/${id}`).catch(() => []),
      ]);
      setFunciones(fns);
      const mapa = {};
      fns.forEach(f => {
        mapa[f.id] = {};
        ACCIONES.forEach(a => { mapa[f.id][a] = false; });
      });
      perms.forEach(p => {
        if (mapa[p.funcion_id]) {
          ACCIONES.forEach(a => {
            if (p[a] !== undefined) mapa[p.funcion_id][a] = p[a];
          });
        }
      });
      setPermisos(mapa);
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => { cargarPermisos(cargoId); }, [cargoId, cargarPermisos]);

  const togglePermiso = (funcion_id, accion) => {
    setPermisos(p => ({ ...p, [funcion_id]: { ...p[funcion_id], [accion]: !p[funcion_id][accion] } }));
  };

  const toggleFilaCompleta = (funcion_id) => {
    const fila = permisos[funcion_id] || {};
    const todoActivo = ACCIONES.every(a => fila[a]);
    setPermisos(p => ({ ...p, [funcion_id]: Object.fromEntries(ACCIONES.map(a => [a, !todoActivo])) }));
  };

  const guardar = async () => {
    if (!cargoId) return;
    setSaving(true);
    try {
      const payload = funciones.map(f => ({
        cargo_id: parseInt(cargoId),
        funcion_id: f.id,
        ...Object.fromEntries(ACCIONES.map(a => [a, permisos[f.id]?.[a] ?? false])),
      }));
      await call("POST", "/admin/permisos", payload);
      setMsg({ type: "success", text: "Permisos guardados correctamente." });
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setSaving(false);
    }
  };

  const accionColor = {
    ver: "#8acdd8", crear: "#22c55e", editar: "#f59e0b",
    eliminar: "#ef4444", validar: "#a78bfa", exportar: "#38bdf8",
  };

  const tdStyle = S.td(theme);

  return (
    <div>
      {msg && (
        <div style={S.alert(msg.type)}>
          {msg.text}
          <span onClick={() => setMsg(null)} style={{ float: "right", cursor: "pointer", opacity: 0.6 }}>✕</span>
        </div>
      )}
      <div style={{ ...S.card, display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
        <div style={{ color: col.textSecondary, fontSize: 13, whiteSpace: "nowrap" }}>Cargo a configurar:</div>
        <select style={{ ...S.select, flex: 1, maxWidth: 280 }} value={cargoId} onChange={e => setCargoId(e.target.value)}>
          <option value="">-- Selecciona un cargo --</option>
          {cargos.filter(c => c.nombre.toLowerCase() !== "desarrollador").map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        {cargoId && (
          <button style={S.btn("primary", true)} onClick={guardar} disabled={saving}>
            {saving ? "Guardando..." : "💾 Guardar cambios"}
          </button>
        )}
      </div>
      {cargoId && !loading && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {ACCIONES.map(a => (
            <span key={a} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: `${accionColor[a]}18`, border: `1px solid ${accionColor[a]}44`, color: accionColor[a], fontWeight: 600, textTransform: "capitalize" }}>
              {a}
            </span>
          ))}
        </div>
      )}
      {!cargoId ? (
        <div style={S.empty}>Selecciona un cargo para configurar su control de accesos.</div>
      ) : loading ? (
        <div style={S.empty}><div style={{ color: "#00afc5" }}>Cargando permisos...</div></div>
      ) : funciones.length === 0 ? (
        <div style={S.empty}>No hay funciones registradas en el sistema.</div>
      ) : (
        <div style={{ background: "#081318", borderRadius: 8, border: "1px solid rgba(0,175,197,0.1)", overflow: "hidden", maxHeight: "min(72vh, 820px)", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "grid", gridTemplateColumns: `220px repeat(${ACCIONES.length}, 1fr) 80px`, background: "#06101a", borderBottom: "1px solid rgba(0,175,197,0.15)", flexShrink: 0 }}>
            <div style={{ ...S.th(theme), padding: "12px 16px" }}>Función</div>
            {ACCIONES.map(a => (
              <div key={a} style={{ ...S.th(theme), textAlign: "center", padding: "12px 4px", color: accionColor[a] }}>{a}</div>
            ))}
            <div style={{ ...S.th(theme), textAlign: "center" }}>Todo</div>
          </div>
          <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
          {funciones.map((f, idx) => {
            const fila = permisos[f.id] || {};
            const todoActivo = ACCIONES.every(a => fila[a]);
            return (
              <div key={f.id} style={{ display: "grid", gridTemplateColumns: `220px repeat(${ACCIONES.length}, 1fr) 80px`, background: idx % 2 === 0 ? "transparent" : "rgba(0,175,197,0.025)", borderBottom: "1px solid rgba(255,255,255,0.03)", alignItems: "center" }}>
                <div style={{ ...tdStyle, padding: "10px 16px" }}>
                  <span style={{ color: "#8acdd8", fontSize: 13 }}>{f.nombre}</span>
                  {f.descripcion && <div style={{ fontSize: 11, color: "#2a5a6a", marginTop: 1 }}>{f.descripcion}</div>}
                </div>
                {ACCIONES.map(a => (
                  <div key={a} style={{ textAlign: "center", padding: "10px 4px" }}>
                    <div onClick={() => togglePermiso(f.id, a)} style={{ width: 22, height: 22, borderRadius: 5, margin: "0 auto", cursor: "pointer", border: `1.5px solid ${fila[a] ? accionColor[a] : "rgba(255,255,255,0.1)"}`, background: fila[a] ? `${accionColor[a]}22` : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: accionColor[a], transition: "all 0.15s" }}>
                      {fila[a] ? "✓" : ""}
                    </div>
                  </div>
                ))}
                <div style={{ textAlign: "center", padding: "10px 4px" }}>
                  <div onClick={() => toggleFilaCompleta(f.id)} title={todoActivo ? "Desactivar todos" : "Activar todos"} style={{ width: 22, height: 22, borderRadius: 5, margin: "0 auto", cursor: "pointer", border: `1.5px solid ${todoActivo ? "#00afc5" : "rgba(255,255,255,0.12)"}`, background: todoActivo ? "rgba(0,175,197,0.2)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#00afc5", transition: "all 0.15s" }}>
                    {todoActivo ? "★" : "☆"}
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SECCIÓN PÁGINA DE INICIO (novedades) ─────────────────────────────────────
function SeccionInicioNovedades({ call, theme, token, isDeveloper, user, contratos = [] }) {
  const col = C(theme);
  const esAdminSolo = !isDeveloper && (user?.cargo_nombre || "").toLowerCase() === "administrador";
  const emptyForm = () => ({
    titulo: "",
    resumen: "",
    tipo: "actualización",
    fecha: "",
    autor: "Equipo ClaraCore",
    icono: NOVEDAD_ICONO_POR_TIPO["actualización"],
    color: "#00B4C6",
    imagen_url: "",
    alcance: "global",
    contrato_id: "",
  });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [mejorandoResumen, setMejorandoResumen] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await call("GET", "/admin/inicio/novedades");
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setMsg({ type: "error", text: e.message || "No se pudieron cargar las novedades (¿tabla inicio_novedades en Supabase?)" });
    }
    setLoading(false);
  }, [call]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const abrirNueva = () => {
    setEditing("new");
    setForm(emptyForm());
    setMsg(null);
  };

  const abrirEditar = (row) => {
    setEditing(row.id);
    const tipoR = row.tipo || "actualización";
    const cid = row.contrato_id;
    setForm({
      titulo: row.titulo || "",
      resumen: row.resumen || "",
      tipo: tipoR,
      fecha: (row.fecha && String(row.fecha).slice(0, 10)) || "",
      autor: row.autor || "Equipo ClaraCore",
      icono: row.icono || NOVEDAD_ICONO_POR_TIPO[tipoR] || "📢",
      color: row.color || "#00B4C6",
      imagen_url: row.imagen_url || "",
      alcance: cid == null || cid === "" ? "global" : "contrato",
      contrato_id: cid != null && cid !== "" ? String(cid) : "",
    });
    setMsg(null);
  };

  const cerrarForm = () => {
    setEditing(null);
    setForm(emptyForm());
  };

  const guardar = async () => {
    if (!form.titulo.trim()) {
      setMsg({ type: "error", text: "El título es obligatorio." });
      return;
    }
    if (isDeveloper && form.alcance === "contrato" && !form.contrato_id) {
      setMsg({ type: "error", text: "Elige un contrato o deja la novedad como global." });
      return;
    }
    setSaving(true);
    setMsg(null);
    const payload = {
      titulo: form.titulo.trim(),
      resumen: (form.resumen || "").trim(),
      tipo: form.tipo || "actualización",
      fecha: form.fecha ? form.fecha.slice(0, 10) : null,
      autor: (form.autor || "").trim() || "Equipo ClaraCore",
      icono: (form.icono || NOVEDAD_ICONO_POR_TIPO[form.tipo] || "📢").trim() || "📢",
      color: form.color || "#00B4C6",
      imagen_url: (form.imagen_url || "").trim() || null,
    };
    if (isDeveloper) {
      if (form.alcance === "global") payload.contrato_id = null;
      else if (form.contrato_id) payload.contrato_id = parseInt(form.contrato_id, 10);
      else payload.contrato_id = null;
    }
    try {
      if (editing === "new") {
        await call("POST", "/admin/inicio/novedades", payload);
      } else {
        await call("PATCH", `/admin/inicio/novedades/${editing}`, payload);
      }
      cerrarForm();
      await cargar();
      setMsg({ type: "success", text: "Guardado correctamente." });
    } catch (e) {
      setMsg({ type: "error", text: e.message || "Error al guardar" });
    }
    setSaving(false);
  };

  const eliminar = async (id) => {
    if (!window.confirm("¿Eliminar esta novedad de la página de inicio?")) return;
    try {
      await call("DELETE", `/admin/inicio/novedades/${id}`);
      if (editing === id) cerrarForm();
      await cargar();
      setMsg({ type: "success", text: "Novedad eliminada." });
    } catch (e) {
      setMsg({ type: "error", text: e.message || "Error al eliminar" });
    }
  };

  const subirImagen = async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`${API_BASE}/admin/inicio/novedades/imagen`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const errBody = await res.json().catch(() => ({}));
      if (!res.ok) {
        const d = errBody.detail;
        throw new Error(typeof d === "string" ? d : res.statusText);
      }
      if (errBody.url) setForm((p) => ({ ...p, imagen_url: errBody.url }));
    } catch (e) {
      setMsg({ type: "error", text: e.message || "Error al subir imagen" });
    }
    ev.target.value = "";
  };

  const mejorarResumenIa = async () => {
    const borrador = (form.resumen || "").trim();
    if (!borrador) {
      setMsg({ type: "error", text: "Escribe un borrador en el resumen antes de usar la IA." });
      return;
    }
    setMejorandoResumen(true);
    setMsg(null);
    try {
      const res = await call("POST", "/admin/inicio/novedades/mejorar-texto", { texto: borrador });
      if (res.texto) setForm((p) => ({ ...p, resumen: res.texto }));
      if (res.sin_ia) {
        setMsg({
          type: "error",
          text: "El servidor no tiene ANTHROPIC_API_KEY; no se puede mejorar el texto. Revisa la configuración del backend.",
        });
      } else {
        setMsg({ type: "success", text: "Redacción actualizada. Revísala antes de guardar." });
      }
    } catch (e) {
      setMsg({ type: "error", text: e.message || "Error al mejorar el texto" });
    }
    setMejorandoResumen(false);
  };

  const fmtCreada = (iso) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
    } catch {
      return String(iso).slice(0, 19);
    }
  };

  const labelStyle = { fontSize: 11, color: col.textMuted, marginBottom: 4, fontWeight: 600 };
  const inputStyle = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 6,
    border: `1px solid ${col.borderColor}`,
    background: col.bgInput,
    color: col.textTable,
    fontSize: 13,
    boxSizing: "border-box",
  };

  const labelAlcance = (row) => {
    if (row.contrato_id == null || row.contrato_id === "") return "Todos los contratos";
    const c = contratos.find((x) => String(x.id) === String(row.contrato_id));
    return c ? `Contrato ${c.numero || row.contrato_id}` : `Contrato #${row.contrato_id}`;
  };

  const puedeEditarFila = (row) => {
    if (isDeveloper) return true;
    if (esAdminSolo && row.contrato_id != null) return true;
    return false;
  };

  return (
    <div>
      <div
        style={{
          marginBottom: 16,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 12, color: col.textSecondary, flex: "1 1 220px", lineHeight: 1.45 }}>
          {isDeveloper
            ? "Como Desarrollador, las novedades sin contrato se muestran en todos los contratos. El administrador del contrato publica solo para su equipo."
            : "Las novedades que crees solo las verá tu contrato. Las globales (equipo ClaraCore) las gestiona el Desarrollador."}
        </span>
        <button type="button" onClick={abrirNueva} style={{ ...S.btn("primary"), flexShrink: 0, padding: "8px 14px", fontSize: 13 }}>
          ＋ Nueva novedad
        </button>
      </div>
      {msg && (
        <div
          style={{
            ...S.alert(msg.type),
            marginBottom: 14,
          }}
        >
          {msg.text}
        </div>
      )}

      {editing !== null && (
        <div
          style={{
            background: col.bgCard,
            border: `1px solid ${col.borderColor}`,
            borderRadius: 10,
            padding: 16,
            marginBottom: 20,
          }}
        >
          <div style={{ fontWeight: 700, color: col.textPrimary, marginBottom: 12 }}>
            {editing === "new" ? "Nueva novedad" : `Editar novedad #${editing}`}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={labelStyle}>Título *</div>
              <input style={inputStyle} value={form.titulo} onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))} />
            </div>
            {isDeveloper && (
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={labelStyle}>Alcance de publicación</div>
                <select
                  style={inputStyle}
                  value={form.alcance}
                  onChange={(e) => setForm((p) => ({ ...p, alcance: e.target.value, contrato_id: e.target.value === "global" ? "" : p.contrato_id }))}
                >
                  <option value="global">Todos los contratos (novedad global)</option>
                  <option value="contrato">Solo un contrato</option>
                </select>
                {form.alcance === "contrato" && (
                  <select
                    style={{ ...inputStyle, marginTop: 8 }}
                    value={form.contrato_id}
                    onChange={(e) => setForm((p) => ({ ...p, contrato_id: e.target.value }))}
                  >
                    <option value="">— Elegir contrato —</option>
                    {contratos.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.numero || c.id}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
            {!isDeveloper && esAdminSolo && user?.contrato_id && (
              <div style={{ gridColumn: "1 / -1", fontSize: 12, color: col.textSecondary, padding: "6px 0" }}>
                Se publicará para usuarios de <strong style={{ color: col.textTable }}>tu contrato asignado</strong> (administrador de contrato).
              </div>
            )}
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                <div style={labelStyle}>Resumen</div>
                <button
                  type="button"
                  onClick={mejorarResumenIa}
                  disabled={mejorandoResumen}
                  style={{
                    ...S.btn("ghost"),
                    fontSize: 12,
                    padding: "6px 12px",
                    opacity: mejorandoResumen ? 0.65 : 1,
                    cursor: mejorandoResumen ? "wait" : "pointer",
                  }}
                >
                  {mejorandoResumen ? "⏳ Mejorando…" : "✨ Mejorar redacción (IA)"}
                </button>
              </div>
              <textarea
                style={{ ...inputStyle, minHeight: 96, resize: "vertical" }}
                value={form.resumen}
                onChange={(e) => setForm((p) => ({ ...p, resumen: e.target.value }))}
                placeholder="Describe el cambio o la novedad; puedes pulsar el botón de IA para pulir el texto."
              />
            </div>
            <div>
              <div style={labelStyle}>Tipo</div>
              <select
                style={inputStyle}
                value={form.tipo}
                onChange={(e) => {
                  const tipo = e.target.value;
                  setForm((p) => ({
                    ...p,
                    tipo,
                    icono: NOVEDAD_ICONO_POR_TIPO[tipo] ?? p.icono,
                  }));
                }}
              >
                {["actualización", "mejora", "corrección", "aviso"].map((x) => (
                  <option key={x} value={x}>
                    {x} {NOVEDAD_ICONO_POR_TIPO[x] ? ` ${NOVEDAD_ICONO_POR_TIPO[x]}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div style={labelStyle}>Fecha</div>
              <input type="date" style={inputStyle} value={form.fecha} onChange={(e) => setForm((p) => ({ ...p, fecha: e.target.value }))} />
            </div>
            <div>
              <div style={labelStyle}>Autor</div>
              <input style={inputStyle} value={form.autor} onChange={(e) => setForm((p) => ({ ...p, autor: e.target.value }))} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={labelStyle}>
                Icono{" "}
                <span style={{ fontWeight: 400, opacity: 0.85 }}>
                  (sugerido al cambiar el tipo; elige otro del catálogo si quieres)
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  padding: "10px 8px",
                  borderRadius: 8,
                  border: `1px solid ${col.borderColor}`,
                  background: col.bgInput,
                  maxHeight: 140,
                  overflowY: "auto",
                }}
              >
                {NOVEDAD_ICONOS_CATALOGO.map((em) => (
                  <button
                    key={em}
                    type="button"
                    title={em}
                    onClick={() => setForm((p) => ({ ...p, icono: em }))}
                    style={{
                      fontSize: 22,
                      lineHeight: 1,
                      width: 40,
                      height: 40,
                      padding: 0,
                      cursor: "pointer",
                      border:
                        form.icono === em
                          ? "2px solid #00afc5"
                          : `1px solid ${col.borderColor}`,
                      borderRadius: 8,
                      background: form.icono === em ? "rgba(0,175,197,0.12)" : "transparent",
                    }}
                  >
                    {em}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: col.textMuted }}>
                Seleccionado: <strong style={{ color: col.textTable }}>{form.icono || "—"}</strong> · Por tipo «{form.tipo}»:{" "}
                {NOVEDAD_ICONO_POR_TIPO[form.tipo] || "—"}
              </div>
            </div>
            <div>
              <div style={labelStyle}>Color acento</div>
              <input type="color" style={{ ...inputStyle, height: 36, padding: 4 }} value={form.color} onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={labelStyle}>Imagen de contexto (opcional)</div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ ...S.btn("ghost"), cursor: "pointer", margin: 0 }}>
                  Subir imagen
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={subirImagen} />
                </label>
                {form.imagen_url ? (
                  <span style={{ fontSize: 11, color: col.textMuted, wordBreak: "break-all" }}>{form.imagen_url}</span>
                ) : null}
                {form.imagen_url ? (
                  <button type="button" style={{ ...S.btn("ghost"), fontSize: 12 }} onClick={() => setForm((p) => ({ ...p, imagen_url: "" }))}>
                    Quitar imagen
                  </button>
                ) : null}
              </div>
              {form.imagen_url ? (
                <img
                  src={form.imagen_url}
                  alt=""
                  style={{ marginTop: 8, maxWidth: 320, maxHeight: 160, objectFit: "cover", borderRadius: 8, border: `1px solid ${col.borderColor}` }}
                />
              ) : null}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button type="button" style={S.btn("primary")} disabled={saving} onClick={guardar}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button type="button" style={S.btn("ghost")} onClick={cerrarForm}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={S.empty}>Cargando…</div>
      ) : items.length === 0 ? (
        <div style={S.empty}>No hay novedades. Crea una con el botón superior.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th(theme)}>Creada</th>
                <th style={S.th(theme)}>Fecha (aviso)</th>
                <th style={S.th(theme)}>Título</th>
                <th style={S.th(theme)}>Tipo</th>
                <th style={S.th(theme)}>Alcance</th>
                <th style={{ ...S.th(theme), textAlign: "right" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td style={S.td(theme)}>{fmtCreada(row.created_at)}</td>
                  <td style={S.td(theme)}>{row.fecha ? String(row.fecha).slice(0, 10) : "—"}</td>
                  <td style={S.td(theme)}>{row.titulo}</td>
                  <td style={S.td(theme)}>{row.tipo}</td>
                  <td style={S.td(theme)}>{labelAlcance(row)}</td>
                  <td style={{ ...S.td(theme), textAlign: "right", whiteSpace: "nowrap" }}>
                    {puedeEditarFila(row) ? (
                      <>
                        <button type="button" style={{ ...S.btn("ghost"), fontSize: 12, padding: "4px 10px" }} onClick={() => abrirEditar(row)}>
                          Editar
                        </button>
                        <button
                          type="button"
                          style={{ ...S.btn("ghost"), fontSize: 12, padding: "4px 10px", color: "#ef4444", borderColor: "rgba(239,68,68,0.35)" }}
                          onClick={() => eliminar(row.id)}
                        >
                          Eliminar
                        </button>
                      </>
                    ) : (
                      <span style={{ fontSize: 11, color: col.textSecondary }}>Solo Desarrollador</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── SECCIÓN LOGS ─────────────────────────────────────────────────────────────
function SeccionLogs({ call, theme }) {
  const col = C(theme)
  const token = localStorage.getItem("cc_token") || sessionStorage.getItem("cc_token")

  const [logs,          setLogs]          = useState([])
  const [usuarios,      setUsuarios]      = useState([])
  const [loading,       setLoading]       = useState(false)
  const [logSelec,      setLogSelec]      = useState(null)
  const [historial,     setHistorial]     = useState([])
  const [histLoading,   setHistLoading]   = useState(false)

  // Filtros
  const [filtUsuario,   setFiltUsuario]   = useState("")
  const [filtModulo,    setFiltModulo]    = useState("")
  const [filtAccion,    setFiltAccion]    = useState("")
  const [filtCategoria, setFiltCategoria] = useState("")
  const [filtSeveridad, setFiltSeveridad] = useState("")
  const [filtDesde,     setFiltDesde]     = useState("")
  const [filtHasta,     setFiltHasta]     = useState("")
  /** Por defecto activo: con muchos usuarios los LOGIN recientes ocupan toda la página y parece que no hay auditoría de obra/presupuesto. */
  const [filtOcultarLogin, setFiltOcultarLogin] = useState(true)
  const [offset,        setOffset]        = useState(0)
  const LIMIT = 100

  const MODULOS = ["AUTH","SICOE","PRESUPUESTO","COBRO","USUARIOS","CONTRATOS","PERMISOS","PRECIOS","SISTEMA","INFORMES","NOTIFICACIONES","ACTAS","SUBCONTRATISTAS"]
  const ACCIONES = ["LOGIN","LOGOUT","LOGIN_FAIL","APROBAR","RECHAZAR","EDITAR","RECALCULAR","VALIDAR","COMENTAR","CONSULTAR","ASIGNAR_ITEM","MOVER","IMPORTAR","CREAR","ELIMINAR","EXPORTAR","ERROR_SISTEMA","DEPLOY","BROADCAST"]
  const CATEGORIAS = ["auditoria", "sistema"]
  const SEVERIDADES = ["INFO", "WARNING", "ERROR", "AUDIT"]
  const ACCION_COLOR = {
    LOGIN:"#0077B6", APROBAR:"#10B981", RECHAZAR:"#EF4444",
    EDITAR:"#F59E0B", RECALCULAR:"#7C3AED", VALIDAR:"#00A896", COMENTAR:"#0EA5E9",
    IMPORTAR:"#2E86AB", CREAR:"#16A34A", ELIMINAR:"#DC2626"
  }
  /** Evita re-renders cuando el poll de fondo trae el mismo JSON que la vista actual */
  const lastLogsPayloadRef = useRef("")

  useEffect(() => {
    fetch(`${API}/logs/usuarios-lista`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : []).then(setUsuarios).catch(() => {})
  }, [])

  useEffect(() => { cargarLogs(0) }, [filtUsuario, filtModulo, filtAccion, filtCategoria, filtSeveridad, filtDesde, filtHasta, filtOcultarLogin])

  const POLL_MS = 180000
  useEffect(() => {
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return
      void cargarLogs(offset, { silent: true })
    }
    const iv = setInterval(tick, POLL_MS)
    const onVis = () => {
      if (document.visibilityState === "visible") tick()
    }
    document.addEventListener("visibilitychange", onVis)
    return () => {
      clearInterval(iv)
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [offset, filtUsuario, filtModulo, filtAccion, filtCategoria, filtSeveridad, filtDesde, filtHasta, filtOcultarLogin])

  async function cargarLogs(off = 0, opts = {}) {
    const { silent = false } = opts
    if (!silent) {
      setLoading(true)
      setOffset(off)
    }
    const params = new URLSearchParams({ limit: LIMIT, offset: off })
    if (filtUsuario) params.set("usuario_id", filtUsuario)
    if (filtModulo)  params.set("modulo",     filtModulo)
    if (filtAccion)  params.set("accion",     filtAccion)
    if (filtCategoria) params.set("categoria", filtCategoria)
    if (filtSeveridad) params.set("severidad", filtSeveridad)
    if (filtDesde)   params.set("fecha_desde",filtDesde)
    if (filtHasta)   params.set("fecha_hasta",filtHasta)
    if (filtOcultarLogin && !filtAccion) params.set("excluir_rutina_auth", "true")
    const data = await fetch(`${API}/logs?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : []).catch(() => [])
    if (silent) {
      const nextJson = JSON.stringify(data)
      if (nextJson === lastLogsPayloadRef.current) {
        return
      }
      lastLogsPayloadRef.current = nextJson
      startTransition(() => setLogs(data))
      return
    }
    lastLogsPayloadRef.current = JSON.stringify(data)
    setLogs(data)
    setLoading(false)
  }

  async function abrirHistorial(log) {
    setLogSelec(log); setHistLoading(true); setHistorial([])
    if (log.entidad_tipo && log.entidad_id) {
      const data = await fetch(`${API}/logs/entidad/${log.entidad_tipo}/${log.entidad_id}`,
        { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : []).catch(() => [])
      setHistorial(data)
    }
    setHistLoading(false)
  }

  const fmtFecha = (iso) => formatFechaLogBogota(iso)
  const tdS = { padding:"8px 10px", fontSize:12, borderBottom:`1px solid ${col.border}`, color: col.textTable }
  const thS = { padding:"8px 10px", fontSize:11, fontWeight:700, color: col.textMuted, borderBottom:`1px solid ${col.border}`, textAlign:"left", whiteSpace:"nowrap" }

  return (
    <div>
      {/* Filtros */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16, padding:"12px 16px", background: col.bgCard, borderRadius:10, border:`1px solid ${col.border}` }}>
        <select value={filtUsuario} onChange={e => setFiltUsuario(e.target.value)}
          style={{ background: col.inputBg, border:`1px solid ${col.border}`, borderRadius:6, padding:"5px 10px", color: col.textTable, fontSize:12, cursor:"pointer" }}>
          <option value="">👤 Todos los usuarios</option>
          {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre} · {u.cargo}</option>)}
        </select>
        <select value={filtModulo} onChange={e => setFiltModulo(e.target.value)}
          style={{ background: col.inputBg, border:`1px solid ${col.border}`, borderRadius:6, padding:"5px 10px", color: col.textTable, fontSize:12, cursor:"pointer" }}>
          <option value="">📦 Todos los módulos</option>
          {MODULOS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={filtAccion} onChange={e => setFiltAccion(e.target.value)}
          style={{ background: col.inputBg, border:`1px solid ${col.border}`, borderRadius:6, padding:"5px 10px", color: col.textTable, fontSize:12, cursor:"pointer" }}>
          <option value="">⚡ Todas las acciones</option>
          {ACCIONES.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filtCategoria} onChange={e => setFiltCategoria(e.target.value)}
          style={{ background: col.inputBg, border:`1px solid ${col.border}`, borderRadius:6, padding:"5px 10px", color: col.textTable, fontSize:12, cursor:"pointer" }}>
          <option value="">📂 Categoría</option>
          {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filtSeveridad} onChange={e => setFiltSeveridad(e.target.value)}
          style={{ background: col.inputBg, border:`1px solid ${col.border}`, borderRadius:6, padding:"5px 10px", color: col.textTable, fontSize:12, cursor:"pointer" }}>
          <option value="">⚠️ Severidad</option>
          {SEVERIDADES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="date" value={filtDesde} onChange={e => setFiltDesde(e.target.value)}
          style={{ background: col.inputBg, border:`1px solid ${col.border}`, borderRadius:6, padding:"5px 10px", color: col.textTable, fontSize:12 }} />
        <input type="date" value={filtHasta} onChange={e => setFiltHasta(e.target.value)}
          style={{ background: col.inputBg, border:`1px solid ${col.border}`, borderRadius:6, padding:"5px 10px", color: col.textTable, fontSize:12 }} />
        <label style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:12, color: col.textTable, cursor:"pointer", userSelect:"none" }}
          title="Excluye LOGIN y LOGIN_FAIL en el servidor; así la primera página muestra validaciones y demás acciones de negocio.">
          <input type="checkbox" checked={filtOcultarLogin} onChange={e => setFiltOcultarLogin(e.target.checked)} />
          Ocultar rutina de autenticación
        </label>
        <button onClick={() => { setFiltUsuario(""); setFiltModulo(""); setFiltAccion(""); setFiltCategoria(""); setFiltSeveridad(""); setFiltDesde(""); setFiltHasta(""); setFiltOcultarLogin(true) }}
          style={{ background:"#EF444422", border:"1px solid #EF444466", borderRadius:6, padding:"5px 12px", color:"#EF4444", fontSize:11, fontWeight:700, cursor:"pointer" }}>
          ✕ Limpiar
        </button>
        <button onClick={() => cargarLogs(0)}
          style={{ background:"#0077B622", border:"1px solid #0077B666", borderRadius:6, padding:"5px 12px", color:"#0077B6", fontSize:11, fontWeight:700, cursor:"pointer" }}>
          🔄 Actualizar
        </button>
        <button type="button" onClick={async () => {
          const params = new URLSearchParams({ max_rows: "8000" })
          if (filtUsuario) params.set("usuario_id", filtUsuario)
          if (filtModulo)  params.set("modulo", filtModulo)
          if (filtAccion)  params.set("accion", filtAccion)
          if (filtCategoria) params.set("categoria", filtCategoria)
          if (filtSeveridad) params.set("severidad", filtSeveridad)
          if (filtDesde)   params.set("fecha_desde", filtDesde)
          if (filtHasta)   params.set("fecha_hasta", filtHasta)
          if (filtOcultarLogin && !filtAccion) params.set("excluir_rutina_auth", "true")
          try {
            const r = await fetch(`${API}/logs/export.csv?${params}`, { headers: { Authorization: `Bearer ${token}` } })
            if (!r.ok) return
            const blob = await r.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = "claracore_logs.csv"
            a.click()
            URL.revokeObjectURL(url)
          } catch { /* ignore */ }
        }}
          style={{ background:"#10B98122", border:"1px solid #10B98166", borderRadius:6, padding:"5px 12px", color:"#10B981", fontSize:11, fontWeight:700, cursor:"pointer" }}>
          ⬇ CSV
        </button>
        <span style={{ marginLeft:"auto", fontSize:12, color: col.textMuted, alignSelf:"center" }}>
          {logs.length} registros · click para ver historial
        </span>
        <div style={{ width:"100%", fontSize:11, color: col.textMuted, lineHeight:1.45, opacity:0.95 }}>
          Si solo ves filas AUTH/LOGIN, suele ser porque hay muchos accesos recientes. Deja activa la casilla de arriba o usa un atajo; validaciones de obra van en módulo <strong style={{ color: col.textTable }}>SICOE</strong>.
          {" "}Si las fechas parecen viejas con un usuario concreto, prueba sin filtro de usuario o exporta CSV: a veces el mismo correo tiene más de una fila en «usuarios» y el <code style={{ fontSize:10 }}>usuario_id</code> del log no coincide con el del desplegable.
        </div>
        <div style={{ width:"100%", display:"flex", flexWrap:"wrap", gap:6, alignItems:"center" }}>
          <span style={{ fontSize:11, color: col.textMuted, marginRight:4 }}>Atajos:</span>
          <button type="button" onClick={() => { setFiltModulo("PRESUPUESTO"); setFiltAccion("VALIDAR"); setFiltOcultarLogin(true) }}
            style={{ background: col.bgCard, border:`1px solid ${col.border}`, borderRadius:6, padding:"4px 10px", color: col.textTable, fontSize:11, cursor:"pointer" }}>
            Presupuesto · VALIDAR
          </button>
          <button type="button" onClick={() => { setFiltModulo("SICOE"); setFiltAccion("VALIDAR"); setFiltOcultarLogin(true) }}
            style={{ background: col.bgCard, border:`1px solid ${col.border}`, borderRadius:6, padding:"4px 10px", color: col.textTable, fontSize:11, cursor:"pointer" }}>
            SICOE · VALIDAR
          </button>
          <button type="button" onClick={() => { setFiltModulo(""); setFiltAccion("VALIDAR"); setFiltOcultarLogin(true) }}
            style={{ background: col.bgCard, border:`1px solid ${col.border}`, borderRadius:6, padding:"4px 10px", color: col.textTable, fontSize:11, cursor:"pointer" }}>
            Solo VALIDAR (todos los módulos)
          </button>
        </div>
      </div>

      {/* Tabla */}
      {loading ? (
        <div style={{ textAlign:"center", padding:40, color: col.textMuted }}>⏳ Cargando...</div>
      ) : (
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead style={{ background: col.bgCard }}>
              <tr>
                {["Fecha","Usuario","Cargo","Rol","Módulo","Acción","Sever.","Entidad","Contrato","IP","Resultado"].map(h => (
                  <th key={h} style={thS}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={11} style={{ ...tdS, textAlign:"center", padding:40, color: col.textMuted }}>Sin registros</td></tr>
              ) : logs.map((log, i) => (
                <tr key={log.id} onClick={() => abrirHistorial(log)}
                  style={{ cursor:"pointer", background:"transparent", transition:"background 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.background = col.hover}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={tdS}>{fmtFecha(log.created_at)}</td>
                  <td style={{ ...tdS, fontWeight:600 }}>{log.usuario_nombre}</td>
                  <td style={{ ...tdS, color: col.textMuted }}>{log.cargo_nombre}</td>
                  <td style={{ ...tdS, color: col.textMuted, fontSize:11 }}>{log.rol_nombre || "—"}</td>
                  <td style={tdS}>
                    <span style={{ background: col.bgCard, border:`1px solid ${col.border}`, borderRadius:4, padding:"2px 8px", fontSize:11 }}>
                      {log.modulo}
                    </span>
                  </td>
                  <td style={tdS}>
                    <span style={{ background: (ACCION_COLOR[log.accion]||"#666")+"22", color: ACCION_COLOR[log.accion]||"#666", border:`1px solid ${(ACCION_COLOR[log.accion]||"#666")}44`, borderRadius:20, padding:"2px 10px", fontSize:11, fontWeight:700 }}>
                      {log.accion}
                    </span>
                  </td>
                  <td style={{ ...tdS, fontSize:10, color: col.textMuted }}>{log.severidad || "—"}</td>
                  <td style={{ ...tdS, color: col.textMuted, fontSize:11 }}>
                    {log.entidad_tipo && `${log.entidad_tipo} #${log.entidad_id}`}
                  </td>
                  <td style={{ ...tdS, fontSize:11 }}>{log.contrato_numero || "—"}</td>
                  <td style={{ ...tdS, fontSize:10, color: col.textMuted, maxWidth:90, overflow:"hidden", textOverflow:"ellipsis" }} title={log.ip || ""}>{log.ip || "—"}</td>
                  <td style={tdS}>
                    <span style={{ color: log.resultado === "ok" ? "#10B981" : "#EF4444", fontWeight:700, fontSize:11 }}>
                      {log.resultado === "ok" ? "✓" : "✗"} {log.resultado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginación */}
      <div style={{ display:"flex", gap:8, alignItems:"center", marginTop:12, justifyContent:"center" }}>
        <button onClick={() => cargarLogs(Math.max(0, offset - LIMIT))} disabled={offset === 0}
          style={{ background:"transparent", border:`1px solid ${col.border}`, borderRadius:6, padding:"4px 14px", cursor: offset===0?"default":"pointer", color: offset===0?col.textMuted:col.textTable }}>‹ Anterior</button>
        <span style={{ fontSize:12, color: col.textMuted }}>Página {Math.floor(offset/LIMIT)+1}</span>
        <button onClick={() => cargarLogs(offset + LIMIT)} disabled={logs.length < LIMIT}
          style={{ background:"transparent", border:`1px solid ${col.border}`, borderRadius:6, padding:"4px 14px", cursor: logs.length<LIMIT?"default":"pointer", color: logs.length<LIMIT?col.textMuted:col.textTable }}>Siguiente ›</button>
      </div>

      {/* Modal historial */}
      {logSelec && (
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.6)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center" }}
          onClick={() => setLogSelec(null)}>
          <div style={{ background: col.bgCard, border:`1px solid ${col.border}`, borderRadius:16, padding:28, width:620, maxWidth:"95vw", maxHeight:"80vh", display:"flex", flexDirection:"column", boxShadow:"0 20px 60px rgba(0,0,0,0.35)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div>
                <div style={{ fontSize:15, fontWeight:700, color: col.textTable }}>
                  📋 Historial — {logSelec.entidad_tipo} #{logSelec.entidad_id}
                </div>
                <div style={{ fontSize:11, color: col.textMuted, marginTop:2 }}>
                  {logSelec.modulo} · {logSelec.accion} · {fmtFecha(logSelec.created_at)}
                </div>
              </div>
              <button onClick={() => setLogSelec(null)} style={{ background:"transparent", border:"none", fontSize:18, cursor:"pointer", color: col.textMuted }}>✕</button>
            </div>

            {/* Detalle del log seleccionado */}
            {logSelec.detalle && Object.keys(typeof logSelec.detalle === 'string' ? JSON.parse(logSelec.detalle) : logSelec.detalle).length > 0 && (
              <div style={{ background: col.bg, borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:12 }}>
                <div style={{ fontWeight:700, color: col.textMuted, fontSize:10, letterSpacing:"0.5px", marginBottom:6 }}>DETALLE DE ESTA ACCIÓN</div>
                {Object.entries(typeof logSelec.detalle === 'string' ? JSON.parse(logSelec.detalle) : logSelec.detalle).map(([k,v]) => (
                  <div key={k} style={{ display:"flex", gap:8, marginBottom:3 }}>
                    <span style={{ color: col.textMuted, minWidth:120 }}>{k}:</span>
                    <span style={{ color: col.textTable, fontWeight:500 }}>{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                  </div>
                ))}
              </div>
            )}

            {(logSelec.valor_anterior != null || logSelec.valor_nuevo != null) && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
                <div style={{ background: col.bg, borderRadius:8, padding:"10px 12px", fontSize:11, maxHeight:220, overflow:"auto" }}>
                  <div style={{ fontWeight:700, color: col.textMuted, fontSize:10, letterSpacing:"0.5px", marginBottom:6 }}>VALOR ANTERIOR</div>
                  <pre style={{ margin:0, whiteSpace:"pre-wrap", wordBreak:"break-word", fontSize:10, color: col.textTable, fontFamily:"ui-monospace, monospace" }}>
                    {typeof logSelec.valor_anterior === "string" ? logSelec.valor_anterior : JSON.stringify(logSelec.valor_anterior, null, 2)}
                  </pre>
                </div>
                <div style={{ background: col.bg, borderRadius:8, padding:"10px 12px", fontSize:11, maxHeight:220, overflow:"auto" }}>
                  <div style={{ fontWeight:700, color: col.textMuted, fontSize:10, letterSpacing:"0.5px", marginBottom:6 }}>VALOR NUEVO</div>
                  <pre style={{ margin:0, whiteSpace:"pre-wrap", wordBreak:"break-word", fontSize:10, color: col.textTable, fontFamily:"ui-monospace, monospace" }}>
                    {typeof logSelec.valor_nuevo === "string" ? logSelec.valor_nuevo : JSON.stringify(logSelec.valor_nuevo, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            {/* Historial completo de la entidad */}
            <div style={{ fontWeight:700, color: col.textMuted, fontSize:10, letterSpacing:"0.5px", marginBottom:8 }}>
              HISTORIAL COMPLETO DE ESTA ENTIDAD
            </div>
            <div style={{ overflowY:"auto", flex:1, display:"flex", flexDirection:"column", gap:8 }}>
              {histLoading ? (
                <div style={{ textAlign:"center", padding:20, color: col.textMuted }}>⏳ Cargando historial...</div>
              ) : historial.length === 0 ? (
                <div style={{ textAlign:"center", padding:20, color: col.textMuted }}>Sin historial adicional</div>
              ) : historial.map((h, i) => {
                const color = ACCION_COLOR[h.accion] || "#666"
                const esActual = h.id === logSelec.id
                return (
                  <div key={h.id} style={{ background: esActual ? color+"11" : col.bg, border:`1px solid ${esActual ? color+"44" : col.border}`, borderRadius:8, padding:"10px 14px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ background: color+"22", color, border:`1px solid ${color}44`, borderRadius:20, padding:"1px 8px", fontSize:10, fontWeight:700 }}>{h.accion}</span>
                        <span style={{ fontSize:11, fontWeight:600, color: col.textTable }}>{h.usuario_nombre}</span>
                        <span style={{ fontSize:10, color: col.textMuted }}>· {h.cargo_nombre}</span>
                      </div>
                      <span style={{ fontSize:10, color: col.textMuted }}>{fmtFecha(h.created_at)}</span>
                    </div>
                    {h.detalle && Object.keys(h.detalle).length > 0 && (
                      <div style={{ display:"flex", flexWrap:"wrap", gap:"4px 16px", marginTop:4 }}>
                        {Object.entries(typeof h.detalle === 'string' ? JSON.parse(h.detalle) : h.detalle).slice(0,5).map(([k,v]) => (
                          <span key={k} style={{ fontSize:10, color: col.textMuted }}>
                            {k}: <strong style={{ color: col.textTable }}>{typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")}</strong>
                          </span>
                        ))}
                      </div>
                    )}
                    {esActual && <div style={{ fontSize:9, color, fontWeight:700, marginTop:4 }}>← ACCIÓN SELECCIONADA</div>}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Diagnóstico plataforma (solo Desarrollador) ─────────────────────────────
function SeccionDiagnosticoPlataforma({ call, theme }) {
  const col = C(theme)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [copiaBanner, setCopiaBanner] = useState(null)

  /** Relativo al umbral del middleware (sin guardar nada en BD). */
  const severidadLentitud = (duracionMs, umbralMs) => {
    const u = Number(umbralMs)
    const m = Number(duracionMs)
    const um = Number.isFinite(u) && u > 0 ? u : 8000
    if (!Number.isFinite(m) || m < 0) return { label: "—", bg: "#64748B", fg: "#fff" }
    const ratio = m / um
    if (ratio < 3) return { label: "Moderado", bg: "#CA8A04", fg: "#fff" }
    if (ratio < 15) return { label: "Grave", bg: "#EA580C", fg: "#fff" }
    return { label: "Crítico", bg: "#991B1B", fg: "#fff" }
  }

  const pillSeveridad = (label, bg, fg) => (
    <span
      style={{
        display: "inline-block",
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        padding: "3px 8px",
        borderRadius: 6,
        background: bg,
        color: fg,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  )

  const cargar = useCallback(async () => {
    setLoading(true)
    setErr(null)
    setCopiaBanner(null)
    try {
      const j = await call("GET", "/admin/diagnostico-plataforma")
      setData(j)
    } catch (e) {
      setErr(e?.message || String(e))
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [call])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const copiarDiagnosticoPortapapeles = useCallback(async () => {
    if (!data) {
      setCopiaBanner({ variant: "warn", text: "Primero cargue el diagnóstico (Actualizar)." })
      window.setTimeout(() => setCopiaBanner(null), 6000)
      return
    }
    const txt = buildPortapapelesDiagnostico(data)
    try {
      await navigator.clipboard.writeText(txt)
      setCopiaBanner({ variant: "ok", text: "Listo: JSON copiado. Pégalo en Cursor o en el chat de soporte." })
    } catch {
      setCopiaBanner({
        variant: "err",
        text: "No se pudo usar el portapapeles. Use HTTPS o conceda permiso de portapapeles al sitio.",
      })
    }
    window.setTimeout(() => setCopiaBanner(null), 7000)
  }, [data])

  const card = (bg) => ({
    background: bg || col.bgCard,
    border: `1px solid ${col.borderColor}`,
    borderRadius: 10,
    padding: "14px 16px",
    marginBottom: 14,
  })
  const th = { textAlign: "left", fontSize: 10, color: col.textMuted, textTransform: "uppercase", padding: "6px 8px", borderBottom: `1px solid ${col.borderColor}` }
  const td = { fontSize: 12, padding: "8px", borderBottom: `1px solid ${col.borderColor}88`, color: col.textTable, verticalAlign: "top" }

  return (
    <div style={{ padding: "8px 4px 24px", maxWidth: 1100, position: "relative" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: "var(--cc-h3)", color: col.textPrimary, marginBottom: 4 }}>
            Diagnóstico plataforma
          </div>
          <div style={{ fontSize: 12, color: col.textMuted, lineHeight: 1.4 }}>
            Use <strong>Copiar JSON</strong> (arriba a la derecha) y péguelo en el chat: incluye rutas lentas, errores,
            alertas y contexto del navegador, sin capturas.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => void cargar()}
            disabled={loading}
            style={{
              background: col.textPrimary,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 14px",
              fontWeight: 700,
              cursor: loading ? "wait" : "pointer",
              opacity: loading ? 0.75 : 1,
            }}
          >
            {loading ? "Actualizando…" : "↻ Actualizar"}
          </button>
          <button
            type="button"
            onClick={() => void copiarDiagnosticoPortapapeles()}
            disabled={loading || !data}
            title="Copia JSON completo para pegar en Cursor o soporte (equivalente a copiar bloque de código)."
            aria-label="Copiar diagnóstico JSON al portapapeles"
            style={{
              background: col.bgInput,
              color: col.textPrimary,
              border: `2px solid ${col.borderColor}`,
              borderRadius: 8,
              padding: "8px 12px",
              fontWeight: 700,
              cursor: loading || !data ? "not-allowed" : "pointer",
              opacity: loading || !data ? 0.55 : 1,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span aria-hidden>⎘</span>
            Copiar JSON
          </button>
        </div>
      </div>
      {data?.generated_at && (
        <div style={{ fontSize: 12, color: col.textMuted, marginBottom: 14 }}>
          Generado: {formatFechaLogBogota(data.generated_at)} · hora Colombia (Bogotá)
        </div>
      )}
      {copiaBanner && (
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 14,
            ...(copiaBanner.variant === "ok"
              ? { color: "#166534", background: "#DCFCE7", border: "1px solid #86EFAC" }
              : copiaBanner.variant === "warn"
                ? { color: "#92400E", background: "#FEF3C7", border: "1px solid #FCD34D" }
                : { color: "#991B1B", background: "#FEE2E2", border: "1px solid #FCA5A5" }),
          }}
        >
          {copiaBanner.text}
        </div>
      )}
      {err && (
        <div style={{ ...card("#FEF2F2"), color: "#B91C1C", marginBottom: 16 }}>{err}</div>
      )}
      {loading && !data && !err && (
        <div style={{ textAlign: "center", padding: 32, color: col.textMuted }}>Cargando diagnóstico…</div>
      )}
      {data && (
        <>
          <div style={{ ...card(), borderLeft: `4px solid ${data.supabase?.ok ? "#16A34A" : "#DC2626"}` }}>
            <div style={{ fontWeight: 800, color: col.textPrimary, marginBottom: 8 }}>Estado rápido</div>
            <div style={{ fontSize: 13, color: col.textTable, lineHeight: 1.5 }}>
              <strong>API (worker):</strong> {data.api_worker?.ok ? "✓ Responde" : "✗"} — {data.api_worker?.nota || ""}
              <br />
              <strong>Supabase (ping):</strong>{" "}
              {data.supabase?.ok ? `✓ ~${data.supabase.latency_ms ?? "—"} ms` : "✗ Falló"}
              {!data.supabase?.ok && data.supabase?.error && (
                <span style={{ color: "#B91C1C" }}> — {String(data.supabase.error).slice(0, 200)}</span>
              )}
              <br />
              <strong>Umbral respuesta lenta:</strong> {data.umbral_respuesta_lenta_ms ?? "—"} ms (middleware)
              <br />
              {data.version_deploy && (
                <>
                  <strong>Versión despliegue:</strong> <code style={{ fontSize: 11 }}>{data.version_deploy}</code>
                </>
              )}
            </div>
          </div>

          {data.resumen && (
            <div style={{ ...card(), borderLeft: "4px solid #6366F1" }}>
              <div style={{ fontWeight: 800, color: col.textPrimary, marginBottom: 8 }}>
                Resumen para lentitud / SICOE
              </div>
              <div style={{ fontSize: 13, color: col.textTable, lineHeight: 1.55 }}>
                <strong>Muestras:</strong>{" "}
                {data.resumen.n_respuestas_lentas_listadas ?? 0} lentos (últ.{" "}
                {data.resumen.ventana_respuestas_lentas_h ?? 48} h) ·{" "}
                {data.resumen.n_errores_sistema_listados ?? 0} errores · {data.resumen.n_alertas_listadas ?? 0}{" "}
                alertas
                <br />
                <strong>Peor duración (lentos listados):</strong>{" "}
                {data.resumen.peor_duracion_ms_respuestas_lentas != null
                  ? `${data.resumen.peor_duracion_ms_respuestas_lentas} ms`
                  : "—"}
                <br />
                <strong>IDs contrato en rutas /sicoe-obra/…</strong> (lentos + errores):{" "}
                {Array.isArray(data.resumen.sicoe_contrato_ids_en_endpoints) &&
                data.resumen.sicoe_contrato_ids_en_endpoints.length
                  ? data.resumen.sicoe_contrato_ids_en_endpoints.join(", ")
                  : "—"}
              </div>
              {Array.isArray(data.resumen.rutas_mas_repetidas_en_lentas) &&
                data.resumen.rutas_mas_repetidas_en_lentas.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: col.textMuted, marginBottom: 6 }}>
                      Rutas más repetidas en lentos (top {data.resumen.rutas_mas_repetidas_en_lentas.length})
                    </div>
                    <ol
                      style={{
                        margin: 0,
                        paddingLeft: 18,
                        fontSize: 12,
                        fontFamily: "ui-monospace, monospace",
                        color: col.textTable,
                        lineHeight: 1.5,
                      }}
                    >
                      {data.resumen.rutas_mas_repetidas_en_lentas.map((row, i) => (
                        <li key={i}>
                          ({row.veces}×) {row.ruta}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
            </div>
          )}

          <div style={card()}>
            <div style={{ fontWeight: 800, color: col.textPrimary, marginBottom: 6 }}>Auditoría por módulo (24 h)</div>
            <div style={{ fontSize: 11, color: col.textMuted, marginBottom: 10 }}>{data.auditoria_por_modulo_nota}</div>
            {(!data.auditoria_por_modulo || data.auditoria_por_modulo.length === 0) ? (
              <div style={{ color: col.textMuted, fontSize: 13 }}>Sin datos en la muestra.</div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {data.auditoria_por_modulo.map((m) => (
                  <div
                    key={m.modulo}
                    style={{
                      background: col.bgInput,
                      border: `1px solid ${col.borderColor}`,
                      borderRadius: 8,
                      padding: "8px 12px",
                      minWidth: 120,
                    }}
                  >
                    <div style={{ fontSize: 11, color: col.textMuted }}>{m.modulo}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: col.textPrimary }}>{m.eventos}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={card()}>
            <div style={{ fontWeight: 800, color: col.textPrimary, marginBottom: 8 }}>Respuestas lentas recientes (48 h)</div>
            <div style={{ fontSize: 11, color: col.textMuted, marginBottom: 8, lineHeight: 1.4 }}>
              Severidad calculada solo en pantalla respecto al umbral ({data.umbral_respuesta_lenta_ms ?? 8000} ms):{" "}
              <strong>Moderado</strong> &lt; 3× · <strong>Grave</strong> 3–15× · <strong>Crítico</strong> &gt; 15×.
            </div>
            {data.respuestas_lentas?.length ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Severidad</th>
                      <th style={th}>Cuándo</th>
                      <th style={th}>Endpoint</th>
                      <th style={{ ...th, textAlign: "right" }}>Ms</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.respuestas_lentas.map((r) => {
                      const sev = severidadLentitud(r.duracion_ms, data.umbral_respuesta_lenta_ms)
                      return (
                        <tr key={r.id}>
                          <td style={td}>{pillSeveridad(sev.label, sev.bg, sev.fg)}</td>
                          <td style={td}>{formatFechaLogBogota(r.created_at)}</td>
                          <td style={{ ...td, fontFamily: "monospace", fontSize: 11 }}>{r.metodo_http || ""} {r.endpoint || "—"}</td>
                          <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{r.duracion_ms ?? "—"}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ color: col.textMuted, fontSize: 13 }}>No hay registros de lentitud en la muestra.</div>
            )}
          </div>

          <div style={card()}>
            <div style={{ fontWeight: 800, color: col.textPrimary, marginBottom: 8 }}>Errores de sistema (48 h)</div>
            {data.errores_sistema?.length ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Severidad</th>
                      <th style={th}>Cuándo</th>
                      <th style={th}>Endpoint / módulo</th>
                      <th style={th}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.errores_sistema.map((r) => {
                      const s = String(r.severidad || "ERROR").toUpperCase()
                      const sev =
                        s === "ERROR"
                          ? { label: "Error", bg: "#991B1B", fg: "#fff" }
                          : s === "WARNING"
                            ? { label: "Advertencia", bg: "#CA8A04", fg: "#fff" }
                            : { label: s || "—", bg: "#475569", fg: "#fff" }
                      return (
                        <tr key={r.id}>
                          <td style={td}>{pillSeveridad(sev.label, sev.bg, sev.fg)}</td>
                          <td style={td}>{formatFechaLogBogota(r.created_at)}</td>
                          <td style={{ ...td, fontSize: 11 }}>
                            <div style={{ fontFamily: "monospace" }}>{r.endpoint || "—"}</div>
                            <div style={{ color: col.textMuted }}>{r.modulo || ""}</div>
                          </td>
                          <td style={td}>{r.accion || "—"}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ color: col.textMuted, fontSize: 13 }}>Sin errores de sistema recientes en la muestra.</div>
            )}
          </div>

          <div style={card()}>
            <div style={{ fontWeight: 800, color: col.textPrimary, marginBottom: 8 }}>Alertas marcadas</div>
            {data.alertas?.length ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Tipo</th>
                      <th style={th}>Cuándo</th>
                      <th style={th}>Módulo / acción</th>
                      <th style={th}>Usuario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.alertas.map((r) => {
                      const s = String(r.severidad || "").toUpperCase()
                      const sev =
                        s === "ERROR"
                          ? { label: "Alerta", bg: "#B91C1C", fg: "#fff" }
                          : { label: "Alerta", bg: "#7C3AED", fg: "#fff" }
                      return (
                        <tr key={r.id}>
                          <td style={td}>{pillSeveridad(sev.label, sev.bg, sev.fg)}</td>
                          <td style={td}>{formatFechaLogBogota(r.created_at)}</td>
                          <td style={td}>
                            {r.modulo || "—"} · <strong>{r.accion || "—"}</strong>
                          </td>
                          <td style={td}>{r.usuario_nombre || "—"}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ color: col.textMuted, fontSize: 13 }}>Sin alertas recientes.</div>
            )}
          </div>

          <p style={{ fontSize: 12, color: col.textMuted, lineHeight: 1.45, marginTop: 8 }}>
            Las fechas de las tablas y «Generado» se muestran en <strong>hora Colombia</strong> (zona{" "}
            <code style={{ fontSize: 11 }}>America/Bogota</code>). Si el registro en base venía sin huso, se interpreta como{" "}
            <strong>UTC</strong> antes de convertir — coherente con cómo suele guardar Postgres.
            <br />
            Para profundidad use también «Logs del Sistema» o el monitor del proveedor (Azure, etc.).
          </p>
        </>
      )}
    </div>
  )
}

// ─── SECCIÓN 4: Reset de Claves ────────────────────────────────────────────
function SeccionResets({ call, theme }) {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tempPasswords, setTempPasswords] = useState({});
  const [msg, setMsg] = useState(null);
  const col = C(theme);
  const tdStyle = S.td(theme);

  const cargar = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try { setSolicitudes(await call("GET", "/admin/reset-requests")); }
    catch (e) { if (!silent) setMsg({ type: "error", text: e.message }); }
    finally { if (!silent) setLoading(false); }
  }, [call]);

  useEffect(() => { cargar(); }, [cargar]);

  const autorizar = async (id) => {
    const temp = tempPasswords[id];
    if (!temp || temp.length < 6) { setMsg({ type: "error", text: "Ingresa una contraseña temporal de mínimo 6 caracteres" }); return; }
    try {
      await call("PUT", `/admin/reset-requests/${id}/autorizar`, { contrasena_temporal: temp });
      setMsg({ type: "success", text: "Reset autorizado. El usuario ya puede cambiar su contraseña." });
      cargar();
    } catch (e) { setMsg({ type: "error", text: e.message }); }
  };

  return (
    <div>
      {msg && <div style={S.alert(msg.type)}>{msg.text}<span onClick={() => setMsg(null)} style={{ float: "right", cursor: "pointer", opacity: 0.6 }}>✕</span></div>}
      {loading ? <div style={S.empty}>Cargando...</div>
      : solicitudes.length === 0 ? (
        <div style={S.empty}><div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>No hay solicitudes de reset pendientes.</div>
      ) : (
        <table style={S.table}>
          <thead><tr>{["Correo", "Fecha solicitud", "Contraseña temporal", "Acción"].map(h => <th key={h} style={S.th(theme)}>{h}</th>)}</tr></thead>
          <tbody>
            {solicitudes.map(s => (
              <tr key={s.id}>
                <td style={tdStyle}><div style={{ color: col.textPrimary, fontWeight: 500 }}>{s.email}</div></td>
                <td style={tdStyle}><span style={{ color: col.textSecondary }}>{new Date(s.created_at).toLocaleDateString("es-CO")}</span></td>
                <td style={tdStyle}>
                  <input style={{ ...S.input, maxWidth: 180 }} type="text" placeholder="Ej: Temp1234"
                    value={tempPasswords[s.id] || ""}
                    onChange={e => setTempPasswords(p => ({ ...p, [s.id]: e.target.value }))} />
                </td>
                <td style={tdStyle}>
                  <button style={S.btn("success", true)} onClick={() => autorizar(s.id)}>✓ Autorizar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── SECCIÓN 5: Contratos ──────────────────────────────────────────────────
/** Etiquetas de niveles SICOE (panel admin → configuración por contrato). */
const SICOE_NIVELES_VALIDACION_ADMIN_LABELS = {
  1: "Nivel 1 — Inspector de Obra (Operativo Contratista)",
  2: "Nivel 2 — Residente de Obra (Contratista)",
  3: "Nivel 3 — Director de Obra (Contratista Gerencial)",
  4: "Nivel 4 — Residente de Interventoría (Interventoría)",
  5: "Nivel 5 — Director de Interventoría (Interventoría Gerencial)",
  6: "Nivel 6 — Supervisor Entidad (Supervisor Externo)",
};

/** GET/PUT/POST de contrato con `plano_geojson` grande (decenas de MB): el timeout por defecto del panel (~48 s) corta con "signal timed out" antes de terminar. */
const CONTRATO_API_PLANO_TIMEOUT = { timeoutMs: 30 * 60 * 1000, maxRetries: 1 };

function SeccionContratos({ call, contratos, recargarContratos, perms = { crear: false, editar: false } }) {
  const ENTIDADES = ["IDU", "ICCU", "ENEL", "EAB", "OTRA"];
  const FORM_VACIO = {
    numero: '', objeto: '', contratista: '', nit: '', interventoria: '',
    entidad: '', entidad_otra: '', logo_entidad: '', plano_geojson: null, centro_lat: null, centro_lng: null,
    logo_contratista: '', logo_interventoria: '', aiu: '', iva: '',
    valor_componente_ambiental: '', valor_componente_social: '', valor_componente_pmt: '', costo_directo_contrato: '',
    costos_adicionales_lista: [],
  };
  const [form, setForm] = useState(FORM_VACIO);
  const [editandoId, setEditandoId] = useState(null); // null = crear, number = editar
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [togglingFase, setTogglingFase] = useState(null); // id del contrato en proceso
  const [planoArchivoLabel, setPlanoArchivoLabel] = useState(null); // nombre local o leyenda servidor
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const planoFileInputRef = useRef(null);
  const [nivelesActivosEdit, setNivelesActivosEdit] = useState([1, 2, 3]);

  /** Límites y centro en una pasada (sin arrays enormes). Math.min(...array) falla con muchos vértices (>~65k args). */
  function boundsDesdeGeojson(geojson) {
    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    let n = 0;
    const considerar = (lng, lat) => {
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
      n += 1;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    };
    const recorrerCoords = (node) => {
      if (!Array.isArray(node)) return;
      if (typeof node[0] === "number" && typeof node[1] === "number") {
        considerar(node[0], node[1]);
        return;
      }
      for (let i = 0; i < node.length; i++) recorrerCoords(node[i]);
    };
    const walk = (geom) => {
      if (!geom || !geom.type) return;
      if (geom.type === "Feature") return walk(geom.geometry);
      if (geom.type === "FeatureCollection") {
        const feats = geom.features || [];
        for (let i = 0; i < feats.length; i++) walk(feats[i]);
        return;
      }
      if (geom.type === "GeometryCollection") {
        const geoms = geom.geometries || [];
        for (let i = 0; i < geoms.length; i++) walk(geoms[i]);
        return;
      }
      const c = geom.coordinates;
      if (c) recorrerCoords(c);
    };
    walk(geojson);
    if (!n) return null;
    return {
      minLng,
      maxLng,
      minLat,
      maxLat,
      centroLng: (minLng + maxLng) / 2,
      centroLat: (minLat + maxLat) / 2,
      vertexCount: n,
    };
  }

  function handleLogo(campo, e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setForm(f => ({ ...f, [campo]: ev.target.result }));
    reader.readAsDataURL(file);
  }

  function llenarFormDesdeContrato(d) {
    if (!d || typeof d !== 'object') return;
    let costos_adicionales_lista = [];
    if (Array.isArray(d.costos_adicionales_lista) && d.costos_adicionales_lista.length) {
      costos_adicionales_lista = d.costos_adicionales_lista.map((x) => {
        const c = String(x.concepto_contractual ?? x.concepto ?? '').trim();
        let vm = x.valor_mensual;
        let tm = x.tiempo_meses;
        if ((x.valor_mensual == null || x.valor_mensual === '') && x.valor != null && x.valor !== '') {
          const tot = Number(x.valor);
          const mes = Number(x.tiempo_meses) > 0 ? Number(x.tiempo_meses) : 1;
          vm = Number.isFinite(tot) && Number.isFinite(mes) && mes > 0 ? String(tot / mes) : String(x.valor);
          tm = x.tiempo_meses != null && x.tiempo_meses !== '' ? String(x.tiempo_meses) : '1';
        }
        return {
          concepto_contractual: c,
          valor_mensual: vm != null && vm !== '' && String(vm) !== 'null' ? String(vm) : '',
          tiempo_meses: tm != null && tm !== '' && String(tm) !== 'null' ? String(tm) : '',
        };
      });
    } else if (d.costos_adicionales != null && d.costos_adicionales !== '') {
      costos_adicionales_lista = [
        { concepto_contractual: 'Importe histórico (sin desglose)', valor_mensual: String(d.costos_adicionales), tiempo_meses: '1' },
      ];
    }
    const planoParsed = (() => {
      const pg = d.plano_geojson;
      if (pg == null || pg === '') return null;
      if (typeof pg === 'string') {
        try {
          return JSON.parse(pg);
        } catch {
          return null;
        }
      }
      return pg;
    })();
    const planoLimpio = planoParsed
      ? sanitizePlanoFeatureCollection(
          planoParsed.type === 'FeatureCollection' && Array.isArray(planoParsed.features)
            ? planoParsed
            : planoParsed.type === 'Feature' && planoParsed.geometry
              ? { type: 'FeatureCollection', features: [planoParsed] }
              : { type: 'FeatureCollection', features: [] }
        )
      : null;
    setForm({
      numero: d.numero || '',
      objeto: d.objeto || '',
      contratista: d.contratista || '',
      nit: d.nit || '',
      interventoria: d.interventoria || '',
      entidad: d.entidad || '',
      entidad_otra: d.entidad_otra || '',
      logo_entidad: d.logo_entidad || '',
      plano_geojson: planoLimpio,
      centro_lat: d.centro_lat ?? null,
      centro_lng: d.centro_lng ?? null,
      logo_contratista: d.logo_contratista || '',
      logo_interventoria: d.logo_interventoria || '',
      aiu: d.aiu != null ? String(d.aiu) : '',
      iva: d.iva != null ? String(d.iva) : '',
      valor_componente_ambiental: d.valor_componente_ambiental != null ? String(d.valor_componente_ambiental) : '',
      valor_componente_social: d.valor_componente_social != null ? String(d.valor_componente_social) : '',
      valor_componente_pmt: d.valor_componente_pmt != null ? String(d.valor_componente_pmt) : '',
      costo_directo_contrato: d.costo_directo_contrato != null ? String(d.costo_directo_contrato) : '',
      costos_adicionales_lista,
    });
    setPlanoArchivoLabel(planoLimpio && (planoLimpio.features || []).length ? 'Plano guardado en servidor' : null);
  }

  function quitarPlanoGeojson() {
    setForm((f) => ({ ...f, plano_geojson: null, centro_lat: null, centro_lng: null }));
    setPlanoArchivoLabel(null);
    if (planoFileInputRef.current) planoFileInputRef.current.value = '';
  }

  function abrirSelectorPlanoGeojson() {
    const el = planoFileInputRef.current;
    if (el) el.value = '';
    el?.click();
  }

  function handlePlanoGeojson(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg({ type: "success", text: `Procesando "${file.name}" (${(file.size / (1024 * 1024)).toFixed(2)} MB)…` });
    const reader = new FileReader();
    reader.onerror = () => {
      setMsg({ type: "error", text: "No se pudo leer el archivo. Reintenta o comprueba permisos." });
    };
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(String(ev.target?.result || "{}"));
        const asFc =
          raw.type === "FeatureCollection" && Array.isArray(raw.features)
            ? raw
            : raw.type === "Feature" && raw.geometry
              ? { type: "FeatureCollection", features: [raw] }
              : null;
        if (!asFc) throw new Error("Se espera un FeatureCollection GeoJSON o una Feature.");
        const parsed = sanitizePlanoFeatureCollection(asFc);
        const b = boundsDesdeGeojson(parsed);
        if (!b) throw new Error("El archivo no contiene coordenadas válidas (GeoJSON vacío o tipos no soportados).");
        setForm((f) => ({
          ...f,
          plano_geojson: parsed,
          centro_lng: Number(b.centroLng.toFixed(6)),
          centro_lat: Number(b.centroLat.toFixed(6)),
        }));
        setPlanoArchivoLabel(file.name);
        setMsg({ type: "success", text: `Plano GeoJSON cargado (${b.vertexCount.toLocaleString()} vértices), geometría saneada para el mapa y centrado automático.` });
      } catch (err) {
        setMsg({ type: "error", text: `GeoJSON inválido: ${err.message}` });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function iniciarEdicion(c) {
    setEditandoId(c.id);
    let d = c;
    try {
      const detalle = await call("GET", `/contratos/${c.id}`, null, CONTRATO_API_PLANO_TIMEOUT);
      d = { ...c, ...(detalle && typeof detalle === "object" ? detalle : {}) };
    } catch {
      d = c;
    }
    try {
      const nv = await call("GET", `/sicoe-obra/${c.id}/niveles-validacion`);
      const na = Array.isArray(nv?.niveles_activos) && nv.niveles_activos.length
        ? [...nv.niveles_activos]
            .map((x) => parseInt(x, 10))
            .filter((x) => Number.isFinite(x) && x >= 1 && x <= 6)
            .sort((a, b) => a - b)
        : [1, 2, 3];
      setNivelesActivosEdit(na);
    } catch {
      setNivelesActivosEdit([1, 2, 3]);
    }
    if (!d || typeof d !== "object") d = c;
    llenarFormDesdeContrato(d);
    setMsg(null);
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setForm(FORM_VACIO);
    setNivelesActivosEdit([1, 2, 3]);
    setPlanoArchivoLabel(null);
    if (planoFileInputRef.current) planoFileInputRef.current.value = "";
    setMsg(null);
  }

  async function toggleFase(c) {
    const nuevaFase = (c.fase || 'PRESUPUESTO') === 'PRESUPUESTO' ? 'LIQUIDACION' : 'PRESUPUESTO';
    if (!window.confirm(`¿Cambiar el contrato "${c.numero}" a fase ${nuevaFase}?\n\n${nuevaFase === 'LIQUIDACION' ? 'Activará el tab de Análisis de Liquidación en el Dashboard.' : 'Desactivará el tab de Análisis de Liquidación.'}`)) return;
    setTogglingFase(c.id);
    try {
      await call("PUT", `/contratos/${c.id}`, { fase: nuevaFase });
      setMsg({ type: 'success', text: `Contrato "${c.numero}" cambiado a fase ${nuevaFase}` });
      recargarContratos();
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Error al cambiar fase' });
    } finally { setTogglingFase(null); }
  }

  function _numONull(s) {
    if (s === '' || s == null) return null;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }

  async function handleGuardar() {
    if (!form.numero || !form.contratista) { setMsg({ type: 'error', text: 'Número y contratista son obligatorios' }); return; }
    if (!form.entidad) { setMsg({ type: 'error', text: 'La entidad es obligatoria' }); return; }
    if (form.entidad === "OTRA" && !form.entidad_otra?.trim()) { setMsg({ type: 'error', text: 'Debes indicar cuál es la otra entidad' }); return; }
    if (editandoId) {
      const naSel = (nivelesActivosEdit || [])
        .map((x) => parseInt(x, 10))
        .filter((x) => Number.isFinite(x) && x >= 1 && x <= 6);
      const naUniq = [...new Set(naSel)].sort((a, b) => a - b);
      if (naUniq.length < 2) {
        setMsg({ type: 'error', text: 'Debe seleccionar al menos 2 niveles de validación.' });
        return;
      }
    }
    setSaving(true); setMsg(null);
    try {
      const costos_adicionales_lista = (form.costos_adicionales_lista || [])
        .map((row) => ({
          concepto_contractual: (row.concepto_contractual || '').trim(),
          valor_mensual: _numONull(row.valor_mensual),
          tiempo_meses: _numONull(row.tiempo_meses),
        }))
        .filter((row) => row.concepto_contractual);
      const payload = { ...form,
        aiu: _numONull(form.aiu),
        iva: _numONull(form.iva),
        valor_componente_ambiental: _numONull(form.valor_componente_ambiental),
        valor_componente_social: _numONull(form.valor_componente_social),
        valor_componente_pmt: _numONull(form.valor_componente_pmt),
        costo_directo_contrato: _numONull(form.costo_directo_contrato),
        costos_adicionales_lista,
      };
      delete payload.costos_adicionales;
      if (editandoId) {
        await call("PUT", `/contratos/${editandoId}`, payload, CONTRATO_API_PLANO_TIMEOUT);
        const naPut = [...new Set(
          (nivelesActivosEdit || [])
            .map((x) => parseInt(x, 10))
            .filter((x) => Number.isFinite(x) && x >= 1 && x <= 6),
        )].sort((a, b) => a - b);
        await call("PUT", `/sicoe-obra/${editandoId}/niveles-validacion`, { niveles_activos: naPut });
        setMsg({ type: 'success', text: 'Contrato actualizado correctamente' });
        try {
          const fresh = await call("GET", `/contratos/${editandoId}`, null, CONTRATO_API_PLANO_TIMEOUT);
          llenarFormDesdeContrato(fresh);
        } catch {
          llenarFormDesdeContrato({
            ...form,
            aiu: payload.aiu,
            iva: payload.iva,
            valor_componente_ambiental: payload.valor_componente_ambiental,
            valor_componente_social: payload.valor_componente_social,
            valor_componente_pmt: payload.valor_componente_pmt,
            costo_directo_contrato: payload.costo_directo_contrato,
            costos_adicionales_lista: payload.costos_adicionales_lista,
          });
        }
        /* Sigue en modo edición: no vaciar el formulario (era la causa de “no guarda”). */
      } else {
        await call("POST", "/contratos", payload, CONTRATO_API_PLANO_TIMEOUT);
        setMsg({ type: 'success', text: 'Contrato creado correctamente' });
        setForm(FORM_VACIO);
        setEditandoId(null);
        setPlanoArchivoLabel(null);
        if (planoFileInputRef.current) planoFileInputRef.current.value = "";
      }
      recargarContratos();
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Error al guardar contrato' });
    } finally { setSaving(false); }
  }

  useEffect(() => {
    const token = import.meta.env.VITE_MAPBOX_TOKEN;

    const destruirMapaPreview = () => {
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch {
          /* ignore */
        }
        mapRef.current = null;
      }
    };

    if (!form.plano_geojson || !token) {
      destruirMapaPreview();
      return;
    }

    if (!mapContainerRef.current) {
      destruirMapaPreview();
      return;
    }

    let plano = form.plano_geojson;
    if (typeof plano === "string") {
      try {
        plano = JSON.parse(plano);
      } catch {
        destruirMapaPreview();
        return;
      }
    }

    mapboxgl.accessToken = token;
    if (!mapRef.current) {
      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/dark-v11",
        center: [form.centro_lng || -74.08175, form.centro_lat || 4.60971],
        zoom: 11,
      });
      mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");
    }

    const map = mapRef.current;
    const sourceId = "contrato-plano-source";
    const fillId = "contrato-plano-fill";
    const lineId = "contrato-plano-line";
    const labelId = "contrato-plano-labels";

    const renderPlano = () => {
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, { type: "geojson", data: plano });
        map.addLayer({ id: fillId, type: "fill", source: sourceId, paint: { "fill-color": "#00afc5", "fill-opacity": 0.18, "fill-antialias": true } });
        map.addLayer({ id: lineId, type: "line", source: sourceId, paint: { "line-color": "#00afc5", "line-width": 3 } });
        map.addLayer({
          id: labelId,
          type: "symbol",
          source: sourceId,
          filter: [">", ["length", ["to-string", ["coalesce", ["get", "etiqueta"], ["to-string", ["get", "pk_id"]], ["to-string", ["get", "PK_ID"]], ""]]], 0],
          layout: {
            "text-field": ["to-string", ["coalesce", ["get", "etiqueta"], ["get", "pk_id"], ["get", "PK_ID"], ""]],
            "text-size": 10,
            "text-anchor": "center",
            "text-allow-overlap": false,
            "text-ignore-placement": false,
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-color": "rgba(0,0,0,0.75)",
            "text-halo-width": 1.2,
          },
        });
      } else {
        map.getSource(sourceId).setData(plano);
      }

      const b = boundsDesdeGeojson(plano);
      if (b) {
        map.fitBounds(
          [[b.minLng, b.minLat], [b.maxLng, b.maxLat]],
          { padding: 40, maxZoom: 17, duration: 320 }
        );
        const clng = form.centro_lng;
        const clat = form.centro_lat;
        if (Number.isFinite(clng) && Number.isFinite(clat)) {
          map.once("idle", () => {
            const z = map.getZoom();
            map.easeTo({ center: [clng, clat], zoom: z, duration: 280 });
          });
        }
      }
    };

    if (map.isStyleLoaded()) renderPlano();
    else map.once("load", renderPlano);

    return () => {
      map.off("load", renderPlano);
    };
  }, [form.plano_geojson, form.centro_lng, form.centro_lat]);

  useEffect(() => () => {
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
  }, []);

  const inp = { width: '100%', background: '#0a1628', border: '1.5px solid #1E3A5F', borderRadius: 8, padding: '9px 12px', color: '#E0F2FE', fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 12 };
  const lbl = { fontSize: 11, fontWeight: 700, color: '#4a7a87', letterSpacing: 1, display: 'block', marginBottom: 4 };
  const _fmtCOP0 = (n) => {
    if (n == null || n === '' || !Number.isFinite(Number(n))) return '—';
    return formatCOP(n);
  };

  function tasaYmontosResumenListado(c) {
    if (!c || typeof c !== 'object') return null;
    const partes = [];
    if (c.aiu != null && c.aiu !== '' && !Number.isNaN(Number(c.aiu))) {
      partes.push(`AIU ${(Number(c.aiu) * 100).toFixed(4).replace(/\.?0+$/, '')}%`);
    }
    if (c.iva != null && c.iva !== '' && !Number.isNaN(Number(c.iva))) {
      partes.push(`IVA ${(Number(c.iva) * 100).toFixed(2).replace(/\.?0+$/, '')}%`);
    }
    const cop = (v) => (v != null && v !== '' && !Number.isNaN(Number(v)) ? formatCOP(v) : null);
    if (c.costo_directo_contrato != null && c.costo_directo_contrato !== '') { const t = cop(c.costo_directo_contrato); if (t) partes.push(`CD contrato: ${t}`); }
    if (c.valor_componente_ambiental != null && c.valor_componente_ambiental !== '') { const t = cop(c.valor_componente_ambiental); if (t) partes.push(`A: ${t}`); }
    if (c.valor_componente_social != null && c.valor_componente_social !== '') { const t = cop(c.valor_componente_social); if (t) partes.push(`S: ${t}`); }
    if (c.valor_componente_pmt != null && c.valor_componente_pmt !== '') { const t = cop(c.valor_componente_pmt); if (t) partes.push(`PMT: ${t}`); }
    if (c.costos_adicionales != null && c.costos_adicionales !== '') { const t = cop(c.costos_adicionales); if (t) partes.push(`Adic. (otros, suma): ${t}`); }
    if (!partes.length) return null;
    return partes.join(' · ');
  }

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
        {/* FORMULARIO */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#00afc5' }}>
              {editandoId ? '✏️ Editar Contrato' : '➕ Nuevo Contrato'}
            </div>
            {editandoId && (
              <button onClick={cancelarEdicion} style={{ background: 'transparent', border: '1px solid rgba(0,175,197,0.3)', borderRadius: 6, padding: '4px 12px', color: '#8acdd8', fontSize: 12, cursor: 'pointer' }}>
                ← Cancelar
              </button>
            )}
          </div>
          <label style={lbl}>NÚMERO DE CONTRATO *</label>
          <input style={inp} placeholder="Ej: IDU-1551-2017" value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))} />
          <label style={lbl}>OBJETO DEL CONTRATO</label>
          <input style={inp} placeholder="Descripción del objeto contractual" value={form.objeto} onChange={e => setForm(f => ({ ...f, objeto: e.target.value }))} />
          <label style={lbl}>CONTRATISTA *</label>
          <input style={inp} placeholder="Razón social" value={form.contratista} onChange={e => setForm(f => ({ ...f, contratista: e.target.value }))} />
          <label style={lbl}>NIT CONTRATISTA</label>
          <input style={inp} placeholder="Ej: 900.123.456-7" value={form.nit} onChange={e => setForm(f => ({ ...f, nit: e.target.value }))} />
          <label style={lbl}>INTERVENTORÍA</label>
          <input style={inp} placeholder="Razón social interventoría" value={form.interventoria} onChange={e => setForm(f => ({ ...f, interventoria: e.target.value }))} />
          <label style={lbl}>ENTIDAD *</label>
          <select style={inp} value={form.entidad} onChange={e => setForm(f => ({ ...f, entidad: e.target.value, entidad_otra: e.target.value === "OTRA" ? f.entidad_otra : "" }))}>
            <option value="">Selecciona entidad...</option>
            {ENTIDADES.map(ent => <option key={ent} value={ent}>{ent === "OTRA" ? "OTRA... (Indique cuál)" : ent}</option>)}
          </select>
          {form.entidad === "OTRA" && (
            <>
              <label style={lbl}>¿CUÁL ENTIDAD?</label>
              <input style={inp} placeholder="Escribe la entidad" value={form.entidad_otra} onChange={e => setForm(f => ({ ...f, entidad_otra: e.target.value }))} />
            </>
          )}
          <label style={lbl}>LOGO ENTIDAD</label>
          <label style={{ display: 'block', background: '#0a1628', border: '2px dashed #1E3A5F', borderRadius: 8, padding: 12, textAlign: 'center', cursor: 'pointer', color: '#4a7a87', fontSize: 12, marginBottom: 12 }}>
            {form.logo_entidad ? '✅ Logo entidad cargado' : '📂 Cargar logo de entidad'}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleLogo('logo_entidad', e)} />
          </label>
          <label style={lbl}>CARGAR PLANO (GEOJSON)</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
            <label style={{ display: "block", background: "#0a1628", border: "2px dashed #1E3A5F", borderRadius: 8, padding: 12, textAlign: "center", cursor: "pointer", color: "#4a7a87", fontSize: 12 }}>
              {form.plano_geojson
                ? (planoArchivoLabel ? `✅ ${planoArchivoLabel}` : "✅ Plano GeoJSON cargado")
                : "📂 Elegir archivo .geojson / .json"}
              <input ref={planoFileInputRef} type="file" accept=".geojson,.json,application/geo+json,application/json" style={{ display: "none" }} onChange={handlePlanoGeojson} />
            </label>
            {form.plano_geojson && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <button type="button" onClick={abrirSelectorPlanoGeojson}
                  style={{ background: "rgba(0,175,197,0.12)", border: "1px solid rgba(0,175,197,0.45)", borderRadius: 6, padding: "6px 12px", color: "#8acdd8", fontSize: 12, cursor: "pointer" }}>
                  📎 Reemplazar por otro archivo
                </button>
                <button type="button" onClick={() => {
                  if (window.confirm("¿Quitar el plano del formulario? La previsualización se borrará. Si guardas el contrato así, quedará sin plano hasta que subas otro archivo.")) quitarPlanoGeojson();
                }}
                  style={{ background: "transparent", border: "1px solid rgba(239,68,68,0.45)", borderRadius: 6, padding: "6px 12px", color: "#F87171", fontSize: 12, cursor: "pointer" }}>
                  🗑️ Quitar plano
                </button>
              </div>
            )}
          </div>
          {form.centro_lat != null && form.centro_lng != null && (
            <div style={{ fontSize: 11, color: '#8acdd8', marginTop: -2, marginBottom: 12 }}>
              Punto medio detectado: Lat {form.centro_lat} / Lng {form.centro_lng}
            </div>
          )}
          {form.plano_geojson && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: '#4a7a87', letterSpacing: 0.7, marginBottom: 6 }}>PREVISUALIZACIÓN MAPBOX</div>
              {!import.meta.env.VITE_MAPBOX_TOKEN ? (
                <div style={{ padding: 16, borderRadius: 8, border: '1px solid rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.08)', color: '#FCD34D', fontSize: 12, lineHeight: 1.45 }}>
                  El GeoJSON está cargado, pero falta la variable de entorno <code style={{ color: '#FDE68A' }}>VITE_MAPBOX_TOKEN</code> en el frontend; sin token no se puede dibujar el mapa.
                </div>
              ) : (
                <div ref={mapContainerRef} style={{ width: '100%', height: 220, borderRadius: 8, border: '1px solid rgba(0,175,197,0.25)', overflow: 'hidden' }} />
              )}
            </div>
          )}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:0 }}>
            <div>
              <label style={lbl}>AIU (%)</label>
              <input style={inp} type="number" step="0.0001" min="0" max="1" placeholder="Ej: 0.25 → 25%"
                value={form.aiu}
                onChange={e => setForm(f => ({ ...f, aiu: e.target.value }))} />
              {form.aiu !== '' && !isNaN(parseFloat(form.aiu)) && (
                <div style={{ fontSize:11, color:'#00afc5', marginTop:-8, marginBottom:8 }}>
                  = {(parseFloat(form.aiu)*100).toFixed(4).replace(/\.?0+$/,'')}%
                </div>
              )}
            </div>
            <div>
              <label style={lbl}>IVA (%)</label>
              <input style={inp} type="number" step="0.0001" min="0" max="1" placeholder="Ej: 0.19 → 19%"
                value={form.iva}
                onChange={e => setForm(f => ({ ...f, iva: e.target.value }))} />
              {form.iva !== '' && !isNaN(parseFloat(form.iva)) && (
                <div style={{ fontSize:11, color:'#00afc5', marginTop:-8, marginBottom:8 }}>
                  = {(parseFloat(form.iva)*100).toFixed(4).replace(/\.?0+$/,'')}%
                </div>
              )}
            </div>
          </div>
          <div style={{ fontSize: 10, color: '#4a7a87', letterSpacing: 0.6, margin: '4px 0 8px' }}>VALORES CONTRATUALES (COP$)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
            <div>
              <label style={lbl}>VALOR COMPONENTE AMBIENTAL</label>
              <input style={inp} type="number" step="0.01" min="0" placeholder="COP" value={form.valor_componente_ambiental}
                onChange={e => setForm(f => ({ ...f, valor_componente_ambiental: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>VALOR COMPONENTE SOCIAL</label>
              <input style={inp} type="number" step="0.01" min="0" placeholder="COP" value={form.valor_componente_social}
                onChange={e => setForm(f => ({ ...f, valor_componente_social: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>VALOR COMPONENTE PMT</label>
              <input style={inp} type="number" step="0.01" min="0" placeholder="COP" value={form.valor_componente_pmt}
                onChange={e => setForm(f => ({ ...f, valor_componente_pmt: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>COSTO DIRECTO DEL CONTRATO</label>
              <input style={inp} type="number" step="0.01" min="0" placeholder="COP" value={form.costo_directo_contrato}
                onChange={e => setForm(f => ({ ...f, costo_directo_contrato: e.target.value }))} />
            </div>
          </div>
          <div style={{ fontSize: 10, color: '#6ac8c9', letterSpacing: 0.4, margin: '0 0 6px' }}>
            Costos adicionales: concepto, valor mensual (COP$) y plazo en meses. El <strong>valor total</strong> del renglón es automático: redondeo a entero (0 decimales). No forman parte del cobro de precios, AIU, IVA ni listado SICOE.
          </div>
          {(form.costos_adicionales_lista || []).map((row, i) => {
            const vvm = _numONull(row.valor_mensual);
            const ttm = _numONull(row.tiempo_meses);
            const totalCalc = (vvm != null && ttm != null) ? Math.round(vvm * ttm) : null;
            return (
            <div key={i} style={{ marginBottom: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) 0.6fr 0.45fr 0.7fr 36px', gap: 8, alignItems: 'end' }}>
              <div>
                <label style={lbl}>CONCEPTO *</label>
                <input style={inp} placeholder="Ej. servicio fijo, supervisión" value={row.concepto_contractual || ''}
                  onChange={e => {
                    const v = e.target.value;
                    setForm(f => {
                      const arr = [...(f.costos_adicionales_lista || [])];
                      arr[i] = { ...arr[i], concepto_contractual: v };
                      return { ...f, costos_adicionales_lista: arr };
                    });
                  }} />
              </div>
              <div>
                <label style={lbl}>VALOR MENSUAL (COP)</label>
                <input style={inp} type="number" step="0.01" min="0" placeholder="0"
                  value={row.valor_mensual}
                  onChange={e => {
                    const v = e.target.value;
                    setForm(f => {
                      const arr = [...(f.costos_adicionales_lista || [])];
                      arr[i] = { ...arr[i], valor_mensual: v };
                      return { ...f, costos_adicionales_lista: arr };
                    });
                  }} />
              </div>
              <div>
                <label style={lbl}>MESES</label>
                <input style={inp} type="number" step="0.1" min="0" placeholder="0"
                  value={row.tiempo_meses}
                  onChange={e => {
                    const v = e.target.value;
                    setForm(f => {
                      const arr = [...(f.costos_adicionales_lista || [])];
                      arr[i] = { ...arr[i], tiempo_meses: v };
                      return { ...f, costos_adicionales_lista: arr };
                    });
                  }} />
              </div>
              <div>
                <label style={lbl}>COSTO ADICIONAL (CALC.)</label>
                <div style={{ ...inp, display: 'flex', alignItems: 'center', marginBottom: 12, minHeight: 40, color: totalCalc != null ? '#a5f3fc' : '#4a7a87' }}>
                  {totalCalc != null ? _fmtCOP0(totalCalc) : '—'}
                </div>
              </div>
              <button type="button" onClick={() => {
                setForm(f => {
                  const arr = [...(f.costos_adicionales_lista || [])];
                  arr.splice(i, 1);
                  return { ...f, costos_adicionales_lista: arr };
                });
              }} style={{ background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.35)', color: '#f87171', borderRadius: 6, padding: '8px 0', cursor: 'pointer', fontSize: 11 }}>Quitar</button>
            </div>
            <div style={{ fontSize: 10, color: '#5eead4', marginTop: 4, paddingLeft: 2 }}>
              Valor mensual: {vvm != null ? _fmtCOP0(vvm) : '—'}
            </div>
            </div>
            );
          })}
          <button type="button" onClick={() => setForm(f => ({ ...f, costos_adicionales_lista: [...(f.costos_adicionales_lista || []), { concepto_contractual: '', valor_mensual: '', tiempo_meses: '' }] }))} style={{ background: 'rgba(0,175,197,0.2)', border: '1px solid rgba(0,175,197,0.4)', color: '#00afc5', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 12 }}>+ Agregar costo adicional</button>
          {editandoId && (
            <div style={{ marginTop: 8, marginBottom: 16, paddingTop: 16, borderTop: '1px solid rgba(30,58,95,0.5)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#00afc5', marginBottom: 8 }}>Niveles de Validación SICOE</div>
              <div style={{ fontSize: 11, color: '#4a7a87', lineHeight: 1.45, marginBottom: 12 }}>
                Selecciona los niveles que estarán activos para este contrato. El registro se sella al aprobar el nivel más alto seleccionado.
              </div>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <label
                  key={n}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    cursor: 'pointer',
                    background: '#0a1628',
                    border: '1.5px solid #1E3A5F',
                    borderRadius: 8,
                    padding: '10px 12px',
                    marginBottom: 10,
                    color: '#E0F2FE',
                    fontSize: 13,
                    lineHeight: 1.35,
                    boxSizing: 'border-box',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={nivelesActivosEdit.includes(n)}
                    onChange={() => {
                      setNivelesActivosEdit((prev) => {
                        const p = Array.isArray(prev) ? prev : [];
                        if (p.includes(n)) return [...p.filter((x) => x !== n)].sort((a, b) => a - b);
                        return [...p, n].sort((a, b) => a - b);
                      });
                    }}
                    style={{
                      width: 16,
                      height: 16,
                      marginTop: 2,
                      accentColor: '#00afc5',
                      flexShrink: 0,
                      cursor: 'pointer',
                    }}
                  />
                  <span>{SICOE_NIVELES_VALIDACION_ADMIN_LABELS[n]}</span>
                </label>
              ))}
            </div>
          )}
          <label style={lbl}>LOGO CONTRATISTA</label>
          <label style={{ display: 'block', background: '#0a1628', border: '2px dashed #1E3A5F', borderRadius: 8, padding: 12, textAlign: 'center', cursor: 'pointer', color: '#4a7a87', fontSize: 12, marginBottom: 12 }}>
            {form.logo_contratista ? '✅ Logo cargado' : '📂 Cargar logo contratista'}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleLogo('logo_contratista', e)} />
          </label>
          <label style={lbl}>LOGO INTERVENTORÍA</label>
          <label style={{ display: 'block', background: '#0a1628', border: '2px dashed #1E3A5F', borderRadius: 8, padding: 12, textAlign: 'center', cursor: 'pointer', color: '#4a7a87', fontSize: 12, marginBottom: 16 }}>
            {form.logo_interventoria ? '✅ Logo cargado' : '📂 Cargar logo interventoría'}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleLogo('logo_interventoria', e)} />
          </label>
          {msg && <div style={{ background: msg.type === 'error' ? '#2a0a0a' : '#0a2a1a', color: msg.type === 'error' ? '#f87171' : '#4ade80', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>{msg.text}</div>}
        {(editandoId ? perms?.editar : perms?.crear) && (
          <button onClick={handleGuardar} disabled={saving} style={{ background: '#00afc5', border: 'none', borderRadius: 8, padding: '10px 24px', color: '#fff', fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1, fontSize: 13 }}>
            {saving ? 'Guardando...' : (editandoId ? 'Actualizar Contrato' : 'Guardar Contrato')}
          </button>
        )}
        </div>

        {/* LISTA DE CONTRATOS */}
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#00afc5', marginBottom: 20 }}>📋 Contratos registrados</div>
          {contratos.length === 0 ? (
            <div style={{ color: '#4a7a87', fontSize: 13 }}>No hay contratos registrados</div>
          ) : contratos.map(c => {
            const resumenCtz = tasaYmontosResumenListado(c);
            return (
            <div key={c.id} style={{ background: editandoId === c.id ? 'rgba(0,175,197,0.08)' : '#081318', border: `1px solid ${editandoId === c.id ? 'rgba(0,175,197,0.4)' : 'rgba(0,175,197,0.15)'}`, borderRadius: 8, padding: '12px 16px', marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#00afc5', fontSize: 13 }}>{c.numero}</div>
                  <div style={{ color: '#8acdd8', fontSize: 12, marginTop: 2 }}>{c.contratista}</div>
                  {c.entidad && <div style={{ color: '#4a7a87', fontSize: 11, marginTop: 2 }}>Entidad: {c.entidad === "OTRA" ? (c.entidad_otra || "OTRA") : c.entidad}</div>}
                  {c.interventoria && <div style={{ color: '#4a7a87', fontSize: 11, marginTop: 2 }}>Interventoría: {c.interventoria}</div>}
                  {resumenCtz && (
                    <div style={{ color: '#6ac8c9', fontSize: 10, marginTop: 5, lineHeight: 1.4, wordBreak: 'break-word' }} title="Datos guardados en el contrato">
                      {resumenCtz}
                    </div>
                  )}
                  {/* Badge de fase */}
                  <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, background: (c.fase || 'PRESUPUESTO') === 'LIQUIDACION' ? 'rgba(245,158,11,0.12)' : 'rgba(0,175,197,0.10)', border: `1px solid ${(c.fase || 'PRESUPUESTO') === 'LIQUIDACION' ? 'rgba(245,158,11,0.4)' : 'rgba(0,175,197,0.3)'}`, borderRadius: 20, padding: '3px 10px' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: (c.fase || 'PRESUPUESTO') === 'LIQUIDACION' ? '#F59E0B' : '#00afc5', letterSpacing: 1 }}>
                      {(c.fase || 'PRESUPUESTO') === 'LIQUIDACION' ? '⚖️ LIQUIDACIÓN' : '📋 PRESUPUESTO'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    {c.logo_entidad && <img src={c.logo_entidad} alt="logo entidad" style={{ height: 28, borderRadius: 4, background: '#fff', padding: 2 }} />}
                    {c.logo_contratista && <img src={c.logo_contratista} alt="logo" style={{ height: 28, borderRadius: 4, background: '#fff', padding: 2 }} />}
                    {c.logo_interventoria && <img src={c.logo_interventoria} alt="logo" style={{ height: 28, borderRadius: 4, background: '#fff', padding: 2 }} />}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                  {/* Toggle PRESUPUESTO / LIQUIDACIÓN */}
                  {perms?.editar && (
                    <div style={{ display: 'flex', gap: 0, background: '#0a1628', border: '1px solid rgba(0,175,197,0.25)', borderRadius: 8, overflow: 'hidden' }}>
                      {['PRESUPUESTO', 'LIQUIDACION'].map(fase => {
                        const activo = (c.fase || 'PRESUPUESTO') === fase;
                        const col = fase === 'LIQUIDACION' ? '#F59E0B' : '#00afc5';
                        return (
                          <button key={fase} disabled={activo || togglingFase === c.id}
                            onClick={() => toggleFase(c)}
                            style={{ background: activo ? col + '22' : 'transparent', color: activo ? col : '#4a7a87', border: 'none', borderRight: fase === 'PRESUPUESTO' ? '1px solid rgba(0,175,197,0.2)' : 'none', padding: '5px 10px', fontSize: 10, fontWeight: activo ? 700 : 400, cursor: activo ? 'default' : 'pointer', letterSpacing: 0.5, transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
                            {fase === 'PRESUPUESTO' ? '📋 Presupuesto' : '⚖️ Liquidación'}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                  {perms?.editar && (
                    <button
                      onClick={() => editandoId === c.id ? cancelarEdicion() : iniciarEdicion(c)}
                      style={{ background: 'transparent', border: '1px solid rgba(0,175,197,0.3)', borderRadius: 6, padding: '4px 10px', color: '#00afc5', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      {editandoId === c.id ? '✕' : '✏️ Editar'}
                    </button>
                  )}
                  {perms?.eliminar && (
                    <button
                      onClick={async () => {
                        if (!window.confirm(`¿Eliminar contrato ${c.numero}? Esta acción no se puede deshacer.`)) return;
                        try {
                          await call("DELETE", `/contratos/${c.id}`);
                          recargarContratos();
                        } catch (e) { setMsg({ type: 'error', text: e.message }); }
                      }}
                      style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '4px 10px', color: '#ef4444', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      🗑 Eliminar
                    </button>
                  )}
                  </div>
                </div>
              </div>
            </div>
          );
          })}
        </div>
      </div>
    </div>
  );
}



// ─── SECCIÓN 6: Listado de Precios ────────────────────────────────────────
function SeccionListadoPrecios({ call, user, perms, theme }) {
  const contratoId = user?.contrato_id;
  const [items,            setItems]            = useState([]);
  const [loading,          setLoading]          = useState(false);
  const [msg,              setMsg]              = useState(null);
  const [popup,            setPopup]            = useState(null);
  const [stats,            setStats]            = useState(null);
  const [statsLoading,     setStatsLoading]     = useState(false);
  const [saving,           setSaving]           = useState(false);
  const [recalculando,     setRecalculando]     = useState(false);
  const [showCrear,        setShowCrear]        = useState(false);
  const [crearForm,        setCrearForm]        = useState({ capitulo:"",item_numero:"",descripcion:"",unidad:"",competencia:"",tipo_precio:"",precio_unitario:"",especificacion_tecnica:"",acta_fijacion:"",acta_modificatoria:"",observaciones:"",tipo_calculo:"" });
  const [creating,         setCreating]         = useState(false);
  const [uModoCustomC,     setUModoCustomC]     = useState(false);
  const [uModoCustomP,     setUModoCustomP]     = useState(false);
  const [uCustomC,         setUCustomC]         = useState("");
  const [uCustomP,         setUCustomP]         = useState("");
  const [capModoCustomP,   setCapModoCustomP]   = useState(false);
  const [capCustomP,       setCapCustomP]       = useState("");
  const [capModoCustomC,   setCapModoCustomC]   = useState(false);
  const [capCustomC,       setCapCustomC]       = useState("");
  const [filtroTexto,      setFiltroTexto]      = useState("");
  const [filtroCapitulo,   setFiltroCapitulo]   = useState("");
  const [filtroEstado,     setFiltroEstado]     = useState("");

  const col    = C(theme);
  const tdStyle = S.td(theme);
  const tTok   = tFrom(theme);

  const UNIDADES    = ["CM","GL","HORA","KG","KM-CARRIL","LT","M","M2","M3","M3-KM","ML","TON","TRAMO","UN","UN/ME","UND"];
  const COMPETENCIAS = ["EAB","ENEL-CODENSA","ETB","Gas Natural","IDU","MOVISTAR"];

  const fmt     = (v) => v != null ? `$${Math.round(Number(v)).toLocaleString("es-CO")}` : "—";
  const cmpNatural = (a, b) => {
    const num = s => parseFloat((s||"").match(/^(\d+(\.\d+)?)/)?.[1] ?? "9999");
    const na = num(a), nb = num(b);
    if (na !== nb) return na - nb;
    return (a||"").localeCompare(b||"", "es");
  };
  const itemsOrdenados = [...items].sort((a, b) => {
    const cc = cmpNatural(a.capitulo, b.capitulo);
    if (cc !== 0) return cc;
    const ck = (a.competencia||"").localeCompare(b.competencia||"", "es");
    if (ck !== 0) return ck;
    return cmpNatural(a.item_numero, b.item_numero);
  });
  const itemsFiltrados = itemsOrdenados.filter(i => {
    if (filtroTexto    && !((i.descripcion||"")+" "+(i.item_numero||"")).toLowerCase().includes(filtroTexto.toLowerCase())) return false;
    if (filtroCapitulo && (i.capitulo||"") !== filtroCapitulo) return false;
    if (filtroEstado   && (i.estado_precio||"Pendiente") !== filtroEstado) return false;
    return true;
  });
  const capitulosUnicos = [...new Set(items.map(i => i.capitulo).filter(Boolean))].sort(cmpNatural);
  const fmtCant = (v) => v != null ? Number(v).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";

  // ── Carga ──────────────────────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    if (!contratoId) return;
    setLoading(true);
    try { setItems(await call("GET", `/listado-precios/${contratoId}`)); }
    catch (e) { setMsg({ type:"error", text:e.message }); }
    finally { setLoading(false); }
  }, [contratoId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { cargar(); }, [cargar]);

  // ── Popup detalle ──────────────────────────────────────────────────────────
  const abrirDetalle = async (item) => {
    setPopup({ ...item });
    setStats(null);
    setUModoCustomP(false);
    setUCustomP("");
    setStatsLoading(true);
    try { setStats(await call("GET", `/listado-precios/item/${item.id}/stats`)); }
    catch { setStats(null); }
    finally { setStatsLoading(false); }
  };

  const setPopupField = (k, v) => setPopup(p => ({ ...p, [k]: v }));

  const cambiarTipoPopup = (tipo) => {
    if (tipo === "Precio Contractual")
      setPopup(p => ({ ...p, tipo_precio:tipo, acta_fijacion:"Contractual", acta_modificatoria:"", estado_precio:"Aprobado" }));
    else
      setPopup(p => ({ ...p, tipo_precio:tipo, acta_fijacion:"", acta_modificatoria:"", estado_precio:"Pendiente" }));
  };

  const guardarEdicion = async () => {
    if (!popup) return;
    setSaving(true);
    try {
      await call("PUT", `/listado-precios/item/${popup.id}`, popup);
      setMsg({ type:"success", text:"✅ Precio actualizado correctamente." });
      const [updated, freshStats] = await Promise.all([
        call("GET", `/listado-precios/${contratoId}`),
        call("GET", `/listado-precios/item/${popup.id}/stats`).catch(() => null),
      ]);
      setItems(updated || []);
      const fresh = (updated || []).find(i => i.id === popup.id);
      if (fresh) setPopup({ ...fresh });
      if (freshStats) setStats(freshStats);
    } catch (e) { setMsg({ type:"error", text:e.message }); }
    finally { setSaving(false); }
  };

  const recalcular = async () => {
    if (!popup) return;
    if (!window.confirm("¿Recalcular todos los registros de cobro de este ítem de Pendiente → Aprobado?")) return;
    setRecalculando(true);
    try {
      const res = await call("POST", `/listado-precios/item/${popup.id}/recalcular`);
      setMsg({ type:"success", text:`✅ ${res.recalculados} registros de cobro actualizados a Aprobado.` });
    } catch (e) { setMsg({ type:"error", text:e.message }); }
    finally { setRecalculando(false); }
  };

  // ── Plantilla CSV ──────────────────────────────────────────────────────────
  const descargarPlantilla = () => {
    const filas = [
      "capitulo,competencia,item_numero,descripcion,unidad,precio_unitario,tipo_precio,especificacion_tecnica,acta_fijacion,acta_modificatoria,observaciones,tipo_calculo",
      "1.PRELIMINARES,IDU,1.01,REPLANTEO GENERAL,M2,601,Precio Contractual,Descripción técnica del ítem,,,AIU",
      "2.EXCAVACIONES,IDU,2.01,EXCAVACION MECANICA,M3,4819,Precio No Previsto,Descripción técnica,15,3,Ítem adicional aprobado,IVA",
    ].join("\n");
    const blob = new Blob(["\uFEFF" + filas], { type:"text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download="plantilla_listado_precios.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // ── CSV import ─────────────────────────────────────────────────────────────
  const uploadCSV = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const raw = ev.target.result.replace(/\r\n/g,"\n").replace(/\r/g,"\n");
        const lines = raw.split("\n").filter(l => l.trim());
        if (lines.length < 2) { setMsg({ type:"error", text:"El CSV no tiene datos." }); return; }
        const sep = lines[0].includes(";") ? ";" : ",";
        const parseRow = (line) => {
          const vals=[]; let cur=""; let inQ=false;
          for (let i=0;i<line.length;i++){
            const ch=line[i];
            if(ch==='"'){inQ=!inQ;}
            else if(ch===sep&&!inQ){vals.push(cur.trim());cur="";}
            else{cur+=ch;}
          }
          vals.push(cur.trim());
          return vals.map(v=>v.replace(/^"|"$/g,"").trim());
        };
        const CAMPOS={"capitulo":"capitulo","capítulo":"capitulo","competencia":"competencia","item_numero":"item_numero","ítem":"item_numero","item":"item_numero","nro":"item_numero","descripcion":"descripcion","descripción":"descripcion","unidad":"unidad","und":"unidad","precio_unitario":"precio_unitario","precio unitario":"precio_unitario","precio":"precio_unitario","valor":"precio_unitario","valorunitario":"precio_unitario","valor unitario":"precio_unitario","tipo_precio":"tipo_precio","tipo de precio":"tipo_precio","tipoprecio":"tipo_precio","especificacion_tecnica":"especificacion_tecnica","especificación técnica":"especificacion_tecnica","especificacion tecnica":"especificacion_tecnica","acta_fijacion":"acta_fijacion","acta de fijación":"acta_fijacion","acta fijacion":"acta_fijacion","acta_modificatoria":"acta_modificatoria","acta modificatoria":"acta_modificatoria","observaciones":"observaciones","estado_precio":"estado_precio"};
        const rawHeaders=parseRow(lines[0]).map(h=>h.toLowerCase());
        const headers=rawHeaders.map(h=>CAMPOS[h]||h);
        const parsed=lines.slice(1).map(line=>{
          const vals=parseRow(line); const obj={};
          headers.forEach((h,i)=>{if(vals[i]!==undefined&&vals[i]!=="")obj[h]=vals[i];});
          return obj;
        }).filter(r=>r.descripcion||r.item_numero);
        await call("POST",`/listado-precios/${contratoId}/bulk`,parsed);
        setMsg({type:"success",text:`✅ ${parsed.length} ítems cargados correctamente.`});
        cargar();
      } catch(ex){setMsg({type:"error",text:ex.message});}
    };
    reader.readAsText(file,"UTF-8");
    e.target.value="";
  };

  // ── XLSX export ────────────────────────────────────────────────────────────
  const exportarXLSX = () => {
    if (!items.length) return;
    const data = itemsOrdenados.map(i => ({
      "Capítulo":               i.capitulo                || "",
      "Competencia":            i.competencia             || "",
      "Ítem":                   i.item_numero             || "",
      "Descripción":            i.descripcion             || "",
      "Unidad":                 i.unidad                  || "",
      "Valor Unitario":         i.precio_unitario         || 0,
      "Estado":                 i.estado_precio           || "",
      "Tipo de Precio":         i.tipo_precio             || "",
      "Especificación Técnica": i.especificacion_tecnica  || "",
      "Acta de Fijación":       i.acta_fijacion           || "",
      "Acta Modificatoria":     i.acta_modificatoria      || "",
      "Observaciones":          i.observaciones           || "",
      "Tipo de Cálculo":        i.tipo_calculo            || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{wch:24},{wch:16},{wch:10},{wch:48},{wch:10},{wch:16},{wch:12},{wch:20},{wch:42},{wch:16},{wch:18},{wch:30},{wch:14}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Listado de Precios");
    XLSX.writeFile(wb, `listado_precios_${contratoId}.xlsx`);
    call("POST", `/listado-precios/${contratoId}/log-exportar`).catch(() => {});
  };

  // ── Crear precio ───────────────────────────────────────────────────────────
  const setCF = (k, v) => setCrearForm(p => ({ ...p, [k]: v }));

  const cambiarTipoCrear = (tipo) => {
    if (tipo === "Precio Contractual")
      setCrearForm(p => ({ ...p, tipo_precio:tipo, acta_fijacion:"Contractual", acta_modificatoria:"" }));
    else
      setCrearForm(p => ({ ...p, tipo_precio:tipo, acta_fijacion:"", acta_modificatoria:"" }));
  };

  const crearPrecio = async () => {
    const { item_numero, descripcion, unidad, tipo_precio, precio_unitario, especificacion_tecnica, tipo_calculo } = crearForm;
    if (!item_numero||!descripcion||!unidad||!tipo_precio||!precio_unitario||!especificacion_tecnica||!tipo_calculo) {
      setMsg({ type:"error", text:"Complete todos los campos obligatorios (*)." }); return;
    }
    setCreating(true);
    try {
      await call("POST", `/listado-precios/${contratoId}/item`, {
        ...crearForm, precio_unitario: parseFloat(crearForm.precio_unitario) || 0,
      });
      setMsg({ type:"success", text:"✅ Precio creado correctamente." });
      setShowCrear(false);
      setCrearForm({ capitulo:"",item_numero:"",descripcion:"",unidad:"",competencia:"",tipo_precio:"",precio_unitario:"",especificacion_tecnica:"",acta_fijacion:"",acta_modificatoria:"",observaciones:"" });
      setUModoCustomC(false); setUCustomC("");
      cargar();
    } catch(e){ setMsg({ type:"error", text:e.message }); }
    finally { setCreating(false); }
  };

  // ── Variables derivadas ────────────────────────────────────────────────────
  const popupEsContractual = popup?.tipo_precio === "Precio Contractual";
  const popupEsAprobado    = popup?.estado_precio === "Aprobado";
  const crearEsContractual = crearForm.tipo_precio === "Precio Contractual";
  const puedeAprobarNP     = popup && !popupEsContractual &&
    popup.acta_fijacion && popup.acta_fijacion !== "0" &&
    popup.acta_modificatoria && popup.acta_modificatoria !== "0";

  // ── Estilos locales reutilizables (tema claro y descanso usan tokens; oscuro, capa fija) ─
  const labelStyle   = { fontSize: "var(--cc-caption)", color: col.textSecondary, marginBottom: 5 };
  const inputStyle   = !isDarkMode(theme) ? { ...S.input, background: tTok.inputBg, color: tTok.text, border: `1px solid ${tTok.border}` } : S.input;
  const selectStyle  = !isDarkMode(theme) ? { ...S.select, background: tTok.inputBg, color: tTok.text, border: `1px solid ${tTok.border}`, width: "100%" } : { ...S.select, width: "100%" };
  const overlayStyle = { position: "fixed", inset: 0, zIndex: 10001, background: "rgba(5,12,18,0.92)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" };
  const modalStyle   = (w) => ({
    width: `min(${w}px,95vw)`, maxHeight: "92vh", borderRadius: 14,
    background: isDarkMode(theme) ? "#0b1920" : tTok.bg, border: `1px solid ${tTok.border}`,
    boxShadow: isRestMode(theme) ? "0 32px 56px rgba(42,35,24,0.2)" : "0 40px 100px rgba(0,0,0,0.7)", overflow: "hidden", display: "flex", flexDirection: "column",
  });
  const modalHeadBg  = isDarkMode(theme) ? "#081318" : (isRestMode(theme) ? tTok.headerBg : "#E0F2FE");
  const modalHead    = { padding: "12px 20px 10px", borderBottom: `1px solid ${isDarkMode(theme) ? "rgba(0,175,197,0.12)" : tTok.border}`, background: modalHeadBg, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 };
  const modalScroll  = { flex: 1, overflowY: "auto", padding: "14px 20px", scrollbarWidth: "thin", scrollbarColor: isDarkMode(theme) ? "#1e3a44 transparent" : `${tTok.border}44`, background: isDarkMode(theme) ? "transparent" : (isRestMode(theme) ? tTok.bgCard : "#F8FAFC") };
  const modalFoot    = { padding: "10px 20px", borderTop: `1px solid ${isDarkMode(theme) ? "rgba(0,175,197,0.1)" : tTok.border}`, background: modalHeadBg, display: "flex", justifyContent: "flex-end", gap: 10, flexShrink: 0 };
  const secTitle     = { fontSize: "var(--cc-caption)", color: tTok.primary, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 };
  const divider      = { borderTop: isDarkMode(theme) ? "1px solid rgba(0,175,197,0.1)" : `1px solid ${tTok.border}`, paddingTop: 12, marginBottom: 12 };

  const UnidadSelector = ({ value, onChange, modoCustom, setModoCustom, uCustom, setUCustom }) => (
    <div>
      {!modoCustom ? (
        <select style={{ ...S.select,width:"100%" }} value={UNIDADES.includes(value)?value:(value?"__prev__":"")}
          onChange={e => {
            if (e.target.value === "__custom__") { setModoCustom(true); setUCustom(""); onChange(""); }
            else if (e.target.value === "__prev__") { /* mantiene valor */ }
            else onChange(e.target.value);
          }}>
          <option value="">-- Selecciona --</option>
          {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
          {value && !UNIDADES.includes(value) && <option value="__prev__">{value}</option>}
          <option value="__custom__">+ Agregar unidad...</option>
        </select>
      ) : (
        <div style={{ display:"flex",gap:6 }}>
          <input style={{ ...S.input,padding:"5px 8px",fontSize:12 }} placeholder="Nueva unidad" value={uCustom}
            onChange={e => setUCustom(e.target.value)}
            onKeyDown={e => { if(e.key==="Enter"&&uCustom.trim()){ onChange(uCustom.trim().toUpperCase()); setModoCustom(false); }}} />
          <button style={S.btn("primary",true)} onClick={() => { if(uCustom.trim()){ onChange(uCustom.trim().toUpperCase()); setModoCustom(false); }}}>+</button>
          <button style={S.btn("ghost",true)} onClick={() => setModoCustom(false)}>✕</button>
        </div>
      )}
    </div>
  );

  if (!contratoId) return <div style={S.empty}>No hay contrato activo en tu sesión.</div>;

  return (
    <div>
      {msg && (
        <div style={S.alert(msg.type)}>
          {msg.text}
          <span onClick={() => setMsg(null)} style={{ float:"right",cursor:"pointer",opacity:0.6 }}>✕</span>
        </div>
      )}

      {/* ── Barra de acciones ── */}
      <div style={{ display:"flex",gap:10,marginBottom:20,flexWrap:"wrap",alignItems:"center" }}>
        {perms?.crear && <button style={S.btn("primary",true)} onClick={() => setShowCrear(true)}>+ Crear Precio</button>}
        {perms?.crear && (
          <label style={{ ...S.btn("ghost",true),cursor:"pointer",display:"inline-flex",alignItems:"center",gap:4 }}>
            ⬆ Importar CSV
            <input type="file" accept=".csv" style={{ display:"none" }} onChange={uploadCSV} />
          </label>
        )}
        {perms?.exportar && items.length > 0 && (
          <button style={S.btn("ghost",true)} onClick={exportarXLSX}>⬇ Exportar XLSX</button>
        )}
        <button style={S.btn("ghost",true)} onClick={descargarPlantilla} title="Descarga un CSV de ejemplo con todos los campos">📋 Plantilla</button>
        {items.length > 0 && (
          <span style={{ marginLeft:"auto",fontSize:12,color:col.textMuted }}>{items.length.toLocaleString("es-CO")} precios</span>
        )}
      </div>

      {/* ── Filtros ── */}
      {items.length > 0 && !loading && (
        <div style={{ display:"flex",gap:10,flexWrap:"wrap",marginBottom:14,alignItems:"center" }}>
          <input style={{ ...S.input,padding:"6px 10px",fontSize:12,flex:"1 1 180px",maxWidth:260 }}
            placeholder="🔍 Buscar descripción o ítem..." value={filtroTexto}
            onChange={e=>setFiltroTexto(e.target.value)} />
          <select style={{ ...S.select,minWidth:160 }} value={filtroCapitulo}
            onChange={e=>setFiltroCapitulo(e.target.value)}>
            <option value="">Todos los capítulos</option>
            {capitulosUnicos.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
          <select style={{ ...S.select,minWidth:130 }} value={filtroEstado}
            onChange={e=>setFiltroEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="Aprobado">✓ Aprobado</option>
            <option value="Pendiente">⏳ Pendiente</option>
          </select>
          {(filtroTexto||filtroCapitulo||filtroEstado) && (
            <button style={S.btn("ghost",true)} onClick={()=>{setFiltroTexto("");setFiltroCapitulo("");setFiltroEstado("");}}>✕ Limpiar</button>
          )}
          {(filtroTexto||filtroCapitulo||filtroEstado) && (
            <span style={{ fontSize:12,color:col.textMuted }}>
              {itemsFiltrados.length.toLocaleString("es-CO")} de {items.length.toLocaleString("es-CO")} precios
            </span>
          )}
        </div>
      )}

      {/* ── Grilla ── */}
      {loading ? (
        <div style={S.empty}><span style={{ color:"#00afc5" }}>Cargando...</span></div>
      ) : items.length === 0 ? (
        <div style={S.empty}>No hay precios cargados para este contrato.<br/><span style={{ fontSize:12,color:col.textMuted }}>Usa "Crear Precio" o "Importar CSV".</span></div>
      ) : itemsFiltrados.length === 0 ? (
        <div style={S.empty}>Ningún precio coincide con los filtros aplicados.<br/><span style={{ fontSize:12,color:col.textMuted }}>Prueba ajustando los criterios de búsqueda.</span></div>
      ) : (
        <div style={{ overflowX:"auto" }}>
          <table style={S.table}>
            <thead>
              <tr>
                {["Capítulo","Competencia","Ítem","Descripción","Unidad","Valor Unitario","Estado"].map((h,i) => (
                  <th key={i} style={S.th(theme)}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itemsFiltrados.map(item => (
                <tr key={item.id} onClick={() => abrirDetalle(item)} style={{ cursor:"pointer",transition:"background 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.background="rgba(0,175,197,0.05)"}
                  onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                  <td style={{ ...tdStyle,color:col.textMuted,fontSize:12,maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{item.capitulo||"—"}</td>
                  <td style={{ ...tdStyle,color:col.textMuted,fontSize:12 }}>{item.competencia||"—"}</td>
                  <td style={{ ...tdStyle,color:col.textSecondary,fontWeight:600,fontSize:12 }}>{item.item_numero||"—"}</td>
                  <td style={{ ...tdStyle,color:col.textTable }}>{item.descripcion}</td>
                  <td style={{ ...tdStyle,color:col.textSecondary,fontSize:12 }}>{item.unidad||"—"}</td>
                  <td style={{ ...tdStyle,color:"#22c55e",fontWeight:600,fontSize:12,textAlign:"right" }}>
                    {item.precio_unitario ? `$${Math.round(item.precio_unitario).toLocaleString("es-CO")}` : "—"}
                  </td>
                  <td style={tdStyle}>
                    <span style={S.badge(item.estado_precio==="Aprobado"?"aprobado":"pendiente")}>
                      {item.estado_precio||"Pendiente"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ══════════════ POPUP DETALLE ══════════════ */}
      {popup && (
        <div style={overlayStyle} onClick={e => e.target===e.currentTarget && setPopup(null)}>
          <div style={modalStyle(1100)}>

            <div style={modalHead}>
              <div>
                <div style={{ fontSize:10,color:col.textSecondary,letterSpacing:1,textTransform:"uppercase",marginBottom:3 }}>Detalle del Precio</div>
                <div style={{ fontSize:17,fontWeight:700,color:col.textPrimary,fontFamily:"'Rajdhani',sans-serif" }}>
                  {popup.item_numero} — {(popup.descripcion||"").substring(0,55)}{(popup.descripcion||"").length>55?"...":""}
                </div>
              </div>
              <div style={{ display:"flex",alignItems:"center",gap:12 }}>
                <span style={{ ...S.badge(popupEsAprobado?"aprobado":"pendiente"),fontSize:12,padding:"5px 14px" }}>
                  {popupEsAprobado?"✓ Aprobado":"⏳ Pendiente"}
                </span>
                <button style={S.closeBtn(theme)} onClick={() => setPopup(null)}>✕</button>
              </div>
            </div>

            <div style={{display:"flex",flex:1,overflow:"hidden"}}>

              {/* ── Panel izquierdo: formulario ── */}
              <div style={{flex:"0 0 56%",padding:"10px 14px",overflowY:"auto",borderRight:`1px solid ${tTok.border}`}}>
                <div style={{...secTitle,marginBottom:10}}>Información del Precio</div>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div>
                    <div style={labelStyle}>Capítulo</div>
                    {perms?.editar ? (
                      !capModoCustomP ? (
                        <select style={selectStyle} value={capitulosUnicos.includes(popup.capitulo||"")?popup.capitulo||"":""}
                          onChange={e=>{if(e.target.value==="__custom__"){setCapModoCustomP(true);setCapCustomP("");}else setPopupField("capitulo",e.target.value);}}>
                          <option value="">-- Selecciona --</option>
                          {capitulosUnicos.map(c=><option key={c} value={c}>{c}</option>)}
                          {popup.capitulo && !capitulosUnicos.includes(popup.capitulo) && <option value={popup.capitulo}>{popup.capitulo}</option>}
                          <option value="__custom__">+ Agregar capítulo...</option>
                        </select>
                      ) : (
                        <div style={{display:"flex",gap:6}}>
                          <input style={inputStyle} placeholder="Nuevo capítulo" value={capCustomP} onChange={e=>setCapCustomP(e.target.value)}
                            onKeyDown={e=>{if(e.key==="Enter"&&capCustomP.trim()){setPopupField("capitulo",capCustomP.trim());setCapModoCustomP(false);}}} />
                          <button style={S.btn("primary",true)} onClick={()=>{if(capCustomP.trim()){setPopupField("capitulo",capCustomP.trim());setCapModoCustomP(false);}}}>+</button>
                          <button style={S.btn("ghost",true)} onClick={()=>setCapModoCustomP(false)}>✕</button>
                        </div>
                      )
                    ) : (
                      <input style={{...inputStyle,opacity:0.55}} value={popup.capitulo||""} disabled />
                    )}
                  </div>
                  <div>
                    <div style={labelStyle}>Competencia</div>
                    <select style={{...selectStyle,opacity:perms?.editar?1:0.55}} value={popup.competencia||""} disabled={!perms?.editar} onChange={e=>setPopupField("competencia",e.target.value)}>
                      <option value="">-- Selecciona --</option>
                      {COMPETENCIAS.map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div>
                    <div style={labelStyle}>Ítem *</div>
                    <input style={{...inputStyle,opacity:perms?.editar?1:0.55}} value={popup.item_numero||""} disabled={!perms?.editar} onChange={e=>setPopupField("item_numero",e.target.value)} />
                  </div>
                  <div>
                    <div style={labelStyle}>Tipo de Precio *</div>
                    <select style={{...selectStyle,opacity:perms?.editar?1:0.55}} value={popup.tipo_precio||""} disabled={!perms?.editar} onChange={e=>cambiarTipoPopup(e.target.value)}>
                      <option value="">-- Selecciona --</option>
                      <option value="Precio Contractual">Precio Contractual</option>
                      <option value="Precio No Previsto">Precio No Previsto</option>
                    </select>
                  </div>
                </div>

                <div style={{marginBottom:10}}>
                  <div style={labelStyle}>Descripción *</div>
                  <input style={{...inputStyle,opacity:perms?.editar?1:0.55}} value={popup.descripcion||""} disabled={!perms?.editar} onChange={e=>setPopupField("descripcion",e.target.value)} />
                </div>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                  <div>
                    <div style={labelStyle}>Unidad *</div>
                    {perms?.editar ? (
                      <UnidadSelector value={popup.unidad||""} onChange={v=>setPopupField("unidad",v)}
                        modoCustom={uModoCustomP} setModoCustom={setUModoCustomP}
                        uCustom={uCustomP} setUCustom={setUCustomP} />
                    ) : (
                      <input style={{...inputStyle,opacity:0.55}} value={popup.unidad||""} disabled />
                    )}
                  </div>
                  <div>
                    <div style={labelStyle}>Valor Unitario *</div>
                    <input style={{...inputStyle,opacity:perms?.editar?1:0.55}} type="number" value={popup.precio_unitario||""} disabled={!perms?.editar} onChange={e=>setPopupField("precio_unitario",parseFloat(e.target.value)||0)} />
                  </div>
                  <div>
                    <div style={labelStyle}>Costo Directo</div>
                    <div style={{...inputStyle,opacity:0.5,pointerEvents:"none",color:"#22c55e",fontWeight:600}}>
                      {statsLoading?"...":fmt(stats?Math.round((stats.cant_presupuestada||0)*(popup.precio_unitario||0)):null)}
                    </div>
                  </div>
                </div>

                <div style={{marginBottom:10}}>
                  <div style={labelStyle}>Especificación Técnica *</div>
                  <textarea style={{...inputStyle,resize:"vertical",minHeight:54,opacity:perms?.editar?1:0.55}} value={popup.especificacion_tecnica||""} disabled={!perms?.editar} onChange={e=>setPopupField("especificacion_tecnica",e.target.value)} />
                </div>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div>
                    <div style={labelStyle}>Acta de Fijación {!popupEsContractual?"*":""}</div>
                    <input style={{...inputStyle,opacity:(!perms?.editar||popupEsContractual)?0.45:1}}
                      value={popup.acta_fijacion||""} disabled={!perms?.editar||popupEsContractual}
                      placeholder={popupEsContractual?"Contractual (automático)":"Número de acta"}
                      onChange={e=>setPopupField("acta_fijacion",e.target.value.replace(/[^0-9]/g,""))} />
                  </div>
                  <div>
                    <div style={labelStyle}>Acta Modificatoria {!popupEsContractual?"*":""}</div>
                    <input style={{...inputStyle,opacity:(!perms?.editar||popupEsContractual)?0.45:1}}
                      value={popup.acta_modificatoria||""} disabled={!perms?.editar||popupEsContractual}
                      placeholder={popupEsContractual?"N/A":"Número de acta modificatoria"}
                      onChange={e=>setPopupField("acta_modificatoria",e.target.value.replace(/[^0-9]/g,""))} />
                  </div>
                </div>

                <div style={{marginBottom:10}}>
                  <div style={labelStyle}>Tipo de Cálculo *</div>
                  <select style={{...selectStyle,opacity:perms?.editar?1:0.55}} value={popup.tipo_calculo||""} disabled={!perms?.editar} onChange={e=>setPopupField("tipo_calculo",e.target.value)}>
                    <option value="">-- Selecciona --</option>
                    <option value="AIU">AIU</option>
                    <option value="IVA">IVA</option>
                  </select>
                </div>
                <div>
                  <div style={labelStyle}>Observaciones</div>
                  <textarea style={{...inputStyle,resize:"vertical",minHeight:46,opacity:perms?.editar?1:0.55}} value={popup.observaciones||""} disabled={!perms?.editar} onChange={e=>setPopupField("observaciones",e.target.value)} />
                </div>
              </div>

              {/* ── Panel derecho: balance + validación ── */}
              <div style={{flex:"0 0 44%",padding:"14px 20px",overflowY:"auto",display:"flex",flexDirection:"column",gap:18}}>

                <div>
                  <div style={{...secTitle,marginBottom:10}}>Balance Presupuesto vs Cobro</div>
                  {statsLoading ? (
                    <div style={{color:"#4a7a87",fontSize:13,padding:"6px 0"}}>Calculando estadísticas...</div>
                  ) : stats ? (
                    (() => {
                    const CardBalance = ({label, cant, costo, color, bg, border}) => (
                      <div style={{background:bg,border:`1px solid ${border}`,borderRadius:8,padding:"8px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div>
                          <div style={{fontSize:9,color:"#4a7a87",letterSpacing:0.8,textTransform:"uppercase",marginBottom:2}}>{label}</div>
                          <div style={{fontSize:16,fontWeight:700,color}}>{fmtCant(cant)}</div>
                          <div style={{fontSize:10,color:"#4a7a87",marginTop:1}}>{popup.unidad||""}</div>
                        </div>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:9,color:"#4a7a87",marginBottom:2}}>Costo Directo</div>
                          <div style={{fontSize:13,fontWeight:700,color}}>{fmt(costo)}</div>
                        </div>
                      </div>
                    );
                    const bPptoCant  = stats.balance_cant;
                    const bLiqCant   = stats.balance_liq_cant ?? 0;
                    const hayLiq     = (stats.cant_liquidacion ?? 0) > 0;
                    return (
                      <div style={{display:"flex",flexDirection:"column",gap:6}}>
                        {/* ── Grupo 1: Presupuesto vs Cobro ── */}
                        <div style={{fontSize:9,color:"#00afc5",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:2}}>📋 Presupuesto de Obra vs Cobro</div>
                        <CardBalance label="Presupuestado"
                          cant={stats.cant_presupuestada} costo={stats.costo_presupuestado}
                          color="#00afc5" bg="rgba(0,175,197,0.06)" border="rgba(0,175,197,0.2)" />
                        <CardBalance label="Cobrado"
                          cant={stats.cant_cobrada} costo={stats.costo_cobrado}
                          color="#22c55e" bg="rgba(34,197,94,0.06)" border="rgba(34,197,94,0.2)" />
                        <CardBalance
                          label={bPptoCant>=0?"Disponible por cobrar":"Excedido"}
                          cant={bPptoCant} costo={stats.balance_costo}
                          color={bPptoCant>=0?"#22c55e":"#ef4444"}
                          bg={bPptoCant>=0?"rgba(34,197,94,0.06)":"rgba(239,68,68,0.06)"}
                          border={bPptoCant>=0?"rgba(34,197,94,0.2)":"rgba(239,68,68,0.2)"} />

                        {/* ── Grupo 2: Liquidación vs Cobro ── */}
                        <div style={{fontSize:9,color:"#a78bfa",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginTop:6,marginBottom:2}}>⚖️ Obra Ejecutada vs Cobro</div>
                        <CardBalance label="Liquidación (Obra Ejecutada)"
                          cant={stats.cant_liquidacion??0} costo={stats.costo_liquidacion??0}
                          color="#a78bfa" bg="rgba(167,139,250,0.06)" border="rgba(167,139,250,0.2)" />
                        <CardBalance
                          label={bLiqCant>=0?"Por Cobrar":"Por Devolución"}
                          cant={bLiqCant} costo={stats.balance_liq_costo??0}
                          color={bLiqCant>=0?"#22c55e":"#f59e0b"}
                          bg={bLiqCant>=0?"rgba(34,197,94,0.06)":"rgba(245,158,11,0.06)"}
                          border={bLiqCant>=0?"rgba(34,197,94,0.2)":"rgba(245,158,11,0.2)"} />
                        {!hayLiq && (
                          <div style={{fontSize:11,color:"#4a7a87",fontStyle:"italic",textAlign:"center",paddingTop:4}}>
                            Sin registros de Obra Ejecutada para este ítem
                          </div>
                        )}
                      </div>
                    );
                  })()
                  ) : (
                    <div style={{color:"#4a7a87",fontSize:13}}>No se pudieron cargar las estadísticas.</div>
                  )}
                </div>

                <div style={{borderTop:`1px solid ${tTok.border}`,paddingTop:10}}>
                  <div style={{...secTitle,marginBottom:10}}>Validación del Precio</div>
                  <div style={{display:"flex",flexDirection:"column",gap:12,alignItems:"flex-start"}}>
                    <span style={{...S.badge(popupEsAprobado?"aprobado":"pendiente"),fontSize:13,padding:"6px 16px"}}>
                      {popupEsAprobado?"✓ Precio Aprobado":"⏳ Pendiente de Aprobación"}
                    </span>
                    {perms?.validar && !popupEsAprobado && !popupEsContractual && (
                      <span style={{fontSize:12,color:puedeAprobarNP?"#22c55e":"#f59e0b",lineHeight:1.6}}>
                        {puedeAprobarNP
                          ? "✓ Condiciones cumplidas — guarda los cambios para aprobar"
                          : "⚠ Complete Acta de Fijación y Acta Modificatoria (número > 0) para aprobar"}
                      </span>
                    )}
                    {perms?.validar && popupEsAprobado && (
                      <button style={S.btn("primary",true)} onClick={recalcular} disabled={recalculando}>
                        {recalculando?"Recalculando...":"⟳ Recalcular Cobros"}
                      </button>
                    )}
                  </div>
                </div>

              </div>
            </div>

            <div style={modalFoot}>
              <button style={S.btn("ghost")} onClick={() => setPopup(null)}>Cerrar</button>
              {perms?.editar && (
                <button style={S.btn("primary")} onClick={guardarEdicion} disabled={saving}>
                  {saving?"Guardando...":"💾 Guardar cambios"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ MODAL CREAR PRECIO ══════════════ */}
      {showCrear && (
        <div style={overlayStyle} onClick={e => e.target===e.currentTarget && setShowCrear(false)}>
          <div style={modalStyle(760)}>

            <div style={modalHead}>
              <div>
                <div style={{ fontSize:17,fontWeight:700,color:col.textPrimary,fontFamily:"'Rajdhani',sans-serif" }}>Crear Nuevo Precio</div>
                <div style={{ fontSize:11,color:col.textSecondary,marginTop:2 }}>Complete los campos para agregar un precio al listado</div>
              </div>
              <button style={S.closeBtn(theme)} onClick={() => setShowCrear(false)}>✕</button>
            </div>

            <div style={modalScroll}>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14 }}>
                <div>
                  <div style={labelStyle}>Capítulo</div>
                  {!capModoCustomC ? (
                    <select style={selectStyle} value={capitulosUnicos.includes(crearForm.capitulo)?crearForm.capitulo:""}
                      onChange={e=>{if(e.target.value==="__custom__"){setCapModoCustomC(true);setCapCustomC("");}else setCF("capitulo",e.target.value);}}>
                      <option value="">-- Selecciona --</option>
                      {capitulosUnicos.map(c=><option key={c} value={c}>{c}</option>)}
                      <option value="__custom__">+ Agregar capítulo...</option>
                    </select>
                  ) : (
                    <div style={{display:"flex",gap:6}}>
                      <input style={inputStyle} placeholder="Nuevo capítulo" value={capCustomC} onChange={e=>setCapCustomC(e.target.value)}
                        onKeyDown={e=>{if(e.key==="Enter"&&capCustomC.trim()){setCF("capitulo",capCustomC.trim());setCapModoCustomC(false);}}} />
                      <button style={S.btn("primary",true)} onClick={()=>{if(capCustomC.trim()){setCF("capitulo",capCustomC.trim());setCapModoCustomC(false);}}}>+</button>
                      <button style={S.btn("ghost",true)} onClick={()=>setCapModoCustomC(false)}>✕</button>
                    </div>
                  )}
                </div>
                <div>
                  <div style={labelStyle}>Competencia</div>
                  <select style={selectStyle} value={crearForm.competencia} onChange={e=>setCF("competencia",e.target.value)}>
                    <option value="">-- Selecciona --</option>
                    {COMPETENCIAS.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14 }}>
                <div>
                  <div style={labelStyle}>Ítem *</div>
                  <input style={inputStyle} value={crearForm.item_numero} onChange={e=>setCF("item_numero",e.target.value)} placeholder="Ej: 1.01" />
                </div>
                <div>
                  <div style={labelStyle}>Tipo de Precio *</div>
                  <select style={selectStyle} value={crearForm.tipo_precio} onChange={e=>cambiarTipoCrear(e.target.value)}>
                    <option value="">-- Selecciona --</option>
                    <option value="Precio Contractual">Precio Contractual</option>
                    <option value="Precio No Previsto">Precio No Previsto</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom:14 }}>
                <div style={labelStyle}>Descripción *</div>
                <input style={inputStyle} value={crearForm.descripcion} onChange={e=>setCF("descripcion",e.target.value)} />
              </div>

              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14 }}>
                <div>
                  <div style={labelStyle}>Unidad *</div>
                  <UnidadSelector value={crearForm.unidad} onChange={v=>setCF("unidad",v)}
                    modoCustom={uModoCustomC} setModoCustom={setUModoCustomC}
                    uCustom={uCustomC} setUCustom={setUCustomC} />
                </div>
                <div>
                  <div style={labelStyle}>Valor Unitario *</div>
                  <input style={inputStyle} type="number" value={crearForm.precio_unitario} onChange={e=>setCF("precio_unitario",e.target.value)} placeholder="0" />
                </div>
              </div>

              <div style={{ marginBottom:14 }}>
                <div style={labelStyle}>Especificación Técnica *</div>
                <textarea style={{...inputStyle,resize:"vertical",minHeight:80}} value={crearForm.especificacion_tecnica} onChange={e=>setCF("especificacion_tecnica",e.target.value)} />
              </div>

              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14 }}>
                <div>
                  <div style={labelStyle}>Acta de Fijación {!crearEsContractual?"*":""}</div>
                  <input style={{...inputStyle,opacity:crearEsContractual?0.45:1}}
                    value={crearForm.acta_fijacion} disabled={crearEsContractual}
                    placeholder={crearEsContractual?"Contractual (automático)":"Número de acta"}
                    onChange={e=>setCF("acta_fijacion",e.target.value.replace(/[^0-9]/g,""))} />
                </div>
                <div>
                  <div style={labelStyle}>Acta Modificatoria {!crearEsContractual?"*":""}</div>
                  <input style={{...inputStyle,opacity:crearEsContractual?0.45:1}}
                    value={crearForm.acta_modificatoria} disabled={crearEsContractual}
                    placeholder={crearEsContractual?"N/A":"Número de acta modificatoria"}
                    onChange={e=>setCF("acta_modificatoria",e.target.value.replace(/[^0-9]/g,""))} />
                </div>
              </div>

              <div style={{ marginBottom:14 }}>
                <div style={labelStyle}>Tipo de Cálculo *</div>
                <select style={selectStyle} value={crearForm.tipo_calculo} onChange={e=>setCF("tipo_calculo",e.target.value)}>
                  <option value="">-- Selecciona --</option>
                  <option value="AIU">AIU</option>
                  <option value="IVA">IVA</option>
                </select>
              </div>
              <div style={{ marginBottom:8 }}>
                <div style={labelStyle}>Observaciones</div>
                <textarea style={{...inputStyle,resize:"vertical",minHeight:60}} value={crearForm.observaciones} onChange={e=>setCF("observaciones",e.target.value)} />
              </div>
            </div>
            <div style={modalFoot}>
              <button style={S.btn("ghost")} onClick={() => setShowCrear(false)}>Cancelar</button>
              <button style={S.btn("primary")} onClick={crearPrecio} disabled={creating}>{creating?"Creando...":"✓ Crear Precio"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CalPicker: selector de fecha reutilizable (nivel módulo) ─────────────
function _actaFechaAISO(v) {
  if (v == null || v === "") return "";
  const s = String(v).trim();
  const p10 = s.length >= 10 ? s.slice(0, 10) : s;
  if (/^\d{4}-\d{2}-\d{2}/.test(p10)) return p10;
  const t = Date.parse(s);
  return Number.isNaN(t) ? "" : new Date(t).toISOString().slice(0, 10);
}

function ActasCalPicker({ value, onChange, isOpen, onToggle, theme }) {
  const col = C(theme);
  const tt = tFrom(theme);
  const vIso = _actaFechaAISO(value);
  const [vd, setVd] = useState(() => {
    if (!vIso) return new Date();
    const t = vIso + "T12:00:00";
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  });
  const MES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  useEffect(() => {
    if (!vIso) return;
    const t = vIso + "T12:00:00";
    const d = new Date(t);
    if (!Number.isNaN(d.getTime())) setVd(d);
  }, [vIso]);
  const y = vd.getFullYear(), m = vd.getMonth();
  const fd = new Date(y,m,1).getDay(), dim = new Date(y,m+1,0).getDate();
  const dias = [...Array(fd).fill(null), ...Array.from({length:dim},(_,i) => i+1)];
  const iso = d => `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  const disp = (v) => {
    const s = _actaFechaAISO(v);
    if (!s) return "Seleccionar fecha";
    const p = s.split("-");
    if (p.length < 3) return s;
    return `${parseInt(p[2], 10)} ${MES[parseInt(p[1], 10) - 1]}, ${p[0]}`;
  };
  const iS = !isDarkMode(theme) ? { ...S.input, background: tt.inputBg, color: tt.text, border: `1px solid ${tt.border}` } : S.input;
  return (
  <div style={{position:"relative"}}>
      <div onClick={onToggle} style={{...iS,cursor:"pointer",padding:"8px 12px",display:"flex",alignItems:"center",gap:8}}>
        <span>📅</span><span style={{fontSize:"var(--cc-sm)",color:value?col.textPrimary:col.textMuted}}>{disp(value)}</span>
      </div>
      {isOpen && (
        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,zIndex:10010,background:isDarkMode(theme)?"#0b1920":tt.bgCard,border:`1px solid ${isDarkMode(theme)?"rgba(0,175,197,0.3)":tt.border}`,borderRadius:10,padding:14,boxShadow:isRestMode(theme)?"0 16px 40px rgba(42,35,24,0.2)":"0 20px 50px rgba(0,0,0,0.5)",minWidth:260}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <button style={{...S.btn("ghost",true),padding:"4px 10px"}} onClick={()=>setVd(new Date(y,m-1,1))}>◄</button>
            <span style={{fontSize:14,fontWeight:700,color:col.textPrimary}}>{MES[m]} <span style={{color:"#00afc5"}}>{y}</span></span>
            <button style={{...S.btn("ghost",true),padding:"4px 10px"}} onClick={()=>setVd(new Date(y,m+1,1))}>►</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:6}}>
            {["dom","lun","mar","mié","jue","vie","sáb"].map(d=><div key={d} style={{textAlign:"center",fontSize:9,color:"#4a7a87",fontWeight:700,padding:"2px 0"}}>{d}</div>)}
            {dias.map((d,i) => {
              if (!d) return <div key={i}/>;
              const h=new Date().toISOString().slice(0,10), di=iso(d), isSel=di===vIso, isHoy=di===h;
              return <div key={i} onClick={()=>{onChange(di);onToggle();}} style={{textAlign:"center",padding:"5px 2px",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:isSel?700:400,background:isSel?"#00afc5":isHoy?"rgba(0,175,197,0.15)":"transparent",color:isSel?"#081318":col.textPrimary,border:isHoy&&!isSel?"1px solid rgba(0,175,197,0.4)":"1px solid transparent"}} onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background="rgba(0,175,197,0.1)";}} onMouseLeave={e=>{if(!isSel)e.currentTarget.style.background=isHoy?"rgba(0,175,197,0.15)":"transparent";}}>{d}</div>;
            })}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",borderTop:"1px solid rgba(0,175,197,0.1)",paddingTop:8}}>
            <button style={{...S.btn("ghost",true),fontSize:10}} onClick={()=>{onChange(new Date().toISOString().slice(0,10));onToggle();}}>↖ hoy</button>
            <button style={{...S.btn("danger",true),fontSize:10}} onClick={()=>{onChange("");onToggle();}}>— borrar</button>
            <button style={{...S.btn("ghost",true),fontSize:10}} onClick={onToggle}>✕ cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SECCIÓN: Actas (formulario completo + catálogo tipos + cierre RPO) ────
function _actaEmptyForm() {
  return {
    consecutivo: "",
    tipo_grupo: "RPO",
    tipo_acta_id: "",
    observacion: "",
    asignado_a: "",
    fecha_asignacion: "",
    enlace: "",
    numero_rpo: "",
    fecha_inicio: "",
    fecha_fin: "",
    valor_comp_ambiental: "",
    calificacion_ambiental: "",
    valor_comp_social: "",
    calificacion_social: "",
    valor_comp_pmt: "",
    calificacion_pmt: "",
    valor_cobrado_adicional: "",
    ajuste_iccp: "",
    ajuste_icociv: "",
    ajuste_ipc: "",
    pct_proyectado_ajustes: "",
  };
}

function _actaRowToForm(a) {
  const s = (v) => (v != null && v !== "" ? String(v) : "");
  const f = (k) => s(a[k]);
  const d10 = (k) => _actaFechaAISO(a[k]);
  return {
    consecutivo: s(a.consecutivo),
    tipo_grupo: (a.tipo_grupo || "administrativa"),
    tipo_acta_id: a.tipo_acta_id != null ? String(a.tipo_acta_id) : "",
    observacion: a.observacion || "",
    asignado_a: a.asignado_a != null ? String(a.asignado_a) : "",
    fecha_asignacion: d10("fecha_asignacion"),
    enlace: a.enlace || "",
    numero_rpo: a.numero_rpo != null ? String(a.numero_rpo) : "",
    fecha_inicio: d10("fecha_inicio"),
    fecha_fin: d10("fecha_fin"),
    valor_comp_ambiental: f("valor_comp_ambiental"),
    calificacion_ambiental: f("calificacion_ambiental"),
    valor_comp_social: f("valor_comp_social"),
    calificacion_social: f("calificacion_social"),
    valor_comp_pmt: f("valor_comp_pmt"),
    calificacion_pmt: f("calificacion_pmt"),
    valor_cobrado_adicional: f("valor_cobrado_adicional"),
    ajuste_iccp: f("ajuste_iccp"),
    ajuste_icociv: f("ajuste_icociv"),
    ajuste_ipc: f("ajuste_ipc"),
    pct_proyectado_ajustes: f("pct_proyectado_ajustes"),
  };
}

function _parseOptNum(v) {
  if (v === "" || v == null) return undefined;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function SeccionActasRpo({ call, user, contratos, theme }) {
  const col = C(theme);
  const tdStyle = S.td(theme);
  const tTok = tFrom(theme);
  const isDev = user?.cargo_nombre?.toLowerCase() === "desarrollador";

  const [contratoId, setContratoId] = useState(user?.contrato_id || null);
  const [actasTodas, setActasTodas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [modalCerrar, setModalCerrar] = useState(null);
  const [fechaCierre, setFechaCierre] = useState(() => new Date().toISOString().slice(0, 10));
  const [cerrando, setCerrando] = useState(false);
  const [calCierreOpen, setCalCierreOpen] = useState(false);

  const [modalForm, setModalForm] = useState(false);
  const [editingActaId, setEditingActaId] = useState(null);
  const [formActa, setFormActa] = useState(() => _actaEmptyForm());
  const [proximoCons, setProximoCons] = useState(1);
  const [guardandoActa, setGuardandoActa] = useState(false);
  const [actasTipos, setActasTipos] = useState([]);
  const [usuariosContrato, setUsuariosContrato] = useState([]);
  const [calIniOpen, setCalIniOpen] = useState(false);
  const [calFinOpen, setCalFinOpen] = useState(false);
  const [calFaOpen, setCalFaOpen] = useState(false);
  const [mostrarCatalogoTipos, setMostrarCatalogoTipos] = useState(true);
  const [modalNuevoTipo, setModalNuevoTipo] = useState(false);
  const [nuevoTipoNom, setNuevoTipoNom] = useState("");
  const [nuevoTipoCobro, setNuevoTipoCobro] = useState(false);
  const [creandoTipo, setCreandoTipo] = useState(false);
  const [rpoDetalle, setRpoDetalle] = useState({
    open: false,
    acta: null,
    data: null,
    err: null,
    load: false,
  });
  /** Evita que un sync en background pise la lista tras cambiar de contrato o un cargar nuevo. */
  const actasCargaGenRef = useRef(0);

  const setF = (field, val) => setFormActa((p) => ({ ...p, [field]: val }));

  useEffect(() => {
    if (!user?.contrato_id && contratos?.length) {
      setContratoId(contratos[0].id);
    }
  }, [user?.contrato_id, contratos]);

  const cargarTipos = useCallback(async () => {
    if (!contratoId) return;
    try {
      const tipos = await call("GET", `/actas-tipos/${contratoId}`).catch(() => []);
      setActasTipos(Array.isArray(tipos) ? tipos : []);
    } catch { setActasTipos([]); }
  }, [call, contratoId]);

  const cargar = useCallback(async () => {
    if (!contratoId) return;
    const gen = ++actasCargaGenRef.current;
    const cid = contratoId;
    setLoading(true);
    try {
      const rows = await call("GET", `/actas/${contratoId}/lista`);
      if (actasCargaGenRef.current === gen) {
        setActasTodas(Array.isArray(rows) ? rows : []);
      }
    } catch (e) {
      if (actasCargaGenRef.current === gen) {
        setMsg({ type: "error", text: e.message });
      }
    } finally {
      if (actasCargaGenRef.current === gen) {
        setLoading(false);
      }
    }
    // Sincronización por vencimiento en segundo plano (no bloquea la tabla ni el spinner)
    void (async () => {
      try {
        await call("POST", `/actas/${cid}/rpo/sincronizar-vencimiento`, null, {
          timeoutMs: 180_000,
          maxRetries: 1,
        });
        if (actasCargaGenRef.current !== gen) return;
        const rows2 = await call("GET", `/actas/${cid}/lista`);
        if (actasCargaGenRef.current !== gen) return;
        if (Array.isArray(rows2)) setActasTodas(rows2);
      } catch (_) {
        /* best-effort; la lista ya se mostró con el primer GET */
      }
    })();
  }, [call, contratoId]);

  useEffect(() => {
    cargar();
    cargarTipos();
  }, [cargar, cargarTipos]);

  const maxNumeroRpo = () => {
    const nums = actasTodas
      .filter((a) => a.numero_rpo != null && a.numero_rpo !== "")
      .map((a) => Number(a.numero_rpo));
    return nums.length ? Math.max(...nums) : 0;
  };

  const abrirCrear = async () => {
    if (!contratoId) return;
    setMsg(null);
    try {
      const [pc, users] = await Promise.all([
        call("GET", `/actas/${contratoId}/proximo-consecutivo`),
        call("GET", `/actas/${contratoId}/usuarios-contrato`).catch(() => []),
      ]);
      await cargarTipos();
      setProximoCons(pc?.proximo ?? 1);
      setUsuariosContrato(Array.isArray(users) ? users : []);
      setEditingActaId(null);
      setFormActa({
        ..._actaEmptyForm(),
        consecutivo: String(pc?.proximo ?? 1),
        numero_rpo: String(maxNumeroRpo() + 1),
        tipo_grupo: "RPO",
      });
      setCalIniOpen(false);
      setCalFinOpen(false);
      setCalFaOpen(false);
      setModalForm(true);
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    }
  };

  const abrirEditar = async (a) => {
    if (!a?.id) return;
    setMsg(null);
    try {
      const [users] = await Promise.all([
        call("GET", `/actas/${contratoId}/usuarios-contrato`).catch(() => []),
        cargarTipos(),
      ]);
      setUsuariosContrato(Array.isArray(users) ? users : []);
      setEditingActaId(a.id);
      setFormActa(_actaRowToForm(a));
      setCalIniOpen(false);
      setCalFinOpen(false);
      setCalFaOpen(false);
      setModalForm(true);
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    }
  };

  const buildPayloadActa = () => {
    const c = parseInt(String(formActa.consecutivo || "").trim(), 10);
    if (!Number.isFinite(c) || c < 1) throw new Error("Consecutivo inválido.");
    const rawTg = String(formActa.tipo_grupo || "administrativa");
    const tipoGrupoNorm = rawTg.toUpperCase() === "RPO"
      ? "RPO"
      : (rawTg.toLowerCase() === "cobro" ? "cobro" : "administrativa");
    const tg = tipoGrupoNorm.toLowerCase();
    const payload = { consecutivo: c, tipo_grupo: tipoGrupoNorm };
    if (formActa.tipo_acta_id) payload.tipo_acta_id = parseInt(formActa.tipo_acta_id, 10);
    if (formActa.observacion?.trim()) payload.observacion = formActa.observacion.trim();
    if (formActa.asignado_a) payload.asignado_a = parseInt(formActa.asignado_a, 10);
    if (formActa.fecha_asignacion) payload.fecha_asignacion = formActa.fecha_asignacion;
    if (formActa.enlace?.trim()) payload.enlace = formActa.enlace.trim();
    if (tg === "rpo") {
      const nr = parseInt(String(formActa.numero_rpo || "").trim(), 10);
      if (!nr || Number.isNaN(nr)) throw new Error("Número RPO obligatorio para actas RPO.");
      if (!formActa.fecha_inicio || !formActa.fecha_fin) throw new Error("Fecha inicio y fin obligatorias para RPO.");
      if (formActa.fecha_inicio > formActa.fecha_fin) throw new Error("La fecha fin debe ser ≥ fecha inicio.");
      payload.numero_rpo = nr;
      payload.fecha_inicio = formActa.fecha_inicio;
      payload.fecha_fin = formActa.fecha_fin;
    } else if (tipoGrupoNorm === "cobro") {
      if (formActa.fecha_inicio) payload.fecha_inicio = formActa.fecha_inicio;
      if (formActa.fecha_fin) payload.fecha_fin = formActa.fecha_fin;
      const nr2 = parseInt(String(formActa.numero_rpo || "").trim(), 10);
      if (nr2 && !Number.isNaN(nr2)) payload.numero_rpo = nr2;
    }
    // administrativa: sin RPO, período ni montos (solo catálogo + general)
    const numKeys = [
      "valor_comp_ambiental", "calificacion_ambiental", "valor_comp_social", "calificacion_social",
      "valor_comp_pmt", "calificacion_pmt", "valor_cobrado_adicional", "ajuste_iccp", "ajuste_icociv", "ajuste_ipc", "pct_proyectado_ajustes",
    ];
    if (tipoGrupoNorm !== "administrativa") {
      for (const k of numKeys) {
        const x = _parseOptNum(formActa[k]);
        if (x !== undefined) payload[k] = x;
      }
    }
    return payload;
  };

  const guardarActa = async () => {
    if (!contratoId) return;
    setGuardandoActa(true);
    try {
      const payload = buildPayloadActa();
      if (editingActaId) {
        await call("PUT", `/actas/${editingActaId}`, payload);
        setMsg({ type: "success", text: "Acta actualizada." });
      } else {
        await call("POST", `/actas/${contratoId}`, payload);
        setMsg({ type: "success", text: "Acta creada." });
      }
      setModalForm(false);
      setEditingActaId(null);
      cargar();
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setGuardandoActa(false);
    }
  };

  const crearTipoCatalogo = async () => {
    if (!contratoId || !nuevoTipoNom.trim()) return;
    setCreandoTipo(true);
    try {
      await call("POST", `/actas-tipos/${contratoId}`, { nombre: nuevoTipoNom.trim(), es_cobro: nuevoTipoCobro });
      setModalNuevoTipo(false);
      setNuevoTipoNom("");
      setNuevoTipoCobro(false);
      await cargarTipos();
      setMsg({ type: "success", text: "Tipo de acta agregado al catálogo." });
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setCreandoTipo(false);
    }
  };

  const hoy = new Date().toISOString().slice(0, 10);
  /** Única acta RPO «en período» (mismo criterio que API): calendario + desempate si solapan en un día. */
  const actaRpoEnPeriodoId = useMemo(() => {
    const rpos = actasTodas.filter((x) => {
      if (String(x.tipo_grupo || "").toUpperCase() !== "RPO") return false;
      const fi = x.fecha_inicio?.slice(0, 10);
      const ff = x.fecha_fin?.slice(0, 10);
      if (!fi || !ff) return false;
      return fi <= hoy && ff >= hoy;
    });
    if (rpos.length === 0) return null;
    rpos.sort((a, b) => {
      const ai = a.fecha_inicio?.slice(0, 10) || "";
      const bi = b.fecha_inicio?.slice(0, 10) || "";
      if (ai !== bi) return bi.localeCompare(ai);
      const na = a.numero_rpo != null ? Number(a.numero_rpo) : NaN;
      const nb = b.numero_rpo != null ? Number(b.numero_rpo) : NaN;
      if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return nb - na;
      return (Number(b.id) || 0) - (Number(a.id) || 0);
    });
    return rpos[0]?.id ?? null;
  }, [actasTodas, hoy]);
  const esVigente = (a) => actaRpoEnPeriodoId != null && Number(a.id) === Number(actaRpoEnPeriodoId);

  const labelTipoFila = (a) => {
    const g = String(a.tipo_grupo || "").toLowerCase();
    if (g === "rpo") return "RPO";
    if (g === "cobro") return "Cobro";
    return "Administrativa";
  };

  const actasFiltradas = actasTodas.filter((a) => {
    if (filtroTipo === "todos") return true;
    const g = String(a.tipo_grupo || "").toLowerCase();
    if (filtroTipo === "rpo") return g === "rpo";
    if (filtroTipo === "cobro") return g === "cobro";
    if (filtroTipo === "admin") return g === "administrativa";
    return true;
  });

  const fmtM = (v) => {
    if (v == null || v === "") return "—";
    const n = Number(v);
    if (Number.isNaN(n)) return "—";
    return `$${Math.round(n).toLocaleString("es-CO")}`;
  };

  const abrirDetalleRpo = async (a) => {
    if (!a?.id) return;
    setRpoDetalle({ open: true, acta: a, data: null, err: null, load: true });
    try {
      const d = await call("GET", `/actas/${a.id}/rpo-costo-conciliacion`);
      setRpoDetalle((p) => ({ ...p, data: d, load: false, err: null }));
    } catch (e) {
      setRpoDetalle((p) => ({ ...p, load: false, err: e.message || String(e) }));
    }
  };

  const cerrarDetalleRpo = () => {
    setRpoDetalle({ open: false, acta: null, data: null, err: null, load: false });
  };

  const abrirCerrar = (a) => {
    setModalCerrar(a);
    setFechaCierre(hoy);
    setCalCierreOpen(false);
    setMsg(null);
  };

  const confirmarCerrar = async () => {
    if (!modalCerrar || !contratoId) return;
    if (!window.confirm(
      `¿Cerrar el Acta RPO #${modalCerrar.numero_rpo} el ${fechaCierre}?\n\n` +
      `Se acortará el período. Los registros sin aprobación de Interventoría pasarán al acta siguiente ` +
      `(si ya existe desde el día después del cierre, se usa ese acta; si no, se crea desde ese día hasta fin de mes).`,
    )) return;
    setCerrando(true);
    try {
      const res = await call(
        "POST",
        `/actas/${contratoId}/rpo/cerrar-y-siguiente`,
        {
          fecha_cierre: fechaCierre,
          acta_id: modalCerrar.id,
        },
        { timeoutMs: 600_000, maxRetries: 1 },
      );
      const creada = res.acta_creada || {};
      const per = res.periodo_siguiente || {};
      const n = res.registros_movidos_residual ?? 0;
      const reu = !!res.reutilizo_acta_existente;
      setMsg({
        type: "success",
        text:
          (reu
            ? `Período cerrado. Acta siguiente ya existía — RPO #${creada.numero_rpo ?? "—"} (${per.fecha_inicio ?? ""} → ${per.fecha_fin ?? ""}). `
            : `Período cerrado. Acta RPO #${creada.numero_rpo ?? "—"} (${per.fecha_inicio ?? ""} → ${per.fecha_fin ?? ""}). `) +
          `${n} registro(s) residual(es) reasignado(s).`,
      });
      setModalCerrar(null);
      cargar();
    } catch (e) {
      const raw = e?.message || String(e);
      const isTimeout = /timed out|timeout|abort/i.test(raw);
      setMsg({
        type: "error",
        text: isTimeout
          ? `Tiempo de espera agotado mientras el servidor procesaba el cierre (suele pasar con muchos registros o Azure arrancando). Espera 1–2 minutos y recarga la lista de actas; si el cierre quedó aplicado, verás fechas actualizadas. Detalle: ${raw}`
          : raw,
      });
    } finally {
      setCerrando(false);
    }
  };

  const labelStyle = { fontSize: "var(--cc-label)", color: col.textSecondary, marginBottom: 4 };
  const inputStyle = !isDarkMode(theme)
    ? { ...S.input, background: tTok.inputBg, color: tTok.text, border: `1px solid ${tTok.border}`, width: "100%" }
    : { ...S.input, width: "100%" };
  const subTitle = { fontSize: "var(--cc-sm)", fontWeight: 700, color: tTok.primary, letterSpacing: 0.4, marginTop: 10, marginBottom: 6 };
  /** Actas administrativas: solo catálogo, observación, asignación y enlace (sin RPO ni montos). */
  const esActaAdministrativa = String(formActa.tipo_grupo || "").toLowerCase() === "administrativa";

  return (
    <div style={{ padding: 0, maxWidth: "100%" }}>
      {msg && (
        <div style={S.alert(msg.type)}>
          {msg.text}
          <span onClick={() => setMsg(null)} style={{ float: "right", cursor: "pointer", opacity: 0.6 }}>✕</span>
        </div>
      )}

      <div style={{ marginBottom: 12, display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ flex: "1 1 280px" }}>
          <div style={{ fontSize: "var(--cc-md)", fontWeight: 700, color: col.textPrimary }}>📋 Actas del contrato</div>
            <div style={{ fontSize: "var(--cc-sm)", color: col.textMuted, marginTop: 4, lineHeight: 1.4 }}>
            <strong>Crear / editar acta:</strong> formulario completo con componentes (ambiental, social, PMT), ajustes (ICCP, ICOCIV, IPC), enlaces y asignación.
            {" "}<strong>Costo directo</strong> (columna): mismo criterio que el <strong>dashboard de validación</strong> (N1, N2 y N3 aprobado en cascada) en SICOE Obra para ese acta RPO, sin tocar el formulario de acta.
            {" "}<strong>Cerrar acta</strong> (solo RPO en período): acorta fechas; residuales sin N3 van al acta siguiente (existente o nuevo desde día después del cierre hasta fin de mes).
            {" "}Al cargar, la lista aparece al instante y en segundo plano se ejecuta la sincronización por <strong>vencimiento de fechas</strong> (residuales si el período ya pasó sin cierre manual).
          </div>
        </div>
        {contratoId && (
          <button type="button" style={S.btn("primary")} onClick={abrirCrear}>
            ➕ Crear acta
          </button>
        )}
      </div>

      {isDev && contratos?.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={labelStyle}>Contrato</div>
          <select
            style={{ ...inputStyle, maxWidth: 400 }}
            value={contratoId || ""}
            onChange={(e) => setContratoId(e.target.value ? parseInt(e.target.value, 10) : null)}
          >
            {!contratoId && <option value="">— Selecciona —</option>}
            {contratos.map((c) => (
              <option key={c.id} value={c.id}>{c.numero}</option>
            ))}
          </select>
        </div>
      )}

      {!contratoId ? (
        <div style={S.empty}>Sin contrato asignado.</div>
      ) : loading ? (
        <div style={S.empty}><span style={{ color: "#00afc5" }}>Cargando actas…</span></div>
      ) : actasTodas.length === 0 ? (
        <div style={S.empty}>
          No hay actas registradas. Usa <strong>Crear acta</strong> para el primer RPO o una administrativa.
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 12, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
            <div style={labelStyle}>Filtrar por tipo</div>
            <select
              style={{ ...inputStyle, maxWidth: 220 }}
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
            >
              <option value="todos">Todos</option>
              <option value="rpo">RPO</option>
              <option value="admin">Administrativa</option>
              <option value="cobro">Cobro</option>
            </select>
          </div>
          {actasFiltradas.length === 0 ? (
            <div style={S.empty}>Ninguna acta coincide con el filtro.</div>
          ) : (
            <table style={S.table}>
              <thead>
                <tr>
                  {["Tipo", "RPO", "Período", "Consec.", "Tipo doc. / uso", "Costo (validación)", "Estado / Notas", "Acción"].map((h) => (
                    <th key={h} style={S.th(theme)}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {actasFiltradas.map((a) => {
                  const esRpo = String(a.tipo_grupo || "").toUpperCase() === "RPO" && a.numero_rpo != null;
                  return (
                    <tr key={a.id}>
                      <td style={tdStyle}>{labelTipoFila(a)}</td>
                      <td style={tdStyle}>
                        {esRpo ? (
                          <button
                            type="button"
                            onClick={() => abrirDetalleRpo(a)}
                            title="Ver desglose por capítulo (costo directo SICOE)"
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              font: "inherit",
                              fontWeight: 700,
                              color: "#00afc5",
                              cursor: "pointer",
                              textDecoration: "underline",
                              textUnderlineOffset: 3,
                            }}
                          >
                            #{a.numero_rpo}
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={tdStyle}>
                        {(a.fecha_inicio || "—").slice(0, 10)} → {(a.fecha_fin || "—").slice(0, 10)}
                      </td>
                      <td style={tdStyle}>{a.consecutivo ?? "—"}</td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 11, color: col.textMuted, display: "inline-block", maxWidth: 160 }}>
                          {a.tipo_nombre || "—"}
                          {a.es_cobro ? (
                            <span style={{ marginLeft: 4, ...S.badge("pendiente"), textTransform: "none", fontSize: 9 }}>cobro</span>
                          ) : null}
                        </span>
                      </td>
                      <td style={tdStyle}>{fmtM(a.valor_total_acta)}</td>
                      <td style={tdStyle}>
                        {esRpo ? (
                          esVigente(a) ? (
                            <span style={{ ...S.badge("aprobado"), textTransform: "none" }}>En período</span>
                          ) : (
                            <span style={{ ...S.badge("pendiente"), textTransform: "none" }}>Historial</span>
                          )
                        ) : (
                          <span style={{ fontSize: 11, color: col.textMuted, maxWidth: 180, display: "inline-block" }}>
                            {(a.observacion || "—").slice(0, 72)}
                            {(a.observacion || "").length > 72 ? "…" : ""}
                          </span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                          <button type="button" style={S.btn("ghost", true)} onClick={() => abrirEditar(a)}>
                            Editar
                          </button>
                          {esRpo && esVigente(a) && (
                            <button
                              type="button"
                              style={S.btn("danger", true)}
                              onClick={() => abrirCerrar(a)}
                            >
                              Cerrar acta
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}

      {contratoId && (
        <div style={{ marginTop: 12, paddingTop: 8, borderTop: `1px solid ${isDarkMode(theme) ? "rgba(0,175,197,0.15)" : tTok.border}` }}>
          <button
            type="button"
            onClick={() => setMostrarCatalogoTipos((v) => !v)}
            style={{ ...S.btn("ghost"), marginBottom: mostrarCatalogoTipos ? 12 : 0 }}
          >
            {mostrarCatalogoTipos ? "▼" : "▶"} Catálogo de tipos de acta administrativa
          </button>
          {mostrarCatalogoTipos && (
            <>
              <div style={{ fontSize: 12, color: col.textMuted, marginBottom: 10, lineHeight: 1.45 }}>
                Tipos usados al clasificar actas administrativas / cobro. El listado refleja los registrados para este contrato (y globales).
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
                <button type="button" style={S.btn("primary", true)} onClick={() => { setModalNuevoTipo(true); setNuevoTipoNom(""); setNuevoTipoCobro(false); }}>
                  ➕ Nuevo tipo
                </button>
              </div>
              {actasTipos.length === 0 ? (
                <div style={{ fontSize: 12, color: col.textMuted }}>Aún no hay tipos. Crea uno para vincularlo al crear actas administrativas.</div>
              ) : (
                <table style={{ ...S.table, maxWidth: 620 }}>
                  <thead>
                    <tr>
                      {["Nombre", "Es cobro", "Usos en actas"].map((h) => (
                        <th key={h} style={S.th(theme)}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {actasTipos.map((t) => {
                      const usos = actasTodas.filter((a) => a.tipo_acta_id != null && Number(a.tipo_acta_id) === Number(t.id)).length;
                      return (
                        <tr key={t.id}>
                          <td style={tdStyle}>{t.nombre || `—`}</td>
                          <td style={tdStyle}>{t.es_cobro ? "Sí" : "No"}</td>
                          <td style={tdStyle}>{usos}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      )}

      {modalForm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10020,
            background: "rgba(5,12,18,0.88)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={(e) => e.target === e.currentTarget && !guardandoActa && setModalForm(false)}
        >
          <div
            style={{
              width: "min(760px, 96vw)",
              maxHeight: "92vh",
              overflowY: "auto",
              background: isDarkMode(theme) ? "#0b1920" : tTok.bg,
              border: "1px solid rgba(0,175,197,0.25)",
              borderRadius: 14,
              padding: "22px 26px",
              boxShadow: "0 32px 80px rgba(0,0,0,0.55)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: col.textPrimary, marginBottom: 6 }}>
              {editingActaId ? "Editar acta" : "Crear acta"}
            </div>
            <div style={{ fontSize: 11, color: col.textMuted, marginBottom: 14 }}>
              {!editingActaId ? (
                <>Consecutivo sugerido: <strong>{proximoCons}</strong>. Puedes ajustarlo si hace falta.</>
              ) : (
                <>Puedes corregir el consecutivo si hubo un error; evita duplicar el mismo número en otra acta del contrato.</>
              )}
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={labelStyle}>Tipo de acta *</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {[
                  ["RPO", "RPO (período SICOE)"],
                  ["administrativa", "Administrativa"],
                  ["cobro", "Cobro"],
                ].map(([val, lab]) => {
                  const raw = String(formActa.tipo_grupo || "");
                  const sel = val === "RPO"
                    ? raw.toUpperCase() === "RPO"
                    : raw.toLowerCase() === val;
                  return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setF("tipo_grupo", val)}
                    style={{
                      ...S.chip(sel),
                      padding: "8px 14px",
                      fontSize: 12,
                    }}
                  >
                    {lab}
                  </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              <div>
                <div style={labelStyle}>Consecutivo *</div>
                <input
                  style={inputStyle}
                  type="number"
                  min={1}
                  value={formActa.consecutivo}
                  onChange={(e) => setF("consecutivo", e.target.value)}
                />
              </div>
              {actasTipos.length > 0 && (
                <div>
                  <div style={labelStyle}>Tipo documental (catálogo)</div>
                  <select
                    style={inputStyle}
                    value={formActa.tipo_acta_id}
                    onChange={(e) => setF("tipo_acta_id", e.target.value)}
                  >
                    <option value="">—</option>
                    {actasTipos.map((t) => (
                      <option key={t.id} value={t.id}>{t.nombre || `Tipo ${t.id}`}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div style={subTitle}>General</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={labelStyle}>Observación</div>
                <textarea
                  style={{ ...inputStyle, resize: "vertical", minHeight: 64 }}
                  value={formActa.observacion}
                  onChange={(e) => setF("observacion", e.target.value)}
                  placeholder="Notas o referencia"
                />
              </div>
              {usuariosContrato.length > 0 && (
                <div>
                  <div style={labelStyle}>Asignado a</div>
                  <select
                    style={inputStyle}
                    value={formActa.asignado_a}
                    onChange={(e) => setF("asignado_a", e.target.value)}
                  >
                    <option value="">—</option>
                    {usuariosContrato.map((u) => (
                      <option key={u.id} value={u.id}>{u.nombre} {u.apellidos || ""}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <div style={labelStyle}>Fecha asignación</div>
                <ActasCalPicker
                  value={formActa.fecha_asignacion}
                  onChange={(v) => setF("fecha_asignacion", v || "")}
                  isOpen={calFaOpen}
                  onToggle={() => { setCalFaOpen((o) => !o); setCalIniOpen(false); setCalFinOpen(false); }}
                  theme={theme}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={labelStyle}>Enlace (URL)</div>
                <input
                  style={inputStyle}
                  type="url"
                  value={formActa.enlace}
                  onChange={(e) => setF("enlace", e.target.value)}
                  placeholder="https://…"
                />
              </div>
            </div>

            {!esActaAdministrativa && (
              <>
            <div style={subTitle}>RPO / período</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              <div>
                <div style={labelStyle}>Número RPO {String(formActa.tipo_grupo || "").toUpperCase() === "RPO" ? "*" : ""}</div>
                <input
                  style={inputStyle}
                  type="number"
                  min={1}
                  value={formActa.numero_rpo}
                  onChange={(e) => setF("numero_rpo", e.target.value)}
                />
              </div>
              <div>
                <div style={labelStyle}>Fecha inicio {String(formActa.tipo_grupo || "").toUpperCase() === "RPO" ? "*" : ""}</div>
                <ActasCalPicker
                  value={formActa.fecha_inicio}
                  onChange={(v) => setF("fecha_inicio", v || "")}
                  isOpen={calIniOpen}
                  onToggle={() => { setCalIniOpen((o) => !o); setCalFinOpen(false); setCalFaOpen(false); }}
                  theme={theme}
                />
              </div>
              <div>
                <div style={labelStyle}>Fecha fin {String(formActa.tipo_grupo || "").toUpperCase() === "RPO" ? "*" : ""}</div>
                <ActasCalPicker
                  value={formActa.fecha_fin}
                  onChange={(v) => setF("fecha_fin", v || "")}
                  isOpen={calFinOpen}
                  onToggle={() => { setCalFinOpen((o) => !o); setCalIniOpen(false); setCalFaOpen(false); }}
                  theme={theme}
                />
              </div>
            </div>

            <div style={subTitle}>Componentes y valores</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              {[
                ["valor_comp_ambiental", "Valor ambiental"],
                ["calificacion_ambiental", "Calif. ambiental"],
                ["valor_comp_social", "Valor social"],
                ["calificacion_social", "Calif. social"],
                ["valor_comp_pmt", "Valor PMT"],
                ["calificacion_pmt", "Calif. PMT"],
                ["valor_cobrado_adicional", "Cobrado adicional"],
              ].map(([k, lab]) => (
                <div key={k}>
                  <div style={labelStyle}>{lab}</div>
                  <input
                    style={inputStyle}
                    type="text"
                    inputMode="decimal"
                    value={formActa[k]}
                    onChange={(e) => setF(k, e.target.value)}
                  />
                </div>
              ))}
            </div>

            <div style={subTitle}>Ajustes</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              {[
                ["ajuste_iccp", "Ajuste ICCP"],
                ["ajuste_icociv", "Ajuste ICOCIV"],
                ["ajuste_ipc", "Ajuste IPC"],
                ["pct_proyectado_ajustes", "% proyectado ajustes"],
              ].map(([k, lab]) => (
                <div key={k}>
                  <div style={labelStyle}>{lab}</div>
                  <input
                    style={inputStyle}
                    type="text"
                    inputMode="decimal"
                    value={formActa[k]}
                    onChange={(e) => setF(k, e.target.value)}
                  />
                </div>
              ))}
            </div>
              </>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
              <button type="button" style={S.btn("ghost")} disabled={guardandoActa} onClick={() => { setModalForm(false); setEditingActaId(null); }}>
                Cancelar
              </button>
              <button type="button" style={S.btn("primary")} disabled={guardandoActa} onClick={guardarActa}>
                {guardandoActa ? "Guardando…" : editingActaId ? "Guardar cambios" : "Crear acta"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalNuevoTipo && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10025,
            background: "rgba(5,12,18,0.88)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={(e) => e.target === e.currentTarget && !creandoTipo && setModalNuevoTipo(false)}
        >
          <div
            style={{
              width: "min(420px, 96vw)",
              background: isDarkMode(theme) ? "#0b1920" : tTok.bg,
              border: "1px solid rgba(0,175,197,0.25)",
              borderRadius: 14,
              padding: "22px 26px",
              boxShadow: "0 32px 80px rgba(0,0,0,0.55)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: col.textPrimary, marginBottom: 12 }}>Nuevo tipo de acta</div>
            <div style={{ marginBottom: 12 }}>
              <div style={labelStyle}>Nombre *</div>
              <input style={inputStyle} value={nuevoTipoNom} onChange={(e) => setNuevoTipoNom(e.target.value)} placeholder="Ej. Modificación contractual" />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: col.textMuted, marginBottom: 16, cursor: "pointer" }}>
              <input type="checkbox" checked={nuevoTipoCobro} onChange={(e) => setNuevoTipoCobro(e.target.checked)} />
              Marcar como tipo de cobro
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" style={S.btn("ghost")} disabled={creandoTipo} onClick={() => setModalNuevoTipo(false)}>Cancelar</button>
              <button type="button" style={S.btn("primary")} disabled={creandoTipo || !nuevoTipoNom.trim()} onClick={crearTipoCatalogo}>
                {creandoTipo ? "Guardando…" : "Crear tipo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalCerrar && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10020,
            background: "rgba(5,12,18,0.88)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={(e) => e.target === e.currentTarget && !cerrando && setModalCerrar(null)}
        >
          <div
            style={{
              width: "min(440px, 96vw)",
              background: isDarkMode(theme) ? "#0b1920" : tTok.bg,
              border: "1px solid rgba(0,175,197,0.25)",
              borderRadius: 14,
              padding: "22px 26px",
              boxShadow: "0 32px 80px rgba(0,0,0,0.55)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: col.textPrimary, marginBottom: 8 }}>
              Cerrar Acta RPO #{modalCerrar.numero_rpo}
            </div>
            <div style={{ fontSize: 12, color: col.textMuted, marginBottom: 16, lineHeight: 1.45 }}>
              El acta quedará con último día <strong>{fechaCierre}</strong>. Se creará el acta del mes siguiente (calendario completo) y se moverán los registros sin cierre en Interventoría.
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={labelStyle}>Fecha de cierre *</div>
              <ActasCalPicker
                value={fechaCierre}
                onChange={(v) => setFechaCierre(v || hoy)}
                isOpen={calCierreOpen}
                onToggle={() => setCalCierreOpen((o) => !o)}
                theme={theme}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" style={S.btn("ghost")} disabled={cerrando} onClick={() => setModalCerrar(null)}>
                Cancelar
              </button>
              <button type="button" style={S.btn("primary")} disabled={cerrando} onClick={confirmarCerrar}>
                {cerrando ? "Procesando…" : "Confirmar cierre"}
              </button>
            </div>
          </div>
        </div>
      )}

      {rpoDetalle.open && rpoDetalle.acta && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10030,
            background: "rgba(5,12,18,0.9)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={(e) => e.target === e.currentTarget && !rpoDetalle.load && cerrarDetalleRpo()}
        >
          <div
            style={{
              width: "min(1020px, 98vw)",
              maxHeight: "min(88vh, 900px)",
              display: "flex",
              flexDirection: "column",
              background: isDarkMode(theme) ? "linear-gradient(180deg, #0d1f28 0%, #0b1920 40%)" : (isRestMode(theme) ? "linear-gradient(180deg, #EDE6DC 0%, #E8E0D5 35%, #F2EDE4 100%)" : "linear-gradient(180deg, #E0F2FE 0%, #F0F9FF 30%, #F8FAFC 100%)"),
              border: "1px solid rgba(0,175,197,0.28)",
              borderRadius: 16,
              boxShadow: "0 32px 90px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,175,197,0.12)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: "20px 22px 12px",
                background: isDarkMode(theme) ? "rgba(0,175,197,0.1)" : (isRestMode(theme) ? "rgba(14,116,144,0.1)" : "rgba(0,175,197,0.14)"),
                borderBottom: "1px solid rgba(0,175,197,0.2)",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#00afc5", textTransform: "uppercase" }}>
                  Costo directo RPO
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: col.textPrimary, marginTop: 2 }}>
                  Acta RPO #{rpoDetalle.acta.numero_rpo}
                  {rpoDetalle.acta.consecutivo != null && (
                    <span style={{ fontSize: 13, fontWeight: 600, color: col.textMuted, marginLeft: 8 }}>consec. {rpoDetalle.acta.consecutivo}</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: col.textMuted, marginTop: 6, lineHeight: 1.4 }}>
                  {rpoDetalle.data?.periodo?.fecha_inicio || (rpoDetalle.acta.fecha_inicio || "—").slice(0, 10)}
                  {" "}
                  →
                  {rpoDetalle.data?.periodo?.fecha_fin || (rpoDetalle.acta.fecha_fin || "—").slice(0, 10)}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                <button
                  type="button"
                  style={{ ...S.btn("ghost", true), fontSize: 18, lineHeight: 1, padding: "2px 8px" }}
                  title="Cerrar"
                  disabled={rpoDetalle.load}
                  onClick={cerrarDetalleRpo}
                >
                  ✕
                </button>
                <button
                  type="button"
                  style={S.btn("ghost", true)}
                  disabled={rpoDetalle.load}
                  onClick={() => abrirDetalleRpo(rpoDetalle.acta)}
                >
                  ⟳ Actualizar
                </button>
              </div>
            </div>
            <div style={{ padding: 18, overflow: "auto", flex: 1, minHeight: 0 }}>
              {rpoDetalle.load && (
                <div style={{ textAlign: "center", padding: "32px 12px", color: col.textMuted, fontSize: 14 }}>Cargando desglose…</div>
              )}
              {!rpoDetalle.load && rpoDetalle.err && (
                <div style={{ ...S.alert("error") }}>{rpoDetalle.err}</div>
              )}
              {!rpoDetalle.load && !rpoDetalle.err && rpoDetalle.data && (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(220px, 1fr) minmax(240px, 1.4fr)",
                      gap: 14,
                      marginBottom: 12,
                    }}
                  >
                    <div
                      style={{
                        borderRadius: 10,
                        padding: "12px 14px",
                        background: isDarkMode(theme) ? "rgba(0,30,40,0.5)" : (isRestMode(theme) ? "rgba(250,246,239,0.85)" : "rgba(255,255,255,0.9)"),
                        border: "1px solid rgba(0,175,197,0.2)",
                      }}
                    >
                      <div style={{ fontSize: 10, color: col.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Total (N1·N2·N3 aprob. — matriz SICOE)</div>
                      <div style={{ fontSize: "var(--cc-h1)", fontWeight: 800, color: isDarkMode(theme) ? "#5ee4f7" : tTok.primary, marginTop: 4, letterSpacing: 0.2 }}>
                        {fmtM(rpoDetalle.data.costo_directo_total)}
                      </div>
                      <div style={{ fontSize: 11, color: col.textMuted, marginTop: 6 }}>
                        {rpoDetalle.data.registros_cascade_interventoria ?? rpoDetalle.data.registros_n3_aprobado ?? 0} línea(s) SICOE · acta {rpoDetalle.data.numero_rpo ?? "—"}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: col.textMuted,
                        lineHeight: 1.4,
                        padding: "6px 4px 0 0",
                        maxHeight: 100,
                        overflow: "auto",
                        opacity: 0.88,
                      }}
                    >
                      {rpoDetalle.data.criterio}
                    </div>
                  </div>
                  {(!rpoDetalle.data.por_capitulo || rpoDetalle.data.por_capitulo.length === 0) &&
                    !(
                      rpoDetalle.data.secciones
                      && Object.values(rpoDetalle.data.secciones).some((s) => s && (s.subtotal > 0 || (s.por_capitulo && s.por_capitulo.length > 0)))
                    ) && (
                    <div style={{ fontSize: 13, color: col.textMuted, textAlign: "center", padding: 20 }}>
                      Sin desglose: no hay filas SICOE con N1, N2 y N3 aprobado en este acta o sin ítem asignado.
                    </div>
                  )}
                  {(() => {
                    const s = rpoDetalle.data.secciones || {};
                    const order = ["obra_ejecutada_directo_sin_aiu", "ensayos_sondeos_directo_sin_iva"];
                    const hasMatriz = order.some(
                      (k) => s[k] && (Number(s[k].subtotal) > 0 || (s[k].por_capitulo && s[k].por_capitulo.length > 0)),
                    );
                    const thC = (h) => ({
                      textAlign: h === "Capítulo" ? "left" : "right",
                      padding: "6px 8px",
                      fontSize: 9,
                      textTransform: "uppercase",
                      letterSpacing: 0.35,
                      color: col.textMuted,
                      fontWeight: 800,
                      borderBottom: "1px solid rgba(0,175,197,0.2)",
                    });
                    const wrap = {
                      border: `1px solid ${isDarkMode(theme) ? "rgba(0,175,197,0.2)" : (isRestMode(theme) ? "rgba(201,184,164,0.5)" : "rgba(14,165,233,0.22)")}`,
                      borderRadius: 8,
                      overflow: "auto",
                      maxHeight: "min(46vh, 480px)",
                      background: isDarkMode(theme) ? "rgba(0,0,0,0.2)" : (isRestMode(theme) ? "rgba(242,237,228,0.6)" : "rgba(255,255,255,0.5)"),
                    };
                    const tbl = (filas) => (
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          fontSize: 12,
                          tableLayout: "fixed",
                        }}
                      >
                        <colgroup>
                          <col style={{ width: 22, maxWidth: 26 }} />
                          <col style={{ width: "auto" }} />
                          <col style={{ width: 72, maxWidth: 80 }} />
                          <col style={{ width: 120, minWidth: 100 }} />
                        </colgroup>
                        <thead>
                          <tr
                            style={{
                              background: isDarkMode(theme) ? "rgba(0,175,197,0.12)" : (isRestMode(theme) ? "rgba(14,116,144,0.15)" : "rgba(0,175,197,0.2)"),
                              position: "sticky",
                              top: 0,
                              zIndex: 1,
                            }}
                          >
                            {["#", "Capítulo", "%", "Costo directo"].map((h) => (
                              <th key={h} style={thC(h)}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filas.map((row, j) => {
                            const pct = Number(row.porcentaje) || 0;
                            return (
                              <tr
                                key={`${row.capitulo}-${j}`}
                                style={{
                                  background: j % 2 === 0
                                    ? (isDarkMode(theme) ? "rgba(0,0,0,0.1)" : (isRestMode(theme) ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.4)"))
                                    : "transparent",
                                }}
                              >
                                <td
                                  style={{
                                    width: 22,
                                    minWidth: 20,
                                    maxWidth: 26,
                                    padding: "3px 2px",
                                    color: col.textMuted,
                                    textAlign: "center",
                                    fontSize: 10,
                                    fontVariantNumeric: "tabular-nums",
                                  }}
                                >
                                  {j + 1}
                                </td>
                                <td
                                  style={{
                                    padding: "4px 8px",
                                    color: col.textPrimary,
                                    fontWeight: 600,
                                    lineHeight: 1.3,
                                    wordBreak: "break-word",
                                    verticalAlign: "top",
                                    fontSize: 11,
                                  }}
                                >
                                  {row.capitulo}
                                </td>
                                <td
                                  style={{
                                    padding: "4px 6px",
                                    textAlign: "right",
                                    color: isDarkMode(theme) ? "#5ee4f7" : tTok.primary,
                                    fontWeight: 800,
                                    fontSize: 11,
                                    fontVariantNumeric: "tabular-nums",
                                  }}
                                >
                                  {pct.toFixed(1).replace(".", ",")}%
                                </td>
                                <td
                                  style={{
                                    padding: "4px 8px",
                                    textAlign: "right",
                                    color: col.textPrimary,
                                    fontWeight: 700,
                                    fontVariantNumeric: "tabular-nums",
                                    fontSize: 11,
                                  }}
                                >
                                  {fmtM(row.costo_directo)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    );
                    if (hasMatriz) {
                      return (
                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                          {order.map((key) => {
                            const sec = s[key];
                            if (!sec) return null;
                            const n = sec.subtotal;
                            if (!(Number(n) > 0 || (sec.por_capitulo && sec.por_capitulo.length > 0))) return null;
                            return (
                              <div key={key}>
                                <div style={{ fontSize: 11, fontWeight: 800, color: col.textPrimary, marginBottom: 4, lineHeight: 1.35 }}>{sec.titulo || key}</div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: "#00afc5", marginBottom: 6 }}>Subtotal: {fmtM(n)}</div>
                                {sec.por_capitulo && sec.por_capitulo.length > 0 && <div style={wrap}>{tbl(sec.por_capitulo)}</div>}
                              </div>
                            );
                          })}
                        </div>
                      );
                    }
                    if (rpoDetalle.data.por_capitulo && rpoDetalle.data.por_capitulo.length > 0) {
                      return (
                        <div>
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: col.textPrimary,
                              marginBottom: 6,
                            }}
                          >
                            Desglose por capítulo (total acta, orden SICOE)
                          </div>
                          <div style={wrap}>{tbl(rpoDetalle.data.por_capitulo)}</div>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </>
              )}
            </div>
            <div style={{ padding: "10px 18px 16px", borderTop: "1px solid rgba(0,175,197,0.12)", display: "flex", justifyContent: "flex-end" }}>
              <button type="button" style={S.btn("primary", true)} disabled={rpoDetalle.load} onClick={cerrarDetalleRpo}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SECCIÓN 7: Subcontratistas ───────────────────────────────────────────
function SeccionSubcontratistas({ call, user, perms, theme }) {
  const contratoId = user?.contrato_id;
  const col  = C(theme);
  const tdStyle = S.td(theme);
  const tTok  = tFrom(theme);

  const [subs,             setSubs]             = useState([]);
  const [loading,          setLoading]          = useState(false);
  const [msg,              setMsg]              = useState(null);
  const [filtro,           setFiltro]           = useState("");
  const [showCrear,        setShowCrear]        = useState(false);
  const [crearForm,        setCrearForm]        = useState({ razon_social:"",objeto_contrato:"",nit:"",nombre_contacto:"",telefono:"" });
  const [creating,         setCreating]         = useState(false);
  const [detalle,          setDetalle]          = useState(null);
  const [tabDetalle,       setTabDetalle]       = useState("datos");
  const [editando,         setEditando]         = useState(false);
  const [editForm,         setEditForm]         = useState({});
  const [saving,           setSaving]           = useState(false);
  const [toggling,         setToggling]         = useState(false);
  const [cortes,           setCortes]           = useState([]);
  const [cortesLoading,    setCortesLoading]    = useState(false);
  const [showCrearCorte,   setShowCrearCorte]   = useState(false);
  const [corteForm,        setCorteForm]        = useState({ tipo_periodo:"quincenal",consecutivo:1,fecha_inicio:"",fecha_fin:"" });
  const [creatingCorte,    setCreatingCorte]    = useState(false);
  const [corteDetalle,     setCorteDetalle]     = useState(null);
  const [editCorteForm,    setEditCorteForm]    = useState({});
  const [savingCorte,      setSavingCorte]      = useState(false);
  const [preciosSub,       setPreciosSub]       = useState([]);
  const [preciosLoading,   setPreciosLoading]   = useState(false);
  const [showAgregarItem,  setShowAgregarItem]  = useState(false);
  const [listadoPrecios,   setListadoPrecios]   = useState([]);
  const [busqCapitulo,     setBusqCapitulo]     = useState("");
  const [busqTexto,        setBusqTexto]        = useState("");
  const [itemSel,          setItemSel]          = useState(null);
  const [precioSubForm,    setPrecioSubForm]    = useState("");
  const [creatingPrecio,   setCreatingPrecio]   = useState(false);
  const [precioEdit,       setPrecioEdit]       = useState(null);
  const [editPrecioVal,    setEditPrecioVal]    = useState("");
  const [savingPrecio,     setSavingPrecio]     = useState(false);
  const [calFiOpen,        setCalFiOpen]        = useState(false);
  const [calFfOpen,        setCalFfOpen]        = useState(false);
  const [calEditFf,        setCalEditFf]        = useState(false);

  const labelStyle  = { fontSize:"var(--cc-caption)", color: col.textSecondary, marginBottom: 4 };
  const inputStyle  = !isDarkMode(theme) ? { ...S.input, background: tTok.inputBg, color: tTok.text, border: `1px solid ${tTok.border}` } : S.input;
  const selectStyle = !isDarkMode(theme) ? { ...S.select, background: tTok.inputBg, color: tTok.text, border: `1px solid ${tTok.border}`, width: "100%" } : { ...S.select, width: "100%" };
  const overlayStyle = { position:"fixed",inset:0,zIndex:10001,background:"rgba(5,12,18,0.92)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center" };
  const modalStyle  = (w) => ({ width:`min(${w}px,95vw)`,maxHeight:"92vh",background:isDarkMode(theme)?"#0b1920":tTok.bg,borderRadius:14,border:`1px solid ${tTok.border}`,boxShadow:isRestMode(theme)?"0 32px 56px rgba(42,35,24,0.2)":"0 40px 100px rgba(0,0,0,0.7)",overflow:"hidden",display:"flex",flexDirection:"column" });
  const modalHeadBgS = isDarkMode(theme) ? "#081318" : (isRestMode(theme) ? tTok.headerBg : "#E0F2FE");
  const modalHead   = { padding:"12px 20px 10px",borderBottom:`1px solid ${isDarkMode(theme)?"rgba(0,175,197,0.12)":tTok.border}`,background:modalHeadBgS,display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0 };
  const modalScroll = { flex:1,overflowY:"auto",padding:"14px 20px",scrollbarWidth:"thin",scrollbarColor: isDarkMode(theme) ? "#1e3a44 transparent" : `${tTok.border}44`, background: isDarkMode(theme) ? "transparent" : (isRestMode(theme) ? tTok.bgCard : "#F8FAFC") };
  const modalFoot   = { padding:"10px 20px",borderTop:`1px solid ${isDarkMode(theme)?"rgba(0,175,197,0.1)":tTok.border}`,background:modalHeadBgS,display:"flex",justifyContent:"flex-end",gap:10,flexShrink:0 };
  const secTitle    = { fontSize:"var(--cc-caption)", color: tTok.primary, fontWeight:700, letterSpacing:1, textTransform:"uppercase", marginBottom:8 };
  const fmt         = (v) => v!=null?`$${Math.round(Number(v)).toLocaleString("es-CO")}`:"—";

  // ── Carga ────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    if (!contratoId) return;
    setLoading(true);
    try { setSubs(await call("GET",`/subcontratistas/${contratoId}`)); }
    catch (e) { setMsg({type:"error",text:e.message}); }
    finally { setLoading(false); }
  }, [contratoId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, [cargar]);

  const cargarCortes = async (sid) => {
    setCortesLoading(true);
    try { setCortes(await call("GET",`/subcontratistas/${sid}/cortes`) || []); }
    catch {} finally { setCortesLoading(false); }
  };
  const cargarPreciosSub = async (sid) => {
    setPreciosLoading(true);
    try { setPreciosSub(await call("GET",`/subcontratistas/${sid}/precios`) || []); }
    catch {} finally { setPreciosLoading(false); }
  };
  const cargarListado = async () => {
    if (listadoPrecios.length>0) return;
    try { setListadoPrecios(await call("GET",`/listado-precios/${contratoId}`) || []); }
    catch {}
  };

  // ── Acciones ─────────────────────────────────────────────
  const abrirDetalle = (sub) => {
    setDetalle(sub); setTabDetalle("datos"); setEditando(false); setEditForm({...sub});
    cargarCortes(sub.id); cargarPreciosSub(sub.id);
  };
  const crearSub = async () => {
    if (!crearForm.razon_social.trim()) { setMsg({type:"error",text:"La razón social es obligatoria."}); return; }
    setCreating(true);
    try {
      await call("POST",`/subcontratistas/${contratoId}`,crearForm);
      setMsg({type:"success",text:"✅ Subcontratista creado."});
      setShowCrear(false);
      setCrearForm({razon_social:"",objeto_contrato:"",nit:"",nombre_contacto:"",telefono:""});
      cargar();
    } catch(e){setMsg({type:"error",text:e.message});}
    finally{setCreating(false);}
  };
  const guardarEdicion = async () => {
    setSaving(true);
    try {
      await call("PUT",`/subcontratistas/${detalle.id}`,editForm);
      setMsg({type:"success",text:"✅ Datos actualizados."});
      setEditando(false); setDetalle({...detalle,...editForm}); cargar();
    } catch(e){setMsg({type:"error",text:e.message});}
    finally{setSaving(false);}
  };
  const toggleActivo = async () => {
    setToggling(true);
    try {
      const res = await call("PATCH",`/subcontratistas/${detalle.id}/toggle-activo`);
      setDetalle(d=>({...d,activo:res.activo})); cargar();
    } catch(e){setMsg({type:"error",text:e.message});}
    finally{setToggling(false);}
  };
  const cargarProximoConsecutivo = async (sid) => {
    try {
      const res = await call("GET",`/subcontratistas/${sid}/proximo-consecutivo`);
      const ultimo = cortes.length>0?cortes[cortes.length-1]:null;
      setCorteForm(f=>({...f,consecutivo:res.proximo,fecha_inicio:ultimo?ultimo.fecha_fin:"",fecha_fin:""}));
    } catch {}
  };
  const crearCorte = async () => {
    if (!corteForm.fecha_inicio||!corteForm.fecha_fin){setMsg({type:"error",text:"Complete las fechas."});return;}
    setCreatingCorte(true);
    try {
      await call("POST",`/subcontratistas/${detalle.id}/cortes`,corteForm);
      setMsg({type:"success",text:"✅ Corte creado."});
      setShowCrearCorte(false); cargarCortes(detalle.id);
    } catch(e){setMsg({type:"error",text:e.message});}
    finally{setCreatingCorte(false);}
  };
  const guardarCorteEdit = async () => {
    setSavingCorte(true);
    try {
      await call("PUT",`/subcontratistas/cortes/${corteDetalle.id}`,{fecha_fin:editCorteForm.fecha_fin});
      setMsg({type:"success",text:"✅ Corte actualizado y siguiente recalculado."});
      setCorteDetalle(null); cargarCortes(detalle.id);
    } catch(e){setMsg({type:"error",text:e.message});}
    finally{setSavingCorte(false);}
  };
  const agregarPrecio = async () => {
    if (!itemSel||!precioSubForm){setMsg({type:"error",text:"Selecciona un ítem y define el precio."});return;}
    setCreatingPrecio(true);
    try {
      await call("POST",`/subcontratistas/${detalle.id}/precios`,{listado_precio_id:itemSel.id,precio_unitario_sub:parseFloat(precioSubForm)||0});
      setMsg({type:"success",text:"✅ Ítem agregado."});
      setShowAgregarItem(false); setItemSel(null); setBusqTexto(""); setBusqCapitulo(""); setPrecioSubForm("");
      cargarPreciosSub(detalle.id);
    } catch(e){setMsg({type:"error",text:e.message});}
    finally{setCreatingPrecio(false);}
  };
  const guardarPrecioEdit = async () => {
    setSavingPrecio(true);
    try {
      await call("PUT",`/subcontratistas/precios/${precioEdit.id}`,{precio_unitario_sub:parseFloat(editPrecioVal)||0});
      setMsg({type:"success",text:"✅ Precio actualizado."});
      setPrecioEdit(null); cargarPreciosSub(detalle.id);
    } catch(e){setMsg({type:"error",text:e.message});}
    finally{setSavingPrecio(false);}
  };

  // ── Calendario ───────────────────────────────────────────
  const CalPicker = ({value,onChange,isOpen,onToggle}) => {
    const [vd,setVd] = useState(()=>value?new Date(value+"T12:00:00"):new Date());
    const MESES=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    const y=vd.getFullYear(),m=vd.getMonth();
    const fd=new Date(y,m,1).getDay(),dim=new Date(y,m+1,0).getDate();
    const dias=[...Array(fd).fill(null),...Array.from({length:dim},(_,i)=>i+1)];
    const iso=(d)=>`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const disp=(v)=>v?`${parseInt(v.split("-")[2])} ${MESES[parseInt(v.split("-")[1])-1]}, ${v.split("-")[0]}`:"Seleccionar fecha";
    return (
      <div style={{position:"relative"}}>
        <div onClick={onToggle} style={{...inputStyle,cursor:"pointer",padding:"8px 12px",display:"flex",alignItems:"center",gap:8}}>
          <span>📅</span><span style={{fontSize:13,color:value?col.textPrimary:col.textMuted}}>{disp(value)}</span>
        </div>
        {isOpen&&(
          <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,zIndex:10010,background:isDarkMode(theme)?"#0b1920":tTok.bgCard,border:`1px solid ${isDarkMode(theme)?"rgba(0,175,197,0.3)":tTok.border}`,borderRadius:10,padding:14,boxShadow:isRestMode(theme)?"0 16px 40px rgba(42,35,24,0.2)":"0 20px 50px rgba(0,0,0,0.5)",minWidth:260}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <button style={{...S.btn("ghost",true),padding:"4px 10px"}} onClick={()=>setVd(new Date(y,m-1,1))}>◄</button>
              <span style={{fontSize:14,fontWeight:700,color:col.textPrimary}}>{MESES[m]} <span style={{color: tTok.primary}}>{y}</span></span>
              <button style={{...S.btn("ghost",true),padding:"4px 10px"}} onClick={()=>setVd(new Date(y,m+1,1))}>►</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:6}}>
              {["dom","lun","mar","mié","jue","vie","sáb"].map(d=>(
                <div key={d} style={{textAlign:"center",fontSize:"var(--cc-caption)",color:col.textMuted,fontWeight:700,padding:"2px 0"}}>{d}</div>
              ))}
              {dias.map((d,i)=>{
                if(!d) return <div key={i}/>;
                const hoy=new Date().toISOString().slice(0,10);
                const diso=iso(d),isSel=diso===value,isHoy=diso===hoy;
                return(
                  <div key={i} onClick={()=>{onChange(diso);onToggle();}}
                    style={{textAlign:"center",padding:"5px 2px",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:isSel?700:400,background:isSel?"#00afc5":isHoy?"rgba(0,175,197,0.15)":"transparent",color:isSel?"#081318":col.textPrimary,border:isHoy&&!isSel?"1px solid rgba(0,175,197,0.4)":"1px solid transparent"}}
                    onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background="rgba(0,175,197,0.1)";}}
                    onMouseLeave={e=>{if(!isSel)e.currentTarget.style.background=isHoy?"rgba(0,175,197,0.15)":"transparent";}}>
                    {d}
                  </div>
                );
              })}
            </div>
            <div style={{display:"flex",justifyContent:"space-between",borderTop:"1px solid rgba(0,175,197,0.1)",paddingTop:8}}>
              <button style={{...S.btn("ghost",true),fontSize:10}} onClick={()=>{onChange(new Date().toISOString().slice(0,10));onToggle();}}>↖ hoy</button>
              <button style={{...S.btn("danger",true),fontSize:10}} onClick={()=>{onChange("");onToggle();}}>— borrar</button>
              <button style={{...S.btn("ghost",true),fontSize:10}} onClick={onToggle}>✕ cerrar</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Helpers ──────────────────────────────────────────────
  const cmpNat=(a,b)=>{const n=s=>parseFloat((s||"").match(/^(\d+(\.\d+)?)/)?.[1]??"9999");const na=n(a),nb=n(b);return na!==nb?na-nb:(a||"").localeCompare(b||"","es");};
  const subsFiltrados = subs.filter(s=>!filtro||(s.razon_social||"").toLowerCase().includes(filtro.toLowerCase())||(s.nit||"").includes(filtro)||(s.nombre_contacto||"").toLowerCase().includes(filtro.toLowerCase()));
  const capsUnicos = [...new Set(listadoPrecios.map(i=>i.capitulo).filter(Boolean))].sort(cmpNat);
  const itemsBusq  = listadoPrecios.filter(i=>{
    if(busqCapitulo&&i.capitulo!==busqCapitulo) return false;
    if(busqTexto&&!((i.descripcion||"")+" "+(i.item_numero||"")).toLowerCase().includes(busqTexto.toLowerCase())) return false;
    return true;
  });

  if(!contratoId) return <div style={S.empty}>No hay contrato activo en tu sesión.</div>;

  return (
    <div>
      {msg&&<div style={S.alert(msg.type)}>{msg.text}<span onClick={()=>setMsg(null)} style={{float:"right",cursor:"pointer",opacity:0.6}}>✕</span></div>}

      {/* Barra acciones */}
      <div style={{display:"flex",gap:10,marginBottom:20,alignItems:"center",flexWrap:"wrap"}}>
        {perms?.crear&&<button style={S.btn("primary",true)} onClick={()=>setShowCrear(true)}>+ Crear Subcontratista</button>}
        <input style={{...S.input,padding:"6px 10px",fontSize:12,flex:"1 1 180px",maxWidth:300}} placeholder="🔍 Buscar razón social, NIT, contacto..." value={filtro} onChange={e=>setFiltro(e.target.value)}/>
        {subs.length>0&&<span style={{marginLeft:"auto",fontSize:12,color:col.textMuted}}>{subs.length.toLocaleString("es-CO")} subcontratistas</span>}
      </div>

      {/* Grilla */}
      {loading?(<div style={S.empty}><span style={{color:"#00afc5"}}>Cargando...</span></div>
      ):subs.length===0?(<div style={S.empty}>No hay subcontratistas registrados.<br/><span style={{fontSize:12,color:col.textMuted}}>Usa "Crear Subcontratista" para agregar uno.</span></div>
      ):(
        <table style={S.table}>
          <thead><tr>{["Razón Social","Nombre de Contacto","NIT","Estado"].map((h,i)=><th key={i} style={S.th(theme)}>{h}</th>)}</tr></thead>
          <tbody>
            {subsFiltrados.map(sub=>(
              <tr key={sub.id} onClick={()=>abrirDetalle(sub)} style={{cursor:"pointer"}}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(0,175,197,0.05)"}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <td style={{...tdStyle,fontWeight:600,color:col.textPrimary}}>{sub.razon_social}</td>
                <td style={tdStyle}>{sub.nombre_contacto||"—"}</td>
                <td style={{...tdStyle,fontSize:12,color:col.textSecondary}}>{sub.nit||"—"}</td>
                <td style={tdStyle}><span style={S.badge(sub.activo?"aprobado":"rechazado")}>{sub.activo?"Activo":"Inactivo"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ══ MODAL CREAR ══ */}
      {showCrear&&(
        <div style={overlayStyle} onClick={e=>e.target===e.currentTarget&&setShowCrear(false)}>
          <div style={modalStyle(660)}>
            <div style={modalHead}>
              <div>
                <div style={{fontSize:17,fontWeight:700,color:col.textPrimary,fontFamily:"'Rajdhani',sans-serif"}}>Crear Subcontratista</div>
                <div style={{fontSize:11,color:col.textSecondary,marginTop:2}}>Ingresa los datos del nuevo subcontratista</div>
              </div>
              <button style={S.closeBtn(theme)} onClick={()=>setShowCrear(false)}>✕</button>
            </div>
            <div style={modalScroll}>
              <div style={{marginBottom:14}}>
                <div style={labelStyle}>Razón Social *</div>
                <input style={inputStyle} value={crearForm.razon_social} onChange={e=>setCrearForm(f=>({...f,razon_social:e.target.value}))} placeholder="Nombre o razón social"/>
              </div>
              <div style={{marginBottom:14}}>
                <div style={labelStyle}>Objeto del Contrato</div>
                <textarea style={{...inputStyle,resize:"vertical",minHeight:90}} value={crearForm.objeto_contrato} onChange={e=>setCrearForm(f=>({...f,objeto_contrato:e.target.value}))} placeholder="Descripción del objeto contractual..."/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
                <div>
                  <div style={labelStyle}>NIT</div>
                  <input style={inputStyle} value={crearForm.nit} onChange={e=>setCrearForm(f=>({...f,nit:e.target.value.replace(/[^0-9]/g,"")}))} placeholder="Solo números"/>
                </div>
                <div>
                  <div style={labelStyle}>Nombre del Contacto / Rep. Legal</div>
                  <input style={inputStyle} value={crearForm.nombre_contacto} onChange={e=>setCrearForm(f=>({...f,nombre_contacto:e.target.value}))} placeholder="Nombre completo"/>
                </div>
              </div>
              <div>
                <div style={labelStyle}>Teléfono de Contacto</div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <input style={{...inputStyle,flex:1}} value={crearForm.telefono} onChange={e=>setCrearForm(f=>({...f,telefono:e.target.value.replace(/[^0-9+\-\s]/g,"")}))} placeholder="Número de teléfono"/>
                  {crearForm.telefono&&(
                    <a href={`https://wa.me/${crearForm.telefono.replace(/[^0-9]/g,"")}`} target="_blank" rel="noreferrer"
                      style={{background:"#25D366",borderRadius:8,padding:"8px 14px",color:"#fff",fontSize:13,fontWeight:700,textDecoration:"none",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:6}}>
                      💬 WhatsApp
                    </a>
                  )}
                </div>
              </div>
            </div>
            <div style={modalFoot}>
              <button style={S.btn("ghost")} onClick={()=>setShowCrear(false)}>Cancelar</button>
              <button style={S.btn("primary")} onClick={crearSub} disabled={creating}>{creating?"Creando...":"✓ Crear Subcontratista"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ POPUP DETALLE ══ */}
      {detalle&&(
        <div style={overlayStyle} onClick={e=>e.target===e.currentTarget&&setDetalle(null)}>
          <div style={modalStyle(900)}>
            <div style={modalHead}>
              <div style={{display:"flex",alignItems:"center",gap:14}}>
                <div>
                  <div style={{fontSize:10,color:col.textSecondary,letterSpacing:1,textTransform:"uppercase",marginBottom:2}}>Subcontratista</div>
                  <div style={{fontSize:17,fontWeight:700,color:col.textPrimary,fontFamily:"'Rajdhani',sans-serif"}}>{detalle.razon_social}</div>
                </div>
                <span style={S.badge(detalle.activo?"aprobado":"rechazado")}>{detalle.activo?"Activo":"Inactivo"}</span>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                {perms?.editar&&<button style={S.btn(detalle.activo?"danger":"success",true)} onClick={toggleActivo} disabled={toggling}>{toggling?"...":(detalle.activo?"⏸ Desactivar":"▶ Activar")}</button>}
                <button style={S.closeBtn(theme)} onClick={()=>setDetalle(null)}>✕</button>
              </div>
            </div>

            {/* Tabs internos */}
            <div style={{display:"flex",borderBottom:`1px solid ${tTok.border}`,background: isDarkMode(theme) ? "#081318" : (isRestMode(theme) ? tTok.headerBg : "#E0F2FE"),flexShrink:0}}>
              {[["datos","📋 Datos"],["cortes","📅 Cortes"],["precios","💲 Precios"]].map(([id,label])=>(
                <button key={id} onClick={()=>setTabDetalle(id)}
                  style={{padding:"10px 20px",border:"none",background:"transparent",cursor:"pointer",fontSize:13,fontWeight:tabDetalle===id?700:400,color:tabDetalle===id?"#00afc5":col.textSecondary,borderBottom:tabDetalle===id?"2px solid #00afc5":"2px solid transparent",transition:"all 0.15s"}}>
                  {label}
                </button>
              ))}
            </div>

            <div style={modalScroll}>

              {/* Tab: Datos */}
              {tabDetalle==="datos"&&(
                <div>
                  <div style={{display:"flex",justifyContent:"flex-end",marginBottom:14}}>
                    {perms?.editar&&!editando&&<button style={S.btn("ghost",true)} onClick={()=>{setEditando(true);setEditForm({...detalle});}}>✏️ Editar datos</button>}
                    {editando&&<div style={{display:"flex",gap:8}}>
                      <button style={S.btn("ghost",true)} onClick={()=>setEditando(false)}>Cancelar</button>
                      <button style={S.btn("primary",true)} onClick={guardarEdicion} disabled={saving}>{saving?"Guardando...":"💾 Guardar"}</button>
                    </div>}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
                    <div>
                      <div style={labelStyle}>Razón Social *</div>
                      <input style={{...inputStyle,opacity:editando?1:0.7}} value={editando?editForm.razon_social||"":detalle.razon_social||""} disabled={!editando} onChange={e=>setEditForm(f=>({...f,razon_social:e.target.value}))}/>
                    </div>
                    <div>
                      <div style={labelStyle}>NIT</div>
                      <input style={{...inputStyle,opacity:editando?1:0.7}} value={editando?editForm.nit||"":detalle.nit||""} disabled={!editando} onChange={e=>setEditForm(f=>({...f,nit:e.target.value.replace(/[^0-9]/g,"")}))}/>
                    </div>
                  </div>
                  <div style={{marginBottom:14}}>
                    <div style={labelStyle}>Objeto del Contrato</div>
                    <textarea style={{...inputStyle,resize:"vertical",minHeight:80,opacity:editando?1:0.7}} value={editando?editForm.objeto_contrato||"":detalle.objeto_contrato||""} disabled={!editando} onChange={e=>setEditForm(f=>({...f,objeto_contrato:e.target.value}))}/>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                    <div>
                      <div style={labelStyle}>Nombre del Contacto / Rep. Legal</div>
                      <input style={{...inputStyle,opacity:editando?1:0.7}} value={editando?editForm.nombre_contacto||"":detalle.nombre_contacto||""} disabled={!editando} onChange={e=>setEditForm(f=>({...f,nombre_contacto:e.target.value}))}/>
                    </div>
                    <div>
                      <div style={labelStyle}>Teléfono</div>
                      <div style={{display:"flex",gap:8,alignItems:"center"}}>
                        <input style={{...inputStyle,flex:1,opacity:editando?1:0.7}} value={editando?editForm.telefono||"":detalle.telefono||""} disabled={!editando} onChange={e=>setEditForm(f=>({...f,telefono:e.target.value.replace(/[^0-9+\-\s]/g,"")}))}/>
                        {(detalle.telefono)&&(
                          <a href={`https://wa.me/${(detalle.telefono||"").replace(/[^0-9]/g,"")}`} target="_blank" rel="noreferrer"
                            style={{background:"#25D366",borderRadius:8,padding:"8px 12px",color:"#fff",fontSize:12,fontWeight:700,textDecoration:"none",whiteSpace:"nowrap"}}>
                            💬 WA
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: Cortes */}
              {tabDetalle==="cortes"&&(
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                    <div style={secTitle}>Períodos de Facturación</div>
                    {perms?.crear&&<button style={S.btn("primary",true)} onClick={()=>{setShowCrearCorte(true);cargarProximoConsecutivo(detalle.id);setCalFiOpen(false);setCalFfOpen(false);}}>+ Nuevo Corte</button>}
                  </div>
                  {cortesLoading?(<div style={{color:"#4a7a87",fontSize:13}}>Cargando...</div>
                  ):cortes.length===0?(<div style={S.empty}>No hay cortes registrados.</div>
                  ):(
                    <table style={S.table}>
                      <thead><tr>{["N° Corte","Tipo","Fecha Inicio","Fecha Fin"].map((h,i)=><th key={i} style={S.th(theme)}>{h}</th>)}</tr></thead>
                      <tbody>
                        {cortes.map(c=>(
                          <tr key={c.id} onClick={()=>{setCorteDetalle(c);setEditCorteForm({fecha_fin:c.fecha_fin});setCalEditFf(false);}} style={{cursor:"pointer"}}
                            onMouseEnter={e=>e.currentTarget.style.background="rgba(0,175,197,0.05)"}
                            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                            <td style={{...tdStyle,fontWeight:700,color:"#00afc5"}}>#{c.consecutivo}</td>
                            <td style={{...tdStyle,fontSize:12}}>{c.tipo_periodo==="quincenal"?"🔄 Quincenal":"📅 Mensual"}</td>
                            <td style={tdStyle}>{c.fecha_inicio}</td>
                            <td style={tdStyle}>{c.fecha_fin}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Tab: Precios */}
              {tabDetalle==="precios"&&(
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                    <div style={secTitle}>Ítems de Cobro</div>
                    {perms?.crear&&<button style={S.btn("primary",true)} onClick={()=>{setShowAgregarItem(true);setItemSel(null);setBusqTexto("");setBusqCapitulo("");setPrecioSubForm("");cargarListado();}}>+ Agregar Ítem</button>}
                  </div>
                  {preciosLoading?(<div style={{color:"#4a7a87",fontSize:13}}>Cargando...</div>
                  ):preciosSub.length===0?(<div style={S.empty}>No hay ítems asignados.</div>
                  ):(
                    <table style={S.table}>
                      <thead><tr>{["Capítulo","Ítem","Descripción","Vlr. Referencia","Vlr. Subcontratista"].map((h,i)=><th key={i} style={S.th(theme)}>{h}</th>)}</tr></thead>
                      <tbody>
                        {preciosSub.map(p=>(
                          <tr key={p.id} onClick={()=>{setPrecioEdit(p);setEditPrecioVal(String(p.precio_unitario_sub));}} style={{cursor:"pointer"}}
                            onMouseEnter={e=>e.currentTarget.style.background="rgba(0,175,197,0.05)"}
                            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                            <td style={{...tdStyle,fontSize:12,color:col.textMuted}}>{p.capitulo||"—"}</td>
                            <td style={{...tdStyle,fontWeight:600,color:col.textSecondary,fontSize:12}}>{p.item_numero||"—"}</td>
                            <td style={tdStyle}>{p.descripcion}</td>
                            <td style={{...tdStyle,fontSize:12,color:col.textMuted,textAlign:"right"}}>{fmt(p.precio_unitario_ref)}</td>
                            <td style={{...tdStyle,color:"#22c55e",fontWeight:700,textAlign:"right"}}>{fmt(p.precio_unitario_sub)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>

            <div style={modalFoot}>
              <button style={S.btn("ghost")} onClick={()=>setDetalle(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL CREAR CORTE ══ */}
      {showCrearCorte&&(
        <div style={{...overlayStyle,zIndex:10002}} onClick={e=>e.target===e.currentTarget&&setShowCrearCorte(false)}>
          <div style={{...modalStyle(540), minHeight:"min(620px,88vh)"}}>
            <div style={modalHead}>
              <div>
                <div style={{fontSize:17,fontWeight:700,color:col.textPrimary,fontFamily:"'Rajdhani',sans-serif"}}>Crear Nuevo Corte</div>
                <div style={{fontSize:11,color:col.textSecondary,marginTop:2}}>{detalle?.razon_social}</div>
              </div>
              <button style={S.closeBtn(theme)} onClick={()=>setShowCrearCorte(false)}>✕</button>
            </div>
            <div style={modalScroll}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
                <div>
                  <div style={labelStyle}>Tipo de Período *</div>
                  <select style={selectStyle} value={corteForm.tipo_periodo} onChange={e=>setCorteForm(f=>({...f,tipo_periodo:e.target.value}))}>
                    <option value="quincenal">🔄 Quincenal</option>
                    <option value="mensual">📅 Mensual</option>
                  </select>
                </div>
                <div>
                  <div style={labelStyle}>N° Consecutivo (auto)</div>
                  <input style={{...inputStyle,opacity:0.6}} value={corteForm.consecutivo} disabled/>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:16}}>
                <div>
                  <div style={labelStyle}>Fecha Inicio *</div>
                  <CalPicker value={corteForm.fecha_inicio} onChange={v=>setCorteForm(f=>({...f,fecha_inicio:v}))} isOpen={calFiOpen} onToggle={()=>{setCalFiOpen(o=>!o);setCalFfOpen(false);}}/>
                </div>
                <div>
                  <div style={labelStyle}>Fecha Fin *</div>
                  <CalPicker value={corteForm.fecha_fin} onChange={v=>setCorteForm(f=>({...f,fecha_fin:v}))} isOpen={calFfOpen} onToggle={()=>{setCalFfOpen(o=>!o);setCalFiOpen(false);}}/>
                </div>
              </div>
              {corteForm.fecha_inicio&&corteForm.fecha_fin&&(
                <div style={{background:"rgba(0,175,197,0.06)",border:"1px solid rgba(0,175,197,0.2)",borderRadius:8,padding:"10px 14px",fontSize:12,color:col.textSecondary}}>
                  📋 Corte #{corteForm.consecutivo} · {corteForm.tipo_periodo} · del <strong>{corteForm.fecha_inicio}</strong> al <strong>{corteForm.fecha_fin}</strong>
                </div>
              )}
            </div>
            <div style={modalFoot}>
              <button style={S.btn("ghost")} onClick={()=>setShowCrearCorte(false)}>Cancelar</button>
              <button style={S.btn("primary")} onClick={crearCorte} disabled={creatingCorte}>{creatingCorte?"Creando...":"✓ Crear Corte"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ POPUP DETALLE CORTE ══ */}
      {corteDetalle&&(
        <div style={{...overlayStyle,zIndex:10002}} onClick={e=>e.target===e.currentTarget&&setCorteDetalle(null)}>
          <div style={modalStyle(460)}>
            <div style={modalHead}>
              <div>
                <div style={{fontSize:17,fontWeight:700,color:col.textPrimary,fontFamily:"'Rajdhani',sans-serif"}}>Corte #{corteDetalle.consecutivo}</div>
                <div style={{fontSize:11,color:col.textSecondary,marginTop:2}}>{detalle?.razon_social} · {corteDetalle.tipo_periodo}</div>
              </div>
              <button style={S.closeBtn(theme)} onClick={()=>setCorteDetalle(null)}>✕</button>
            </div>
            <div style={modalScroll}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
                <div>
                  <div style={labelStyle}>Fecha Inicio (no editable)</div>
                  <div style={{...inputStyle,opacity:0.55,pointerEvents:"none"}}>{corteDetalle.fecha_inicio}</div>
                </div>
                <div>
                  <div style={labelStyle}>Fecha Fin {perms?.editar?"(editable)":""}</div>
                  {perms?.editar?(
                    <CalPicker value={editCorteForm.fecha_fin} onChange={v=>setEditCorteForm(f=>({...f,fecha_fin:v}))} isOpen={calEditFf} onToggle={()=>setCalEditFf(o=>!o)}/>
                  ):(
                    <div style={{...inputStyle,opacity:0.55,pointerEvents:"none"}}>{corteDetalle.fecha_fin}</div>
                  )}
                </div>
              </div>
              {perms?.editar&&<div style={{fontSize:11,color:"#f59e0b",marginTop:4}}>⚠ Al cambiar la fecha fin, el corte siguiente se recalculará automáticamente.</div>}
            </div>
            <div style={modalFoot}>
              <button style={S.btn("ghost")} onClick={()=>setCorteDetalle(null)}>Cerrar</button>
              {perms?.editar&&<button style={S.btn("primary")} onClick={guardarCorteEdit} disabled={savingCorte}>{savingCorte?"Guardando...":"💾 Guardar"}</button>}
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL AGREGAR ÍTEM ══ */}
      {showAgregarItem&&(
        <div style={{...overlayStyle,zIndex:10002}} onClick={e=>e.target===e.currentTarget&&setShowAgregarItem(false)}>
          <div style={modalStyle(660)}>
            <div style={modalHead}>
              <div>
                <div style={{fontSize:17,fontWeight:700,color:col.textPrimary,fontFamily:"'Rajdhani',sans-serif"}}>Agregar Ítem de Cobro</div>
                <div style={{fontSize:11,color:col.textSecondary,marginTop:2}}>Subcontratista: {detalle?.razon_social}</div>
              </div>
              <button style={S.closeBtn(theme)} onClick={()=>setShowAgregarItem(false)}>✕</button>
            </div>
            <div style={modalScroll}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
                <div>
                  <div style={labelStyle}>Capítulo</div>
                  <select style={selectStyle} value={busqCapitulo} onChange={e=>{setBusqCapitulo(e.target.value);setBusqTexto("");setItemSel(null);}}>
                    <option value="">Todos los capítulos</option>
                    {capsUnicos.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <div style={labelStyle}>Buscar ítem o descripción</div>
                  <input style={inputStyle} value={busqTexto} onChange={e=>{setBusqTexto(e.target.value);setItemSel(null);}} placeholder="Escribe para buscar..."/>
                </div>
              </div>

              {(busqTexto||busqCapitulo)&&!itemSel&&(
                <div style={{maxHeight:180,overflowY:"auto",border:"1px solid rgba(0,175,197,0.2)",borderRadius:8,marginBottom:14}}>
                  {itemsBusq.length===0?(
                    <div style={{padding:"14px",textAlign:"center",color:col.textMuted,fontSize:13}}>Sin resultados</div>
                  ):itemsBusq.slice(0,30).map(i=>(
                    <div key={i.id} onClick={()=>{setItemSel(i);setBusqTexto(i.descripcion);}}
                      style={{padding:"8px 14px",cursor:"pointer",borderBottom:"1px solid rgba(0,175,197,0.08)",fontSize:12}}
                      onMouseEnter={e=>e.currentTarget.style.background="rgba(0,175,197,0.07)"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <span style={{color:"#00afc5",fontWeight:600,marginRight:8}}>{i.item_numero}</span>
                      <span style={{color:col.textTable}}>{i.descripcion}</span>
                      <span style={{color:col.textMuted,marginLeft:8,fontSize:11}}>[{i.unidad}]</span>
                    </div>
                  ))}
                </div>
              )}

              {itemSel&&(
                <div style={{background:"rgba(0,175,197,0.06)",border:"1px solid rgba(0,175,197,0.2)",borderRadius:10,padding:"14px 18px",marginBottom:14}}>
                  <div style={{fontSize:9,color:"#00afc5",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>Ítem seleccionado</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    {[["Ítem",itemSel.item_numero],["Unidad",itemSel.unidad],["Descripción",itemSel.descripcion],["Vlr. Unitario Referencia",`$${Math.round(itemSel.precio_unitario||0).toLocaleString("es-CO")}`]].map(([l,v])=>(
                      <div key={l}>
                        <div style={{fontSize:9,color:"#4a7a87",textTransform:"uppercase",letterSpacing:0.8,marginBottom:3}}>{l}</div>
                        <div style={{fontSize:13,fontWeight:600,color:col.textPrimary}}>{v||"—"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div style={labelStyle}>Valor Unitario Subcontratista *</div>
                <input style={inputStyle} type="number" value={precioSubForm} onChange={e=>setPrecioSubForm(e.target.value)} placeholder="Precio acordado con el subcontratista"/>
              </div>
            </div>
            <div style={modalFoot}>
              <button style={S.btn("ghost")} onClick={()=>setShowAgregarItem(false)}>Cancelar</button>
              <button style={S.btn("primary")} onClick={agregarPrecio} disabled={creatingPrecio}>{creatingPrecio?"Agregando...":"✓ Agregar Ítem"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ POPUP DETALLE PRECIO ══ */}
      {precioEdit&&(
        <div style={{...overlayStyle,zIndex:10002}} onClick={e=>e.target===e.currentTarget&&setPrecioEdit(null)}>
          <div style={modalStyle(500)}>
            <div style={modalHead}>
              <div>
                <div style={{fontSize:17,fontWeight:700,color:col.textPrimary,fontFamily:"'Rajdhani',sans-serif"}}>{precioEdit.item_numero} — {(precioEdit.descripcion||"").substring(0,38)}{(precioEdit.descripcion||"").length>38?"...":""}</div>
                <div style={{fontSize:11,color:col.textSecondary,marginTop:2}}>{detalle?.razon_social}</div>
              </div>
              <button style={S.closeBtn(theme)} onClick={()=>setPrecioEdit(null)}>✕</button>
            </div>
            <div style={modalScroll}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
                {[["Capítulo",precioEdit.capitulo],["Competencia",precioEdit.competencia||"—"],["Ítem",precioEdit.item_numero],["Unidad",precioEdit.unidad]].map(([l,v])=>(
                  <div key={l} style={{background:"rgba(0,175,197,0.04)",border:"1px solid rgba(0,175,197,0.1)",borderRadius:8,padding:"10px 14px"}}>
                    <div style={{fontSize:9,color:"#4a7a87",textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>{l}</div>
                    <div style={{fontSize:13,fontWeight:600,color:col.textPrimary}}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                <div>
                  <div style={labelStyle}>Vlr. Unitario Referencia (Contrato)</div>
                  <div style={{...inputStyle,opacity:0.55,pointerEvents:"none",color:col.textSecondary}}>{fmt(precioEdit.precio_unitario_ref)}</div>
                </div>
                <div>
                  <div style={labelStyle}>Vlr. Unitario Subcontratista {perms?.editar?"*":""}</div>
                  {perms?.editar?(
                    <input style={inputStyle} type="number" value={editPrecioVal} onChange={e=>setEditPrecioVal(e.target.value)}/>
                  ):(
                    <div style={{...inputStyle,opacity:0.7,pointerEvents:"none",color:"#22c55e",fontWeight:700}}>{fmt(precioEdit.precio_unitario_sub)}</div>
                  )}
                </div>
              </div>
            </div>
            <div style={modalFoot}>
              <button style={S.btn("ghost")} onClick={()=>setPrecioEdit(null)}>Cerrar</button>
              {perms?.editar&&<button style={S.btn("primary")} onClick={guardarPrecioEdit} disabled={savingPrecio}>{savingPrecio?"Guardando...":"💾 Guardar"}</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────
// ─── MAPA: qué funciones habilitan cada tab del panel ─────────────────────────
// El nombre debe coincidir (case-insensitive) con el campo funcion_nombre en permisos
const TAB_FUNCIONES = {
  usuarios:        ["aprobar usuarios", "crear usuarios"],
  cargos:          ["panel de administración"],
  permisos:        ["panel de administración"],
  contratos:       ["contratos"],
  precios:         ["listado de precios"],
  subcontratistas: ["subcontratistas"],
  resets:          ["panel de administración"],
  actas:           ["actas"],
  nube:            ["integración nube claracore"],
};

function _permisoTabVisible(p) {
  return !!(p && (p.ver || p.crear || p.editar || p.eliminar || p.validar || p.exportar));
}

/** Orden del panel admin (ids deben coincidir con TAB_FUNCIONES y el contenido renderizado). */
const ADMIN_PANEL_TABS = [
  { id: "usuarios",  label: "Gestión de Usuarios" },
  { id: "cargos",    label: "Gestión de cargos"   },
  { id: "permisos",  label: "Control de accesos"  },
  { id: "contratos", label: "Contratos"            },
  { id: "precios",          label: "Listado de Precios"   },
  { id: "subcontratistas",  label: "Subcontratistas"       },
  { id: "resets",           label: "Reset Claves"          },
  { id: "actas",       label: "Actas", soloAdmin: false },
  { id: "nube",         label: "Integración nube", soloAdmin: false },
  { id: "inicio",    label: "Página de inicio", soloAdmin: true },
  { id: "logs",      label: "📋 Logs del Sistema", soloAdmin: true },
  { id: "diagnostico", label: "📊 Diagnóstico plataforma", soloDeveloper: true },
];

export default function AdminPanel({ user, token, onClose, activeTheme, t: tProp }) {
  const call = useApi(token, { maxRetries: 3, timeoutMs: 48000 });
  const [cargos, setCargos] = useState([]);
  const [contratos, setContratos] = useState([]);
  const t = tProp && tProp.text ? tProp : tFrom(activeTheme, null);

  const isDeveloper = user?.cargo_nombre?.toLowerCase() === "desarrollador";
  const isAdmin     = user?.cargo_nombre?.toLowerCase() === "administrador";

  const TABS = useMemo(() => {
    return ADMIN_PANEL_TABS.filter((tabItem) => {
      if (isDeveloper) return true;
      if (tabItem.soloDeveloper) return false;
      const funciones = TAB_FUNCIONES[tabItem.id] || [];
      /* Administrador: mismo acceso que siempre a pestañas clásicas; «Integración nube» exige permiso en matriz. */
      if (isAdmin && tabItem.id !== "nube") return true;
      if (
        funciones.some((fname) =>
          (user?.permisos || []).some(
            (p) => p.funcion_nombre?.toLowerCase() === fname && _permisoTabVisible(p)
          )
        )
      ) {
        return true;
      }
      if (tabItem.soloAdmin) return false;
      return false;
    });
  }, [user?.permisos, user?.cargo_nombre, isDeveloper, isAdmin]);

  const [tab, setTab] = useState(() => ADMIN_PANEL_TABS[0]?.id || "usuarios");

  useEffect(() => {
    if (TABS.length && !TABS.some((x) => x.id === tab)) {
      startTransition(() => setTab(TABS[0].id));
    }
  }, [TABS, tab]);

  /** Contratos visibles en el panel: no privilegiados solo el asignado en su perfil. */
  const contratosVisibles = useMemo(() => {
    if (isDeveloper || isAdmin) return contratos;
    const cid = user?.contrato_id;
    if (cid == null || cid === "") return [];
    const n = Number(cid);
    return contratos.filter((c) => Number(c.id) === n);
  }, [contratos, isDeveloper, isAdmin, user?.contrato_id]);

  const TITULOS = {
    usuarios:  { title: "Gestión de usuarios",    sub: "Administra cargos, roles, contratos y estados" },
    cargos:    { title: "Gestión de cargos",      sub: "Crea y elimina cargos del sistema" },
    permisos:  { title: "Control de accesos",     sub: "Configura qué puede hacer cada cargo" },
    contratos: { title: "Contratos",              sub: "Crea y gestiona contratos del sistema" },
    precios:          { title: "Listado de Precios",    sub: "Edita, carga y descarga el listado de precios por contrato" },
    subcontratistas:  { title: "Subcontratistas",       sub: "Gestión de subcontratistas, cortes de facturación y precios por contrato" },
    resets:           { title: "Reset Claves",          sub: "Autoriza solicitudes de cambio de contraseña" },
    actas:       { title: "Actas", sub: "Crear actas RPO y administrativas; cierre anticipado y traslado de residuales (RPO)" },
    nube:       { title: "Integración nube", sub: "Google Drive u OneDrive: carpetas ClaraCore para SST y ensayos" },
    inicio:    { title: "Página de inicio",       sub: "Novedades, textos e imagen de contexto en el módulo Inicio" },
    logs:      { title: "Logs del Sistema",       sub: "Auditoría completa de acciones en la plataforma" },
    diagnostico: {
      title: "Diagnóstico plataforma",
      sub: "Resumen técnico: salud de API/BD, lentitudes, errores de sistema y uso por módulo (solo Desarrollador).",
    },
  };

  const cargarCargos = useCallback(async () => {
    try { setCargos(await call("GET", "/cargos")); } catch {}
  }, [call]);

  const cargarContratos = useCallback(async () => {
    try {
      setContratos(await call("GET", "/contratos"));
    } catch {}
  }, [call]);

  const contratosPanelFetchRef = useRef(false);

  useEffect(() => {
    cargarCargos();
  }, [cargarCargos]);

  useEffect(() => {
    const needContratos = ["contratos", "precios", "subcontratistas", "actas", "nube", "inicio"].includes(tab);
    if (needContratos && !contratosPanelFetchRef.current) {
      contratosPanelFetchRef.current = true;
      void cargarContratos();
    }
  }, [tab, cargarContratos]);

  // Permisos del usuario sobre "Listado de Precios" para pasar a la sección
  const precioPerms = (user?.permisos || []).find(
    p => p.funcion_nombre?.toLowerCase() === "listado de precios"
  ) || {};

  const subPerms = (user?.permisos || []).find(
    p => p.funcion_nombre?.toLowerCase() === "subcontratistas"
  ) || {};

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.panel(activeTheme, t)} onClick={e => e.stopPropagation()}>

        {/* SIDEBAR */}
        <div style={S.sidebar(activeTheme, t)}>
          <div style={S.sidebarHeader(activeTheme, t)}>
            <img
              src="/CLARA.CORE.png"
              alt="ClaraCore"
              className="cc-brand-logo cc-brand-logo--admin"
              style={{ filter: isLightTheme(activeTheme) ? "none" : "brightness(0) invert(1)" }}
            />
            <div style={S.logoSub(activeTheme, t)}>PANEL ADMIN</div>
          </div>

          {TABS.map((it) => (
            <div key={it.id} style={S.navItem(tab === it.id, activeTheme, t)} onClick={() => setTab(it.id)}>
              <div style={S.navDot(tab === it.id, activeTheme, t)} />
              <span>{it.label}</span>
            </div>
          ))}

          <div style={S.sidebarFooter(activeTheme, t)}>
            <div style={S.userTag(activeTheme, t)}>Sesión activa</div>
            <div style={S.userName(activeTheme, t)}>{user?.nombre} {user?.apellidos}</div>
            <div style={{ ...S.userTag(activeTheme, t), marginTop: 2 }}>{user?.cargo_nombre}</div>
          </div>
        </div>

        {/* CONTENIDO */}
        <div style={S.content}>
          <div style={S.contentHeader(activeTheme, t)}>
            <div>
              <div style={S.contentTitle(activeTheme, t)}>{TITULOS[tab]?.title}</div>
              <div style={S.contentSub(activeTheme, t)}>{TITULOS[tab]?.sub}</div>
            </div>
            <button style={S.closeBtn(activeTheme, t)} onClick={onClose} title="Cerrar" type="button">✕</button>
          </div>

          <div style={S.scrollArea(activeTheme, t)}>
            {tab === "usuarios"  && <SeccionUsuarios  call={call} cargos={cargos} theme={activeTheme} userId={user?.id} />}
            {tab === "cargos"    && <SeccionCargos    call={call} cargos={cargos} recargarCargos={cargarCargos} theme={activeTheme} />}
            {tab === "permisos"  && <SeccionPermisos  call={call} cargos={cargos} theme={activeTheme} />}
            {tab === "contratos" && <SeccionContratos call={call} contratos={contratosVisibles} recargarContratos={cargarContratos}
            perms={isDeveloper ? { ver: true, crear: true, editar: true, eliminar: true, exportar: true } :
              (() => {
                const p = (user?.permisos || []).find(p => p.funcion_nombre?.toLowerCase() === "contratos");
                return {
                  ver:      p?.ver      || false,
                  crear:    p?.crear    || false,
                  editar:   p?.editar   || false,
                  eliminar: p?.eliminar || false,
                  exportar: p?.exportar || false,
                };
              })()
            }
          />}
            {tab === "precios"          && <SeccionListadoPrecios call={call} user={user} perms={isDeveloper || isAdmin ? { ver: true, crear: true, editar: true, eliminar: true, exportar: true, validar: true } : precioPerms} theme={activeTheme} />}
            {tab === "subcontratistas"  && <SeccionSubcontratistas call={call} user={user} perms={isDeveloper || isAdmin ? { ver: true, crear: true, editar: true, eliminar: true, validar: true, exportar: true } : subPerms} theme={activeTheme} />}
            {tab === "actas"            && <SeccionActasRpo call={call} user={user} contratos={contratosVisibles} theme={activeTheme} />}
            {tab === "nube"             && <ModuloNube usuario={user} t={t} contratos={contratosVisibles} />}
            {tab === "resets"           && <SeccionResets    call={call} theme={activeTheme} />}
            {tab === "inicio"           && (
              <SeccionInicioNovedades
                call={call}
                theme={activeTheme}
                token={token}
                isDeveloper={isDeveloper}
                user={user}
                contratos={contratosVisibles}
              />
            )}
              {tab === "logs"      && <SeccionLogs      call={call} theme={activeTheme} />}
              {tab === "diagnostico" && <SeccionDiagnosticoPlataforma call={call} theme={activeTheme} />}
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@600;700&family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
      `}</style>
    </div>
  );
}

