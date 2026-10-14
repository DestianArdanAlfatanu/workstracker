-- AlterTable
ALTER TABLE `applications` ADD COLUMN `job_description` TEXT NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `ai_enabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `ai_monthly_limit` SMALLINT UNSIGNED NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE `career_profiles` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `headline` VARCHAR(150) NULL,
    `summary` TEXT NULL,
    `skills` TEXT NULL,
    `experience` TEXT NULL,
    `education` TEXT NULL,
    `achievements` TEXT NULL,
    `city` VARCHAR(100) NULL,
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `career_profiles_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_generations` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `application_id` BIGINT UNSIGNED NOT NULL,
    `kind` ENUM('cover_letter', 'interview_prep') NOT NULL,
    `status` ENUM('completed', 'failed', 'refused') NOT NULL,
    `options` JSON NOT NULL,
    `content` MEDIUMTEXT NULL,
    `content_json` JSON NULL,
    `edited_content` MEDIUMTEXT NULL,
    `rating` TINYINT NULL,
    `model` VARCHAR(60) NOT NULL,
    `prompt_version` VARCHAR(20) NOT NULL,
    `input_tokens` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `output_tokens` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `cache_read_tokens` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `cost_micro_usd` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `ai_generations_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `ai_generations_application_id_kind_idx`(`application_id`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `career_profiles` ADD CONSTRAINT `career_profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_generations` ADD CONSTRAINT `ai_generations_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_generations` ADD CONSTRAINT `ai_generations_application_id_fkey` FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
