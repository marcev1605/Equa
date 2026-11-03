-- =====================================================================
-- Equa · esquema inicial (PostgreSQL 15+ / Supabase)
--
-- Principios:
--  * Cada fila pertenece a un usuario (user_id) y está protegida por RLS.
--  * Las claves foráneas son COMPUESTAS (id, user_id): una fila nunca puede
--    apuntar a datos de otro usuario, ni siquiera con un bug en la app.
--  * Meses = date con día 1 (CHECK). Dinero = numeric(14,2).
--  * Lo derivable NO se guarda (estado de pago de gastos con tarjeta,
--    adelantos, saldos de ahorro, resúmenes): se calcula en el dominio / vistas.
--  * Nada se borra "a la fuerza" si tiene historia: las categorías se archivan.
-- =====================================================================

-- ---------- Tipos ----------
create type public.category_kind    as enum ('income', 'expense', 'saving');
create type public.tx_type          as enum ('income', 'expense');
create type public.payment_method   as enum ('cash', 'card');
create type public.repeat_frequency as enum ('week', 'month');

-- ---------- Utilidades ----------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Clave de comparación de nombres: minúsculas, sin espacios extremos ni tildes
-- (mismo criterio que la app anterior: "Alimentación" == "alimentacion").
create or replace function public.normalize_name(t text) returns text
language sql immutable parallel safe as $$
  select translate(lower(btrim(t)), 'áéíóúüñàèìòùâêîôû', 'aeiouunaeiouaeiou')
$$;

-- ---------- Perfil ----------
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  display_name    text,
  currency        char(3)       not null default 'ARS',
  locale          text          not null default 'es-AR',
  timezone        text          not null default 'America/Argentina/Buenos_Aires',
  opening_balance numeric(14,2) not null default 0,   -- "saldo inicial"
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------- Categorías (gastos / ingresos / ahorro) ----------
create table public.categories (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid          not null references public.profiles (id) on delete cascade,
  kind             public.category_kind not null,
  name             text          not null check (char_length(btrim(name)) between 1 and 60),
  name_key         text generated always as (public.normalize_name(name)) stored,
  is_archived      boolean       not null default false,   -- "eliminada, restaurable"
  sort_order       integer       not null default 0,
  -- Solo ahorro: monto manual en moneda extranjera (ej. US$ que llevo ahorrados)
  foreign_currency char(3),
  foreign_amount   numeric(14,2) check (foreign_amount is null or foreign_amount >= 0),
  created_at       timestamptz   not null default now(),
  updated_at       timestamptz   not null default now(),
  unique (id, user_id),
  unique (user_id, kind, name_key),
  check (foreign_amount is null or kind = 'saving')
);
create trigger trg_categories_updated before update on public.categories
  for each row execute function public.set_updated_at();

-- ---------- Tarjetas de crédito ----------
create table public.credit_cards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  name_key    text generated always as (public.normalize_name(name)) stored,
  closing_day smallint check (closing_day between 1 and 31),   -- cierre "habitual"
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name_key)
);
create trigger trg_cards_updated before update on public.credit_cards
  for each row execute function public.set_updated_at();

-- Cierre propio de un mes puntual (pisa al habitual)
create table public.card_closing_overrides (
  card_id     uuid not null,
  user_id     uuid not null,
  month       date not null check (month = date_trunc('month', month)::date),
  closing_day smallint not null check (closing_day between 1 and 31),
  primary key (card_id, month),
  foreign key (card_id, user_id) references public.credit_cards (id, user_id) on delete cascade
);

-- ---------- Movimientos ----------
create table public.transactions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles (id) on delete cascade,
  type                 public.tx_type not null,
  amount               numeric(14,2) not null check (amount > 0),   -- total (en cuotas: total de la compra)
  category_id          uuid not null,
  note                 text not null default '',
  occurred_on          date not null,
  is_fixed             boolean not null default false,              -- se repite todos los meses
  payment_method       public.payment_method not null default 'cash',
  card_id              uuid,
  installments         smallint not null default 1 check (installments between 1 and 60),
  recurrence_end_month date check (recurrence_end_month is null or recurrence_end_month = date_trunc('month', recurrence_end_month)::date),
  -- Repeticiones "cada semana / cada mes N veces" (cada una es su propia fila)
  series_id            uuid,
  series_index         smallint,
  series_total         smallint,
  series_frequency     public.repeat_frequency,
  -- Fijo editado "solo este mes": el mes queda salteado en la serie (transaction_skips) y este movimiento
  -- puntual apunta a su serie. Así sigue ofreciendo editar/borrar "solo este mes" o "este mes y los siguientes".
  override_of          uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete restrict,
  foreign key (card_id, user_id)     references public.credit_cards (id, user_id) on delete cascade,
  foreign key (override_of, user_id) references public.transactions (id, user_id) on delete cascade,
  check ((payment_method = 'card') = (card_id is not null)),
  check (payment_method = 'cash' or type = 'expense'),
  check (not is_fixed or installments = 1),
  check ((series_id is null) = (series_index is null)
     and (series_id is null) = (series_total is null)
     and (series_id is null) = (series_frequency is null)),
  check (series_id is null or not is_fixed),
  check (override_of is null or (not is_fixed and series_id is null and override_of <> id))
);
create index idx_tx_user_date on public.transactions (user_id, occurred_on);
create index idx_tx_card      on public.transactions (user_id, card_id) where card_id is not null;
create index idx_tx_series    on public.transactions (series_id) where series_id is not null;
create index idx_tx_override  on public.transactions (override_of) where override_of is not null;
create trigger trg_tx_updated before update on public.transactions
  for each row execute function public.set_updated_at();

