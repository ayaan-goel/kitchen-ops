# Product Requirements Document — Fernleaf Kitchen Operations Admin Panel

| Field | Value |
|---|---|
| Product | Kitchen Operations Admin Panel for **Fernleaf Kitchen**, a fictional commercial kitchen that runs corporate meal programs |
| Context | Heizen engineering round, take-home assignment ("48 hours") |
| Owner | Ayaan Goel |
| Version | 1.0 (baseline), 2026-10-03 |
| Submission deadline | **Sun 2026-10-04 23:59 IST**, via Google Form (live link + public Git repo) |
| Live-link uptime | At least two weeks after submission (until ≥ 2026-10-18) |
| Companion docs | [TRD](TRD.md) · [Database models](DATABASE_MODELS.md) · [Architecture](ARCHITECTURE.md) |

> The assignment says the rules in its section 4 matter more than the screens. So this PRD writes every rule as a numbered requirement with acceptance criteria (§6). It also lists every reading we chose for ambiguous wording (§10). The README reuses §8 (dashboard definitions) and §10 (interpretations) word for word.

---

## 1. Summary

Fernleaf Kitchen cooks, packs and delivers **individual boxed meals** to the offices of client companies. Employees of those companies order meals for specific delivery dates. Employees never pay; every order is **billed to the employee's company**.

The product is the **internal admin panel** the kitchen's own staff use to run the whole operation:

```
Catalogue & menu  →  Pricing per company  →  Orders (staff order on behalf of employees)
      →  Cut-off locks a delivery date  →  Kitchen cooks prep units  →  Dispatch groups orders into drops
      →  Driver delivers  →  Company is invoiced
```

There is **no customer-facing app**. Staff create orders on behalf of employees inside the panel.

## 2. Background & context

- Four staff roles use the panel: **Admin, Kitchen, Dispatch, Driver**. Each staff member has exactly one role.
- The reviewers sign in to the **live deployment** with four fixed test accounts and click through it. The app has to be populated with realistic data, including orders for **whatever day they review**.
- Mandatory stack: **Next.js** (frontend), **NestJS** (backend), **Prisma** (ORM). The frontend must talk to the backend over HTTP, with no business logic in Next.js server actions.
- The scope is deliberately bigger than the time available. Prioritising is part of the test, and the README has to say what was built, what was skipped and why.

## 3. Goals, non-goals and success criteria

### 3.1 Goals
| # | Goal |
|---|---|
| G1 | Every business rule in the assignment is enforced on the server and covered by tests where it is most likely to break (cut-off, pricing, combinations, invoicing). |
| G2 | The data model reflects the business and can absorb the next requirement without a rewrite (roles as data, persisted drops, immutable money snapshots). |
| G3 | Each role gets a screen built for its real job: a kitchen lead at 6 am, a dispatcher at the door, a driver on a phone, an admin running the business. |
| G4 | The live app is always populated relative to *today* and works with the four test accounts, for at least two weeks. |
| G5 | Documentation is honest: definitions, interpretations, trade-offs and gaps are written down. |

### 3.2 Non-goals (out of scope by the assignment, simulated where noted)
| Not building | Instead |
|---|---|
| Employee payments (cards, charging, refunds) | Every order is billed to the company (BIL). |
| Multiple order types (family style, trays, …) | One kind of order: individual boxed meals. |
| Customers without a company | Every customer is an employee of exactly one company. |
| Options included free with a dish | Every option is explicitly chosen. |
| Date-based menu scheduling | Items are shown or hidden only by the active flag and company hiding. |
| Pausing an employee's ordering | Not required. |
| Exports (CSV, prep sheets, labels, reports) | Not required. |
| Accounting integration | Invoices are internal records only. |
| Recipe or costing integration | Costs are entered by hand in the catalogue. |
| Promo or coupon codes | Not required. |
| Sales tax | No tax. Totals are pre-tax. |
| Delivery fees or zones | No fees. Order total = sum of its lines. |
| Audit logs | Not required. The order **timeline** is still required (ORD-07). |
| Customer ordering app | Staff create orders in the admin panel. |
| Email and notifications | Not required. Log to the console where an email would be sent. |
| Marketing campaigns and banners | Not required. |

### 3.3 Success criteria (mapped to Heizen's evaluation rubric)
| Rubric area | We will have succeeded when… |
|---|---|
| Domain modelling | Every rule in §6 traces to a schema constraint, a domain function or a guarded service method (see the TRD rule matrix). The model has explicit concepts for tiers, combinations, drops, cut-off runs, invoices and adjustments. |
| Correctness | Domain unit tests pass for cut-off (holidays, non-working days, time zones), pricing (derivation chains, overrides, 5¢ rounding, missing prices), combinations and invoicing. Money is in integer cents end to end. |
| Product thinking | Each dashboard answers its role's real questions with defined figures. Kitchen, dispatch and driver screens make late and at-risk work obvious and are fast on a 400-order day. |
| Engineering quality | Monorepo with shared types, clear module boundaries, one error envelope, clean lint and type-check, meaningful tests. |
| Judgement | [Must] items are complete before any [Should]. Every ambiguity is written down (§10). Gaps are stated honestly. |
| Communication | README covers setup, architecture, data model diagram, decisions, dashboard definitions and prioritisation. The live app is up and populated. |

## 4. Users and roles

| Role | Who | Daily job | Lands on | Can | Cannot |
|---|---|---|---|---|---|
| **Admin** | Operations manager, owner | Everything: catalogue, pricing, companies, employees, orders, settings, billing; overrides anything | Admin dashboard | All management permissions, including overrides after cut-off, rejecting orders, force-completing kitchen work, running cut-off | Act as a driver (not assignable to drops) |
| **Kitchen** | Kitchen lead, cooks | Sees what to cook for a delivery date; marks prep units started and done | Kitchen dashboard → Kitchen board | Kitchen board read and work. Read-only access to orders (incl. employee allergies), catalogue, menu, reference data | Edit anything else, see prices or billing |
| **Dispatch** | Dispatcher at the pass | Moves cooked orders out of the door, assigns drivers per drop, tracks deliveries | Dispatch dashboard → Dispatch board | Dispatch board read and manage (assign driver, advance drop stages). Read-only access to orders, companies and kitchen progress | Edit orders or catalogue, see billing |
| **Driver** | Delivery driver, on a phone | Sees only their own drops for today, in time order; marks each delivered with a note and optional photo | Driver view (mobile) | Read and act on their **own** drops for **today** only | See other drivers' drops, other days, prices, anything else |

