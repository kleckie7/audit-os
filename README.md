# AuditOS — Interactive GRC Audit Workstation

A cinematic, fully interactive web app for running professional GRC audits end-to-end — from engagement scoping through question-by-question fieldwork to exported executive reports.

**532 real audit questions · 9 frameworks · 121-term hover glossary · interview scripts per stakeholder role · PDF/CSV/JSON report export**

## Frameworks Covered

| Framework | Questions | Coverage |
|---|---|---|
| ISO/IEC 27001:2022 | 85 | All 93 Annex A controls + Clauses 4–10 |
| ISO/IEC 42001:2023 | 55 | AIMS clauses + Annex A.2–A.10 AI lifecycle |
| NIST CSF 2.0 | 74 | All 6 functions, 22 categories |
| NIST SP 800-53 Rev. 5 | 71 | All 20 control families |
| COSO 2013 + ERM 2017 | 47 | All 17 Principles + ERM alignment |
| COBIT 2019 | 52 | EDM/APO/BAI/DSS/MEA + capability levels |
| MITRE ATT&CK Enterprise | 55 | 80 technique IDs, defensive-coverage framing |
| SOC 2 (Trust Services Criteria) | 49 | CC1–CC9 + A/PI/C/P criteria |
| PCI DSS v4.0 | 44 | All 12 requirements |

## Features

- **Guided Audit Workflow** — question-by-question walkthrough per framework with control references, "who to ask" role chips, evidence checklists, expert guidance ("what good looks like"), follow-up probes, and keyboard-first answer capture (Compliant / Partial / Non-Compliant / N-A)
- **Interview Mode** — all questions auto-routed to 14 stakeholder roles (CISO, IT Ops, HR, DPO, CFO…) with generated per-role scripts and a live session mode (timer, large-type stage, quick capture)
- **Findings & Scoring** — weighted compliance scores, domain radar, severity-tiered findings register auto-generated from answers, remediation tracking
- **Reports** — 4 templates (Executive Summary, Full Audit Report, Findings Register, Evidence Log) with live A4 print-ready preview; export to PDF (print), CSV, JSON
- **Field Guide** (`/field-guide`) — interactive 7-chapter engagement playbook: scoping, interview craft, framework entry points, findings & closing
- **Accounts & cloud sync** — Kimi sign-in, multi-engagement workspaces, audit data synced across devices (guest mode works fully offline)
- **TermTip** — hover any abbreviation anywhere in the app for a detailed popover (full name, auditor-grade definition, related frameworks); 121 terms, plus a searchable glossary page
- **AEGIS-style command-centre UI** — dark navy-teal palette, luminous lime accents, cinematic dashboard with posture gauge and activity charts

## Tech Stack

React 19 · TypeScript · Vite 7 · Tailwind CSS 3.4 · shadcn/ui · Zustand · Framer Motion · GSAP · Recharts · Lenis
**Backend:** Hono + tRPC 11 · Drizzle ORM + MySQL · Kimi OAuth 2.0 (JWT sessions)

## Getting Started

```bash
npm install
npm run dev       # local dev server with HMR (http://localhost:3000)
npm run build     # production build → dist/ (client + server boot bundle)
npm start         # production server
npm run db:push   # sync Drizzle schema to MySQL (requires DATABASE_URL in .env)
```

> **Note:** the app was built on the Kimi platform — Kimi OAuth and the managed MySQL database are platform-provided (`.env` is not committed). A self-hosted copy needs its own database + auth provider; the frontend also works standalone in guest mode (localStorage persistence, no backend required).

## Data Model

Framework question banks live in `src/data/frameworks/*.json` (schema: phases → questions with `controlRef`, `interviewees`, `evidence`, `guidance`, `probes`, `weight`). Glossary terms in `src/data/glossary.json`.

Audit state is synced to MySQL for signed-in users (tables: `engagements`, `answers`, `finding_overrides`) via tRPC (`api/audit-router.ts`); guests run local-only via Zustand + localStorage (`src/lib/store.ts`, sync layer in `src/lib/sync.ts`).
