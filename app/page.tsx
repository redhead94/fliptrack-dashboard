"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { earningsFor, estimatedProfitFor, feeFor, feesFor, grossFor, profitFor, round2 } from "@/lib/money";

type Status = "Bought" | "In transit" | "Received" | "Listed" | "Sold";
type View = "overview" | "inventory" | "sales" | "cash" | "bids";
type SalePlatform = "Poshmark" | "eBay" | "Other";
type Watch = { id: string; model: string; name: string; category: string; boughtOn: string; cost: number; inbound: number; listPrice: number; status: Status; paidBy?: "Caroline" | "Ben"; soldPrice?: number; soldOn?: string; listedOn?: string; salePlatform?: SalePlatform; poshEarnings?: number; poshShippingDiscount?: number; tracking?: string; poshUrl?: string; notes?: string };
type BidGuideEntry = { id: string; model: string; name: string; category: string; maxBid: number; expectedSale?: number; notes?: string; updatedOn: string };
type TrackingUpdate = { status: string; summary: string; location: string };

const STORAGE_KEY = "watchflip-inventory-v1";
const PURCHASE_MIGRATION_KEY = "fliptrack-recorded-purchases-v6";
const LOCAL_MERGE_KEY = "fliptrack-cloud-merge-v1";
const BID_GUIDE_STORAGE_KEY = "fliptrack-bid-guide-v1";
const BID_LOCAL_MERGE_KEY = "fliptrack-bid-guide-cloud-merge-v1";
const DELETED_INVENTORY_IDS_KEY = "fliptrack-deleted-inventory-ids-v1";
const INVENTORY_PENDING_SYNC_KEY = "fliptrack-inventory-pending-sync-v1";
const BID_PENDING_SYNC_KEY = "fliptrack-bid-guide-pending-sync-v1";
const trackingRequestCache = new Map<string, Promise<TrackingUpdate>>();
const loadTrackingUpdate = (tracking: string) => {
  const cached = trackingRequestCache.get(tracking);
  if (cached) return cached;
  const request = fetch(`/api/usps?tracking=${encodeURIComponent(tracking)}`).then(async (response) => {
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || "USPS update unavailable");
    return { status: data.status || "USPS update", summary: data.summary || "", location: data.location || "" } as TrackingUpdate;
  }).catch(() => {
    trackingRequestCache.delete(tracking);
    return { status: "USPS update pending", summary: "USPS has not returned a shipment update yet.", location: "" };
  });
  trackingRequestCache.set(tracking, request);
  return request;
};
const syncHeaders = (init?: RequestInit) => {
  const key = process.env.NEXT_PUBLIC_FLIPTRACK_SYNC_KEY;
  return { ...init, headers: { ...init?.headers, ...(key ? { "x-fliptrack-key": key } : {}) } };
};
const localDate = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};
const normalizeForSearch = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
const pipelineStatus = (status: Status): Exclude<Status, "Bought"> | "In transit" | "Received" => status === "Bought" ? "In transit" : status;
const STATUS_ORDER: Record<Exclude<Status, "Bought"> | "In transit" | "Received", number> = { "In transit": 0, Received: 1, Listed: 2, Sold: 3 };
const bidKey = (item: Pick<BidGuideEntry, "model" | "name">) => `${item.model.trim().toLowerCase()}::${item.name.trim().toLowerCase()}`;
const ageFor = (item: Watch) => { if (!item.listedOn) return null; const timestamp = new Date(`${item.listedOn}T12:00:00`).getTime(); return Number.isFinite(timestamp) ? Math.max(0, Math.floor((Date.now() - timestamp) / 86400000)) : null; };
const totalCost = (item: Watch) => round2(item.cost + item.inbound);
const salePlatformFor = (item: Watch): SalePlatform => item.salePlatform ?? "Poshmark";
const isValidWatch = (item: unknown): item is Watch => { const value = item as Record<string, unknown>; return typeof value === "object" && value !== null && typeof value.id === "string" && typeof value.cost === "number" && Number.isFinite(value.cost) && typeof value.inbound === "number" && Number.isFinite(value.inbound) && (typeof value.listPrice === "number" || value.listPrice === undefined) && typeof value.boughtOn === "string" && (value.status === "Bought" || value.status === "In transit" || value.status === "Received" || value.status === "Listed" || value.status === "Sold"); };
const isValidBid = (item: unknown): item is BidGuideEntry => { const value = item as Record<string, unknown>; return typeof value === "object" && value !== null && typeof value.id === "string" && typeof value.model === "string" && typeof value.name === "string" && typeof value.category === "string" && typeof value.maxBid === "number" && Number.isFinite(value.maxBid) && typeof value.updatedOn === "string"; };
const mergeInventory = (remote: Watch[], local: Watch[]) => { const merged = new Map(remote.map((item) => [item.id, item])); local.forEach((item) => merged.set(item.id, { ...merged.get(item.id), ...item })); return [...merged.values()]; };
const mergeBids = (remote: BidGuideEntry[], local: BidGuideEntry[]) => { const merged = new Map(remote.map((item) => [bidKey(item), item])); local.forEach((item) => merged.set(bidKey(item), item)); return [...merged.values()]; };

const purchased69165: Watch = { id: "69165-purchase", model: "69165", name: "Invicta Celestial Somerset", category: "Watches", boughtOn: "2026-09-01", cost: 13.56, inbound: 0, listPrice: 0, status: "Bought", notes: "Landed cost includes shipping" };
const purchased69169: Watch = { id: "69169-purchase", model: "69169", name: "Invicta Celestial Somerset", category: "Watches", boughtOn: "2026-09-01", cost: 14.39, inbound: 0, listPrice: 0, status: "Bought", notes: "Landed cost includes shipping" };
const giveaway: Watch = { id: "acw-ga-m-100-giveaway", model: "ACW-GA-M-100", name: "Activa Rally Edition X Invicta Set", category: "Watches", boughtOn: "2026-09-01", cost: 0, inbound: 0, listPrice: 0, status: "Bought", notes: "Giveaway win — yellow 50mm watch set" };
const addedInventory: Watch[] = [
  { id: "cl3408-02-purchase", model: "CL3408-02", name: "Carolina Lemke sunglasses", category: "Sunglasses", boughtOn: "2026-09-01", cost: 10.54, inbound: 0, listPrice: 0, status: "Bought" },
  { id: "70410-purchase", model: "70410", name: "Invicta Celestial", category: "Watches", boughtOn: "2026-09-01", cost: 15.68, inbound: 0, listPrice: 0, status: "Bought" },
  { id: "70408-purchase", model: "70408", name: "Invicta Celestial", category: "Watches", boughtOn: "2026-09-01", cost: 16.85, inbound: 0, listPrice: 0, status: "Sold", soldPrice: 49, poshEarnings: 32.71, notes: "Sold on Poshmark" },
  { id: "cl618-01-purchase", model: "CL618-01", name: "Carolina Lemke sunglasses", category: "Sunglasses", boughtOn: "2026-09-01", cost: 11.44, inbound: 0, listPrice: 0, status: "Bought" },
  { id: "cl9053-02-purchase", model: "CL9053-02", name: "Carolina Lemke sunglasses", category: "Sunglasses", boughtOn: "2026-09-01", cost: 13.33, inbound: 0, listPrice: 0, status: "Bought" },
];
const starter: Watch[] = [{ id: "49125", model: "49125", name: "Invicta Speedway Lustria", category: "Watches", boughtOn: "2026-09-01", cost: 20, inbound: 1, listPrice: 69.99, status: "Bought" }, purchased69165, purchased69169, giveaway, ...addedInventory];