Staff accounts are created by admins. Each account has **exactly one role**. Roles are data, so adding a new role later means creating it with a set of permissions, not hunting for role-name checks in code (ACC-04).

**Live test accounts (exact credentials, required):**

| Role | Email | Password |
|---|---|---|
| Admin | admin@test.com | Test@1234 |
| Kitchen | kitchen@test.com | Test@1234 |
| Dispatch | dispatch@test.com | Test@1234 |
| Driver | driver@test.com | Test@1234 |

## 5. Scope and prioritisation

- **Build order follows the rules first, then the screens.** All [Must] items get done properly before any [Should].
- [Should] items: **Portions** (CAT-05) and **CSV import of employees** (EMP-04). Portions are modelled in the schema from day one, so adding them later needs no migration.
- [Could] items (only if time is left): invoice void, role editor UI, live updates via SSE, dish image upload, side-by-side tier matrix, bulk kitchen actions, OpenAPI docs.
- **Cut order if time runs short** (cut from the top first): Could items → CSV import → portions UI → demo "autopilot" for today's progress → cosmetic polish. Must items are never cut. If a Must ends up partial, the README says so.

Detailed time boxes are kept in internal working notes (not part of the repository). Summary in §12.

## 6. Functional requirements

Priority tags come from the assignment: **M** = Must, **S** = Should, **C** = Could. "AC" = acceptance criteria.

### 6.1 Platform and ground rules (PLT)
| ID | Pri | Requirement | AC |
|---|---|---|---|
| PLT-01 | M | Stack: Next.js frontend, NestJS backend, Prisma ORM on PostgreSQL. | Repo shows `apps/web` (Next.js), `apps/api` (NestJS) and a Prisma schema. |
| PLT-02 | M | The frontend talks to the backend over HTTP only. No business logic in Next.js server actions or route handlers. | All reads and writes go through the NestJS REST API. The web app has no server actions and no data-mutating route handlers. |
| PLT-03 | M | Live deployment kept running for at least two weeks after submission. | Uptime monitor on the API health endpoint. Live until ≥ 2026-10-18. |
| PLT-04 | M | Four test accounts exist on the live app with the exact credentials in §4. | Each signs in successfully on the live link. |
| PLT-05 | M | Each test account has only its role's access. | Calling a forbidden endpoint returns 403 for each role (automated matrix test). Navigation shows only permitted areas. |
| PLT-06 | M | The live app already contains realistic data: several companies with employees, a real-looking menu, orders in **every status** spread across past dates, today and the coming week, and deliveries assigned to driver@test.com **for today**. | On any review day, signing in shows populated dashboards, a kitchen board for today, drops for today, and driver@test.com has drops today. |
| PLT-07 | M | "Today" is whichever day the reviewers review. | Demo data rolls forward with the calendar (§6.15). No data is pinned to a fixed date. |

### 6.2 Access and accounts (ACC)
| ID | Pri | Requirement | AC |
|---|---|---|---|
| ACC-01 | M | Four roles (Admin, Kitchen, Dispatch, Driver) with the responsibilities in §4. | Seeded roles carry the permission sets in the TRD. |
| ACC-02 | M | Each staff member has exactly one role. Admins create staff accounts and assign roles. | Staff screen: create a user (name, email, role, initial password), change role, deactivate. Deactivated users can't sign in, and their sessions stop working. |
| ACC-03 | M | Permissions are enforced on the server. Hiding a button is not access control. | Every endpoint declares its required permission. Record-level scoping (e.g. driver → own drops) happens in the service layer. |
| ACC-04 | M | Adding a role later needs no code hunt for role-name checks. | Code checks **permissions**, never role names. A new role is a data row (key, name, permissions, landing dashboard). |
| ACC-05 | M | Each role lands on its dashboard after sign-in. | Login redirects to `/dashboard`, which renders the dashboard named by the user's role. |

### 6.3 Catalogue (CAT) — assignment §4.1
| ID | Pri | Requirement | AC |
|---|---|---|---|
| CAT-01 | M | A dish has name, description, image, internal SKU number, temperature (hot/cold), cost price, allergens, dietary tags, kitchen station (optional) and an optional minimum order quantity. | Dish form captures all fields. SKU is unique. Cost is in cents, ≥ 0. MOQ ≥ 1 when set. |
| CAT-02 | M | Dishes are deactivated, never hard-deleted, because historical orders reference them. | There is no delete endpoint for dishes. Deactivated dishes disappear from menus and ordering but still show on past orders. |
| CAT-03 | M | Options are reusable choices (paneer, tofu, jeera rice, raita, …) with their own cost, allergens and dietary tags. | One option can appear in many groups across dishes. Options are deactivated, not deleted. |
| CAT-04 | M | A dish has zero or more option groups ("Choose your protein: paneer, tofu or chickpeas"). A group is required or optional, has a display order, and lists its options in order. | The group editor sets name, required flag, max selections, display order and an ordered option list. The ordering UI shows groups and options in that order. |
| CAT-05 | S | **Portions**: some groups sell options in sizes (regular, large), each with an extra charge on top of the option's own price. A group either uses portions or doesn't. If it does, every option in it must support the group's sizes. | Enabling portions on a group requires picking sizes. Saving fails if any option in the group lacks one of those sizes. Ordering requires a size for each selection in such a group, and the size's extra charge is added (A-11). |
| CAT-06 | M | Reference data are admin-managed lists: allergens, dietary tags, kitchen stations, portion sizes (and packaging types, A-21). | CRUD screens with ordering and active flags. Items in use can't be deleted, only deactivated. |
| CAT-07 | M | An order line for a dish is split into **combinations**, each with its own quantity (e.g. 10 paneer rice bowls = 6 brown rice + 4 jeera rice). | The order form lets staff split a dish's quantity across option combinations. |
| CAT-08 | M | Combination quantities must add up exactly to the dish quantity. | The server rejects a mismatch with `COMBINATION_QTY_MISMATCH`, pointing at the line. |
| CAT-09 | M | Every combination must satisfy every required group. | The server rejects a combination that misses a required group (`REQUIRED_GROUP_MISSING`, path to the combination). |
| CAT-10 | M | Combination price = (dish price + chosen option prices) × its quantity. With portions, an option's price includes its size's extra charge. | Unit test plus quote API breakdown. Integer cents. |
| CAT-11 | M | The kitchen cooks each distinct combination as one unit (KIT). | One prep unit per combination row. Duplicate combinations in a line are rejected (A-09). |
| CAT-12 | M | An order line keeps a record of what was ordered and at what price. Later catalogue or price edits never change a past order. | Lines, combinations and selections store name and price snapshots. Changing a dish price or name leaves existing orders unchanged (test). |

