# Majestic RP Family Bot: API / Embeds / Interactions Contract

Документ нужен для людей и для AI-агентов, чтобы при рефакторинге не сломать контракты:
- REST API (пути/методы)
- WebSocket events (socket.io)
- Discord interactions (`customId`)
- IPC endpoints backend <-> bot
- ключи `system_settings.key`, которые используются в рантайме

## 1. REST API (Fastify)

Базовый префикс: `http://<HOST>:<PORT>`, далее префиксы роутов указаны ниже.

### Auth
1. `GET /api/auth/discord`
   - Redirect: Discord OAuth2 authorize URL
   - Cookies: `discord_oauth_state`, `discord_oauth_dest`
   - Query: `origin?` (адрес куда редиректить после OAuth; используется как destOrigin)
2. `GET /api/auth/discord/callback`
   - Query: `code`, `state`
   - Создаёт/обновляет пользователя в `users`
   - Создаёт Lucia session и редиректит на `/<destOrigin>/api/auth/complete?code=<oneTimeCode>`
3. `GET /api/auth/complete`
   - Query: `code`
   - Обмен one-time code на Lucia session cookie
   - Redirect: `/`
4. `GET /api/auth/me`
   - Auth: cookie Lucia session
   - Если сессия отсутствует/невалидна: HTTP `401` (и Lucia может выставить “blank session” cookie)
   - Если сессия валидна: `{ user: { ...user, role, roleSettingsAccess, roleLabel } }`
5. `POST /api/auth/logout`
   - Auth: cookie Lucia session
   - Ответ: `{ success: true }`

### Settings
1. `GET /api/settings/roles`
   - Auth: Lucia session + `hasRoleSettingsAccess`
   - Ответ: rows из `role_settings`
2. `PATCH /api/settings/roles`
   - Body: `{ updates: Array<{ key: string, discordRoleId: string | null }> }`
   - Auth: Lucia session + `hasRoleSettingsAccess`
   - Ответ: `{ success: true }`
3. `GET /api/settings/system`
   - Auth: Lucia session + `hasRoleSettingsAccess`
   - Ответ: rows из `system_settings`
4. `PATCH /api/settings/system`
   - Body: `{ updates: Array<{ key: string, value: string | null }> }`
   - Auth: Lucia session + `hasRoleSettingsAccess`
   - Upsert: если key существует — update, иначе — insert
   - Ответ: `{ success: true }`
5. `POST /api/settings/sync-members`
   - Auth: Lucia session + `hasRoleSettingsAccess`
   - Side effects: синхронизация `members` из Discord guild:
     - читает `GUILD_ID`
     - читает роли `KINGSIZE`, `NEWKINGSIZE`, `TIER1..3`
     - добавляет/обновляет `members`
     - “кикает” (status -> `kicked`, tier -> `NONE`) тех, кто больше не имеет нужных ролей
   - Ответ: `{ success: true, added, updated, kicked, totalFound }`

### Applications (prefix `/api/applications`)
1. `GET /api/applications/`
   - Auth: Lucia session (см. checkAdmin в `src/backend/features/applications/controller.ts`)
   - Ответ: все приложения, order by `applications.createdAt` desc
2. `PATCH /api/applications/:id/status`
   - Auth: Lucia session
   - Body (zod):
     - `status`: `pending|interview|interview_ready|accepted|rejected|excluded|blacklist`
     - `rejectionReason?`: string
     - `gameNickname?`: string (max 22, start with capital Latin letter)
     - `gameStaticId?`: string (digits, up to 6)
   - Side effects (при `accepted`):
     - upsert `members` (создание/обновление)
     - Discord:
       - addRole `NEWKINGSIZE`
       - set nickname `${gameNickname} | ${gameStaticId}`
     - triggers: create activity forum thread via bot IPC
   - Side effects (при переходе к `interview`):
     - bot IPC: `POST /ipc/send-interview-dm/:applicationId`
   - Side effects (при `rejected/excluded/blacklist`):
     - меняет только поля приложения (в БД)
   - Emits (WS):
     - если `status === accepted` — не эмитит напрямую WS (только обновления от других событий)
   - Ответ: updated application row
3. `GET /api/applications/fields`
   - Public (no auth)
   - Ответ: 5 полей с ключами:
     - `APPLICATION_FIELD_1..5`
     - `APPLICATION_FIELD_1_PLACEHOLDER..5_PLACEHOLDER`
     - `APPLICATION_FIELD_1_STYLE..5_STYLE`
   - Для каждого возвращается: `{ key, label, placeholder, style }`
