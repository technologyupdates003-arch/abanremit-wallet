CREATE OR REPLACE FUNCTION public.verify_transaction_pin(_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
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

  IF (
    (v_hash LIKE '$2%' AND v_hash = extensions.crypt(_pin, v_hash))
    OR
    (length(v_hash) = 64 AND v_hash = encode(extensions.digest(_pin || v_user::text, 'sha256'), 'hex'))
  ) THEN
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
END $function$;

DROP FUNCTION IF EXISTS public.lookup_wallet_by_number(text);

CREATE FUNCTION public.lookup_wallet_by_number(_wallet_number text)
RETURNS TABLE(wallet_id uuid, wallet_user_id uuid, currency wallet_currency, full_name text, phone text, status wallet_status)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT w.id, w.user_id, w.currency, COALESCE(p.full_name, p.username, 'AbanRemit user') AS full_name, p.phone, w.status
  FROM public.wallets w
  JOIN public.profiles p ON p.id = w.user_id
  WHERE w.wallet_number = _wallet_number AND w.status = 'active'
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.tx_execute_transfer(_idempotency_key text, _from_wallet_id uuid, _to_wallet_number text, _amount numeric, _narration text, _pin text, _ip text, _user_agent text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_from public.wallets%ROWTYPE;
  v_to public.wallets%ROWTYPE;
  v_tx public.transactions%ROWTYPE;
  v_existing public.transactions%ROWTYPE;
  v_ref text;
  v_low uuid; v_high uuid;
  v_rate numeric := 1;
  v_spread numeric := 0;
  v_effective numeric := 1;
  v_dest_amount numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  SELECT * INTO v_existing FROM public.transactions
    WHERE idempotency_key = _idempotency_key AND user_id = v_user;
  IF FOUND THEN
    RETURN jsonb_build_object('transaction_id', v_existing.id, 'status', v_existing.status,
      'reference', v_existing.reference, 'exchange_rate', v_existing.exchange_rate,
      'destination_amount', v_existing.destination_amount, 'replay', true);
  END IF;

  PERFORM public.verify_transaction_pin(_pin);

  SELECT * INTO v_from FROM public.wallets WHERE id = _from_wallet_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'sender_wallet_not_found'; END IF;
  IF v_from.user_id <> v_user THEN RAISE EXCEPTION 'wallet_not_owned'; END IF;
  IF v_from.status <> 'active' THEN RAISE EXCEPTION 'sender_wallet_inactive'; END IF;

  SELECT * INTO v_to FROM public.wallets WHERE wallet_number = _to_wallet_number AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'recipient_not_found'; END IF;
  IF v_to.id = v_from.id THEN RAISE EXCEPTION 'cannot_send_to_self'; END IF;

  IF v_to.currency <> v_from.currency THEN
    SELECT rate, spread INTO v_rate, v_spread
    FROM public.exchange_rates
    WHERE from_currency = v_from.currency AND to_currency = v_to.currency;
    IF v_rate IS NULL THEN RAISE EXCEPTION 'rate_unavailable'; END IF;
    v_effective := v_rate * (1 - COALESCE(v_spread, 0));
  END IF;
  v_dest_amount := round((_amount * v_effective)::numeric, 4);

  IF (SELECT count(*) FROM public.transactions
      WHERE user_id = v_user AND type = 'wallet_to_wallet'
      AND created_at > now() - interval '1 minute') >= 5 THEN
    RAISE EXCEPTION 'velocity_limit_exceeded';
  END IF;

  v_ref := 'TXN_' || to_char(now(),'YYYYMMDDHH24MISS') || '_' || substr(replace(gen_random_uuid()::text,'-',''),1,8);

  INSERT INTO public.transactions (
    reference, idempotency_key, user_id, type, status,
    sender_wallet_id, receiver_wallet_id, counterparty_user_id,
    amount, source_currency, destination_currency, exchange_rate, destination_amount,
    narration, ip_address, user_agent
  ) VALUES (
    v_ref, _idempotency_key, v_user, 'wallet_to_wallet', 'processing',
    v_from.id, v_to.id, v_to.user_id,
    _amount, v_from.currency, v_to.currency, v_effective, v_dest_amount,
    _narration, _ip, _user_agent
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
    (wallet_id, user_id, transaction_id, type, direction, amount, balance_before, balance_after, currency, description, reference, metadata)
    VALUES (v_from.id, v_from.user_id, v_tx.id, 'debit_settle', 'debit', _amount,
      v_from.balance + _amount, v_from.balance, v_from.currency,
      COALESCE(_narration,'Transfer to ' || _to_wallet_number), v_ref,
      jsonb_build_object('destination_currency', v_to.currency, 'exchange_rate', v_effective, 'destination_amount', v_dest_amount));

  UPDATE public.wallets SET balance = balance + v_dest_amount WHERE id = v_to.id RETURNING * INTO v_to;
  INSERT INTO public.wallet_ledger
    (wallet_id, user_id, transaction_id, type, direction, amount, balance_before, balance_after, currency, description, reference, metadata)
    VALUES (v_to.id, v_to.user_id, v_tx.id, 'credit', 'credit', v_dest_amount,
      v_to.balance - v_dest_amount, v_to.balance, v_to.currency,
      COALESCE(_narration,'Transfer received'), v_ref,
      jsonb_build_object('source_currency', v_from.currency, 'source_amount', _amount, 'exchange_rate', v_effective));

  INSERT INTO public.wallet_transactions
    (user_id, wallet_id, counterparty_wallet_id, type, status, amount, currency, fee, reference, description, metadata)
    VALUES (v_from.user_id, v_from.id, v_to.id, 'transfer', 'completed', _amount, v_from.currency, 0, v_ref, _narration,
      jsonb_build_object('kind','send','destination_currency',v_to.currency,'destination_amount',v_dest_amount,'exchange_rate',v_effective));
  INSERT INTO public.wallet_transactions
    (user_id, wallet_id, counterparty_wallet_id, type, status, amount, currency, fee, reference, description, metadata)
    VALUES (v_to.user_id, v_to.id, v_from.id, 'transfer', 'completed', v_dest_amount, v_to.currency, 0, v_ref, _narration,
      jsonb_build_object('kind','receive','source_currency',v_from.currency,'source_amount',_amount,'exchange_rate',v_effective));

  UPDATE public.transactions SET status='successful', processed_at=now() WHERE id = v_tx.id;
  INSERT INTO public.transaction_status_history (transaction_id, from_status, to_status, reason)
    VALUES (v_tx.id, 'processing', 'successful', 'transfer settled');

  INSERT INTO public.notifications (user_id, title, body) VALUES
    (v_from.user_id, 'Transfer sent', 'Sent ' || v_from.currency || ' ' || _amount::text || ' to ' || _to_wallet_number || CASE WHEN v_from.currency <> v_to.currency THEN ' (' || v_to.currency || ' ' || v_dest_amount::text || ')' ELSE '' END),
    (v_to.user_id, 'Money received', 'Received ' || v_to.currency || ' ' || v_dest_amount::text);

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, ip, user_agent, metadata)
    VALUES (v_user, 'wallet_transfer', 'transaction', v_tx.id, _ip, _user_agent,
      jsonb_build_object('amount', _amount, 'source_currency', v_from.currency, 'destination_currency', v_to.currency, 'destination_amount', v_dest_amount, 'rate', v_effective, 'to', _to_wallet_number, 'reference', v_ref));

  RETURN jsonb_build_object('transaction_id', v_tx.id, 'status', 'successful', 'reference', v_ref,
    'exchange_rate', v_effective, 'destination_amount', v_dest_amount, 'destination_currency', v_to.currency,
    'source_currency', v_from.currency, 'replay', false);
END $function$;