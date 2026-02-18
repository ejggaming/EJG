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
import { CreateJuetengPayoutSchema, UpdateJuetengPayoutSchema } from "../../zod/juetengPayout.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const juetengPayoutLogger = logger.child({ module: "juetengPayout" });

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
			juetengPayoutLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			juetengPayoutLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateJuetengPayoutSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			juetengPayoutLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const juetengPayout = await prisma.juetengPayout.create({ data: validation.data });
			juetengPayoutLogger.info(`JuetengPayout created successfully: ${juetengPayout.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.JUETENGPAYOUT.ACTIONS.CREATE_JUETENGPAYOUT,
				description: `${config.ACTIVITY_LOG.JUETENGPAYOUT.DESCRIPTIONS.JUETENGPAYOUT_CREATED}: ${juetengPayout.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.JUETENGPAYOUT.PAGES.JUETENGPAYOUT_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.JUETENGPAYOUT,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.JUETENGPAYOUT,
				entityId: juetengPayout.id,
				changesBefore: null,
				changesAfter: {
					id: juetengPayout.id,
					status: juetengPayout.status,
					amount: juetengPayout.amount,
					createdAt: juetengPayout.createdAt,
					updatedAt: juetengPayout.updatedAt,
				},
				description: `${config.AUDIT_LOG.JUETENGPAYOUT.DESCRIPTIONS.JUETENGPAYOUT_CREATED}: ${juetengPayout.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:juetengPayout:list:*");
				juetengPayoutLogger.info("JuetengPayout list cache invalidated after creation");
			} catch (cacheError) {
				juetengPayoutLogger.warn(
					"Failed to invalidate cache after juetengPayout creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.JUETENGPAYOUT.CREATED,
				juetengPayout,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			juetengPayoutLogger.error(`${config.ERROR.JUETENGPAYOUT.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, juetengPayoutLogger);

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

		juetengPayoutLogger.info(
			`Getting juetengPayouts, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.JuetengPayoutWhereInput = {};

			const searchFields = ["status", "currency"];
			if (query) {
				const searchConditions = buildSearchConditions(
					"JuetengPayout",
					query,
					searchFields,
				);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("JuetengPayout", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [juetengPayouts, total] = await Promise.all([
				document ? prisma.juetengPayout.findMany(findManyQuery) : [],
				count ? prisma.juetengPayout.count({ where: whereClause }) : 0,
			]);

			juetengPayoutLogger.info(`Retrieved ${juetengPayouts.length} juetengPayouts`);
			const processedData =
				groupBy && document
					? groupDataByField(juetengPayouts, groupBy as string)
					: juetengPayouts;

			const responseData: Record<string, any> = {
				...(document && { juetengPayouts: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.JUETENGPAYOUT.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			juetengPayoutLogger.error(`${config.ERROR.JUETENGPAYOUT.GET_ALL_FAILED}: ${error}`);
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
				juetengPayoutLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			juetengPayoutLogger.info(`${config.SUCCESS.JUETENGPAYOUT.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:juetengPayout:byId:${id}:${fields || "full"}`;
			let juetengPayout = null;

			try {
				if (redisClient.isClientConnected()) {
					juetengPayout = await redisClient.getJSON(cacheKey);
					if (juetengPayout) {
						juetengPayoutLogger.info(
							`JuetengPayout ${id} retrieved from direct Redis cache`,
						);
					}
				}
			} catch (cacheError) {
				juetengPayoutLogger.warn(
					`Redis cache retrieval failed for juetengPayout ${id}:`,
					cacheError,
				);
			}

			if (!juetengPayout) {
				const query: Prisma.JuetengPayoutFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				juetengPayout = await prisma.juetengPayout.findFirst(query);

				if (juetengPayout && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, juetengPayout, 3600);
						juetengPayoutLogger.info(
							`JuetengPayout ${id} stored in direct Redis cache`,
						);
					} catch (cacheError) {
						juetengPayoutLogger.warn(
							`Failed to store juetengPayout ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!juetengPayout) {
				juetengPayoutLogger.error(`${config.ERROR.JUETENGPAYOUT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.JUETENGPAYOUT.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			juetengPayoutLogger.info(
				`${config.SUCCESS.JUETENGPAYOUT.RETRIEVED}: ${(juetengPayout as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.JUETENGPAYOUT.RETRIEVED,
				juetengPayout,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			juetengPayoutLogger.error(`${config.ERROR.JUETENGPAYOUT.ERROR_GETTING}: ${error}`);
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
				juetengPayoutLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateJuetengPayoutSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				juetengPayoutLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				juetengPayoutLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			juetengPayoutLogger.info(`Updating juetengPayout: ${id}`);

			const existingJuetengPayout = await prisma.juetengPayout.findFirst({
				where: { id },
			});

			if (!existingJuetengPayout) {
				juetengPayoutLogger.error(`${config.ERROR.JUETENGPAYOUT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.JUETENGPAYOUT.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedJuetengPayout = await prisma.juetengPayout.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:juetengPayout:byId:${id}:*`);
				await invalidateCache.byPattern("cache:juetengPayout:list:*");
				juetengPayoutLogger.info(`Cache invalidated after juetengPayout ${id} update`);
			} catch (cacheError) {
				juetengPayoutLogger.warn(
					"Failed to invalidate cache after juetengPayout update:",
					cacheError,
				);
			}

			juetengPayoutLogger.info(
				`${config.SUCCESS.JUETENGPAYOUT.UPDATED}: ${updatedJuetengPayout.id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.JUETENGPAYOUT.UPDATED,
				{ juetengPayout: updatedJuetengPayout },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			juetengPayoutLogger.error(`${config.ERROR.JUETENGPAYOUT.ERROR_UPDATING}: ${error}`);
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
				juetengPayoutLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			juetengPayoutLogger.info(`${config.SUCCESS.JUETENGPAYOUT.DELETED}: ${id}`);

			const existingJuetengPayout = await prisma.juetengPayout.findFirst({
				where: { id },
			});

			if (!existingJuetengPayout) {
				juetengPayoutLogger.error(`${config.ERROR.JUETENGPAYOUT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.JUETENGPAYOUT.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.juetengPayout.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:juetengPayout:byId:${id}:*`);
				await invalidateCache.byPattern("cache:juetengPayout:list:*");
				juetengPayoutLogger.info(`Cache invalidated after juetengPayout ${id} deletion`);
			} catch (cacheError) {
				juetengPayoutLogger.warn(
					"Failed to invalidate cache after juetengPayout deletion:",
					cacheError,
				);
			}

			juetengPayoutLogger.info(`${config.SUCCESS.JUETENGPAYOUT.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.JUETENGPAYOUT.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			juetengPayoutLogger.error(`${config.ERROR.JUETENGPAYOUT.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
