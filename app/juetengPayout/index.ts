import express, { Router } from "express";
import { controller } from "./juetengPayout.controller";
import { router } from "./juetengPayout.router";
import { PrismaClient } from "../../generated/prisma";

export const juetengPayoutModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = juetengPayoutModule;
