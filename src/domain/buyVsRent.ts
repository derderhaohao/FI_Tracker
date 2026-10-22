/**
 * Buy vs. rent (LAB-8). Simulated month by month, reported yearly in today's TWD.
 * The buyer pays the down payment and buying costs, then the mortgage and holding
 * costs. The renter invests the same up-front cash; each month whoever pays less
 * invests the difference at the same return. Net worth counts the home after
 * selling costs, minus the mortgage, plus investments.
 */

export interface BuyVsRentInput {
  homePrice: number;
  downPaymentRate: number;
  /** Buying costs (契稅, 代書, agent), share of price. */
  buyingCostRate: number;
  /** Selling costs at the end (agent, 土增稅 estimate), share of value. */
  sellingCostRate: number;
  mortgageRate: number;
  mortgageYears: number;
  /** Property taxes, maintenance and insurance per year, share of home value. */
  holdingCostRate: number;
  homeAppreciation: number;
  monthlyRent: number;
  rentGrowth: number;
  /** Nominal return on invested savings, after fees. */
  investmentReturn: number;
  inflation: number;
  years: number;
}

export interface BuyVsRentRow {
  year: number;
  homeValue: number;
  mortgageBalance: number;
  buyerPortfolio: number;
  renterPortfolio: number;
  /** Real (today's TWD). */
  buyerNetWorth: number;
  renterNetWorth: number;
  /** Real yearly cash cost of owning (mortgage + holding) and of renting. */
  ownerCost: number;
  rentCost: number;
}

export interface BuyVsRentResult {
  rows: BuyVsRentRow[];
  monthlyPayment: number;
  upfront: number;
  /** First year buying is ahead; undefined when renting stays ahead. */
  breakEvenYear?: number;
  /** Buyer minus renter net worth at the end, today's TWD. */
  finalDifference: number;
}

export function mortgagePayment(principal: number, annualRate: number, years: number): number {
  const n = Math.round(years * 12);
  if (n <= 0 || principal <= 0) return 0;
  const r = annualRate / 12;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

const monthly = (annual: number) => Math.pow(1 + annual, 1 / 12) - 1;

export function buyVsRent(i: BuyVsRentInput): BuyVsRentResult {
  const principal = i.homePrice * (1 - i.downPaymentRate);
  const upfront = i.homePrice * (i.downPaymentRate + i.buyingCostRate);
  const payment = mortgagePayment(principal, i.mortgageRate, i.mortgageYears);
  const gInvest = monthly(i.investmentReturn);
  const gHome = monthly(i.homeAppreciation);
  const termMonths = Math.round(i.mortgageYears * 12);

  let home = i.homePrice;
  let balance = principal;
  let buyer = 0;
  let renter = upfront;
  let rent = i.monthlyRent;
  const rows: BuyVsRentRow[] = [];
  const record = (year: number, ownerCost: number, rentCost: number) => {
    const deflator = Math.pow(1 + i.inflation, year);
    rows.push({
      year,
      homeValue: home,
      mortgageBalance: balance,
      buyerPortfolio: buyer,
      renterPortfolio: renter,
      buyerNetWorth: (home * (1 - i.sellingCostRate) - balance + buyer) / deflator,
      renterNetWorth: renter / deflator,
      ownerCost: ownerCost / deflator,
      rentCost: rentCost / deflator,
    });
  };
  record(0, 0, 0);

  for (let year = 1; year <= i.years; year++) {
    let ownerCost = 0;
    let rentCost = 0;
    for (let m = 0; m < 12; m++) {
      const month = (year - 1) * 12 + m;
      let mortgage = 0;
      if (month < termMonths && balance > 0) {
        const interest = balance * (i.mortgageRate / 12);
        mortgage = Math.min(payment, balance + interest);
        balance = Math.max(0, balance + interest - mortgage);
      }
      const owner = mortgage + (home * i.holdingCostRate) / 12;
      ownerCost += owner;
      rentCost += rent;
      buyer *= 1 + gInvest;
      renter *= 1 + gInvest;
      if (owner > rent) renter += owner - rent;
      else buyer += rent - owner;
      home *= 1 + gHome;
    }
    rent *= 1 + i.rentGrowth;
    record(year, ownerCost, rentCost);
  }

  const breakEven = rows.find((r) => r.year > 0 && r.buyerNetWorth >= r.renterNetWorth);
  const last = rows.at(-1)!;
  return {
    rows,
    monthlyPayment: payment,
    upfront,
    breakEvenYear: breakEven?.year,
    finalDifference: last.buyerNetWorth - last.renterNetWorth,
  };
}

/** Starting values for a Taiwan flat; every field is editable in the Lab. */
export const DEFAULT_BUY_VS_RENT: BuyVsRentInput = {
  homePrice: 15_000_000,
  downPaymentRate: 0.2,
  buyingCostRate: 0.02,
  sellingCostRate: 0.04,
  mortgageRate: 0.022,
  mortgageYears: 30,
  holdingCostRate: 0.006,
  homeAppreciation: 0.02,
  monthlyRent: 30_000,
  rentGrowth: 0.015,
  investmentReturn: 0.06,
  inflation: 0.02,
  years: 30,
};
