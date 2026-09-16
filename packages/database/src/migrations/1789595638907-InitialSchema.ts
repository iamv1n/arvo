import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1789595638907 implements MigrationInterface {
    name = 'InitialSchema1789595638907'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "users" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "email" character varying(320) NOT NULL,
                "password_hash" text NOT NULL,
                "name" character varying(120) NOT NULL,
                "currency" character(3) NOT NULL DEFAULT 'INR',
                "timezone" character varying(64) NOT NULL DEFAULT 'Asia/Kolkata',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"),
                CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."account_type" AS ENUM(
                'BANK',
                'CREDIT_CARD',
                'CASH',
                'BROKER',
                'MUTUAL_FUND',
                'LOAN',
                'OTHER'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "accounts" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "name" character varying(120) NOT NULL,
                "type" "public"."account_type" NOT NULL,
                "institution" character varying(120),
                "currency" character(3) NOT NULL,
                "opening_balance" numeric(19, 4) NOT NULL DEFAULT '0',
                "is_active" boolean NOT NULL DEFAULT true,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_5a7a02c20412299d198e097a8fe" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_3000dad1da61b29953f0747632" ON "accounts" ("user_id")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."category_type" AS ENUM('INCOME', 'EXPENSE', 'TRANSFER')
        `);
        await queryRunner.query(`
            CREATE TABLE "categories" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid,
                "name" character varying(80) NOT NULL,
                "parent_id" uuid,
                "type" "public"."category_type" NOT NULL,
                "is_system" boolean NOT NULL DEFAULT false,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_2296b7fe012d95646fa41921c8" ON "categories" ("user_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_88cea2dc9c31951d06437879b4" ON "categories" ("parent_id")
        `);
        await queryRunner.query(`
            CREATE TABLE "merchants" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "name" character varying(120) NOT NULL,
                "normalized_name" character varying(120) NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "uq_merchants_user_normalized_name" UNIQUE ("user_id", "normalized_name"),
                CONSTRAINT "PK_4fd312ef25f8e05ad47bfe7ed25" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "refresh_tokens" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "token_hash" character(64) NOT NULL,
                "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "revoked_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_a7838d2ba25be1342091b6695f1" UNIQUE ("token_hash"),
                CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_3ddc983c5f7bcf132fd8732c3f" ON "refresh_tokens" ("user_id")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."transaction_type" AS ENUM(
                'INCOME',
                'EXPENSE',
                'TRANSFER',
                'REFUND',
                'FEE',
                'INTEREST',
                'UNKNOWN'
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."transaction_status" AS ENUM('PENDING', 'CLEARED', 'POSSIBLE_DUPLICATE')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."transaction_source" AS ENUM('MANUAL', 'CSV', 'XLSX', 'PDF')
        `);
        await queryRunner.query(`
            CREATE TABLE "transactions" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "account_id" uuid NOT NULL,
                "date" date NOT NULL,
                "description" character varying(500) NOT NULL,
                "merchant_id" uuid,
                "category_id" uuid,
                "amount" numeric(19, 4) NOT NULL,
                "currency" character(3) NOT NULL,
                "type" "public"."transaction_type" NOT NULL,
                "status" "public"."transaction_status" NOT NULL,
                "source" "public"."transaction_source" NOT NULL,
                "source_reference" character varying(255),
                "notes" text,
                "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
                "fingerprint" character(64) NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_a219afd8dd77ed80f5a862f1db9" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_transactions_user_fingerprint" ON "transactions" ("user_id", "fingerprint")
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_transactions_user_merchant_date" ON "transactions" ("user_id", "merchant_id", "date")
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_transactions_user_category_date" ON "transactions" ("user_id", "category_id", "date")
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_transactions_user_account_date" ON "transactions" ("user_id", "account_id", "date")
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_transactions_user_date" ON "transactions" ("user_id", "date")
        `);
        await queryRunner.query(`
            CREATE TABLE "transfers" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "from_transaction_id" uuid NOT NULL,
                "to_transaction_id" uuid NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "REL_368e316f173e0fb3455d516725" UNIQUE ("from_transaction_id"),
                CONSTRAINT "REL_790576549e54effd5d04c9d3fa" UNIQUE ("to_transaction_id"),
                CONSTRAINT "chk_transfers_distinct_legs" CHECK ("from_transaction_id" <> "to_transaction_id"),
                CONSTRAINT "PK_f712e908b465e0085b4408cabc3" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_ba27d1ebe999481ff98cfe51f6" ON "transfers" ("user_id")
        `);
        await queryRunner.query(`
            ALTER TABLE "accounts"
            ADD CONSTRAINT "FK_3000dad1da61b29953f07476324" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "categories"
            ADD CONSTRAINT "FK_2296b7fe012d95646fa41921c8b" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "categories"
            ADD CONSTRAINT "FK_88cea2dc9c31951d06437879b40" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "merchants"
            ADD CONSTRAINT "FK_698f612a3134c503f711479a4e5" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "refresh_tokens"
            ADD CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "transactions"
            ADD CONSTRAINT "FK_e9acc6efa76de013e8c1553ed2b" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "transactions"
            ADD CONSTRAINT "FK_49c0d6e8ba4bfb5582000d851f0" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "transactions"
            ADD CONSTRAINT "FK_e80829a78860eadca0d60c8e21f" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "transactions"
            ADD CONSTRAINT "FK_c9e41213ca42d50132ed7ab2b0f" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "transfers"
            ADD CONSTRAINT "FK_ba27d1ebe999481ff98cfe51f6c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "transfers"
            ADD CONSTRAINT "FK_368e316f173e0fb3455d516725a" FOREIGN KEY ("from_transaction_id") REFERENCES "transactions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "transfers"
            ADD CONSTRAINT "FK_790576549e54effd5d04c9d3fa4" FOREIGN KEY ("to_transaction_id") REFERENCES "transactions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "transfers" DROP CONSTRAINT "FK_790576549e54effd5d04c9d3fa4"
        `);
        await queryRunner.query(`
            ALTER TABLE "transfers" DROP CONSTRAINT "FK_368e316f173e0fb3455d516725a"
        `);
        await queryRunner.query(`
            ALTER TABLE "transfers" DROP CONSTRAINT "FK_ba27d1ebe999481ff98cfe51f6c"
        `);
        await queryRunner.query(`
            ALTER TABLE "transactions" DROP CONSTRAINT "FK_c9e41213ca42d50132ed7ab2b0f"
        `);
        await queryRunner.query(`
            ALTER TABLE "transactions" DROP CONSTRAINT "FK_e80829a78860eadca0d60c8e21f"
        `);
        await queryRunner.query(`
            ALTER TABLE "transactions" DROP CONSTRAINT "FK_49c0d6e8ba4bfb5582000d851f0"
        `);
        await queryRunner.query(`
            ALTER TABLE "transactions" DROP CONSTRAINT "FK_e9acc6efa76de013e8c1553ed2b"
        `);
        await queryRunner.query(`
            ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4"
        `);
        await queryRunner.query(`
            ALTER TABLE "merchants" DROP CONSTRAINT "FK_698f612a3134c503f711479a4e5"
        `);
        await queryRunner.query(`
            ALTER TABLE "categories" DROP CONSTRAINT "FK_88cea2dc9c31951d06437879b40"
        `);
        await queryRunner.query(`
            ALTER TABLE "categories" DROP CONSTRAINT "FK_2296b7fe012d95646fa41921c8b"
        `);
        await queryRunner.query(`
            ALTER TABLE "accounts" DROP CONSTRAINT "FK_3000dad1da61b29953f07476324"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_ba27d1ebe999481ff98cfe51f6"
        `);
        await queryRunner.query(`
            DROP TABLE "transfers"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_transactions_user_date"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_transactions_user_account_date"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_transactions_user_category_date"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_transactions_user_merchant_date"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_transactions_user_fingerprint"
        `);
        await queryRunner.query(`
            DROP TABLE "transactions"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."transaction_source"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."transaction_status"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."transaction_type"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_3ddc983c5f7bcf132fd8732c3f"
        `);
        await queryRunner.query(`
            DROP TABLE "refresh_tokens"
        `);
        await queryRunner.query(`
            DROP TABLE "merchants"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_88cea2dc9c31951d06437879b4"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_2296b7fe012d95646fa41921c8"
        `);
        await queryRunner.query(`
            DROP TABLE "categories"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."category_type"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_3000dad1da61b29953f0747632"
        `);
        await queryRunner.query(`
            DROP TABLE "accounts"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."account_type"
        `);
        await queryRunner.query(`
            DROP TABLE "users"
        `);
    }

}
