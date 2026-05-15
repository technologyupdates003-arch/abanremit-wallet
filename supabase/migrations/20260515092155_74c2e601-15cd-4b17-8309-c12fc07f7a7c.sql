
ALTER FUNCTION public.gen_wallet_number(public.wallet_currency) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.gen_wallet_number(public.wallet_currency) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
