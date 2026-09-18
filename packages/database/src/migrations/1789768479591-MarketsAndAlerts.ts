import { MigrationInterface, QueryRunner } from "typeorm";

/*
 * Phase 13, Markets & Alerts.
 *
 * Adds watchlists and their items, the quote cache, the three calendars (corporate actions,
 * imported trading holidays and IPOs), user-written alerts with their trigger history, the
 * notification centre and its per-user delivery settings, news feeds and stored digests, and
 * the guardrail breach log. Trading settings gain the three self-imposed risk limits.
 *
 * Two uniqueness decisions are load bearing. markets_quotes is unique on (user_id, symbol) so
 * a refresh is an upsert rather than an append — it is a cache and a second row for the same
 * symbol would mean two answers to one question. markets_guardrail_breaches is unique on
 * (user_id, kind, period_start) so a day that goes further past a limit cannot send a second
 * email; the insert is the claim.
 *
 * The partial unique indexes on lab_market_bars are left alone: they were written by hand in
 * the Strategy Lab migration and the schema generator cannot see their WHERE clauses.
 */

export class MarketsAndAlerts1789768479591 implements MigrationInterface {
    name = 'MarketsAndAlerts1789768479591'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "markets_watchlists" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "name" character varying(120) NOT NULL,
                "notes" text,
                "position" integer NOT NULL DEFAULT '0',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_93e3bae0e7bcd12140ccd3c4fd3" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_watchlists_user" ON "markets_watchlists" ("user_id", "position")
        `);
        await queryRunner.query(`
            CREATE TABLE "markets_watchlist_items" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "watchlist_id" uuid NOT NULL,
                "symbol" character varying(64) NOT NULL,
                "exchange" character varying(16),
                "name" character varying(200),
                "isin" character varying(20),
                "scheme_code" character varying(32),
                "notes" text,
                "position" integer NOT NULL DEFAULT '0',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_b8284c502bc15776cf95d6b0e44" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_55f08cac134b74637ac7401148" ON "markets_watchlist_items" ("user_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_watchlist_items_list" ON "markets_watchlist_items" ("watchlist_id", "position")
        `);
        await queryRunner.query(`
            CREATE TABLE "markets_quotes" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "symbol" character varying(64) NOT NULL,
                "exchange" character varying(16),
                "price" numeric(19, 4) NOT NULL,
                "previous_close" numeric(19, 4),
                "as_of" date NOT NULL,
                "source" character varying(16) NOT NULL,
                "fetched_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "uq_quotes_user_symbol" UNIQUE ("user_id", "symbol"),
                CONSTRAINT "PK_cfda59c9d1ac992b29e797402bf" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "markets_corporate_actions" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "symbol" character varying(64) NOT NULL,
                "name" character varying(200),
                "kind" character varying(16) NOT NULL,
                "ex_date" date NOT NULL,
                "record_date" date,
                "pay_date" date,
                "amount" numeric(19, 4),
                "ratio" character varying(32),
                "notes" text,
                "source" character varying(16) NOT NULL DEFAULT 'MANUAL',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_98673ed02949fa14659d014901a" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_corporate_actions_user_date" ON "markets_corporate_actions" ("user_id", "ex_date")
        `);
        await queryRunner.query(`
            CREATE TABLE "markets_trading_holidays" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "date" date NOT NULL,
                "name" character varying(200) NOT NULL,
                "exchange" character varying(16) NOT NULL DEFAULT 'NSE',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "uq_holidays_user_exchange_date" UNIQUE ("user_id", "exchange", "date"),
                CONSTRAINT "PK_e06d18be0af938615d848bac36e" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "markets_ipos" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "name" character varying(200) NOT NULL,
                "symbol" character varying(64),
                "open_date" date,
                "close_date" date,
                "price_band_low" numeric(19, 4),
                "price_band_high" numeric(19, 4),
                "lot_size" integer,
                "listing_date" date,
                "status" character varying(16) NOT NULL DEFAULT 'UPCOMING',
                "notes" text,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_27e520081051fd6415f48712baf" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_ipos_user" ON "markets_ipos" ("user_id", "open_date")
        `);
        await queryRunner.query(`
            CREATE TABLE "markets_alerts" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "name" character varying(120) NOT NULL,
                "kind" character varying(32) NOT NULL,
                "params" jsonb NOT NULL,
                "is_enabled" boolean NOT NULL DEFAULT true,
                "cooldown_minutes" integer NOT NULL DEFAULT '1440',
                "repeats" boolean NOT NULL DEFAULT false,
                "channels" jsonb NOT NULL DEFAULT '["IN_APP"]'::jsonb,
                "last_triggered_at" TIMESTAMP WITH TIME ZONE,
                "last_evaluated_at" TIMESTAMP WITH TIME ZONE,
                "last_status" character varying(24),
                "last_message" text,
                "trigger_count" integer NOT NULL DEFAULT '0',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_caf1c461b6a19da3bda59c14d9b" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_alerts_enabled" ON "markets_alerts" ("is_enabled")
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_alerts_user" ON "markets_alerts" ("user_id")
        `);
        await queryRunner.query(`
            CREATE TABLE "markets_alert_triggers" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "alert_id" uuid NOT NULL,
                "fired_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "message" text NOT NULL,
                "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
                "channels" jsonb NOT NULL DEFAULT '[]'::jsonb,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_5ee6e4b4fa9b02199c0d5b5cb9f" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_9daedd42ff8851cdf289780af7" ON "markets_alert_triggers" ("user_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_alert_triggers_alert" ON "markets_alert_triggers" ("alert_id", "fired_at")
        `);
        await queryRunner.query(`
            CREATE TABLE "markets_notifications" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "kind" character varying(24) NOT NULL,
                "title" character varying(200) NOT NULL,
                "body" text NOT NULL,
                "link" character varying(300),
                "read_at" TIMESTAMP WITH TIME ZONE,
                "meta" jsonb NOT NULL DEFAULT '{}'::jsonb,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_b0e8a83047b50f5002cff7177fa" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_notifications_user_created" ON "markets_notifications" ("user_id", "created_at")
        `);
        await queryRunner.query(`
            CREATE TABLE "markets_notification_settings" (
                "user_id" uuid NOT NULL,
                "in_app_enabled" boolean NOT NULL DEFAULT true,
                "email_enabled" boolean NOT NULL DEFAULT false,
                "telegram_enabled" boolean NOT NULL DEFAULT false,
                "telegram_chat_id" character varying(64),
                "quiet_hours_start" character varying(5),
                "quiet_hours_end" character varying(5),
                "timezone" character varying(64) NOT NULL DEFAULT 'Asia/Kolkata',
                "stale_quote_minutes" integer NOT NULL DEFAULT '1440',
                "refresh_cooldown_seconds" integer NOT NULL DEFAULT '60',
                "news_digest_frequency" character varying(16) NOT NULL DEFAULT 'off',
                "expiry_rules" jsonb NOT NULL DEFAULT '[]'::jsonb,
                "portfolio_peak_value" numeric(19, 4),
                "portfolio_peak_on" date,
                "last_quote_refresh_at" TIMESTAMP WITH TIME ZONE,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_e13b25ffb828255a6444bf4bd09" PRIMARY KEY ("user_id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "markets_news_feeds" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "url" character varying(500) NOT NULL,
                "title" character varying(200),
                "is_enabled" boolean NOT NULL DEFAULT true,
                "last_fetched_at" TIMESTAMP WITH TIME ZONE,
                "last_error" text,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_2ecc74a7db49317a0ee02596d1f" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_news_feeds_user" ON "markets_news_feeds" ("user_id")
        `);
        await queryRunner.query(`
            CREATE TABLE "markets_news_digests" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "period_start" date NOT NULL,
                "period_end" date NOT NULL,
                "items" jsonb NOT NULL DEFAULT '[]'::jsonb,
                "provider" character varying(32) NOT NULL DEFAULT 'none',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_9479cb7b6a30acea1f2a3b05eae" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_news_digests_user" ON "markets_news_digests" ("user_id", "created_at")
        `);
        await queryRunner.query(`
            CREATE TABLE "markets_guardrail_breaches" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "kind" character varying(24) NOT NULL,
                "period_start" date NOT NULL,
                "limit" numeric(24, 5) NOT NULL,
                "actual" numeric(24, 5) NOT NULL,
                "notified_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "uq_guardrail_user_kind_period" UNIQUE ("user_id", "kind", "period_start"),
                CONSTRAINT "PK_fcc041bd5dc104870b1afd48c31" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            ALTER TABLE "trading_settings"
            ADD "max_loss_per_day" numeric(19, 4)
        `);
        await queryRunner.query(`
            ALTER TABLE "trading_settings"
            ADD "max_loss_per_week" numeric(19, 4)
        `);
        await queryRunner.query(`
            ALTER TABLE "trading_settings"
            ADD "max_trades_per_day" integer
        `);
        await queryRunner.query(`
            ALTER TABLE "markets_watchlists"
            ADD CONSTRAINT "FK_060cbd45751aa2c6bcbc2f6f4e4" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "markets_watchlist_items"
            ADD CONSTRAINT "FK_55f08cac134b74637ac7401148f" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "markets_watchlist_items"
            ADD CONSTRAINT "FK_271ff212e2aadebbaa5fc8363c4" FOREIGN KEY ("watchlist_id") REFERENCES "markets_watchlists"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "markets_quotes"
            ADD CONSTRAINT "FK_253e67a4572d2b3b75fdcd8bc4b" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "markets_corporate_actions"
            ADD CONSTRAINT "FK_de3a417ecea45089049446cc9f0" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "markets_trading_holidays"
            ADD CONSTRAINT "FK_697f2757bd173d3a99f07bd0876" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "markets_ipos"
            ADD CONSTRAINT "FK_805c79cd9cf09120f7a8a3967a6" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "markets_alerts"
            ADD CONSTRAINT "FK_b32e404f435de8fd1d6bf3a1e97" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "markets_alert_triggers"
            ADD CONSTRAINT "FK_9daedd42ff8851cdf289780af7f" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "markets_alert_triggers"
            ADD CONSTRAINT "FK_85378a5feb7b205e3ffbfcf1dd0" FOREIGN KEY ("alert_id") REFERENCES "markets_alerts"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "markets_notifications"
            ADD CONSTRAINT "FK_fe535ee0b5250f937c12fcefc25" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "markets_notification_settings"
            ADD CONSTRAINT "FK_e13b25ffb828255a6444bf4bd09" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "markets_news_feeds"
            ADD CONSTRAINT "FK_177266ff349d398896877894417" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "markets_news_digests"
            ADD CONSTRAINT "FK_ddeac3813d03c67ddd0b0096c71" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "markets_guardrail_breaches"
            ADD CONSTRAINT "FK_cfb2a7a136e990a3fd274bccc26" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "markets_guardrail_breaches" DROP CONSTRAINT "FK_cfb2a7a136e990a3fd274bccc26"
        `);
        await queryRunner.query(`
            ALTER TABLE "markets_news_digests" DROP CONSTRAINT "FK_ddeac3813d03c67ddd0b0096c71"
        `);
        await queryRunner.query(`
            ALTER TABLE "markets_news_feeds" DROP CONSTRAINT "FK_177266ff349d398896877894417"
        `);
        await queryRunner.query(`
            ALTER TABLE "markets_notification_settings" DROP CONSTRAINT "FK_e13b25ffb828255a6444bf4bd09"
        `);
        await queryRunner.query(`
            ALTER TABLE "markets_notifications" DROP CONSTRAINT "FK_fe535ee0b5250f937c12fcefc25"
        `);
        await queryRunner.query(`
            ALTER TABLE "markets_alert_triggers" DROP CONSTRAINT "FK_85378a5feb7b205e3ffbfcf1dd0"
        `);
        await queryRunner.query(`
            ALTER TABLE "markets_alert_triggers" DROP CONSTRAINT "FK_9daedd42ff8851cdf289780af7f"
        `);
        await queryRunner.query(`
            ALTER TABLE "markets_alerts" DROP CONSTRAINT "FK_b32e404f435de8fd1d6bf3a1e97"
        `);
        await queryRunner.query(`
            ALTER TABLE "markets_ipos" DROP CONSTRAINT "FK_805c79cd9cf09120f7a8a3967a6"
        `);
        await queryRunner.query(`
            ALTER TABLE "markets_trading_holidays" DROP CONSTRAINT "FK_697f2757bd173d3a99f07bd0876"
        `);
        await queryRunner.query(`
            ALTER TABLE "markets_corporate_actions" DROP CONSTRAINT "FK_de3a417ecea45089049446cc9f0"
        `);
        await queryRunner.query(`
            ALTER TABLE "markets_quotes" DROP CONSTRAINT "FK_253e67a4572d2b3b75fdcd8bc4b"
        `);
        await queryRunner.query(`
            ALTER TABLE "markets_watchlist_items" DROP CONSTRAINT "FK_271ff212e2aadebbaa5fc8363c4"
        `);
        await queryRunner.query(`
            ALTER TABLE "markets_watchlist_items" DROP CONSTRAINT "FK_55f08cac134b74637ac7401148f"
        `);
        await queryRunner.query(`
            ALTER TABLE "markets_watchlists" DROP CONSTRAINT "FK_060cbd45751aa2c6bcbc2f6f4e4"
        `);
        await queryRunner.query(`
            ALTER TABLE "trading_settings" DROP COLUMN "max_trades_per_day"
        `);
        await queryRunner.query(`
            ALTER TABLE "trading_settings" DROP COLUMN "max_loss_per_week"
        `);
        await queryRunner.query(`
            ALTER TABLE "trading_settings" DROP COLUMN "max_loss_per_day"
        `);
        await queryRunner.query(`
            DROP TABLE "markets_guardrail_breaches"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_news_digests_user"
        `);
        await queryRunner.query(`
            DROP TABLE "markets_news_digests"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_news_feeds_user"
        `);
        await queryRunner.query(`
            DROP TABLE "markets_news_feeds"
        `);
        await queryRunner.query(`
            DROP TABLE "markets_notification_settings"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_notifications_user_created"
        `);
        await queryRunner.query(`
            DROP TABLE "markets_notifications"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_alert_triggers_alert"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_9daedd42ff8851cdf289780af7"
        `);
        await queryRunner.query(`
            DROP TABLE "markets_alert_triggers"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_alerts_user"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_alerts_enabled"
        `);
        await queryRunner.query(`
            DROP TABLE "markets_alerts"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_ipos_user"
        `);
        await queryRunner.query(`
            DROP TABLE "markets_ipos"
        `);
        await queryRunner.query(`
            DROP TABLE "markets_trading_holidays"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_corporate_actions_user_date"
        `);
        await queryRunner.query(`
            DROP TABLE "markets_corporate_actions"
        `);
        await queryRunner.query(`
            DROP TABLE "markets_quotes"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_watchlist_items_list"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_55f08cac134b74637ac7401148"
        `);
        await queryRunner.query(`
            DROP TABLE "markets_watchlist_items"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_watchlists_user"
        `);
        await queryRunner.query(`
            DROP TABLE "markets_watchlists"
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_lab_bars_daily" ON "lab_market_bars" USING btree ("date", "symbol", "timeframe", "user_id")
            WHERE ("time" IS NULL)
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_lab_bars_intraday" ON "lab_market_bars" USING btree ("date", "symbol", "time", "timeframe", "user_id")
            WHERE ("time" IS NOT NULL)
        `);
    }

}
