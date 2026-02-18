import { z } from "zod";

// Create DrawCommission Schema
export const CreateCommissionSchema = z.object({
	agentId: z.string().min(1),
	drawId: z.string().min(1),
	type: z.enum(["COLLECTION", "WINNER_BONUS", "CAPITALISTA", "FIXED"]),
	rate: z.number().min(0).max(1),
	baseAmount: z.number().min(0),
	amount: z.number().min(0),
	status: z.enum(["PENDING", "PAID", "CANCELLED"]).optional(),
});

export type CreateCommission = z.infer<typeof CreateCommissionSchema>;

// Update DrawCommission Schema
export const UpdateCommissionSchema = CreateCommissionSchema.partial();

export type UpdateCommission = z.infer<typeof UpdateCommissionSchema>;
