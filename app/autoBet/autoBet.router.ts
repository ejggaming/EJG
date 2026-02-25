import { Router, Request, Response, NextFunction } from "express";

interface IAutoBetController {
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	getMyConfigs(req: Request, res: Response, next: NextFunction): Promise<void>;
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	pause(req: Request, res: Response, next: NextFunction): Promise<void>;
	resume(req: Request, res: Response, next: NextFunction): Promise<void>;
	cancel(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IAutoBetController): Router => {
	const routes = Router();
	const path = "/auto-bet";

	/**
	 * @openapi
	 * /api/auto-bet:
	 *   post:
	 *     summary: Create auto bet configuration
	 *     description: Configure an automatic bet that executes across all 3 daily draws for a user-defined number of days. Returns estimated total cost and days affordable based on current balance.
	 *     tags: [AutoBet]
	 *     security:
	 *       - bearerAuth: []
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - number1
	 *               - number2
	 *               - amountPerBet
	 *               - durationDays
	 *             properties:
	 *               number1:
	 *                 type: integer
	 *                 minimum: 1
	 *                 maximum: 37
	 *                 description: First number of the combination
	 *                 example: 5
	 *               number2:
	 *                 type: integer
	 *                 minimum: 1
	 *                 maximum: 37
	 *                 description: Second number of the combination
	 *                 example: 12
	 *               amountPerBet:
	 *                 type: number
	 *                 minimum: 0.01
	 *                 description: Stake amount per individual bet in PHP
	 *                 example: 10
	 *               durationDays:
	 *                 type: integer
	 *                 minimum: 1
	 *                 maximum: 30
	 *                 description: Number of days to run the auto bet (totalBets = durationDays × 3)
	 *                 example: 7
	 *               startDate:
	 *                 type: string
	 *                 format: date-time
	 *                 description: ISO start date (defaults to today if omitted)
	 *                 example: "2026-02-25T00:00:00.000Z"
	 *     responses:
	 *       201:
	 *         description: Auto bet configuration created successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       $ref: '#/components/schemas/AutoBetConfig'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/", controller.create);

	/**
	 * @openapi
	 * /api/auto-bet/me:
	 *   get:
	 *     summary: Get my auto bet configurations
	 *     description: Retrieve the authenticated player's auto bet configurations with pagination and optional status filter
	 *     tags: [AutoBet]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: query
	 *         name: page
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           default: 1
	 *         description: Page number
	 *       - in: query
	 *         name: limit
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           maximum: 100
	 *           default: 10
	 *         description: Records per page
	 *       - in: query
	 *         name: status
	 *         schema:
	 *           type: string
	 *           enum: [ACTIVE, PAUSED, COMPLETED, CANCELLED]
	 *         description: Filter by configuration status
	 *     responses:
	 *       200:
	 *         description: Auto bet configurations retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *                       properties:
	 *                         configs:
	 *                           type: array
	 *                           items:
	 *                             $ref: '#/components/schemas/AutoBetConfig'
	 *                         count:
	 *                           type: integer
	 *                         pagination:
	 *                           $ref: '#/components/schemas/Pagination'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get("/me", controller.getMyConfigs);

	/**
	 * @openapi
	 * /api/auto-bet/{id}:
	 *   get:
	 *     summary: Get auto bet configuration by ID
	 *     description: Retrieve a specific auto bet configuration with its full execution history. Players can only access their own configs; admins can access all.
	 *     tags: [AutoBet]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: AutoBetConfig ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *     responses:
	 *       200:
	 *         description: Auto bet configuration retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       $ref: '#/components/schemas/AutoBetConfig'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       403:
	 *         $ref: '#/components/responses/Forbidden'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get("/:id", controller.getById);

	/**
	 * @openapi
	 * /api/auto-bet/{id}/pause:
	 *   patch:
	 *     summary: Pause auto bet configuration
	 *     description: Pause an ACTIVE auto bet configuration. No bets will be placed while paused.
	 *     tags: [AutoBet]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: AutoBetConfig ID
	 *         example: "507f1f77bcf86cd799439011"
	 *     responses:
	 *       200:
	 *         description: Auto bet configuration paused successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       $ref: '#/components/schemas/AutoBetConfig'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       403:
	 *         $ref: '#/components/responses/Forbidden'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       422:
	 *         description: Configuration is not in ACTIVE status
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.patch("/:id/pause", controller.pause);

	/**
	 * @openapi
	 * /api/auto-bet/{id}/resume:
	 *   patch:
	 *     summary: Resume auto bet configuration
	 *     description: Resume a PAUSED auto bet configuration. Will resume placing bets from the next open draw if the period has not expired.
	 *     tags: [AutoBet]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: AutoBetConfig ID
	 *         example: "507f1f77bcf86cd799439011"
	 *     responses:
	 *       200:
	 *         description: Auto bet configuration resumed successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       $ref: '#/components/schemas/AutoBetConfig'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       403:
	 *         $ref: '#/components/responses/Forbidden'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       422:
	 *         description: Configuration is not PAUSED or the period has expired
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.patch("/:id/resume", controller.resume);

	/**
	 * @openapi
	 * /api/auto-bet/{id}/cancel:
	 *   patch:
	 *     summary: Cancel auto bet configuration
	 *     description: Permanently cancel an ACTIVE or PAUSED auto bet configuration. This action cannot be undone.
	 *     tags: [AutoBet]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: AutoBetConfig ID
	 *         example: "507f1f77bcf86cd799439011"
	 *     responses:
	 *       200:
	 *         description: Auto bet configuration cancelled successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       $ref: '#/components/schemas/AutoBetConfig'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       403:
	 *         $ref: '#/components/responses/Forbidden'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       422:
	 *         description: Configuration is already completed or cancelled
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.patch("/:id/cancel", controller.cancel);

	/**
	 * @openapi
	 * /api/auto-bet:
	 *   get:
	 *     summary: Get all auto bet configurations (admin)
	 *     description: Retrieve all auto bet configurations across all users. Admin/Super Admin access only.
	 *     tags: [AutoBet]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: query
	 *         name: page
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           default: 1
	 *         description: Page number
	 *       - in: query
	 *         name: limit
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           maximum: 100
	 *           default: 20
	 *         description: Records per page
	 *       - in: query
	 *         name: status
	 *         schema:
	 *           type: string
	 *           enum: [ACTIVE, PAUSED, COMPLETED, CANCELLED]
	 *         description: Filter by status
	 *       - in: query
	 *         name: userId
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Filter by user ID
	 *     responses:
	 *       200:
	 *         description: Auto bet configurations retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *                       properties:
	 *                         configs:
	 *                           type: array
	 *                           items:
	 *                             $ref: '#/components/schemas/AutoBetConfig'
	 *                         count:
	 *                           type: integer
	 *                         pagination:
	 *                           $ref: '#/components/schemas/Pagination'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get("/", controller.getAll);

	route.use(path, routes);

	return route;
};
