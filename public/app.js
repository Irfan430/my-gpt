// Configuration
let currentConversationId = 'new';
let currentMessages = [];
let currentEventSource = null;
let isStreaming = false;
let currentTheme = 'dark';
let selectedConversations = new Set();
let autoScroll = true;

// DOM Elements
const elements = {
    // Containers
    messagesContainer: document.getElementById('messagesContainer'),
    conversationsContainer: document.getElementById('conversationsContainer'),
    conversationsGrid: document.getElementById('conversationsGrid'),
    
    // Input
    messageInput: document.getElementById('messageInput'),
    sendBtn: document.getElementById('sendBtn'),
    stopBtn: document.getElementById('stopBtn'),
    
    // Buttons
    newChatBtn: document.getElementById('newChatBtn'),
    clearChatBtn: document.getElementById('clearChatBtn'),
    copyChatBtn: document.getElementById('copyChatBtn'),
    exportChatBtn: document.getElementById('exportChatBtn'),
    regenerateBtn: document.getElementById('regenerateBtn'),
    settingsBtn: document.getElementById('settingsBtn'),
    
    // Model
    modelSelect: document.getElementById('modelSelect'),
    currentModel: document.getElementById('currentModel'),
    
    // Status
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    memoryStatus: document.getElementById('memoryStatus'),
    charCount: document.getElementById('charCount'),
    typingIndicator: document.getElementById('typingIndicator'),
    
    // Modals
    settingsModal: document.getElementById('settingsModal'),
    conversationModal: document.getElementById('conversationModal'),
    
    // Settings
    apiKeyInput: document.getElementById('apiKeyInput'),
    temperatureInput: document.getElementById('temperatureInput'),
    tempValue: document.getElementById('tempValue'),
    languageSelect: document.getElementById('languageSelect'),
    maxHistoryInput: document.getElementById('maxHistoryInput'),
    maxHistoryValue: document.getElementById('maxHistoryValue'),
    toggleApiKey: document.getElementById('toggleApiKey'),
    
    // Theme
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    themeOptions: document.querySelectorAll('.theme-option'),
    
    // Quick Actions
    scrollTopBtn: document.getElementById('scrollTopBtn'),
    scrollBottomBtn: document.getElementById('scrollBottomBtn'),
    
    // Close buttons
    closeSettings: document.getElementById('closeSettings'),
    closeConversationModal: document.getElementById('closeConversationModal'),
    
    // Save buttons
    saveSettings: document.getElementById('saveSettings'),
    cancelSettings: document.getElementById('cancelSettings'),
    
    // Conversation manager
    deleteSelectedBtn: document.getElementById('deleteSelectedBtn'),
    refreshConversationsBtn: document.getElementById('refreshConversationsBtn'),
    noConversations: document.getElementById('noConversations'),
    
    // Chat info
    chatTitle: document.getElementById('chatTitle')
};

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    loadConfig();
    loadConversations();
    setupEventListeners();
    setupTextareaAutoResize();
    updateCharacterCount();
    checkConnection();
});

function initializeApp() {
    // Set theme from localStorage
    const savedTheme = localStorage.getItem('wormgpt_theme') || 'dark';
    setTheme(savedTheme);
    
    // Set model from localStorage
    const savedModel = localStorage.getItem('wormgpt_model') || 'deepseek-chat';
    elements.modelSelect.value = savedModel;
    elements.currentModel.textContent = savedModel;
    
    // Load conversations
    loadConversationsList();
    
    // Initialize code highlighting
    hljs.configure({
        languages: ['javascript', 'python', 'html', 'css', 'java', 'cpp', 'php', 'ruby', 'go', 'rust', 'sql', 'bash'],
        ignoreUnescapedHTML: true
    });
}

function loadConfig() {
    fetch('/api/config')
        .then(res => {
            if (!res.ok) throw new Error('Failed to load config');
            return res.json();
        })
        .then(config => {
            elements.currentModel.textContent = config.model;
            elements.modelSelect.value = config.model;
            elements.apiKeyInput.value = config.api_key || '';
            elements.temperatureInput.value = config.temperature || 0.7;
            elements.tempValue.textContent = config.temperature || 0.7;
            elements.languageSelect.value = config.language || 'English';
            elements.maxHistoryInput.value = config.max_history || 20;
            elements.maxHistoryValue.textContent = config.max_history || 20;
            
            updateStatus('connected');
        })
        .catch(err => {
            console.error('Failed to load config:', err);
            showToast('Failed to load configuration', 'error');
            updateStatus('disconnected');
        });
}

