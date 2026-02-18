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
import { CreateKycSchema, UpdateKycSchema } from "../../zod/kyc.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const kycLogger = logger.child({ module: "kyc" });

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
			kycLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			kycLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateKycSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			kycLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const kyc = await prisma.kYC.create({ data: validation.data });
			kycLogger.info(`Kyc created successfully: ${kyc.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.KYC.ACTIONS.CREATE_KYC,
				description: `${config.ACTIVITY_LOG.KYC.DESCRIPTIONS.KYC_CREATED}: ${kyc.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.KYC.PAGES.KYC_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.KYC,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.KYC,
				entityId: kyc.id,
				changesBefore: null,
				changesAfter: {
					id: kyc.id,
					status: kyc.status,
					documentType: kyc.documentType,
					submittedAt: kyc.submittedAt,
				},
				description: `${config.AUDIT_LOG.KYC.DESCRIPTIONS.KYC_CREATED}: ${kyc.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:kyc:list:*");
				kycLogger.info("Kyc list cache invalidated after creation");
			} catch (cacheError) {
				kycLogger.warn("Failed to invalidate cache after kyc creation:", cacheError);
			}

			const successResponse = buildSuccessResponse(config.SUCCESS.KYC.CREATED, kyc, 201);
			res.status(201).json(successResponse);
		} catch (error) {
			kycLogger.error(`${config.ERROR.KYC.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, kycLogger);

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

		kycLogger.info(
			`Getting kycs, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.KYCWhereInput = {};

			const searchFields = ["status", "documentType"];
			if (query) {
				const searchConditions = buildSearchConditions("Kyc", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Kyc", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [kycs, total] = await Promise.all([
				document ? prisma.kYC.findMany(findManyQuery) : [],
				count ? prisma.kYC.count({ where: whereClause }) : 0,
			]);

			kycLogger.info(`Retrieved ${kycs.length} kycs`);
			const processedData =
				groupBy && document ? groupDataByField(kycs, groupBy as string) : kycs;

			const responseData: Record<string, any> = {
				...(document && { kycs: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.KYC.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			kycLogger.error(`${config.ERROR.KYC.GET_ALL_FAILED}: ${error}`);
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
				kycLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			kycLogger.info(`${config.SUCCESS.KYC.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:kyc:byId:${id}:${fields || "full"}`;
			let kyc = null;

			try {
				if (redisClient.isClientConnected()) {
					kyc = await redisClient.getJSON(cacheKey);
					if (kyc) {
						kycLogger.info(`Kyc ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				kycLogger.warn(`Redis cache retrieval failed for kyc ${id}:`, cacheError);
			}

			if (!kyc) {
				const query: Prisma.KYCFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				kyc = await prisma.kYC.findFirst(query);

				if (kyc && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, kyc, 3600);
						kycLogger.info(`Kyc ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						kycLogger.warn(`Failed to store kyc ${id} in Redis cache:`, cacheError);
					}
				}
			}

			if (!kyc) {
				kycLogger.error(`${config.ERROR.KYC.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.KYC.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			kycLogger.info(`${config.SUCCESS.KYC.RETRIEVED}: ${(kyc as any).id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.KYC.RETRIEVED, kyc, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			kycLogger.error(`${config.ERROR.KYC.ERROR_GETTING}: ${error}`);
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
				kycLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateKycSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				kycLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				kycLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			kycLogger.info(`Updating kyc: ${id}`);

			const existingKyc = await prisma.kYC.findFirst({
				where: { id },
			});

			if (!existingKyc) {
				kycLogger.error(`${config.ERROR.KYC.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.KYC.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedKyc = await prisma.kYC.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:kyc:byId:${id}:*`);
				await invalidateCache.byPattern("cache:kyc:list:*");
				kycLogger.info(`Cache invalidated after kyc ${id} update`);
			} catch (cacheError) {
				kycLogger.warn("Failed to invalidate cache after kyc update:", cacheError);
			}

			kycLogger.info(`${config.SUCCESS.KYC.UPDATED}: ${updatedKyc.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.KYC.UPDATED,
				{ kyc: updatedKyc },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			kycLogger.error(`${config.ERROR.KYC.ERROR_UPDATING}: ${error}`);
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
				kycLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			kycLogger.info(`${config.SUCCESS.KYC.DELETED}: ${id}`);

			const existingKyc = await prisma.kYC.findFirst({
				where: { id },
			});

			if (!existingKyc) {
				kycLogger.error(`${config.ERROR.KYC.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.KYC.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.kYC.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:kyc:byId:${id}:*`);
				await invalidateCache.byPattern("cache:kyc:list:*");
				kycLogger.info(`Cache invalidated after kyc ${id} deletion`);
			} catch (cacheError) {
				kycLogger.warn("Failed to invalidate cache after kyc deletion:", cacheError);
			}

			kycLogger.info(`${config.SUCCESS.KYC.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.KYC.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			kycLogger.error(`${config.ERROR.KYC.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
