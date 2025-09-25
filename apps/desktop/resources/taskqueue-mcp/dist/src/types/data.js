// Define valid task status transitions
export const VALID_STATUS_TRANSITIONS = {
    "not started": ["in progress"],
    "in progress": ["done", "not started"],
    "done": ["in progress"]
};
//# sourceMappingURL=data.js.map