-- Meses salteados de un movimiento fijo ("borrar solo este mes")
create table public.transaction_skips (
  transaction_id uuid not null,
  user_id        uuid not null,
  month          date not null check (month = date_trunc('month', month)::date),
  primary key (transaction_id, month),
  foreign key (transaction_id, user_id) references public.transactions (id, user_id) on delete cascade
);

-- Estado "pagado / cobrado" por mes (solo gastos que NO son de tarjeta e ingresos)
create table public.transaction_settlements (
  transaction_id uuid not null,
  user_id        uuid not null,
  month          date not null check (month = date_trunc('month', month)::date),
  settled_at     timestamptz not null default now(),
  primary key (transaction_id, month),
  foreign key (transaction_id, user_id) references public.transactions (id, user_id) on delete cascade
);

-- ---------- Pagos y adelantos de resúmenes de tarjeta ----------
-- statement_month = mes en el que VENCE el resumen. Si paid_on cae en un mes
-- anterior, es un adelanto (se deriva, no se guarda).
create table public.card_payments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  card_id         uuid not null,
  statement_month date not null check (statement_month = date_trunc('month', statement_month)::date),
  amount          numeric(14,2) not null check (amount > 0),
  paid_on         date not null,
  created_at      timestamptz not null default now(),
  foreign key (card_id, user_id) references public.credit_cards (id, user_id) on delete cascade
);
create index idx_card_payments on public.card_payments (user_id, card_id, statement_month);

-- ---------- Ahorro ----------
-- amount > 0 = depósito (sale de la cuenta disponible), < 0 = retiro.
-- Una transferencia entre categorías = 2 filas con el mismo transfer_id (suman 0)
-- y NO afecta la cuenta disponible.
-- is_adjustment = ajuste de saldo (amount > 0 ganancia, < 0 pérdida): cambia el valor de la
-- categoría (p. ej. una inversión) pero NO mueve la cuenta disponible. No puede ser parte de una transferencia.
create table public.savings_movements (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  category_id  uuid not null,
  amount       numeric(14,2) not null check (amount <> 0),
  occurred_on  date not null,
  note         text not null default '',
  transfer_id  uuid,
  is_adjustment boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete restrict,
  check (not is_adjustment or transfer_id is null)
);
create index idx_sav_user_cat  on public.savings_movements (user_id, category_id);
create index idx_sav_user_date on public.savings_movements (user_id, occurred_on);
create index idx_sav_transfer  on public.savings_movements (transfer_id) where transfer_id is not null;
create trigger trg_sav_updated before update on public.savings_movements
  for each row execute function public.set_updated_at();

-- =====================================================================
-- Reglas de negocio que un CHECK no puede expresar
-- =====================================================================

-- La categoría de un movimiento debe ser del mismo tipo (ingreso/gasto)
create or replace function public.trg_tx_category_kind() returns trigger
language plpgsql as $$
declare k public.category_kind;
begin
  select kind into k from public.categories where id = new.category_id;
  if k is distinct from (case new.type when 'income' then 'income' else 'expense' end)::public.category_kind then
    raise exception 'La categoría no corresponde al tipo de movimiento' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger trg_tx_category_kind before insert or update of category_id, type on public.transactions
  for each row execute function public.trg_tx_category_kind();

-- Un mes editado ("override_of") solo puede apuntar a un movimiento fijo
create or replace function public.trg_tx_override_target() returns trigger
language plpgsql as $$
begin
  if new.override_of is not null
     and not exists (select 1 from public.transactions where id = new.override_of and user_id = new.user_id and is_fixed) then
    raise exception 'override_of debe apuntar a un movimiento fijo' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger trg_tx_override_target before insert or update of override_of on public.transactions
  for each row execute function public.trg_tx_override_target();

-- "Pagado" de un gasto con tarjeta se deriva del resumen: no se marca a mano
create or replace function public.trg_settlement_not_card() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from public.transactions t
             where t.id = new.transaction_id and t.payment_method = 'card' and t.type = 'expense') then
    raise exception 'El estado de un gasto con tarjeta se deriva del pago del resumen' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger trg_settlement_not_card before insert on public.transaction_settlements
  for each row execute function public.trg_settlement_not_card();

-- Ahorro: solo categorías de tipo 'saving'
create or replace function public.trg_sav_category_kind() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from public.categories where id = new.category_id and kind = 'saving') then
    raise exception 'La categoría no es de ahorro' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger trg_sav_category_kind before insert or update of category_id on public.savings_movements
  for each row execute function public.trg_sav_category_kind();