4. `PATCH /api/applications/fields`
   - Auth: Lucia session
   - Body: `{ fields: Array<{ key, label, placeholder?, style? }> }`
   - Upsert в `system_settings`
5. `GET /api/applications/:id/messages`
   - Auth: Lucia session
   - Ответ: `interview_messages` по `applicationId`, order by `createdAt` asc
6. `POST /api/applications/:id/messages`
   - Auth: Lucia session
   - Body: `{ content: string }`
   - Side effects:
     - вставка в `interview_messages` (senderType=`admin`)
     - bot IPC: `POST /ipc/send-interview-message/:applicationId` с `{ content, adminUsername }`
     - Emits (WS):
       - `interview_message_<id>`
       - `applications_refresh`
   - Ответ: inserted message row
7. `POST /api/applications/ipc/bot-event`
   - Вход для bot->backend IPC
   - Body: `{ event: string, payload: any }`
   - Emits (WS):
     - `event === 'interview_ready'` => `applications_refresh`
     - `event === 'new_message'` => `interview_message_${payload.applicationId}`, `applications_refresh`

### Members (prefix `/api/members`)
1. `GET /api/members/`
   - Auth: Lucia session
   - Ответ: `members` где `status = 'active'`, order by joinedAt desc
2. `GET /api/members/kicked`
   - Auth: Lucia session
   - Ответ: `members` где `status in ('kicked','blacklisted')`
3. `GET /api/members/:id`
   - Auth: Lucia session
   - Ответ: member row
4. `PATCH /api/members/:id`
   - Auth: Lucia session
   - Body:
     - `gameNickname?`, `gameStaticId?`
     - `role?`: `NEWKINGSIZE|KINGSIZE`
     - `tier?`: `TIER 1|TIER 2|TIER 3|БЕЗ TIER`
   - Side effects:
     - при смене никнейма: bot Discord `PATCH /guilds/.../members/:user/` (setNickname)
     - при смене `role/tier`: обновление Discord ролей (remove/add) + авто-обновление event participants tier и refresh embed через IPC
   - Emits: refresh event embeds via IPC, но WS прямо не эмитится
5. `POST /api/members/:id/exclude`
   - Auth: Lucia session
   - Body: `{ reason: string, blacklist?: boolean }` (reason валидируется, но фактически не используется в БД напрямую)
   - Side effects:
     - remove NEWKINGSIZE/KINGSIZE/TIER1/TIER2/TIER3
     - если blacklist: add BLACKLIST
     - update `members.status` -> `kicked` или `blacklisted`
     - update связанной `applications.status` -> `excluded` или `blacklist`
6. `POST /api/members/:id/unblacklist`
   - Auth: Lucia session
   - Side effects:
     - remove BLACKLIST role
     - update `members.status` -> `kicked`
     - update связанной `applications.status` -> `excluded`

### AFK (prefix `/api/afk`)
1. `GET /api/afk/`
   - Query: `status?` in `active|ended`
   - No auth
   - Ответ: `afkEntries` order by `startsAt` desc
2. `POST /api/afk/:id/end`
   - Auth: Lucia session
   - Requires admin role label in `['BOT OWNER','OWNER','.', 'DEP', 'HIGH']`
   - Side effects:
     - update `afkEntries` status -> `ended`, set `endedByType='admin'`, `endedByAdmin`, `endedAt`
   - Emits: нет WS; embed может обновляться cron-логикой/ботом

### Maps (prefix `/api/maps`)
1. `GET /api/maps/`
   - Public (no auth)
2. `POST /api/maps/`
   - Auth: Lucia session + `requireAdmin` (labels in `['BOT OWNER','OWNER','.', 'DEP', 'HIGH']`)
   - Body: `{ name: string, imageUrl: string }`
   - Insert into `event_maps`
3. `DELETE /api/maps/:id`
   - Auth: Lucia session + `requireAdmin`
   - Delete from `event_maps`

### Activity (prefix `/api/activity`)
1. `GET /api/activity/overview`
   - Auth: Lucia session + `hasAdminPanelAccess`
   - Ответ: активные члены + info forumUrl + количество скриншотов (до `MAX_SCREENSHOTS=30`)
2. `GET /api/activity/:memberId/screenshots`
   - Auth: Lucia session + `hasAdminPanelAccess`
   - Limit: 30, order by `createdAt` asc
3. `POST /api/activity/ipc/bot-event`
   - Bot->backend IPC
   - Body: `{ memberId?: string }` optional
   - Emits: `activity_refresh` (без payload)

