CREATE OR REPLACE FUNCTION public.set_transaction_pin(_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF _pin !~ '^[0-9]{4,6}$' THEN
    RAISE EXCEPTION 'invalid_pin_format';
  END IF;
  UPDATE public.profiles
    SET transaction_pin_hash = extensions.crypt(_pin, extensions.gen_salt('bf', 10))
    WHERE id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
END $function$;

-- Clear stale (non-bcrypt) hashes so users re-set their PIN with the working format
UPDATE public.profiles
  SET transaction_pin_hash = NULL
  WHERE transaction_pin_hash IS NOT NULL
    AND transaction_pin_hash NOT LIKE '$2%';

DELETE FROM public.pin_attempts;