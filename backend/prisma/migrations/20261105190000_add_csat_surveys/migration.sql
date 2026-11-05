-- CreateTable
CREATE TABLE `CsatSurvey` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `contactId` INTEGER NOT NULL,
    `messageId` INTEGER NULL,
    `status` ENUM('PENDING', 'ANSWERED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    `rating` TINYINT NULL,
    `comment` TEXT NULL,
    `sentByUserId` VARCHAR(191) NULL,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `answeredAt` DATETIME(3) NULL,
    `commentUntil` DATETIME(3) NULL,

    UNIQUE INDEX `CsatSurvey_messageId_key`(`messageId`),
    INDEX `CsatSurvey_contactId_sentAt_idx`(`contactId`, `sentAt`),
    INDEX `CsatSurvey_sentAt_idx`(`sentAt`),
    INDEX `CsatSurvey_sentByUserId_idx`(`sentByUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CsatSurvey` ADD CONSTRAINT `CsatSurvey_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `Contact`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CsatSurvey` ADD CONSTRAINT `CsatSurvey_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `Message`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CsatSurvey` ADD CONSTRAINT `CsatSurvey_sentByUserId_fkey` FOREIGN KEY (`sentByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
