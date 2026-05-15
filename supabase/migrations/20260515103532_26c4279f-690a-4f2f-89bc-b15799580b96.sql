
-- pgcrypto for bcrypt
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Extend tx_status enum
DO $$ BEGIN
  ALTER TYPE tx_status ADD VALUE IF NOT EXISTS 'queued';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE tx_status ADD VALUE IF NOT EXISTS 'processing'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE tx_status ADD VALUE IF NOT EXISTS 'reversed'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE tx_status ADD VALUE IF NOT EXISTS 'cancelled'; EXCEPTION WHEN others THEN NULL; END $$;

-- linked_banks: extend
ALTER TABLE public.linked_banks
  ADD COLUMN IF NOT EXISTS bank_code text,
  ADD COLUMN IF NOT EXISTS currency wallet_currency,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recipient_code text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

-- withdrawals: extend
ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS bank_id uuid,
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS gateway_reference text,
  ADD COLUMN IF NOT EXISTS recipient_code text,
  ADD COLUMN IF NOT EXISTS narration text,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS withdrawals_idem_uniq
  ON public.withdrawals(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS withdrawals_reference_uniq
  ON public.withdrawals(reference) WHERE reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS withdrawals_user_created_idx
  ON public.withdrawals(user_id, created_at DESC);

-- withdrawal_webhooks
CREATE TABLE IF NOT EXISTS public.withdrawal_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text NOT NULL,
  payload jsonb NOT NULL,
  signature text,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.withdrawal_webhooks ENABLE ROW LEVEL SECURITY;
-- no policies = no client access

-- pin_attempts
CREATE TABLE IF NOT EXISTS public.pin_attempts (
  user_id uuid PRIMARY KEY,
  failed_count int NOT NULL DEFAULT 0,
  last_failed_at timestamptz,
  locked_until timestamptz
);
ALTER TABLE public.pin_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own pin attempts read" ON public.pin_attempts
  FOR SELECT USING (auth.uid() = user_id);

-- profiles: extensions
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pin_locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS daily_withdrawal_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_withdrawal_reset_at timestamptz NOT NULL DEFAULT date_trunc('day', now()) + interval '1 day',
  ADD COLUMN IF NOT EXISTS kyc_tier int NOT NULL DEFAULT 0;

-- updated_at trigger for withdrawals
DROP TRIGGER IF EXISTS withdrawals_updated_at ON public.withdrawals;
CREATE TRIGGER withdrawals_updated_at
  BEFORE UPDATE ON public.withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Allow updates on withdrawals only for own rows (status is server-managed via SECURITY DEFINER, but RLS still required)
DROP POLICY IF EXISTS "own withdrawals update" ON public.withdrawals;
CREATE POLICY "own withdrawals update" ON public.withdrawals
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ====================== ATOMIC FUNCTIONS ======================

-- Set transaction PIN
CREATE OR REPLACE FUNCTION public.set_transaction_pin(_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _pin !~ '^[0-9]{4,6}$' THEN
    RAISE EXCEPTION 'invalid_pin_format';
  END IF;
  UPDATE public.profiles
    SET transaction_pin_hash = crypt(_pin, gen_salt('bf', 10))
    WHERE id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
END $$;

-- Verify PIN with lockout
CREATE OR REPLACE FUNCTION public.verify_transaction_pin(_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash text;
  v_attempt public.pin_attempts%ROWTYPE;
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_attempt FROM public.pin_attempts WHERE user_id = v_user FOR UPDATE;
  IF v_attempt.locked_until IS NOT NULL AND v_attempt.locked_until > now() THEN
    RAISE EXCEPTION 'pin_locked_until:%', v_attempt.locked_until;
  END IF;

  SELECT transaction_pin_hash INTO v_hash FROM public.profiles WHERE id = v_user;
  IF v_hash IS NULL THEN RAISE EXCEPTION 'pin_not_set'; END IF;

  IF v_hash = crypt(_pin, v_hash) THEN
    DELETE FROM public.pin_attempts WHERE user_id = v_user;
    RETURN true;
  ELSE
    INSERT INTO public.pin_attempts (user_id, failed_count, last_failed_at)
      VALUES (v_user, 1, now())
      ON CONFLICT (user_id) DO UPDATE
        SET failed_count = public.pin_attempts.failed_count + 1,
            last_failed_at = now(),
            locked_until = CASE WHEN public.pin_attempts.failed_count + 1 >= 5
                                THEN now() + interval '30 minutes' ELSE NULL END;
    RAISE EXCEPTION 'invalid_pin';
  END IF;
END $$;

-- Lock funds for withdrawal (atomic debit + pending ledger)
CREATE OR REPLACE FUNCTION public.lock_funds_for_withdrawal(
  _withdrawal_id uuid,
  _wallet_id uuid,
  _amount numeric,
  _fee numeric
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_w public.wallets%ROWTYPE;
  v_total numeric := _amount + COALESCE(_fee, 0);
  v_new numeric;
  v_wd public.withdrawals%ROWTYPE;
BEGIN
  SELECT * INTO v_wd FROM public.withdrawals WHERE id = _withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF v_wd.status <> 'pending' THEN RAISE EXCEPTION 'withdrawal_already_processed'; END IF;

  SELECT * INTO v_w FROM public.wallets WHERE id = _wallet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
  IF v_w.user_id <> v_wd.user_id THEN RAISE EXCEPTION 'wallet_user_mismatch'; END IF;
  IF v_w.balance < v_total THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  v_new := v_w.balance - v_total;
  UPDATE public.wallets SET balance = v_new WHERE id = v_w.id;

  INSERT INTO public.wallet_ledger
    (wallet_id, user_id, type, direction, amount, balance_before, balance_after, currency, description, metadata)
  VALUES (v_w.id, v_wd.user_id, 'withdrawal_lock', 'debit', v_total, v_w.balance, v_new, v_w.currency,
          'Withdrawal lock', jsonb_build_object('withdrawal_id', _withdrawal_id, 'fee', _fee));

  UPDATE public.withdrawals
    SET status = 'queued', wallet_id = v_w.id
    WHERE id = _withdrawal_id;

  -- Daily total accounting
  UPDATE public.profiles SET
    daily_withdrawal_total = CASE
      WHEN daily_withdrawal_reset_at <= now() THEN _amount
      ELSE daily_withdrawal_total + _amount END,
    daily_withdrawal_reset_at = CASE
      WHEN daily_withdrawal_reset_at <= now() THEN date_trunc('day', now()) + interval '1 day'
      ELSE daily_withdrawal_reset_at END
  WHERE id = v_wd.user_id;

  RETURN v_new;
END $$;

-- Finalize successful withdrawal
CREATE OR REPLACE FUNCTION public.finalize_withdrawal(
  _withdrawal_id uuid,
  _gateway_reference text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_wd public.withdrawals%ROWTYPE;
BEGIN
  SELECT * INTO v_wd FROM public.withdrawals WHERE id = _withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF v_wd.status = 'completed' THEN RETURN; END IF;

  UPDATE public.withdrawals SET
    status = 'completed',
    gateway_reference = COALESCE(_gateway_reference, gateway_reference),
    processed_at = now()
  WHERE id = _withdrawal_id;

  INSERT INTO public.wallet_transactions
    (user_id, wallet_id, type, status, amount, currency, fee, reference, description, metadata)
  VALUES (v_wd.user_id, v_wd.wallet_id, 'withdrawal', 'completed', v_wd.amount, v_wd.currency,
          v_wd.fee, v_wd.reference, 'Bank withdrawal',
          jsonb_build_object('gateway','paystack','gateway_reference',_gateway_reference));

  INSERT INTO public.notifications (user_id, title, body)
  VALUES (v_wd.user_id, 'Withdrawal successful',
          'Your withdrawal of ' || v_wd.currency || ' ' || v_wd.amount::text || ' has been sent.');
END $$;

-- Reverse withdrawal (refund wallet)
CREATE OR REPLACE FUNCTION public.reverse_withdrawal(
  _withdrawal_id uuid,
  _reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wd public.withdrawals%ROWTYPE;
  v_w public.wallets%ROWTYPE;
  v_total numeric;
  v_new numeric;
BEGIN
  SELECT * INTO v_wd FROM public.withdrawals WHERE id = _withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF v_wd.status IN ('failed','reversed','cancelled') THEN RETURN; END IF;
  IF v_wd.status = 'completed' THEN
    -- mark reversed but still refund
    NULL;
  END IF;

  v_total := v_wd.amount + COALESCE(v_wd.fee, 0);

  IF v_wd.wallet_id IS NOT NULL THEN
    SELECT * INTO v_w FROM public.wallets WHERE id = v_wd.wallet_id FOR UPDATE;
    v_new := v_w.balance + v_total;
    UPDATE public.wallets SET balance = v_new WHERE id = v_w.id;

    INSERT INTO public.wallet_ledger
      (wallet_id, user_id, type, direction, amount, balance_before, balance_after, currency, description, metadata)
    VALUES (v_w.id, v_wd.user_id, 'withdrawal_reversal', 'credit', v_total, v_w.balance, v_new, v_w.currency,
            'Withdrawal reversed: ' || COALESCE(_reason,'unknown'),
            jsonb_build_object('withdrawal_id', _withdrawal_id));
  END IF;

  UPDATE public.withdrawals SET
    status = CASE WHEN v_wd.status = 'completed' THEN 'reversed'::tx_status ELSE 'failed'::tx_status END,
    failure_reason = _reason,
    processed_at = now()
  WHERE id = _withdrawal_id;

  INSERT INTO public.notifications (user_id, title, body)
  VALUES (v_wd.user_id, 'Withdrawal failed',
          'Your withdrawal of ' || v_wd.currency || ' ' || v_wd.amount::text || ' was reversed. Funds returned.');
END $$;
