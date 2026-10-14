#!/usr/bin/env bash
# Restaura um backup em um banco VAZIO ou de teste (apaga objetos existentes). Uso:
#   DATABASE_URL=postgresql://... ./scripts/restore.sh backups/arquivo.dump
set -euo pipefail
: "${DATABASE_URL:?defina DATABASE_URL}"
FILE="${1:?informe o arquivo .dump}"
read -r -p "Isto SUBSTITUI os dados do banco de destino. Digite 'restaurar' para continuar: " ok
[ "$ok" = "restaurar" ] || { echo "Cancelado."; exit 1; }
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DATABASE_URL" "$FILE"
echo "Restauração concluída."
