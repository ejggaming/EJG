import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/config";

// Aligned with Prisma UserRole enum
enum Role {
	PLAYER = "PLAYER",
	AGENT = "AGENT",
	ADMIN = "ADMIN",
	SUPER_ADMIN = "SUPER_ADMIN",
}

export interface AuthRequest extends Request {
	role?: Role;
	userId?: string;
	firstName?: string;
	lastName?: string;
	organizationId?: string;
}

interface JwtPayload {
	userId: string;
	role: Role;
	firstName?: string;
	lastName?: string;
	organizationId?: string;
	email?: string;
}

export default (req: AuthRequest, res: Response, next: NextFunction) => {
	const token = req.cookies.token;

	if (!token) {
		res.status(401).json({ message: "Unauthorized" });
		return;
	}

	try {
		const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
		req.role = decoded.role;
		req.userId = decoded.userId;
		req.firstName = decoded.firstName;
		req.lastName = decoded.lastName;
		req.organizationId = decoded.organizationId;
		next();
	} catch (error) {
		res.status(401).json({ message: "Invalid token" });
	}
};
