# migrate-legacy — ETL cotizador legacy → agency-os

Script repetible e **idempotente** que migra datos del cotizador legacy/PROD
(`oiixyyvhqqmcaioamolj`, solo lectura) al proyecto `agency-os` (`hicbkpwywwhnhiawulmu`).
Preserva los **UUID legacy como PK** (upsert por `id`), así que re-correrlo no duplica.

**El piloto y la migración final son el MISMO script**: con `--only-clients` migra un
subconjunto; sin ese flag, migra todo.

## Setup

```bash
cp scripts/migrate-legacy/.env.example scripts/migrate-legacy/.env
# rellena LEGACY_SERVICE_ROLE_KEY y AGENCY_SERVICE_ROLE_KEY (.env está gitignored)
pnpm install
```

## Uso

```bash
# Ensayo sin escribir nada (imprime plan + anomalías)
pnpm --filter migrate-legacy migrate -- --only-clients="PETUS,Sergio" --dry-run

# Escritura real (piloto)
pnpm --filter migrate-legacy migrate -- --only-clients="PETUS,Sergio"

# Deshacer el piloto (borra filas + objetos de Storage)
pnpm --filter migrate-legacy migrate -- --only-clients="PETUS,Sergio" --rollback

# Migración COMPLETA (sin filtro) — solo cuando esté validada
pnpm --filter migrate-legacy migrate
```

## Flags

- `--only-clients="A,B"` — migra solo clientes cuyo **nombre o empresa** coincida (exacto,
  case-insensitive). Vacío/ausente = todos.
- `--dry-run` — no escribe; cuenta filas e imprime anomalías.
- `--rollback` — borra en destino lo del set indicado (usa los UUID legacy).

## Orden de carga

`clients → kams → quotes → quote_items → quote_recipients → quote_versions →
supplier_orders → briefs (Storage)`. Todo con `organization_id = TARGET_ORG_ID` (Laburu).

## Decisiones (piloto)

- Autoría (`created_by`/`assigned_to`/`sent_by`) = **null** (no se migran usuarios).
- KAM/PM se crean con `user_id` null; se enlazan a la persona real cuando existan cuentas.
- Tokens y `expires_at` de recipients/supplier_orders **preservados** (histórico vencido).
- Briefs: se copian del bucket público legacy al privado destino en `<quoteId>/<obj>` y se
  reescribe `brief_url`; si la copia falla, `brief_url` queda null y se reporta.

## Pendiente para la migración FINAL (no cubierto aquí)

- Autoría real de usuarios · backfill de `quote_code_counters` · los 2 `quote_code`
  duplicados del legacy (violarían `quotes_code_key`). Ver el diseño en
  `docs/superpowers/specs/2026-07-29-migracion-piloto-cotizador-design.md`.
