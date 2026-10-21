-- CreateTable
CREATE TABLE `Bot` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `draft` JSON NOT NULL,
    `published` JSON NULL,
    `revision` INTEGER NOT NULL DEFAULT 0,
    `publishedRevision` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Bot_organizationId_id_key`(`organizationId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BotInstance` (
    `instance` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `activeBotId` VARCHAR(191) NULL,

    PRIMARY KEY (`instance`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BotSession` (
    `id` VARCHAR(191) NOT NULL,
    `instance` VARCHAR(191) NOT NULL,
    `contactId` INTEGER NOT NULL,
    `botId` VARCHAR(191) NOT NULL,
    `revision` INTEGER NOT NULL,
    `state` JSON NOT NULL,
    `status` ENUM('BOT_ACTIVE', 'WAITING_HUMAN', 'HUMAN_ACTIVE', 'CLOSED') NOT NULL DEFAULT 'BOT_ACTIVE',
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `BotSession_instance_contactId_key`(`instance`, `contactId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BotExecutionLog` (
    `id` VARCHAR(191) NOT NULL,
    `messageId` INTEGER NOT NULL,
    `botId` VARCHAR(191) NOT NULL,
    `outcome` VARCHAR(32) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `BotExecutionLog_messageId_key`(`messageId`),
    INDEX `BotExecutionLog_botId_createdAt_idx`(`botId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Bot` ADD CONSTRAINT `Bot_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BotInstance` ADD CONSTRAINT `BotInstance_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BotSession` ADD CONSTRAINT `BotSession_botId_fkey` FOREIGN KEY (`botId`) REFERENCES `Bot`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BotSession` ADD CONSTRAINT `BotSession_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `Contact`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