## 2. WebSocket events (socket.io)

Источник: `src/backend/server.ts` и эмиты из контроллеров `src/backend/features/applications/controller.ts` и `src/backend/features/activity/controller.ts`.

1. `applications_refresh` : void
2. `activity_refresh` : void
3. `interview_message_<applicationId>` : payload = inserted/received `interview_messages` row

## 3. Discord Interactions (`customId`) и обработчики

Роутинг взаимодействий находится в `src/bot/handlers/eventHandler.ts`.

### Buttons
1. `ticket_apply_btn`
   - handler: `handleTicketApplyBtn` (`src/bot/events/interactions/ticketButton.ts`)
   - показывает modal `ticket_apply_modal`
2. `afk_start_btn`
   - handler: `handleAfkStartBtn` (`afkButton.ts`)
   - показывает modal `afk_start_modal`
3. `afk_end_btn`
   - handler: `handleAfkEndBtn` (`afkButton.ts`)
4. `event_create_btn`
   - handler: `handleEventCreateBtn` (`event/eventCreate.ts`, реэкспорт из `eventInteractions.ts`)
   - modal id: `event_create_modal` (raw RadioGroup)
5. `event_*_<eventId>` (button)
   - handlers: `handleEventActionBtn` (`event/eventActionButtons.ts`, реэкспорт из `eventInteractions.ts`)
   - action форматы:
     - `event_join_<eventId>`
     - `event_leave_<eventId>`
     - `event_manage_<eventId>`
     - `event_close_<eventId>`
     - `event_setgroup_<eventId>`
     - `event_selectmap_<eventId>` (MCL/ВЗЗ только)
6. `activity_upload_<memberId>`
   - handler: `handleActivityUploadBtn` (`activityInteractions.ts`)
7. `interview_ready_<applicationId>`
   - handler: `handleInterviewReadyBtn` (`interviewReady.ts`)

### Modals (ModalSubmit)
1. `ticket_apply_modal`
   - handler: `handleTicketApplyModal` (`ticketModalSubmit.ts`)
2. `afk_start_modal`
   - handler: `handleAfkModalSubmit` (`afkModalSubmit.ts`)
3. `event_create_modal`
   - handler: `handleEventCreateModalSubmit` (`event/eventCreate.ts`, реэкспорт из `eventInteractions.ts`)
   - raw components:
     - RadioGroup: `event_type_radio` values: `MCL|ВЗЗ|Capt`
     - TextInput: `timeInput`, `dateInput` (optional), `slotsInput`
4. `event_setgroup_modal_<eventId>`
   - handler: `handleEventSetGroupModalSubmit` (`event/eventSetGroupModalSubmit.ts`)
   - TextInput: `groupCodeInput`
5. `event_map_modal_<eventId>`
   - handler: `handleEventMapModalSubmit` (`event/eventMapModalSubmit.ts`)
   - raw RadioGroup: `map_radio` values = `event_maps.id`

## 4. IPC endpoints (HTTP inside docker/host)

Текущая реализация использует настраиваемые переменные окружения:
- `IPC_BOT_BASE_URL` (backend -> bot IPC server)
- `IPC_BACKEND_BASE_URL` (bot -> backend REST endpoints)
- `IPC_BOT_LISTEN_HOST` (где бот слушает HTTP IPC сервер, для Docker должен быть `0.0.0.0`)

### Bot IPC server (listening on port 3001)
1. `POST /ipc/refresh-event/:eventId`
   - body: none
   - side effects: bot fetches event row + edits original event message embed
2. `POST /ipc/send-interview-dm/:applicationId`
   - body: none
   - side effects: bot sends DM to `applications.discordId` with button `interview_ready_<id>`
3. `POST /ipc/send-interview-message/:applicationId`
   - body: `{ content: string, adminUsername?: string }`
   - side effects: bot sends admin message embed to user DM
4. `POST /ipc/create-activity-thread/:memberId`
   - body: none
   - side effects: bot ensures forum thread + sends DM with button `activity_upload_<memberId>`

### Backend IPC receive endpoints (under REST)
1. `POST /api/applications/ipc/bot-event`
   - body: `{ event: 'interview_ready'|'new_message', payload: any }`
2. `POST /api/activity/ipc/bot-event`
   - body: `{ memberId?: string }` optional

## 5. Embeds & panels (что создаёт/обновляет бот)

