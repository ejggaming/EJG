import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "../../generated/prisma";
import { getLogger } from "../../helper/logger";
import { buildSuccessResponse, buildPagination } from "../../helper/success-handler";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import { CreateAutoBetSchema } from "../../zod/autoBet.zod";

const logger = getLogger();
const autoBetLogger = logger.child({ module: "autoBet" });

const toSingleString = (v: unknown): string | undefined => {
	if (v === undefined || v === null) return undefined;
	if (typeof v === "string") return v;
	if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") return v[0];
	return undefined;
};

export const controller = (prisma: PrismaClient) => {
	// ── CREATE ──
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		const userId = (req as any).userId;
		if (!userId) {
			res.status(401).json(buildErrorResponse("Unauthorized", 401));
			return;
		}

		const validation = CreateAutoBetSchema.safeParse(req.body);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			res.status(400).json(buildErrorResponse("Validation failed", 400, formattedErrors));
			return;
		}

		const { number1, number2, amountPerBet, durationDays, startDate } = validation.data;

		// Build canonical combination key (smaller number first)
		const combinationKey = `${Math.min(number1, number2)}-${Math.max(number1, number2)}`;

		// Compute dates
		const start = startDate ? new Date(startDate) : new Date();
		start.setHours(0, 0, 0, 0);
		const end = new Date(start);
		end.setDate(end.getDate() + durationDays);

		const totalBets = durationDays * 3;
		const estimatedTotal = totalBets * amountPerBet;

		try {
			// Check current balance
			const wallet = await prisma.wallet.findUnique({ where: { userId } });
			const balance = wallet?.balance ?? 0;

			// Must afford at least 1 bet
			if (balance < amountPerBet) {
				res.status(400).json(
					buildErrorResponse(
						`Insufficient balance. You need at least ₱${amountPerBet} to start auto bet.`,
						400,
					),
				);
				return;
			}

			const daysAffordable = Math.floor(balance / (amountPerBet * 3));

			const config = await prisma.autoBetConfig.create({
				data: {
					userId,
					number1,
					number2,
					combinationKey,
					amountPerBet,
					durationDays,
					startDate: start,
					endDate: end,
					totalBets,
				},
			});

			autoBetLogger.info(`Auto bet config created: ${config.id} for user ${userId}`);

			res.status(201).json(
				buildSuccessResponse(
					"Auto bet configuration created successfully",
					{
						...config,
						estimatedTotal,
						daysAffordable,
						balanceWarning:
							balance < estimatedTotal
								? `Your balance (₱${balance}) covers ${daysAffordable} of ${durationDays} days. Config will pause if balance runs out.`
								: null,
					},
					201,
				),
			);
		} catch (error) {
			autoBetLogger.error(`Create error: ${error}`);
			res.status(500).json(buildErrorResponse("Error creating auto bet configuration", 500));
		}
	};

	// ── GET MY CONFIGS ──
	const getMyConfigs = async (req: Request, res: Response, _next: NextFunction) => {
		const userId = (req as any).userId;
		if (!userId) {
			res.status(401).json(buildErrorResponse("Unauthorized", 401));
			return;
		}

		const page = parseInt(toSingleString(req.query.page) ?? "1", 10);
		const limit = parseInt(toSingleString(req.query.limit) ?? "10", 10);
		const skip = (page - 1) * limit;
		const status = toSingleString(req.query.status);

		try {
			const where: any = { userId };
			if (status) where.status = status;

			const [configs, total] = await Promise.all([
				prisma.autoBetConfig.findMany({
					where,
					skip,
					take: limit,
					orderBy: { createdAt: "desc" },
					include: { executions: { orderBy: { executedAt: "desc" }, take: 5 } },
				}),
				prisma.autoBetConfig.count({ where }),
			]);

			res.status(200).json(
				buildSuccessResponse("Auto bet configurations retrieved", {
					configs,
					count: total,
					pagination: buildPagination(total, page, limit),
				}),
			);
		} catch (error) {
			autoBetLogger.error(`Get my configs error: ${error}`);
			res.status(500).json(
				buildErrorResponse("Error retrieving auto bet configurations", 500),
			);
		}
	};

	// ── GET BY ID ──
	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const id = toSingleString(req.params.id);
		const userId = (req as any).userId;
		const role = (req as any).role;

		if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
			res.status(400).json(buildErrorResponse("Invalid ID format", 400));
			return;
		}

		try {
			const config = await prisma.autoBetConfig.findUnique({
				where: { id },
				include: {
					executions: { orderBy: { executedAt: "desc" } },
					user: { select: { id: true, userName: true, email: true } },
				},
			});

			if (!config) {
				res.status(404).json(buildErrorResponse("Auto bet configuration not found", 404));
				return;
			}

			// Only owner or admin can view
			if (role !== "ADMIN" && role !== "SUPER_ADMIN" && config.userId !== userId) {
				res.status(403).json(buildErrorResponse("Forbidden", 403));
				return;
			}

			res.status(200).json(buildSuccessResponse("Auto bet configuration retrieved", config));
		} catch (error) {
			autoBetLogger.error(`Get by ID error: ${error}`);
			res.status(500).json(
				buildErrorResponse("Error retrieving auto bet configuration", 500),
			);
		}
	};

	// ── PAUSE ──
	const pause = async (req: Request, res: Response, _next: NextFunction) => {
		const id = toSingleString(req.params.id);
		const userId = (req as any).userId;

		if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
			res.status(400).json(buildErrorResponse("Invalid ID format", 400));
			return;
		}

		try {
			const existing = await prisma.autoBetConfig.findUnique({ where: { id } });
			if (!existing) {
				res.status(404).json(buildErrorResponse("Auto bet configuration not found", 404));
				return;
			}
			if (existing.userId !== userId) {
				res.status(403).json(buildErrorResponse("Forbidden", 403));
				return;
			}
			if (existing.status !== "ACTIVE") {
				res.status(422).json(
					buildErrorResponse("Only ACTIVE configurations can be paused", 422),
				);
				return;
			}

			const updated = await prisma.autoBetConfig.update({
				where: { id },
				data: { status: "PAUSED" },
			});

			res.status(200).json(buildSuccessResponse("Auto bet configuration paused", updated));
		} catch (error) {
			autoBetLogger.error(`Pause error: ${error}`);
			res.status(500).json(buildErrorResponse("Error pausing auto bet configuration", 500));
		}
	};

	// ── RESUME ──
	const resume = async (req: Request, res: Response, _next: NextFunction) => {
		const id = toSingleString(req.params.id);
		const userId = (req as any).userId;

		if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
			res.status(400).json(buildErrorResponse("Invalid ID format", 400));
			return;
		}

		try {
			const existing = await prisma.autoBetConfig.findUnique({ where: { id } });
			if (!existing) {
				res.status(404).json(buildErrorResponse("Auto bet configuration not found", 404));
				return;
			}
			if (existing.userId !== userId) {
				res.status(403).json(buildErrorResponse("Forbidden", 403));
				return;
			}
			if (existing.status !== "PAUSED") {
				res.status(422).json(
					buildErrorResponse("Only PAUSED configurations can be resumed", 422),
				);
				return;
			}

			// Check if the config period hasn't expired
			const now = new Date();
			if (now > existing.endDate) {
				res.status(422).json(
					buildErrorResponse(
						"Auto bet period has expired. Create a new configuration.",
						422,
					),
				);
				return;
			}

			const updated = await prisma.autoBetConfig.update({
				where: { id },
				data: { status: "ACTIVE" },
			});

			res.status(200).json(buildSuccessResponse("Auto bet configuration resumed", updated));
		} catch (error) {
			autoBetLogger.error(`Resume error: ${error}`);
			res.status(500).json(buildErrorResponse("Error resuming auto bet configuration", 500));
		}
	};

	// ── CANCEL ──
	const cancel = async (req: Request, res: Response, _next: NextFunction) => {
		const id = toSingleString(req.params.id);
		const userId = (req as any).userId;

		if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
			res.status(400).json(buildErrorResponse("Invalid ID format", 400));
			return;
		}

		try {
			const existing = await prisma.autoBetConfig.findUnique({ where: { id } });
			if (!existing) {
				res.status(404).json(buildErrorResponse("Auto bet configuration not found", 404));
				return;
			}
			if (existing.userId !== userId) {
				res.status(403).json(buildErrorResponse("Forbidden", 403));
				return;
			}
			if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
				res.status(422).json(
					buildErrorResponse("Configuration is already completed or cancelled", 422),
				);
				return;
			}

			const updated = await prisma.autoBetConfig.update({
				where: { id },
				data: { status: "CANCELLED" },
			});

			res.status(200).json(buildSuccessResponse("Auto bet configuration cancelled", updated));
		} catch (error) {
			autoBetLogger.error(`Cancel error: ${error}`);
			res.status(500).json(
				buildErrorResponse("Error cancelling auto bet configuration", 500),
			);
		}
	};

	// ── GET ALL (admin) ──
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const page = parseInt(toSingleString(req.query.page) ?? "1", 10);
		const limit = parseInt(toSingleString(req.query.limit) ?? "20", 10);
		const skip = (page - 1) * limit;
		const status = toSingleString(req.query.status);
		const userId = toSingleString(req.query.userId);

		try {
			const where: any = {};
			if (status) where.status = status;
			if (userId) where.userId = userId;

			const [configs, total] = await Promise.all([
				prisma.autoBetConfig.findMany({
					where,
					skip,
					take: limit,
					orderBy: { createdAt: "desc" },
					include: { user: { select: { id: true, userName: true, email: true } } },
				}),
				prisma.autoBetConfig.count({ where }),
			]);

			res.status(200).json(
				buildSuccessResponse("Auto bet configurations retrieved", {
					configs,
					count: total,
					pagination: buildPagination(total, page, limit),
				}),
			);
		} catch (error) {
			autoBetLogger.error(`Get all error: ${error}`);
			res.status(500).json(
				buildErrorResponse("Error retrieving auto bet configurations", 500),
			);
		}
	};

	return { create, getMyConfigs, getById, pause, resume, cancel, getAll };
};
