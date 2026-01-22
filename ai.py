import sys
import os
import platform
import time
import json
import requests
import threading
import subprocess
import traceback
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, Response, send_from_directory, send_file
import webbrowser
from pathlib import Path
import sqlite3
import hashlib

try:
    import pyfiglet
except ImportError:
    subprocess.run([sys.executable, "-m", "pip", "install", "pyfiglet", "--quiet"], check=False)
    import pyfiglet

try:
    from langdetect import detect
except ImportError:
    subprocess.run([sys.executable, "-m", "pip", "install", "langdetect", "--quiet"], check=False)
    from langdetect import detect

try:
    from flask import Flask
except ImportError:
    subprocess.run([sys.executable, "-m", "pip", "install", "flask", "--quiet"], check=False)
    from flask import Flask

try:
    from flask_cors import CORS
except ImportError:
    subprocess.run([sys.executable, "-m", "pip", "install", "flask-cors", "--quiet"], check=False)
    from flask_cors import CORS

class colors:
    black = "\033[0;30m"
    red = "\033[0;31m"
    green = "\033[0;32m"
    yellow = "\033[0;33m"
    blue = "\033[0;34m"
    purple = "\033[0;35m"
    cyan = "\033[0;36m"
    white = "\033[0;37m"
    bright_black = "\033[1;30m"
    bright_red = "\033[1;31m"
    bright_green = "\033[1;32m"
    bright_yellow = "\033[1;33m"
    bright_blue = "\033[1;34m"
    bright_purple = "\033[1;35m"
    bright_cyan = "\033[1;36m"
    bright_white = "\033[1;37m"
    reset = "\033[0m"
    bold = "\033[1m"

# Configuration
CONFIG_FILE = "wormgpt_config.json"
PROMPT_FILE = "system-prompt.txt"
CONVERSATIONS_DIR = "conversations"
CACHE_DIR = "cache"
DATABASE_FILE = "wormgpt.db"
DEFAULT_API_KEY = ""
DEFAULT_BASE_URL = "https://api.deepseek.com"
DEFAULT_MODEL = "deepseek-chat"
SUPPORTED_LANGUAGES = ["English", "Indonesian", "Spanish", "Arabic", "Thai", "Portuguese", "Bengali", "Hindi", "Chinese", "Japanese", "Korean", "French", "German", "Russian"]
AVAILABLE_MODELS = ["deepseek-chat", "deepseek-coder"]

# DeepSeek API Limits
MAX_TOKENS_LIMIT = 8192  # DeepSeek এর maximum limit
MAX_CONTEXT_WINDOW = 128000  # Context window limit
MAX_INPUT_TOKENS = 4096  # Input token limit
MAX_OUTPUT_TOKENS = 4096  # Output token limit

# Global variables
webui_app = None
webui_thread = None
webui_running = False

# Create necessary directories
Path(CONVERSATIONS_DIR).mkdir(exist_ok=True)
Path(CACHE_DIR).mkdir(exist_ok=True)

# ============ DATABASE FUNCTIONS ============
def init_database():
    """Initialize SQLite database for persistent storage"""
    conn = sqlite3.connect(DATABASE_FILE)
    cursor = conn.cursor()
    
    # Conversations table with unlimited history
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        model TEXT,
        context_window INTEGER DEFAULT 128000,
        token_count INTEGER DEFAULT 0,
        settings TEXT,
        is_archived INTEGER DEFAULT 0
    )
    ''')
    
    # Messages table with no deletion limit
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tokens INTEGER DEFAULT 0,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES conversations (id)
    )
    ''')
    
    # Create indexes for performance
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_conversation_id ON messages (conversation_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_conversation_updated ON conversations (updated_at)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages (timestamp)')
    
    # Cache table for API responses
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS cache (
        hash TEXT PRIMARY KEY,
        query TEXT NOT NULL,
        response TEXT NOT NULL,
        model TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP
    )
    ''')
    
    # Settings table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )
    ''')
    
    conn.commit()
    conn.close()

def get_db_connection():
    """Get database connection with row factory"""
    conn = sqlite3.connect(DATABASE_FILE)
    conn.row_factory = sqlite3.Row
    return conn

# ============ CONFIGURATION FUNCTIONS ============
def load_config():
    """Load configuration from JSON file"""
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                config = json.load(f)
                # Set defaults for any missing keys
                default_config = create_default_config()
                for key in default_config:
                    if key not in config:
                        config[key] = default_config[key]
                return config
        except Exception as e:
            print(f"{colors.red}Error loading config: {e}{colors.reset}")
            return create_default_config()
    else:
        return create_default_config()

def create_default_config():
    """Create default configuration"""
    return {
        "api_key": DEFAULT_API_KEY,
        "base_url": DEFAULT_BASE_URL,
        "model": DEFAULT_MODEL,
        "language": "English",
        "temperature": 0.7,
        "top_p": 0.9,
        "webui_port": 5000,
        "webui_enabled": False,
        "stream": True,
        "max_history": 0,  # 0 means unlimited
        "max_tokens": MAX_TOKENS_LIMIT,  # DeepSeek limit
        "auto_save": True,
        "auto_scroll": True,
        "dark_mode": True,
        "context_window": MAX_CONTEXT_WINDOW,
        "max_input_tokens": MAX_INPUT_TOKENS,
        "max_output_tokens": MAX_OUTPUT_TOKENS,
        "enable_cache": True,
        "cache_ttl_days": 30,
        "auto_backup": True,
        "backup_interval_hours": 24,
        "enable_compression": True,
        "compression_level": 6,
        "conversation_retention_days": 0,  # 0 means forever
        "enable_search": True,
        "search_index_interval": 3600
    }

def save_config(config):
    """Save configuration to JSON file"""
    try:
        # Ensure token limits are within API limits
        config["max_tokens"] = min(config.get("max_tokens", MAX_TOKENS_LIMIT), MAX_TOKENS_LIMIT)
        config["max_output_tokens"] = min(config.get("max_output_tokens", MAX_OUTPUT_TOKENS), MAX_TOKENS_LIMIT)
        
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"{colors.red}Error saving config: {e}{colors.reset}")
        return False

