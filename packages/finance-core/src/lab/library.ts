import { LAB_DISCLAIMER } from './types';

/*
 * The strategy library.
 *
 * Explainers, not recommendations. Every entry has the same four parts — how it works, when it
 * fails, what it costs, and a worked example with real Indian numbers — because "when it fails"
 * is the part the internet leaves out, and it is the part that decides whether someone loses
 * money.
 *
 * The content lives in the repository as markdown strings rather than as .md files on disk so
 * it ships with the compiled package, is typechecked against the slugs the templates reference,
 * and cannot go missing from a Docker image. It is still plain markdown, still reviewed in the
 * diff like prose should be.
 *
 * House style: no "should", no "buy", no price targets, no claims about what works. The numbers
 * in the worked examples are illustrative and rounded, and they say so.
 */

export type LibraryCategory = 'OPTION_STRUCTURE' | 'RISK' | 'METHOD';

export interface LibraryEntry {
  slug: string;
  title: string;
  category: LibraryCategory;
  /** One line for the index. */
  summary: string;
  /** Roughly how long it takes to read. */
  readingMinutes: number;
  /** Template ids this entry explains, so the payoff builder can link to it. */
  templates: string[];
  markdown: string;
}

const entry = (value: LibraryEntry): LibraryEntry => value;

const NIFTY_NOTE =
  '\n\n*Numbers are illustrative, rounded, and use a NIFTY lot of 75. They are not quotes and not a suggestion to trade anything.*\n';

