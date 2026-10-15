ALTER TABLE `InternalConversationParticipant`
  ADD COLUMN `pinned` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `archived` BOOLEAN NOT NULL DEFAULT false;
