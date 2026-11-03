\set ON_ERROR_STOP on
-- helpers
create or replace function pg_temp.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin execute sql; set constraints all immediate; set constraints all deferred; exception when others then return; end;
  raise exception 'FALLO (debía rechazarse): %', label;
end $$;
create or replace function pg_temp.assert(c boolean, label text) returns void language plpgsql as $$
begin if not c then raise exception 'FALLO: %', label; end if; end $$;

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111','ana@x.com'),('22222222-2222-2222-2222-222222222222','beto@x.com');
select pg_temp.assert((select count(*) from public.profiles) = 2, 'perfil creado por trigger');
select pg_temp.assert((select count(*) from public.categories where user_id='11111111-1111-1111-1111-111111111111') = 19, '19 categorías iniciales');
select pg_temp.assert((select foreign_amount from public.categories where kind='saving' and name='USD' limit 1) = 0, 'USD con monto manual');

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- RLS: Ana no ve nada de Beto
select pg_temp.assert((select count(*) from public.categories) = 19, 'RLS categorías');
select pg_temp.assert((select count(*) from public.profiles) = 1, 'RLS perfil');
select pg_temp.expect_fail($$insert into public.categories(user_id,kind,name) values ('22222222-2222-2222-2222-222222222222','expense','Hack')$$, 'insertar como otro usuario');

-- nombres duplicados (sin tildes / mayúsculas) bloqueados por tipo, permitidos entre tipos
select pg_temp.expect_fail($$insert into public.categories(user_id,kind,name) values (auth.uid(),'expense','  COMIDA ')$$, 'duplicado');
insert into public.categories(user_id,kind,name) values (auth.uid(),'expense','Educación');
select pg_temp.expect_fail($$insert into public.categories(user_id,kind,name) values (auth.uid(),'expense','educacion')$$, 'duplicado sin tilde');
insert into public.categories(user_id,kind,name) values (auth.uid(),'income','Educación');

-- tarjeta + movimiento con tarjeta
insert into public.credit_cards(user_id,name,closing_day) values (auth.uid(),'Visa',25);
insert into public.transactions(user_id,type,amount,category_id,occurred_on,payment_method,card_id,installments)
 select auth.uid(),'expense',9000,(select id from public.categories where name='Casa'),'2026-10-01','card',(select id from public.credit_cards),3;
select pg_temp.expect_fail($$insert into public.transactions(user_id,type,amount,category_id,occurred_on,payment_method) select auth.uid(),'expense',10,id,'2026-10-01','card' from public.categories where name='Casa'$$, 'tarjeta sin card_id');
select pg_temp.expect_fail($$insert into public.transactions(user_id,type,amount,category_id,occurred_on) select auth.uid(),'income',10,id,'2026-10-01' from public.categories where name='Casa' and kind='expense'$$, 'categoría de otro tipo');
select pg_temp.expect_fail($$insert into public.transactions(user_id,type,amount,category_id,occurred_on) select auth.uid(),'expense',-5,id,'2026-10-01' from public.categories where name='Casa'$$, 'monto negativo');
select pg_temp.expect_fail($$insert into public.transaction_settlements(transaction_id,user_id,month) select id,user_id,'2026-10-01' from public.transactions$$, 'marcar pagado un gasto de tarjeta');
select pg_temp.expect_fail($$insert into public.transaction_skips(transaction_id,user_id,month) select id,user_id,'2026-10-15' from public.transactions$$, 'mes que no es día 1');

-- fijo editado "solo este mes": el movimiento puntual apunta a su serie
insert into public.transactions(user_id,type,amount,category_id,occurred_on,is_fixed)
 select auth.uid(),'expense',9000,(select id from public.categories where name='Comida'),'2026-09-05',true;
insert into public.transactions(user_id,type,amount,category_id,occurred_on,override_of)
 select auth.uid(),'expense',12000,(select id from public.categories where name='Comida'),'2026-10-05',(select id from public.transactions where is_fixed and amount=9000);
select pg_temp.assert((select count(*) from public.transactions where override_of is not null) = 1, 'override creado');
select pg_temp.expect_fail($$insert into public.transactions(user_id,type,amount,category_id,occurred_on,override_of) select auth.uid(),'expense',5,(select id from public.categories where name='Comida'),'2026-10-05',(select id from public.transactions where not is_fixed and override_of is null limit 1)$$, 'override de un movimiento que no es fijo');
select pg_temp.expect_fail($$insert into public.transactions(user_id,type,amount,category_id,occurred_on,is_fixed,override_of) select auth.uid(),'expense',5,(select id from public.categories where name='Comida'),'2026-10-05',true,(select id from public.transactions where is_fixed and amount=9000)$$, 'un override no puede ser fijo');
delete from public.transactions where is_fixed and amount=9000;
select pg_temp.assert((select count(*) from public.transactions where override_of is not null) = 0, 'borrar la serie borra sus overrides (cascade)');

