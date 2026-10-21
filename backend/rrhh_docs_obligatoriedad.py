"""
Obligatoriedad del checklist documental RRHH.

Reglas de negocio (sistema de calidad / contratación):
  - Obligatorias siempre: cédula, contrato laboral, docs de ingreso base,
    EPS, ARL, Pensión, Cesantías, y tipos «Otro» (ext_*) del checklist.
  - Opcionales: Hoja de vida, Certificados laborales, Caja de Compensación.
  - Las opcionales no cargadas NUNCA cuentan como faltantes ni restan avance.
  - EPS / ARL / Pensión / Cesantías NUNCA son «No aplica» (salvo prestación
    de servicios: allí no aplican y se exige planilla de pago).
  - Prestación de servicios: sin certificaciones de afiliación; planilla de
    pago obligatoria (misma categoría de almacenamiento `afiliacion`).
"""
from __future__ import annotations

from typing import Any, FrozenSet, Tuple

# (categoria, tipo)
DOC_OPCIONALES: FrozenSet[Tuple[str, str]] = frozenset({
    ("soporte", "hoja_vida"),
    ("soporte", "certificados"),
    ("afiliacion", "cert_caja"),
})

# Afiliaciones que nunca pueden ser «No aplica» (colaboradores no prestación)
AFILIACION_OBLIGATORIAS: FrozenSet[str] = frozenset({
    "cert_eps",
    "cert_pension",
    "cert_arl",
    "cert_cesantias",
})

AFILIACION_CERT_TIPOS: FrozenSet[str] = frozenset({
    "cert_eps",
    "cert_pension",
    "cert_arl",
    "cert_cesantias",
    "cert_caja",
})

PLANILLA_PAGO_TIPO = "planilla_pago"


def trabajador_es_prestacion_servicios(trab: dict | None) -> bool:
    from rrhh_service import es_prestacion_servicios

    return es_prestacion_servicios((trab or {}).get("tipo_contrato"))


def es_doc_opcional(categoria: str, tipo: str) -> bool:
    cat = (categoria or "").strip().lower()
    t = (tipo or "").strip().lower()
    if cat == "contrato_laboral":
        return False
    if t == PLANILLA_PAGO_TIPO:
        return False
    return (cat, t) in DOC_OPCIONALES


def doc_aplica_checklist(trab: dict | None, categoria: str, tipo: str) -> bool:
    """
    Si el documento forma parte del checklist aplicable al colaborador.

    - Prestación de servicios: certificaciones de afiliación NO aplican;
      planilla de pago SÍ (obligatoria).
    - Otros contratos: afiliaciones aplican; planilla NO aplica.
    - Slot UI «otro»: no aplica.
    """
    cat = (categoria or "").strip().lower()
    t = (tipo or "").strip().lower()
    if t == "otro":
        return False
    prestacion = trabajador_es_prestacion_servicios(trab)
    if cat == "afiliacion":
        if t == PLANILLA_PAGO_TIPO:
            return prestacion
        if t in AFILIACION_CERT_TIPOS or t.startswith("cert_"):
            return not prestacion
        return not prestacion
    if cat in ("soporte", "ingreso", "bancario", "contrato_laboral"):
        return True
    if t.startswith("ext_"):
        return True
    return True


def primer_apellido(apellidos: Any) -> str:
    parts = str(apellidos or "").strip().split()
    return parts[0] if parts else ""


def nombre_corto_colaborador(nombres: Any, apellidos: Any) -> str:
    """Primer nombre + primer apellido (informe de estado documental)."""
    from rrhh_service import primer_nombre_colaborador

    n = primer_nombre_colaborador(nombres)
    a = primer_apellido(apellidos)
    if n == "—" and not a:
        return "—"
    if n == "—":
        return a or "—"
    return f"{n} {a}".strip() if a else n


# Tipos base alineados con rrhh_docs_fill / checklist Documentación (sin bancario).
_TIPOS_SOPORTE_BASE: Tuple[Tuple[str, str], ...] = (
    ("cedula", "Cédula / Documento de identidad"),
    ("hoja_vida", "Hoja de vida"),
    ("certificados", "Certificados"),
)
_TIPOS_INGRESO_BASE: Tuple[Tuple[str, str], ...] = (
    ("induccion", "Constancia de inducción"),
    ("reglamento", "Entrega de reglamentos"),
    ("examen_medico", "Examen médico de ingreso"),
)
_TIPOS_AFILIACION_BASE: Tuple[Tuple[str, str], ...] = (
    ("cert_eps", "Certificación EPS"),
    ("cert_pension", "Certificación Pensión / AFP"),
    ("cert_arl", "Certificación ARL"),
    ("cert_cesantias", "Certificación Cesantías"),
    ("cert_caja", "Certificación Caja de Compensación"),
)
_TIPOS_PLANILLA: Tuple[Tuple[str, str], ...] = (
    (PLANILLA_PAGO_TIPO, "Planilla de pago"),
)


