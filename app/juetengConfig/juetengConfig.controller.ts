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
import { CreateJuetengConfigSchema, UpdateJuetengConfigSchema } from "../../zod/juetengConfig.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const juetengConfigLogger = logger.child({ module: "juetengConfig" });

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
			juetengConfigLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			juetengConfigLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateJuetengConfigSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			juetengConfigLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const juetengConfig = await prisma.juetengConfig.create({ data: validation.data });
			juetengConfigLogger.info(`JuetengConfig created successfully: ${juetengConfig.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.JUETENGCONFIG.ACTIONS.CREATE_JUETENGCONFIG,
				description: `${config.ACTIVITY_LOG.JUETENGCONFIG.DESCRIPTIONS.JUETENGCONFIG_CREATED}: ${juetengConfig.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.JUETENGCONFIG.PAGES.JUETENGCONFIG_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.JUETENGCONFIG,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.JUETENGCONFIG,
				entityId: juetengConfig.id,
				changesBefore: null,
				changesAfter: {
					id: juetengConfig.id,
					isActive: juetengConfig.isActive,
					currency: juetengConfig.currency,
					createdAt: juetengConfig.createdAt,
					updatedAt: juetengConfig.updatedAt,
				},
				description: `${config.AUDIT_LOG.JUETENGCONFIG.DESCRIPTIONS.JUETENGCONFIG_CREATED}: ${juetengConfig.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:juetengConfig:list:*");
				juetengConfigLogger.info("JuetengConfig list cache invalidated after creation");
			} catch (cacheError) {
				juetengConfigLogger.warn(
					"Failed to invalidate cache after juetengConfig creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.JUETENGCONFIG.CREATED,
				juetengConfig,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			juetengConfigLogger.error(`${config.ERROR.JUETENGCONFIG.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, juetengConfigLogger);

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

		juetengConfigLogger.info(
			`Getting juetengConfigs, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.JuetengConfigWhereInput = {};

			const searchFields = ["currency"];
			if (query) {
				const searchConditions = buildSearchConditions(
					"JuetengConfig",
					query,
					searchFields,
				);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("JuetengConfig", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [juetengConfigs, total] = await Promise.all([
				document ? prisma.juetengConfig.findMany(findManyQuery) : [],
				count ? prisma.juetengConfig.count({ where: whereClause }) : 0,
			]);

			juetengConfigLogger.info(`Retrieved ${juetengConfigs.length} juetengConfigs`);
			const processedData =
				groupBy && document
					? groupDataByField(juetengConfigs, groupBy as string)
					: juetengConfigs;

			const responseData: Record<string, any> = {
				...(document && { juetengConfigs: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.JUETENGCONFIG.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			juetengConfigLogger.error(`${config.ERROR.JUETENGCONFIG.GET_ALL_FAILED}: ${error}`);
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
				juetengConfigLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			juetengConfigLogger.info(`${config.SUCCESS.JUETENGCONFIG.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:juetengConfig:byId:${id}:${fields || "full"}`;
			let juetengConfig = null;

			try {
				if (redisClient.isClientConnected()) {
					juetengConfig = await redisClient.getJSON(cacheKey);
					if (juetengConfig) {
						juetengConfigLogger.info(
							`JuetengConfig ${id} retrieved from direct Redis cache`,
						);
					}
				}
			} catch (cacheError) {
				juetengConfigLogger.warn(
					`Redis cache retrieval failed for juetengConfig ${id}:`,
					cacheError,
				);
			}

			if (!juetengConfig) {
				const query: Prisma.JuetengConfigFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				juetengConfig = await prisma.juetengConfig.findFirst(query);

				if (juetengConfig && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, juetengConfig, 3600);
						juetengConfigLogger.info(
							`JuetengConfig ${id} stored in direct Redis cache`,
						);
					} catch (cacheError) {
						juetengConfigLogger.warn(
							`Failed to store juetengConfig ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!juetengConfig) {
				juetengConfigLogger.error(`${config.ERROR.JUETENGCONFIG.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.JUETENGCONFIG.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			juetengConfigLogger.info(
				`${config.SUCCESS.JUETENGCONFIG.RETRIEVED}: ${(juetengConfig as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.JUETENGCONFIG.RETRIEVED,
				juetengConfig,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			juetengConfigLogger.error(`${config.ERROR.JUETENGCONFIG.ERROR_GETTING}: ${error}`);
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
				juetengConfigLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateJuetengConfigSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				juetengConfigLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				juetengConfigLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			juetengConfigLogger.info(`Updating juetengConfig: ${id}`);

			const existingJuetengConfig = await prisma.juetengConfig.findFirst({
				where: { id },
			});

			if (!existingJuetengConfig) {
				juetengConfigLogger.error(`${config.ERROR.JUETENGCONFIG.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.JUETENGCONFIG.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedJuetengConfig = await prisma.juetengConfig.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:juetengConfig:byId:${id}:*`);
				await invalidateCache.byPattern("cache:juetengConfig:list:*");
				juetengConfigLogger.info(`Cache invalidated after juetengConfig ${id} update`);
			} catch (cacheError) {
				juetengConfigLogger.warn(
					"Failed to invalidate cache after juetengConfig update:",
					cacheError,
				);
			}

			juetengConfigLogger.info(
				`${config.SUCCESS.JUETENGCONFIG.UPDATED}: ${updatedJuetengConfig.id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.JUETENGCONFIG.UPDATED,
				{ juetengConfig: updatedJuetengConfig },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			juetengConfigLogger.error(`${config.ERROR.JUETENGCONFIG.ERROR_UPDATING}: ${error}`);
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
				juetengConfigLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			juetengConfigLogger.info(`${config.SUCCESS.JUETENGCONFIG.DELETED}: ${id}`);

			const existingJuetengConfig = await prisma.juetengConfig.findFirst({
				where: { id },
			});

			if (!existingJuetengConfig) {
				juetengConfigLogger.error(`${config.ERROR.JUETENGCONFIG.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.JUETENGCONFIG.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.juetengConfig.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:juetengConfig:byId:${id}:*`);
				await invalidateCache.byPattern("cache:juetengConfig:list:*");
				juetengConfigLogger.info(`Cache invalidated after juetengConfig ${id} deletion`);
			} catch (cacheError) {
				juetengConfigLogger.warn(
					"Failed to invalidate cache after juetengConfig deletion:",
					cacheError,
				);
			}

			juetengConfigLogger.info(`${config.SUCCESS.JUETENGCONFIG.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.JUETENGCONFIG.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			juetengConfigLogger.error(`${config.ERROR.JUETENGCONFIG.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
