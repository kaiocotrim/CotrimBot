import { Router } from "express";
import { createCalendarEvent, getCalendarEvents, setCalendarEventCompleted } from "../controllers/calendar-event.controller.js";

export const calendarEventRouter = Router();

calendarEventRouter.get("/calendar-events", getCalendarEvents);
calendarEventRouter.post("/calendar-events", createCalendarEvent);
calendarEventRouter.patch("/calendar-events/:id/completed", setCalendarEventCompleted);
