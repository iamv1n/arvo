import { MigrationInterface, QueryRunner } from "typeorm";

export class RecurringPriceIncrease1789600692916 implements MigrationInterface {
    name = 'RecurringPriceIncrease1789600692916'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "recurring_series"
            ADD "price_increased" boolean NOT NULL DEFAULT false
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "recurring_series" DROP COLUMN "price_increased"
        `);
    }

}
