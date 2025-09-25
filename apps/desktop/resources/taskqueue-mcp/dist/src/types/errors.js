// Error Codes
export var AppErrorCode;
(function (AppErrorCode) {
    // Protocol Errors (ERR_1xxx)
    AppErrorCode["MissingParameter"] = "ERR_1000";
    AppErrorCode["InvalidArgument"] = "ERR_1002";
    // Validation / Resource Not Found (ERR_2xxx)
    AppErrorCode["ConfigurationError"] = "ERR_2000";
    AppErrorCode["ProjectNotFound"] = "ERR_2001";
    AppErrorCode["TaskNotFound"] = "ERR_2002";
    AppErrorCode["InvalidState"] = "ERR_2003";
    AppErrorCode["InvalidProvider"] = "ERR_2004";
    AppErrorCode["InvalidModel"] = "ERR_2005";
    // No need for EmptyTaskFile code, handle during load
    // Business Logic / State Rules (ERR_3xxx)
    AppErrorCode["TaskNotDone"] = "ERR_3000";
    AppErrorCode["ProjectAlreadyCompleted"] = "ERR_3001";
    // No need for CannotDeleteCompletedTask, handle in logic
    AppErrorCode["TasksNotAllDone"] = "ERR_3003";
    AppErrorCode["TasksNotAllApproved"] = "ERR_3004";
    AppErrorCode["CannotModifyApprovedTask"] = "ERR_3005";
    AppErrorCode["TaskAlreadyApproved"] = "ERR_3006";
    // File System (ERR_4xxx)
    AppErrorCode["FileReadError"] = "ERR_4000";
    AppErrorCode["FileWriteError"] = "ERR_4001";
    AppErrorCode["FileParseError"] = "ERR_4002";
    AppErrorCode["ReadOnlyFileSystem"] = "ERR_4003";
    // LLM Interaction Errors (ERR_5xxx)
    AppErrorCode["LLMGenerationError"] = "ERR_5000";
    AppErrorCode["LLMConfigurationError"] = "ERR_5001";
    // Unknown / Catch-all (ERR_9xxx)
    AppErrorCode["Unknown"] = "ERR_9999";
})(AppErrorCode || (AppErrorCode = {}));
// Add a base AppError class
export class AppError extends Error {
    code;
    details;
    constructor(message, code, details) {
        super(message);
        this.name = this.constructor.name; // Set name to the specific error class name
        this.code = code;
        this.details = details;
        // Fix prototype chain for instanceof to work correctly
        Object.setPrototypeOf(this, AppError.prototype);
    }
}
//# sourceMappingURL=errors.js.map