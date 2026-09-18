import { DomainError } from '../errors';
import { addBreakdowns, estimateCharges, type ChargeableTrade } from '../trading/charges';
import type { ChargeBreakdown, TradingSettingsRecord } from '../trading/types';
import { calendarDaysTo } from './black-scholes';
import { fmt } from './payoff';
import { LAB_DISCLAIMER, MARGIN_DISCLAIMER, type FuturesCalculation, type FuturesInput, type RolloverEstimate } from './types';

/*
 * The futures calculator.
 *
 * Everything here is arithmetic the user could do on paper, laid out so the pieces that
 * usually get forgotten — the basis, the cost of rolling, the charges on both legs — are
 * visible next to the headline notional.
 *
 * Charges come from the Phase 11 statutory engine, so a figure here matches what the journal
 * will later show for the same trade. Margin does not: see MARGIN_DISCLAIMER.
 */

const DEFAULT_MARGIN_PERCENT = '12';

const num = (value: string, field: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw DomainError.validation('LAB_INVALID_NUMBER', `${field} must be a number`, { value });
  return parsed;
};

/** A synthetic fill the charges engine can price. Never persisted. */
function fill(id: string, input: FuturesInput, side: 'BUY' | 'SELL', price: number, quantity: number): ChargeableTrade {
  return {
    id,
    date: input.date,
    broker: 'estimate',
    segment: input.segment,
    exchange: input.exchange,
    side,
    amount: fmt(Math.abs(price * quantity)),
    underlying: input.underlying,
    orderId: id,
  };
}

function chargesFor(fills: ChargeableTrade[], settings: TradingSettingsRecord | null): ChargeBreakdown {
  const map = estimateCharges(fills, settings);
  return addBreakdowns(fills.map((f) => map.get(f.id)!));
}

/**
 * Notional, margin, MTM, basis and the cost of rolling a futures position.
 *
 * Basis is annualised on ACT/365 so a 40-point basis with 10 days to run can be compared with
 * one that has 40 days to run — that ratio is the implied cost of carry, and a long way from
 * the repo rate usually means a dividend or a borrow cost is in the price.
 */
export function calculateFutures(input: FuturesInput, settings: TradingSettingsRecord | null = null): FuturesCalculation {
  if (!Number.isInteger(input.lots) || input.lots < 1) throw DomainError.validation('LAB_INVALID_LOTS', 'Lots must be a whole number of at least 1');
  if (!Number.isInteger(input.lotSize) || input.lotSize < 1) {
    throw DomainError.validation('LAB_INVALID_LOT_SIZE', 'Lot size must be a whole number of at least 1');
  }
  const futuresPrice = num(input.futuresPrice, 'futuresPrice');
  const spot = num(input.spot, 'spot');
  if (futuresPrice <= 0 || spot <= 0) throw DomainError.validation('LAB_INVALID_PRICE', 'Prices must be above zero');

  const quantity = input.lots * input.lotSize;
  const direction = input.side === 'BUY' ? 1 : -1;
  const notional = futuresPrice * quantity;
  const marginPercent = num(input.marginPercentOfNotional || DEFAULT_MARGIN_PERCENT, 'marginPercentOfNotional') / 100;
  const marginTotal = notional * marginPercent;

  const mark = input.markPrice === null || input.markPrice === '' ? null : num(input.markPrice, 'markPrice');
  const basis = futuresPrice - spot;
  const days = input.expiry ? calendarDaysTo(input.date, input.expiry) : null;
  const annualisedBasis = days !== null && days > 0 ? (basis / spot) * (365 / days) * 100 : null;

  const roundTripCharges = chargesFor(
    [fill('open', input, input.side, futuresPrice, quantity), fill('close', input, input.side === 'BUY' ? 'SELL' : 'BUY', mark ?? futuresPrice, quantity)],
    settings,
  );

  let rollover: RolloverEstimate | null = null;
  if (input.rollover) {
    const nearPrice = num(input.rollover.nearPrice, 'rollover.nearPrice');
    const farPrice = num(input.rollover.farPrice, 'rollover.farPrice');
    const spread = farPrice - nearPrice;
    // Rolling a long means selling the near contract and buying the far one, so a far contract
    // trading above the near one costs money. A short position is the mirror image.
    const closeSide = input.side === 'BUY' ? 'SELL' : 'BUY';
    const openSide = input.side;
    const charges = chargesFor(
      [fill('roll-close', input, closeSide, nearPrice, quantity), fill('roll-open', input, openSide, farPrice, quantity)],
      settings,
    );
    const spreadCost = spread * quantity * direction;
    rollover = {
      nearPrice: fmt(nearPrice),
      farPrice: fmt(farPrice),
      spread: fmt(spread),
      spreadCost: fmt(spreadCost),
      charges,
      total: fmt(spreadCost + Number(charges.total)),
    };
  }

  return {
    underlying: input.underlying,
    lots: input.lots,
    lotSize: input.lotSize,
    quantity,
    futuresPrice: fmt(futuresPrice),
    spot: fmt(spot),
    notional: fmt(notional),
    mtmPerPoint: fmt(quantity * direction),
    mtm: mark === null ? null : fmt((mark - futuresPrice) * quantity * direction),
    margin: {
      total: fmt(marginTotal),
      premiumDebit: '0.00',
      shortLegMargin: fmt(marginTotal),
      hedgeCredit: '0.00',
      shortNotional: fmt(notional),
      method: `${fmt(marginPercent * 100)}% of the ${fmt(notional)} notional. Index futures usually sit near 12%, stock futures higher.`,
      disclaimer: MARGIN_DISCLAIMER,
    },
    basis: fmt(basis),
    basisPercent: fmt((basis / spot) * 100, 4),
    annualisedBasisPercent: annualisedBasis === null ? null : fmt(annualisedBasis, 4),
    daysToExpiry: days,
    rollover,
    roundTripCharges,
    disclaimer: LAB_DISCLAIMER,
  };
}
