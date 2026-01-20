// Configuration
let currentChatId = 'new-chat';
let messages = [];
let currentEventSource = null;
let isStreaming = false;
let currentTheme = 'dark';

// DOM Elements
const chatContainer = document.getElementById('chatContainer');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const stopBtn = document.getElementById('stopBtn');
const copyBtn = document.getElementById('copyBtn');
const newChatBtn = document.getElementById('newChatBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const copyLastBtn = document.getElementById('copyLastBtn');
const regenerateBtn = document.getElementById('regenerateBtn');
const clearHistoryBtn = document.getElementById('clearHistory');
const settingsBtn = document.getElementById('settingsBtn');
const themeToggle = document.getElementById('themeToggle');
const uploadImageBtn = document.getElementById('uploadImage');
const imageModal = document.getElementById('imageModal');
const settingsModal = document.getElementById('settingsModal');

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    loadConfig();
    setupEventListeners();
    autoResizeTextarea();
});

function initializeApp() {
    // Set theme from localStorage
    const savedTheme = localStorage.getItem('wormgpt_theme') || 'dark';
    setTheme(savedTheme);
    
    // Load chat history
    loadChatHistory();
    
    // Set initial model
    document.getElementById('modelSelect').value = localStorage.getItem('wormgpt_model') || 'deepseek-chat';
}

function loadConfig() {
    fetch('/api/config')
        .then(res => res.json())
        .then(config => {
            document.getElementById('modelName').textContent = config.model;
            document.getElementById('languageName').textContent = config.language;
            document.getElementById('apiKey').value = config.api_key || '';
            document.getElementById('temperature').value = config.temperature || 0.7;
            document.getElementById('tempValue').textContent = config.temperature || 0.7;
            document.getElementById('languageSelect').value = config.language || 'English';
        })
        .catch(err => {
            showToast('Failed to load configuration', 'error');
        });
}

function setupEventListeners() {
    // Send message
    sendBtn.addEventListener('click', sendMessage);
    userInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Stop streaming
    stopBtn.addEventListener('click', stopStreaming);

    // Quick actions
    newChatBtn.addEventListener('click', startNewChat);
    clearChatBtn.addEventListener('click', clearCurrentChat);
    copyLastBtn.addEventListener('click', copyLastMessage);
    regenerateBtn.addEventListener('click', regenerateLastMessage);
    copyBtn.addEventListener('click', copyAllChat);

    // Settings
    settingsBtn.addEventListener('click', () => showModal(settingsModal));
    themeToggle.addEventListener('click', toggleTheme);

    // Image upload
    uploadImageBtn.addEventListener('click', () => showModal(imageModal));

    // Modal close buttons
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', function() {
            this.closest('.modal').classList.remove('active');
        });
    });

    // Settings save/cancel
    document.getElementById('saveSettings').addEventListener('click', saveSettings);
    document.getElementById('cancelSettings').addEventListener('click', () => {
        settingsModal.classList.remove('active');
    });

    // API key visibility toggle
    document.getElementById('toggleApiKey').addEventListener('click', function() {
        const apiKeyInput = document.getElementById('apiKey');
        if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text';
            this.classList.remove('fa-eye');
            this.classList.add('fa-eye-slash');
        } else {
            apiKeyInput.type = 'password';
            this.classList.remove('fa-eye-slash');
            this.classList.add('fa-eye');
        }
    });

    // Temperature slider
    document.getElementById('temperature').addEventListener('input', function() {
        document.getElementById('tempValue').textContent = this.value;
    });

    // Theme selector
    document.querySelectorAll('.theme-option').forEach(option => {
        option.addEventListener('click', function() {
            document.querySelectorAll('.theme-option').forEach(opt => {
                opt.classList.remove('active');
            });
            this.classList.add('active');
            setTheme(this.dataset.theme);
        });
    });

    // Image upload
    const dropArea = document.getElementById('dropArea');
    const fileInput = document.getElementById('fileInput');

    dropArea.addEventListener('click', () => fileInput.click());
    
    dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropArea.style.borderColor = '#6366f1';
        dropArea.style.background = 'rgba(99, 102, 241, 0.1)';
    });

    dropArea.addEventListener('dragleave', () => {
        dropArea.style.borderColor = '';
        dropArea.style.background = '';
    });

    dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dropArea.style.borderColor = '';
        dropArea.style.background = '';
        
        if (e.dataTransfer.files.length) {
            handleImageUpload(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleImageUpload(e.target.files[0]);
        }
    });

    // Click outside modal to close
    window.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal')) {
            e.target.classList.remove('active');
        }
    });

    // Clear history
    clearHistoryBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all chat history?')) {
            localStorage.removeItem('wormgpt_chats');
            loadChatHistory();
            showToast('Chat history cleared', 'success');
        }
    });
}

