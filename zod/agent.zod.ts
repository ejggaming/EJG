import { z } from "zod";

// Create Agent Schema
export const CreateAgentSchema = z.object({
	userId: z.string().min(1),
	role: z.enum(["COBRADOR", "CABO", "OPERATOR", "CAPITALISTA", "PAGADOR", "BOLADOR"]),
	territoryId: z.string().optional(),
	supervisorId: z.string().optional(),
	commissionRate: z.number().min(0).max(1).optional(),
	status: z.enum(["ACTIVE", "SUSPENDED", "INACTIVE"]).optional(),
	isActive: z.boolean().optional(),
});

export type CreateAgent = z.infer<typeof CreateAgentSchema>;

// Update Agent Schema
export const UpdateAgentSchema = CreateAgentSchema.partial();

export type UpdateAgent = z.infer<typeof UpdateAgentSchema>;
