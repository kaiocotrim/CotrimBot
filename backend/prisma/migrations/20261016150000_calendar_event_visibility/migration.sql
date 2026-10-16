ALTER TABLE `CalendarEvent` ADD COLUMN `isPublic` BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX `CalendarEvent_isPublic_startsAt_idx` ON `CalendarEvent`(`isPublic`, `startsAt`);
