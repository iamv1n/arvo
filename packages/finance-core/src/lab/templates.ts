import { DomainError } from '../errors';
import { optionPrice, yearsBetween } from './black-scholes';
import { fmt } from './payoff';
import { DEFAULT_ASSUMPTIONS, type MarketAssumptions, type StrategyLeg } from './types';

/*
 * Prebuilt structures.
 *
 * A template is a recipe, not a recommendation: it says which legs make up a named structure
 * and where their strikes sit relative to the money, so the user can see the shape and then
 * change every number. Strikes are expressed in strike steps from the at-the-money strike
 * (NIFTY trades in 50-point strikes, BANKNIFTY in 100) because that is how a trader thinks
 * about width.
 *
 * Premiums are filled in from Black–Scholes at the assumptions given, and are clearly
 * theoretical: nobody will get those fills. They exist so the payoff chart has something to
 * draw the moment a template is picked, and the user replaces them with real quotes.
 */

export type TemplateId =
  | 'LONG_STRADDLE'
  | 'SHORT_STRADDLE'
  | 'LONG_STRANGLE'
  | 'SHORT_STRANGLE'
  | 'IRON_CONDOR'
  | 'IRON_BUTTERFLY'
  | 'BULL_CALL_SPREAD'
  | 'BEAR_CALL_SPREAD'
  | 'BULL_PUT_SPREAD'
  | 'BEAR_PUT_SPREAD'
  | 'CALENDAR_CALL'
  | 'COVERED_CALL'
  | 'PROTECTIVE_PUT';

export type TemplateOutlook = 'DIRECTIONAL_UP' | 'DIRECTIONAL_DOWN' | 'RANGE_BOUND' | 'VOLATILITY_UP' | 'HEDGE';

/** One leg of a recipe, before strikes and premiums are resolved. */
interface TemplateLeg {
  kind: 'CALL' | 'PUT' | 'UNDERLYING';
  action: 'BUY' | 'SELL';
  /** Strike steps away from the at-the-money strike. */
  offsetSteps: number;
  /** Lots as a multiple of the base quantity. */
  lotsMultiple: number;
  /** True when the leg belongs to the far expiry rather than the near one. */
  farExpiry?: boolean;
  label: string;
}

export interface StrategyTemplate {
  id: TemplateId;
  name: string;
  outlook: TemplateOutlook;
  /** One line the picker shows. Descriptive; it never says to place the trade. */
  summary: string;
  /** True when the structure needs a second, later expiry. */
  needsFarExpiry: boolean;
  /** The slug of the library explainer for this structure. */
  libraryslug: string;
  legs: TemplateLeg[];
}

