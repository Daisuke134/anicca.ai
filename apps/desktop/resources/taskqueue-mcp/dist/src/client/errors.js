import { AppError } from "../types/errors.js";
/**
 * Formats an error message for CLI output
 */
export function formatCliError(error) {
    // Handle our custom file system errors by prefixing the error code
    if (error instanceof AppError) {
        let details = '';
        if (error.details) {
            const detailsStr = typeof error.details === 'string' ? error.details : String(error.details);
            details = `\n-> Details: ${detailsStr.replace(/^AppError:\s*/, '')}`;
        }
        return `[${error.code}] ${error.message}${details}`;
    }
    // For unknown errors, just return the error message
    return error.message;
}
//# sourceMappingURL=errors.js.map