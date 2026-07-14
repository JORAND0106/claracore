"""Zona horaria Colombia — módulo Almacén de Obra."""
from almacen_datetime import fmt_fecha_hora_bogota, normalize_fecha_hora_bogota_to_utc_iso, parse_timestamp
from zoneinfo import ZoneInfo


def test_fmt_fecha_hora_bogota_utc_a_colombia():
    assert fmt_fecha_hora_bogota("2026-07-12T14:35:00+00:00") == "12/07/2026 09:35"


def test_normalize_naive_como_bogota():
    iso = normalize_fecha_hora_bogota_to_utc_iso("2026-07-13T09:00")
    dt = parse_timestamp(iso)
    assert dt is not None
    assert dt.astimezone(ZoneInfo("America/Bogota")).strftime("%H:%M") == "09:00"
