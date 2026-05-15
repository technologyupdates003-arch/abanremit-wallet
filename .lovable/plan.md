# Continue Transaction Engine + Begin Super Admin Control Center

## Part A — Finish Transaction Engine (this turn)

1. **Convert page** (`src/routes/_app/convert.tsx` + `src/components/app/ConvertPage.tsx`)
   - Source/destination wallet selectors (own wallets only, different currencies)
   - Live rate preview via `getExchangeRate` server fn (debounced)
   - Amount input with destination preview (`amount × effective_rate`)
   - PIN step → calls `convertCurrency` with idempotency key
   - Success receipt with rate, source/destination amounts, reference
   - Realtime balance refresh on success

2. **Realtime wallet hook** (`src/hooks/useWalletRealtime.ts`)
   - Subscribes to `wallets`, `transactions`, `wallet_ledger` postgres_changes for current user
   - Invalidates relevant React Query keys
   - Mount once at app shell (`_app` layout) so all pages get live updates
   - Enable realtime on `wallets`, `transactions`, `wallet_ledger`, `notifications` via migration

3. **Webhook refactor** (`src/routes/api/public/paystack-webhook.ts`)
   - For `charge.success`: write a `transactions` row (type=`card_funding`, status=`successful`) alongside existing `credit_wallet_from_payment` flow
   - For `transfer.success/failed/reversed`: also insert `transaction_status_history` row tied to the withdrawal's transaction (create `transactions` row when withdrawal is initiated if not already)
   - Keep existing `finalize_withdrawal` / `reverse_withdrawal` calls (already atomic)
   - Idempotent on `withdrawal_webhooks` table

4. **Send page polish**: add link to Convert when currency mismatch detected (already wired to error — turn it into a CTA).

## Part B — Super Admin Control Center (foundation, this turn)

Scope realistically: deliver a production-grade **foundation** with the highest-value modules wired end-to-end. Defer leaf modules (AbanCoin market controls, IntaSend, support desk, system settings UI) to follow-ups — they get DB-ready scaffolding only.

### B1. RBAC + admin guard (migration)
- Extend `app_role` enum: add `super_admin`, `finance_admin`, `support_admin`, `compliance_admin`, `fraud_admin`, `operations_admin`
- New helper RPC `is_admin(uid)` → true for any non-`user` role
- New helper RPC `has_admin_role(uid, role)` for granular checks
- New `admin_audit_logs` table (admin_id, action, entity, entity_id, metadata, ip, user_agent, created_at) — RLS: admins read, inserts via SECURITY DEFINER only
- New TanStack server middleware `requireAdmin` (reuses `requireSupabaseAuth`, then checks `is_admin`)
- Route guard `_admin/route.tsx` → `beforeLoad` calls a `getAdminContext` server fn, redirects to `/` if not admin
- First admin bootstrap: SQL function `bootstrap_first_admin(email)` callable once; document for the user

### B2. Admin server functions (`src/lib/admin.functions.ts`)
All `.middleware([requireAdmin])`, all log to `admin_audit_logs`:
- `adminListUsers({ search, page, kyc_status, status })` — paginated profiles + roles + wallet totals
- `adminGetUser(userId)` — full profile, wallets, devices, recent tx, kyc docs (signed URLs), pin_attempts, audit
- `adminFreezeWallet(walletId, reason)` / `adminUnfreezeWallet(walletId)` — sets `wallets.status`
- `adminAdjustBalance(walletId, amount, direction, reason)` — atomic via new RPC `tx_admin_adjust` (creates `transactions` row type=`admin_adjustment`, ledger entry, audit log)
- `adminApproveKyc(userId, tier)` / `adminRejectKyc(userId, reason)` — updates profile + kyc_documents
- `adminListTransactions({ filters, cursor })` — server-side pagination with all filters from prompt
- `adminListWithdrawals({ status })` / `adminApproveWithdrawal(id)` / `adminRejectWithdrawal(id, reason)` — calls existing `reverse_withdrawal` for rejects
- `adminSetExchangeRate(from, to, rate, spread)` — upsert into `exchange_rates`
- `adminReplayWebhook(webhookId)` — re-runs webhook handler logic for stuck rows
- `adminDashboardStats()` — single fn returning all KPI counters

### B3. Admin UI shell (`src/routes/_app/admin/`)
Coal-black + matte-glass + red-accent theme (introduce `--admin-bg`, `--admin-surface`, `--admin-accent` tokens scoped under `[data-theme="admin"]` so it doesn't bleed into the rest of the app).
- `admin/index.tsx` — Dashboard (KPI grid, live tx ticker via realtime, gateway health pings, revenue chart placeholder backed by real `transactions` aggregates)
- `admin/users.tsx` — searchable, paginated table; row → drawer with full user profile, action buttons (freeze, unfreeze, approve KYC, reset PIN)
- `admin/transactions.tsx` — full filter bar, virtualized table, row → drawer with ledger entries + status history + reversal action (where allowed)
- `admin/withdrawals.tsx` — operational queue grouped by status, approve/reject/retry actions
- `admin/kyc.tsx` — review queue with document viewer (zoomable), approve/reject with notes
- `admin/wallets.tsx` — search/freeze/adjust UI, with mandatory reason + confirmation modal for adjustments
- `admin/rates.tsx` — exchange-rate editor with spread, last-updated, history
- `admin/audit.tsx` — admin audit log viewer (filterable by admin, action, entity, date)
- `admin/security.tsx` — login attempts, pin lockouts, session revocation (defers external IP block to backlog)
- Sidebar nav with role-gated items (use `has_admin_role` checks)
- Realtime: subscribe to `transactions`, `withdrawals`, `kyc_documents` for live counters

### B4. Realtime publication
- Single migration adding `wallets`, `transactions`, `wallet_ledger`, `notifications`, `withdrawals`, `kyc_documents`, `audit_logs` to `supabase_realtime` publication

### B5. Deferred (scaffolded, not built this turn)
- AbanCoin market control UI (engine logs already exist, build read-only viewer only)
- IntaSend control center (no IntaSend integration in project yet)
- Support desk (no tickets schema yet — defer table + UI)
- System settings UI (DB row exists conceptually only — defer)
- Per-permission ACL beyond role-level checks

## Technical notes

- All admin mutations go through `SECURITY DEFINER` RPCs that re-verify `is_admin(auth.uid())` server-side — RLS is the backstop, middleware is the gate.
- `tx_admin_adjust` follows the same atomic pattern as `tx_execute_transfer`: lock wallet `FOR UPDATE`, write `transactions` row, write `wallet_ledger` entry, write `transaction_status_history`, write `admin_audit_logs`.
- Ledger remains immutable — adjustments create new entries, never UPDATE/DELETE.
- Admin theme uses scoped CSS variables; existing user-facing theme stays untouched.
- RBAC checks happen in three layers: route `beforeLoad` (UX), server fn middleware (auth), Postgres RPC (data).

## Out of scope this turn (will state in reply)
- Email/SMS alert delivery (DB notifications only)
- AML/sanctions list integration
- Automated fraud-rule engine (manual review queue only)
- Bulk CSV exports (defer)
- Per-role granular permission matrix UI (role-level only)
