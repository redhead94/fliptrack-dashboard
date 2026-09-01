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

No environment variables or database setup are needed.

## Important data note

Inventory is intentionally stored only in the browser you use. It makes the first version private and friction-free, but it does not sync automatically between devices. Use **Back up** before switching browsers/devices, then use **Restore** on the new device.

## Run locally

```bash
npm install
npm run dev
```
