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
import { CreateSessionSchema, UpdateSessionSchema } from "../../zod/session.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const sessionLogger = logger.child({ module: "session" });

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
			sessionLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			sessionLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateSessionSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			sessionLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const session = await prisma.session.create({ data: validation.data });
			sessionLogger.info(`Session created successfully: ${session.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.SESSION.ACTIONS.CREATE_SESSION,
				description: `${config.ACTIVITY_LOG.SESSION.DESCRIPTIONS.SESSION_CREATED}: ${session.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.SESSION.PAGES.SESSION_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.SESSION,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.SESSION,
				entityId: session.id,
				changesBefore: null,
				changesAfter: {
					id: session.id,
					userId: session.userId,
					expiresAt: session.expiresAt,
					createdAt: session.createdAt,
				},
				description: `${config.AUDIT_LOG.SESSION.DESCRIPTIONS.SESSION_CREATED}: ${session.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:session:list:*");
				sessionLogger.info("Session list cache invalidated after creation");
			} catch (cacheError) {
				sessionLogger.warn(
					"Failed to invalidate cache after session creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.SESSION.CREATED,
				session,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			sessionLogger.error(`${config.ERROR.SESSION.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, sessionLogger);

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

		sessionLogger.info(
			`Getting sessions, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.SessionWhereInput = {};

			const searchFields = ["token", "ipAddress", "userAgent"];
			if (query) {
				const searchConditions = buildSearchConditions("Session", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Session", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [sessions, total] = await Promise.all([
				document ? prisma.session.findMany(findManyQuery) : [],
				count ? prisma.session.count({ where: whereClause }) : 0,
			]);

			sessionLogger.info(`Retrieved ${sessions.length} sessions`);
			const processedData =
				groupBy && document ? groupDataByField(sessions, groupBy as string) : sessions;

			const responseData: Record<string, any> = {
				...(document && { sessions: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.SESSION.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			sessionLogger.error(`${config.ERROR.SESSION.GET_ALL_FAILED}: ${error}`);
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
				sessionLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			sessionLogger.info(`${config.SUCCESS.SESSION.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:session:byId:${id}:${fields || "full"}`;
			let session = null;

			try {
				if (redisClient.isClientConnected()) {
					session = await redisClient.getJSON(cacheKey);
					if (session) {
						sessionLogger.info(`Session ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				sessionLogger.warn(`Redis cache retrieval failed for session ${id}:`, cacheError);
			}

			if (!session) {
				const query: Prisma.SessionFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				session = await prisma.session.findFirst(query);

				if (session && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, session, 3600);
						sessionLogger.info(`Session ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						sessionLogger.warn(
							`Failed to store session ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!session) {
				sessionLogger.error(`${config.ERROR.SESSION.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.SESSION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			sessionLogger.info(`${config.SUCCESS.SESSION.RETRIEVED}: ${(session as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.SESSION.RETRIEVED,
				session,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			sessionLogger.error(`${config.ERROR.SESSION.ERROR_GETTING}: ${error}`);
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
				sessionLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateSessionSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				sessionLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				sessionLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			sessionLogger.info(`Updating session: ${id}`);

			const existingSession = await prisma.session.findFirst({
				where: { id },
			});

			if (!existingSession) {
				sessionLogger.error(`${config.ERROR.SESSION.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.SESSION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedSession = await prisma.session.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:session:byId:${id}:*`);
				await invalidateCache.byPattern("cache:session:list:*");
				sessionLogger.info(`Cache invalidated after session ${id} update`);
			} catch (cacheError) {
				sessionLogger.warn("Failed to invalidate cache after session update:", cacheError);
			}

			sessionLogger.info(`${config.SUCCESS.SESSION.UPDATED}: ${updatedSession.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.SESSION.UPDATED,
				{ session: updatedSession },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			sessionLogger.error(`${config.ERROR.SESSION.ERROR_UPDATING}: ${error}`);
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
				sessionLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			sessionLogger.info(`${config.SUCCESS.SESSION.DELETED}: ${id}`);

			const existingSession = await prisma.session.findFirst({
				where: { id },
			});

			if (!existingSession) {
				sessionLogger.error(`${config.ERROR.SESSION.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.SESSION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.session.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:session:byId:${id}:*`);
				await invalidateCache.byPattern("cache:session:list:*");
				sessionLogger.info(`Cache invalidated after session ${id} deletion`);
			} catch (cacheError) {
				sessionLogger.warn(
					"Failed to invalidate cache after session deletion:",
					cacheError,
				);
			}

			sessionLogger.info(`${config.SUCCESS.SESSION.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.SESSION.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			sessionLogger.error(`${config.ERROR.SESSION.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
