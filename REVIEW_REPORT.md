# Final code review report

Date: 2 November 2026 · Follow-up review using the general review criteria

## Review identity and scope

- Reviewer: Codex coding agent, following [REVIEW_CONFIG.md](REVIEW_CONFIG.md).
- Configuration history: the initial run used project-specific instructions.
  This follow-up actually re-reviewed the code against the general criteria now
  saved in REVIEW_CONFIG.md and reran validation. Finding IDs R1–R5 are retained
  for continuity; R6–R7 were identified and fixed in this run.
- Base commit: `c5a9e4e1bcc0b9c816ce2023fc2eb33557ba4762` (`refactoring`).
- Final reviewed tree: that commit plus the existing local documentation/Pinia
  test changes and this run's fixes in `backend/src/websocket.ts`,
  `backend/src/repositories/roomReads.repository.ts`, and
  `backend/src/services/chat.service.ts`, with regressions in
  `backend/test/websocket.test.mjs` and `backend/test/unread.integration.mjs`.
  These changes are local and uncommitted.
- Final test-file SHA-256:
  `F33F2A96546A8516B51713CA01D859C726776BA0D8434BAEF96041197AD5E1E0`.
- Method: targeted source inspection, HTTP/WebSocket flow tracing, automated
  tests, TypeScript/production builds, and Compose configuration validation.
  This is not an exhaustive security audit or dependency vulnerability scan.

The source review focused on authentication/session services and repositories,
controllers and middleware, chat services, room/message/read repositories,
schemas/DTO mapping, WebSocket upgrade/subscription/publication/cleanup paths,
frontend transport clients and stores, map/window/dialog/composer rendering,
environment loading, Docker configuration, and delivery documentation.

## Findings and final disposition

### R1 · P2 · Deferred: proxy-aware client IP handling is required before Azure deployment

