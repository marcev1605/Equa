# Equa (React · Expo universal + Postgres)

Migración de la app HTML (`legacy/mis-finanzas.html`) a **React con Expo**: un solo código para **web, iOS y Android**,
con **login** y datos en **PostgreSQL** (Supabase). La app HTML original quedó intacta.

## Estructura

```
app/                  Pantallas (Expo Router): login, Resumen, Previsión, Tarjetas, Ahorro, Estadísticas, Datos
                      (menú inferior: barra flotante con íconos SVG propios en src/ui/icons.tsx, vía react-native-svg)
src/domain/           Motor de cálculo puro (TypeScript, sin React): ocurrencias, resúmenes de tarjeta, adelantos, disponible
src/services/         Reglas de negocio (alta/edición de movimientos, pagos, ahorro, categorías) sobre un Repository
src/data/             Repository + SupabaseRepository (Postgres) + LocalRepository (modo demo / tests)
src/state/            Auth y store (React context)
src/ui/               Componentes, diálogos de confirmación, hojas, shell responsive
supabase/migrations/  Esquema SQL, RLS, triggers y la función restore_backup() (restaurar respaldo, atómico)
supabase/tests/       Pruebas del esquema (psql) + respaldo de ejemplo
tools/                Pruebas de dominio, comparación contra la app original, arnés web de pruebas
legacy/               App HTML original (referencia)
```

## UI responsive (misma interfaz, optimizada por pantalla)

| Ancho | Navegación | Contenido |
|---|---|---|
| < 700 (celular) | barra inferior + botón flotante “+” | 1 columna, hojas inferiores |
| 700–1023 (tablet) | barra inferior | 1 columna más ancha, diálogos centrados |
| ≥ 1024 (escritorio web) | menú lateral + “Nuevo movimiento” | 2 columnas (Resumen, Estadísticas, Ahorro, Datos), tarjetas en grilla, diálogos centrados |

Soporta modo claro/oscuro automático y áreas seguras (notch/barra de gestos).

## Puesta en marcha

```bash
cd equa-react
npm install
npx expo install --fix          # alinea versiones con tu SDK de Expo
cp .env.example .env            # (opcional) datos de Supabase; sin esto corre en MODO DEMO
npm run web                     # o: npm run ios / npm run android
```

**Modo demo** (sin `.env`): sin login, datos guardados en el dispositivo (AsyncStorage). Sirve para probar la interfaz.

### Base de datos + login (Supabase)

1. Creá un proyecto en supabase.com → Project Settings → API: copiá `URL` y `anon key` a `.env`.
2. Aplicá las migraciones, en orden: pegá `supabase/migrations/*.sql` en el **SQL Editor** (o `supabase link` + `supabase db push`).
   El esquema completo está en `…0001_init_schema.sql` (incluye `override_of`, para los fijos editados “solo este mes”, e `is_adjustment`, para los ajustes de saldo de Ahorro); `…0002_restore_backup.sql` agrega `restore_backup()`.
   Parten de una base vacía. Si ya habías aplicado una versión anterior del esquema, lo más simple es recrear el proyecto/esquema (no hay datos reales todavía).
3. Authentication → Providers → Email activado. (En desarrollo podés desactivar “Confirm email”.)
4. Al registrarse, un trigger crea el perfil y las categorías iniciales. Cada usuario solo ve sus filas (RLS).
5. Para traer tus datos de la app anterior o de un respaldo de Equa: **Datos → Restaurar respaldo** (pegá el contenido o, en la web, elegí el archivo).
   Se valida, te muestra cuántos movimientos/categorías/tarjetas/pagos/ahorros trae y **reemplaza todos tus datos**, con la opción de guardar antes una copia de lo actual.
   En Supabase llama a `restore_backup()` (una sola transacción: si algo falla no queda nada a medias); en modo demo usa el mismo camino sobre el almacenamiento local.

#### Formato del respaldo
`{ "app": "equa", "version": 2, "exportedAt": "…ISO…", "counts": { movimientos, categorias, tarjetas, pagos, ahorro }, "snapshot": { … } }`.
`snapshot` es la foto completa de la cuenta (saldo inicial, movimientos, ahorro, pagos de tarjeta, tarjetas con sus cierres, categorías, cobrados/pagados). También se acepta el respaldo de la app HTML anterior.

### Publicar

- **Web**: `npm run build:web` → carpeta `dist/` (Vercel, Netlify, Cloudflare Pages…).
- **iOS/Android**: `npm i -g eas-cli && eas build:configure && eas build -p ios` / `-p android` (cuenta Apple Developer / Google Play).
  Cambiá `com.equa.app` en `app.json` por tu identificador.

## Modelo de datos (resumen)

