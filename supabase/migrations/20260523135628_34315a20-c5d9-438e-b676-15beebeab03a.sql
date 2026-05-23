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

  IF v_hash = extensions.crypt(_pin, v_hash) THEN
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