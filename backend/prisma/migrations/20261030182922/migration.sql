-- DropForeignKey
ALTER TABLE `InternalConversationParticipant` DROP FOREIGN KEY `InternalConversationParticipant_conversation_fkey`;

-- DropForeignKey
ALTER TABLE `InternalConversationParticipant` DROP FOREIGN KEY `InternalConversationParticipant_member_fkey`;

-- DropForeignKey
ALTER TABLE `InternalMessage` DROP FOREIGN KEY `InternalMessage_conversation_fkey`;

-- AlterTable
ALTER TABLE `Apikey` MODIFY `requestCount` INTEGER NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `ClientProfile` MODIFY `image` TEXT NULL;

-- AddForeignKey
ALTER TABLE `InternalConversationParticipant` ADD CONSTRAINT `InternalConversationParticipant_organizationId_conversation_fkey` FOREIGN KEY (`organizationId`, `conversationId`) REFERENCES `InternalConversation`(`organizationId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InternalConversationParticipant` ADD CONSTRAINT `InternalConversationParticipant_organizationId_userId_fkey` FOREIGN KEY (`organizationId`, `userId`) REFERENCES `Member`(`organizationId`, `userId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InternalMessage` ADD CONSTRAINT `InternalMessage_organizationId_conversationId_fkey` FOREIGN KEY (`organizationId`, `conversationId`) REFERENCES `InternalConversation`(`organizationId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;
