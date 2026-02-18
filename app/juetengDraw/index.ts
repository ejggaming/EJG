import express, { Router } from "express";
import { controller } from "./juetengDraw.controller";
import { router } from "./juetengDraw.router";
import { PrismaClient } from "../../generated/prisma";

export const juetengDrawModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = juetengDrawModule;
