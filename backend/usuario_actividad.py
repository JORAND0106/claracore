"""
Verificación de actividad relevante de un usuario antes de eliminación física.

Las tablas «limpiables» (preferencias, sesiones, asignaciones) no bloquean;
se borran en cascada lógica antes del DELETE de `usuarios`.
Las «bloqueantes» impiden la eliminación para preservar trazabilidad.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

# (modulo, tabla, columna, etiqueta_humana)
# Consultas tolerantes: si la tabla/columna no existe, se ignora.
CHECKS_BLOQUEANTES: List[Tuple[str, str, str, str]] = [
    # SICOE Obra
    ("SICOE", "so_reportes", "creado_por", "reportes creados"),
    ("SICOE", "so_reportes", "modificado_por", "reportes editados"),
    ("SICOE", "so_reportes", "inspector_id", "reportes como inspector"),
    ("SICOE", "so_registros", "creado_por_reg", "registros de obra creados"),
    ("SICOE", "so_registros", "modificado_por_reg", "registros de obra editados"),
    ("SICOE", "so_registros", "inspector_id", "registros como inspector"),
    ("SICOE", "so_registros", "nivel1_usuario_id", "validaciones nivel 1"),
    ("SICOE", "so_registros", "nivel2_usuario_id", "validaciones nivel 2"),
    ("SICOE", "so_registros", "nivel3_usuario_id", "validaciones nivel 3"),
    ("SICOE", "so_registros", "nivel4_usuario_id", "validaciones nivel 4"),
    ("SICOE", "so_registros", "nivel5_usuario_id", "validaciones nivel 5"),
    ("SICOE", "so_registros", "nivel6_usuario_id", "validaciones nivel 6"),
    ("SICOE", "so_registros", "reversion_arm_n2_usuario_id", "reversiones N2"),
    ("SICOE", "so_registros", "reversion_arm_n3_usuario_id", "reversiones N3"),
    ("SICOE", "so_registros", "sub_usuario_id", "validaciones subcontratista"),
    ("SICOE", "so_registro_comentarios", "autor_id", "comentarios en registros"),
    # Actas RPO
    ("Actas RPO", "actas", "asignado_a", "actas RPO asignadas"),
    # Seguimiento
    ("Seguimiento", "seguimiento_acta", "elaborador_id", "actas de seguimiento elaboradas"),
    ("Seguimiento", "seguimiento_acta_asistente", "usuario_id", "asistencia en actas"),
    ("Seguimiento", "seguimiento_item", "asignado_a_id", "compromisos/tareas asignadas"),
    ("Seguimiento", "seguimiento_item", "created_by", "compromisos/tareas creadas"),
    ("Seguimiento", "seguimiento_item", "solicitante_id", "compromisos como solicitante"),
    # Programación de obra
    ("Prog. obra", "prog_versiones", "creado_por", "versiones de programación creadas"),
    ("Prog. obra", "prog_versiones", "sellado_por", "versiones de programación selladas"),
    ("Prog. obra", "prog_actividades", "creado_por", "actividades de programación"),
    # Presupuesto (versiones / agrupadores — IDs; validado_por en vivo es texto)
    ("Presupuesto", "presupuesto_versiones", "creada_por", "versiones de presupuesto creadas"),
    ("Presupuesto", "presupuesto_versiones", "enviado_por", "versiones de presupuesto enviadas"),
    ("Presupuesto", "listado_precios_agrupadores", "creado_por", "agrupadores de listado de precios"),
    # Almacén
    ("Almacén", "almacen_salida", "receptor_usuario_id", "salidas de almacén como receptor"),
    ("Almacén", "almacen_solicitud", "created_by", "solicitudes de almacén"),
    ("Almacén", "almacen_entrada", "created_by", "entradas de almacén"),
    # Contabilidad / documentos
    ("Contabilidad", "contabilidad_comprobante", "created_by", "comprobantes contables"),
    ("Documentos", "documento_contractual", "created_by", "documentos contractuales"),
    # SST / ensayos
    ("SST", "sst_inspeccion", "usuario_id", "inspecciones SST"),
    ("Ensayos", "ensayo_resultado", "revisor_id", "ensayos revisados"),
]

# Preferencias / vínculos sin trazabilidad de negocio: se borran antes del DELETE.
# Incluye `logs`: casi todos los usuarios tienen LOGIN/políticas y la FK bloquearía el DELETE.
CLEANUP_BEFORE_DELETE: List[Tuple[str, str]] = [
    ("usuario_contratos", "usuario_id"),
    ("password_reset_requests", "usuario_id"),
    ("push_subscriptions", "usuario_id"),
    ("cad_sessions", "usuario_id"),
    ("usuario_filtros_plantillas", "usuario_id"),
    ("usuario_export_plantillas", "usuario_id"),
    ("informe_periodico_copia", "usuario_id"),
    ("usuario_correo_envio", "usuario_id"),
    ("inicio_novedades_lecturas", "usuario_id"),
    ("notificaciones", "destinatario_id"),
    ("logs", "usuario_id"),
]

# Acciones de log que NO cuentan como actividad relevante de negocio.
_LOG_ACCIONES_IGNORAR = frozenset(
    {
        "LOGIN",
        "LOGOUT",
        "REFRESH",
        "TOKEN",
        "VER",
        "CONSULTAR",
        "LISTAR",
        "EXPORTAR",
        "DESCARGAR",
        # Cuenta / perfil / auth (no son trabajo en obra ni módulos de negocio)
        "ACEPTAR",
        "ACEPTAR_POLITICAS",
        "POLITICAS",
        "PERFIL",
        "ACTUALIZAR_PERFIL",
        "CAMBIAR_PASSWORD",
        "CAMBIAR_CONTRASENA",
        "SOLICITAR",
        "SOLICITAR_RESET",
        "BIENVENIDA",
        "NOTIFICACION",
        "PUSH",
    }
)

# Acciones de auditoría que sí indican trabajo/uso sustantivo.
_LOG_ACCIONES_BLOQUEANTES = frozenset(
    {
        "CREAR",
        "EDITAR",
        "ACTUALIZAR",
        "GUARDAR",
        "ELIMINAR",
        "BORRAR",
        "VALIDAR",
        "APROBAR",
        "RECHAZAR",
        "AUTORIZAR",
        "SELLAR",
        "REABRIR",
        "ASIGNAR",
        "CERRAR",
        "ENVIAR",
        "SUBIR",
        "IMPORTAR",
        "MIGRAR",
    }
)


def _fila_existe(sb, tabla: str, columna: str, usuario_id: int) -> bool:
    """Consulta tolerante: selecciona la columna filtrada (no exige PK llamada id)."""
    try:
        res = sb.table(tabla).select(columna).eq(columna, usuario_id).limit(1).execute()
        return bool(res.data)
    except Exception:
        return False


def _logs_actividad_relevante(sb, usuario_id: int) -> Optional[Dict[str, Any]]:
    """True si hay logs de creación/edición/validación (no solo LOGIN/perfil)."""
    try:
        res = (
            sb.table("logs")
            .select("id, accion, modulo")
            .eq("usuario_id", usuario_id)
            .order("id", desc=True)
            .limit(80)
            .execute()
        )
        rows = res.data or []
        for r in rows:
            acc = str(r.get("accion") or "").strip().upper()
            if not acc or acc in _LOG_ACCIONES_IGNORAR:
                continue
            # Prefijos / coincidencia exacta de acciones de negocio
            if acc in _LOG_ACCIONES_BLOQUEANTES or any(
                acc.startswith(p) for p in ("CREAR", "EDITAR", "ELIMINAR", "VALIDAR", "APROBAR", "AUTORIZAR")
            ):
                return {
                    "modulo": "Auditoría",
                    "tabla": "logs",
                    "campo": "usuario_id",
                    "etiqueta": f"acciones registradas ({acc})",
                    "count": 1,
                }
            # Otras acciones desconocidas en módulos de negocio sí bloquean
            mod = str(r.get("modulo") or "").strip().upper()
            if mod and mod not in ("AUTH", "USUARIOS", "SISTEMA", "PERFIL", "SESION", "SESSION"):
                return {
                    "modulo": "Auditoría",
                    "tabla": "logs",
                    "campo": "usuario_id",
                    "etiqueta": f"acciones registradas ({acc})",
                    "count": 1,
                }
    except Exception:
        return None
    return None


def evaluar_actividad_usuario(sb, usuario_id: int) -> Dict[str, Any]:
    """
    Retorna:
      puede_eliminar: bool
      bloqueantes: [{modulo, tabla, campo, etiqueta, count}]
      motivo: str (mensaje corto para tooltip)
    """
    uid = int(usuario_id)
    bloqueantes: List[Dict[str, Any]] = []
    for modulo, tabla, col, etiqueta in CHECKS_BLOQUEANTES:
        if _fila_existe(sb, tabla, col, uid):
            bloqueantes.append(
                {
                    "modulo": modulo,
                    "tabla": tabla,
                    "campo": col,
                    "etiqueta": etiqueta,
                    "count": 1,
                }
            )
    log_hit = _logs_actividad_relevante(sb, uid)
    if log_hit:
        bloqueantes.append(log_hit)

    puede = len(bloqueantes) == 0
    if puede:
        motivo = "Sin actividad relevante: se puede eliminar de forma definitiva."
    else:
        # Mensaje breve: primeros 2 motivos
        partes = []
        for b in bloqueantes[:2]:
            partes.append(f"{b['modulo']}: {b['etiqueta']}")
        extra = len(bloqueantes) - 2
        motivo = "No se puede eliminar: " + "; ".join(partes)
        if extra > 0:
            motivo += f" (+{extra} más)"
    return {
        "usuario_id": uid,
        "puede_eliminar": puede,
        "bloqueantes": bloqueantes,
        "motivo": motivo,
    }


def limpiar_vinculos_no_bloqueantes(sb, usuario_id: int) -> List[str]:
    """Borra filas de preferencias/sesiones; ignora tablas inexistentes."""
    uid = int(usuario_id)
    limpiadas: List[str] = []
    for tabla, col in CLEANUP_BEFORE_DELETE:
        try:
            sb.table(tabla).delete().eq(col, uid).execute()
            limpiadas.append(tabla)
        except Exception:
            pass
    # Remitente en notificaciones: anular o borrar para no romper FK
    try:
        sb.table("notificaciones").delete().eq("remitente_id", uid).execute()
        if "notificaciones" not in limpiadas:
            limpiadas.append("notificaciones")
    except Exception:
        pass
    return limpiadas


def mensaje_bloqueo_corto(actividad: Dict[str, Any]) -> str:
    return str(actividad.get("motivo") or "El usuario tiene actividad asociada y no puede eliminarse.")
