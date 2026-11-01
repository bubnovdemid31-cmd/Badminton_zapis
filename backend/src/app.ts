import "dotenv/config";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import session from "express-session";
import { SQLiteSessionStore } from "./session-store.js";
import { Passport } from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import type { User as DatabaseUser } from "@prisma/client";

import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { hash, compare } from "bcryptjs";
import { z } from "zod";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fromZonedTime } from "date-fns-tz";
import {
  db,
  atomic,
  audit,
  settings,
  searchText,
  AppError,
  admin,
  type Actor,
} from "./db.js";
import {
  book,
  cancelBooking,
  transferBooking,
  attendance,
  bookingInput,
  getBooking,
  privateBookingWhere,
} from "./booking.js";
import {
  saveSession,
  cancelSession,
  sessionInput,
  series,
  seriesInput,
} from "./schedule.js";
declare module "express-session" {
  interface SessionData {
    userId?: string;
    authVersion?: number;
    csrf?: string;
  }
}
declare global {
  namespace Express {
    interface Request {
      actor?: Actor;
    }
  }
}
const production = process.env.NODE_ENV === "production";
const secret = process.env.SESSION_SECRET;
if (!secret || secret.length < 32 || secret.startsWith("GENERATE_"))
  throw new Error(
    "Выполните npm run setup или задайте случайный SESSION_SECRET длиной не менее 32 символов",
  );
const origin = process.env.WEB_ORIGIN ?? "http://localhost:5173";
if (production && !origin.startsWith("https://"))
  throw new Error("WEB_ORIGIN должен использовать HTTPS в production");
