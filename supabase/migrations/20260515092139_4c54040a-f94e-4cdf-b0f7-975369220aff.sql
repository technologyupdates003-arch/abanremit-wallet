
-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.wallet_currency AS ENUM ('KES','USD','EUR','GBP','BTC','ABAN');
CREATE TYPE public.tx_status AS ENUM ('pending','completed','failed','reversed');
CREATE TYPE public.tx_type AS ENUM ('deposit','withdrawal','send','receive','swap','fee','aban_buy','aban_sell');
CREATE TYPE public.kyc_status AS ENUM ('not_submitted','pending','approved','rejected');
CREATE TYPE public.kyc_doc_type AS ENUM ('national_id','passport','drivers_license');

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  username TEXT UNIQUE,
  email TEXT,
  phone TEXT,
  country TEXT,
  city TEXT,
  address TEXT,
  occupation TEXT,
  avatar_url TEXT,
  transaction_pin_hash TEXT,
  kyc_status kyc_status NOT NULL DEFAULT 'not_submitted',
  two_factor_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- USER ROLES
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role) $$;

-- WALLETS
CREATE TABLE public.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_number TEXT NOT NULL UNIQUE,
  currency wallet_currency NOT NULL,
  balance NUMERIC(20,8) NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, currency)
);
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

-- TRANSACTIONS
CREATE TABLE public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id UUID REFERENCES public.wallets(id) ON DELETE SET NULL,
  counterparty_wallet_id UUID REFERENCES public.wallets(id) ON DELETE SET NULL,
  type tx_type NOT NULL,
  status tx_status NOT NULL DEFAULT 'pending',
  amount NUMERIC(20,8) NOT NULL,
  currency wallet_currency NOT NULL,
  fee NUMERIC(20,8) NOT NULL DEFAULT 0,
  reference TEXT,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.wallet_transactions(user_id, created_at DESC);

-- DEPOSITS / WITHDRAWALS
CREATE TABLE public.deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id UUID REFERENCES public.wallets(id) ON DELETE SET NULL,
  method TEXT NOT NULL,
  amount NUMERIC(20,8) NOT NULL,
  currency wallet_currency NOT NULL,
  status tx_status NOT NULL DEFAULT 'pending',
  provider_reference TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id UUID REFERENCES public.wallets(id) ON DELETE SET NULL,
  method TEXT NOT NULL,
  amount NUMERIC(20,8) NOT NULL,
  currency wallet_currency NOT NULL,
  status tx_status NOT NULL DEFAULT 'pending',
  destination JSONB NOT NULL DEFAULT '{}'::jsonb,
  fee NUMERIC(20,8) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

-- KYC
CREATE TABLE public.kyc_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_type kyc_doc_type NOT NULL,
  front_path TEXT,
  back_path TEXT,
  status kyc_status NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.kyc_documents ENABLE ROW LEVEL SECURITY;

-- MARKET ORDERS / ABAN
CREATE TABLE public.market_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy','sell')),
  order_type TEXT NOT NULL DEFAULT 'market',
  amount NUMERIC(20,8) NOT NULL,
  price NUMERIC(20,8),
  status tx_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.market_orders ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.aban_coin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price NUMERIC(20,8) NOT NULL,
  volume NUMERIC(20,8) NOT NULL DEFAULT 0,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.aban_coin_logs ENABLE ROW LEVEL SECURITY;

-- NOTIFICATIONS / SECURITY / LINKED
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.security_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.linked_banks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_name TEXT NOT NULL,
  country TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.linked_banks ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.linked_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand TEXT NOT NULL,
  last4 TEXT NOT NULL,
  exp_month INT NOT NULL,
  exp_year INT NOT NULL,
  provider_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.linked_cards ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES (own rows only)
CREATE POLICY "own profile read" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "own roles read" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "own wallets all" ON public.wallets FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own tx read" ON public.wallet_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own tx insert" ON public.wallet_transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own deposits all" ON public.deposits FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own withdrawals all" ON public.withdrawals FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own kyc all" ON public.kyc_documents FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own orders all" ON public.market_orders FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "aban logs public read" ON public.aban_coin_logs FOR SELECT USING (true);
CREATE POLICY "own notifs all" ON public.notifications FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own security logs read" ON public.security_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own banks all" ON public.linked_banks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own cards all" ON public.linked_cards FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- WALLET NUMBER GENERATOR
CREATE OR REPLACE FUNCTION public.gen_wallet_number(_currency wallet_currency)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE n TEXT;
BEGIN
  LOOP
    n := 'ABN-' || _currency::text || '-' || lpad((floor(random()*900000)+100000)::text, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.wallets WHERE wallet_number = n);
  END LOOP;
  RETURN n;
END $$;

-- AUTO-CREATE PROFILE + DEFAULT WALLETS ON SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, username, email, phone, country)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'username',
    NEW.email,
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'country'
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  INSERT INTO public.wallets (user_id, wallet_number, currency, is_primary)
  VALUES
    (NEW.id, public.gen_wallet_number('KES'), 'KES', true),
    (NEW.id, public.gen_wallet_number('USD'), 'USD', false),
    (NEW.id, public.gen_wallet_number('ABAN'), 'ABAN', false);
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- STORAGE BUCKET FOR KYC
INSERT INTO storage.buckets (id, name, public) VALUES ('kyc', 'kyc', false) ON CONFLICT DO NOTHING;
CREATE POLICY "kyc own read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'kyc' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "kyc own write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'kyc' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "kyc own update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'kyc' AND auth.uid()::text = (storage.foldername(name))[1]);