export default function Home() {
  const [watches, setWatches] = useState<Watch[]>(starter);
  const [view, setView] = useState<View>("overview");
  const [filter, setFilter] = useState<"All" | Exclude<Status, "Bought">>("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Watch | null>(null);
  const [offerItem, setOfferItem] = useState<Watch | null>(null);
  const [bids, setBids] = useState<BidGuideEntry[]>([]);
  const [bidSearch, setBidSearch] = useState("");
  const [showBidForm, setShowBidForm] = useState(false);
  const [editingBid, setEditingBid] = useState<BidGuideEntry | null>(null);
  const [ready, setReady] = useState(false);
  const [synced, setSynced] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const [inventorySyncState, setInventorySyncState] = useState<"saving" | "saved" | "offline" | "private">("saving");
  const [bidSyncState, setBidSyncState] = useState<"saving" | "saved" | "offline" | "private">("saving");
  const revisionRef = useRef(0);
  const lastSavedRef = useRef("");
  const syncInFlight = useRef(false);
  const inventorySaveQueuedRef = useRef(false);
  const deletedInventoryIdsRef = useRef(new Set<string>());
  const watchesRef = useRef<Watch[]>(starter);
  const hasInventoryLoadedRef = useRef(false);
  const bidRevisionRef = useRef(0);
  const bidLastSavedRef = useRef("");
  const bidSyncInFlight = useRef(false);
  const bidSaveQueuedRef = useRef(false);
  const bidsRef = useRef<BidGuideEntry[]>([]);
  const hasBidGuideLoadedRef = useRef(false);

  const persist = useCallback(function persist(items: Watch[]) {
    if (syncInFlight.current) { inventorySaveQueuedRef.current = true; return Promise.resolve(); }
    const deletedIdsInThisSave = new Set(deletedInventoryIdsRef.current);
    syncInFlight.current = true;
    setInventorySyncState("saving");
    return fetch("/api/inventory", syncHeaders({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items, deletedIds: [...deletedInventoryIdsRef.current], revision: revisionRef.current }) }))
      .then(async (response) => ({ response, data: await response.json().catch(() => ({})) }))
      .then(({ response, data }) => {
        if (response.ok) { deletedIdsInThisSave.forEach((id) => deletedInventoryIdsRef.current.delete(id)); window.localStorage.setItem(DELETED_INVENTORY_IDS_KEY, JSON.stringify([...deletedInventoryIdsRef.current])); window.localStorage.removeItem(INVENTORY_PENDING_SYNC_KEY); revisionRef.current = Number(data.revision ?? revisionRef.current + 1); lastSavedRef.current = JSON.stringify(items); setInventorySyncState("saved"); }
        else if (data.conflict) { revisionRef.current = Number(data.revision ?? 0); lastSavedRef.current = ""; const serverDeleted: string[] = Array.isArray(data.deletedIds) ? data.deletedIds.filter((id: unknown): id is string => typeof id === "string") : []; serverDeleted.forEach((id) => deletedInventoryIdsRef.current.add(id)); window.localStorage.setItem(DELETED_INVENTORY_IDS_KEY, JSON.stringify([...deletedInventoryIdsRef.current])); const deletedIds = deletedInventoryIdsRef.current; const remote = Array.isArray(data.items) ? data.items.filter((item: Watch) => !deletedIds.has(item.id)) : []; const local = items.filter((item) => !deletedIds.has(item.id)); setWatches(mergeInventory(remote, local)); }
      })
      .catch(() => setInventorySyncState("offline"))
      .finally(() => { syncInFlight.current = false; if (inventorySaveQueuedRef.current) { inventorySaveQueuedRef.current = false; void persist(watchesRef.current); } });
  }, []);

  const persistBids = useCallback((items: BidGuideEntry[]) => {
    if (bidSyncInFlight.current) { bidSaveQueuedRef.current = true; return Promise.resolve(); }
    bidSyncInFlight.current = true;
    setBidSyncState("saving");
    return fetch("/api/bid-guide", syncHeaders({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bids: items, revision: bidRevisionRef.current }) }))
      .then(async (response) => ({ response, data: await response.json().catch(() => ({})) }))
      .then(({ response, data }) => {
        if (response.ok) { window.localStorage.removeItem(BID_PENDING_SYNC_KEY); bidRevisionRef.current = Number(data.revision ?? bidRevisionRef.current + 1); bidLastSavedRef.current = JSON.stringify(items); setBidSyncState("saved"); }
        else if (data.conflict) { bidRevisionRef.current = Number(data.revision ?? 0); bidLastSavedRef.current = ""; const remote = Array.isArray(data.bids) ? data.bids : []; setBids(mergeBids(remote, items)); }
      })
      .catch(() => setBidSyncState("offline"))
      .finally(() => { bidSyncInFlight.current = false; if (bidSaveQueuedRef.current) { bidSaveQueuedRef.current = false; void persistBids(bidsRef.current); } });
  }, []);

  useEffect(() => {
    const hydrate = () => {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      let savedItems = starter.map((item) => ({ ...item }));
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) savedItems = parsed.filter(isValidWatch).map((item) => ({ ...item }));
          else window.localStorage.removeItem(STORAGE_KEY);
        } catch { window.localStorage.removeItem(STORAGE_KEY); }
      }
      const migrated = window.localStorage.getItem(PURCHASE_MIGRATION_KEY);
      if (!migrated) {
        [...addedInventory, giveaway, purchased69169, purchased69165].forEach((item) => {
          if (!savedItems.some((existing) => existing.id === item.id)) savedItems.unshift(item);
        });
        const lustria = savedItems.find((item) => item.model === "49125");
        if (lustria) lustria.status = "Bought";
        const sold70408 = savedItems.find((item) => item.model === "70408");
        if (sold70408) Object.assign(sold70408, { status: "Sold", soldPrice: 49, cost: 16.85, poshEarnings: 32.71, notes: "Sold on Poshmark" });
        window.localStorage.setItem(PURCHASE_MIGRATION_KEY, "true");
      }
      watchesRef.current = savedItems;
      const deletedIds = window.localStorage.getItem(DELETED_INVENTORY_IDS_KEY);
      if (deletedIds) { try { const parsed = JSON.parse(deletedIds); if (Array.isArray(parsed)) parsed.filter((id): id is string => typeof id === "string").forEach((id) => deletedInventoryIdsRef.current.add(id)); } catch { window.localStorage.removeItem(DELETED_INVENTORY_IDS_KEY); } }
      savedItems = savedItems.filter((item) => !deletedInventoryIdsRef.current.has(item.id));
      setWatches(savedItems);
      const savedBids = window.localStorage.getItem(BID_GUIDE_STORAGE_KEY);
      if (savedBids) { try { const parsed = JSON.parse(savedBids); if (Array.isArray(parsed)) { const valid = parsed.filter(isValidBid); bidsRef.current = valid; setBids(valid); } else window.localStorage.removeItem(BID_GUIDE_STORAGE_KEY); } catch { window.localStorage.removeItem(BID_GUIDE_STORAGE_KEY); } }
      setReady(true);
    };
    const timer = window.setTimeout(hydrate, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const mergeLocal = (Boolean(window.localStorage.getItem(STORAGE_KEY)) && !window.localStorage.getItem(LOCAL_MERGE_KEY)) || Boolean(window.localStorage.getItem(INVENTORY_PENDING_SYNC_KEY));
    const localIsNewer = hasInventoryLoadedRef.current && JSON.stringify(watchesRef.current) !== lastSavedRef.current;
    fetch("/api/inventory", syncHeaders()).then(async (response) => ({ response, data: await response.json() })).then(({ response, data }) => {
      if (!response.ok) { setInventorySyncState(response.status === 401 ? "private" : "offline"); return; }
      const serverDeleted: string[] = Array.isArray(data.deletedIds) ? data.deletedIds.filter((id: unknown): id is string => typeof id === "string") : [];
      serverDeleted.forEach((id) => deletedInventoryIdsRef.current.add(id));
      window.localStorage.setItem(DELETED_INVENTORY_IDS_KEY, JSON.stringify([...deletedInventoryIdsRef.current]));
      const remote = Array.isArray(data.items) ? data.items.filter((item: Watch) => !deletedInventoryIdsRef.current.has(item.id)) : [];
      revisionRef.current = Number(data.revision ?? 0);
      const shouldMerge = mergeLocal || localIsNewer;
      const items = remote.length && !shouldMerge ? remote : mergeInventory(remote, watchesRef.current);
      if (mergeLocal) window.localStorage.setItem(LOCAL_MERGE_KEY, "true");
      lastSavedRef.current = JSON.stringify(items);
      watchesRef.current = items;
      hasInventoryLoadedRef.current = true;
      setWatches(items);
      setSynced(true);
      setInventorySyncState("saved");
      if (!remote.length || shouldMerge) persist(items);
    }).catch(() => setInventorySyncState("offline"));
  }, [ready, persist, retryTick]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(watches));
    if (!synced || JSON.stringify(watches) === lastSavedRef.current) return;
    window.localStorage.setItem(INVENTORY_PENDING_SYNC_KEY, "true");
    const timer = window.setTimeout(() => persist(watches), 800);
    return () => window.clearTimeout(timer);
  }, [watches, ready, synced, persist]);

  useEffect(() => {
    if (!ready) return;
    fetch("/api/bid-guide", syncHeaders()).then(async (response) => ({ response, data: await response.json() })).then(({ response, data }) => {
      if (!response.ok) { setBidSyncState(response.status === 401 ? "private" : "offline"); return; }
      const remote = Array.isArray(data.bids) ? data.bids : [];
      bidRevisionRef.current = Number(data.revision ?? 0);
      const local = window.localStorage.getItem(BID_GUIDE_STORAGE_KEY);
      let localBids: BidGuideEntry[] = [];
      if (local) { try { const parsed = JSON.parse(local); if (Array.isArray(parsed)) localBids = parsed.filter(isValidBid); } catch { window.localStorage.removeItem(BID_GUIDE_STORAGE_KEY); } }
      const mergeLocal = (Boolean(local) && !window.localStorage.getItem(BID_LOCAL_MERGE_KEY)) || Boolean(window.localStorage.getItem(BID_PENDING_SYNC_KEY));
      const localIsNewer = hasBidGuideLoadedRef.current && JSON.stringify(bidsRef.current) !== bidLastSavedRef.current;
      const shouldMerge = mergeLocal || localIsNewer;
      const items = remote.length && !shouldMerge ? remote : mergeBids(remote, localBids);
      if (mergeLocal) window.localStorage.setItem(BID_LOCAL_MERGE_KEY, "true");
      bidLastSavedRef.current = JSON.stringify(items);
      bidsRef.current = items;
      hasBidGuideLoadedRef.current = true;
      setBids(items);
      setBidSyncState("saved");
      if ((!remote.length || shouldMerge) && items.length) persistBids(items);
    }).catch(() => setBidSyncState("offline"));
  }, [ready, persistBids, retryTick]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(BID_GUIDE_STORAGE_KEY, JSON.stringify(bids));
    if (JSON.stringify(bids) === bidLastSavedRef.current) return;
    window.localStorage.setItem(BID_PENDING_SYNC_KEY, "true");
    const timer = window.setTimeout(() => persistBids(bids), 800);
    return () => window.clearTimeout(timer);
  }, [bids, ready, persistBids]);

  useEffect(() => { watchesRef.current = watches; }, [watches]);
  useEffect(() => { bidsRef.current = bids; }, [bids]);

  useEffect(() => {
    if (!ready) return;
    const retry = () => { setInventorySyncState("saving"); setBidSyncState("saving"); setRetryTick((tick) => tick + 1); };
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    return () => { window.removeEventListener("online", retry); window.removeEventListener("focus", retry); };
  }, [ready]);

  const stats = useMemo(() => {
    const sold = watches.filter((item) => item.status === "Sold" && (item.soldPrice != null || item.poshEarnings != null));
    const investment = round2(watches.reduce((sum, item) => sum + totalCost(item), 0));
    const earnings = round2(sold.reduce((sum, item) => sum + earningsFor(item), 0));
    const soldCost = round2(sold.reduce((sum, item) => sum + totalCost(item), 0));
    const profit = round2(sold.reduce((sum, item) => sum + profitFor(item), 0));
    const activeCost = round2(watches.filter((item) => item.status !== "Sold").reduce((sum, item) => sum + totalCost(item), 0));
    const pendingSold = watches.filter((item) => item.status === "Sold" && item.soldPrice == null && item.poshEarnings == null).length;
    return { sold, investment, earnings, soldCost, profit, activeCost, pendingSold, roi: soldCost ? round2((profit / soldCost) * 100) : 0, netCashInvested: round2(investment - earnings) };
  }, [watches]);

  const laneItems = useMemo(() => ({
    transit: watches.filter((item) => pipelineStatus(item.status) === "In transit"),
    received: watches.filter((item) => pipelineStatus(item.status) === "Received"),
    listed: watches.filter((item) => pipelineStatus(item.status) === "Listed"),
    sold: watches.filter((item) => pipelineStatus(item.status) === "Sold"),
  }), [watches]);
  const categories = useMemo(() => [...new Set(watches.map((item) => item.category || "Other"))].sort(), [watches]);
  const visible = useMemo(() => watches.filter((item) => (filter === "All" || pipelineStatus(item.status) === filter) && (categoryFilter === "All" || (item.category || "Other") === categoryFilter) && `${item.model} ${item.name} ${item.category || ""}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => STATUS_ORDER[pipelineStatus(a.status)] - STATUS_ORDER[pipelineStatus(b.status)]), [watches, filter, categoryFilter, search]);
  const visibleBids = useMemo(() => { const terms = bidSearch.trim().split(/\s+/).map(normalizeForSearch).filter(Boolean); return bids.filter((item) => { const searchable = normalizeForSearch(`${item.model} ${item.name} ${item.category || ""} ${item.notes || ""}`); return terms.every((term) => searchable.includes(term)); }).sort((a, b) => b.updatedOn.localeCompare(a.updatedOn)); }, [bids, bidSearch]);
  const monthly = useMemo(() => {
    const map = new Map<string, { payout: number; fees: number; cost: number; profit: number; sold: number }>();
    stats.sold.forEach((item) => {
      const key = (item.soldOn || item.boughtOn).slice(0, 7);
      const entry = map.get(key) ?? { payout: 0, fees: 0, cost: 0, profit: 0, sold: 0 };
      entry.payout += earningsFor(item); entry.fees += feesFor(item); entry.cost += totalCost(item); entry.profit += profitFor(item); entry.sold += 1;
      map.set(key, entry);
    });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => ({ ...entry, key, label: new Date(`${key}-15T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" }), payout: round2(entry.payout), fees: round2(entry.fees), cost: round2(entry.cost), profit: round2(entry.profit) }));
  }, [stats.sold]);
  const ledger = useMemo(() => [
    ...watches.map((item) => ({ id: `buy-${item.id}`, date: item.boughtOn, type: "out" as const, label: `Inventory purchase · ${item.name || item.model || "Untitled item"}`, amount: totalCost(item) })),
    ...stats.sold.map((item) => ({ id: `sale-${item.id}`, date: item.soldOn || item.boughtOn, type: "in" as const, label: `${salePlatformFor(item)} payout · ${item.name || item.model || "Untitled item"}`, amount: earningsFor(item) })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12), [watches, stats.sold]);

  const update = (id: string, changes: Partial<Watch>) => setWatches((items) => items.map((item) => item.id === id ? { ...item, ...changes } : item));
  const clone = (item: Watch) => { const copy: Watch = { ...item, id: crypto.randomUUID(), boughtOn: localDate(), status: "In transit", listedOn: undefined, soldPrice: undefined, soldOn: undefined, salePlatform: undefined, poshEarnings: undefined, poshShippingDiscount: undefined, tracking: "", poshUrl: "" }; setWatches((items) => [copy, ...items]); setEditing(copy); };
  const remove = (id: string) => { if (window.confirm("Remove this item from your tracker?")) { deletedInventoryIdsRef.current.add(id); window.localStorage.setItem(DELETED_INVENTORY_IDS_KEY, JSON.stringify([...deletedInventoryIdsRef.current])); window.localStorage.setItem(INVENTORY_PENDING_SYNC_KEY, "true"); setWatches((items) => items.filter((item) => item.id !== id)); } };
  const download = (body: string, filename: string, type: string) => { const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([body], { type })); link.download = filename; link.click(); URL.revokeObjectURL(link.href); };
  const exportCsv = () => {     const headers = ["Name", "Category", "SKU / model", "Paid by", "Bought on", "Cost", "Inbound shipping", "List price", "Status", "Sale platform", "Sold price", "Sold on", "Marketplace shipping discount", "Actual payout", "Profit", "Est. profit at list", "Notes"]; const rows = watches.map((item) => [item.name, item.category || "", item.model, item.paidBy || "Caroline", item.boughtOn, round2(item.cost), round2(item.inbound), round2(item.listPrice), item.status, item.status === "Sold" ? salePlatformFor(item) : "", item.soldPrice == null ? "" : round2(item.soldPrice), item.soldOn ?? "", item.poshShippingDiscount == null ? "" : round2(item.poshShippingDiscount), item.poshEarnings == null ? "" : round2(item.poshEarnings), profitFor(item), item.status === "Sold" || item.listPrice == null ? "" : estimatedProfitFor(item) ?? "", item.notes ?? ""]); download([headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n"), "fliptrack-export.csv", "text/csv"); };
  const backup = () => download(JSON.stringify({ inventory: watches, bids }), "fliptrack-backup.json", "application/json");
  const restore = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const incoming: unknown = JSON.parse(String(reader.result)); if (Array.isArray(incoming) && incoming.every(isValidWatch)) { setWatches(incoming); return; } const backupData = incoming as { inventory?: unknown; bids?: unknown }; if (Array.isArray(backupData.inventory) && backupData.inventory.every(isValidWatch) && (backupData.bids === undefined || (Array.isArray(backupData.bids) && backupData.bids.every(isValidBid)))) { setWatches(backupData.inventory); if (Array.isArray(backupData.bids)) setBids(backupData.bids); return; } window.alert("That backup file does not look like FlipTrack data."); } catch { window.alert("That backup file could not be read."); } }; reader.readAsText(file); event.target.value = ""; };
  const changeSearch = (value: string) => setSearch(value);
  const saveBid = (entry: BidGuideEntry) => setBids((items) => [entry, ...items.filter((item) => item.id !== entry.id && bidKey(item) !== bidKey(entry))]);
  const removeBid = (id: string) => { if (window.confirm("Remove this bid guide entry?")) setBids((items) => items.filter((item) => item.id !== id)); };
  const syncLabel = inventorySyncState === "private" || bidSyncState === "private" ? "This FlipTrack sync is private. Add the shared key (NEXT_PUBLIC_FLIPTRACK_SYNC_KEY) to your Vercel project to sync across devices." : inventorySyncState === "offline" || bidSyncState === "offline" ? "Sync paused — changes are saved on this device." : inventorySyncState === "saving" || bidSyncState === "saving" ? "Saving to cloud…" : "Saved to cloud across your devices.";

  return <main className="app-shell">
    <header className="app-topbar">
      <button className="brand" onClick={() => setView("overview")}><span className="brand-mark">f</span><span>fliptrack</span></button>
      <nav className="app-nav" aria-label="Main navigation">{([ ["overview", "Overview"], ["inventory", "Inventory"], ["sales", "Sales & profit"], ["cash", "Cash flow"] ] as [View, string][]).map(([key, label]) => <button key={key} className={view === key ? "active" : ""} aria-current={view === key ? "page" : undefined} onClick={() => setView(key)}>{label}</button>)}</nav>
      <div className="top-actions">{view === "bids" && <input className="global-search" aria-label="Search bid guide" placeholder="Search bid guide" value={bidSearch} onChange={(event) => setBidSearch(event.target.value)} />}<button className="text-button backup-button" onClick={backup}>Back up</button><label className="text-button backup-button">Restore<input type="file" accept="application/json" onChange={restore} /></label><button className="primary-button" onClick={() => setShowForm(true)}>+ Add item</button></div>
    </header>

    {view === "overview" && <Overview stats={stats} lanes={laneItems} onInventory={() => setView("inventory")} />}
    {view === "inventory" && <Inventory items={visible} search={search} setSearch={changeSearch} filter={filter} setFilter={setFilter} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} categories={categories} exportCsv={exportCsv} update={update} remove={remove} edit={setEditing} clone={clone} offer={setOfferItem} />}
    {view === "bids" && <BidGuide entries={visibleBids} watches={watches} search={bidSearch} setSearch={setBidSearch} add={() => setShowBidForm(true)} edit={setEditingBid} remove={removeBid} />}
    {view === "sales" && <SalesView stats={stats} monthly={monthly} />}
    {view === "cash" && <CashView ledger={ledger} watches={watches} />}

    <p className={`footnote sync-status ${inventorySyncState === "offline" || inventorySyncState === "private" || bidSyncState === "offline" || bidSyncState === "private" ? "sync-offline" : ""}`}>{syncLabel}</p>
    {showForm && <AddWatch onClose={() => setShowForm(false)} onAdd={(item) => { setWatches((items) => [item, ...items]); setShowForm(false); }} />}
    {showBidForm && <BidGuideForm onClose={() => setShowBidForm(false)} onSave={(entry) => { saveBid(entry); setShowBidForm(false); }} />}
    {editingBid && <BidGuideForm entry={editingBid} onClose={() => setEditingBid(null)} onSave={(entry) => { saveBid(entry); setEditingBid(null); }} />}
    {editing && <EditWatch watch={editing} onClose={() => setEditing(null)} onSave={(changes) => { update(editing.id, changes); setEditing(null); }} />}
    {offerItem && <OfferCalculator watch={offerItem} onClose={() => setOfferItem(null)} onAccept={(soldPrice, poshShippingDiscount) => { update(offerItem.id, { status: "Sold", soldPrice, poshShippingDiscount, soldOn: localDate(), salePlatform: "Poshmark" }); setOfferItem(null); }} />}
  </main>;
}

