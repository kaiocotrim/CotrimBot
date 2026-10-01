CREATE TABLE `MessageMedia` (
    `messageId` INTEGER NOT NULL,
    `data` LONGBLOB NOT NULL,
    `mimetype` VARCHAR(255) NOT NULL,
    `fileName` VARCHAR(512) NULL,

    PRIMARY KEY (`messageId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `MessageMedia`
ADD CONSTRAINT `MessageMedia_messageId_fkey`
FOREIGN KEY (`messageId`) REFERENCES `Message`(`id`)
ON DELETE CASCADE ON UPDATE CASCADE;
