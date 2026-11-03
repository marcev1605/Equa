-- =====================================================================
-- Restaurar un respaldo: REEMPLAZA todos los datos del usuario autenticado por los de un Snapshot,
-- en UNA transacción (si algo falla, no se cambia nada).
--   select public.restore_backup('<snapshot json>'::jsonb);
-- El Snapshot es el objeto `snapshot` del archivo de respaldo de Equa. El respaldo de la app HTML anterior
-- se convierte a Snapshot en la app (src/domain/legacy.ts) y entra por esta misma función.
-- Corre con los permisos del usuario (security invoker): RLS aplica. Todas las filas reciben ids NUEVOS,
-- así que se puede restaurar el mismo respaldo en otra cuenta (o en la misma) sin choques.
-- Los índices de mes del Snapshot son año*12+mes0.
-- =====================================================================
create or replace function public.restore_backup(p jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := auth.uid();
  r record; k text; v jsonb; kd text;
  tx_map jsonb := '{}'; grp_map jsonb := '{}'; tid_map jsonb := '{}'; card_ids jsonb := '{}';
  cid uuid; new_id uuid; gid uuid; trid uuid; catid uuid; ov uuid;
  n_tx int := 0; n_cat int := 0; n_cards int := 0; n_pay int := 0; n_sav int := 0;
  pass int;
begin
  if uid is null then raise exception 'No autenticado'; end if;
  if jsonb_typeof(p) is distinct from 'object'
     or jsonb_typeof(p -> 'tx') is distinct from 'array'
     or jsonb_typeof(p -> 'categories') is distinct from 'object' then
    raise exception 'Respaldo inválido: faltan "tx" o "categories"';
  end if;

  -- ---- vaciar los datos actuales (orden por dependencias; las cascadas limpian skips, cobros y cierres) ----
  delete from transactions where user_id = uid;
  delete from card_payments where user_id = uid;
  delete from savings_movements where user_id = uid;
  delete from credit_cards where user_id = uid;
  delete from categories where user_id = uid;
  update profiles set opening_balance = coalesce((p ->> 'open')::numeric, 0) where id = uid;

  -- ---- categorías (en el orden del respaldo; las eliminadas quedan archivadas) ----
  for r in
    select case kd.k when 'out' then 'expense' when 'in' then 'income' else 'saving' end as kind_,
           btrim(c ->> 'name') as name, coalesce((c ->> 'hidden')::boolean, false) as arch,
           nullif(c ->> 'foreignAmount', '')::numeric as fa, o
      from (values ('out'), ('in'), ('sav')) kd(k)
      cross join lateral jsonb_array_elements(coalesce(p -> 'categories' -> kd.k, '[]')) with ordinality as e(c, o)
  loop
    insert into categories (user_id, kind, name, is_archived, sort_order, foreign_currency, foreign_amount)
    values (uid, r.kind_::category_kind, r.name, r.arch, r.o::int,
            case when r.kind_ = 'saving' and r.fa is not null then 'USD' end, case when r.kind_ = 'saving' then r.fa end);
    n_cat := n_cat + 1;
  end loop;

  -- ---- tarjetas y cierres ----
  for r in select x as name from jsonb_array_elements_text(coalesce(p -> 'cards', '[]')) x loop
    insert into credit_cards (user_id, name, closing_day)
    values (uid, btrim(r.name), nullif(p #>> array['cardInfo', r.name, 'close'], '')::smallint)
    returning id into cid;
    card_ids := card_ids || jsonb_build_object(public.normalize_name(r.name), cid);
    n_cards := n_cards + 1;
    for k, v in select * from jsonb_each(coalesce(p #> array['cardInfo', r.name, 'months'], '{}')) loop
      insert into card_closing_overrides (card_id, user_id, month, closing_day)
      values (cid, uid, make_date(k::int / 12, k::int % 12 + 1, 1), (v #>> '{}')::smallint);
    end loop;
  end loop;

  -- ---- movimientos: ids nuevos; los fijos editados "solo este mes" (of) se cargan después que su serie ----
  for r in select e.t from jsonb_array_elements(p -> 'tx') as e(t) loop
    tx_map := tx_map || jsonb_build_object(r.t ->> 'id', gen_random_uuid());
  end loop;
  for pass in 1..2 loop
    for r in select e.t from jsonb_array_elements(p -> 'tx') as e(t)
              where (coalesce(e.t ->> 'of', 'null') = 'null') = (pass = 1) loop
      new_id := (tx_map ->> (r.t ->> 'id'))::uuid;
      kd := case r.t ->> 'type' when 'in' then 'income' else 'expense' end;
      select id into catid from categories where user_id = uid and kind = kd::category_kind and name_key = public.normalize_name(r.t ->> 'cat');
      if catid is null then raise exception 'Respaldo inconsistente: la categoría "%" no existe', r.t ->> 'cat'; end if;
      gid := null;
      if jsonb_typeof(r.t -> 'rep') = 'object' then
        k := coalesce(r.t ->> 'g', r.t ->> 'id');
        if grp_map ? k then gid := (grp_map ->> k)::uuid; else gid := gen_random_uuid(); grp_map := grp_map || jsonb_build_object(k, gid); end if;
      end if;
      ov := case when pass = 2 then (tx_map ->> (r.t ->> 'of'))::uuid end;
      insert into transactions (id, user_id, type, amount, category_id, note, occurred_on, is_fixed,
                                payment_method, card_id, installments, recurrence_end_month,
                                series_id, series_index, series_total, series_frequency, override_of)
      values (new_id, uid, kd::tx_type, (r.t ->> 'amt')::numeric, catid, coalesce(r.t ->> 'note', ''), (r.t ->> 'date')::date,
              coalesce((r.t ->> 'fixed')::boolean, false),
              case when coalesce((r.t ->> 'card')::boolean, false) and kd = 'expense' then 'card' else 'cash' end::payment_method,
              case when coalesce((r.t ->> 'card')::boolean, false) and kd = 'expense'
                   then (card_ids ->> public.normalize_name(coalesce(nullif(r.t ->> 'cardName', ''), 'Tarjeta')))::uuid end,
              case when coalesce((r.t ->> 'fixed')::boolean, false) then 1 else greatest(1, coalesce((r.t ->> 'inst')::int, 1)) end,
              case when coalesce(r.t ->> 'end', 'null') <> 'null'
                   then make_date((r.t ->> 'end')::int / 12, (r.t ->> 'end')::int % 12 + 1, 1) end,
              gid, (r.t #>> '{rep,k}')::smallint, (r.t #>> '{rep,n}')::smallint,
              case r.t #>> '{rep,f}' when 'w' then 'week' when 'm' then 'month' end::repeat_frequency, ov);
      n_tx := n_tx + 1;
      for k in select x from jsonb_array_elements_text(coalesce(r.t -> 'skip', '[]')) x loop
        insert into transaction_skips (transaction_id, user_id, month)
        values (new_id, uid, make_date(k::int / 12, k::int % 12 + 1, 1)) on conflict do nothing;
      end loop;
    end loop;
  end loop;

  -- ---- pagado / cobrado ("<id>:<mes>": true); los gastos con tarjeta se pagan por resumen, no uno a uno ----
  for k, v in select * from jsonb_each(coalesce(p -> 'paid', '{}')) loop
    continue when v <> 'true'::jsonb or not (tx_map ? split_part(k, ':', 1));
    insert into transaction_settlements (transaction_id, user_id, month)
    select (tx_map ->> split_part(k, ':', 1))::uuid, uid, make_date(split_part(k, ':', 2)::int / 12, split_part(k, ':', 2)::int % 12 + 1, 1)
     where not exists (select 1 from transactions t where t.id = (tx_map ->> split_part(k, ':', 1))::uuid and t.payment_method = 'card')
    on conflict do nothing;
  end loop;

  -- ---- pagos / adelantos de tarjeta (i = mes de vencimiento del resumen) ----
  for r in select e.x from jsonb_array_elements(coalesce(p -> 'pay', '[]')) as e(x) loop
    cid := (card_ids ->> public.normalize_name(r.x ->> 'card'))::uuid;
    if cid is null then raise exception 'Respaldo inconsistente: la tarjeta "%" no existe', r.x ->> 'card'; end if;
    insert into card_payments (user_id, card_id, statement_month, amount, paid_on)
    values (uid, cid, make_date((r.x ->> 'i')::int / 12, (r.x ->> 'i')::int % 12 + 1, 1), (r.x ->> 'amt')::numeric, (r.x ->> 'date')::date);
    n_pay := n_pay + 1;
  end loop;

  -- ---- ahorro: tid => transferencia (2 patas); adj => ajuste de saldo ----
  for r in select e.x from jsonb_array_elements(coalesce(p -> 'sav', '[]')) as e(x) loop
    select id into catid from categories where user_id = uid and kind = 'saving' and name_key = public.normalize_name(r.x ->> 'cat');
    if catid is null then raise exception 'Respaldo inconsistente: la categoría de ahorro "%" no existe', r.x ->> 'cat'; end if;
    trid := null;
    if coalesce(r.x ->> 'tid', 'null') <> 'null' then
      k := r.x ->> 'tid';
      if tid_map ? k then trid := (tid_map ->> k)::uuid; else trid := gen_random_uuid(); tid_map := tid_map || jsonb_build_object(k, trid); end if;
    end if;
    insert into savings_movements (user_id, category_id, amount, occurred_on, note, transfer_id, is_adjustment)
    values (uid, catid, (r.x ->> 'amt')::numeric, (r.x ->> 'date')::date, coalesce(r.x ->> 'note', ''), trid,
            coalesce((r.x ->> 'adj')::boolean, false));
    n_sav := n_sav + 1;
  end loop;

  return jsonb_build_object('transactions', n_tx, 'categories', n_cat, 'cards', n_cards, 'card_payments', n_pay, 'savings_movements', n_sav);
end $$;

grant execute on function public.restore_backup(jsonb) to authenticated;
