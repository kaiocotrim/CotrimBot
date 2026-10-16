ALTER TABLE `ClientProfile`
  ADD COLUMN `organizationId` VARCHAR(191) NULL;

-- Only assign legacy clients when the creator belongs to exactly one organization.
-- Creators with no membership or multiple memberships remain unassigned/private.
UPDATE `ClientProfile` AS `client`
INNER JOIN (
  SELECT `userId`, MIN(`organizationId`) AS `organizationId`
  FROM `Member`
  GROUP BY `userId`
  HAVING COUNT(*) = 1
) AS `membership` ON `membership`.`userId` = `client`.`userId`
SET `client`.`organizationId` = `membership`.`organizationId`
WHERE `client`.`organizationId` IS NULL;

CREATE INDEX `ClientProfile_organizationId_idx` ON `ClientProfile`(`organizationId`);

ALTER TABLE `ClientProfile`
  ADD CONSTRAINT `ClientProfile_organizationId_fkey`
  FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
