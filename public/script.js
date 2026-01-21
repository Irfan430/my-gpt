// DOM Elements
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const messagesContainer = document.getElementById('messagesContainer');
const newChatBtn = document.getElementById('newChatBtn');
const conversationsList = document.getElementById('conversationsList');
const modelSelect = document.getElementById('modelSelect');
const settingsModal = document.getElementById('settingsModal');
const settingsBtn = document.getElementById('settingsBtn');
const closeSettingsBtns = document.querySelectorAll('.close-btn, #closeSettingsBtn2');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const apiKeyInput = document.getElementById('apiKeyInput');
const temperatureInput = document.getElementById('temperatureInput');
const temperatureValue = document.getElementById('temperatureValue');
const maxTokensInput = document.getElementById('maxTokensInput');
const darkModeToggle = document.getElementById('darkModeToggle');
const typingIndicator = document.getElementById('typingIndicator');
const clearChatBtn = document.getElementById('clearChatBtn');
const exportChatBtn = document.getElementById('exportChatBtn');
const chatTitle = document.getElementById('chatTitle');

// Global Variables
let currentConversationId = null;
let isStreaming = false;
let config = {};

// Initialize the application
async function init() {
    loadConfig();
    await loadConversations();
    setupEventListeners();
    updateUI();
    
    // Check for existing conversation in URL
    const urlParams = new URLSearchParams(window.location.search);
    const conversationId = urlParams.get('conversation');
    if (conversationId) {
        await loadConversation(conversationId);
    }
}

// Load configuration from server
async function loadConfig() {
    try {
        const response = await fetch('/api/config');
        config = await response.json();
        
        // Update UI with config
        if (config.api_key) {
            apiKeyInput.value = config.api_key;
        }
        if (config.temperature) {
            temperatureInput.value = config.temperature;
            temperatureValue.textContent = config.temperature;
        }
        if (config.max_tokens) {
            maxTokensInput.value = config.max_tokens;
        }
        if (config.model) {
            modelSelect.value = config.model;
        }
        if (config.dark_mode !== undefined) {
            darkModeToggle.checked = config.dark_mode;
            document.body.classList.toggle('light-mode', !config.dark_mode);
        }
    } catch (error) {
        console.error('Failed to load config:', error);
        showError('Failed to load configuration');
    }
}

// Save configuration to server
async function saveConfig() {
    try {
        config.api_key = apiKeyInput.value;
        config.temperature = parseFloat(temperatureInput.value);
        config.max_tokens = parseInt(maxTokensInput.value);
        config.model = modelSelect.value;
        config.dark_mode = darkModeToggle.checked;
        
        const response = await fetch('/api/update_config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        
        const result = await response.json();
        if (result.success) {
            showNotification('Settings saved successfully!');
            settingsModal.classList.remove('show');
        } else {
            throw new Error(result.error || 'Failed to save settings');
        }
    } catch (error) {
        console.error('Failed to save config:', error);
        showError('Failed to save settings: ' + error.message);
    }
}

// Load conversations from server
async function loadConversations() {
    try {
        const response = await fetch('/api/conversations');
        const conversations = await response.json();
        
        conversationsList.innerHTML = '';
        conversations.forEach(conv => {
            const convElement = createConversationElement(conv);
            conversationsList.appendChild(convElement);
        });
    } catch (error) {
        console.error('Failed to load conversations:', error);
        showError('Failed to load conversations');
    }
}

// Create conversation list element
function createConversationElement(conversation) {
    const div = document.createElement('div');
    div.className = 'conversation-item';
    if (conversation.id === currentConversationId) {
        div.classList.add('active');
    }
    
    const title = conversation.title || 'Untitled Conversation';
    const date = new Date(conversation.updated_at).toLocaleDateString();
    
    div.innerHTML = `
        <div class="conversation-title">${escapeHtml(title)}</div>
        <div class="conversation-meta">
            <span>${conversation.message_count || 0} messages</span>
            <span>${date}</span>
        </div>
    `;
    
    div.addEventListener('click', () => loadConversation(conversation.id));
    return div;
}

// Load a specific conversation
async function loadConversation(conversationId) {
    try {
        const response = await fetch(`/api/conversation/${conversationId}`);
        if (!response.ok) {
            if (response.status === 404) {
                await createNewConversation();
                return;
            }
            throw new Error('Failed to load conversation');
        }
        
        const conversation = await response.json();
        currentConversationId = conversation.id;
        
        // Update URL
        const url = new URL(window.location);
        url.searchParams.set('conversation', conversationId);
        window.history.pushState({}, '', url);
        
        // Update UI
        chatTitle.innerHTML = `<i class="fas fa-comments"></i> ${escapeHtml(conversation.title)}`;
        
        // Clear and load messages
        messagesContainer.innerHTML = '';
        if (conversation.messages && conversation.messages.length > 0) {
            conversation.messages.forEach(message => {
                addMessageToUI(message, false);
            });
        } else {
            showWelcomeMessage();
        }
        
        // Update conversation list
        await loadConversations();
        scrollToBottom();
    } catch (error) {
        console.error('Failed to load conversation:', error);
        showError('Failed to load conversation');
    }
}

// Create new conversation
async function createNewConversation() {
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                message: 'Hello',
                model: modelSelect.value 
            })
        });
        
        const result = await response.json();
        if (result.conversation_id) {
            await loadConversation(result.conversation_id);
        }
    } catch (error) {
        console.error('Failed to create conversation:', error);
        showError('Failed to create new conversation');
    }
}

