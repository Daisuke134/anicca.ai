// This file provides global declarations for Jest functions
// It allows TypeScript to recognize Jest globals without explicit imports
import { jest, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
// Export the Jest globals for reuse
export { jest, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll };
// Add global teardown
afterAll(async () => {
    // Allow time for any open handles to close
    await new Promise(resolve => setTimeout(resolve, 500));
});
//# sourceMappingURL=setup.js.map