-- Ahorro: el saldo de una categoría nunca queda negativo (se valida al COMMIT,
-- así una transferencia de 2 filas o una edición compuesta pueden pasar por
-- estados intermedios) y cada transferencia suma cero con exactamente 2 patas.
create or replace function public.trg_sav_integrity() returns trigger
language plpgsql as $$
declare cat uuid; tr uuid; bal numeric; n int; s numeric;
begin
  for cat in select distinct c from (values (case when tg_op <> 'INSERT' then old.category_id end),
                                            (case when tg_op <> 'DELETE' then new.category_id end)) v(c) where c is not null loop
    select coalesce(sum(amount), 0) into bal from public.savings_movements where category_id = cat;
    if bal < 0 then
      raise exception 'El saldo de la categoría de ahorro no puede quedar negativo (%)', bal using errcode = '23514';
    end if;
  end loop;
  for tr in select distinct t from (values (case when tg_op <> 'INSERT' then old.transfer_id end),
                                           (case when tg_op <> 'DELETE' then new.transfer_id end)) v(t) where t is not null loop
    select count(*), coalesce(sum(amount), 0) into n, s from public.savings_movements where transfer_id = tr;
    if n <> 0 and (n <> 2 or s <> 0) then
      raise exception 'Una transferencia debe tener 2 movimientos que sumen cero' using errcode = '23514';
    end if;
  end loop;
  return null;
end $$;
create constraint trigger trg_sav_integrity after insert or update or delete on public.savings_movements
  deferrable initially deferred for each row execute function public.trg_sav_integrity();

-- Una categoría de ahorro solo se archiva con saldo cero
create or replace function public.trg_cat_archive_saving() returns trigger
language plpgsql as $$
declare bal numeric;
begin
  if new.kind = 'saving' and new.is_archived and not old.is_archived then
    select coalesce(sum(amount), 0) into bal from public.savings_movements where category_id = new.id;
    if bal <> 0 then
      raise exception 'Solo se puede eliminar una categoría de ahorro con saldo cero (saldo: %)', bal using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger trg_cat_archive_saving before update of is_archived on public.categories
  for each row execute function public.trg_cat_archive_saving();

-- =====================================================================
-- Vistas de apoyo (security_invoker => respetan RLS del usuario que consulta)
-- =====================================================================
create view public.v_savings_balances with (security_invoker = true) as
select c.id as category_id, c.user_id, c.name, c.is_archived, c.foreign_currency, c.foreign_amount,
       coalesce(sum(m.amount), 0)::numeric(14,2) as balance,                                          -- valor actual
       coalesce(sum(m.amount) filter (where not m.is_adjustment), 0)::numeric(14,2) as contributed,   -- aportado neto
       coalesce(sum(m.amount) filter (where m.is_adjustment), 0)::numeric(14,2) as gain               -- ganancia (+) / pérdida (−) acumulada
from public.categories c
left join public.savings_movements m on m.category_id = c.id
where c.kind = 'saving'
group by c.id;

-- =====================================================================
-- Alta de usuario: perfil + categorías iniciales
-- =====================================================================
create or replace function public.seed_default_categories(uid uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.categories (user_id, kind, name, sort_order)
  select uid, k::public.category_kind, n, o
  from (values
    ('expense','Comida',1),('expense','Transporte',2),('expense','Casa',3),('expense','Salud',4),
    ('expense','Ocio',5),('expense','Compras',6),('expense','Otros',7),
    ('income','Sueldo',1),('income','Ventas',2),('income','Bono',3),('income','Inversiones',4),
    ('income','Electricidad',5),('income','Extra',6),('income','Otros',7),
    ('saving','USD',1),('saving','Inversiones',2),('saving','Acciones',3),('saving','Bonos',4),('saving','Otro',5)
  ) d(k, n, o)
  on conflict do nothing;
  update public.categories set foreign_currency = 'USD', foreign_amount = coalesce(foreign_amount, 0)
   where user_id = uid and kind = 'saving' and name_key = 'usd';
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict do nothing;
  perform public.seed_default_categories(new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- Row Level Security: cada usuario solo ve y modifica lo suyo
-- =====================================================================
alter table public.profiles                enable row level security;
alter table public.categories              enable row level security;
alter table public.credit_cards            enable row level security;
alter table public.card_closing_overrides  enable row level security;
alter table public.transactions            enable row level security;
alter table public.transaction_skips       enable row level security;
alter table public.transaction_settlements enable row level security;
alter table public.card_payments           enable row level security;
alter table public.savings_movements       enable row level security;

create policy profiles_own on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['categories','credit_cards','card_closing_overrides','transactions',
                           'transaction_skips','transaction_settlements','card_payments','savings_movements'] loop
    execute format($f$create policy %I on public.%I for all to authenticated
                      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$f$, t || '_own', t);
  end loop;
end $$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.v_savings_balances to authenticated;
revoke all on function public.seed_default_categories(uuid) from public, authenticated;
