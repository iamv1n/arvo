import { MigrationInterface, QueryRunner } from "typeorm";

export class ApiTokens1789601150793 implements MigrationInterface {
    name = 'ApiTokens1789601150793'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "api_tokens" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "name" character varying(80) NOT NULL,
                "token_prefix" character varying(16) NOT NULL,
                "token_hash" character(64) NOT NULL,
                "scopes" jsonb NOT NULL DEFAULT '["read"]',
                "last_used_at" TIMESTAMP WITH TIME ZONE,
                "expires_at" TIMESTAMP WITH TIME ZONE,
                "revoked_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_bbd687a104e1921e6702c6e3aad" UNIQUE ("token_hash"),
                CONSTRAINT "PK_c587455266b5fa8dace7194caac" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_b74883f5884a42fd8496d389b2" ON "api_tokens" ("user_id")
        `);
        await queryRunner.query(`
            ALTER TABLE "api_tokens"
            ADD CONSTRAINT "FK_b74883f5884a42fd8496d389b25" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "api_tokens" DROP CONSTRAINT "FK_b74883f5884a42fd8496d389b25"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_b74883f5884a42fd8496d389b2"
        `);
        await queryRunner.query(`
            DROP TABLE "api_tokens"
        `);
    }

}
