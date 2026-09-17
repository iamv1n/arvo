import { MigrationInterface, QueryRunner } from "typeorm";

export class OAuth1789603168147 implements MigrationInterface {
    name = 'OAuth1789603168147'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "oauth_clients" (
                "client_id" character varying(512) NOT NULL,
                "client_name" character varying(200) NOT NULL,
                "redirect_uris" jsonb NOT NULL,
                "client_uri" character varying(512),
                "logo_uri" character varying(512),
                "registration_type" character varying(8) NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "fetched_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_c5c4af500cc8bfc05500fff7f90" PRIMARY KEY ("client_id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "oauth_authorizations" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "client_id" character varying(512) NOT NULL,
                "user_id" uuid,
                "redirect_uri" character varying(1024) NOT NULL,
                "scope" character varying(200) NOT NULL,
                "state" character varying(1024),
                "code_challenge" character varying(128) NOT NULL,
                "resource" character varying(512) NOT NULL,
                "status" character varying(12) NOT NULL,
                "code_hash" character(64),
                "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_0b25c4c6ffe0302852a061f47a6" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_341514def8c8d0469e7fd63bc2" ON "oauth_authorizations" ("code_hash")
            WHERE code_hash IS NOT NULL
        `);
        await queryRunner.query(`
            CREATE TABLE "oauth_tokens" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "client_id" character varying(512) NOT NULL,
                "scope" character varying(200) NOT NULL,
                "resource" character varying(512) NOT NULL,
                "access_token_hash" character(64) NOT NULL,
                "access_expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "refresh_token_hash" character(64) NOT NULL,
                "refresh_expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "last_used_at" TIMESTAMP WITH TIME ZONE,
                "revoked_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_71c8b8060826696206f973554fd" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_106cc08f99327d67172b5ecf4a" ON "oauth_tokens" ("access_token_hash")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_c740cc0990265bb0e8e51ca986" ON "oauth_tokens" ("refresh_token_hash")
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_oauth_tokens_user_client" ON "oauth_tokens" ("user_id", "client_id")
        `);
        await queryRunner.query(`
            ALTER TABLE "oauth_authorizations"
            ADD CONSTRAINT "FK_b48048a7a965fc23fb8e63de205" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("client_id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "oauth_authorizations"
            ADD CONSTRAINT "FK_a3581ce3ba8104404987beb00c8" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "oauth_tokens"
            ADD CONSTRAINT "FK_3e1f029633b2bfa8d72911be212" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "oauth_tokens"
            ADD CONSTRAINT "FK_be15e1038f434b11598ed586fef" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("client_id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "oauth_tokens" DROP CONSTRAINT "FK_be15e1038f434b11598ed586fef"
        `);
        await queryRunner.query(`
            ALTER TABLE "oauth_tokens" DROP CONSTRAINT "FK_3e1f029633b2bfa8d72911be212"
        `);
        await queryRunner.query(`
            ALTER TABLE "oauth_authorizations" DROP CONSTRAINT "FK_a3581ce3ba8104404987beb00c8"
        `);
        await queryRunner.query(`
            ALTER TABLE "oauth_authorizations" DROP CONSTRAINT "FK_b48048a7a965fc23fb8e63de205"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_oauth_tokens_user_client"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_c740cc0990265bb0e8e51ca986"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_106cc08f99327d67172b5ecf4a"
        `);
        await queryRunner.query(`
            DROP TABLE "oauth_tokens"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_341514def8c8d0469e7fd63bc2"
        `);
        await queryRunner.query(`
            DROP TABLE "oauth_authorizations"
        `);
        await queryRunner.query(`
            DROP TABLE "oauth_clients"
        `);
    }

}
