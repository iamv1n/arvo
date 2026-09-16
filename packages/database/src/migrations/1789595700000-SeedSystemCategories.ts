import type { MigrationInterface, QueryRunner } from 'typeorm';

/** System categories shared by all users (user_id NULL, is_system true). */
export const SYSTEM_CATEGORIES: Record<'INCOME' | 'EXPENSE' | 'TRANSFER', Record<string, string[]>> = {
  INCOME: {
    Salary: [],
    Business: [],
    Interest: [],
    Dividends: [],
    'Other Income': [],
  },
  EXPENSE: {
    Food: ['Restaurants', 'Groceries', 'Delivery'],
    Housing: ['Rent', 'Maintenance'],
    Utilities: ['Electricity', 'Water', 'Internet', 'Mobile', 'Gas'],
    Transport: ['Fuel', 'Cab & Taxi', 'Public Transport'],
    Shopping: ['Clothing', 'Electronics', 'Household'],
    Entertainment: ['Streaming', 'Movies & Events'],
    Health: ['Medical', 'Pharmacy', 'Fitness'],
    Travel: ['Flights', 'Hotels'],
    Education: [],
    'Personal Care': [],
    Insurance: [],
    Taxes: [],
    'Fees & Charges': [],
    'Gifts & Donations': [],
    'Other Expense': [],
  },
  TRANSFER: {
    'Account Transfer': [],
    'Credit Card Payment': [],
    Investments: [],
  },
};

export class SeedSystemCategories1789595700000 implements MigrationInterface {
  name = 'SeedSystemCategories1789595700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [type, parents] of Object.entries(SYSTEM_CATEGORIES)) {
      for (const [parent, children] of Object.entries(parents)) {
        const [{ id }] = await queryRunner.query(
          `INSERT INTO "categories" ("name", "type", "is_system", "user_id", "parent_id")
           VALUES ($1, $2, true, NULL, NULL) RETURNING "id"`,
          [parent, type],
        );
        for (const child of children) {
          await queryRunner.query(
            `INSERT INTO "categories" ("name", "type", "is_system", "user_id", "parent_id")
             VALUES ($1, $2, true, NULL, $3)`,
            [child, type, id],
          );
        }
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "transactions" SET "category_id" = NULL
      WHERE "category_id" IN (SELECT "id" FROM "categories" WHERE "is_system")`);
    await queryRunner.query(`DELETE FROM "categories" WHERE "is_system" AND "parent_id" IS NOT NULL`);
    await queryRunner.query(`DELETE FROM "categories" WHERE "is_system"`);
  }
}