# ============ CONVERSATION FUNCTIONS ============
def create_new_conversation(title=None):
    """Create a new conversation with unlimited retention"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    conversation_id = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
    
    if not title:
        title = "New Conversation"
    
    config = load_config()
    
    cursor.execute('''
    INSERT INTO conversations (id, title, model, context_window, settings)
    VALUES (?, ?, ?, ?, ?)
    ''', (
        conversation_id,
        title,
        config["model"],
        config["context_window"],
        json.dumps(config)
    ))
    
    conn.commit()
    conn.close()
    
    # Also create JSON backup file
    backup_conversation_to_json(conversation_id)
    
    return conversation_id

def backup_conversation_to_json(conversation_id):
    """Backup conversation to JSON file"""
    conversation = load_conversation(conversation_id)
    if conversation:
        conversation_file = os.path.join(CONVERSATIONS_DIR, f"{conversation_id}.json")
        try:
            with open(conversation_file, "w", encoding="utf-8") as f:
                json.dump(conversation, f, indent=2, ensure_ascii=False)
        except:
            pass

def load_conversation(conversation_id):
    """Load conversation from database"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get conversation details
    cursor.execute('SELECT * FROM conversations WHERE id = ?', (conversation_id,))
    conv_row = cursor.fetchone()
    
    if not conv_row:
        conn.close()
        return None
    
    # Get all messages (no limit)
    cursor.execute('''
    SELECT role, content, tokens, timestamp 
    FROM messages 
    WHERE conversation_id = ? 
    ORDER BY timestamp ASC
    ''', (conversation_id,))
    
    messages = []
    for row in cursor.fetchall():
        messages.append({
            "role": row["role"],
            "content": row["content"],
            "tokens": row["tokens"] or 0,
            "timestamp": row["timestamp"]
        })
    
    conn.close()
    
    return {
        "id": conv_row["id"],
        "title": conv_row["title"],
        "created_at": conv_row["created_at"],
        "updated_at": conv_row["updated_at"],
        "model": conv_row["model"] or "deepseek-chat",
        "context_window": conv_row["context_window"] or MAX_CONTEXT_WINDOW,
        "token_count": conv_row["token_count"] or 0,
        "messages": messages,
        "settings": json.loads(conv_row["settings"]) if conv_row["settings"] else {}
    }

def save_conversation_message(conversation_id, role, content, tokens=0):
    """Save message to conversation (unlimited storage)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Save message
    cursor.execute('''
    INSERT INTO messages (conversation_id, role, content, tokens)
    VALUES (?, ?, ?, ?)
    ''', (conversation_id, role, content, tokens))
    
    # Update conversation token count and timestamp
    cursor.execute('''
    UPDATE conversations 
    SET token_count = token_count + ?, 
        updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
    ''', (tokens, conversation_id))
    
    # Update title if this is first user message
    if role == "user":
        cursor.execute('SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?', (conversation_id,))
        count = cursor.fetchone()["count"]
        if count == 1:  # First message
            title = content[:150]
            if len(content) > 150:
                title = title + "..."
            cursor.execute('UPDATE conversations SET title = ? WHERE id = ?', (title, conversation_id))
    
    conn.commit()
    conn.close()
    
    # Auto-backup
    config = load_config()
    if config.get("auto_backup", True):
        backup_conversation_to_json(conversation_id)
    
    return True

def get_conversation_messages(conversation_id, limit=None):
    """Get conversation messages (all or limited)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = '''
    SELECT role, content, tokens, timestamp 
    FROM messages 
    WHERE conversation_id = ? 
    ORDER BY timestamp ASC
    '''
    
    if limit:
        query += f' LIMIT {limit}'
    
    cursor.execute(query, (conversation_id,))
    
    messages = []
    for row in cursor.fetchall():
        messages.append({
            "role": row["role"],
            "content": row["content"],
            "tokens": row["tokens"] or 0,
            "timestamp": row["timestamp"]
        })
    
    conn.close()
    return messages

def list_conversations(limit=100, offset=0, search=None):
    """List all conversations with optional search"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = '''
    SELECT c.id, c.title, c.created_at, c.updated_at, c.model, 
           c.context_window, c.token_count,
           COUNT(m.id) as message_count
    FROM conversations c
    LEFT JOIN messages m ON c.id = m.conversation_id
    WHERE c.is_archived = 0
    '''
    
    params = []
    
    if search:
        query += ''' AND (
            c.title LIKE ? OR 
            EXISTS (
                SELECT 1 FROM messages m2 
                WHERE m2.conversation_id = c.id 
                AND m2.content LIKE ?
            )
        )'''
        search_term = f"%{search}%"
        params.extend([search_term, search_term])
    
    query += '''
    GROUP BY c.id
    ORDER BY c.updated_at DESC
    LIMIT ? OFFSET ?
    '''
    
    params.extend([limit, offset])
    
    cursor.execute(query, params)
    
    conversations = []
    for row in cursor.fetchall():
        conversations.append({
            "id": row["id"],
            "title": row["title"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "model": row["model"],
            "context_window": row["context_window"],
            "token_count": row["token_count"],
            "message_count": row["message_count"]
        })
    
    conn.close()
    return conversations

def delete_conversation(conversation_id):
    """Delete conversation (manual deletion only)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Delete messages
    cursor.execute('DELETE FROM messages WHERE conversation_id = ?', (conversation_id,))
    
    # Delete conversation
    cursor.execute('DELETE FROM conversations WHERE id = ?', (conversation_id,))
    
    conn.commit()
    conn.close()
    
    # Delete JSON backup
    conversation_file = os.path.join(CONVERSATIONS_DIR, f"{conversation_id}.json")
    if os.path.exists(conversation_file):
        try:
            os.remove(conversation_file)
        except:
            pass
    
    return True

def archive_conversation(conversation_id, archive=True):
    """Archive or unarchive conversation"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('UPDATE conversations SET is_archived = ? WHERE id = ?', 
                   (1 if archive else 0, conversation_id))
    
    conn.commit()
    conn.close()
    return True

def search_conversations(query, limit=50):
    """Search across all conversations"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    search_query = f"%{query}%"
    
    cursor.execute('''
    SELECT DISTINCT c.id, c.title, c.updated_at,
           (SELECT m.content FROM messages m 
            WHERE m.conversation_id = c.id 
            AND m.content LIKE ? 
            LIMIT 1) as snippet
    FROM conversations c
    JOIN messages m ON c.id = m.conversation_id
    WHERE m.content LIKE ? OR c.title LIKE ?
    ORDER BY c.updated_at DESC
    LIMIT ?
    ''', (search_query, search_query, search_query, limit))
    
    results = []
    for row in cursor.fetchall():
        results.append({
            "id": row["id"],
            "title": row["title"],
            "updated_at": row["updated_at"],
            "snippet": row["snippet"][:200] + "..." if row["snippet"] and len(row["snippet"]) > 200 else row["snippet"]
        })
    
    conn.close()
    return results

