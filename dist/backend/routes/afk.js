"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = afkRoutes;
const controller_js_1 = __importDefault(require("../features/afk/controller.js"));
async function afkRoutes(server) {
    return (0, controller_js_1.default)(server);
}
