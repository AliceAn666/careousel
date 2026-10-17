import type { getState } from "../server/services/scheduling";
type Json<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Json<U>[]
    : T extends object
      ? { [K in keyof T]: Json<T[K]> }
      : T;
export type AppState = Json<Awaited<ReturnType<typeof getState>>> & {
  auth?: {
    mode: "account" | "demo" | "anonymous";
    username: string | null;
    clinicRole: string | null;
    demoMode: boolean;
    demoAvailable: boolean;
  };
};
export type SlotView = AppState["slots"][number];

export type Action = (data: unknown) => Promise<boolean>;
export type Booking = AppState["bookings"][number];
export type Waitlist = AppState["waitlists"][number];