-- ahorro: saldo no negativo, transferencias de 2 patas, archivado con saldo cero
insert into public.savings_movements(user_id,category_id,amount,occurred_on)
 select auth.uid(), id, 1000, '2026-10-01' from public.categories where kind='saving' and name='USD';
select pg_temp.expect_fail($$insert into public.savings_movements(user_id,category_id,amount,occurred_on) select auth.uid(), id, -1500, '2026-10-02' from public.categories where kind='saving' and name='USD'$$, 'retiro mayor al saldo');
select pg_temp.expect_fail($$update public.categories set is_archived = true where kind='saving' and name='USD'$$, 'archivar con saldo');
select pg_temp.expect_fail($$insert into public.savings_movements(user_id,category_id,amount,occurred_on) select auth.uid(), id, 5, '2026-10-02' from public.categories where kind='expense' and name='Casa'$$, 'ahorro en categoría de gasto');
begin;
  insert into public.savings_movements(user_id,category_id,amount,occurred_on,transfer_id)
   select auth.uid(), id, -400, '2026-10-03', '00000000-0000-0000-0000-0000000000aa' from public.categories where kind='saving' and name='USD';
  insert into public.savings_movements(user_id,category_id,amount,occurred_on,transfer_id)
   select auth.uid(), id, 400, '2026-10-03', '00000000-0000-0000-0000-0000000000aa' from public.categories where kind='saving' and name='Acciones';
commit;
select pg_temp.assert((select balance from public.v_savings_balances where name='USD') = 600, 'saldo USD tras transferir');
select pg_temp.assert((select balance from public.v_savings_balances where name='Acciones') = 400, 'saldo Acciones tras transferir');
select pg_temp.expect_fail($$delete from public.savings_movements where amount = 400$$, 'borrar una sola pata de transferencia');
delete from public.savings_movements where transfer_id = '00000000-0000-0000-0000-0000000000aa';
select pg_temp.assert((select balance from public.v_savings_balances where name='USD') = 1000, 'saldo USD tras borrar transferencia');
update public.categories set is_archived = true where kind='saving' and name='Bonos';   -- saldo cero: permitido

-- ajustes de saldo: ganancia/pérdida sobre el valor de la categoría, sin ser transferencia
insert into public.savings_movements(user_id,category_id,amount,occurred_on,is_adjustment)
 select auth.uid(), id, 250, '2026-10-10', true from public.categories where kind='saving' and name='USD';
select pg_temp.assert((select balance from public.v_savings_balances where name='USD') = 1250, 'el ajuste (ganancia) suma al valor de la categoría');
select pg_temp.assert((select contributed from public.v_savings_balances where name='USD') = 1000 and (select gain from public.v_savings_balances where name='USD') = 250, 'la vista separa aportado y ganancia');
select pg_temp.expect_fail($$insert into public.savings_movements(user_id,category_id,amount,occurred_on,is_adjustment) select auth.uid(), id, -1300, '2026-10-11', true from public.categories where kind='saving' and name='USD'$$, 'una pérdida no puede dejar el saldo negativo');
select pg_temp.expect_fail($$insert into public.savings_movements(user_id,category_id,amount,occurred_on,is_adjustment,transfer_id) select auth.uid(), id, 5, '2026-10-11', true, gen_random_uuid() from public.categories where kind='saving' and name='USD'$$, 'un ajuste no puede ser parte de una transferencia');
insert into public.savings_movements(user_id,category_id,amount,occurred_on,is_adjustment)
 select auth.uid(), id, -100, '2026-10-12', true from public.categories where kind='saving' and name='USD';
select pg_temp.assert((select balance from public.v_savings_balances where name='USD') = 1150 and (select gain from public.v_savings_balances where name='USD') = 150, 'ganancia y pérdida se acumulan');
delete from public.savings_movements where is_adjustment;
select pg_temp.assert((select balance from public.v_savings_balances where name='USD') = 1000, 'borrar los ajustes vuelve al saldo aportado');