### 6.4 Menu (MENU) — §4.2
| ID | Pri | Requirement | AC |
|---|---|---|---|
| MENU-01 | M | Dishes are shown to employees through **categories** ("Bowls", "Breakfast", "Desserts"). Categories and their items are ordered and can be activated or deactivated. | Category list and item list are re-orderable. Active toggles apply immediately to menus. |
| MENU-02 | M | A category or item can be **hidden from specific companies**. | Company → "Menu visibility" picks hidden categories and items. Hidden things never appear on that company's menu and can't be ordered by its employees (server-checked). |
| MENU-03 | M | A category can be **secret**: not listed, but still reachable. | Secret categories don't appear in the listed menu. They can be opened by direct link (slug) and via an explicit "unlisted categories" picker in the order form and preview (A-16). |
| MENU-04 | M | Staff can **preview the menu exactly as a given employee would see it**, including pricing. | Preview by employee shows listed categories, prices on the employee's tier, available options and prices, and reachable secret categories. It explains what was excluded and why (hidden / inactive / no price). It is the same server function the order form uses. |

### 6.5 Pricing (PRICE) — §4.3
| ID | Pri | Requirement | AC |
|---|---|---|---|
| PRICE-01 | M | Several named price tiers (e.g. Standard, Enterprise, Partner). Each dish and each option can have a price on each tier. | Tier CRUD. Per-tier prices for dishes and options. |
| PRICE-02 | M | One tier is the default. | Exactly one default tier at all times (structurally enforced). The default can be switched. |
| PRICE-03 | M | A company can be put on a different tier. | Company form has a tier picker ("Default (Standard)" when unset). |
| PRICE-04 | M | An employee's price comes from their company's tier, or the default tier if the company has none. | Covered by a unit test. Moving an employee to another company changes the prices of their new orders. |
| PRICE-05 | M | A dish with no price on the employee's tier must not appear on their menu at all, never at $0 or with a blank price. | Unpriced dishes are excluded from menu, preview and ordering, with server-side rejection `PRICE_MISSING`. |
| PRICE-06 | M | A tier can **derive** prices (e.g. "cost × 2.4", "Standard price + 15%") instead of having every price typed in. Staff can still override individual prices. Derived prices **round up to the next 5 cents** ($2.11 → $2.15). | Derivation from cost or from another tier, with a multiplier. Overrides win. Ceiling to a multiple of 5¢ using integer math (A-14). Unit tests cover chains, overrides, missing bases and rounding. |
| PRICE-07 | M | Staff need a fast way to see and edit a whole tier, and to spot dishes that have no price on a tier. | The tier grid lists every dish (and option) with cost, derived price, override, effective price and source (explicit / derived / missing). Overrides are editable inline. There's a "missing only" filter and a count badge on the tiers list. |
| PRICE-08 | M | Changing a price affects new orders only. | See CAT-12. Covered by a test. |

### 6.6 Companies (COMP) — §4.4
| ID | Pri | Requirement | AC |
|---|---|---|---|
| COMP-01 | M | A company has a name, one or more email domains, one or more delivery addresses, billing contact details, and an **owner** who is one of its employees. | Company detail tabs: Profile & billing, Domains, Addresses, Calendar, Delivery defaults, Menu & pricing, Employees. The owner picker only lists that company's employees. |
| COMP-02 | M | Two companies cannot claim the same domain. Public domains such as gmail.com are not allowed. | DB-unique domain (case-insensitive, normalised). Rejects domains on the public-domain list (setting) with `PUBLIC_DOMAIN`. |
| COMP-03 | M | Calendar: working days (default Mon–Fri) and company holidays. The company can't receive deliveries on non-working days or holidays. The company calendar **does not move the cut-off**; only the kitchen calendar does. | The date picker greys out those dates and the server rejects them (`DATE_NOT_DELIVERABLE`). The cut-off calculation ignores company calendars (unit test). |
| COMP-04 | M | Delivery defaults: a default delivery time, how many minutes before delivery the order must leave the kitchen (default 60), a default packaging type, standing instructions for the driver, and a default driver. | New orders inherit these values. Instructions show on dispatch and driver screens. The default driver pre-fills drop assignment. |
| COMP-05 | M | Menu and price: the company's price tier and its hidden categories or items. | See PRICE-03 and MENU-02. |

### 6.7 Employees (EMP) — §4.5
| ID | Pri | Requirement | AC |
|---|---|---|---|
| EMP-01 | M | Every customer is an employee of exactly one company. Moving an employee to another company changes which rules apply to them. | Employee has one company (required FK). A "Move to company" action re-validates the email domain (A-18). New orders use the new company's tier, menu, calendar and defaults. |
| EMP-02 | M | Permission flags set by staff: can choose their own delivery address, can change the delivery time, can change packaging. | The order form only enables those fields when the flag is set. The server rejects a non-default value without the flag (`DELIVERY_OPTION_NOT_ALLOWED`). |
| EMP-03 | M | Employees have allergies and dietary preferences. | Multi-selects from reference lists. Conflicts are surfaced as warnings in ordering and on kitchen units (A-17). |
| EMP-04 | S | Bulk-import a company's employees from a CSV file, reporting row-level errors without rejecting the whole file. | Upload → dry-run report (row, column, message) → import valid rows. Duplicate or invalid rows are skipped and reported. |

