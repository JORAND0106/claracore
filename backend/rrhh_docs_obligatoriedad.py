"""
Obligatoriedad del checklist documental RRHH.

Reglas de negocio (sistema de calidad / contratación):
  - Obligatorias siempre: cédula, contrato laboral, docs de ingreso base,
    EPS, ARL, Pensión, Cesantías, y tipos «Otro» (ext_*) del checklist.
  - Opcionales: Hoja de vida, Certificados laborales, Caja de Compensación.
  - Las opcionales no cargadas NUNCA cuentan como faltantes ni restan avance.
  - EPS / ARL / Pensión / Cesantías NUNCA son «No aplica».
"""
from __future__ import annotations

from typing import Any, FrozenSet, Tuple

# (categoria, tipo)
DOC_OPCIONALES: FrozenSet[Tuple[str, str]] = frozenset({
    ("soporte", "hoja_vida"),
    ("soporte", "certificados"),
    ("afiliacion", "cert_caja"),
})

# Afiliaciones que nunca pueden ser «No aplica»
AFILIACION_OBLIGATORIAS: FrozenSet[str] = frozenset({
    "cert_eps",
    "cert_pension",
    "cert_arl",
    "cert_cesantias",
})


def es_doc_opcional(categoria: str, tipo: str) -> bool:
    cat = (categoria or "").strip().lower()
    t = (tipo or "").strip().lower()
    if cat == "contrato_laboral":
        return False
    return (cat, t) in DOC_OPCIONALES


def doc_aplica_checklist(trab: dict | None, categoria: str, tipo: str) -> bool:
    """
    Si el documento forma parte del checklist aplicable al colaborador.

    - Opcionales: siempre «aplican» como ítem del checklist (el estado
      NO APLICA / 🔘 se decide al no estar cargados).
    - Afiliaciones obligatorias: siempre aplican (aunque falte la entidad).
    - Caja: aplica (es opcional).
    - Slot UI «otro»: no aplica.
    """
    del trab  # reservado por si reglas futuras dependen del colaborador
    cat = (categoria or "").strip().lower()
    t = (tipo or "").strip().lower()
    if t == "otro":
        return False
    if cat in ("soporte", "ingreso", "bancario", "contrato_laboral"):
        return True
    if cat == "afiliacion":
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