Evidence: [WebSocket peer IP](backend/src/websocket.ts#L97),
[upgrade IP and limits](backend/src/websocket.ts#L178), and
[Express setup](backend/src/app.ts#L25).

The WebSocket server keys connection/upgrade limits on the direct socket address
and permits 20 simultaneous connections per address. Express does not configure
a trusted proxy boundary for its HTTP IP-based limits. When different visitors
reach Node through the same reverse-proxy address, their limits can be combined.
For example, 20 open sockets through one proxy address cause the next connection
through that address to receive 503, even when it belongs to another visitor.
The upgrade-attempt budget can also be shared.

This condition is confirmed by the code path; it has not been reproduced in a
live Azure deployment. Direct local access is a different network topology.
Before Azure release, configure the actual trusted proxy boundary and use a
consistent client-IP resolver for HTTP and WebSocket upgrades. Test separate
forwarded clients, spoofed forwarding headers, and normal direct connections.
Do not fix this by blindly trusting all supplied IP headers.

Deferred because the Azure ingress/trust topology has not been provisioned or
validated. This remains a deployment blocker, not a claim that production is ready.

### R2 · P3 · Open: the PRD's 1–2-page requirement is not verified

Evidence: [TECHNICAL_PRD.md](TECHNICAL_PRD.md), approximately 1,650 words.

The requirements and architecture are documented, but Markdown has no fixed page
size and this length is likely to exceed two normally formatted pages. No paginated
render was produced in this review. Keep the content until a readable page format
is selected, then verify/condense it to meet the submission limit. This review
did not silently replace the PRD with another shortened version.

### R3 · P3 · Fixed: the infrastructure estimate implied an unsupported user-count target

Evidence: [capacity assumptions](INFRASTRUCTURE_COSTS.md#L11).

The previous 50-concurrent-connection assumption had no benchmark behind it and
could be mistaken for tested capacity. Removed that figure. The document now
states that concurrency/throughput are unmeasured and that the configured
500-connection ceiling is not evidence of hardware capacity. No replacement
capacity number is claimed.

### R4 · P3 · Fixed: the sidebar test emitted a Pinia context warning

Evidence: [fixture instance](frontend/test/frontend.test.mjs#L159) and
[SSR badge assertion](frontend/test/frontend.test.mjs#L315).

The initial frontend test run passed but emitted `PINIA_R1004` while looking up
the active Pinia instance outside a component context for the SSR badge fixture.
The fixture now retains and passes its Pinia instance explicitly. All 23 tests,
including the rendered `99+` assertion, pass without the previous warning.
This was a test-fixture issue; it did not establish an SSR production data leak.

### R5 · P3 · Fixed: the PRD referred to an absent backlog document

Evidence: [deferred scope](TECHNICAL_PRD.md#L63).

Removed the reference to nonexistent `BACKLOG.md`; geographic search is still
explicitly deferred. README/PRD also use "additional running copies" for the
backend scaling explanation, as requested.

### R6 · P2 · Fixed: pending WebSocket upgrades could outlive logout or shutdown

Evidence: [upgrade tracking](backend/src/websocket.ts#L64),
[session revocation](backend/src/websocket.ts#L240),
[shutdown cleanup](backend/src/websocket.ts#L253), and
[regression cases](backend/test/websocket.test.mjs#L170).

Trigger: a connection passes session validation, then its recent-room database
query waits. Logging out revokes the session before that query completes. The
old code only closed established peers, so the waiting connection could still
upgrade with HTTP 101 using the revoked session. Other API writes still performed
their own session checks; this finding concerns the live connection lifecycle.
Shutdown also left pending upgrades waiting on database work rather than
rejecting them immediately.

Reproduced before the fix: the revocation regression received 101 instead of
401, and the shutdown regression received no rejection within the test's bounded
wait. The 31 pre-existing backend tests still passed at that point.

Fix: track pending upgrades by socket and session hash before asynchronous work.
Revocation rejects matching pending upgrades with 401; shutdown rejects pending
upgrades with 503. Disconnected/rejected sockets are removed, resumed database
callbacks cannot reopen them, and rejection avoids writing to an ended socket.
Both new cases pass in the final 34-test backend run.

### R7 · P2 · Fixed: an in-flight read could recreate markers after room deletion

Evidence: [post-write room check](backend/src/repositories/roomReads.repository.ts#L43),
[application error mapping](backend/src/services/chat.service.ts#L250), and
[real-database regression](backend/test/unread.integration.mjs#L137).

Trigger: a read request validates an existing room/message, pauses before writing
its read marker, and the creator deletes the room and completes cascading
cleanup. The read then resumes and upserts a marker for the deleted room. The
old API reported success and could publish a stale read notification.

Reproduced in the disposable MongoDB test: the paused read returned HTTP 200
after completed deletion, contrary to the expected 404. This was not a test
against application data.

Fix: after advancing a marker, the repository verifies that the room is still
available. If deletion won, it removes the marker and raises an application
error. The chat service maps that error to 404 and does not publish a read event.
If deletion starts later, its normal cleanup removes the marker instead.
The final integration regression confirms 404 and zero remaining markers.

## Structure assessment against the general rules

The existing boundaries are useful: components render interaction, stores own
shared state/coordination, transport clients handle connections, controllers
adapt HTTP, services enforce application behavior, and repositories encapsulate
MongoDB operations and identifiers. Chat operations are cohesive enough to stay
in one service; adding a service for each endpoint or another forwarding layer
would not address a confirmed problem. Auth/profile/session separation has clear
responsibilities. No structural rewrite or new dependency was warranted.

The changes above follow the general rules on asynchronous ownership, session
revocation, resource cleanup, deletion consistency, and regression evidence.
Large data sets and high fan-out still need measurement; code organization and
passing functional tests do not establish scalability.

## Behavior inspected and evidence

| Area | Evidence and result |
| --- | --- |
| Passwords and sessions | Argon2id, explicit public-user mapping, session-token hashing, cookie rotation, session expiry/revocation, guest-write denial, and origin/header checks inspected. Backend tests pass. |
| Ownership and retries | Creator-only edits/deletion, revision conflicts, creation/message request keys, persistence-before-broadcast, pagination, and deletion/write cleanup inspected. Service/repository tests pass. |
| WebSockets | Upgrade session/origin validation, acknowledged subscriptions, multi-room routing, slow-subscription races, expiry, shutdown, and buffering/command limits inspected. Established and pending connection lifecycle tests pass after R6. |
| Frontend data flow | HTTP/live reconciliation, room isolation, missed-history paging, draft retention, account-switch guards, recent lists, and unread state inspected and covered by mocked client/store tests. |
| UI safety and lifecycle | Guest composer and creator-control conditions, text rendering, native dialogs, map listener cleanup, and draggable/resizable window helpers inspected. Visual/cross-browser behavior was not re-tested in this review. |
| Persistence and unread delivery | Dedicated MongoDB integration script passes with independent visitor sessions and real HTTP/WebSocket requests. It validates read markers, recent ordering, idempotency, ownership delivery, deletion cleanup, and R7's read/delete race. |
| Configuration | Root environment loading, Compose mappings, production build path, and environment-file exclusions inspected. Compose validation passes; `.env` is ignored by Git. No secret values are included in this report. |

## Checks actually executed

| Root command (equivalent to the checks executed in backend/frontend) | Final result |
| --- | --- |
| `npm --prefix backend test` | Pass: TypeScript backend build and **34 tests**, including the new pending-upgrade regressions. |
| `npm --prefix frontend test` | Pass: **23 tests**, rerun in this follow-up; no previous Pinia context warning. |
| `npm --prefix frontend run build` | Pass: Vue/TypeScript check and optimized production build. |
| `npm --prefix backend run test:unread` | Pass: isolated real-MongoDB integration checks including the new read/delete regression; temporary database removed by the script. Application records were not targeted. |
| `docker compose config --quiet` | Pass: Compose configuration resolves. This is not an image rebuild or deployment test. |
| `git -c core.whitespace=cr-at-eol diff --check` | Pass on final review changes. |

These are fresh observed results from the follow-up review under the general
configuration. Before the fixes, the new regressions failed as described in R6
and R7. An initial standalone focused Node test invocation stalled and was
interrupted; it is not counted as a successful check. The subsequent complete
suite runs supplied the regression evidence and final pass results above.

## Remaining limits and unperformed checks

- No new manual Chrome/Firefox two-browser test, keyboard/visual accessibility
  session, or Docker restart/rebuild test was performed in this review. Earlier
  development checks do not count as fresh final-tree evidence.
- No Azure deployment, proxy integration, regional failover test, or load test
  was performed. No maximum concurrent-user capacity is established.
- Viewport queries filter coordinate fields; nearby queries use `$near` with the
  geographic index. No query-plan benchmark was run. Unread refreshes also issue
  per-room count queries, so room counts and fan-out belong in future load tests.
- WebSocket fan-out and limiter state are process-local by design. Multiple
  running backend copies require shared event distribution and rate-limit design.
- Username renaming releases the previous name; historical messages keep their
  author snapshots. Password recovery, moderation, private rooms, and user-facing
  geographic search remain outside the agreed implementation scope.
- External pricing, Azure region availability, supply-chain advisories, and all
  third-party service policies were not re-audited as part of this code review.

## Conclusion

No P0/P1 issue was identified in the reviewed paths; this is not a guarantee of
absence. The general-rule follow-up found and fixed R6 and R7 with failing-then-
passing regressions. Final automated local validation passes: 34 backend tests,
23 frontend tests, builds, isolated MongoDB integration, and configuration checks.
Azure deployment still needs R1 resolved, and the submission's PRD page limit
still needs R2 verified.
See [REVIEW_NOTES.md](REVIEW_NOTES.md) for the short fixed/deferred summary.

## Document type extraction follow-up

Moved MongoDB document interfaces unchanged from db.ts into
backend/src/types/document.types.ts and updated repository/mapper imports.
Reviewed the diff against the applicable structure and behavior-preservation
criteria: no runtime logic or database shape changed; no findings.
Backend TypeScript build and all 34 tests passed. The first sandboxed run
could not connect to local test servers (EACCES); the authorized rerun passed.
Database integration and frontend checks were not run for this type-only change.

Document coverage follow-up: extracted the remaining inline CounterDocument
into the same document.types.ts file and explicitly declared RoomReadDocument._id.
All six application collections now have named document interfaces in that file.
Reviewed as type-only changes; backend build and all 34 tests pass again.
No database data or runtime query behavior changed.

## Chat scrolling follow-up

Reviewed component event flow and Vue update timing under REVIEW_CONFIG.md.
Successful sends scroll their own message list after rendering. Opening/restoring
a room and initial history completion also scroll to the bottom. Typing does
not trigger scrolling. Earlier-history loading retains position preservation,
and incoming messages retain near-bottom following.
Frontend tests: 23 passed. Frontend TypeScript/production build passed.
The tests cover state behavior, not browser scroll geometry; manual browser
scrolling verification was not performed. Backend/database checks were not
needed for this UI-only change.
