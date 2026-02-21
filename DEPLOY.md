# 🚀 IMPREZA — Деплой на Railway

## Архитектура

```
Railway Project
├── Backend  (NestJS, Dockerfile)     → https://xxx.up.railway.app
├── Frontend (React+Nginx, Dockerfile) → https://yyy.up.railway.app
├── PostgreSQL (плагин Railway)
└── Redis (плагин Railway)
```

Frontend — SPA на nginx, обращается к Backend напрямую по его Railway URL.
Backend — NestJS API, автоматически применяет миграции при старте.

---

## 1. Создание проекта в Railway

1. Зайти на [railway.app](https://railway.app/) → **New Project**
2. Выбрать **Deploy from GitHub repo** → подключить репозиторий
3. Railway обнаружит monorepo — НЕ деплоить автоматически

---

## 2. Добавить PostgreSQL

1. В проекте: **+ New** → **Database** → **PostgreSQL**
2. Railway автоматически создаст переменную `DATABASE_URL`

---

## 3. Добавить Redis

1. В проекте: **+ New** → **Database** → **Redis**
2. Railway автоматически создаст переменную `REDIS_URL`

---

## 4. Создать Backend-сервис

1. **+ New** → **GitHub Repo** → выбрать репозиторий
2. В настройках сервиса:
   - **Settings → Source** → **Root Directory**: `impreza/backend`
   - **Settings → Build** → Builder: **Dockerfile**
3. **Variables** → добавить:

| Переменная         | Значение                                    |
|--------------------|---------------------------------------------|
| `DATABASE_URL`     | `${{Postgres.DATABASE_URL}}`  (ссылка)      |
| `REDIS_URL`        | `${{Redis.REDIS_URL}}`  (ссылка)            |
| `JWT_SECRET`       | Случайная строка 64+ символов               |
| `REFRESH_SECRET`   | Другая случайная строка 64+ символов        |
| `BCRYPT_ROUNDS`    | `12`                                        |
| `FRONTEND_URL`     | URL фронтенд-сервиса (после создания)       |

4. **Settings → Networking** → **Generate Domain** (получите URL бэкенда)

---

## 5. Создать Frontend-сервис

1. **+ New** → **GitHub Repo** → тот же репозиторий
2. В настройках сервиса:
   - **Settings → Source** → **Root Directory**: `impreza/frontend`
   - **Settings → Build** → Builder: **Dockerfile**
3. **Variables** → добавить:

| Переменная     | Значение                                              |
|----------------|-------------------------------------------------------|
| `VITE_API_URL` | `https://ВАШ-БЭКЕНД.up.railway.app/api` (Build Arg!) |

> ⚠️ `VITE_API_URL` нужно также добавить как **Build Variable** (не только Runtime), потому что Vite подставляет URL на этапе сборки.

4. **Settings → Networking** → **Generate Domain**

---

## 6. Связать CORS

После получения URL фронтенда, вернуться в Backend-сервис:
- Обновить `FRONTEND_URL` = `https://ВАШ-ФРОНТЕНД.up.railway.app`

---

## 7. Первый seed базы данных

После успешного деплоя бэкенда:

```bash
# В Railway Dashboard → Backend-сервис → Settings → запустить команду:
railway run --service backend npx prisma db seed
```

Или через Railway CLI:
```bash
npm i -g @railway/cli
railway login
railway link          # выбрать проект
railway run -s backend -- npx prisma db seed
```

Seed создаст:
- **admin** / `admin123` (администратор)
- **office.eu** / `office123` (офис Европа)
- **office.west** / `office123` (офис Запад)
- **office.east** / `office123` (офис Восток)
- **16 стран** + **66 городов** с аккаунтами

---

## 8. Полезные команды (Railway CLI)

```bash
# Установить CLI
npm i -g @railway/cli

# Логин
railway login

# Привязать к проекту
railway link

# Посмотреть логи backend
railway logs -s backend

# Посмотреть логи frontend
railway logs -s frontend

# Выполнить миграции вручную
railway run -s backend -- npx prisma migrate deploy

# Зайти в shell контейнера
railway shell -s backend

# Перезадеплоить
railway up -s backend
railway up -s frontend
```

---

## 9. Обновление

При пуше в GitHub Railway автоматически передеплоит сервисы.

Для ручного обновления:
```bash
railway up -s backend
railway up -s frontend
```

Миграции применяются автоматически при старте backend (в CMD Dockerfile).

---

## 10. Переменные окружения (справочник)

### Backend
| Переменная       | Обязательна | Описание                           |
|------------------|-------------|------------------------------------|
| `DATABASE_URL`   | ✅           | Из Railway PostgreSQL              |
| `REDIS_URL`      | ✅           | Из Railway Redis                   |
| `JWT_SECRET`     | ✅           | Секрет JWT токенов                 |
| `REFRESH_SECRET` | ✅           | Секрет refresh токенов             |
| `BCRYPT_ROUNDS`  | ❌           | По умолчанию `10`                  |
| `PORT`           | ❌           | Задаётся Railway автоматически     |
| `FRONTEND_URL`   | ✅           | URL фронтенда для CORS             |

### Frontend
| Переменная     | Обязательна | Описание                           |
|----------------|-------------|------------------------------------|
| `VITE_API_URL` | ✅           | URL бэкенда + `/api` (Build Arg!) |
| `PORT`         | ❌           | Задаётся Railway автоматически     |