function Overview({ stats, lanes, onInventory }: { stats: { profit: number; activeCost: number; roi: number; pendingSold: number }; lanes: Record<"transit" | "received" | "listed" | "sold", Watch[]>; onInventory: () => void }) {
  const laneData: { key: keyof typeof lanes; label: string; hint: string }[] = [{ key: "transit", label: "On the way", hint: "Waiting to arrive" }, { key: "received", label: "Ready to list", hint: "Photograph and post" }, { key: "listed", label: "Live", hint: "Working in your closet" }, { key: "sold", label: "Sold", hint: "Completed sales" }];
  return <section className="page-view"><div className="page-heading"><div><p className="eyebrow">YOUR RESELLING BUSINESS</p><h1>Overview</h1><p>Everything moving through your resale business.</p></div><button className="text-link" onClick={onInventory}>View all inventory →</button></div><div className="summary-grid"><Summary label="Profit from sold" value={money(stats.profit)} detail="After Poshmark fees" positive /><Summary label="Inventory at cost" value={money(stats.activeCost)} detail="Currently unsold" /><Summary label="Return on sold" value={`${stats.roi.toFixed(0)}%`} detail="Profit vs. sold cost" positive /></div><div className="section-heading"><div><h2>Inventory flow</h2><p>Move items from left to right.</p></div></div><div className="flow-lanes">{laneData.map((lane) => <article className="flow-lane" key={lane.key}><div className="lane-heading"><span>{lane.label}</span><b>{lanes[lane.key].length}</b></div><small>{lane.key === "sold" && stats.pendingSold ? `${stats.pendingSold} needs sale details` : lane.hint}</small><div className="lane-items">{lanes[lane.key].slice(0, 3).map((item) => <LaneItem item={item} key={item.id} />)}{lanes[lane.key].length > 3 && <button className="more-items" onClick={onInventory}>+{lanes[lane.key].length - 3} more</button>}{!lanes[lane.key].length && <div className="empty-lane">Nothing here yet.</div>}</div></article>)}</div></section>;
}

