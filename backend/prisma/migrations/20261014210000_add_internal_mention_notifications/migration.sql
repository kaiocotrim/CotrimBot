ALTER TABLE `Notification` ADD COLUMN `internalConversationId` VARCHAR(191) NULL;
CREATE INDEX `Notification_internalConversationId_idx` ON `Notification`(`internalConversationId`);
