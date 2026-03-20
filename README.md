# Majestic RP Family Bot

Discord bot + web dashboard для управления семьёй Majestic RP.

Основные модули:
- `src/backend` — Fastify REST API + socket.io
- `src/bot` — discord.js bot (Components V2)
- `src/frontend` — React SPA (Vite)
- `src/db` — PostgreSQL + Drizzle ORM

---

## Контракт поведения (для людей и AI-агентов)

Этот проект активно рефакторится. Чтобы при изменениях ничего не сломать, используйте контракт:
- файл `AGENTS_CONTRACT.md` содержит:
  - REST API (method/path)
  - socket.io events
  - Discord interaction `customId` + соответствие handlers
  - IPC endpoints (backend <-> bot)
  - `system_settings.key`, используемые в рантайме
  - embeds/panels, которые бот deploy’ит/обновляет

Если вы меняете код, но нужно сохранить поведение 1:1 — сначала обновляйте контракт, затем — код.

---

## REST API (короткий список)

### Auth
- `GET /api/auth/discord`
- `GET /api/auth/discord/callback`
- `GET /api/auth/complete`
- `GET /api/auth/me`
- `POST /api/auth/logout`

### Settings
- `GET /api/settings/roles`
- `PATCH /api/settings/roles`
- `GET /api/settings/system`
- `PATCH /api/settings/system`
- `POST /api/settings/sync-members`

### Applications
- `GET /api/applications/`
- `PATCH /api/applications/:id/status`
- `GET /api/applications/fields`
- `PATCH /api/applications/fields`
- `GET /api/applications/:id/messages`
- `POST /api/applications/:id/messages`
- `POST /api/applications/ipc/bot-event`

### Members
- `GET /api/members/`
- `GET /api/members/kicked`
- `GET /api/members/:id`
- `PATCH /api/members/:id`
- `POST /api/members/:id/exclude`
- `POST /api/members/:id/unblacklist`

### AFK
- `GET /api/afk/`
- `POST /api/afk/:id/end`

### Maps
- `GET /api/maps/`
- `POST /api/maps/`
- `DELETE /api/maps/:id`

### Activity
- `GET /api/activity/overview`
- `GET /api/activity/:memberId/screenshots`
- `POST /api/activity/ipc/bot-event`

---

## WebSocket (socket.io) events
- `applications_refresh`
- `activity_refresh`
- `interview_message_<applicationId>`

---

## Discord interactions (`customId`)

### Buttons
- `ticket_apply_btn`
- `afk_start_btn`
- `afk_end_btn`
- `event_create_btn`
- `event_join_<eventId>`
- `event_leave_<eventId>`
- `event_manage_<eventId>`
- `event_close_<eventId>`
- `event_setgroup_<eventId>`
- `event_selectmap_<eventId>`
- `activity_upload_<memberId>`
- `interview_ready_<applicationId>`

### Modals
- `ticket_apply_modal`
- `afk_start_modal`
- `event_create_modal`
- `event_setgroup_modal_<eventId>`
- `event_map_modal_<eventId>`

---

## IPC (HTTP backend <-> bot)

### Bot IPC server (:3001)
- `POST /ipc/refresh-event/:eventId`
- `POST /ipc/send-interview-dm/:applicationId`
- `POST /ipc/send-interview-message/:applicationId`
- `POST /ipc/create-activity-thread/:memberId`

### Backend receive
- `POST /api/applications/ipc/bot-event`
- `POST /api/activity/ipc/bot-event`

---

## `system_settings.key` (runtime)
- `GUILD_ID`
- `TICKETS_CHANNEL_ID`, `TICKETS_MESSAGE_ID`
- `EVENTS_CHANNEL_ID`, `EVENTS_MESSAGE_ID`
- `ONLINE_CHANNEL_ID`, `ONLINE_MESSAGE_ID`
- `AFK_CHANNEL_ID`, `AFK_MESSAGE_ID`
- `ACTIVITY_FORUM_CHANNEL_ID`
- `APPLICATION_FIELD_1..5`
- `APPLICATION_FIELD_1_PLACEHOLDER..5_PLACEHOLDER`
- `APPLICATION_FIELD_1_STYLE..5_STYLE`

---

## Embeds / Panels (что деплоит бот)
- Tickets panel (`ticket_apply_btn`)
- Events panel (`event_create_btn`)
- Online status panel (cron refresh)
- AFK panel (2 сообщения: `afk_start_btn` и `afk_end_btn`)
- Event roster embed (кнопки `event_*_<eventId>`)
- Interview messages (DM + `interview_ready_<id>`)
- Activity threads + DM-сессии (`activity_upload_<memberId>`)

---

## Быстрый старт (локально)

### 1) Требования
- Node.js >= 18
- Docker + Docker Compose
- Discord Application с:
  - Bot
  - OAuth2 (redirect/callback на backend)

