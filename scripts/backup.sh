#!/usr/bin/env bash
# Backup lógico do PostgreSQL (formato custom, comprimido). Uso:
#   DATABASE_URL=postgresql://... ./scripts/backup.sh [diretório]   (padrão: ./backups)
# Agende (cron/GitHub Action) e copie para armazenamento externo. Em provedores gerenciados
# (Neon, Supabase, RDS), habilite também o backup/PITR nativo do provedor.
set -euo pipefail
: "${DATABASE_URL:?defina DATABASE_URL}"
DIR="${1:-backups}"; mkdir -p "$DIR"
FILE="$DIR/finance-os-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" --file="$FILE"
echo "Backup criado: $FILE ($(du -h "$FILE" | cut -f1))"
# Mantém os 30 mais recentes
ls -1t "$DIR"/finance-os-*.dump | tail -n +31 | xargs -r rm --
