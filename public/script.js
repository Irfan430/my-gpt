class WormGPT {
    constructor() {
        this.currentConversationId = null;
        this.isStreaming = false;
        this.eventSource = null;
        this.config = {};
        this.initialize();
    }

    async initialize() {
        // Load configuration
        await this.loadConfig();
        
        // Load conversations
        await this.loadConversations();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Auto-resize textarea
        this.setupTextareaAutoResize();
        
        // Show welcome message
        this.updateChatTitle('New Chat');
        
        // Update token count
        this.updateTokenCount();
    }

    async loadConfig() {
        try {
            const response = await fetch('/api/config');
            this.config = await response.json();
            
            // Update UI with config
            document.getElementById('apiKey').value = this.config.api_key || '';
            document.getElementById('baseUrl').value = this.config.base_url || 'https://api.deepseek.com';
            document.getElementById('temperature').value = this.config.temperature || 0.7;
            document.getElementById('tempValue').textContent = this.config.temperature || 0.7;
            document.getElementById('topP').value = this.config.top_p || 0.9;
            document.getElementById('topPValue').textContent = this.config.top_p || 0.9;
            document.getElementById('contextWindow').value = this.config.context_window || 128000;
            document.getElementById('ctxValue').textContent = this.config.context_window || 128000;
            document.getElementById('maxTokens').value = this.config.max_output_tokens || 64000;
            document.getElementById('maxTokensValue').textContent = this.config.max_output_tokens || 64000;
            document.getElementById('modelSelect').value = this.config.model || 'deepseek-chat';
            document.getElementById('themeSelect').value = this.config.dark_mode ? 'dark' : 'light';
            document.getElementById('autoSave').checked = this.config.auto_save !== false;
            
            // Apply theme
            this.applyTheme(this.config.dark_mode ? 'dark' : 'light');
            
            // Update model info
            document.getElementById('modelInfo').textContent = `Model: ${this.config.model || 'DeepSeek Chat'}`;
            
        } catch (error) {
            console.error('Failed to load config:', error);
        }
    }

    async loadConversations() {
        try {
            const response = await fetch('/api/conversations');
            const conversations = await response.json();
            this.renderConversations(conversations);
        } catch (error) {
            console.error('Failed to load conversations:', error);
        }
    }

    renderConversations(conversations) {
        const container = document.getElementById('conversationsList');
        container.innerHTML = '';
        
        conversations.forEach(conv => {
            const date = new Date(conv.updated_at);
            const timeString = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            const convElement = document.createElement('div');
            convElement.className = 'conversation-item';
            convElement.dataset.id = conv.id;
            
            convElement.innerHTML = `
                <div class="conversation-icon">
                    <i class="fas fa-comment"></i>
                </div>
                <div class="conversation-title" title="${conv.title}">
                    ${conv.title}
                </div>
                <div class="conversation-time">
                    ${timeString}
                </div>
            `;
            
            convElement.addEventListener('click', () => this.loadConversation(conv.id));
            container.appendChild(convElement);
        });
    }

    async loadConversation(conversationId) {
        try {
            const response = await fetch(`/api/conversation/${conversationId}`);
            if (!response.ok) {
                throw new Error('Conversation not found');
            }
            
            const conversation = await response.json();
            this.currentConversationId = conversationId;
            
            // Update chat title
            this.updateChatTitle(conversation.title);
            
            // Clear messages container
            const messagesContainer = document.getElementById('messagesContainer');
            messagesContainer.innerHTML = '';
            
            // Render messages
            conversation.messages.forEach(message => {
                this.renderMessage(message);
            });
            
            // Update stats
            document.getElementById('messageCount').textContent = `Messages: ${conversation.messages.length}`;
            document.getElementById('tokenCount').textContent = `Tokens: ${conversation.token_count || 0}`;
            
            // Mark as active in sidebar
            document.querySelectorAll('.conversation-item').forEach(item => {
                item.classList.remove('active');
                if (item.dataset.id === conversationId) {
                    item.classList.add('active');
                }
            });
            
            // Scroll to bottom
            this.scrollToBottom();
            
        } catch (error) {
            console.error('Failed to load conversation:', error);
            this.showToast('Failed to load conversation', 'error');
        }
    }

    async sendMessage(message) {
        if (!message.trim() || this.isStreaming) return;
        
        // Clear welcome message if this is the first message
        const welcomeMessage = document.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.style.display = 'none';
        }
        
        // Create new conversation if none exists
        if (!this.currentConversationId) {
            await this.createNewConversation();
        }
        
        // Render user message
        this.renderMessage({
            role: 'user',
            content: message,
            timestamp: new Date().toISOString()
        });
        
        // Clear input
        document.getElementById('messageInput').value = '';
        this.updateCharCount();
        
        // Show typing indicator
        this.showTypingIndicator();
        
        // Get selected model
        const model = document.getElementById('modelSelect').value;
        
        // Send message to API
        this.isStreaming = true;
        this.disableInput();
        
        try {
            const response = await fetch(`/api/chat/stream?message=${encodeURIComponent(message)}&conversation_id=${this.currentConversationId}&model=${model}`);
            
            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }
            
            // Hide typing indicator
            this.hideTypingIndicator();
            
            // Create assistant message element
            const messageId = `msg_${Date.now()}`;
            const assistantMessage = this.createAssistantMessageElement(messageId);
            
            // Process stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullResponse = '';
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.slice(6);
                        if (dataStr === '[DONE]') {
                            break;
                        }
                        
                        try {
                            const data = JSON.parse(dataStr);
                            
                            if (data.error) {
                                assistantMessage.querySelector('.message-content').innerHTML = `
                                    <div class="error-message">
                                        <i class="fas fa-exclamation-triangle"></i>
                                        ${data.error}
                                    </div>
                                `;
                                break;
                            }
                            
                            if (data.content) {
                                fullResponse += data.content;
                                this.updateMessageContent(messageId, fullResponse);
                            }
                        } catch (e) {
                            console.error('Failed to parse SSE data:', e);
                        }
                    }
                }
            }
            
            // Add timestamp
            const timestamp = new Date().toISOString();
            assistantMessage.dataset.timestamp = timestamp;
            
            // Update conversation stats
            await this.updateConversationStats();
            
        } catch (error) {
            console.error('Failed to send message:', error);
            this.hideTypingIndicator();
            this.renderMessage({
                role: 'assistant',
                content: `Error: ${error.message}`,
                timestamp: new Date().toISOString()
            });
        } finally {
            this.isStreaming = false;
            this.enableInput();
            this.scrollToBottom();
        }
    }

    createAssistantMessageElement(id) {
        const messagesContainer = document.getElementById('messagesContainer');
        const messageDiv = document.createElement('div');
        messageDiv.id = id;
        messageDiv.className = 'message assistant';
        messageDiv.innerHTML = `
            <div class="message-avatar">
                <i class="fas fa-robot"></i>
            </div>
            <div class="message-content">
                <div class="message-text"></div>
                <div class="message-timestamp"></div>
            </div>
        `;
        messagesContainer.appendChild(messageDiv);
        return messageDiv;
    }

    updateMessageContent(messageId, content) {
        const messageElement = document.getElementById(messageId);
        if (!messageElement) return;
        
        const messageText = messageElement.querySelector('.message-text');
        const messageTimestamp = messageElement.querySelector('.message-timestamp');
        
        // Format code blocks
        let formattedContent = this.formatMessageContent(content);
        messageText.innerHTML = formattedContent;
        
        // Update timestamp
        if (messageElement.dataset.timestamp) {
            const date = new Date(messageElement.dataset.timestamp);
            messageTimestamp.textContent = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        }
        
        // Highlight code blocks
        this.highlightCodeBlocks(messageElement);
        
        // Scroll to this message
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }

    formatMessageContent(content) {
        // Convert markdown-like syntax to HTML
        let formatted = content
            .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
            .replace(/\n/g, '<br>');
        
        return formatted;
    }

    highlightCodeBlocks(messageElement) {
        const codeBlocks = messageElement.querySelectorAll('pre code');
        codeBlocks.forEach(block => {
            // Simple syntax highlighting
            const lang = block.className.replace('language-', '');
            if (lang) {
                block.classList.add(lang);
            }
        });
    }

    renderMessage(message) {
        const messagesContainer = document.getElementById('messagesContainer');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${message.role}`;
        
        const date = new Date(message.timestamp);
        const timeString = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        let content = message.content;
        if (message.role === 'user') {
            content = content.replace(/\n/g, '<br>');
        } else {
            content = this.formatMessageContent(content);
        }
        
        messageDiv.innerHTML = `
            <div class="message-avatar">
                <i class="fas ${message.role === 'user' ? 'fa-user' : 'fa-robot'}"></i>
            </div>
            <div class="message-content">
                <div class="message-text">${content}</div>
                <div class="message-timestamp">${timeString}</div>
            </div>
        `;
        
        messagesContainer.appendChild(messageDiv);
        
        // Highlight code blocks for assistant messages
        if (message.role === 'assistant') {
            this.highlightCodeBlocks(messageDiv);
        }
        
        this.scrollToBottom();
    }

    async createNewConversation() {
        try {
            const response = await fetch(`/api/chat/stream?message=${encodeURIComponent('New conversation')}&conversation_id=`, {
                method: 'GET'
            });
            
            // Extract conversation ID from URL
            const urlParams = new URLSearchParams(response.url.split('?')[1]);
            this.currentConversationId = urlParams.get('conversation_id');
            
            if (this.currentConversationId) {
                await this.loadConversations();
                this.updateChatTitle('New Chat');
                this.clearChatMessages();
                this.showToast('New conversation created', 'success');
            }
        } catch (error) {
            console.error('Failed to create conversation:', error);
        }
    }

    clearChatMessages() {
        const messagesContainer = document.getElementById('messagesContainer');
        messagesContainer.innerHTML = '';
        
        // Show welcome message
        const welcomeMessage = document.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.style.display = 'block';
        }
        
        // Update stats
        document.getElementById('messageCount').textContent = 'Messages: 0';
        document.getElementById('tokenCount').textContent = 'Tokens: 0';
    }

    showTypingIndicator() {
        const streamingMessage = document.getElementById('streamingMessage');
        streamingMessage.style.display = 'flex';
        this.scrollToBottom();
    }

    hideTypingIndicator() {
        const streamingMessage = document.getElementById('streamingMessage');
        streamingMessage.style.display = 'none';
    }

    disableInput() {
        document.getElementById('messageInput').disabled = true;
        document.getElementById('sendBtn').disabled = true;
    }

    enableInput() {
        document.getElementById('messageInput').disabled = false;
        document.getElementById('sendBtn').disabled = false;
        document.getElementById('messageInput').focus();
    }

    scrollToBottom() {
        const chatContainer = document.getElementById('chatContainer');
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    updateChatTitle(title) {
        document.getElementById('chatTitle').textContent = title || 'New Chat';
    }

    async updateConversationStats() {
        if (!this.currentConversationId) return;
        
        try {
            const response = await fetch(`/api/conversation/${this.currentConversationId}`);
            const conversation = await response.json();
            
            document.getElementById('messageCount').textContent = `Messages: ${conversation.messages.length}`;
            document.getElementById('tokenCount').textContent = `Tokens: ${conversation.token_count || 0}`;
        } catch (error) {
            console.error('Failed to update stats:', error);
        }
    }

    updateCharCount() {
        const textarea = document.getElementById('messageInput');
        const charCount = document.getElementById('charCount');
        const estTokens = document.getElementById('estTokens');
        
        const chars = textarea.value.length;
        const tokens = Math.ceil(chars / 4);
        
        charCount.textContent = `${chars} chars`;
        estTokens.textContent = `${tokens} tokens`;
    }

    setupTextareaAutoResize() {
        const textarea = document.getElementById('messageInput');
        
        textarea.addEventListener('input', () => {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
            this.updateCharCount();
        });
        
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSendMessage();
            }
        });
    }

    handleSendMessage() {
        const messageInput = document.getElementById('messageInput');
        const message = messageInput.value.trim();
        
        if (message) {
            this.sendMessage(message);
        }
    }

    setupEventListeners() {
        // Send button
        document.getElementById('sendBtn').addEventListener('click', () => this.handleSendMessage());
        
        // New chat button
        document.getElementById('newChatBtn').addEventListener('click', () => this.createNewConversation());
        
        // Clear chat button
        document.getElementById('clearChatBtn').addEventListener('click', () => {
            if (confirm('Clear all messages in this chat?')) {
                this.clearChatMessages();
            }
        });
        
        // Export chat button
        document.getElementById('exportChatBtn').addEventListener('click', () => {
            this.showExportModal();
        });
        
        // Settings buttons
        document.getElementById('settingsBtn').addEventListener('click', () => this.showSettingsModal());
        document.getElementById('settingsMenuBtn').addEventListener('click', () => this.showSettingsModal());
        
        // Settings modal
        document.getElementById('closeSettings').addEventListener('click', () => this.hideSettingsModal());
        document.getElementById('cancelSettings').addEventListener('click', () => this.hideSettingsModal());
        document.getElementById('saveSettings').addEventListener('click', () => this.saveSettings());
        
        // Export modal
        document.getElementById('closeExport').addEventListener('click', () => this.hideExportModal());
        
        // Range inputs
        document.getElementById('temperature').addEventListener('input', (e) => {
            document.getElementById('tempValue').textContent = e.target.value;
        });
        
        document.getElementById('topP').addEventListener('input', (e) => {
            document.getElementById('topPValue').textContent = e.target.value;
        });
        
        document.getElementById('contextWindow').addEventListener('input', (e) => {
            document.getElementById('ctxValue').textContent = e.target.value;
        });
        
        document.getElementById('maxTokens').addEventListener('input', (e) => {
            document.getElementById('maxTokensValue').textContent = e.target.value;
        });
        
        // Theme selector
        document.getElementById('themeSelect').addEventListener('change', (e) => {
            this.applyTheme(e.target.value);
        });
        
        // Export options
        document.querySelectorAll('.export-option').forEach(option => {
            option.addEventListener('click', (e) => {
                const format = e.currentTarget.dataset.format;
                this.exportConversation(format);
            });
        });
        
        // Model selector
        document.getElementById('modelSelect').addEventListener('change', (e) => {
            this.config.model = e.target.value;
            document.getElementById('modelInfo').textContent = `Model: ${e.target.options[e.target.selectedIndex].text}`;
        });
    }

    showSettingsModal() {
        document.getElementById('settingsModal').classList.add('active');
    }

    hideSettingsModal() {
        document.getElementById('settingsModal').classList.remove('active');
    }

    async saveSettings() {
        const settings = {
            api_key: document.getElementById('apiKey').value,
            base_url: document.getElementById('baseUrl').value,
            temperature: parseFloat(document.getElementById('temperature').value),
            top_p: parseFloat(document.getElementById('topP').value),
            context_window: parseInt(document.getElementById('contextWindow').value),
            max_output_tokens: parseInt(document.getElementById('maxTokens').value),
            model: document.getElementById('modelSelect').value,
            dark_mode: document.getElementById('themeSelect').value === 'dark',
            auto_save: document.getElementById('autoSave').checked
        };
        
        try {
            const response = await fetch('/api/update_config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(settings)
            });
            
            const result = await response.json();
            
            if (result.success) {
                await this.loadConfig();
                this.hideSettingsModal();
                this.showToast('Settings saved successfully', 'success');
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Failed to save settings:', error);
            this.showToast(`Failed to save settings: ${error.message}`, 'error');
        }
    }

    showExportModal() {
        document.getElementById('exportModal').classList.add('active');
    }

    hideExportModal() {
        document.getElementById('exportModal').classList.remove('active');
    }

    async exportConversation(format) {
        if (!this.currentConversationId) {
            this.showToast('No conversation to export', 'warning');
            return;
        }
        
        try {
            const response = await fetch(`/api/export/${this.currentConversationId}?format=${format}`);
            
            if (!response.ok) {
                throw new Error('Export failed');
            }
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `conversation_${this.currentConversationId}.${format}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            this.hideExportModal();
            this.showToast('Conversation exported successfully', 'success');
            
        } catch (error) {
            console.error('Export failed:', error);
            this.showToast('Export failed', 'error');
        }
    }

    applyTheme(theme) {
        if (theme === 'auto') {
            theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        
        document.body.classList.toggle('light-mode', theme === 'light');
        document.body.classList.toggle('dark-mode', theme === 'dark');
    }

    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = 'toast';
        toast.classList.add(type);
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    // Estimate tokens (rough estimation)
    estimateTokens(text) {
        return Math.ceil(text.length / 4);
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.wormGPT = new WormGPT();
});

// Auto-focus message input
document.addEventListener('click', () => {
    document.getElementById('messageInput').focus();
});