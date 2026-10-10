ALTER TABLE `Contact`
  MODIFY COLUMN `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'NONE') NOT NULL DEFAULT 'NONE';

UPDATE `Contact` SET `priority` = 'NONE' WHERE `priority` <> 'NONE';
