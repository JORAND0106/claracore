/**
 * Modal de edición / creación de contrato con pestañas.
 */
import { useEffect, useMemo, useState } from "react";
import { ContratoDocumentosPanel } from "./ContratoDocumentosContractuales";
import { ContratoOrdenesPagoPanel } from "./ContratoOrdenesPago";
import { formatCOP } from "./utils/formatCOP";
import { buildContratoUiTheme } from "./theme/adminPanelTheme";
import { useClaraViewport } from "./useClaraViewport";
import CcConfirmModal from "./components/CcConfirmModal";
import PkIdsCsvPanoramaModal from "./components/PkIdsCsvPanoramaModal";

const ALL_TABS = [
  { id: "info", label: "Información del contrato" },
  { id: "financiera", label: "Información financiera" },
  { id: "niveles", label: "Niveles de validación", editOnly: true },
  { id: "licencia", label: "Contrato de licenciamiento", devOnly: true, editOnly: true },
  { id: "ordenes", label: "Órdenes de pago", devOnly: true, editOnly: true },
];

export default function ContratoEditModal({
  open,
  mode,
  contratoId,
  contratoNumero,
  isDeveloper,
  onClose,
  onGuardar,
  saving,
  msg,
  form,
  setForm,
  nivelesActivosEdit,
  setNivelesActivosEdit,
  planoArchivoLabel,
  planoFileInputRef,
  mapContainerRef,
  handleLogo,
  handlePlanoGeojson,
  abrirSelectorPlanoGeojson,
  quitarPlanoGeojson,
  pkIdsCount = null,
  pkIdsSicoeRefs = null,
  pkIdsReemplazoBloqueado = false,
  pkCsvUploading = false,
  pkCsvPending = null,
  pkCsvReplaceConfirm = false,
  pkCsvResult = null,
  pkCsvFileInputRef,
  abrirSelectorPkCsv,
  handlePkCsvFile,
  onPkCsvModoAgregar,
  onPkCsvModoSincronizar,
  onPkCsvModoReemplazar,
  onPkCsvReplaceConfirm,
  onPkCsvReplaceCancel,
  onPkCsvCancelPending,
  onPkCsvResultClose,
  onAbrirPanoramaMaestroPkIds,
  onAbrirComparacionPkCsv,
  pkPanoramaOpen = false,
  pkPanoramaData = null,
  pkPanoramaLoading = false,
  pkPanoramaError = null,
  pkPanoramaTitulo = "Panorama maestro PK-ID",
  pkPanoramaSubtitulo = null,
  onCerrarPanoramaPkIds,
  onEliminarPkIdsSinUso,
  onEliminarPkIdMaestro,
  onRecargarPanoramaPkIds,
  pkPanoramaEliminando = false,
  editandoContratoId = null,
  ENTIDADES,
  nivelesLabels,
  perms,
  numONull,
  call,
  token,
  theme = "dark",
  t: tProp = null,
  initialTab = "info",
}) {
  const [tab, setTab] = useState(initialTab);
  const isEdit = mode === "edit";
  const ui = useMemo(() => buildContratoUiTheme(theme, tProp), [theme, tProp]);
  const { inp, lbl, font, fileDrop: fileDropStyle, confirmTheme } = ui;
  const { isMobile: vpMobile, isLandscapeMobile } = useClaraViewport();
  const compact = vpMobile || isLandscapeMobile;

  function copHint(val) {
    if (val == null || val === "" || Number.isNaN(Number(val))) return null;
    return (
      <div style={{ fontSize: font.caption, color: ui.primary, marginTop: -8, marginBottom: 8 }}>
        {formatCOP(val)}
      </div>
    );
  }

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab, contratoId]);

  if (!open) return null;

  const tabs = ALL_TABS.filter((t) => {
    if (t.editOnly && !isEdit) return false;
    if (t.devOnly && !isDeveloper) return false;
    return true;
  });

  const titulo = isEdit
    ? `Contrato ${contratoNumero || contratoId || ""}`.trim()
    : "Nuevo contrato";

  return (
    <div
      className="cc-contrato-modal-overlay"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100010,
        background: ui.overlay,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: compact ? 0 : 16,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="cc-contrato-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: compact ? "100%" : "min(1248px, 100%)",
          maxHeight: compact ? "100%" : "min(92vh, 920px)",
          height: compact ? "100%" : undefined,
          minHeight: compact ? "100dvh" : undefined,
          display: "flex",
          flexDirection: "column",
          background: ui.bg,
          border: `1px solid ${ui.border}`,
          borderRadius: compact ? 0 : 14,
          boxShadow: ui.shadow,
          overflow: "hidden",
          fontSize: font.body,
          lineHeight: 1.35,
        }}
      >
        <div
          style={{
            padding: compact ? "12px 14px 10px" : "16px 20px 12px",
            borderBottom: `1px solid ${ui.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ fontSize: font.title, fontWeight: 800, color: ui.primary }}>{titulo}</div>
            <div style={{ fontSize: font.caption, color: ui.textMuted, marginTop: 2 }}>
              {isEdit ? "Edición del contrato" : "Registro de un nuevo contrato en la plataforma"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: `1px solid ${ui.border}`,
              borderRadius: 8,
              padding: "6px 12px",
              minHeight: 44,
              minWidth: 44,
              color: ui.textMuted,
              cursor: "pointer",
              fontSize: font.sm,
            }}
          >
            ✕ Cerrar
          </button>
        </div>

        <div
          className="cc-contrato-modal-tabs"
          style={{
            display: "flex",
            gap: 6,
            padding: "10px 16px 0",
            flexWrap: compact ? "nowrap" : "wrap",
            overflowX: compact ? "auto" : undefined,
            WebkitOverflowScrolling: compact ? "touch" : undefined,
            borderBottom: `1px solid ${ui.border}`,
            flexShrink: 0,
          }}
        >
          {tabs.map((tb) => (
            <button
              key={tb.id}
              type="button"
              onClick={() => setTab(tb.id)}
              style={{
                background: tab === tb.id ? ui.tabActiveBg : "transparent",
                border: `1px solid ${tab === tb.id ? ui.tabBorderActive : ui.tabBorder}`,
                borderRadius: "8px 8px 0 0",
                borderBottom: tab === tb.id ? `1px solid ${ui.bg}` : undefined,
                marginBottom: -1,
                padding: "8px 14px",
                minHeight: 44,
                color: tab === tb.id ? ui.primary : ui.textMuted,
                fontSize: font.caption,
                fontWeight: tab === tb.id ? 700 : 500,
                cursor: "pointer",
                whiteSpace: "nowrap",
                flex: "0 0 auto",
              }}
            >
              {tb.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: compact ? "12px 14px 16px" : "16px 20px 12px", color: ui.text, WebkitOverflowScrolling: "touch" }}>
          {msg && (
            <div
              style={{
                background: msg.type === "error" ? ui.errorBg : ui.successBg,
                color: msg.type === "error" ? ui.errorText : ui.successText,
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: font.body,
                marginBottom: 14,
              }}
            >
              {msg.text}
            </div>
          )}

          {tab === "info" && (
            <div className="cc-contrato-modal-body-grid" style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "1fr 1fr", gap: 16 }}>
              <div>
                <label style={lbl}>NÚMERO DE CONTRATO *</label>
                <input style={{ ...inp, minHeight: 44, fontSize: 16 }} placeholder="Ej: IDU-1551-2017" value={form.numero} onChange={(e) => setForm((f) => ({ ...f, numero: e.target.value }))} />
                <label style={lbl}>OBJETO DEL CONTRATO</label>
                <input style={inp} placeholder="Descripción del objeto contractual" value={form.objeto} onChange={(e) => setForm((f) => ({ ...f, objeto: e.target.value }))} />
                <label style={lbl}>CONTRATISTA *</label>
                <input style={inp} placeholder="Razón social" value={form.contratista} onChange={(e) => setForm((f) => ({ ...f, contratista: e.target.value }))} />
                <label style={lbl}>NIT CONTRATISTA</label>
                <input style={inp} placeholder="Ej: 900.123.456-7" value={form.nit} onChange={(e) => setForm((f) => ({ ...f, nit: e.target.value }))} />
                <label style={lbl}>LOGO CONTRATISTA</label>
                <label style={fileDropStyle}>
                  {form.logo_contratista ? "✅ Logo cargado" : "📂 Cargar logo contratista"}
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleLogo("logo_contratista", e)} />
                </label>
              </div>
              <div>
                <label style={lbl}>INTERVENTORÍA</label>
                <input style={inp} placeholder="Razón social interventoría" value={form.interventoria} onChange={(e) => setForm((f) => ({ ...f, interventoria: e.target.value }))} />
                <label style={lbl}>LOGO INTERVENTORÍA</label>
                <label style={fileDropStyle}>
                  {form.logo_interventoria ? "✅ Logo cargado" : "📂 Cargar logo interventoría"}
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleLogo("logo_interventoria", e)} />
                </label>
                <label style={lbl}>ENTIDAD *</label>
                <select style={inp} value={form.entidad} onChange={(e) => setForm((f) => ({ ...f, entidad: e.target.value, entidad_otra: e.target.value === "OTRA" ? f.entidad_otra : "" }))}>
                  <option value="">Selecciona entidad...</option>
                  {ENTIDADES.map((ent) => (
                    <option key={ent} value={ent}>
                      {ent === "OTRA" ? "OTRA... (Indique cuál)" : ent}
                    </option>
                  ))}
                </select>
                {form.entidad === "OTRA" && (
                  <>
                    <label style={lbl}>¿CUÁL ENTIDAD?</label>
                    <input style={inp} placeholder="Escribe la entidad" value={form.entidad_otra} onChange={(e) => setForm((f) => ({ ...f, entidad_otra: e.target.value }))} />
                  </>
                )}
                <label style={lbl}>LOGO ENTIDAD</label>
                <label style={fileDropStyle}>
                  {form.logo_entidad ? "✅ Logo entidad cargado" : "📂 Cargar logo de entidad"}
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleLogo("logo_entidad", e)} />
                </label>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>CARGAR PLANO (GEOJSON)</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                  <label style={{ ...fileDropStyle, marginBottom: 0 }}>
                    {form.plano_geojson ? (planoArchivoLabel ? `✅ ${planoArchivoLabel}` : "✅ Plano GeoJSON cargado") : "📂 Elegir archivo .geojson / .json"}
                    <input ref={planoFileInputRef} type="file" accept=".geojson,.json,application/geo+json,application/json" style={{ display: "none" }} onChange={handlePlanoGeojson} />
                  </label>
                  {form.plano_geojson && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      <button type="button" onClick={abrirSelectorPlanoGeojson} style={{ background: ui.cardSubtle, border: `1px solid ${ui.tabBorderActive}`, borderRadius: 6, padding: "6px 12px", color: ui.primary, fontSize: font.sm, cursor: "pointer" }}>
                        📎 Reemplazar por otro archivo
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm("¿Quitar el plano del formulario? Si guardas el contrato así, quedará sin plano hasta que subas otro archivo.")) quitarPlanoGeojson();
                        }}
                        style={{ background: "transparent", border: `1px solid ${ui.errorText}88`, borderRadius: 6, padding: "6px 12px", color: ui.errorText, fontSize: font.sm, cursor: "pointer" }}
                      >
                        🗑️ Quitar plano
                      </button>
                    </div>
                  )}
                </div>
                {form.centro_lat != null && form.centro_lng != null && (
                  <div style={{ fontSize: font.caption, color: ui.primary, marginBottom: 12 }}>
                    Punto medio detectado: Lat {form.centro_lat} / Lng {form.centro_lng}
                  </div>
                )}
                {form.plano_geojson && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: font.caption, color: ui.textMuted, letterSpacing: 0.7, marginBottom: 6 }}>PREVISUALIZACIÓN MAPBOX</div>
                    {!import.meta.env.VITE_MAPBOX_TOKEN ? (
                      <div style={{ padding: 16, borderRadius: 8, border: `1px solid ${ui.warnText}55`, background: ui.warnBg, color: ui.warnText, fontSize: font.sm, lineHeight: 1.45 }}>
                        El GeoJSON está cargado, pero falta <code style={{ color: ui.warnText }}>VITE_MAPBOX_TOKEN</code> en el frontend.
                      </div>
                    ) : (
                      <div ref={mapContainerRef} style={{ width: "100%", height: 220, borderRadius: 8, border: `1px solid ${ui.border}`, overflow: "hidden", background: ui.inputBg }} />
                    )}
                  </div>
                )}
              </div>
              {isEdit && perms?.editar && (
                <div style={{ gridColumn: "1 / -1", marginTop: 4, paddingTop: 16, borderTop: `1px solid ${ui.border}` }}>
                  <label style={lbl}>MAESTRO PK-ID (CSV)</label>
                  <div style={{ fontSize: font.caption, color: ui.textMuted, lineHeight: 1.45, marginBottom: 10 }}>
                    Catálogo de PK por contrato (SICOE, Almacén, mapa). Columnas: CAPA, CIV, TRAMO, INFRAESTRUCTURA, COSTADO, UBICACION, ABS_INICIO, ABS_FINAL, CALZADA. CAPA = código PK.
                    {pkIdsCount != null && (
                      <span style={{ display: "block", marginTop: 6, color: ui.primary, fontWeight: 600 }}>
                        PK en maestro actual: {pkIdsCount}
                      </span>
                    )}
                    {pkIdsSicoeRefs?.total > 0 && (
                      <span style={{ display: "block", marginTop: 6, color: ui.warnText, fontWeight: 600 }}>
                        {pkIdsSicoeRefs.total} registro(s) SICOE vinculados al maestro
                        {pkIdsSicoeRefs.reportes != null && pkIdsSicoeRefs.registros != null && (
                          <> ({pkIdsSicoeRefs.reportes} reportes · {pkIdsSicoeRefs.registros} registros)</>
                        )}
                        . Use Sincronizar para actualizar sin borrar.
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    <button
                      type="button"
                      disabled={pkCsvUploading}
                      onClick={abrirSelectorPkCsv}
                      style={{
                        ...fileDropStyle,
                        marginBottom: 0,
                        opacity: pkCsvUploading ? 0.6 : 1,
                        cursor: pkCsvUploading ? "wait" : "pointer",
                      }}
                    >
                      {pkCsvUploading ? "⏳ Procesando CSV…" : "📂 Cargar maestro PK-ID (CSV)"}
                    </button>
                    <button
                      type="button"
                      disabled={pkCsvUploading}
                      onClick={onAbrirPanoramaMaestroPkIds}
                      style={{
                        background: "transparent",
                        border: `1px solid ${ui.border}`,
                        color: ui.primary,
                        borderRadius: 8,
                        padding: "9px 14px",
                        fontSize: font.sm,
                        fontWeight: 700,
                        cursor: pkCsvUploading ? "wait" : "pointer",
                      }}
                    >
                      Ver panorama del maestro
                    </button>
                    <input
                      ref={pkCsvFileInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      style={{ display: "none" }}
                      onChange={handlePkCsvFile}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {pkCsvPending && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 100020,
                background: confirmTheme.overlay,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 16,
              }}
              onClick={onPkCsvCancelPending}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="pk-csv-modo-title"
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: "100%",
                  maxWidth: 440,
                  background: confirmTheme.bgCard,
                  border: `1px solid ${confirmTheme.border}`,
                  borderRadius: 14,
                  boxShadow: confirmTheme.shadow,
                  overflow: "hidden",
                  color: confirmTheme.text,
                }}
              >
                <div
                  style={{
                    padding: "16px 20px 12px",
                    background: `color-mix(in srgb, ${confirmTheme.primary} 14%, ${confirmTheme.bgCard})`,
                    borderBottom: `1px solid ${confirmTheme.border}`,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span style={{ fontSize: "var(--cc-lg)", lineHeight: 1 }} aria-hidden>ℹ️</span>
                  <div id="pk-csv-modo-title" style={{ fontSize: "var(--cc-body)", fontWeight: 800, color: confirmTheme.primary }}>
                    Cargar maestro PK-ID
                  </div>
                </div>
                <div style={{ padding: "16px 20px 6px", fontSize: "var(--cc-sm)", lineHeight: 1.45 }}>
                  <p style={{ margin: "0 0 10px" }}>
                    Archivo: <strong>{pkCsvPending.name}</strong>
                    {pkCsvPending.filasEstimadas != null && (
                      <> · ~{pkCsvPending.filasEstimadas} fila(s) de datos</>
                    )}
                  </p>
                  <p style={{ margin: 0, color: confirmTheme.textMuted }}>
                    ¿Desea agregar PK nuevos, sincronizar datos del CSV con el maestro actual, o reemplazarlo por completo?
                  </p>
                  {pkIdsReemplazoBloqueado && (
                    <p style={{ margin: "10px 0 0", color: confirmTheme.warn, fontWeight: 600, lineHeight: 1.4 }}>
                      Hay {pkIdsSicoeRefs?.total ?? "varios"} registro(s) SICOE vinculados. Reemplazar todo está bloqueado;
                      use Sincronizar para actualizar COSTADO, UBICACION y demás campos sin perder referencias.
                    </p>
                  )}
                  {pkCsvPending.comparacionLoading && (
                    <p style={{ margin: "10px 0 0", color: confirmTheme.textMuted, fontSize: "var(--cc-caption)" }}>
                      Analizando diferencias por columna…
                    </p>
                  )}
                  {pkCsvPending.comparacionError && (
                    <p style={{ margin: "10px 0 0", color: confirmTheme.danger, fontSize: "var(--cc-caption)" }}>
                      {pkCsvPending.comparacionError}
                    </p>
                  )}
                  {pkCsvPending.comparacionResumen && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: "10px 12px",
                        borderRadius: 8,
                        background: `color-mix(in srgb, ${confirmTheme.primary} 8%, ${confirmTheme.bgCard})`,
                        border: `1px solid ${confirmTheme.border}`,
                        fontSize: "var(--cc-caption)",
                        lineHeight: 1.45,
                      }}
                    >
                      <strong>Resumen CSV vs maestro:</strong>{" "}
                      {pkCsvPending.comparacionResumen.nuevos ?? 0} nuevos ·{" "}
                      <span style={{ color: confirmTheme.warn, fontWeight: 700 }}>
                        {pkCsvPending.comparacionResumen.actualizar ?? 0} con cambios en columnas
                      </span>{" "}
                      · {pkCsvPending.comparacionResumen.igual ?? 0} sin cambios ·{" "}
                      {pkCsvPending.comparacionResumen.solo_maestro ?? 0} solo en maestro ·{" "}
                      {pkCsvPending.comparacionResumen.con_sicoe_refs ?? 0}{" "}
                      <span style={{ color: confirmTheme.warn, fontWeight: 600 }}>SICOE</span> ·{" "}
                      {pkCsvPending.comparacionResumen.con_presupuesto_refs ?? 0}{" "}
                      <span style={{ color: confirmTheme.presupuesto, fontWeight: 600 }}>PPTO</span>
                      {(pkCsvPending.comparacionResumen.eliminables ?? 0) > 0 && (
                        <> · {pkCsvPending.comparacionResumen.eliminables} sin uso</>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ padding: "12px 20px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <button
                    type="button"
                    disabled={pkCsvUploading}
                    onClick={onAbrirComparacionPkCsv}
                    style={{
                      background: "transparent",
                      border: `1px solid ${confirmTheme.border}`,
                      color: confirmTheme.text,
                      borderRadius: 8,
                      padding: "9px 14px",
                      fontWeight: 600,
                      cursor: pkCsvUploading ? "wait" : "pointer",
                      fontSize: "var(--cc-sm)",
                    }}
                  >
                    Ver panorama detallado (columnas M / C)
                  </button>
                  <button
                    type="button"
                    disabled={pkCsvUploading}
                    onClick={onPkCsvModoSincronizar}
                    style={{
                      background: confirmTheme.primary,
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      padding: "10px 14px",
                      fontWeight: 700,
                      cursor: pkCsvUploading ? "wait" : "pointer",
                      fontSize: "var(--cc-sm)",
                      opacity: pkCsvUploading ? 0.7 : 1,
                    }}
                  >
                    Sincronizar (actualizar existentes y agregar nuevos)
                  </button>
                  <button
                    type="button"
                    disabled={pkCsvUploading}
                    onClick={onPkCsvModoAgregar}
                    style={{
                      background: "transparent",
                      border: `1px solid ${confirmTheme.primary}`,
                      color: confirmTheme.primary,
                      borderRadius: 8,
                      padding: "10px 14px",
                      fontWeight: 700,
                      cursor: pkCsvUploading ? "wait" : "pointer",
                      fontSize: "var(--cc-sm)",
                      opacity: pkCsvUploading ? 0.7 : 1,
                    }}
                  >
                    Agregar (solo PK nuevos, sin modificar existentes)
                  </button>
                  <button
                    type="button"
                    disabled={pkCsvUploading || pkIdsReemplazoBloqueado}
                    title={
                      pkIdsReemplazoBloqueado
                        ? "Bloqueado: hay registros SICOE vinculados al maestro actual"
                        : undefined
                    }
                    onClick={onPkCsvModoReemplazar}
                    style={{
                      background: "transparent",
                      border: `1px solid ${confirmTheme.danger}`,
                      color: confirmTheme.danger,
                      borderRadius: 8,
                      padding: "10px 14px",
                      fontWeight: 700,
                      cursor: pkCsvUploading || pkIdsReemplazoBloqueado ? "not-allowed" : "pointer",
                      fontSize: "var(--cc-sm)",
                      opacity: pkCsvUploading || pkIdsReemplazoBloqueado ? 0.45 : 1,
                    }}
                  >
                    Reemplazar todo el maestro
                  </button>
                  <button
                    type="button"
                    disabled={pkCsvUploading}
                    onClick={onPkCsvCancelPending}
                    style={{
                      background: "transparent",
                      border: `1px solid ${confirmTheme.border}`,
                      color: confirmTheme.textMuted,
                      borderRadius: 8,
                      padding: "8px 14px",
                      cursor: pkCsvUploading ? "wait" : "pointer",
                      fontSize: "var(--cc-sm)",
                      opacity: pkCsvUploading ? 0.7 : 1,
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}

          {pkCsvReplaceConfirm && pkCsvPending && (
            <CcConfirmModal
              theme={confirmTheme}
              zIndex={100022}
              tipo="danger"
              titulo="Reemplazar maestro PK-ID"
              confirmar="Sí, reemplazar"
              cancelar="Cancelar"
              procesando={pkCsvUploading}
              onConfirm={onPkCsvReplaceConfirm}
              onCancel={onPkCsvReplaceCancel}
            >
              <p style={{ margin: "0 0 10px" }}>
                Reemplazar todo el maestro PK-ID eliminará por completo el catálogo actual de este contrato y lo sustituirá por el archivo seleccionado.
              </p>
              <p style={{ margin: 0, fontWeight: 700, color: confirmTheme.danger }}>
                Esta acción no se puede revertir.
              </p>
            </CcConfirmModal>
          )}

          {pkCsvResult && (
            <CcConfirmModal
              theme={confirmTheme}
              zIndex={100024}
              tipo={pkCsvResult.type === "success" ? "success" : "danger"}
              titulo={pkCsvResult.titulo}
              confirmar="Entendido"
              soloConfirmar
              onCancel={onPkCsvResultClose}
            >
              {pkCsvResult.lineas?.map((linea, i) => (
                <p key={i} style={{ margin: i === 0 ? "0 0 8px" : "0 0 8px" }}>
                  {linea}
                </p>
              ))}
            </CcConfirmModal>
          )}

          <PkIdsCsvPanoramaModal
            open={pkPanoramaOpen}
            onClose={onCerrarPanoramaPkIds}
            theme={{ ...confirmTheme, inputBg: ui.inputBg }}
            titulo={pkPanoramaTitulo}
            subtitulo={pkPanoramaSubtitulo}
            data={pkPanoramaData}
            loading={pkPanoramaLoading}
            error={pkPanoramaError}
            contratoId={editandoContratoId}
            onEliminarSinUso={onEliminarPkIdsSinUso}
            onEliminarPk={onEliminarPkIdMaestro}
            onRefresh={onRecargarPanoramaPkIds}
            eliminando={pkPanoramaEliminando}
          />

          {tab === "financiera" && (
            <div>
              <div className="cc-contrato-modal-body-grid" style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 8 }}>
                <div>
                  <label style={lbl}>AIU (%)</label>
                  <input style={inp} type="number" step="0.0001" min="0" max="1" placeholder="Ej: 0.25 → 25%" value={form.aiu} onChange={(e) => setForm((f) => ({ ...f, aiu: e.target.value }))} />
                  {form.aiu !== "" && !Number.isNaN(parseFloat(form.aiu)) && (
                    <div style={{ fontSize: font.caption, color: ui.primary, marginTop: -8, marginBottom: 8 }}>
                      = {(parseFloat(form.aiu) * 100).toFixed(4).replace(/\.?0+$/, "")}%
                    </div>
                  )}
                </div>
                <div>
                  <label style={lbl}>IVA (%)</label>
                  <input style={inp} type="number" step="0.0001" min="0" max="1" placeholder="Ej: 0.19 → 19%" value={form.iva} onChange={(e) => setForm((f) => ({ ...f, iva: e.target.value }))} />
                  {form.iva !== "" && !Number.isNaN(parseFloat(form.iva)) && (
                    <div style={{ fontSize: font.caption, color: ui.primary, marginTop: -8, marginBottom: 8 }}>
                      = {(parseFloat(form.iva) * 100).toFixed(4).replace(/\.?0+$/, "")}%
                    </div>
                  )}
                </div>
              </div>
              <div style={{ fontSize: font.caption, color: ui.textMuted, letterSpacing: 0.6, margin: "4px 0 8px" }}>VALORES CONTRATUALES (COP$)</div>
              <div className="cc-contrato-modal-body-grid" style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 8 }}>
                <div>
                  <label style={lbl}>VALOR COMPONENTE AMBIENTAL</label>
                  <input style={inp} type="number" step="1" min="0" placeholder="COP" value={form.valor_componente_ambiental} onChange={(e) => setForm((f) => ({ ...f, valor_componente_ambiental: e.target.value }))} />
                  {copHint(form.valor_componente_ambiental)}
                </div>
                <div>
                  <label style={lbl}>VALOR COMPONENTE SOCIAL</label>
                  <input style={inp} type="number" step="1" min="0" placeholder="COP" value={form.valor_componente_social} onChange={(e) => setForm((f) => ({ ...f, valor_componente_social: e.target.value }))} />
                  {copHint(form.valor_componente_social)}
                </div>
                <div>
                  <label style={lbl}>VALOR COMPONENTE PMT</label>
                  <input style={inp} type="number" step="1" min="0" placeholder="COP" value={form.valor_componente_pmt} onChange={(e) => setForm((f) => ({ ...f, valor_componente_pmt: e.target.value }))} />
                  {copHint(form.valor_componente_pmt)}
                </div>
                <div>
                  <label style={lbl}>COSTO DIRECTO DEL CONTRATO</label>
                  <input style={inp} type="number" step="1" min="0" placeholder="COP" value={form.costo_directo_contrato} onChange={(e) => setForm((f) => ({ ...f, costo_directo_contrato: e.target.value }))} />
                  {copHint(form.costo_directo_contrato)}
                </div>
              </div>
              <div style={{ fontSize: font.caption, color: ui.textMuted, letterSpacing: 0.4, margin: "0 0 6px" }}>
                Costos adicionales: concepto, valor mensual (COP$) y plazo en meses. El valor total del renglón es automático.
              </div>
              {(form.costos_adicionales_lista || []).map((row, i) => {
                const vvm = numONull(row.valor_mensual);
                const ttm = numONull(row.tiempo_meses);
                const totalCalc = vvm != null && ttm != null ? Math.round(vvm * ttm) : null;
                return (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.1fr) 0.6fr 0.45fr 0.7fr 36px", gap: 8, alignItems: "end" }}>
                      <div>
                        <label style={lbl}>CONCEPTO *</label>
                        <input
                          style={inp}
                          placeholder="Ej. servicio fijo, supervisión"
                          value={row.concepto_contractual || ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setForm((f) => {
                              const arr = [...(f.costos_adicionales_lista || [])];
                              arr[i] = { ...arr[i], concepto_contractual: v };
                              return { ...f, costos_adicionales_lista: arr };
                            });
                          }}
                        />
                      </div>
                      <div>
                        <label style={lbl}>VALOR MENSUAL (COP)</label>
                        <input
                          style={inp}
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0"
                          value={row.valor_mensual}
                          onChange={(e) => {
                            const v = e.target.value;
                            setForm((f) => {
                              const arr = [...(f.costos_adicionales_lista || [])];
                              arr[i] = { ...arr[i], valor_mensual: v };
                              return { ...f, costos_adicionales_lista: arr };
                            });
                          }}
                        />
                        {copHint(row.valor_mensual)}
                      </div>
                      <div>
                        <label style={lbl}>MESES</label>
                        <input
                          style={inp}
                          type="number"
                          step="0.1"
                          min="0"
                          placeholder="0"
                          value={row.tiempo_meses}
                          onChange={(e) => {
                            const v = e.target.value;
                            setForm((f) => {
                              const arr = [...(f.costos_adicionales_lista || [])];
                              arr[i] = { ...arr[i], tiempo_meses: v };
                              return { ...f, costos_adicionales_lista: arr };
                            });
                          }}
                        />
                      </div>
                      <div>
                        <label style={lbl}>COSTO ADICIONAL (CALC.)</label>
                        <div style={{ ...inp, display: "flex", alignItems: "center", marginBottom: 12, minHeight: 40, color: totalCalc != null ? ui.primary : ui.textMuted }}>
                          {totalCalc != null ? formatCOP(totalCalc) : "—"}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setForm((f) => {
                            const arr = [...(f.costos_adicionales_lista || [])];
                            arr.splice(i, 1);
                            return { ...f, costos_adicionales_lista: arr };
                          });
                        }}
                        style={{ background: `${ui.errorText}22`, border: `1px solid ${ui.errorText}55`, color: ui.errorText, borderRadius: 6, padding: "8px 0", cursor: "pointer", fontSize: font.caption }}
                      >
                        Quitar
                      </button>
                    </div>
                    <div style={{ fontSize: font.caption, color: ui.primary, marginTop: 4, paddingLeft: 2 }}>
                      Valor mensual: {vvm != null ? formatCOP(vvm) : "—"}
                      {totalCalc != null && <> · Total: {formatCOP(totalCalc)}</>}
                    </div>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    costos_adicionales_lista: [...(f.costos_adicionales_lista || []), { concepto_contractual: "", valor_mensual: "", tiempo_meses: "" }],
                  }))
                }
                style={{ background: ui.cardSubtle, border: `1px solid ${ui.tabBorderActive}`, color: ui.primary, borderRadius: 8, padding: "8px 14px", fontSize: font.sm, fontWeight: 600, cursor: "pointer", marginBottom: 8 }}
              >
                + Agregar costo adicional
              </button>
            </div>
          )}

          {tab === "niveles" && isEdit && (
            <div>
              <div style={{ fontSize: font.body, fontWeight: 700, color: ui.primary, marginBottom: 8 }}>Niveles de Validación SICOE</div>
              <div style={{ fontSize: font.caption, color: ui.textMuted, lineHeight: 1.45, marginBottom: 12 }}>
                Selecciona los niveles que estarán activos para este contrato. El registro se sella al aprobar el nivel más alto seleccionado.
              </div>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <label
                  key={n}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    cursor: "pointer",
                    background: ui.inputBg,
                    border: `1.5px solid ${ui.border}`,
                    borderRadius: 8,
                    padding: "10px 12px",
                    marginBottom: 10,
                    color: ui.text,
                    fontSize: font.body,
                    lineHeight: 1.35,
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
                    style={{ width: 16, height: 16, marginTop: 2, accentColor: ui.primary, flexShrink: 0, cursor: "pointer" }}
                  />
                  <span>{nivelesLabels[n]}</span>
                </label>
              ))}
            </div>
          )}

          {tab === "licencia" && isEdit && isDeveloper && (
            <ContratoDocumentosPanel call={call} token={token} contratoId={contratoId} contratoNumero={contratoNumero} embedded uiTheme={ui} />
          )}

          {tab === "ordenes" && isEdit && isDeveloper && (
            <ContratoOrdenesPagoPanel call={call} token={token} contratoId={contratoId} contratoNumero={contratoNumero} embedded uiTheme={ui} />
          )}
        </div>

        {(tab === "info" || tab === "financiera" || tab === "niveles") && (isEdit ? perms?.editar : perms?.crear) && (
          <div
            style={{
              padding: "12px 20px 16px",
              borderTop: `1px solid ${ui.border}`,
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              flexShrink: 0,
            }}
          >
            <button type="button" onClick={onClose} style={{ background: "transparent", border: `1px solid ${ui.border}`, borderRadius: 8, padding: "9px 18px", color: ui.textMuted, fontSize: font.body, cursor: "pointer" }}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={onGuardar}
              disabled={saving}
              style={{
                background: ui.primary,
                border: "none",
                borderRadius: 8,
                padding: "9px 22px",
                color: ui.dark ? "#fff" : "#fff",
                fontWeight: 700,
                cursor: saving ? "wait" : "pointer",
                opacity: saving ? 0.7 : 1,
                fontSize: font.body,
              }}
            >
              {saving ? "Guardando…" : isEdit ? "Actualizar contrato" : "Guardar contrato"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