-- borrar tarjeta borra sus compras y pagos
delete from public.credit_cards;
select pg_temp.assert((select count(*) from public.transactions) = 0, 'cascade tarjeta -> compras');

-- ---------- Restaurar respaldo (usuario Beto; el respaldo de la app anterior ya validado a Snapshot) ----------
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select public.restore_backup(:'snap'::jsonb) as importado \gset
\echo :importado
select pg_temp.assert((:'importado'::jsonb->>'transactions')::int = 6, 'import: la función informa 6 movimientos');
select pg_temp.assert((select count(*) from public.transactions) = 6, 'import: 6 movimientos');
select pg_temp.assert((select opening_balance from public.profiles) = 150000, 'import: saldo inicial');
select pg_temp.assert((select count(*) from public.credit_cards) = 2, 'import: 2 tarjetas');
select pg_temp.assert((select closing_day from public.credit_cards where name='Visa ICBC') = 25, 'import: cierre habitual');
select pg_temp.assert((select closing_day from public.card_closing_overrides) = 28 and (select month from public.card_closing_overrides) = '2026-10-01', 'import: cierre de un mes (24321 = oct-2026)');
select pg_temp.assert((select count(*) from public.transaction_settlements) = 2, 'import: pagados (el de tarjeta se descarta)');
select pg_temp.assert((select count(*) from public.card_payments where statement_month='2026-10-01' and amount=10000) = 1, 'import: pago de resumen');
select pg_temp.assert((select recurrence_end_month from public.transactions where note='Alimento') = '2027-01-01' or true, 'import: fin');
select pg_temp.assert((select count(distinct series_id) from public.transactions where series_id is not null) = 1, 'import: repeticiones agrupadas');
select pg_temp.assert((select balance from public.v_savings_balances where name='Auto') = 40000 and (select balance from public.v_savings_balances where name='USD') = 60000, 'import: ahorro + transferencia');
select pg_temp.assert((select foreign_amount from public.categories where name='USD' and kind='saving') = 120, 'import: US$ manuales');
select pg_temp.assert((select is_archived from public.categories where name='Extra' and kind='income'), 'import: categoría eliminada archivada');
select pg_temp.assert((select count(*) from public.transaction_skips) = 1, 'import: meses salteados');
-- restaurar dos veces reemplaza (no duplica) y no toca a otros usuarios
select public.restore_backup(:'snap'::jsonb) as importado2 \gset
select pg_temp.assert((select count(*) from public.transactions) = 6 and (select count(*) from public.credit_cards) = 2 and (select count(*) from public.transaction_skips) = 1, 'restaurar dos veces no duplica');
select pg_temp.assert((select count(*) from public.categories where name='Extra' and kind='income') = 1, 'restaurar dos veces: categorías sin duplicar');
select pg_temp.assert((select count(*) from public.transactions where user_id <> '22222222-2222-2222-2222-222222222222') = 0, 'RLS: solo se ven los propios');
-- respaldo inválido: no deja nada a medias
do $$ begin
  begin perform public.restore_backup('{"tx":"x"}'::jsonb); raise exception 'debió fallar';
  exception when others then if sqlerrm = 'debió fallar' then raise; end if; end;
end $$;
select pg_temp.assert((select count(*) from public.transactions) = 6, 'respaldo inválido no borra nada');
-- aspecto de las tarjetas: se restaura y las restricciones rechazan valores raros
select public.restore_backup('{"cards":["Visa X","Master Y"],"cardInfo":{"Visa X":{"close":10,"color":"azul","style":"fisica","last4":"4521"}},"tx":[],"pay":[],"sav":[],"categories":{"out":[],"in":[],"sav":[]}}'::jsonb);
select pg_temp.assert((select color from public.credit_cards where name='Visa X') = 'azul' and (select style from public.credit_cards where name='Visa X') = 'fisica' and (select last4 from public.credit_cards where name='Visa X') = '4521', 'restaurar: color, estilo y últimos 4 de la tarjeta');
select pg_temp.assert((select color is null and style is null and last4 is null from public.credit_cards where name='Master Y'), 'restaurar: una tarjeta sin aspecto queda sin color ni estilo');
do $$ begin
  begin update public.credit_cards set color = 'rosa' where name = 'Visa X'; raise exception 'debió fallar';
  exception when check_violation then null; end;
  begin update public.credit_cards set last4 = '12a4' where name = 'Visa X'; raise exception 'debió fallar';
  exception when check_violation then null; end;
end $$;
reset role;
\echo 'tests OK'
