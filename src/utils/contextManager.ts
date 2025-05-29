import { SessionContext, CommentaryResponse } from '../types';

export class ContextManager {
  private static readonly MAX_CONTEXT_LENGTH = 1000; // Maximum characters per context entry
  private static readonly CONTEXT_SUMMARY_THRESHOLD = 20; // When to summarize old context

  /**
   * Compresses context history when it becomes too long
   */
  static compressContext(context: SessionContext, maxItems: number): SessionContext {
    if (context.contextHistory.length <= maxItems) {
      return context;
    }

    // Keep the most recent items and summarize older ones
    const recentItems = context.contextHistory.slice(-Math.floor(maxItems * 0.7));
    const oldItems = context.contextHistory.slice(0, -Math.floor(maxItems * 0.7));
    
    const summary = this.summarizeContext(oldItems);
    
    return {
      ...context,
      contextHistory: [summary, ...recentItems]
    };
  }

  /**
   * Creates a summary of multiple context entries
   */
  private static summarizeContext(contextItems: string[]): string {
    if (contextItems.length === 0) return '';
    
    // Simple summarization - in production, this could use AI
    const keywords = this.extractKeywords(contextItems);
    const activities = this.extractActivities(contextItems);
    
    return `Previous session summary: User was working with ${keywords.join(', ')}. Activities included ${activities.join(', ')}.`;
  }

  /**
   * Extracts keywords from context history
   */
  private static extractKeywords(contextItems: string[]): string[] {
    const text = contextItems.join(' ').toLowerCase();
    const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'been', 'have', 'has', 'had', 'will', 'would', 'could', 'should', 'can', 'may', 'might', 'user', 'screen', 'appears', 'shows', 'display', 'see', 'visible']);
    
    const words = text.match(/\b\w{4,}\b/g) || [];
    const wordCount = new Map<string, number>();
    
    words.forEach(word => {
      if (!commonWords.has(word)) {
        wordCount.set(word, (wordCount.get(word) || 0) + 1);
      }
    });
    
    return Array.from(wordCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  }

  /**
   * Extracts activity patterns from context
   */
  private static extractActivities(contextItems: string[]): string[] {
    const text = contextItems.join(' ').toLowerCase();
    const activities: string[] = [];
    
    // Look for common activity patterns
    const patterns = [
      /typing|writing|editing/g,
      /browsing|scrolling|navigating/g,
      /coding|programming|development/g,
      /reading|viewing|looking/g,
      /clicking|selecting|interacting/g,
      /opening|closing|switching/g
    ];
    
    patterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        activities.push(matches[0]);
      }
    });
    
    return [...new Set(activities)].slice(0, 3);
  }

  /**
   * Generates contextual prompt based on session history
   */
  static generateContextualPrompt(
    context: SessionContext, 
    currentActivity: string = ''
  ): string {
    const recentContext = context.contextHistory.slice(-3).join(' ');
    const sessionDuration = Math.round((Date.now() - context.startTime) / 1000);
    const minutesElapsed = Math.floor(sessionDuration / 60);
    
    let prompt = `You are an AI screen narrator providing live commentary. `;
    
    if (context.frameCount > 0) {
      prompt += `This is frame ${context.frameCount} in a ${minutesElapsed}min session. `;
    }
    
    if (recentContext) {
      prompt += `Recent context: ${recentContext}. `;
    }
    
    if (currentActivity) {
      prompt += `Current focus: ${currentActivity}. `;
    }
    
    prompt += `Provide brief, natural commentary on current screen changes. Keep it conversational and under 50 words.`;
    
    return prompt;
  }

  /**
   * Analyzes context for activity patterns
   */
  static analyzeActivityPattern(context: SessionContext): {
    primaryActivity: string;
    confidence: number;
    duration: number;
  } {
    const recentHistory = context.contextHistory.slice(-10);
    const activities = this.extractActivities(recentHistory);
    
    if (activities.length === 0) {
      return {
        primaryActivity: 'general computer use',
        confidence: 0.3,
        duration: Date.now() - context.lastActivity
      };
    }
    
    const primaryActivity = activities[0];
    const confidence = Math.min(0.9, activities.length / 5); // Higher confidence with more consistent activities
    
    return {
      primaryActivity,
      confidence,
      duration: Date.now() - context.lastActivity
    };
  }

  /**
   * Determines if context needs refresh based on inactivity
   */
  static needsContextRefresh(context: SessionContext, maxInactiveMs: number = 300000): boolean {
    const inactiveTime = Date.now() - context.lastActivity;
    return inactiveTime > maxInactiveMs;
  }

  /**
   * Creates a clean context for a new session
   */
  static createNewContext(sessionId: string): SessionContext {
    return {
      sessionId,
      startTime: Date.now(),
      frameCount: 0,
      lastActivity: Date.now(),
      contextHistory: []
    };
  }

  /**
   * Updates context with new commentary
   */
  static updateContext(
    context: SessionContext, 
    commentary: CommentaryResponse
  ): SessionContext {
    const updatedHistory = [...context.contextHistory];
    
    // Truncate commentary if too long
    let text = commentary.text;
    if (text.length > this.MAX_CONTEXT_LENGTH) {
      text = text.substring(0, this.MAX_CONTEXT_LENGTH) + '...';
    }
    
    updatedHistory.push(text);
    
    return {
      ...context,
      lastActivity: Date.now(),
      contextHistory: updatedHistory
    };
  }

  /**
   * Merges context from multiple sessions (for session resumption)
   */
  static mergeContexts(contexts: SessionContext[]): SessionContext {
    if (contexts.length === 0) {
      throw new Error('Cannot merge empty context array');
    }
    
    if (contexts.length === 1) {
      return contexts[0];
    }
    
    const merged = contexts[0];
    const allHistory: string[] = [];
    
    contexts.forEach(ctx => {
      allHistory.push(...ctx.contextHistory);
    });
    
    return {
      ...merged,
      contextHistory: allHistory.slice(-50), // Keep last 50 items
      frameCount: contexts.reduce((sum, ctx) => sum + ctx.frameCount, 0),
      lastActivity: Math.max(...contexts.map(ctx => ctx.lastActivity))
    };
  }
} 