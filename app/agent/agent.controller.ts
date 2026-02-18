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
import { CreateAgentSchema, UpdateAgentSchema } from "../../zod/agent.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const agentLogger = logger.child({ module: "agent" });

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
			agentLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			agentLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateAgentSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			agentLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const agent = await prisma.agent.create({ data: validation.data });
			agentLogger.info(`Agent created successfully: ${agent.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.AGENT.ACTIONS.CREATE_AGENT,
				description: `${config.ACTIVITY_LOG.AGENT.DESCRIPTIONS.AGENT_CREATED}: ${agent.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.AGENT.PAGES.AGENT_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.AGENT,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.AGENT,
				entityId: agent.id,
				changesBefore: null,
				changesAfter: {
					id: agent.id,
					role: agent.role,
					status: agent.status,
					createdAt: agent.createdAt,
					updatedAt: agent.updatedAt,
				},
				description: `${config.AUDIT_LOG.AGENT.DESCRIPTIONS.AGENT_CREATED}: ${agent.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:agent:list:*");
				agentLogger.info("Agent list cache invalidated after creation");
			} catch (cacheError) {
				agentLogger.warn("Failed to invalidate cache after agent creation:", cacheError);
			}

			const successResponse = buildSuccessResponse(config.SUCCESS.AGENT.CREATED, agent, 201);
			res.status(201).json(successResponse);
		} catch (error) {
			agentLogger.error(`${config.ERROR.AGENT.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, agentLogger);

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

		agentLogger.info(
			`Getting agents, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.AgentWhereInput = {};

			const searchFields = ["role", "status"];
			if (query) {
				const searchConditions = buildSearchConditions("Agent", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Agent", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [agents, total] = await Promise.all([
				document ? prisma.agent.findMany(findManyQuery) : [],
				count ? prisma.agent.count({ where: whereClause }) : 0,
			]);

			agentLogger.info(`Retrieved ${agents.length} agents`);
			const processedData =
				groupBy && document ? groupDataByField(agents, groupBy as string) : agents;

			const responseData: Record<string, any> = {
				...(document && { agents: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.AGENT.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			agentLogger.error(`${config.ERROR.AGENT.GET_ALL_FAILED}: ${error}`);
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
				agentLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			agentLogger.info(`${config.SUCCESS.AGENT.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:agent:byId:${id}:${fields || "full"}`;
			let agent = null;

			try {
				if (redisClient.isClientConnected()) {
					agent = await redisClient.getJSON(cacheKey);
					if (agent) {
						agentLogger.info(`Agent ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				agentLogger.warn(`Redis cache retrieval failed for agent ${id}:`, cacheError);
			}

			if (!agent) {
				const query: Prisma.AgentFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				agent = await prisma.agent.findFirst(query);

				if (agent && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, agent, 3600);
						agentLogger.info(`Agent ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						agentLogger.warn(`Failed to store agent ${id} in Redis cache:`, cacheError);
					}
				}
			}

			if (!agent) {
				agentLogger.error(`${config.ERROR.AGENT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.AGENT.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			agentLogger.info(`${config.SUCCESS.AGENT.RETRIEVED}: ${(agent as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.AGENT.RETRIEVED,
				agent,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			agentLogger.error(`${config.ERROR.AGENT.ERROR_GETTING}: ${error}`);
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
				agentLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateAgentSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				agentLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				agentLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			agentLogger.info(`Updating agent: ${id}`);

			const existingAgent = await prisma.agent.findFirst({
				where: { id },
			});

			if (!existingAgent) {
				agentLogger.error(`${config.ERROR.AGENT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.AGENT.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedAgent = await prisma.agent.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:agent:byId:${id}:*`);
				await invalidateCache.byPattern("cache:agent:list:*");
				agentLogger.info(`Cache invalidated after agent ${id} update`);
			} catch (cacheError) {
				agentLogger.warn("Failed to invalidate cache after agent update:", cacheError);
			}

			agentLogger.info(`${config.SUCCESS.AGENT.UPDATED}: ${updatedAgent.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.AGENT.UPDATED,
				{ agent: updatedAgent },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			agentLogger.error(`${config.ERROR.AGENT.ERROR_UPDATING}: ${error}`);
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
				agentLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			agentLogger.info(`${config.SUCCESS.AGENT.DELETED}: ${id}`);

			const existingAgent = await prisma.agent.findFirst({
				where: { id },
			});

			if (!existingAgent) {
				agentLogger.error(`${config.ERROR.AGENT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.AGENT.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.agent.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:agent:byId:${id}:*`);
				await invalidateCache.byPattern("cache:agent:list:*");
				agentLogger.info(`Cache invalidated after agent ${id} deletion`);
			} catch (cacheError) {
				agentLogger.warn("Failed to invalidate cache after agent deletion:", cacheError);
			}

			agentLogger.info(`${config.SUCCESS.AGENT.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.AGENT.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			agentLogger.error(`${config.ERROR.AGENT.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
