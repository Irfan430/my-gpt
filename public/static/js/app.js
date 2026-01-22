// DOM Elements
const messagesEl = document.getElementById("messages");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status");
const newChatBtn = document.getElementById("newChat");
const convList = document.getElementById("conversationList");
const conversationTitle = document.getElementById("conversationTitle");
const modelBadge = document.getElementById("modelBadge");
const totalConversations = document.getElementById("totalConversations");
const totalMessages = document.getElementById("totalMessages");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const refreshConvs = document.getElementById("refreshConvs");
const archiveBtn = document.getElementById("archiveBtn");
const settingsBtn = document.getElementById("settingsBtn");
const exportBtn = document.getElementById("exportBtn");
const clearBtn = document.getElementById("clearBtn");
const settingsModal = document.getElementById("settingsModal");
const closeModalBtns = document.querySelectorAll(".close-modal");

// State
let conversation_id = localStorage.getItem("conversation_id") || "";
let streaming = false;
let eventSource = null;
let currentConversation = null;

/* ---------- INITIALIZATION ---------- */
document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
    loadStats();
    loadConversations();
    loadModel();
    
    // Check if there's an active conversation
    if (conversation_id) {
        loadConversation(conversation_id);
    }
});

/* ---------- RENDER FUNCTIONS ---------- */
function renderMessage(text, role, timestamp = null) {
    const div = document.createElement("div");
    div.className = `msg ${role}`;
    
    if (/error|exception|traceback/i.test(text)) {
        div.classList.add("error");
    }
    
    const time = timestamp || new Date().toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    const formattedText = formatText(text);
    
    div.innerHTML = `
        <div class="message-header">
            <span class="message-role">${role === 'user' ? 'You' : 'WormGPT'}</span>
            <span class="message-time">${time}</span>
        </div>
        <div class="message-content">${formattedText}</div>
    `;
    
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    
    // Add copy buttons to code blocks
    setTimeout(() => {
        div.querySelectorAll('pre').forEach(pre => {
            if (!pre.querySelector('.copy-btn')) {
                const copyBtn = document.createElement('button');
                copyBtn.className = 'copy-btn';
                copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
                copyBtn.onclick = () => {
                    const code = pre.querySelector('code')?.textContent || pre.textContent;
                    navigator.clipboard.writeText(code).then(() => {
                        copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                        copyBtn.classList.add('copied');
                        setTimeout(() => {
                            copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
                            copyBtn.classList.remove('copied');
                        }, 2000);
                    });
                };
                prependChild(pre, copyBtn);
            }
        });
    }, 100);
}

function prependChild(parent, child) {
    if (parent.firstChild) {
        parent.insertBefore(child, parent.firstChild);
    } else {
        parent.appendChild(child);
    }
}

