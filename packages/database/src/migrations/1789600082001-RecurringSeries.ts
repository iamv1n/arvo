import { MigrationInterface, QueryRunner } from "typeorm";

export class RecurringSeries1789600082001 implements MigrationInterface {
    name = 'RecurringSeries1789600082001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "recurring_series" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "key" character varying(400) NOT NULL,
                "label" character varying(200) NOT NULL,
                "merchant_id" uuid,
                "category_id" uuid,
                "account_id" uuid NOT NULL,
                "currency" character(3) NOT NULL,
                "frequency" character varying(16) NOT NULL,
                "expected_amount" numeric(19, 4) NOT NULL,
                "monthly_cost" numeric(19, 4) NOT NULL,
                "last_amount" numeric(19, 4) NOT NULL,
                "previous_amount" numeric(19, 4),
                "last_seen" date NOT NULL,
                "next_expected" date NOT NULL,
                "occurrences" integer NOT NULL,
                "confidence" numeric(3, 2) NOT NULL,
                "status" character varying(16) NOT NULL,
                "is_dismissed" boolean NOT NULL DEFAULT false,
                "transaction_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "uq_recurring_series_user_key" UNIQUE ("user_id", "key"),
                CONSTRAINT "PK_7fcaea4f0c1df8dd8e52dad90d8" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            ALTER TABLE "transactions"
            ALTER COLUMN "metadata"
            SET DEFAULT '{}'::jsonb
        `);
        await queryRunner.query(`
            ALTER TABLE "import_rows"
            ALTER COLUMN "issues"
            SET DEFAULT '[]'::jsonb
        `);
        await queryRunner.query(`
            ALTER TABLE "recurring_series"
            ADD CONSTRAINT "FK_93688a0ff06f96d5d1ffef5270a" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "recurring_series"
            ADD CONSTRAINT "FK_724a637abb5cc44a5ef3f36204e" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "recurring_series"
            ADD CONSTRAINT "FK_88a870d13f8b06181a6ffa8bc53" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "recurring_series"
            ADD CONSTRAINT "FK_0909ca557dfe17e9c33ab3d92ee" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "recurring_series" DROP CONSTRAINT "FK_0909ca557dfe17e9c33ab3d92ee"
        `);
        await queryRunner.query(`
            ALTER TABLE "recurring_series" DROP CONSTRAINT "FK_88a870d13f8b06181a6ffa8bc53"
        `);
        await queryRunner.query(`
            ALTER TABLE "recurring_series" DROP CONSTRAINT "FK_724a637abb5cc44a5ef3f36204e"
        `);
        await queryRunner.query(`
            ALTER TABLE "recurring_series" DROP CONSTRAINT "FK_93688a0ff06f96d5d1ffef5270a"
        `);
        await queryRunner.query(`
            ALTER TABLE "import_rows"
            ALTER COLUMN "issues"
            SET DEFAULT '[]'
        `);
        await queryRunner.query(`
            ALTER TABLE "transactions"
            ALTER COLUMN "metadata"
            SET DEFAULT '{}'
        `);
        await queryRunner.query(`
            DROP TABLE "recurring_series"
        `);
    }

}
