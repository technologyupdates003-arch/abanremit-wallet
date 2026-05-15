# AbanRemit Transaction Engine

A banking-grade transaction core that becomes the **single source of truth** for every wallet movement in the app. All existing flows (card funding via Paystack, bank withdrawals via Paystack Transfer) get re-routed through it; new flows (wallet-to-wallet, internal FX) are added on top.

## Guiding principles

- **Ledger is truth.** `balance` on `wallets` is a cached projection; every change is backed by an immutable `ledger_entries` row.
- **Atomic.** Every state change happens inside a single Postgres function with `FOR UPDATE` row locks — no multi-statement client orchestration.
- **Locked vs available.** `wallets.locked_balance` is added; `available = balance - locked_balance`. All preflight checks use available.
- **Idempotent.** Every external-facing mutation requires a client-supplied `idempotency_key`; replays return the original result.
- **Immutable history.** Reversals create new compensating entries — never `UPDATE`/`DELETE` on the ledger.

---

## Phase 1 — Schema (single migration)

**Extend `wallets`:**
- `locked_balance numeric not null default 0`
- `status wallet_status not null default 'active'` (`active|frozen|closed`)
- generated column `available_balance` = `balance - locked_balance`
- CHECK `balance >= 0`, `locked_balance >= 0`, `locked_balance <= balance`

**New `transactions` (master orchestrator table):**
`id, reference (unique), idempotency_key (unique), user_id, type (tx_type enum), status (tx_status — extend with queued/locked/processing/successful/reversed), sender_wallet_id, receiver_wallet_id, amount, fee, source_currency, destination_currency, exchange_rate, gateway, gateway_reference, narration, metadata jsonb, ip, user_agent, processed_at, created_at, updated_at`

**Extend `wallet_ledger` → rename concept to `ledger_entries`** (keep table name `wallet_ledger` for back-compat, add columns):
- `transaction_id uuid` (FK to transactions)
- `entry_type` (`debit_lock | debit_settle | credit | fee | fx_in | fx_out | reversal`)
- `reference text`
- index on `(transaction_id)`, `(wallet_id, created_at desc)`

**New `transaction_status_history`:** append-only audit of state transitions (`transaction_id, from_status, to_status, reason, actor, created_at`).

**New `exchange_rates`:** `from_currency, to_currency, rate, spread, updated_at` (PK on pair). Seed KES↔USD, KES↔ABAN, USD↔ABAN.

**New `audit_logs`:** `user_id, action, entity, entity_id, ip, user_agent, metadata, created_at`. RLS: own-rows read.

**Extend `idempotency_keys`:** add `response jsonb`, `transaction_id uuid` to cache replay results.

**RLS:** users read own `transactions`, own `audit_logs`, own `ledger_entries`. No client write on any of these — all writes go through SECURITY DEFINER RPCs.

---

## Phase 2 — Atomic Postgres engine (SECURITY DEFINER functions)

All in one migration, all `SET search_path = public`, all use `FOR UPDATE`.

1. **`tx_lock_funds(_tx_id, _wallet_id, _amount, _fee)`**
   Locks wallet row, validates `available >= amount+fee`, increments `locked_balance`, writes `debit_lock` ledger row, transitions tx → `locked`.

2. **`tx_settle_transfer(_tx_id)`** (wallet→wallet & FX)
   Locks both wallet rows in deterministic id order (deadlock prevention), debits sender (decrement balance + locked_balance), credits receiver, writes `debit_settle` + `credit` ledger rows, sets tx → `successful`, inserts notifications both sides, writes audit log.

3. **`tx_settle_external_debit(_tx_id, _gateway_ref)`** (withdrawals/Paystack transfer success)
   Finalizes a previously-locked debit: decrements balance & locked_balance, writes `debit_settle` ledger row, tx → `successful`. Replaces existing `finalize_withdrawal`.

4. **`tx_credit_external(_tx_id, _gateway_ref)`** (card funding success)
   Idempotent credit; finds wallet, increments balance, writes `credit` ledger row, tx → `successful`. Replaces existing `credit_wallet_from_payment`.

5. **`tx_reverse(_tx_id, _reason)`**
   Compensating entries:
   - If still `locked` → release lock (decrement `locked_balance`), no balance change.
   - If `successful` debit → credit back, write `reversal` ledger entry.
   - Tx → `reversed` or `failed`. Always logs status history + notification.

6. **`tx_convert_currency(_tx_id, _from_wallet_id, _to_wallet_id, _amount, _pin)`**
   Verifies PIN, snapshots rate from `exchange_rates`, locks both wallets, debits source, credits destination at `amount * rate`, stores rate inside tx row, writes paired `fx_out`/`fx_in` ledger entries.

7. **`tx_log_status(...)`**, **`tx_log_audit(...)`** — internal helpers used by all the above.

8. **Trigger `wallets_balance_invariant`** — `BEFORE UPDATE` on `wallets`, raises if `balance < 0` or `locked_balance > balance`.

9. **Reconciliation view `v_wallet_ledger_check`** — sums ledger debits/credits per wallet and flags drift vs `wallets.balance`. Used by admin/cron later.

