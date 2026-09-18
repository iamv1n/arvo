import { MigrationInterface, QueryRunner } from "typeorm";

export class WealthAndPortfolio1789760917753 implements MigrationInterface {
    name = 'WealthAndPortfolio1789760917753'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "holdings" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "name" character varying(160) NOT NULL,
                "kind" character varying(20) NOT NULL,
                "asset_class" character varying(20) NOT NULL,
                "currency" character(3) NOT NULL,
                "isin" character varying(12),
                "scheme_code" character varying(24),
                "symbol" character varying(32),
                "folio" character varying(64),
                "amc" character varying(120),
                "sector" character varying(80),
                "market_cap" character varying(10),
                "plan" character varying(10),
                "expense_ratio" numeric(19, 4),
                "direct_expense_ratio" numeric(19, 4),
                "exit_load_days" integer,
                "exit_load_percent" numeric(19, 4),
                "lock_in_months" integer,
                "latest_price" numeric(19, 4),
                "latest_price_date" date,
                "goal_id" uuid,
                "notes" character varying(1000),
                "is_active" boolean NOT NULL DEFAULT true,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_df4e42f95014be15a4ccc8547c0" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_06c2e7abdda511550c600e2f6d" ON "holdings" ("user_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_holdings_user_scheme_code" ON "holdings" ("user_id", "scheme_code")
        `);
        await queryRunner.query(`
            CREATE TABLE "holding_transactions" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "holding_id" uuid NOT NULL,
                "date" date NOT NULL,
                "type" character varying(20) NOT NULL,
                "units" numeric(24, 5),
                "price" numeric(19, 4),
                "amount" numeric(19, 4) NOT NULL,
                "charges" numeric(19, 4) NOT NULL DEFAULT '0',
                "note" character varying(300),
                "external_ref" character varying(400),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "uq_holding_transactions_user_external_ref" UNIQUE ("user_id", "external_ref"),
                CONSTRAINT "PK_c8f8b3a59aae40e40c7c89b6943" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_holding_transactions_user_holding_date" ON "holding_transactions" ("user_id", "holding_id", "date")
        `);
        await queryRunner.query(`
            CREATE TABLE "portfolio_benchmark_points" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "series" character varying(80) NOT NULL,
                "date" date NOT NULL,
                "value" numeric(19, 4) NOT NULL,
                CONSTRAINT "uq_benchmark_points_user_series_date" UNIQUE ("user_id", "series", "date"),
                CONSTRAINT "PK_9f3b8fa984f37ce919366fc7063" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_ec25382dd5c2a2a47ae2ea7e0d" ON "portfolio_benchmark_points" ("user_id")
        `);
        await queryRunner.query(`
            CREATE TABLE "portfolio_fund_holdings" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "holding_id" uuid NOT NULL,
                "name" character varying(200) NOT NULL,
                "isin" character varying(12),
                "weight" numeric(19, 4) NOT NULL,
                "as_of" date NOT NULL,
                CONSTRAINT "PK_433ea6adcaaed1a8e88e26a7b83" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_fund_holdings_user_holding" ON "portfolio_fund_holdings" ("user_id", "holding_id")
        `);
        await queryRunner.query(`
            CREATE TABLE "portfolio_import_batches" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "filename" character varying(255) NOT NULL,
                "source" character varying(30) NOT NULL,
                "status" character varying(20) NOT NULL,
                "warnings" jsonb NOT NULL DEFAULT '[]',
                "error" character varying(500),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_cfcebcec103800810133a4e97c7" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_2bec2c2cfd9f3ea4e62c8909cf" ON "portfolio_import_batches" ("user_id")
        `);
        await queryRunner.query(`
            CREATE TABLE "portfolio_import_rows" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "batch_id" uuid NOT NULL,
                "row_number" integer NOT NULL,
                "status" character varying(20) NOT NULL,
                "message" character varying(300),
                "holding_id" uuid,
                "parsed" jsonb NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_3cd522becb44271ac07e6d4ea08" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_portfolio_import_rows_batch" ON "portfolio_import_rows" ("user_id", "batch_id")
        `);
        await queryRunner.query(`
            ALTER TABLE "holdings"
            ADD CONSTRAINT "FK_06c2e7abdda511550c600e2f6d2" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "holdings"
            ADD CONSTRAINT "FK_845dec37493f1bbbcbf492bba12" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "holding_transactions"
            ADD CONSTRAINT "FK_dd44a7b07a2d881997a6f253142" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "holding_transactions"
            ADD CONSTRAINT "FK_8e7ab28399894dd460f1061ff76" FOREIGN KEY ("holding_id") REFERENCES "holdings"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "portfolio_benchmark_points"
            ADD CONSTRAINT "FK_ec25382dd5c2a2a47ae2ea7e0d1" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "portfolio_fund_holdings"
            ADD CONSTRAINT "FK_e183f8ad63f2c336cdd09f12eb1" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "portfolio_fund_holdings"
            ADD CONSTRAINT "FK_8efb03428b92fe140aabe2b09ad" FOREIGN KEY ("holding_id") REFERENCES "holdings"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "portfolio_import_batches"
            ADD CONSTRAINT "FK_2bec2c2cfd9f3ea4e62c8909cf2" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "portfolio_import_rows"
            ADD CONSTRAINT "FK_9b848d1ee0ff15d3b239bf8fbfe" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "portfolio_import_rows"
            ADD CONSTRAINT "FK_4943c504ce4b91db14a82a6ee91" FOREIGN KEY ("batch_id") REFERENCES "portfolio_import_batches"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "portfolio_import_rows"
            ADD CONSTRAINT "FK_27ab5c733522d8a102c49cbaadd" FOREIGN KEY ("holding_id") REFERENCES "holdings"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "portfolio_import_rows" DROP CONSTRAINT "FK_27ab5c733522d8a102c49cbaadd"
        `);
        await queryRunner.query(`
            ALTER TABLE "portfolio_import_rows" DROP CONSTRAINT "FK_4943c504ce4b91db14a82a6ee91"
        `);
        await queryRunner.query(`
            ALTER TABLE "portfolio_import_rows" DROP CONSTRAINT "FK_9b848d1ee0ff15d3b239bf8fbfe"
        `);
        await queryRunner.query(`
            ALTER TABLE "portfolio_import_batches" DROP CONSTRAINT "FK_2bec2c2cfd9f3ea4e62c8909cf2"
        `);
        await queryRunner.query(`
            ALTER TABLE "portfolio_fund_holdings" DROP CONSTRAINT "FK_8efb03428b92fe140aabe2b09ad"
        `);
        await queryRunner.query(`
            ALTER TABLE "portfolio_fund_holdings" DROP CONSTRAINT "FK_e183f8ad63f2c336cdd09f12eb1"
        `);
        await queryRunner.query(`
            ALTER TABLE "portfolio_benchmark_points" DROP CONSTRAINT "FK_ec25382dd5c2a2a47ae2ea7e0d1"
        `);
        await queryRunner.query(`
            ALTER TABLE "holding_transactions" DROP CONSTRAINT "FK_8e7ab28399894dd460f1061ff76"
        `);
        await queryRunner.query(`
            ALTER TABLE "holding_transactions" DROP CONSTRAINT "FK_dd44a7b07a2d881997a6f253142"
        `);
        await queryRunner.query(`
            ALTER TABLE "holdings" DROP CONSTRAINT "FK_845dec37493f1bbbcbf492bba12"
        `);
        await queryRunner.query(`
            ALTER TABLE "holdings" DROP CONSTRAINT "FK_06c2e7abdda511550c600e2f6d2"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_portfolio_import_rows_batch"
        `);
        await queryRunner.query(`
            DROP TABLE "portfolio_import_rows"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_2bec2c2cfd9f3ea4e62c8909cf"
        `);
        await queryRunner.query(`
            DROP TABLE "portfolio_import_batches"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_fund_holdings_user_holding"
        `);
        await queryRunner.query(`
            DROP TABLE "portfolio_fund_holdings"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_ec25382dd5c2a2a47ae2ea7e0d"
        `);
        await queryRunner.query(`
            DROP TABLE "portfolio_benchmark_points"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_holding_transactions_user_holding_date"
        `);
        await queryRunner.query(`
            DROP TABLE "holding_transactions"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_holdings_user_scheme_code"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_06c2e7abdda511550c600e2f6d"
        `);
        await queryRunner.query(`
            DROP TABLE "holdings"
        `);
    }

}
