# Wolfchatter

A map-based chat app built with Vue 3, Pinia, VueUse, Leaflet, Node.js/Express, MongoDB, and native WebSockets.

## Run with Docker

```powershell
# First checkout only; keep your existing .env if already configured:
Copy-Item .env.example .env
docker compose up --build -d --wait
```

Open http://127.0.0.1:3000. MongoDB Compass can connect to `mongodb://127.0.0.1:27018/wolfchatter`.
MongoDB data lives in the named `mongodb_data` volume and survives container restarts/rebuilds. Removing that volume deletes the data.

## Development

Use Node.js 24. Install dependencies with `npm ci` inside `frontend` and `backend`.
Run the Docker app/database first, then start the frontend with hot reload:

```powershell
cd frontend
npm run dev
```

Open http://127.0.0.1:5173. Vite proxies `/api` and `/ws` to the Docker backend on port 3000.
To develop the backend outside Docker, stop only the app container (`docker compose stop app`) and run `npm run dev` in `backend`. Both Node and Vite read the root `.env`.

## Accounts and sessions

Use **Sign in / Create account** beside the map controls. Guests can read rooms and live messages; creating/editing/deleting rooms and sending messages require sign-in. Registration asks for a unique username and a password of 8–128 characters. It upgrades the current guest profile without changing its user ID. Sign into another browser with the same credentials to recover your identity, room ownership, and last selected room.

Passwords are stored as salted Argon2id hashes (`@node-rs/argon2`, 19 MiB memory, 2 iterations, parallelism 1). Passwords and hashes are never included in public profile responses. Login verifies the password, then rotates a random session token; MongoDB stores only its SHA-256 hash. Sessions last 30 days. The browser holds an HttpOnly, SameSite=Lax cookie, with Secure enabled for HTTPS production. `localhost` and `127.0.0.1` have separate cookies, but both can sign into the same account.

Users are stored in MongoDB. Registering or saving a username reserves its normalized key with a unique index: case, repeated whitespace, and Unicode compatibility variants compare equally. Another visitor receives HTTP 409, including during simultaneous claims; control/hidden characters are rejected. Login uses the same comparison rules. Message creation also verifies ownership of the current name. Failed claims preserve the profile and draft. Renaming changes your sign-in username and releases the previous name; historical messages retain their original author ID and name snapshot.

Use the profile button beside the map controls, or **Edit profile** in a chat, to change your username or sign out. Changes are saved explicitly and apply to every chat. Composers display the current name; sending a message does not edit your profile. Canceling or a failed save preserves the current profile and drafts. Sign-out revokes only this browser's session, closes its WebSocket, and clears in-memory windows/drafts. Other signed-in browsers remain connected. Account switching ignores stale HTTP/WebSocket responses from the previous identity.

`POST /api/auth/register`, `/api/auth/login`, and `/api/auth/logout` manage accounts/sessions; `GET /api/me` bootstraps a guest or restores the current user (`registered` indicates account status). Mutating requests must send `X-Wolfchatter-Request: 1`; the frontend HTTP client supplies it. Origin/Sec-Fetch-Site checks and same-origin custom-header enforcement protect cookie-authenticated writes, including login/logout. Login and registration share a 20-request/15-minute IP limit. Invalid login responses do not reveal whether a username exists. Database startup creates indexes; there are no migrations. Password changes, forgotten-password recovery/email verification, MFA, and protection against every visually similar Unicode character are outside this version.

## Structure and responsibilities

```text
frontend/src/
  components/map/       Leaflet map and clustered pins
  components/chat/      Window/header, message list/composer, minimized sidebar
  components/rooms/     Separate create/edit dialogs with a shared RoomForm
  components/profile/   Account registration/login, profile editing and sign-out
  composables/          Reactive UI behavior (dragging)
  stores/               Session, window layout/drafts, chat data/coordinator
  clients/              HTTP and WebSocket transport
  services/             Room, message, profile and authentication API operations
  utils/                Pure color and message-reconciliation helpers

backend/src/
  routes/               HTTP endpoint declarations and route-level limits
  controllers/          Chat, authentication, session bootstrap and profile handlers
  types/                User, room, message and repository interfaces
  errors/               Application error classes
  schemas/              Request validation
  services/             Chat (rooms/messages/read tracking), authentication, sessions, profiles
  repositories/         MongoDB queries and atomic updates
  middleware/           Session authentication, request protection and error handling
  helpers/              Document/response mapping, cursors and persistence helpers
  app.ts                Express application configuration
  index.ts              Database/server startup and graceful shutdown
  db.ts                 Database connection, document types, indexes
  websocket.ts           WebSocket validation, subscriptions, delivery, cleanup
```