```
auth.users ─1:1─ profiles (moneda, zona horaria, saldo inicial)
profiles ─┬─< categories (kind: income|expense|saving, archivada = "eliminada", monto manual en US$)
          ├─< credit_cards ─< card_closing_overrides (cierre propio de un mes)
          │        └────< card_payments (pago/adelanto de un resumen: statement_month + paid_on)
          ├─< transactions ─< transaction_skips (meses salteados de un fijo)
          │                └─ override_of (mes de un fijo editado "solo este mes": apunta a su serie)
          │        │      └─< transaction_settlements (pagado/cobrado por mes)
          │        └─> category, card (cuotas, fijo, repetición en serie)
          └─< savings_movements (depósito +, retiro −, transferencia = 2 filas con transfer_id,
                               ajuste de saldo = is_adjustment: ganancia +/pérdida −, no mueve la cuenta disponible)
```

Decisiones: claves foráneas compuestas `(id, user_id)` (nada puede apuntar a datos de otro usuario) · RLS en todas las tablas ·
meses como `date` día 1 con CHECK · dinero `numeric(14,2)` · lo derivable no se guarda (estado de gastos con tarjeta, adelantos,
saldos, resúmenes) · reglas de negocio en la base (saldo de ahorro nunca negativo, transferencias que suman 0, categoría de ahorro
solo se archiva con saldo cero, nombres únicos sin tildes/mayúsculas, categoría acorde al tipo) · columnas `created_at/updated_at`.
Pensado para crecer: multi-moneda (`profiles.currency`, `categories.foreign_*`), cuentas/billeteras, presupuestos, adjuntos o
compartir con otro usuario se agregan con tablas nuevas sin tocar las actuales.

## Ahorro: ajuste de saldos

Cada categoría de Ahorro vale lo que suman sus movimientos. Depositar/retirar mueven la cuenta disponible; un **ajuste** (botón “Actualizar saldo”)
solo cambia el valor de la categoría: escribís cuánto vale hoy y se guarda la diferencia como ganancia (+) o pérdida (−), sin tocar el disponible
ni la previsión. La pantalla muestra, por categoría, el aportado (valor − ganancia), la ganancia o pérdida y su % sobre lo aportado (solo con aportado
positivo; es un rendimiento simple, no ponderado por tiempo), y el rendimiento acumulado total. No hay historial de valores: los ajustes con su fecha
son esa historia. En la base: `savings_movements.is_adjustment` (no puede ser parte de una transferencia; el saldo nunca queda negativo) y las columnas
`contributed` / `gain` de la vista `v_savings_balances`.

## Pruebas (sin instalar dependencias del proyecto)

```bash
node tools/run-all.cjs      # o: npm test
```

Corre 7 verificaciones usando solo Node, TypeScript, esbuild, Playwright/Chromium y psql (si falta alguna herramienta, esa prueba se omite y lo informa;
rutas por variables de entorno `TS_PATH`, `ESBUILD_PATH`, `PLAYWRIGHT_PATH`, `CHROMIUM_PATH`, `PGHOST`…):

1. **Tipos estrictos** de `src/` y `app/` (los paquetes externos se reemplazan por tipos mínimos; el código propio se chequea de verdad), incluyendo variables, imports y parámetros sin uso.
2. **Reglas de negocio**: altas, repeticiones, edición/borrado de fijos, categorías (borrado definitivo), tarjetas, pagos/adelantos, ahorro (incluye ajustes de saldo), respaldo (validación y reglas).
3. **SupabaseRepository** (cliente falso en memoria) vs. **LocalRepository**: mismo escenario, resultados equivalentes, cascadas y restricciones.
4. **Motor TS vs. app HTML original** ejecutada en Chromium: 398 comparaciones idénticas.
5. **Esquema Postgres** en un servidor real: tablas, RLS, triggers, `restore_backup()`.
6. **Ida y vuelta del respaldo** contra Postgres real: una cuenta completa se restaura, se vuelve a leer con `SupabaseRepository` y debe quedar idéntica (también restaurar dos veces, en otra cuenta y con un respaldo roto).
7. **Pantallas reales** compiladas con esbuild + shims DOM y probadas en Chromium: móvil vs. escritorio, alta de gasto, confirmaciones, adelanto de tarjeta, ahorro, categorías duplicadas, restaurar respaldo.

## Estado de verificación (honesto)

- ✔ Todo lo anterior pasa. Lo que **no** cubre: el render nativo real (iOS/Android) y el login/`SupabaseRepository` contra un Supabase real
  (el login no se puede ejercitar sin servidor; el repositorio sí se probó con un cliente falso).
- ⚠ Falta, en tu máquina: `npm install`, `npx expo install --fix`, `npm run typecheck` (con los tipos reales de Expo/React Native) y probar en simulador/teléfono.
- Corrección respecto de la app original: sin día de cierre definido, la fecha de cierre ya no se desborda al mes siguiente.
