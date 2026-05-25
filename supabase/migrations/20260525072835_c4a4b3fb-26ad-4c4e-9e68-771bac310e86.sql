REVOKE EXECUTE ON FUNCTION public.verify_transaction_pin(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_transaction_pin(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.lookup_wallet_by_number(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tx_execute_transfer(text, uuid, text, numeric, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tx_convert_currency(text, uuid, uuid, numeric, text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.verify_transaction_pin(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_transaction_pin(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lookup_wallet_by_number(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tx_execute_transfer(text, uuid, text, numeric, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tx_convert_currency(text, uuid, uuid, numeric, text, text, text) TO authenticated, service_role;