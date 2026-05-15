
-- ============ ENUMS ============
DO $$ BEGIN CREATE TYPE wallet_status AS ENUM ('active','frozen','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE tx_master_type AS ENUM (
  'wallet_to_wallet','wallet_to_bank','bank_to_wallet','card_funding',
  'mpesa_funding','currency_conversion','withdrawal','deposit',
  'internal_transfer','aban_coin_trade','refund','reversal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE ledger_entry_type AS ENUM (
  'debit_lock','lock_release','debit_settle','credit','fee','fx_in','fx_out','reversal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE tx_status ADD VALUE IF NOT EXISTS 'locked';
ALTER TYPE tx_status ADD VALUE IF NOT EXISTS 'successful';

-- ============ WALLETS EXTENSIONS ============
ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS locked_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status wallet_status NOT NULL DEFAULT 'active';

ALTER TABLE public.wallets DROP COLUMN IF EXISTS available_balance;
ALTER TABLE public.wallets ADD COLUMN available_balance numeric
  GENERATED ALWAYS AS (balance - locked_balance) STORED;

DO $$ BEGIN ALTER TABLE public.wallets ADD CONSTRAINT wallets_balance_nonneg CHECK (balance >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.wallets ADD CONSTRAINT wallets_lock_nonneg CHECK (locked_balance >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.wallets ADD CONSTRAINT wallets_lock_le_balance CHECK (locked_balance <= balance);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_wallets_number ON public.wallets(wallet_number);

-- ============ MASTER TRANSACTIONS ============
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text UNIQUE NOT NULL,
  idempotency_key text UNIQUE,
  user_id uuid NOT NULL,
  type tx_master_type NOT NULL,
  status tx_status NOT NULL DEFAULT 'pending',
  sender_wallet_id uuid,
  receiver_wallet_id uuid,
  counterparty_user_id uuid,
  amount numeric NOT NULL CHECK (amount > 0),
  fee numeric NOT NULL DEFAULT 0 CHECK (fee >= 0),
  source_currency wallet_currency,
  destination_currency wallet_currency,
  exchange_rate numeric,
  destination_amount numeric,
  gateway text,
  gateway_reference text,
  narration text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  failure_reason text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tx_user_created ON public.transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_status ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_tx_sender ON public.transactions(sender_wallet_id);
CREATE INDEX IF NOT EXISTS idx_tx_receiver ON public.transactions(receiver_wallet_id);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own tx read" ON public.transactions;
CREATE POLICY "own tx read" ON public.transactions FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = counterparty_user_id);

DROP TRIGGER IF EXISTS trg_tx_updated ON public.transactions;
CREATE TRIGGER trg_tx_updated BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ STATUS HISTORY ============
CREATE TABLE IF NOT EXISTS public.transaction_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  from_status tx_status,
  to_status tx_status NOT NULL,
  reason text,
  actor text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tsh_tx ON public.transaction_status_history(transaction_id, created_at);
ALTER TABLE public.transaction_status_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own tsh read" ON public.transaction_status_history;
CREATE POLICY "own tsh read" ON public.transaction_status_history FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_id AND (t.user_id = auth.uid() OR t.counterparty_user_id = auth.uid())));

-- ============ EXCHANGE RATES ============
CREATE TABLE IF NOT EXISTS public.exchange_rates (
  from_currency wallet_currency NOT NULL,
  to_currency wallet_currency NOT NULL,
  rate numeric NOT NULL CHECK (rate > 0),
  spread numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (from_currency, to_currency)
);
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rates read all" ON public.exchange_rates;
CREATE POLICY "rates read all" ON public.exchange_rates FOR SELECT USING (auth.uid() IS NOT NULL);

INSERT INTO public.exchange_rates (from_currency, to_currency, rate, spread) VALUES
  ('USD','KES', 130.00, 0.01),
  ('KES','USD', 0.0073, 0.01),
  ('USD','ABAN', 1.15, 0.005),
  ('ABAN','USD', 0.85, 0.005),
  ('KES','ABAN', 0.0085, 0.01),
  ('ABAN','KES', 110.00, 0.01)
ON CONFLICT (from_currency, to_currency) DO NOTHING;

-- ============ AUDIT LOGS ============
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  entity text,
  entity_id uuid,
  ip text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON public.audit_logs(user_id, created_at DESC);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own audit read" ON public.audit_logs;
CREATE POLICY "own audit read" ON public.audit_logs FOR SELECT USING (auth.uid() = user_id);