export const LIBRARY: LibraryEntry[] = [
  entry({
    slug: 'long-straddle',
    title: 'Long straddle',
    category: 'OPTION_STRUCTURE',
    summary: 'Buying the at-the-money call and put together: a bet on movement, in either direction.',
    readingMinutes: 4,
    templates: ['LONG_STRADDLE'],
    markdown: `## How it works

You buy the call and the put at the same strike, usually the one nearest the spot price. Whichever way the underlying goes, one leg gains and the other can only lose what you paid for it. Your loss is capped at the total premium; your gain is not capped on the upside and is very large on the downside.

The position is delta-flat at the start and long gamma, long vega, short theta. In plain terms: you do not care which way it moves, you care **how far and how fast**, and every day nothing happens costs you money.

## When it fails

Almost always in the same way: the move happens, and you still lose.

A straddle needs the underlying to travel further than the combined premium before expiry. On a NIFTY weekly that is often 1.5% to 2%, and the index moves that much in a week perhaps one week in four. So the base rate is against you before you start.

The second failure is subtler and costs more. You buy a straddle before an event — a budget, an RBI policy, a result — precisely because everybody expects a move. Everybody expecting a move is *already in the price* as high implied volatility. The event happens, the uncertainty resolves, implied volatility collapses, and both your legs lose value even though the index moved. This is the volatility crush, and it is the single commonest way a correctly-predicted event still loses money.

## What it costs

Two legs in, two legs out: four lots of brokerage, four lots of exchange charges and GST, and STT on the sell side. On a one-lot NIFTY straddle that is roughly ₹120 to ₹200 all in — small against the premium, but it is a real 1–2% headwind on the position.

## Worked example

NIFTY at 24,000. The 24,000 call costs 150 and the 24,000 put costs 140. Total premium 290 a unit, ₹21,750 for one lot of 75.

- Breakevens: 23,710 and 24,290. That is ±1.2%.
- Maximum loss: ₹21,750, if NIFTY expires exactly at 24,000.
- At 24,600 the call is worth 600, the put nothing: ₹22,500 gross, so about ₹750 profit after costs.

Note how far it has to travel — 600 points, 2.5% — to make ₹750 on a ₹21,750 outlay. That asymmetry is the whole argument about whether long options are worth owning.${NIFTY_NOTE}`,
  }),

  entry({
    slug: 'short-straddle',
    title: 'Short straddle',
    category: 'OPTION_STRUCTURE',
    summary: 'Selling the at-the-money call and put: collecting premium, with unlimited risk.',
    readingMinutes: 4,
    templates: ['SHORT_STRADDLE'],
    markdown: `## How it works

The mirror of the long straddle. You sell the at-the-money call and put and keep the premium if the underlying finishes near the strike. Time decay works for you: every day that nothing happens, you make money.

It is short gamma, short vega, long theta. You are being paid to take the risk that the market moves.

## When it fails

It works most of the time and then it does not, and the one time it does not can be larger than every time it did. That is not a reason never to do it; it is the reason position size is the only thing that matters here.

Two specific failures:

**The gap.** Your risk is unlimited on the upside and enormous on the downside, and it arrives overnight when you cannot do anything about it. An index that gaps 4% on a Monday — which has happened more than once — turns a month of collected premium into a multiple of it lost.

**The margin call on the way.** You do not need to be wrong at expiry to be stopped out. As the underlying moves against a short option, the exchange raises the margin it holds. A position that would have been fine at expiry gets closed at the worst moment because the account cannot fund it.

## What it costs

The same four legs of charges as a long straddle, plus the one that people forget: **margin**. A one-lot NIFTY short straddle typically blocks ₹1.5–2 lakh of capital. The return on premium looks wonderful; the return on the capital the exchange actually holds is a much more sober number, and it is the one to judge it by.

## Worked example

NIFTY at 24,000, same premiums as above. You receive 290 a unit, ₹21,750.

- You keep all of it only if NIFTY expires exactly at 24,000.
- Breakevens 23,710 and 24,290: anywhere in between, you keep some.
- At 24,600 you lose 600 − 290 = 310 a unit, ₹23,250. One 2.5% move has wiped out the credit and the same again.
- Margin blocked: roughly ₹1.7 lakh. So the good outcome is about 12% on margin in a week, and the bad one is −14%.

Anyone quoting the first number without the second is selling something.${NIFTY_NOTE}`,
  }),

  entry({
    slug: 'long-strangle',
    title: 'Long strangle',
    category: 'OPTION_STRUCTURE',
    summary: 'A cheaper long straddle with out-of-the-money strikes, needing a bigger move.',
    readingMinutes: 3,
    templates: ['LONG_STRANGLE'],
    markdown: `## How it works

Buy an out-of-the-money call and an out-of-the-money put. Because both are out of the money they are cheaper than the at-the-money pair, so the maximum loss is smaller — but the underlying has to travel further before either is worth anything.

## When it fails

The same volatility crush as the straddle, only worse. Out-of-the-money options are almost entirely time value, so they have proportionally more to lose when implied volatility falls. A strangle bought the day before an event and held through it can lose 40% of its value with the index unchanged.

It also fails quietly: the flat region between the strikes is wide, and the underlying spends most of its time in it.

## What it costs

Four legs of charges, but on much smaller premiums, so charges are a larger *percentage* of the position. On a ₹5,000 strangle, ₹150 of costs is 3%.

## Worked example

NIFTY at 24,000, 10 days out. The 24,300 call costs 60 and the 23,700 put costs 55. Total 115 a unit, ₹8,625 for a lot.

- Breakevens: 23,585 and 24,415, about ±1.7%.
- Maximum loss: ₹8,625, anywhere between 23,700 and 24,300 at expiry — a 600-point window the index very often finishes inside.
- The cheapness is the trap: it costs less because it is less likely to pay.${NIFTY_NOTE}`,
  }),

  entry({
    slug: 'short-strangle',
    title: 'Short strangle',
    category: 'OPTION_STRUCTURE',
    summary: 'Selling out-of-the-money calls and puts: a wider profit zone, still unlimited risk.',
    readingMinutes: 3,
    templates: ['SHORT_STRANGLE'],
    markdown: `## How it works

Sell an out-of-the-money call and an out-of-the-money put. You keep the premium as long as the underlying finishes between the two strikes, which is a wide band and happens often.

## When it fails

The high win rate is the danger, not the attraction. A structure that wins 85% of the time and loses five times the credit on the other 15% is a losing strategy, and it takes a long time to find that out. People conclude they have an edge after twenty profitable weeks; the twenty-first pays for all of them.

The specific failure mode is a **trending market**, not a volatile one. A short strangle survives a violent market that goes nowhere. It does not survive a market that grinds 1% a day in one direction for a fortnight, because the short leg goes deep in the money and the margin requirement grows the whole way.

## What it costs

Four legs of charges and a substantial margin block — usually ₹1.2–1.6 lakh for a one-lot NIFTY strangle. Again: judge the return against the margin, not against the credit.

## Worked example

NIFTY at 24,000. Sell the 24,300 call for 60 and the 23,700 put for 55: credit 115 a unit, ₹8,625.

- Full profit anywhere between 23,700 and 24,300 at expiry.
- Breakevens 23,585 and 24,415.
- At 24,800 you lose 500 − 115 = 385 a unit, ₹28,875 — more than three times the credit, from a 3.3% move.

The distribution is the point: small wins, often; large losses, rarely.${NIFTY_NOTE}`,
  }),

  entry({
    slug: 'iron-condor',
    title: 'Iron condor',
    category: 'OPTION_STRUCTURE',
    summary: 'A short strangle with bought wings: defined risk on both sides, a smaller credit.',
    readingMinutes: 4,
    templates: ['IRON_CONDOR'],
    markdown: `## How it works

Four legs: sell an out-of-the-money put and call, and buy a further out-of-the-money put and call as wings. The wings cost part of the credit and in exchange cap the loss on both sides. The maximum loss is the width of one wing minus the net credit, and you cannot lose more than that however far the market moves.

This is the structure to reach for if a short strangle appeals but the tail risk does not.

## When it fails

**The risk-reward is brutal even when it works.** A typical condor collects a credit worth a quarter or a fifth of the wing width. You are risking four rupees to make one. That is fine if the probability is genuinely on your side, and it very often is not by as much as the payoff diagram suggests.

**Adjustments eat the edge.** Everyone plans to "adjust" when a side is threatened. Each adjustment is two more legs of charges and usually locks in part of the loss. A condor adjusted three times has spent much of its maximum profit on transaction costs.

**Both sides can be hit in one expiry** in a whipsaw week, which the payoff diagram — drawn at expiry only — does not show.

## What it costs

Eight legs of charges over the life of the trade if you hold to expiry and the wings expire worthless; more if you close. On a structure whose maximum profit might be ₹6,000, ₹300 of charges is 5% of the best case. Margin is much smaller than a strangle, typically ₹40,000–₹60,000 for a one-lot NIFTY condor, which is the real benefit of the wings.

## Worked example

NIFTY at 24,000, 40 days out. Sell the 23,900 put and the 24,100 call, buy the 23,800 put and the 24,200 call.

- Net credit: about 89 a unit, ₹6,655 for one lot.
- Maximum profit: ₹6,655, if NIFTY finishes between 23,900 and 24,100.
- Maximum loss: (100 − 89) × 75 = ₹825, if it finishes outside 23,800 or 24,200.
- Breakevens: 23,811 and 24,189.

Read that again: the profit zone is 200 points wide and the index has 40 days. The estimated chance of finishing inside it is around 13%. The favourable-looking ratio here is favourable *because* the odds are not.${NIFTY_NOTE}`,
  }),

  entry({
    slug: 'iron-butterfly',
    title: 'Iron butterfly',
    category: 'OPTION_STRUCTURE',
    summary: 'A short straddle with wings: the biggest credit of the range structures, the narrowest profit zone.',
    readingMinutes: 3,
    templates: ['IRON_BUTTERFLY'],
    markdown: `## How it works

Sell the at-the-money call and put, buy a call above and a put below. It is a short straddle with the tails cut off. Because the short legs are at the money the credit is large; because the profit zone is a point rather than a band, you need the underlying to finish close to the strike.

## When it fails

It needs precision that markets rarely provide. The maximum profit exists at exactly one price. Anywhere else you keep only part of the credit, and outside the breakevens you lose.

It also suffers most from **pin risk** on expiry day: if the underlying closes right at the short strike, whether the option is exercised is out of your hands. Indian index options are cash-settled, which removes most of this, but stock options are physically settled and a pinned short leg can leave you with a delivery obligation worth many times the position.

## What it costs

Eight legs of charges. Margin is modest — the wings define the risk — but the structure is usually opened closer to expiry, where charges are a larger share of a smaller premium.

## Worked example

NIFTY at 24,000, 7 days out. Sell the 24,000 call (120) and put (110), buy the 24,150 call (45) and the 23,850 put (40).

- Net credit: 145 a unit, ₹10,875.
- Maximum profit: ₹10,875, only if NIFTY expires at exactly 24,000.
- Maximum loss: (150 − 145) × 75 = ₹375 — small, because the wings are close.
- Breakevens: 23,855 and 24,145.

A 290-point window over 7 days is roughly a coin flip, for an attractive-looking ratio. Attractive ratios and coin flips tend to arrive together.${NIFTY_NOTE}`,
  }),

  entry({
    slug: 'bull-call-spread',
    title: 'Bull call spread',
    category: 'OPTION_STRUCTURE',
    summary: 'Buy a call, sell a higher one: a cheaper directional bet with the upside capped.',
    readingMinutes: 3,
    templates: ['BULL_CALL_SPREAD'],
    markdown: `## How it works

Buy a call and sell a higher-strike call in the same expiry. The sold call pays for part of the bought one, so the position costs less than the outright call — and in exchange your profit stops at the higher strike.

It is the standard way to express "I think this goes up, but not to the moon, and I do not want to pay full price for time value".

## When it fails

**It is still long premium.** If the underlying goes nowhere, the spread decays to zero and you lose the whole debit. Capping the upside reduces the cost; it does not make the trade non-directional.

**It needs the move to happen before expiry, not eventually.** Being right a week late is being wrong.

**Early assignment on the short leg** is a non-issue for Indian index options (European, cash-settled) and a real one for American-style contracts elsewhere.

## What it costs

Four legs of charges. Because the debit is small, charges can be 2–4% of the position — enough to turn a marginal winner into a loser.

## Worked example

NIFTY at 24,000, 30 days out. Buy the 24,000 call for 300, sell the 24,300 call for 180.

- Net debit: 120 a unit, ₹9,000.
- Maximum profit: (300 − 120) × 75 = ₹13,500, at 24,300 or above.
- Maximum loss: ₹9,000, at 24,000 or below.
- Breakeven: 24,120.

You are risking ₹9,000 to make ₹13,500 and you need a 0.5% move just to break even. Compare that with the outright call, which costs ₹22,500 and needs 1.25% to break even but has no ceiling. Which is better depends entirely on how big you think the move is — which is the actual decision, and no diagram makes it for you.${NIFTY_NOTE}`,
  }),

  entry({
    slug: 'bear-call-spread',
    title: 'Bear call spread',
    category: 'OPTION_STRUCTURE',
    summary: 'Sell a call, buy a higher one: a credit structure that pays if the market does not rise.',
    readingMinutes: 3,
    templates: ['BEAR_CALL_SPREAD'],
    markdown: `## How it works

Sell a call and buy a higher-strike call. You take in a credit and keep it if the underlying stays below the short strike. The bought call caps the loss.

The important property: you make money if the market falls, drifts, *or* rises slightly. That is three of four outcomes, which is why credit spreads feel so comfortable.

## When it fails

The comfort is the problem. The structure wins often and loses more than it wins when it loses. A spread that collects 30 on a 100-wide gap risks 70 to make 30: you need to be right well over 70% of the time to break even, and estimating your own hit rate at better than 70% is exactly the kind of thing people get wrong.

It also fails on **the grind**. A slow, relentless rally takes the short call in the money while margin requirements climb, and closing early crystallises most of the maximum loss.

## What it costs

Four legs of charges. Margin is defined by the width of the spread, typically ₹5,000–₹8,000 per lot for a 100-point NIFTY spread — far cheaper than a naked short call.

## Worked example

NIFTY at 24,000, 20 days out. Sell the 24,100 call for 150, buy the 24,200 call for 110.

- Net credit: 40 a unit, ₹3,000.
- Maximum profit: ₹3,000, below 24,100.
- Maximum loss: (100 − 40) × 75 = ₹4,500, above 24,200.
- Breakeven: 24,140.

Risking ₹4,500 to make ₹3,000. To break even over many repetitions you need to win 60% of the time — before charges.${NIFTY_NOTE}`,
  }),

  entry({
    slug: 'bull-put-spread',
    title: 'Bull put spread',
    category: 'OPTION_STRUCTURE',
    summary: 'Sell a put, buy a lower one: a credit structure that pays if the market does not fall.',
    readingMinutes: 3,
    templates: ['BULL_PUT_SPREAD'],
    markdown: `## How it works

Sell a put and buy a lower-strike put in the same expiry. You collect a credit and keep it if the underlying stays above the short strike; the bought put caps what a crash can cost you.

Economically it is the same shape as a bull call spread — same maximum profit, same maximum loss, same breakeven — built from puts instead of calls. Which one to use usually comes down to which side has the better liquidity and the fatter implied volatility.

## When it fails

Put spreads are sold into fear, and fear is often right. The credit is fattest exactly when the market is falling, which is exactly when the short strike is most likely to be breached.

The other failure is **skew**. Index puts trade at higher implied volatility than calls, and for a reason: the market falls faster than it rises. The extra premium you collect on the put side is compensation for a real asymmetry, not a free lunch.

## What it costs

Four legs of charges and margin set by the spread width. A 100-point NIFTY put spread blocks roughly ₹5,000–₹8,000 a lot.

## Worked example

NIFTY at 24,000, 20 days out. Sell the 23,900 put for 140, buy the 23,800 put for 100.

- Net credit: 40 a unit, ₹3,000.
- Maximum profit: ₹3,000, above 23,900.
- Maximum loss: ₹4,500, below 23,800.
- Breakeven: 23,860.

Identical arithmetic to the bear call spread above, pointing the other way.${NIFTY_NOTE}`,
  }),

  entry({
    slug: 'bear-put-spread',
    title: 'Bear put spread',
    category: 'OPTION_STRUCTURE',
    summary: 'Buy a put, sell a lower one: a cheaper way to be short, with the profit capped.',
    readingMinutes: 3,
    templates: ['BEAR_PUT_SPREAD'],
    markdown: `## How it works

Buy a put and sell a lower-strike put. The sold put subsidises the bought one; your profit stops at the lower strike.

## When it fails

**Puts are expensive.** Index put implied volatility is structurally higher than call implied volatility, so a debit put spread starts further behind than the equivalent call spread does. You are buying the expensive leg.

**Falls are fast and short.** A market that drops 4% and recovers in a fortnight can leave a 30-day put spread at nearly zero profit, because you were right about direction and wrong about timing. Directional option trades are timing trades whether or not anyone admits it.

## What it costs

Four legs of charges on a small debit — often 3% or more of the position.

## Worked example

NIFTY at 24,000, 30 days out. Buy the 24,000 put for 280, sell the 23,700 put for 170.

- Net debit: 110 a unit, ₹8,250.
- Maximum profit: (300 − 110) × 75 = ₹14,250, at 23,700 or below.
- Maximum loss: ₹8,250, at 24,000 or above.
- Breakeven: 23,890.${NIFTY_NOTE}`,
  }),

  entry({
    slug: 'call-calendar',
    title: 'Call calendar',
    category: 'OPTION_STRUCTURE',
    summary: 'Sell the near expiry, buy the far one at the same strike: a bet on time, not direction.',
    readingMinutes: 4,
    templates: ['CALENDAR_CALL'],
    markdown: `## How it works

Sell a near-dated call and buy the same strike in a later expiry. Both legs lose time value, but the near one loses it much faster — theta accelerates as expiry approaches — so the spread widens in your favour if the underlying sits still.

It is the only common structure that is short theta on one leg and long it on the other, and it is long vega overall: rising implied volatility helps the far leg more than it hurts the near one.

## When it fails

**A big move in either direction.** Unlike a straddle, a calendar wants the underlying pinned at the strike. Move far enough and both legs converge in value and the spread collapses.

**A volatility fall after the near leg expires**, leaving you holding a long-dated option that is worth less than you paid, with no short leg offsetting it.

**The near leg is not free money.** If the underlying jumps before the near expiry, the short leg goes in the money and the long leg does not fully cover it, because it has a lower delta.

Calendars also demand more attention than most structures: you have a decision to make at the near expiry, and it has to be made.

## What it costs

Four legs, across two expiries, and the far leg is usually less liquid with a wider spread. The bid-ask on the far leg is frequently a larger cost than all the statutory charges put together.

## Worked example

NIFTY at 24,000. Sell the 24,000 call expiring in 10 days for 130; buy the 24,000 call expiring in 38 days for 250.

- Net debit: 120 a unit, ₹9,000. That is the maximum loss.
- If NIFTY is at 24,000 at the near expiry, the short leg expires worthless and the long leg is still worth roughly 200: the spread is now 200 against the 120 paid, about ₹6,000 profit.
- If NIFTY is at 25,000, both legs are deep in the money, the spread narrows to the low tens, and most of the debit is gone.

The profit comes from stillness, and stillness is not something you can be confident about.${NIFTY_NOTE}`,
  }),

  entry({
    slug: 'covered-call',
    title: 'Covered call',
    category: 'OPTION_STRUCTURE',
    summary: 'Holding the shares and selling a call against them: income for a capped upside.',
    readingMinutes: 3,
    templates: ['COVERED_CALL'],
    markdown: `## How it works

You own the underlying and sell a call against it. The premium is yours to keep; in exchange you have agreed to sell your holding at the strike if it gets there.

It is often described as generating income from a portfolio. That is true and incomplete: what you have actually done is sell your upside.

## When it fails

**The stock runs.** You keep the premium and lose the rally above the strike. In a year where the holding doubles, a diligent monthly covered-call programme will have captured a fraction of it.

**The stock falls.** The premium cushions the fall by a few percent and then you are simply long a falling stock. A covered call is not a hedge. If you would be uncomfortable holding the shares outright, selling a call against them does not fix that.

**The tax.** In India the premium is business income if you are treated as a trader, while the shares may be capital gains — different heads, different rates, and being assigned forces a sale at a time you did not choose, which can turn a long-term gain into a short-term one.

In F&O terms a covered call has the same payoff shape as a short put. Anyone who would not sell the put should look again at why the covered call feels safer.

## What it costs

Two legs of option charges per cycle, plus the delivery charges if you are assigned. Repeated monthly, the charges add up to a visible drag on the income.

## Worked example

You hold 75 shares of a stock at ₹1,000 (₹75,000). You sell the one-month 1,050 call for ₹20 a share: ₹1,500 received, a 2% yield on the holding.

- Stock at 1,020 at expiry: call expires worthless, you keep ₹1,500 and the shares. Best case.
- Stock at 1,200: you are assigned at 1,050. You made 50 + 20 = ₹70 a share and gave up ₹150. Right about the direction, and worse off than doing nothing.
- Stock at 900: you keep the ₹1,500 and are down ₹7,500. The premium covered a fifth of the fall.${NIFTY_NOTE}`,
  }),

  entry({
    slug: 'protective-put',
    title: 'Protective put',
    category: 'OPTION_STRUCTURE',
    summary: 'Holding the underlying and buying a put as insurance: a known floor, for a premium.',
    readingMinutes: 3,
    templates: ['PROTECTIVE_PUT'],
    markdown: `## How it works

You own the underlying and buy a put. Below the strike, the put gains what the holding loses, so the strike is a floor on your position for the life of the option. Above it, you keep the upside less the premium you paid.

It is insurance, and it behaves like insurance: you pay a premium, you mostly do not claim, and the one time you do it matters.

## When it fails

**The cost compounds.** A 5%-out-of-the-money three-month put on an Indian index typically costs 1.5–2.5% of the notional. Rolled continuously, that is 6–10% a year of drag — enough to turn a decent equity return into a mediocre one. Permanent insurance is very expensive insurance.

**It is bought at the wrong time.** Puts are cheapest when nobody is worried and dearest when everybody is. The protective put most people buy is the one bought after the fall has begun, at triple the premium.

**The floor is not where you think.** It is the strike *minus the premium paid*, and it only applies at expiry. Before then, the put's value depends on implied volatility and time as well as price.

## What it costs

Two legs of option charges, plus the premium itself, which dwarfs them. Judge this structure on the premium as an annualised percentage of the holding, not on the rupee amount.

## Worked example

You hold one lot's worth of NIFTY exposure at 24,000 (₹18 lakh). You buy the 23,000 put, 60 days out, for 220 a unit: ₹16,500, about 0.9% of the position.

- NIFTY at 25,000 at expiry: the put expires worthless. You made ₹75,000 on the holding and paid ₹16,500 for the insurance you did not need.
- NIFTY at 21,000: the holding is down ₹2,25,000, the put is worth ₹1,50,000. Net loss ₹91,500 rather than ₹2,25,000.
- NIFTY at 23,780 — exactly the breakeven — you are flat.

Whether that is worth 0.9% every two months is a judgement about your own tolerance, and nobody else can make it.${NIFTY_NOTE}`,
  }),

  entry({
    slug: 'position-sizing',
    title: 'Position sizing and risk of ruin',
    category: 'RISK',
    summary: 'Why the size of the bet decides the outcome more reliably than the quality of the idea.',
    readingMinutes: 5,
    templates: [],
    markdown: `## The arithmetic nobody argues with

Losses and gains are not symmetric. Lose 50% and you need 100% to get back. Lose 80% and you need 400%. This is why survival comes before return, and it is the only part of trading that is not a matter of opinion.

## Fixed-fractional sizing

Decide the most you are willing to lose on one trade — as a percentage of capital, commonly 1% or 2%. Then:

    quantity = (capital × risk%) ÷ |entry − stop|

The stop distance, not conviction, sets the size. A tight stop lets you hold more; a wide one forces you to hold less. This is the mechanism that stops a "high conviction" trade from being the one that ruins the year.

**Worked example.** Capital ₹5,00,000, risking 1% (₹5,000). Entry ₹1,000, stop ₹980, so the risk is ₹20 a share. Quantity = 5,000 ÷ 20 = 250 shares, a ₹2,50,000 position. Half your capital deployed, 1% at risk. Those two numbers are different things and confusing them is the most common sizing error there is.

## Risk of ruin

Given a win rate, a payoff ratio and a risk per trade, the chance of eventually losing a given fraction of capital can be computed. The numbers are sobering:

| Win rate | Payoff | Risk/trade | Risk of ruin |
|---|---|---|---|
| 50% | 2:1 | 1% | ~0% |
| 50% | 2:1 | 10% | ~0.1% |
| 50% | 2:1 | 25% | ~5% |
| 40% | 1:1 | 2% | 100% |

The last row is the important one. With a negative edge, no position size saves you — small bets only postpone the outcome. Position sizing manages *how fast* you find out whether you have an edge; it cannot create one.

## Kelly, and why to be careful with it

The Kelly criterion gives the bet size that maximises long-run growth: **f\\* = W − (1 − W)/R**. At a 50% win rate and 2:1 payoff, that is 25% of capital per trade.

Nobody sane trades that. Kelly assumes you know your win rate and payoff exactly, and you do not — they are estimates from a small sample. Overestimate your edge slightly and the "optimal" fraction becomes ruinous. Full Kelly also produces drawdowns above 50% as a matter of routine, which almost nobody sits through without abandoning the system at the worst point.

Practitioners who use it use a half or a quarter. Treat it as an upper bound that tells you what is definitely too much, not as a target.

## What to take from this

Decide the risk per trade before you look for a trade. Let the stop set the size. Check your risk of ruin at the size you actually trade, not the size you intend to.

*This is education, not advice. The right risk per trade depends on circumstances no calculator knows about.*`,
  }),

  entry({
    slug: 'why-backtests-lie',
    title: 'Why backtests lie',
    category: 'METHOD',
    summary: 'The six ways a backtest flatters a strategy, and what to do about each.',
    readingMinutes: 5,
    templates: [],
    markdown: `Every backtest overstates. The question is by how much, and whether you know which ways yours does.

## 1. Look-ahead bias

Using information the moment it was not yet available. The classic is filling at the signal bar's close — at the instant that close prints, it is no longer tradeable. Arvo's backtester defaults to filling at the **next bar's open** for exactly this reason. Turning that off makes results better and less true.

Subtler versions: using an adjusted-close series that was re-adjusted after a corporate action, or an indicator computed over the whole series at once.

## 2. Survivorship bias

Backtesting today's index constituents over ten years. The companies that failed are not in your data, so your universe is one of survivors and your returns are the returns of having known in advance which they were.

## 3. Overfitting

The one that does the most damage. Try enough parameter combinations and one of them will look superb on any dataset, including random numbers. The rules of thumb worth keeping:

- Want at least **30 trades per tunable parameter**. Under 10 is uninterpretable.
- Count *every* variation you tried, not the one you kept. Fifty attempts and one winner is a lottery ticket, not a discovery.
- Check that performance is a **plateau, not a spike**. If a 20-period average works and 19 and 21 do not, you have fitted noise.
- Use a **walk-forward split**. If it makes money on the first two-thirds and loses it on the last third, that is the answer.

## 4. Costs

Brokerage, STT, exchange charges, stamp duty and GST. Arvo applies all of them from the statutory tables. Most intraday strategies on the internet are profitable exactly until they are applied — a strategy making 0.3% a trade is making nothing after costs, and it is common to see this discovered only with real money.

## 5. Slippage and liquidity

Backtests fill at prices; markets fill at whatever is there. The stop you modelled at a level fills below it, in the move that triggered it, in the size you actually have. An illiquid contract can be untradeable at the size the backtest assumed. Model slippage, and model more of it than feels fair.

## 6. Regime change

The strategy worked from 2015 to 2020 because that regime existed. Volatility regimes, liquidity, expiry-day mechanics and even the charge rates all change — STT on options changed in October 2024, which is enough on its own to move an intraday strategy from viable to not.

## What a backtest is good for

Ruling things out. If it does not work on historical data with honest costs, it will not work live. The converse does not hold.

*A backtest is a description of the past. Past performance says nothing about future results.*`,
  }),

  entry({
    slug: 'charges-and-the-real-cost',
    title: 'What a trade actually costs in India',
    category: 'RISK',
    summary: 'Brokerage is the smallest part. The full stack of statutory charges, and what they do to a strategy.',
    readingMinutes: 4,
    templates: [],
    markdown: `Discount brokers advertise ₹20 an order. The ₹20 is often the smallest line on the contract note.

## The stack

| Charge | Who takes it | Roughly |
|---|---|---|
| Brokerage | Your broker | ₹20 an order, or 0.03%, whichever is lower |
| STT / CTT | Government | The big one. Varies by segment |
| Exchange transaction | NSE / BSE | Per crore of turnover |
| SEBI turnover fee | SEBI | ₹10 per crore |
| Stamp duty | State government | Buy side only |
| GST | Government | 18% on brokerage, exchange and SEBI charges |
| DP charges | Depository | Per scrip per day, on delivery sells |

STT is the one that decides whether a strategy works. As of 1 October 2024 it is 0.1% of **premium** on sold options — it was 0.0625% — and 0.02% on sold futures. On the buy side of an option it is zero, which is why the cost lands entirely on the exit.

## What it means in practice

**Intraday equity.** A ₹1,00,000 round trip costs roughly ₹60–₹70 all in, about 0.06%. A strategy targeting 0.2% a trade gives up a third of its edge to costs.

**Option buying.** Buy a NIFTY option at 150 and sell at 160: gross profit ₹750 on one lot. Charges around ₹60. You keep ₹690, and a 6.7% move in the option has become 9% less than it looked.

**Option selling.** STT on premium is charged on the sell leg, so opening a short position pays it immediately. Sell a straddle for 290 a unit — ₹21,750 of premium — and STT alone is about ₹22, before everything else.

**Delivery.** DP charges are per scrip per day, not per rupee, so a small sale is disproportionately expensive. Selling ₹5,000 of one stock costs the same ₹15 in DP charges as selling ₹5,00,000.

## Reading your own numbers

The trading journal computes charges as a percentage of gross profit. It is the single most useful number in the whole product for an active trader, and for high-frequency intraday strategies it is not unusual to find it above 50% — the strategy works, and the broker and the exchequer take most of it.

*Rates change by notification. Arvo versions them by the date they took effect and charges each fill at the rates in force on its own trade date, but always check the contract note.*`,
  }),
];

export type LibraryIndexEntry = Omit<LibraryEntry, 'markdown'>;

/** The index the library tab lists, without the body text. */
export function libraryIndex(): { entries: LibraryIndexEntry[]; disclaimer: string } {
  return {
    entries: LIBRARY.map(({ markdown: _markdown, ...rest }) => rest),
    disclaimer: LAB_DISCLAIMER,
  };
}

export function libraryEntry(slug: string): LibraryEntry | undefined {
  return LIBRARY.find((item) => item.slug === slug);
}
