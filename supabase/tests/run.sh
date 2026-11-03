#!/usr/bin/env bash
# Prueba el esquema en un Postgres común (base UTF8): bash run.sh  (usa PGHOST/PGPORT/PGUSER/PGDATABASE)
set -euo pipefail
cd "$(dirname "$0")"
DB=${PGDATABASE:-equa_test}
# base UTF8 descartable (las pruebas la recrean)
psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB encoding 'UTF8' template template0" >/dev/null
Q="psql -v ON_ERROR_STOP=1 -q -X -d $DB"
$Q -c "drop schema if exists public cascade; create schema public; drop schema if exists auth cascade;"
$Q -f 00_bootstrap_stub.sql
for f in ../migrations/*.sql; do $Q -f "$f"; done
FX=$(mktemp -d); trap 'rm -rf "$FX"' EXIT
node ../../tools/fixtures.cjs "$FX"   # respaldo de la app anterior, ya convertido y validado a Snapshot
$Q -v snap="$(tr -d '\n' < "$FX/legacy.snapshot.json")" -f 10_schema_tests.sql
echo "OK: esquema, RLS, reglas de negocio y restaurar respaldo verificados"
