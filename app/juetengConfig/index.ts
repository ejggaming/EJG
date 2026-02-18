import express, { Router } from "express";
import { controller } from "./juetengConfig.controller";
import { router } from "./juetengConfig.router";
import { PrismaClient } from "../../generated/prisma";

export const juetengConfigModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = juetengConfigModule;
