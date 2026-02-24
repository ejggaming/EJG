import { Router, Request, Response } from "express";

interface IController {
	getSummary(req: Request, res: Response): Promise<void>;
	exportPCSO(req: Request, res: Response): Promise<void>;
	verifyAudit(req: Request, res: Response): Promise<void>;
	getAuditLogs(req: Request, res: Response): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/reports";

	routes.get("/summary", controller.getSummary);
	routes.get("/export/pcso", controller.exportPCSO);
	routes.get("/audit/verify", controller.verifyAudit);
	routes.get("/audit-logs", controller.getAuditLogs);

	route.use(path, routes);

	return route;
};
