REVOKE EXECUTE ON FUNCTION public.lookup_wallet_by_number(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tx_execute_transfer(text, uuid, text, numeric, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_wallet_by_number(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tx_execute_transfer(text, uuid, text, numeric, text, text, text, text) TO authenticated, service_role;