-- ============ LEDGER EXTENSIONS ============
ALTER TABLE public.wallet_ledger ADD COLUMN IF NOT EXISTS reference text;
CREATE INDEX IF NOT EXISTS idx_ledger_tx ON public.wallet_ledger(transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_wallet_created ON public.wallet_ledger(wallet_id, created_at DESC);

-- ============ ENABLE REALTIME (skip if already added) ============
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ RPC: lookup wallet by number ============
CREATE OR REPLACE FUNCTION public.lookup_wallet_by_number(_wallet_number text)
RETURNS TABLE(wallet_id uuid, wallet_user_id uuid, currency wallet_currency, full_name text, status wallet_status)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT w.id, w.user_id, w.currency, p.full_name, w.status
  FROM public.wallets w JOIN public.profiles p ON p.id = w.user_id
  WHERE w.wallet_number = _wallet_number AND w.status = 'active'
  LIMIT 1
$$;

-- ============ RPC: wallet→wallet transfer ============
CREATE OR REPLACE FUNCTION public.tx_execute_transfer(
  _idempotency_key text, _from_wallet_id uuid, _to_wallet_number text,
  _amount numeric, _narration text, _pin text, _ip text, _user_agent text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_from public.wallets%ROWTYPE;
  v_to public.wallets%ROWTYPE;
  v_tx public.transactions%ROWTYPE;
  v_existing public.transactions%ROWTYPE;
  v_ref text;
  v_low uuid; v_high uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  SELECT * INTO v_existing FROM public.transactions
    WHERE idempotency_key = _idempotency_key AND user_id = v_user;
  IF FOUND THEN
    RETURN jsonb_build_object('transaction_id', v_existing.id, 'status', v_existing.status,
      'reference', v_existing.reference, 'replay', true);
  END IF;

  PERFORM public.verify_transaction_pin(_pin);

  SELECT * INTO v_from FROM public.wallets WHERE id = _from_wallet_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'sender_wallet_not_found'; END IF;
  IF v_from.user_id <> v_user THEN RAISE EXCEPTION 'wallet_not_owned'; END IF;
  IF v_from.status <> 'active' THEN RAISE EXCEPTION 'sender_wallet_inactive'; END IF;

  SELECT * INTO v_to FROM public.wallets WHERE wallet_number = _to_wallet_number AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'recipient_not_found'; END IF;
  IF v_to.id = v_from.id THEN RAISE EXCEPTION 'cannot_send_to_self'; END IF;
  IF v_to.currency <> v_from.currency THEN RAISE EXCEPTION 'currency_mismatch'; END IF;

  IF (SELECT count(*) FROM public.transactions
      WHERE user_id = v_user AND type = 'wallet_to_wallet'
      AND created_at > now() - interval '1 minute') >= 5 THEN
    RAISE EXCEPTION 'velocity_limit_exceeded';
  END IF;

  v_ref := 'TXN_' || to_char(now(),'YYYYMMDDHH24MISS') || '_' || substr(replace(gen_random_uuid()::text,'-',''),1,8);

  INSERT INTO public.transactions (
    reference, idempotency_key, user_id, type, status,
    sender_wallet_id, receiver_wallet_id, counterparty_user_id,
    amount, source_currency, destination_currency, narration, ip_address, user_agent
  ) VALUES (
    v_ref, _idempotency_key, v_user, 'wallet_to_wallet', 'processing',
    v_from.id, v_to.id, v_to.user_id,
    _amount, v_from.currency, v_to.currency, _narration, _ip, _user_agent
  ) RETURNING * INTO v_tx;

  INSERT INTO public.transaction_status_history (transaction_id, to_status, reason, actor)
    VALUES (v_tx.id, 'processing', 'transfer initiated', v_user::text);

  IF v_from.id < v_to.id THEN v_low := v_from.id; v_high := v_to.id;
  ELSE v_low := v_to.id; v_high := v_from.id; END IF;
  PERFORM 1 FROM public.wallets WHERE id IN (v_low, v_high) ORDER BY id FOR UPDATE;

  SELECT * INTO v_from FROM public.wallets WHERE id = v_from.id;
  IF v_from.balance - v_from.locked_balance < _amount THEN
    UPDATE public.transactions SET status='failed', failure_reason='insufficient_balance', processed_at=now() WHERE id=v_tx.id;
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  UPDATE public.wallets SET balance = balance - _amount WHERE id = v_from.id RETURNING * INTO v_from;
  INSERT INTO public.wallet_ledger
    (wallet_id, user_id, transaction_id, type, direction, amount, balance_before, balance_after, currency, description, reference)
    VALUES (v_from.id, v_from.user_id, v_tx.id, 'debit_settle', 'debit', _amount,
      v_from.balance + _amount, v_from.balance, v_from.currency,
      COALESCE(_narration,'Transfer to ' || _to_wallet_number), v_ref);

  UPDATE public.wallets SET balance = balance + _amount WHERE id = v_to.id RETURNING * INTO v_to;
  INSERT INTO public.wallet_ledger
    (wallet_id, user_id, transaction_id, type, direction, amount, balance_before, balance_after, currency, description, reference)
    VALUES (v_to.id, v_to.user_id, v_tx.id, 'credit', 'credit', _amount,
      v_to.balance - _amount, v_to.balance, v_to.currency,
      COALESCE(_narration,'Transfer received'), v_ref);

  INSERT INTO public.wallet_transactions
    (user_id, wallet_id, counterparty_wallet_id, type, status, amount, currency, fee, reference, description)
    VALUES (v_from.user_id, v_from.id, v_to.id, 'transfer', 'completed', _amount, v_from.currency, 0, v_ref, _narration);
  INSERT INTO public.wallet_transactions
    (user_id, wallet_id, counterparty_wallet_id, type, status, amount, currency, fee, reference, description)
    VALUES (v_to.user_id, v_to.id, v_from.id, 'transfer', 'completed', _amount, v_to.currency, 0, v_ref, _narration);

  UPDATE public.transactions SET status='successful', processed_at=now() WHERE id = v_tx.id;
  INSERT INTO public.transaction_status_history (transaction_id, from_status, to_status, reason)
    VALUES (v_tx.id, 'processing', 'successful', 'transfer settled');

  INSERT INTO public.notifications (user_id, title, body) VALUES
    (v_from.user_id, 'Transfer sent', 'Sent ' || v_from.currency || ' ' || _amount::text || ' to ' || _to_wallet_number),
    (v_to.user_id, 'Money received', 'Received ' || v_to.currency || ' ' || _amount::text);

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, ip, user_agent, metadata)
    VALUES (v_user, 'wallet_transfer', 'transaction', v_tx.id, _ip, _user_agent,
      jsonb_build_object('amount', _amount, 'to', _to_wallet_number, 'reference', v_ref));

  RETURN jsonb_build_object('transaction_id', v_tx.id, 'status', 'successful', 'reference', v_ref, 'replay', false);
END $$;

-- ============ RPC: convert currency ============
CREATE OR REPLACE FUNCTION public.tx_convert_currency(
  _idempotency_key text, _from_wallet_id uuid, _to_wallet_id uuid,
  _amount numeric, _pin text, _ip text, _user_agent text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_from public.wallets%ROWTYPE;
  v_to public.wallets%ROWTYPE;
  v_rate numeric; v_spread numeric; v_effective numeric; v_dest_amount numeric;
  v_tx public.transactions%ROWTYPE;
  v_existing public.transactions%ROWTYPE;
  v_ref text; v_low uuid; v_high uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF _from_wallet_id = _to_wallet_id THEN RAISE EXCEPTION 'same_wallet'; END IF;

  SELECT * INTO v_existing FROM public.transactions
    WHERE idempotency_key = _idempotency_key AND user_id = v_user;
  IF FOUND THEN
    RETURN jsonb_build_object('transaction_id', v_existing.id, 'status', v_existing.status,
      'reference', v_existing.reference, 'replay', true);
  END IF;

  PERFORM public.verify_transaction_pin(_pin);

  SELECT * INTO v_from FROM public.wallets WHERE id = _from_wallet_id;
  IF NOT FOUND OR v_from.user_id <> v_user THEN RAISE EXCEPTION 'sender_wallet_invalid'; END IF;
  SELECT * INTO v_to FROM public.wallets WHERE id = _to_wallet_id;
  IF NOT FOUND OR v_to.user_id <> v_user THEN RAISE EXCEPTION 'destination_wallet_invalid'; END IF;
  IF v_from.currency = v_to.currency THEN RAISE EXCEPTION 'same_currency'; END IF;

  SELECT rate, spread INTO v_rate, v_spread FROM public.exchange_rates
    WHERE from_currency = v_from.currency AND to_currency = v_to.currency;
  IF v_rate IS NULL THEN RAISE EXCEPTION 'rate_unavailable'; END IF;

  v_effective := v_rate * (1 - v_spread);
  v_dest_amount := round((_amount * v_effective)::numeric, 4);

  v_ref := 'FX_' || to_char(now(),'YYYYMMDDHH24MISS') || '_' || substr(replace(gen_random_uuid()::text,'-',''),1,8);

  INSERT INTO public.transactions (
    reference, idempotency_key, user_id, type, status,
    sender_wallet_id, receiver_wallet_id,
    amount, source_currency, destination_currency, exchange_rate, destination_amount,
    narration, ip_address, user_agent
  ) VALUES (
    v_ref, _idempotency_key, v_user, 'currency_conversion', 'processing',
    v_from.id, v_to.id, _amount, v_from.currency, v_to.currency, v_effective, v_dest_amount,
    'Converted ' || v_from.currency || ' to ' || v_to.currency, _ip, _user_agent
  ) RETURNING * INTO v_tx;

  IF v_from.id < v_to.id THEN v_low := v_from.id; v_high := v_to.id;
  ELSE v_low := v_to.id; v_high := v_from.id; END IF;
  PERFORM 1 FROM public.wallets WHERE id IN (v_low, v_high) ORDER BY id FOR UPDATE;

  SELECT * INTO v_from FROM public.wallets WHERE id = v_from.id;
  IF v_from.balance - v_from.locked_balance < _amount THEN
    UPDATE public.transactions SET status='failed', failure_reason='insufficient_balance', processed_at=now() WHERE id=v_tx.id;
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  UPDATE public.wallets SET balance = balance - _amount WHERE id = v_from.id RETURNING * INTO v_from;
  INSERT INTO public.wallet_ledger
    (wallet_id, user_id, transaction_id, type, direction, amount, balance_before, balance_after, currency, description, reference, metadata)
    VALUES (v_from.id, v_user, v_tx.id, 'fx_out', 'debit', _amount,
      v_from.balance + _amount, v_from.balance, v_from.currency,
      'FX out @ ' || v_effective::text, v_ref,
      jsonb_build_object('rate', v_effective, 'pair', v_from.currency || '->' || v_to.currency));

  UPDATE public.wallets SET balance = balance + v_dest_amount WHERE id = v_to.id RETURNING * INTO v_to;
  INSERT INTO public.wallet_ledger
    (wallet_id, user_id, transaction_id, type, direction, amount, balance_before, balance_after, currency, description, reference, metadata)
    VALUES (v_to.id, v_user, v_tx.id, 'fx_in', 'credit', v_dest_amount,
      v_to.balance - v_dest_amount, v_to.balance, v_to.currency,
      'FX in @ ' || v_effective::text, v_ref, jsonb_build_object('rate', v_effective));

  INSERT INTO public.wallet_transactions
    (user_id, wallet_id, type, status, amount, currency, reference, description, metadata)
    VALUES (v_user, v_from.id, 'transfer', 'completed', _amount, v_from.currency, v_ref, 'FX out',
      jsonb_build_object('kind','fx_out','rate',v_effective,'destination_amount',v_dest_amount));
  INSERT INTO public.wallet_transactions
    (user_id, wallet_id, type, status, amount, currency, reference, description, metadata)
    VALUES (v_user, v_to.id, 'deposit', 'completed', v_dest_amount, v_to.currency, v_ref, 'FX in',
      jsonb_build_object('kind','fx_in','rate',v_effective,'source_amount',_amount));

  UPDATE public.transactions SET status='successful', processed_at=now() WHERE id = v_tx.id;
  INSERT INTO public.transaction_status_history (transaction_id, from_status, to_status, reason)
    VALUES (v_tx.id, 'processing', 'successful', 'fx settled');

  INSERT INTO public.notifications (user_id, title, body) VALUES
    (v_user, 'Conversion complete',
     'Converted ' || v_from.currency || ' ' || _amount::text || ' → ' || v_to.currency || ' ' || v_dest_amount::text);

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, ip, user_agent, metadata)
    VALUES (v_user, 'currency_conversion', 'transaction', v_tx.id, _ip, _user_agent,
      jsonb_build_object('from', v_from.currency, 'to', v_to.currency, 'rate', v_effective, 'amount', _amount, 'destination_amount', v_dest_amount));

  RETURN jsonb_build_object('transaction_id', v_tx.id, 'status','successful', 'reference', v_ref,
    'rate', v_effective, 'destination_amount', v_dest_amount, 'replay', false);
END $$;