### 6.8 Orders (ORD) — §4.6
| ID | Pri | Requirement | AC |
|---|---|---|---|
| ORD-01 | M | Staff create an order for an employee: choose a delivery date → see that employee's menu → add dishes with valid option choices → choose address, time and packaging where the employee is allowed to → see the price breakdown per line and the order total → place it. | A guided form implements the flow. The breakdown comes from the server's **quote** endpoint (the same pricing code that stores the order). |
| ORD-02 | M | **Every rule is validated on the server**, not only in the form. | Placing an invalid order via the API (bypassing the UI) fails with actionable, field-addressed errors. API-level tests prove this. |
| ORD-03 | M | Staff can save an order as a **draft**. | Drafts may be incomplete (no dishes yet) but what they contain must be valid; they are re-validated and re-priced when placed. |
| ORD-04 | M | Statuses: Draft → Placed → Confirmed → Delivered, plus Cancelled and Rejected. | State machine in TRD §7. Invalid transitions return `INVALID_TRANSITION`. |
| ORD-05 | M | Before the cut-off, Draft and Placed orders can be edited and cancelled. After the cut-off they cannot, except by an admin. | Non-admin edit or cancel after cut-off → `CUTOFF_PASSED`. Admin can, via the override permission (A-07). |
| ORD-06 | M | Searchable, filterable, **server-paginated** order list. Filters at least: delivery-date range, status, company, invoiced yes/no. | Filters and search (order number, employee name or email, company) run in SQL. Page size ≤ 100. Filter state lives in the URL. |
| ORD-07 | M | Detail page shows lines, option choices, money breakdown, delivery details and a **timeline** of the order's progress. | Timeline from the order-event history: created, placed, confirmed, kitchen started/ready, dispatch-ready, out for delivery, delivered, cancellations, overrides, invoicing, adjustments. |
| ORD-08 | M | Admins can change an order's delivery time, address or packaging after confirmation. | Override dialog. Planned times are recomputed and the order moves to the matching drop (A-27). Each change is recorded on the timeline. |

### 6.9 Cut-off (CUT) — §4.6 and §4.10
| ID | Pri | Requirement | AC |
|---|---|---|---|
| CUT-01 | M | Orders for a delivery date lock at a configured time, a configured number of **kitchen working days** before delivery. Kitchen holidays and non-working days are skipped when counting back. | Example from the brief: 2 working days at 16:00 → a Wednesday delivery locks Monday 16:00 (unit test). Holiday and weekend skips are tested. Results are in kitchen time zone regardless of server or browser TZ. |
| CUT-02 | M | Cut-off time and day count are settings. | Editable in Settings. Dates already processed stay locked (A-05). |
| CUT-03 | M | When the cut-off for a delivery date passes, every draft for that date is **cancelled** and every placed order is **confirmed** and becomes billable. | Processing runs in one transaction per date. Each change emits a timeline event. Confirmed orders join drops. |
| CUT-04 | M | Running cut-off processing twice for the same date must be safe. | Idempotent: a re-run changes nothing and records a run count (test). Concurrent runs are serialised. |
| CUT-05 | M | A way to trigger processing **manually for a past cut-off**, so a reviewer can try it without waiting. | The cut-off console in Settings lists dates with cut-off time and status and offers "Run now" / "Re-run". It also has an explicit admin "Close ordering now" for a future date (A-06). |

### 6.10 Kitchen board (KIT) — §4.7
| ID | Pri | Requirement | AC |
|---|---|---|---|
| KIT-01 | M | Shows what has to be cooked for a chosen delivery date, broken into **prep units**. Each distinct combination on an order line is one unit. | The board defaults to today (kitchen TZ) and has a date picker. Each unit shows dish, options, quantity, order #, company, employee label, allergens and planned ready time. |
| KIT-02 | M | A unit is routed to its dish's kitchen station, or "Unassigned" if the dish has none. | Station lanes or tabs, including "Unassigned". |
| KIT-03 | M | Kitchen staff filter by station and mark each unit **started** and **done**. | Filter plus one-tap Start and Done actions, with optimistic UI and server confirmation. |
| KIT-04 | M | Only confirmed orders can be worked on. | Server rejects other statuses with `ORDER_NOT_CONFIRMED`. |
| KIT-05 | M | A unit can't be started twice or finished twice. | Atomic conditional update. Second attempt → 409 `UNIT_ALREADY_STARTED` / `UNIT_ALREADY_DONE` (concurrency test). |
| KIT-06 | M | Finishing a unit that was never started is allowed and also records a start. | Done on an unstarted unit sets both timestamps (test). |
| KIT-07 | M | The order's "kitchen started" time is its first unit's start. Its "kitchen ready" time is set only when every unit is done. | Maintained under a row lock on the order, so races can't skip it (test). |
| KIT-08 | M | Each order has planned **dispatch-ready** = delivery time − company's lead minutes, and planned **kitchen-ready** = dispatch-ready − 30 minutes. | Stored on the order. The 30-minute buffer is a setting (A-25). |
| KIT-09 | M | The plan updates if the delivery time changes. | Recomputed on every delivery-time change (admin override). |
| KIT-10 | M | The board makes **late** and **at-risk** work obvious. | Colour and badge per unit and lane, plus a "Late / At risk" filter (definitions A-26). |
| KIT-11 | M | An admin can **force-complete** a whole order. | Marks all its units done (and started where missing), sets kitchen-ready, and records "forced" on the timeline. |
| KIT-12 | M | A busy day (assume 400 orders) stays responsive. | One aggregated query. Board API p95 < 500 ms on the live stack. UI stays smooth (virtualised if needed). The demo data includes a 400-order day. |

