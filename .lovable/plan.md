# Bank Withdrawal Engine — AbanRemit Wallet

A production-grade payout system using Paystack Transfer APIs with custom UI, atomic ledger, secure webhooks, and realtime updates.

## Phase 1 — Database & Security Foundation

Migrate the schema to support real payouts:

- **`linked_banks`** (extend existing): add `bank_code`, `currency`, `is_default`, `recipient_code` (cached Paystack recipient), `verified_at`
- **`withdrawals`** (extend existing): add `bank_id`, `gateway_reference`, `recipient_code`, `narration`, `processed_at`, `failure_reason`, `idempotency_key` (unique). Extend `tx_status` enum with `queued`, `processing`, `reversed`, `cancelled`
- **`withdrawal_webhooks`**: full webhook audit log (`event`, `payload`, `signature`, `processed`, `processed_at`)
- **`pin_attempts`**: track failed PIN attempts per user with lockout window
- **`profiles`**: already has `transaction_pin_hash` — add `pin_locked_until`, `daily_withdrawal_total`, `daily_withdrawal_reset_at`
- RLS policies for all new tables (own-row read, no client write on ledger/webhooks)

Atomic Postgres functions (SECURITY DEFINER):
- `set_transaction_pin(_pin)` — bcrypt hash via pgcrypto
- `verify_transaction_pin(_pin)` — constant-time check + lockout enforcement
- `lock_funds_for_withdrawal(_wallet_id, _amount, _withdrawal_id)` — debits wallet, writes pending ledger row, enforces balance + daily limit, fully atomic with `FOR UPDATE`
- `finalize_withdrawal(_withdrawal_id, _gateway_ref)` — marks success, finalizes ledger
- `reverse_withdrawal(_withdrawal_id, _reason)` — credits wallet back, writes reversal ledger entry, marks failed/reversed

## Phase 2 — Paystack Transfer Server Functions

`src/lib/transfers.functions.ts`:

- `listBanks({ currency })` — proxies `GET /bank?currency=`, cached
- `resolveAccount({ accountNumber, bankCode })` — `GET /bank/resolve` for real-time name verification
- `addLinkedBank({ bankCode, accountNumber, currency })` — resolves name, creates Paystack `transferrecipient`, stores `recipient_code`
- `setDefaultBank` / `deleteLinkedBank`
- `setTransactionPin({ pin })` / `verifyTransactionPin({ pin })`
- `initiateWithdrawal({ walletId, bankId, amount, pin, idempotencyKey })`:
  1. Verify PIN (calls RPC, lockout enforced)
  2. Validate KYC, currency, daily limits
  3. Insert `withdrawals` row with idempotency key
  4. Call `lock_funds_for_withdrawal` (atomic debit + ledger lock)
  5. Call Paystack `POST /transfer` with reference
  6. On API failure → `reverse_withdrawal` immediately
  7. Return pending state — webhook finalizes

## Phase 3 — Webhook Processing

`src/routes/api/public/paystack-webhook.ts` (extend existing):

- Add handlers for `transfer.success`, `transfer.failed`, `transfer.reversed`
- HMAC-SHA512 verification (already in place)
- Idempotency via `idempotency_keys` table (already in place)
- Log every event to `withdrawal_webhooks`
- Call `finalize_withdrawal` or `reverse_withdrawal` accordingly
- Insert notification on completion

## Phase 4 — Premium Custom UI

Rebuild `WithdrawPage.tsx` with multi-step flow:

1. **Step 1 — Method & Wallet**: Currency wallet picker showing balance, withdrawal method tabs (Bank / Wallet / M-Pesa)
2. **Step 2 — Beneficiary**: Saved bank list with default star + "Add new bank" inline form (bank dropdown from `listBanks`, account number → live `resolveAccount` to show verified name)
3. **Step 3 — Amount**: Amount input, fee preview, "you receive" calculation, ETA badge
4. **Step 4 — Review & PIN**: Summary card + 4-digit PIN entry (shadcn `InputOTP`), with attempts-remaining indicator
5. **Step 5 — Processing**: Animated processing state, polls `withdrawals` row, transitions to success/failure with motion animations + downloadable receipt link

Components:
- `WithdrawWizard.tsx` — step orchestrator with progress indicator
- `BankPicker.tsx` — search + select with bank logos/initials
- `AccountVerifier.tsx` — debounced live verification UI
- `PinEntry.tsx` — secure PIN modal with shake-on-fail
- `WithdrawalReceipt.tsx` — printable receipt
- `WithdrawalHistoryPage.tsx` — filters (status, currency, date range), search, expandable rows, infinite scroll, status badges

## Phase 5 — Realtime + Notifications

- Subscribe to `withdrawals` and `wallets` rows for the user → live status updates
- Subscribe to `notifications` → toast on completion
- Refresh wallet balance card automatically when ledger row inserts

## Phase 6 — Security Layer

- Rate limit: max 5 withdrawals per hour per user (enforced in RPC)
- Velocity check: alert + block if amount > 3× rolling 7-day average
- IP + user-agent logged to `security_logs` per withdrawal
- PIN: 5 failed attempts → 30-min lockout
- Daily withdrawal cap (configurable per KYC tier)

## Technical Details

- Paystack endpoints: `/bank`, `/bank/resolve`, `/transferrecipient`, `/transfer`
- Currency mapping: KES → NGN/KES rails; USD/EUR/GBP routed via Paystack USD where available, else error early with clear message
- All amounts converted to subunits (×100) at API boundary only
- Idempotency: client-generated UUID per withdraw attempt → unique constraint blocks dupes
- All RPCs `SECURITY DEFINER` with `SET search_path = public`
- Ledger entries are append-only (no UPDATE policy)
- Webhook signature uses `PAYSTACK_SECRET_KEY` (HMAC-SHA512) — already wired

## Out of Scope (future)
- Admin panel UI (backend tables ready)
- Biometric mobile auth
- Multi-currency FX conversion engine
- M-Pesa & wallet-to-wallet transfers (UI scaffolded but routed to "coming soon" until M-Pesa Daraja is integrated separately)

This will land in 4 sequential edits: (1) migration, (2) server functions + webhook extension, (3) UI components + wizard, (4) history page + realtime wiring.
