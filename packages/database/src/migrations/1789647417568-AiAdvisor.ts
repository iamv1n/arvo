import { MigrationInterface, QueryRunner } from "typeorm";

export class AiAdvisor1789647417568 implements MigrationInterface {
    name = 'AiAdvisor1789647417568'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "advisor_conversations" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "title" character varying(120) NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_f32591f67e4adcb994f256ccf72" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_advisor_conversations_user_updated" ON "advisor_conversations" ("user_id", "updated_at")
        `);
        await queryRunner.query(`
            CREATE TABLE "advisor_messages" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "conversation_id" uuid NOT NULL,
                "user_id" uuid NOT NULL,
                "role" character varying(16) NOT NULL,
                "content" text NOT NULL DEFAULT '',
                "status" character varying(16) NOT NULL DEFAULT 'complete',
                "tool_calls" jsonb NOT NULL DEFAULT '[]',
                "provider" character varying(16),
                "model" character varying(80),
                "error_code" character varying(40),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_4b4f9127913c82fa7063a10f33c" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_advisor_messages_conversation_created" ON "advisor_messages" ("conversation_id", "created_at")
        `);
        await queryRunner.query(`
            CREATE TABLE "advisor_suggestions" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "conversation_id" uuid,
                "message_id" uuid,
                "kind" character varying(16) NOT NULL,
                "status" character varying(16) NOT NULL DEFAULT 'pending',
                "payload" jsonb NOT NULL,
                "rationale" text NOT NULL,
                "provenance" jsonb NOT NULL DEFAULT '[]',
                "approved_at" TIMESTAMP WITH TIME ZONE,
                "dismissed_at" TIMESTAMP WITH TIME ZONE,
                "applied_entity_id" uuid,
                "edited" boolean NOT NULL DEFAULT false,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_66237313fafb430fd09e6e02c4f" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_advisor_suggestions_user_status" ON "advisor_suggestions" ("user_id", "status", "created_at")
        `);
        await queryRunner.query(`
            CREATE TABLE "advisor_briefings" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "week_start" date NOT NULL,
                "as_of" date NOT NULL,
                "data" jsonb NOT NULL,
                "narrative" text,
                "provider" character varying(16),
                "model" character varying(80),
                "emailed_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "uq_advisor_briefings_user_week" UNIQUE ("user_id", "week_start"),
                CONSTRAINT "PK_78052f9cc91f870ce585595919d" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD "ai_provider" character varying(16)
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD "ai_model" character varying(80)
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD "weekly_briefing" boolean NOT NULL DEFAULT false
        `);
        await queryRunner.query(`
            ALTER TABLE "advisor_conversations"
            ADD CONSTRAINT "FK_ddf618a670f22759ee67c5359ea" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "advisor_messages"
            ADD CONSTRAINT "FK_b48705bebff7f708265dbf6e05f" FOREIGN KEY ("conversation_id") REFERENCES "advisor_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "advisor_messages"
            ADD CONSTRAINT "FK_b399ea8adad9d8feb7a7698abf0" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "advisor_suggestions"
            ADD CONSTRAINT "FK_3bf0ec0743b7c9f62fac0a8a700" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "advisor_suggestions"
            ADD CONSTRAINT "FK_a1f4d06401d6fde8b33806be4c9" FOREIGN KEY ("conversation_id") REFERENCES "advisor_conversations"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "advisor_suggestions"
            ADD CONSTRAINT "FK_f7302b43fa7758fc6f7d5636496" FOREIGN KEY ("message_id") REFERENCES "advisor_messages"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "advisor_briefings"
            ADD CONSTRAINT "FK_f6274db35b3a551bc6197530d18" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "advisor_briefings" DROP CONSTRAINT "FK_f6274db35b3a551bc6197530d18"
        `);
        await queryRunner.query(`
            ALTER TABLE "advisor_suggestions" DROP CONSTRAINT "FK_f7302b43fa7758fc6f7d5636496"
        `);
        await queryRunner.query(`
            ALTER TABLE "advisor_suggestions" DROP CONSTRAINT "FK_a1f4d06401d6fde8b33806be4c9"
        `);
        await queryRunner.query(`
            ALTER TABLE "advisor_suggestions" DROP CONSTRAINT "FK_3bf0ec0743b7c9f62fac0a8a700"
        `);
        await queryRunner.query(`
            ALTER TABLE "advisor_messages" DROP CONSTRAINT "FK_b399ea8adad9d8feb7a7698abf0"
        `);
        await queryRunner.query(`
            ALTER TABLE "advisor_messages" DROP CONSTRAINT "FK_b48705bebff7f708265dbf6e05f"
        `);
        await queryRunner.query(`
            ALTER TABLE "advisor_conversations" DROP CONSTRAINT "FK_ddf618a670f22759ee67c5359ea"
        `);
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "weekly_briefing"
        `);
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "ai_model"
        `);
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "ai_provider"
        `);
        await queryRunner.query(`
            DROP TABLE "advisor_briefings"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_advisor_suggestions_user_status"
        `);
        await queryRunner.query(`
            DROP TABLE "advisor_suggestions"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_advisor_messages_conversation_created"
        `);
        await queryRunner.query(`
            DROP TABLE "advisor_messages"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_advisor_conversations_user_updated"
        `);
        await queryRunner.query(`
            DROP TABLE "advisor_conversations"
        `);
    }

}
