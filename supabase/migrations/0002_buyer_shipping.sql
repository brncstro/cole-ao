-- 0002 — Portes cobrados ao comprador
-- Não destrutiva e idempotente (pode ser executada mais de uma vez). Não apaga nem altera dados existentes.
--
--  * cards.buyer_shipping_cents  NOVO: portes cobrados ao comprador (começa em 0 nos registos existentes).
--  * cards.sale_shipping_cents   MANTÉM-SE com os mesmos valores. Passa a significar "Custo real do envio":
--                                o que efetivamente se gasta a enviar a carta, independentemente de quem o financia.
--                                (O nome da coluna não muda, para não mexer em dados nem em backups antigos.)
--  * cards.fee_on_shipping       NOVO: cópia, no momento da venda, da regra da plataforma — a taxa percentual
--                                incide também sobre os portes cobrados? (false = só sobre o preço da carta,
--                                que é o comportamento anterior.)
--  * options.fee_on_shipping     NOVO: a mesma regra, configurável por plataforma (false por defeito).
--
-- Os lucros anteriores não mudam: com buyer_shipping_cents = 0 e fee_on_shipping = false,
-- a fórmula nova dá exatamente o mesmo resultado que a antiga.

alter table public.cards
  add column if not exists buyer_shipping_cents integer not null default 0
    check (buyer_shipping_cents >= 0);

alter table public.cards
  add column if not exists fee_on_shipping boolean not null default false;

alter table public.options
  add column if not exists fee_on_shipping boolean not null default false;

comment on column public.cards.sale_shipping_cents is
  'Custo real do envio (cêntimos): valor efetivamente gasto a enviar a carta, pago por quem pagar.';
comment on column public.cards.buyer_shipping_cents is
  'Portes cobrados ao comprador (cêntimos). Total pago pelo comprador = preço final + este valor.';
comment on column public.cards.fee_on_shipping is
  'Cópia da regra da plataforma no momento da venda: a taxa percentual incide também sobre os portes cobrados.';
