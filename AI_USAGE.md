# How I used AI to develop Wolfchatter

## Setup and workflow

I created a new Project in the Codex desktop app called **Wolfchatter**, connected
to my local project folder. I typed requests directly into the desktop chat
rather than using a Codex integration inside VS Code. I used VS Code to inspect
the project and a terminal to run commands.

Initially, I asked Codex to provide commands and individual files that I could
copy into the project myself. Later, I allowed it to edit the project files
directly. I kept the work iterative: discuss a change, implement it, run the
relevant checks, and inspect the result before requesting the next change.

## Where AI helped

- **Planning:** interpreting the mockups, writing the technical PRD, and
  discussing stack choices, persistence, authentication, and live messaging.
- **Implementation:** generating and editing Vue components, Pinia stores,
  backend endpoints, services, repositories, validation, and WebSocket handling.
- **Local tooling:** preparing Docker configuration and explaining installation,
  startup commands, port conflicts, and database connections.
- **UI iteration:** using screenshots and feedback to refine floating chat
  windows, colors, clustering, resizing, profiles, sidebar sections, unread
  badges, and scrolling behavior.
- **Refactoring:** separating responsibilities, organizing types and helpers,
  moving component styles into Vue files, and applying consistent naming.
- **Validation and delivery:** creating tests, investigating failures, reviewing
  code, and preparing the README and infrastructure/cost estimate.

## My role and decisions

I supplied requirements, tested the app in browsers, shared screenshots and
terminal output, and challenged implementation choices when they did not match
the intended behavior or structure.

For example, I chose a standalone Node backend with MongoDB and Docker instead
of Azure Functions, kept custom dialogs and forms, and requested WebSockets
instead of polling. I also directed changes to ownership rules, account
authentication, component structure, and the chat-window experience.

I used the conversation to understand the implementation as well as produce it,
asking about Pinia, composables, controller/service/repository boundaries,
WebSockets, Docker, and deployment. AI contributed substantial code; my role
included directing the design and architecture, inspecting changes, and validating behavior.

## Project context and review

[AGENTS.md](AGENTS.md) records the project conventions and constraints for AI
work, including architecture boundaries, validation commands, and restrictions
on database deletion and publishing.

I asked Codex to review the code using the general criteria in
[REVIEW_CONFIG.md](REVIEW_CONFIG.md). Findings, checks, fixes, and deferred work
are recorded in [REVIEW_REPORT.md](REVIEW_REPORT.md) and
[REVIEW_NOTES.md](REVIEW_NOTES.md).