# ============ CACHE FUNCTIONS ============
def get_cache_hash(query, model, context):
    """Generate cache hash"""
    cache_string = f"{query}|{model}|{json.dumps(context, sort_keys=True)}"
    return hashlib.md5(cache_string.encode()).hexdigest()

def get_cached_response(query, model, context):
    """Get cached response if exists and not expired"""
    config = load_config()
    if not config.get("enable_cache", True):
        return None
    
    cache_hash = get_cache_hash(query, model, context)
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
    SELECT response FROM cache 
    WHERE hash = ? AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    ''', (cache_hash,))
    
    row = cursor.fetchone()
    conn.close()
    
    return row["response"] if row else None

def cache_response(query, model, context, response, ttl_days=None):
    """Cache API response"""
    config = load_config()
    if not config.get("enable_cache", True):
        return
    
    if ttl_days is None:
        ttl_days = config.get("cache_ttl_days", 30)
    
    cache_hash = get_cache_hash(query, model, context)
    
    expires_at = None
    if ttl_days > 0:
        expires_at = (datetime.now() + timedelta(days=ttl_days)).isoformat()
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
    INSERT OR REPLACE INTO cache (hash, query, response, model, expires_at)
    VALUES (?, ?, ?, ?, ?)
    ''', (cache_hash, query[:500], response, model, expires_at))
    
    conn.commit()
    conn.close()

# ============ API FUNCTIONS ============
def get_system_prompt():
    """Get system prompt from file"""
    try:
        if os.path.exists(PROMPT_FILE):
            with open(PROMPT_FILE, "r", encoding="utf-8") as f:
                content = f.read().strip()
                if content:
                    return content
        return "You are WormGPT, an advanced AI assistant with 128K token context window. You can handle very large projects and long conversations. You should provide detailed, comprehensive responses."
    except:
        return "You are WormGPT, an advanced AI assistant with 128K token context window. You can handle very large projects and long conversations. You should provide detailed, comprehensive responses."

def estimate_tokens(text):
    """Estimate token count"""
    return len(text) // 4

def smart_context_management(messages, max_context_tokens=MAX_CONTEXT_WINDOW):
    """Smart context management for large conversations"""
    if not messages:
        return messages
    
    total_tokens = sum(msg.get("tokens", estimate_tokens(msg["content"])) for msg in messages)
    
    if total_tokens <= max_context_tokens:
        return messages
    
    # Keep important parts: first 20%, last 60%, and every 10th message in between
    total_msgs = len(messages)
    keep_indices = set()
    
    # First 20%
    keep_indices.update(range(int(total_msgs * 0.2)))
    
    # Last 60%
    keep_indices.update(range(int(total_msgs * 0.4), total_msgs))
    
    # Every 10th message in middle
    for i in range(int(total_msgs * 0.2), int(total_msgs * 0.4), 10):
        keep_indices.add(i)
    
    # Always keep system messages if present
    for i, msg in enumerate(messages):
        if msg.get("role") == "system":
            keep_indices.add(i)
    
    # Sort indices and get messages
    sorted_indices = sorted(keep_indices)
    return [messages[i] for i in sorted_indices if i < len(messages)]

def call_api_stream(user_input, conversation_id, model=None, for_webui=True):
    """Call API with streaming response"""
    config = load_config()
    
    if not config.get("api_key"):
        error_msg = "API key not set. Please set your API key in settings."
        if for_webui:
            yield f"data: {json.dumps({'error': error_msg})}\n\n"
        else:
            print(f"{colors.red}{error_msg}{colors.reset}")
        return
    
    current_model = model or config["model"]
    
    # Check cache first
    messages = get_conversation_messages(conversation_id)
    context_hash = json.dumps([{"role": m["role"], "content": m["content"]} for m in messages[-20:]], sort_keys=True)
    
    cached = get_cached_response(user_input, current_model, context_hash)
    if cached and config.get("enable_cache", True):
        # Return cached response
        user_tokens = estimate_tokens(user_input)
        save_conversation_message(conversation_id, "user", user_input, user_tokens)
        
        assistant_tokens = estimate_tokens(cached)
        save_conversation_message(conversation_id, "assistant", cached, assistant_tokens)
        
        if for_webui:
            # Stream cached response like real API
            for i in range(0, len(cached), 10):
                chunk = cached[i:i+10]
                yield f"data: {json.dumps({'content': chunk})}\n\n"
                time.sleep(0.01)
            yield "data: [DONE]\n\n"
        else:
            print(cached)
        return
    
    # Prepare API messages
    messages = get_conversation_messages(conversation_id)
    api_messages = []
    
    # Add system prompt
    api_messages.append({"role": "system", "content": get_system_prompt()})
    
    # Smart context management
    context_messages = smart_context_management(messages, config.get("context_window", MAX_CONTEXT_WINDOW))
    api_messages.extend([{"role": msg["role"], "content": msg["content"]} for msg in context_messages])
    
    # Add current user message
    api_messages.append({"role": "user", "content": user_input})
    
    try:
        headers = {
            "Authorization": f"Bearer {config['api_key']}",
            "Content-Type": "application/json"
        }
        
        # DeepSeek API requires max_tokens between 1 and 8192
        max_tokens = min(config.get("max_output_tokens", MAX_OUTPUT_TOKENS), MAX_TOKENS_LIMIT)
        
        data = {
            "model": current_model,
            "messages": api_messages,
            "temperature": config.get("temperature", 0.7),
            "top_p": config.get("top_p", 0.9),
            "max_tokens": max_tokens,  # Fixed: Within DeepSeek limits
            "stream": True
        }
        
        response = requests.post(
            f"{config['base_url']}/chat/completions",
            headers=headers,
            json=data,
            stream=True,
            timeout=300
        )
        
        if response.status_code != 200:
            error_msg = f"API Error {response.status_code}: {response.text[:200]}"
            if for_webui:
                yield f"data: {json.dumps({'error': error_msg})}\n\n"
            else:
                print(f"{colors.red}{error_msg}{colors.reset}")
            return
        
        full_response = ""
        for line in response.iter_lines():
            if line:
                line = line.decode('utf-8', errors='ignore')
                if line.startswith('data: '):
                    data_str = line[6:]
                    if data_str != '[DONE]':
                        try:
                            json_data = json.loads(data_str)
                            if 'choices' in json_data and len(json_data['choices']) > 0:
                                delta = json_data['choices'][0].get('delta', {})
                                if 'content' in delta:
                                    content = delta['content']
                                    full_response += content
                                    if for_webui:
                                        yield f"data: {json.dumps({'content': content})}\n\n"
                                    else:
                                        sys.stdout.write(content)
                                        sys.stdout.flush()
                        except:
                            continue
        
        # Save to conversation
        user_tokens = estimate_tokens(user_input)
        assistant_tokens = estimate_tokens(full_response)
        
        save_conversation_message(conversation_id, "user", user_input, user_tokens)
        save_conversation_message(conversation_id, "assistant", full_response, assistant_tokens)
        
        # Cache the response
        cache_response(user_input, current_model, context_hash, full_response)
        
        if for_webui:
            yield f"data: [DONE]\n\n"
        
    except requests.exceptions.Timeout:
        error_msg = "Request timeout. Please try again."
        if for_webui:
            yield f"data: {json.dumps({'error': error_msg})}\n\n"
        else:
            print(f"{colors.red}{error_msg}{colors.reset}")
    except Exception as e:
        error_msg = f"Error: {str(e)}"
        if for_webui:
            yield f"data: {json.dumps({'error': error_msg})}\n\n"
        else:
            print(f"{colors.red}{error_msg}{colors.reset}")

