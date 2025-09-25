import { Command } from "commander";
import chalk from "chalk";
import { TaskManager } from "../server/TaskManager.js";
import { formatCliError } from "./errors.js";
import { formatProjectsList, formatTaskProgressTable } from "./taskFormattingUtils.js";
const program = new Command();
program
    .name("taskqueue")
    .description("CLI for the Task Manager MCP Server")
    .version("1.4.1")
    .option('-f, --file-path <path>', 'Specify the path to the tasks JSON file. Overrides TASK_MANAGER_FILE_PATH env var.');
let taskManager;
program.hook('preAction', (thisCommand, actionCommand) => {
    const cliFilePath = program.opts().filePath;
    const envFilePath = process.env.TASK_MANAGER_FILE_PATH;
    const resolvedPath = cliFilePath || envFilePath || undefined;
    try {
        taskManager = new TaskManager(resolvedPath);
    }
    catch (error) {
        console.error(chalk.red(formatCliError(error)));
        process.exit(1);
    }
});
program
    .command("approve")
    .description("Approve a completed task")
    .argument("<projectId>", "Project ID")
    .argument("<taskId>", "Task ID")
    .option('-f, --force', 'Force approval even if task is not marked as done')
    .action(async (projectId, taskId, options) => {
    try {
        console.log(chalk.blue(`Attempting to approve task ${chalk.bold(taskId)} in project ${chalk.bold(projectId)}...`));
        // First, verify the project and task exist and get their details
        let project;
        let task;
        try {
            project = await taskManager.readProject(projectId);
            task = project.tasks.find((t) => t.id === taskId);
            if (!task) {
                console.error(chalk.red(`Task ${chalk.bold(taskId)} not found in project ${chalk.bold(projectId)}.`));
                console.log(chalk.yellow('Available tasks in this project:'));
                project.tasks.forEach((t) => {
                    console.log(`  - ${t.id}: ${t.title} (Status: ${t.status}, Approved: ${t.approved ? 'Yes' : 'No'})`);
                });
                process.exit(1);
            }
        }
        catch (error) {
            console.error(chalk.red(formatCliError(error)));
            process.exit(1);
        }
        // Pre-check task status if not using force
        if (task.status !== "done" && !options.force) {
            console.error(chalk.red(`Task ${chalk.bold(taskId)} is not marked as done yet. Current status: ${chalk.bold(task.status)}`));
            console.log(chalk.yellow(`Use the --force flag to attempt approval anyway (may fail if underlying logic prevents it), or wait for the task to be marked as done.`));
            process.exit(1);
        }
        if (task.approved) {
            console.log(chalk.yellow(`Task ${chalk.bold(taskId)} is already approved.`));
            process.exit(0);
        }
        // Attempt to approve the task
        const approvedTask = await taskManager.approveTaskCompletion(projectId, taskId);
        console.log(chalk.green(`✅ Task ${chalk.bold(taskId)} in project ${chalk.bold(projectId)} has been approved.`));
        // Fetch updated project data for display
        const updatedProject = await taskManager.readProject(projectId);
        const updatedTask = updatedProject.tasks.find((t) => t.id === taskId);
        // Show task info
        if (updatedTask) {
            console.log(chalk.cyan('\n📋 Task details:'));
            console.log(`  - ${chalk.bold('Title:')} ${updatedTask.title}`);
            console.log(`  - ${chalk.bold('Description:')} ${updatedTask.description}`);
            console.log(`  - ${chalk.bold('Status:')} ${updatedTask.status === 'done' ? chalk.green('Done ✓') : updatedTask.status === 'in progress' ? chalk.yellow('In Progress ⟳') : chalk.blue('Not Started ○')}`);
            console.log(`  - ${chalk.bold('Completed details:')} ${updatedTask.completedDetails || chalk.gray("None")}`);
            console.log(`  - ${chalk.bold('Approved:')} ${updatedTask.approved ? chalk.green('Yes ✓') : chalk.red('No ✗')}`);
            if (updatedTask.toolRecommendations) {
                console.log(`  - ${chalk.bold('Tool Recommendations:')} ${updatedTask.toolRecommendations}`);
            }
            if (updatedTask.ruleRecommendations) {
                console.log(`  - ${chalk.bold('Rule Recommendations:')} ${updatedTask.ruleRecommendations}`);
            }
        }
        // Show progress info
        const totalTasks = updatedProject.tasks.length;
        const completedTasks = updatedProject.tasks.filter((t) => t.status === "done").length;
        const approvedTasks = updatedProject.tasks.filter((t) => t.approved).length;
        console.log(chalk.cyan(`\n📊 Progress: ${chalk.bold(`${approvedTasks}/${completedTasks}/${totalTasks}`)} (approved/completed/total)`));
        // Create a progress bar
        const bar = '▓'.repeat(approvedTasks) + '▒'.repeat(completedTasks - approvedTasks) + '░'.repeat(totalTasks - completedTasks);
        console.log(`  ${bar}`);
        if (completedTasks === totalTasks && approvedTasks === totalTasks) {
            console.log(chalk.green('\n🎉 All tasks are completed and approved!'));
            console.log(chalk.blue(`The project can now be finalized using: taskqueue finalize ${projectId}`));
        }
        else {
            if (totalTasks - completedTasks > 0) {
                console.log(chalk.yellow(`\n${totalTasks - completedTasks} tasks remaining to be completed.`));
            }
            if (completedTasks - approvedTasks > 0) {
                console.log(chalk.yellow(`${completedTasks - approvedTasks} tasks remaining to be approved.`));
            }
        }
    }
    catch (error) {
        console.error(chalk.red(formatCliError(error)));
        process.exit(1);
    }
});
program
    .command("finalize")
    .description("Mark a project as complete")
    .argument("<projectId>", "Project ID")
    .action(async (projectId) => {
    try {
        console.log(chalk.blue(`Attempting to finalize project ${chalk.bold(projectId)}...`));
        // First, verify the project exists and get its details
        let project;
        try {
            project = await taskManager.readProject(projectId);
        }
        catch (error) {
            console.error(chalk.red(formatCliError(error)));
            process.exit(1);
        }
        // Pre-check project status
        if (project.completed) {
            console.log(chalk.yellow(`Project ${chalk.bold(projectId)} is already marked as completed.`));
            process.exit(0);
        }
        // Pre-check task status (for better user feedback before attempting finalization)
        const allDone = project.tasks.every((t) => t.status === "done");
        if (!allDone) {
            console.error(chalk.red(`Not all tasks in project ${chalk.bold(projectId)} are marked as done.`));
            console.log(chalk.yellow('\nPending tasks:'));
            project.tasks.filter((t) => t.status !== "done").forEach((t) => {
                console.log(`  - ${chalk.bold(t.id)}: ${t.title} (Status: ${t.status})`);
            });
            process.exit(1);
        }
        const allApproved = project.tasks.every((t) => t.approved);
        if (!allApproved) {
            console.error(chalk.red(`Not all tasks in project ${chalk.bold(projectId)} are approved yet.`));
            console.log(chalk.yellow('\nUnapproved tasks:'));
            project.tasks.filter((t) => !t.approved).forEach((t) => {
                console.log(`  - ${chalk.bold(t.id)}: ${t.title}`);
            });
            process.exit(1);
        }
        // Attempt to finalize the project
        await taskManager.approveProjectCompletion(projectId);
        console.log(chalk.green(`✅ Project ${chalk.bold(projectId)} has been approved and marked as complete.`));
        // Fetch updated project data for display
        const updatedProject = await taskManager.readProject(projectId);
        // Show project info
        console.log(chalk.cyan('\n📋 Project details:'));
        console.log(`  - ${chalk.bold('Initial Prompt:')} ${updatedProject.initialPrompt}`);
        if (updatedProject.projectPlan && updatedProject.projectPlan !== updatedProject.initialPrompt) {
            console.log(`  - ${chalk.bold('Project Plan:')} ${updatedProject.projectPlan}`);
        }
        console.log(`  - ${chalk.bold('Status:')} ${chalk.green('Completed ✓')}`);
        // Show progress info
        const totalTasks = updatedProject.tasks.length;
        const completedTasks = updatedProject.tasks.filter((t) => t.status === "done").length;
        const approvedTasks = updatedProject.tasks.filter((t) => t.approved).length;
        console.log(chalk.cyan(`\n📊 Final Progress: ${chalk.bold(`${approvedTasks}/${completedTasks}/${totalTasks}`)} (approved/completed/total)`));
        // Create a progress bar
        const bar = '▓'.repeat(approvedTasks) + '▒'.repeat(completedTasks - approvedTasks) + '░'.repeat(totalTasks - completedTasks);
        console.log(`  ${bar}`);
        console.log(chalk.green('\n🎉 Project successfully completed and approved!'));
        console.log(chalk.gray('You can view the project details anytime using:'));
        console.log(chalk.blue(`  taskqueue list -p ${projectId}`));
    }
    catch (error) {
        console.error(chalk.red(formatCliError(error)));
        process.exit(1);
    }
});
program
    .command("list")
    .description("List project summaries, or list tasks for a specific project")
    .option('-p, --project <projectId>', 'Show details and tasks for a specific project')
    .option('-s, --state <state>', "Filter by task/project state (open, pending_approval, completed, all)")
    .action(async (options) => {
    try {
        // Validate state option if provided
        const validStates = ['open', 'pending_approval', 'completed', 'all'];
        const stateOption = options.state;
        if (stateOption && !validStates.includes(stateOption)) {
            console.error(chalk.red(`Invalid state value: ${options.state}`));
            console.log(chalk.yellow(`Valid states are: ${validStates.join(', ')}`));
            process.exit(1);
        }
        const filterState = (stateOption === 'all' || !stateOption) ? undefined : stateOption;
        if (options.project) {
            // Show details for a specific project
            const projectId = options.project;
            try {
                const project = await taskManager.readProject(projectId);
                // Filter tasks based on state if provided
                const tasksToList = filterState
                    ? project.tasks.filter((task) => {
                        if (filterState === 'open')
                            return !task.approved;
                        if (filterState === 'pending_approval')
                            return task.status === 'done' && !task.approved;
                        if (filterState === 'completed')
                            return task.status === 'done' && task.approved;
                        return true; // Should not happen
                    })
                    : project.tasks;
                // Use the formatter for the progress table - it now includes the header
                const projectForTableDisplay = { ...project, tasks: tasksToList };
                console.log(formatTaskProgressTable(projectForTableDisplay));
                if (tasksToList.length === 0) {
                    console.log(chalk.yellow(`\nNo tasks found${filterState ? ` matching state '${filterState}'` : ''} in project ${projectId}.`));
                }
                else if (filterState) {
                    console.log(chalk.dim(`(Filtered by state: ${filterState})`));
                }
            }
            catch (error) {
                console.error(chalk.red(formatCliError(error)));
                process.exit(1);
            }
        }
        else {
            // List all projects, potentially filtered
            const projects = await taskManager.listProjects(filterState);
            if (projects.projects.length === 0) {
                console.log(chalk.yellow(`No projects found${filterState ? ` matching state '${filterState}'` : ''}.`));
                return;
            }
            // Use the formatter directly with the summary data
            console.log(chalk.cyan(formatProjectsList(projects.projects)));
            if (filterState) {
                console.log(chalk.dim(`(Filtered by state: ${filterState})`));
            }
        }
    }
    catch (error) {
        console.error(chalk.red(formatCliError(error)));
        process.exit(1);
    }
});
program
    .command("generate-plan")
    .description("Generate a project plan using an LLM")
    .requiredOption("--prompt <text>", "Prompt text to feed to the LLM")
    .option("--model <model>", "LLM model to use", "gpt-4-turbo")
    .option("--provider <provider>", "LLM provider to use (openai, google, or deepseek)", "openai")
    .option("--attachment <file>", "File to attach as context (can be specified multiple times)", collect, [])
    .action(async (options) => {
    try {
        console.log(chalk.blue(`Generating project plan from prompt...`));
        // Pass attachment filenames directly to the server
        const result = await taskManager.generateProjectPlan({
            prompt: options.prompt,
            provider: options.provider,
            model: options.model,
            attachments: options.attachment
        });
        // Display the results
        console.log(chalk.green(`✅ Project plan generated successfully!`));
        console.log(chalk.cyan('\n📋 Project details:'));
        console.log(`  - ${chalk.bold('Project ID:')} ${result.projectId}`);
        console.log(`  - ${chalk.bold('Total Tasks:')} ${result.totalTasks}`);
        console.log(chalk.cyan('\n📝 Tasks:'));
        result.tasks.forEach((task) => {
            console.log(`\n  ${chalk.bold(task.id)}:`);
            console.log(`    Title: ${task.title}`);
            console.log(`    Description: ${task.description}`);
        });
        if (result.message) {
            console.log(`\n${result.message}`);
        }
    }
    catch (error) {
        console.error(chalk.red(formatCliError(error)));
        process.exit(1);
    }
});
// Helper function for collecting multiple values for the same option
function collect(value, previous) {
    return previous.concat([value]);
}
// Export program for testing purposes
export { program };
//# sourceMappingURL=cli.js.map