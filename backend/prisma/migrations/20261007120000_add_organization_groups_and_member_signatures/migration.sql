-- Extend the Better Auth organization membership instead of duplicating Company/CompanyMember.
ALTER TABLE `Member`
  ADD COLUMN `displayName` VARCHAR(191) NULL,
  ADD COLUMN `signature` VARCHAR(255) NULL,
  ADD COLUMN `signatureEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

CREATE TABLE `OrganizationGroup` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `description` VARCHAR(500) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `OrganizationGroup_organizationId_name_key`(`organizationId`, `name`),
  INDEX `OrganizationGroup_organizationId_idx`(`organizationId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `OrganizationGroupMember` (
  `groupId` VARCHAR(191) NOT NULL,
  `memberId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `OrganizationGroupMember_memberId_idx`(`memberId`),
  PRIMARY KEY (`groupId`, `memberId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `GroupPermission` (
  `groupId` VARCHAR(191) NOT NULL,
  `permission` ENUM(
    'CONVERSATIONS_VIEW',
    'CONVERSATIONS_REPLY',
    'CONVERSATIONS_START',
    'CONVERSATIONS_CLOSE',
    'CONVERSATIONS_REOPEN',
    'CONVERSATIONS_FORWARD',
    'MESSAGES_DELETE',
    'CONTACTS_VIEW',
    'CONTACTS_CREATE',
    'CONTACTS_EDIT',
    'CONTACTS_DELETE',
    'COMPANY_MEMBERS_VIEW',
    'COMPANY_MEMBERS_INVITE',
    'COMPANY_MEMBERS_EDIT',
    'COMPANY_GROUPS_CREATE',
    'COMPANY_GROUPS_EDIT',
    'COMPANY_GROUPS_DELETE',
    'SETTINGS_ACCESS',
    'SETTINGS_WHATSAPP_MANAGE',
    'SETTINGS_COMPANY_MANAGE'
  ) NOT NULL,

  PRIMARY KEY (`groupId`, `permission`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `OrganizationGroup`
  ADD CONSTRAINT `OrganizationGroup_organizationId_fkey`
  FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `OrganizationGroupMember`
  ADD CONSTRAINT `OrganizationGroupMember_groupId_fkey`
  FOREIGN KEY (`groupId`) REFERENCES `OrganizationGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `OrganizationGroupMember_memberId_fkey`
  FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `GroupPermission`
  ADD CONSTRAINT `GroupPermission_groupId_fkey`
  FOREIGN KEY (`groupId`) REFERENCES `OrganizationGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
