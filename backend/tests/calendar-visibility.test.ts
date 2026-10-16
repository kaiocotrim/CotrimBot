import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import { createCalendarEventHandlers } from "../src/controllers/calendar-event.controller.js";

function request(values: Record<string, unknown> = {}) {
  return { user: { id: "alice" }, query: {}, params: {}, ...values } as unknown as Request;
}

function response() {
  return {
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    send() { return this; },
  };
}

test("calendar visibility and ownership", async () => {
  const database = { calendarEvent: {} as any };
  const { getCalendarEvents, createCalendarEvent, deleteCalendarEvent, setCalendarEventCompleted } = createCalendarEventHandlers(database);
  const records = [
    { id: "own-private", userId: "alice", isPublic: false },
    { id: "own-public", userId: "alice", isPublic: true },
    { id: "other-private", userId: "bob", isPublic: false },
    { id: "other-public", userId: "bob", isPublic: true },
  ].map((event) => ({ ...event, startsAt: new Date("2026-10-16T12:00:00Z"), user: { name: event.userId, image: null } }));

  database.calendarEvent.findMany = async ({ where }: any) => records.filter((event) =>
    where.OR.some((condition: any) => Object.entries(condition).every(([key, value]) => event[key as keyof typeof event] === value))
    && event.startsAt >= where.startsAt.gte && event.startsAt < where.startsAt.lt);
  const listed = response();
  await getCalendarEvents(request({ query: { from: "2026-10-16T00:00:00Z", to: "2026-10-17T00:00:00Z" } }), listed as unknown as Response);
  assert.deepEqual(listed.body.events.map((event: any) => event.id), ["own-private", "own-public", "other-public"]);
  assert.equal(listed.body.events.find((event: any) => event.id === "other-public").canManage, false);
  assert.equal(listed.body.events[0].canManage, true);

  const empty = response();
  await getCalendarEvents(request({ query: { from: "2026-10-17T00:00:00Z", to: "2026-10-18T00:00:00Z" } }), empty as unknown as Response);
  assert.deepEqual(empty.body.events, []);

  const created: any[] = [];
  database.calendarEvent.create = async ({ data }: any) => {
    created.push(data);
    return { ...data, id: "created", user: { name: "Alice", image: null } };
  };
  const body = { title: "Evento", startsAt: "2026-10-16T12:00:00Z", endsAt: "2026-10-16T13:00:00Z" };
  for (const visibility of [undefined, false, true]) {
    const result = response();
    await createCalendarEvent(request({ body: { ...body, isPublic: visibility } }), result as unknown as Response);
    assert.equal(result.statusCode, 201);
    assert.equal(result.body.event.isPublic, visibility === true);
    assert.equal(result.body.event.canManage, true);
  }
  const invalid = response();
  await createCalendarEvent(request({ body: { ...body, isPublic: "false" } }), invalid as unknown as Response);
  assert.equal(invalid.statusCode, 400);
  assert.equal(created.length, 3);

  for (const method of ["updateMany", "deleteMany"] as const) {
    database.calendarEvent[method] = async ({ where }: any) => ({
      count: records.filter((event) => event.id === where.id && event.userId === where.userId).length,
    });
  }
  for (const id of ["other-private", "other-public"]) {
    const deleted = response();
    await deleteCalendarEvent(request({ params: { id } }), deleted as unknown as Response);
    assert.equal(deleted.statusCode, 404);
    const completed = response();
    await setCalendarEventCompleted(request({ params: { id }, body: { completed: true } }), completed as unknown as Response);
    assert.equal(completed.statusCode, 404);
  }
  const ownDeleted = response();
  await deleteCalendarEvent(request({ params: { id: "own-private" } }), ownDeleted as unknown as Response);
  assert.equal(ownDeleted.statusCode, 204);
});
