import { z } from "zod";

// Create Territory Schema
export const CreateTerritorySchema = z.object({
	name: z.string().min(1),
	barangay: z.string().optional(),
	municipality: z.string().optional(),
	province: z.string().optional(),
	region: z.string().optional(),
	isActive: z.boolean().optional(),
});

export type CreateTerritory = z.infer<typeof CreateTerritorySchema>;

// Update Territory Schema
export const UpdateTerritorySchema = CreateTerritorySchema.partial();

export type UpdateTerritory = z.infer<typeof UpdateTerritorySchema>;
