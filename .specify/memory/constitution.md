<!--
Sync Impact Report
- Version change: (unversioned template) → 1.0.0
- Modified principles (template placeholder → new title):
  - [PRINCIPLE_1_NAME] → I. Spec-Driven Development
  - [PRINCIPLE_2_NAME] → II. Simplicity (YAGNI)
  - [PRINCIPLE_3_NAME] → III. Accessibility & UX Consistency
  - [PRINCIPLE_4_NAME] → IV. Security & Privacy
  - [PRINCIPLE_5_NAME] → V. Observability
- Added sections:
  - Performance Budgets (from [SECTION_2_NAME])
  - Development Workflow & Quality Gates (from [SECTION_3_NAME])
  - Governance (filled)
- Removed sections: none
- Deferred TODOs: none. Performance budget numbers are initial defaults and may be
  tuned by amendment once real measurements exist.
-->

# Spec Kit Demo Constitution

## Core Principles

### I. Spec-Driven Development

Every change to application behavior MUST trace back to an approved specification.

- No feature code is written until `spec.md`, `plan.md`, and `tasks.md` exist for it and the
  spec has no unresolved `[NEEDS CLARIFICATION]` markers.
- Specs describe *what* and *why* (user value, acceptance criteria); plans describe *how*.
  Implementation details MUST NOT leak into specs.
- Each user story MUST have testable acceptance criteria, and each task MUST reference the
  story or requirement it fulfills.
- When implementation reveals the spec is wrong, the spec is updated first, then the code.

**Rationale**: The spec is the source of truth; code that drifts from it cannot be verified
or reasoned about.

### II. Simplicity (YAGNI)

Build the smallest thing that satisfies the current spec.

- No speculative features, configuration options, or abstractions for hypothetical needs.
- Prefer the platform and framework defaults over custom solutions; prefer fewer
  dependencies over more.
- A new dependency, layer, or pattern MUST be justified in the plan's Complexity Tracking
  table, including the simpler alternative that was rejected and why.
- Duplication is acceptable until a third occurrence proves an abstraction is warranted.

**Rationale**: Unneeded complexity is the largest long-term cost in a web codebase and makes
every other principle harder to uphold.

### III. Accessibility & UX Consistency

The UI MUST be usable by everyone and MUST feel like one product.

- All user-facing features MUST meet WCAG 2.2 Level AA: semantic HTML, full keyboard
  operability, visible focus, labeled form controls, text alternatives, and sufficient
  color contrast.
- Automated accessibility checks MUST pass in CI with zero serious or critical violations.
- UI MUST be built from the shared component and design-token set; one-off styles or
  components require justification in the plan.
- Loading, empty, and error states MUST be designed and specified for every view.
- Layouts MUST work from 320px viewport width upward without horizontal scrolling.

**Rationale**: Accessibility is a legal and ethical baseline, and consistency lowers the cost
of both use and maintenance.

### IV. Security & Privacy

Security and privacy are requirements, not follow-up work.

- All external input (forms, query params, headers, API payloads) MUST be validated on the
  server; client-side validation is a UX aid only.
- Output MUST be encoded for its context to prevent XSS; queries MUST be parameterized.
- Secrets MUST NOT be committed to the repository or shipped to the client; they are
  supplied via environment configuration.
- Authentication and authorization MUST be enforced server-side on every protected route
  and API, following least privilege.
- Collect only the personal data a spec explicitly requires; personal data MUST NOT appear
  in logs, analytics, or error reports.
- Dependencies with known high or critical vulnerabilities MUST NOT ship.

**Rationale**: Web apps are exposed by default; retrofitting security is costlier and less
reliable than building it in.

### V. Observability

Production behavior MUST be diagnosable without reproducing it locally.

- Server logs MUST be structured (JSON) with level, timestamp, and a request/correlation ID.
- Errors MUST be captured with enough context to diagnose them (route, operation, sanitized
  inputs) on both server and client.
- Users MUST see a clear, actionable error message; stack traces and internals MUST NOT be
  exposed to them.
- Each feature plan MUST state what signals (logs, metrics, or events) confirm it is working.

**Rationale**: What cannot be observed cannot be fixed or verified against its spec.

## Performance Budgets

These budgets are measured at the 75th percentile on a mid-range mobile device over a
simulated 4G connection unless stated otherwise. A change that exceeds a budget MUST NOT merge
without a documented, approved exception in the plan.

- **Largest Contentful Paint (LCP)**: ≤ 2.5 s
- **Interaction to Next Paint (INP)**: ≤ 200 ms
- **Cumulative Layout Shift (CLS)**: ≤ 0.1
- **Initial JavaScript per route**: ≤ 200 KB compressed
- **API response time**: p95 ≤ 300 ms for read endpoints, ≤ 500 ms for write endpoints

Feature plans MUST identify any work likely to affect these budgets and how it will be
measured.

## Development Workflow & Quality Gates

Work follows the Spec Kit flow: `/speckit-specify` → `/speckit-clarify` (as needed) →
`/speckit-plan` → `/speckit-tasks` → `/speckit-implement`.

Before any change merges to `main`, all of the following MUST pass:

1. **Lint and format**: zero lint errors; formatting matches the project formatter.
2. **Type check**: zero type errors under the project's strict configuration.
3. **Tests**: all automated tests pass; each acceptance criterion in the spec is covered by
   at least one test.
4. **Accessibility**: automated a11y checks pass per Principle III.
5. **Security**: dependency audit and secret scan pass per Principle IV.
6. **Performance**: budgets above are met or an approved exception is documented.
7. **Review**: at least one reviewer approves, explicitly confirming spec traceability and
   constitution compliance.

Changes are made on feature branches and merged via pull request; direct pushes to `main` are
not permitted.

## Governance

This constitution supersedes all other project practices and conventions. Where another
document conflicts with it, the constitution wins until it is amended.

- **Amendments**: Proposed via pull request that edits this file, states the rationale, and
  describes the impact on existing specs, plans, and code. Amendments require approval from
  the project owner before merge.
- **Versioning**: This document follows semantic versioning. MAJOR for removing or
  redefining a principle in a backward-incompatible way; MINOR for adding a principle or
  section or materially expanding guidance; PATCH for clarifications and wording fixes.
- **Compliance**: Every plan MUST include a Constitution Check that passes before design
  work begins and is re-checked after design. Every pull request review MUST verify
  compliance. Any deviation MUST be recorded in the plan's Complexity Tracking table with
  its justification.
- **Review cadence**: The constitution is reviewed whenever a principle is repeatedly
  excepted, and at minimum at the start of each major feature.

**Version**: 1.0.0 | **Ratified**: 2026-09-25 | **Last Amended**: 2026-09-25
