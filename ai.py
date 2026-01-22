import sys
import os
import platform
import time
import json
import requests
import threading
import subprocess
import traceback
import hashlib
from datetime import datetime, timedelta
from pathlib import Path
from flask import Flask, request, jsonify, Response, send_from_directory
from flask_cors import CORS
import webbrowser

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
    bright_green = "\033[1;33m"
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
HISTORY_FILE = "chat_history.json"
DEFAULT_API_KEY = ""
DEFAULT_BASE_URL = "https://api.deepseek.com"
DEFAULT_MODEL = "deepseek-chat"
MAX_TOKENS_LIMIT = 8192
MAX_CONTEXT_WINDOW = 128000
MAX_OUTPUT_TOKENS = 4096

# Global variables
webui_app = None
webui_thread = None
webui_running = False

# Create necessary directories
Path(CONVERSATIONS_DIR).mkdir(exist_ok=True)
Path(CACHE_DIR).mkdir(exist_ok=True)

# ============ JSON-BASED STORAGE FUNCTIONS ============
def load_history():
    """Load conversation history from JSON file"""
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_history(history_data):
    """Save conversation history to JSON file"""
    try:
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(history_data, f, indent=2, ensure_ascii=False)
        return True
    except:
        return False

def get_conversation(conversation_id):
    """Get conversation from JSON history"""
    history = load_history()
    return history.get(conversation_id)

def save_conversation(conversation_id, conversation_data):
    """Save conversation to JSON history"""
    history = load_history()
    history[conversation_id] = conversation_data
    return save_history(history)

def create_new_conversation(title=None):
    """Create a new conversation"""
    if not title:
        title = f"Chat {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    
    conversation_id = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
    
    conversation_data = {
        "id": conversation_id,
        "title": title,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        "messages": [],
        "model": DEFAULT_MODEL,
        "token_count": 0,
        "context_window": MAX_CONTEXT_WINDOW
    }
    
    save_conversation(conversation_id, conversation_data)
    
    # Also save individual JSON file
    conv_file = os.path.join(CONVERSATIONS_DIR, f"{conversation_id}.json")
    try:
        with open(conv_file, "w", encoding="utf-8") as f:
            json.dump(conversation_data, f, indent=2, ensure_ascii=False)
    except:
        pass
    
    return conversation_id

def add_message_to_conversation(conversation_id, role, content, tokens=0):
    """Add message to conversation - FIXED VERSION"""
    conversation = get_conversation(conversation_id)
    if not conversation:
        # ❌ ভুল: conversation = create_new_conversation()  # এটা নতুন ID তৈরি করে
        # ✅ ঠিক: নতুন কনভারসেশন তৈরি করলেও একই ID দিয়ে
        conversation = {
            "id": conversation_id,
            "title": content[:100] + "..." if len(content) > 100 else content,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "messages": [],
            "model": DEFAULT_MODEL,
            "token_count": 0,
            "context_window": MAX_CONTEXT_WINDOW
        }
    
    message = {
        "role": role,
        "content": content,
        "timestamp": datetime.now().isoformat(),
        "tokens": tokens
    }
    
    conversation["messages"].append(message)
    conversation["updated_at"] = datetime.now().isoformat()
    conversation["token_count"] += tokens
    
    # Update title if first user message
    if role == "user" and len(conversation["messages"]) == 1:
        if len(content) > 100:
            conversation["title"] = content[:100] + "..."
        else:
            conversation["title"] = content
    
    # Save to main history
    save_conversation(conversation_id, conversation)
    
    # Also update individual file
    conv_file = os.path.join(CONVERSATIONS_DIR, f"{conversation_id}.json")
    try:
        with open(conv_file, "w", encoding="utf-8") as f:
            json.dump(conversation, f, indent=2, ensure_ascii=False)
    except:
        pass
    
    return True

def get_conversation_messages(conversation_id, limit=None):
    """Get messages from conversation"""
    conversation = get_conversation(conversation_id)
    if not conversation:
        return []
    
    messages = conversation.get("messages", [])
    if limit:
        return messages[-limit:]
    return messages

def list_conversations(limit=100, offset=0, search=None):
    """List all conversations"""
    history = load_history()
    conversations = []
    
    for conv_id, conv_data in history.items():
        if search:
            # Search in title and messages
            found = False
            if search.lower() in conv_data.get("title", "").lower():
                found = True
            else:
                for msg in conv_data.get("messages", []):
                    if search.lower() in msg.get("content", "").lower():
                        found = True
                        break
            
            if not found:
                continue
        
        conversations.append({
            "id": conv_id,
            "title": conv_data.get("title", "Untitled"),
            "created_at": conv_data.get("created_at", ""),
            "updated_at": conv_data.get("updated_at", ""),
            "model": conv_data.get("model", DEFAULT_MODEL),
            "message_count": len(conv_data.get("messages", [])),
            "token_count": conv_data.get("token_count", 0)
        })
    
    # Sort by updated_at descending
    conversations.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
    
    # Apply offset and limit
    if offset:
        conversations = conversations[offset:]
    if limit:
        conversations = conversations[:limit]
    
    return conversations

