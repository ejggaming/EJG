import { z } from "zod";

// Create Session Schema
export const CreateSessionSchema = z.object({
	userId: z.string().min(1),
	token: z.string().min(1),
	ipAddress: z.string().optional(),
	userAgent: z.string().optional(),
	expiresAt: z.coerce.date(),
});

export type CreateSession = z.infer<typeof CreateSessionSchema>;

// Update Session Schema
export const UpdateSessionSchema = CreateSessionSchema.partial();

export type UpdateSession = z.infer<typeof UpdateSessionSchema>;
