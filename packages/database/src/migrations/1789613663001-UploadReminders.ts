import { MigrationInterface, QueryRunner } from "typeorm";

export class UploadReminders1789613663001 implements MigrationInterface {
    name = 'UploadReminders1789613663001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD "reminder_frequency" character varying(16) NOT NULL DEFAULT 'off'
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD "reminder_day" smallint
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD "last_reminder_sent_at" TIMESTAMP WITH TIME ZONE
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "last_reminder_sent_at"
        `);
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "reminder_day"
        `);
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "reminder_frequency"
        `);
    }

}
