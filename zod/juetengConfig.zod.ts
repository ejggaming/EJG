import { z } from "zod";

// Create JuetengConfig Schema
export const CreateJuetengConfigSchema = z.object({
	maxNumber: z.number().int().min(1).optional(),
	allowRepeat: z.boolean().optional(),
	payoutMultiplier: z.number().positive().optional(),
	minBet: z.number().positive().optional(),
	maxBet: z.number().positive().optional(),
	cobradorRate: z.number().min(0).max(1).optional(),
	caboRate: z.number().min(0).max(1).optional(),
	capitalistaRate: z.number().min(0).max(1).optional(),
	governmentRate: z.number().min(0).max(1).optional(),
	currency: z.string().optional(),
	isActive: z.boolean().optional(),
});

export type CreateJuetengConfig = z.infer<typeof CreateJuetengConfigSchema>;

// Update JuetengConfig Schema
export const UpdateJuetengConfigSchema = CreateJuetengConfigSchema.partial();

export type UpdateJuetengConfig = z.infer<typeof UpdateJuetengConfigSchema>;
