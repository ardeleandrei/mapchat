# Wolfchatter project rules

## Context and scope

Wolfchatter is a single-page map chat application. Read README.md and
TECHNICAL_PRD.md for behavior and INFRASTRUCTURE_COSTS.md for proposed hosting.

## Architecture

- Use Vue 3, TypeScript, Pinia, Leaflet, VueUse, and custom dialogs/forms.
  Do not add a component library or router without a concrete need.
- Put Vue templates before scripts and component-specific scoped styles last.
  Keep shared styles separate. Leave a blank line between functions/methods.
- Components handle UI; stores coordinate state; frontend services call the API;
  clients handle HTTP/WebSocket transport; composables handle reusable UI behavior.
- Keep backend routes, controllers, services, repositories, schemas, middleware,
  types, errors, and helpers distinct. Services use repository interfaces and
  plain records; repositories own MongoDB operations and ObjectId conversion.
- Keep rooms, messages, history, and read tracking together in chat.service.ts.
  Authentication, profiles, and sessions have their own services.
- Use the name WebSocket for the transport. Use helpers/ for mapping utilities
  and types/ for interfaces; do not introduce a domain/ directory or migrations.

## Behavior and safety

- Persist writes before publishing WebSocket events. Preserve idempotency,
  ownership checks, pagination ordering, and missed-history reconciliation.
- Do not replace WebSockets with polling. Event-triggered HTTP fetches are allowed.
- Guests may browse. Account authentication is required to write; only room
  creators may edit/delete their rooms. Never expose password hashes or tokens.
- Protect cookie-authenticated writes and WebSocket upgrades. Do not trust
  forwarded client IP headers without a configured, trusted proxy boundary.
- Do not remove data, reset databases, or add migrations without explicit user
  instructions. Use the isolated unread integration test for database validation.
- Never commit .env, credentials, dependencies, or build artifacts.
- Do not commit, push, deploy, or send messages to others unless requested.
  Preserve unrelated user changes. Work in this thread without spawning agents
  unless the user explicitly requests delegation.

## Validation and delivery

- Run checks appropriate to the change. Backend: npm --prefix backend test.
  Frontend: npm --prefix frontend test and npm --prefix frontend run build.
- npm --prefix backend run test:unread uses a disposable database on local MongoDB.
  test:integration writes diagnostic records to its target API; do not run it
  against the user's database as a routine review check.
- Use REVIEW_CONFIG.md for a final review; record results in
  REVIEW_REPORT.md and decisions in REVIEW_NOTES.md. Tests are evidence, not a
  substitute for code review. Mark unperformed checks explicitly.
- Document user-facing improvements in README.md or the PRD. Do not invent
  performance measurements, review-tool output, or deployment claims.
