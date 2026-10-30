# Wolfchatter — Technical PRD

Status: implemented architecture and scope · 30 October 2026

## Goal and scope

Build a map chat application following the supplied mockups, extended with multiple floating chat windows. Clicking empty map space prompts for a room name, then creates a persistent pin and opens its chat. Existing pins open or restore their chat. Rooms and messages survive browser sessions and server restarts, with real-time delivery between connected browsers.

The backend is a standalone Node.js server. Docker provides a portable runtime; Azure Functions and Azure-managed hosting are not requirements. Azure AI Search is a possible future integration, outside the initial release.

## Functional requirements

1. Initially show an interactive map and an empty panel saying “Click on the map to start a chat.” Support map pan and zoom with visible attribution to the map-data/tile provider.
2. Clicking empty map space opens a dialog prefilled with “New chatroom”; confirming creates a persistent room at that coordinate. Dragging or clicking map controls must not create rooms. The creator can edit its title and color, updating the matching pin and pastel window. Nearby pins cluster into numbered groups.
3. Clicking an existing marker selects its room and loads its messages without creating another pin. Keep rooms' histories separate; late responses for a previously selected room must not overwrite the current panel.
4. Provide custom registration/login dialogs and an editable account profile with sign-out. Require a unique username of 1–40 characters and a 8–128 character password. Guests can browse; room mutations and message submission require sign-in. Show the saved name in every composer beside Edit profile, a single-line message input, and submit button. Compare username case, normalized whitespace, and Unicode compatibility forms; reject hidden/control characters. Show conflicts and retain profile/drafts on failure. Messages are 1–2,000 characters, rendered as plain text with author/timestamp; Enter submits.
5. Save accounts, rooms, and messages on the server. Password authentication issues a fresh HttpOnly session cookie; signing into another browser restores the same user ID, ownership, and last room. Guests receive a browsing session and registration upgrades it in place. Pinia holds current state in memory; drafts and the open-window list are not persisted. Window positions are saved per user and room in local browser storage. Logout revokes the current session, closes its socket, and clears private transient state. Handle missing saved rooms gracefully.
6. Deliver saved messages live to all open/minimized room subscriptions. Closing removes a subscription. Reconnect with backoff and reconcile missed history across pages. Show loading, sending, failed-send, and disconnected states; retain drafts for retry during the current page session.
7. Use draggable, resizable floating windows with solid room-colored borders and translucent pastel backgrounds; minimize to a sidebar or close independently. Keep the default 340 × 420 px desktop size and existing responsive initial sizing. Open first-time windows near the center; reopen rooms at their last remembered position, clamped to the current viewport. Provide pointer and keyboard resizing bounded to the viewport. Show room Edit controls only to the creator. Double-clicking a header focuses the corresponding pin. Window activation/resizing/closing must not pan the map. Keep history scrollable and controls labeled.
8. Creators can delete their rooms after explicit confirmation. Enforce ownership on the backend, remove messages and saved last-room references, and broadcast deletion to remove pins/windows for all visitors. Retain a room tombstone for retry safety; no restore UI is provided.
9. After sign-in, show **My Chatrooms** with all created rooms, retained while windows are open/minimized/closed and removed only upon deletion. Below it, **Recent Chats** lists the latest 20 rooms where the user sent a message, including their own and others' rooms, ordered by their latest message. A room can appear in both sections. Restore both lists across sessions without consuming the open-window limit; retain manually minimized windows for access during the current page session. Show shared per-room unread badges, hidden at zero and capped at 99+. Persist read positions; viewing an open chat marks its loaded messages read. Minimized chats and hidden tabs retain unread counts. Synchronize recent activity and unread updates through WebSockets and event-triggered requests, with no polling.

## Stack and application structure

- **Frontend:** Vue 3, TypeScript, Vite, Leaflet/marker clustering, VueUse browser utilities, and plain CSS. Custom map/chat/dialog/form components; composables wrap dragging and resize behavior. Separate typed HTTP services, WebSocket transport, and pure utilities. Pinia has session, window/draft, and chat stores; chat coordinates history and live delivery. No router is required for the single workspace.
- **Backend:** Node.js on an active LTS release, TypeScript, Express for HTTP, `ws` for WebSockets, Zod for request/event validation, and the official MongoDB driver. Separate transport handlers, room/message services, and database access. Use one shared MongoDB connection pool per process.
- **Repository:** `frontend/` and `backend/`, plus root Docker/configuration files. Backend routes/controllers adapt HTTP requests; services enforce business rules; repositories handle MongoDB queries; schemas, middleware, and DTO utilities are separate. Application configuration is separate from startup/shutdown. `shared/` is currently a reserved placeholder, not an active shared package. Start with one server process and one MongoDB instance.
- **Runtime:** A multi-stage Dockerfile compiles Vue and the server; the production Node process serves static frontend assets, `/api`, and `/ws` from one origin. Docker Compose starts `app` and `mongodb`, with a named persistent database volume and health checks. Development uses Vite hot reload with HTTP/WebSocket proxying.

## Data model and queries

