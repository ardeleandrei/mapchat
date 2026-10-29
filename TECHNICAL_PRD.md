# Wolfchatter — Technical PRD

Status: implemented architecture and scope · 29 October 2026

## Goal and scope

Build a map chat application following the supplied mockups, extended with multiple floating chat windows. Clicking empty map space prompts for a room name, then creates a persistent pin and opens its chat. Existing pins open or restore their chat. Rooms and messages survive browser sessions and server restarts, with real-time delivery between connected browsers.

The backend is a standalone Node.js server. Docker provides a portable runtime; Azure Functions and Azure-managed hosting are not requirements. Azure AI Search is a possible future integration, outside the initial release.

## Functional requirements

1. Initially show an interactive map and an empty panel saying “Click on the map to start a chat.” Support map pan and zoom with visible attribution to the map-data/tile provider.
2. Clicking empty map space opens a dialog prefilled with “New chatroom”; confirming creates a persistent room at that coordinate. Dragging or clicking map controls must not create rooms. The creator can edit its title and color, updating the matching pin and pastel window. Nearby pins cluster into numbered groups.
3. Clicking an existing marker selects its room and loads its messages without creating another pin. Keep rooms' histories separate; late responses for a previously selected room must not overwrite the current panel.
4. Provide a display-name input, single-line message input, and submit button. Trim inputs; require a name of 1–40 characters and message text of 1–2,000 characters. Render user content as plain text, with author and timestamp; Enter submits.
5. Save profiles, rooms, and messages on the server. An HttpOnly anonymous session cookie restores the visitor, display name, and last selected room. Pinia holds current state in memory; drafts and complete window arrangements are not persisted. Handle missing saved rooms gracefully.
6. Deliver saved messages live to all open/minimized room subscriptions. Closing removes a subscription. Reconnect with backoff and reconcile missed history across pages. Show loading, sending, failed-send, and disconnected states; retain drafts for retry during the current page session.
7. Use draggable floating windows with solid room-colored borders and translucent pastel backgrounds; minimize to a sidebar or close independently. Double-clicking a header focuses the corresponding pin. Window activation/closing must not pan the map. Keep history scrollable and controls labeled.
8. Creators can delete their rooms after explicit confirmation. Enforce ownership on the backend, remove messages and saved last-room references, and broadcast deletion to remove pins/windows for all visitors. Retain a room tombstone for retry safety; no restore UI is provided.

## Stack and application structure

- **Frontend:** Vue 3, TypeScript, Vite, Leaflet/marker clustering, and plain CSS. Separate map/chat/dialog components, composables, typed HTTP services, WebSocket transport, and pure utilities. Pinia has session, window/draft, and chat stores; chat coordinates history and live delivery. No router is required for the single workspace.
- **Backend:** Node.js on an active LTS release, TypeScript, Express for HTTP, `ws` for WebSockets, Zod for request/event validation, and the official MongoDB driver. Separate transport handlers, room/message services, and database access. Use one shared MongoDB connection pool per process.
- **Repository:** `frontend/` and `backend/`, plus root Docker/configuration files. Backend routes/controllers adapt HTTP requests; services enforce business rules; repositories handle MongoDB queries; schemas, middleware, and DTO utilities are separate. Application configuration is separate from startup/shutdown. `shared/` is currently a reserved placeholder, not an active shared package. Start with one server process and one MongoDB instance.
- **Runtime:** A multi-stage Dockerfile compiles Vue and the server; the production Node process serves static frontend assets, `/api`, and `/ws` from one origin. Docker Compose starts `app` and `mongodb`, with a named persistent database volume and health checks. Development uses Vite hot reload with HTTP/WebSocket proxying.

## Data model and queries

| Collection | Stored fields and indexes |
| --- | --- |
| `rooms` | `_id`, `title`, optional `color`, `createdBy`, `revision`, creation key/original title, GeoJSON `location` with `[longitude, latitude]`, `createdAt`. Geographic and unique creation-key indexes. |
| `messages` | `_id`, `roomId`, `userId`, `clientMessageId`, `username`, `text`, `createdAt`. Room/user history indexes; unique `(roomId, clientMessageId)` prevents duplicate submissions. |
| `users`, `sessions` | Visitor display name, last room, and hashed session tokens with 180-day expiry. Session expiration has a TTL index. |

The server assigns IDs and UTC timestamps, verifies room existence, and validates longitude/latitude ranges. Messages remain separate documents so room records do not grow with history. Load pins within map bounds with a bounded result count and a flag when results are truncated; nearby-room queries use the geographic index. Handle map bounds crossing the antimeridian. Geo queries return coordinate data directly to Leaflet; no search service is required.

## HTTP API and live delivery

| Endpoint | Contract |
| --- | --- |
| `GET /api/rooms?bbox=west,south,east,north` | Return bounded room summaries/pins; debounce viewport requests. |
| `POST /api/rooms` | Accept coordinates; persist and return the new room. Use an idempotency key for safe retries. |
| `GET /api/rooms/:id/messages?before=cursor&limit=50` | Return the latest history page or older messages, with stable ordering and an opaque continuation cursor. |
| `POST /api/rooms/:id/messages` | Accept text and a client-generated UUID; use the session profile's name, persist, and reuse the result on retry. |
| `GET/PATCH /api/me`, `GET /api/me/messages` | Bootstrap/restore session, update profile/last room, query the visitor's messages. |
| `PATCH /api/rooms/:id` | Creator-only title/color update with revision conflict protection. |
| `DELETE /api/rooms/:id` | Creator-only deletion; remove messages, clear saved room references, emit `room.deleted`. Owner retries are idempotent. |
| `GET /api/rooms/:id`, `GET /api/rooms/nearby` | Read a room or query nearby rooms using the geographic index. |
| `GET /api/health` | Report backend/database readiness. |

Use HTTP for writes and history; `/ws` carries room-set subscription commands and server events (`room.created`, `room.updated`, `message.created`). Validate the session and Origin on connection. Broadcast pin/metadata updates to connected clients and messages only to room subscribers. Acknowledge subscriptions, merge live/history records by server ID, and reconcile all missed history pages after reconnect. No periodic HTTP polling is used.

Persist before broadcasting; a broadcast failure must not turn an already saved message into a failed write. History is authoritative, and refresh/reconnect repairs missed events. Immediate live delivery across a server crash is not guaranteed. Use heartbeat checks to remove dead sockets and limit socket payloads, subscriptions, and outbound buffering. Multiple server replicas require shared event distribution (for example Redis); this is deferred, not supplied by an in-memory room map.

## Operational boundaries and acceptance

Display names are unverified labels; accounts, private rooms, moderation, attachments, and guaranteed offline delivery are out of scope. Apply request/body limits, write/socket rate limits, and an Origin allowlist. MongoDB is available inside Compose and bound to loopback port 27018 for local Compass access. Store secrets in ignored environment files, provide `.env.example`, and use HTTPS/WSS at deployment. The named volume persists data; removing it deletes history. User-facing name/city/coordinate search remains deferred in `BACKLOG.md`.

Before acceptance, verify: two pins create distinct rooms; selecting a pin changes title/history; messages persist after browser and container restarts; two browsers receive messages only for the selected room; reconnect recovers missed history; retries create no duplicate rooms/messages; invalid input and unavailable MongoDB produce usable errors. Use focused API/database integration tests and a browser test of the two-client flow. A fresh checkout must run with documented environment setup and `docker compose up --build`.
