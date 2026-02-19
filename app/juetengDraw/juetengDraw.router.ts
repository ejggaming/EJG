import { Router, Request, Response, NextFunction } from "express";
import { cache, cacheShort, cacheMedium, cacheUser } from "../../middleware/cache";

interface IController {
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
	// Draw lifecycle actions
	open(req: Request, res: Response, next: NextFunction): Promise<void>;
	close(req: Request, res: Response, next: NextFunction): Promise<void>;
	recordResult(req: Request, res: Response, next: NextFunction): Promise<void>;
	settle(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/juetengDraw";

	/**
	 * @openapi
	 * /api/juetengDraw/{id}:
	 *   get:
	 *     summary: Get juetengDraw by ID
	 *     description: Retrieve a specific juetengDraw by its unique identifier with optional field selection
	 *     tags: [JuetengDraw]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: JuetengDraw ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *       - in: query
	 *         name: fields
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include (supports nested fields with dot notation)
	 *         example: "id,name,description,type"
	 *     responses:
	 *       200:
	 *         description: JuetengDraw retrieved successfully
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
	 *                         juetengDraw:
	 *                           $ref: '#/components/schemas/JuetengDraw'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	// Cache individual juetengDraw with predictable key for invalidation
	routes.get(
		"/:id",
		cache({
			ttl: 90,
			keyGenerator: (req: Request) => {
				const fields = (req.query as any).fields || "full";
				return `cache:juetengDraw:byId:${req.params.id}:${fields}`;
			},
		}),
		controller.getById,
	);

	/**
	 * @openapi
	 * /api/juetengDraw:
	 *   get:
	 *     summary: Get all juetengDraws
	 *     description: Retrieve juetengDraws with advanced filtering, pagination, sorting, field selection, and optional grouping
	 *     tags: [JuetengDraw]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: query
	 *         name: page
	 *         required: false
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           default: 1
	 *         description: Page number for pagination
	 *         example: 1
	 *       - in: query
	 *         name: limit
	 *         required: false
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           maximum: 100
	 *           default: 10
	 *         description: Number of records per page
	 *         example: 10
	 *       - in: query
	 *         name: order
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: [asc, desc]
	 *           default: desc
	 *         description: Sort order for results
	 *         example: desc
	 *       - in: query
	 *         name: sort
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Field to sort by or JSON object for multi-field sorting
	 *         example: "createdAt"
	 *       - in: query
	 *         name: fields
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include (supports dot notation)
	 *         example: "id,name,description,type"
	 *       - in: query
	 *         name: query
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Search query to filter by name or description
	 *         example: "welcome email"
	 *       - in: query
	 *         name: filter
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: JSON array of filter objects for advanced filtering
	 *         example: '[{"type":"email"},{"isDeleted":false}]'
	 *       - in: query
	 *         name: groupBy
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Group results by a field name
	 *         example: "type"
	 *       - in: query
	 *         name: document
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: ["true"]
	 *         description: Include juetengDraw documents in response
	 *       - in: query
	 *         name: pagination
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: ["true"]
	 *         description: Include pagination metadata in response
	 *       - in: query
	 *         name: count
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: ["true"]
	 *         description: Include total count in response
	 *     responses:
	 *       200:
	 *         description: Templates retrieved successfully
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
	 *                         juetengDraws:
	 *                           type: array
	 *                           items:
	 *                             $ref: '#/components/schemas/JuetengDraw'
	 *                           description: Present when document="true" and no groupBy
	 *                         groups:
	 *                           type: object
	 *                           additionalProperties:
	 *                             type: array
	 *                             items:
	 *                               $ref: '#/components/schemas/JuetengDraw'
	 *                           description: Present when groupBy is used and document="true"
	 *                         count:
	 *                           type: integer
	 *                           description: Present when count="true"
	 *                         pagination:
	 *                           $ref: '#/components/schemas/Pagination'
	 *                           description: Present when pagination="true"
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	// Cache juetengDraw list with predictable key for invalidation
	routes.get(
		"/",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:juetengDraw:list:${queryKey}`;
			},
		}),
		controller.getAll,
	);

	/**
	 * @openapi
	 * /api/juetengDraw:
	 *   post:
	 *     summary: Create new juetengDraw
	 *     description: Create a new juetengDraw with the provided data
	 *     tags: [JuetengDraw]
	 *     security:
	 *       - bearerAuth: []
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - name
	 *             properties:
	 *               name:
	 *                 type: string
	 *                 minLength: 1
	 *                 description: JuetengDraw name
	 *                 example: "Email Welcome JuetengDraw"
	 *               description:
	 *                 type: string
	 *                 description: JuetengDraw description
	 *                 example: "Welcome email juetengDraw for new users"
	 *               type:
	 *                 type: string
	 *                 enum: ["email", "sms", "push", "form"]
	 *                 description: JuetengDraw type for categorization
	 *                 example: "email"
	 *               isDeleted:
	 *                 type: boolean
	 *                 description: Soft delete flag
	 *                 default: false
	 *         application/x-www-form-urlencoded:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - name
	 *             properties:
	 *               name:
	 *                 type: string
	 *                 minLength: 1
	 *               description:
	 *                 type: string
	 *               type:
	 *                 type: string
	 *               isDeleted:
	 *                 type: boolean
	 *         multipart/form-data:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - name
	 *             properties:
	 *               name:
	 *                 type: string
	 *                 minLength: 1
	 *               description:
	 *                 type: string
	 *               type:
	 *                 type: string
	 *               isDeleted:
	 *                 type: boolean
	 *     responses:
	 *       201:
	 *         description: JuetengDraw created successfully
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
	 *                         juetengDraw:
	 *                           $ref: '#/components/schemas/JuetengDraw'
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
	 * /api/juetengDraw/{id}:
	 *   patch:
	 *     summary: Update juetengDraw
	 *     description: Update juetengDraw data by ID (partial update)
	 *     tags: [JuetengDraw]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: JuetengDraw ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             minProperties: 1
	 *             properties:
	 *               name:
	 *                 type: string
	 *                 minLength: 1
	 *                 description: JuetengDraw name
	 *                 example: "Updated Email JuetengDraw"
	 *               description:
	 *                 type: string
	 *                 description: JuetengDraw description
	 *                 example: "Updated description for the juetengDraw"
	 *               type:
	 *                 type: string
	 *                 enum: ["email", "sms", "push", "form"]
	 *                 description: JuetengDraw type for categorization
	 *                 example: "email"
	 *               isDeleted:
	 *                 type: boolean
	 *                 description: Soft delete flag
	 *                 example: false
	 *     responses:
	 *       200:
	 *         description: JuetengDraw updated successfully
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
	 *                         juetengDraw:
	 *                           $ref: '#/components/schemas/JuetengDraw'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.patch("/:id", controller.update);

	/**
	 * @openapi
	 * /api/juetengDraw/{id}:
	 *   delete:
	 *     summary: Delete juetengDraw
	 *     description: Permanently delete a juetengDraw by ID
	 *     tags: [JuetengDraw]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: JuetengDraw ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *     responses:
	 *       200:
	 *         description: JuetengDraw deleted successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *                       description: Empty object for successful deletion
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.delete("/:id", controller.remove);

	/**
	 * @openapi
	 * /api/juetengDraw/{id}/open:
	 *   post:
	 *     summary: Open a draw for betting
	 *     description: Transitions draw from SCHEDULED → OPEN, allowing bets to be placed.
	 *     tags: [JuetengDraw]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: Draw opened successfully
	 *       422:
	 *         description: Draw is not in SCHEDULED status
	 */
	routes.post("/:id/open", controller.open);

	/**
	 * @openapi
	 * /api/juetengDraw/{id}/close:
	 *   post:
	 *     summary: Close a draw (cutoff)
	 *     description: Transitions draw from OPEN → CLOSED, stopping bet acceptance.
	 *     tags: [JuetengDraw]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: Draw closed successfully
	 *       422:
	 *         description: Draw is not in OPEN status
	 */
	routes.post("/:id/close", controller.close);

	/**
	 * @openapi
	 * /api/juetengDraw/{id}/result:
	 *   post:
	 *     summary: Record tambiolo draw result
	 *     description: |
	 *       Transitions draw from CLOSED → DRAWN.
	 *       Bolador records the two drawn balls. combinationKey is auto-computed
	 *       as sorted "min-max" (e.g. balls 12 and 5 → "5-12").
	 *     tags: [JuetengDraw]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required: [number1, number2]
	 *             properties:
	 *               number1:
	 *                 type: integer
	 *                 minimum: 1
	 *                 example: 12
	 *               number2:
	 *                 type: integer
	 *                 minimum: 1
	 *                 example: 5
	 *               boladorId:
	 *                 type: string
	 *                 description: Agent ID of the bolador who ran the tambiolo
	 *     responses:
	 *       200:
	 *         description: Draw result recorded successfully
	 *       422:
	 *         description: Draw is not in CLOSED status
	 */
	routes.post("/:id/result", controller.recordResult);

	/**
	 * @openapi
	 * /api/juetengDraw/{id}/settle:
	 *   post:
	 *     summary: Settle a draw
	 *     description: |
	 *       Transitions draw from DRAWN → SETTLED.
	 *       Identifies winners (bets matching combinationKey), creates JuetengPayout records,
	 *       and calculates DrawCommissions for cobradors (15%), cabos (5%), and capitalistas (25%).
	 *     tags: [JuetengDraw]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: Draw settled — returns winner count, totals, and gross profit
	 *       422:
	 *         description: Draw is not in DRAWN status
	 */
	routes.post("/:id/settle", controller.settle);

	route.use(path, routes);

	return route;
};
