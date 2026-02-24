import express, { Router } from "express";
import { controller } from "./reports.controller";
import { router } from "./reports.router";
import { PrismaClient } from "../../generated/prisma";

export const reportsModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = reportsModule;
