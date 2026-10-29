# Wolfchatter

A map-based chat app built with Vue 3, Pinia, Leaflet, Node.js/Express, MongoDB, and native WebSockets.

## Run with Docker

```powershell
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
To develop the backend outside Docker, stop only the app container (`docker compose stop app`), copy `backend/.env.example` to `backend/.env`, and run `npm run dev` in `backend`.

Use the same hostname and browser profile to retain your anonymous identity. `localhost` and `127.0.0.1` have separate cookies. Sessions expire after 180 days; display names are not login credentials.

## Structure and responsibilities

```text
frontend/src/
  components/map/       Leaflet map and clustered pins
  components/chat/      Window/header, message list/composer, minimized sidebar
  components/rooms/     Separate create/edit dialogs with a shared RoomForm
  composables/          Reactive UI behavior (dragging)
  stores/               Session, window layout/drafts, chat data/coordinator
  clients/              HTTP and WebSocket transport
  services/             Room, message and profile API operations
  utils/                Pure color and message-reconciliation helpers

backend/src/
  routes/               HTTP endpoint declarations and route-level limits
  controllers/          HTTP request/response adaptation
  types/                User, room, message and repository interfaces
  errors/               Application error classes
  schemas/              Request validation
  services/             Rooms, messages, profile rules, history/retry coordination
  repositories/         MongoDB queries and atomic updates
  middleware/           Consistent HTTP error handling
  helpers/              Document/response mapping, cursors and persistence helpers
  app.ts                Express application configuration
  index.ts              Database/server startup and graceful shutdown
  db.ts                 Database connection, document types, indexes
  identity.ts           Session cookie/bootstrap and authenticated HTTP middleware
  realtime.ts           WebSocket validation, subscriptions, delivery, cleanup
```

Components display data and handle interaction. Stores coordinate shared state through services; utilities contain pure functions. Session and window stores own their state; the chat store composes them and coordinates history/live updates. No router is needed for the current single workspace.

Vue files use template, script, then scoped styles. Component-specific CSS lives with its component; `src/styles/` contains scoped shared panel/dialog surfaces, form controls, and feedback styles. `style.css` contains only page defaults, common element behavior, and accessibility utilities. Leaflet-generated markers use deep selectors anchored to the map component. Room theme variables inherit from chat windows into their child components.

Backend services receive repository interfaces rather than a database connection. Records crossing that boundary use string IDs and ordinary dates. MongoDB filters, ObjectId conversion, cursor query ordering, and duplicate-key error translation live in repository adapters. The message service validates pagination, decodes cursors, and assembles history responses; cursor utilities perform no persistence. Routes and identity setup wire the concrete adapters into services. WebSocket room-existence checks also use the room repository.

HTTP writes are persisted before WebSocket broadcasts. Room creation and message submission use idempotency keys; room edits use revisions to reject stale updates. Only the creator can edit a room. The WebSocket connection supports multiple room subscriptions and reconnects with history reconciliation, without periodic polling.

Creators can choose **Edit → Delete chatroom…**, then confirm deletion. `DELETE /api/rooms/:id` enforces creator ownership, removes the room's messages, and clears saved last-room references. The pin and open/minimized chats disappear through `room.deleted` events; reconnect/history refresh also removes rooms deleted while offline. The room document is retained with `deletedAt` as a tombstone, excluded from normal reads and map/nearby queries. This preserves ownership and creation keys for safe cleanup retries and prevents old create requests from resurrecting the room. There is no restore action. An in-flight message write checks room availability and removes itself if deletion won the race.

MongoDB persists users, sessions, rooms, and messages. Pinia keeps transient frontend state in memory; drafts and window positions are not persisted. The geographic index and nearby API exist; user-facing name/city/coordinate search remains planned in `BACKLOG.md`.

The current realtime fan-out is in-process. Multiple app replicas would require a shared event broker; this refactor retains the single-process deployment.

## Verification

```powershell
npm --prefix frontend run build
npm --prefix frontend test
npm --prefix backend test
# Requires the Docker app and database running:
npm --prefix backend run test:integration
```

Integration tests create diagnostic rooms/messages and preserve existing records. The UI supports multiple chats, minimizing/closing, dragging, and double-clicking a chat header to focus its pin. Window activation and closing do not recenter the map.

## Environment

See `backend/.env.example` for host development. Compose configures its own container environment. Production hosting should provide HTTPS and set `COOKIE_SECURE=true` with the actual frontend origins in `ALLOWED_ORIGINS`.
