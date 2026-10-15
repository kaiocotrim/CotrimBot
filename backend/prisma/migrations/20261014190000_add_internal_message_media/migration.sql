CREATE TABLE `InternalMessageMedia` (
    `messageId` INTEGER NOT NULL,
    `mimeType` VARCHAR(100) NOT NULL,
    `fileName` VARCHAR(255) NOT NULL,
    `data` LONGBLOB NOT NULL,

    PRIMARY KEY (`messageId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `InternalMessageMedia` ADD CONSTRAINT `InternalMessageMedia_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `InternalMessage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