# ============ WEBUI FUNCTIONS ============
def start_webui():
    """Start WebUI server"""
    global webui_app, webui_running
    
    config = load_config()
    port = config.get("webui_port", 5000)
    
    # Create Flask app
    webui_app = Flask(__name__, static_folder='public', static_url_path='')
    CORS(webui_app)
    
    # Serve static files
    @webui_app.route('/')
    def index():
        return send_from_directory('public', 'index.html')
    
    @webui_app.route('/<path:path>')
    def serve_static(path):
        if '.' in path:
            return send_from_directory('public', path)
        return send_from_directory('public', 'index.html')
    
    # API Routes
    @webui_app.route('/api/chat/stream')
    def api_chat_stream():
        message = request.args.get('message', '')
        model = request.args.get('model', None)
        conversation_id = request.args.get('conversation_id', '')
        
        if not message:
            def generate_error():
                yield f"data: {json.dumps({'error': 'No message provided'})}\n\n"
                yield "data: [DONE]\n\n"
            return Response(generate_error(), mimetype='text/event-stream')
        
        if not conversation_id:
            conversation_id = create_new_conversation()
        
        def generate():
            for chunk in call_api_stream(message, conversation_id, model=model, for_webui=True):
                yield chunk
        
        return Response(generate(), mimetype='text/event-stream')
    
    @webui_app.route('/api/chat', methods=['POST'])
    def api_chat():
        data = request.json
        user_message = data.get('message', '')
        conversation_id = data.get('conversation_id', '')
        
        if not user_message:
            return jsonify({'error': 'No message provided'}), 400
        
        if not conversation_id:
            conversation_id = create_new_conversation()
        
        # For non-streaming (not implemented in this version)
        return jsonify({'error': 'Use streaming endpoint', 'conversation_id': conversation_id})
    
    @webui_app.route('/api/config')
    def api_config():
        config = load_config()
        return jsonify(config)
    
    @webui_app.route('/api/conversations')
    def api_conversations():
        search = request.args.get('search', '')
        limit = int(request.args.get('limit', 100))
        offset = int(request.args.get('offset', 0))
        
        conversations = list_conversations(limit=limit, offset=offset, search=search)
        return jsonify(conversations)
    
    @webui_app.route('/api/conversation/<conversation_id>')
    def api_get_conversation(conversation_id):
        conversation = load_conversation(conversation_id)
        if conversation:
            return jsonify(conversation)
        return jsonify({'error': 'Conversation not found'}), 404
    
    @webui_app.route('/api/conversation/<conversation_id>', methods=['DELETE'])
    def api_delete_conversation(conversation_id):
        if delete_conversation(conversation_id):
            return jsonify({'success': True})
        return jsonify({'error': 'Failed to delete conversation'}), 404
    
    @webui_app.route('/api/conversation/<conversation_id>/archive', methods=['POST'])
    def api_archive_conversation(conversation_id):
        if archive_conversation(conversation_id):
            return jsonify({'success': True})
        return jsonify({'error': 'Failed to archive conversation'}), 404
    
    @webui_app.route('/api/conversation/<conversation_id>/clear', methods=['POST'])
    def api_clear_conversation(conversation_id):
        """Clear all messages from a conversation"""
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Delete all messages
        cursor.execute('DELETE FROM messages WHERE conversation_id = ?', (conversation_id,))
        
        # Reset token count
        cursor.execute('UPDATE conversations SET token_count = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
                      (conversation_id,))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True})
    
    @webui_app.route('/api/search')
    def api_search():
        query = request.args.get('q', '')
        if not query:
            return jsonify([])
        
        results = search_conversations(query)
        return jsonify(results)
    
    @webui_app.route('/api/stats')
    def api_stats():
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get total statistics
        cursor.execute('SELECT COUNT(*) as total_conversations FROM conversations WHERE is_archived = 0')
        total_conversations = cursor.fetchone()["total_conversations"]
        
        cursor.execute('SELECT COUNT(*) as total_messages FROM messages')
        total_messages = cursor.fetchone()["total_messages"]
        
        cursor.execute('SELECT SUM(token_count) as total_tokens FROM conversations')
        total_tokens = cursor.fetchone()["total_tokens"] or 0
        
        cursor.execute('''
        SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count
        FROM conversations 
        WHERE created_at > date('now', '-1 year')
        GROUP BY month
        ORDER BY month DESC
        LIMIT 12
        ''')
        
        monthly_stats = []
        for row in cursor.fetchall():
            monthly_stats.append({
                "month": row["month"],
                "count": row["count"]
            })
        
        conn.close()
        
        return jsonify({
            "total_conversations": total_conversations,
            "total_messages": total_messages,
            "total_tokens": total_tokens,
            "monthly_stats": monthly_stats,
            "database_size": os.path.getsize(DATABASE_FILE) if os.path.exists(DATABASE_FILE) else 0
        })
    
    @webui_app.route('/api/update_config', methods=['POST'])
    def api_update_config():
        try:
            data = request.json
            config = load_config()
            
            for key in ['api_key', 'model', 'language', 'temperature', 'top_p', 
                       'context_window', 'max_input_tokens', 'max_output_tokens',
                       'max_history', 'auto_save', 'dark_mode', 'enable_cache',
                       'cache_ttl_days', 'auto_backup', 'enable_compression',
                       'conversation_retention_days', 'enable_search']:
                if key in data:
                    if key in ['temperature', 'top_p']:
                        config[key] = float(data[key])
                    elif key in ['context_window', 'max_input_tokens', 'max_output_tokens',
                               'max_history', 'cache_ttl_days', 'conversation_retention_days']:
                        config[key] = int(data[key])
                        # Ensure token limits are within API limits
                        if key in ['max_output_tokens']:
                            config[key] = min(config[key], MAX_TOKENS_LIMIT)
                    elif key in ['auto_save', 'dark_mode', 'enable_cache', 'auto_backup',
                               'enable_compression', 'enable_search']:
                        config[key] = bool(data[key])
                    else:
                        config[key] = data[key]
            
            save_config(config)
            return jsonify({'success': True})
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500
    
    @webui_app.route('/api/export/<conversation_id>')
    def api_export_conversation(conversation_id):
        conversation = load_conversation(conversation_id)
        if conversation:
            # Convert to text format
            text = f"Conversation: {conversation['title']}\n"
            text += f"Date: {conversation['created_at']}\n"
            text += f"Model: {conversation['model']}\n"
            text += "=" * 50 + "\n\n"
            
            for msg in conversation['messages']:
                role = "User" if msg['role'] == 'user' else "Assistant"
                text += f"{role}: {msg['content']}\n\n"
            
            return Response(
                text,
                mimetype='text/plain',
                headers={'Content-Disposition': f'attachment; filename=conversation_{conversation_id}.txt'}
            )
        return jsonify({'error': 'Conversation not found'}), 404
    
    @webui_app.route('/api/ping')
    def api_ping():
        return jsonify({
            'status': 'ok', 
            'timestamp': datetime.now().isoformat(),
            'version': '4.0',
            'features': ['unlimited_history', 'caching', 'search', 'persistent_storage']
        })
    
    # Start WebUI
    webui_running = True
    print(f"\n{colors.bright_green}✅ WebUI Started!{colors.reset}")
    print(f"{colors.bright_cyan}🌐 Open: http://localhost:{port}{colors.reset}")
    print(f"{colors.bright_green}💾 Unlimited Conversation History Active!{colors.reset}")
    print(f"{colors.bright_green}🔍 Search Across All Conversations Active!{colors.reset}")
    print(f"{colors.bright_green}💿 Persistent Database Storage Active!{colors.reset}")
    print(f"{colors.yellow}⚠️  DeepSeek API Limit: Max 8192 tokens per response{colors.reset}")
    
    try:
        webbrowser.open(f"http://localhost:{port}")
    except:
        pass
    
    webui_app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False, threaded=True)

