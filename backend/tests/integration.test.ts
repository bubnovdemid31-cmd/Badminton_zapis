import "dotenv/config";
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { hash } from "bcryptjs";
import { db, type Actor } from "../src/db.js";
import {
  book,
  cancelBooking,
  transferBooking,
  getBooking,
  attendance,
} from "../src/booking.js";
import { saveSession, cancelSession, series } from "../src/schedule.js";
import { app } from "../src/app.js";
import type { Server } from "node:http";
if (
  !process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL ||
  !process.env.TEST_DATABASE_URL.endsWith("club-test.db")
)
  throw new Error("Tests require an isolated temporary SQLite file");
const a: Actor = { id: "a", role: "CLIENT" },
  b: Actor = { id: "b", role: "CLIENT" },
  root: Actor = { id: "admin", role: "ADMIN" };
let server: Server, base: string, passwordHash: string;
const future = (h: number) => new Date(Date.now() + h * 3600000);
async function fixtureSession(
  id: string,
  h = 48,
  capacity = 1,
  trainerId = "t1",
  courtId = "c1",
  format: "GROUP" | "PERSONAL" | "KIDS" = "GROUP",
) {
  return db.session.create({
    data: {
      id,
      startsAt: future(h),
      endsAt: future(h + 1),
      trainerId,
      courtId,
      format,
      level: "BEGINNER",
      price: 90000,
      capacity,
    },
  });
}
before(async () => {
  passwordHash = await hash("test-password-123", 12);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = "http://127.0.0.1:" + (server.address() as { port: number }).port;
});
beforeEach(async () => {
  for (const table of [
    "SessionLevel",
    "LedgerEntry",
    "Audit",
    "Booking",
    "Session",
    "Series",
    "Court",
    "Venue",
    "Trainer",
    "User",
    "PlayerLevel",
    "Settings",
    "RateLimit",
    "WebSession",
  ])
    await db.$executeRawUnsafe('DELETE FROM "' + table + '"');
  await db.settings.create({ data: { id: "club" } });
  for (const actor of [a, b, root])
    await db.user.create({
      data: {
        id: actor.id,
        name: actor.id,
        email: actor.id + "@test.ru",
        passwordHash,
        role: actor.role,
      },
    });
  await db.venue.create({
    data: { id: "v1", name: "Тестовый зал", address: "Тестовый адрес" },
  });
  for (const id of ["t1", "t2"])
    await db.trainer.create({ data: { id, name: id, bio: "Тестовый тренер" } });
  for (const id of ["c1", "c2"])
    await db.court.create({ data: { id, name: id, venueId: "v1" } });
});
after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((e) => (e ? reject(e) : resolve())),
  );
  await db.$disconnect();
});
test("two concurrent clients compete for the final seat: exactly one succeeds", async () => {
  await fixtureSession("s1");
  const result = await Promise.allSettled([
    book(a, { sessionId: "s1" }),
    book(b, { sessionId: "s1" }),
  ]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await db.booking.count({ where: { status: "BOOKED" } }), 1);
});
test("duplicate requests for the same participant create one active booking", async () => {
  await fixtureSession("s1", 48, 8);
  const result = await Promise.allSettled([
    book(a, { sessionId: "s1" }),
    book(a, { sessionId: "s1" }),
  ]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
});
test("cancellation frees capacity, preserves history, and allows a new client", async () => {
  await fixtureSession("s1");
  const old = await book(a, { sessionId: "s1" });
  await cancelBooking(a, old.id);
  await book(b, { sessionId: "s1" });
  assert.equal(
    (await db.booking.findUniqueOrThrow({ where: { id: old.id } })).status,
    "CANCELLED_CLIENT",
  );
  assert.equal(await db.booking.count(), 2);
});
test("self cancellation and transfer are prohibited inside the 12 hour window", async () => {
  await fixtureSession("s1", 8);
  await fixtureSession("s2", 48);
  const old = await book(a, { sessionId: "s1" });
  await assert.rejects(cancelBooking(a, old.id), /Срок/);
  await assert.rejects(transferBooking(a, old.id, "s2"), /Срок/);
  assert.equal(
    (await db.booking.findUniqueOrThrow({ where: { id: old.id } })).status,
    "BOOKED",
  );
});
test("atomic transfer rolls back if the target is full, then succeeds after release", async () => {
  await fixtureSession("s1", 48);
  await fixtureSession("s2", 72);
  const old = await book(a, { sessionId: "s1" }),
    taken = await book(b, { sessionId: "s2" });
  await assert.rejects(transferBooking(a, old.id, "s2"), /места/);
  assert.equal(
    (await db.booking.findUniqueOrThrow({ where: { id: old.id } })).status,
    "BOOKED",
  );
  await cancelBooking(b, taken.id);
  const next = await transferBooking(a, old.id, "s2");
  assert.equal(next.sessionId, "s2");
  assert.equal(
    (await db.booking.findUniqueOrThrow({ where: { id: old.id } })).status,
    "CANCELLED_CLIENT",
  );
});
test("trainer and court intersections are rejected by service and SQLite constraints", async () => {
  const old = await fixtureSession("s1");
  const input = {
    startsAt: old.startsAt.toISOString(),
    endsAt: old.endsAt.toISOString(),
    trainerId: "t1",
    courtId: "c2",
    format: "GROUP" as const,
    level: "BEGINNER" as const,
    price: 1,
    capacity: 8,
    open: true,
  };
  await assert.rejects(saveSession(root, input), /занят/);
  await assert.rejects(
    saveSession(root, { ...input, trainerId: "t2", courtId: "c1" }),
    /занят/,
  );
  await assert.rejects(
    db.session.create({
      data: { ...input, startsAt: old.startsAt, endsAt: old.endsAt },
    }),
  );
  await saveSession(root, {
    ...input,
    startsAt: old.endsAt.toISOString(),
    endsAt: new Date(+old.endsAt + 3600000).toISOString(),
  });
});
test("a client cannot book overlapping sessions, even for different courts and trainers", async () => {
  await fixtureSession("s1", 48, 8);
  await fixtureSession("s2", 48, 8, "t2", "c2");
  await book(a, { sessionId: "s1" });
  await assert.rejects(book(a, { sessionId: "s2" }), /пересекающееся/);
});
test("clients cannot view, cancel, transfer another client booking or edit schedule", async () => {
  await fixtureSession("s1");
  const old = await book(a, { sessionId: "s1" });
  await assert.rejects(getBooking(b, old.id), /Доступ/);
  await assert.rejects(cancelBooking(b, old.id), /Доступ/);
  await assert.rejects(transferBooking(b, old.id, "s2"), /Доступ/);
  await assert.rejects(cancelSession(a, "s1", true), /Доступ/);
  await assert.rejects(attendance(a, old.id, "MISSED"), /Доступ/);
});
test("children require details, guests stay unlinked, and public role escalation is rejected", async () => {
  await fixtureSession("s1", 48, 8, "t1", "c1", "KIDS");
  await assert.rejects(book(a, { sessionId: "s1" }), /ребёнка/);
  const child = await book(a, {
    sessionId: "s1",
    childName: "Саша",
    childAge: 8,
  });
  assert.equal(child.childName, "Саша");
  await book(a, { sessionId: "s1", childName: "Миша", childAge: 6 });
  await assert.rejects(
    book(a, { sessionId: "s1", childName: " Саша ", childAge: 8 }),
    /уже записан/,
  );
  const guest = await book(root, {
    sessionId: "s1",
    guestName: "Родитель",
    guestPhone: "+7 999 000 00 00",
    childName: "Маша",
    childAge: 9,
  });
  assert.equal(guest.userId, null);
  await assert.rejects(
    book(a, { sessionId: "s1", userId: b.id, childName: "Ваня", childAge: 10 }),
    /другого/,
  );
});
test("capacity cannot fall below current bookings and session cancellation preserves history", async () => {
  const s = await fixtureSession("s1", 48, 8);
  await book(a, { sessionId: s.id });
  await book(b, { sessionId: s.id });
  await assert.rejects(
    saveSession(
      root,
      {
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt.toISOString(),
        trainerId: s.trainerId,
        courtId: s.courtId,
        format: s.format,
        level: s.level,
        price: s.price,
        capacity: 1,
        open: true,
      },
      s.id,
    ),
    /Вместимость/,
  );
  await assert.rejects(cancelSession(root, s.id, false), /Подтвердите/);
  await cancelSession(root, s.id, true);
  assert.equal(
    await db.booking.count({ where: { status: "CANCELLED_CLUB" } }),
    2,
  );
  await assert.rejects(book(a, { sessionId: s.id }), /недоступна/);
});
test("closed and past sessions reject bookings; personal capacity enforced by database", async () => {
  await fixtureSession("past", -2);
  await assert.rejects(book(a, { sessionId: "past" }), /недоступна/);
  const closed = await fixtureSession("closed");
  await db.session.update({ where: { id: closed.id }, data: { open: false } });
  await assert.rejects(book(a, { sessionId: "closed" }), /недоступна/);
  await assert.rejects(
    fixtureSession("invalid", 72, 2, "t1", "c1", "PERSONAL"),
  );
});
test("series preview shows all conflicts, and saving a conflicting series writes nothing", async () => {
  const s = await fixtureSession("s1", 48, 8),
    local = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Vladivostok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(s.startsAt),
    time = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Vladivostok",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(s.startsAt);
  const input = {
    from: local,
    to: local,
    time,
    duration: 60,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    session: {
      trainerId: "t1",
      courtId: "c1",
      format: "GROUP" as const,
      level: "BEGINNER" as const,
      price: 90000,
      capacity: 8,
      open: true,
    },
    save: true,
  };
  const preview = await series(root, input);
  assert.equal(preview.saved, false);
  assert.equal(preview.conflicts.length, 1);
  assert.equal(await db.series.count(), 0);
  assert.equal(await db.session.count(), 1);
  const good = await series(root, {
    ...input,
    session: { ...input.session, trainerId: "t2", courtId: "c2" },
  });
  assert.equal(good.saved, true);
  const created = await db.session.findFirstOrThrow({
    where: { seriesId: { not: null } },
  });
  assert.equal(
    created.startsAt.toISOString().slice(11, 16),
    new Date(+new Date(local + "T" + time + ":00+10:00"))
      .toISOString()
      .slice(11, 16),
  );
});
class BrowserClient {
  cookie = "";
  csrf = "";
  async request(path: string, method = "GET", body?: object, csrf = true) {
    const r = await fetch(base + "/api" + path, {
      method,
      headers: {
        origin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
        ...(csrf ? { "x-csrf-token": this.csrf } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const set = r.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    const data = await r.json();
    if (data.csrf) this.csrf = data.csrf;
    return { status: r.status, data };
  }
  async login(email = "a@test.ru") {
    await this.request("/auth/session");
    return this.request("/auth/login", "POST", {
      email,
      password: "test-password-123",
    });
  }
}
test("HTTP sessions: client admin access is denied, foreign booking hidden, CSRF blocked, public responses contain no contacts", async () => {
  await fixtureSession("s1");
  const old = await book(b, { sessionId: "s1" });
  const client = new BrowserClient();
  assert.equal((await client.login()).status, 200);
  assert.equal((await client.request("/admin/overview")).status, 403);
  assert.equal(
    (await client.request("/account/bookings/" + old.id)).status,
    403,
  );
  assert.equal(
    (
      await client.request(
        "/account/profile",
        "PATCH",
        { name: "Новое имя", phone: "" },
        false,
      )
    ).status,
    403,
  );
  const own = await client.request("/account/bookings");
  assert.equal(own.data.length, 0);
  const publicData = await client.request("/sessions");
  assert.ok(!JSON.stringify(publicData.data).includes("@test.ru"));
  assert.ok(!JSON.stringify(publicData.data).includes("passwordHash"));
});
test("HTTP registration always creates CLIENT; login throttling persists in database", async () => {
  const client = new BrowserClient();
  await client.request("/auth/session");
  const registered = await client.request("/auth/register", "POST", {
    name: "Новый клиент",
    email: "new@test.ru",
    password: "a-very-good-password",
    role: "ADMIN",
  });
  assert.equal(registered.status, 201);
  assert.equal(registered.data.user.role, "CLIENT");
  const attacker = new BrowserClient();
  await attacker.request("/auth/session");
  for (let i = 0; i < 10; i++)
    assert.equal(
      (
        await attacker.request("/auth/login", "POST", {
          email: "wrong@test.ru",
          password: "bad",
        })
      ).status,
      401,
    );
  assert.equal(
    (
      await attacker.request("/auth/login", "POST", {
        email: "wrong@test.ru",
        password: "bad",
      })
    ).status,
    429,
  );
});
test("session time edits warn with participants, prevent client overlaps, and write an audit trail", async () => {
  const s = await fixtureSession("s1", 48, 8);
  await fixtureSession("s2", 72, 8, "t2", "c2");
  await book(a, { sessionId: "s1" });
  await book(a, { sessionId: "s2" });
  const input = {
    startsAt: future(96).toISOString(),
    endsAt: future(97).toISOString(),
    trainerId: "t1",
    courtId: "c1",
    format: "GROUP" as const,
    level: "BEGINNER" as const,
    price: 90000,
    capacity: 8,
    open: true,
  };
  await assert.rejects(saveSession(root, input, s.id), /Подтвердите/);
  await assert.rejects(
    saveSession(
      root,
      {
        ...input,
        startsAt: future(72).toISOString(),
        endsAt: future(73).toISOString(),
        confirmParticipants: true,
      },
      s.id,
    ),
    /пересекается/,
  );
  await saveSession(root, { ...input, confirmParticipants: true }, s.id);
  assert.equal(
    await db.audit.count({ where: { action: "SESSION_UPDATED" } }),
    1,
  );
});
test("attendance may be marked only by admin after the session ends", async () => {
  const s = await fixtureSession("s1", 48, 8);
  const booked = await book(a, { sessionId: s.id });
  await assert.rejects(
    attendance(root, booked.id, "ATTENDED"),
    /после завершения/,
  );
  await db.session.update({
    where: { id: s.id },
    data: { startsAt: future(-2), endsAt: future(-1) },
  });
  await attendance(root, booked.id, "ATTENDED");
  assert.equal(
    (await db.booking.findUniqueOrThrow({ where: { id: booked.id } })).status,
    "ATTENDED",
  );
});
test("password changes invalidate other sessions and profile edits persist", async () => {
  const client = new BrowserClient(),
    other = new BrowserClient();
  await client.login();
  await other.login();
  assert.equal(
    (
      await client.request("/account/profile", "PATCH", {
        name: "Новое имя",
        phone: "+7 999 000 00 00",
      })
    ).status,
    200,
  );
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: "a" } })).name,
    "Новое имя",
  );
  assert.equal(
    (
      await client.request("/account/password", "POST", {
        current: "wrong",
        password: "new-test-password-123",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await client.request("/account/password", "POST", {
        current: "test-password-123",
        password: "new-test-password-123",
      })
    ).status,
    200,
  );
  assert.equal((await other.request("/account/bookings")).status, 401);
  assert.equal((await client.request("/account/bookings")).status, 200);
});

test("series reports nonexistent local time during daylight saving transition", async () => {
  await db.settings.update({
    where: { id: "club" },
    data: { timezone: "Europe/Berlin" },
  });
  const year = new Date().getUTCFullYear() + 1,
    last = new Date(Date.UTC(year, 3, 0)),
    sunday = new Date(+last - last.getUTCDay() * 86400000)
      .toISOString()
      .slice(0, 10);
  const result = await series(root, {
    from: sunday,
    to: sunday,
    time: "02:30",
    duration: 60,
    weekdays: [0],
    session: {
      trainerId: "t1",
      courtId: "c1",
      format: "GROUP",
      level: "BEGINNER",
      price: 1,
      capacity: 8,
      open: true,
    },
    save: true,
  });
  assert.equal(result.saved, false);
  assert.equal(result.conflicts.length, 1);
  assert.match(result.conflicts[0].message, /перевода часов/);
  assert.equal(await db.series.count(), 0);
});

test("SQLite writer lock protects the last seat across independent Node processes", async () => {
  const { fork } = await import("node:child_process");
  await fixtureSession("s1");
  const clients = ["a", "b"].map((id) =>
    fork("backend/tests/booking-worker.ts", [], {
      execArgv: ["--import", "tsx"],
      env: { ...process.env, BOOKING_ACTOR: id },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    }),
  );
  const results = clients.map(
    (child) =>
      new Promise<{ ok: boolean; error?: string }>((resolve, reject) => {
        const timer = setTimeout(() => {
          child.kill();
          reject(new Error("Booking worker timed out"));
        }, 10000);
        child.on("message", (value: unknown) => {
          const result = value as {
            ok: boolean;
            error?: string;
            ready?: boolean;
          };
          if (!result.ready) {
            clearTimeout(timer);
            resolve(result);
          }
        });
        child.on("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.on("exit", (code) => {
          if (code) {
            clearTimeout(timer);
            reject(new Error("Booking worker exited with " + code));
          }
        });
      }),
  );
  try {
    await Promise.all(
      clients.map(
        (child) =>
          new Promise<void>((resolve) =>
            child.once("message", () => resolve()),
          ),
      ),
    );
    for (const child of clients) child.send("book");
    const values = await Promise.all(results);
    assert.equal(values.filter((v) => v.ok).length, 1);
    assert.match(values.find((v) => !v.ok)!.error!, /места/);
    assert.equal(await db.booking.count({ where: { status: "BOOKED" } }), 1);
  } finally {
    await Promise.all(
      clients.map((child) =>
        child.exitCode === null
          ? new Promise<void>((resolve) => {
              child.once("exit", () => resolve());
              child.kill();
            })
          : Promise.resolve(),
      ),
    );
  }
});

test("SQLite constraints prevent overbooking and invalid foreign keys outside service code", async () => {
  await fixtureSession("s1");
  await book(a, { sessionId: "s1" });
  await assert.rejects(
    db.booking.create({
      data: { sessionId: "s1", userId: "b", participantKey: "user:b:adult" },
    }),
  );
  await assert.rejects(
    db.court.create({
      data: { name: "Несуществующая площадка", venueId: "missing" },
    }),
  );
  assert.equal(await db.booking.count({ where: { status: "BOOKED" } }), 1);
});

test("SQLite sessions are persisted and Unicode client search remains case insensitive", async () => {
  const client = new BrowserClient();
  await client.login();
  await client.request("/account/profile", "PATCH", {
    name: "ЁЛКИН Иван",
    phone: "+7 999 123 45 67",
  });
  assert.equal(await db.webSession.count(), 1);
  const row = await db.webSession.findFirstOrThrow();
  assert.equal(JSON.parse(row.data).userId, "a");
  const rootClient = new BrowserClient();
  assert.equal((await rootClient.login("admin@test.ru")).status, 200);
  const found = await rootClient.request(
    "/admin/clients?q=" + encodeURIComponent("ёлкин"),
  );
  assert.equal(found.status, 200);
  assert.equal(found.data.length, 1);
  assert.equal(found.data[0].id, "a");
  await client.request("/auth/logout", "POST", {});
  assert.equal(await db.webSession.count({ where: { id: row.id } }), 0);
});

test("mini-group and split sessions accept club pricing and retain starting-price flags", async () => {
  const client = new BrowserClient();
  await client.login("admin@test.ru");
  const base = {
    startsAt: future(48).toISOString(),
    endsAt: future(49).toISOString(),
    trainerId: "t1",
    courtId: "c1",
    level: "BEGINNER",
    open: true,
  };
  const mini = await client.request("/admin/sessions", "POST", {
    ...base,
    format: "MINIGROUP",
    price: 150000,
    capacity: 16,
    priceFrom: false,
  });
  assert.equal(mini.status, 201);
  assert.equal(mini.data.capacity, 16);
  const filtered = await client.request("/sessions?format=MINIGROUP");
  assert.equal(filtered.status, 200);
  assert.equal(filtered.data.length, 1);
  assert.equal(filtered.data[0].price, 150000);
  assert.equal(filtered.data[0].priceFrom, false);
  const split = await client.request("/admin/sessions", "POST", {
    ...base,
    startsAt: future(72).toISOString(),
    endsAt: future(73).toISOString(),
    format: "SPLIT",
    price: 150000,
    capacity: 2,
    priceFrom: true,
  });
  assert.equal(split.status, 201);
  assert.equal(split.data.priceFrom, true);
  const booked = await book(a, { sessionId: split.data.id });
  assert.equal(booked.status, "BOOKED");
  const own = await getBooking(a, booked.id);
  assert.equal(own.session.priceFrom, true);
  assert.equal(own.session.price, 150000);
});

test("upgrading an existing database removes the old catalogue from all active lists without cancelling bookings", async () => {
  const { readFileSync } = await import("node:fs");
  const { createClient } = await import("@libsql/client");
  const { databaseUrl } = await import("../src/database-path.js");
  const { spawnSync } = await import("node:child_process");
  await fixtureSession("legacy-session");
  const original = await book(a, { sessionId: "legacy-session" });
  const client = createClient({ url: databaseUrl });
  try {
    await client.executeMultiple(
      readFileSync(
        "backend/prisma/migrations/202611010005_retire_legacy_catalog/migration.sql",
        "utf8",
      ),
    );
  } finally {
    client.close();
  }
  const seeded = spawnSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "backend/prisma/seed.ts"],
    { env: process.env, encoding: "utf8" },
  );
  assert.equal(seeded.status, 0, seeded.stderr);
  const browser = new BrowserClient();
  const catalogue = await browser.request("/public");
  assert.deepEqual(
    catalogue.data.trainers.map((t: { name: string }) => t.name).sort(),
    ["Георгий Б.", "Дарья Т.", "Полина Д.", "Полина Т."].sort(),
  );
  assert.deepEqual(
    catalogue.data.venues.map((v: { name: string }) => v.name).sort(),
    ["СК «Молодежный»", "СК «Динамо спорта»"].sort(),
  );
  assert.equal((await browser.request("/sessions")).data.length, 0);
  await assert.rejects(book(b, { sessionId: "legacy-session" }), /недоступна/);
  assert.equal(
    (await db.booking.findUniqueOrThrow({ where: { id: original.id } })).status,
    "BOOKED",
  );
  assert.equal(
    (await db.session.findUniqueOrThrow({ where: { id: "legacy-session" } }))
      .cancelled,
    false,
  );
  await browser.login("admin@test.ru");
  const resources = await browser.request("/admin/resources");
  assert.equal(resources.data.trainers.length, 4);
  assert.equal(resources.data.venues.length, 2);
  assert.equal((await browser.request("/admin/sessions")).data.length, 0);
  const overview = await browser.request("/admin/overview");
  assert.equal(overview.data.nextSessions.length, 0);
  assert.equal(overview.data.active, 0);
});