### Panel deployer (`src/bot/lib/embedDeployer.ts`)
Функция: `checkAndDeployEmbeds(client)`
- Читает `system_settings` и развертывает сообщения в указанные каналы.

Панели (1 сообщение/2 сообщения для AFK):
1. Tickets panel
   - system_settings:
     - `TICKETS_CHANNEL_ID`
     - `TICKETS_MESSAGE_ID` (message id хранится в `system_settings`)
   - Button: `ticket_apply_btn`
2. Events panel
   - `EVENTS_CHANNEL_ID`
   - `EVENTS_MESSAGE_ID`
   - Button: `event_create_btn`
3. Online status panel
   - `ONLINE_CHANNEL_ID`
   - `ONLINE_MESSAGE_ID`
   - Обновление: `refreshServerOnlineEmbed` (по cron каждые 30s)
4. AFK panel (special: 2 messages)
   - `AFK_CHANNEL_ID`
   - first message contains button: `afk_start_btn` and static text
   - second message id stored as `AFK_MESSAGE_ID`
   - button in second message: `afk_end_btn`

### AFK embed (`src/bot/lib/afkEmbed.ts`)
- `refreshAfkEmbed(client)`
  - edits message `AFK_MESSAGE_ID`
  - list активных `afkEntries` (formatted)
- `checkExpiredAfks(client)`
  - переводит expired active AFK в `ended` и вызывает `refreshAfkEmbed`

### Server online embed (`src/bot/lib/serverStatusEmbed.ts`)
- `refreshServerOnlineEmbed(client)`
  - edits message `ONLINE_MESSAGE_ID`
  - fetch external API: `https://api.majestic-files.net/meta/servers?region=ru`

### Event roster embed (`src/bot/events/interactions/event/eventEmbedPayload.ts`, реэкспорт из `eventInteractions.ts`)
- `refreshEventEmbed(message, eventId)`
  - edits original message `events.messageId`
  - отображает списки:
    - main list up to `events.slots`
    - reserve list overflow
    - status: Open / InProgress / Closed (InProgress computed by time)
  - buttons:
    - join/leave/manage (disabled когда InProgress/Closed)
    - if MCL/ВЗЗ and `events.mapId` set => добавляется MediaGallery (raw type 12)

### Interview flow embeds
- Ticket submit DM: embed title `📩 Заявка отправлена`
- Interview-ready DM: embed title `📞 Обзвон назначен` + button `interview_ready_<id>`
- After button: edited embed title `📞 Вы готовы к обзвону`
- Admin messages DM: embed author = adminUsername + description = message content

### Activity sync embeds
- Forum thread creation: initial thread message content “Здесь размещается активность...”
- DM to member:
  - embed title: `📩 Активность`
  - button: `activity_upload_<memberId>`
- Screenshot sync:
  - posts into forum thread: embed title `Активность` with image url

## 6. Discord event handlers (бот, рантайм)

Обработчики Discord-событий зарегистрированы в `src/bot/handlers/eventHandler.ts`.

### `messageDelete`
- Обнаруживает удаление управляемых embed-сообщений (TICKETS_MESSAGE_ID, AFK_MESSAGE_ID, EVENTS_MESSAGE_ID, ONLINE_MESSAGE_ID).
- Сбрасывает соответствующий `system_settings` key в `null` для авто-переотправки.
- Немедленно вызывает `checkAndDeployEmbeds(client)`.

### `guildMemberUpdate`
1. **Авто-отзыв сессий**: если у пользователя снята admin-роль и не осталось других admin-ролей — все `sessions` этого пользователя удаляются.
2. **Авто-синхронизация состава семьи**:
   - Если у пользователя есть KINGSIZE/NEWKINGSIZE — создаёт/обновляет `members` (role, tier, status).
   - Если tier изменился — обновляет `event_participants.tier` в незакрытых мероприятиях и обновляет embed через IPC.
   - При получении роли семьи впервые — создаёт activity thread через IPC.
   - Если роль семьи утрачена — устанавливает `members.status = 'kicked'`, `tier = 'NONE'`, `kickReason = 'Утеряна роль семьи'`, `kickedAt = now`.

### `guildMemberRemove`
- Если покинувший сервер пользователь есть в `members` со `status = 'active'`:
  - Пытается прочитать audit log (`AuditLogEvent.MemberKick`, limit 5, в окне 10 сек) для определения причины кика.
  - Если найден audit-запись — `kickReason = auditLog.reason` (или `'Кикнут (причина не указана)'`).
  - Если не найден — `kickReason = 'Покинул сервер'`.
  - Обновляет: `status = 'kicked'`, `tier = 'NONE'`, `kickReason`, `kickedAt = now`.
  - Обновляет связанную `applications.status = 'excluded'`.

