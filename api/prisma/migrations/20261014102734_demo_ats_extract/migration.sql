-- AlterTable
ALTER TABLE `ai_generations` MODIFY `application_id` BIGINT UNSIGNED NULL,
    MODIFY `kind` ENUM('cover_letter', 'interview_prep', 'ats_check', 'job_extract') NOT NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `demo_expires_at` DATETIME(0) NULL,
    ADD COLUMN `is_demo` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX `users_is_demo_demo_expires_at_idx` ON `users`(`is_demo`, `demo_expires_at`);
