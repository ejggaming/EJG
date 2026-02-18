import express, { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cookieParser from "cookie-parser";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { PrismaClient } from "./generated/prisma";
import { config } from "./config/config";
import openApiSpecs from "./docs/openApiSpecs";
import verifyToken from "./middleware/verifyToken";
import { connectAllDatabases, disconnectAllDatabases } from "./config/database";
import { securityMiddleware, devSecurityMiddleware } from "./middleware/security";
import { authSecurityMiddleware } from "./middleware/security";

process.setMaxListeners(50);

const app = express();
const prisma = new PrismaClient();

const server = createServer(app);
const io = new Server(server, {
	cors: {
		origin: config.cors.origins,
		credentials: config.cors.credentials,
	},
});

app.use((req: Request, res: Response, next: NextFunction) => {
	(req as any).io = io;
	next();
});

// Apply security middleware based on environment
if (process.env.NODE_ENV === "production") {
	app.use(securityMiddleware);
	console.log("🔒 Production security middleware enabled");
} else {
	app.use(devSecurityMiddleware);
	console.log("⚠ Development security middleware enabled (relaxed mode)");
}

const template = require("./app/template")(prisma);
const wallet = require("./app/wallet")(prisma);
const kyc = require("./app/kyc")(prisma);
const session = require("./app/session")(prisma);
const agent = require("./app/agent")(prisma);
const territory = require("./app/territory")(prisma);
const drawschedule = require("./app/drawschedule")(prisma);
const juetengdraw = require("./app/juetengdraw")(prisma);
const juetengbet = require("./app/juetengbet")(prisma);
const juetengconfig = require("./app/juetengconfig")(prisma);
const juetengpayout = require("./app/juetengpayout")(prisma);
const commission = require("./app/commission")(prisma);
const auth = require("./app/auth")(prisma);
const notification = require("./app/notification")(prisma);
const docs = require("./app/docs/docs");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Configure CORS
app.use(
	cors({
		origin: config.cors.origins,
		credentials: config.cors.credentials,
	}),
);

// Health check endpoint
app.get("/", (req: Request, res: Response) => {
	res.status(200).json({
		status: "healthy",
		timestamp: new Date().toISOString(),
		uptime: process.uptime(),
	});
});

// Enhanced health check with SLA status
app.get("/health", (req: Request, res: Response) => {
	// Import slaMonitor at the top level instead
	res.status(200).json({
		status: "healthy",
		timestamp: new Date().toISOString(),
		uptime: process.uptime(),
		message: "SLA monitoring is active",
	});
});

// Redis health check endpoint
app.get("/health/redis", async (req: Request, res: Response) => {
	try {
		const { redisClient } = await import("./config/redis");
		const start = Date.now();
		await redisClient.ping();
		const latency = Date.now() - start;

		const stats = await redisClient.getClient().info("memory");
		const memoryMatch = stats.match(/used_memory_human:(.+)/);
		const memoryUsage = memoryMatch ? memoryMatch[1].trim() : "Unknown";

		const dbsize = await redisClient.getClient().dbsize();

		res.status(200).json({
			status: "healthy",
			redis: {
				connected: redisClient.isClientConnected(),
				latency: `${latency}ms`,
				memoryUsage,
				totalKeys: dbsize,
			},
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		res.status(503).json({
			status: "unhealthy",
			redis: {
				connected: false,
				error: error instanceof Error ? error.message : "Unknown error",
			},
			timestamp: new Date().toISOString(),
		});
	}
});

// Set up routes that don't need authentication
if (process.env.NODE_ENV !== "production") {
	app.use(`${config.baseApiPath}/swagger`, swaggerUi.serve, swaggerUi.setup(openApiSpecs()));
}

// Apply authentication-specific security middleware
app.use(`${config.baseApiPath}/auth`, authSecurityMiddleware);

// Auth routes (no token required for register/login/otp)
app.use(config.baseApiPath, auth);

// Apply middleware for protected routes, excluding /docs and /auth
app.use(config.baseApiPath, (req: Request, res: Response, next: NextFunction) => {
	if (req.path.startsWith("/docs") || req.path.startsWith("/auth")) {
		// Skip middleware for the docs and auth routes
		return next();
	}
	verifyToken(req, res, () => {
		next();
	});
});

app.use(config.baseApiPath, template);
app.use(config.baseApiPath, wallet);
app.use(config.baseApiPath, kyc);
app.use(config.baseApiPath, session);
app.use(config.baseApiPath, agent);
app.use(config.baseApiPath, territory);
app.use(config.baseApiPath, drawschedule);
app.use(config.baseApiPath, juetengdraw);
app.use(config.baseApiPath, juetengbet);
app.use(config.baseApiPath, juetengconfig);
app.use(config.baseApiPath, juetengpayout);
app.use(config.baseApiPath, commission);
app.use(config.baseApiPath, notification);
app.use(config.baseApiPath, docs(prisma, app));

// Store app instance globally for docs generation after all routes are registered
(global as any).app = app;

server.listen(config.port, async () => {
	await connectAllDatabases();
	console.log(`Server is running on port ${config.port}`);
});

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
	try {
		await disconnectAllDatabases();
		console.log("✅ All database connections closed");
		process.exit(0);
	} catch (error) {
		console.error("❌ Error during shutdown:", error);
		process.exit(1);
	}
};

// Register shutdown handlers
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
