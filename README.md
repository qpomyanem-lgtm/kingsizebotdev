# Majestic RP Family Bot

Discord bot + web dashboard для управления семьёй Majestic RP.

## Модули

| Модуль | Технологии | Путь |
|---|---|---|
| Backend | Fastify, Drizzle ORM, PostgreSQL, socket.io, Lucia auth | `src/backend/` |
| Bot | Discord.js v14, Components V2 | `src/bot/` |
| Frontend | React 19, Vite, TanStack Query, Tailwind CSS | `src/frontend/` |
| DB | PostgreSQL, Drizzle ORM, миграции | `src/db/` |

## Архитектура прав

Права — плоские строки вида `site:<page>:view` / `site:<page>:actions` / `bot:<feature>`.
Хранятся в таблице `role_permissions`. Привязываются к ролям (`roles.type = 'access'`).
`GET /api/auth/me` возвращает `permissions: string[]` (объединение прав всех ролей пользователя).
Кеш прав на бэкенде инвалидируется при любом изменении ролей/прав.

## Система ролей

Все роли хранятся в таблице `roles` (не в Discord, Discord Role ID — опциональная привязка).

- `type = 'none'` — не настроена (создаётся по умолчанию)
- `type = 'system'` — системная (main, new, tier, blacklist)
- `type = 'access'` — даёт права на сайте

Тип назначается на странице «Настройка доступа», не при создании роли.

> Источник истины по всем API — `AGENTS_CONTRACT.md`.

---

## Для AI-агентов и разработчиков

`AGENTS_CONTRACT.md` — источник истины по всем API, IPC, customId и system_settings.
`README.md` — обзор для людей; при расхождениях ориентируйтесь на контракт.

## REST API (краткий список)

### Auth
- `GET /api/auth/discord`
- `GET /api/auth/discord/callback`
- `GET /api/auth/complete`
- `GET /api/auth/me` → `{ user, permissions: string[] }`
- `POST /api/auth/logout`

### Roles (настройка ролей)
- `GET /api/settings/roles` → список всех ролей (query: `type`, `systemType`)
- `POST /api/settings/roles` → создать роль (type='none' по умолчанию)
- `PATCH /api/settings/roles/:id` → обновить имя/цвет/иконку/discordRoleId
- `DELETE /api/settings/roles/:id` → удалить роль (нельзя @everyone)
- `PUT /api/settings/roles/reorder` → изменить приоритеты
- `PATCH /api/settings/roles/:id/access` → задать type/systemType/isAdmin
- `GET /api/settings/roles/:id/permissions` → права роли
- `PUT /api/settings/roles/:id/permissions` → заменить права роли
- `GET /api/settings/admin-roles` → список admin-ролей (type=access, isAdmin=true)

### Access (настройка доступа)
- `GET /api/access-roles` → роли с permissions
- `GET /api/access-roles/permissions-catalog` → каталог всех permissions
- `POST /api/access-roles` → создать access-роль (устарело, используйте Roles API)
- `PATCH /api/access-roles/:id` → обновить access-роль
- `DELETE /api/access-roles/:id` → удалить access-роль
- `PUT /api/access-roles/:id/permissions` → заменить permissions

### System settings
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

## Discord event handlers (бот, рантайм)
- `messageDelete` — авто-переотправка удалённых системных embed'ов
- `guildMemberUpdate` — отзыв сессий при снятии admin-роли; авто-синхронизация состава семьи (KINGSIZE/NEWKINGSIZE/TIER)
- `guildMemberAdd` — авто-восстановление роли BLACKLIST при повторном заходе
- `messageCreate` (DM) — обработка скриншотов активности и сообщений интервью
- `messageCreate` (guild threads) — обработка сообщений в тредах активности

### Background intervals
- `checkExpiredAfks` — каждые 60s
- `refreshServerOnlineEmbed` — каждые 30s
- `checkAndDeployEmbeds` — каждые 15s
- Reconcile activity threads — каждые 300s
- Auto-refresh event embeds — каждые 30s
- Guild lock: бот покидает серверы, не совпадающие с `GUILD_ID`

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

Ниже сценарий “с нуля” для VPS Ubuntu (поднимаются `postgres`, `redis`, `backend`, `bot`, `frontend` через Docker Compose).

### 0) Подключение к серверу по SSH (консоль)

Заранее узнайте `SERVER_IP` (или домен/IP) и имя пользователя, под которым вас пускают (часто `root` или `ubuntu` — зависит от провайдера).

