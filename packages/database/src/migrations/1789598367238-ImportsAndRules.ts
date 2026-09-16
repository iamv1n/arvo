import { MigrationInterface, QueryRunner } from "typeorm";

export class ImportsAndRules1789598367238 implements MigrationInterface {
    name = 'ImportsAndRules1789598367238'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TYPE "public"."import_status" AS ENUM(
                'PENDING',
                'PROCESSING',
                'REVIEW',
                'COMPLETED',
                'FAILED',
                'CANCELLED'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "import_batches" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "account_id" uuid NOT NULL,
                "filename" character varying(255) NOT NULL,
                "file_type" character varying(8) NOT NULL,
                "file_hash" character(64) NOT NULL,
                "file_size" integer NOT NULL,
                "storage_key" character varying(255) NOT NULL,
                "status" "public"."import_status" NOT NULL,
                "total_rows" integer NOT NULL DEFAULT '0',
                "processed_rows" integer NOT NULL DEFAULT '0',
                "mapping" jsonb,
                "detection" jsonb,
                "duplicate_of_batch_id" uuid,
                "error_message" text,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "completed_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_6162597a2576c03e04bb2c1a2dd" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_import_batches_user_account_hash" ON "import_batches" ("user_id", "account_id", "file_hash")
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_import_batches_user_created" ON "import_batches" ("user_id", "created_at")
        `);
        await queryRunner.query(`
            CREATE TABLE "import_rows" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "batch_id" uuid NOT NULL,
                "user_id" uuid NOT NULL,
                "row_number" integer NOT NULL,
                "raw" jsonb NOT NULL,
                "date" date,
                "description" character varying(500),
                "amount" numeric(19, 4),
                "currency" character(3),
                "type" "public"."transaction_type",
                "merchant_name" character varying(120),
                "category_id" uuid,
                "categorization_source" character varying(16),
                "source_reference" character varying(255),
                "fingerprint" character(64),
                "status" character varying(24) NOT NULL,
                "decision" character varying(16) NOT NULL,
                "duplicate_of_transaction_id" uuid,
                "issues" jsonb NOT NULL DEFAULT '[]'::jsonb,
                "transaction_id" uuid,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_45b442c5ced30d539ba20c3ec32" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_import_rows_batch_status" ON "import_rows" ("batch_id", "status")
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_import_rows_batch_row" ON "import_rows" ("batch_id", "row_number")
        `);
        await queryRunner.query(`
            CREATE TABLE "import_errors" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "batch_id" uuid NOT NULL,
                "user_id" uuid NOT NULL,
                "row_number" integer,
                "code" character varying(64) NOT NULL,
                "message" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_c65e36717920cb27df5578dc5ee" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_import_errors_batch" ON "import_errors" ("batch_id")
        `);
        await queryRunner.query(`
            CREATE TABLE "import_column_mappings" (
                "user_id" uuid NOT NULL,
                "header_signature" character(64) NOT NULL,
                "mapping" jsonb NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_48253f34395cc2cb21386a39f9c" PRIMARY KEY ("user_id", "header_signature")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "rules" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "name" character varying(120) NOT NULL,
                "priority" integer NOT NULL,
                "is_active" boolean NOT NULL DEFAULT true,
                "conditions" jsonb NOT NULL,
                "actions" jsonb NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_10fef696a7d61140361b1b23608" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_rules_user_priority" ON "rules" ("user_id", "priority")
        `);
        await queryRunner.query(`
            ALTER TABLE "transactions"
            ALTER COLUMN "metadata"
            SET DEFAULT '{}'::jsonb
        `);
        await queryRunner.query(`
            ALTER TABLE "import_batches"
            ADD CONSTRAINT "FK_b75a8496dcd95067be919bba660" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "import_batches"
            ADD CONSTRAINT "FK_7ef70ec6616d8cb7a4ad99ddae1" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "import_rows"
            ADD CONSTRAINT "FK_73fa592a1cb50af7896b58172e5" FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "import_rows"
            ADD CONSTRAINT "FK_a2db02d28a5ea93ed0d35b24f19" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "import_rows"
            ADD CONSTRAINT "FK_f3012ec1fadae98ac8d906ecf9c" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "import_rows"
            ADD CONSTRAINT "FK_9366242c3252f4a422e2b5ca65c" FOREIGN KEY ("duplicate_of_transaction_id") REFERENCES "transactions"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "import_rows"
            ADD CONSTRAINT "FK_3fe05715c3eba7aef5689dc437d" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "import_errors"
            ADD CONSTRAINT "FK_164b00ad97765998944c0e12a76" FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "import_errors"
            ADD CONSTRAINT "FK_06db41293b5f2c9512119556788" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "import_column_mappings"
            ADD CONSTRAINT "FK_c11c3291515cdf65508247c3ed4" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "rules"
            ADD CONSTRAINT "FK_a25301750f8ef387215a9c6043b" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "rules" DROP CONSTRAINT "FK_a25301750f8ef387215a9c6043b"
        `);
        await queryRunner.query(`
            ALTER TABLE "import_column_mappings" DROP CONSTRAINT "FK_c11c3291515cdf65508247c3ed4"
        `);
        await queryRunner.query(`
            ALTER TABLE "import_errors" DROP CONSTRAINT "FK_06db41293b5f2c9512119556788"
        `);
        await queryRunner.query(`
            ALTER TABLE "import_errors" DROP CONSTRAINT "FK_164b00ad97765998944c0e12a76"
        `);
        await queryRunner.query(`
            ALTER TABLE "import_rows" DROP CONSTRAINT "FK_3fe05715c3eba7aef5689dc437d"
        `);
        await queryRunner.query(`
            ALTER TABLE "import_rows" DROP CONSTRAINT "FK_9366242c3252f4a422e2b5ca65c"
        `);
        await queryRunner.query(`
            ALTER TABLE "import_rows" DROP CONSTRAINT "FK_f3012ec1fadae98ac8d906ecf9c"
        `);
        await queryRunner.query(`
            ALTER TABLE "import_rows" DROP CONSTRAINT "FK_a2db02d28a5ea93ed0d35b24f19"
        `);
        await queryRunner.query(`
            ALTER TABLE "import_rows" DROP CONSTRAINT "FK_73fa592a1cb50af7896b58172e5"
        `);
        await queryRunner.query(`
            ALTER TABLE "import_batches" DROP CONSTRAINT "FK_7ef70ec6616d8cb7a4ad99ddae1"
        `);
        await queryRunner.query(`
            ALTER TABLE "import_batches" DROP CONSTRAINT "FK_b75a8496dcd95067be919bba660"
        `);
        await queryRunner.query(`
            ALTER TABLE "transactions"
            ALTER COLUMN "metadata"
            SET DEFAULT '{}'
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_rules_user_priority"
        `);
        await queryRunner.query(`
            DROP TABLE "rules"
        `);
        await queryRunner.query(`
            DROP TABLE "import_column_mappings"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_import_errors_batch"
        `);
        await queryRunner.query(`
            DROP TABLE "import_errors"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_import_rows_batch_row"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_import_rows_batch_status"
        `);
        await queryRunner.query(`
            DROP TABLE "import_rows"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_import_batches_user_created"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_import_batches_user_account_hash"
        `);
        await queryRunner.query(`
            DROP TABLE "import_batches"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."import_status"
        `);
    }

}
