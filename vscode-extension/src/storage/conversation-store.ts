import * as vscode from 'vscode';
import { VSCodeContext } from '../chat/context-analyzer';

export interface ConversationEntry {
    id: string;
    persona: string;
    message: string;
    response: string;
    context: VSCodeContext;
    timestamp: string;
    responseTime: number; // milliseconds
    metadata?: {
        fileContext?: string;
        hasErrors?: boolean;
        isDebugging?: boolean;
        gitBranch?: string;
    };
}

export interface ConversationSummary {
    totalConversations: number;
    conversationsByPersona: { [persona: string]: number };
    averageResponseTime: number;
    mostActiveFile: string;
    recentTopics: string[];
}

export class ConversationStore {
    private static readonly STORAGE_KEY = 'ai-conversations';
    private static readonly MAX_CONVERSATIONS = 200;
    private static readonly SUMMARY_KEY = 'conversation-summary';

    constructor(private context: vscode.ExtensionContext) {}

    async saveConversation(entry: ConversationEntry): Promise<void> {
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

        } catch (error) {
            console.error('Failed to save conversation:', error);
            vscode.window.showErrorMessage('Failed to save AI conversation to workspace storage');
        }
    }

    async getConversationHistory(limit: number = 50): Promise<ConversationEntry[]> {
        try {
            const conversations = await this.getStoredConversations();
            return conversations.slice(-limit).reverse(); // Most recent first
        } catch (error) {
            console.error('Failed to get conversation history:', error);
            return [];
        }
    }

    async getRecentConversations(limit: number = 10): Promise<ConversationEntry[]> {
        return this.getConversationHistory(limit);
    }

    async getConversationsByPersona(persona: string, limit: number = 20): Promise<ConversationEntry[]> {
        try {
            const conversations = await this.getStoredConversations();
            return conversations
                .filter(conv => conv.persona === persona)
                .slice(-limit)
                .reverse();
        } catch (error) {
            console.error(`Failed to get conversations for persona ${persona}:`, error);
            return [];
        }
    }

    async getConversationsByFile(filePath: string, limit: number = 20): Promise<ConversationEntry[]> {
        try {
            const conversations = await this.getStoredConversations();
            return conversations
                .filter(conv => conv.context.activeFile?.path === filePath)
                .slice(-limit)
                .reverse();
        } catch (error) {
            console.error(`Failed to get conversations for file ${filePath}:`, error);
            return [];
        }
    }

    async searchConversations(query: string, limit: number = 20): Promise<ConversationEntry[]> {
        try {
            const conversations = await this.getStoredConversations();
            const lowerQuery = query.toLowerCase();

            return conversations
                .filter(conv =>
                    conv.message.toLowerCase().includes(lowerQuery) ||
                    conv.response.toLowerCase().includes(lowerQuery)
                )
                .slice(-limit)
                .reverse();
        } catch (error) {
            console.error(`Failed to search conversations:`, error);
            return [];
        }
    }

    async getSummary(): Promise<ConversationSummary> {
        try {
            const stored = this.context.workspaceState.get<ConversationSummary>(ConversationStore.SUMMARY_KEY);
            if (stored) {
                return stored;
            }

            // Generate summary if not cached
            return this.generateSummary();
        } catch (error) {
            console.error('Failed to get conversation summary:', error);
            return this.getEmptySummary();
        }
    }

    async clearHistory(): Promise<void> {
        try {
            await this.context.workspaceState.update(ConversationStore.STORAGE_KEY, []);
            await this.context.workspaceState.update(ConversationStore.SUMMARY_KEY, undefined);
        } catch (error) {
            console.error('Failed to clear conversation history:', error);
            throw new Error('Failed to clear conversation history');
        }
    }

    async exportConversations(format: 'json' | 'markdown' = 'json'): Promise<string> {
        try {
            const conversations = await this.getStoredConversations();

            if (format === 'json') {
                return JSON.stringify(conversations, null, 2);
            } else {
                return this.formatAsMarkdown(conversations);
            }
        } catch (error) {
            console.error('Failed to export conversations:', error);
            throw new Error('Failed to export conversations');
        }
    }

    private async getStoredConversations(): Promise<ConversationEntry[]> {
        return this.context.workspaceState.get<ConversationEntry[]>(ConversationStore.STORAGE_KEY, []);
    }

    private generateConversationId(): string {
        return `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    private async updateSummary(): Promise<void> {
        try {
            const summary = await this.generateSummary();
            await this.context.workspaceState.update(ConversationStore.SUMMARY_KEY, summary);
        } catch (error) {
            console.error('Failed to update conversation summary:', error);
        }
    }

    private async generateSummary(): Promise<ConversationSummary> {
        try {
            const conversations = await this.getStoredConversations();

            if (conversations.length === 0) {
                return this.getEmptySummary();
            }

            // Count conversations by persona
            const conversationsByPersona: { [persona: string]: number } = {};
            let totalResponseTime = 0;
            const fileFrequency: { [file: string]: number } = {};
            const recentTopics: string[] = [];

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

        } catch (error) {
            console.error('Failed to generate conversation summary:', error);
            return this.getEmptySummary();
        }
    }

    private extractKeywords(text: string): string[] {
        // Simple keyword extraction
        const words = text.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(word => word.length > 3)
            .filter(word => !this.isStopWord(word));

        return words.slice(0, 5); // Top 5 words
    }

    private isStopWord(word: string): boolean {
        const stopWords = new Set([
            'the', 'and', 'this', 'that', 'with', 'have', 'will', 'from', 'they', 'been',
            'what', 'when', 'where', 'would', 'could', 'should', 'there', 'their', 'about'
        ]);
        return stopWords.has(word);
    }

    private getEmptySummary(): ConversationSummary {
        return {
            totalConversations: 0,
            conversationsByPersona: {},
            averageResponseTime: 0,
            mostActiveFile: 'None',
            recentTopics: []
        };
    }

    private formatAsMarkdown(conversations: ConversationEntry[]): string {
        const lines: string[] = [];

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

    formatHistoryForDisplay(conversations: ConversationEntry[]): string {
        return this.formatAsMarkdown(conversations);
    }

    private formatPersonaName(persona: string): string {
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
    async getStatistics(): Promise<{
        totalConversations: number;
        averageResponseTime: string;
        mostActivePersona: string;
        todaysConversations: number;
    }> {
        try {
            const conversations = await this.getStoredConversations();
            const summary = await this.getSummary();

            const today = new Date().toDateString();
            const todaysConversations = conversations.filter(conv =>
                new Date(conv.timestamp).toDateString() === today
            ).length;

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

        } catch (error) {
            console.error('Failed to get conversation statistics:', error);
            return {
                totalConversations: 0,
                averageResponseTime: '0s',
                mostActivePersona: 'None',
                todaysConversations: 0
            };
        }
    }
}