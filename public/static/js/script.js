// WormGPT Pro - WebUI JavaScript
class WormGPTApp {
    constructor() {
        this.currentConversationId = null;
        this.isStreaming = false;
        this.isTyping = false;
        this.conversations = [];
        this.config = {};
        this.streamController = null;
        
        this.initializeApp();
    }

    async initializeApp() {
        this.cacheElements();
        this.bindEvents();
        await this.loadConfig();
        await this.loadConversations();
        this.updateUI();
        
        // Check for existing conversation in URL
        const urlParams = new URLSearchParams(window.location.search);
        const convId = urlParams.get('conversation');
        if (convId) {
            await this.loadConversation(convId);
        }
    }

    cacheElements() {
        // Sidebar elements
        this.sidebar = document.getElementById('sidebar');
        this.menuToggle = document.getElementById('menuToggle');
        this.newChatBtn = document.getElementById('newChatBtn');
        this.conversationList = document.getElementById('conversationList');
        
        // Chat elements
        this.chatMessages = document.getElementById('chatMessages');
        this.inputBox = document.getElementById('inputBox');
        this.sendBtn = document.getElementById('sendBtn');
        this.clearBtn = document.getElementById('clearBtn');
        
        // Header elements
        this.currentConversationTitle = document.getElementById('currentConversationTitle');
        this.modelBadge = document.getElementById('modelBadge');
        this.messageCount = document.getElementById('messageCount');
        this.modelSelect = document.getElementById('modelSelect');
        this.exportBtn = document.getElementById('exportBtn');
        this.deleteBtn = document.getElementById('deleteBtn');
        
        // Settings modal
        this.settingsBtn = document.getElementById('settingsBtn');
        this.settingsModal = document.getElementById('settingsModal');
        this.closeSettingsBtn = document.getElementById('closeSettingsBtn');
        this.cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
        this.saveSettingsBtn = document.getElementById('saveSettingsBtn');
        
        // Settings form elements
        this.apiKeyInput = document.getElementById('apiKey');
        this.settingsModelSelect = document.getElementById('settingsModel');
        this.temperatureSlider = document.getElementById('temperature');
        this.topPSlider = document.getElementById('topP');
        this.maxTokensInput = document.getElementById('maxTokens');
        this.maxHistoryInput = document.getElementById('maxHistory');
        this.darkModeCheckbox = document.getElementById('darkMode');
        this.autoSaveCheckbox = document.getElementById('autoSave');
        this.autoScrollCheckbox = document.getElementById('autoScroll');
        this.tempValue = document.getElementById('tempValue');
        this.topPValue = document.getElementById('topPValue');
        
        // Other UI elements
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.toastContainer = document.getElementById('toastContainer');
        this.promptButtons = document.querySelectorAll('.prompt-btn');
    }

