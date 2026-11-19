import { z } from "zod";

/** Fields a user types when registering a free-cancellation record (/취소확인). */
export const cancellationInputSchema = z.object({
  cancelDate: z.string().date(),
  reservationNumber: z.string().trim().min(1).max(60),
  guestName: z.string().trim().min(1).max(100),
  checkInDate: z.string().date(),
  /** Refunded share in percent: 100 = full cancellation, lower = partial. */
  cancellationRate: z.number().int().min(1).max(100),
  manager: z.string().trim().max(60),
  reason: z.string().trim().max(2000),
});

export type CancellationInput = z.infer<typeof cancellationInputSchema>;
