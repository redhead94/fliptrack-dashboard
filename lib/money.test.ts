import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { earningsFor, estimatedProfitFor, feeFor, feesFor, grossFor, profitFor, round2, shippingDiscountFor } from "./money.ts";

describe("round2", () => {
  it("rounds to two decimal places", () => {
    assert.equal(round2(1.234), 1.23);
    assert.equal(round2(1.999), 2);
    assert.equal(round2(40.8875), 40.89);
    assert.equal(round2(0), 0);
  });
});

describe("feeFor", () => {
  it("charges no fee for a zero sale", () => {
    assert.equal(feeFor(0), 0);
  });
  it("charges the $2.95 minimum fee for sales under $15", () => {
    assert.equal(feeFor(14.99), 2.95);
    assert.equal(feeFor(1), 2.95);
  });
  it("charges 20% for sales of $15 or more", () => {
    assert.equal(feeFor(15), 3);
    assert.equal(feeFor(100), 20);
    assert.equal(feeFor(49), 9.8);
  });
});

describe("earningsFor", () => {
  it("subtracts the fee and shipping discount from the sale price", () => {
    assert.equal(earningsFor({ status: "Sold", cost: 0, inbound: 0, soldPrice: 100 }), 80);
    assert.equal(earningsFor({ status: "Sold", cost: 0, inbound: 0, soldPrice: 10 }), 7.05);
    assert.equal(earningsFor({ status: "Sold", cost: 0, inbound: 0, soldPrice: 100, poshShippingDiscount: 5 }), 75);
  });
  it("prefers an explicitly recorded payout", () => {
    assert.equal(earningsFor({ status: "Sold", cost: 0, inbound: 0, soldPrice: 100, poshEarnings: 81 }), 81);
  });
  it("is zero before a sale", () => {
    assert.equal(earningsFor({ status: "Listed", cost: 10, inbound: 2 }), 0);
  });
});

describe("grossFor", () => {
  it("uses the sale price when present", () => {
    assert.equal(grossFor({ status: "Sold", cost: 0, inbound: 0, soldPrice: 49 }), 49);
  });
  it("derives the sale price from a payout above the $11.80 threshold", () => {
    assert.equal(grossFor({ status: "Sold", cost: 0, inbound: 0, poshEarnings: 32.71 }), 40.89);
  });
  it("adds the $2.95 minimum fee to payouts at or below the threshold", () => {
    assert.equal(grossFor({ status: "Sold", cost: 0, inbound: 0, poshEarnings: 11.8 }), 14.75);
    assert.equal(grossFor({ status: "Sold", cost: 0, inbound: 0, poshEarnings: 11.79 }), 14.74);
  });
  it("is zero with no sale data", () => {
    assert.equal(grossFor({ status: "Listed", cost: 10, inbound: 2 }), 0);
  });
});

describe("feesFor", () => {
  it("is the difference between gross and earnings", () => {
    assert.equal(feesFor({ status: "Sold", cost: 0, inbound: 0, soldPrice: 100 }), 20);
    assert.equal(feesFor({ status: "Sold", cost: 0, inbound: 0, poshEarnings: 10 }), 2.95);
    assert.equal(feesFor({ status: "Sold", cost: 0, inbound: 0, soldPrice: 49, poshEarnings: 32.71 }), 16.29);
  });
  it("never goes negative", () => {
    assert.equal(feesFor({ status: "Sold", cost: 0, inbound: 0, soldPrice: 49, poshEarnings: 60 }), 0);
  });
});

describe("shippingDiscountFor", () => {
  it("defaults to zero and rounds when present", () => {
    assert.equal(shippingDiscountFor({ status: "Sold", cost: 0, inbound: 0, soldPrice: 49 }), 0);
    assert.equal(shippingDiscountFor({ status: "Sold", cost: 0, inbound: 0, soldPrice: 49, poshShippingDiscount: 5.555 }), 5.56);
  });
});

describe("profitFor", () => {
  it("subtracts cost and inbound shipping from earnings for sold items", () => {
    assert.equal(profitFor({ status: "Sold", cost: 13.56, inbound: 2, soldPrice: 50 }), 24.44);
  });
  it("is zero when the item is not sold yet", () => {
    assert.equal(profitFor({ status: "Listed", cost: 13.56, inbound: 2, soldPrice: 50 }), 0);
  });
  it("is zero for a sold item with no sale data", () => {
    assert.equal(profitFor({ status: "Sold", cost: 13.56, inbound: 2 }), 0);
  });
});

describe("estimatedProfitFor", () => {
  it("projects profit at the current list price using the Poshmark fee", () => {
    assert.equal(estimatedProfitFor({ status: "Listed", cost: 13.56, inbound: 2, listPrice: 50 }), 24.44);
  });
  it("uses the $2.95 minimum fee for list prices under $15", () => {
    assert.equal(estimatedProfitFor({ status: "Listed", cost: 3, inbound: 0, listPrice: 10 }), 4.05);
  });
  it("subtracts a recorded shipping discount", () => {
    assert.equal(estimatedProfitFor({ status: "Listed", cost: 13.56, inbound: 2, listPrice: 50, poshShippingDiscount: 4 }), 20.44);
  });
  it("is null when there is no list price", () => {
    assert.equal(estimatedProfitFor({ status: "Listed", cost: 13.56, inbound: 2, listPrice: 0 }), null);
    assert.equal(estimatedProfitFor({ status: "Bought", cost: 13.56, inbound: 2 }), null);
  });
  it("is null once the item is sold", () => {
    assert.equal(estimatedProfitFor({ status: "Sold", cost: 13.56, inbound: 2, listPrice: 50, soldPrice: 49 }), null);
  });
  it("can be negative", () => {
    assert.equal(estimatedProfitFor({ status: "Listed", cost: 80, inbound: 5, listPrice: 50 }), -45);
  });
});
