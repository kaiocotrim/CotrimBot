-- Catálogo compartilhado exclusivamente de demonstração, sem dados reais do SAC.
CREATE TABLE `SacTestCompany` (
  `id` VARCHAR(191) NOT NULL,
  `cnpj` VARCHAR(14) NOT NULL,
  UNIQUE INDEX `SacTestCompany_cnpj_key` (`cnpj`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SacTestEquipment` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `serial` VARCHAR(191) NOT NULL,
  INDEX `SacTestEquipment_companyId_idx` (`companyId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `SacTestEquipment_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `SacTestCompany` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SacTestAddress` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `address` TEXT NOT NULL,
  INDEX `SacTestAddress_companyId_idx` (`companyId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `SacTestAddress_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `SacTestCompany` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SacTestTicket` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `contactId` INTEGER NOT NULL,
  `botId` VARCHAR(191) NOT NULL,
  `startMessageId` INTEGER NOT NULL,
  `confirmationMessageId` INTEGER NOT NULL,
  `mode` VARCHAR(16) NOT NULL DEFAULT 'TEST',
  `data` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `SacTestTicket_startMessageId_key` (`startMessageId`),
  UNIQUE INDEX `SacTestTicket_confirmationMessageId_key` (`confirmationMessageId`),
  INDEX `SacTestTicket_organizationId_createdAt_idx` (`organizationId`, `createdAt`),
  INDEX `SacTestTicket_contactId_idx` (`contactId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `SacTestTicket_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `SacTestTicket_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `Contact` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `SacTestTicket_mode_check` CHECK (`mode` = 'TEST')
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `SacTestCompany` (`id`, `cnpj`) VALUES ('sac-demo-company', '05540238000123');
INSERT INTO `SacTestEquipment` (`id`, `companyId`, `name`, `serial`) VALUES ('sac-demo-scanner', 'sac-demo-company', 'SCANNER C240 (40PPM)', 'HD370664');
INSERT INTO `SacTestAddress` (`id`, `companyId`, `address`) VALUES ('sac-demo-address', 'sac-demo-company', 'RODOVIA BR-262, S/N, 5030, , VILA CAPIXABA, 29145-901, CARIACICA - ES');
