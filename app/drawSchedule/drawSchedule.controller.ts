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
import { CreateDrawScheduleSchema, UpdateDrawScheduleSchema } from "../../zod/drawSchedule.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const drawScheduleLogger = logger.child({ module: "drawSchedule" });

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
			drawScheduleLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			drawScheduleLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateDrawScheduleSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			drawScheduleLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const drawSchedule = await prisma.drawSchedule.create({ data: validation.data });
			drawScheduleLogger.info(`DrawSchedule created successfully: ${drawSchedule.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.DRAWSCHEDULE.ACTIONS.CREATE_DRAWSCHEDULE,
				description: `${config.ACTIVITY_LOG.DRAWSCHEDULE.DESCRIPTIONS.DRAWSCHEDULE_CREATED}: ${drawSchedule.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.DRAWSCHEDULE.PAGES.DRAWSCHEDULE_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.DRAWSCHEDULE,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.DRAWSCHEDULE,
				entityId: drawSchedule.id,
				changesBefore: null,
				changesAfter: {
					id: drawSchedule.id,
					drawType: drawSchedule.drawType,
					scheduledTime: drawSchedule.scheduledTime,
					createdAt: drawSchedule.createdAt,
					updatedAt: drawSchedule.updatedAt,
				},
				description: `${config.AUDIT_LOG.DRAWSCHEDULE.DESCRIPTIONS.DRAWSCHEDULE_CREATED}: ${drawSchedule.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:drawSchedule:list:*");
				drawScheduleLogger.info("DrawSchedule list cache invalidated after creation");
			} catch (cacheError) {
				drawScheduleLogger.warn(
					"Failed to invalidate cache after drawSchedule creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.DRAWSCHEDULE.CREATED,
				drawSchedule,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			drawScheduleLogger.error(`${config.ERROR.DRAWSCHEDULE.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, drawScheduleLogger);

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

		drawScheduleLogger.info(
			`Getting drawSchedules, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.DrawScheduleWhereInput = {};

			const searchFields = ["drawType", "scheduledTime", "timeZone"];
			if (query) {
				const searchConditions = buildSearchConditions("DrawSchedule", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("DrawSchedule", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [drawSchedules, total] = await Promise.all([
				document ? prisma.drawSchedule.findMany(findManyQuery) : [],
				count ? prisma.drawSchedule.count({ where: whereClause }) : 0,
			]);

			drawScheduleLogger.info(`Retrieved ${drawSchedules.length} drawSchedules`);
			const processedData =
				groupBy && document
					? groupDataByField(drawSchedules, groupBy as string)
					: drawSchedules;

			const responseData: Record<string, any> = {
				...(document && { drawSchedules: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.DRAWSCHEDULE.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			drawScheduleLogger.error(`${config.ERROR.DRAWSCHEDULE.GET_ALL_FAILED}: ${error}`);
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
				drawScheduleLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			drawScheduleLogger.info(`${config.SUCCESS.DRAWSCHEDULE.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:drawSchedule:byId:${id}:${fields || "full"}`;
			let drawSchedule = null;

			try {
				if (redisClient.isClientConnected()) {
					drawSchedule = await redisClient.getJSON(cacheKey);
					if (drawSchedule) {
						drawScheduleLogger.info(
							`DrawSchedule ${id} retrieved from direct Redis cache`,
						);
					}
				}
			} catch (cacheError) {
				drawScheduleLogger.warn(
					`Redis cache retrieval failed for drawSchedule ${id}:`,
					cacheError,
				);
			}

			if (!drawSchedule) {
				const query: Prisma.DrawScheduleFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				drawSchedule = await prisma.drawSchedule.findFirst(query);

				if (drawSchedule && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, drawSchedule, 3600);
						drawScheduleLogger.info(`DrawSchedule ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						drawScheduleLogger.warn(
							`Failed to store drawSchedule ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!drawSchedule) {
				drawScheduleLogger.error(`${config.ERROR.DRAWSCHEDULE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.DRAWSCHEDULE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			drawScheduleLogger.info(
				`${config.SUCCESS.DRAWSCHEDULE.RETRIEVED}: ${(drawSchedule as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.DRAWSCHEDULE.RETRIEVED,
				drawSchedule,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			drawScheduleLogger.error(`${config.ERROR.DRAWSCHEDULE.ERROR_GETTING}: ${error}`);
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
				drawScheduleLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateDrawScheduleSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				drawScheduleLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				drawScheduleLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			drawScheduleLogger.info(`Updating drawSchedule: ${id}`);

			const existingDrawSchedule = await prisma.drawSchedule.findFirst({
				where: { id },
			});

			if (!existingDrawSchedule) {
				drawScheduleLogger.error(`${config.ERROR.DRAWSCHEDULE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.DRAWSCHEDULE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedDrawSchedule = await prisma.drawSchedule.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:drawSchedule:byId:${id}:*`);
				await invalidateCache.byPattern("cache:drawSchedule:list:*");
				drawScheduleLogger.info(`Cache invalidated after drawSchedule ${id} update`);
			} catch (cacheError) {
				drawScheduleLogger.warn(
					"Failed to invalidate cache after drawSchedule update:",
					cacheError,
				);
			}

			drawScheduleLogger.info(
				`${config.SUCCESS.DRAWSCHEDULE.UPDATED}: ${updatedDrawSchedule.id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.DRAWSCHEDULE.UPDATED,
				{ drawSchedule: updatedDrawSchedule },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			drawScheduleLogger.error(`${config.ERROR.DRAWSCHEDULE.ERROR_UPDATING}: ${error}`);
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
				drawScheduleLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			drawScheduleLogger.info(`${config.SUCCESS.DRAWSCHEDULE.DELETED}: ${id}`);

			const existingDrawSchedule = await prisma.drawSchedule.findFirst({
				where: { id },
			});

			if (!existingDrawSchedule) {
				drawScheduleLogger.error(`${config.ERROR.DRAWSCHEDULE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.DRAWSCHEDULE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.drawSchedule.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:drawSchedule:byId:${id}:*`);
				await invalidateCache.byPattern("cache:drawSchedule:list:*");
				drawScheduleLogger.info(`Cache invalidated after drawSchedule ${id} deletion`);
			} catch (cacheError) {
				drawScheduleLogger.warn(
					"Failed to invalidate cache after drawSchedule deletion:",
					cacheError,
				);
			}

			drawScheduleLogger.info(`${config.SUCCESS.DRAWSCHEDULE.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.DRAWSCHEDULE.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			drawScheduleLogger.error(`${config.ERROR.DRAWSCHEDULE.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
