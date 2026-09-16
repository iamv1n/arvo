import type { MigrationInterface, QueryRunner } from 'typeorm';

type CategoryTree = Record<'INCOME' | 'EXPENSE' | 'TRANSFER', Record<string, string[]>>;

/**
 * More system categories, covering every supported account type (bank, credit card, cash,
 * broker, mutual fund, loan) and common Indian household spending. Parents that already exist
 * gain the listed children; nothing is duplicated, and re-running is safe.
 */
export const ADDED_SYSTEM_CATEGORIES: CategoryTree = {
  EXPENSE: {
    'Alcohol & Tobacco': ['Alcohol', 'Cigarettes & Tobacco'],
    'Loan Repayments': ['Home Loan EMI', 'Car Loan EMI', 'Two-Wheeler Loan EMI', 'Personal Loan EMI', 'Education Loan EMI', 'Gold Loan EMI', 'Consumer Durable EMI'],
    'Loan Charges': ['Loan Interest', 'Processing Fees', 'Prepayment Charges'],
    'Fees & Charges': ['Bank Charges', 'ATM Fees', 'Credit Card Annual Fee', 'Late Payment Fee', 'Card Interest & Finance Charges', 'Forex Markup'],
    'Investment Costs': ['Brokerage', 'STT & Exchange Charges', 'DP & Demat Charges', 'Advisory Fees'],
    Housing: ['Property Maintenance', 'Home Improvement', 'Furniture & Appliances', 'Household Help'],
    Utilities: ['DTH & Cable'],
    Transport: ['Parking & Tolls', 'Vehicle Service', 'Train & Bus Tickets'],
    Shopping: ['Online Shopping'],
    Health: ['Doctor Consultation', 'Lab Tests'],
    Insurance: ['Health Insurance', 'Life Insurance', 'Vehicle Insurance', 'Home Insurance'],
    Taxes: ['Income Tax', 'Property Tax', 'Professional Tax'],
    'Personal Care': ['Salon & Beauty', 'Laundry & Dry Cleaning'],
    Education: ['School Fees', 'College Fees', 'Courses & Books', 'Coaching'],
    'Kids & Family': ['Childcare', 'Toys & Kids Items', 'Family Support'],
    Pets: ['Pet Food', 'Vet'],
    Subscriptions: ['Software & Apps', 'News & Magazines', 'Cloud Storage', 'Memberships'],
    'Gifts & Donations': ['Gifts Given', 'Charity', 'Religious Offerings'],
    Entertainment: ['Gaming', 'Hobbies'],
    Travel: ['Travel Stays', 'Visa & Travel Fees'],
    'Cash Spending': [],
  },
  INCOME: {
    Salary: ['Bonus', 'Reimbursements'],
    Business: ['Freelance'],
    Interest: ['Savings Interest', 'Fixed Deposit Interest'],
    Dividends: [],
    'Rental Income': [],
    'Capital Gains': [],
    'Cashback & Rewards': [],
    'Gifts Received': [],
    'Refunds & Reversals': [],
  },
  TRANSFER: {
    'Account Transfer': ['Own Account Transfer', 'Wallet Top-up'],
    'Credit Card Payment': [],
    Investments: ['Mutual Funds & SIP', 'Stocks', 'Fixed Deposits', 'PPF & EPF', 'NPS', 'Gold', 'Crypto'],
    'Investment Redemption': [],
    'Loan Principal Repayment': [],
    'Loan Prepayment': [],
    'Loan Disbursement': [],
    'Cash Withdrawal': [],
    'Cash Deposit': [],
  },
};

export class ExtendSystemCategories1789600500000 implements MigrationInterface {
  name = 'ExtendSystemCategories1789600500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [type, parents] of Object.entries(ADDED_SYSTEM_CATEGORIES)) {
      for (const [parent, children] of Object.entries(parents)) {
        const parentId = await ensure(queryRunner, parent, type, null);
        for (const child of children) {
          await ensure(queryRunner, child, type, parentId);
        }
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove only categories this migration introduced (children first), never the originals.
    const original = new Set([
      'Salary', 'Business', 'Interest', 'Dividends', 'Other Income', 'Food', 'Housing', 'Utilities', 'Transport',
      'Shopping', 'Entertainment', 'Health', 'Travel', 'Education', 'Personal Care', 'Insurance', 'Taxes',
      'Fees & Charges', 'Gifts & Donations', 'Other Expense', 'Account Transfer', 'Credit Card Payment', 'Investments',
    ]);
    for (const [type, parents] of Object.entries(ADDED_SYSTEM_CATEGORIES)) {
      for (const [parent, children] of Object.entries(parents)) {
        for (const child of children) await remove(queryRunner, child, type, parent);
        if (!original.has(parent)) await remove(queryRunner, parent, type, null);
      }
    }
  }
}

async function ensure(queryRunner: QueryRunner, name: string, type: string, parentId: string | null): Promise<string> {
  const existing: { id: string }[] = await queryRunner.query(
    `SELECT "id" FROM "categories"
     WHERE "user_id" IS NULL AND "is_system" AND "type" = $1 AND lower("name") = lower($2)
       AND "parent_id" IS NOT DISTINCT FROM $3`,
    [type, name, parentId],
  );
  if (existing[0]) return existing[0].id;
  const [created]: { id: string }[] = await queryRunner.query(
    `INSERT INTO "categories" ("name", "type", "is_system", "user_id", "parent_id")
     VALUES ($1, $2, true, NULL, $3) RETURNING "id"`,
    [name, type, parentId],
  );
  return created.id;
}

async function remove(queryRunner: QueryRunner, name: string, type: string, parentName: string | null): Promise<void> {
  const where = parentName
    ? `"parent_id" = (SELECT "id" FROM "categories" WHERE "user_id" IS NULL AND "is_system" AND "type" = $1 AND "name" = $3 AND "parent_id" IS NULL)`
    : `"parent_id" IS NULL`;
  const params = parentName ? [type, name, parentName] : [type, name];
  const ids: { id: string }[] = await queryRunner.query(
    `SELECT "id" FROM "categories" WHERE "user_id" IS NULL AND "is_system" AND "type" = $1 AND "name" = $2 AND ${where}`,
    params,
  );
  for (const { id } of ids) {
    await queryRunner.query(`UPDATE "transactions" SET "category_id" = NULL WHERE "category_id" = $1`, [id]);
    await queryRunner.query(`UPDATE "import_rows" SET "category_id" = NULL WHERE "category_id" = $1`, [id]);
    await queryRunner.query(`DELETE FROM "categories" WHERE "id" = $1 AND NOT EXISTS (SELECT 1 FROM "categories" c WHERE c."parent_id" = $1)`, [id]);
  }
}
