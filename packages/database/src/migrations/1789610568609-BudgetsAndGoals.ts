import { MigrationInterface, QueryRunner } from "typeorm";

export class BudgetsAndGoals1789610568609 implements MigrationInterface {
    name = 'BudgetsAndGoals1789610568609'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "budgets" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "category_id" uuid NOT NULL,
                "amount" numeric(19, 4) NOT NULL,
                "currency" character(3) NOT NULL,
                "rollover" boolean NOT NULL DEFAULT false,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "uq_budgets_user_category_currency" UNIQUE ("user_id", "category_id", "currency"),
                CONSTRAINT "PK_9c8a51748f82387644b773da482" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "goals" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "name" character varying(120) NOT NULL,
                "target_amount" numeric(19, 4) NOT NULL,
                "currency" character(3) NOT NULL,
                "target_date" date NOT NULL,
                "account_id" uuid,
                "saved_amount" numeric(19, 4) NOT NULL DEFAULT '0',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_26e17b251afab35580dff769223" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_88b78010581f2d293699d06444" ON "goals" ("user_id")
        `);
        await queryRunner.query(`
            ALTER TABLE "budgets"
            ADD CONSTRAINT "FK_5d25d8bbd6c209261dfe04558f1" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "budgets"
            ADD CONSTRAINT "FK_4bb589bf6db49e8c1fd6af05f49" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "goals"
            ADD CONSTRAINT "FK_88b78010581f2d293699d064441" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "goals"
            ADD CONSTRAINT "FK_ef438d885c2e3bf42bb191af743" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "goals" DROP CONSTRAINT "FK_ef438d885c2e3bf42bb191af743"
        `);
        await queryRunner.query(`
            ALTER TABLE "goals" DROP CONSTRAINT "FK_88b78010581f2d293699d064441"
        `);
        await queryRunner.query(`
            ALTER TABLE "budgets" DROP CONSTRAINT "FK_4bb589bf6db49e8c1fd6af05f49"
        `);
        await queryRunner.query(`
            ALTER TABLE "budgets" DROP CONSTRAINT "FK_5d25d8bbd6c209261dfe04558f1"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_88b78010581f2d293699d06444"
        `);
        await queryRunner.query(`
            DROP TABLE "goals"
        `);
        await queryRunner.query(`
            DROP TABLE "budgets"
        `);
    }

}