    bindEvents() {
        // Chat input events
        this.inputBox.addEventListener('keydown', (e) => this.handleInputKeydown(e));
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.clearBtn.addEventListener('click', () => this.clearCurrentChat());
        
        // Sidebar events
        this.menuToggle.addEventListener('click', () => this.toggleSidebar());
        this.newChatBtn.addEventListener('click', () => this.createNewConversation());
        
        // Conversation management
        this.modelSelect.addEventListener('change', (e) => this.changeModel(e.target.value));
        this.exportBtn.addEventListener('click', () => this.exportConversation());
        this.deleteBtn.addEventListener('click', () => this.deleteConversation());
        
        // Settings events
        this.settingsBtn.addEventListener('click', () => this.openSettings());
        this.closeSettingsBtn.addEventListener('click', () => this.closeSettings());
        this.cancelSettingsBtn.addEventListener('click', () => this.closeSettings());
        this.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
        
        // Settings form events
        this.temperatureSlider.addEventListener('input', (e) => {
            this.tempValue.textContent = e.target.value;
        });
        
        this.topPSlider.addEventListener('input', (e) => {
            this.topPValue.textContent = e.target.value;
        });
        
        // Prompt buttons
        this.promptButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const prompt = e.target.dataset.prompt || e.target.closest('.prompt-btn').dataset.prompt;
                this.inputBox.textContent = prompt;
                this.inputBox.focus();
            });
        });
        
        // Handle clicks outside sidebar on mobile
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 && 
                !this.sidebar.contains(e.target) && 
                !this.menuToggle.contains(e.target) && 
                this.sidebar.classList.contains('active')) {
                this.sidebar.classList.remove('active');
            }
        });
        
        // Handle window resize
        window.addEventListener('resize', () => {
            if (window.innerWidth > 768) {
                this.sidebar.classList.remove('active');
            }
        });
    }

    async loadConfig() {
        try {
            const response = await fetch('/api/config');
            if (response.ok) {
                this.config = await response.json();
                this.updateSettingsForm();
                this.showToast('Configuration loaded', 'success');
            }
        } catch (error) {
            console.error('Failed to load config:', error);
            this.showToast('Failed to load configuration', 'error');
        }
    }

    async loadConversations() {
        try {
            const response = await fetch('/api/conversations');
            if (response.ok) {
                this.conversations = await response.json();
                this.renderConversationList();
            }
        } catch (error) {
            console.error('Failed to load conversations:', error);
        }
    }

    async loadConversation(conversationId) {
        if (!conversationId) return;
        
        this.showLoading(true);
        
        try {
            const response = await fetch(`/api/conversation/${conversationId}`);
            if (response.ok) {
                const conversation = await response.json();
                this.currentConversationId = conversationId;
                this.renderMessages(conversation.messages);
                this.updateConversationHeader(conversation);
                
                // Update URL
                const url = new URL(window.location);
                url.searchParams.set('conversation', conversationId);
                window.history.pushState({}, '', url);
                
                this.showToast('Conversation loaded', 'success');
            } else {
                this.showToast('Failed to load conversation', 'error');
            }
        } catch (error) {
            console.error('Failed to load conversation:', error);
            this.showToast('Failed to load conversation', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async createNewConversation() {
        try {
            this.showLoading(true);
            
            // Create new conversation via API
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: '',
                    model: this.config.model || 'deepseek-chat'
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                this.currentConversationId = data.conversation_id;
                
                // Clear chat messages and show welcome
                this.chatMessages.innerHTML = `
                    <div class="welcome-container">
                        <div class="welcome-card">
                            <div class="welcome-icon">
                                <i class="fas fa-robot"></i>
                            </div>
                            <h1>New Conversation Started</h1>
                            <p class="welcome-subtitle">Start chatting with WormGPT Pro</p>
                        </div>
                    </div>
                `;
                
                this.updateConversationHeader({
                    title: 'New Conversation',
                    model: this.config.model || 'deepseek-chat',
                    message_count: 0
                });
                
                // Update URL
                const url = new URL(window.location);
                url.searchParams.set('conversation', this.currentConversationId);
                window.history.pushState({}, '', url);
                
                // Reload conversations
                await this.loadConversations();
                
                this.showToast('New conversation created', 'success');
                this.inputBox.focus();
            }
        } catch (error) {
            console.error('Failed to create conversation:', error);
            this.showToast('Failed to create conversation', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async sendMessage() {
        const message = this.inputBox.textContent.trim();
        if (!message || this.isStreaming) return;
        
        this.isStreaming = true;
        this.sendBtn.disabled = true;
        
        // Clear input
        this.inputBox.textContent = '';
        
        // Add user message to chat
        this.addMessage('user', message);
        
        // Create or get conversation ID
        if (!this.currentConversationId) {
            await this.createNewConversation();
        }
        
        // Add typing indicator
        const typingIndicator = this.addTypingIndicator();
        
        // Send message to API
        const model = this.modelSelect.value;
        
        try {
            if (this.config.stream !== false) {
                await this.streamResponse(message, model, typingIndicator);
            } else {
                await this.normalResponse(message, model, typingIndicator);
            }
        } catch (error) {
            console.error('Failed to send message:', error);
            this.showToast('Failed to send message', 'error');
            
            // Remove typing indicator
            typingIndicator.remove();
            
            // Add error message
            this.addMessage('assistant', 'Sorry, I encountered an error. Please try again.');
        } finally {
            this.isStreaming = false;
            this.sendBtn.disabled = false;
            this.scrollToBottom();
        }
    }

    async streamResponse(message, model, typingIndicator) {
        return new Promise((resolve, reject) => {
            const url = new URL('/api/chat/stream', window.location.origin);
            url.searchParams.append('message', message);
            url.searchParams.append('conversation_id', this.currentConversationId);
            if (model) {
                url.searchParams.append('model', model);
            }
            
            const eventSource = new EventSource(url.toString());
            let fullResponse = '';
            let responseElement = null;
            
            eventSource.onmessage = (event) => {
                if (event.data === '[DONE]') {
                    eventSource.close();
                    typingIndicator.remove();
                    
                    // Update conversation list
                    this.loadConversations();
                    
                    resolve();
                    return;
                }
                
                try {
                    const data = JSON.parse(event.data);
                    
                    if (data.error) {
                        eventSource.close();
                        typingIndicator.remove();
                        this.addMessage('assistant', `Error: ${data.error}`);
                        reject(new Error(data.error));
                        return;
                    }
                    
                    if (data.content) {
                        if (!responseElement) {
                            typingIndicator.remove();
                            responseElement = this.addMessage('assistant', data.content);
                            fullResponse = data.content;
                        } else {
                            fullResponse += data.content;
                            responseElement.querySelector('.message-text').textContent = fullResponse;
                            this.formatMessageText(responseElement.querySelector('.message-text'));
                        }
                        
                        this.scrollToBottom();
                    }
                } catch (error) {
                    console.error('Error parsing stream data:', error);
                }
            };
            
            eventSource.onerror = (error) => {
                eventSource.close();
                typingIndicator.remove();
                reject(error);
            };
            
            this.streamController = eventSource;
        });
    }

    async normalResponse(message, model, typingIndicator) {
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: message,
                    conversation_id: this.currentConversationId,
                    model: model
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                typingIndicator.remove();
                this.addMessage('assistant', data.response);
                
                // Update conversation list
                this.loadConversations();
            } else {
                throw new Error('Failed to get response');
            }
        } catch (error) {
            throw error;
        }
    }

    addMessage(role, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message';
        
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        messageDiv.innerHTML = `
            <div class="avatar-container ${role}-avatar">
                <i class="fas ${role === 'user' ? 'fa-user' : 'fa-robot'}"></i>
            </div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-role">${role === 'user' ? 'You' : 'WormGPT'}</span>
                    <span class="message-time">${timestamp}</span>
                </div>
                <div class="message-text">${this.escapeHtml(content)}</div>
            </div>
        `;
        
        this.chatMessages.appendChild(messageDiv);
        this.formatMessageText(messageDiv.querySelector('.message-text'));
        this.scrollToBottom();
        
        // Update message count
        if (this.currentConversationId) {
            this.messageCount.textContent = `${this.chatMessages.querySelectorAll('.message').length} messages`;
        }
        
        return messageDiv;
    }

    addTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message';
        typingDiv.innerHTML = `
            <div class="avatar-container assistant-avatar">
                <i class="fas fa-robot"></i>
            </div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-role">WormGPT</span>
                </div>
                <div class="typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
        `;
        
        this.chatMessages.appendChild(typingDiv);
        this.scrollToBottom();
        
        return typingDiv;
    }

    renderMessages(messages) {
        this.chatMessages.innerHTML = '';
        
        if (!messages || messages.length === 0) {
            // Show welcome screen if no messages
            this.chatMessages.innerHTML = `
                <div class="welcome-container">
                    <div class="welcome-card">
                        <div class="welcome-icon">
                            <i class="fas fa-robot"></i>
                        </div>
                        <h1>Conversation Loaded</h1>
                        <p class="welcome-subtitle">Continue your conversation with WormGPT Pro</p>
                    </div>
                </div>
            `;
            return;
        }
        
        messages.forEach(message => {
            this.addMessage(message.role, message.content);
        });
    }

    renderConversationList() {
        if (!this.conversations || this.conversations.length === 0) {
            this.conversationList.innerHTML = `
                <div class="no-conversations">
                    <i class="fas fa-comments"></i>
                    <p>No conversations yet</p>
                </div>
            `;
            return;
        }
        
        this.conversationList.innerHTML = '';
        
        this.conversations.forEach(conv => {
            const convElement = document.createElement('div');
            convElement.className = `conversation-item ${this.currentConversationId === conv.id ? 'active' : ''}`;
            convElement.dataset.id = conv.id;
            
            const date = new Date(conv.updated_at);
            const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            convElement.innerHTML = `
                <div class="conversation-icon">
                    <i class="fas fa-message"></i>
                </div>
                <div class="conversation-content">
                    <div class="conversation-title">${this.escapeHtml(conv.title)}</div>
                    <div class="conversation-meta">
                        <span>${timeString}</span>
                        <span>${conv.message_count} messages</span>
                    </div>
                </div>
            `;
            
            convElement.addEventListener('click', () => this.loadConversation(conv.id));
            
            this.conversationList.appendChild(convElement);
        });
    }

    updateConversationHeader(conversation) {
        if (conversation.title) {
            this.currentConversationTitle.textContent = conversation.title;
        }
        
        if (conversation.model) {
            this.modelBadge.textContent = conversation.model;
            this.modelSelect.value = conversation.model;
        }
        
        if (conversation.message_count !== undefined) {
            this.messageCount.textContent = `${conversation.message_count} messages`;
        }
    }

    updateUI() {
        // Update token and memory info
        const tokenInfo = document.getElementById('tokenInfo');
        const memoryInfo = document.getElementById('memoryInfo');
        
        if (this.config.max_tokens === 0) {
            tokenInfo.innerHTML = '<i class="fas fa-infinity"></i> Unlimited Tokens';
        } else if (this.config.max_tokens) {
            tokenInfo.innerHTML = `<i class="fas fa-tachometer-alt"></i> ${this.config.max_tokens} tokens`;
        }
        
        if (this.config.max_history === 0) {
            memoryInfo.innerHTML = '<i class="fas fa-memory"></i> Unlimited Memory';
        } else if (this.config.max_history) {
            memoryInfo.innerHTML = `<i class="fas fa-history"></i> ${this.config.max_history} messages`;
        }
    }

    updateSettingsForm() {
        if (this.config.api_key) {
            this.apiKeyInput.value = this.config.api_key;
        }
        
        if (this.config.model) {
            this.settingsModelSelect.value = this.config.model;
            this.modelSelect.value = this.config.model;
        }
        
        if (this.config.temperature !== undefined) {
            this.temperatureSlider.value = this.config.temperature;
            this.tempValue.textContent = this.config.temperature;
        }
        
        if (this.config.top_p !== undefined) {
            this.topPSlider.value = this.config.top_p;
            this.topPValue.textContent = this.config.top_p;
        }
        
        if (this.config.max_tokens !== undefined) {
            this.maxTokensInput.value = this.config.max_tokens;
        }
        
        if (this.config.max_history !== undefined) {
            this.maxHistoryInput.value = this.config.max_history;
        }
        
        if (this.config.dark_mode !== undefined) {
            this.darkModeCheckbox.checked = this.config.dark_mode;
        }
        
        if (this.config.auto_save !== undefined) {
            this.autoSaveCheckbox.checked = this.config.auto_save;
        }
        
        if (this.config.auto_scroll !== undefined) {
            this.autoScrollCheckbox.checked = this.config.auto_scroll;
        }
    }

    async saveSettings() {
        const settings = {
            api_key: this.apiKeyInput.value,
            model: this.settingsModelSelect.value,
            temperature: parseFloat(this.temperatureSlider.value),
            top_p: parseFloat(this.topPSlider.value),
            max_tokens: parseInt(this.maxTokensInput.value) || 0,
            max_history: parseInt(this.maxHistoryInput.value) || 0,
            dark_mode: this.darkModeCheckbox.checked,
            auto_save: this.autoSaveCheckbox.checked,
            auto_scroll: this.autoScrollCheckbox.checked
        };
        
        try {
            const response = await fetch('/api/update_config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(settings)
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    this.config = { ...this.config, ...settings };
                    this.updateUI();
                    this.closeSettings();
                    this.showToast('Settings saved successfully', 'success');
                } else {
                    this.showToast(`Failed to save settings: ${result.error}`, 'error');
                }
            } else {
                this.showToast('Failed to save settings', 'error');
            }
        } catch (error) {
            console.error('Failed to save settings:', error);
            this.showToast('Failed to save settings', 'error');
        }
    }

    async changeModel(model) {
        try {
            const response = await fetch('/api/update_config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model
                })
            });
            
            if (response.ok) {
                this.config.model = model;
                this.modelBadge.textContent = model;
                this.showToast(`Model changed to ${model}`, 'success');
            }
        } catch (error) {
            console.error('Failed to change model:', error);
            this.showToast('Failed to change model', 'error');
        }
    }

    async exportConversation() {
        if (!this.currentConversationId) {
            this.showToast('No conversation to export', 'warning');
            return;
        }
        
        try {
            const response = await fetch(`/api/export/${this.currentConversationId}?format=json`);
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `wormgpt_conversation_${this.currentConversationId}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                
                this.showToast('Conversation exported', 'success');
            }
        } catch (error) {
            console.error('Failed to export conversation:', error);
            this.showToast('Failed to export conversation', 'error');
        }
    }

    async deleteConversation() {
        if (!this.currentConversationId) {
            this.showToast('No conversation to delete', 'warning');
            return;
        }
        
        if (!confirm('Are you sure you want to delete this conversation? This action cannot be undone.')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/conversation/${this.currentConversationId}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                this.showToast('Conversation deleted', 'success');
                this.currentConversationId = null;
                this.createNewConversation();
                this.loadConversations();
            }
        } catch (error) {
            console.error('Failed to delete conversation:', error);
            this.showToast('Failed to delete conversation', 'error');
        }
    }

    clearCurrentChat() {
        if (!this.currentConversationId) return;
        
        if (confirm('Clear all messages in this chat?')) {
            this.chatMessages.innerHTML = `
                <div class="welcome-container">
                    <div class="welcome-card">
                        <div class="welcome-icon">
                            <i class="fas fa-robot"></i>
                        </div>
                        <h1>Chat Cleared</h1>
                        <p class="welcome-subtitle">Start a new conversation</p>
                    </div>
                </div>
            `;
            
            this.messageCount.textContent = '0 messages';
            this.showToast('Chat cleared', 'success');
        }
    }

    // UI Helper Methods
    toggleSidebar() {
        this.sidebar.classList.toggle('active');
    }

    openSettings() {
        this.settingsModal.classList.add('active');
    }

    closeSettings() {
        this.settingsModal.classList.remove('active');
        this.updateSettingsForm(); // Reset form to current config
    }

    showLoading(show) {
        if (show) {
            this.loadingOverlay.classList.add('active');
        } else {
            this.loadingOverlay.classList.remove('active');
        }
    }

    showToast(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        
        toast.innerHTML = `
            <div class="toast-icon">
                <i class="fas ${icons[type] || icons.info}"></i>
            </div>
            <div class="toast-content">
                <div class="toast-title">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
                <div class="toast-message">${message}</div>
            </div>
        `;
        
        this.toastContainer.appendChild(toast);
        
        // Auto remove after duration
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    scrollToBottom() {
        if (this.config.auto_scroll !== false) {
            this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        }
    }

    formatMessageText(element) {
        // Simple markdown formatting
        let text = element.innerHTML;
        
        // Code blocks
        text = text.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
            const language = lang || '';
            return `<pre><code class="language-${language}">${this.escapeHtml(code)}</code></pre>`;
        });
        
        // Inline code
        text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Bold
        text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        
        // Italic
        text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        
        // Links
        text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
        
        // Lists
        text = text.replace(/^- (.+)$/gm, '<li>$1</li>');
        text = text.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
        
        // Headers
        text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        text = text.replace(/^# (.+)$/gm, '<h1>$1</h1>');
        
        // Paragraphs
        text = text.replace(/\n\n/g, '</p><p>');
        text = '<p>' + text + '</p>';
        
        element.innerHTML = text;
        
        // Highlight code if Highlight.js is available
        if (window.hljs) {
            element.querySelectorAll('pre code').forEach(block => {
                hljs.highlightElement(block);
            });
        }
    }

    handleInputKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.sendMessage();
        }
        
        // Auto-resize textarea
        if (e.key === 'Enter' && e.shiftKey) {
            // Allow normal enter behavior for Shift+Enter
            setTimeout(() => {
                this.inputBox.style.height = 'auto';
                this.inputBox.style.height = Math.min(this.inputBox.scrollHeight, 200) + 'px';
            }, 0);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.wormGPTApp = new WormGPTApp();
});
