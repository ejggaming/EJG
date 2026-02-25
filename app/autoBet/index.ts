import express, { Router } from "express";
import { controller } from "./autoBet.controller";
import { router } from "./autoBet.router";
import { PrismaClient } from "../../generated/prisma";

export const autoBetModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility with CommonJS require
module.exports = autoBetModule;
