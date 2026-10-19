-- Testes de RLS/constraints. Corre depois de local_stub.sql + 0001_init.sql + 0002_buyer_shipping.sql, como superuser.
\set ON_ERROR_STOP off
create temp table results(name text, ok boolean, detail text);
grant all on results to public;

insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000000000a','a@x.pt'), ('00000000-0000-0000-0000-00000000000b','b@x.pt');

create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); end $$;

-- A: bootstrap + criar cartas
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.bootstrap_user();
select public.bootstrap_user(); -- idempotente
insert into results select 'bootstrap idempotente: 8 estados', count(*)=8, count(*)::text from public.options where kind='condition';
insert into results select 'taxas de exemplo marcadas', bool_and(fee_is_example), '' from public.options where kind='platform';

insert into public.cards(name, purchase_price_cents) values ('Charizard', 12000);
insert into public.cards(name, purchase_price_cents) values ('Pikachu', 0);
insert into results select 'refs automáticas C-0001/C-0002', array_agg(ref order by ref) = array['C-0001','C-0002'], array_agg(ref order by ref)::text from public.cards;

-- venda exige preço final e data
do $$ begin
  begin update public.cards set status='sold' where name='Charizard'; insert into results values ('vendida sem preço/data é rejeitada', false, 'aceitou');
  exception when check_violation then insert into results values ('vendida sem preço/data é rejeitada', true, ''); end;
end $$;
update public.cards set status='sold', final_price_cents=14500, sale_date='2026-02-01', fee_actual_cents=0 where name='Charizard';
insert into results select 'vendida com preço/data aceite; taxa efetiva 0 guardada', fee_actual_cents=0 and status='sold', '' from public.cards where name='Charizard';

-- ref imutável
update public.cards set ref='HACK' where name='Pikachu';
insert into results select 'ref imutável', ref='C-0002', ref from public.cards where name='Pikachu';

-- valores negativos rejeitados
do $$ begin
  begin insert into public.cards(name,purchase_price_cents) values ('X',-1); insert into results values ('preço negativo rejeitado', false,'');
  exception when check_violation then insert into results values ('preço negativo rejeitado', true,''); end;
end $$;

-- fotos só na pasta do próprio utilizador
do $$ begin
  begin insert into public.cards(name,purchase_price_cents,front_path) values ('Y',1,'00000000-0000-0000-0000-00000000000b/x.jpg'); insert into results values ('foto fora da própria pasta rejeitada', false,'');
  exception when check_violation then insert into results values ('foto fora da própria pasta rejeitada', true,''); end;
end $$;

-- cliente não pode mexer em next_ref
do $$ begin
  begin update public.profiles set next_ref = 999; insert into results values ('next_ref não editável pelo cliente', false,'');
  exception when insufficient_privilege then insert into results values ('next_ref não editável pelo cliente', true,''); end;
end $$;
update public.profiles set app_name='Cartas do Bruno';

-- rename_option propaga às cartas
update public.cards set condition='Near Mint (NM)' where name='Charizard';
select public.rename_option('condition','Near Mint (NM)','Quase Nova (NM)');
insert into results select 'rename_option propaga às cartas', condition='Quase Nova (NM)', condition from public.cards where name='Charizard';

-- 0002: portes cobrados
insert into results select 'buyer_shipping por defeito 0 e fee_on_shipping false', buyer_shipping_cents=0 and fee_on_shipping=false, '' from public.cards where name='Pikachu';
do $$ begin
  begin update public.cards set buyer_shipping_cents=-1 where name='Pikachu'; insert into results values ('portes cobrados negativos rejeitados', false,'');
  exception when check_violation then insert into results values ('portes cobrados negativos rejeitados', true,''); end;
end $$;
update public.cards set buyer_shipping_cents=150, fee_on_shipping=true where name='Pikachu';
insert into results select 'portes cobrados guardados', buyer_shipping_cents=150 and fee_on_shipping, '' from public.cards where name='Pikachu';
insert into results select 'plataformas: fee_on_shipping false por defeito', bool_and(not fee_on_shipping), '' from public.options where kind='platform';

-- storage A
insert into storage.objects(bucket_id,name) values ('card-photos','00000000-0000-0000-0000-00000000000a/c1/f.jpg');
do $$ begin
  begin insert into storage.objects(bucket_id,name) values ('card-photos','00000000-0000-0000-0000-00000000000b/c1/f.jpg'); insert into results values ('storage: escrita na pasta alheia rejeitada', false,'');
  exception when others then insert into results values ('storage: escrita na pasta alheia rejeitada', true,''); end;
end $$;

-- B: isolamento
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.bootstrap_user();
insert into results select 'B não vê cartas de A', count(*)=0, count(*)::text from public.cards;
insert into results select 'B não vê opções de A (só as suas 23)', count(*)=23, count(*)::text from public.options;
insert into results select 'B não vê perfil de A', (select count(*) from public.profiles)=1, '';
insert into results select 'B não vê storage de A', count(*)=0, count(*)::text from storage.objects;
insert into public.cards(name,purchase_price_cents) values ('Blastoise', 100);
insert into results select 'B começa na C-0001', ref='C-0001', ref from public.cards;
update public.cards set name='roubado' where name='Charizard';
delete from public.cards where name='Charizard';
do $$ begin
  begin insert into public.cards(user_id,name,purchase_price_cents) values ('00000000-0000-0000-0000-00000000000a','Intruso',1); insert into results values ('B não insere em nome de A', false,'');
  exception when others then insert into results values ('B não insere em nome de A', true,''); end;
end $$;

-- A confirma que nada foi alterado
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into results select 'A mantém Charizard intacto', count(*)=1, '' from public.cards where name='Charizard';
insert into results select 'A não vê Blastoise', count(*)=0, '' from public.cards where name='Blastoise';

-- anónimo não vê nada
reset role; set role anon;
do $$ begin
  begin perform count(*) from public.cards; insert into results values ('anon sem acesso', false,'');
  exception when insufficient_privilege then insert into results values ('anon sem acesso', true,''); end;
end $$;
reset role;
select case when ok then 'PASS' else 'FAIL' end as r, name, detail from results order by 1 desc, 2;