# ============ TERMINAL UI FUNCTIONS ============
def banner():
    """Display banner"""
    try:
        figlet = pyfiglet.Figlet(font="big")
        print(f"{colors.bright_red}{figlet.renderText('WormGPT')}{colors.reset}")
    except:
        print(f"{colors.bright_red}WormGPT{colors.reset}")
    print(f"{colors.bright_cyan}Unlimited Conversation v4.0 | Persistent Storage | WebUI{colors.reset}")
    print(f"{colors.bright_yellow}Made With ❤️  | {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}{colors.reset}\n")
    print(f"{colors.yellow}⚠️  Note: DeepSeek API supports max 8192 tokens per response{colors.reset}\n")

def clear_screen():
    """Clear terminal screen"""
    os.system("cls" if platform.system() == "Windows" else "clear")

def main_menu():
    """Display main menu"""
    while True:
        config = load_config()
        clear_screen()
        banner()
        
        # Auto-start WebUI if enabled
        if config.get("webui_enabled") and not webui_running:
            print(f"{colors.bright_green}🚀 Starting WebUI...{colors.reset}")
            webui_thread = threading.Thread(target=start_webui, daemon=True)
            webui_thread.start()
            time.sleep(2)
        
        print(f"{colors.bright_cyan}[ Main Menu - Unlimited Version ]{colors.reset}")
        print(f"{colors.yellow}1. Start Chat Session{colors.reset}")
        print(f"{colors.yellow}2. Manage Conversations{colors.reset}")
        print(f"{colors.yellow}3. Search Conversations{colors.reset}")
        print(f"{colors.yellow}4. System Settings{colors.reset}")
        print(f"{colors.yellow}5. WebUI Settings ({'✅ Active' if config.get('webui_enabled') else '❌ Inactive'}){colors.reset}")
        print(f"{colors.yellow}6. System Information{colors.reset}")
        print(f"{colors.yellow}7. Database Maintenance{colors.reset}")
        print(f"{colors.yellow}8. Exit{colors.reset}")
        
        if config.get("webui_enabled"):
            print(f"\n{colors.bright_green}🌐 WebUI Active: http://localhost:{config.get('webui_port', 5000)}{colors.reset}")
        
        try:
            choice = input(f"\n{colors.red}[>] Select (1-8): {colors.reset}")
            
            if choice == "1":
                chat_session()
            elif choice == "2":
                manage_conversations()
            elif choice == "3":
                search_conversations_ui()
            elif choice == "4":
                system_settings()
            elif choice == "5":
                toggle_webui()
            elif choice == "6":
                system_info()
            elif choice == "7":
                database_maintenance()
            elif choice == "8":
                print(f"{colors.bright_cyan}✓ Goodbye!{colors.reset}")
                sys.exit(0)
            else:
                print(f"{colors.red}✗ Invalid selection!{colors.reset}")
                time.sleep(1)
                
        except KeyboardInterrupt:
            print(f"\n{colors.red}✗ Cancelled!{colors.reset}")
            sys.exit(1)
        except Exception as e:
            print(f"\n{colors.red}✗ Error: {e}{colors.reset}")
            time.sleep(2)