#### Вариант A: подключение с паролем (самый простой)
В PowerShell на Windows:
```bash
ssh <USER>@<SERVER_IP>
```
Если SSH на нестандартном порту:
```bash
ssh -p <PORT> <USER>@<SERVER_IP>
```

#### Вариант B: подключение по SSH-ключу (рекомендуется)
1. Если ключей нет, создайте:
```bash
ssh-keygen -t ed25519 -C "<ваш_email>"
```
2. Посмотрите/скопируйте `public key`:
```bash
type $env:USERPROFILE\.ssh\id_ed25519.pub
```
3. Добавьте ключ на сервер (войдите временно по паролю, затем выполните на сервере):
```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys
```
Вставьте туда содержимое вашего `*.pub` и сохраните.

4. Закройте права:
```bash
chmod 600 ~/.ssh/authorized_keys
```

5. Подключайтесь с ключом:
```bash
ssh -i $env:USERPROFILE\.ssh\id_ed25519 <USER>@<SERVER_IP>
```

#### Если вдруг SSH не запущен на сервере
На VPS:
```bash
sudo apt-get update
sudo apt-get install -y openssh-server
sudo systemctl enable --now ssh
```

### 1) Установите Docker и Compose
1. Установите зависимости:
```bash
sudo apt-get update
sudo apt-get install -y git curl ca-certificates
```

2. Поставьте Docker Engine и плагин Compose:
```bash
sudo apt-get install -y docker.io docker-compose-plugin
```

3. Включите Docker:
```bash
sudo systemctl enable --now docker
```

4. (Если нужно) добавьте текущего пользователя в группу `docker`:
```bash
sudo usermod -aG docker $USER
newgrp docker
```

### 2) Настройте доступ в firewall
Обычно достаточно открыть порт `80` (frontend) и при необходимости `443`:
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 3) Клонируйте проект
1. Выберите папку, например `/opt`:
```bash
cd /opt
git clone <YOUR_REPO_URL> majestic-family-bot
cd majestic-family-bot
```

2. Поставьте зависимости (нужны для `drizzle-kit` и `tsx` на этапе миграций/seed):
```bash
npm install
```

### 4) Настройте `.env`
1. Скопируйте шаблон:
```bash
cp .env.example .env
```

2. Заполните обязательные переменные:
```env
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
BOT_OWNER_ID=...

# DB/Redis (используйте те же значения, что и в docker-compose.yml)
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/majestic_family
REDIS_URL=redis://redis:6379

# Адреса для браузера/CORS + OAuth редиректов
HOST_URL=http://<DOMAIN>
PUBLIC_HOST_URL=http://<DOMAIN>
ADMIN_HOST_URL=http://<ADMIN_DOMAIN>   # можно тем же доменом, если нет поддомена
COOKIE_DOMAIN=.<DOMAIN>              # напр. .example.com

# IPC (Docker-сеть)
IPC_BOT_BASE_URL=http://bot:3001
IPC_BACKEND_BASE_URL=http://backend:3000
IPC_BOT_LISTEN_HOST=0.0.0.0
```

### 4.5) Discord OAuth2: добавьте Redirect URLs
В Discord Developer Portal:
1. Откройте приложение (бот).
2. Раздел `OAuth2` / `Redirects` (OAuth2 Redirect URLs).
3. Добавьте минимум:
   - `${PUBLIC_HOST_URL}/api/auth/discord/callback`
   - `${ADMIN_HOST_URL}/api/auth/discord/callback` (если `ADMIN_HOST_URL` отличается от `PUBLIC_HOST_URL`)

После этого логин через OAuth начнёт редиректить обратно в backend.

### 5) Поднимите всё через Docker Compose
С пересборкой:
```bash
docker compose up -d --build
```

Проверить, что контейнеры поднялись:
```bash
docker compose ps
```

Смотреть логи по сервисам:
```bash
docker compose logs -f backend
docker compose logs -f bot
docker compose logs -f frontend
```

Если сборка падает на `canvas` (native bindings), убедитесь, что Dockerfile для `backend/bot` использует `node:20-slim` и ставит системные зависимости (в текущем репозитории это уже исправлено).

### 6) Миграции и seed
После того как `postgres` поднялся:

Важно: `drizzle-kit push` должен примениться к той Postgres БД, которая запущена в docker-compose. Если выполнить миграции “с хоста” с неверным `DATABASE_URL` (например, с `postgres` вместо `localhost`), то таблицы `users/sessions` могут не появиться и OAuth/`/api/auth/me` будет падать.

