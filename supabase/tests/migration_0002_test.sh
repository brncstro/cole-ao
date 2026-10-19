#!/usr/bin/env bash
# Testa a migração 0002 sobre dados "antigos" (criados só com o esquema 0001), num Postgres local.
# Uso: PGHOST=... PGPORT=... PGUSER=... ./supabase/tests/migration_0002_test.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=mig0002
dropdb --if-exists $DB; createdb $DB
export PGDATABASE=$DB
psql -q -v ON_ERROR_STOP=1 -f supabase/tests/local_stub.sql
psql -q -v ON_ERROR_STOP=1 -f supabase/migrations/0001_init.sql

# Dados anteriores à alteração: vendida com portes pagos por mim, outra sem portes, e uma à venda.
psql -q -v ON_ERROR_STOP=1 <<'SQL'
insert into auth.users(id,email) values ('00000000-0000-0000-0000-00000000000a','a@x.pt');
insert into public.cards(user_id,name,purchase_price_cents,purchase_shipping_cents,status,final_price_cents,sale_date,sale_shipping_cents,packaging_cents,fee_actual_cents)
 values ('00000000-0000-0000-0000-00000000000a','Antiga vendida',12000,350,'sold',14500,'2026-02-01',250,50,725);
insert into public.cards(user_id,name,purchase_price_cents,status,final_price_cents,sale_date)
 values ('00000000-0000-0000-0000-00000000000a','Antiga sem portes',500,'sold',900,'2026-02-02');
insert into public.cards(user_id,name,purchase_price_cents,status,expected_price_cents,sale_shipping_cents,fee_percent)
 values ('00000000-0000-0000-0000-00000000000a','Antiga à venda',1000,'for_sale',2000,300,5);
select md5(string_agg(c::text, '|' order by name)) as h from (select id,ref,name,purchase_price_cents,purchase_shipping_cents,status,expected_price_cents,final_price_cents,sale_date,sale_shipping_cents,packaging_cents,fee_percent,fee_fixed_cents,fee_actual_cents from public.cards) c \gset before_
SQL
# hash dos valores antigos antes
BEFORE=$(psql -At -c "select md5(string_agg(c::text, '|' order by name)) from (select id,ref,name,purchase_price_cents,purchase_shipping_cents,status,expected_price_cents,final_price_cents,sale_date,sale_shipping_cents,packaging_cents,fee_percent,fee_fixed_cents,fee_actual_cents from public.cards) c")

psql -q -v ON_ERROR_STOP=1 -f supabase/migrations/0002_buyer_shipping.sql
psql -q -v ON_ERROR_STOP=1 -f supabase/migrations/0002_buyer_shipping.sql   # idempotente
AFTER=$(psql -At -c "select md5(string_agg(c::text, '|' order by name)) from (select id,ref,name,purchase_price_cents,purchase_shipping_cents,status,expected_price_cents,final_price_cents,sale_date,sale_shipping_cents,packaging_cents,fee_percent,fee_fixed_cents,fee_actual_cents from public.cards) c")

ok=1
chk() { if [ "$2" = "$3" ]; then echo "PASS  $1"; else echo "FAIL  $1 (esperado '$3', obtido '$2')"; ok=0; fi; }
chk "colunas antigas inalteradas (hash)"                      "$AFTER" "$BEFORE"
chk "nº de cartas mantido"                                    "$(psql -At -c 'select count(*) from public.cards')" "3"
chk "buyer_shipping_cents = 0 em todos os registos antigos"   "$(psql -At -c 'select count(*) from public.cards where buyer_shipping_cents = 0')" "3"
chk "fee_on_shipping = false em todos os registos antigos"    "$(psql -At -c 'select count(*) from public.cards where not fee_on_shipping')" "3"
chk "custo real do envio preservado (null,250,300)"              "$(psql -At -c "select string_agg(coalesce(sale_shipping_cents::text,'null'), ',' order by name) from public.cards")" "null,250,300"
chk "colunas novas não aceitam NULL"                          "$(psql -At -c "select count(*) from information_schema.columns where table_name='cards' and column_name in ('buyer_shipping_cents','fee_on_shipping') and is_nullable='NO'")" "2"
chk "options.fee_on_shipping existe"                          "$(psql -At -c "select count(*) from information_schema.columns where table_name='options' and column_name='fee_on_shipping'")" "1"
# lucro antigo (fórmula antiga) == lucro novo (fórmula nova com portes cobrados = 0), em SQL
OLD=$(psql -At -c "select string_agg(((coalesce(final_price_cents,expected_price_cents)) - coalesce(fee_actual_cents, round(coalesce(final_price_cents,expected_price_cents)*coalesce(fee_percent,0)/100.0)+coalesce(fee_fixed_cents,0)) - coalesce(sale_shipping_cents,0) - coalesce(packaging_cents,0) - purchase_price_cents - coalesce(purchase_shipping_cents,0))::text, ',' order by name) from public.cards")
NEW=$(psql -At -c "select string_agg(((coalesce(final_price_cents,expected_price_cents) + buyer_shipping_cents) - coalesce(fee_actual_cents, round((coalesce(final_price_cents,expected_price_cents) + case when fee_on_shipping then buyer_shipping_cents else 0 end)*coalesce(fee_percent,0)/100.0)+coalesce(fee_fixed_cents,0)) - coalesce(sale_shipping_cents,0) - coalesce(packaging_cents,0) - purchase_price_cents - coalesce(purchase_shipping_cents,0))::text, ',' order by name) from public.cards")
chk "lucros antigos == lucros com a fórmula nova"             "$NEW" "$OLD"
echo "lucros: $NEW"
dropdb $DB
[ $ok = 1 ] && echo "MIGRAÇÃO OK" || { echo "MIGRAÇÃO COM FALHAS"; exit 1; }
