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
import { CreateCommissionSchema, UpdateCommissionSchema } from "../../zod/commission.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const commissionLogger = logger.child({ module: "commission" });

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
			commissionLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			commissionLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateCommissionSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			commissionLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const commission = await prisma.drawCommission.create({ data: validation.data });
			commissionLogger.info(`Commission created successfully: ${commission.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.COMMISSION.ACTIONS.CREATE_COMMISSION,
				description: `${config.ACTIVITY_LOG.COMMISSION.DESCRIPTIONS.COMMISSION_CREATED}: ${commission.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.COMMISSION.PAGES.COMMISSION_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.COMMISSION,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.COMMISSION,
				entityId: commission.id,
				changesBefore: null,
				changesAfter: {
					id: commission.id,
					type: commission.type,
					status: commission.status,
					createdAt: commission.createdAt,
					updatedAt: commission.updatedAt,
				},
				description: `${config.AUDIT_LOG.COMMISSION.DESCRIPTIONS.COMMISSION_CREATED}: ${commission.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:commission:list:*");
				commissionLogger.info("Commission list cache invalidated after creation");
			} catch (cacheError) {
				commissionLogger.warn(
					"Failed to invalidate cache after commission creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.COMMISSION.CREATED,
				commission,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			commissionLogger.error(`${config.ERROR.COMMISSION.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, commissionLogger);

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

		commissionLogger.info(
			`Getting commissions, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.DrawCommissionWhereInput = {};

			const searchFields = ["type", "status"];
			if (query) {
				const searchConditions = buildSearchConditions("Commission", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Commission", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [commissions, total] = await Promise.all([
				document ? prisma.drawCommission.findMany(findManyQuery) : [],
				count ? prisma.drawCommission.count({ where: whereClause }) : 0,
			]);

			commissionLogger.info(`Retrieved ${commissions.length} commissions`);
			const processedData =
				groupBy && document
					? groupDataByField(commissions, groupBy as string)
					: commissions;

			const responseData: Record<string, any> = {
				...(document && { commissions: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.COMMISSION.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			commissionLogger.error(`${config.ERROR.COMMISSION.GET_ALL_FAILED}: ${error}`);
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
				commissionLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			commissionLogger.info(`${config.SUCCESS.COMMISSION.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:commission:byId:${id}:${fields || "full"}`;
			let commission = null;

			try {
				if (redisClient.isClientConnected()) {
					commission = await redisClient.getJSON(cacheKey);
					if (commission) {
						commissionLogger.info(`Commission ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				commissionLogger.warn(
					`Redis cache retrieval failed for commission ${id}:`,
					cacheError,
				);
			}

			if (!commission) {
				const query: Prisma.DrawCommissionFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				commission = await prisma.drawCommission.findFirst(query);

				if (commission && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, commission, 3600);
						commissionLogger.info(`Commission ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						commissionLogger.warn(
							`Failed to store commission ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!commission) {
				commissionLogger.error(`${config.ERROR.COMMISSION.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.COMMISSION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			commissionLogger.info(
				`${config.SUCCESS.COMMISSION.RETRIEVED}: ${(commission as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.COMMISSION.RETRIEVED,
				commission,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			commissionLogger.error(`${config.ERROR.COMMISSION.ERROR_GETTING}: ${error}`);
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
				commissionLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateCommissionSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				commissionLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				commissionLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			commissionLogger.info(`Updating commission: ${id}`);

			const existingCommission = await prisma.drawCommission.findFirst({
				where: { id },
			});

			if (!existingCommission) {
				commissionLogger.error(`${config.ERROR.COMMISSION.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.COMMISSION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedCommission = await prisma.drawCommission.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:commission:byId:${id}:*`);
				await invalidateCache.byPattern("cache:commission:list:*");
				commissionLogger.info(`Cache invalidated after commission ${id} update`);
			} catch (cacheError) {
				commissionLogger.warn(
					"Failed to invalidate cache after commission update:",
					cacheError,
				);
			}

			commissionLogger.info(`${config.SUCCESS.COMMISSION.UPDATED}: ${updatedCommission.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.COMMISSION.UPDATED,
				{ commission: updatedCommission },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			commissionLogger.error(`${config.ERROR.COMMISSION.ERROR_UPDATING}: ${error}`);
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
				commissionLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			commissionLogger.info(`${config.SUCCESS.COMMISSION.DELETED}: ${id}`);

			const existingCommission = await prisma.drawCommission.findFirst({
				where: { id },
			});

			if (!existingCommission) {
				commissionLogger.error(`${config.ERROR.COMMISSION.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.COMMISSION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.drawCommission.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:commission:byId:${id}:*`);
				await invalidateCache.byPattern("cache:commission:list:*");
				commissionLogger.info(`Cache invalidated after commission ${id} deletion`);
			} catch (cacheError) {
				commissionLogger.warn(
					"Failed to invalidate cache after commission deletion:",
					cacheError,
				);
			}

			commissionLogger.info(`${config.SUCCESS.COMMISSION.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.COMMISSION.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			commissionLogger.error(`${config.ERROR.COMMISSION.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const getMyCommissions = async (req: Request, res: Response, _next: NextFunction) => {
		const userId = (req as any).user?.id;
		if (!userId) {
			res.status(401).json(buildErrorResponse("Unauthorized", 401));
			return;
		}
		try {
			const agent = await prisma.agent.findFirst({ where: { userId } });
			if (!agent) {
				res.status(200).json(buildSuccessResponse("Commissions retrieved", { commissions: [] }, 200));
				return;
			}
			const commissions = await prisma.drawCommission.findMany({
				where: { agentId: agent.id },
				orderBy: { createdAt: "desc" },
				take: 100,
			});
			// Manually fetch draw info for each commission
			const drawIds = [...new Set(commissions.map((c) => c.drawId).filter(Boolean))];
			const draws = drawIds.length > 0
				? await prisma.juetengDraw.findMany({
					where: { id: { in: drawIds as string[] } },
					select: { id: true, drawType: true, drawDate: true, scheduledAt: true },
				})
				: [];
			const drawMap = Object.fromEntries(draws.map((d) => [d.id, d]));
			const enriched = commissions.map((c) => ({ ...c, draw: c.drawId ? drawMap[c.drawId] : null }));
			res.status(200).json(buildSuccessResponse("Commissions retrieved", { commissions: enriched }, 200));
		} catch (error) {
			commissionLogger.error(`getMyCommissions error: ${error}`);
			res.status(500).json(buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500));
		}
	};

	const getSummary = async (req: Request, res: Response, _next: NextFunction) => {
		const userId = (req as any).user?.id;
		if (!userId) {
			res.status(401).json(buildErrorResponse("Unauthorized", 401));
			return;
		}
		try {
			const agent = await prisma.agent.findFirst({ where: { userId } });
			if (!agent) {
				res.status(200).json(buildSuccessResponse("Summary retrieved", { totalEarned: 0, pending: 0, paid: 0, thisMonth: 0, count: 0 }, 200));
				return;
			}
			const all = await prisma.drawCommission.findMany({ where: { agentId: agent.id } });
			const totalEarned = all.reduce((s, c) => s + c.amount, 0);
			const pending = all.filter((c) => c.status === "PENDING").reduce((s, c) => s + c.amount, 0);
			const paid = all.filter((c) => c.status === "PAID").reduce((s, c) => s + c.amount, 0);
			const startOfMonth = new Date();
			startOfMonth.setDate(1);
			startOfMonth.setHours(0, 0, 0, 0);
			const thisMonth = all.filter((c) => new Date(c.createdAt) >= startOfMonth).reduce((s, c) => s + c.amount, 0);
			res.status(200).json(buildSuccessResponse("Summary retrieved", { totalEarned, pending, paid, thisMonth, count: all.length }, 200));
		} catch (error) {
			commissionLogger.error(`getSummary error: ${error}`);
			res.status(500).json(buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500));
		}
	};

	return { create, getAll, getById, update, remove, getMyCommissions, getSummary };
};