def chat_session():
    """Terminal chat session"""
    config = load_config()
    clear_screen()
    banner()
    
    print(f"{colors.bright_cyan}[ Chat Session - Unlimited History ]{colors.reset}")
    
    # Select conversation
    conversations = list_conversations(limit=15)
    if conversations:
        print(f"{colors.yellow}Recent conversations:{colors.reset}")
        for i, conv in enumerate(conversations, 1):
            print(f"{colors.green}{i:2d}. {conv['title'][:80]}{colors.reset}")
            print(f"   Messages: {conv['message_count']:4d} | Tokens: {conv['token_count']:8d}")
        print(f"{colors.green}N. Start new conversation{colors.reset}")
        print(f"{colors.green}B. Back to menu{colors.reset}")
        
        try:
            choice = input(f"\n{colors.red}[>] Select (1-{len(conversations)}, N, B): {colors.reset}")
            if choice.upper() == 'B':
                return
            elif choice.upper() == 'N':
                title = input(f"{colors.red}[>] Conversation title: {colors.reset}").strip()
                conversation_id = create_new_conversation(title if title else None)
            elif choice.isdigit() and 1 <= int(choice) <= len(conversations):
                conversation_id = conversations[int(choice)-1]["id"]
            else:
                conversation_id = create_new_conversation()
        except:
            conversation_id = create_new_conversation()
    else:
        conversation_id = create_new_conversation()
    
    conversation = load_conversation(conversation_id)
    
    clear_screen()
    banner()
    print(f"{colors.bright_cyan}[ Chat: {conversation['title']} ]{colors.reset}")
    print(f"{colors.yellow}Messages: {len(conversation['messages']):,}{colors.reset}")
    print(f"{colors.yellow}Tokens: {conversation['token_count']:,}{colors.reset}")
    print(f"{colors.yellow}Model: {conversation['model']}{colors.reset}")
    print(f"{colors.yellow}Max Output Tokens: {config.get('max_output_tokens', 4096)} (API Limit: 8192){colors.reset}")
    print(f"{colors.yellow}Commands: menu, clear, history, export, search, stats, exit{colors.reset}")
    
    while True:
        try:
            user_input = input(f"\n{colors.red}[You]>{colors.reset} ")
            
            if not user_input.strip():
                continue
            
            command = user_input.lower().strip()
            
            if command == "exit":
                print(f"{colors.bright_cyan}✓ Conversation saved{colors.reset}")
                return
            elif command == "menu":
                return
            elif command == "clear":
                clear_screen()
                banner()
                print(f"{colors.bright_cyan}[ Chat: {conversation['title']} ]{colors.reset}")
                continue
            elif command == "history":
                show_conversation_history(conversation_id)
                continue
            elif command == "export":
                export_conversation_ui(conversation_id)
                continue
            elif command == "search":
                search_in_conversation(conversation_id)
                continue
            elif command == "stats":
                show_conversation_stats(conversation_id)
                continue
            
            # Send message to AI
            print(f"\n{colors.bright_cyan}[WormGPT]>{colors.reset}")
            
            response_generator = call_api_stream(user_input, conversation_id, for_webui=False)
            for chunk in response_generator:
                if isinstance(chunk, str):
                    print(chunk, end='')
            
            print()
            
        except KeyboardInterrupt:
            print(f"\n{colors.red}✗ Interrupted!{colors.reset}")
            return
        except Exception as e:
            print(f"\n{colors.red}✗ Error: {e}{colors.reset}")

def show_conversation_history(conversation_id):
    """Show conversation history"""
    messages = get_conversation_messages(conversation_id)
    
    if not messages:
        print(f"{colors.yellow}No messages in this conversation.{colors.reset}")
        return
    
    print(f"\n{colors.bright_cyan}[ Conversation History ]{colors.reset}")
    print(f"{colors.yellow}Showing last 20 messages:{colors.reset}")
    
    # Show last 20 messages
    for msg in messages[-20:]:
        role = "You" if msg["role"] == "user" else "WormGPT"
        time = datetime.fromisoformat(msg["timestamp"]).strftime("%H:%M")
        print(f"{colors.green}[{time}] {role}:{colors.reset}")
        
        content = msg["content"]
        if len(content) > 200:
            content = content[:200] + "..."
        
        print(f"  {content}")
        print()
    
    input(f"{colors.red}[>] Press Enter to continue {colors.reset}")

def export_conversation_ui(conversation_id):
    """Export conversation UI"""
    print(f"\n{colors.bright_cyan}[ Export Conversation ]{colors.reset}")
    print(f"{colors.yellow}1. Export as Text File{colors.reset}")
    print(f"{colors.yellow}2. Export as JSON{colors.reset}")
    print(f"{colors.yellow}3. Cancel{colors.reset}")
    
    choice = input(f"{colors.red}[>] Select (1-3): {colors.reset}")
    
    if choice == "1":
        conversation = load_conversation(conversation_id)
        if conversation:
            filename = f"conversation_{conversation_id}.txt"
            with open(filename, "w", encoding="utf-8") as f:
                f.write(f"Conversation: {conversation['title']}\n")
                f.write(f"Date: {conversation['created_at']}\n")
                f.write(f"Model: {conversation['model']}\n")
                f.write("=" * 50 + "\n\n")
                
                for msg in conversation['messages']:
                    role = "User" if msg['role'] == 'user' else "Assistant"
                    f.write(f"{role}: {msg['content']}\n\n")
            
            print(f"{colors.bright_green}✓ Exported to: {filename}{colors.reset}")
            time.sleep(2)
    elif choice == "2":
        conversation = load_conversation(conversation_id)
        if conversation:
            filename = f"conversation_{conversation_id}.json"
            with open(filename, "w", encoding="utf-8") as f:
                json.dump(conversation, f, indent=2, ensure_ascii=False)
            
            print(f"{colors.bright_green}✓ Exported to: {filename}{colors.reset}")
            time.sleep(2)

def search_in_conversation(conversation_id):
    """Search within conversation"""
    query = input(f"{colors.red}[>] Search text: {colors.reset}").strip()
    
    if not query:
        print(f"{colors.red}✗ No search query{colors.reset}")
        time.sleep(1)
        return
    
    messages = get_conversation_messages(conversation_id)
    results = []
    
    for msg in messages:
        if query.lower() in msg["content"].lower():
            results.append(msg)
    
    if not results:
        print(f"{colors.yellow}No results found.{colors.reset}")
        time.sleep(1)
        return
    
    print(f"\n{colors.bright_cyan}Found {len(results)} results:{colors.reset}")
    
    for i, msg in enumerate(results, 1):
        role = "You" if msg["role"] == "user" else "WormGPT"
        time = datetime.fromisoformat(msg["timestamp"]).strftime("%H:%M")
        print(f"{colors.green}{i}. [{time}] {role}:{colors.reset}")
        
        content = msg["content"]
        if len(content) > 200:
            content = content[:200] + "..."
        
        print(f"  {content}")
        print()
    
    input(f"{colors.red}[>] Press Enter to continue {colors.reset}")

