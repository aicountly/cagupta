# React Frontend — Module Map

Each subdirectory is a self-contained domain module with its own
pages, services (API clients), and components.

The top-level `App.jsx` imports page components from these modules and
wires them to routes. Shared code (auth, hooks, constants, context)
remains at `src/` root level.

## Module → Responsibility

| Module          | What lives here                                                       |
|-----------------|-----------------------------------------------------------------------|
| **core**        | Login, Dashboard, Profile, UserManagement, Settings, Sidebar, TopBar  |
| **crm**         | Contacts, Organizations, ClientGroups, Clients, Leads, quotation/engagement services |
| **operations**  | Services, service logs, time entries, recurring defs, registers, credentials, calendar, appointments, leaves, KYC, reports |
| **finance**     | Invoices, transactions, opening balances, Razorpay                    |
| **affiliate**   | Affiliate portal pages (Dashboard, Services, Commissions, Payouts, Bank, SubAffiliates), admin affiliate management |
| **partner**     | Partner portal pages (Dashboard, Assignments, Payouts, Bank), admin partner management |
| **client**      | Client portal pages (ActiveServices, CompletedServices, ServiceDetails, Ledger, Profile) |

## Shared code (NOT in modules/)

| Directory       | Contents                                          |
|-----------------|---------------------------------------------------|
| `auth/`         | AuthContext, ProtectedRoute                       |
| `hooks/`        | Custom React hooks (useStaffUsers, useServiceTimer, etc.) |
| `constants/`    | Config, roles, feature flags                       |
| `context/`      | NotificationContext                                |
| `utils/`        | Utility functions                                  |
| `assets/`       | Images, logos                                      |

## For AI agents

When working on a task, scan **only the relevant module folder** plus
`App.jsx` (for route wiring) and `auth/` or `constants/` if needed.
This keeps context small and focused.