function Summary({ label, value, detail, positive = false }: { label: string; value: string; detail: string; positive?: boolean }) { return <article className="summary-card"><span>{label}</span><strong className={positive ? "positive" : ""}>{value}</strong><small>{detail}</small></article>; }
function LaneItem({ item }: { item: Watch }) { const isSold = item.status === "Sold"; const hasSaleDetails = item.soldPrice != null || item.poshEarnings != null; return <div className="lane-item"><b>{item.name || item.model || "Untitled item"}</b><span>{isSold ? hasSaleDetails ? <em className={profitFor(item) >= 0 ? "profit" : "loss"}>{profitFor(item) >= 0 ? "+" : ""}{money(profitFor(item))} profit</em> : <em>Needs sale details</em> : `${money(totalCost(item))} cost`}</span></div>; }

function Inventory({ items, search, setSearch, filter, setFilter, categoryFilter, setCategoryFilter, categories, exportCsv, update, remove, edit, clone, offer }: { items: Watch[]; search: string; setSearch: (value: string) => void; filter: "All" | Exclude<Status, "Bought">; setFilter: (value: "All" | Exclude<Status, "Bought">) => void; categoryFilter: string; setCategoryFilter: (value: string) => void; categories: string[]; exportCsv: () => void; update: (id: string, changes: Partial<Watch>) => void; remove: (id: string) => void; edit: (item: Watch) => void; clone: (item: Watch) => void; offer: (item: Watch) => void }) {
  return <section className="page-view"><div className="page-heading"><div><p className="eyebrow">INVENTORY</p><h1>Your items</h1><p>Search, edit, and move every item through the workflow.</p></div><button className="text-link" onClick={exportCsv}>Export CSV</button></div><div className="inventory-toolbar"><div className="filters">{(["All", "In transit", "Received", "Listed", "Sold"] as const).map((value) => <button className={filter === value ? "active" : ""} aria-pressed={filter === value} onClick={() => setFilter(value)} key={value}>{value}</button>)}</div><div className="inventory-controls"><input className="inventory-search" aria-label="Search inventory" placeholder="Search inventory" value={search} onChange={(event) => setSearch(event.target.value)} /><select value={categoryFilter} aria-label="Filter inventory by category" onChange={(event) => setCategoryFilter(event.target.value)}><option>All categories</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></div></div><div className="inventory-table-wrap"><table><thead><tr><th>Item</th><th>Status</th><th>Cost</th><th>Age</th><th>List / sale</th><th>Profit</th><th>Actions</th></tr></thead><tbody>{items.map((item) => <WatchRow item={item} key={item.id} update={update} remove={remove} edit={() => edit(item)} clone={() => clone(item)} offer={() => offer(item)} />)}</tbody></table></div><div className="mobile-list">{items.map((item) => <MobileItem item={item} key={item.id} update={update} remove={remove} edit={() => edit(item)} clone={() => clone(item)} offer={() => offer(item)} />)}</div>{!items.length && <div className="empty">No items match this view.</div>}</section>;
}

