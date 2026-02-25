import dotenv from "dotenv";

dotenv.config();

// Guard: refuse to start with default JWT secret in production
if (
	process.env.NODE_ENV === "production" &&
	(!process.env.JWT_SECRET || process.env.JWT_SECRET === "change-me-in-production")
) {
	console.error("FATAL: JWT_SECRET must be set in production. Exiting.");
	process.exit(1);
}

export const config = {
	port: process.env.PORT || 3000,
	baseApiPath: "/api",
	betterStackSourceToken: process.env.BETTER_STACK_SOURCE_TOKEN || "",
	betterStackHost: process.env.BETTER_STACK_HOST || "",
	cors: {
		origins: process.env.CORS_ORIGINS
			? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim())
			: ["http://localhost:3000"],
		credentials: process.env.CORS_CREDENTIALS === "true",
	},
	redis: {
		url: process.env.REDIS_URL || "redis://localhost:6379",
		host: process.env.REDIS_HOST || "localhost",
		port: parseInt(process.env.REDIS_PORT || "6379"),
		password: process.env.REDIS_PASSWORD || undefined,
		db: parseInt(process.env.REDIS_DB || "0"),
		enabled: process.env.REDIS_ENABLED !== "false", // Default to enabled
	},
	jwt: {
		secret: process.env.JWT_SECRET || "change-me-in-production",
		accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY || "15m",
		refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRY || "7d",
		cookieMaxAge: parseInt(process.env.JWT_COOKIE_MAX_AGE || "900000"), // 15 min default
		refreshCookieMaxAge: parseInt(process.env.JWT_REFRESH_COOKIE_MAX_AGE || "604800000"), // 7 days default
	},
	otp: {
		length: parseInt(process.env.OTP_LENGTH || "6"),
		expiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES || "10"),
		maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS || "5"),
	},
	email: {
		host: process.env.EMAIL_HOST || "smtp.gmail.com",
		port: parseInt(process.env.EMAIL_PORT || "587"),
		secure: process.env.EMAIL_SECURE === "true",
		user: process.env.SMTP_USER || process.env.EMAIL || "",
		appPassword: process.env.APP_PASSWORD || "",
		from: process.env.EMAIL_FROM || process.env.SMTP_USER || process.env.EMAIL || "noreply@jueteng.ph",
	},
};
