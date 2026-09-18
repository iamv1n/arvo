import { MigrationInterface, QueryRunner } from "typeorm";

export class TradingJournal1789763184690 implements MigrationInterface {
    name = 'TradingJournal1789763184690'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "trades" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "date" date NOT NULL,
                "time" TIME,
                "broker" character varying(60) NOT NULL,
                "exchange" character varying(10) NOT NULL,
                "segment" character varying(24) NOT NULL,
                "kind" character varying(12) NOT NULL DEFAULT 'TRADE',
                "symbol" character varying(64) NOT NULL,
                "underlying" character varying(64) NOT NULL,
                "isin" character varying(12),
                "expiry" date,
                "strike" numeric(19, 4),
                "right" character varying(2),
                "lot_size" integer NOT NULL DEFAULT '1',
                "side" character varying(4) NOT NULL,
                "quantity" bigint NOT NULL,
                "price" numeric(19, 4) NOT NULL,
                "amount" numeric(19, 4) NOT NULL,
                "brokerage" numeric(19, 4) NOT NULL DEFAULT '0',
                "stt" numeric(19, 4) NOT NULL DEFAULT '0',
                "exchange_charges" numeric(19, 4) NOT NULL DEFAULT '0',
                "sebi_charges" numeric(19, 4) NOT NULL DEFAULT '0',
                "stamp_duty" numeric(19, 4) NOT NULL DEFAULT '0',
                "gst" numeric(19, 4) NOT NULL DEFAULT '0',
                "dp_charges" numeric(19, 4) NOT NULL DEFAULT '0',
                "other_charges" numeric(19, 4) NOT NULL DEFAULT '0',
                "total_charges" numeric(19, 4) NOT NULL DEFAULT '0',
                "charges_source" character varying(10) NOT NULL DEFAULT 'ESTIMATED',
                "order_id" character varying(64),
                "trade_ref" character varying(64),
                "notes" character varying(500),
                "external_ref" character varying(400),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "uq_trades_user_external_ref" UNIQUE ("user_id", "external_ref"),
                CONSTRAINT "PK_c6d7c36a837411ba5194dc58595" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_4720ba843240e4403c292c3208" ON "trades" ("user_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_trades_user_underlying" ON "trades" ("user_id", "underlying")
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_trades_user_date" ON "trades" ("user_id", "date")
        `);
        await queryRunner.query(`
            CREATE TABLE "trade_journal_entries" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "position_id" uuid NOT NULL,
                "notes" text,
                "setup_tags" jsonb NOT NULL DEFAULT '[]',
                "emotion_tags" jsonb NOT NULL DEFAULT '[]',
                "mistakes" jsonb NOT NULL DEFAULT '[]',
                "stop_price" numeric(19, 4),
                "target_price" numeric(19, 4),
                "screenshots" jsonb NOT NULL DEFAULT '[]',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "uq_trade_journal_user_position" UNIQUE ("user_id", "position_id"),
                CONSTRAINT "PK_2f986cd92cbb288da7ab2e90757" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_1fbe66ae08f2f8d2baf904fe51" ON "trade_journal_entries" ("user_id")
        `);
        await queryRunner.query(`
            CREATE TABLE "trading_settings" (
                "user_id" uuid NOT NULL,
                "brokers" jsonb NOT NULL DEFAULT '[]',
                "revenge_window_minutes" integer NOT NULL DEFAULT '15',
                "over_trading_multiple" numeric(19, 4) NOT NULL DEFAULT '2',
                "assumed_index_return_percent" numeric(19, 4) NOT NULL DEFAULT '12',
                "assumed_fd_rate_percent" numeric(19, 4) NOT NULL DEFAULT '7',
                "benchmark_series" character varying(80),
                "setup_tags" jsonb NOT NULL DEFAULT '[]',
                "emotion_tags" jsonb NOT NULL DEFAULT '[]',
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_58b86212a70386a1612394a1297" PRIMARY KEY ("user_id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "trade_import_batches" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "filename" character varying(255) NOT NULL,
                "source" character varying(30) NOT NULL,
                "profile" character varying(40) NOT NULL DEFAULT 'unknown',
                "broker" character varying(60) NOT NULL DEFAULT 'Unknown',
                "status" character varying(20) NOT NULL,
                "warnings" jsonb NOT NULL DEFAULT '[]',
                "error" character varying(500),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_db9ebf55f814446f2772e0c8d80" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_380151ef2914bb622b4c575802" ON "trade_import_batches" ("user_id")
        `);
        await queryRunner.query(`
            CREATE TABLE "trade_import_rows" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "batch_id" uuid NOT NULL,
                "row_number" integer NOT NULL,
                "status" character varying(20) NOT NULL,
                "message" character varying(300),
                "parsed" jsonb NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_8cb54b1b15592bc316e8fa44b2f" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_trade_import_rows_batch" ON "trade_import_rows" ("user_id", "batch_id")
        `);
        await queryRunner.query(`
            ALTER TABLE "trades"
            ADD CONSTRAINT "FK_4720ba843240e4403c292c32082" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "trade_journal_entries"
            ADD CONSTRAINT "FK_1fbe66ae08f2f8d2baf904fe510" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "trade_journal_entries"
            ADD CONSTRAINT "FK_253af13e081e3eb876220a14617" FOREIGN KEY ("position_id") REFERENCES "trades"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "trading_settings"
            ADD CONSTRAINT "FK_58b86212a70386a1612394a1297" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "trade_import_batches"
            ADD CONSTRAINT "FK_380151ef2914bb622b4c5758026" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "trade_import_rows"
            ADD CONSTRAINT "FK_14b01afe96ecdbb87de30d06c88" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "trade_import_rows"
            ADD CONSTRAINT "FK_11c070a0769932723e8049f5818" FOREIGN KEY ("batch_id") REFERENCES "trade_import_batches"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "trade_import_rows" DROP CONSTRAINT "FK_11c070a0769932723e8049f5818"
        `);
        await queryRunner.query(`
            ALTER TABLE "trade_import_rows" DROP CONSTRAINT "FK_14b01afe96ecdbb87de30d06c88"
        `);
        await queryRunner.query(`
            ALTER TABLE "trade_import_batches" DROP CONSTRAINT "FK_380151ef2914bb622b4c5758026"
        `);
        await queryRunner.query(`
            ALTER TABLE "trading_settings" DROP CONSTRAINT "FK_58b86212a70386a1612394a1297"
        `);
        await queryRunner.query(`
            ALTER TABLE "trade_journal_entries" DROP CONSTRAINT "FK_253af13e081e3eb876220a14617"
        `);
        await queryRunner.query(`
            ALTER TABLE "trade_journal_entries" DROP CONSTRAINT "FK_1fbe66ae08f2f8d2baf904fe510"
        `);
        await queryRunner.query(`
            ALTER TABLE "trades" DROP CONSTRAINT "FK_4720ba843240e4403c292c32082"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_trade_import_rows_batch"
        `);
        await queryRunner.query(`
            DROP TABLE "trade_import_rows"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_380151ef2914bb622b4c575802"
        `);
        await queryRunner.query(`
            DROP TABLE "trade_import_batches"
        `);
        await queryRunner.query(`
            DROP TABLE "trading_settings"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_1fbe66ae08f2f8d2baf904fe51"
        `);
        await queryRunner.query(`
            DROP TABLE "trade_journal_entries"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_trades_user_date"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_trades_user_underlying"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_4720ba843240e4403c292c3208"
        `);
        await queryRunner.query(`
            DROP TABLE "trades"
        `);
    }

}