function loadConversations() {
    fetch('/api/conversations')
        .then(res => {
            if (!res.ok) throw new Error('Failed to load conversations');
            return res.json();
        })
        .then(conversations => {
            updateConversationsList(conversations);
        })
        .catch(err => {
            console.error('Failed to load conversations:', err);
        });
}

function setupEventListeners() {
    // Send message
    elements.sendBtn.addEventListener('click', sendMessage);
    elements.messageInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Stop streaming
    elements.stopBtn.addEventListener('click', stopStreaming);

    // New chat
    elements.newChatBtn.addEventListener('click', startNewChat);

    // Clear chat
    elements.clearChatBtn.addEventListener('click', () => {
        if (confirm('Clear current chat? This will remove all messages from this conversation.')) {
            clearCurrentChat();
        }
    });

    // Copy chat
    elements.copyChatBtn.addEventListener('click', copyAllChat);

    // Export chat
    elements.exportChatBtn.addEventListener('click', exportChat);

    // Regenerate
    elements.regenerateBtn.addEventListener('click', regenerateLastMessage);

    // Model selection
    elements.modelSelect.addEventListener('change', function() {
        const model = this.value;
        elements.currentModel.textContent = model;
        localStorage.setItem('wormgpt_model', model);
        showToast(`Model changed to ${model}`, 'success');
    });

    // Settings
    elements.settingsBtn.addEventListener('click', () => {
        elements.settingsModal.classList.add('active');
    });

    elements.closeSettings.addEventListener('click', () => {
        elements.settingsModal.classList.remove('active');
    });

    // Conversation manager
    elements.closeConversationModal.addEventListener('click', () => {
        elements.conversationModal.classList.remove('active');
    });

    // Theme toggle
    elements.themeToggleBtn.addEventListener('click', toggleTheme);

    // Theme options
    elements.themeOptions.forEach(option => {
        option.addEventListener('click', function() {
            elements.themeOptions.forEach(opt => opt.classList.remove('active'));
            this.classList.add('active');
            setTheme(this.dataset.theme);
        });
    });

    // Quick actions
    elements.scrollTopBtn.addEventListener('click', () => {
        elements.messagesContainer.scrollTop = 0;
    });

    elements.scrollBottomBtn.addEventListener('click', () => {
        elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
    });

    // Character count
    elements.messageInput.addEventListener('input', updateCharacterCount);

    // Temperature slider
    elements.temperatureInput.addEventListener('input', function() {
        elements.tempValue.textContent = this.value;
    });

    // Max history slider
    elements.maxHistoryInput.addEventListener('input', function() {
        elements.maxHistoryValue.textContent = this.value;
    });

    // API key visibility toggle
    elements.toggleApiKey.addEventListener('click', function() {
        const type = elements.apiKeyInput.type === 'password' ? 'text' : 'password';
        elements.apiKeyInput.type = type;
        const icon = this.querySelector('i');
        icon.className = type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
    });

    // Save settings
    elements.saveSettings.addEventListener('click', saveSettings);
    elements.cancelSettings.addEventListener('click', () => {
        elements.settingsModal.classList.remove('active');
    });

    // Conversation manager actions
    elements.deleteSelectedBtn.addEventListener('click', deleteSelectedConversations);
    elements.refreshConversationsBtn.addEventListener('click', loadConversationsList);

    // Click outside modals to close
    window.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal')) {
            e.target.classList.remove('active');
        }
    });

    // Auto-scroll when user scrolls
    elements.messagesContainer.addEventListener('scroll', function() {
        const isAtBottom = this.scrollHeight - this.scrollTop - this.clientHeight < 50;
        autoScroll = isAtBottom;
    });
}

function setupTextareaAutoResize() {
    elements.messageInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 200) + 'px';
    });
}

function updateCharacterCount() {
    const count = elements.messageInput.value.length;
    elements.charCount.textContent = count;
}