test("deposit topup is idempotent and attendance charges the booking price once", async () => {
  const { adjustBalance } = await import("../src/finance.js");
  const { randomUUID } = await import("node:crypto");
  const input = {
    amount: 500000,
    method: "CASH" as const,
    reason: "Пополнение наличными",
    operationKey: randomUUID(),
  };
  await Promise.all([
    adjustBalance(root, a.id, input),
    adjustBalance(root, a.id, input),
  ]);
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: a.id } })).balance,
    500000,
  );
  await assert.rejects(
    adjustBalance(a, a.id, { ...input, operationKey: randomUUID() }),
  );
  await assert.rejects(adjustBalance(root, a.id, { ...input, amount: 100 }));
  await fixtureSession("deposit", 48, 2);
  const booking = await book(a, { sessionId: "deposit" });
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: a.id } })).balance,
    500000,
  );
  await db.session.update({
    where: { id: "deposit" },
    data: { startsAt: future(-3), endsAt: future(-2), price: 100000 },
  });
  const results = await Promise.allSettled([
    attendance(root, booking.id, "ATTENDED"),
    attendance(root, booking.id, "ATTENDED"),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: a.id } })).balance,
    410000,
  );
  assert.equal(await db.ledgerEntry.count({ where: { userId: a.id } }), 2);
});
test("cancellation and absence do not charge the deposit", async () => {
  await fixtureSession("cancel-deposit", 48, 2);
  const cancelled = await book(a, { sessionId: "cancel-deposit" });
  await cancelBooking(a, cancelled.id);
  const missed = await book(b, { sessionId: "cancel-deposit" });
  await db.session.update({
    where: { id: "cancel-deposit" },
    data: { startsAt: future(-3), endsAt: future(-2) },
  });
  await attendance(root, missed.id, "MISSED");
  assert.equal(await db.ledgerEntry.count(), 0);
});

