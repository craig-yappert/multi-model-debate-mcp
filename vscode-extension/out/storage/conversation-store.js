"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationStore = void 0;
const vscode = __importStar(require("vscode"));
class ConversationStore {
    constructor(context) {
        this.context = context;
    }
    async saveConversation(entry) {
        try {
            // Generate ID if not provided
            if (!entry.id) {
                entry.id = this.generateConversationId();
            }
            // Get existing conversations
            const conversations = await this.getStoredConversations();
            // Add new conversation
            conversations.push(entry);
            // Maintain size limit
            if (conversations.length > ConversationStore.MAX_CONVERSATIONS) {
                conversations.splice(0, conversations.length - ConversationStore.MAX_CONVERSATIONS);
            }
            // Save to workspace storage
            await this.context.workspaceState.update(ConversationStore.STORAGE_KEY, conversations);
            // Update summary statistics
            await this.updateSummary();
        }
        catch (error) {
            console.error('Failed to save conversation:', error);
            vscode.window.showErrorMessage('Failed to save AI conversation to workspace storage');
        }
    }
    async getConversationHistory(limit = 50) {
        try {
            const conversations = await this.getStoredConversations();
            return conversations.slice(-limit).reverse(); // Most recent first
        }
        catch (error) {
            console.error('Failed to get conversation history:', error);
            return [];
        }
    }
    async getRecentConversations(limit = 10) {
        return this.getConversationHistory(limit);
    }
    async getConversationsByPersona(persona, limit = 20) {
        try {
            const conversations = await this.getStoredConversations();
            return conversations
                .filter(conv => conv.persona === persona)
                .slice(-limit)
                .reverse();
        }
        catch (error) {
            console.error(`Failed to get conversations for persona ${persona}:`, error);
            return [];
        }
    }
    async getConversationsByFile(filePath, limit = 20) {
        try {
            const conversations = await this.getStoredConversations();
            return conversations
                .filter(conv => conv.context.activeFile?.path === filePath)
                .slice(-limit)
                .reverse();
        }
        catch (error) {
            console.error(`Failed to get conversations for file ${filePath}:`, error);
            return [];
        }
    }
    async searchConversations(query, limit = 20) {
        try {
            const conversations = await this.getStoredConversations();
            const lowerQuery = query.toLowerCase();
            return conversations
                .filter(conv => conv.message.toLowerCase().includes(lowerQuery) ||
                conv.response.toLowerCase().includes(lowerQuery))
                .slice(-limit)
                .reverse();
        }
        catch (error) {
            console.error(`Failed to search conversations:`, error);
            return [];
        }
    }
    async getSummary() {
        try {
            const stored = this.context.workspaceState.get(ConversationStore.SUMMARY_KEY);
            if (stored) {
                return stored;
            }
            // Generate summary if not cached
            return this.generateSummary();
        }
        catch (error) {
            console.error('Failed to get conversation summary:', error);
            return this.getEmptySummary();
        }
    }
    async clearHistory() {
        try {
            await this.context.workspaceState.update(ConversationStore.STORAGE_KEY, []);
            await this.context.workspaceState.update(ConversationStore.SUMMARY_KEY, undefined);
        }
        catch (error) {
            console.error('Failed to clear conversation history:', error);
            throw new Error('Failed to clear conversation history');
        }
    }
    async exportConversations(format = 'json') {
        try {
            const conversations = await this.getStoredConversations();
            if (format === 'json') {
                return JSON.stringify(conversations, null, 2);
            }
            else {
                return this.formatAsMarkdown(conversations);
            }
        }
        catch (error) {
            console.error('Failed to export conversations:', error);
            throw new Error('Failed to export conversations');
        }
    }
    async getStoredConversations() {
        return this.context.workspaceState.get(ConversationStore.STORAGE_KEY, []);
    }
    generateConversationId() {
        return `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    async updateSummary() {
        try {
            const summary = await this.generateSummary();
            await this.context.workspaceState.update(ConversationStore.SUMMARY_KEY, summary);
        }
        catch (error) {
            console.error('Failed to update conversation summary:', error);
        }
    }
    async generateSummary() {
        try {
            const conversations = await this.getStoredConversations();
            if (conversations.length === 0) {
                return this.getEmptySummary();
            }
            // Count conversations by persona
            const conversationsByPersona = {};
            let totalResponseTime = 0;
            const fileFrequency = {};
            const recentTopics = [];
            for (const conv of conversations) {
                // Persona counts
                conversationsByPersona[conv.persona] = (conversationsByPersona[conv.persona] || 0) + 1;
                // Response time
                totalResponseTime += conv.responseTime || 0;
                // File frequency
                if (conv.context.activeFile?.path) {
                    const filePath = conv.context.activeFile.path;
                    fileFrequency[filePath] = (fileFrequency[filePath] || 0) + 1;
                }
                // Recent topics (extract key words from messages)
                if (conversations.indexOf(conv) >= conversations.length - 20) {
                    const keywords = this.extractKeywords(conv.message);
                    recentTopics.push(...keywords);
                }
            }
            // Find most active file
            let mostActiveFile = 'None';
            let maxFileCount = 0;
            for (const [file, count] of Object.entries(fileFrequency)) {
                if (count > maxFileCount) {
                    maxFileCount = count;
                    mostActiveFile = file.split('/').pop() || file;
                }
            }
            // Get unique recent topics, limited to top 10
            const uniqueTopics = [...new Set(recentTopics)].slice(0, 10);
            return {
                totalConversations: conversations.length,
                conversationsByPersona,
                averageResponseTime: conversations.length > 0 ? totalResponseTime / conversations.length : 0,
                mostActiveFile,
                recentTopics: uniqueTopics
            };
        }
        catch (error) {
            console.error('Failed to generate conversation summary:', error);
            return this.getEmptySummary();
        }
    }
    extractKeywords(text) {
        // Simple keyword extraction
        const words = text.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(word => word.length > 3)
            .filter(word => !this.isStopWord(word));
        return words.slice(0, 5); // Top 5 words
    }
    isStopWord(word) {
        const stopWords = new Set([
            'the', 'and', 'this', 'that', 'with', 'have', 'will', 'from', 'they', 'been',
            'what', 'when', 'where', 'would', 'could', 'should', 'there', 'their', 'about'
        ]);
        return stopWords.has(word);
    }
    getEmptySummary() {
        return {
            totalConversations: 0,
            conversationsByPersona: {},
            averageResponseTime: 0,
            mostActiveFile: 'None',
            recentTopics: []
        };
    }
    formatAsMarkdown(conversations) {
        const lines = [];
        lines.push('# AI Conversation History');
        lines.push(`*Generated: ${new Date().toLocaleString()}*\n`);
        for (const conv of conversations.reverse()) {
            lines.push(`## ${this.formatPersonaName(conv.persona)} - ${new Date(conv.timestamp).toLocaleString()}`);
            // Add context information
            if (conv.context.activeFile?.path) {
                lines.push(`**File:** \`${conv.context.activeFile.path}\``);
            }
            if (conv.context.git?.branch) {
                lines.push(`**Git Branch:** \`${conv.context.git.branch}\``);
            }
            if (conv.context.diagnostics.length > 0) {
                lines.push(`**Issues:** ${conv.context.diagnostics.length} diagnostics`);
            }
            lines.push(`**Response Time:** ${conv.responseTime}ms\n`);
            // User message
            lines.push(`**Human:** ${conv.message}\n`);
            // AI response
            lines.push(`**${this.formatPersonaName(conv.persona)}:** ${conv.response}\n`);
            lines.push('---\n');
        }
        return lines.join('\n');
    }
    formatHistoryForDisplay(conversations) {
        return this.formatAsMarkdown(conversations);
    }
    formatPersonaName(persona) {
        switch (persona) {
            case 'claude-research':
                return 'Claude Research';
            case 'kiro':
                return 'Kiro';
            default:
                return persona;
        }
    }
    // Utility method to get conversation statistics
    async getStatistics() {
        try {
            const conversations = await this.getStoredConversations();
            const summary = await this.getSummary();
            const today = new Date().toDateString();
            const todaysConversations = conversations.filter(conv => new Date(conv.timestamp).toDateString() === today).length;
            let mostActivePersona = 'None';
            let maxCount = 0;
            for (const [persona, count] of Object.entries(summary.conversationsByPersona)) {
                if (count > maxCount) {
                    maxCount = count;
                    mostActivePersona = persona;
                }
            }
            return {
                totalConversations: summary.totalConversations,
                averageResponseTime: `${(summary.averageResponseTime / 1000).toFixed(1)}s`,
                mostActivePersona,
                todaysConversations
            };
        }
        catch (error) {
            console.error('Failed to get conversation statistics:', error);
            return {
                totalConversations: 0,
                averageResponseTime: '0s',
                mostActivePersona: 'None',
                todaysConversations: 0
            };
        }
    }
    // Threading support methods
    async createThread(participants, topic) {
        const threadId = this.generateThreadId();
        const thread = {
            id: threadId,
            participants,
            messages: [],
            status: 'active',
            topic,
            startTime: new Date().toISOString(),
            lastActivity: new Date().toISOString()
        };
        const threads = await this.getStoredThreads();
        threads.push(thread);
        await this.context.workspaceState.update('ai-conversation-threads', threads);
        return thread;
    }
    async addMessageToThread(threadId, message) {
        const threads = await this.getStoredThreads();
        const threadIndex = threads.findIndex(t => t.id === threadId);
        if (threadIndex !== -1) {
            threads[threadIndex].messages.push(message);
            threads[threadIndex].lastActivity = new Date().toISOString();
            await this.context.workspaceState.update('ai-conversation-threads', threads);
        }
    }
    async getThread(threadId) {
        const threads = await this.getStoredThreads();
        return threads.find(t => t.id === threadId);
    }
    async updateThreadStatus(threadId, status) {
        const threads = await this.getStoredThreads();
        const threadIndex = threads.findIndex(t => t.id === threadId);
        if (threadIndex !== -1) {
            threads[threadIndex].status = status;
            threads[threadIndex].lastActivity = new Date().toISOString();
            await this.context.workspaceState.update('ai-conversation-threads', threads);
        }
    }
    async getActiveThreads() {
        const threads = await this.getStoredThreads();
        return threads.filter(t => t.status === 'active');
    }
    async getStoredThreads() {
        try {
            const threads = this.context.workspaceState.get('ai-conversation-threads');
            return threads || [];
        }
        catch (error) {
            console.error('Failed to get stored threads:', error);
            return [];
        }
    }
    generateThreadId() {
        return `thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}
exports.ConversationStore = ConversationStore;
ConversationStore.STORAGE_KEY = 'ai-conversations';
ConversationStore.MAX_CONVERSATIONS = 200;
ConversationStore.SUMMARY_KEY = 'conversation-summary';
//# sourceMappingURL=conversation-store.js.map