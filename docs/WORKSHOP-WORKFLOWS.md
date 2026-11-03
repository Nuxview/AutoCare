# Workshop workflows

## Permissions

| Capability              | Owner/admin | Manager | Advisor | Mechanic          | Inventory clerk | Accountant |
| ----------------------- | ----------- | ------- | ------- | ----------------- | --------------- | ---------- |
| Booking review          | Yes         | Yes     | Yes     | No                | No              | No         |
| Schedule changes        | Yes         | Yes     | Yes     | Own schedule read | No              | No         |
| Repairs and parts usage | Yes         | Yes     | Yes     | Assigned jobs     | No              | No         |
| Send quotes             | Yes         | Yes     | Yes     | No                | No              | No         |
| Inventory management    | Yes         | Yes     | No      | No                | Yes             | No         |
| Invoices/payments       | Yes         | Yes     | Yes     | No                | No              | Yes        |
| Staff invitations       | Yes         | No      | No      | No                | No              | No         |
| Garage settings         | Yes         | Yes     | No      | No                | No              | No         |
| Platform subscription   | Yes         | No      | No      | No                | No              | No         |

Only the owner can invite/deactivate administrators. Owners cannot be deactivated through staff management. Non-admin invitations require a branch. Customers alone decide their repair quotes and manage history-sharing grants/reminders.

## Data flow

UI → authenticated Next.js route → role/ownership validation → service-role Supabase client → transaction/RPC → response.

`src/lib/permissions.ts` is the shared navigation/capability map. UI restrictions are supplemented by route authorization. Database RPCs independently enforce actor membership, branch boundaries, job assignment and approval state. Only `service_role` can invoke the new RPCs; their actor IDs come from server-verified sessions. New tables enable RLS and deny browser-role table access.

Quotes lock the job row and assign sequential versions. Decisions lock the same job and reject an outdated version. Parts movements lock the job and inventory row and carry a unique request ID for retry safety. Invoice creation locks the job and returns the existing invoice on repeat requests. Scheduling serializes by branch and mechanic and checks overlapping intervals, including mechanics who work across branches.

History is explicitly projected to customer-facing fields. Garage access requires an owner grant plus an active authorized membership; this does not grant access to another garage's operational endpoints or internal notes. Signed photo links expire after five minutes.

## Setup and rollout

1. Back up the target database according to your normal deployment process.
2. Apply all SQL migrations in filename order, ending with `20261102133752_workshop_workflows.sql`.
3. Configure the existing Supabase URL, publishable key, server secret and field-encryption key in the application environment.
4. Deploy the application and sign in as an owner to configure bays and invite staff.
5. Use a customer account and invited mechanic to exercise a complete booking, assignment, quote approval, stock usage, invoice and collection journey.

This checkout does not include live `.env` credentials or a linked Supabase project. Local implementation/testing does not apply the migration to a hosted database.

## Verification

`npm test` includes an embedded PostgreSQL suite that applies every migration and tests stale/wrong-customer decisions, approval gates, stock deduction and returns, idempotency, shortages, invoice totals, scheduling conflicts, invitation identity, service mileage, server-role grants and legacy-invoice handover. Separate tests cover history ownership and revocation plus the role capability matrix.

The embedded database stubs Supabase's managed Auth and Storage schemas. It validates SQL transactions and grants, but does not replace hosted Supabase/PostgREST relationship checks, real Auth sessions, actual Storage uploads, or a live browser acceptance test.

`npm run typecheck`, `npm run lint`, and `npm run build` validate the application. No automatic notification delivery, individual mechanic shifts, cross-business staff switching, owner transfer, credit-note/refund workflow, or native PDF renderer is introduced.
