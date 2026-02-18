import express, { Router } from "express";
import { controller } from "./territory.controller";
import { router } from "./territory.router";
import { PrismaClient } from "../../generated/prisma";

export const territoryModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = territoryModule;