def _label_tipo(cat: str, tipo: str, labels: dict | None = None) -> str:
    if labels and (cat, tipo) in labels:
        return labels[(cat, tipo)]
    for c, pairs in (
        ("soporte", _TIPOS_SOPORTE_BASE),
        ("ingreso", _TIPOS_INGRESO_BASE),
        ("afiliacion", _TIPOS_AFILIACION_BASE),
    ):
        if c == cat:
            for t, lab in pairs:
                if t == tipo:
                    return lab
    if tipo == PLANILLA_PAGO_TIPO:
        return "Planilla de pago"
    if cat == "contrato_laboral":
        return "Contrato laboral"
    return tipo.replace("ext_", "").replace("_", " ").strip().title() or tipo


def docs_obligatorios_esperados(
    trab: dict | None,
    *,
    custom_tipos: list[tuple[str, str, str]] | None = None,
) -> list[dict]:
    """
    Slots documentales obligatorios u opcionales del colaborador
    (misma base que el avance de grilla / TAB Documentación).
    Cada ítem: {categoria, tipo, label, opcional}.
    No incluye bancario (no figura en el TAB Documentación ni en docs_fill).
    """
    out: list[dict] = []
    seen: set[tuple[str, str]] = set()

    def add(cat: str, tipo: str, label: str | None = None) -> None:
        cat_n = (cat or "").strip().lower()
        tipo_n = (tipo or "").strip().lower()
        if not cat_n or not tipo_n or tipo_n == "otro":
            return
        if not doc_aplica_checklist(trab, cat_n, tipo_n):
            return
        key = (cat_n, tipo_n)
        if key in seen:
            return
        seen.add(key)
        out.append({
            "categoria": cat_n,
            "tipo": tipo_n,
            "label": label or _label_tipo(cat_n, tipo_n),
            "opcional": es_doc_opcional(cat_n, tipo_n),
        })

    add("contrato_laboral", "contrato_laboral", "Contrato laboral")
    for tipo, label in _TIPOS_SOPORTE_BASE:
        add("soporte", tipo, label)
    for tipo, label in _TIPOS_INGRESO_BASE:
        add("ingreso", tipo, label)
    if trabajador_es_prestacion_servicios(trab):
        for tipo, label in _TIPOS_PLANILLA:
            add("afiliacion", tipo, label)
    else:
        for tipo, label in _TIPOS_AFILIACION_BASE:
            add("afiliacion", tipo, label)
    for cat, tipo, label in (custom_tipos or []):
        if cat in ("soporte", "ingreso"):
            add(cat, tipo, label)
    return out


def docs_obligatorios_faltantes(
    trab: dict | None,
    vigentes: set[tuple[str, str]] | frozenset,
    *,
    tiene_contrato: bool = False,
    custom_tipos: list[tuple[str, str, str]] | None = None,
) -> list[dict]:
    """
    Documentos obligatorios aplicables sin cargar.
    Opcionales vacíos no aparecen. Contrato laboral usa `tiene_contrato`.
    """
    vig = {
        (str(c or "").strip().lower(), str(t or "").strip().lower())
        for c, t in (vigentes or set())
    }
    if tiene_contrato:
        vig.add(("contrato_laboral", "contrato_laboral"))
    faltan: list[dict] = []
    for slot in docs_obligatorios_esperados(trab, custom_tipos=custom_tipos):
        if slot["opcional"]:
            continue
        key = (slot["categoria"], slot["tipo"])
        if key not in vig:
            faltan.append(slot)
    return faltan


def iniciales_empresa(nombre: Any, *, max_len: int = 12) -> str:
    """
    Iniciales / abreviatura de la empresa contratante.
    Preferencia: iniciales de palabras significativas; si hay pocas,
    cae a abreviar_empresa.
    """
    from rrhh_service import abreviar_empresa

    s = str(nombre or "").strip()
    if not s:
        return "—"
    skip = {
        "de", "del", "la", "las", "los", "y", "e", "o", "u", "el", "en",
        "sa", "sas", "ltda", "s", "a",
    }
    words = []
    for w in s.replace(".", " ").replace(",", " ").split():
        core = "".join(c for c in w if c.isalnum())
        if not core:
            continue
        if core.lower() in skip:
            continue
        words.append(core)
    if len(words) >= 2:
        ini = "".join(w[0].upper() for w in words[:6])
        if 2 <= len(ini) <= max_len:
            return ini
    return abreviar_empresa(s, max_len=max_len)
