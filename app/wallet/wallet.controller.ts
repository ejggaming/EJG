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
import { CreateWalletSchema, UpdateWalletSchema } from "../../zod/wallet.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const walletLogger = logger.child({ module: "wallet" });

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
			walletLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			walletLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateWalletSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			walletLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const wallet = await prisma.wallet.create({ data: validation.data });
			walletLogger.info(`Wallet created successfully: ${wallet.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.WALLET.ACTIONS.CREATE_WALLET,
				description: `${config.ACTIVITY_LOG.WALLET.DESCRIPTIONS.WALLET_CREATED}: ${wallet.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.WALLET.PAGES.WALLET_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.WALLET,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.WALLET,
				entityId: wallet.id,
				changesBefore: null,
				changesAfter: {
					id: wallet.id,
					status: wallet.status,
					currency: wallet.currency,
					createdAt: wallet.createdAt,
					updatedAt: wallet.updatedAt,
				},
				description: `${config.AUDIT_LOG.WALLET.DESCRIPTIONS.WALLET_CREATED}: ${wallet.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:wallet:list:*");
				walletLogger.info("Wallet list cache invalidated after creation");
			} catch (cacheError) {
				walletLogger.warn("Failed to invalidate cache after wallet creation:", cacheError);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.WALLET.CREATED,
				wallet,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			walletLogger.error(`${config.ERROR.WALLET.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, walletLogger);

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

		walletLogger.info(
			`Getting wallets, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.WalletWhereInput = {};

			const searchFields = ["status", "currency"];
			if (query) {
				const searchConditions = buildSearchConditions("Wallet", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Wallet", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [wallets, total] = await Promise.all([
				document ? prisma.wallet.findMany(findManyQuery) : [],
				count ? prisma.wallet.count({ where: whereClause }) : 0,
			]);

			walletLogger.info(`Retrieved ${wallets.length} wallets`);
			const processedData =
				groupBy && document ? groupDataByField(wallets, groupBy as string) : wallets;

			const responseData: Record<string, any> = {
				...(document && { wallets: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.WALLET.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			walletLogger.error(`${config.ERROR.WALLET.GET_ALL_FAILED}: ${error}`);
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
				walletLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			walletLogger.info(`${config.SUCCESS.WALLET.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:wallet:byId:${id}:${fields || "full"}`;
			let wallet = null;

			try {
				if (redisClient.isClientConnected()) {
					wallet = await redisClient.getJSON(cacheKey);
					if (wallet) {
						walletLogger.info(`Wallet ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				walletLogger.warn(`Redis cache retrieval failed for wallet ${id}:`, cacheError);
			}

			if (!wallet) {
				const query: Prisma.WalletFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				wallet = await prisma.wallet.findFirst(query);

				if (wallet && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, wallet, 3600);
						walletLogger.info(`Wallet ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						walletLogger.warn(
							`Failed to store wallet ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!wallet) {
				walletLogger.error(`${config.ERROR.WALLET.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.WALLET.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			walletLogger.info(`${config.SUCCESS.WALLET.RETRIEVED}: ${(wallet as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.WALLET.RETRIEVED,
				wallet,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			walletLogger.error(`${config.ERROR.WALLET.ERROR_GETTING}: ${error}`);
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
				walletLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateWalletSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				walletLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				walletLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			walletLogger.info(`Updating wallet: ${id}`);

			const existingWallet = await prisma.wallet.findFirst({
				where: { id },
			});

			if (!existingWallet) {
				walletLogger.error(`${config.ERROR.WALLET.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.WALLET.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedWallet = await prisma.wallet.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:wallet:byId:${id}:*`);
				await invalidateCache.byPattern("cache:wallet:list:*");
				walletLogger.info(`Cache invalidated after wallet ${id} update`);
			} catch (cacheError) {
				walletLogger.warn("Failed to invalidate cache after wallet update:", cacheError);
			}

			walletLogger.info(`${config.SUCCESS.WALLET.UPDATED}: ${updatedWallet.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.WALLET.UPDATED,
				{ wallet: updatedWallet },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			walletLogger.error(`${config.ERROR.WALLET.ERROR_UPDATING}: ${error}`);
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
				walletLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			walletLogger.info(`${config.SUCCESS.WALLET.DELETED}: ${id}`);

			const existingWallet = await prisma.wallet.findFirst({
				where: { id },
			});

			if (!existingWallet) {
				walletLogger.error(`${config.ERROR.WALLET.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.WALLET.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.wallet.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:wallet:byId:${id}:*`);
				await invalidateCache.byPattern("cache:wallet:list:*");
				walletLogger.info(`Cache invalidated after wallet ${id} deletion`);
			} catch (cacheError) {
				walletLogger.warn("Failed to invalidate cache after wallet deletion:", cacheError);
			}

			walletLogger.info(`${config.SUCCESS.WALLET.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.WALLET.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			walletLogger.error(`${config.ERROR.WALLET.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
