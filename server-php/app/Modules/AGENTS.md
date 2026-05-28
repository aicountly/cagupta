# PHP Backend — Module Map

Each subdirectory is a self-contained domain module with its own
Controllers and Models. Original PSR-4 namespaces are preserved
(`App\Controllers\*`, `App\Models\*`) so no `use` statement changes
are needed; the autoloader in `public/index.php` resolves classes
by scanning `Modules/*/` automatically.

## Module → Responsibility

| Module          | What lives here                                                 |
|-----------------|-----------------------------------------------------------------|
| **Core**        | Auth, users, roles, sessions, dashboard, audit logs             |
| **CRM**         | Contacts, organizations, client groups, leads, quotations, engagement types, service categories |
| **Operations**  | Services, service logs, time entries, recurring definitions, registers, credentials, portal types, appointments, leaves, KYC, calendar sync |
| **Finance**     | Invoices, transactions (txn), opening balances, Razorpay events |
| **Associate**   | Associate profiles, commission rates, accruals, payouts, bank details, upline tracking |
| **Partner**     | Partner profiles, assignments, payout accruals/requests, bank details |
| **Client**      | Client portal identity, OTP login, client sessions, client-facing service logs |
| **Integrations**| Zoom, Google/Outlook/Apple calendar callbacks, Razorpay webhooks |

## Shared code (NOT in Modules/)

| Directory       | Contents                                          |
|-----------------|---------------------------------------------------|
| `Config/`       | Database, Auth, App, Routes configuration          |
| `Controllers/`  | `BaseController.php` — abstract parent for all controllers |
| `Filters/`      | Auth, Permission, Role middleware                  |
| `Libraries/`    | JWT, Brevo mailer, OTP service, password hasher, etc. |
| `Helpers/`      | Response helper functions                          |
| `Templates/`    | Email HTML templates                               |

## For AI agents

When working on a task, scan **only the relevant module folder** plus
`Config/Routes.php` (for API routes) and `Controllers/BaseController.php`
(for shared controller methods). This keeps context small and focused.
