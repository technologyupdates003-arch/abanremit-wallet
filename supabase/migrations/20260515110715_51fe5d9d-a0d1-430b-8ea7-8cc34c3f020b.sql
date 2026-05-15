
CREATE TYPE public.admin_role AS ENUM (
  'super_admin','finance_admin','support_admin','compliance_admin','fraud_admin','operations_admin'
);

CREATE TABLE public.admin_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.admin_role NOT NULL,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_roles WHERE user_id = _uid)
$$;

CREATE OR REPLACE FUNCTION public.has_admin_role(_uid uuid, _role public.admin_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_roles
    WHERE user_id = _uid AND (role = _role OR role = 'super_admin'))
$$;

CREATE POLICY "admins read admin_roles" ON public.admin_roles
  FOR SELECT USING (public.is_admin(auth.uid()) OR auth.uid() = user_id);

CREATE TABLE public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  action text NOT NULL,
  entity text,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read admin_audit_logs" ON public.admin_audit_logs
  FOR SELECT USING (public.is_admin(auth.uid()));
CREATE INDEX admin_audit_logs_admin_idx ON public.admin_audit_logs (admin_id, created_at DESC);
CREATE INDEX admin_audit_logs_entity_idx ON public.admin_audit_logs (entity, entity_id);

CREATE OR REPLACE FUNCTION public.admin_log(_admin uuid, _action text, _entity text, _entity_id uuid, _meta jsonb, _ip text, _ua text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.admin_audit_logs (admin_id, action, entity, entity_id, metadata, ip, user_agent)
  VALUES (_admin, _action, _entity, _entity_id, COALESCE(_meta,'{}'::jsonb), _ip, _ua)
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='exchange_rates_pkey') THEN
    ALTER TABLE public.exchange_rates ADD PRIMARY KEY (from_currency, to_currency);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.tx_admin_adjust(
  _wallet_id uuid, _amount numeric, _direction text, _reason text, _ip text, _user_agent text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_w public.wallets%ROWTYPE;
  v_tx public.transactions%ROWTYPE;
  v_ref text;
  v_before numeric;
  v_after numeric;
  v_signed numeric;
BEGIN
  IF v_admin IS NULL OR NOT public.is_admin(v_admin) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF _direction NOT IN ('credit','debit') THEN RAISE EXCEPTION 'invalid_direction'; END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN RAISE EXCEPTION 'reason_required'; END IF;

  SELECT * INTO v_w FROM public.wallets WHERE id = _wallet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;

  v_signed := CASE WHEN _direction = 'credit' THEN _amount ELSE -_amount END;
  v_before := v_w.balance;
  v_after := v_before + v_signed;
  IF v_after < 0 THEN RAISE EXCEPTION 'would_overdraw'; END IF;

  v_ref := 'ADJ_' || to_char(now(),'YYYYMMDDHH24MISS') || '_' || substr(replace(gen_random_uuid()::text,'-',''),1,8);

  INSERT INTO public.transactions (
    reference, idempotency_key, user_id, type, status,
    sender_wallet_id, amount, source_currency, narration, ip_address, user_agent, metadata
  ) VALUES (
    v_ref, v_ref, v_w.user_id, 'admin_adjustment', 'successful',
    v_w.id, _amount, v_w.currency,
    'Admin ' || _direction || ': ' || _reason, _ip, _user_agent,
    jsonb_build_object('admin_id', v_admin, 'direction', _direction, 'reason', _reason)
  ) RETURNING * INTO v_tx;

  UPDATE public.wallets SET balance = v_after WHERE id = v_w.id;

  INSERT INTO public.wallet_ledger
    (wallet_id, user_id, transaction_id, type, direction, amount, balance_before, balance_after, currency, description, reference, metadata)
  VALUES (v_w.id, v_w.user_id, v_tx.id,
          CASE WHEN _direction = 'credit' THEN 'admin_credit' ELSE 'admin_debit' END,
          _direction, _amount, v_before, v_after, v_w.currency,
          'Admin adjustment: ' || _reason, v_ref,
          jsonb_build_object('admin_id', v_admin));

  INSERT INTO public.wallet_transactions
    (user_id, wallet_id, type, status, amount, currency, fee, reference, description, metadata)
  VALUES (v_w.user_id, v_w.id, CASE WHEN _direction='credit' THEN 'deposit' ELSE 'withdrawal' END,
          'completed', _amount, v_w.currency, 0, v_ref,
          'Admin adjustment: ' || _reason,
          jsonb_build_object('admin_id', v_admin, 'kind','admin_adjustment'));

  INSERT INTO public.notifications (user_id, title, body)
  VALUES (v_w.user_id, 'Wallet adjustment',
          v_w.currency || ' ' || _amount::text || ' was ' ||
          CASE WHEN _direction='credit' THEN 'credited to' ELSE 'debited from' END ||
          ' your wallet by support. Reason: ' || _reason);

  PERFORM public.admin_log(v_admin, 'wallet_adjust', 'wallet', v_w.id,
    jsonb_build_object('amount', _amount, 'direction', _direction, 'reason', _reason,
                       'reference', v_ref, 'transaction_id', v_tx.id),
    _ip, _user_agent);

  RETURN jsonb_build_object('reference', v_ref, 'transaction_id', v_tx.id, 'balance_after', v_after);
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_wallet_status(
  _wallet_id uuid, _status public.wallet_status, _reason text, _ip text, _ua text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin uuid := auth.uid(); v_w public.wallets%ROWTYPE;
BEGIN
  IF v_admin IS NULL OR NOT public.is_admin(v_admin) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO v_w FROM public.wallets WHERE id = _wallet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
  UPDATE public.wallets SET status = _status WHERE id = _wallet_id;
  INSERT INTO public.notifications (user_id, title, body)
    VALUES (v_w.user_id, 'Wallet status updated',
            'Your ' || v_w.currency || ' wallet is now ' || _status::text ||
            COALESCE('. Reason: ' || _reason, ''));
  PERFORM public.admin_log(v_admin, 'wallet_status', 'wallet', _wallet_id,
    jsonb_build_object('status', _status::text, 'reason', _reason, 'previous', v_w.status::text),
    _ip, _ua);
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_exchange_rate(
  _from public.wallet_currency, _to public.wallet_currency, _rate numeric, _spread numeric, _ip text, _ua text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin uuid := auth.uid();
BEGIN
  IF v_admin IS NULL OR NOT public.is_admin(v_admin) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _rate <= 0 THEN RAISE EXCEPTION 'invalid_rate'; END IF;
  IF _spread < 0 OR _spread >= 1 THEN RAISE EXCEPTION 'invalid_spread'; END IF;
  INSERT INTO public.exchange_rates (from_currency, to_currency, rate, spread, updated_at)
    VALUES (_from, _to, _rate, _spread, now())
    ON CONFLICT (from_currency, to_currency)
      DO UPDATE SET rate = EXCLUDED.rate, spread = EXCLUDED.spread, updated_at = now();
  PERFORM public.admin_log(v_admin, 'rate_update', 'exchange_rate', NULL,
    jsonb_build_object('from', _from::text, 'to', _to::text, 'rate', _rate, 'spread', _spread),
    _ip, _ua);
END $$;

CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin uuid := auth.uid(); v_out jsonb;
BEGIN
  IF v_admin IS NULL OR NOT public.is_admin(v_admin) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'users_total', (SELECT count(*) FROM public.profiles),
    'users_24h', (SELECT count(*) FROM public.profiles WHERE created_at > now() - interval '24 hours'),
    'kyc_pending', (SELECT count(*) FROM public.kyc_documents WHERE status='pending'),
    'wallets_total', (SELECT count(*) FROM public.wallets),
    'wallets_balance_by_ccy', (SELECT COALESCE(jsonb_object_agg(currency, total), '{}'::jsonb)
       FROM (SELECT currency, sum(balance) total FROM public.wallets GROUP BY currency) s),
    'tx_24h', (SELECT count(*) FROM public.transactions WHERE created_at > now() - interval '24 hours'),
    'tx_volume_24h', (SELECT COALESCE(jsonb_object_agg(source_currency, total), '{}'::jsonb)
       FROM (SELECT source_currency, sum(amount) total FROM public.transactions
             WHERE created_at > now() - interval '24 hours' AND status='successful'
             GROUP BY source_currency) s),
    'tx_failed_24h', (SELECT count(*) FROM public.transactions WHERE status='failed' AND created_at > now() - interval '24 hours'),
    'withdrawals_pending', (SELECT count(*) FROM public.withdrawals WHERE status IN ('pending','queued','processing')),
    'withdrawals_failed_24h', (SELECT count(*) FROM public.withdrawals WHERE status='failed' AND created_at > now() - interval '24 hours'),
    'webhooks_unprocessed', (SELECT count(*) FROM public.withdrawal_webhooks WHERE processed = false)
  ) INTO v_out;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.admin_replay_paystack_webhook(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin uuid := auth.uid(); v_wh public.withdrawal_webhooks%ROWTYPE; v_ref text; v_wd public.withdrawals%ROWTYPE;
BEGIN
  IF v_admin IS NULL OR NOT public.is_admin(v_admin) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO v_wh FROM public.withdrawal_webhooks WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'webhook_not_found'; END IF;
  v_ref := v_wh.payload->'data'->>'reference';
  SELECT * INTO v_wd FROM public.withdrawals WHERE reference = v_ref;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF v_wh.event = 'transfer.success' THEN
    PERFORM public.finalize_withdrawal(v_wd.id, v_wh.payload->'data'->>'id');
  ELSE
    PERFORM public.reverse_withdrawal(v_wd.id, COALESCE(v_wh.payload->'data'->>'gateway_response', v_wh.event));
  END IF;
  UPDATE public.withdrawal_webhooks SET processed = true, processed_at = now(), error = NULL WHERE id = _id;
  PERFORM public.admin_log(v_admin, 'webhook_replay', 'withdrawal_webhook', _id,
    jsonb_build_object('event', v_wh.event, 'reference', v_ref), NULL, NULL);
END $$;

DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='wallets';
  IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.wallets; END IF;
END $$;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='transactions';
  IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions; END IF;
END $$;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='wallet_ledger';
  IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_ledger; END IF;
END $$;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='withdrawals';
  IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.withdrawals; END IF;
END $$;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='kyc_documents';
  IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.kyc_documents; END IF;
END $$;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='notifications';
  IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.bootstrap_super_admin(_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = _email LIMIT 1;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  INSERT INTO public.admin_roles (user_id, role, granted_by)
    VALUES (v_uid, 'super_admin', v_uid)
    ON CONFLICT (user_id, role) DO NOTHING;
END $$;
