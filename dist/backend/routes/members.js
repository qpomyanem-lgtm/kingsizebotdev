"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = memberRoutes;
const controller_js_1 = __importDefault(require("../features/members/controller.js"));
async function memberRoutes(fastify) {
    return (0, controller_js_1.default)(fastify);
}
