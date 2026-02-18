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
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const juetengBet = await prisma.juetengBet.create({ data: validation.data });
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
					createdAt: juetengBet.createdAt,
					updatedAt: juetengBet.updatedAt,
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

			const successResponse = buildSuccessResponse(
				config.SUCCESS.JUETENGBET.CREATED,
				juetengBet,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			juetengBetLogger.error(`${config.ERROR.JUETENGBET.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
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
			// Base where clause
			const whereClause: Prisma.JuetengBetWhereInput = {};

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
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
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
				const query: Prisma.JuetengBetFindFirstArgs = {
					where: { id },
				};

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
				const errorResponse = buildErrorResponse(config.ERROR.JUETENGBET.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			juetengBetLogger.info(
				`${config.SUCCESS.JUETENGBET.RETRIEVED}: ${(juetengBet as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.JUETENGBET.RETRIEVED,
				juetengBet,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			juetengBetLogger.error(`${config.ERROR.JUETENGBET.ERROR_GETTING}: ${error}`);
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
				juetengBetLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateJuetengBetSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				juetengBetLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				juetengBetLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			juetengBetLogger.info(`Updating juetengBet: ${id}`);

			const existingJuetengBet = await prisma.juetengBet.findFirst({
				where: { id },
			});

			if (!existingJuetengBet) {
				juetengBetLogger.error(`${config.ERROR.JUETENGBET.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.JUETENGBET.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedJuetengBet = await prisma.juetengBet.update({
				where: { id },
				data: prismaData,
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
			const successResponse = buildSuccessResponse(
				config.SUCCESS.JUETENGBET.UPDATED,
				{ juetengBet: updatedJuetengBet },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			juetengBetLogger.error(`${config.ERROR.JUETENGBET.ERROR_UPDATING}: ${error}`);
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
				juetengBetLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			juetengBetLogger.info(`${config.SUCCESS.JUETENGBET.DELETED}: ${id}`);

			const existingJuetengBet = await prisma.juetengBet.findFirst({
				where: { id },
			});

			if (!existingJuetengBet) {
				juetengBetLogger.error(`${config.ERROR.JUETENGBET.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.JUETENGBET.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.juetengBet.delete({
				where: { id },
			});

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
			const successResponse = buildSuccessResponse(
				config.SUCCESS.JUETENGBET.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			juetengBetLogger.error(`${config.ERROR.JUETENGBET.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