### 2) Настройка окружения
1. Скопируйте пример:
   - `.env.example` -> `.env`
2. Заполните:
   - `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `BOT_OWNER_ID`
   - `DATABASE_URL`, `REDIS_URL`
   - `HOST_URL`, `PUBLIC_HOST_URL`, `ADMIN_HOST_URL`, `COOKIE_DOMAIN`
   - IPC:
     - `IPC_BACKEND_BASE_URL`
     - `IPC_BOT_BASE_URL`
     - `IPC_BOT_LISTEN_HOST`

Пример:
```bash
cp .env.example .env
```

### 3) Запуск
1. Поднимите БД/Redis:
```bash
docker compose up -d
```

2. Примените схему:
```bash
npm run db:push
```

3. Seed ролей:
```bash
npx tsx src/db/seed.ts
```

> `seed.ts` засевает только `role_settings`. `system_settings` (каналы/сообщения/ключи панелей) задаются через админ-панель/API.

4. Запуск в dev:
```bash
npm run dev
```

---

## VPS Ubuntu: Docker для всех сервисов

1. Установите Docker Engine + Compose plugin (или Docker Compose).
2. Склонируйте репозиторий и поставьте зависимости (локально на VPS):
```bash
git clone <repo-url> bot
cd bot
npm install
```

3. Настройте `.env`:
```bash
cp .env.example .env
```
Обязательно задайте:
- `DATABASE_URL` (на postgres сервис)
- `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `BOT_OWNER_ID`
- `HOST_URL`, `PUBLIC_HOST_URL`, `ADMIN_HOST_URL` (чтобы CORS и редиректы работали из браузера)
- IPC:
  - `IPC_BOT_BASE_URL=http://bot:3001`
  - `IPC_BACKEND_BASE_URL=http://backend:3000`

4. Поднимите всё:
```bash
docker compose up -d --build
```

5. Примените миграции и seed:
```bash
npm run db:push
npx tsx src/db/seed.ts
```

6. Проверьте логи:
```bash
docker compose logs -f
```

---

## Идеи улучшений

1. Добавить генерацию OpenAPI/Swagger по Zod-схемам в `src/backend` (и использовать её в CI).
2. Укрепить “contract tests”:
   - проверка `customId` префиксов
   - проверка IPC маршрутов
   - проверка names socket.io events
3. Заменить циклы `setInterval` на job-сcheduler (например, очередь/cron) — для контролируемых частот обновления.
4. Добавить rate limiting и наблюдаемость:
   - correlation-id для HTTP/IPC/WS
   - единый формат логов
5. Ввести “system_settings schema”:
   - валидатор ключей + миграции значений
   - автогенерация документации ключей

---

## Очистка базы данных (DB cleanup)

Ниже команды под текущие таблицы схемы `src/db/schema.ts`.

### Вариант A: Full wipe (полный сброс)
1. Остановите и удалите volume’ы БД:
```bash
docker compose down -v
```
2. Поднимите снова:
```bash
docker compose up -d
```
3. Создайте таблицы:
```bash
npm run db:push
```
4. Засейте роли:
```bash
npx tsx src/db/seed.ts
```
5. После этого задайте `system_settings` через админ-панель (или API).

### Вариант B: Truncate данных (сохранить `role_settings` и `system_settings`)
Идея: очистить “рабочие” таблицы, оставив конфигурацию панелей/ролей.

Используйте `psql` внутри контейнера PostgreSQL:
```bash
docker compose exec -T postgres psql \
  -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-majestic_family} -c "
TRUNCATE
  event_participants,
  events,
  event_maps,
  afk_entries,
  interview_messages,
  activity_screenshots,
  activity_threads,
  activity_dm_sessions,
  applications,
  members,
  sessions
CASCADE;
"
```

Если нужно также почистить `users`, удалите/добавьте соответствующую строку (и учтите, что после этого админ должен авторизоваться заново).

---

## Для AI-агентов: как добавлять функционал без поломки контракта

Мини-правила:
1. Перед изменениями — откройте `AGENTS_CONTRACT.md`.
2. Если вы добавляете/меняете:
   - новый endpoint
   - новый `customId`
   - новый IPC event/route
   - новые `system_settings.key`
   обновите контракт (и только потом код).
3. Сохранение поведения 1:1 означает:
   - endpoint paths/methods не меняются
   - socket.io event names не меняются
   - `customId` строка/префиксы не меняются
   - ключи `system_settings` не переименовываются

---

## Mermaid: схема потоков (упрощённо)

```mermaid
flowchart LR
  F[Frontend (React)] -->|REST + socket.io| B[Backend (Fastify)]
  B -->|HTTP IPC| D[Bot (discord.js)]
  D -->|Embeds/Interactions| Z[Discord]
  B -->|SQL| DB[(PostgreSQL)]
  B -->|Redis (если используется)| R[(Redis)]
```

