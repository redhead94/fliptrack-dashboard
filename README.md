# Fliptrack

A lightweight Poshmark inventory and profit tracker for any kind of reselling.

## What it tracks

- Purchase price and inbound shipping
- Listing status and planned list price
- Sold price, Poshmark's 20% fee, net profit, and ROI
- Searchable bought, listed, and sold inventory
- CSV export plus JSON backup and restore

## Deploy on Vercel

1. Put this folder in a GitHub repository.
2. In Vercel, choose **Add New → Project** and import that repository.
3. Keep the detected Next.js settings and click **Deploy**.

## Required environment variables

Shared inventory sync needs a Postgres database. Add this encrypted Vercel environment variable:

- `DATABASE_URL` — a Postgres connection string (e.g. Neon). The inventory route creates its `fliptrack_inventory` table automatically on first use.

Without `DATABASE_URL`, the tracker still works from the browser but cannot sync between devices, and the sync indicator stays off.

## Optional USPS tracking updates

To show live USPS updates beside a tracking number, add these encrypted Vercel environment variables to the project:

- `USPS_CONSUMER_KEY`
- `USPS_CONSUMER_SECRET`

Both values come from the Credentials section of your USPS Customer Onboarding Portal app. They are used only by the server-side tracking route and are never exposed in the browser.

## Important data note

Each device keeps a local copy of your inventory in its browser and mirrors it to the shared Postgres row above. This is what syncs your inventory across devices.

The current version has no sign-in: every visitor of the deployed site reads and writes the **same** shared inventory. Until per-user authentication is added, treat this as a single-person tool and do not deploy it where strangers will edit your inventory. Use **Back up** before clearing your browser or switching browsers, then **Restore** on a new device.

## Run locally

```bash
npm install
npm run dev
```