function updateStatus(status) {
    switch (status) {
        case 'connected':
            elements.statusDot.style.backgroundColor = '#10b981';
            elements.statusText.textContent = 'Connected';
            elements.memoryStatus.textContent = 'Active';
            break;
        case 'disconnected':
            elements.statusDot.style.backgroundColor = '#ef4444';
            elements.statusText.textContent = 'Disconnected';
            break;
        case 'streaming':
            elements.statusDot.style.backgroundColor = '#f59e0b';
            elements.statusText.textContent = 'Streaming...';
            break;
        case 'error':
            elements.statusDot.style.backgroundColor = '#ef4444';
            elements.statusText.textContent = 'Error';
            break;
    }
}

function setTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('wormgpt_theme', theme);
    
    // Update theme toggle icon
    const icon = elements.themeToggleBtn.querySelector('i');
    icon.className = theme === 'light' ? 'fas fa-sun' : 'fas fa-moon';
    
    // Update theme options
    elements.themeOptions.forEach(opt => {
        opt.classList.remove('active');
        if (opt.dataset.theme === theme) {
            opt.classList.add('active');
        }
    });
}

function toggleTheme() {
    const themes = ['dark', 'light', 'blue'];
    const currentIndex = themes.indexOf(currentTheme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
    showToast(`Theme changed to ${themes[nextIndex]}`, 'success');
}

async function sendMessage() {
    const message = elements.messageInput.value.trim();
    if (!message || isStreaming) return;

    // Add user message
    addMessage('user', message);
    elements.messageInput.value = '';
    elements.messageInput.style.height = 'auto';
    updateCharacterCount();
    
    // Get selected model
    const model = elements.modelSelect.value;
    localStorage.setItem('wormgpt_model', model);

    // Show typing indicator
    showTypingIndicator(true);
    
    // Disable input and show stop button
    setStreamingState(true);
    updateStatus('streaming');

    try {
        // Create EventSource for streaming
        const url = `/api/chat/stream?message=${encodeURIComponent(message)}&model=${model}&conversation_id=${currentConversationId}`;
        currentEventSource = new EventSource(url);

        let aiMessageDiv = null;
        let messageContent = '';

        currentEventSource.onmessage = function(event) {
            if (event.data === '[DONE]') {
                currentEventSource.close();
                currentEventSource = null;
                setStreamingState(false);
                showTypingIndicator(false);
                updateStatus('connected');
                
                // Save the complete message
                if (aiMessageDiv && messageContent) {
                    saveMessageToHistory('assistant', messageContent);
                    highlightCodeBlocks(aiMessageDiv);
                }
                
                return;
            }

            try {
                const data = JSON.parse(event.data);
                
                if (data.error) {
                    // Handle error
                    if (aiMessageDiv) {
                        aiMessageDiv.querySelector('.message-text').innerHTML = 
                            `<span style="color: #ef4444;">${data.error}</span>`;
                    }
                    currentEventSource.close();
                    currentEventSource = null;
                    setStreamingState(false);
                    showTypingIndicator(false);
                    updateStatus('error');
                    showToast(data.error, 'error');
                } else if (data.content) {
                    if (!aiMessageDiv) {
                        aiMessageDiv = createAIMessageElement();
                        messageContent = '';
                    }
                    
                    // Append content with streaming effect
                    messageContent += data.content;
                    const messageText = aiMessageDiv.querySelector('.message-text');
                    messageText.innerHTML = formatMessage(messageContent);
                    
                    // Auto-scroll if enabled
                    if (autoScroll) {
                        elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
                    }
                }
            } catch (e) {
                console.error('Error parsing SSE data:', e);
            }
        };

        currentEventSource.onerror = function(error) {
            console.error('EventSource failed:', error);
            if (currentEventSource) {
                currentEventSource.close();
                currentEventSource = null;
            }
            setStreamingState(false);
            showTypingIndicator(false);
            updateStatus('error');
            
            if (!aiMessageDiv) {
                showToast('Connection failed. Please try again.', 'error');
            }
        };

    } catch (error) {
        console.error('Error sending message:', error);
        setStreamingState(false);
        showTypingIndicator(false);
        updateStatus('error');
        showToast('Failed to send message', 'error');
    }
}

function stopStreaming() {
    if (currentEventSource) {
        currentEventSource.close();
        currentEventSource = null;
    }
    setStreamingState(false);
    showTypingIndicator(false);
    updateStatus('connected');
    showToast('Stopped generating', 'warning');
}

function setStreamingState(streaming) {
    isStreaming = streaming;
    elements.messageInput.disabled = streaming;
    elements.sendBtn.disabled = streaming;
    elements.stopBtn.style.display = streaming ? 'flex' : 'none';
    elements.regenerateBtn.disabled = streaming;
}

function showTypingIndicator(show) {
    elements.typingIndicator.style.display = show ? 'flex' : 'none';
    
    if (show && autoScroll) {
        elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
    }
}

function addMessage(role, content) {
    const message = { role, content, timestamp: new Date().toISOString() };
    currentMessages.push(message);
    
    const messageDiv = createMessageElement(role, content);
    elements.messagesContainer.appendChild(messageDiv);
    
    // Hide welcome message
    const welcomeMessage = document.querySelector('.welcome-message');
    if (welcomeMessage) {
        welcomeMessage.style.display = 'none';
    }
    
    // Auto-scroll if enabled
    if (autoScroll) {
        setTimeout(() => {
            elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
        }, 100);
    }
    
    // Save user message to conversation
    if (role === 'user') {
        saveMessageToHistory(role, content);
    }
}

function createMessageElement(role, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${role}`;
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    
    const messageHeader = document.createElement('div');
    messageHeader.className = 'message-header';
    
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    if (role === 'user') {
        messageHeader.innerHTML = `
            <i class="fas fa-user"></i>
            <span>You</span>
            <span class="message-time">${timestamp}</span>
        `;
    } else {
        messageHeader.innerHTML = `
            <i class="fas fa-robot"></i>
            <span>WormGPT</span>
            <span class="message-time">${timestamp}</span>
        `;
    }
    
    const messageText = document.createElement('div');
    messageText.className = 'message-text';
    messageText.innerHTML = formatMessage(content);
    
    const messageActions = document.createElement('div');
    messageActions.className = 'message-actions';
    
    messageActions.innerHTML = `
        <button class="btn-action copy-btn" title="Copy">
            <i class="fas fa-copy"></i>
        </button>
        ${role === 'assistant' ? `
            <button class="btn-action regenerate-btn" title="Regenerate">
                <i class="fas fa-redo"></i>
            </button>
        ` : ''}
    `;
    
    messageContent.appendChild(messageHeader);
    messageContent.appendChild(messageText);
    messageContent.appendChild(messageActions);
    messageDiv.appendChild(messageContent);
    
    // Add event listeners to action buttons
    const copyBtn = messageActions.querySelector('.copy-btn');
    copyBtn.addEventListener('click', () => {
        copyToClipboard(content);
        showToast('Copied to clipboard!', 'success');
    });
    
    if (role === 'assistant') {
        const regenerateBtn = messageActions.querySelector('.regenerate-btn');
        regenerateBtn.addEventListener('click', () => {
            regenerateMessage(messageDiv);
        });
    }
    
    // Highlight code blocks
    highlightCodeBlocks(messageDiv);
    
    return messageDiv;
}

function createAIMessageElement() {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message message-assistant';
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    
    const messageHeader = document.createElement('div');
    messageHeader.className = 'message-header';
    
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    messageHeader.innerHTML = `
        <i class="fas fa-robot"></i>
        <span>WormGPT</span>
        <span class="message-time">${timestamp}</span>
    `;
    
    const messageText = document.createElement('div');
    messageText.className = 'message-text streaming-text';
    
    const messageActions = document.createElement('div');
    messageActions.className = 'message-actions';
    messageActions.innerHTML = `
        <button class="btn-action copy-btn" title="Copy">
            <i class="fas fa-copy"></i>
        </button>
        <button class="btn-action stop-btn" title="Stop">
            <i class="fas fa-stop"></i>
        </button>
    `;
    
    messageContent.appendChild(messageHeader);
    messageContent.appendChild(messageText);
    messageContent.appendChild(messageActions);
    messageDiv.appendChild(messageContent);
    elements.messagesContainer.appendChild(messageDiv);
    
    // Add event listeners
    const copyBtn = messageActions.querySelector('.copy-btn');
    const stopBtn = messageActions.querySelector('.stop-btn');
    
    copyBtn.addEventListener('click', () => {
        // Will be updated when streaming completes
    });
    
    stopBtn.addEventListener('click', stopStreaming);
    
    // Auto-scroll if enabled
    if (autoScroll) {
        elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
    }
    
    return messageDiv;
}

function formatMessage(content) {
    // Escape HTML entities
    const escapeHtml = (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

    // Process code blocks
    let processed = escapeHtml(content);
    
    // Handle code blocks with language specification
    processed = processed.replace(/```(\w+)?\n([\s\S]*?)\n```/g, function(match, lang, code) {
        lang = lang || 'plaintext';
        return `<div class="code-block">
                  <div class="code-header">
                    <span class="code-lang">${lang}</span>
                    <button class="copy-code-btn" onclick="copyCodeToClipboard(this)">
                      <i class="fas fa-copy"></i> Copy
                    </button>
                  </div>
                  <pre><code class="language-${lang}">${escapeHtml(code)}</code></pre>
                </div>`;
    });
    
    // Handle inline code
    processed = processed.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    
    // Handle bold text
    processed = processed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Handle italic text
    processed = processed.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Handle links
    processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // Handle line breaks
    processed = processed.replace(/\n/g, '<br>');
    
    return processed;
}

function highlightCodeBlocks(element) {
    if (!element) element = elements.messagesContainer;
    element.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
    });
}

window.copyCodeToClipboard = function(button) {
    const codeBlock = button.closest('.code-block');
    const code = codeBlock.querySelector('code').textContent;
    copyToClipboard(code);
    showToast('Code copied to clipboard!', 'success');
};

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(err => {
        console.error('Failed to copy:', err);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            showToast('Copied to clipboard!', 'success');
        } catch (err) {
            console.error('Fallback copy failed:', err);
            showToast('Failed to copy', 'error');
        }
        document.body.removeChild(textArea);
    });
}

function saveMessageToHistory(role, content) {
    // This is handled by the backend API
    // The conversation ID is managed by the backend
    console.log('Message saved to conversation:', role, content.substring(0, 50) + '...');
}

function loadConversation(conversationId) {
    if (isStreaming) {
        stopStreaming();
    }
    
    if (conversationId === 'new') {
        startNewChat();
        return;
    }
    
    fetch(`/api/conversation/${conversationId}`)
        .then(res => {
            if (!res.ok) throw new Error('Failed to load conversation');
            return res.json();
        })
        .then(conversation => {
            currentConversationId = conversationId;
            currentMessages = conversation.messages || [];
            
            // Clear current messages
            elements.messagesContainer.innerHTML = '';
            
            // Hide welcome message
            const welcomeMessage = document.querySelector('.welcome-message');
            if (welcomeMessage) {
                welcomeMessage.style.display = 'none';
            }
            
            // Load messages
            currentMessages.forEach(msg => {
                const messageDiv = createMessageElement(msg.role, msg.content);
                elements.messagesContainer.appendChild(messageDiv);
            });
            
            // Update chat title
            elements.chatTitle.textContent = conversation.title || 'Conversation';
            
            // Update conversations list
            document.querySelectorAll('.conversation-item').forEach(item => {
                item.classList.remove('active');
                if (item.dataset.id === conversationId) {
                    item.classList.add('active');
                }
            });
            
            // Scroll to bottom
            elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
            
            showToast(`Loaded conversation: ${conversation.title}`, 'success');
        })
        .catch(err => {
            console.error('Failed to load conversation:', err);
            showToast('Failed to load conversation', 'error');
        });
}

function startNewChat() {
    if (isStreaming) {
        stopStreaming();
    }
    
    if (currentMessages.length > 0) {
        if (!confirm('Start a new chat? Current conversation will be saved.')) {
            return;
        }
    }
    
    currentConversationId = 'new';
    currentMessages = [];
    
    // Clear messages container
    elements.messagesContainer.innerHTML = '';
    
    // Show welcome message
    const welcomeMessage = document.querySelector('.welcome-message');
    if (welcomeMessage) {
        welcomeMessage.style.display = 'block';
    }
    
    // Update UI
    elements.chatTitle.textContent = 'New Chat';
    
    // Update conversations list
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.id === 'new') {
            item.classList.add('active');
        }
    });
    
    showToast('Started new chat', 'success');
}

function clearCurrentChat() {
    currentMessages = [];
    elements.messagesContainer.innerHTML = '';
    
    // Show welcome message
    const welcomeMessage = document.querySelector('.welcome-message');
    if (welcomeMessage) {
        welcomeMessage.style.display = 'block';
    }
    
    elements.chatTitle.textContent = 'New Chat';
    showToast('Chat cleared', 'success');
}

function copyAllChat() {
    if (currentMessages.length === 0) {
        showToast('No messages to copy', 'warning');
        return;
    }
    
    const allText = currentMessages.map(msg => {
        const role = msg.role === 'user' ? 'You' : 'WormGPT';
        return `${role}:\n${msg.content}\n\n`;
    }).join('');
    
    copyToClipboard(allText);
    showToast('All chat copied to clipboard!', 'success');
}

function exportChat() {
    if (currentMessages.length === 0) {
        showToast('No messages to export', 'warning');
        return;
    }
    
    const chatData = {
        title: elements.chatTitle.textContent,
        messages: currentMessages,
        exportedAt: new Date().toISOString(),
        model: elements.modelSelect.value
    };
    
    const blob = new Blob([JSON.stringify(chatData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wormgpt-chat-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Chat exported successfully', 'success');
}

function regenerateLastMessage() {
    if (currentMessages.length < 2) {
        showToast('No message to regenerate', 'warning');
        return;
    }
    
    const lastUserMessage = currentMessages[currentMessages.length - 2];
    if (lastUserMessage.role !== 'user') {
        showToast('No user message found to regenerate', 'warning');
        return;
    }
    
    // Remove last AI message
    currentMessages.pop();
    const lastMessageElement = document.querySelector('.message-assistant:last-child');
    if (lastMessageElement) {
        lastMessageElement.remove();
    }
    
    // Resend user message
    elements.messageInput.value = lastUserMessage.content;
    elements.messageInput.style.height = 'auto';
    updateCharacterCount();
    sendMessage();
}

function regenerateMessage(messageDiv) {
    const messageIndex = Array.from(elements.messagesContainer.querySelectorAll('.message-assistant')).indexOf(messageDiv);
    if (messageIndex === -1) return;
    
    // Find the corresponding user message
    const userMessageIndex = messageIndex - 1;
    if (userMessageIndex < 0) return;
    
    const userMessageDiv = elements.messagesContainer.querySelectorAll('.message-user')[userMessageIndex];
    if (!userMessageDiv) return;
    
    // Extract user message text
    const userMessageText = userMessageDiv.querySelector('.message-text').textContent;
    
    // Remove all messages after the user message
    const allMessages = elements.messagesContainer.querySelectorAll('.message');
    for (let i = userMessageIndex + 1; i < allMessages.length; i++) {
        allMessages[i].remove();
    }
    
    // Update currentMessages array
    const keepCount = userMessageIndex + 1;
    currentMessages = currentMessages.slice(0, keepCount);
    
    // Resend the user message
    elements.messageInput.value = userMessageText;
    elements.messageInput.style.height = 'auto';
    updateCharacterCount();
    sendMessage();
}

function updateConversationsList(conversations) {
    const container = elements.conversationsContainer;
    
    // Clear existing items except "New Chat"
    const existingItems = container.querySelectorAll('.conversation-item:not([data-id="new"])');
    existingItems.forEach(item => item.remove());
    
    // Add conversations
    conversations.forEach(conv => {
        const item = document.createElement('div');
        item.className = 'conversation-item';
        item.dataset.id = conv.id;
        
        const title = conv.title || 'Untitled';
        const date = new Date(conv.updated_at).toLocaleDateString();
        
        item.innerHTML = `
            <i class="fas fa-comment"></i>
            <div class="conversation-info">
                <span class="conversation-title">${title}</span>
                <span class="conversation-date">${date}</span>
            </div>
        `;
        
        item.addEventListener('click', () => {
            loadConversation(conv.id);
        });
        
        container.appendChild(item);
    });
}

function loadConversationsList() {
    fetch('/api/conversations')
        .then(res => {
            if (!res.ok) throw new Error('Failed to load conversations');
            return res.json();
        })
        .then(conversations => {
            updateConversationsManager(conversations);
            updateConversationsList(conversations);
        })
        .catch(err => {
            console.error('Failed to load conversations:', err);
            showToast('Failed to load conversations', 'error');
        });
}

function updateConversationsManager(conversations) {
    const grid = elements.conversationsGrid;
    const noConversations = elements.noConversations;
    
    grid.innerHTML = '';
    selectedConversations.clear();
    
    if (conversations.length === 0) {
        noConversations.style.display = 'block';
        return;
    }
    
    noConversations.style.display = 'none';
    
    conversations.forEach(conv => {
        const card = document.createElement('div');
        card.className = 'conversation-card';
        card.dataset.id = conv.id;
        
        const title = conv.title || 'Untitled';
        const created = new Date(conv.created_at).toLocaleDateString();
        const updated = new Date(conv.updated_at).toLocaleDateString();
        const messageCount = conv.message_count || 0;
        
        card.innerHTML = `
            <div class="conversation-card-header">
                <input type="checkbox" class="conversation-checkbox" data-id="${conv.id}">
                <button class="btn-icon load-conversation-btn" title="Load">
                    <i class="fas fa-external-link-alt"></i>
                </button>
            </div>
            <h4>${title}</h4>
            <p>${messageCount} messages</p>
            <div class="conversation-stats">
                <span>Created: ${created}</span>
                <span>Updated: ${updated}</span>
            </div>
        `;
        
        // Checkbox event
        const checkbox = card.querySelector('.conversation-checkbox');
        checkbox.addEventListener('change', function() {
            if (this.checked) {
                selectedConversations.add(conv.id);
                card.classList.add('selected');
            } else {
                selectedConversations.delete(conv.id);
                card.classList.remove('selected');
            }
        });
        
        // Load button event
        const loadBtn = card.querySelector('.load-conversation-btn');
        loadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            elements.conversationModal.classList.remove('active');
            loadConversation(conv.id);
        });
        
        // Card click event (for selection)
        card.addEventListener('click', (e) => {
            if (e.target !== checkbox && e.target !== loadBtn && !loadBtn.contains(e.target)) {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change'));
            }
        });
        
        grid.appendChild(card);
    });
}

function deleteSelectedConversations() {
    if (selectedConversations.size === 0) {
        showToast('No conversations selected', 'warning');
        return;
    }
    
    if (!confirm(`Delete ${selectedConversations.size} selected conversation(s)? This action cannot be undone.`)) {
        return;
    }
    
    const deletePromises = Array.from(selectedConversations).map(id => {
        return fetch(`/api/conversation/${id}`, { method: 'DELETE' })
            .then(res => res.json())
            .then(data => ({ id, success: data.success }));
    });
    
    Promise.all(deletePromises)
        .then(results => {
            const successful = results.filter(r => r.success).length;
            const failed = results.filter(r => !r.success).length;
            
            // Reload conversations
            loadConversationsList();
            loadConversations();
            
            // If current conversation was deleted, start new chat
            if (selectedConversations.has(currentConversationId)) {
                startNewChat();
            }
            
            selectedConversations.clear();
            
            let message = `Deleted ${successful} conversation(s)`;
            if (failed > 0) {
                message += `, failed to delete ${failed}`;
            }
            
            showToast(message, successful > 0 ? 'success' : 'error');
        })
        .catch(err => {
            console.error('Error deleting conversations:', err);
            showToast('Failed to delete conversations', 'error');
        });
}

function saveSettings() {
    const apiKey = elements.apiKeyInput.value.trim();
    const temperature = parseFloat(elements.temperatureInput.value);
    const language = elements.languageSelect.value;
    const maxHistory = parseInt(elements.maxHistoryInput.value);
    
    fetch('/api/update_config', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            api_key: apiKey,
            temperature: temperature,
            language: language,
            max_history: maxHistory
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showToast('Settings saved successfully!', 'success');
            elements.settingsModal.classList.remove('active');
            loadConfig();
        } else {
            showToast('Failed to save settings: ' + (data.error || 'Unknown error'), 'error');
        }
    })
    .catch(err => {
        console.error('Error saving settings:', err);
        showToast('Error saving settings', 'error');
    });
}

function checkConnection() {
    fetch('/api/ping')
        .then(res => res.json())
        .then(data => {
            updateStatus('connected');
        })
        .catch(err => {
            updateStatus('disconnected');
            console.error('Connection check failed:', err);
        });
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = {
        'success': 'fa-check-circle',
        'error': 'fa-exclamation-circle',
        'warning': 'fa-exclamation-triangle',
        'info': 'fa-info-circle'
    }[type];
    
    toast.innerHTML = `
        <i class="fas ${icon}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    // Remove toast after 3 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Periodic connection check
setInterval(checkConnection, 30000);