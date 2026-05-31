-- Lista rápida de semanas (so_semanas.id) con al menos un registro aprobado en el
-- NIVEL MÁXIMO configurado del contrato (contrato_niveles_validacion.niveles_activos).
-- Generaliza ccd_distinct_semanas_nivel3_aprobado para soportar el multinivel:
-- el "sello de interventoría" ya no es siempre nivel 3, depende del contrato.
-- Ejecutar en Supabase SQL Editor (mismo proyecto que el backend).

create or replace function public.ccd_distinct_semanas_nivel_max_aprobado(p_contrato_id bigint)
returns setof bigint
language plpgsql
stable
parallel safe
as $$
declare
  v_max int;
  v_col text;
begin
  -- Nivel máximo activo del contrato (sin fila → 3, igual que el backend).
  select coalesce((select max(n) from unnest(c.niveles_activos) as n), 3)
    into v_max
  from contrato_niveles_validacion c
  where c.contrato_id = p_contrato_id
  limit 1;

  if v_max is null then
    v_max := 3;
  end if;
  v_max := least(6, greatest(1, v_max));
  v_col := 'nivel' || v_max || '_estado';

  return query execute format(
    'select distinct r.semana_id::bigint
       from so_registros r
      where r.contrato_id = $1
        and r.semana_id is not null
        and r.%I = ''Aprobado''',
    v_col
  ) using p_contrato_id;
end;
$$;

comment on function public.ccd_distinct_semanas_nivel_max_aprobado(bigint) is
  'CCD informes: ids de semana con el nivel máximo del contrato aprobado (distinct, multinivel); usado por GET /informes/.../ccd/semanas.';

grant execute on function public.ccd_distinct_semanas_nivel_max_aprobado(bigint) to authenticated;
grant execute on function public.ccd_distinct_semanas_nivel_max_aprobado(bigint) to service_role;
