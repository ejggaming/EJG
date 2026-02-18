import { z } from "zod";

// Create JuetengPayout Schema
export const CreateJuetengPayoutSchema = z.object({
	betId: z.string().min(1),
	drawId: z.string().min(1),
	bettorId: z.string().min(1),
	pagadorId: z.string().optional(),
	amount: z.number().positive(),
	currency: z.string().optional(),
	status: z.enum(["PENDING", "PAID", "CLAIMED", "FAILED", "CANCELLED"]).optional(),
	paidAt: z.coerce.date().optional(),
	claimedAt: z.coerce.date().optional(),
	notes: z.string().optional(),
});

export type CreateJuetengPayout = z.infer<typeof CreateJuetengPayoutSchema>;

// Update JuetengPayout Schema
export const UpdateJuetengPayoutSchema = CreateJuetengPayoutSchema.partial();

export type UpdateJuetengPayout = z.infer<typeof UpdateJuetengPayoutSchema>;
