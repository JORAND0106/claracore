-- Totales FO-EO-04 «actas anteriores»: suma cantidad_total por ítem+capítulo en el servidor.
-- Evita paginar decenas de miles de so_registros desde Python (timeout en Azure → PDF con 0).
-- Misma regla que backend/informes.py: actas RPO con numero_rpo < actual, nivel máximo Aprobado,
-- registros con acta_rpo_id directo o vía so_reportes.acta_rpo_id.

create or replace function public.fo_eo_04_totales_actas_anteriores_batch(
  p_contrato_id bigint,
  p_acta_id bigint
)
returns table(
  item_numero text,
  capitulo text,
  total numeric
)
language plpgsql
stable
parallel safe
as $$
declare
  v_max int;
  v_col text;
  v_nr_cur bigint;
  v_consec_cur bigint;
  v_nr_cur_ok boolean := false;
begin
  select coalesce((select max(n) from unnest(c.niveles_activos) as n), 3)
    into v_max
  from public.contrato_niveles_validacion c
  where c.contrato_id = p_contrato_id
  limit 1;

  if v_max is null then
    v_max := 3;
  end if;
  v_max := least(6, greatest(1, v_max));
  v_col := 'nivel' || v_max || '_estado';

  select a.numero_rpo::bigint, a.consecutivo::bigint
    into v_nr_cur, v_consec_cur
  from public.actas a
  where a.id = p_acta_id
    and a.contrato_id = p_contrato_id;

  v_nr_cur_ok := v_nr_cur is not null;

  return query execute format(
    $q$
    with cur as (
      select $2::bigint as acta_id, $3::bigint as nr_cur, $4::bigint as consec_cur, $5::boolean as nr_ok
    ),
    prev as (
      select distinct a.id
      from public.actas a
      cross join cur
      where a.contrato_id = $1
        and upper(trim(coalesce(a.tipo_grupo, ''))) = 'RPO'
        and (
          (cur.nr_ok and a.numero_rpo is not null and a.numero_rpo::bigint < cur.nr_cur)
          or (
            not cur.nr_ok
            and cur.consec_cur is not null
            and a.consecutivo is not null
            and a.consecutivo::bigint < cur.consec_cur
          )
          or (
            cur.nr_ok
            and a.numero_rpo is null
            and cur.consec_cur is not null
            and a.consecutivo is not null
            and a.consecutivo::bigint < cur.consec_cur
          )
        )
    ),
    prev_fb as (
      select p.id from prev p
      union
      select a.id
      from public.actas a
      cross join cur
      where not exists (select 1 from prev)
        and a.contrato_id = $1
        and upper(trim(coalesce(a.tipo_grupo, ''))) = 'RPO'
        and cur.consec_cur is not null
        and a.consecutivo is not null
        and a.consecutivo::bigint < cur.consec_cur
      union
      select a.id
      from public.actas a
      cross join cur
      where not exists (select 1 from prev)
        and not exists (
          select 1 from public.actas x
          cross join cur c2
          where x.contrato_id = $1
            and upper(trim(coalesce(x.tipo_grupo, ''))) = 'RPO'
            and c2.consec_cur is not null
            and x.consecutivo is not null
            and x.consecutivo::bigint < c2.consec_cur
        )
        and a.contrato_id = $1
        and upper(trim(coalesce(a.tipo_grupo, ''))) = 'RPO'
        and a.id < cur.acta_id
    ),
    prev_ids as (
      select id from prev
      union
      select id from prev_fb where not exists (select 1 from prev)
    ),
    regs as (
      select
        rtrim(btrim(r.item_numero), '.') as it,
        btrim(coalesce(r.capitulo, '')) as cap,
        coalesce(r.cantidad_total, 0)::numeric as ct
      from public.so_registros r
      left join public.so_reportes rep
        on rep.id = r.reporte_id and rep.contrato_id = r.contrato_id
      where r.contrato_id = $1
        and btrim(coalesce(r.item_numero, '')) <> ''
        and r.%I = 'Aprobado'
        and (
          r.acta_rpo_id in (select id from prev_ids)
          or (
            r.acta_rpo_id is null
            and rep.acta_rpo_id in (select id from prev_ids)
          )
        )
    )
    select it as item_numero, cap as capitulo, sum(ct) as total
    from regs
    group by it, cap
    $q$,
    v_col
  )
  using p_contrato_id, p_acta_id, v_nr_cur, v_consec_cur, v_nr_cur_ok;
end;
$$;

comment on function public.fo_eo_04_totales_actas_anteriores_batch(bigint, bigint) is
  'FO-EO-04: totales cantidad_total por ítem+capítulo en actas RPO anteriores (nivel máximo aprobado).';

grant execute on function public.fo_eo_04_totales_actas_anteriores_batch(bigint, bigint) to authenticated;
grant execute on function public.fo_eo_04_totales_actas_anteriores_batch(bigint, bigint) to service_role;