// Send message to server
async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message || isStreaming) return;
    
    // Add user message to UI
    const userMessage = {
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
    };
    addMessageToUI(userMessage, true);
    
    // Clear input
    messageInput.value = '';
    messageInput.style.height = 'auto';
    sendButton.disabled = true;
    
    // Show typing indicator
    typingIndicator.style.display = 'flex';
    isStreaming = true;
    
    try {
        // Prepare URL for streaming
        const params = new URLSearchParams({
            message: message,
            model: modelSelect.value
        });
        
        if (currentConversationId) {
            params.append('conversation_id', currentConversationId);
        }
        
        const response = await fetch(`/api/chat/stream?${params}`);
        
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }
        
        // Process stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let assistantMessage = {
            role: 'assistant',
            content: '',
            timestamp: new Date().toISOString()
        };
        
        // Create assistant message element
        const messageElement = createMessageElement(assistantMessage);
        messagesContainer.appendChild(messageElement);
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    
                    if (data === '[DONE]') {
                        // Stream complete
                        isStreaming = false;
                        sendButton.disabled = false;
                        typingIndicator.style.display = 'none';
                        
                        // Update conversation list
                        await loadConversations();
                        return;
                    }
                    
                    try {
                        const parsed = JSON.parse(data);
                        
                        if (parsed.error) {
                            throw new Error(parsed.error);
                        }
                        
                        if (parsed.content) {
                            assistantMessage.content += parsed.content;
                            updateMessageContent(messageElement, assistantMessage.content);
                        }
                    } catch (e) {
                        // Skip parsing errors for partial JSON
                    }
                }
            }
        }
        
    } catch (error) {
        console.error('Failed to send message:', error);
        showError('Failed to send message: ' + error.message);
        isStreaming = false;
        sendButton.disabled = false;
        typingIndicator.style.display = 'none';
    }
}

// Add message to UI
function addMessageToUI(message, isNew = false) {
    const messageElement = createMessageElement(message);
    messagesContainer.appendChild(messageElement);
    
    if (isNew) {
        scrollToBottom();
    }
}

// Create message element
function createMessageElement(message) {
    const div = document.createElement('div');
    const isUser = message.role === 'user';
    const time = new Date(message.timestamp).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    div.className = `message ${isUser ? 'user-message' : 'assistant-message'}`;
    
    if (isUser) {
        div.innerHTML = `
            <div class="message-content">
                <div class="text-content">${formatMessageContent(message.content)}</div>
            </div>
        `;
    } else {
        div.innerHTML = `
            <div class="message-header">
                <div class="message-sender">
                    <i class="fas fa-robot"></i>
                    <span>WormGPT</span>
                </div>
                <div class="message-time">${time}</div>
            </div>
            <div class="message-content">
                ${formatMessageContent(message.content)}
            </div>
        `;
    }
    
    return div;
}

// Update message content (for streaming)
function updateMessageContent(messageElement, content) {
    const contentDiv = messageElement.querySelector('.message-content');
    if (contentDiv) {
        contentDiv.innerHTML = formatMessageContent(content);
        highlightCodeBlocks(contentDiv);
        scrollToBottom();
    }
}

// Format message content with code highlighting
function formatMessageContent(content) {
    if (!content) return '';
    
    // Split by code blocks
    const parts = content.split(/(```[\s\S]*?```)/g);
    let result = '';
    
    parts.forEach(part => {
        if (part.startsWith('```')) {
            // Code block
            const codeMatch = part.match(/^```(\w+)?\n([\s\S]*?)```$/);
            if (codeMatch) {
                const language = codeMatch[1] || 'text';
                const code = codeMatch[2].trim();
                
                result += `
                    <div class="code-block">
                        <div class="code-header">
                            <div class="code-language">
                                <i class="fas fa-code"></i>
                                <span>${escapeHtml(language)}</span>
                            </div>
                            <button class="copy-code-btn" onclick="copyCode(this)">
                                <i class="fas fa-copy"></i>
                                <span>Copy</span>
                            </button>
                        </div>
                        <pre><code class="language-${escapeHtml(language)}">${escapeHtml(code)}</code></pre>
                    </div>
                `;
            }
        } else {
            // Regular text with markdown formatting
            let text = escapeHtml(part);
            
            // Convert markdown to HTML
            text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
            text = text.replace(/`(.*?)`/g, '<code>$1</code>');
            text = text.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');
            text = text.replace(/\n\n/g, '</p><p>');
            text = text.replace(/\n/g, '<br>');
            
            // Handle lists
            text = text.replace(/^\s*[-*]\s+(.*)$/gm, '<li>$1</li>');
            text = text.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
            text = text.replace(/^\s*\d+\.\s+(.*)$/gm, '<li>$1</li>');
            text = text.replace(/(<li>.*<\/li>)/s, '<ol>$1</ol>');
            
            result += `<div class="text-content">${text}</div>`;
        }
    });
    
    return result;
}

