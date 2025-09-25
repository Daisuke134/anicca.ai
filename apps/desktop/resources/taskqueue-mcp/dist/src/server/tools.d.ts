import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { TaskManager } from "./TaskManager.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
export declare const ALL_TOOLS: Tool[];
/**
 * Finds and executes a tool, handling error classification.
 * - Throws errors tagged with `jsonRpcCode` for protocol issues (e.g., Not Found, Invalid Params).
 * - Catches other errors (tool execution failures) and returns the standard MCP error result format.
 */
export declare function executeToolAndHandleErrors(toolName: string, args: Record<string, unknown>, taskManager: TaskManager): Promise<CallToolResult>;