---

## Phase 3 — Server functions (`src/lib/transactions.functions.ts`)

All `createServerFn` + `requireSupabaseAuth`. Zod-validated. Each captures IP/user-agent and writes to `audit_logs`.

- `transferToWallet({ fromWalletId, toWalletNumber, amount, narration, pin, idempotencyKey })` — looks up receiver wallet, creates tx, calls `tx_lock_funds` then `tx_settle_transfer` in one round-trip via a wrapper RPC `tx_execute_transfer`.
- `convertCurrency({ fromWalletId, toCurrency, amount, pin, idempotencyKey })` — RPC `tx_convert_currency`.
- `getExchangeRate({ from, to })` — public read of `exchange_rates`.
- `listTransactions({ filter, cursor })` — paginated, joins ledger.
- `getTransaction({ id })` — full detail incl. ledger entries + status history.

**Refactor existing flows to use the new engine (no behavior change for users):**
- `src/routes/api/public/paystack-webhook.ts` — replace calls to `credit_wallet_from_payment` / `finalize_withdrawal` / `reverse_withdrawal` with `tx_credit_external` / `tx_settle_external_debit` / `tx_reverse`. Keep HMAC-SHA512 verify + `idempotency_keys` guard already in place.
- `src/lib/transfers.functions.ts::initiateWithdrawal` — keep PIN verify + Paystack call, but route the lock through `tx_lock_funds` against the new `transactions` row (instead of `lock_funds_for_withdrawal` against `withdrawals`). Mirror `withdrawals` row stays for UX/history but becomes a projection of the master `transactions` row.
- `src/lib/paystack.functions.ts::initializeTransaction` — write a `transactions` row (`type=card_funding`, `status=pending`) alongside the existing `payment_transactions` row, so the webhook can resolve it.

---

## Phase 4 — Idempotency, fraud, security layer

- All mutating server fns require `idempotencyKey: z.string().uuid()`. Wrapper RPC checks `idempotency_keys` table first; on hit returns cached `response` jsonb.
- Velocity: per-RPC, count tx in last 60s/24h; soft-limit configurable (5/min, 20/day for transfers default). Block + audit log on breach.
- PIN: reuse existing `verify_transaction_pin` with 5-attempt → 30-min lockout (already in DB). Required for transfer, convert, withdraw.
- IP + UA captured via `getRequestIP` / `getRequestHeader` and attached to tx + audit log.
- Wallet ownership re-validated server-side on every call (RLS + explicit `user_id` check inside RPCs).

---

## Phase 5 — UI: Wallet-to-wallet & FX

Two new screens, premium glassmorphism matching existing wizards (`WithdrawPage` style).

- **`SendMoneyPage` rebuild** (`src/components/app/SendMoneyPage.tsx`) — 4-step: source wallet → recipient wallet number (live lookup shows recipient name/currency, currency-match check) → amount + narration → PIN + review. Realtime status via `transactions` subscription + receipt screen.
- **`ConvertPage` (new)** — source wallet → target currency (dropdown of user's other wallets) → amount with live rate preview + "you receive" → PIN. Route `/_app/convert`. Add nav entry.

**Realtime wiring (shared hook `useWalletRealtime`):** subscribe to `wallets` (own rows) + `transactions` (own rows). Invalidate React Query keys `['wallets']`, `['txs']`, `['tx', id]`. Use in Dashboard, Wallets, Transactions pages.

**Transactions page upgrade:** add status badges for new statuses (`locked`, `processing`, `reversed`), show fee / fx-rate columns when present, expandable row → ledger entries.

---

## Phase 6 — Out of scope (explicit)

To keep this shippable in one round; scaffolded but deferred:
- BullMQ/Redis queue (Cloudflare Worker runtime can't host long-running queues; webhook + pg_cron retries cover the same need for now)
- Admin panel UI (tables/RPCs are admin-ready; UI later)
- Device fingerprinting beyond UA
- Geo-risk scoring
- Real-time WebSocket layer beyond Supabase Realtime
- Pulling FX rates from an external feed (rates seeded + admin-updatable; live feed integration later)
- M-Pesa Daraja, AbanCoin trading engine, virtual cards, merchant payments — engine supports the tx types, surfaces stay "coming soon" until those gateways are integrated

## Tech notes

- All amounts kept as `numeric(20,4)`; subunit conversion happens only at Paystack boundary.
- Deadlock-safe two-wallet locking: always `SELECT ... FOR UPDATE ORDER BY id`.
- Generated `available_balance` lets clients read it directly with no extra logic.
- Reversal of a `successful` external debit only credits back if the gateway confirms reversal — webhook-driven, never client-initiated.
- `transactions` table becomes the canonical join point; `wallet_transactions`, `withdrawals`, `payment_transactions` continue to exist as type-specific projections backed by `transaction_id` FK (added now, populated going forward).

## Delivery order

1. Migration: schema + RPCs + trigger + seed FX rates.
2. Server fns + webhook refactor.
3. UI: SendMoney rebuild, Convert page, realtime hook, route registration.
4. Transactions page badges/expansion.
