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
import {
	CreateJuetengDrawSchema,
	UpdateJuetengDrawSchema,
	RecordResultSchema,
} from "../../zod/juetengDraw.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const juetengDrawLogger = logger.child({ module: "juetengDraw" });

const toSingleString = (v: unknown): string | undefined => {
	if (v === undefined || v === null) return undefined;
	if (typeof v === "string") return v;
	if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") return v[0];
	return undefined;
};

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			juetengDrawLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			juetengDrawLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateJuetengDrawSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			juetengDrawLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const juetengDraw = await prisma.juetengDraw.create({ data: validation.data });
			juetengDrawLogger.info(`JuetengDraw created successfully: ${juetengDraw.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.JUETENGDRAW.ACTIONS.CREATE_JUETENGDRAW,
				description: `${config.ACTIVITY_LOG.JUETENGDRAW.DESCRIPTIONS.JUETENGDRAW_CREATED}: ${juetengDraw.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.JUETENGDRAW.PAGES.JUETENGDRAW_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.JUETENGDRAW,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.JUETENGDRAW,
				entityId: juetengDraw.id,
				changesBefore: null,
				changesAfter: {
					id: juetengDraw.id,
					status: juetengDraw.status,
					drawType: juetengDraw.drawType,
					createdAt: juetengDraw.createdAt,
					updatedAt: juetengDraw.updatedAt,
				},
				description: `${config.AUDIT_LOG.JUETENGDRAW.DESCRIPTIONS.JUETENGDRAW_CREATED}: ${juetengDraw.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:juetengDraw:list:*");
				juetengDrawLogger.info("JuetengDraw list cache invalidated after creation");
			} catch (cacheError) {
				juetengDrawLogger.warn(
					"Failed to invalidate cache after juetengDraw creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.JUETENGDRAW.CREATED,
				juetengDraw,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			juetengDrawLogger.error(`${config.ERROR.JUETENGDRAW.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, juetengDrawLogger);

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

		juetengDrawLogger.info(
			`Getting juetengDraws, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.JuetengDrawWhereInput = {};

			const searchFields = ["status", "drawType", "combinationKey"];
			if (query) {
				const searchConditions = buildSearchConditions("JuetengDraw", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("JuetengDraw", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [juetengDraws, total] = await Promise.all([
				document ? prisma.juetengDraw.findMany(findManyQuery) : [],
				count ? prisma.juetengDraw.count({ where: whereClause }) : 0,
			]);

			juetengDrawLogger.info(`Retrieved ${juetengDraws.length} juetengDraws`);
			const processedData =
				groupBy && document
					? groupDataByField(juetengDraws, groupBy as string)
					: juetengDraws;

			const responseData: Record<string, any> = {
				...(document && { juetengDraws: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.JUETENGDRAW.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			juetengDrawLogger.error(`${config.ERROR.JUETENGDRAW.GET_ALL_FAILED}: ${error}`);
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
				juetengDrawLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			juetengDrawLogger.info(`${config.SUCCESS.JUETENGDRAW.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:juetengDraw:byId:${id}:${fields || "full"}`;
			let juetengDraw = null;

			try {
				if (redisClient.isClientConnected()) {
					juetengDraw = await redisClient.getJSON(cacheKey);
					if (juetengDraw) {
						juetengDrawLogger.info(
							`JuetengDraw ${id} retrieved from direct Redis cache`,
						);
					}
				}
			} catch (cacheError) {
				juetengDrawLogger.warn(
					`Redis cache retrieval failed for juetengDraw ${id}:`,
					cacheError,
				);
			}

			if (!juetengDraw) {
				const query: Prisma.JuetengDrawFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				juetengDraw = await prisma.juetengDraw.findFirst(query);

				if (juetengDraw && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, juetengDraw, 3600);
						juetengDrawLogger.info(`JuetengDraw ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						juetengDrawLogger.warn(
							`Failed to store juetengDraw ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!juetengDraw) {
				juetengDrawLogger.error(`${config.ERROR.JUETENGDRAW.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.JUETENGDRAW.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			juetengDrawLogger.info(
				`${config.SUCCESS.JUETENGDRAW.RETRIEVED}: ${(juetengDraw as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.JUETENGDRAW.RETRIEVED,
				juetengDraw,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			juetengDrawLogger.error(`${config.ERROR.JUETENGDRAW.ERROR_GETTING}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const id = toSingleString(req.params.id);

		try {
			if (!id) {
				juetengDrawLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateJuetengDrawSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				juetengDrawLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				juetengDrawLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			juetengDrawLogger.info(`Updating juetengDraw: ${id}`);

			const existingJuetengDraw = await prisma.juetengDraw.findFirst({
				where: { id },
			});

			if (!existingJuetengDraw) {
				juetengDrawLogger.error(`${config.ERROR.JUETENGDRAW.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.JUETENGDRAW.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedJuetengDraw = await prisma.juetengDraw.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:juetengDraw:byId:${id}:*`);
				await invalidateCache.byPattern("cache:juetengDraw:list:*");
				juetengDrawLogger.info(`Cache invalidated after juetengDraw ${id} update`);
			} catch (cacheError) {
				juetengDrawLogger.warn(
					"Failed to invalidate cache after juetengDraw update:",
					cacheError,
				);
			}

			juetengDrawLogger.info(
				`${config.SUCCESS.JUETENGDRAW.UPDATED}: ${updatedJuetengDraw.id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.JUETENGDRAW.UPDATED,
				{ juetengDraw: updatedJuetengDraw },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			juetengDrawLogger.error(`${config.ERROR.JUETENGDRAW.ERROR_UPDATING}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const id = toSingleString(req.params.id);

		try {
			if (!id) {
				juetengDrawLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			juetengDrawLogger.info(`${config.SUCCESS.JUETENGDRAW.DELETED}: ${id}`);

			const existingJuetengDraw = await prisma.juetengDraw.findFirst({
				where: { id },
			});

			if (!existingJuetengDraw) {
				juetengDrawLogger.error(`${config.ERROR.JUETENGDRAW.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.JUETENGDRAW.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.juetengDraw.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:juetengDraw:byId:${id}:*`);
				await invalidateCache.byPattern("cache:juetengDraw:list:*");
				juetengDrawLogger.info(`Cache invalidated after juetengDraw ${id} deletion`);
			} catch (cacheError) {
				juetengDrawLogger.warn(
					"Failed to invalidate cache after juetengDraw deletion:",
					cacheError,
				);
			}

			juetengDrawLogger.info(`${config.SUCCESS.JUETENGDRAW.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.JUETENGDRAW.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			juetengDrawLogger.error(`${config.ERROR.JUETENGDRAW.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	// ─── Draw Lifecycle Actions ───────────────────────────────────────────────

	/** SCHEDULED → OPEN: start accepting bets */
	const open = async (req: Request, res: Response, _next: NextFunction) => {
		const id = toSingleString(req.params.id);
		if (!id) {
			res.status(400).json(buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400));
			return;
		}
		try {
			const draw = await prisma.juetengDraw.findFirst({ where: { id } });
			if (!draw) {
				res.status(404).json(buildErrorResponse(config.ERROR.JUETENGDRAW.NOT_FOUND, 404));
				return;
			}
			if (draw.status !== "SCHEDULED") {
				res.status(422).json(
					buildErrorResponse("Draw must be in SCHEDULED status to open.", 422),
				);
				return;
			}
			const updated = await prisma.juetengDraw.update({
				where: { id },
				data: { status: "OPEN", openedAt: new Date() },
			});
			await invalidateCache.byPattern(`cache:juetengDraw:byId:${id}:*`).catch(() => {});
			await invalidateCache.byPattern("cache:juetengDraw:list:*").catch(() => {});
			res.status(200).json(
				buildSuccessResponse("Draw opened — bets are now accepted.", updated, 200),
			);
		} catch (error) {
			juetengDrawLogger.error(`Error opening draw ${id}: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	/** OPEN → CLOSED: cutoff reached, stop accepting bets */
	const close = async (req: Request, res: Response, _next: NextFunction) => {
		const id = toSingleString(req.params.id);
		if (!id) {
			res.status(400).json(buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400));
			return;
		}
		try {
			const draw = await prisma.juetengDraw.findFirst({ where: { id } });
			if (!draw) {
				res.status(404).json(buildErrorResponse(config.ERROR.JUETENGDRAW.NOT_FOUND, 404));
				return;
			}
			if (draw.status !== "OPEN") {
				res.status(422).json(
					buildErrorResponse("Draw must be in OPEN status to close.", 422),
				);
				return;
			}
			const updated = await prisma.juetengDraw.update({
				where: { id },
				data: { status: "CLOSED", closedAt: new Date() },
			});
			await invalidateCache.byPattern(`cache:juetengDraw:byId:${id}:*`).catch(() => {});
			await invalidateCache.byPattern("cache:juetengDraw:list:*").catch(() => {});
			res.status(200).json(
				buildSuccessResponse("Draw closed — no more bets accepted.", updated, 200),
			);
		} catch (error) {
			juetengDrawLogger.error(`Error closing draw ${id}: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	/** CLOSED → DRAWN: bolador records the two tambiolo balls */
	const recordResult = async (req: Request, res: Response, _next: NextFunction) => {
		const id = toSingleString(req.params.id);
		if (!id) {
			res.status(400).json(buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400));
			return;
		}

		const validation = RecordResultSchema.safeParse(req.body);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			res.status(400).json(buildErrorResponse("Validation failed", 400, formattedErrors));
			return;
		}

		const { number1, number2, boladorId } = validation.data;

		try {
			const draw = await prisma.juetengDraw.findFirst({ where: { id } });
			if (!draw) {
				res.status(404).json(buildErrorResponse(config.ERROR.JUETENGDRAW.NOT_FOUND, 404));
				return;
			}
			if (draw.status !== "CLOSED") {
				res.status(422).json(
					buildErrorResponse("Draw must be in CLOSED status to record result.", 422),
				);
				return;
			}

			const gameConfig = await prisma.juetengConfig.findFirst({ where: { isActive: true } });
			if (!gameConfig) {
				res.status(503).json(buildErrorResponse("Game configuration unavailable", 503));
				return;
			}
			if (
				number1 < 1 ||
				number1 > gameConfig.maxNumber ||
				number2 < 1 ||
				number2 > gameConfig.maxNumber
			) {
				res.status(400).json(
					buildErrorResponse(
						`Drawn numbers must be between 1 and ${gameConfig.maxNumber}`,
						400,
					),
				);
				return;
			}

			const combinationKey = [number1, number2].sort((a, b) => a - b).join("-");

			const updated = await prisma.juetengDraw.update({
				where: { id },
				data: {
					status: "DRAWN",
					drawnAt: new Date(),
					number1,
					number2,
					combinationKey,
					...(boladorId ? { boladorId } : {}),
				},
			});
			await invalidateCache.byPattern(`cache:juetengDraw:byId:${id}:*`).catch(() => {});
			await invalidateCache.byPattern("cache:juetengDraw:list:*").catch(() => {});
			res.status(200).json(
				buildSuccessResponse(
					`Draw result recorded: ${combinationKey}. Ready to settle.`,
					updated,
					200,
				),
			);
		} catch (error) {
			juetengDrawLogger.error(`Error recording result for draw ${id}: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	/**
	 * DRAWN → SETTLED: determine winners, create payouts, calculate commissions.
	 *
	 * Commission rules (from JuetengConfig):
	 *   - Cobrador (COLLECTION):  cobradorRate × their collected stake
	 *   - Cabo (WINNER_BONUS):    caboRate × winner payouts from supervised bets
	 *   - Capitalista (CAPITALISTA): capitalistaRate × total draw stake
	 */
	const settle = async (req: Request, res: Response, _next: NextFunction) => {
		const id = toSingleString(req.params.id);
		if (!id) {
			res.status(400).json(buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400));
			return;
		}

		try {
			const draw = await prisma.juetengDraw.findFirst({ where: { id } });
			if (!draw) {
				res.status(404).json(buildErrorResponse(config.ERROR.JUETENGDRAW.NOT_FOUND, 404));
				return;
			}
			if (draw.status !== "DRAWN") {
				res.status(422).json(
					buildErrorResponse(
						"Draw must be in DRAWN status to settle. Record the result first.",
						422,
					),
				);
				return;
			}
			if (!draw.combinationKey) {
				res.status(422).json(
					buildErrorResponse("Draw is missing combinationKey. Record the result first.", 422),
				);
				return;
			}

			const gameConfig = await prisma.juetengConfig.findFirst({ where: { isActive: true } });
			if (!gameConfig) {
				res.status(503).json(buildErrorResponse("Game configuration unavailable", 503));
				return;
			}

			const drawnKey = draw.combinationKey;
			const settledAt = new Date();

			// Fetch all bets for this draw
			const allBets = await prisma.juetengBet.findMany({ where: { drawId: id } });

			const winningBets = allBets.filter((b) => b.combinationKey === drawnKey);
			const losingBets = allBets.filter((b) => b.combinationKey !== drawnKey);

			// Aggregate totals
			const totalStake = allBets.reduce((sum, b) => sum + b.amount, 0);
			const totalPayout = winningBets.reduce(
				(sum, b) => sum + b.amount * gameConfig.payoutMultiplier,
				0,
			);
			const grossProfit = totalStake - totalPayout;

			// Create payouts and mark winning bets
			for (const bet of winningBets) {
				const payoutAmount = bet.amount * gameConfig.payoutMultiplier;
				await prisma.juetengPayout.create({
					data: {
						betId: bet.id,
						drawId: id,
						bettorId: bet.bettorId,
						amount: payoutAmount,
						currency: bet.currency,
						status: "PENDING",
					},
				});
				await prisma.juetengBet.update({
					where: { id: bet.id },
					data: { isWinner: true, status: "WON", payoutAmount, settledAt },
				});
			}

			// Mark losing bets
			if (losingBets.length > 0) {
				await prisma.juetengBet.updateMany({
					where: { drawId: id, combinationKey: { not: drawnKey } },
					data: { status: "LOST", settledAt },
				});
			}

			// ── Cobrador commissions: cobradorRate % of their collected stake ──
			const stakeByCobradorId = allBets.reduce<Record<string, number>>((acc, bet) => {
				acc[bet.cobradorId] = (acc[bet.cobradorId] ?? 0) + bet.amount;
				return acc;
			}, {});
			for (const [cobradorId, baseAmount] of Object.entries(stakeByCobradorId)) {
				const rate = gameConfig.cobradorRate;
				await prisma.drawCommission.create({
					data: {
						agentId: cobradorId,
						drawId: id,
						type: "COLLECTION",
						rate,
						baseAmount,
						amount: baseAmount * rate,
					},
				});
			}

			// ── Cabo commissions: caboRate % of winner payouts under their bets ──
			const payoutByCaboId = winningBets.reduce<Record<string, number>>((acc, bet) => {
				if (bet.caboId) {
					const payout = bet.amount * gameConfig.payoutMultiplier;
					acc[bet.caboId] = (acc[bet.caboId] ?? 0) + payout;
				}
				return acc;
			}, {});
			for (const [caboId, baseAmount] of Object.entries(payoutByCaboId)) {
				const rate = gameConfig.caboRate;
				await prisma.drawCommission.create({
					data: {
						agentId: caboId,
						drawId: id,
						type: "WINNER_BONUS",
						rate,
						baseAmount,
						amount: baseAmount * rate,
					},
				});
			}

			// ── Capitalista commissions: capitalistaRate % of total stake ──
			const capitalistaAgents = await prisma.agent.findMany({
				where: { role: "CAPITALISTA", isActive: true },
			});
			for (const agent of capitalistaAgents) {
				const rate = gameConfig.capitalistaRate;
				await prisma.drawCommission.create({
					data: {
						agentId: agent.id,
						drawId: id,
						type: "CAPITALISTA",
						rate,
						baseAmount: totalStake,
						amount: totalStake * rate,
					},
				});
			}

			// Finalize draw record
			const settledDraw = await prisma.juetengDraw.update({
				where: { id },
				data: {
					status: "SETTLED",
					settledAt,
					totalBets: allBets.length,
					totalStake,
					totalPayout,
					grossProfit,
				},
			});

			await invalidateCache.byPattern(`cache:juetengDraw:byId:${id}:*`).catch(() => {});
			await invalidateCache.byPattern("cache:juetengDraw:list:*").catch(() => {});
			await invalidateCache.byPattern("cache:juetengBet:list:*").catch(() => {});

			juetengDrawLogger.info(
				`Draw ${id} settled — winners: ${winningBets.length}/${allBets.length}, payout: ₱${totalPayout}`,
			);

			res.status(200).json(
				buildSuccessResponse("Draw settled successfully.", {
					draw: settledDraw,
					winnerCount: winningBets.length,
					totalBets: allBets.length,
					totalStake,
					totalPayout,
					grossProfit,
				}, 200),
			);
		} catch (error) {
			juetengDrawLogger.error(`Error settling draw ${id}: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	return { create, getAll, getById, update, remove, open, close, recordResult, settle };
};