def show_conversation_stats(conversation_id):
    """Show conversation statistics"""
    conversation = load_conversation(conversation_id)
    
    if not conversation:
        print(f"{colors.red}✗ Conversation not found{colors.reset}")
        return
    
    total_messages = len(conversation['messages'])
    user_messages = sum(1 for m in conversation['messages'] if m['role'] == 'user')
    bot_messages = sum(1 for m in conversation['messages'] if m['role'] == 'assistant')
    
    total_tokens = conversation.get('token_count', 0)
    avg_tokens = total_tokens // total_messages if total_messages > 0 else 0
    
    print(f"\n{colors.bright_cyan}[ Conversation Statistics ]{colors.reset}")
    print(f"{colors.yellow}Title: {colors.green}{conversation['title']}{colors.reset}")
    print(f"{colors.yellow}Created: {colors.green}{conversation['created_at'][:10]}{colors.reset}")
    print(f"{colors.yellow}Model: {colors.green}{conversation['model']}{colors.reset}")
    print(f"{colors.yellow}Total Messages: {colors.green}{total_messages}{colors.reset}")
    print(f"{colors.yellow}  • User: {user_messages}{colors.reset}")
    print(f"{colors.yellow}  • Assistant: {bot_messages}{colors.reset}")
    print(f"{colors.yellow}Total Tokens: {colors.green}{total_tokens:,}{colors.reset}")
    print(f"{colors.yellow}Average Tokens per Message: {colors.green}{avg_tokens}{colors.reset}")
    print(f"{colors.yellow}Context Window: {colors.green}{conversation.get('context_window', MAX_CONTEXT_WINDOW):,}{colors.reset}")
    
    if conversation['messages']:
        first_msg = conversation['messages'][0]['timestamp'][:10]
        last_msg = conversation['messages'][-1]['timestamp'][:10]
        print(f"{colors.yellow}Duration: {colors.green}{first_msg} to {last_msg}{colors.reset}")
    
    input(f"\n{colors.red}[>] Press Enter to continue {colors.reset}")

# Other helper functions remain similar but with updated constants
def manage_conversations():
    """Manage conversations in terminal"""
    clear_screen()
    banner()
    
    print(f"{colors.bright_cyan}[ Manage Conversations ]{colors.reset}")
    print(f"{colors.yellow}1. View all conversations{colors.reset}")
    print(f"{colors.yellow}2. Archive conversation{colors.reset}")
    print(f"{colors.yellow}3. Delete conversation{colors.reset}")
    print(f"{colors.yellow}4. View conversation details{colors.reset}")
    print(f"{colors.yellow}5. Back to menu{colors.reset}")
    
    choice = input(f"\n{colors.red}[>] Select (1-5): {colors.reset}")
    
    # Implementation remains the same...

def search_conversations_ui():
    """Search conversations in terminal"""
    clear_screen()
    banner()
    
    print(f"{colors.bright_cyan}[ Search Conversations ]{colors.reset}")
    query = input(f"{colors.red}[>] Search query: {colors.reset}").strip()
    
    if not query:
        print(f"{colors.red}✗ No query provided{colors.reset}")
        time.sleep(1)
        return
    
    results = search_conversations(query)
    
    if not results:
        print(f"{colors.yellow}No results found{colors.reset}")
        time.sleep(1)
        return
    
    print(f"\n{colors.bright_cyan}Found {len(results)} results:{colors.reset}")
    for i, result in enumerate(results, 1):
        print(f"{colors.green}{i:2d}. {result['title']}{colors.reset}")
        if result['snippet']:
            print(f"   {result['snippet']}")
        print(f"   Updated: {result['updated_at'][:10]}")
    
    input(f"\n{colors.red}[>] Press Enter to continue {colors.reset}")

def system_settings():
    """System settings menu"""
    config = load_config()
    clear_screen()
    banner()
    
    print(f"{colors.bright_cyan}[ System Settings ]{colors.reset}")
    print(f"{colors.yellow}1. Set API Key{colors.reset}")
    print(f"{colors.yellow}2. Select Model{colors.reset}")
    print(f"{colors.yellow}3. Language Settings{colors.reset}")
    print(f"{colors.yellow}4. Advanced Settings{colors.reset}")
    print(f"{colors.yellow}5. Cache Settings{colors.reset}")
    print(f"{colors.yellow}6. Backup Settings{colors.reset}")
    print(f"{colors.yellow}7. Back to menu{colors.reset}")
    
    choice = input(f"\n{colors.red}[>] Select (1-7): {colors.reset}")
    
    if choice == "1":
        set_api_key()
    elif choice == "2":
        select_model()
    elif choice == "3":
        select_language()
    elif choice == "4":
        advanced_settings()
    elif choice == "5":
        cache_settings()
    elif choice == "6":
        backup_settings()
    elif choice == "7":
        return

def set_api_key():
    """Set API key"""
    config = load_config()
    clear_screen()
    banner()
    
    print(f"{colors.bright_cyan}[ API Key Setup ]{colors.reset}")
    print(f"{colors.yellow}Current Key: {'*' * min(20, len(config['api_key'])) if config['api_key'] else 'Not set'}{colors.reset}")
    
    new_key = input(f"\n{colors.red}[>] Enter DeepSeek API Key: {colors.reset}")
    if new_key.strip():
        config["api_key"] = new_key.strip()
        save_config(config)
        print(f"{colors.bright_cyan}✓ API Key updated{colors.reset}")
        time.sleep(2)

def select_model():
    """Select model"""
    config = load_config()
    clear_screen()
    banner()
    
    print(f"{colors.bright_cyan}[ Model Selection ]{colors.reset}")
    print(f"{colors.yellow}Current: {config['model']}{colors.reset}")
    print(f"{colors.yellow}Note: DeepSeek Reasoner model might not be available in some regions{colors.reset}")
    
    for i, model in enumerate(AVAILABLE_MODELS, 1):
        print(f"{colors.green}{i}. {model}{colors.reset}")
    
    choice = input(f"\n{colors.red}[>] Select (1-{len(AVAILABLE_MODELS)}): {colors.reset}")
    
    if choice.isdigit() and 1 <= int(choice) <= len(AVAILABLE_MODELS):
        config["model"] = AVAILABLE_MODELS[int(choice)-1]
        save_config(config)
        print(f"{colors.bright_cyan}✓ Model set to: {config['model']}{colors.reset}")
        time.sleep(1)