function formatText(text) {
    // Convert markdown-like formatting
    let formatted = text
        // Bold
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        // Italic
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        // Inline code
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        // Code blocks with language
        .replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
            const escaped = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<pre><code class="language-${lang || 'text'}">${escaped}</code></pre>`;
        })
        // Lists
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
        // Headers
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        // Line breaks
        .replace(/\n/g, '<br>');
    
    return formatted;
}

/* ---------- MESSAGE SENDING ---------- */
sendBtn.onclick = () => send();
input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
    }
});

function send() {
    if (streaming) return;
    
    const text = input.value.trim();
    if (!text) return;
    
    // If no conversation exists, create one
    if (!conversation_id) {
        createNewConversation(text.substring(0, 50));
    }
    
    renderMessage(text, "user");
    input.value = "";
    
    streaming = true;
    statusEl.innerHTML = '<i class="fas fa-circle status-thinking"></i> Thinking...';
    sendBtn.disabled = true;
    stopBtn.classList.remove("hidden");
    
    const url = `/api/chat/stream?message=${encodeURIComponent(text)}&conversation_id=${conversation_id}`;
    eventSource = new EventSource(url);
    
    let fullResponse = "";
    let responseDiv = null;
    
    eventSource.onmessage = e => {
        if (e.data === "[DONE]") {
            streaming = false;
            sendBtn.disabled = false;
            stopBtn.classList.add("hidden");
            statusEl.innerHTML = '<i class="fas fa-circle status-ready"></i> Ready';
            eventSource.close();
            
            // Update conversation list
            loadConversations();
            
            // Auto-resize input
            input.style.height = 'auto';
            return;
        }
        
        try {
            const data = JSON.parse(e.data);
            
            if (data.content) {
                fullResponse += data.content;
                
                if (!responseDiv) {
                    responseDiv = document.createElement("div");
                    responseDiv.className = "msg bot";
                    responseDiv.id = "streaming-response";
                    messagesEl.appendChild(responseDiv);
                }
                
                responseDiv.innerHTML = `
                    <div class="message-header">
                        <span class="message-role">WormGPT</span>
                        <span class="message-time">${new Date().toLocaleTimeString()}</span>
                    </div>
                    <div class="message-content">${formatText(fullResponse)}</div>
                `;
                
                messagesEl.scrollTop = messagesEl.scrollHeight;
            }
            
            if (data.error) {
                renderMessage(`Error: ${data.error}`, "bot");
                eventSource.close();
                streaming = false;
                sendBtn.disabled = false;
                stopBtn.classList.add("hidden");
                statusEl.innerHTML = '<i class="fas fa-circle status-error"></i> Error';
            }
        } catch (error) {
            console.error("Error parsing SSE data:", error);
        }
    };
    
    eventSource.onerror = (error) => {
        console.error("EventSource error:", error);
        renderMessage("Connection error. Please try again.", "bot");
        eventSource.close();
        streaming = false;
        sendBtn.disabled = false;
        stopBtn.classList.add("hidden");
        statusEl.innerHTML = '<i class="fas fa-circle status-error"></i> Error';
    };
}

/* ---------- STOP STREAMING ---------- */
stopBtn.onclick = () => {
    if (eventSource) {
        eventSource.close();
        streaming = false;
        sendBtn.disabled = false;
        stopBtn.classList.add("hidden");
        statusEl.innerHTML = '<i class="fas fa-circle status-ready"></i> Stopped';
    }
};

/* ---------- CONVERSATION MANAGEMENT ---------- */
function createNewConversation(title = null) {
    fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title || "New Conversation" })
    })
    .then(r => r.json())
    .then(data => {
        conversation_id = data.id;
        localStorage.setItem("conversation_id", conversation_id);
        conversationTitle.textContent = data.title || "New Conversation";
        messagesEl.innerHTML = "";
        loadConversations();
    });
}

newChatBtn.onclick = () => {
    if (streaming) return;
    
    conversation_id = "";
    localStorage.removeItem("conversation_id");
    messagesEl.innerHTML = "";
    conversationTitle.textContent = "New Conversation";
    statusEl.innerHTML = '<i class="fas fa-circle status-ready"></i> New chat';
    
    // Show welcome message
    const welcomeMsg = document.querySelector('.welcome-message');
    if (welcomeMsg) {
        welcomeMsg.style.display = 'block';
    }
    
    loadConversations();
};

function loadConversation(id) {
    fetch(`/api/conversation/${id}`)
        .then(r => r.json())
        .then(conv => {
            currentConversation = conv;
            conversation_id = id;
            localStorage.setItem("conversation_id", id);
            conversationTitle.textContent = conv.title;
            modelBadge.textContent = conv.model || "deepseek-chat";
            
            // Hide welcome message
            const welcomeMsg = document.querySelector('.welcome-message');
            if (welcomeMsg) {
                welcomeMsg.style.display = 'none';
            }
            
            // Clear and render messages
            messagesEl.innerHTML = "";
            conv.messages.forEach(msg => {
                const time = new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                });
                renderMessage(msg.content, msg.role, time);
            });
            
            // Update active conversation in list
            document.querySelectorAll('#conversationList li').forEach(li => {
                li.classList.remove('active');
                if (li.dataset.id === id) {
                    li.classList.add('active');
                }
            });
        });
}

function loadConversations() {
    fetch('/api/conversations')
        .then(r => r.json())
        .then(list => {
            convList.innerHTML = "";
            totalConversations.textContent = list.length;
            
            list.forEach(conv => {
                const li = document.createElement("li");
                li.dataset.id = conv.id;
                
                if (conv.id === conversation_id) {
                    li.classList.add("active");
                }
                
                const time = new Date(conv.updated_at).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric'
                });
                
                li.innerHTML = `
                    <div class="conv-title">${conv.title}</div>
                    <div class="conversation-meta">
                        <span>${conv.message_count} msgs</span>
                        <span>${time}</span>
                    </div>
                `;
                
                li.onclick = () => {
                    if (streaming) return;
                    loadConversation(conv.id);
                };
                
                convList.appendChild(li);
            });
            
            loadStats();
        });
}

function searchConversations(query) {
    if (!query.trim()) {
        loadConversations();
        return;
    }
    
    fetch(`/api/search?q=${encodeURIComponent(query)}`)
        .then(r => r.json())
        .then(results => {
            convList.innerHTML = "";
            
            if (results.length === 0) {
                const li = document.createElement("li");
                li.textContent = "No results found";
                li.style.padding = "20px";
                li.style.textAlign = "center";
                li.style.color = "#8b949e";
                convList.appendChild(li);
                return;
            }
            
            results.forEach(conv => {
                const li = document.createElement("li");
                li.dataset.id = conv.id;
                
                li.innerHTML = `
                    <div class="conv-title">${conv.title}</div>
                    <div class="conv-snippet">${conv.snippet || ''}</div>
                    <div class="conversation-meta">
                        <span>${new Date(conv.updated_at).toLocaleDateString()}</span>
                    </div>
                `;
                
                li.onclick = () => {
                    if (streaming) return;
                    loadConversation(conv.id);
                };
                
                convList.appendChild(li);
            });
        });
}

/* ---------- STATISTICS ---------- */
function loadStats() {
    fetch('/api/stats')
        .then(r => r.json())
        .then(stats => {
            totalConversations.textContent = stats.total_conversations.toLocaleString();
            totalMessages.textContent = stats.total_messages.toLocaleString();
        });
}

/* ---------- CONFIGURATION ---------- */
function loadConfig() {
    fetch('/api/config')
        .then(r => r.json())
        .then(config => {
            // Update current model
            document.getElementById('currentModel').textContent = config.model;
            modelBadge.textContent = config.model;
            
            // Update settings form
            document.getElementById('apiKey').value = config.api_key || '';
            document.getElementById('modelSelect').value = config.model;
            document.getElementById('temperature').value = config.temperature;
            document.getElementById('tempValue').textContent = config.temperature;
            document.getElementById('contextWindow').value = config.context_window;
            document.getElementById('ctxValue').textContent = config.context_window;
            document.getElementById('enableCache').checked = config.enable_cache;
            document.getElementById('autoBackup').checked = config.auto_backup;
        });
}

function loadModel() {
    fetch('/api/config')
        .then(r => r.json())
        .then(config => {
            const modelBtn = document.querySelector('.model-selector');
            if (modelBtn) {
                modelBtn.querySelector('span').textContent = config.model;
            }
        });
}

/* ---------- EVENT HANDLERS ---------- */
searchBtn.onclick = () => {
    searchConversations(searchInput.value);
};

searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        searchConversations(searchInput.value);
    }
});

refreshConvs.onclick = () => {
    loadConversations();
};

archiveBtn.onclick = () => {
    if (conversation_id) {
        if (confirm('Archive this conversation?')) {
            fetch(`/api/conversation/${conversation_id}/archive`, { method: 'POST' })
                .then(() => {
                    loadConversations();
                    newChatBtn.click();
                });
        }
    }
};

settingsBtn.onclick = () => {
    settingsModal.classList.remove('hidden');
};

closeModalBtns.forEach(btn => {
    btn.onclick = () => {
        settingsModal.classList.add('hidden');
    };
});

exportBtn.onclick = () => {
    if (conversation_id) {
        window.open(`/api/export/${conversation_id}?format=json`, '_blank');
    }
};

clearBtn.onclick = () => {
    if (conversation_id && confirm('Clear all messages in this conversation?')) {
        fetch(`/api/conversation/${conversation_id}/clear`, { method: 'POST' })
            .then(() => {
                messagesEl.innerHTML = "";
            });
    }
};

// Auto-resize textarea
input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 200) + 'px';
});

// Close modal on outside click
window.onclick = (event) => {
    if (event.target === settingsModal) {
        settingsModal.classList.add('hidden');
    }
};

// Save settings
document.getElementById('saveSettings').onclick = () => {
    const settings = {
        api_key: document.getElementById('apiKey').value,
        model: document.getElementById('modelSelect').value,
        temperature: parseFloat(document.getElementById('temperature').value),
        context_window: parseInt(document.getElementById('contextWindow').value),
        enable_cache: document.getElementById('enableCache').checked,
        auto_backup: document.getElementById('autoBackup').checked
    };
    
    fetch('/api/update_config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
    })
    .then(r => r.json())
    .then(result => {
        if (result.success) {
            alert('Settings saved successfully!');
            settingsModal.classList.add('hidden');
            loadConfig();
            loadModel();
        } else {
            alert('Error saving settings: ' + result.error);
        }
    });
};

// Update slider values
document.getElementById('temperature').addEventListener('input', (e) => {
    document.getElementById('tempValue').textContent = e.target.value;
});

document.getElementById('contextWindow').addEventListener('input', (e) => {
    document.getElementById('ctxValue').textContent = e.target.value;
});