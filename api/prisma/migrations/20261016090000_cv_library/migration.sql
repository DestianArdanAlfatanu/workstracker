-- CV Saya: perpustakaan CV per pengguna, lamaran menunjuk satu CV; jenis AI profile_extract
-- AlterTable
ALTER TABLE `ai_generations` MODIFY `kind` ENUM('cover_letter', 'interview_prep', 'ats_check', 'job_extract', 'profile_extract') NOT NULL;

-- AlterTable
ALTER TABLE `applications` ADD COLUMN `cv_id` BIGINT UNSIGNED NULL;

-- CreateTable
CREATE TABLE `cv_documents` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `label` VARCHAR(100) NOT NULL,
    `original_name` VARCHAR(255) NOT NULL,
    `stored_name` VARCHAR(100) NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `size` INTEGER UNSIGNED NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `text_content` MEDIUMTEXT NULL,
    `page_count` SMALLINT UNSIGNED NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `archived_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `cv_documents_stored_name_key`(`stored_name`),
    INDEX `cv_documents_user_id_archived_at_idx`(`user_id`, `archived_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `applications` ADD CONSTRAINT `applications_cv_id_fkey` FOREIGN KEY (`cv_id`) REFERENCES `cv_documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cv_documents` ADD CONSTRAINT `cv_documents_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
