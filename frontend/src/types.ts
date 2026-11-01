export type Format = "GROUP" | "PERSONAL" | "KIDS";
export type Level = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
export type User = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: "CLIENT" | "ADMIN";
  _count?: { bookings: number };
};
export type Trainer = {
  id: string;
  name: string;
  bio: string;
  archived: boolean;
};
export type Venue = {
  id: string;
  name: string;
  address: string;
  archived: boolean;
  courts: Court[];
};
export type Court = {
  id: string;
  name: string;
  venueId: string;
  archived: boolean;
  venue: Venue;
};
export type Club = {
  name: string;
  timezone: string;
  phone: string;
  email: string;
  address: string;
  cancelHours: number;
};
export type Session = {
  id: string;
  startsAt: string;
  endsAt: string;
  trainerId: string;
  courtId: string;
  trainer: Trainer;
  court: Court;
  format: Format;
  level: Level;
  price: number;
  capacity: number;
  open: boolean;
  cancelled: boolean;
  seriesId?: string;
  _count: { bookings: number };
};
export type Booking = {
  id: string;
  sessionId: string;
  session: Session;
  userId: string | null;
  user?: User;
  guestName: string | null;
  guestPhone: string | null;
  childName: string | null;
  childAge: number | null;
  status:
    "BOOKED" | "CANCELLED_CLIENT" | "CANCELLED_CLUB" | "ATTENDED" | "MISSED";
};
export type PublicData = { club: Club; trainers: Trainer[]; venues: Venue[] };
export const formats: Record<Format, string> = {
  GROUP: "Групповая",
  PERSONAL: "Индивидуальная",
  KIDS: "Детская",
};
export const levels: Record<Level, string> = {
  BEGINNER: "Начинающий",
  INTERMEDIATE: "Средний",
  ADVANCED: "Продвинутый",
};
export const statuses: Record<Booking["status"], string> = {
  BOOKED: "Записан",
  CANCELLED_CLIENT: "Отменено клиентом",
  CANCELLED_CLUB: "Отменено клубом",
  ATTENDED: "Посещено",
  MISSED: "Пропуск",
};
export const money = (n: number) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(n / 100);
export const dateTime = (s: string, tz: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    timeZone: tz,
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(s));
export const time = (s: string, tz: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(s));
