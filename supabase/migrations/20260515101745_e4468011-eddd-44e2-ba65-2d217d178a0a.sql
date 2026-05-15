
-- =========================================================
-- payment_transactions
-- =========================================================
CREATE TABLE public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  wallet_id uuid,
  gateway text NOT NULL DEFAULT 'paystack',
  reference text NOT NULL UNIQUE,
  gateway_reference text,
  amount numeric NOT NULL CHECK (amount > 0),
  currency wallet_currency NOT NULL,
  status tx_status NOT NULL DEFAULT 'pending',
  authorization_code text,
  customer_code text,
  last4 text,
  brand text,
  channel text,
  ip_address text,
  paid_at timestamptz,
  failure_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_transactions_user ON public.payment_transactions(user_id, created_at DESC);
CREATE INDEX idx_payment_transactions_status ON public.payment_transactions(status);

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own payments read" ON public.payment_transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "own payments insert" ON public.payment_transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
-- updates only via service role (webhook)

-- =========================================================
-- wallet_ledger (immutable double-entry)
-- =========================================================
CREATE TABLE public.wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL,
  user_id uuid NOT NULL,
  transaction_id uuid,
  payment_transaction_id uuid REFERENCES public.payment_transactions(id) ON DELETE SET NULL,
  type text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('credit', 'debit')),
  amount numeric NOT NULL CHECK (amount >= 0),
  balance_before numeric NOT NULL,
  balance_after numeric NOT NULL,
  currency wallet_currency NOT NULL,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wallet_ledger_wallet ON public.wallet_ledger(wallet_id, created_at DESC);
CREATE INDEX idx_wallet_ledger_user ON public.wallet_ledger(user_id, created_at DESC);

ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own ledger read" ON public.wallet_ledger
  FOR SELECT USING (auth.uid() = user_id);
-- inserts only via service role / SECURITY DEFINER function

-- =========================================================
-- saved_cards (Paystack authorization tokens only)
-- =========================================================
CREATE TABLE public.saved_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  authorization_code text NOT NULL,
  customer_code text,
  signature text,
  last4 text NOT NULL,
  brand text NOT NULL,
  bank text,
  country_code text,
  exp_month text,
  exp_year text,
  reusable boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, authorization_code)
);

CREATE INDEX idx_saved_cards_user ON public.saved_cards(user_id);

ALTER TABLE public.saved_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own saved cards all" ON public.saved_cards
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =========================================================
-- idempotency_keys (webhook + charge replay protection)
-- =========================================================
CREATE TABLE public.idempotency_keys (
  key text PRIMARY KEY,
  scope text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
-- no policies: service role only

-- =========================================================
-- updated_at trigger for payment_transactions
-- =========================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE TRIGGER update_payment_transactions_updated_at
BEFORE UPDATE ON public.payment_transactions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- credit_wallet_from_payment: atomic credit + ledger + status
-- Called by the verified webhook (service role).
-- Returns the new balance, or NULL if already processed.
-- =========================================================
CREATE OR REPLACE FUNCTION public.credit_wallet_from_payment(
  _payment_id uuid,
  _gateway_reference text,
  _authorization jsonb
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.payment_transactions%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_new_balance numeric;
BEGIN
  -- Lock the payment row
  SELECT * INTO v_payment FROM public.payment_transactions
    WHERE id = _payment_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found';
  END IF;

  -- Idempotency: already completed
  IF v_payment.status = 'completed' THEN
    RETURN NULL;
  END IF;

  -- Find or pick wallet (matching currency)
  IF v_payment.wallet_id IS NOT NULL THEN
    SELECT * INTO v_wallet FROM public.wallets WHERE id = v_payment.wallet_id FOR UPDATE;
  ELSE
    SELECT * INTO v_wallet FROM public.wallets
      WHERE user_id = v_payment.user_id AND currency = v_payment.currency
      ORDER BY is_primary DESC LIMIT 1 FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet_not_found';
  END IF;

  v_new_balance := v_wallet.balance + v_payment.amount;

  UPDATE public.wallets SET balance = v_new_balance WHERE id = v_wallet.id;

  INSERT INTO public.wallet_ledger (
    wallet_id, user_id, payment_transaction_id, type, direction,
    amount, balance_before, balance_after, currency, description, metadata
  ) VALUES (
    v_wallet.id, v_payment.user_id, v_payment.id, 'deposit', 'credit',
    v_payment.amount, v_wallet.balance, v_new_balance, v_payment.currency,
    'Card funding via Paystack', jsonb_build_object('reference', v_payment.reference)
  );

  INSERT INTO public.wallet_transactions (
    user_id, wallet_id, type, status, amount, currency, fee, reference, description, metadata
  ) VALUES (
    v_payment.user_id, v_wallet.id, 'deposit', 'completed', v_payment.amount,
    v_payment.currency, 0, v_payment.reference, 'Card funding via Paystack',
    jsonb_build_object('gateway', 'paystack', 'last4', v_payment.last4, 'brand', v_payment.brand)
  );

  UPDATE public.payment_transactions SET
    status = 'completed',
    wallet_id = v_wallet.id,
    paid_at = now(),
    gateway_reference = COALESCE(_gateway_reference, gateway_reference),
    authorization_code = COALESCE(_authorization->>'authorization_code', authorization_code),
    customer_code = COALESCE(_authorization->>'customer_code', customer_code),
    last4 = COALESCE(_authorization->>'last4', last4),
    brand = COALESCE(_authorization->>'brand', brand)
  WHERE id = v_payment.id;

  INSERT INTO public.notifications (user_id, title, body)
  VALUES (
    v_payment.user_id,
    'Wallet funded',
    'Your ' || v_payment.currency || ' wallet was credited with ' || v_payment.amount::text
  );

  RETURN v_new_balance;
END $$;

-- =========================================================
-- Realtime
-- =========================================================
ALTER TABLE public.wallets REPLICA IDENTITY FULL;
ALTER TABLE public.wallet_transactions REPLICA IDENTITY FULL;
ALTER TABLE public.payment_transactions REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.wallets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_transactions;
