import { MigrationInterface, QueryRunner } from "typeorm";

/*
 * Phase 12, Strategy Lab.
 *
 * Adds imported OHLCV bars, the bar import staging table, saved strategies, stored backtest
 * runs and paper-trading accounts and orders, and marks trades that came from paper trading so
 * every existing journal query can keep them out.
 *
 * The two partial unique indexes on lab_market_bars are written by hand because Postgres treats
 * NULLs as distinct in a plain unique index: a daily bar has no time, so a single unique index
 * over (user, symbol, timeframe, date, time) would happily accept the same day twice. One index
 * covers the intraday case and one the daily case, and together they make a re-import of an
 * overlapping file idempotent under ON CONFLICT DO NOTHING.
 */

export class StrategyLab1789766271698 implements MigrationInterface {
    name = 'StrategyLab1789766271698'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "lab_market_bars" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "symbol" character varying(64) NOT NULL,
                "timeframe" character varying(8) NOT NULL,
                "date" date NOT NULL,
                "time" character varying(5),
                "open" numeric(19, 4) NOT NULL,
                "high" numeric(19, 4) NOT NULL,
                "low" numeric(19, 4) NOT NULL,
                "close" numeric(19, 4) NOT NULL,
                "volume" bigint NOT NULL DEFAULT '0',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_33ccb69f97deff075e2638b39ad" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_3cbe46a6867d301f676ebba709" ON "lab_market_bars" ("user_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_lab_bars_series" ON "lab_market_bars" ("user_id", "symbol", "timeframe", "date")
        `);
        await queryRunner.query(`
            CREATE TABLE "lab_bar_imports" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "filename" character varying(255) NOT NULL,
                "symbol" character varying(64) NOT NULL,
                "timeframe" character varying(8) NOT NULL,
                "status" character varying(12) NOT NULL DEFAULT 'READY',
                "row_count" integer NOT NULL DEFAULT '0',
                "warnings" jsonb NOT NULL DEFAULT '[]',
                "error" text,
                "from_date" date,
                "to_date" date,
                "parsed" jsonb NOT NULL DEFAULT '[]',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_92a4dca09fac7ba2506ea0f30d8" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_38f33b6093bcfc348f665de808" ON "lab_bar_imports" ("user_id")
        `);
        await queryRunner.query(`
            CREATE TABLE "lab_strategies" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "name" character varying(120) NOT NULL,
                "description" text,
                "spec" jsonb NOT NULL,
                "run_count" integer NOT NULL DEFAULT '0',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_8e1047efe61f2570cca11d4f964" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_b65d3db772f49d8d038388b5a4" ON "lab_strategies" ("user_id")
        `);
        await queryRunner.query(`
            CREATE TABLE "lab_backtests" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "strategy_id" uuid,
                "name" character varying(120) NOT NULL,
                "symbol" character varying(64) NOT NULL,
                "timeframe" character varying(8) NOT NULL,
                "from_date" date,
                "to_date" date,
                "stats" jsonb NOT NULL,
                "result" jsonb NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_528a81fd4a0132b8cfa453566ee" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_87bd65e076ab83094951fdc03c" ON "lab_backtests" ("user_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_lab_backtests_user_created" ON "lab_backtests" ("user_id", "created_at")
        `);
        await queryRunner.query(`
            CREATE TABLE "lab_paper_accounts" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "name" character varying(120) NOT NULL,
                "starting_capital" numeric(19, 4) NOT NULL,
                "cash" numeric(19, 4) NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_d984cbcae7c4db7feb009c2f9a0" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_1e1f5d61b76262f2503b754eb8" ON "lab_paper_accounts" ("user_id")
        `);
        await queryRunner.query(`
            CREATE TABLE "lab_paper_orders" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "account_id" uuid NOT NULL,
                "symbol" character varying(64) NOT NULL,
                "timeframe" character varying(8) NOT NULL,
                "side" character varying(4) NOT NULL,
                "quantity" bigint NOT NULL,
                "order_type" character varying(8) NOT NULL,
                "limit_price" numeric(19, 4),
                "status" character varying(10) NOT NULL DEFAULT 'PENDING',
                "placed_date" date NOT NULL,
                "placed_time" character varying(5),
                "filled_date" date,
                "filled_time" character varying(5),
                "fill_price" numeric(19, 4),
                "trade_id" uuid,
                "message" text,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_069b673a2df3b8bbc4d47c08754" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_44e994372788f50ce451383b0b" ON "lab_paper_orders" ("user_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_lab_paper_orders_account" ON "lab_paper_orders" ("user_id", "account_id")
        `);
        await queryRunner.query(`
            ALTER TABLE "trades"
            ADD "is_paper" boolean NOT NULL DEFAULT false
        `);
        await queryRunner.query(`
            ALTER TABLE "trades"
            ADD "paper_account_id" uuid
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_trades_user_paper" ON "trades" ("user_id", "is_paper")
        `);
        await queryRunner.query(`
            ALTER TABLE "lab_market_bars"
            ADD CONSTRAINT "FK_3cbe46a6867d301f676ebba7095" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "lab_bar_imports"
            ADD CONSTRAINT "FK_38f33b6093bcfc348f665de8082" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "lab_strategies"
            ADD CONSTRAINT "FK_b65d3db772f49d8d038388b5a4c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "lab_backtests"
            ADD CONSTRAINT "FK_87bd65e076ab83094951fdc03c0" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "lab_backtests"
            ADD CONSTRAINT "FK_9731668098572be6601b3a002d5" FOREIGN KEY ("strategy_id") REFERENCES "lab_strategies"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "lab_paper_accounts"
            ADD CONSTRAINT "FK_1e1f5d61b76262f2503b754eb8a" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "lab_paper_orders"
            ADD CONSTRAINT "FK_44e994372788f50ce451383b0b7" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "lab_paper_orders"
            ADD CONSTRAINT "FK_7a993e26c2dc825031cc825559e" FOREIGN KEY ("account_id") REFERENCES "lab_paper_accounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_lab_bars_intraday" ON "lab_market_bars" ("user_id", "symbol", "timeframe", "date", "time")
            WHERE "time" IS NOT NULL
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_lab_bars_daily" ON "lab_market_bars" ("user_id", "symbol", "timeframe", "date")
            WHERE "time" IS NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."uq_lab_bars_daily"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."uq_lab_bars_intraday"
        `);
        await queryRunner.query(`
            ALTER TABLE "lab_paper_orders" DROP CONSTRAINT "FK_7a993e26c2dc825031cc825559e"
        `);
        await queryRunner.query(`
            ALTER TABLE "lab_paper_orders" DROP CONSTRAINT "FK_44e994372788f50ce451383b0b7"
        `);
        await queryRunner.query(`
            ALTER TABLE "lab_paper_accounts" DROP CONSTRAINT "FK_1e1f5d61b76262f2503b754eb8a"
        `);
        await queryRunner.query(`
            ALTER TABLE "lab_backtests" DROP CONSTRAINT "FK_9731668098572be6601b3a002d5"
        `);
        await queryRunner.query(`
            ALTER TABLE "lab_backtests" DROP CONSTRAINT "FK_87bd65e076ab83094951fdc03c0"
        `);
        await queryRunner.query(`
            ALTER TABLE "lab_strategies" DROP CONSTRAINT "FK_b65d3db772f49d8d038388b5a4c"
        `);
        await queryRunner.query(`
            ALTER TABLE "lab_bar_imports" DROP CONSTRAINT "FK_38f33b6093bcfc348f665de8082"
        `);
        await queryRunner.query(`
            ALTER TABLE "lab_market_bars" DROP CONSTRAINT "FK_3cbe46a6867d301f676ebba7095"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_trades_user_paper"
        `);
        await queryRunner.query(`
            ALTER TABLE "trades" DROP COLUMN "paper_account_id"
        `);
        await queryRunner.query(`
            ALTER TABLE "trades" DROP COLUMN "is_paper"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_lab_paper_orders_account"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_44e994372788f50ce451383b0b"
        `);
        await queryRunner.query(`
            DROP TABLE "lab_paper_orders"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_1e1f5d61b76262f2503b754eb8"
        `);
        await queryRunner.query(`
            DROP TABLE "lab_paper_accounts"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_lab_backtests_user_created"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_87bd65e076ab83094951fdc03c"
        `);
        await queryRunner.query(`
            DROP TABLE "lab_backtests"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_b65d3db772f49d8d038388b5a4"
        `);
        await queryRunner.query(`
            DROP TABLE "lab_strategies"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_38f33b6093bcfc348f665de808"
        `);
        await queryRunner.query(`
            DROP TABLE "lab_bar_imports"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_lab_bars_series"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_3cbe46a6867d301f676ebba709"
        `);
        await queryRunner.query(`
            DROP TABLE "lab_market_bars"
        `);
    }

}
