-- RPC: Calculo completo de poligonal por metodo Bowditch
CREATE OR REPLACE FUNCTION topo_calcular_poligonal(p_poligonal_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_estaciones RECORD;
  v_longitud_total DOUBLE PRECISION := 0;
  v_suma_dn DOUBLE PRECISION := 0;
  v_suma_de DOUBLE PRECISION := 0;
  v_error_dn DOUBLE PRECISION;
  v_error_de DOUBLE PRECISION;
  v_error_lineal DOUBLE PRECISION;
  v_precision DOUBLE PRECISION;
  v_pol RECORD;
  v_norte_inicial DOUBLE PRECISION;
  v_este_inicial DOUBLE PRECISION;
  v_norte_final DOUBLE PRECISION;
  v_este_final DOUBLE PRECISION;
BEGIN
  SELECT p.*, pi.norte AS ni, pi.este AS ei, pf.norte AS nf, pf.este AS ef
  INTO v_pol
  FROM topo_poligonales p
  LEFT JOIN topo_puntos pi ON p.punto_inicial_id = pi.id
  LEFT JOIN topo_puntos pf ON p.punto_final_id = pf.id
  WHERE p.id = p_poligonal_id;

  IF v_pol IS NULL THEN
    RETURN jsonb_build_object('error', 'Poligonal no encontrada');
  END IF;

  FOR v_estaciones IN
    SELECT * FROM topo_poligonal_estaciones
    WHERE poligonal_id = p_poligonal_id ORDER BY orden
  LOOP
    v_longitud_total := v_longitud_total + COALESCE(v_estaciones.distancia, 0);
    v_suma_dn := v_suma_dn + (COALESCE(v_estaciones.distancia, 0) * cos(radians(COALESCE(v_estaciones.angulo_medido, 0))));
    v_suma_de := v_suma_de + (COALESCE(v_estaciones.distancia, 0) * sin(radians(COALESCE(v_estaciones.angulo_medido, 0))));
  END LOOP;

  IF v_pol.tipo = 'cerrada' THEN
    v_error_dn := v_suma_dn;
    v_error_de := v_suma_de;
  ELSE
    v_error_dn := v_suma_dn - (COALESCE(v_pol.nf, 0) - COALESCE(v_pol.ni, 0));
    v_error_de := v_suma_de - (COALESCE(v_pol.ef, 0) - COALESCE(v_pol.ei, 0));
  END IF;

  v_error_lineal := sqrt(v_error_dn^2 + v_error_de^2);
  IF v_error_lineal > 0 THEN
    v_precision := v_longitud_total / v_error_lineal;
  ELSE
    v_precision := 999999;
  END IF;

  IF v_longitud_total > 0 THEN
    DECLARE
      v_norte_acum DOUBLE PRECISION := COALESCE(v_pol.ni, 0);
      v_este_acum DOUBLE PRECISION := COALESCE(v_pol.ei, 0);
      v_dn DOUBLE PRECISION;
      v_de DOUBLE PRECISION;
      v_corr_n DOUBLE PRECISION;
      v_corr_e DOUBLE PRECISION;
    BEGIN
      FOR v_estaciones IN
        SELECT * FROM topo_poligonal_estaciones
        WHERE poligonal_id = p_poligonal_id ORDER BY orden
      LOOP
        v_dn := COALESCE(v_estaciones.distancia, 0) * cos(radians(COALESCE(v_estaciones.angulo_medido, 0)));
        v_de := COALESCE(v_estaciones.distancia, 0) * sin(radians(COALESCE(v_estaciones.angulo_medido, 0)));
        v_corr_n := -(v_error_dn * COALESCE(v_estaciones.distancia, 0) / v_longitud_total);
        v_corr_e := -(v_error_de * COALESCE(v_estaciones.distancia, 0) / v_longitud_total);
        v_norte_acum := v_norte_acum + v_dn + v_corr_n;
        v_este_acum  := v_este_acum  + v_de + v_corr_e;

        UPDATE topo_poligonal_estaciones SET
          delta_norte      = v_dn,
          delta_este       = v_de,
          correccion_norte = v_corr_n,
          correccion_este  = v_corr_e,
          norte_ajustado   = v_norte_acum,
          este_ajustado    = v_este_acum
        WHERE id = v_estaciones.id;
      END LOOP;
    END;
  END IF;

  UPDATE topo_poligonales SET
    error_cierre_dn    = v_error_dn,
    error_cierre_de    = v_error_de,
    error_lineal       = v_error_lineal,
    precision_relativa = v_precision
  WHERE id = p_poligonal_id;

  RETURN jsonb_build_object(
    'error_dn',         round(v_error_dn::numeric, 4),
    'error_de',         round(v_error_de::numeric, 4),
    'error_lineal',     round(v_error_lineal::numeric, 4),
    'precision',        round(v_precision::numeric, 0),
    'longitud_total',   round(v_longitud_total::numeric, 3),
    'admisible',        v_precision >= COALESCE(v_pol.tolerancia_relativa, 3000)
  );
END;
$$ LANGUAGE plpgsql;


-- RPC: Calculo completo de nivelacion diferencial
CREATE OR REPLACE FUNCTION topo_calcular_nivelacion(p_nivelacion_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_niv RECORD;
  v_lect RECORD;
  v_bm_inicial_cota DOUBLE PRECISION;
  v_bm_final_cota DOUBLE PRECISION;
  v_hi DOUBLE PRECISION;
  v_cota_actual DOUBLE PRECISION;
  v_dist_total DOUBLE PRECISION := 0;
  v_cota_final_calc DOUBLE PRECISION;
  v_error_cierre DOUBLE PRECISION;
  v_tolerancia DOUBLE PRECISION;
BEGIN
  SELECT * INTO v_niv FROM topo_nivelaciones WHERE id = p_nivelacion_id;

  IF v_niv IS NULL THEN
    RETURN jsonb_build_object('error', 'Nivelacion no encontrada');
  END IF;

  SELECT cota INTO v_bm_inicial_cota FROM topo_puntos WHERE id = v_niv.bm_inicial_id;
  SELECT cota INTO v_bm_final_cota   FROM topo_puntos WHERE id = v_niv.bm_final_id;

  v_cota_actual := COALESCE(v_bm_inicial_cota, 0);
  v_hi := v_cota_actual;

  FOR v_lect IN
    SELECT * FROM topo_nivelacion_lecturas
    WHERE nivelacion_id = p_nivelacion_id ORDER BY orden
  LOOP
    IF v_lect.lectura_atras IS NOT NULL THEN
      v_hi := v_cota_actual + v_lect.lectura_atras;
    END IF;

    IF v_lect.lectura_adelante IS NOT NULL THEN
      v_cota_actual := v_hi - v_lect.lectura_adelante;
    END IF;

    v_dist_total := v_dist_total +
      COALESCE(v_lect.distancia_atras, 0) +
      COALESCE(v_lect.distancia_adelante, 0);

    UPDATE topo_nivelacion_lecturas SET
      altura_instrumento = v_hi,
      cota_calculada     = v_cota_actual
    WHERE id = v_lect.id;
  END LOOP;

  v_cota_final_calc := v_cota_actual;
  v_error_cierre    := v_cota_final_calc - COALESCE(v_bm_final_cota, 0);
  v_dist_total      := v_dist_total / 1000.0;
  v_tolerancia      := COALESCE(v_niv.tolerancia_mm_km, 12) * sqrt(GREATEST(v_dist_total, 0.001)) / 1000.0;

  DECLARE
    v_n INTEGER := (SELECT COUNT(*) FROM topo_nivelacion_lecturas WHERE nivelacion_id = p_nivelacion_id);
    v_i INTEGER := 0;
  BEGIN
    FOR v_lect IN
      SELECT * FROM topo_nivelacion_lecturas
      WHERE nivelacion_id = p_nivelacion_id ORDER BY orden
    LOOP
      v_i := v_i + 1;
      DECLARE
        v_corr DOUBLE PRECISION := -(v_error_cierre * v_i::float / GREATEST(v_n, 1)::float);
      BEGIN
        UPDATE topo_nivelacion_lecturas SET
          correccion   = v_corr,
          cota_ajustada = cota_calculada + v_corr
        WHERE id = v_lect.id;
      END;
    END LOOP;
  END;

  UPDATE topo_nivelaciones SET
    error_cierre         = v_error_cierre,
    tolerancia_calculada = v_tolerancia,
    distancia_total_km   = v_dist_total
  WHERE id = p_nivelacion_id;

  RETURN jsonb_build_object(
    'error_cierre',      round(v_error_cierre::numeric, 4),
    'tolerancia',        round(v_tolerancia::numeric, 4),
    'distancia_km',      round(v_dist_total::numeric, 3),
    'admisible',         abs(v_error_cierre) <= v_tolerancia
  );
END;
$$ LANGUAGE plpgsql;