export const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    id: 'LONG_STRADDLE',
    name: 'Long straddle',
    outlook: 'VOLATILITY_UP',
    summary: 'Buy the at-the-money call and put. Profits if the underlying moves far in either direction; loses if it sits still.',
    needsFarExpiry: false,
    libraryslug: 'long-straddle',
    legs: [
      { kind: 'CALL', action: 'BUY', offsetSteps: 0, lotsMultiple: 1, label: 'Long ATM call' },
      { kind: 'PUT', action: 'BUY', offsetSteps: 0, lotsMultiple: 1, label: 'Long ATM put' },
    ],
  },
  {
    id: 'SHORT_STRADDLE',
    name: 'Short straddle',
    outlook: 'RANGE_BOUND',
    summary: 'Sell the at-the-money call and put. Collects premium if the underlying stays put; the loss is unlimited on the upside.',
    needsFarExpiry: false,
    libraryslug: 'short-straddle',
    legs: [
      { kind: 'CALL', action: 'SELL', offsetSteps: 0, lotsMultiple: 1, label: 'Short ATM call' },
      { kind: 'PUT', action: 'SELL', offsetSteps: 0, lotsMultiple: 1, label: 'Short ATM put' },
    ],
  },
  {
    id: 'LONG_STRANGLE',
    name: 'Long strangle',
    outlook: 'VOLATILITY_UP',
    summary: 'Buy an out-of-the-money call and put. Cheaper than a straddle, and needs a bigger move to pay.',
    needsFarExpiry: false,
    libraryslug: 'long-strangle',
    legs: [
      { kind: 'CALL', action: 'BUY', offsetSteps: 2, lotsMultiple: 1, label: 'Long OTM call' },
      { kind: 'PUT', action: 'BUY', offsetSteps: -2, lotsMultiple: 1, label: 'Long OTM put' },
    ],
  },
  {
    id: 'SHORT_STRANGLE',
    name: 'Short strangle',
    outlook: 'RANGE_BOUND',
    summary: 'Sell an out-of-the-money call and put. A wider profit zone than a short straddle, still with unlimited risk.',
    needsFarExpiry: false,
    libraryslug: 'short-strangle',
    legs: [
      { kind: 'CALL', action: 'SELL', offsetSteps: 2, lotsMultiple: 1, label: 'Short OTM call' },
      { kind: 'PUT', action: 'SELL', offsetSteps: -2, lotsMultiple: 1, label: 'Short OTM put' },
    ],
  },
  {
    id: 'IRON_CONDOR',
    name: 'Iron condor',
    outlook: 'RANGE_BOUND',
    summary: 'A short strangle with bought wings further out. Defined risk on both sides, smaller credit.',
    needsFarExpiry: false,
    libraryslug: 'iron-condor',
    legs: [
      { kind: 'PUT', action: 'BUY', offsetSteps: -4, lotsMultiple: 1, label: 'Long put wing' },
      { kind: 'PUT', action: 'SELL', offsetSteps: -2, lotsMultiple: 1, label: 'Short put' },
      { kind: 'CALL', action: 'SELL', offsetSteps: 2, lotsMultiple: 1, label: 'Short call' },
      { kind: 'CALL', action: 'BUY', offsetSteps: 4, lotsMultiple: 1, label: 'Long call wing' },
    ],
  },
  {
    id: 'IRON_BUTTERFLY',
    name: 'Iron butterfly',
    outlook: 'RANGE_BOUND',
    summary: 'A short straddle with bought wings. The largest credit of the range structures, and the narrowest profit zone.',
    needsFarExpiry: false,
    libraryslug: 'iron-butterfly',
    legs: [
      { kind: 'PUT', action: 'BUY', offsetSteps: -3, lotsMultiple: 1, label: 'Long put wing' },
      { kind: 'PUT', action: 'SELL', offsetSteps: 0, lotsMultiple: 1, label: 'Short ATM put' },
      { kind: 'CALL', action: 'SELL', offsetSteps: 0, lotsMultiple: 1, label: 'Short ATM call' },
      { kind: 'CALL', action: 'BUY', offsetSteps: 3, lotsMultiple: 1, label: 'Long call wing' },
    ],
  },
  {
    id: 'BULL_CALL_SPREAD',
    name: 'Bull call spread',
    outlook: 'DIRECTIONAL_UP',
    summary: 'Buy a call, sell a higher one. A debit structure with both the gain and the loss capped.',
    needsFarExpiry: false,
    libraryslug: 'bull-call-spread',
    legs: [
      { kind: 'CALL', action: 'BUY', offsetSteps: 0, lotsMultiple: 1, label: 'Long call' },
      { kind: 'CALL', action: 'SELL', offsetSteps: 3, lotsMultiple: 1, label: 'Short call' },
    ],
  },
  {
    id: 'BEAR_CALL_SPREAD',
    name: 'Bear call spread',
    outlook: 'DIRECTIONAL_DOWN',
    summary: 'Sell a call, buy a higher one. A credit structure that pays if the underlying stays below the short strike.',
    needsFarExpiry: false,
    libraryslug: 'bear-call-spread',
    legs: [
      { kind: 'CALL', action: 'SELL', offsetSteps: 1, lotsMultiple: 1, label: 'Short call' },
      { kind: 'CALL', action: 'BUY', offsetSteps: 4, lotsMultiple: 1, label: 'Long call' },
    ],
  },
  {
    id: 'BULL_PUT_SPREAD',
    name: 'Bull put spread',
    outlook: 'DIRECTIONAL_UP',
    summary: 'Sell a put, buy a lower one. A credit structure that pays if the underlying stays above the short strike.',
    needsFarExpiry: false,
    libraryslug: 'bull-put-spread',
    legs: [
      { kind: 'PUT', action: 'SELL', offsetSteps: -1, lotsMultiple: 1, label: 'Short put' },
      { kind: 'PUT', action: 'BUY', offsetSteps: -4, lotsMultiple: 1, label: 'Long put' },
    ],
  },
  {
    id: 'BEAR_PUT_SPREAD',
    name: 'Bear put spread',
    outlook: 'DIRECTIONAL_DOWN',
    summary: 'Buy a put, sell a lower one. A debit structure with both the gain and the loss capped.',
    needsFarExpiry: false,
    libraryslug: 'bear-put-spread',
    legs: [
      { kind: 'PUT', action: 'BUY', offsetSteps: 0, lotsMultiple: 1, label: 'Long put' },
      { kind: 'PUT', action: 'SELL', offsetSteps: -3, lotsMultiple: 1, label: 'Short put' },
    ],
  },
  {
    id: 'CALENDAR_CALL',
    name: 'Call calendar',
    outlook: 'RANGE_BOUND',
    summary: 'Sell a near-dated call and buy the same strike further out. Profits from the near leg decaying faster.',
    needsFarExpiry: true,
    libraryslug: 'call-calendar',
    legs: [
      { kind: 'CALL', action: 'SELL', offsetSteps: 0, lotsMultiple: 1, label: 'Short near call' },
      { kind: 'CALL', action: 'BUY', offsetSteps: 0, lotsMultiple: 1, farExpiry: true, label: 'Long far call' },
    ],
  },
  {
    id: 'COVERED_CALL',
    name: 'Covered call',
    outlook: 'HEDGE',
    summary: 'Hold the underlying and sell a call against it. Income in exchange for capping the upside.',
    needsFarExpiry: false,
    libraryslug: 'covered-call',
    legs: [
      { kind: 'UNDERLYING', action: 'BUY', offsetSteps: 0, lotsMultiple: 1, label: 'Long underlying' },
      { kind: 'CALL', action: 'SELL', offsetSteps: 2, lotsMultiple: 1, label: 'Short call' },
    ],
  },
  {
    id: 'PROTECTIVE_PUT',
    name: 'Protective put',
    outlook: 'HEDGE',
    summary: 'Hold the underlying and buy a put as insurance. The cost is the premium; the floor is the strike.',
    needsFarExpiry: false,
    libraryslug: 'protective-put',
    legs: [
      { kind: 'UNDERLYING', action: 'BUY', offsetSteps: 0, lotsMultiple: 1, label: 'Long underlying' },
      { kind: 'PUT', action: 'BUY', offsetSteps: -2, lotsMultiple: 1, label: 'Long protective put' },
    ],
  },
];