const publicUser = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
} as const;
const sessionInclude = {
  trainer: true,
  court: { include: { venue: true } },
  _count: { select: { bookings: { where: { status: "BOOKED" as const } } } },
};
const bookingInclude = {
  session: { include: { trainer: true, court: { include: { venue: true } } } },
};
export const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin, credentials: true }));
app.use(express.json({ limit: "32kb" }));
const passport = new Passport();
passport.use(
  new LocalStrategy(
    { usernameField: "email", passwordField: "password" },
    async (email, password, done) => {
      try {
        await emailLimit(email);
        const user = await db.user.findUnique({ where: { email } });
        const ok = await compare(
          password,
          user?.passwordHash ??
            "$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW",
        );
        done(null, user && ok ? user : false);
      } catch (error) {
        done(error);
      }
    },
  ),
);
app.use(passport.initialize());
app.use(
  session({
    name: "bm.sid",
    store: new SQLiteSessionStore(),
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: production,
      sameSite: process.env.COOKIE_SAME_SITE === "none" ? "none" : "lax",
      maxAge: 7 * 86400000,
    },
  }),
);
const token = (req: Request) =>
  req.session.csrf ?? (req.session.csrf = randomBytes(32).toString("hex"));
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.get("origin") !== origin)
    return next(new AppError("Источник запроса запрещён", 403));
  const expected = req.session.csrf,
    actual = req.get("x-csrf-token");
  if (
    !expected ||
    !actual ||
    !/^[a-f0-9]{64}$/.test(actual) ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
  )
    return next(new AppError("Обновите страницу и повторите действие", 403));
  next();
});
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 240,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Слишком много запросов. Повторите через минуту." },
  }),
);
const loginLimit = rateLimit({
  windowMs: 15 * 60000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Слишком много попыток. Повторите через 15 минут." },
});
const auth = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const user = req.session.userId
      ? await db.user.findUnique({
          where: { id: req.session.userId },
          select: { id: true, role: true, authVersion: true },
        })
      : null;
    if (!user || user.authVersion !== req.session.authVersion)
      throw new AppError("Войдите в аккаунт", 401);
    req.actor = { id: user.id, role: user.role };
    next();
  } catch (e) {
    next(e);
  }
};
const onlyAdmin = (req: Request, _res: Response, next: NextFunction) => {
  try {
    admin(req.actor!);
    next();
  } catch (e) {
    next(e);
  }
};
async function emailLimit(email: string) {
  const now = new Date(),
    expiry = new Date(+now + 15 * 60000),
    key = "login:" + email;
  const rows = await db.$queryRaw<
    { count: number }[]
  >`INSERT INTO "RateLimit" (key,count,"expiresAt") VALUES (${key},1,${+expiry}) ON CONFLICT (key) DO UPDATE SET count=CASE WHEN "RateLimit"."expiresAt" < ${+now} THEN 1 ELSE "RateLimit".count+1 END,"expiresAt"=CASE WHEN "RateLimit"."expiresAt" < ${+now} THEN ${+expiry} ELSE "RateLimit"."expiresAt" END RETURNING count`;
  if (rows[0].count > 10)
    throw new AppError("Слишком много попыток. Повторите через 15 минут.", 429);
}
const accountInput = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().min(10, "Пароль — минимум 10 символов").max(128),
  name: z.string().trim().min(2).max(100),
});
async function signIn(req: Request, user: { id: string; authVersion: number }) {
  await new Promise<void>((resolve, reject) =>
    req.session.regenerate((e) => (e ? reject(e) : resolve())),
  );
  req.session.userId = user.id;
  req.session.authVersion = user.authVersion;
  token(req);
  await new Promise<void>((resolve, reject) =>
    req.session.save((e) => (e ? reject(e) : resolve())),
  );
}
app.get("/api/health", async (_req, res) => {
  await db.$queryRaw`SELECT 1`;
  res.json({ status: "ok" });
});
app.get("/api/auth/session", async (req, res) => {
  const user = req.session.userId
    ? await db.user.findUnique({
        where: { id: req.session.userId },
        select: { ...publicUser, authVersion: true },
      })
    : null;
  const valid = user && user.authVersion === req.session.authVersion;
  const { authVersion: _, ...safe } = user ?? { authVersion: 0 };
  res.json({ user: valid ? safe : null, csrf: token(req) });
});
app.post("/api/auth/register", loginLimit, async (req, res) => {
  const input = accountInput.parse(req.body);
  await emailLimit(input.email);
  const user = await db.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash: await hash(input.password, 12),
      searchText: searchText(input.name, input.email),
    },
    select: { ...publicUser, authVersion: true },
  });
  await signIn(req, user);
  const { authVersion: _, ...safe } = user;
  res.status(201).json({ user: safe, csrf: token(req) });
});
app.post("/api/auth/login", loginLimit, async (req, res) => {
  const input = z
    .object({
      email: z
        .email()
        .max(254)
        .transform((v) => v.toLowerCase().trim()),
      password: z.string().min(1).max(128),
    })
    .parse(req.body);
  req.body = input;
  const user = await new Promise<DatabaseUser>((resolve, reject) => {
    passport.authenticate(
      "local",
      { session: false },
      (error: Error | null, user: DatabaseUser | false) => {
        if (error) return reject(error);
        if (!user)
          return reject(new AppError("Неверный email или пароль", 401));
        resolve(user);
      },
    )(req, res, reject);
  });
  await signIn(req, user);
  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
    },
    csrf: token(req),
  });
});
app.post("/api/auth/logout", auth, async (req, res) => {
  await new Promise<void>((resolve, reject) =>
    req.session.destroy((e) => (e ? reject(e) : resolve())),
  );
  res.clearCookie("bm.sid", {
    httpOnly: true,
    secure: production,
    sameSite: process.env.COOKIE_SAME_SITE === "none" ? "none" : "lax",
  });
  res.json({ ok: true });
});
app.get("/api/public", async (_req, res) => {
  const [club, trainers, venues] = await Promise.all([
    settings(),
    db.trainer.findMany({
      where: { archived: false },
      orderBy: { name: "asc" },
    }),
    db.venue.findMany({
      where: { archived: false },
      include: { courts: { where: { archived: false } } },
    }),
  ]);
  res.json({ club, trainers, venues });
});
app.get("/api/sessions", async (req, res) => {
  const filters = z
    .object({
      venue: z.string().optional(),
      trainer: z.string().optional(),
      format: z
        .enum(["GROUP", "PERSONAL", "KIDS", "MINIGROUP", "SPLIT"])
        .optional(),
      level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).optional(),
    })
    .parse(req.query);
  const sessions = await db.session.findMany({
    where: {
      startsAt: { gt: new Date() },
      cancelled: false,
      trainer: { archived: false },
      court: {
        archived: false,
        venue: { archived: false },
        ...(filters.venue ? { venueId: filters.venue } : {}),
      },
      ...(filters.format ? { format: filters.format } : {}),
      ...(filters.level ? { level: filters.level } : {}),
      ...(filters.trainer ? { trainerId: filters.trainer } : {}),
    },
    include: sessionInclude,
    orderBy: { startsAt: "asc" },
    take: 300,
  });
  res.json(sessions);
});
app.use("/api/account", auth);
app.get("/api/account/bookings", async (req, res) =>
  res.json(
    await db.booking.findMany({
      where: privateBookingWhere({ id: req.actor!.id, role: "CLIENT" }),
      include: bookingInclude,
      orderBy: { createdAt: "desc" },
    }),
  ),
);
app.get("/api/account/bookings/:id", async (req, res) =>
  res.json(await getBooking(req.actor!, String(req.params.id))),
);
app.post("/api/account/bookings", async (req, res) =>
  res.status(201).json(await book(req.actor!, bookingInput.parse(req.body))),
);
app.post("/api/account/bookings/:id/cancel", async (req, res) =>
  res.json(await cancelBooking(req.actor!, String(req.params.id))),
);
app.post("/api/account/bookings/:id/transfer", async (req, res) =>
  res.json(
    await transferBooking(
      req.actor!,
      String(req.params.id),
      z.object({ sessionId: z.string().min(1) }).parse(req.body).sessionId,
    ),
  ),
);
app.patch("/api/account/profile", async (req, res) => {
  const data = z
    .object({
      name: z.string().trim().min(2).max(100),
      phone: z
        .string()
        .trim()
        .max(30)
        .regex(/^[+\d()\s-]*$/),
    })
    .parse(req.body);
  res.json(
    await db.user.update({
      where: { id: req.actor!.id },
      data: {
        ...data,
        searchText: searchText(
          data.name,
          data.phone,
          (await db.user.findUniqueOrThrow({ where: { id: req.actor!.id } }))
            .email,
        ),
      },
      select: publicUser,
    }),
  );
});
app.post("/api/account/password", async (req, res) => {
  const data = z
    .object({
      current: z.string().min(1).max(128),
      password: z.string().min(10).max(128),
    })
    .parse(req.body);
  await emailLimit("password:" + req.actor!.id);
  const user = await db.user.findUniqueOrThrow({
    where: { id: req.actor!.id },
  });
  if (!(await compare(data.current, user.passwordHash)))
    throw new AppError("Текущий пароль неверен");
  const updated = await db.user.updateMany({
    where: { id: user.id, passwordHash: user.passwordHash },
    data: {
      passwordHash: await hash(data.password, 12),
      authVersion: { increment: 1 },
    },
  });
  if (!updated.count)
    throw new AppError("Пароль уже изменён. Войдите заново.", 409);
  await signIn(req, { id: user.id, authVersion: user.authVersion + 1 });
  res.json({ ok: true, csrf: token(req) });
});
app.use("/api/admin", auth, onlyAdmin);
app.get("/api/admin/overview", async (_req, res) => {
  const club = await settings(),
    localDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: club.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  const start = fromZonedTime(localDate + "T00:00:00", club.timezone);
  const next = new Date(localDate + "T00:00:00Z");
  next.setUTCDate(next.getUTCDate() + 1);
  const end = fromZonedTime(
    next.toISOString().slice(0, 10) + "T00:00:00",
    club.timezone,
  );
  const [today, active, nextSessions] = await Promise.all([
    db.session.count({
      where: {
        cancelled: false,
        startsAt: { gte: start, lt: end },
        trainer: { archived: false },
        court: { archived: false, venue: { archived: false } },
      },
    }),
    db.booking.count({
      where: {
        status: "BOOKED",
        session: {
          cancelled: false,
          endsAt: { gte: new Date() },
          trainer: { archived: false },
          court: { archived: false, venue: { archived: false } },
        },
      },
    }),
    db.session.findMany({
      where: {
        cancelled: false,
        startsAt: { gt: new Date() },
        trainer: { archived: false },
        court: { archived: false, venue: { archived: false } },
      },
      include: sessionInclude,
      orderBy: { startsAt: "asc" },
      take: 8,
    }),
  ]);
  res.json({ today, active, nextSessions });
});
app.get("/api/admin/sessions", async (_req, res) =>
  res.json(
    await db.session.findMany({
      where: {
        trainer: { archived: false },
        court: { archived: false, venue: { archived: false } },
      },
      include: sessionInclude,
      orderBy: { startsAt: "desc" },
      take: 500,
    }),
  ),
);
app.post("/api/admin/sessions", async (req, res) =>
  res
    .status(201)
    .json(await saveSession(req.actor!, sessionInput.parse(req.body))),
);
app.patch("/api/admin/sessions/:id", async (req, res) =>
  res.json(
    await saveSession(
      req.actor!,
      sessionInput.parse(req.body),
      String(req.params.id),
    ),
  ),
);
app.post("/api/admin/sessions/:id/cancel", async (req, res) => {
  await cancelSession(
    req.actor!,
    String(req.params.id),
    z.object({ confirmed: z.boolean() }).parse(req.body).confirmed,
  );
  res.json({ ok: true });
});
app.post("/api/admin/series", async (req, res) =>
  res.json(await series(req.actor!, seriesInput.parse(req.body))),
);
app.get("/api/admin/bookings", async (req, res) => {
  const f = z
    .object({
      sessionId: z.string().optional(),
      userId: z.string().optional(),
      q: z.string().max(100).optional(),
    })
    .parse(req.query);
  res.json(
    await db.booking.findMany({
      where: {
        ...(f.sessionId ? { sessionId: f.sessionId } : {}),
        ...(f.userId ? { userId: f.userId } : {}),
        ...(f.q
          ? {
              OR: [
                { searchText: { contains: searchText(f.q) } },

                { user: { searchText: { contains: searchText(f.q) } } },
              ],
            }
          : {}),
      },
      include: { ...bookingInclude, user: { select: publicUser } },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  );
});
app.post("/api/admin/bookings", async (req, res) =>
  res.status(201).json(await book(req.actor!, bookingInput.parse(req.body))),
);
app.post("/api/admin/bookings/:id/cancel", async (req, res) =>
  res.json(await cancelBooking(req.actor!, String(req.params.id))),
);
app.post("/api/admin/bookings/:id/transfer", async (req, res) =>
  res.json(
    await transferBooking(
      req.actor!,
      String(req.params.id),
      z.object({ sessionId: z.string() }).parse(req.body).sessionId,
    ),
  ),
);
app.post("/api/admin/bookings/:id/attendance", async (req, res) => {
  await attendance(
    req.actor!,
    String(req.params.id),
    z.object({ status: z.enum(["ATTENDED", "MISSED"]) }).parse(req.body).status,
  );
  res.json({ ok: true });
});
app.get("/api/admin/clients", async (req, res) => {
  const q = z
    .string()
    .max(100)
    .parse(req.query.q ?? "");
  res.json(
    await db.user.findMany({
      where: {
        OR: [{ searchText: { contains: searchText(q) } }],
      },
      select: {
        ...publicUser,
        createdAt: true,
        _count: { select: { bookings: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  );
});
app.get("/api/admin/resources", async (_req, res) => {
  const [trainers, venues, courts] = await Promise.all([
    db.trainer.findMany({ where: { archived: false } }),
    db.venue.findMany({ where: { archived: false } }),
    db.court.findMany({
      where: { archived: false, venue: { archived: false } },
      include: { venue: true },
    }),
  ]);
  res.json({ trainers, venues, courts });
});
const trainerInput = z.object({
  name: z.string().trim().min(2).max(100),
  bio: z.string().trim().min(10).max(2000),
  archived: z.boolean().default(false),
});
const venueInput = z.object({
  name: z.string().trim().min(2).max(100),
  address: z.string().trim().min(5).max(300),
  archived: z.boolean().default(false),
});
const courtInput = z.object({
  name: z.string().trim().min(1).max(100),
  venueId: z.string().min(1),
  archived: z.boolean().default(false),
});
for (const resource of ["trainers", "venues", "courts"] as const) {
  const handler = async (req: Request, res: Response) => {
    const data =
        resource === "trainers"
          ? trainerInput.parse(req.body)
          : resource === "venues"
            ? venueInput.parse(req.body)
            : courtInput.parse(req.body),
      id = req.params.id ? String(req.params.id) : undefined;
    const result = await atomic(async (tx) => {
      let record;
      if (resource === "trainers") {
        const v = trainerInput.parse(data);
        record = id
          ? await tx.trainer.update({ where: { id }, data: v })
          : await tx.trainer.create({ data: v });
      } else if (resource === "venues") {
        const v = venueInput.parse(data);
        record = id
          ? await tx.venue.update({ where: { id }, data: v })
          : await tx.venue.create({ data: v });
      } else {
        const v = courtInput.parse(data);
        if (id) {
          const old = await tx.court.findUniqueOrThrow({ where: { id } });
          if (old.venueId !== v.venueId)
            throw new AppError(
              "Для другой площадки создайте отдельный корт: это сохраняет историю",
            );
        }
        record = id
          ? await tx.court.update({ where: { id }, data: v })
          : await tx.court.create({ data: v });
      }
      await audit(tx, req.actor!.id, "RESOURCE_SAVED", record.id, {
        resource,
        data,
      });
      return record;
    });
    res.json(result);
  };
  app.post("/api/admin/" + resource, handler);
  app.patch("/api/admin/" + resource + "/:id", handler);
}
app.patch("/api/admin/settings", async (req, res) => {
  const data = z
    .object({
      name: z.string().trim().min(2).max(100),
      timezone: z.string().refine((v) => {
        try {
          new Intl.DateTimeFormat("ru", { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }, "Неизвестный часовой пояс"),
      phone: z.string().max(100),
      email: z.union([z.email(), z.literal("")]),
      address: z.string().max(300),
      cancelHours: z.coerce.number().int().min(0).max(720),
    })
    .parse(req.body);
  res.json(
    await atomic(async (tx) => {
      const old = await settings(tx);
      const result = await tx.settings.update({ where: { id: "club" }, data });
      await audit(tx, req.actor!.id, "SETTINGS_UPDATED", "club", {
        before: old,
        after: data,
      });
      return result;
    }),
  );
});
app.get("/api/admin/audit", async (_req, res) =>
  res.json(
    await db.audit.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
  ),
);
app.use("/api", (_req, _res, next) =>
  next(new AppError("Маршрут не найден", 404)),
);
if (process.env.SERVE_WEB === "1") {
  const web = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../web",
  );
  app.use(express.static(web));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.join(web, "index.html")),
  );
}
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof z.ZodError)
    return res
      .status(400)
      .json({ error: err.issues.map((i) => i.message).join(". ") });
  if (err instanceof AppError)
    return res.status(err.status).json({ error: err.message });
  if (typeof err === "object" && err && "code" in err) {
    const code = String(err.code);
    if (code === "P2002")
      return res.status(409).json({
        error: "Такая запись уже существует. Проверьте email и участника.",
      });
    if (code === "P2025")
      return res.status(404).json({ error: "Запись не найдена" });
    if (code === "P2003")
      return res.status(400).json({ error: "Связанная запись не найдена" });
  }
  if (err instanceof SyntaxError)
    return res.status(400).json({ error: "Некорректный JSON" });
  console.error(
    "Request failed:",
    err instanceof Error ? err.name : "UnknownError",
  );
  return res.status(500).json({ error: "Ошибка сервера. Попробуйте ещё раз." });
});
