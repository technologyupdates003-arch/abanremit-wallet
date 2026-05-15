
REVOKE EXECUTE ON FUNCTION public.set_transaction_pin(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_transaction_pin(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lock_funds_for_withdrawal(uuid,uuid,numeric,numeric) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_withdrawal(uuid,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reverse_withdrawal(uuid,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.credit_wallet_from_payment(uuid,text,jsonb) FROM anon, authenticated;
