import { z } from "zod";

// Create Template Schema - fields accepted on creation
export const CreateTemplateSchema = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
	type: z.string().optional(),
	isDeleted: z.boolean().default(false),
});

export type CreateTemplate = z.infer<typeof CreateTemplateSchema>;

// Update Template Schema - all fields optional for partial updates
export const UpdateTemplateSchema = CreateTemplateSchema.partial();

export type UpdateTemplate = z.infer<typeof UpdateTemplateSchema>;
