import baseLogger from '../../utils/logger.js';
import { Memory as PlatformMemory } from 'mem0ai';
import { Memory as OSSMemory } from 'mem0ai/oss';

// mem0 SDK:
// - OSS:   import { Memory } from "mem0ai/oss";
// - Cloud: import { Memory } from "mem0ai";
// Ref:
// - https://docs.mem0.ai/open-source/node-quickstart
// - https://docs.mem0.ai/platform/advanced-memory-operations

const logger = baseLogger.withContext('Mem0Client');

let singleton = null;

function getMode() {
  return process.env.MEM0_API_KEY ? 'platform' : 'oss';
}

export function getMem0Client() {
  if (singleton) return singleton;
  singleton = createMem0Client();
  return singleton;
}

export function createMem0Client() {
  const mode = getMode();
  if (mode === 'platform') {
    // Platform (hosted)
    const memory = new PlatformMemory({ apiKey: process.env.MEM0_API_KEY, async: true });
    logger.info('Initialized mem0 platform client');
    return wrap(memory);
  }
  // OSS fallback (local-friendly)
  const memory = new OSSMemory();
  logger.warn('MEM0_API_KEY is not set; using mem0 OSS mode (local storage)');
  return wrap(memory);
}

function wrap(memory) {
  return {
    async addProfile({ userId, content, metadata = {} }) {
      return addText(memory, userId, content, { category: 'profile', ...metadata });
    },
    async addBehaviorSummary({ userId, content, metadata = {} }) {
      return addText(memory, userId, content, { category: 'behavior_summary', ...metadata });
    },
    async addInteraction({ userId, content, metadata = {} }) {
      return addText(memory, userId, content, { category: 'interaction', ...metadata });
    },
    async addNudgeMeta({ userId, content, metadata = {} }) {
      return addText(memory, userId, content, { category: 'nudge_meta', ...metadata });
    },

    async search({ userId, query, filters, topK = 3, rerank = true, includeVectors = false }) {
      // mem0 platform supports rerank + filters; OSS supports a subset.
      return memory.search(query, {
        userId,
        topK,
        rerank,
        includeVectors,
        ...(filters ? { filters } : {})
      });
    },

    async getAll({ userId }) {
      return memory.getAll({ userId });
    },
    async update(memoryId, patch) {
      return memory.update(memoryId, patch);
    },
    async delete(memoryId) {
      return memory.delete(memoryId);
    },
    async deleteAll({ userId, runId }) {
      return memory.deleteAll({ userId, ...(runId ? { runId } : {}) });
    }
  };
}

async function addText(memory, userId, content, metadata) {
  // mem0 "add" expects a conversation array; keep it minimal.
  const conversation = [
    { role: 'user', content: String(content || '') }
  ];
  return memory.add(conversation, { userId, metadata });
}

