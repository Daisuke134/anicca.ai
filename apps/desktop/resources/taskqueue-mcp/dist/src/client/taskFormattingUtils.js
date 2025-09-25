import Table from 'cli-table3'; // Import the library
import chalk from 'chalk'; // Import chalk for consistent styling
/**
 * Formats the project details and a progress table for its tasks using cli-table3.
 * @param project - The project object containing the details and tasks.
 * @returns A string representing the formatted project details and task progress table.
 */
export function formatTaskProgressTable(project) {
    if (!project)
        return "Project not found";
    // Build the project details header
    let header = chalk.cyan(`\n📋 Project ${chalk.bold(project.projectId)} details:\n`);
    header += `  - ${chalk.bold('Initial Prompt:')} ${project.initialPrompt}\n`;
    if (project.projectPlan && project.projectPlan !== project.initialPrompt) {
        header += `  - ${chalk.bold('Project Plan:')} ${project.projectPlan}\n`;
    }
    header += `  - ${chalk.bold('Status:')} ${project.completed ? chalk.green('Completed ✓') : chalk.yellow('In Progress')}\n`;
    const table = new Table({
        head: ['ID', 'Title', 'Description', 'Status', 'Approved', 'Tools', 'Rules'],
        colWidths: [10, 25, 40, 15, 10, 7, 7], // Adjust widths as needed
        wordWrap: true, // Enable word wrapping for long descriptions
        style: { head: ['cyan'] } // Optional styling
    });
    if (project.tasks.length === 0) {
        table.push([{ colSpan: 7, content: 'No tasks in this project.', hAlign: 'center' }]);
    }
    else {
        for (const task of project.tasks) {
            const statusText = task.status === "done" ? "Done" : (task.status === "in progress" ? "In Prog" : "Pending");
            const approvedText = task.approved ? "Yes" : "No";
            const toolsText = task.toolRecommendations ? "[+]" : "[-]"; // Simpler indicators
            const rulesText = task.ruleRecommendations ? "[+]" : "[-]";
            // No need to manually truncate description if wordWrap is true and colWidths are set
            table.push([
                task.id,
                task.title,
                task.description,
                statusText,
                approvedText,
                toolsText,
                rulesText
            ]);
        }
    }
    return header + '\n' + table.toString(); // Combine header and table
}
/**
 * Formats a list of project summaries into a markdown table using cli-table3.
 * @param projects - An array of project summary objects, matching the structure of ListProjectsSuccessData["projects"].
 * @returns A string representing the formatted projects list table.
 */
export function formatProjectsList(projects) {
    const table = new Table({
        head: ['Project ID', 'Initial Prompt', 'Total', 'Done', 'Approved'],
        colWidths: [15, 40, 8, 8, 10], // Adjust widths as needed
        wordWrap: true,
        style: { head: ['cyan'] } // Optional styling
    });
    if (projects.length === 0) {
        table.push([{ colSpan: 5, content: 'No projects found.', hAlign: 'center' }]);
    }
    else {
        for (const proj of projects) {
            // Truncate long initial prompts manually if desired, even with wordWrap
            const shortPrompt = proj.initialPrompt.length > 60 ? proj.initialPrompt.substring(0, 57) + "..." : proj.initialPrompt;
            table.push([
                proj.projectId,
                shortPrompt, // Use truncated prompt
                proj.totalTasks,
                proj.completedTasks,
                proj.approvedTasks
            ]);
        }
    }
    return '\nProjects List:\n' + table.toString();
}
//# sourceMappingURL=taskFormattingUtils.js.map