test("player levels restrict client booking while administrator can make an exception", async () => {
  await fixtureSession("level-session", 48, 5);
  await db.playerLevel.create({
    data: { id: "level-one", name: "Начинающий" },
  });
  await db.sessionLevel.create({
    data: { sessionId: "level-session", levelId: "level-one" },
  });
  await assert.rejects(book(a, { sessionId: "level-session" }), /уровень/);
  await db.user.update({
    where: { id: a.id },
    data: { playerLevelId: "level-one" },
  });
  await book(a, { sessionId: "level-session" });
  await book(root, { sessionId: "level-session", userId: b.id });
});
test("credit policy includes future booking costs and releases credit on cancellation", async () => {
  await fixtureSession("credit-one", 48, 5);
  await fixtureSession("credit-two", 72, 5);
  await db.settings.update({
    where: { id: "club" },
    data: { balancePolicy: "CREDIT" },
  });
  await db.user.update({ where: { id: a.id }, data: { creditLimit: 90000 } });
  const booking = await book(a, { sessionId: "credit-one" });
  await assert.rejects(book(a, { sessionId: "credit-two" }), /Недостаточно/);
  await cancelBooking(a, booking.id);
  await book(a, { sessionId: "credit-two" });
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: a.id } })).balance,
    0,
  );
});

test("attendance correction reverses and restores the charge without erasing history", async () => {
  const { correctAttendance } = await import("../src/booking.js");
  const { randomUUID } = await import("node:crypto");
  await fixtureSession("correct-deposit", 48, 2);
  const booking = await book(a, { sessionId: "correct-deposit" });
  await db.session.update({
    where: { id: "correct-deposit" },
    data: { startsAt: future(-3), endsAt: future(-2) },
  });
  await attendance(root, booking.id, "ATTENDED");
  await correctAttendance(
    root,
    booking.id,
    "MISSED",
    "Ошибочно отметили присутствие",
    randomUUID(),
  );
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: a.id } })).balance,
    0,
  );
  await correctAttendance(
    root,
    booking.id,
    "ATTENDED",
    "Присутствие подтверждено",
    randomUUID(),
  );
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: a.id } })).balance,
    -90000,
  );
  assert.equal(await db.ledgerEntry.count(), 3);
});
