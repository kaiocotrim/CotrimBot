CREATE TABLE ScheduledMessage (
  id VARCHAR(191) NOT NULL,
  userId VARCHAR(191) NOT NULL,
  phone VARCHAR(64) NOT NULL,
  content TEXT NOT NULL,
  scheduledAt DATETIME(3) NOT NULL,
  status ENUM('PENDING', 'PROCESSING', 'SENT', 'FAILED') NOT NULL DEFAULT 'PENDING',
  sentAt DATETIME(3) NULL,
  error TEXT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL,
  INDEX ScheduledMessage_status_scheduledAt_idx (status, scheduledAt),
  INDEX ScheduledMessage_userId_scheduledAt_idx (userId, scheduledAt),
  PRIMARY KEY (id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE ScheduledMessage
  ADD CONSTRAINT ScheduledMessage_userId_fkey
  FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE ON UPDATE CASCADE;