### 6.11 Dispatch and driver (DSP) — §4.8
| ID | Pri | Requirement | AC |
|---|---|---|---|
| DSP-01 | M | Orders move through kitchen ready → dispatch ready → out for delivery → delivered. Each step requires the previous one and can't be repeated. | Drop stage machine (TRD §7). Invalid step → `INVALID_TRANSITION` / `DROP_NOT_READY`. |
| DSP-02 | M | "Out for delivery" requires an assigned driver. | `DRIVER_REQUIRED` otherwise. |
| DSP-03 | M | **Drop**: orders for the same company, same address and exact same delivery time form one drop and are handled together. | Persisted drop, unique on (date, company, address, time). Stage actions apply to all its orders. |
| DSP-04 | M | Dispatch assigns a driver per drop, defaulting to the company's default driver. | Driver select per drop lists only staff who can drive (permission-based). The default is pre-filled when the drop is created. |
| DSP-05 | M | Dispatch sees each drop's status at a glance. | Board columns by stage with counts, readiness ("3/4 orders kitchen-ready"), late and at-risk badges, and driver. |
| DSP-06 | M | A driver signs in and sees **only their own drops for today**, in time order. | Server-scoped to the signed-in driver and kitchen-TZ today. No other data is reachable (403 / 404). |
| DSP-07 | M | The driver marks each drop delivered, with an optional note and an optional photo. | Mobile action sheet: note textarea, camera or file input (compressed on the device), confirm. |
| DSP-08 | M | Usable on a phone. | Mobile-first layout, large tap targets, works at 360 px width. |
| DSP-09 | M | Record whether each delivery was on time. | `deliveredOnTime` stored at delivery (A-29). Shown on drop, order timeline and dashboards. |

### 6.12 Company billing (BIL) — §4.9
| ID | Pri | Requirement | AC |
|---|---|---|---|
| BIL-01 | M | Every confirmed order is owed in full by the employee's company. | Billable = Confirmed or Delivered (A-31). Billed to the company stored on the order. |
| BIL-02 | M | Staff can see, per company, every confirmed order not yet invoiced. | Billing → company → "Unbilled" list with filters (delivery-date range), totals and pending adjustments. |
| BIL-03 | M | Group them into an invoice (an internal record, no accounting integration). | Select orders (and pending adjustments) → create invoice. Amounts are snapshotted. Invoice total = sum of its lines. |
| BIL-04 | M | Mark invoices paid. | Issued → Paid with date and optional reference. |
| BIL-05 | M | An order can be on at most one invoice. | DB unique constraint on the invoice line's order reference. A concurrent double-invoice gets a 409 (test). |
| BIL-06 | M | Decide what happens to an order that is already invoiced and still changes (admin overrides, cancellation, a delivered order that turns out short), and document it. | Policy A-32: invoices are immutable. Changes become **adjustments** billed on the next invoice. Money-changing line edits are blocked once invoiced. |

### 6.13 Settings (SET) — §4.10
| ID | Pri | Requirement | AC |
|---|---|---|---|
| SET-01 | M | Kitchen working days, kitchen holidays, cut-off time and day count, and any other platform-wide values the design needs, all editable without code or DB edits. | Settings page: kitchen days, kitchen holidays, cut-off time and days, kitchen buffer (30), at-risk window (30), on-time grace (0), delivery window (07:00–21:00), default price tier, public email domains list. |
| SET-02 | M | The kitchen time zone is stated. | Shown read-only in Settings and the README: **Asia/Kolkata (IST)**. Fixed per deployment (A-01). |

### 6.14 Dashboards (DASH) — §4.11
| ID | Pri | Requirement | AC |
|---|---|---|---|
| DASH-01 | M | Admin dashboard. | Figures A1–A7 in §8. |
| DASH-02 | M | Kitchen dashboard (a kitchen lead at 6 am). | Figures K1–K6 in §8. |
| DASH-03 | M | Dispatch dashboard. | Figures D1–D5 in §8. |
| DASH-04 | M | Driver dashboard. | Figures R1–R2 in §8. |
| DASH-05 | M | README lists, per dashboard: what is shown and why; exactly how each figure is calculated (which orders count, which date it's grouped by, how cancelled orders and missing data are treated); and what we chose not to show. | §8 is copied into the README after Phase 8 finalisation. |

### 6.15 Demo data and environment (DEMO)
| ID | Pri | Requirement | AC |
|---|---|---|---|
| DEMO-01 | M | A one-time seed creates roles, the four test accounts plus extra staff (more drivers and kitchen staff), reference data, a real-looking menu (~30 dishes, ~20 options), price tiers (incl. a derived tier and a tier with gaps), 6 companies with domains, addresses, calendars and defaults, and ~60–80 employees per company. | `pnpm db:seed` is idempotent. |
| DEMO-02 | M | A **rolling generator** guarantees orders for past dates (≈ 3 weeks), today and the coming week, relative to the current kitchen date, in every status, including drops for driver@test.com today and one ~400-order day. | Runs at boot, daily at 00:05 IST, and lazily on the first request of a new day. Idempotent per date. |
| DEMO-03 | S | Demo **autopilot** advances demo orders nobody has touched (completes past days; progresses today by the clock) so history and today look alive while leaving work for reviewers. | Never touches an order a human acted on. |

## 7. Key user journeys

**J1 — Admin onboards a company.** Create company (name, billing contact) → add domain(s) (rejects gmail.com and duplicates) → add delivery addresses (one default) → calendar (working days, holidays) → delivery defaults (time 12:30, lead 60, packaging, instructions, default driver) → tier → hidden categories/items → add or import employees → pick owner.

**J2 — Staff place an order on behalf of an employee.** Orders → New → pick employee (search by name, email or company) → calendar shows open dates (locked, non-working and holiday dates are greyed out with reasons and cut-off times) → employee's menu (listed categories plus an "unlisted" picker) → add dish → set quantity → split into combinations (each row: choose options per group, portion size if any, quantity; running "6 / 10 allocated") → delivery options (enabled per employee flags) → live server quote with per-line breakdown and total, plus allergy/diet warnings → **Save draft** or **Place**. Placing re-validates everything on the server. Errors map onto the exact field.

**J3 — Cut-off.** At 16:00 IST two kitchen working days before a date, drafts are cancelled and placed orders are confirmed (and grouped into drops). An admin can open Settings → Cut-off console to see each date's cut-off and status, re-run a past date (idempotent), or close a future date early.

**J4 — Kitchen lead at 6 am.** Signs in → kitchen dashboard: today's workload by station, first deadlines, late and at-risk units, production summary ("Paneer Tikka Bowl ×46: brown rice 30 / jeera rice 16"), allergen watch → opens board → filters to a station → taps Start / Done. Late units turn red, at-risk ones amber.

**J5 — Dispatcher.** Dispatch dashboard: drops by stage, unassigned drops, late and at-risk, driver load → board: assign or confirm drivers → when a drop's orders are all kitchen-ready, mark **Dispatch ready** → hand over → **Out for delivery**.

**J6 — Driver on a phone.** Signs in → today's drops in time order (next one highlighted, with address, time, boxes and instructions) → **Picked up** (out for delivery, if dispatch hasn't done it) → on arrival, **Mark delivered**, add a note and optionally take a photo → on-time is recorded automatically.

