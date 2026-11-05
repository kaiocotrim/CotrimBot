-- AlterTable
ALTER TABLE `MessageMedia` ADD COLUMN `storageKey` VARCHAR(512) NULL,
    MODIFY `data` LONGBLOB NULL;

-- AlterTable
ALTER TABLE `InternalMessageMedia` ADD COLUMN `storageKey` VARCHAR(512) NULL,
    MODIFY `data` LONGBLOB NULL;
