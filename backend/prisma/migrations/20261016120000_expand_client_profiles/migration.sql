CREATE INDEX `ClientProfile_userId_idx` ON `ClientProfile`(`userId`);

ALTER TABLE `ClientProfile`
  DROP INDEX `ClientProfile_userId_key`,
  CHANGE COLUMN `companyName` `name` VARCHAR(191) NOT NULL,
  ADD COLUMN `image` LONGTEXT NULL;