function BidGuide({ entries, watches, search, setSearch, add, edit, remove }: { entries: BidGuideEntry[]; watches: Watch[]; search: string; setSearch: (value: string) => void; add: () => void; edit: (entry: BidGuideEntry) => void; remove: (id: string) => void }) {
  const resultLabel = search.trim() ? `${entries.length} match${entries.length === 1 ? "" : "es"}` : `${entries.length} saved ceilings`;
  return <section className="page-view"><div className="page-heading"><div><p className="eyebrow">WHATNOT SOURCING</p><h1>Bid guide</h1><p>One clean reference table for your all-in buying ceilings.</p></div><button className="primary-button" onClick={add}>+ Add max bid</button></div><div className="bid-search-row"><input aria-label="Search bid guide" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search model, name, category, or notes" /><span>{resultLabel} · shipping included</span></div><div className="bid-table-wrap"><table className="bid-table"><thead><tr><th>Item</th><th>Category</th><th>Max bid</th><th>Expected sale</th><th>Past buys</th><th>Notes</th><th /></tr></thead><tbody>{entries.map((entry) => { const prior = watches.filter((item) => item.model.trim().toLowerCase() === entry.model.trim().toLowerCase()); const costs = prior.map(totalCost); return <tr key={entry.id}><td><b>{entry.name || "Untitled item"}</b><small>{entry.model}</small></td><td>{entry.category || "Other"}</td><td><b className={entry.maxBid === 0 ? "bid-pass" : "bid-ceiling"}>{entry.maxBid === 0 ? "Pass" : money(entry.maxBid)}</b></td><td>{entry.expectedSale != null ? money(entry.expectedSale) : "—"}</td><td>{prior.length ? <><b>{prior.length} buy{prior.length === 1 ? "" : "s"}</b><small>{money(Math.min(...costs))}–{money(Math.max(...costs))}</small></> : "—"}</td><td className="bid-notes">{entry.notes || "—"}</td><td><div className="bid-actions"><button onClick={() => edit(entry)}>Edit</button><button className="remove-bid" aria-label={`Remove ${entry.model} from bid guide`} onClick={() => remove(entry.id)}>×</button></div></td></tr>; })}</tbody></table>{!entries.length && <div className="empty bid-empty"><b>{search.trim() ? "No matching bids." : "No saved bids yet."}</b><span>{search.trim() ? "Try a model number, name, category, or a word from your notes." : "When a model comes up often, save its maximum all-in price here."}</span></div>}</div></section>;
}

function SalesView({ stats, monthly }: { stats: { sold: Watch[]; profit: number; earnings: number; soldCost: number; roi: number }; monthly: { label: string; payout: number; fees: number; cost: number; profit: number; sold: number }[] }) {
  const maxMagnitude = Math.max(...monthly.map((month) => Math.abs(month.profit)), 1);
  const grossSales = round2(stats.sold.reduce((sum, item) => sum + grossFor(item), 0));
  const totalFees = round2(stats.sold.reduce((sum, item) => sum + feesFor(item), 0));
  const estimatedBuyerCount = stats.sold.filter((item) => item.soldPrice == null && item.poshEarnings != null).length;
  const estimatedFeeCount = stats.sold.filter((item) => item.soldPrice == null || item.poshEarnings == null).length;
  const singleMonth = monthly[0];
  const benSold = stats.sold.filter((item) => item.paidBy === "Ben");
  const benPayout = round2(benSold.reduce((sum, item) => sum + earningsFor(item), 0));
  const benProfit = round2(benSold.reduce((sum, item) => sum + profitFor(item), 0));
  const platformSales = (["Poshmark", "eBay", "Other"] as SalePlatform[]).map((platform) => { const sold = stats.sold.filter((item) => salePlatformFor(item) === platform); return { platform, sold: sold.length, payout: round2(sold.reduce((sum, item) => sum + earningsFor(item), 0)), profit: round2(sold.reduce((sum, item) => sum + profitFor(item), 0)) }; }).filter((entry) => entry.sold);
  return <section className="page-view"><div className="page-heading"><div><p className="eyebrow">SALES &amp; PROFIT</p><h1>What you made</h1><p>Clear monthly results after marketplace fees and item costs.</p></div></div><SalesCalendar sold={stats.sold} /><div className="report-grid"><article className="report-card chart-card"><div className="section-heading"><div><h2>Profit by month</h2><p>Actual profit—not listed value.</p></div></div>{monthly.length === 1 && singleMonth ? <div className="single-month-profit"><div><span>{singleMonth.label}</span><b className={singleMonth.profit >= 0 ? "profit" : "loss"}>{singleMonth.profit >= 0 ? "+" : ""}{money(singleMonth.profit)}</b><small>{singleMonth.sold} sold · {money(singleMonth.profit / singleMonth.sold)} average profit per sale</small></div><div className="single-month-stats"><span>Buyer paid <b>{money(grossSales)}</b></span><span>Marketplace payout <b>{money(singleMonth.payout)}</b></span></div></div> : monthly.length ? <div className="profit-chart">{monthly.map((month) => <div className="bar-group" key={month.label}><b className={month.profit < 0 ? "loss" : ""}>{money(month.profit)}</b><div className="bar-track"><div className={month.profit < 0 ? "bar loss-bar" : "bar"} style={{ height: `${Math.max(4, (Math.abs(month.profit) / maxMagnitude) * 50)}%` }} /></div><span>{month.label}</span></div>)}</div> : <div className="empty">Your completed sales will appear here.</div>}</article><article className="report-card"><h2>All-time sales</h2><div className="money-breakdown"><div><span>Buyer paid{estimatedBuyerCount ? ` (estimated on ${estimatedBuyerCount})` : ""}</span><b>{money(grossSales)}</b></div><div><span>Marketplace costs{estimatedFeeCount ? ` (estimated on ${estimatedFeeCount})` : ""}</span><b>{money(totalFees)}</b></div><div><span>Item cost</span><b>{money(stats.soldCost)}</b></div><div className="net"><span>Actual profit</span><b>{money(stats.profit)}</b></div>{benSold.length > 0 && <div><span>Ben&apos;s {benSold.length} sold item{benSold.length === 1 ? "" : "s"}</span><b>{money(benPayout)} payout · {money(benProfit)} profit</b></div>}</div></article></div><section className="platform-sales"><div className="section-heading"><div><h2>Sales by platform</h2><p>Existing sales are counted as Poshmark; edit any past sale if that is not right.</p></div></div><div>{platformSales.map((entry) => <article key={entry.platform}><b>{entry.platform}</b><span>{entry.sold} sold</span><span>{money(entry.payout)} payout</span><strong className={entry.profit >= 0 ? "profit" : "loss"}>{entry.profit >= 0 ? "+" : ""}{money(entry.profit)} profit</strong></article>)}</div></section><div className="monthly-results"><div className="section-heading"><div><h2>Monthly detail</h2><p>Every month stays separate, so growth is easy to see.</p></div></div>{monthly.map((month) => <article className="monthly-result" key={month.label}><b>{month.label}</b><span>{month.sold} sold</span><span>Payout {money(month.payout)}</span><strong className={month.profit >= 0 ? "profit" : "loss"}>{money(month.profit)} profit</strong></article>)}{!monthly.length && <div className="empty">No completed sales yet.</div>}</div></section>;
}

