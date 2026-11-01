import { db, AppError } from "../server/db.js";
import { book } from "../server/booking.js";
process.once("message", async () => {
  try {
    await book(
      { id: process.env.BOOKING_ACTOR!, role: "CLIENT" },
      { sessionId: "s1" },
    );
    process.send?.({ ok: true });
  } catch (error) {
    process.send?.({
      ok: false,
      error:
        error instanceof AppError
          ? error.message
          : "Unexpected database failure",
    });
  } finally {
    await db.$disconnect();
    process.disconnect();
  }
});
process.send?.({ ready: true });
