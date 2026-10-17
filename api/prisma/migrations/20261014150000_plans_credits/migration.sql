-- Sumber lamaran baru: Instagram (kebanyakan loker berupa poster IG)
ALTER TABLE `applications` MODIFY `source` ENUM('linkedin', 'jobstreet', 'glints', 'kalibrr', 'company_site', 'instagram', 'referral', 'other') NOT NULL DEFAULT 'other';

-- Paket & saldo kredit AI
ALTER TABLE `users`
    ADD COLUMN `ai_credits` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN `plan` ENUM('basic', 'standard', 'premium') NOT NULL DEFAULT 'basic';

CREATE TABLE `ai_credit_ledger` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `delta` INTEGER NOT NULL,
    `reason` ENUM('plan_grant', 'topup', 'usage', 'admin_adjust') NOT NULL,
    `generation_id` BIGINT UNSIGNED NULL,
    `note` VARCHAR(255) NULL,
    `created_by` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `ai_credit_ledger_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `purchases` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `kind` ENUM('upgrade', 'topup') NOT NULL,
    `plan` ENUM('basic', 'standard', 'premium') NULL,
    `credits` INTEGER UNSIGNED NULL,
    `price` INTEGER UNSIGNED NOT NULL,
    `paid_at` DATE NOT NULL,
    `notes` TEXT NULL,
    `created_by` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `purchases_paid_at_idx`(`paid_at`),
    INDEX `purchases_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ai_credit_ledger` ADD CONSTRAINT `ai_credit_ledger_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `purchases` ADD CONSTRAINT `purchases_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `purchases` ADD CONSTRAINT `purchases_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Pemetaan pengguna lama:
--  * pembeli dengan add-on AI  -> Premium + 150 kredit
--  * pembeli lain (dulu membeli akses penuh tanpa AI) -> Standar
--  * akun demo -> Premium + 50 kredit (contoh hasil AI, tanpa biaya)
--  * admin -> Premium (akses penuh; kredit tidak dipotong)
UPDATE `users` SET `plan` = 'premium', `ai_credits` = 150 WHERE `role` = 'user' AND `is_demo` = 0 AND `ai_enabled` = 1;
UPDATE `users` SET `plan` = 'standard' WHERE `role` = 'user' AND `is_demo` = 0 AND `ai_enabled` = 0;
UPDATE `users` SET `plan` = 'premium', `ai_credits` = 50 WHERE `is_demo` = 1;
UPDATE `users` SET `plan` = 'premium' WHERE `role` = 'admin';
INSERT INTO `ai_credit_ledger` (`user_id`, `delta`, `reason`, `note`)
    SELECT `id`, `ai_credits`, 'plan_grant', 'Migrasi ke paket Premium' FROM `users` WHERE `ai_credits` > 0;

ALTER TABLE `users` DROP COLUMN `ai_enabled`, DROP COLUMN `ai_monthly_limit`;