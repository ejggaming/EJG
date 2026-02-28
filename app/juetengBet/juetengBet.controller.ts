import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../../generated/prisma";
import { getLogger } from "../../helper/logger";
import { transformFormDataToObject } from "../../helper/transformObject";
import { validateQueryParams } from "../../helper/validation-helper";
import {
	buildFilterConditions,
	buildFindManyQuery,
	buildSearchConditions,
	getNestedFields,
} from "../../helper/query-builder";
import { buildSuccessResponse, buildPagination } from "../../helper/success-handler";
import { groupDataByField } from "../../helper/dataGrouping";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import { CreateJuetengBetSchema, UpdateJuetengBetSchema } from "../../zod/juetengBet.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const juetengBetLogger = logger.child({ module: "juetengBet" });

const toSingleString = (v: unknown): string | undefined => {
	if (v === undefined || v === null) return undefined;
	if (typeof v === "string") return v;
	if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") return v[0];
	return undefined;
};

/** Build sorted combinationKey: (5,12) and (12,5) both become "5-12" */
function buildCombinationKey(n1: number, n2: number): string {
	return [n1, n2].sort((a, b) => a - b).join("-");
}

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			juetengBetLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			juetengBetLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateJuetengBetSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			juetengBetLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			res.status(400).json(buildErrorResponse("Validation failed", 400, formattedErrors));
			return;
		}

		const { drawId, number1, number2, amount, currency, caboId } = validation.data;

		// Default bettorId to authenticated user if not provided (self-service)
		const bettorId = validation.data.bettorId || (req as any).userId;
		const cobradorId = validation.data.cobradorId || undefined;

		if (!bettorId) {
			res.status(400).json(buildErrorResponse("bettorId is required", 400));
			return;
		}

		try {
			// 1. Fetch active game config
			const gameConfig = await prisma.juetengConfig.findFirst({ where: { isActive: true } });
			if (!gameConfig) {
				juetengBetLogger.error("No active JuetengConfig found");
				res.status(503).json(buildErrorResponse("Game configuration unavailable", 503));
				return;
			}

			// 2. Validate draw exists and is OPEN
			const draw = await prisma.juetengDraw.findFirst({ where: { id: drawId } });
			if (!draw) {
				res.status(404).json(buildErrorResponse(config.ERROR.JUETENGDRAW.NOT_FOUND, 404));
				return;
			}
			if (draw.status !== "OPEN") {
				res.status(422).json(
					buildErrorResponse("Draw is not accepting bets. Status must be OPEN.", 422),
				);
				return;
			}

			// 3. Validate numbers are within the configured range (1–maxNumber)
			if (
				number1 < 1 ||
				number1 > gameConfig.maxNumber ||
				number2 < 1 ||
				number2 > gameConfig.maxNumber
			) {
				res.status(400).json(
					buildErrorResponse(
						`Numbers must be between 1 and ${gameConfig.maxNumber}`,
						400,
					),
				);
				return;
			}

			// 4. Validate bet amount within configured limits
			if (amount < gameConfig.minBet || amount > gameConfig.maxBet) {
				res.status(400).json(
					buildErrorResponse(
						`Bet amount must be between ₱${gameConfig.minBet} and ₱${gameConfig.maxBet}`,
						400,
					),
				);
				return;
			}

			// 5. Auto-generate order-independent combinationKey e.g. "5-12"
			const combinationKey = buildCombinationKey(number1, number2);

			// 6. Auto-generate unique reference: YYYYMMDD-{MRN|AFT}-{RANDOM}
			// Using a random suffix avoids collisions under concurrent bet placement,
			// which previously caused unique constraint violations on jueteng_bets.reference.
			const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
			const typeAbbr =
				draw.drawType === "MORNING" ? "MRN" : draw.drawType === "EVENING" ? "EVN" : "AFT";
			// Always produce exactly 8 chars: pad short base-36 strings to prevent collisions
			const randomSuffix = Math.random().toString(36).slice(2).padEnd(8, "0").slice(0, 8).toUpperCase();
			const reference = `${dateStr}-${typeAbbr}-${randomSuffix}`;

			// 7. Check wallet balance and deduct atomically
			const wallet = await prisma.wallet.findUnique({ where: { userId: bettorId } });
			if (!wallet) {
				res.status(404).json(
					buildErrorResponse("Wallet not found. Please set up your wallet first.", 404),
				);
				return;
			}
			if (wallet.status !== "ACTIVE") {
				res.status(422).json(buildErrorResponse("Your wallet is not active.", 422));
				return;
			}
			if (wallet.balance < amount) {
				res.status(422).json(
					buildErrorResponse(
						`Insufficient balance. Your balance is ₱${wallet.balance.toLocaleString()}, but the bet requires ₱${amount.toLocaleString()}.`,
						422,
					),
				);
				return;
			}

			const newBalance = wallet.balance - amount;
			const txReference = `BET-${reference}`;

			// 8. Atomic transaction: deduct wallet + create bet + record transaction + update draw stats
			const [updatedWallet, juetengBet, walletTx, updatedDraw] = await prisma.$transaction([
				prisma.wallet.update({
					where: { id: wallet.id },
					data: { balance: newBalance },
				}),
				prisma.juetengBet.create({
					data: {
						drawId,
						bettorId,
						cobradorId,
						caboId,
						number1,
						number2,
						combinationKey,
						amount,
						currency: currency ?? "PHP",
						status: "PENDING",
						isWinner: false,
						reference,
					},
				}),
				prisma.transaction.create({
					data: {
						userId: bettorId,
						walletId: wallet.id,
						type: "JUETENG_BET",
						amount,
						balanceBefore: wallet.balance,
						balanceAfter: newBalance,
						currency: wallet.currency,
						status: "COMPLETED",
						reference: txReference,
						description: `Bet placed on ${typeAbbr === "MRN" ? "Morning" : typeAbbr === "EVN" ? "Evening" : "Afternoon"} draw — ${combinationKey}`,
					},
				}),
				prisma.juetengDraw.update({
					where: { id: drawId },
					data: {
						totalBets: { increment: 1 },
						totalStake: { increment: amount },
						grossProfit: { increment: amount },
					},
				}),
			]);
			juetengBetLogger.info(`JuetengBet created successfully: ${juetengBet.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.JUETENGBET.ACTIONS.CREATE_JUETENGBET,
				description: `${config.ACTIVITY_LOG.JUETENGBET.DESCRIPTIONS.JUETENGBET_CREATED}: ${juetengBet.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.JUETENGBET.PAGES.JUETENGBET_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.JUETENGBET,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.JUETENGBET,
				entityId: juetengBet.id,
				changesBefore: null,
				changesAfter: {
					id: juetengBet.id,
					status: juetengBet.status,
					reference: juetengBet.reference,
					combinationKey: juetengBet.combinationKey,
					createdAt: juetengBet.createdAt,
				},
				description: `${config.AUDIT_LOG.JUETENGBET.DESCRIPTIONS.JUETENGBET_CREATED}: ${juetengBet.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:juetengBet:list:*");
				juetengBetLogger.info("JuetengBet list cache invalidated after creation");
			} catch (cacheError) {
				juetengBetLogger.warn(
					"Failed to invalidate cache after juetengBet creation:",
					cacheError,
				);
			}

			res.status(201).json(
				buildSuccessResponse(config.SUCCESS.JUETENGBET.CREATED, juetengBet, 201),
			);
		} catch (error) {
			juetengBetLogger.error(`${config.ERROR.JUETENGBET.CREATE_FAILED}: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, juetengBetLogger);

		if (!validationResult.isValid) {
			res.status(400).json(validationResult.errorResponse);
			return;
		}

		const {
			page,
			limit,
			order,
			fields,
			sort,
			skip,
			query,
			document,
			pagination,
			count,
			filter,
			groupBy,
		} = validationResult.validatedParams!;

		juetengBetLogger.info(
			`Getting juetengBets, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			const whereClause: Prisma.JuetengBetWhereInput = {};

			// Non-admins can only see their own bets
			const role = (req as any).role as string | undefined;
			const userId = (req as any).userId as string | undefined;
			if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
				if (!userId) {
					res.status(401).json(buildErrorResponse("Unauthorized", 401));
					return;
				}
				whereClause.bettorId = userId;
			}

			const searchFields = ["status", "combinationKey", "reference"];
			if (query) {
				const searchConditions = buildSearchConditions("JuetengBet", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("JuetengBet", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [juetengBets, total] = await Promise.all([
				document ? prisma.juetengBet.findMany(findManyQuery) : [],
				count ? prisma.juetengBet.count({ where: whereClause }) : 0,
			]);

			juetengBetLogger.info(`Retrieved ${juetengBets.length} juetengBets`);
			const processedData =
				groupBy && document
					? groupDataByField(juetengBets, groupBy as string)
					: juetengBets;

			const responseData: Record<string, any> = {
				...(document && { juetengBets: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.JUETENGBET.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			juetengBetLogger.error(`${config.ERROR.JUETENGBET.GET_ALL_FAILED}: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const id = toSingleString(req.params.id);
		const fields = toSingleString(req.query.fields);

		try {
			if (!id) {
				juetengBetLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				res.status(400).json(buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400));
				return;
			}

			juetengBetLogger.info(`${config.SUCCESS.JUETENGBET.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:juetengBet:byId:${id}:${fields || "full"}`;
			let juetengBet = null;

			try {
				if (redisClient.isClientConnected()) {
					juetengBet = await redisClient.getJSON(cacheKey);
					if (juetengBet) {
						juetengBetLogger.info(`JuetengBet ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				juetengBetLogger.warn(
					`Redis cache retrieval failed for juetengBet ${id}:`,
					cacheError,
				);
			}

			if (!juetengBet) {
				const query: Prisma.JuetengBetFindFirstArgs = { where: { id } };
				query.select = getNestedFields(fields);
				juetengBet = await prisma.juetengBet.findFirst(query);

				if (juetengBet && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, juetengBet, 3600);
						juetengBetLogger.info(`JuetengBet ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						juetengBetLogger.warn(
							`Failed to store juetengBet ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!juetengBet) {
				juetengBetLogger.error(`${config.ERROR.JUETENGBET.NOT_FOUND}: ${id}`);
				res.status(404).json(buildErrorResponse(config.ERROR.JUETENGBET.NOT_FOUND, 404));
				return;
			}

			juetengBetLogger.info(
				`${config.SUCCESS.JUETENGBET.RETRIEVED}: ${(juetengBet as any).id}`,
			);
			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.JUETENGBET.RETRIEVED, juetengBet, 200),
			);
		} catch (error) {
			juetengBetLogger.error(`${config.ERROR.JUETENGBET.ERROR_GETTING}: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const id = toSingleString(req.params.id);

		try {
			if (!id) {
				juetengBetLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				res.status(400).json(buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400));
				return;
			}

			const validationResult = UpdateJuetengBetSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				juetengBetLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				res.status(400).json(buildErrorResponse("Validation failed", 400, formattedErrors));
				return;
			}

			if (Object.keys(req.body).length === 0) {
				juetengBetLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				res.status(400).json(buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400));
				return;
			}

			const existingJuetengBet = await prisma.juetengBet.findFirst({ where: { id } });

			if (!existingJuetengBet) {
				juetengBetLogger.error(`${config.ERROR.JUETENGBET.NOT_FOUND}: ${id}`);
				res.status(404).json(buildErrorResponse(config.ERROR.JUETENGBET.NOT_FOUND, 404));
				return;
			}

			const updatedJuetengBet = await prisma.juetengBet.update({
				where: { id },
				data: validationResult.data,
			});

			try {
				await invalidateCache.byPattern(`cache:juetengBet:byId:${id}:*`);
				await invalidateCache.byPattern("cache:juetengBet:list:*");
				juetengBetLogger.info(`Cache invalidated after juetengBet ${id} update`);
			} catch (cacheError) {
				juetengBetLogger.warn(
					"Failed to invalidate cache after juetengBet update:",
					cacheError,
				);
			}

			juetengBetLogger.info(`${config.SUCCESS.JUETENGBET.UPDATED}: ${updatedJuetengBet.id}`);
			res.status(200).json(
				buildSuccessResponse(
					config.SUCCESS.JUETENGBET.UPDATED,
					{ juetengBet: updatedJuetengBet },
					200,
				),
			);
		} catch (error) {
			juetengBetLogger.error(`${config.ERROR.JUETENGBET.ERROR_UPDATING}: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const id = toSingleString(req.params.id);

		try {
			if (!id) {
				juetengBetLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				res.status(400).json(buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400));
				return;
			}

			const existingJuetengBet = await prisma.juetengBet.findFirst({ where: { id } });

			if (!existingJuetengBet) {
				juetengBetLogger.error(`${config.ERROR.JUETENGBET.NOT_FOUND}: ${id}`);
				res.status(404).json(buildErrorResponse(config.ERROR.JUETENGBET.NOT_FOUND, 404));
				return;
			}

			await prisma.juetengBet.delete({ where: { id } });

			try {
				await invalidateCache.byPattern(`cache:juetengBet:byId:${id}:*`);
				await invalidateCache.byPattern("cache:juetengBet:list:*");
				juetengBetLogger.info(`Cache invalidated after juetengBet ${id} deletion`);
			} catch (cacheError) {
				juetengBetLogger.warn(
					"Failed to invalidate cache after juetengBet deletion:",
					cacheError,
				);
			}

			juetengBetLogger.info(`${config.SUCCESS.JUETENGBET.DELETED}: ${id}`);
			res.status(200).json(buildSuccessResponse(config.SUCCESS.JUETENGBET.DELETED, {}, 200));
		} catch (error) {
			juetengBetLogger.error(`${config.ERROR.JUETENGBET.DELETE_FAILED}: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	return { create, getAll, getById, update, remove };
};