**J7 — Billing.** Billing → companies with unbilled totals → company → select orders (e.g. last week) plus pending credits → **Create invoice** (snapshot) → later **Mark paid**. If an invoiced order is cancelled, a credit adjustment appears automatically, ready for the next invoice.

## 8. Dashboard definitions (draft, finalised in Phase 8, copied to the README)

Conventions for all figures:
- "Today" = the current date in the kitchen time zone (Asia/Kolkata), computed on the server.
- Orders are **grouped by delivery date** (not creation date) unless stated otherwise.
- "Committed orders" = status **Confirmed or Delivered**. Draft and Placed are not committed (they can still change). Cancelled and Rejected never count towards workload or revenue. They are reported separately where useful.
- Money is pre-tax, at the prices captured on the order. "Booked value" excludes billing adjustments, which are shown in billing figures only.
- Missing data: a dish without a station counts under "Unassigned". A ratio with an empty denominator shows "—", never 0% or 100%. A drop without a driver counts as "Unassigned".

### Admin: "Is today's service on track, and is the business healthy this week?"
| # | Figure | Definition | Why |
|---|---|---|---|
| A1 | Today's service | Count of committed orders with delivery date = today, **boxes** = sum of their line quantities, **booked value** = sum of their totals. Today's cancelled/rejected count is shown beside it. | Volume and value of the day at a glance. |
| A2 | Kitchen progress today | Done units ÷ all units of today's committed orders. Late units now (A-26). | Is the kitchen keeping up? |
| A3 | Deliveries today | Delivered drops ÷ all drops with delivery date = today. On-time % = on-time delivered drops ÷ delivered drops ("—" if none delivered). | Customer-facing reliability. |
| A4 | Next cut-off | The nearest delivery date whose cut-off is still in the future: cut-off time, number and value of Placed orders (to be confirmed), number of Drafts (to be auto-cancelled). | Chase drafts before they're cancelled. Anticipate the next day's volume. |
| A5 | Booked value, last 14 days | Sum of committed order totals per delivery date for the 14 delivery dates up to and including today. Cancelled/rejected excluded. | Trend without invented forecasts. |
| A6 | Receivables | **Unbilled** = sum of totals of committed orders not on any invoice + sum of pending adjustments (all delivery dates, including future confirmed), per company (top 5 + total). **Outstanding** = sum of totals of Issued (unpaid) invoices, their count, and the oldest issue date. | Cash: what still needs invoicing and what's unpaid. |
| A7 | Catalogue health | Active dishes on the menu with **no effective price** on each tier (count per tier, linking to the tier grid filtered to missing). Companies without an owner or default driver. | Dishes silently missing from a company's menu are a real failure mode (PRICE-05). |
Not shown: profit or margin (costs are hand-entered estimates and would suggest false precision), per-employee analytics, forecasts.

### Kitchen (kitchen lead at 6 am): "What do we cook, by when, and what's slipping?"
| # | Figure | Definition | Why |
|---|---|---|---|
| K1 | Workload by station | For units of today's committed orders: count and boxes (sum of unit quantities) per station, split into not started / in progress / done. "Unassigned" is its own row. | Who is busiest. Plan staffing. |
| K2 | Next deadlines | Earliest planned kitchen-ready times among not-done units, grouped by time slot, with the unit count per slot (next 5 slots). | Sequence the work. |
| K3 | Late and at risk | Not-done units whose planned kitchen-ready time has passed (late) or is within the at-risk window, default 30 min (at risk). | Act now. |
| K4 | Production summary | Per dish: total boxes and the split by combination (option choices + portion), with station and hot/cold. | The cook list, aggregated across orders. |
| K5 | Allergen watch | Unit count per allergen present (dish + chosen options). Units where the employee's declared allergy is present in the unit are flagged separately (should be 0). | Food safety. |
| K6 | Tomorrow | Units and boxes by station for tomorrow's committed orders. If tomorrow's cut-off hasn't passed yet, shows "Placed so far" labelled provisional. | Overnight prep (marinades, soaking). |
Not shown: prices, revenue, billing. Draft and Placed orders are excluded from today's figures because they aren't commitments.

### Dispatch: "What must leave, with whom, and what is late?"
| # | Figure | Definition | Why |
|---|---|---|---|
| D1 | Drops by stage (today) | Counts of today's drops in: waiting for kitchen (pending, not all orders kitchen-ready) · ready to dispatch (pending, all kitchen-ready) · dispatch ready · out for delivery · delivered. | Flow at a glance. |
| D2 | Unassigned drops | Today's drops not yet out for delivery that have no driver. | Must be 0 before departure. |
| D3 | Late and at risk | Drops not yet out for delivery whose planned dispatch-ready time has passed (late) or is within the at-risk window. Plus count of drops delivered late today. | Prioritise the door. |
| D4 | Driver load | Per driver: today's drops (total / remaining), boxes, next departure time. | Balance assignments. |
| D5 | On-time rate | On-time delivered drops ÷ delivered drops, today and for each of the last 7 delivery dates ("—" when none). | Service quality trend. |
Not shown: money, kitchen unit detail (only per-drop readiness).

### Driver: "Where do I go next?"
| # | Figure | Definition | Why |
|---|---|---|---|
| R1 | My drops today | The signed-in driver's drops with delivery date = today, in delivery-time order. Remaining vs delivered count. The next drop is highlighted with time, company, address, boxes, instructions and contact. | The whole job on one screen. |
| R2 | My on-time today | On-time delivered ÷ delivered (own drops, today). | Feedback without surveillance. |
Not shown: other drivers' drops, money, other days.

