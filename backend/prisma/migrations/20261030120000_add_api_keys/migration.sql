-- CreateTable
CREATE TABLE `Apikey` (
    `id` VARCHAR(191) NOT NULL,
    `configId` VARCHAR(191) NOT NULL DEFAULT 'default',
    `name` VARCHAR(191) NULL,
    `start` VARCHAR(191) NULL,
    `prefix` VARCHAR(191) NULL,
    `key` VARCHAR(191) NOT NULL,
    `referenceId` VARCHAR(191) NOT NULL,
    `refillInterval` INTEGER NULL,
    `refillAmount` INTEGER NULL,
    `lastRefillAt` DATETIME(3) NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `rateLimitEnabled` BOOLEAN NOT NULL DEFAULT true,
    `rateLimitTimeWindow` INTEGER NULL,
    `rateLimitMax` INTEGER NULL,
    `requestCount` INTEGER NOT NULL DEFAULT 0,
    `remaining` INTEGER NULL,
    `lastRequest` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `permissions` TEXT NULL,
    `metadata` TEXT NULL,

    INDEX `Apikey_key_idx`(`key`),
    INDEX `Apikey_referenceId_idx`(`referenceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
