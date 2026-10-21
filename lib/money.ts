export type MoneyItem = {
  status: string;
  cost: number;
  inbound: number;
  listPrice?: number;
  soldPrice?: number;
  poshEarnings?: number;
  poshShippingDiscount?: number;
  salePlatform?: "Poshmark" | "eBay" | "Other";
};

export const round2 = (value: number) => Math.round(value * 100) / 100;

export const feeFor = (sale: number) => round2(!sale ? 0 : sale < 15 ? 2.95 : sale * 0.2);

export const feeForPlatform = (sale: number, platform?: MoneyItem["salePlatform"]) => {
  if (platform === "eBay") return round2(sale * 0.1325);
  if (platform === "Other") return 0;
  return feeFor(sale);
};

export const shippingDiscountFor = (item: MoneyItem) => round2(item.poshShippingDiscount ?? 0);

export const earningsFor = (item: MoneyItem) => round2(item.poshEarnings ?? (item.soldPrice != null ? item.soldPrice - feeForPlatform(item.soldPrice, item.salePlatform) - shippingDiscountFor(item) : 0));

export const grossFor = (item: MoneyItem) => {
  if (item.soldPrice != null) return round2(item.soldPrice);
  const payout = item.poshEarnings;
  if (payout == null) return 0;
  if (item.salePlatform === "eBay") return round2(payout / 0.8675);
  if (item.salePlatform === "Other") return payout;
  return round2(payout <= 11.8 ? payout + 2.95 : payout / 0.8);
};

export const feesFor = (item: MoneyItem) => round2(Math.max(0, grossFor(item) - earningsFor(item)));

export const profitFor = (item: MoneyItem) => item.status === "Sold" && (item.soldPrice != null || item.poshEarnings != null) ? round2(earningsFor(item) - item.cost - item.inbound) : 0;

export const estimatedProfitFor = (item: MoneyItem) => {
  if (item.status === "Sold" || item.listPrice == null || item.listPrice <= 0) return null;
  const payout = item.listPrice - feeFor(item.listPrice) - shippingDiscountFor(item);
  return round2(payout - item.cost - item.inbound);
};
