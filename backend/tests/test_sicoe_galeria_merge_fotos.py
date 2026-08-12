"""Galería SICOE: merge so_foto_hashes + so_registros para fotos recién subidas."""
import main as m


def test_merge_incluye_hash_antes_de_estar_en_registro():
    regs = [{"url": "https://cdn/a.jpg", "numero": 1, "descripcion": "vieja"}]
    hashes = [{"url": "https://cdn/nueva.jpg", "numero": 2, "descripcion": ""}]
    out = m._galeria_merge_fotos_unicas(regs, hashes)
    assert [x["url"] for x in out] == ["https://cdn/nueva.jpg", "https://cdn/a.jpg"]


def test_merge_dedupe_por_url_y_numero():
    regs = [
        {"url": "https://cdn/a.jpg", "numero": 10, "descripcion": "desde registro"},
        {"url": "https://cdn/b.jpg", "numero": 11, "descripcion": ""},
    ]
    hashes = [
        {"url": "https://cdn/a.jpg", "numero": 10, "descripcion": ""},  # misma url
        {"url": "https://cdn/otra-firma.jpg", "numero": 11, "descripcion": ""},  # mismo numero que b
    ]
    out = m._galeria_merge_fotos_unicas(regs, hashes)
    urls = [x["url"] for x in out]
    assert urls.count("https://cdn/a.jpg") == 1
    # Hash gana el número 11; el registro b.jpg se omite por numero ya visto
    assert "https://cdn/otra-firma.jpg" in urls
    assert "https://cdn/b.jpg" not in urls
    assert len(out) == 2


def test_merge_hash_solo_sin_registros():
    out = m._galeria_merge_fotos_unicas([], [{"url": "https://cdn/solo.jpg", "numero": 3}])
    assert len(out) == 1
    assert out[0]["numero"] == 3