// Highlight code blocks
function highlightCodeBlocks(container) {
    if (container) {
        container.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });
    }
}

// Copy code to clipboard
function copyCode(button) {
    const codeBlock = button.closest('.code-block');
    const code = codeBlock.querySelector('code').textContent;
    
    navigator.clipboard.writeText(code).then(() => {
        const originalHTML = button.innerHTML;
        button.innerHTML = '<i class="fas fa-check"></i><span>Copied!</span>';
        button.classList.add('copied');
        
        setTimeout(() => {
            button.innerHTML = originalHTML;
            button.classList.remove('copied');
        }, 2000);
    });
}

// Show welcome message
function showWelcomeMessage() {
    messagesContainer.innerHTML = `
        <div class="welcome-message">
            <h2><i class="fas fa-robot"></i> Welcome to WormGPT</h2>
            <p>Start a conversation by typing your message below.</p>
            <div class="features">
                <div class="feature">
                    <i class="fas fa-bolt"></i>
                    <span>Real-time Streaming</span>
                </div>
                <div class="feature">
                    <i class="fas fa-code"></i>
                    <span>Code Highlighting</span>
                </div>
                <div class="feature">
                    <i class="fas fa-history"></i>
                    <span>Conversation Memory</span>
                </div>
            </div>
        </div>
    `;
}

// Clear current chat
function clearChat() {
    if (currentConversationId && confirm('Are you sure you want to clear this chat?')) {
        messagesContainer.innerHTML = '';
        showWelcomeMessage();
    }
}

// Export current chat
async function exportChat() {
    if (!currentConversationId) {
        showError('No conversation to export');
        return;
    }
    
    try {
        const response = await fetch(`/api/export/${currentConversationId}?format=txt`);
        if (!response.ok) throw new Error('Failed to export conversation');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `wormgpt_conversation_${currentConversationId}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Failed to export chat:', error);
        showError('Failed to export conversation');
    }
}

// Update UI based on state
function updateUI() {
    sendButton.disabled = !messageInput.value.trim() || isStreaming;
    
    if (currentConversationId) {
        clearChatBtn.style.display = 'flex';
        exportChatBtn.style.display = 'flex';
    } else {
        clearChatBtn.style.display = 'none';
        exportChatBtn.style.display = 'none';
    }
}

// Scroll to bottom of messages
function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Show notification
function showNotification(message) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #10b981;
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Show error message
function showError(message) {
    showNotification(message);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Setup event listeners
function setupEventListeners() {
    // Message input
    messageInput.addEventListener('input', () => {
        // Auto-resize textarea
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + 'px';
        updateUI();
    });
    
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!isStreaming && messageInput.value.trim()) {
                sendMessage();
            }
        }
    });
    
    // Send button
    sendButton.addEventListener('click', sendMessage);
    
    // New chat button
    newChatBtn.addEventListener('click', async () => {
        currentConversationId = null;
        const url = new URL(window.location);
        url.searchParams.delete('conversation');
        window.history.pushState({}, '', url);
        
        chatTitle.innerHTML = '<i class="fas fa-comments"></i> New Conversation';
        showWelcomeMessage();
        await loadConversations();
    });
    
    // Settings
    settingsBtn.addEventListener('click', () => {
        settingsModal.classList.add('show');
    });
    
    closeSettingsBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            settingsModal.classList.remove('show');
        });
    });
    
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.remove('show');
        }
    });
    
    // Temperature slider
    temperatureInput.addEventListener('input', () => {
        temperatureValue.textContent = temperatureInput.value;
    });
    
    // Save settings
    saveSettingsBtn.addEventListener('click', saveConfig);
    
    // Dark mode toggle
    darkModeToggle.addEventListener('change', () => {
        document.body.classList.toggle('light-mode', !darkModeToggle.checked);
    });
    
    // Clear and export buttons
    clearChatBtn.addEventListener('click', clearChat);
    exportChatBtn.addEventListener('click', exportChat);
    
    // Model select
    modelSelect.addEventListener('change', () => {
        config.model = modelSelect.value;
    });
    
    // Handle back/forward navigation
    window.addEventListener('popstate', async () => {
        const urlParams = new URLSearchParams(window.location.search);
        const conversationId = urlParams.get('conversation');
        
        if (conversationId) {
            await loadConversation(conversationId);
        } else {
            currentConversationId = null;
            chatTitle.innerHTML = '<i class="fas fa-comments"></i> New Conversation';
            showWelcomeMessage();
            await loadConversations();
        }
    });
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', init);