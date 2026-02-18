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
import { CreateJuetengDrawSchema, UpdateJuetengDrawSchema } from "../../zod/juetengDraw.zod";
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

	return { create, getAll, getById, update, remove };
};
