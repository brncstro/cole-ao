-- A Minha Coleção — esquema inicial
-- Aplicar no Supabase (SQL Editor ou `supabase db push`).
-- Valores monetários em cêntimos inteiros. Isolamento por utilizador via RLS.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- perfil
create table public.profiles (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  app_name  text not null default 'A Minha Coleção' check (char_length(app_name) between 1 and 60),
  next_ref  integer not null default 1,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- opções (definições)
-- As cartas guardam o texto da opção (não uma FK): apagar ou renomear uma opção
-- nunca destrói o histórico das cartas.
create table public.options (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind      text not null check (kind in ('set','category','condition','source','platform')),
  label     text not null check (char_length(btrim(label)) between 1 and 80),
  fee_percent     numeric(5,2) check (fee_percent is null or (fee_percent >= 0 and fee_percent <= 100)),
  fee_fixed_cents integer check (fee_fixed_cents is null or fee_fixed_cents >= 0),
  fee_is_example  boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, kind, label)
);

-- ---------------------------------------------------------------- cartas
create table public.cards (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ref       text not null,
  name      text not null check (char_length(btrim(name)) between 1 and 200),
  set_name  text check (char_length(set_name) <= 120),
  card_number text check (char_length(card_number) <= 40),
  category  text check (char_length(category) <= 80),
  language  text check (char_length(language) <= 40),
  condition text check (char_length(condition) <= 80),
  grading_company text check (char_length(grading_company) <= 40),
  grading_grade   text check (char_length(grading_grade) <= 20),
  notes     text check (char_length(notes) <= 4000),
  front_path text,
  back_path  text,

  purchase_source text check (char_length(purchase_source) <= 80),
  purchase_date   date,
  purchase_price_cents    integer not null check (purchase_price_cents >= 0),
  purchase_shipping_cents integer check (purchase_shipping_cents >= 0),

  status text not null default 'collection' check (status in ('collection','for_sale','sold')),
  sale_platform text check (char_length(sale_platform) <= 80),
  expected_price_cents integer check (expected_price_cents >= 0),
  final_price_cents    integer check (final_price_cents >= 0),
  sale_date            date,
  sale_shipping_cents  integer check (sale_shipping_cents >= 0),
  packaging_cents      integer check (packaging_cents >= 0),
  -- Taxas aplicadas a ESTA carta (cópia no momento da venda; não mudam quando as definições mudam)
  fee_percent     numeric(5,2) check (fee_percent is null or (fee_percent >= 0 and fee_percent <= 100)),
  fee_fixed_cents integer check (fee_fixed_cents >= 0),
  fee_actual_cents integer check (fee_actual_cents >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, ref),
  constraint sold_requires_price_and_date
    check (status <> 'sold' or (final_price_cents is not null and sale_date is not null)),
  constraint photo_paths_in_own_folder
    check ((front_path is null or front_path like user_id::text || '/%')
       and (back_path  is null or back_path  like user_id::text || '/%'))
);

create index cards_user_status_idx on public.cards (user_id, status);
create index cards_user_created_idx on public.cards (user_id, created_at desc);

-- ---------------------------------------------------------------- triggers
-- Referência interna única e automática (C-0001, C-0002, ...), por utilizador.
create or replace function public.cards_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.profiles (user_id) values (new.user_id) on conflict (user_id) do nothing;
  if new.ref is null or btrim(new.ref) = '' then
    update public.profiles set next_ref = next_ref + 1
      where user_id = new.user_id returning next_ref - 1 into n;
    new.ref := 'C-' || lpad(n::text, 4, '0');
  end if;
  return new;
end $$;

create trigger cards_ref_before_insert before insert on public.cards
  for each row execute function public.cards_before_insert();

-- A referência e o dono não podem ser alterados depois de criados.
create or replace function public.cards_before_update() returns trigger
language plpgsql as $$
begin
  new.ref := old.ref;
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end $$;

create trigger cards_before_update before update on public.cards
  for each row execute function public.cards_before_update();

-- ---------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.options  enable row level security;
alter table public.cards    enable row level security;

create policy profiles_select on public.profiles for select to authenticated using (user_id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy options_all on public.options for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy cards_all on public.cards for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- profiles.next_ref só é alterado pelo trigger (security definer); o cliente não o pode mexer.
revoke update on public.profiles from authenticated;
grant update (app_name) on public.profiles to authenticated;

-- ---------------------------------------------------------------- arranque do utilizador
-- Idempotente. Cria perfil e opções iniciais na primeira utilização.
-- As taxas das plataformas são EXEMPLOS configuráveis (fee_is_example = true).
create or replace function public.bootstrap_user() returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  insert into public.profiles (user_id) values (uid) on conflict (user_id) do nothing;
  if exists (select 1 from public.options where user_id = uid) then return; end if;

  insert into public.options (user_id, kind, label, sort_order) values
    (uid,'condition','Mint (M)',1), (uid,'condition','Near Mint (NM)',2), (uid,'condition','Excellent (EX)',3),
    (uid,'condition','Good (GD)',4), (uid,'condition','Light Played (LP)',5), (uid,'condition','Played (PL)',6),
    (uid,'condition','Poor (PO)',7), (uid,'condition','Graduada',8);

  insert into public.options (user_id, kind, label, fee_percent, fee_fixed_cents, fee_is_example, sort_order) values
    (uid,'platform','Cardmarket',5,0,true,1),
    (uid,'platform','eBay',0,0,true,2),
    (uid,'platform','Vinted',0,0,true,3),
    (uid,'platform','Wallapop',0,0,true,4),
    (uid,'platform','OLX',0,0,true,5),
    (uid,'platform','Mão em mão',0,0,true,6),
    (uid,'platform','Outra',0,0,true,7);

  insert into public.options (user_id, kind, label, sort_order) values
    (uid,'source','Cardmarket',1), (uid,'source','eBay',2), (uid,'source','Vinted',3),
    (uid,'source','Wallapop',4), (uid,'source','OLX',5), (uid,'source','Loja física',6),
    (uid,'source','Mão em mão',7), (uid,'source','Outra',8);
end $$;

revoke all on function public.bootstrap_user() from public, anon;
grant execute on function public.bootstrap_user() to authenticated;

-- Renomear uma opção atualiza as cartas existentes (atómico; respeita RLS).
create or replace function public.rename_option(p_kind text, p_old text, p_new text) returns void
language plpgsql security invoker set search_path = public as $$
begin
  update public.options set label = btrim(p_new) where kind = p_kind and label = p_old;
  if p_kind = 'set'       then update public.cards set set_name = btrim(p_new) where set_name = p_old; end if;
  if p_kind = 'category'  then update public.cards set category = btrim(p_new) where category = p_old; end if;
  if p_kind = 'condition' then update public.cards set condition = btrim(p_new) where condition = p_old; end if;
  if p_kind = 'source'    then update public.cards set purchase_source = btrim(p_new) where purchase_source = p_old; end if;
  if p_kind = 'platform'  then update public.cards set sale_platform = btrim(p_new) where sale_platform = p_old; end if;
end $$;

revoke all on function public.rename_option(text,text,text) from public, anon;
grant execute on function public.rename_option(text,text,text) to authenticated;

-- ---------------------------------------------------------------- armazenamento privado
-- Bucket privado, 5 MB por ficheiro, só imagens. Cada utilizador só acede à sua pasta {user_id}/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('card-photos', 'card-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

create policy card_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'card-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy card_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'card-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy card_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'card-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy card_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'card-photos' and (storage.foldername(name))[1] = auth.uid()::text);
