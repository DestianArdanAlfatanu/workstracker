-- Pembayaran otomatis Midtrans. Tabel legacy_attachments sengaja tidak disentuh (dihapus di rilis lain).
ALTER TABLE `licenses` ADD COLUMN `payment_order_id` BIGINT UNSIGNED NULL;
ALTER TABLE `purchases` ADD COLUMN `payment_order_id` BIGINT UNSIGNED NULL;

CREATE TABLE `payment_orders` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `order_id` VARCHAR(50) NOT NULL,
    `kind` ENUM('new_account', 'upgrade', 'topup') NOT NULL,
    `plan` ENUM('basic', 'standard', 'premium') NULL,
    `credits` INTEGER UNSIGNED NULL,
    `amount` INTEGER UNSIGNED NOT NULL,
    `status` ENUM('pending', 'paid', 'expired', 'failed') NOT NULL DEFAULT 'pending',
    `buyer_name` VARCHAR(100) NOT NULL,
    `buyer_email` VARCHAR(191) NOT NULL,
    `buyer_whatsapp` VARCHAR(20) NULL,
    `user_id` BIGINT UNSIGNED NULL,
    `snap_token` VARCHAR(100) NULL,
    `redirect_url` VARCHAR(500) NULL,
    `payment_type` VARCHAR(40) NULL,
    `gateway_tx_id` VARCHAR(100) NULL,
    `paid_at` DATETIME(0) NULL,
    `fulfilled_at` DATETIME(0) NULL,
    `expires_at` DATETIME(0) NOT NULL,
    `last_checked_at` DATETIME(0) NULL,
    `last_notification` JSON NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `payment_orders_order_id_key`(`order_id`),
    INDEX `payment_orders_status_expires_at_idx`(`status`, `expires_at`),
    INDEX `payment_orders_user_id_idx`(`user_id`),
    INDEX `payment_orders_buyer_email_idx`(`buyer_email`),
    INDEX `payment_orders_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `licenses_payment_order_id_key` ON `licenses`(`payment_order_id`);
CREATE UNIQUE INDEX `purchases_payment_order_id_key` ON `purchases`(`payment_order_id`);

ALTER TABLE `payment_orders` ADD CONSTRAINT `payment_orders_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
