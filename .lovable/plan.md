# Static SPA + Edge Functions migration

## Goal
- Frontend builds to a folder of static `.html` / `.js` / `.css` files you upload to `public_html` on cPanel.
- All backend logic (Daraja M-Pesa, transfers, PIN, SMS, Paystack, webhooks) moves to Supabase Edge Functions, called from the browser via `supabase.functions.invoke(...)`.
- Webhooks (Paystack, Daraja STK + B2C) keep working — they get new permanent Supabase URLs you paste into the dashboards.

## What changes architecturally

```text
BEFORE (TanStack Start, SSR)              AFTER (Vite SPA + Edge Functions)
─────────────────────────────────         ─────────────────────────────────────
Browser ──▶ TanStack Server ──▶ DB        Browser ──▶ Supabase Edge Fn ──▶ DB
        (createServerFn)                          (supabase.functions.invoke)

Webhook ──▶ /api/public/* (TS server)      Webhook ──▶ supabase/functions/* URL
```

## Migration steps

### 1. Migrate server functions → edge functions
Create these edge functions under `supabase/functions/`:
- `daraja-stk-push` ← `src/lib/daraja.functions.ts` (initiateStkPush)
- `daraja-b2c-withdraw` ← `src/lib/daraja.functions.ts` (initiateB2C)
- `paystack-init` ← `src/lib/paystack.functions.ts`
- `wallet-transfer` ← `src/lib/transactions.functions.ts` (executeTransfer + SMS)
- `wallet-pin-set` ← `src/lib/transfers.functions.ts` (setTransactionPin)
- `sms-send` ← `src/lib/sms.functions.ts` (admin SMS broadcasts)
- `admin-actions` ← `src/lib/admin.functions.ts`

Webhooks become edge functions with `verify_jwt = false`:
- `daraja-stk-callback`, `daraja-b2c-result`, `daraja-b2c-timeout`, `paystack-webhook`

Each edge function reuses the existing secrets (DARAJA_*, PAYSTACK_*, TALKSASA_*, etc.) — nothing new to add.

### 2. Rewrite frontend callers
Replace every `useServerFn(xxx)` + `import from '@/lib/*.functions'` with:
```ts
const { data, error } = await supabase.functions.invoke('daraja-stk-push', { body: {...} });
```
Files touched: `FundWalletPage.tsx`, `WithdrawPage.tsx`, `SendMoneyPage.tsx`, `SettingsPage.tsx`, admin pages.

### 3. Convert framework: TanStack Start → Vite SPA
- Replace `vite.config.ts` with a plain Vite + `@vitejs/plugin-react` config (drop `@lovable.dev/vite-tanstack-config`, `tanstackStart`, Cloudflare plugin).
- Swap router: keep file-based routes but use `@tanstack/react-router` standalone (no `@tanstack/react-start`). Generate routeTree via `@tanstack/router-plugin`.
- Delete: `src/server.ts`, `src/start.ts`, `src/lib/error-capture.ts`, `src/lib/error-page.ts`, `src/integrations/supabase/client.server.ts`, `src/integrations/supabase/auth-middleware.ts`, `src/integrations/supabase/auth-attacher.ts`, `src/integrations/supabase/admin-middleware.ts`, all `src/lib/*.functions.ts`, all `src/routes/api/public/*`, `wrangler.jsonc`, `supabase/config.toml` per-function blocks.
- Update `src/router.tsx` + `src/routes/__root.tsx` for SPA mode (no `shellComponent`, regular `<html>` from `index.html`).
- Add `index.html` at project root (Vite SPA entry).
- Update root route: convert any loaders calling server fns to `useQuery` in components.

### 4. cPanel deploy artifacts
- `package.json` build script outputs to `dist/`.
- Create `dist/.htaccess` template (auto-copied on build) so SPA routes resolve:
  ```apache
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
  ```
- Add a short `DEPLOY-CPANEL.md` with: run `bun run build`, zip the `dist/` folder, upload to `public_html`, extract.

### 5. Webhook URL updates (you do this in dashboards)
After deploy, paste the new Supabase Edge Function URLs into:
- Paystack dashboard → Webhook URL
- Safaricom Daraja portal → STK callback URL, B2C result/timeout URLs

I'll print the exact URLs at the end.

## Things that WILL break temporarily
- Live preview in Lovable will still work (it'll just be SPA-mode now, no SSR).
- The very first deploy needs webhook URLs updated in Paystack + Daraja before payments resume.
- SEO/SSR is gone — every page renders client-side. Acceptable for an authenticated app like this.

## Things that stay the same
- Supabase database, RLS, auth flows
- All existing UI / pages / styles
- Lovable Cloud secrets
- TalkSasa SMS (just called from edge functions now)
- M-Pesa & Paystack money flows (just routed through edge functions)

## Scope
This is roughly 7 new edge functions + 4 webhook edge functions + framework swap + ~8 component rewrites + build config. Substantial but mechanical. I'll do it in one go.

## Confirm to proceed
Reply "go" (or any confirmation) and I'll start with the edge functions, then the framework swap, then the component rewrites in that order.