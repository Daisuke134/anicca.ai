export declare enum AppErrorCode {
    MissingParameter = "ERR_1000",// General missing param (mapped to protocol -32602)
    InvalidArgument = "ERR_1002",// Extra param / invalid type (mapped to protocol -32602)
    ConfigurationError = "ERR_2000",// e.g., Missing API Key for generate_project_plan
    ProjectNotFound = "ERR_2001",
    TaskNotFound = "ERR_2002",
    InvalidState = "ERR_2003",// e.g., invalid state filter
    InvalidProvider = "ERR_2004",// e.g., invalid model provider
    InvalidModel = "ERR_2005",// e.g., invalid model name or model not accessible
    TaskNotDone = "ERR_3000",// Cannot approve/finalize if task not done
    ProjectAlreadyCompleted = "ERR_3001",
    TasksNotAllDone = "ERR_3003",// Cannot finalize project
    TasksNotAllApproved = "ERR_3004",// Cannot finalize project
    CannotModifyApprovedTask = "ERR_3005",// Added for clarity
    TaskAlreadyApproved = "ERR_3006",// Added for clarity
    FileReadError = "ERR_4000",// Includes not found, permission denied etc.
    FileWriteError = "ERR_4001",
    FileParseError = "ERR_4002",// If needed during JSON parsing
    ReadOnlyFileSystem = "ERR_4003",
    LLMGenerationError = "ERR_5000",
    LLMConfigurationError = "ERR_5001",// Auth, key issues specifically with LLM provider call
    Unknown = "ERR_9999"
}
export declare class AppError extends Error {
    readonly code: AppErrorCode;
    readonly details?: unknown;
    constructor(message: string, code: AppErrorCode, details?: unknown);
}
