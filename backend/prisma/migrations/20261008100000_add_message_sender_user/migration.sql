ALTER TABLE `Message` ADD COLUMN `sentByUserId` VARCHAR(191) NULL;

CREATE INDEX `Message_sentByUserId_idx` ON `Message`(`sentByUserId`);

ALTER TABLE `Message` ADD CONSTRAINT `Message_sentByUserId_fkey`
  FOREIGN KEY (`sentByUserId`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
