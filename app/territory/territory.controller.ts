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
import { CreateTerritorySchema, UpdateTerritorySchema } from "../../zod/territory.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const territoryLogger = logger.child({ module: "territory" });

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
			territoryLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			territoryLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateTerritorySchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			territoryLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const territory = await prisma.territory.create({ data: validation.data });
			territoryLogger.info(`Territory created successfully: ${territory.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.TERRITORY.ACTIONS.CREATE_TERRITORY,
				description: `${config.ACTIVITY_LOG.TERRITORY.DESCRIPTIONS.TERRITORY_CREATED}: ${territory.name || territory.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.TERRITORY.PAGES.TERRITORY_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.TERRITORY,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.TERRITORY,
				entityId: territory.id,
				changesBefore: null,
				changesAfter: {
					id: territory.id,
					name: territory.name,
					isActive: territory.isActive,
					createdAt: territory.createdAt,
					updatedAt: territory.updatedAt,
				},
				description: `${config.AUDIT_LOG.TERRITORY.DESCRIPTIONS.TERRITORY_CREATED}: ${territory.name || territory.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:territory:list:*");
				territoryLogger.info("Territory list cache invalidated after creation");
			} catch (cacheError) {
				territoryLogger.warn(
					"Failed to invalidate cache after territory creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.TERRITORY.CREATED,
				territory,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			territoryLogger.error(`${config.ERROR.TERRITORY.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, territoryLogger);

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

		territoryLogger.info(
			`Getting territorys, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.TerritoryWhereInput = {};

			const searchFields = ["name", "barangay", "municipality", "province", "region"];
			if (query) {
				const searchConditions = buildSearchConditions("Territory", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Territory", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [territorys, total] = await Promise.all([
				document ? prisma.territory.findMany(findManyQuery) : [],
				count ? prisma.territory.count({ where: whereClause }) : 0,
			]);

			territoryLogger.info(`Retrieved ${territorys.length} territorys`);
			const processedData =
				groupBy && document ? groupDataByField(territorys, groupBy as string) : territorys;

			const responseData: Record<string, any> = {
				...(document && { territorys: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.TERRITORY.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			territoryLogger.error(`${config.ERROR.TERRITORY.GET_ALL_FAILED}: ${error}`);
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
				territoryLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			territoryLogger.info(`${config.SUCCESS.TERRITORY.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:territory:byId:${id}:${fields || "full"}`;
			let territory = null;

			try {
				if (redisClient.isClientConnected()) {
					territory = await redisClient.getJSON(cacheKey);
					if (territory) {
						territoryLogger.info(`Territory ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				territoryLogger.warn(
					`Redis cache retrieval failed for territory ${id}:`,
					cacheError,
				);
			}

			if (!territory) {
				const query: Prisma.TerritoryFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				territory = await prisma.territory.findFirst(query);

				if (territory && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, territory, 3600);
						territoryLogger.info(`Territory ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						territoryLogger.warn(
							`Failed to store territory ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!territory) {
				territoryLogger.error(`${config.ERROR.TERRITORY.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.TERRITORY.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			territoryLogger.info(`${config.SUCCESS.TERRITORY.RETRIEVED}: ${(territory as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.TERRITORY.RETRIEVED,
				territory,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			territoryLogger.error(`${config.ERROR.TERRITORY.ERROR_GETTING}: ${error}`);
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
				territoryLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateTerritorySchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				territoryLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				territoryLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			territoryLogger.info(`Updating territory: ${id}`);

			const existingTerritory = await prisma.territory.findFirst({
				where: { id },
			});

			if (!existingTerritory) {
				territoryLogger.error(`${config.ERROR.TERRITORY.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.TERRITORY.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedTerritory = await prisma.territory.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:territory:byId:${id}:*`);
				await invalidateCache.byPattern("cache:territory:list:*");
				territoryLogger.info(`Cache invalidated after territory ${id} update`);
			} catch (cacheError) {
				territoryLogger.warn(
					"Failed to invalidate cache after territory update:",
					cacheError,
				);
			}

			territoryLogger.info(`${config.SUCCESS.TERRITORY.UPDATED}: ${updatedTerritory.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.TERRITORY.UPDATED,
				{ territory: updatedTerritory },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			territoryLogger.error(`${config.ERROR.TERRITORY.ERROR_UPDATING}: ${error}`);
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
				territoryLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			territoryLogger.info(`${config.SUCCESS.TERRITORY.DELETED}: ${id}`);

			const existingTerritory = await prisma.territory.findFirst({
				where: { id },
			});

			if (!existingTerritory) {
				territoryLogger.error(`${config.ERROR.TERRITORY.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.TERRITORY.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.territory.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:territory:byId:${id}:*`);
				await invalidateCache.byPattern("cache:territory:list:*");
				territoryLogger.info(`Cache invalidated after territory ${id} deletion`);
			} catch (cacheError) {
				territoryLogger.warn(
					"Failed to invalidate cache after territory deletion:",
					cacheError,
				);
			}

			territoryLogger.info(`${config.SUCCESS.TERRITORY.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.TERRITORY.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			territoryLogger.error(`${config.ERROR.TERRITORY.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
