-- Lista rápida de semanas (so_semanas.id) con al menos un registro nivel 3 aprobado por interventoría.
-- Evita recorrer so_registros por páginas desde el backend (muy lento con muchos registros).
-- Ejecutar en Supabase SQL Editor (mismo proyecto que el backend).

create or replace function public.ccd_distinct_semanas_nivel3_aprobado(p_contrato_id bigint)
returns setof bigint
language sql
stable
parallel safe
as $$
  select distinct r.semana_id::bigint
  from so_registros r
  where r.contrato_id = p_contrato_id
    and r.nivel3_estado = 'Aprobado'
    and r.semana_id is not null;
$$;

comment on function public.ccd_distinct_semanas_nivel3_aprobado(bigint) is
  'CCD informes: ids de semana con nivel3 aprobado (distinct); usado por GET /informes/.../ccd/semanas.';

grant execute on function public.ccd_distinct_semanas_nivel3_aprobado(bigint) to authenticated;
grant execute on function public.ccd_distinct_semanas_nivel3_aprobado(bigint) to service_role;