### `guildBanAdd`
- Если забаненный пользователь есть в `members` и `status != 'blacklisted'`:
  - Получает причину бана через `guild.bans.fetch(user.id)`.
  - Обновляет: `status = 'blacklisted'`, `tier = 'NONE'`, `kickReason = ban.reason`, `kickedAt = now`.
  - Обновляет связанную `applications.status = 'blacklist'`.
- Требует intent `GuildModeration`.

### `guildMemberAdd`
- Если вступивший пользователь есть в `members` со `status = 'blacklisted'` — автоматически добавляет роль BLACKLIST.

### `messageCreate` (DM)
- Приоритет: сначала `handleActivityDmMessage` (загрузка скриншотов активности), потом обработка интервью-сообщений.
- Интервью: находит активную заявку со статусом `interview|interview_ready`, сохраняет сообщение в `interview_messages`, уведомляет backend через IPC (`new_message`), ставит реакцию ✅.

### `messageCreate` (guild threads)
- Обрабатывает сообщения в тредах активности через `handleActivityForumMessage`.

### Background intervals (`ClientReady`)
- `checkExpiredAfks` — каждые **60s**, переводит просроченные AFK в `ended`
- `refreshServerOnlineEmbed` — каждые **30s**, обновляет онлайн-статус серверов
- `checkAndDeployEmbeds` — каждые **15s**, деплоит/обновляет панели
- Reconcile activity threads — каждые **300s**, удаляет из БД threads, удалённые из Discord
- Auto-refresh event embeds — каждые **30s**, обновляет embed при переходе Open → InProgress

### Guild lock
- При старте бот читает `GUILD_ID` из `system_settings` и покидает все серверы, не совпадающие с ним.
- Все interaction из неавторизованных серверов игнорируются (DM разрешены).

## 7. Важные `system_settings.key`

Используются в рантайме (read/write):
- `GUILD_ID` (Discord guild id)
- `TICKETS_CHANNEL_ID`, `TICKETS_MESSAGE_ID`
- `EVENTS_CHANNEL_ID`, `EVENTS_MESSAGE_ID`
- `ONLINE_CHANNEL_ID`, `ONLINE_MESSAGE_ID`
- `AFK_CHANNEL_ID`, `AFK_MESSAGE_ID`
- `ACTIVITY_FORUM_CHANNEL_ID`
- `APPLICATION_FIELD_1..5`
- `APPLICATION_FIELD_1_PLACEHOLDER..5_PLACEHOLDER`
- `APPLICATION_FIELD_1_STYLE..5_STYLE`

## 8. Где всё это живёт (для навигации)

- REST API: регистрация в `src/backend/server.ts`, routes-обёртки — `src/backend/routes/*.ts`, бизнес-логика — `src/backend/features/*/controller.ts`
- WebSocket emits: `src/backend/features/applications/controller.ts`, `src/backend/features/activity/controller.ts`
- Discord interaction routing: `src/bot/handlers/eventHandler.ts`
- Panels/embeds deploy+refresh: `src/bot/lib/embedDeployer.ts`, `src/bot/lib/afkEmbed.ts`, `src/bot/lib/serverStatusEmbed.ts`
- Embed builders: `src/bot/embeds/panels/`, `src/bot/embeds/afk/`, `src/bot/embeds/online/`
- Event interactions (barrel): `src/bot/events/interactions/eventInteractions.ts` → реэкспортирует из `src/bot/events/interactions/event/` (`eventCreate.ts`, `eventActionButtons.ts`, `eventSetGroupModalSubmit.ts`, `eventMapModalSubmit.ts`, `eventEmbedPayload.ts`, `eventShared.ts`)
- Activity interactions: `src/bot/events/interactions/activityInteractions.ts` (основной модуль); `src/bot/events/interactions/activity/` — вспомогательные файлы (WIP рефакторинг, пока не подключены)
- Прочие interactions: `src/bot/events/interactions/ticketButton.ts`, `ticketModalSubmit.ts`, `afkButton.ts`, `afkModalSubmit.ts`, `interviewReady.ts`
- IPC: бот внутри `src/bot/index.ts`, backend IPC receive — `src/backend/features/applications/controller.ts` и `src/backend/features/activity/controller.ts`
- DB schema: `src/db/schema.ts`, seed: `src/db/seed.ts`