def delete_conversation(conversation_id):
    """Delete conversation"""
    history = load_history()
    if conversation_id in history:
        del history[conversation_id]
        save_history(history)
    
    # Delete individual file
    conv_file = os.path.join(CONVERSATIONS_DIR, f"{conversation_id}.json")
    if os.path.exists(conv_file):
        try:
            os.remove(conv_file)
        except:
            pass
    
    return True

def search_conversations_all(query, limit=50):
    """Search across all conversations"""
    results = []
    history = load_history()
    
    for conv_id, conv_data in history.items():
        title_matches = query.lower() in conv_data.get("title", "").lower()
        content_matches = False
        snippet = ""
        
        # Search in messages
        for msg in conv_data.get("messages", []):
            if query.lower() in msg.get("content", "").lower():
                content_matches = True
                snippet = msg.get("content", "")[:200]
                break
        
        if title_matches or content_matches:
            results.append({
                "id": conv_id,
                "title": conv_data.get("title", "Untitled"),
                "updated_at": conv_data.get("updated_at", ""),
                "snippet": snippet
            })
    
    results.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
    return results[:limit]

# ============ CONFIGURATION FUNCTIONS ============
def load_config():
    """Load configuration from JSON file"""
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                config = json.load(f)
        except:
            config = {}
    else:
        config = {}
    
    # Set defaults
    defaults = {
        "api_key": DEFAULT_API_KEY,
        "base_url": DEFAULT_BASE_URL,
        "model": DEFAULT_MODEL,
        "temperature": 0.7,
        "top_p": 0.9,
        "webui_port": 5000,
        "webui_enabled": True,
        "stream": True,
        "max_tokens": MAX_TOKENS_LIMIT,
        "max_output_tokens": MAX_OUTPUT_TOKENS,
        "context_window": MAX_CONTEXT_WINDOW,
        "auto_save": True,
        "dark_mode": True,
        "enable_cache": True,
        "cache_ttl_days": 30
    }
    
    for key, value in defaults.items():
        if key not in config:
            config[key] = value
    
    return config

def save_config(config):
    """Save configuration to JSON file"""
    try:
        # Ensure limits
        config["max_tokens"] = min(config.get("max_tokens", MAX_TOKENS_LIMIT), MAX_TOKENS_LIMIT)
        config["max_output_tokens"] = min(config.get("max_output_tokens", MAX_OUTPUT_TOKENS), MAX_TOKENS_LIMIT)
        
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        return True
    except:
        return False

# ============ CACHE FUNCTIONS ============
def get_cache_hash(query, model, context):
    """Generate cache hash"""
    cache_string = f"{query}|{model}|{json.dumps(context, sort_keys=True)}"
    return hashlib.md5(cache_string.encode()).hexdigest()

def get_cached_response(query, model, context):
    """Get cached response"""
    config = load_config()
    if not config.get("enable_cache", True):
        return None
    
    cache_hash = get_cache_hash(query, model, context)
    cache_file = os.path.join(CACHE_DIR, f"{cache_hash}.json")
    
    if os.path.exists(cache_file):
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                cache_data = json.load(f)
            
            # Check expiry
            expires_at = cache_data.get("expires_at")
            if expires_at:
                if datetime.fromisoformat(expires_at) < datetime.now():
                    os.remove(cache_file)
                    return None
            
            return cache_data.get("response")
        except:
            return None
    
    return None

def cache_response(query, model, context, response, ttl_days=30):
    """Cache API response"""
    config = load_config()
    if not config.get("enable_cache", True):
        return
    
    cache_hash = get_cache_hash(query, model, context)
    cache_file = os.path.join(CACHE_DIR, f"{cache_hash}.json")
    
    expires_at = None
    if ttl_days > 0:
        expires_at = (datetime.now() + timedelta(days=ttl_days)).isoformat()
    
    cache_data = {
        "query": query[:500],
        "response": response,
        "model": model,
        "created_at": datetime.now().isoformat(),
        "expires_at": expires_at
    }
    
    try:
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(cache_data, f, indent=2, ensure_ascii=False)
    except:
        pass

