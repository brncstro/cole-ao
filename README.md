# A Minha Coleção

Aplicação web privada (PT-PT) para gerir cartas e cromos: compras, vendas, fotografias, custos e lucros. Next.js 16 + TypeScript + Tailwind 4 + Supabase (Auth, Postgres, Storage privado).

## Estrutura

- `src/lib/calc.ts`, `money.ts`, `search.ts`, `summary.ts` — **fonte única** de cálculos, formatação, pesquisa/filtros e resumo (usada pela UI, PDF e Excel). Dinheiro em cêntimos inteiros.
- `src/lib/export/` — PDF (pdfkit, fonte DejaVu embebida) e Excel (exceljs).
- `src/app/actions.ts` — ações de servidor (validação autoritativa com `validateCardInput`).
- `src/app/api/export`, `api/backup` — exportações e backup ZIP (leem a coleção completa no servidor).
- `supabase/migrations/0001_init.sql` — tabelas, restrições, triggers, RLS, bucket privado.
- `supabase/tests/` — testes de RLS (Postgres local) · `scripts/restore.mjs` · `docs/RECUPERACAO.md`.

## Configuração (uma vez)

1. Crie um projeto em https://supabase.com.
2. SQL Editor → cole e execute `supabase/migrations/0001_init.sql` (cria tabelas, RLS e o bucket privado `card-photos`).
3. Authentication → Providers → Email ativo. Para uma app só sua: depois de criar a sua conta, desative **Allow new users to sign up** (Authentication → Sign In / Providers). Em Authentication → URL Configuration, defina o *Site URL* (e o URL de produção).
4. `cp .env.example .env.local` e preencha `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`.
5. `npm install && npm run dev` → http://localhost:3000 → “Ainda não tenho conta”.

## Publicar (Vercel)

Importe o repositório, defina as 3 variáveis de ambiente acima e faça deploy. Não defina `SUPABASE_SERVICE_ROLE_KEY` na Vercel (só serve para `scripts/restore.mjs`, localmente). As exportações/backups correm em funções Node; coleções muito grandes podem exigir um plano com `maxDuration` mais alto.

## Comandos

`npm run dev` · `npm run build` · `npm start` · `npm test` (cálculos, pesquisa, resumo, PDF/Excel) · `npm run lint` (tsc).

## Decisões

- Taxas das plataformas em Definições são **exemplos configuráveis**. Cada carta guarda a sua cópia (`fee_percent`, `fee_fixed_cents`, `fee_actual_cents`): alterar Definições nunca altera vendas passadas.
- As cartas guardam o texto das opções (coleção, conservação, origem…), por isso remover uma opção não toca no histórico.
- Fotografias: bucket privado, pasta `{user_id}/{carta}/`, URLs assinados de 1 h, JPEG ≤ 1600 px (corrigida a orientação EXIF, sem cortes), limite de 5 MB no servidor. HEIC só funciona se o navegador o descodificar (Safari/iOS converte-o ao escolher da Galeria); caso contrário aparece instrução clara.
- Preferências visuais (vista, colunas, ordenação) em `localStorage`; os dados nunca.

## O que ficou por verificar

Ver o resumo final da entrega: nenhum teste foi feito contra um projeto Supabase real (sem Docker/rede para tal neste ambiente).
