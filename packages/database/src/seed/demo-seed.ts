import 'reflect-metadata';
import { FinanceCore } from '@arvo/finance-core';
import { AccountType, TransactionType } from '@arvo/types';
import { hash } from 'argon2';
import { DataSource } from 'typeorm';
import { databaseOptions, loadRootEnv } from '../config';
import { CategoryEntity, UserEntity } from '../entities';
import { createFinanceStore } from '../repositories/finance-store';

/**
 * Development seed: one user, 3 accounts, 6 months of realistic INR activity including
 * salary, rent, recurring subscriptions, card spend, refunds, fees, transfers and a few outliers.
 * Deterministic (fixed pseudo-random seed) so dashboards look the same on every run.
 *
 *   pnpm db:seed               → demo@arvo.local / arvo-demo-password
 */
const EMAIL = 'demo@arvo.local';
const PASSWORD = 'arvo-demo-password';
const MONTHS = 6;

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

async function main() {
  loadRootEnv();
  const dataSource = await new DataSource(databaseOptions(process.env.DATABASE_URL!)).initialize();
  const users = dataSource.getRepository(UserEntity);
  const existing = await users.findOneBy({ email: EMAIL });
  if (existing) {
    await users.delete({ id: existing.id });
    console.log('Removed previous demo user');
  }
  const user = await users.save(
    users.create({ email: EMAIL, name: 'Demo User', passwordHash: await hash(PASSWORD), currency: 'INR', timezone: 'Asia/Kolkata' }),
  );

  const core = new FinanceCore(createFinanceStore(dataSource));
  const categories = await dataSource.getRepository(CategoryEntity).findBy({ isSystem: true });
  const cat = (name: string) => {
    const found = categories.find((c) => c.name === name);
    if (!found) throw new Error(`Missing system category ${name}; run migrations first`);
    return found.id;
  };

  const hdfc = await core.accounts.create(user.id, { name: 'HDFC Savings', type: AccountType.BANK, institution: 'HDFC Bank', currency: 'INR', openingBalance: '185000' });
  const icici = await core.accounts.create(user.id, { name: 'ICICI Amazon Pay Card', type: AccountType.CREDIT_CARD, institution: 'ICICI Bank', currency: 'INR' });
  const cash = await core.accounts.create(user.id, { name: 'Cash Wallet', type: AccountType.CASH, currency: 'INR', openingBalance: '4000' });

  const random = rng(42);
  const pick = <T>(items: T[]) => items[Math.floor(random() * items.length)];
  const between = (min: number, max: number) => (min + random() * (max - min)).toFixed(2);

  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (MONTHS - 1), 1));
  let created = 0;
  const add = async (
    accountId: string, date: string, description: string, amount: string, type: TransactionType,
    category?: string, merchantName?: string,
  ) => {
    await core.transactions.create(user.id, {
      accountId, date, description, amount, type, categoryId: category ? cat(category) : undefined, merchantName,
    });
    created++;
  };

  for (let m = 0; m < MONTHS; m++) {
    const month = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + m, 1));
    const ym = month.toISOString().slice(0, 7);
    const lastDay = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
    const isCurrent = m === MONTHS - 1;
    const maxDay = isCurrent ? Math.min(lastDay, today.getUTCDate()) : lastDay;
    // In the current month, compress the schedule into the days that have already passed.
    const day = (d: number) => `${ym}-${String(Math.max(1, Math.round((Math.min(d, lastDay) * maxDay) / lastDay))).padStart(2, '0')}`;

    await add(hdfc.id, day(1), 'SALARY CREDIT ACME TECHNOLOGIES PVT LTD', '145000', TransactionType.INCOME, 'Salary', 'Acme Technologies');
    await add(hdfc.id, day(3), 'NEFT RENT MR SHARMA', '-32000', TransactionType.EXPENSE, 'Rent', 'Landlord');
    await add(hdfc.id, day(5), 'BESCOM ELECTRICITY BILL', `-${between(1400, 2600)}`, TransactionType.EXPENSE, 'Electricity', 'BESCOM');
    await add(icici.id, day(6), 'NETFLIX.COM SUBSCRIPTION', '-649', TransactionType.EXPENSE, 'Streaming', 'Netflix');
    await add(icici.id, day(8), 'SPOTIFY INDIA', '-119', TransactionType.EXPENSE, 'Streaming', 'Spotify');
    await add(icici.id, day(11), 'AIRTEL FIBER BROADBAND', '-1178', TransactionType.EXPENSE, 'Internet', 'Airtel');
    await add(hdfc.id, day(10), 'SIP ZERODHA COIN MF', '-15000', TransactionType.TRANSFER, 'Investments', 'Zerodha Coin');
    await add(icici.id, day(15), 'CULT.FIT MEMBERSHIP', '-1499', TransactionType.EXPENSE, 'Fitness', 'Cult.fit');

    for (let i = 0; i < 9; i++) {
      const merchant = pick(['Swiggy', 'Zomato']);
      await add(icici.id, day(1 + Math.floor(random() * 28)), `${merchant.toUpperCase()} ORDER`, `-${between(180, 950)}`, TransactionType.EXPENSE, 'Delivery', merchant);
    }
    for (let i = 0; i < 4; i++) {
      const merchant = pick(['BigBasket', 'Zepto', 'DMart']);
      await add(icici.id, day(2 + i * 7), `${merchant.toUpperCase()} GROCERIES`, `-${between(900, 3800)}`, TransactionType.EXPENSE, 'Groceries', merchant);
    }
    for (let i = 0; i < 3; i++) {
      await add(icici.id, day(4 + i * 9), 'UBER INDIA TRIP', `-${between(160, 720)}`, TransactionType.EXPENSE, 'Cab & Taxi', 'Uber');
    }
    await add(icici.id, day(18), 'THIRD WAVE COFFEE', `-${between(250, 600)}`, TransactionType.EXPENSE, 'Restaurants', 'Third Wave Coffee');
    await add(icici.id, day(21), 'INDIAN OIL FUEL', `-${between(1500, 2800)}`, TransactionType.EXPENSE, 'Fuel', 'Indian Oil');
    await add(cash.id, day(12), 'Chai and snacks', `-${between(80, 300)}`, TransactionType.EXPENSE, 'Restaurants');
    await add(hdfc.id, day(25), 'ATM WITHDRAWAL', '-3000', TransactionType.TRANSFER);
    await add(cash.id, day(25), 'Cash from ATM', '3000', TransactionType.TRANSFER);

    if (m % 2 === 0) {
      await add(icici.id, day(14), 'AMAZON IN SHOPPING', `-${between(1200, 6500)}`, TransactionType.EXPENSE, 'Shopping', 'Amazon');
    }
    if (m === 2) {
      await add(icici.id, day(16), 'CROMA LAPTOP PURCHASE', '-78999', TransactionType.EXPENSE, 'Electronics', 'Croma');
      await add(icici.id, day(22), 'AMAZON REFUND', '2499', TransactionType.REFUND, 'Shopping', 'Amazon');
    }
    if (m === 3) {
      await add(icici.id, day(9), 'INDIGO AIRLINES BLR-DEL', '-11840', TransactionType.EXPENSE, 'Flights', 'IndiGo');
      await add(hdfc.id, day(28), 'FREELANCE PROJECT PAYMENT', '40000', TransactionType.INCOME, 'Business', 'Freelance Client');
    }
    if (m === 4) {
      await add(hdfc.id, day(19), 'APOLLO HOSPITAL', '-8600', TransactionType.EXPENSE, 'Medical', 'Apollo');
    }
    await add(icici.id, day(27), 'LATE PAYMENT FEE + GST', '-590', TransactionType.FEE, 'Fees & Charges');
    await add(hdfc.id, day(lastDay), 'SAVINGS INTEREST', between(220, 480), TransactionType.INTEREST, 'Interest');
    await add(hdfc.id, day(26), 'UPI PAYMENT RAHUL', `-${between(300, 1500)}`, TransactionType.UNKNOWN);

    // Pay last month's card statement from the bank account.
    if (m > 0) {
      const summary = await core.accounts.get(user.id, icici.id);
      const owed = -Number(summary.balance);
      if (owed > 0) {
        await core.transfers.create(user.id, {
          fromAccountId: hdfc.id, toAccountId: icici.id, amount: owed.toFixed(2), date: day(2), description: 'ICICI CREDIT CARD PAYMENT',
        });
        created += 2;
      }
    }
  }

  console.log(`Seeded ${created} transactions for ${EMAIL} (password: ${PASSWORD})`);
  await dataSource.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