| Collection | Stored fields and indexes |
| --- | --- |
| `rooms` | `_id`, `title`, optional `color`, `createdBy`, `revision`, creation key/original title, GeoJSON `location` with `[longitude, latitude]`, `createdAt`. Geographic and unique creation-key indexes. |
| `messages` | `_id`, `roomId`, `userId`, `clientMessageId`, `username`, `text`, `createdAt`. Room/user history indexes; unique `(roomId, clientMessageId)` prevents duplicate submissions. |
| `users`, `sessions` | Username, normalized `usernameKey` with a partial unique index, Argon2id password hash for accounts, last room; SHA-256 hashed random session tokens, authenticated-session flag, and 30-day expiry/TTL index. Never expose credential fields in DTOs. |
| `roomReads` | Unique `(userId, roomId)` and a monotonically advancing message timestamp/ID cursor. Unread queries exclude the user's own messages. Delete markers with their room. |

The server assigns IDs and UTC timestamps, verifies room existence, and validates longitude/latitude ranges. Messages remain separate documents so room records do not grow with history. Load pins within map bounds with a bounded result count and a flag when results are truncated; nearby-room queries use the geographic index. Handle map bounds crossing the antimeridian. Geo queries return coordinate data directly to Leaflet; no search service is required.

## HTTP API and live delivery

| Endpoint | Contract |
| --- | --- |
| `POST /api/auth/register`, `/api/auth/login`, `/api/auth/logout` | Register/upgrade a guest, verify credentials and rotate session, or revoke the current session. Login works across browsers; passwords are never returned. |
| `GET /api/rooms?bbox=west,south,east,north` | Return bounded room summaries/pins; debounce viewport requests. |
| `POST /api/rooms` | Accept coordinates; persist and return the new room. Use an idempotency key for safe retries. |
| `GET /api/rooms/:id/messages?before=cursor&limit=50` | Return the latest history page or older messages, with stable ordering and an opaque continuation cursor. |
| `POST /api/rooms/:id/messages` | Accept text and a client-generated UUID; use the session profile's name, persist, and reuse the result on retry. |
| `GET/PATCH /api/me`, `GET /api/me/messages` | Bootstrap/restore session, update profile/last room, query the visitor's messages. |
| `GET /api/me/rooms`, `GET /api/me/rooms/recent`, `GET /api/me/unread`, `POST /api/rooms/:id/read` | Paginate created rooms, list recently messaged rooms, return per-room unread counts, and advance the user's validated read position. |
| `PATCH /api/rooms/:id` | Creator-only title/color update with revision conflict protection. |
| `DELETE /api/rooms/:id` | Creator-only deletion; remove messages, clear saved room references, emit `room.deleted`. Owner retries are idempotent. |
| `GET /api/rooms/:id`, `GET /api/rooms/nearby` | Read a room or query nearby rooms using the geographic index. |
| `GET /api/health` | Report backend/database readiness. |

Use HTTP for writes and history; `/ws` carries room-set subscription commands and server events (`room.created`, `room.updated`, `message.created`). Validate the session and Origin on connection. Broadcast pin/metadata updates to connected clients and messages only to room subscribers. Acknowledge subscriptions, merge live/history records by server ID, and reconcile all missed history pages after reconnect. No periodic HTTP polling is used.

Persist before broadcasting; a broadcast failure must not turn an already saved message into a failed write. History is authoritative, and refresh/reconnect repairs missed events. Immediate live delivery across a server crash is not guaranteed. Use heartbeat checks to remove dead sockets and limit socket payloads, subscriptions, and outbound buffering. Multiple server replicas require shared event distribution (for example Redis); this is deferred, not supplied by an in-memory room map.

## Operational boundaries and acceptance

Accounts own usernames with atomic MongoDB uniqueness and HTTP 409 on conflicts; message writes verify the claim. Hash passwords with Argon2id (19 MiB, 2 iterations, parallelism 1). Use generic invalid-login errors and limit login/registration to 20 requests per IP per 15 minutes. Rotate session cookies after authentication; old anonymous tokens cannot inherit authenticated access. Logout closes only the revoked session's sockets. Require `X-Wolfchatter-Request: 1` on mutations and enforce the Origin allowlist/cross-site checks. Startup creates indexes without migrations. Renaming changes the login name and releases the old name; historical messages retain their original authors. Password changes/recovery, email verification, MFA, private rooms, moderation, attachments, and guaranteed offline delivery are out of scope. Apply request/body and write/socket limits. MongoDB is bound to loopback port 27018 for local Compass access. Use HTTPS/WSS and Secure cookies in production. The named volume persists data. User-facing name/city/coordinate search remains deferred in `BACKLOG.md`.

Before acceptance, verify: two pins create distinct rooms; selecting a pin changes title/history; messages persist after browser and container restarts; two browsers receive messages only for the selected room; reconnect recovers missed history; retries create no duplicate rooms/messages; invalid input and unavailable MongoDB produce usable errors. Use focused API/database integration tests and a browser test of the two-client flow. A fresh checkout must run with documented environment setup and `docker compose up --build`.
