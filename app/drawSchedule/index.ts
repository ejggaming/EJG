import express, { Router } from "express";
import { controller } from "./drawSchedule.controller";
import { router } from "./drawSchedule.router";
import { PrismaClient } from "../../generated/prisma";

export const drawScheduleModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = drawScheduleModule;
