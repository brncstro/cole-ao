# Backup e recuperação

## O que é cada coisa

| | Backup (ZIP) | Relatório (PDF / Excel) |
|---|---|---|
| Para quê | Recuperar tudo se algo correr mal | Ler, imprimir, partilhar, analisar |
| Conteúdo | Todas as cartas, definições e **fotografias originais** | Colunas da folha de referência + resumo |
| Onde | Definições › Backup e recuperação | Coleção › Exportar |

## Fazer backup

1. Abra **Definições › Backup e recuperação › Descarregar backup (ZIP)**.
2. Guarde o ficheiro `backup-colecao-AAAA-MM-DD.zip` **fora** da aplicação (disco externo, cofre de palavras-passe, etc.). Contém dados privados.
3. Recomendação: mensalmente e antes de eliminações em massa.

O ZIP contém `data.json` (cartas e definições; valores monetários em cêntimos), `photos/` e `LEIA-ME.txt`.

**Versões.** O formato atual é a versão 2 (inclui `buyer_shipping_cents` e `fee_on_shipping`). O restauro aceita também backups da versão 1 (anteriores aos portes cobrados): ficam com portes cobrados = 0 e taxa só sobre o preço da carta; o antigo “portes de venda” (`sale_shipping_cents`) é restaurado como **custo real do envio**, sem alterações — por isso os lucros restaurados são iguais aos de antes.

## Restaurar

Requisitos: Node 20+, o projeto instalado (`npm install`) e a chave **service_role** do Supabase (Project Settings › API). Use-a só no seu computador.

1. Crie (ou tenha) a conta de destino na aplicação.
2. Simule primeiro:
   ```bash
   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
   node scripts/restore.mjs backup-colecao-2026-10-18.zip o-seu@email.pt --dry-run
   ```
3. Restaure:
   ```bash
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
   node scripts/restore.mjs backup-colecao-2026-10-18.zip o-seu@email.pt
   ```
   Se a conta já tiver cartas, o script pára. `--replace` apaga as cartas e fotografias existentes dessa conta antes de restaurar (irreversível).
4. Abra a aplicação e confirme o número de cartas e algumas fotografias.

As referências (C-0001…) e os identificadores das cartas são preservados; a próxima referência continua a seguir à maior restaurada.

## Recuperar de uma perda do projeto Supabase

1. Crie um projeto novo e aplique `supabase/migrations/*.sql` por ordem (ver README).
2. Configure Auth e as variáveis de ambiente.
3. Crie a conta e execute o restauro acima.

## Limitações conhecidas

- O backup é feito pelo servidor num único pedido; coleções com milhares de fotografias podem demorar vários minutos (limite de execução definido em `maxDuration`, dependente do plano de alojamento).
- O restauro **não foi testado contra um Supabase real** neste ambiente (ver README, “O que ficou por verificar”).
