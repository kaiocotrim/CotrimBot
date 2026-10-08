ALTER TABLE `Contact` ADD COLUMN `assignedUserId` VARCHAR(191) NULL;

CREATE INDEX `Contact_assignedUserId_idx` ON `Contact`(`assignedUserId`);

ALTER TABLE `Contact` ADD CONSTRAINT `Contact_assignedUserId_fkey`
  FOREIGN KEY (`assignedUserId`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
