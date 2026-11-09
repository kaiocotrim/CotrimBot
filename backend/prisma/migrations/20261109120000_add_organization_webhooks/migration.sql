-- CreateTable
CREATE TABLE `OrganizationWebhook` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `url` VARCHAR(2048) NOT NULL,
    `secret` VARCHAR(128) NOT NULL,
    `events` JSON NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OrganizationWebhook_organizationId_idx`(`organizationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrganizationWebhookDelivery` (
    `id` VARCHAR(191) NOT NULL,
    `webhookId` VARCHAR(191) NOT NULL,
    `event` VARCHAR(64) NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `responseStatus` INTEGER NULL,
    `error` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OrganizationWebhookDelivery_webhookId_createdAt_idx`(`webhookId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `OrganizationWebhook` ADD CONSTRAINT `OrganizationWebhook_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrganizationWebhookDelivery` ADD CONSTRAINT `OrganizationWebhookDelivery_webhookId_fkey` FOREIGN KEY (`webhookId`) REFERENCES `OrganizationWebhook`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