function SalesCalendar({ sold }: { sold: Watch[] }) {
  const [month, setMonth] = useState(() => { const today = new Date(); return new Date(today.getFullYear(), today.getMonth(), 1); });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const monthLabel = month.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const startOffset = month.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const salesByDate = useMemo(() => {
    const result = new Map<string, Watch[]>();
    sold.forEach((item) => { if (item.soldOn) result.set(item.soldOn, [...(result.get(item.soldOn) ?? []), item]); });
    return result;
  }, [sold]);
  const keyForDay = (day: number) => `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const selectedSales = selectedDate ? salesByDate.get(selectedDate) ?? [] : [];
  const selectedProfit = round2(selectedSales.reduce((sum, item) => sum + profitFor(item), 0));
  const moveMonth = (amount: number) => { setMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1)); setSelectedDate(null); };
  return <section className="sales-calendar" aria-label="Sales calendar"><div className="calendar-heading"><div><h2>Sales calendar</h2><p>Green dates have completed sales.</p></div><div className="calendar-month-controls"><button type="button" aria-label="Previous month" onClick={() => moveMonth(-1)}>←</button><strong>{monthLabel}</strong><button type="button" aria-label="Next month" onClick={() => moveMonth(1)}>→</button></div></div><div className="calendar-weekdays">{["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div><div className="calendar-grid">{Array.from({ length: startOffset }, (_, index) => <span className="calendar-empty" key={`empty-${index}`} />)}{Array.from({ length: daysInMonth }, (_, index) => { const day = index + 1; const key = keyForDay(day); const sales = salesByDate.get(key) ?? []; const active = key === selectedDate; return <button type="button" key={key} className={`calendar-day ${sales.length ? "has-sales" : ""} ${active ? "selected" : ""}`} aria-pressed={active} aria-label={sales.length ? `${key}: ${sales.length} sale${sales.length === 1 ? "" : "s"}` : key} onClick={() => setSelectedDate(active ? null : key)}><b>{day}</b>{sales.length > 0 && <small>{sales.length} sale{sales.length === 1 ? "" : "s"}</small>}</button>; })}</div><div className="calendar-detail" aria-live="polite">{selectedSales.length ? <><div><b>{new Date(`${selectedDate}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</b><strong className={selectedProfit >= 0 ? "profit" : "loss"}>{selectedProfit >= 0 ? "+" : ""}{money(selectedProfit)} profit</strong></div><ul>{selectedSales.map((item) => <li key={item.id}>{item.name || item.model} <span>{money(item.soldPrice ?? earningsFor(item))}</span></li>)}</ul></> : <span>Select a green date to see that day&apos;s sales.</span>}</div></section>;
}
function CashView({ ledger, watches }: { ledger: { id: string; date: string; type: "in" | "out"; label: string; amount: number }[]; watches: Watch[] }) {
  const people = (["Caroline", "Ben"] as const).map((person) => { const items = watches.filter((item) => (item.paidBy || "Caroline") === person); const putIn = round2(items.reduce((sum, item) => sum + totalCost(item), 0)); const payouts = round2(items.filter((item) => item.status === "Sold").reduce((sum, item) => sum + earningsFor(item), 0)); return { person, items: items.length, putIn, payouts, tiedUp: round2(putIn - payouts) }; });
  return <section className="page-view"><div className="page-heading"><div><p className="eyebrow">CASH FLOW</p><h1>Money in and out</h1><p>Sales payouts and purchases are different from profit—both matter.</p></div></div><div className="cash-person-grid">{people.map((person) => <article className="cash-person-card" key={person.person}><div><span>{person.person}</span><b>{money(person.putIn)}</b><small>put into {person.items} item{person.items === 1 ? "" : "s"}</small></div><dl><div><dt>Marketplace payouts</dt><dd>{money(person.payouts)}</dd></div><div><dt>{person.tiedUp > 0 ? "Still tied up" : person.tiedUp < 0 ? "Cash back above cost" : "Investment recouped"}</dt><dd className={person.tiedUp < 0 ? "cash-ahead" : ""}>{person.tiedUp < 0 ? "+" : ""}{money(Math.abs(person.tiedUp))}</dd></div></dl></article>)}</div><section className="ledger-section"><div className="section-heading"><div><h2>Recent money movement</h2><p>Every purchase and marketplace payout in date order.</p></div></div><div className="ledger">{ledger.map((entry) => <article key={entry.id}><div><b>{entry.label}</b><small>{new Date(`${entry.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</small></div><strong className={entry.type === "in" ? "inflow" : "outflow"}>{entry.type === "in" ? "+" : "−"}{money(entry.amount)}</strong></article>)}</div></section></section>;
}

function TrackingBadge({ tracking }: { tracking: string }) {
  const [update, setUpdate] = useState<TrackingUpdate | null>(null);
  useEffect(() => { let active = true; loadTrackingUpdate(tracking).then((next) => { if (active) setUpdate(next); }); return () => { active = false; }; }, [tracking]);
  const text = `${update?.status || "Checking USPS…"} ${update?.location || ""}`.toLowerCase();
  const icon = text.includes("delivered") ? "✓" : text.includes("out for delivery") ? "🚚" : text.includes("in transit") ? "🚚" : text.includes("pending") ? "⌛" : "📦";
  const label = update ? update.location || update.status : "Checking USPS…";
  const detail = update ? [update.status, update.summary, update.location].filter(Boolean).join(" — ") : "Checking USPS tracking";
  return <span className={`tracking-badge ${text.includes("pending") ? "pending" : ""}`} title={detail}><span aria-hidden="true">{icon}</span><span>{label}</span></span>;
}

function WatchRow({ item, update, remove, edit, clone, offer }: { item: Watch; update: (id: string, changes: Partial<Watch>) => void; remove: (id: string) => void; edit: () => void; clone: () => void; offer: () => void }) {
  const [selling, setSelling] = useState(false); const [price, setPrice] = useState(item.soldPrice?.toString() ?? ""); const [trackingMessage, setTrackingMessage] = useState(""); const [checkingTracking, setCheckingTracking] = useState(false); const age = ageFor(item); const status = pipelineStatus(item.status); const estimated = estimatedProfitFor(item);
  const markSold = () => { const soldPrice = Number(price); if (price.trim() === "" || !Number.isFinite(soldPrice) || soldPrice < 0) return; update(item.id, { status: "Sold", soldPrice: round2(soldPrice), soldOn: localDate(), salePlatform: "Poshmark" }); setSelling(false); };
  const relist = () => update(item.id, { status: "Listed", listedOn: item.listedOn || localDate(), soldPrice: undefined, soldOn: undefined, salePlatform: undefined, poshEarnings: undefined, poshShippingDiscount: undefined });
  const checkTracking = async () => { if (!item.tracking) return; setCheckingTracking(true); setTrackingMessage(""); try { const response = await fetch(`/api/usps?tracking=${encodeURIComponent(item.tracking)}`); const data = await response.json(); setTrackingMessage(data.summary || data.status || data.error || "No update found."); } catch { setTrackingMessage("Could not reach USPS right now."); } finally { setCheckingTracking(false); } };
  const saveTracking = () => { const value = window.prompt("USPS tracking number", item.tracking || ""); if (value == null || value.trim() === "") return; update(item.id, { tracking: value.trim() }); };
  return <tr>
    <td data-label="Item"><div className="item-name"><span className="item-icon">◷</span><div>{item.poshUrl ? <a href={item.poshUrl} target="_blank" rel="noreferrer">{item.name || item.model || "Untitled item"}</a> : <b>{item.name || item.model || "Untitled item"}</b>}<small>{item.category || "Other"}{item.model ? ` · ${item.model}` : ""}<span className={`payer-badge ${(item.paidBy || "Caroline").toLowerCase()}`} title={`Paid by ${item.paidBy || "Caroline"}`}>{(item.paidBy || "Caroline")[0]}</span></small>{item.tracking && <TrackingBadge tracking={item.tracking} />}{trackingMessage && <small className="tracking-message">{trackingMessage}</small>}</div></div></td>
    <td data-label="Status"><span className={`status ${status.toLowerCase().replaceAll(" ", "-")}`}>{status}</span></td>
    <td data-label="Cost"><b>{money(totalCost(item))}</b></td>
    <td data-label="Age"><span className={age != null && age >= 30 && item.status !== "Sold" ? "age aging" : "age"}>{age == null ? "—" : `${age}d`}</span>{age != null && age >= 30 && item.status !== "Sold" && <small>Review price</small>}</td>
    <td data-label="List / sale">{item.status === "Sold" ? <div className="sale-summary"><b>Sold for {money(item.soldPrice ?? 0)}</b><small><span className={`platform-tag ${salePlatformFor(item).toLowerCase().replaceAll(" ", "-")}`}>{salePlatformFor(item)}</span> · Listed at {money(item.listPrice)}</small></div> : <div className="sale-summary"><b>{item.listPrice ? money(item.listPrice) : "—"}</b>{estimated != null && <small className={estimated >= 0 ? "profit" : "loss"}>{estimated >= 0 ? "+" : ""}{money(estimated)} at list</small>}</div>}</td>
    <td data-label="Profit">{item.status === "Sold" ? <b className={profitFor(item) >= 0 ? "profit" : "loss"}>{profitFor(item) >= 0 ? "+" : ""}{money(profitFor(item))}</b> : selling ? <div className="sell-inline"><input autoFocus inputMode="decimal" placeholder="Sale $" value={price} onChange={(event) => setPrice(event.target.value)} /><button onClick={markSold}>Save</button></div> : <button className="sell-button" onClick={() => { setPrice(item.listPrice ? String(item.listPrice) : ""); setSelling(true); }}>Mark sold</button>}</td>
    <td data-label="Actions"><div className={`row-actions ${item.status === "Sold" ? "sold-actions" : ""}`}>{item.status === "Sold" ? <><button title={item.tracking ? "Update USPS tracking number" : "Add USPS tracking number"} onClick={saveTracking}>Track</button><button onClick={clone}>Clone</button><details className="action-menu"><summary aria-label={`More actions for ${item.name || item.model}`}>More</summary><div className="action-menu-panel"><button onClick={edit}>Edit sale</button><button onClick={relist}>Relist</button></div></details></> : <>{status === "In transit" ? <button onClick={() => update(item.id, { status: "Received" })}>Received</button> : status === "Received" ? <button onClick={() => update(item.id, { status: "Listed", listedOn: localDate() })}>List</button> : <button onClick={offer}>Offer</button>}<details className="action-menu"><summary aria-label={`More actions for ${item.name || item.model}`}>More</summary><div className="action-menu-panel">{item.tracking && <><button onClick={checkTracking}>{checkingTracking ? "Checking…" : "Refresh tracking"}</button><a className="track-link" href={`https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(item.tracking)}`} target="_blank" rel="noreferrer">USPS tracking</a></>}{status !== "Listed" && <button onClick={offer}>Offer</button>}<button onClick={clone}>Clone</button><button onClick={edit}>Edit</button><button className="menu-remove" onClick={() => remove(item.id)}>Delete</button></div></details></>}</div></td>
  </tr>;
}

function MobileItem({ item, update, remove, edit, clone, offer }: { item: Watch; update: (id: string, changes: Partial<Watch>) => void; remove: (id: string) => void; edit: () => void; clone: () => void; offer: () => void }) {
  const age = ageFor(item); const status = pipelineStatus(item.status); const estimated = estimatedProfitFor(item);
  const markSold = () => { const value = window.prompt("Sale price", item.listPrice ? String(item.listPrice) : ""); if (value == null || value.trim() === "") return; const price = Number(value); if (!Number.isFinite(price) || price < 0) return; update(item.id, { status: "Sold", soldPrice: round2(price), soldOn: localDate(), salePlatform: "Poshmark" }); };
  const relist = () => update(item.id, { status: "Listed", listedOn: item.listedOn || localDate(), soldPrice: undefined, soldOn: undefined, salePlatform: undefined, poshEarnings: undefined, poshShippingDiscount: undefined });
  const saveTracking = () => { const value = window.prompt("USPS tracking number", item.tracking || ""); if (value == null || value.trim() === "") return; update(item.id, { tracking: value.trim() }); };
  return <article className="mobile-item"><div className="mobile-item-top"><div className="item-name"><span className="item-icon">◷</span><div>{item.poshUrl ? <a href={item.poshUrl} target="_blank" rel="noreferrer">{item.name || item.model || "Untitled item"}</a> : <b>{item.name || item.model || "Untitled item"}</b>}<small>{item.category || "Other"}{item.model ? ` · ${item.model}` : ""}<span className={`payer-badge ${(item.paidBy || "Caroline").toLowerCase()}`} title={`Paid by ${item.paidBy || "Caroline"}`}>{(item.paidBy || "Caroline")[0]}</span></small>{item.tracking && <TrackingBadge tracking={item.tracking} />}</div></div><span className={`status ${status.toLowerCase().replaceAll(" ", "-")}`}>{status}</span></div><div className="mobile-metrics"><div><span>Cost</span><b>{money(totalCost(item))}</b></div><div><span>{item.status === "Sold" ? "Sold for" : "Listed"}</span><b>{item.status === "Sold" ? money(item.soldPrice ?? 0) : item.listPrice ? money(item.listPrice) : "—"}</b></div><div><span>Listed age</span><b className={age != null && age >= 30 && item.status !== "Sold" ? "aging" : ""}>{age == null ? "—" : `${age}d`}</b></div></div><div className="mobile-bottom"><small className={item.status === "Sold" ? (profitFor(item) >= 0 ? "profit" : "loss") : estimated != null ? (estimated >= 0 ? "profit" : "loss") : "muted"}>{item.status === "Sold" ? `${profitFor(item) >= 0 ? "+" : ""}${money(profitFor(item))} profit` : estimated != null ? `~${estimated >= 0 ? "+" : ""}${money(estimated)} at list` : "Not sold yet"}</small><div>{item.status === "Sold" ? <><button title={item.tracking ? "Update USPS tracking number" : "Add USPS tracking number"} onClick={saveTracking}>Track</button><button onClick={edit}>Edit sale</button><button onClick={relist}>Relist</button><button onClick={clone}>Clone</button></> : <><button className="mobile-sell" onClick={markSold}>Mark sold</button><button onClick={offer}>Offer</button><button onClick={clone}>Clone</button><button onClick={edit}>Edit</button><button className="mobile-remove" onClick={() => remove(item.id)}>Delete</button></>}</div></div></article>;
}

function EditWatch({ watch, onClose, onSave }: { watch: Watch; onClose: () => void; onSave: (changes: Partial<Watch>) => void }) { const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const status = String(form.get("status")) as Status; const soldPriceField = String(form.get("soldPrice") ?? ""); const soldPrice = Number(soldPriceField); const payout = String(form.get("payout") || ""); const shippingDiscount = String(form.get("shippingDiscount") || ""); const hasSoldPrice = soldPriceField.trim() !== "" && Number.isFinite(soldPrice); onSave({ name: String(form.get("name") || "").trim(), category: String(form.get("category") || "Other").trim(), model: String(form.get("model") || "").trim(), paidBy: String(form.get("paidBy") || "Caroline") as Watch["paidBy"], boughtOn: String(form.get("boughtOn")), cost: round2(Number(form.get("cost") || 0)), inbound: round2(Number(form.get("inbound") || 0)), listPrice: round2(Number(form.get("listPrice") || 0)), listedOn: String(form.get("listedOn") || "") || undefined, status, salePlatform: status === "Sold" ? String(form.get("salePlatform") || "Poshmark") as SalePlatform : undefined, soldPrice: status === "Sold" && hasSoldPrice ? round2(soldPrice) : undefined, soldOn: status === "Sold" && (hasSoldPrice || payout) ? String(form.get("soldOn") || localDate()) : undefined, poshEarnings: status === "Sold" && payout ? round2(Number(payout)) : undefined, poshShippingDiscount: status === "Sold" && shippingDiscount ? round2(Number(shippingDiscount)) : undefined, tracking: String(form.get("tracking") || "").trim(), poshUrl: String(form.get("poshUrl") || "").trim(), notes: String(form.get("notes") || "").trim() }); }; return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Edit item"><form className="modal" onSubmit={submit}><button type="button" className="close" onClick={onClose}>×</button><p className="eyebrow">EDIT INVENTORY</p><h2>Update item</h2><div className="form-grid"><label>Item name<input name="name" defaultValue={watch.name} required /></label><label>Category<input name="category" defaultValue={watch.category} /></label><label>Paid by<select name="paidBy" defaultValue={watch.paidBy || "Caroline"}><option>Caroline</option><option>Ben</option></select></label><label>SKU or model number<input name="model" defaultValue={watch.model} /></label><label>Purchase date<input name="boughtOn" type="date" defaultValue={watch.boughtOn} required /></label><label>Purchase price<input name="cost" type="number" min="0" step="0.01" defaultValue={watch.cost} required /></label><label>Inbound shipping<input name="inbound" type="number" min="0" step="0.01" defaultValue={watch.inbound} required /></label><label>Planned list price<input name="listPrice" type="number" min="0" step="0.01" defaultValue={watch.listPrice || ""} /></label><label>Listed date (for age)<input name="listedOn" type="date" defaultValue={watch.listedOn || ""} /></label><label>Status<select name="status" defaultValue={pipelineStatus(watch.status)}><option>In transit</option><option>Received</option><option>Listed</option><option>Sold</option></select></label><label className="full">Poshmark listing URL<input name="poshUrl" type="url" defaultValue={watch.poshUrl || ""} placeholder="https://poshmark.com/listing/…" /></label><label className="full">USPS tracking number<input name="tracking" defaultValue={watch.tracking || ""} placeholder="9400…" /></label><label>Sale platform<select name="salePlatform" defaultValue={salePlatformFor(watch)}><option>Poshmark</option><option>eBay</option><option>Other</option></select></label><label>Sale price<input name="soldPrice" type="number" min="0" step="0.01" defaultValue={watch.soldPrice ?? ""} /></label><label>Marketplace shipping discount<input name="shippingDiscount" type="number" min="0" step="0.01" defaultValue={watch.poshShippingDiscount ?? ""} placeholder="Optional" /></label><label>Sold date<input name="soldOn" type="date" defaultValue={watch.soldOn || ""} /></label><label>Actual marketplace payout<input name="payout" type="number" min="0" step="0.01" defaultValue={watch.poshEarnings ?? ""} placeholder="Optional override" /></label><label className="full">Notes<input name="notes" defaultValue={watch.notes || ""} /></label></div><div className="modal-actions"><button type="button" className="text-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit">Save changes</button></div></form></div>; }

function OfferCalculator({ watch, onClose, onAccept }: { watch: Watch; onClose: () => void; onAccept: (soldPrice: number, poshShippingDiscount?: number) => void }) { const [offer, setOffer] = useState(String(watch.listPrice || "")); const [shippingDiscount, setShippingDiscount] = useState(""); const amount = Number(offer) || 0; const discount = Number(shippingDiscount) || 0; const fee = feeFor(amount); const payout = amount - fee - discount; const profit = payout - totalCost(watch); const accept = () => { if (offer.trim() === "" || !Number.isFinite(amount) || amount < 0 || !Number.isFinite(discount) || discount < 0) return; onAccept(round2(amount), shippingDiscount.trim() ? round2(discount) : undefined); }; return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Offer calculator"><section className="modal calculator"><button className="close" onClick={onClose}>×</button><p className="eyebrow">OFFER CHECK</p><h2>{watch.name}</h2><p className="modal-copy">Enter the buyer&apos;s offer and any shipping discount you&apos;re covering.</p><label className="offer-input">Offer amount<input autoFocus inputMode="decimal" value={offer} onChange={(event) => setOffer(event.target.value)} placeholder="0.00" /></label><label className="offer-input shipping-discount-input">Shipping discount you pay<input inputMode="decimal" value={shippingDiscount} onChange={(event) => setShippingDiscount(event.target.value)} placeholder="0.00" /></label><div className="offer-results"><div><span>Poshmark fee</span><b>{money(fee)}</b></div><div><span>Shipping discount</span><b>{money(discount)}</b></div><div><span>Your payout</span><b>{money(payout)}</b></div><div className={profit >= 0 ? "offer-profit good" : "offer-profit bad"}><span>Profit after cost</span><b>{profit >= 0 ? "+" : ""}{money(profit)}</b></div></div><p className="fee-note">Uses Poshmark&apos;s 20% fee for sales of $15 or more. Your shipping discount is deducted separately.</p><div className="modal-actions"><button className="primary-button" onClick={accept}>Accept &amp; mark sold</button></div></section></div>; }

function BidGuideForm({ entry, onClose, onSave }: { entry?: BidGuideEntry; onClose: () => void; onSave: (entry: BidGuideEntry) => void }) { const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const model = String(form.get("model") || "").trim(); const maxBidField = form.get("maxBid"); const maxBid = Number(maxBidField); if (!model || maxBidField == null || maxBidField === "" || !Number.isFinite(maxBid)) return; onSave({ id: entry?.id ?? crypto.randomUUID(), model, name: String(form.get("name") || "").trim(), category: String(form.get("category") || "Other").trim(), maxBid: round2(maxBid), expectedSale: form.get("expectedSale") ? round2(Number(form.get("expectedSale"))) : undefined, notes: String(form.get("notes") || "").trim(), updatedOn: localDate() }); }; return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={entry ? "Edit bid guide item" : "Add bid guide item"}><form className="modal bid-form" onSubmit={submit}><button type="button" className="close" onClick={onClose}>×</button><p className="eyebrow">WHATNOT BID GUIDE</p><h2>{entry ? "Edit bid" : "Save a max bid"}</h2><p className="modal-copy">Use the total you are comfortable paying, including shipping and tax if those apply. Set the max bid to $0 for a clear pass.</p><div className="form-grid"><label>Model number<input name="model" autoFocus placeholder="e.g. 70271" defaultValue={entry?.model} required /></label><label>Item name / variant<input name="name" defaultValue={entry?.name} placeholder="e.g. Invicta Celestial, pink dial" /></label><label>Category<input name="category" defaultValue={entry?.category || "Other"} placeholder="e.g. Watches, Sunglasses" /></label><label>Max all-in bid<input name="maxBid" type="number" min="0" step="0.01" defaultValue={entry?.maxBid ?? ""} placeholder="0.00" required /></label><label>Expected sale price<input name="expectedSale" type="number" min="0" step="0.01" defaultValue={entry?.expectedSale ?? ""} placeholder="Optional" /></label><label className="full">Notes<input name="notes" defaultValue={entry?.notes} placeholder="Why it is a good buy, colors to prefer, expected profit…" /></label></div><div className="modal-actions"><button type="button" className="text-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit">{entry ? "Save changes" : "Save max bid"}</button></div></form></div>; }

function AddWatch({ onClose, onAdd }: { onClose: () => void; onAdd: (watch: Watch) => void }) { const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const name = String(form.get("name") || "").trim(); if (!name) return; onAdd({ id: crypto.randomUUID(), model: String(form.get("model") || "").trim(), name, category: String(form.get("category") || "Other").trim(), boughtOn: String(form.get("boughtOn")), cost: round2(Number(form.get("cost") || 0)), inbound: round2(Number(form.get("inbound") || 0)), listPrice: round2(Number(form.get("listPrice") || 0)), status: "In transit", paidBy: String(form.get("paidBy") || "Caroline") as Watch["paidBy"], tracking: String(form.get("tracking") || "").trim(), notes: String(form.get("notes") || "") }); }; return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Add item"><form className="modal" onSubmit={submit}><button type="button" className="close" onClick={onClose}>×</button><p className="eyebrow">NEW INVENTORY</p><h2>Add item</h2><p className="modal-copy">Capture what you paid now. You can list or sell it later.</p><div className="form-grid"><label>Item name<input name="name" autoFocus placeholder="e.g. Vintage Coach bag" required /></label><label>Category<input name="category" placeholder="e.g. Watches, Bags, Shoes" /></label><label>Paid by<select name="paidBy" defaultValue="Caroline"><option>Caroline</option><option>Ben</option></select></label><label>SKU or model number<input name="model" placeholder="Optional" /></label><label>Purchase date<input name="boughtOn" type="date" defaultValue={localDate()} required /></label><label>Purchase price<input name="cost" type="number" min="0" step="0.01" placeholder="0.00" required /></label><label>Inbound shipping<input name="inbound" type="number" min="0" step="0.01" defaultValue="0" required /></label><label>Planned list price<input name="listPrice" type="number" min="0" step="0.01" placeholder="0.00" /></label><label>USPS tracking number<input name="tracking" placeholder="Optional" /></label><label className="full">Notes<input name="notes" placeholder="Condition, color, storage location…" /></label></div><div className="modal-actions"><button type="button" className="text-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit">Add item</button></div></form></div>; }