Components display data and handle interaction. Stores coordinate shared state through services; utilities contain pure functions. Session and window stores own their state; the chat store composes them and coordinates history/live updates. No router is needed for the current single workspace.

VueUse supplies pointer dragging, resize observation, debounced map-bound updates, and lifecycle-managed browser event listeners. `useDraggablePanel` wraps it with keyboard movement, viewport margins, initial window placement, and header-button exclusions. Dialogs, forms, and chat windows remain custom Vue components.

Vue files use template, script, then scoped styles. Component-specific CSS lives with its component; `src/styles/` contains scoped shared panel/dialog surfaces, form controls, and feedback styles. `style.css` contains only page defaults, common element behavior, and accessibility utilities. Leaflet-generated markers use deep selectors anchored to the map component. Room theme variables inherit from chat windows into their child components.

Backend services receive repository interfaces rather than a database connection. Records crossing that boundary use string IDs and ordinary dates. MongoDB filters, ObjectId conversion, cursor query ordering, and duplicate-key error translation live in repository adapters. The chat service owns room operations, message submission/history, and read tracking. It validates pagination, decodes cursors, and assembles history responses; cursor utilities perform no persistence. Application setup wires concrete repositories, services, controllers, and routes. The session service creates, validates, and revokes sessions for both HTTP and WebSockets. Auth middleware attaches the current user and enforces request protection; controllers handle cookie responses and session bootstrap. WebSocket room-existence checks also use the room repository.

HTTP writes are persisted before WebSocket broadcasts. Room creation and message submission use idempotency keys; room edits use revisions to reject stale updates. Only the creator can edit a room. The WebSocket connection supports multiple room subscriptions and reconnects with history reconciliation, without periodic polling. Logout and shutdown also reject handshakes waiting on database work. A read request that loses a race with room deletion returns 404 and cleans up its marker.

Creators can choose **Edit → Delete chatroom…**, then confirm deletion. `DELETE /api/rooms/:id` enforces creator ownership, removes the room's messages, and clears saved last-room references. The pin and open/minimized chats disappear through `room.deleted` events; reconnect/history refresh also removes rooms deleted while offline. The room document is retained with `deletedAt` as a tombstone, excluded from normal reads and map/nearby queries. This preserves ownership and creation keys for safe cleanup retries and prevents old create requests from resurrecting the room. There is no restore action. An in-flight message write checks room availability and removes itself if deletion won the race.

MongoDB persists users, sessions, rooms, messages, and per-user room read positions. The sidebar has two sections. **My Chatrooms** lists every room created by the user, independent of map bounds and the 20-open-window limit; these entries remain while windows are open, minimized, or closed, and disappear only when the room is deleted. **Recent Chats** lists the latest 20 rooms where the user sent a message, ordered by their latest message. It can contain both owned rooms and other people's rooms, including the same room shown under My Chatrooms. Recent activity is derived from saved messages and restored on login/reload. Manually minimized windows remain accessible in Recent Chats during the page session, even if the visitor has only read them. Entries have no close button.

Each sidebar entry shows its room's unread badge, hidden at zero and capped at **99+**. Duplicate entries in both sections share the same count. Unread means messages from other users newer than the saved read position. A visible open chat is marked read through the latest message loaded into its view; minimized chats and hidden browser tabs retain unread messages. Read positions advance monotonically in MongoDB and synchronize across signed-in browsers. Sockets receive updates for created rooms and the latest 20 recently messaged rooms even without open windows; new messages by the same user also synchronize recent activity across browsers. Other windows use explicit room subscriptions. WebSocket events trigger batched unread-count refreshes, with no periodic polling. HTTP/history retries cannot double-count saved messages.

