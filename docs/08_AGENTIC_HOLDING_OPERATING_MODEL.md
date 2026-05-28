# Orya HQ – Agentic Holding Operating Model

## Overview
Orya HQ is re‑imagined as an **Agentic Holding Operating System**. It coordinates autonomous **mini‑business agents** that pursue concrete business objectives, meet profit targets, and progress through a defined promotion path. The system is governed by explicit **approval gates** that require human sign‑off for high‑impact actions.

---

## Core Concepts

### 1. Joris – Director / Mission Router
Joris is the central **Director** that receives natural‑language commands, parses them into **missions**, and routes each mission to the appropriate agent. Joris never executes live actions without passing through the approval gates (see section 9).

### 2. Agents – Mini‑Business Operators
Each **Agent** behaves like a small business unit:
- Owns a **Business Objective** (e.g., "Increase quarterly revenue by 10 %").
- Tracks a **Profit Target**.
- Can request **Boosters** to upgrade capabilities at low cost.
- May operate in **Venture Mode** when pursuing high‑risk, high‑reward opportunities.

### 3. Agent Profile Card
An Agent’s public *profile card* (conceptual UI) displays:
- Name & role
- Current business objective
- Profit target (goal & progress)
- Active boosters
- Venture mode status
- Promotion level

### 4. Boosters – Capability Upgrades
**Boosters** are modular, low‑cost capability upgrades that an Agent can activate to enhance performance (e.g., “Advanced analytics”, “Fast‑track marketing”).
- Each booster has a cost, a benefit description, and compatibility constraints.
- Boosters are optional and can be stacked.

### 5. Venture Mode
When an Agent opts into **Venture Mode**, it takes on higher‑risk missions that promise larger returns. Venture work orders must include a clear risk assessment and a profit‑target alignment.

### 6. Work Orders
#### Mission Work Order
A **Mission Work Order** is a concrete, bounded task for an Agent (e.g., "Create a marketing campaign for product X"). It includes:
- Owner Agent ID
- Objective description
- Expected output
- Required boosters
- Approval gate metadata

#### Venture Work Order
A **Venture Work Order** extends a Mission Work Order with:
- Explicit profit target
- Risk level (low/medium/high)
- Success metric definition
- Next‑action plan after completion

### 7. Promotion Path
Agents progress through a **promotion ladder** based on:
- Achievement of profit targets
- Successful completion of venture work orders
- Accumulated booster upgrades

### 8. 🏆 Original Orya
The **Original Orya** remains the founding entity that grants the overall vision and strategic guardrails. All agents operate under its umbrella and must respect the core mission of enabling autonomous yet accountable business creation.

### 9. No Passive Agent Rule
Agents must always be **active**: they cannot sit idle without an assigned work order or business objective. This rule prevents resource waste and ensures continuous value creation.

### 10. Approval Gates (Human‑Only)
Certain actions require explicit **human approval** before they can be executed:
- **Money** – spending, budgeting, and purchasing.
- **Publishing** – public releases, marketing blasts, or external communications.
- **Outreach** – contacting third‑parties, partners, or customers.
- **Deployment** – pushing code or services to production environments.
- **Auth / RLS** – changes to authentication, role‑level security, or database policies.
- **Runtime Live** – enabling live execution of missions that affect external systems.
- **Secrets** – creation, reading, or modification of API keys, credentials, or tokens.
- **External Irreversible Actions** – any action that cannot be rolled back (e.g., permanent data deletion, legal agreements).

All other routine tasks (draft missions, internal logs, sandbox testing) remain in the **Green Zone** and can be performed autonomously by agents.

---

## Governance & Safety
- Every mission must pass the four mandatory checks (`typecheck`, `lint`, `build`, `smoke:joris`) before human approval.
- The **Approval Gates** are enforced by the QA/Security Agent; any breach blocks the PR until Michael signs off.
- Documentation updates are version‑controlled and reviewed via a separate docs PR, ensuring the operating model stays in sync with code contracts.

---

*This document defines the conceptual model only; implementation contracts and UI components will be added in subsequent PRs (PR 7‑9).*
