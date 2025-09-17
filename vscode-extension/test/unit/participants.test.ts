import * as vscode from 'vscode';
import { ChatParticipantManager } from '../../src/chat/participants';
import { MCPClient } from '../../src/mcp/client';
import { ConversationStore } from '../../src/storage/conversation-store';
import { ContextAnalyzer } from '../../src/chat/context-analyzer';
import { CommandLineManager } from '../../src/chat/command-line-manager';

describe('ChatParticipantManager', () => {
  let chatManager: ChatParticipantManager;
  let mockMCPClient: jest.Mocked<MCPClient>;
  let mockConversationStore: jest.Mocked<ConversationStore>;
  let mockContextAnalyzer: jest.Mocked<ContextAnalyzer>;
  let mockCommandLineManager: jest.Mocked<CommandLineManager>;
  let mockRequest: vscode.ChatRequest;
  let mockContext: vscode.ChatContext;
  let mockResponseStream: vscode.ChatResponseStream;
  let mockToken: vscode.CancellationToken;

  beforeEach(() => {
    // Create mock dependencies
    mockMCPClient = {
      contribute: jest.fn().mockResolvedValue('AI response'),
      sendAIToAIMessage: jest.fn().mockResolvedValue('AI to AI response'),
      disconnect: jest.fn()
    } as any;

    mockConversationStore = {
      saveConversation: jest.fn().mockResolvedValue(undefined),
      getRecentConversations: jest.fn().mockResolvedValue([]),
      createThread: jest.fn().mockResolvedValue({ id: 'thread-1', participants: [], topic: '', messages: [] }),
      addMessageToThread: jest.fn().mockResolvedValue(undefined),
      updateThreadStatus: jest.fn().mockResolvedValue(undefined)
    } as any;

    mockContextAnalyzer = {
      gatherContext: jest.fn().mockResolvedValue({
        activeFile: null,
        workspace: { name: 'test-workspace' },
        diagnostics: [],
        git: { branch: 'main' },
        debugging: { isActive: false }
      })
    } as any;

    mockCommandLineManager = {
      isEnabled: jest.fn().mockReturnValue(false)
    } as any;

    // Create chat manager instance
    chatManager = new ChatParticipantManager(
      mockMCPClient,
      mockConversationStore,
      mockContextAnalyzer,
      mockCommandLineManager
    );

    // Setup request/response mocks
    mockRequest = {
      prompt: 'test prompt',
      command: undefined,
      references: [],
      toolInvocationToken: undefined,
      toolReferences: [],
      model: 'gpt-4'
    } as vscode.ChatRequest;

    mockContext = {
      history: []
    } as vscode.ChatContext;

    mockResponseStream = {
      markdown: jest.fn().mockReturnThis(),
      progress: jest.fn().mockReturnThis(),
      button: jest.fn().mockReturnThis()
    } as any;

    mockToken = {
      isCancellationRequested: false,
      onCancellationRequested: jest.fn()
    } as any;
  });

  describe('handleChatRequest', () => {
    it('should handle a request for claude-research persona', async () => {
      const result = await chatManager.handleChatRequest(
        'claude-research',
        mockRequest,
        mockContext,
        mockResponseStream,
        mockToken
      );

      expect(mockContextAnalyzer.gatherContext).toHaveBeenCalled();
      expect(mockMCPClient.contribute).toHaveBeenCalled();
      expect(mockResponseStream.markdown).toHaveBeenCalled();
      expect(result.metadata.command).toContain('claude-research');
    });

    it('should handle a request for kiro persona', async () => {
      const result = await chatManager.handleChatRequest(
        'kiro',
        mockRequest,
        mockContext,
        mockResponseStream,
        mockToken
      );

      expect(mockMCPClient.contribute).toHaveBeenCalled();
      expect(mockResponseStream.markdown).toHaveBeenCalled();
      expect(result.metadata.command).toContain('kiro');
    });

    it('should handle a request for copilot persona', async () => {
      const result = await chatManager.handleChatRequest(
        'copilot',
        mockRequest,
        mockContext,
        mockResponseStream,
        mockToken
      );

      expect(mockMCPClient.contribute).toHaveBeenCalled();
      expect(mockResponseStream.markdown).toHaveBeenCalled();
      expect(result.metadata.command).toContain('copilot');
    });
  });

  describe('Team Collaboration', () => {
    it('should handle team requests with orchestration', async () => {
      const teamRequest = { ...mockRequest, prompt: 'collaborate on API design' };

      const result = await chatManager.handleChatRequest(
        'team',
        teamRequest,
        mockContext,
        mockResponseStream,
        mockToken
      );

      expect(mockConversationStore.createThread).toHaveBeenCalled();
      expect(mockMCPClient.sendAIToAIMessage).toHaveBeenCalled();
      expect(result.metadata.command).toContain('team');
    });
  });

  describe('Agent Status Management', () => {
    it('should track agent statuses', () => {
      const statuses = chatManager.getAgentStatuses();

      expect(statuses.size).toBeGreaterThan(0);
      expect(statuses.has('claude-research')).toBeTruthy();
      expect(statuses.has('kiro')).toBeTruthy();
      expect(statuses.has('copilot')).toBeTruthy();
    });

    it('should update agent status when handling request', async () => {
      let statusUpdates = 0;
      chatManager.onStatusUpdate(() => statusUpdates++);

      await chatManager.handleChatRequest(
        'claude-research',
        mockRequest,
        mockContext,
        mockResponseStream,
        mockToken
      );

      expect(statusUpdates).toBeGreaterThan(0);
    });

    it('should return correct status indicators', () => {
      const idleIndicator = chatManager.getStatusIndicator('claude-research');
      expect(['💤', '🤔', '💬', '🤝', '⚠️', '🤖']).toContain(idleIndicator);
    });
  });

  describe('Cross-Agent Context Sharing', () => {
    it('should share context between agents', () => {
      const contextId = chatManager.shareContext({
        sourcePersona: 'claude-research',
        targetPersonas: ['kiro'],
        contextType: 'insight',
        title: 'Test Insight',
        content: 'This is a test insight',
        priority: 'medium'
      });

      expect(contextId).toBeTruthy();
      expect(contextId).toContain('ctx-');
    });

    it('should retrieve relevant context for an agent', () => {
      chatManager.shareContext({
        sourcePersona: 'claude-research',
        targetPersonas: ['kiro'],
        contextType: 'finding',
        title: 'Test Finding',
        content: 'Important finding',
        priority: 'high'
      });

      const contexts = chatManager.getRelevantContext('kiro');
      expect(contexts.length).toBeGreaterThan(0);
      expect(contexts[0].title).toBe('Test Finding');
    });

    it('should find experts for specific topics', () => {
      const debugExperts = chatManager.findExpertFor('debugging');
      expect(debugExperts).toContain('kiro');

      const analysisExperts = chatManager.findExpertFor('analysis');
      expect(analysisExperts).toContain('claude-research');
    });

    it('should track collaboration history', () => {
      chatManager.addCollaborationOutcome(
        ['claude-research', 'kiro'],
        'API Design',
        'Agreed on REST architecture with versioning'
      );

      // This would need a getter method to test properly
      // For now, just ensure it doesn't throw
      expect(() => chatManager.addCollaborationOutcome(
        ['copilot', 'team'],
        'Test Topic',
        'Test Outcome'
      )).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle MCP client errors gracefully', async () => {
      mockMCPClient.contribute.mockRejectedValue(new Error('Connection failed'));

      const result = await chatManager.handleChatRequest(
        'claude-research',
        mockRequest,
        mockContext,
        mockResponseStream,
        mockToken
      );

      expect(mockResponseStream.markdown).toHaveBeenCalledWith(
        expect.stringContaining('⚠️')
      );
      expect(result.metadata.command).toContain('error');
    });

    it('should prevent conversation depth overflow', async () => {
      // Simulate deep conversation by manipulating activeConversations
      const deepRequest = { ...mockRequest, prompt: 'test deep conversation' };

      // Make multiple recursive calls to hit the depth limit
      for (let i = 0; i < 6; i++) {
        await chatManager.handleChatRequest(
          'claude-research',
          deepRequest,
          mockContext,
          mockResponseStream,
          mockToken
        );
      }

      // Should see depth limit warning
      expect(mockResponseStream.markdown).toHaveBeenCalledWith(
        expect.stringContaining('depth limit')
      );
    });
  });

  describe('Response Streaming', () => {
    it('should chunk responses when configured', async () => {
      const longResponse = 'a'.repeat(10000);
      mockMCPClient.contribute.mockResolvedValue(longResponse);

      await chatManager.handleChatRequest(
        'claude-research',
        mockRequest,
        mockContext,
        mockResponseStream,
        mockToken
      );

      // Markdown should be called multiple times for chunking
      expect(mockResponseStream.markdown.mock.calls.length).toBeGreaterThan(2);
    });
  });
});