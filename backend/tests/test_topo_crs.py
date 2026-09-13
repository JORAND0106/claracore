"""EPSG:3116 (MAGNA-SIRGAS Bogotá) → WGS84."""
from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from topo_crs import bbox_lonlat, gk_bogota_to_wgs84  # noqa: E402


class TestEpsg3116(unittest.TestCase):
    def test_origen_nacional(self):
        lon, lat = gk_bogota_to_wgs84(1000000.0, 1000000.0)
        self.assertAlmostEqual(lat, 4.596200416666666, places=6)
        self.assertAlmostEqual(lon, -74.0775079166667, places=6)

    def test_bbox_padding(self):
        pts = [(-74.1, 4.6), (-74.05, 4.65)]
        b = bbox_lonlat(pts, pad_frac=0.1)
        self.assertIsNotNone(b)
        west, south, east, north = b
        self.assertLess(west, -74.1)
        self.assertGreater(east, -74.05)
        self.assertLess(south, 4.6)
        self.assertGreater(north, 4.65)
        self.assertTrue(math.isfinite(west + east + south + north))


if __name__ == "__main__":
    unittest.main()