export interface TemplateRequest {
  template: TemplateId;
  spot: string;
  /** Distance between adjacent strikes, e.g. 50 for NIFTY. */
  strikeStep: string;
  lotSize: number;
  lots: number;
  /** The near expiry, YYYY-MM-DD. */
  expiry: string;
  /** The later expiry; required for a calendar. */
  farExpiry: string | null;
  asOf: string;
  impliedVolatilityPercent: string;
  riskFreeRatePercent?: string;
  dividendYieldPercent?: string;
}

export interface TemplateResult {
  template: StrategyTemplate;
  legs: StrategyLeg[];
  assumptions: MarketAssumptions;
  /** Says out loud that the premiums are model prices. */
  note: string;
}

export function findTemplate(id: string): StrategyTemplate | undefined {
  return STRATEGY_TEMPLATES.find((template) => template.id === id);
}

/** Builds the legs of a named structure, priced theoretically so the chart has a starting point. */
export function buildTemplate(request: TemplateRequest): TemplateResult {
  const template = findTemplate(request.template);
  if (!template) throw DomainError.validation('LAB_UNKNOWN_TEMPLATE', `No template called "${request.template}"`);
  if (template.needsFarExpiry && !request.farExpiry) {
    throw DomainError.validation('LAB_FAR_EXPIRY_REQUIRED', `${template.name} needs a second, later expiry`);
  }
  const spot = Number(request.spot);
  const step = Number(request.strikeStep);
  if (!Number.isFinite(spot) || spot <= 0) throw DomainError.validation('LAB_INVALID_SPOT', 'Spot must be above zero');
  if (!Number.isFinite(step) || step <= 0) throw DomainError.validation('LAB_INVALID_STRIKE_STEP', 'The strike step must be above zero');
  if (!Number.isInteger(request.lots) || request.lots < 1) throw DomainError.validation('LAB_INVALID_LOTS', 'Lots must be a whole number of at least 1');
  if (!Number.isInteger(request.lotSize) || request.lotSize < 1) {
    throw DomainError.validation('LAB_INVALID_LOT_SIZE', 'Lot size must be a whole number of at least 1');
  }

  const assumptions: MarketAssumptions = {
    spot: fmt(spot),
    asOf: request.asOf,
    riskFreeRatePercent: request.riskFreeRatePercent ?? DEFAULT_ASSUMPTIONS.riskFreeRatePercent,
    dividendYieldPercent: request.dividendYieldPercent ?? DEFAULT_ASSUMPTIONS.dividendYieldPercent,
    impliedVolatilityPercent: request.impliedVolatilityPercent,
  };
  const rate = Number(assumptions.riskFreeRatePercent) / 100;
  const dividendYield = Number(assumptions.dividendYieldPercent) / 100;
  const volatility = Number(assumptions.impliedVolatilityPercent) / 100;
  // Round spot to the nearest tradeable strike: that is the at-the-money contract.
  const atTheMoney = Math.round(spot / step) * step;

  const legs = template.legs.map((leg): StrategyLeg => {
    const expiry = leg.farExpiry ? (request.farExpiry as string) : request.expiry;
    if (leg.kind === 'UNDERLYING') {
      return {
        kind: 'UNDERLYING',
        action: leg.action,
        lots: request.lots * leg.lotsMultiple,
        lotSize: request.lotSize,
        strike: null,
        premium: fmt(spot),
        expiry: null,
        impliedVolatilityPercent: null,
        label: leg.label,
      };
    }
    const strike = atTheMoney + leg.offsetSteps * step;
    const premium = optionPrice({
      spot,
      strike,
      timeYears: yearsBetween(request.asOf, expiry),
      rate,
      dividendYield,
      volatility,
      right: leg.kind === 'CALL' ? 'CE' : 'PE',
    });
    return {
      kind: leg.kind,
      action: leg.action,
      lots: request.lots * leg.lotsMultiple,
      lotSize: request.lotSize,
      strike: fmt(strike),
      premium: fmt(premium),
      expiry,
      impliedVolatilityPercent: assumptions.impliedVolatilityPercent,
      label: leg.label,
    };
  });

  return {
    template,
    legs,
    assumptions,
    note: 'The premiums are Black–Scholes prices at the volatility you gave, not quotes. Replace them with the real bid and ask before you read anything into the numbers.',
  };
}