# ============ API FUNCTIONS ============
def get_system_prompt():
    """Get system prompt"""
    try:
        if os.path.exists(PROMPT_FILE):
            with open(PROMPT_FILE, "r", encoding="utf-8") as f:
                return f.read().strip()
    except:
        pass
    
    return "You are WormGPT, an advanced AI assistant with 128K token context window. You can handle very large projects and long conversations. You should provide detailed, comprehensive responses."

def estimate_tokens(text):
    """Estimate token count"""
    return len(text) // 4

def smart_context_management(messages, max_context_tokens=MAX_CONTEXT_WINDOW):
    """Smart context management"""
    if not messages:
        return messages
    
    total_tokens = sum(msg.get("tokens", estimate_tokens(msg["content"])) for msg in messages)
    
    if total_tokens <= max_context_tokens:
        return messages
    
    # Keep: first 20%, last 60%, and important messages
    total_msgs = len(messages)
    keep_indices = set()
    
    # First 20%
    keep_indices.update(range(int(total_msgs * 0.2)))
    
    # Last 60%
    keep_indices.update(range(int(total_msgs * 0.4), total_msgs))
    
    # Every 10th message in middle
    for i in range(int(total_msgs * 0.2), int(total_msgs * 0.4), 10):
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
    
    # Get conversation messages
    messages = get_conversation_messages(conversation_id)
    
    # Create context hash for cache
    context_hash = json.dumps([{"role": msg["role"], "content": msg["content"]} for msg in messages[-20:]], sort_keys=True)
    
    # Check cache
    cached = get_cached_response(user_input, current_model, context_hash)
    if cached and config.get("enable_cache", True):
        # Save user message
        user_tokens = estimate_tokens(user_input)
        add_message_to_conversation(conversation_id, "user", user_input, user_tokens)
        
        # Save assistant response
        assistant_tokens = estimate_tokens(cached)
        add_message_to_conversation(conversation_id, "assistant", cached, assistant_tokens)
        
        if for_webui:
            # Send conversation_id first
            yield f"data: {json.dumps({'conversation_id': conversation_id})}\n\n"
            
            # Stream cached response
            for i in range(0, len(cached), 10):
                chunk = cached[i:i+10]
                yield f"data: {json.dumps({'content': chunk})}\n\n"
                time.sleep(0.01)
            yield "data: [DONE]\n\n"
        else:
            print(cached)
        return
    
    # Prepare API messages
    api_messages = []
    
    # Add system prompt
    api_messages.append({"role": "system", "content": get_system_prompt()})
    
    # Add conversation history with smart management
    context_messages = smart_context_management(messages, config.get("context_window", MAX_CONTEXT_WINDOW))
    for msg in context_messages:
        api_messages.append({"role": msg["role"], "content": msg["content"]})
    
    # Add current user message
    api_messages.append({"role": "user", "content": user_input})
    
    try:
        headers = {
            "Authorization": f"Bearer {config['api_key']}",
            "Content-Type": "application/json"
        }
        
        max_tokens = min(config.get("max_output_tokens", MAX_OUTPUT_TOKENS), MAX_TOKENS_LIMIT)
        
        data = {
            "model": current_model,
            "messages": api_messages,
            "temperature": config.get("temperature", 0.7),
            "top_p": config.get("top_p", 0.9),
            "max_tokens": max_tokens,
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
        
        # Send conversation_id first (important for WebUI)
        if for_webui:
            yield f"data: {json.dumps({'conversation_id': conversation_id})}\n\n"
        
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
        
        add_message_to_conversation(conversation_id, "user", user_input, user_tokens)
        add_message_to_conversation(conversation_id, "assistant", full_response, assistant_tokens)
        
        # Cache the response
        cache_response(user_input, current_model, context_hash, full_response)
        
        if for_webui:
            yield f"data: [DONE]\n\n"
        else:
            print()
        
    except requests.exceptions.Timeout:
        error_msg = "Request timeout. Please try again."
        if for_webui:
            yield f"data: {json.dumps({'error': error_msg})}\n\n"
        else:
            print(f"\n{colors.red}{error_msg}{colors.reset}")
    except Exception as e:
        error_msg = f"Error: {str(e)}"
        if for_webui:
            yield f"data: {json.dumps({'error': error_msg})}\n\n"
        else:
            print(f"\n{colors.red}{error_msg}{colors.reset}")

# ============ WEBUI FUNCTIONS ============
def start_webui():
    """Start WebUI server - FIXED VERSION"""
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
    
    # API Routes - FIXED: GET + query params for EventSource compatibility
    @webui_app.route('/api/chat/stream')
    def api_chat_stream():
        # ✅ FIXED: GET with query params (EventSource compatible)
        message = request.args.get('message', '')
        model = request.args.get('model', None)
        conversation_id = request.args.get('conversation_id', None)
        history = request.args.get('history', '[]')  # JSON string as query param
        
        if not message:
            def generate_error():
                yield f"data: {json.dumps({'error': 'No message provided'})}\n\n"
                yield "data: [DONE]\n\n"
            return Response(generate_error(), mimetype='text/event-stream')
        
        # Parse history if provided
        try:
            history_data = json.loads(history)
            # If client sends history, update our storage
            if history_data and conversation_id:
                conversation = get_conversation(conversation_id)
                if not conversation:
                    # Create new conversation with existing ID
                    conversation = {
                        "id": conversation_id,
                        "title": message[:100] + "..." if len(message) > 100 else message,
                        "created_at": datetime.now().isoformat(),
                        "updated_at": datetime.now().isoformat(),
                        "messages": [],
                        "model": model or DEFAULT_MODEL,
                        "token_count": 0,
                        "context_window": MAX_CONTEXT_WINDOW
                    }
                    save_conversation(conversation_id, conversation)
        except:
            history_data = []
        
        if not conversation_id:
            conversation_id = create_new_conversation()
        
        def generate():
            for chunk in call_api_stream(message, conversation_id, model=model, for_webui=True):
                yield chunk
        
        return Response(generate(), mimetype='text/event-stream')
    
    # Additional POST endpoint for non-streaming requests (optional)
    @webui_app.route('/api/chat', methods=['POST'])
    def api_chat_post():
        """Optional POST endpoint for non-EventSource clients"""
        data = request.json
        message = data.get('message', '')
        model = data.get('model', None)
        conversation_id = data.get('conversation_id', None)
        
        if not message:
            return jsonify({'error': 'No message provided'}), 400
        
        if not conversation_id:
            conversation_id = create_new_conversation()
        
        # For POST, we need to collect all response and return at once
        full_response = ""
        for chunk in call_api_stream(message, conversation_id, model=model, for_webui=False):
            if isinstance(chunk, str):
                full_response += chunk
        
        return jsonify({
            'response': full_response,
            'conversation_id': conversation_id
        })
    
    @webui_app.route('/api/conversations')
    def api_conversations():
        search = request.args.get('search', '')
        limit = int(request.args.get('limit', 100))
        offset = int(request.args.get('offset', 0))
        
        conversations = list_conversations(limit=limit, offset=offset, search=search)
        return jsonify(conversations)
    
    @webui_app.route('/api/conversation/<conversation_id>')
    def api_get_conversation(conversation_id):
        conversation = get_conversation(conversation_id)
        if conversation:
            return jsonify(conversation)
        return jsonify({'error': 'Conversation not found'}), 404
    
    @webui_app.route('/api/conversation/<conversation_id>', methods=['DELETE'])
    def api_delete_conversation(conversation_id):
        if delete_conversation(conversation_id):
            return jsonify({'success': True})
        return jsonify({'error': 'Failed to delete conversation'}), 404
    
    @webui_app.route('/api/conversation/<conversation_id>/clear', methods=['POST'])
    def api_clear_conversation(conversation_id):
        """Clear all messages from a conversation"""
        conversation = get_conversation(conversation_id)
        if conversation:
            conversation["messages"] = []
            conversation["token_count"] = 0
            conversation["updated_at"] = datetime.now().isoformat()
            save_conversation(conversation_id, conversation)
            return jsonify({'success': True})
        return jsonify({'error': 'Conversation not found'}), 404
    
    @webui_app.route('/api/search')
    def api_search():
        query = request.args.get('q', '')
        if not query:
            return jsonify([])
        
        results = search_conversations_all(query)
        return jsonify(results)
    
    @webui_app.route('/api/config')
    def api_config():
        config = load_config()
        return jsonify(config)
    
    @webui_app.route('/api/update_config', methods=['POST'])
    def api_update_config():
        try:
            data = request.json
            config = load_config()
            
            for key, value in data.items():
                if key in config:
                    # Type conversion
                    if key in ['temperature', 'top_p']:
                        config[key] = float(value)
                    elif key in ['max_tokens', 'max_output_tokens', 'context_window', 'webui_port']:
                        config[key] = int(value)
                        # Ensure limits
                        if key in ['max_tokens', 'max_output_tokens']:
                            config[key] = min(config[key], MAX_TOKENS_LIMIT)
                    elif key in ['webui_enabled', 'stream', 'auto_save', 'dark_mode', 'enable_cache']:
                        config[key] = bool(value)
                    else:
                        config[key] = value
            
            save_config(config)
            return jsonify({'success': True})
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500
    
    @webui_app.route('/api/stats')
    def api_stats():
        history = load_history()
        total_conversations = len(history)
        
        total_messages = 0
        total_tokens = 0
        
        for conv_id, conv_data in history.items():
            total_messages += len(conv_data.get("messages", []))
            total_tokens += conv_data.get("token_count", 0)
        
        # Get history file size
        history_size = os.path.getsize(HISTORY_FILE) if os.path.exists(HISTORY_FILE) else 0
        
        return jsonify({
            "total_conversations": total_conversations,
            "total_messages": total_messages,
            "total_tokens": total_tokens,
            "history_size": history_size,
            "storage_type": "JSON (No Database)"
        })
    
    @webui_app.route('/api/ping')
    def api_ping():
        return jsonify({
            'status': 'ok', 
            'timestamp': datetime.now().isoformat(),
            'version': 'JSON-Storage-FIXED',
            'storage': 'Local JSON Files',
            'compatibility': 'EventSource GET + Query Params'
        })
    
    # Start WebUI
    webui_running = True
    print(f"\n{colors.bright_green}✅ WebUI Started!{colors.reset}")
    print(f"{colors.bright_cyan}🌐 Open: http://localhost:{port}{colors.reset}")
    print(f"{colors.bright_green}💾 JSON Storage Active (No Database Required!){colors.reset}")
    print(f"{colors.bright_green}🔧 FIXED: EventSource GET compatibility{colors.reset}")
    print(f"{colors.bright_green}🔧 FIXED: add_message_to_conversation() bug{colors.reset}")
    print(f"{colors.bright_green}📁 History File: {HISTORY_FILE}{colors.reset}")
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
    print(f"{colors.bright_cyan}JSON Storage v4.0 FIXED | EventSource Compatible{colors.reset}")
    print(f"{colors.bright_yellow}Made With ❤️  | {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}{colors.reset}\n")
    print(f"{colors.yellow}⚠️  Note: DeepSeek API supports max 8192 tokens per response{colors.reset}\n")

def clear_screen():
    """Clear terminal screen"""
    os.system("cls" if platform.system() == "Windows" else "clear")

# [Rest of the terminal functions remain the same...]
# (chat_session, show_conversation_history, export_conversation_ui, etc.)
# Copy the remaining terminal functions from the previous version...

def chat_session():
    """Terminal chat session"""
    config = load_config()
    clear_screen()
    banner()
    
    print(f"{colors.bright_cyan}[ Chat Session - JSON Storage ]{colors.reset}")
    
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
    
    conversation = get_conversation(conversation_id)
    
    clear_screen()
    banner()
    print(f"{colors.bright_cyan}[ Chat: {conversation['title']} ]{colors.reset}")
    print(f"{colors.yellow}Messages: {len(conversation['messages']):,}{colors.reset}")
    print(f"{colors.yellow}Tokens: {conversation['token_count']:,}{colors.reset}")
    print(f"{colors.yellow}Model: {conversation['model']}{colors.reset}")
    print(f"{colors.yellow}Storage: JSON File{colors.reset}")
    print(f"{colors.yellow}Commands: menu, clear, history, export, search, stats, exit{colors.reset}")
    
    while True:
        try:
            user_input = input(f"\n{colors.red}[You]>{colors.reset} ")
            
            if not user_input.strip():
                continue
            
            command = user_input.lower().strip()
            
            if command == "exit":
                print(f"{colors.bright_cyan}✓ Conversation saved to {HISTORY_FILE}{colors.reset}")
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
    conversation = get_conversation(conversation_id)
    if not conversation:
        print(f"{colors.red}Conversation not found{colors.reset}")
        return
    
    print(f"\n{colors.bright_cyan}[ Export Conversation ]{colors.reset}")
    print(f"{colors.yellow}1. Export as Text File{colors.reset}")
    print(f"{colors.yellow}2. Export as JSON{colors.reset}")
    print(f"{colors.yellow}3. Cancel{colors.reset}")
    
    choice = input(f"{colors.red}[>] Select (1-3): {colors.reset}")
    
    if choice == "1":
        filename = f"conversation_{conversation_id}.txt"
        with open(filename, "w", encoding="utf-8") as f:
            f.write(f"Conversation: {conversation['title']}\n")
            f.write(f"Date: {conversation['created_at'][:10]}\n")
            f.write(f"Model: {conversation['model']}\n")
            f.write(f"Total Messages: {len(conversation['messages'])}\n")
            f.write(f"Total Tokens: {conversation['token_count']}\n")
            f.write("=" * 50 + "\n\n")
            
            for msg in conversation['messages']:
                role = "User" if msg['role'] == 'user' else "Assistant"
                time = datetime.fromisoformat(msg['timestamp']).strftime("%Y-%m-%d %H:%M:%S")
                f.write(f"[{time}] {role}:\n")
                f.write(f"{msg['content']}\n\n")
        
        print(f"{colors.bright_green}✓ Exported to: {filename}{colors.reset}")
        time.sleep(2)
    elif choice == "2":
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
    conversation = get_conversation(conversation_id)
    
    if not conversation:
        print(f"{colors.red}✗ Conversation not found{colors.reset}")
        return
    
    total_messages = len(conversation['messages'])
    user_messages = sum(1 for m in conversation['messages'] if m['role'] == 'user')
    bot_messages = total_messages - user_messages
    
    total_tokens = conversation.get('token_count', 0)
    avg_tokens = total_tokens // total_messages if total_messages > 0 else 0
    
    print(f"\n{colors.bright_cyan}[ Conversation Statistics ]{colors.reset}")
    print(f"{colors.yellow}Title: {colors.green}{conversation['title']}{colors.reset}")
    print(f"{colors.yellow}ID: {colors.green}{conversation_id}{colors.reset}")
    print(f"{colors.yellow}Created: {colors.green}{conversation['created_at'][:10]}{colors.reset}")
    print(f"{colors.yellow}Model: {colors.green}{conversation['model']}{colors.reset}")
    print(f"{colors.yellow}Total Messages: {colors.green}{total_messages}{colors.reset}")
    print(f"{colors.yellow}  • User: {user_messages}{colors.reset}")
    print(f"{colors.yellow}  • Assistant: {bot_messages}{colors.reset}")
    print(f"{colors.yellow}Total Tokens: {colors.green}{total_tokens:,}{colors.reset}")
    print(f"{colors.yellow}Average Tokens per Message: {colors.green}{avg_tokens}{colors.reset}")
    print(f"{colors.yellow}Storage: {colors.green}JSON File{colors.reset}")
    print(f"{colors.yellow}History File: {colors.green}{HISTORY_FILE}{colors.reset}")
    
    input(f"\n{colors.red}[>] Press Enter to continue {colors.reset}")

def manage_conversations():
    """Manage conversations in terminal"""
    clear_screen()
    banner()
    
    print(f"{colors.bright_cyan}[ Manage Conversations ]{colors.reset}")
    print(f"{colors.yellow}1. View all conversations{colors.reset}")
    print(f"{colors.yellow}2. Delete conversation{colors.reset}")
    print(f"{colors.yellow}3. View conversation details{colors.reset}")
    print(f"{colors.yellow}4. Back to menu{colors.reset}")
    
    choice = input(f"\n{colors.red}[>] Select (1-4): {colors.reset}")
    
    if choice == "1":
        conversations = list_conversations(limit=50)
        if not conversations:
            print(f"{colors.yellow}No conversations found.{colors.reset}")
            time.sleep(1)
            return
        
        print(f"\n{colors.bright_cyan}Total Conversations: {len(conversations)}{colors.reset}")
        for i, conv in enumerate(conversations, 1):
            print(f"{colors.green}{i:3d}. {conv['title']}{colors.reset}")
            print(f"     ID: {conv['id']}")
            print(f"     Messages: {conv['message_count']} | Tokens: {conv['token_count']}")
            print(f"     Updated: {conv['updated_at'][:10]}")
            print()
        
        input(f"{colors.red}[>] Press Enter to continue {colors.reset}")
    
    elif choice == "2":
        conv_id = input(f"{colors.red}[>] Conversation ID to delete: {colors.reset}").strip()
        if conv_id:
            confirm = input(f"{colors.red}[>] Delete conversation? (y/n): {colors.reset}")
            if confirm.lower() == 'y':
                if delete_conversation(conv_id):
                    print(f"{colors.bright_green}✓ Conversation deleted{colors.reset}")
                else:
                    print(f"{colors.red}✗ Failed to delete conversation{colors.reset}")
                time.sleep(1)
    
    elif choice == "3":
        conv_id = input(f"{colors.red}[>] Conversation ID to view: {colors.reset}").strip()
        if conv_id:
            conversation = get_conversation(conv_id)
            if conversation:
                show_conversation_stats(conv_id)
            else:
                print(f"{colors.red}✗ Conversation not found{colors.reset}")
                time.sleep(1)

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
    
    results = search_conversations_all(query)
    
    if not results:
        print(f"{colors.yellow}No results found{colors.reset}")
        time.sleep(1)
        return
    
    print(f"\n{colors.bright_cyan}Found {len(results)} results:{colors.reset}")
    for i, result in enumerate(results, 1):
        print(f"{colors.green}{i:2d}. {result['title']}{colors.reset}")
        if result['snippet']:
            print(f"   {result['snippet']}")
        print(f"   ID: {result['id']}")
        print(f"   Updated: {result['updated_at'][:10]}")
        print()
    
    input(f"\n{colors.red}[>] Press Enter to continue {colors.reset}")

def system_settings():
    """System settings menu"""
    config = load_config()
    clear_screen()
    banner()
    
    print(f"{colors.bright_cyan}[ System Settings ]{colors.reset}")
    print(f"{colors.yellow}1. Set API Key{colors.reset}")
    print(f"{colors.yellow}2. Select Model{colors.reset}")
    print(f"{colors.yellow}3. Advanced Settings{colors.reset}")
    print(f"{colors.yellow}4. Cache Settings{colors.reset}")
    print(f"{colors.yellow}5. View System Info{colors.reset}")
    print(f"{colors.yellow}6. Back to menu{colors.reset}")
    
    choice = input(f"\n{colors.red}[>] Select (1-6): {colors.reset}")
    
    if choice == "1":
        print(f"\n{colors.yellow}Current Key: {'*' * min(20, len(config['api_key'])) if config['api_key'] else 'Not set'}{colors.reset}")
        new_key = input(f"{colors.red}[>] Enter DeepSeek API Key: {colors.reset}")
        if new_key.strip():
            config["api_key"] = new_key.strip()
            save_config(config)
            print(f"{colors.bright_green}✓ API Key updated{colors.reset}")
            time.sleep(2)
    
    elif choice == "2":
        print(f"\n{colors.yellow}Current Model: {config['model']}{colors.reset}")
        models = ["deepseek-chat", "deepseek-coder"]
        for i, model in enumerate(models, 1):
            print(f"{colors.green}{i}. {model}{colors.reset}")
        
        model_choice = input(f"\n{colors.red}[>] Select model (1-{len(models)}): {colors.reset}")
        if model_choice.isdigit() and 1 <= int(model_choice) <= len(models):
            config["model"] = models[int(model_choice)-1]
            save_config(config)
            print(f"{colors.bright_green}✓ Model set to: {config['model']}{colors.reset}")
            time.sleep(1)
    
    elif choice == "3":
        print(f"\n{colors.bright_cyan}[ Advanced Settings ]{colors.reset}")
        print(f"{colors.yellow}1. Temperature: {config['temperature']}{colors.reset}")
        print(f"{colors.yellow}2. Max Output Tokens: {config['max_output_tokens']}{colors.reset}")
        print(f"{colors.yellow}3. WebUI Port: {config['webui_port']}{colors.reset}")
        
        adv_choice = input(f"\n{colors.red}[>] Select (1-3): {colors.reset}")
        
        if adv_choice == "1":
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
        
        elif adv_choice == "2":
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
        
        elif adv_choice == "3":
            try:
                port = int(input(f"{colors.red}[>] WebUI Port: {colors.reset}"))
                if 1024 <= port <= 65535:
                    config["webui_port"] = port
                    save_config(config)
                    print(f"{colors.bright_green}✓ WebUI port set to: {port}{colors.reset}")
                else:
                    print(f"{colors.red}✗ Port must be between 1024 and 65535{colors.reset}")
            except:
                print(f"{colors.red}✗ Invalid input{colors.reset}")
            time.sleep(1)
    
    elif choice == "4":
        print(f"\n{colors.bright_cyan}[ Cache Settings ]{colors.reset}")
        print(f"{colors.yellow}Cache Enabled: {config.get('enable_cache', True)}{colors.reset}")
        print(f"{colors.yellow}Cache TTL Days: {config.get('cache_ttl_days', 30)}{colors.reset}")
        
        print(f"\n{colors.yellow}1. Toggle Cache{colors.reset}")
        print(f"{colors.yellow}2. Clear All Cache{colors.reset}")
        
        cache_choice = input(f"\n{colors.red}[>] Select (1-2): {colors.reset}")
        
        if cache_choice == "1":
            config["enable_cache"] = not config.get("enable_cache", True)
            save_config(config)
            status = "enabled" if config["enable_cache"] else "disabled"
            print(f"{colors.bright_green}✓ Cache {status}{colors.reset}")
            time.sleep(1)
        
        elif cache_choice == "2":
            if os.path.exists(CACHE_DIR):
                import shutil
                shutil.rmtree(CACHE_DIR)
                os.makedirs(CACHE_DIR)
                print(f"{colors.bright_green}✓ Cache cleared{colors.reset}")
                time.sleep(1)
    
    elif choice == "5":
        clear_screen()
        banner()
        
        history = load_history()
        total_conversations = len(history)
        
        total_messages = 0
        total_tokens = 0
        
        for conv_id, conv_data in history.items():
            total_messages += len(conv_data.get("messages", []))
            total_tokens += conv_data.get("token_count", 0)
        
        print(f"{colors.bright_cyan}[ System Information ]{colors.reset}")
        print(f"{colors.yellow}Storage Type: JSON Files (No Database){colors.reset}")
        print(f"{colors.yellow}Total Conversations: {colors.green}{total_conversations:,}{colors.reset}")
        print(f"{colors.yellow}Total Messages: {colors.green}{total_messages:,}{colors.reset}")
        print(f"{colors.yellow}Total Tokens: {colors.green}{total_tokens:,}{colors.reset}")
        print(f"{colors.yellow}History File: {colors.green}{HISTORY_FILE}{colors.reset}")
        print(f"{colors.yellow}History Size: {colors.green}{os.path.getsize(HISTORY_FILE) // 1024:,} KB{colors.reset}")
        print(f"{colors.yellow}Conversations Dir: {colors.green}{CONVERSATIONS_DIR}{colors.reset}")
        print(f"{colors.yellow}Cache Dir: {colors.green}{CACHE_DIR}{colors.reset}")
        
        if os.path.exists(HISTORY_FILE):
            modified_time = datetime.fromtimestamp(os.path.getmtime(HISTORY_FILE))
            print(f"{colors.yellow}Last Modified: {colors.green}{modified_time.strftime('%Y-%m-%d %H:%M:%S')}{colors.reset}")
        
        input(f"\n{colors.red}[>] Press Enter to continue {colors.reset}")

def toggle_webui():
    """Toggle WebUI"""
    config = load_config()
    clear_screen()
    banner()
    
    if config.get("webui_enabled"):
        print(f"{colors.bright_cyan}[ Disable WebUI ]{colors.reset}")
        confirm = input(f"{colors.red}[>] Disable WebUI? (y/n): {colors.reset}")
        if confirm.lower() == 'y':
            config["webui_enabled"] = False
            save_config(config)
            print(f"{colors.bright_yellow}✓ WebUI disabled. Restart to apply.{colors.reset}")
    else:
        print(f"{colors.bright_cyan}[ Enable WebUI ]{colors.reset}")
        confirm = input(f"{colors.red}[>] Enable WebUI? (y/n): {colors.reset}")
        if confirm.lower() == 'y':
            config["webui_enabled"] = True
            save_config(config)
            print(f"{colors.bright_green}✓ WebUI enabled. Restart to apply.{colors.reset}")
    
    time.sleep(2)

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
        
        print(f"{colors.bright_cyan}[ Main Menu - JSON Storage FIXED ]{colors.reset}")
        print(f"{colors.yellow}1. Start Chat Session{colors.reset}")
        print(f"{colors.yellow}2. Manage Conversations{colors.reset}")
        print(f"{colors.yellow}3. Search Conversations{colors.reset}")
        print(f"{colors.yellow}4. System Settings{colors.reset}")
        print(f"{colors.yellow}5. WebUI ({'✅ Active' if config.get('webui_enabled') else '❌ Inactive'}){colors.reset}")
        print(f"{colors.yellow}6. System Information{colors.reset}")
        print(f"{colors.yellow}7. Exit{colors.reset}")
        
        if config.get("webui_enabled"):
            print(f"\n{colors.bright_green}🌐 WebUI Active: http://localhost:{config.get('webui_port', 5000)}{colors.reset}")
            print(f"{colors.bright_green}💾 Storage: Local JSON Files (No Database){colors.reset}")
            print(f"{colors.bright_green}🔧 FIXED: EventSource GET + Query Params{colors.reset}")
        
        try:
            choice = input(f"\n{colors.red}[>] Select (1-7): {colors.reset}")
            
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
                system_settings()  # Reuse system settings for info
            elif choice == "7":
                print(f"{colors.bright_cyan}✓ Goodbye! History saved to {HISTORY_FILE}{colors.reset}")
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

# ============ MAIN FUNCTION ============
def main():
    """Main function"""
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
        print(f"\n{colors.red}✗ Interrupted! History saved to {HISTORY_FILE}{colors.reset}")
        sys.exit(0)
    except Exception as e:
        print(f"\n{colors.red}✗ Fatal error: {e}{colors.reset}")
        print(traceback.format_exc())
        sys.exit(1)

if __name__ == "__main__":
    main()