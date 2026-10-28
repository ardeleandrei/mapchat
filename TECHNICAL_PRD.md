# Wolfchatter — Technical PRD

Status: implementation starter · 28 October 2026

## Goal and scope

Build a simple map chat application following the supplied mockups: clicking an empty map location creates a pin and opens its chatroom in a right-hand panel. Clicking an existing pin switches the panel to that room. Rooms and messages survive browser sessions and server restarts. The first release includes real-time delivery between connected browsers.

The backend is a standalone Node.js server. Docker provides a portable runtime; Azure Functions and Azure-managed hosting are not requirements. Azure AI Search is a possible future integration, outside the initial release.

## Functional requirements

1. Initially show an interactive map and an empty panel saying “Click on the map to start a chat.” Support map pan and zoom with visible attribution to the map-data/tile provider.
2. Clicking empty map space creates one persistent room at that coordinate, adds its marker, selects it, and updates the panel title. Assign a server-generated title such as “Chatroom 1.” Dragging or clicking map controls must not create rooms.
3. Clicking an existing marker selects its room and loads its messages without creating another pin. Keep rooms' histories separate; late responses for a previously selected room must not overwrite the current panel.
4. Provide a display-name input, message composer, and submit button. Trim inputs; require a name of 1–40 characters and message text of 1–2,000 characters. Render user content as plain text. Show author and timestamp; support Enter to send and Shift+Enter for a newline.
5. Save rooms and messages on the server. Reloading restores pins and history. Remember the display name and selected room ID locally; the database remains authoritative. Handle missing or invalid saved room IDs gracefully.
6. Deliver saved messages live to connected clients viewing that room. On room change, leave the previous subscription. Reconnect with backoff and reconcile missed messages from history. Show loading, sending, failed-send, and disconnected states; preserve failed drafts for retry.
7. Use the mockups' map-plus-right-panel layout on desktop and an accessible stacked layout on narrow screens. Keep history scrollable and controls labeled; support keyboard selection of existing markers.

## Stack and application structure

- **Frontend:** Vue 3, TypeScript, Vite, Leaflet, and plain CSS. Use Pinia for rooms, selected room ID, history cached by room ID, and connection/send status. Components own transient drafts. An API client and socket client perform networking; components do not call the database.
- **Backend:** Node.js on an active LTS release, TypeScript, Express for HTTP, `ws` for WebSockets, Zod for request/event validation, and the official MongoDB driver. Separate transport handlers, room/message services, and database access. Use one shared MongoDB connection pool per process.
- **Repository:** `web/` (Vue), `server/` (HTTP, sockets, services, persistence), `shared/` (API/event schemas and types), and root Docker/configuration files. Start with one server process and one MongoDB instance.
- **Runtime:** A multi-stage Dockerfile compiles Vue and the server; the production Node process serves static frontend assets, `/api`, and `/ws` from one origin. Docker Compose starts `app` and `mongodb`, with a named persistent database volume and health checks. Development uses Vite hot reload with HTTP/WebSocket proxying.

## Data model and queries

| Collection | Stored fields and indexes |
| --- | --- |
| `rooms` | `_id`, `title`, `location: { type: "Point", coordinates: [longitude, latitude] }`, `createdAt`. Create a `2dsphere` index on `location`. |
| `messages` | `_id`, `roomId`, `clientMessageId`, `username`, `text`, `createdAt`. Index `(roomId, createdAt, _id)` for cursor-based history; unique `(roomId, clientMessageId)` prevents duplicate submissions. |

The server assigns IDs and UTC timestamps, verifies room existence, and validates longitude/latitude ranges. Messages remain separate documents so room records do not grow with history. Load pins within map bounds with a bounded result count and a flag when results are truncated; nearby-room queries use the geographic index. Handle map bounds crossing the antimeridian. Geo queries return coordinate data directly to Leaflet; no search service is required.

## HTTP API and live delivery

| Endpoint | Contract |
| --- | --- |
| `GET /api/rooms?bbox=west,south,east,north` | Return bounded room summaries/pins; debounce viewport requests. |
| `POST /api/rooms` | Accept coordinates; persist and return the new room. Use an idempotency key for safe retries. |
| `GET /api/rooms/:id/messages?before=cursor&limit=50` | Return the latest history page or older messages, with stable ordering and an opaque continuation cursor. |
| `POST /api/rooms/:id/messages` | Accept display name, text, and a client-generated UUID; persist and return the canonical message, reusing the result on retry. |
| `GET /api/health` | Report server/database readiness. |

Use HTTP for writes and history; `/ws` carries subscription commands and server events (`room.created`, `message.created`). Send `room.created` to connected map clients and message events only to that room's subscribers. Clients deduplicate by server ID. Acknowledge room subscription before fetching current history, buffer live events during that fetch, and merge them by ID. On reconnect, reconcile rooms and fetch history pages until overlapping locally known messages so gaps larger than one page are recovered.

Persist before broadcasting; a broadcast failure must not turn an already saved message into a failed write. History is authoritative, and refresh/reconnect repairs missed events. Immediate live delivery across a server crash is not guaranteed. Use heartbeat checks to remove dead sockets and limit socket payloads, subscriptions, and outbound buffering. Multiple server replicas require shared event distribution (for example Redis); this is deferred, not supplied by an in-memory room map.

## Operational boundaries and acceptance

Display names are unverified labels; accounts, private rooms, moderation, attachments, and guaranteed offline delivery are out of scope. Apply request/body limits, basic rate limits for writes and socket connections, and a WebSocket Origin allowlist. Keep MongoDB private to the Compose network. Store secrets in ignored environment files, provide `.env.example`, and use HTTPS/WSS at deployment. Document persistent-volume backups; `docker compose down -v` deletes local history.

Before acceptance, verify: two pins create distinct rooms; selecting a pin changes title/history; messages persist after browser and container restarts; two browsers receive messages only for the selected room; reconnect recovers missed history; retries create no duplicate rooms/messages; invalid input and unavailable MongoDB produce usable errors. Use focused API/database integration tests and a browser test of the two-client flow. A fresh checkout must run with documented environment setup and `docker compose up --build`.
