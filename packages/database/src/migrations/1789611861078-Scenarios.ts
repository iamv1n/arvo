import { MigrationInterface, QueryRunner } from "typeorm";

export class Scenarios1789611861078 implements MigrationInterface {
    name = 'Scenarios1789611861078'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "scenarios" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "name" character varying(120) NOT NULL,
                "description" character varying(500),
                "adjustments" jsonb NOT NULL DEFAULT '[]',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_a2af4912aab626639cca306b987" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_3c8685bc2bbbe24928fbb6b211" ON "scenarios" ("user_id")
        `);
        await queryRunner.query(`
            ALTER TABLE "scenarios"
            ADD CONSTRAINT "FK_3c8685bc2bbbe24928fbb6b211b" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "scenarios" DROP CONSTRAINT "FK_3c8685bc2bbbe24928fbb6b211b"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_3c8685bc2bbbe24928fbb6b211"
        `);
        await queryRunner.query(`
            DROP TABLE "scenarios"
        `);
    }

}
