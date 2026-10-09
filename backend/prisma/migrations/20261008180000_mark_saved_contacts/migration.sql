ALTER TABLE `Contact` ADD COLUMN `isSaved` BOOLEAN NOT NULL DEFAULT false;

-- Contatos criados manualmente antes desta mudança não possuem mensagens.
UPDATE `Contact` AS c
SET c.`isSaved` = true
WHERE c.`isGroup` = false
  AND c.`name` <> c.`phone`
  AND NOT EXISTS (SELECT 1 FROM `Message` AS m WHERE m.`contactId` = c.`id`);
