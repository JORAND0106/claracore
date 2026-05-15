"""Genera sql/seed_prog_calendario_festivos_co_2017_2030.sql usando holidays.country_holidays('CO')."""
from __future__ import annotations

import holidays

OUT = "sql/seed_prog_calendario_festivos_co_2017_2030.sql"


def main() -> None:
    seen: set = set()
    pairs: list[tuple] = []
    for y in range(2017, 2031):
        h = holidays.country_holidays("CO", years=[y])
        for d, name in h.items():
            if d in seen:
                continue
            seen.add(d)
            nm = str(name).replace("'", "''")
            pairs.append((d, nm))
    pairs.sort(key=lambda x: x[0])

    lines: list[str] = []
    lines.append("-- ClaraCore: festivos Colombia (holidays CO) 2017-2030 → prog_calendario_no_habiles")
    lines.append("-- Misma fuente que POST /prog-obra/mantenimiento/seed-calendario-colombia (paquete `holidays`).")
    lines.append("-- Idempotente: no inserta si ya existe fila global (contrato_id IS NULL) para esa fecha.")
    lines.append("")
    lines.append("INSERT INTO public.prog_calendario_no_habiles (contrato_id, fecha, tipo, descripcion)")
    lines.append("SELECT NULL::bigint, v.fecha::date, 'festivo_nacional', left(v.descripcion, 200)")
    lines.append("FROM (VALUES")
    for i, (d, name) in enumerate(pairs):
        suf = "," if i < len(pairs) - 1 else ""
        lines.append(f"  ('{d.isoformat()}'::date, '{name}'::text){suf}")
    lines.append(") AS v(fecha, descripcion)")
    lines.append("WHERE NOT EXISTS (")
    lines.append("  SELECT 1 FROM public.prog_calendario_no_habiles c")
    lines.append("  WHERE c.contrato_id IS NULL AND c.fecha = v.fecha::date")
    lines.append(");")
    lines.append("")
    lines.append(f"-- Filas en VALUES: {len(pairs)}")

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(OUT, len(pairs))


if __name__ == "__main__":
    main()
