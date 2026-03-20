"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = applicationRoutes;
const controller_js_1 = __importDefault(require("../features/applications/controller.js"));
async function applicationRoutes(fastify) {
    return (0, controller_js_1.default)(fastify);
}