function autoResizeTextarea() {
    userInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 200) + 'px';
    });
}

function showModal(modal) {
    modal.classList.add('active');
}

function setTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('wormgpt_theme', theme);
    
    // Update theme toggle icon
    const icon = themeToggle.querySelector('i');
    if (theme === 'light') {
        icon.classList.remove('fa-moon');
        icon.classList.add('fa-sun');
    } else {
        icon.classList.remove('fa-sun');
        icon.classList.add('fa-moon');
    }
    
    // Update theme selector
    document.querySelectorAll('.theme-option').forEach(opt => {
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
}

async function sendMessage() {
    const message = userInput.value.trim();
    if (!message || isStreaming) return;

    // Add user message
    addMessage('user', message);
    userInput.value = '';
    userInput.style.height = 'auto';
    
    // Get selected model
    const model = document.getElementById('modelSelect').value;
    localStorage.setItem('wormgpt_model', model);

    // Show typing indicator
    showTypingIndicator(true);
    
    // Disable input and show stop button
    setStreamingState(true);

    try {
        // Create EventSource for streaming
        currentEventSource = new EventSource(
            `/api/chat/stream?message=${encodeURIComponent(message)}&model=${model}`
        );

        let aiMessageDiv = null;
        let messageContent = '';

        currentEventSource.onmessage = function(event) {
            if (event.data === '[DONE]') {
                currentEventSource.close();
                currentEventSource = null;
                setStreamingState(false);
                showTypingIndicator(false);
                
                // Save message to history
                saveMessageToHistory('assistant', messageContent);
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
                    
                    // Highlight code blocks
                    highlightCodeBlocks();
                    
                    // Smooth scrolling
                    chatContainer.scrollTop = chatContainer.scrollHeight;
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
            
            if (!aiMessageDiv) {
                showToast('Connection failed. Please try again.', 'error');
            }
        };

    } catch (error) {
        console.error('Error sending message:', error);
        setStreamingState(false);
        showTypingIndicator(false);
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
    showToast('Stopped generating', 'warning');
}

function setStreamingState(streaming) {
    isStreaming = streaming;
    userInput.disabled = streaming;
    sendBtn.disabled = streaming;
    stopBtn.style.display = streaming ? 'flex' : 'none';
    
    const statusText = document.getElementById('statusText');
    statusText.textContent = streaming ? 'Streaming...' : 'Active';
    statusText.className = streaming ? 'status-streaming' : 'status-active';
}

function showTypingIndicator(show) {
    const indicator = document.getElementById('typingIndicator');
    indicator.style.display = show ? 'flex' : 'none';
    
    if (show) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

function addMessage(role, content) {
    const message = { role, content, timestamp: new Date().toISOString() };
    messages.push(message);
    
    const messageDiv = createMessageElement(role, content);
    chatContainer.appendChild(messageDiv);
    
    // Scroll to bottom
    setTimeout(() => {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }, 100);
    
    // Hide welcome message
    const welcomeMessage = document.querySelector('.welcome-message');
    if (welcomeMessage) {
        welcomeMessage.style.display = 'none';
    }
    
    // Update chat title if first message
    if (messages.length === 1 && role === 'user') {
        const chatTitle = document.getElementById('chatTitle');
        chatTitle.textContent = content.substring(0, 30) + (content.length > 30 ? '...' : '');
    }
    
    // Save message to history
    saveMessageToHistory(role, content);
}

function createMessageElement(role, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${role}`;
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    
    const messageHeader = document.createElement('div');
    messageHeader.className = 'message-header';
    
    if (role === 'user') {
        messageHeader.innerHTML = `
            <i class="fas fa-user"></i>
            <span>You</span>
            <span class="message-time">${formatTime(new Date())}</span>
        `;
    } else {
        messageHeader.innerHTML = `
            <i class="fas fa-robot"></i>
            <span>WormGPT</span>
            <span class="message-time">${formatTime(new Date())}</span>
        `;
    }
    
    const messageText = document.createElement('div');
    messageText.className = 'message-text';
    messageText.innerHTML = formatMessage(content);
    
    const messageActions = document.createElement('div');
    messageActions.className = 'message-actions';
    
    if (role === 'assistant') {
        messageActions.innerHTML = `
            <button class="btn-icon-small copy-btn" title="Copy">
                <i class="fas fa-copy"></i>
            </button>
            <button class="btn-icon-small regenerate-btn" title="Regenerate">
                <i class="fas fa-redo"></i>
            </button>
        `;
    } else {
        messageActions.innerHTML = `
            <button class="btn-icon-small copy-btn" title="Copy">
                <i class="fas fa-copy"></i>
            </button>
        `;
    }
    
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
            // Find the user message that prompted this response
            const userMessageIndex = messages.findIndex(m => m.role === 'user');
            if (userMessageIndex !== -1) {
                const userMessage = messages[userMessageIndex].content;
                // Remove messages after user message
                messages = messages.slice(0, userMessageIndex + 1);
                // Remove corresponding DOM elements
                const messageElements = document.querySelectorAll('.message');
                for (let i = userMessageIndex + 1; i < messageElements.length; i++) {
                    messageElements[i].remove();
                }
                // Resend the user message
                userInput.value = userMessage;
                sendMessage();
            }
        });
    }
    
    return messageDiv;
}

function createAIMessageElement() {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message message-ai';
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    
    const messageHeader = document.createElement('div');
    messageHeader.className = 'message-header';
    messageHeader.innerHTML = `
        <i class="fas fa-robot"></i>
        <span>WormGPT</span>
        <span class="message-time">${formatTime(new Date())}</span>
    `;
    
    const messageText = document.createElement('div');
    messageText.className = 'message-text streaming-text';
    
    const messageActions = document.createElement('div');
    messageActions.className = 'message-actions';
    messageActions.innerHTML = `
        <button class="btn-icon-small copy-btn" title="Copy">
            <i class="fas fa-copy"></i>
        </button>
        <button class="btn-icon-small stop-btn" title="Stop">
            <i class="fas fa-stop"></i>
        </button>
    `;
    
    messageContent.appendChild(messageHeader);
    messageContent.appendChild(messageText);
    messageContent.appendChild(messageActions);
    messageDiv.appendChild(messageContent);
    chatContainer.appendChild(messageDiv);
    
    // Add event listeners
    const copyBtn = messageActions.querySelector('.copy-btn');
    const stopBtn = messageActions.querySelector('.stop-btn');
    
    copyBtn.addEventListener('click', () => {
        // Will be updated when streaming completes
    });
    
    stopBtn.addEventListener('click', stopStreaming);
    
    // Scroll to bottom
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    return messageDiv;
}

function formatMessage(content) {
    // Convert markdown-like formatting
    let formatted = content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>')
        .replace(/\n/g, '<br>');
    
    // Add syntax highlighting for code blocks
    formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)\n```/g, function(match, lang, code) {
        lang = lang || 'plaintext';
        return `<div class="code-block">
                  <div class="code-header">
                    <span>${lang}</span>
                    <button class="copy-code" onclick="copyCodeToClipboard(this)">Copy</button>
                  </div>
                  <pre><code class="language-${lang}">${escapeHtml(code)}</code></pre>
                </div>`;
    });
    
    return formatted;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function highlightCodeBlocks() {
    // Simple syntax highlighting (you can integrate Prism.js for better highlighting)
    document.querySelectorAll('pre code').forEach((block) => {
        const lang = block.className.replace('language-', '');
        if (lang && lang !== 'plaintext') {
            // Simple keyword highlighting
            const keywords = {
                python: ['def', 'class', 'import', 'from', 'as', 'return', 'if', 'else', 'elif', 'for', 'while', 'try', 'except', 'with'],
                javascript: ['function', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'return', 'try', 'catch', 'async', 'await'],
                html: ['<!DOCTYPE', '<html', '<head', '<body', '<div', '<span', '<p', '<a', '<img', '<script'],
                css: ['@media', '@keyframes', '.', '#', 'margin', 'padding', 'color', 'background']
            };
            
            let code = block.textContent;
            if (keywords[lang]) {
                keywords[lang].forEach(keyword => {
                    const regex = new RegExp(`\\b${keyword}\\b`, 'g');
                    code = code.replace(regex, `<span class="keyword">${keyword}</span>`);
                });
            }
            block.innerHTML = code;
        }
    });
}

function copyCodeToClipboard(button) {
    const code = button.closest('.code-block').querySelector('code').textContent;
    copyToClipboard(code);
    showToast('Code copied!', 'success');
}

function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(err => {
        console.error('Failed to copy:', err);
    });
}

function copyAllChat() {
    const allText = messages.map(m => `${m.role === 'user' ? 'You' : 'WormGPT'}: ${m.content}`).join('\n\n');
    copyToClipboard(allText);
    showToast('All chat copied to clipboard!', 'success');
}

function copyLastMessage() {
    if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        copyToClipboard(lastMessage.content);
        showToast('Last message copied!', 'success');
    }
}

function regenerateLastMessage() {
    if (messages.length >= 2) {
        const lastUserMessage = messages[messages.length - 2];
        if (lastUserMessage.role === 'user') {
            // Remove last AI message
            messages.pop();
            const lastMessageElement = document.querySelector('.message:last-child');
            if (lastMessageElement) {
                lastMessageElement.remove();
            }
            // Resend user message
            userInput.value = lastUserMessage.content;
            sendMessage();
        }
    }
}

function startNewChat() {
    if (isStreaming) {
        stopStreaming();
    }
    
    if (messages.length > 0) {
        if (confirm('Start a new chat? Current chat will be saved.')) {
            saveCurrentChat();
            resetChat();
        }
    } else {
        resetChat();
    }
}

function clearCurrentChat() {
    if (messages.length > 0) {
        if (confirm('Clear current chat?')) {
            resetChat();
        }
    }
}

function resetChat() {
    messages = [];
    chatContainer.innerHTML = `
        <div class="welcome-message">
            <div class="welcome-icon">
                <i class="fas fa-robot"></i>
            </div>
            <h1>Welcome to WormGPT Pro</h1>
            <p>Your unlimited AI assistant powered by DeepSeek API</p>
            <div class="features">
                <div class="feature">
                    <i class="fas fa-bolt"></i>
                    <span>Real-time Streaming</span>
                </div>
                <div class="feature">
                    <i class="fas fa-infinity"></i>
                    <span>Unlimited Tokens</span>
                </div>
                <div class="feature">
                    <i class="fas fa-language"></i>
                    <span>Multi-language</span>
                </div>
                <div class="feature">
                    <i class="fas fa-image"></i>
                    <span>Image Support</span>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('chatTitle').textContent = 'New Chat';
    currentChatId = 'new-chat';
}

function saveCurrentChat() {
    if (messages.length === 0) return;
    
    const chats = JSON.parse(localStorage.getItem('wormgpt_chats') || '{}');
    const chatId = Date.now().toString();
    
    chats[chatId] = {
        id: chatId,
        title: messages[0].content.substring(0, 30) + (messages[0].content.length > 30 ? '...' : ''),
        messages: messages,
        timestamp: new Date().toISOString()
    };
    
    localStorage.setItem('wormgpt_chats', JSON.stringify(chats));
    loadChatHistory();
}

function loadChatHistory() {
    const historyList = document.getElementById('historyList');
    const chats = JSON.parse(localStorage.getItem('wormgpt_chats') || '{}');
    
    // Clear existing items except "New Chat"
    const items = historyList.querySelectorAll('.history-item:not(.new-chat)');
    items.forEach(item => item.remove());
    
    // Add chat history items
    Object.values(chats)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .forEach(chat => {
            const item = document.createElement('div');
            item.className = 'history-item';
            item.innerHTML = `
                <i class="fas fa-comment"></i>
                <span>${chat.title}</span>
            `;
            
            item.addEventListener('click', () => {
                loadChat(chat);
            });
            
            historyList.appendChild(item);
        });
}

function loadChat(chat) {
    if (isStreaming) {
        stopStreaming();
    }
    
    resetChat();
    currentChatId = chat.id;
    
    chat.messages.forEach(message => {
        addMessage(message.role, message.content);
    });
    
    document.getElementById('chatTitle').textContent = chat.title;
    
    // Update active state in history
    document.querySelectorAll('.history-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector('.history-item.new-chat').classList.add('active');
}

function saveMessageToHistory(role, content) {
    if (currentChatId === 'new-chat') {
        currentChatId = Date.now().toString();
        const chatTitle = content.substring(0, 30) + (content.length > 30 ? '...' : '');
        
        const chats = JSON.parse(localStorage.getItem('wormgpt_chats') || '{}');
        chats[currentChatId] = {
            id: currentChatId,
            title: chatTitle,
            messages: messages,
            timestamp: new Date().toISOString()
        };
        
        localStorage.setItem('wormgpt_chats', JSON.stringify(chats));
        loadChatHistory();
    } else {
        const chats = JSON.parse(localStorage.getItem('wormgpt_chats') || '{}');
        if (chats[currentChatId]) {
            chats[currentChatId].messages = messages;
            chats[currentChatId].timestamp = new Date().toISOString();
            localStorage.setItem('wormgpt_chats', JSON.stringify(chats));
        }
    }
}

function handleImageUpload(file) {
    if (!file.type.startsWith('image/')) {
        showToast('Please upload an image file', 'error');
        return;
    }
    
    if (file.size > 5 * 1024 * 1024) { // 5MB limit
        showToast('Image size should be less than 5MB', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const imagePreview = document.getElementById('imagePreview');
        imagePreview.innerHTML = `
            <img src="${e.target.result}" alt="Uploaded image">
            <div style="margin-top: 10px;">
                <button class="btn-primary" onclick="sendImageMessage('${e.target.result}')">
                    Send with Message
                </button>
                <button class="btn-secondary" onclick="clearImagePreview()">
                    Remove
                </button>
            </div>
        `;
        imagePreview.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

function sendImageMessage(imageData) {
    // For now, we'll just send a text message about the image
    // In a real implementation, you would send the image to the API
    addMessage('user', `[Image uploaded] ${userInput.value || 'Analyze this image'}`);
    userInput.value = '';
    
    imageModal.classList.remove('active');
    document.getElementById('imagePreview').style.display = 'none';
    document.getElementById('imagePreview').innerHTML = '';
    
    // You would need to implement image analysis API call here
    showToast('Image analysis feature coming soon!', 'info');
}

function clearImagePreview() {
    document.getElementById('imagePreview').style.display = 'none';
    document.getElementById('imagePreview').innerHTML = '';
    document.getElementById('fileInput').value = '';
}

function saveSettings() {
    const apiKey = document.getElementById('apiKey').value.trim();
    const temperature = parseFloat(document.getElementById('temperature').value);
    const language = document.getElementById('languageSelect').value;
    
    fetch('/api/update_config', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            api_key: apiKey,
            temperature: temperature,
            language: language
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showToast('Settings saved successfully!', 'success');
            settingsModal.classList.remove('active');
            loadConfig(); // Reload config to update UI
        } else {
            showToast('Failed to save settings', 'error');
        }
    })
    .catch(err => {
        showToast('Error saving settings', 'error');
    });
}

function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? 'fa-check-circle' :
                 type === 'error' ? 'fa-exclamation-circle' :
                 type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle';
    
    toast.innerHTML = `
        <i class="fas ${icon}"></i>
        <span>${message}</span>
    `;
    
    toastContainer.appendChild(toast);
    
    // Remove toast after 3 seconds
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Add custom CSS for code blocks
const style = document.createElement('style');
style.textContent = `
    .code-block {
        background: var(--bg-primary);
        border-radius: 8px;
        margin: 10px 0;
        overflow: hidden;
        border: 1px solid var(--border-color);
    }
    
    .code-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 16px;
        background: var(--bg-tertiary);
        border-bottom: 1px solid var(--border-color);
        font-size: 14px;
        color: var(--text-secondary);
    }
    
    .code-header button {
        background: var(--primary);
        color: white;
        border: none;
        padding: 4px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
    }
    
    .code-header button:hover {
        background: var(--primary-dark);
    }
    
    pre {
        margin: 0;
        padding: 16px;
        overflow-x: auto;
    }
    
    code {
        font-family: 'Courier New', monospace;
        font-size: 14px;
    }
    
    .keyword {
        color: #ff79c6;
    }
    
    .status-streaming {
        color: #f59e0b !important;
        font-weight: 600;
    }
`;
document.head.appendChild(style);