Вариант A (самый надёжный): выполнять миграции внутри контейнера `backend`
```bash
docker compose exec -T backend npx drizzle-kit push
docker compose exec -T backend npx tsx src/db/seed.ts
```

Вариант B: выполнять миграции на хосте (Windows/Linux), но используйте `DATABASE_URL` на `localhost:5432`
```bash
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/majestic_family' npm run db:push
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/majestic_family' npx tsx src/db/seed.ts
```

Важно:
- `seed.ts` засевает только `role_settings`.
- `system_settings` (каналы/сообщения/ключи панелей) задаются отдельно (через админ-панель или вручную через `/api/settings/system`).

### 7) Настройте `system_settings` (самое важное после seed)
Откройте админ-панель (frontend/админ на вашем `ADMIN_HOST_URL`) и зайдите Discord’ом.

Нужно задать как минимум ключи:
- `GUILD_ID`
- `TICKETS_CHANNEL_ID`, `TICKETS_MESSAGE_ID`
- `EVENTS_CHANNEL_ID`, `EVENTS_MESSAGE_ID`
- `ONLINE_CHANNEL_ID`, `ONLINE_MESSAGE_ID`
- `AFK_CHANNEL_ID`, `AFK_MESSAGE_ID`
- `ACTIVITY_FORUM_CHANNEL_ID`
- `APPLICATION_FIELD_1..5` + `APPLICATION_FIELD_*_PLACEHOLDER` + `APPLICATION_FIELD_*_STYLE` (если хотите менять поля анкеты)

После этого бот начнёт деплоить/обновлять панели.

### 8) Устранение неполадок
1. Посмотреть причину падения контейнера:
```bash
docker compose logs -f <service>
```
2. Проверить, что БД доступна:
```bash
docker compose exec -T postgres psql -U postgres -d majestic_family -c "select now();"
```
3. Проверить, что backend слушает порт `3000` внутри docker-сети:
```bash
docker compose exec -T backend sh -lc "node -e 'fetch(\"http://localhost:3000/api/auth/me\").then(r=>console.log(\"status\", r.status)).catch(e=>{console.error(e);process.exit(1);})'"
```

---
## Обновление репозитория (Git)

### Вариант 1: через команды (рекомендуется на сервере)
1. Проверить изменения:
```bash
git status
```
2. Добавить изменения в staging:
```bash
git add .
```
3. Сделать commit:
```bash
git commit -m "Update docs and runtime fixes"
```
4. Запушить в GitHub (обычно в ветку `main`):
```bash
git push origin main
```

Важно: не коммить секреты типа `.env` — коммить нужно только `.env.example` (она в репозитории).

### Вариант 2: через интерфейс IDE (Cursor/VS Code)
1. Откройте вкладку `Source Control` в IDE.
2. Убедитесь, что вы на нужной ветке (обычно `main`).
3. Нажмите `Stage All` (или выберите файлы и `Stage`).
4. Введите сообщение коммита и нажмите `Commit`.
5. Нажмите `Push` (или `Push to origin`).

### Вариант 3: через GitHub Desktop (если используешь)
1. Нажмите `Fetch origin`.
2. В `Changes` убедитесь, что выбранные файлы подсвечены, и нажмите `Commit to main`.
3. Нажмите `Push origin`.

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
   - новый Discord event handler / background interval
   обновите контракт (и только потом код).
3. Сохранение поведения 1:1 означает:
   - endpoint paths/methods не меняются
   - socket.io event names не меняются
   - `customId` строка/префиксы не меняются
   - ключи `system_settings` не переименовываются

Как использовать контракт именно ИИ-агенту (workflow):
1. Получите задачу → выпишите, что именно меняется по контракту: какие REST/IPC роуты, socket.io events, `customId`, ключи `system_settings`.
2. Проверьте в `AGENTS_CONTRACT.md` текущие “истины” (пути/методы/названия/ключи) и сравните с тем, что предлагает изменение.
3. Если изменение затрагивает контракт — сначала внесите правки в `AGENTS_CONTRACT.md`, затем реализуйте код так, чтобы он соответствовал контракту 1:1.
4. После реализации обновите `README.md`:
   - либо добавьте/уточните разделы, которые отражают поведение для людей,
   - либо сделайте краткую ссылку/обновление там, где README описывает “контрактные” вещи (но источник истины остаётся `AGENTS_CONTRACT.md`).
5. Обязательно выполните проверку сборки/типа (например `npm run typecheck` и `npm run build`) и убедитесь, что имена контрактных сущностей (endpoints/customId/events/system_settings/IPC) не расходятся.

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