## 9. Non-functional requirements (NFR)
| ID | Requirement | How we meet it |
|---|---|---|
| NFR-01 | **Money correctness**: no floating point. Order total = sum of its lines. Invoice total = sum of its lines/orders. | Integer cents everywhere. Multipliers as integer basis points. Rounding by integer ceiling division. Totals computed by one domain function and stored. Reconciliation tests. |
| NFR-02 | **Time zones**: cut-offs, delivery dates and "today" are correct regardless of server or browser TZ. State the TZ. | Kitchen TZ = Asia/Kolkata (env, validated). Dates stored as SQL `DATE`, times of day as minutes, instants as `timestamptz`. The server computes "today". The UI formats with an explicit `timeZone`. Domain tests run under several `TZ` values. |
| NFR-03 | **Concurrency**: two staff acting on the same order or unit at once must not corrupt it. | Compare-and-set updates, an order-row lock for unit changes, optimistic versions on order edits, an advisory lock per cut-off date, and unique constraints. See TRD §4.6. |
| NFR-04 | **Validation**: on the server, with errors the user can act on. | Shared Zod schemas, plus domain rule checks with field paths. One error envelope. Forms map errors onto fields. |
| NFR-05 | **Performance**: server-side pagination. Kitchen board for a 400-order day stays responsive. | Paginated list endpoints, targeted indexes, one board query, compact payloads, a virtualised list. |
| NFR-06 | **Code quality**: clear module boundaries, shared types, consistent error handling. Lint and type-check clean. | Monorepo (`apps/*`, `packages/shared`, `packages/domain`). CI runs lint, type-check and tests. |
| NFR-07 | **Tests** for the rules most likely to break: cut-off, pricing resolution, combination counting, invoicing. | Vitest unit tests in `packages/domain` plus API integration tests for concurrency and idempotency. |
| NFR-08 | **Security** basics. | argon2id password hashing, httpOnly SameSite cookie, login rate limit, helmet, permission guard on every route, row scoping, upload type and size checks. |
| NFR-09 | **Availability** for review. | Render service kept warm by an uptime monitor. Neon DB. Health endpoints. Data rolls daily. |

## 10. Interpretations of ambiguous requirements (canonical list, copied into the README)

