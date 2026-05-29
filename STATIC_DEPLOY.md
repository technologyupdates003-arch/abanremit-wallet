# Deploying AbanRemit to cPanel (static)

The app's backend now lives entirely in Supabase Edge Functions (Lovable Cloud),
so the frontend can ship as a plain static SPA — no Node/Cloudflare runtime
required on cPanel.

## 1. Build

```bash
bun install
bun run build:static
```

Output goes to `dist-static/`.

## 2. Upload

Upload the **contents** of `dist-static/` (not the folder itself) into your
cPanel site root, typically `public_html/`. The `.htaccess` file is required
— it handles deep-link routing for the SPA.

You can also deploy into a subfolder (e.g. `public_html/app/`) — the build
uses relative asset paths so both work.

## 3. Configure Supabase webhooks

The provider dashboards must point to the Supabase Edge Function URLs:

- **Paystack** webhook → `https://xupugfwssoudrnzpciiv.supabase.co/functions/v1/paystack-webhook`
- **Daraja STK Push** CallbackURL → `https://xupugfwssoudrnzpciiv.supabase.co/functions/v1/mpesa-stk-callback`
- **Daraja B2C** ResultURL → `https://xupugfwssoudrnzpciiv.supabase.co/functions/v1/mpesa-b2c-result`
- **Daraja B2C** QueueTimeOutURL → `https://xupugfwssoudrnzpciiv.supabase.co/functions/v1/mpesa-b2c-timeout`

## 4. Environment

`bun run build:static` bakes `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` from `.env` into the bundle. No secrets ship
to the browser — service-role keys and Daraja/Paystack secrets stay in
Supabase Edge Function secrets.

## Notes

- The Lovable preview still uses the TanStack Start runtime via `vite.config.ts`.
  The static build is a separate pipeline (`vite.static.config.ts`) and does
  not affect it.
- If you re-publish from cPanel, just re-run `bun run build:static` and
  re-upload `dist-static/`.
