# Review follow-up

2 November 2026 · Follow-up run using the general review criteria.
Findings and evidence: [REVIEW_REPORT.md](REVIEW_REPORT.md).

## Fixed

- **R6:** Pending WebSocket handshakes now participate in session revocation and
  shutdown. A connection waiting for database work cannot complete after logout;
  shutdown rejects it immediately. Added regression cases that failed before the
  fix and pass afterward.
- **R7:** A read request racing with deletion no longer recreates a read marker
  for the deleted room or publishes a stale read notification. Added an isolated
  MongoDB regression confirming HTTP 404 and no leftover marker.
- The earlier fixes below were checked again and retained:
- **R3:** Removed the unsupported 50-user assumption from the infrastructure
  estimate. Capacity remains unmeasured; the configured socket ceiling is not a
  benchmark.
- **R4:** Passed the retained Pinia instance explicitly to the sidebar rendering
  test. The `99+` check still passes and the context warning is gone.
- **R5:** Removed the nonexistent backlog-file reference and used plain wording
  for additional running backend copies.
- Added [AGENTS.md](AGENTS.md), [REVIEW_CONFIG.md](REVIEW_CONFIG.md), and README
  links so the AI setup, review instructions, report, and decisions are retained.

## Not fixed in this review

- **R1 — before Azure deployment:** HTTP/WebSocket client-IP handling must match
  the actual trusted reverse proxy. The cloud ingress topology is not configured,
  so this review did not enable blanket trust in forwarding headers.
- Load/cross-browser/deployment testing and multiple-server support remain
  separate work. No capacity number or production-readiness claim is made.

Validation: 34 backend tests, 23 frontend tests, production frontend build,
isolated MongoDB integration checks, Compose validation, and whitespace checks
passed in this follow-up. Runtime changes are limited to R6/R7 lifecycle and
consistency fixes; no architectural rewrite or new dependency was needed.
No commit, push, database reset, or Azure deployment was performed.