| ID | Topic | Our interpretation |
|---|---|---|
| A-01 | Time zone and currency | Kitchen time zone **Asia/Kolkata** (IST, UTC+5:30, no DST), fixed per deployment. Currency **USD**, stored as integer cents. No tax, no fees. *(Confirmed by owner 2026-10-03.)* |
| A-02 | Valid delivery dates | A delivery date must be a **kitchen** working day that isn't a kitchen holiday (the kitchen cooks on the delivery day), **and** a **company** working day that isn't a company holiday. |
| A-03 | Kitchen calendar in live data | The live kitchen works **7 days a week** (two client sites, a hospital and a support centre, work weekends) so every possible review day has operations. Office companies keep the Mon–Fri default. The platform default for kitchen working days is Mon–Fri. |
| A-04 | Counting the cut-off | Count back N **kitchen working days** from the delivery date. The delivery day itself is not counted. Kitchen non-working days and holidays are skipped. Lock at the cut-off time on the day reached, in kitchen TZ. N = 0 means the same day at the cut-off time. Company calendars are ignored. |
| A-05 | Changing cut-off settings | Until a date has been processed, its cut-off follows the current settings. Once processed, it stays locked even if settings change later. |
| A-06 | How processing is triggered | (1) Automatically at each computed cut-off instant. (2) On demand, before any read or write that touches a date whose cut-off has passed (so a sleeping scheduler can never leave stale statuses). (3) Manually from the admin cut-off console: "Run" / "Re-run" for past cut-offs, and an explicit admin **"Close ordering now"** for a future date, which runs the same processing early (handy for reviewers). |
| A-07 | After the cut-off | Non-admins can't create, edit or cancel orders for a locked date. Admins can (override). An admin order created for a locked date is placed **directly as Confirmed**, because that date's confirmation has already happened. Drafts can't be saved for locked dates. |
| A-08 | When prices are captured | A draft is re-priced and fully re-validated when it is **placed**. Prices are captured at placement. When a Placed order is edited, only lines whose content changed are re-priced; unchanged lines keep their captured prices. |
| A-09 | Lines and duplicates | One line per dish per order. The line holds the combinations. Two identical combinations in one line are rejected; the UI merges them. |
| A-10 | Option group semantics | Groups are single-choice by default (max 1). Required = at least one selection. Optional = zero up to max. A group may allow several selections (max > 1, e.g. "Add sides"). An option can appear at most once per combination per group. |
| A-11 | Portions | A portion-enabled group lists the sizes it sells. An option "supports" a size when it defines that size's extra charge. Every option in the group must support all the group's sizes. Every selection in such a group must name one of them. The extra charge is a flat amount on top of the option's tier price (not tier-priced itself). |
| A-12 | Unpriced options | An option with no price on the employee's tier isn't offered. If a required group ends up with no orderable option, the dish is hidden (it couldn't be ordered validly). |
| A-13 | Price values | Explicit dish prices must be > $0. Explicit option prices may be $0 (a free choice that is still chosen). "No price" means no explicit price and no derivable price, which is different from $0. |
| A-14 | Derived prices | Derived price = base × multiplier, where base = the item's cost or its effective price on another tier. Chains are allowed, cycles are rejected. Rounded **up** to the next multiple of 5¢ (exact multiples unchanged), using integer math. An explicit price on the tier overrides derivation. If the base is missing, the derived price is missing too. Manual tiers only have explicit prices. |
| A-15 | Menu visibility | Hiding applies per category and per **menu item** (a dish's placement in a category). Hidden beats secret. An inactive category, menu item or dish is not shown. Categories with no visible items aren't listed. |
| A-16 | Secret categories | Not listed, but reachable by direct link (slug). In the admin panel, the order form and the preview offer an explicit "Unlisted categories" picker to reach them. |
| A-17 | Allergies and diets | They never hide menu items (the brief says items are shown or hidden only by active flags and company hiding). Conflicts appear as warnings when ordering and as flags on kitchen units. A combination's allergens = union of dish + chosen options. Its dietary tags = tags shared by the dish and every chosen option. |
| A-18 | Employee email and moves | An employee's email must use one of their company's domains. Moving to another company requires an email on the new company's domains. Existing orders stay with the company they were placed under (billing follows the order). A moved employee's open orders can only be cancelled. |
| A-19 | "Choose own delivery address" | Means choosing among the company's active delivery addresses (deliveries go to company offices). Without the flag, the company's default address is used. |
| A-20 | "Change delivery time" | Any time inside the kitchen delivery window (setting, default 07:00–21:00) in 15-minute steps. Without the flag, the company default time is used. |
| A-21 | Packaging types | An admin-managed reference list. The brief mentions a "default packaging type" without defining the list. |
| A-22 | Minimum order quantity | Applies to the dish's line in an order, i.e. per order (one line per dish). |
| A-23 | Status meanings | **Confirmed** covers all kitchen and dispatch progress. **Delivered** is set when the order's drop is delivered. **Cancelled** = withdrawn (staff before cut-off, admin after, or automatic for drafts at cut-off). **Rejected** = an admin refuses a Placed or Confirmed order (e.g. can't be fulfilled), with a reason. Neither Cancelled nor Rejected is billable. |
| A-24 | Prep unit | One combination of one order line. The unit's quantity is the combination's quantity. |
| A-25 | Planned times | Computed when the order is saved, placed or confirmed, and recomputed whenever the delivery time changes. The company's lead minutes are captured on the order. The 30-minute kitchen buffer is a setting (default 30). |
| A-26 | Late and at-risk | Kitchen: a not-done unit is **late** once now ≥ planned kitchen-ready, and **at risk** within the at-risk window before it (setting, default 30 min). Dispatch: a drop not yet out for delivery is late once now ≥ planned dispatch-ready, and at risk within the window before it. |
| A-27 | Drops | Persisted, keyed by (delivery date, company, address, delivery time). An order joins its drop when confirmed. If an admin changes time or address, the order moves to the matching drop (empty drops are removed). An order can't join a drop that is out for delivery or delivered. A dispatch-ready drop goes back to pending if a not-yet-ready order joins it. |
| A-28 | Who advances drops | Dispatch marks dispatch-ready. Out for delivery is marked by dispatch or by the assigned driver ("Picked up"). Delivered is marked by the assigned driver; dispatch or admin can record it on the driver's behalf. |
| A-29 | On time | Delivered at or before the scheduled delivery time plus a grace period (setting, default 0 min). Recorded once at delivery and not recomputed later. |
| A-30 | Driver's "today" | Kitchen-TZ today. Drivers only see today's drops. |
| A-31 | When an order becomes billable | At confirmation (owed even before delivery). Delivered orders remain billable. Cancelled and Rejected orders are not. |
| A-32 | **Changes to invoiced orders** (BIL-06) | Invoices are immutable once issued; only the status moves to Paid. After invoicing: **non-money** changes (time, address, packaging) are allowed. **Money-changing** line edits are blocked (`ORDER_INVOICED`). **Cancelling or rejecting** an invoiced order automatically creates a **credit adjustment** for its net billed amount. A delivered order that turns out **short** gets a manual credit adjustment (amount + reason). Pending adjustments are billed on the company's **next invoice** as separate lines. Net credits for an order never exceed what was billed for it. |
| A-33 | Invoice totals | Invoice total = sum of its lines (orders at their captured totals, plus adjustment lines). An invoice holding only credits is allowed (negative total = credit note). |
| A-34 | Voiding invoices | Not supported in v1. Mistakes are corrected with adjustments. |
| A-35 | Delivery photos | Optional, JPEG/PNG/WebP, compressed on the phone to roughly ≤ 1 MB, stored in Postgres behind a file-service interface (S3-compatible storage is the scale-up path). |
| A-36 | Timeline vs audit log | The order timeline is an append-only history of order events. It is not a general audit log (audit logs are out of scope). |
| A-37 | Staff onboarding | The admin sets the initial password. No invite emails (notifications are out of scope). |
| A-38 | Company owner | Must be an employee of that company. A company can be created before its first employee; the owner is set afterwards and flagged on the admin dashboard until then. |
| A-39 | Dish images | Image URL field (seeded with stock food photos). Upload through the same file store if time allows. |
| A-40 | Demo data | The live dataset is generated relative to the current kitchen date and topped up daily. An "autopilot" advances only seeded orders nobody has touched. |
| A-41 | Kitchen and Dispatch read access | Kitchen: read-only orders (incl. employee allergies), catalogue, menu and reference data. Dispatch: read-only orders, companies and kitchen progress. |
| A-42 | Human-friendly numbers | Orders are numbered `FL-000123`, invoices `INV-0042`, both from database sequences. |

## 11. Deliverables and acceptance (DEL)
| ID | Deliverable | Acceptance |
|---|---|---|
| DEL-01 | Live link with the four test accounts working | All four sign in. Data present for today. Up ≥ 2 weeks. |
| DEL-02 | Public Git repository with a clean commit history | Conventional, logical commits. No secrets. No internal working notes. |
| DEL-03 | README.md | Local setup · architecture overview + data model diagram · key decisions and trade-offs · dashboard definitions (§8) · prioritisation notes (built / skipped / why / next) · ambiguities and interpretations (§10). |
| DEL-04 | Submission | Google Form with live link + repo link before **2026-10-04 23:59 IST**. |

## 12. Release plan (summary)
Phases are ordered rules first, then screens:

| Phase | Content |
|---|---|
| 0 | Foundations: monorepo, auth + RBAC, app shell, **early deploy** of a walking skeleton |
| 1 | Data model, domain core (money, calendar/cut-off, pricing, combinations, menu, invoicing) with tests, base seed |
| 2 | Ordering + cut-off engine and console |
| 3 | Kitchen board |
| 4 | Dispatch board + driver view |
| 5 | Billing |
| 6 | Catalogue, pricing and menu admin screens (tier grid, preview) |
| 7 | Companies, employees, staff and settings screens (+ CSV import [S]) |
| 8 | Dashboards + definitions |
| 9 | Rolling demo data, production deploy, hardening |
| 10 | README, QA with the four accounts, submission |

## 13. Decisions confirmed by the owner (2026-10-03)
- Hosting: **Vercel** (web) + **Render** (API) + **Neon** (PostgreSQL), with an uptime monitor keeping the API warm.
- Time zone and currency: **Asia/Kolkata + USD**.
- Internal working notes stay **out of the public repo**. `docs/` is public.
