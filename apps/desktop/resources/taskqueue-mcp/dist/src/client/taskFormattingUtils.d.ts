import { ListProjectsSuccessData } from "../types/response.js";
import { Project } from "../types/data.js";
/**
 * Formats the project details and a progress table for its tasks using cli-table3.
 * @param project - The project object containing the details and tasks.
 * @returns A string representing the formatted project details and task progress table.
 */
export declare function formatTaskProgressTable(project: Project | undefined): string;
/**
 * Formats a list of project summaries into a markdown table using cli-table3.
 * @param projects - An array of project summary objects, matching the structure of ListProjectsSuccessData["projects"].
 * @returns A string representing the formatted projects list table.
 */
export declare function formatProjectsList(projects: ListProjectsSuccessData["projects"]): string;