`GET /api/me/rooms` paginates created rooms; `GET /api/me/rooms/recent?limit=20` returns recently messaged rooms (maximum 50); `GET /api/me/unread?roomIds=...` returns up to 100 per-room counts, capped at 100 for display; `POST /api/rooms/:id/read` accepts a message ID from that room and advances the current user's read marker. Room deletion also removes read markers and excludes the room from recent results. Pinia keeps drafts in memory. Window positions are saved per user and room in local browser storage, restored after closing/reloading, and clamped to the current viewport. First-time windows open near the center with a small offset between new windows. The geographic index and nearby API exist; user-facing name/city/coordinate search is deferred.

The current WebSocket fan-out is in-process. Additional running copies of the backend would require a shared event broker; this version retains the single-process deployment.

## Verification

```powershell
npm --prefix frontend run build
npm --prefix frontend test
npm --prefix backend test
# Requires the Docker app and database running:
npm --prefix backend run test:integration
# Isolated unread tests: temporary MongoDB database, removed after the test:
npm --prefix backend run test:unread
```

Integration tests create diagnostic rooms/messages and preserve existing records. The UI supports multiple chats, minimizing/closing, dragging, and double-clicking a chat header to focus its pin. Drag the bottom-left grip to resize a chat (the right edge stays fixed), or focus the grip and use arrow keys (Shift for larger steps). Windows start at 340 × 420 px on desktop, with the existing responsive sizing on small screens. Sizes remain while minimized; closing/reopening or reloading starts with the default size. Room Edit controls are shown only to their creator. Window activation, resizing, and closing do not recenter the map.

## Environment

Copy the root [.env.example](.env.example) to `.env` once and edit it for your machine. `.env` is excluded from Git and Docker build contexts; commit only the example. Shell/deployment variables take precedence. Existing optional `backend/.env` values override root defaults for direct backend runs.

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | Set by Docker/Azure at runtime. Leave it out of the shared file so Vite selects the correct development/build mode. |
| `PORT` | Backend listening port and Docker app host port; default `3000`. |
| `MONGODB_URI` | Database URL for Node running on your machine, or the Atlas URL on Azure. |
| `DOCKER_MONGODB_URI` | Database URL passed to the app container; uses the `mongodb` service hostname locally. |
| `MONGODB_HOST_PORT` | Loopback port published for Compass and direct Node development; default `27018`. |
| `COOKIE_SECURE` | `false` for local HTTP; `true` for production HTTPS. |
| `ALLOWED_ORIGINS` | Comma-separated exact browser origins allowed for HTTP and WebSocket requests. |
| `DEV_FRONTEND_PORT` | Vite development port; default `5173`. |
| `VITE_API_PROXY_TARGET` | Vite's development HTTP/WebSocket backend target. Never put secrets in `VITE_*` variables. |
| `TEST_API_URL` | Optional API integration-test target. |
| `TEST_MONGODB_BASE` | Optional MongoDB host URL for isolated tests; the test appends a temporary database name. |

If you change ports, update matching database/proxy/test URLs and allowed origins. Restart the Node/Vite development processes after editing `.env`; run `docker compose up -d --wait` to apply Compose settings. A rebuild is needed when application code changes, not for these runtime settings.

Azure app settings supply `NODE_ENV=production`, `PORT=3000`, `MONGODB_URI` (Atlas), `COOKIE_SECURE=true`, and the deployed HTTPS origins in `ALLOWED_ORIGINS`. Docker Compose/dev/test settings are local tooling options. The browser uses same-origin `/api` and `/ws`; database credentials stay on the backend.

## Infrastructure and costs

See [INFRASTRUCTURE_COSTS.md](INFRASTRUCTURE_COSTS.md) for the proposed Azure staging/production deployment, monthly cost table, assumptions, and scaling limitations.

## AI setup and code review

[AGENTS.md](AGENTS.md) records the project context, architecture conventions, and AI working rules. [REVIEW_CONFIG.md](REVIEW_CONFIG.md) contains the saved review prompt, scope, severity rules, and commands. The review is an AI self-review by the implementation agent, not an independent audit or hosted review service.

See [REVIEW_REPORT.md](REVIEW_REPORT.md) for the findings and validation results, and [REVIEW_NOTES.md](REVIEW_NOTES.md) for what was fixed or deferred. In particular, Azure proxy/IP handling and load testing remain deployment work; local test success does not establish production readiness or user capacity.
