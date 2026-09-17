import { MigrationInterface, QueryRunner } from "typeorm";

export class AuthSecurity1789613065994 implements MigrationInterface {
    name = 'AuthSecurity1789613065994'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "auth_tokens" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "purpose" character varying(32) NOT NULL,
                "token_hash" character(64) NOT NULL,
                "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "consumed_at" TIMESTAMP WITH TIME ZONE,
                "attempts" integer NOT NULL DEFAULT '0',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_41e9ddfbb32da18c4e85e45c2fd" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_3a94cfa1eada85ac2bf6f3016b" ON "auth_tokens" ("token_hash")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_8291a56d41c8e1b6e6b536c9af" ON "auth_tokens" ("user_id", "purpose")
        `);
        await queryRunner.query(`
            CREATE TABLE "recovery_codes" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "code_hash" character(64) NOT NULL,
                "used_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_0723b9e53961e799027d7f7ba32" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_fb82b2ac740ca095b617afad03" ON "recovery_codes" ("user_id")
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD "email_verified_at" TIMESTAMP WITH TIME ZONE
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD "two_factor_enabled_at" TIMESTAMP WITH TIME ZONE
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD "totp_secret" text
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD "totp_pending_secret" text
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD "totp_last_step" bigint
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD "two_factor_failed_attempts" integer NOT NULL DEFAULT '0'
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD "two_factor_locked_until" TIMESTAMP WITH TIME ZONE
        `);
        await queryRunner.query(`
            ALTER TABLE "auth_tokens"
            ADD CONSTRAINT "FK_9691367d446cd8b18f462c191b3" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "recovery_codes"
            ADD CONSTRAINT "FK_fb82b2ac740ca095b617afad031" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "recovery_codes" DROP CONSTRAINT "FK_fb82b2ac740ca095b617afad031"
        `);
        await queryRunner.query(`
            ALTER TABLE "auth_tokens" DROP CONSTRAINT "FK_9691367d446cd8b18f462c191b3"
        `);
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "two_factor_locked_until"
        `);
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "two_factor_failed_attempts"
        `);
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "totp_last_step"
        `);
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "totp_pending_secret"
        `);
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "totp_secret"
        `);
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "two_factor_enabled_at"
        `);
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "email_verified_at"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_fb82b2ac740ca095b617afad03"
        `);
        await queryRunner.query(`
            DROP TABLE "recovery_codes"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_8291a56d41c8e1b6e6b536c9af"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_3a94cfa1eada85ac2bf6f3016b"
        `);
        await queryRunner.query(`
            DROP TABLE "auth_tokens"
        `);
    }

}