def advanced_settings():
    """Advanced settings"""
    config = load_config()
    clear_screen()
    banner()
    
    print(f"{colors.bright_cyan}[ Advanced Settings ]{colors.reset}")
    print(f"{colors.yellow}1. Temperature: {config['temperature']} (0.0-2.0){colors.reset}")
    print(f"{colors.yellow}2. Top P: {config['top_p']} (0.0-1.0){colors.reset}")
    print(f"{colors.yellow}3. Max Output Tokens: {config['max_output_tokens']} (1-8192){colors.reset}")
    print(f"{colors.yellow}4. Context Window: {config['context_window']:,}{colors.reset}")
    print(f"{colors.yellow}5. Back to menu{colors.reset}")
    
    choice = input(f"\n{colors.red}[>] Select (1-5): {colors.reset}")
    
    if choice == "1":
        try:
            temp = float(input(f"{colors.red}[>] Temperature (0.0-2.0): {colors.reset}"))
            if 0.0 <= temp <= 2.0:
                config["temperature"] = temp
                save_config(config)
                print(f"{colors.bright_green}✓ Temperature set to: {temp}{colors.reset}")
            else:
                print(f"{colors.red}✗ Must be between 0.0 and 2.0{colors.reset}")
        except:
            print(f"{colors.red}✗ Invalid input{colors.reset}")
        time.sleep(1)
    elif choice == "2":
        try:
            top_p = float(input(f"{colors.red}[>] Top P (0.0-1.0): {colors.reset}"))
            if 0.0 <= top_p <= 1.0:
                config["top_p"] = top_p
                save_config(config)
                print(f"{colors.bright_green}✓ Top P set to: {top_p}{colors.reset}")
            else:
                print(f"{colors.red}✗ Must be between 0.0 and 1.0{colors.reset}")
        except:
            print(f"{colors.red}✗ Invalid input{colors.reset}")
        time.sleep(1)
    elif choice == "3":
        try:
            max_tokens = int(input(f"{colors.red}[>] Max Output Tokens (1-8192): {colors.reset}"))
            if 1 <= max_tokens <= MAX_TOKENS_LIMIT:
                config["max_output_tokens"] = max_tokens
                save_config(config)
                print(f"{colors.bright_green}✓ Max tokens set to: {max_tokens}{colors.reset}")
            else:
                print(f"{colors.red}✗ Must be between 1 and {MAX_TOKENS_LIMIT}{colors.reset}")
        except:
            print(f"{colors.red}✗ Invalid input{colors.reset}")
        time.sleep(1)

def toggle_webui():
    """Toggle WebUI"""
    config = load_config()
    clear_screen()
    banner()
    
    if config.get("webui_enabled"):
        print(f"{colors.bright_cyan}[ Disable WebUI ]{colors.reset}")
        print(f"{colors.yellow}Current status: {colors.green}Active ✓{colors.reset}")
        confirm = input(f"{colors.red}[>] Disable WebUI? (y/n): {colors.reset}")
        if confirm.lower() == 'y':
            config["webui_enabled"] = False
            save_config(config)
            print(f"{colors.bright_yellow}✓ WebUI disabled. Restart to apply.{colors.reset}")
    else:
        print(f"{colors.bright_cyan}[ Enable WebUI ]{colors.reset}")
        print(f"{colors.yellow}Current status: {colors.red}Inactive ✗{colors.reset}")
        confirm = input(f"{colors.red}[>] Enable WebUI? (y/n): {colors.reset}")
        if confirm.lower() == 'y':
            config["webui_enabled"] = True
            save_config(config)
            print(f"{colors.bright_green}✓ WebUI enabled. Restart to apply.{colors.reset}")
    
    time.sleep(2)

def system_info():
    """Display system information"""
    config = load_config()
    clear_screen()
    banner()
    
    # Get stats from database
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT COUNT(*) as total_conversations FROM conversations WHERE is_archived = 0')
    total_conversations = cursor.fetchone()["total_conversations"]
    
    cursor.execute('SELECT COUNT(*) as total_messages FROM messages')
    total_messages = cursor.fetchone()["total_messages"]
    
    cursor.execute('SELECT SUM(token_count) as total_tokens FROM conversations')
    total_tokens = cursor.fetchone()["total_tokens"] or 0
    
    conn.close()
    
    print(f"{colors.bright_cyan}[ System Information ]{colors.reset}")
    print(f"{colors.yellow}Database Version: 4.0 (Fixed){colors.reset}")
    print(f"{colors.yellow}Total Conversations: {colors.green}{total_conversations:,}{colors.reset}")
    print(f"{colors.yellow}Total Messages: {colors.green}{total_messages:,}{colors.reset}")
    print(f"{colors.yellow}Total Tokens: {colors.green}{total_tokens:,}{colors.reset}")
    print(f"{colors.yellow}Database Size: {colors.green}{os.path.getsize(DATABASE_FILE) // 1024:,} KB{colors.reset}")
    print(f"{colors.yellow}Model: {colors.green}{config['model']}{colors.reset}")
    print(f"{colors.yellow}API Token Limit: {colors.green}1-{MAX_TOKENS_LIMIT}{colors.reset}")
    print(f"{colors.yellow}Context Window: {colors.green}{config['context_window']:,} tokens{colors.reset}")
    print(f"{colors.yellow}Max Output Tokens: {colors.green}{config.get('max_output_tokens', MAX_OUTPUT_TOKENS)}{colors.reset}")
    print(f"{colors.yellow}WebUI: {colors.green if config.get('webui_enabled') else colors.red}{'Active' if config.get('webui_enabled') else 'Inactive'}{colors.reset}")
    
    input(f"\n{colors.red}[>] Press Enter to continue {colors.reset}")

# ============ MAIN FUNCTION ============
def main():
    """Main function"""
    # Initialize database
    init_database()
    
    # Check for required packages
    required_packages = ['requests', 'flask', 'flask-cors']
    for package in required_packages:
        try:
            __import__(package.replace('-', '_'))
        except ImportError:
            print(f"{colors.yellow}Installing {package}...{colors.reset}")
            subprocess.run([sys.executable, "-m", "pip", "install", package, "--quiet"])
    
    # Display banner
    clear_screen()
    banner()
    
    # Check API key
    config = load_config()
    if not config.get("api_key"):
        print(f"{colors.bright_red}⚠️  API Key not set!{colors.reset}")
        print(f"{colors.yellow}Please set your API key from the main menu.{colors.reset}")
        time.sleep(2)
    
    # Start main menu
    try:
        main_menu()
    except KeyboardInterrupt:
        print(f"\n{colors.red}✗ Interrupted! Goodbye.{colors.reset}")
        sys.exit(0)
    except Exception as e:
        print(f"\n{colors.red}✗ Fatal error: {e}{colors.reset}")
        print(traceback.format_exc())
        sys.exit(1)

if __name__ == "__main__":
    main()