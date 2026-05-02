# 🚨 HANDOFF — Impreza v2 rewrite (2026-05-02 ~02:30)

**Если ты следующий агент — прочитай этот файл, потом `/memories/session/plan.md` (там полный план).**

## Где остановились

### Сделано
- ✅ Этап 0 — backup ветка `legacy-backup-2026-05-02`, zip в `backups/`.
- ✅ Этап 1 — чистая Prisma схема, ветка `rewrite/v2` запушена.
- ✅ Этап 2 (код) — все 11 модулей backend написаны: `auth`, `users`, `countries`, `cities`, `inventory`, `transfers`, `expenses`, `history`, `events`, `health` + общий слой `common/{prisma,auth,filters,interceptors,util}`.
- ✅ `npx nest build --webpack` — компилируется без ошибок.
- ✅ `npx prisma db push --force-reset` — схема применена к локальной БД `impreza` на `localhost:5432`.
- ✅ Seed: 4 страны (DE/PL/NL/AT), 4 города (Berlin/Warsaw/Amsterdam/Vienna), 5 юзеров.
- ✅ Backend запущен в watch mode (`npm run start:dev`) на порту 3001.
- ✅ Smoke-тест (`backend/smoke.ps1`) проходит шаги 1-4 (login → select-scope → /auth/me → /cities).

### Оборвалось на
- 🟡 Шаг 5 smoke (intake): запрос проходит, но в выводе пустой `count` (надо распечатать ответ целиком — возможно просто PowerShell не интерполировал поле).
- 🟡 Шаг 7 smoke (transfer create): **`VALIDATION_ERROR: property note should not exist`**. В `CreateTransferDto` нет поля `note` (используется `whitelist: true` + `forbidNonWhitelisted: true`). 

## ТО ЧТО НАДО СДЕЛАТЬ ДАЛЬШЕ (по порядку)

### 1. Починить smoke.ps1
Открыть `impreza/backend/smoke.ps1`:
- Шаг 5: убрать `; note = 'smoke-test'` ИЛИ проверить `intake.dto.ts` — если note есть, оставить.
- Шаг 7: убрать `; note = 'smoke'` из создания transfer.
- Шаг 5: вывод поправить — печатать весь объект через `($intake.data | ConvertTo-Json -Compress)` чтобы увидеть все поля.

DTO посмотреть:
- `impreza/backend/src/modules/inventory/dto/intake.dto.ts`
- `impreza/backend/src/modules/transfers/dto/transfers.dto.ts`
- `impreza/backend/src/modules/expenses/dto/expenses.dto.ts`

### 2. Перезапустить smoke
```powershell
cd 'c:\Users\sosik\OneDrive\Рабочий стол\новый проект импрезы, опаски\impreza\backend'
powershell -NoProfile -ExecutionPolicy Bypass -File .\smoke.ps1
```

Все 16 шагов должны быть зелёными:
1-4 login flow, 5 intake, 6 manager login, 7 create transfer, 8 accept full, 9 inventory check, 10-11 discrepancy + resolve, 12 inventory after, 13 expense, 14 history, 15 manager intake → 403, 16 country change-password → 403.

### 3. Только после зелёного smoke → Этап 4 (Frontend)
См. полный план в `/memories/session/plan.md` секция "Этап 4 — Frontend rewrite".

Кратко:
- Снести `impreza/frontend/src/` (через юзера, спросить разрешение).
- Создать структуру: `api/`, `store/`, `components/{layout,ui,domain}/`, `pages/`.
- Дизайн строго по `impreza/design-mockup.html` v3 (палитра, типографика).
- Pages: Login, SelectScope, Home, Inventory (+IntakeModal), Transfers, TransferNew, Expenses, ExpenseNew, History (1/2/3 таба по роли), Users (ADMIN+OFFICE), UserEdit (ADMIN), Settings (без change-password для COUNTRY).
- zustand для auth/scope/ui store.

### 4. Этап 5 — Деплой Railway
Только когда юзер скажет. Не пушить в `main` без явного разрешения.

## ВАЖНЫЕ ПРАВИЛА (нарушать НЕЛЬЗЯ)

1. **НЕ трогать** `aura-tickets-api`, `qrbot`, `Zipiki`, `postgres-volume`, папки `lastQR\lastqr\aura-tickets-api`, `Zipiki`, `zipka`.
2. **НЕ коммитить и не пушить** — пользователь делает git вручную (см. `/memories/prefs.md`).
3. **Только локальная БД** `localhost:5432` для тестирования. Не Railway, не Redis, не cloud (см. `/memories/prefs.md`).
4. Все мутации балансов **только** в `prisma.$transaction` с проверкой `count >= 0`.
5. Каждое изменение пишет `AuditLog` в той же транзакции.
6. Язык юзера — русский. Отвечать кратко.

## Уже исправленные грабли (не наступать снова)

- `main.ts` enableCors: типизировать `(origin: string|undefined, cb: (err, allow?) => void)`, иначе TS7006.
- `common/auth/jwt-auth.guard.ts` фабрика `makeGuard()`: конструктор Guard должен быть `public readonly` (не private/protected), иначе TS4094 в `tsc -w`.
- `prisma db push`: при конфликтах со старой схемой использовать `--force-reset --accept-data-loss`.
- В smoke.ps1: токены в ответе называются `personalAccessToken` (login) и `sessionToken` (select-scope), не `token`.
- Postgres lock на `query_engine-windows.dll.node`: убить все `node` процессы (`Get-Process node | Stop-Process -Force`) перед `npx prisma generate`.

## Активные сессии (могут быть живы)
- Backend dev server: terminal `2921d9c4-b222-4516-9547-d378dc35da22` (`npm run start:dev`).
- Frontend dev: terminal `6a525233-af2d-4407-bb8e-70f9ce56f46d` (vite на :3000).

## Креды локально
- ADMIN: `Dmitryganj` / `Impreza@Admin2026!`  (тоже `admin`)
- OFFICE: `office1` / `Office@2026!`
- COUNTRY (DE): `country-de` / `Country@2026!`
- MANAGER (Berlin): `manager-berlin` / `Manager@2026!`

## Env vars (`impreza/backend/.env`)
- `DATABASE_URL=postgresql://...@localhost:5432/impreza`
- `JWT_SECRET=...`
- `RESET_SECRET=impreza-reset-2026`
- `AURA_USERNAME`, `AURA_PASSWORD` — опционально для events.

## Полный план
Лежит в `/memories/session/plan.md` (~493 строки). Описывает все 5 этапов в деталях с матрицей прав, дизайн-решениями и проверочными чеклистами.
