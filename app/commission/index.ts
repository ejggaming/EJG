import express, { Router } from "express";
import { controller } from "./commission.controller";
import { router } from "./commission.router";
import { PrismaClient } from "../../generated/prisma";

export const commissionModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = commissionModule;
