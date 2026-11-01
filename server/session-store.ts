import { Store, type SessionData } from "express-session";
import { db } from "./db.js";
// Persist authentication sessions in the same local SQLite file as club data.
export class SQLiteSessionStore extends Store {
  private cleanupAt = 0;
  get(
    id: string,
    callback: (error: unknown, session?: SessionData | null) => void,
  ) {
    db.webSession
      .findUnique({ where: { id } })
      .then(async (row) => {
        if (!row || +row.expiresAt <= Date.now()) {
          if (row)
            await db.webSession.deleteMany({
              where: { id, expiresAt: { lte: new Date() } },
            });
          callback(null, null);
          return;
        }
        callback(null, JSON.parse(row.data) as SessionData);
      })
      .catch((error) => callback(error));
  }
  set(id: string, session: SessionData, callback?: (error?: unknown) => void) {
    const expiresAt = session.cookie.expires
        ? new Date(session.cookie.expires)
        : new Date(Date.now() + 7 * 86400000),
      data = JSON.stringify(session);
    db.webSession
      .upsert({
        where: { id },
        create: { id, data, expiresAt },
        update: { data, expiresAt },
      })
      .then(async () => {
        if (Date.now() > this.cleanupAt) {
          this.cleanupAt = Date.now() + 600000;
          await db.webSession.deleteMany({
            where: { expiresAt: { lt: new Date() } },
          });
        }
        callback?.();
      })
      .catch((error) => callback?.(error));
  }
  destroy(id: string, callback?: (error?: unknown) => void) {
    db.webSession
      .deleteMany({ where: { id } })
      .then(() => callback?.())
      .catch((error) => callback?.(error));
  }
  touch(
    id: string,
    session: SessionData,
    callback?: (error?: unknown) => void,
  ) {
    const expiresAt = session.cookie.expires
      ? new Date(session.cookie.expires)
      : new Date(Date.now() + 7 * 86400000);
    db.webSession
      .updateMany({ where: { id }, data: { expiresAt } })
      .then(() => callback?.())
      .catch((error) => callback?.(error));
  }
}
