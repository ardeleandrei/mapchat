# Code review configuration

## Purpose and application

Reusable review criteria for TypeScript web applications with a component-based
frontend, a Node.js API, persistent storage, and optional real-time communication.
Apply only criteria relevant to the functionality under review. Judge structure
by cohesion, clear responsibilities, and justified complexity; do not prescribe
one folder layout, framework, database, hosting provider, or service per endpoint.

Use the application's requirements to determine intended behavior. Do not derive
the quality rules from the existing implementation or treat its current design
as proof that a pattern is appropriate. Distinguish correctness requirements,
documented team conventions, and subjective preferences.

## Project structure and responsibility boundaries

- Organize modules around cohesive responsibilities. Names should explain what
  a module does, and dependency direction should be easy to follow.
- Keep transport handling, application behavior, and persistence concerns
  distinguishable. Where controllers, services, and repositories are used,
  controllers adapt requests/responses, services coordinate application rules,
  and repositories encapsulate storage-specific operations.
- Keep database queries and storage-specific identifiers out of UI components
  and reusable application logic. Limit infrastructure coupling to explicit
  boundaries; prefer plain, typed records across those boundaries.
- Extract components or services when they own meaningful behavior or enable
  useful reuse/testing. Avoid empty forwarding layers, speculative abstractions,
  circular dependencies, and splitting tightly related logic without a benefit.
- Keep reusable helpers focused and side effects explicit. Avoid miscellaneous
  modules that accumulate unrelated responsibilities or hidden global state.
- Keep configuration/startup, request handling, and resource shutdown clear.

## Frontend design and state

- Components should have clear inputs, outputs, and ownership of UI behavior.
  Separate network transport and application coordination from rendering where
  doing so improves clarity and testing.
- Keep temporary UI state local. Share state when multiple consumers require a
  common source of truth; avoid redundant mutable copies and implicit coupling.
- Use composition utilities for reusable reactive behavior. Clean up listeners,
  subscriptions, timers, observers, and connections when their owner is disposed.
- Guard asynchronous updates against stale requests, changed selections,
  destroyed components, and changed user identities.
- Provide usable loading, empty, failure, and retry states. Preserve user input
  where appropriate, prevent unintended duplicate actions, and handle failures.
- Keep component-specific styles with their owner and shared styling consistent.
  Check keyboard access, labels, focus behavior, responsive layout, and contrast.
- Render untrusted content safely. Client-side checks improve usability but do
  not replace server-side validation or authorization.

## API contracts and application behavior

- Validate untrusted input at system boundaries, including identifiers, bodies,
  query parameters, configuration, and inbound events. TypeScript types alone
  do not validate external data.
- Make request/response contracts explicit and expose only intended fields.
  Avoid framework-specific request objects in reusable application rules.
- Return consistent, meaningful errors without leaking credentials, sensitive
  records, stack traces, or internal implementation details to clients.
- Enforce authentication and resource-level authorization on the server for
  every protected operation. Do not rely on hidden UI controls.
- Design retries and concurrent operations to preserve invariants. Use
  idempotency, uniqueness constraints, version checks, or transactions where
  the operation requires them; do not add mechanisms without a concrete need.
- Define what success means when persistence, notifications, or another external
  dependency partially fails. Do not report uncommitted data as durably saved.

## Persistence and query design

- Keep storage adapters responsible for queries, storage mapping, and
  database-specific error translation. Reuse connections with an appropriate
  lifecycle instead of creating one per request.
- Match indexes to actual query predicates and ordering. Check for unbounded
  scans, unnecessary round trips, per-item queries, and excessive payloads.
- Bound collection results and provide deterministic pagination when needed.
  Account for concurrent inserts/updates and stable ordering at page boundaries.
- Preserve consistency during updates and deletions, including related records
  and operations already in flight. Validate error/retry behavior, not just the
  successful path.
- Make persistence and backup assumptions explicit. Test data must be isolated
  from user/production data, and cleanup must be restricted to test resources.

## Real-time communication, when present

- Authenticate connections and authorize subscriptions and event delivery.
  Validate message types, payload sizes, and command rates.
- Handle disconnects, expiry/revocation, concurrent subscription changes, and
  shutdown. Bound queued data and clean up connection/subscription state.
- Define event ordering, duplicate handling, retry behavior, and recovery after
  missed events. Durable state must remain recoverable independently of a
  transient notification channel when persistence is required.
- Distinguish process-local state from state that must be shared across running
  server copies. Check distribution and coordination assumptions before scaling.

## Security, configuration, and operations

- Keep secrets out of source control, client bundles, logs, and review output.
  Provide documented configuration templates without real credentials.
- For password authentication, use an appropriate password-hashing scheme.
  Protect session/token lifecycle and credential changes. For cookie-based
  authentication, assess cookie attributes and cross-site request protection.
- Set trust boundaries explicitly, including origins and reverse proxies.
  Do not accept attacker-controlled identity or forwarding headers as trusted.
- Apply resource limits appropriate to the public interfaces. Inspect dependency
  changes and lockfile consistency; distinguish source review from a separately
  executed dependency vulnerability scan.
- Check development/production configuration differences, build reproducibility,
  health checks, graceful shutdown, and operational documentation.
- Treat performance/capacity statements as claims requiring measurements and
  stated workloads, not conclusions from a machine size or configured limit.

## Evidence and reporting

1. Record reviewer/tool identity, review scope, revision or working-tree state,
   requirements consulted, and any exclusions. State whether review is independent.
2. Inspect relevant source, tests, configuration, and documentation. Follow
   representative data flows across boundaries and compare them with requirements.
   Exclude secrets and generated/dependency files from application-source findings.
3. Discover validation commands from the project's manifests and documentation.
   Run relevant type checks, builds, tests, and configuration checks. Record exact
   commands, outcomes, warnings, and blocked/unperformed checks.
4. Report actionable findings with an ID, priority, file/line reference, trigger,
   impact, evidence, and proposed correction. Separate confirmed defects from
   unverified concerns and optional improvements. Do not inflate style preferences
   into correctness findings.
5. Base priority on impact and likelihood: **P0** critical immediate harm;
   **P1** serious failure blocking intended use; **P2** material defect with a
   narrower trigger; **P3** limited-impact issue.
6. Make fixes only within authorized scope. Verify affected behavior, add useful
   regression coverage where warranted, and inspect the resulting code/diff.
   Distinguish fixed, open, and deferred findings with reasons.
7. Save the report and a short remediation note. Do not imply that passing tests
   establish browser compatibility, load capacity, security, or deployment
   readiness beyond the evidence collected. Re-review subsequent code changes.
