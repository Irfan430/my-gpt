import sys
import os
import platform
import time
import json
import requests
import threading
from datetime import datetime
from flask import Flask, request, jsonify, Response, send_from_directory
import webbrowser

try:
    import pyfiglet
except ImportError:
    os.system('pip install pyfiglet --quiet')
    import pyfiglet

try:
    from langdetect import detect
except ImportError:
    os.system('pip install langdetect --quiet')
    from langdetect import detect

try:
    from flask import Flask
except ImportError:
    os.system('pip install flask --quiet')
    from flask import Flask

try:
    from flask_cors import CORS
except ImportError:
    os.system('pip install flask-cors --quiet')
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

CONFIG_FILE = "wormgpt_config.json"
PROMPT_FILE = "system-prompt.txt"
CONVERSATIONS_DIR = "conversations"
DEFAULT_API_KEY = ""
DEFAULT_BASE_URL = "https://api.deepseek.com"
DEFAULT_MODEL = "deepseek-chat"
SUPPORTED_LANGUAGES = ["English", "Indonesian", "Spanish", "Arabic", "Thai", "Portuguese", "Bengali", "Hindi", "Chinese", "Japanese", "Korean", "French", "German", "Russian"]
AVAILABLE_MODELS = ["deepseek-chat", "deepseek-coder", "deepseek-reasoner"]

webui_app = None
webui_thread = None
webui_running = False

def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                config = json.load(f)
                if "max_history" not in config:
                    config["max_history"] = 10000
                if "max_tokens" not in config:
                    config["max_tokens"] = 128000
                return config
        except:
            return create_default_config()
    else:
        return create_default_config()

def create_default_config():
    return {
        "api_key": DEFAULT_API_KEY,
        "base_url": DEFAULT_BASE_URL,
        "model": DEFAULT_MODEL,
        "language": "English",
        "temperature": 0.7,
        "top_p": 0.9,
        "webui_port": 5000,
        "webui_enabled": True,  # Default to enabled
        "stream": True,
        "max_history": 10000,
        "max_tokens": 128000,
        "auto_save": True,
        "auto_scroll": True,
        "dark_mode": True,
        "context_window": 128000,
        "max_input_tokens": 64000,
        "max_output_tokens": 64000
    }

def save_config(config):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)

if not os.path.exists(CONVERSATIONS_DIR):
    os.makedirs(CONVERSATIONS_DIR)

def get_conversation_file(conversation_id):
    return os.path.join(CONVERSATIONS_DIR, f"{conversation_id}.json")

def create_new_conversation():
    conversation_id = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
    conversation_file = get_conversation_file(conversation_id)
    
    conversation_data = {
        "id": conversation_id,
        "created_at": datetime.now().isoformat(),
        "title": "New Conversation",
        "messages": [],
        "model": load_config()["model"],
        "updated_at": datetime.now().isoformat(),
        "token_count": 0,
        "context_window": 128000
    }
    
    with open(conversation_file, "w", encoding="utf-8") as f:
        json.dump(conversation_data, f, indent=2, ensure_ascii=False)
    
    return conversation_id

def load_conversation(conversation_id):
    conversation_file = get_conversation_file(conversation_id)
    if os.path.exists(conversation_file):
        with open(conversation_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return None

def save_conversation_message(conversation_id, role, content, tokens=0):
    conversation = load_conversation(conversation_id)
    if conversation:
        config = load_config()
        max_history = config.get("max_history", 10000)
        
        conversation["messages"].append({
            "role": role,
            "content": content,
            "timestamp": datetime.now().isoformat(),
            "tokens": tokens
        })
        
        conversation["token_count"] = conversation.get("token_count", 0) + tokens
        
        if len(conversation["messages"]) > 50000:
            conversation["messages"] = conversation["messages"][-50000:]
        
        conversation["updated_at"] = datetime.now().isoformat()
        
        if len(conversation["messages"]) == 1 and role == "user":
            title = content[:150]
            if len(content) > 150:
                title = title + "..."
            conversation["title"] = title
        
        conversation["model"] = config["model"]
        conversation["context_window"] = config.get("context_window", 128000)
        
        conversation_file = get_conversation_file(conversation_id)
        with open(conversation_file, "w", encoding="utf-8") as f:
            json.dump(conversation, f, indent=2, ensure_ascii=False)
        
        return True
    return False

def get_conversation_messages(conversation_id):
    conversation = load_conversation(conversation_id)
    if conversation:
        return conversation["messages"]
    return []

def list_conversations():
    conversations = []
    if os.path.exists(CONVERSATIONS_DIR):
        for filename in os.listdir(CONVERSATIONS_DIR):
            if filename.endswith(".json"):
                filepath = os.path.join(CONVERSATIONS_DIR, filename)
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        conv = json.load(f)
                        conversations.append({
                            "id": conv["id"],
                            "title": conv.get("title", "Untitled"),
                            "created_at": conv.get("created_at"),
                            "updated_at": conv.get("updated_at"),
                            "message_count": len(conv.get("messages", [])),
                            "token_count": conv.get("token_count", 0),
                            "model": conv.get("model", "unknown"),
                            "context_window": conv.get("context_window", 128000)
                        })
                except:
                    continue
        conversations.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
    return conversations

def delete_conversation(conversation_id):
    conversation_file = get_conversation_file(conversation_id)
    if os.path.exists(conversation_file):
        os.remove(conversation_file)
        return True
    return False

def export_conversation(conversation_id, format="json"):
    conversation = load_conversation(conversation_id)
    if not conversation:
        return None
    
    if format == "json":
        return json.dumps(conversation, indent=2, ensure_ascii=False)
    elif format == "txt":
        text = f"Conversation: {conversation['title']}\n"
        text += f"Created: {conversation['created_at']}\n"
        text += f"Model: {conversation['model']}\n"
        text += f"Context Window: {conversation.get('context_window', 128000)} tokens\n"
        text += f"Total Messages: {len(conversation['messages'])}\n"
        text += f"Total Tokens: {conversation.get('token_count', 0)}\n"
        text += "=" * 50 + "\n\n"
        
        for msg in conversation['messages']:
            role = "User" if msg['role'] == 'user' else "Assistant"
            timestamp = datetime.fromisoformat(msg['timestamp']).strftime("%Y-%m-%d %H:%M:%S")
            text += f"[{timestamp}] {role}:\n"
            text += msg['content'] + "\n"
            text += "-" * 30 + "\n"
        
        return text
    elif format == "md":
        md = f"# {conversation['title']}\n\n"
        md += f"**Created:** {conversation['created_at']}\n"
        md += f"**Model:** {conversation['model']}\n"
        md += f"**Context Window:** {conversation.get('context_window', 128000)} tokens\n"
        md += f"**Total Messages:** {len(conversation['messages'])}\n"
        md += f"**Total Tokens:** {conversation.get('token_count', 0)}\n\n"
        md += "---\n\n"
        
        for msg in conversation['messages']:
            role = "**User**" if msg['role'] == 'user' else "**Assistant**"
            timestamp = datetime.fromisoformat(msg['timestamp']).strftime("%Y-%m-%d %H:%M:%S")
            md += f"### {role} ({timestamp})\n\n"
            md += msg['content'] + "\n\n"
            md += "---\n\n"
        
        return md
    return None

def banner():
    try:
        figlet = pyfiglet.Figlet(font="big")
        print(f"{colors.bright_red}{figlet.renderText('WormGPT')}{colors.reset}")
    except:
        print(f"{colors.bright_red}WormGPT{colors.reset}")
    print(f"{colors.bright_cyan}DeepSeek Pro v3.0 | Extreme Token Limit | Big Projects | WebUI{colors.reset}")
    print(f"{colors.bright_yellow}Made With ❤️  | {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}{colors.reset}\n")

def clear_screen():
    os.system("cls" if platform.system() == "Windows" else "clear")

def typing_print(text, delay=0.01):
    for char in text:
        sys.stdout.write(char)
        sys.stdout.flush()
        time.sleep(delay)
    print()

def select_language():
    config = load_config()
    clear_screen()
    banner()
    
    print(f"{colors.bright_cyan}[ Language Selection ]{colors.reset}")
    print(f"{colors.yellow}Current: {colors.green}{config['language']}{colors.reset}")
    
    for idx, lang in enumerate(SUPPORTED_LANGUAGES, 1):
        print(f"{colors.green}{idx:2d}. {lang}{colors.reset}")
    
    while True:
        try:
            choice = int(input(f"\n{colors.red}[>] Select (1-{len(SUPPORTED_LANGUAGES)}): {colors.reset}"))
            if 1 <= choice <= len(SUPPORTED_LANGUAGES):
                config["language"] = SUPPORTED_LANGUAGES[choice-1]
                save_config(config)
                print(f"{colors.bright_cyan}✓ Language set to: {SUPPORTED_LANGUAGES[choice-1]}{colors.reset}")
                time.sleep(1)
                return
            print(f"{colors.red}✗ Invalid selection!{colors.reset}")
        except ValueError:
            print(f"{colors.red}✗ Please enter a number{colors.reset}")

def select_model():
    config = load_config()
    clear_screen()
    banner()
    
    print(f"{colors.bright_cyan}[ Model Configuration ]{colors.reset}")
    print(f"{colors.yellow}Current: {colors.green}{config['model']}{colors.reset}")
    print(f"\n{colors.yellow}1. DeepSeek Chat (General Purpose) - 128K tokens{colors.reset}")
    print(f"{colors.yellow}2. DeepSeek Coder (Programming) - 128K tokens{colors.reset}")
    print(f"{colors.yellow}3. DeepSeek Reasoner (Complex Reasoning) - 128K tokens{colors.reset}")
    print(f"{colors.yellow}4. Back to menu{colors.reset}")
    
    while True:
        choice = input(f"\n{colors.red}[>] Select (1-4): {colors.reset}")
        if choice == "1":
            config["model"] = "deepseek-chat"
            config["context_window"] = 128000
            save_config(config)
            print(f"{colors.bright_cyan}✓ Model set to: DeepSeek Chat{colors.reset}")
            print(f"{colors.bright_green}✓ Context Window: 128,000 tokens{colors.reset}")
            time.sleep(1)
            return
        elif choice == "2":
            config["model"] = "deepseek-coder"
            config["context_window"] = 128000
            save_config(config)
            print(f"{colors.bright_cyan}✓ Model set to: DeepSeek Coder{colors.reset}")
            print(f"{colors.bright_green}✓ Context Window: 128,000 tokens{colors.reset}")
            time.sleep(1)
            return
        elif choice == "3":
            config["model"] = "deepseek-reasoner"
            config["context_window"] = 128000
            save_config(config)
            print(f"{colors.bright_cyan}✓ Model set to: DeepSeek Reasoner{colors.reset}")
            print(f"{colors.bright_green}✓ Context Window: 128,000 tokens{colors.reset}")
            time.sleep(1)
            return
        elif choice == "4":
            return
        else:
            print(f"{colors.red}✗ Invalid selection!{colors.reset}")

def set_api_key():
    config = load_config()
    clear_screen()
    banner()
    
    print(f"{colors.bright_cyan}[ API Key Setup ]{colors.reset}")
    print(f"{colors.yellow}Current Key: {colors.green}{'*' * min(20, len(config['api_key'])) if config['api_key'] else 'Not set'}{colors.reset}")
    
    new_key = input(f"\n{colors.red}[>] Enter DeepSeek API Key: {colors.reset}")
    if new_key.strip():
        config["api_key"] = new_key.strip()
        save_config(config)
        print(f"{colors.bright_cyan}✓ API Key updated{colors.reset}")
        print(f"{colors.yellow}Note: Get API key from https://platform.deepseek.com/api_keys{colors.reset}")
        time.sleep(2)

def get_system_prompt():
    try:
        with open(PROMPT_FILE, "r", encoding="utf-8") as f:
            content = f.read().strip()
            if content:
                return content
            else:
                return "You are WormGPT, an advanced AI assistant with 128K token context window. You can handle very large projects and long conversations. You should provide detailed, comprehensive responses."
    except Exception as e:
        return "You are WormGPT, an advanced AI assistant with 128K token context window. You can handle very large projects and long conversations. You should provide detailed, comprehensive responses."

def estimate_tokens(text):
    return len(text) // 4

def format_terminal_output(text):
    lines = text.split('\n')
    formatted_lines = []
    in_code_block = False
    code_language = ""

    for line in lines:
        if line.strip().startswith('```'):
            if not in_code_block:
                in_code_block = True
                code_language = line.strip()[3:].strip()
                formatted_lines.append(f"{colors.bright_yellow}┌─[ Code: {code_language} ]─┐{colors.reset}")
            else:
                in_code_block = False
                formatted_lines.append(f"{colors.bright_yellow}└───────────────────────┘{colors.reset}")
        elif in_code_block:
            formatted_lines.append(f"{colors.cyan}│ {line}{colors.reset}")
        else:
            line = line.replace('**', f'{colors.bold}')
            line = line.replace('`', f'{colors.bright_cyan}')
            formatted_lines.append(line)

    return '\n'.join(formatted_lines)

def smart_context_management(messages, max_context_tokens=120000):
    if not messages:
        return []
    
    total_tokens = sum(estimate_tokens(msg['content']) for msg in messages)
    
    if total_tokens <= max_context_tokens:
        return messages
    
    keep_count = max(10, len(messages) // 5)
    important_messages = messages[:keep_count]
    recent_messages = messages[-keep_count*4:]
    
    combined = important_messages + recent_messages
    
    seen = set()
    unique_messages = []
    for msg in combined:
        msg_hash = hash(msg['content'][:100])
        if msg_hash not in seen:
            seen.add(msg_hash)
            unique_messages.append(msg)
    
    return unique_messages

def call_api_stream(user_input, conversation_id, model=None, for_webui=True):
    config = load_config()
    
    if model:
        current_model = model
    else:
        current_model = config["model"]

    messages = get_conversation_messages(conversation_id)

    api_messages = []
    api_messages.append({"role": "system", "content": get_system_prompt()})

    context_messages = smart_context_management(messages, config.get("context_window", 120000))
    
    for msg in context_messages:
        api_messages.append({"role": msg["role"], "content": msg["content"]})

    api_messages.append({"role": "user", "content": user_input})

    try:
        headers = {
            "Authorization": f"Bearer {config['api_key']}",
            "Content-Type": "application/json"
        }
        
        data = {
            "model": current_model,
            "messages": api_messages,
            "temperature": config.get("temperature", 0.7),
            "top_p": config.get("top_p", 0.9),
            "max_tokens": config.get("max_output_tokens", 64000),
            "stream": True
        }
        
        response = requests.post(
            f"{config['base_url']}/chat/completions",
            headers=headers,
            json=data,
            stream=True,
            timeout=600
        )
        
        if response.status_code != 200:
            error_msg = f"[WormGPT] API Error {response.status_code}: {response.text}"
            if for_webui:
                yield f"data: {json.dumps({'error': error_msg})}\n\n"
            else:
                # For terminal, return the error message directly
                return error_msg
        
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
                                        # For terminal, yield the content directly
                                        yield content
                        except:
                            continue
        
        user_tokens = estimate_tokens(user_input)
        assistant_tokens = estimate_tokens(full_response)
        
        save_conversation_message(conversation_id, "user", user_input, user_tokens)
        save_conversation_message(conversation_id, "assistant", full_response, assistant_tokens)
        
        if for_webui:
            yield f"data: [DONE]\n\n"
        else:
            # For terminal, yield a special marker to indicate completion
            yield None

    except requests.exceptions.Timeout:
        error_msg = "[WormGPT] Request timeout. The response might be very large. Please try a shorter query."
        if for_webui:
            yield f"data: {json.dumps({'error': error_msg})}\n\n"
        else:
            yield error_msg
    except Exception as e:
        error_msg = f"[WormGPT] Error: {str(e)}"
        if for_webui:
            yield f"data: {json.dumps({'error': error_msg})}\n\n"
        else:
            yield error_msg

def call_api_normal(user_input, conversation_id, model=None):
    config = load_config()
    
    if model:
        current_model = model
    else:
        current_model = config["model"]

    messages = get_conversation_messages(conversation_id)

    api_messages = []
    api_messages.append({"role": "system", "content": get_system_prompt()})

    context_messages = smart_context_management(messages, config.get("context_window", 120000))
    
    for msg in context_messages:
        api_messages.append({"role": msg["role"], "content": msg["content"]})

    api_messages.append({"role": "user", "content": user_input})

    try:
        headers = {
            "Authorization": f"Bearer {config['api_key']}",
            "Content-Type": "application/json"
        }
        
        data = {
            "model": current_model,
            "messages": api_messages,
            "temperature": config.get("temperature", 0.7),
            "top_p": config.get("top_p", 0.9),
            "max_tokens": config.get("max_output_tokens", 64000),
            "stream": False
        }
        
        response = requests.post(
            f"{config['base_url']}/chat/completions",
            headers=headers,
            json=data,
            timeout=300
        )
        
        if response.status_code != 200:
            return f"[WormGPT] API Error {response.status_code}: {response.text}"
        
        result = response.json()
        response_text = result['choices'][0]['message']['content']
        
        user_tokens = estimate_tokens(user_input)
        assistant_tokens = estimate_tokens(response_text)
        
        save_conversation_message(conversation_id, "user", user_input, user_tokens)
        save_conversation_message(conversation_id, "assistant", response_text, assistant_tokens)
        
        return response_text
        
    except Exception as e:
        return f"[WormGPT] Error: {str(e)}"

def chat_session():
    config = load_config()
    clear_screen()
    banner()

    print(f"{colors.bright_cyan}[ Chat Session - 128K Token Context Window ]{colors.reset}")

    conversations = list_conversations()
    if conversations:
        print(f"{colors.yellow}Recent conversations:{colors.reset}")
        for i, conv in enumerate(conversations[:15], 1):
            print(f"{colors.green}{i:2d}. {conv['title'][:100]}{colors.reset}")
            print(f"   Messages: {conv['message_count']:4d} | Tokens: {conv['token_count']:8d} | Context: {conv.get('context_window', 128000)}")
        print(f"{colors.green}N. Start new conversation{colors.reset}")
        print(f"{colors.green}B. Back to menu{colors.reset}")
        
        try:
            choice = input(f"\n{colors.red}[>] Select (1-{min(15, len(conversations))}, N, B): {colors.reset}")
            if choice.upper() == 'B':
                return
            elif choice.upper() == 'N':
                conversation_id = create_new_conversation()
            elif choice.isdigit() and 1 <= int(choice) <= min(15, len(conversations)):
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
    print(f"{colors.bright_cyan}[ Chat Session: {conversation['title']} ]{colors.reset}")
    print(f"{colors.yellow}Model: {colors.green}{config['model']}{colors.reset}")
    print(f"{colors.yellow}Context Window: {colors.bright_green}{conversation.get('context_window', 128000)} tokens{colors.reset}")
    print(f"{colors.yellow}Memory: {colors.green}{len(conversation['messages'])//2} exchanges{colors.reset}")
    print(f"{colors.yellow}Tokens: {colors.green}{conversation.get('token_count', 0):,}{colors.reset}")
    print(f"{colors.yellow}Max Input: {colors.green}{config.get('max_input_tokens', 64000)} tokens{colors.reset}")
    print(f"{colors.yellow}Max Output: {colors.green}{config.get('max_output_tokens', 64000)} tokens{colors.reset}")
    print(f"{colors.yellow}Status: {colors.bright_green}Extreme Token Limit Active ✓{colors.reset}")
    print(f"{colors.yellow}Commands: {colors.green}menu{colors.reset}, {colors.green}clear{colors.reset}, {colors.green}new{colors.reset}, {colors.green}history{colors.reset}, {colors.green}export{colors.reset}, {colors.green}context{colors.reset}, {colors.green}exit{colors.reset}")

    while True:
        try:
            user_input = input(f"\n{colors.red}[You]>{colors.reset} ")
            
            if not user_input.strip():
                continue
            
            command = user_input.lower().strip()
            
            if command == "exit":
                print(f"{colors.bright_cyan}✓ Saving conversation...{colors.reset}")
                time.sleep(0.5)
                return
            elif command == "menu":
                return
            elif command == "clear":
                clear_screen()
                banner()
                print(f"{colors.bright_cyan}[ Chat Session: {conversation['title']} ]{colors.reset}")
                continue
            elif command == "new":
                print(f"{colors.bright_cyan}✓ Starting new conversation...{colors.reset}")
                time.sleep(0.5)
                chat_session()
                return
            elif command == "history":
                print(f"\n{colors.bright_cyan}[ Conversation History ]{colors.reset}")
                messages = get_conversation_messages(conversation_id)
                for msg in messages[-15:]:
                    role = "You" if msg["role"] == "user" else "WormGPT"
                    timestamp = datetime.fromisoformat(msg["timestamp"]).strftime("%H:%M")
                    print(f"{colors.yellow}[{timestamp}] {role}:{colors.reset}")
                    print(format_terminal_output(msg['content'][:300]))
                    if len(msg['content']) > 300:
                        print(f"{colors.gray}... (truncated){colors.reset}")
                    print()
                continue
            elif command == "context":
                print(f"\n{colors.bright_cyan}[ Context Information ]{colors.reset}")
                messages = get_conversation_messages(conversation_id)
                total_tokens = sum(estimate_tokens(msg['content']) for msg in messages)
                print(f"{colors.yellow}Total Messages: {colors.green}{len(messages)}{colors.reset}")
                print(f"{colors.yellow}Estimated Context Tokens: {colors.green}{total_tokens:,}{colors.reset}")
                print(f"{colors.yellow}Context Window: {colors.green}{conversation.get('context_window', 128000):,}{colors.reset}")
                print(f"{colors.yellow}Available Tokens: {colors.green}{conversation.get('context_window', 128000) - total_tokens:,}{colors.reset}")
                
                if messages:
                    print(f"\n{colors.yellow}Token Distribution:{colors.reset}")
                    user_msgs = [m for m in messages if m['role'] == 'user']
                    assistant_msgs = [m for m in messages if m['role'] == 'assistant']
                    user_tokens = sum(estimate_tokens(m['content']) for m in user_msgs)
                    assistant_tokens = sum(estimate_tokens(m['content']) for m in assistant_msgs)
                    
                    print(f"{colors.green}User Messages: {len(user_msgs)} ({user_tokens:,} tokens){colors.reset}")
                    print(f"{colors.cyan}Assistant Messages: {len(assistant_msgs)} ({assistant_tokens:,} tokens){colors.reset}")
                    print(f"{colors.yellow}Total: {len(messages)} messages ({total_tokens:,} tokens){colors.reset}")
                
                input(f"\n{colors.red}[>] Press Enter to continue {colors.reset}")
                continue
            elif command == "export":
                print(f"\n{colors.bright_cyan}[ Export Options ]{colors.reset}")
                print(f"{colors.green}1. Export as JSON{colors.reset}")
                print(f"{colors.green}2. Export as Text{colors.reset}")
                print(f"{colors.green}3. Export as Markdown{colors.reset}")
                print(f"{colors.green}4. Cancel{colors.reset}")
                
                exp_choice = input(f"\n{colors.red}[>] Select: {colors.reset}")
                if exp_choice == "1":
                    export_data = export_conversation(conversation_id, "json")
                    if export_data:
                        export_file = f"conversation_{conversation_id}.json"
                        with open(export_file, "w", encoding="utf-8") as f:
                            f.write(export_data)
                        print(f"{colors.bright_green}✓ Exported to: {export_file}{colors.reset}")
                elif exp_choice == "2":
                    export_data = export_conversation(conversation_id, "txt")
                    if export_data:
                        export_file = f"conversation_{conversation_id}.txt"
                        with open(export_file, "w", encoding="utf-8") as f:
                            f.write(export_data)
                        print(f"{colors.bright_green}✓ Exported to: {export_file}{colors.reset}")
                elif exp_choice == "3":
                    export_data = export_conversation(conversation_id, "md")
                    if export_data:
                        export_file = f"conversation_{conversation_id}.md"
                        with open(export_file, "w", encoding="utf-8") as f:
                            f.write(export_data)
                        print(f"{colors.bright_green}✓ Exported to: {export_file}{colors.reset}")
                continue
            
            print(f"\n{colors.bright_cyan}[WormGPT]>{colors.reset}")
            
            # FIXED: Handle the generator properly for terminal
            response_generator = call_api_stream(user_input, conversation_id, for_webui=False)
            
            try:
                # Process stream for terminal
                for chunk in response_generator:
                    if chunk is None:
                        break  # End of stream
                    elif isinstance(chunk, str):
                        sys.stdout.write(chunk)
                        sys.stdout.flush()
                print()  # New line after response
            except Exception as e:
                print(f"\n{colors.red}Error: {e}{colors.reset}")
            
        except KeyboardInterrupt:
            print(f"\n{colors.red}✗ Interrupted! Saving conversation...{colors.reset}")
            time.sleep(0.5)
            return
        except Exception as e:
            print(f"\n{colors.red}✗ Error: {e}{colors.reset}")

def manage_conversations():
    clear_screen()
    banner()

    print(f"{colors.bright_cyan}[ Manage Conversations ]{colors.reset}")
    conversations = list_conversations()

    if not conversations:
        print(f"{colors.yellow}No saved conversations found.{colors.reset}")
        input(f"\n{colors.red}[>] Press Enter to continue {colors.reset}")
        return

    print(f"\n{colors.yellow}Saved conversations:{colors.reset}")
    for i, conv in enumerate(conversations, 1):
        created = datetime.fromisoformat(conv['created_at']).strftime("%Y-%m-%d %H:%M")
        updated = datetime.fromisoformat(conv['updated_at']).strftime("%Y-%m-%d %H:%M")
        print(f"{colors.green}{i:3d}. {conv['title'][:100]}{colors.reset}")
        print(f"      Messages: {conv['message_count']:4d} | Tokens: {conv['token_count']:8d} | Context: {conv.get('context_window', 128000)}")
        print(f"      Created: {created} | Updated: {updated}")
        print()

    print(f"\n{colors.yellow}Options:{colors.reset}")
    print(f"{colors.green}V. View conversation details{colors.reset}")
    print(f"{colors.green}D. Delete conversation{colors.reset}")
    print(f"{colors.green}E. Export conversation{colors.reset}")
    print(f"{colors.green}C. Cleanup old conversations{colors.reset}")
    print(f"{colors.green}B. Back to menu{colors.reset}")

    choice = input(f"\n{colors.red}[>] Select (1-{len(conversations)}, V, D, E, C, B): {colors.reset}")

    if choice.upper() == 'B':
        return
    elif choice.upper() == 'V':
        try:
            idx = int(input(f"{colors.red}[>] Enter conversation number to view: {colors.reset}")) - 1
            if 0 <= idx < len(conversations):
                conversation_id = conversations[idx]["id"]
                conversation = load_conversation(conversation_id)
                
                print(f"\n{colors.bright_cyan}[ Conversation Details ]{colors.reset}")
                print(f"{colors.yellow}Title: {colors.green}{conversation['title']}{colors.reset}")
                print(f"{colors.yellow}ID: {colors.cyan}{conversation['id']}{colors.reset}")
                print(f"{colors.yellow}Model: {colors.green}{conversation['model']}{colors.reset}")
                print(f"{colors.yellow}Context Window: {colors.green}{conversation.get('context_window', 128000)} tokens{colors.reset}")
                print(f"{colors.yellow}Created: {colors.green}{conversation['created_at']}{colors.reset}")
                print(f"{colors.yellow}Updated: {colors.green}{conversation['updated_at']}{colors.reset}")
                print(f"{colors.yellow}Messages: {colors.green}{len(conversation['messages'])}{colors.reset}")
                print(f"{colors.yellow}Tokens: {colors.green}{conversation.get('token_count', 0):,}{colors.reset}")
                
                if conversation['messages']:
                    total_chars = sum(len(msg['content']) for msg in conversation['messages'])
                    avg_chars = total_chars // len(conversation['messages'])
                    print(f"{colors.yellow}Avg. Message Length: {colors.green}{avg_chars} characters{colors.reset}")
                    print(f"{colors.yellow}Estimated Context Usage: {colors.green}{(conversation.get('token_count', 0) * 100) // conversation.get('context_window', 128000)}%{colors.reset}")
                
                input(f"\n{colors.red}[>] Press Enter to continue {colors.reset}")
        except:
            print(f"{colors.red}✗ Invalid selection!{colors.reset}")
            time.sleep(1)
    elif choice.upper() == 'D':
        try:
            idx = int(input(f"{colors.red}[>] Enter conversation number to delete: {colors.reset}")) - 1
            if 0 <= idx < len(conversations):
                conversation_id = conversations[idx]["id"]
                confirm = input(f"{colors.red}[>] Are you sure? (y/n): {colors.reset}")
                if confirm.lower() == 'y':
                    if delete_conversation(conversation_id):
                        print(f"{colors.bright_green}✓ Conversation deleted!{colors.reset}")
                    else:
                        print(f"{colors.red}✗ Failed to delete conversation.{colors.reset}")
                time.sleep(1)
        except:
            print(f"{colors.red}✗ Invalid selection!{colors.reset}")
            time.sleep(1)
    elif choice.upper() == 'E':
        try:
            idx = int(input(f"{colors.red}[>] Enter conversation number to export: {colors.reset}")) - 1
            if 0 <= idx < len(conversations):
                conversation_id = conversations[idx]["id"]
                
                print(f"\n{colors.bright_cyan}[ Export Format ]{colors.reset}")
                print(f"{colors.green}1. JSON (Full data){colors.reset}")
                print(f"{colors.green}2. Text (Readable format){colors.reset}")
                print(f"{colors.green}3. Markdown{colors.reset}")
                print(f"{colors.green}4. Cancel{colors.reset}")
                
                fmt_choice = input(f"\n{colors.red}[>] Select: {colors.reset}")
                
                if fmt_choice == "1":
                    export_data = export_conversation(conversation_id, "json")
                    if export_data:
                        export_file = f"export_{conversation_id}.json"
                        with open(export_file, "w", encoding="utf-8") as f:
                            f.write(export_data)
                        print(f"{colors.bright_green}✓ Exported to: {export_file}{colors.reset}")
                elif fmt_choice == "2":
                    export_data = export_conversation(conversation_id, "txt")
                    if export_data:
                        export_file = f"export_{conversation_id}.txt"
                        with open(export_file, "w", encoding="utf-8") as f:
                            f.write(export_data)
                        print(f"{colors.bright_green}✓ Exported to: {export_file}{colors.reset}")
                elif fmt_choice == "3":
                    export_data = export_conversation(conversation_id, "md")
                    if export_data:
                        export_file = f"export_{conversation_id}.md"
                        with open(export_file, "w", encoding="utf-8") as f:
                            f.write(export_data)
                        print(f"{colors.bright_green}✓ Exported to: {export_file}{colors.reset}")
                
                time.sleep(1)
        except:
            print(f"{colors.red}✗ Invalid selection!{colors.reset}")
            time.sleep(1)
    elif choice.upper() == 'C':
        print(f"\n{colors.bright_cyan}[ Cleanup Conversations ]{colors.reset}")
        print(f"{colors.yellow}This will delete conversations older than 30 days.{colors.reset}")
        confirm = input(f"{colors.red}[>] Are you sure? (y/n): {colors.reset}")
        if confirm.lower() == 'y':
            deleted_count = 0
            thirty_days_ago = datetime.now().timestamp() - (30 * 24 * 60 * 60)
            
            for conv in conversations:
                conv_date = datetime.fromisoformat(conv['updated_at']).timestamp()
                if conv_date < thirty_days_ago:
                    if delete_conversation(conv['id']):
                        deleted_count += 1
            
            print(f"{colors.bright_green}✓ Deleted {deleted_count} old conversations{colors.reset}")
            time.sleep(2)

def start_webui():
    global webui_app, webui_running

    config = load_config()
    port = config.get("webui_port", 5000)

    webui_app = Flask(__name__, static_folder='public', static_url_path='')
    CORS(webui_app)

    @webui_app.route('/')
    def index():
        return send_from_directory('public', 'index.html')

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
        model = data.get('model', None)
        conversation_id = data.get('conversation_id', '')
        
        if not user_message:
            return jsonify({'error': 'No message provided'}), 400
        
        if not conversation_id:
            conversation_id = create_new_conversation()
        
        response = call_api_normal(user_message, conversation_id, model=model)
        return jsonify({'response': response, 'conversation_id': conversation_id})

    @webui_app.route('/api/config')
    def api_config():
        config = load_config()
        return jsonify(config)

    @webui_app.route('/api/conversations')
    def api_conversations():
        conversations = list_conversations()
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

    @webui_app.route('/api/update_config', methods=['POST'])
    def api_update_config():
        try:
            data = request.json
            config = load_config()
            
            for key in ['api_key', 'base_url', 'language', 'model']:
                if key in data:
                    config[key] = data[key]
            
            for key in ['temperature', 'top_p']:
                if key in data:
                    config[key] = float(data[key])
            
            for key in ['webui_port', 'max_history', 'max_tokens', 'context_window', 'max_input_tokens', 'max_output_tokens']:
                if key in data:
                    config[key] = int(data[key])
            
            for key in ['webui_enabled', 'stream', 'auto_save', 'auto_scroll', 'dark_mode']:
                if key in data:
                    config[key] = bool(data[key])
            
            save_config(config)
            return jsonify({'success': True})
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)})

    @webui_app.route('/api/export/<conversation_id>')
    def api_export_conversation(conversation_id):
        format_type = request.args.get('format', 'json')
        export_data = export_conversation(conversation_id, format_type)
        
        if export_data:
            if format_type == 'json':
                mimetype = 'application/json'
                filename = f'conversation_{conversation_id}.json'
            elif format_type == 'md':
                mimetype = 'text/markdown'
                filename = f'conversation_{conversation_id}.md'
            else:
                mimetype = 'text/plain'
                filename = f'conversation_{conversation_id}.txt'
            
            return Response(
                export_data,
                mimetype=mimetype,
                headers={'Content-Disposition': f'attachment; filename={filename}'}
            )
        return jsonify({'error': 'Failed to export conversation'}), 404

    @webui_app.route('/api/ping')
    def api_ping():
        return jsonify({'status': 'ok', 'timestamp': datetime.now().isoformat()})

    @webui_app.route('/<path:path>')
    def serve_static(path):
        return send_from_directory('public', path)

    webui_running = True
    print(f"\n{colors.bright_green}✅ WebUI Started!{colors.reset}")
    print(f"{colors.bright_cyan}🌐 Open in browser: {colors.yellow}http://localhost:{port}{colors.reset}")
    print(f"{colors.bright_cyan}📱 From mobile: {colors.yellow}http://[YOUR-IP]:{port}{colors.reset}")
    print(f"{colors.bright_green}🚀 Real-time Streaming Active!{colors.reset}")
    print(f"{colors.bright_green}💾 128K Context Window Active!{colors.reset}")
    print(f"{colors.bright_green}📊 64K Input/Output Tokens Active!{colors.reset}")
    print(f"{colors.bright_green}⚡ Smart Context Management Active!{colors.reset}")
    print(f"{colors.yellow}⏹️  Stop WebUI: Main Menu → WebUI Settings → Disable WebUI{colors.reset}")

    try:
        webbrowser.open(f"http://localhost:{port}")
    except:
        pass

    webui_app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False)

def toggle_webui():
    global webui_thread, webui_running

    config = load_config()

    clear_screen()
    banner()
    print(f"{colors.bright_cyan}[ WebUI Settings ]{colors.reset}")

    if config.get("webui_enabled", False):
        print(f"{colors.yellow}Current status: {colors.green}Active ✓{colors.reset}")
        print(f"{colors.yellow}Port: {colors.cyan}{config.get('webui_port', 5000)}{colors.reset}")
        print(f"{colors.yellow}Streaming: {colors.green}Active ✓{colors.reset}")
        print(f"{colors.yellow}Context Window: {colors.green}{config.get('context_window', 128000)} tokens{colors.reset}")
        print(f"{colors.yellow}Max Input: {colors.green}{config.get('max_input_tokens', 64000)} tokens{colors.reset}")
        print(f"{colors.yellow}Max Output: {colors.green}{config.get('max_output_tokens', 64000)} tokens{colors.reset}")
        
        print(f"\n{colors.yellow}1. Disable WebUI{colors.reset}")
        print(f"{colors.yellow}2. Change Port{colors.reset}")
        print(f"{colors.yellow}3. Extreme Settings{colors.reset}")
        print(f"{colors.yellow}4. Back to menu{colors.reset}")
        
        choice = input(f"\n{colors.red}[>] Select (1-4): {colors.reset}")
        
        if choice == "1":
            config["webui_enabled"] = False
            save_config(config)
            print(f"{colors.bright_yellow}✓ WebUI disabled{colors.reset}")
            print(f"{colors.yellow}Restart program to apply changes{colors.reset}")
            time.sleep(2)
        elif choice == "2":
            try:
                new_port = int(input(f"{colors.red}[>] Enter new port (1000-65535): {colors.reset}"))
                if 1000 <= new_port <= 65535:
                    config["webui_port"] = new_port
                    save_config(config)
                    print(f"{colors.bright_green}✓ Port changed to: {new_port}{colors.reset}")
                    print(f"{colors.yellow}Restart program to apply changes{colors.reset}")
                else:
                    print(f"{colors.red}✗ Invalid port number!{colors.reset}")
            except ValueError:
                print(f"{colors.red}✗ Enter a number!{colors.reset}")
            time.sleep(2)
        elif choice == "3":
            print(f"\n{colors.bright_cyan}[ Extreme Settings ]{colors.reset}")
            print(f"{colors.yellow}1. Context Window: {colors.green}{config.get('context_window', 128000)} tokens{colors.reset}")
            print(f"{colors.yellow}2. Max Input Tokens: {colors.green}{config.get('max_input_tokens', 64000)} tokens{colors.reset}")
            print(f"{colors.yellow}3. Max Output Tokens: {colors.green}{config.get('max_output_tokens', 64000)} tokens{colors.reset}")
            print(f"{colors.yellow}4. Max History: {colors.green}{config.get('max_history', 10000)} messages{colors.reset}")
            print(f"{colors.yellow}5. Temperature: {colors.green}{config.get('temperature', 0.7)}{colors.reset}")
            print(f"{colors.yellow}6. Top P: {colors.green}{config.get('top_p', 0.9)}{colors.reset}")
            
            adv_choice = input(f"\n{colors.red}[>] Select setting to change (1-6): {colors.reset}")
            
            if adv_choice == "1":
                try:
                    context_window = int(input(f"{colors.red}[>] Context Window (32000-128000): {colors.reset}"))
                    if 32000 <= context_window <= 128000:
                        config["context_window"] = context_window
                        save_config(config)
                        print(f"{colors.bright_green}✓ Context window set to: {context_window:,} tokens{colors.reset}")
                    else:
                        print(f"{colors.red}✗ Must be between 32K and 128K!{colors.reset}")
                except:
                    print(f"{colors.red}✗ Invalid input!{colors.reset}")
            elif adv_choice == "2":
                try:
                    max_input = int(input(f"{colors.red}[>] Max Input Tokens (16000-64000): {colors.reset}"))
                    if 16000 <= max_input <= 64000:
                        config["max_input_tokens"] = max_input
                        save_config(config)
                        print(f"{colors.bright_green}✓ Max input tokens set to: {max_input:,}{colors.reset}")
                    else:
                        print(f"{colors.red}✗ Must be between 16K and 64K!{colors.reset}")
                except:
                    print(f"{colors.red}✗ Invalid input!{colors.reset}")
            elif adv_choice == "3":
                try:
                    max_output = int(input(f"{colors.red}[>] Max Output Tokens (16000-64000): {colors.reset}"))
                    if 16000 <= max_output <= 64000:
                        config["max_output_tokens"] = max_output
                        save_config(config)
                        print(f"{colors.bright_green}✓ Max output tokens set to: {max_output:,}{colors.reset}")
                    else:
                        print(f"{colors.red}✗ Must be between 16K and 64K!{colors.reset}")
                except:
                    print(f"{colors.red}✗ Invalid input!{colors.reset}")
            elif adv_choice == "4":
                try:
                    max_history = int(input(f"{colors.red}[>] Max History (1000-50000): {colors.reset}"))
                    if 1000 <= max_history <= 50000:
                        config["max_history"] = max_history
                        save_config(config)
                        print(f"{colors.bright_green}✓ Max history set to: {max_history:,}{colors.reset}")
                    else:
                        print(f"{colors.red}✗ Must be between 1K and 50K!{colors.reset}")
                except:
                    print(f"{colors.red}✗ Invalid input!{colors.reset}")
            elif adv_choice == "5":
                try:
                    temp = float(input(f"{colors.red}[>] Temperature (0.0-2.0): {colors.reset}"))
                    if 0.0 <= temp <= 2.0:
                        config["temperature"] = temp
                        save_config(config)
                        print(f"{colors.bright_green}✓ Temperature set to: {temp}{colors.reset}")
                    else:
                        print(f"{colors.red}✗ Invalid value!{colors.reset}")
                except:
                    print(f"{colors.red}✗ Invalid input!{colors.reset}")
            elif adv_choice == "6":
                try:
                    top_p = float(input(f"{colors.red}[>] Top P (0.0-1.0): {colors.reset}"))
                    if 0.0 <= top_p <= 1.0:
                        config["top_p"] = top_p
                        save_config(config)
                        print(f"{colors.bright_green}✓ Top P set to: {top_p}{colors.reset}")
                    else:
                        print(f"{colors.red}✗ Invalid value!{colors.reset}")
                except:
                    print(f"{colors.red}✗ Invalid input!{colors.reset}")
            
            time.sleep(1)
    else:
        print(f"{colors.yellow}Current status: {colors.red}Inactive ✗{colors.reset}")
        
        print(f"\n{colors.yellow}1. Enable WebUI (Extreme Token Mode){colors.reset}")
        print(f"{colors.yellow}2. Back to menu{colors.reset}")
        
        choice = input(f"\n{colors.red}[>] Select (1-2): {colors.reset}")
        
        if choice == "1":
            try:
                port_input = input(f"{colors.red}[>] Port number (Default: 5000): {colors.reset}")
                if port_input.strip():
                    port = int(port_input)
                    if not (1000 <= port <= 65535):
                        print(f"{colors.red}✗ Invalid port! Use 1000-65535{colors.reset}")
                        time.sleep(2)
                        return
                else:
                    port = 5000
                
                config["webui_port"] = port
                config["webui_enabled"] = True
                save_config(config)
                
                print(f"{colors.bright_green}✓ WebUI enabled!{colors.reset}")
                print(f"{colors.cyan}Port: {colors.yellow}{port}{colors.reset}")
                print(f"{colors.bright_green}✓ Real-time Streaming Active{colors.reset}")
                print(f"{colors.bright_green}✓ 128K Context Window Active{colors.reset}")
                print(f"{colors.bright_green}✓ 64K Input/Output Tokens Active{colors.reset}")
                print(f"{colors.bright_green}⚡ Smart Context Management Active{colors.reset}")
                print(f"{colors.yellow}Restart program to apply changes{colors.reset}")
                time.sleep(2)
                
            except ValueError:
                print(f"{colors.red}✗ Invalid input!{colors.reset}")
                time.sleep(2)

def system_info():
    config = load_config()
    clear_screen()
    banner()

    conversations = list_conversations()
    total_messages = sum(conv['message_count'] for conv in conversations)
    total_tokens = sum(conv['token_count'] for conv in conversations)

    print(f"{colors.bright_cyan}[ System Information - Extreme Version ]{colors.reset}")
    print(f"{colors.yellow}Model: {colors.green}{config['model']}{colors.reset}")
    print(f"{colors.yellow}Language: {colors.green}{config['language']}{colors.reset}")
    print(f"{colors.yellow}API Base URL: {colors.green}{config['base_url']}{colors.reset}")
    print(f"{colors.yellow}WebUI Status: {colors.green if config.get('webui_enabled') else colors.red}{'Active' if config.get('webui_enabled') else 'Inactive'}{colors.reset}")
    print(f"{colors.yellow}WebUI Port: {colors.green}{config.get('webui_port', 5000)}{colors.reset}")
    print(f"{colors.yellow}Temperature: {colors.green}{config.get('temperature', 0.7)}{colors.reset}")
    print(f"{colors.yellow}Top P: {colors.green}{config.get('top_p', 0.9)}{colors.reset}")
    print(f"{colors.yellow}Context Window: {colors.bright_green}{config.get('context_window', 128000):,} tokens{colors.reset}")
    print(f"{colors.yellow}Max Input Tokens: {colors.bright_green}{config.get('max_input_tokens', 64000):,}{colors.reset}")
    print(f"{colors.yellow}Max Output Tokens: {colors.bright_green}{config.get('max_output_tokens', 64000):,}{colors.reset}")
    print(f"{colors.yellow}Max History: {colors.bright_green}{config.get('max_history', 10000):,} messages{colors.reset}")
    print(f"{colors.yellow}Saved Conversations: {colors.green}{len(conversations)}{colors.reset}")
    print(f"{colors.yellow}Total Messages: {colors.green}{total_messages:,}{colors.reset}")
    print(f"{colors.yellow}Total Tokens: {colors.green}{total_tokens:,}{colors.reset}")
    print(f"{colors.yellow}Auto Save: {colors.green if config.get('auto_save', True) else colors.red}{'Enabled' if config.get('auto_save', True) else 'Disabled'}{colors.reset}")
    print(f"{colors.yellow}Dark Mode: {colors.green if config.get('dark_mode', True) else colors.red}{'Enabled' if config.get('dark_mode', True) else 'Disabled'}{colors.reset}")

    print(f"\n{colors.yellow}Python Version: {colors.green}{sys.version.split()[0]}{colors.reset}")
    print(f"{colors.yellow}OS: {colors.green}{platform.system()} {platform.release()}{colors.reset}")
    print(f"{colors.yellow}Architecture: {colors.green}{platform.machine()}{colors.reset}")

    input(f"\n{colors.red}[>] Press Enter to return to menu {colors.reset}")

def check_api_key():
    config = load_config()

    if not config.get("api_key"):
        print(f"\n{colors.bright_red}⚠️  API Key not set!{colors.reset}")
        print(f"{colors.yellow}1. Get API key from https://platform.deepseek.com/api_keys{colors.reset}")
        print(f"{colors.yellow}2. Go to Main Menu → Set API Key{colors.reset}")
        time.sleep(3)
        return False
    return True

def advanced_settings():
    config = load_config()
    clear_screen()
    banner()

    print(f"{colors.bright_cyan}[ Extreme Settings ]{colors.reset}")
    print(f"{colors.yellow}1. Model: {colors.green}{config['model']}{colors.reset}")
    print(f"{colors.yellow}2. Context Window: {colors.green}{config.get('context_window', 128000):,} tokens{colors.reset}")
    print(f"{colors.yellow}3. Max Input Tokens: {colors.green}{config.get('max_input_tokens', 64000):,}{colors.reset}")
    print(f"{colors.yellow}4. Max Output Tokens: {colors.green}{config.get('max_output_tokens', 64000):,}{colors.reset}")
    print(f"{colors.yellow}5. Max History: {colors.green}{config.get('max_history', 10000):,} messages{colors.reset}")
    print(f"{colors.yellow}6. Temperature: {colors.green}{config.get('temperature', 0.7)}{colors.reset}")
    print(f"{colors.yellow}7. Top P: {colors.green}{config.get('top_p', 0.9)}{colors.reset}")
    print(f"{colors.yellow}8. Auto Save: {colors.green}{'Enabled' if config.get('auto_save', True) else 'Disabled'}{colors.reset}")
    print(f"{colors.yellow}9. Dark Mode: {colors.green}{'Enabled' if config.get('dark_mode', True) else 'Disabled'}{colors.reset}")
    print(f"{colors.yellow}0. Back to menu{colors.reset}")

    choice = input(f"\n{colors.red}[>] Select (0-9): {colors.reset}")

    if choice == "0":
        return
    elif choice == "1":
        select_model()
    elif choice == "2":
        try:
            context_window = int(input(f"{colors.red}[>] Context Window (32000-128000): {colors.reset}"))
            if 32000 <= context_window <= 128000:
                config["context_window"] = context_window
                save_config(config)
                print(f"{colors.bright_green}✓ Context window set to: {context_window:,} tokens{colors.reset}")
            else:
                print(f"{colors.red}✗ Must be between 32K and 128K!{colors.reset}")
        except:
            print(f"{colors.red}✗ Invalid input!{colors.reset}")
        time.sleep(1)
    elif choice == "3":
        try:
            max_input = int(input(f"{colors.red}[>] Max Input Tokens (16000-64000): {colors.reset}"))
            if 16000 <= max_input <= 64000:
                config["max_input_tokens"] = max_input
                save_config(config)
                print(f"{colors.bright_green}✓ Max input tokens set to: {max_input:,}{colors.reset}")
            else:
                print(f"{colors.red}✗ Must be between 16K and 64K!{colors.reset}")
        except:
            print(f"{colors.red}✗ Invalid input!{colors.reset}")
        time.sleep(1)
    elif choice == "4":
        try:
            max_output = int(input(f"{colors.red}[>] Max Output Tokens (16000-64000): {colors.reset}"))
            if 16000 <= max_output <= 64000:
                config["max_output_tokens"] = max_output
                save_config(config)
                print(f"{colors.bright_green}✓ Max output tokens set to: {max_output:,}{colors.reset}")
            else:
                print(f"{colors.red}✗ Must be between 16K and 64K!{colors.reset}")
        except:
            print(f"{colors.red}✗ Invalid input!{colors.reset}")
        time.sleep(1)
    elif choice == "5":
        try:
            max_history = int(input(f"{colors.red}[>] Max History (1000-50000): {colors.reset}"))
            if 1000 <= max_history <= 50000:
                config["max_history"] = max_history
                save_config(config)
                print(f"{colors.bright_green}✓ Max history set to: {max_history:,}{colors.reset}")
            else:
                print(f"{colors.red}✗ Must be between 1K and 50K!{colors.reset}")
        except:
            print(f"{colors.red}✗ Invalid input!{colors.reset}")
        time.sleep(1)
    elif choice == "6":
        try:
            temp = float(input(f"{colors.red}[>] Temperature (0.0-2.0): {colors.reset}"))
            if 0.0 <= temp <= 2.0:
                config["temperature"] = temp
                save_config(config)
                print(f"{colors.bright_green}✓ Temperature set to: {temp}{colors.reset}")
            else:
                print(f"{colors.red}✗ Invalid value!{colors.reset}")
        except:
            print(f"{colors.red}✗ Invalid input!{colors.reset}")
        time.sleep(1)
    elif choice == "7":
        try:
            top_p = float(input(f"{colors.red}[>] Top P (0.0-1.0): {colors.reset}"))
            if 0.0 <= top_p <= 1.0:
                config["top_p"] = top_p
                save_config(config)
                print(f"{colors.bright_green}✓ Top P set to: {top_p}{colors.reset}")
            else:
                print(f"{colors.red}✗ Invalid value!{colors.reset}")
        except:
            print(f"{colors.red}✗ Invalid input!{colors.reset}")
        time.sleep(1)
    elif choice == "8":
        config["auto_save"] = not config.get("auto_save", True)
        save_config(config)
        status = "Enabled" if config["auto_save"] else "Disabled"
        print(f"{colors.bright_green}✓ Auto Save: {status}{colors.reset}")
        time.sleep(1)
    elif choice == "9":
        config["dark_mode"] = not config.get("dark_mode", True)
        save_config(config)
        status = "Enabled" if config["dark_mode"] else "Disabled"
        print(f"{colors.bright_green}✓ Dark Mode: {status}{colors.reset}")
        time.sleep(1)

def main_menu():
    while True:
        config = load_config()
        clear_screen()
        banner()

        # Start WebUI automatically if enabled
        if config.get("webui_enabled", False) and not webui_running:
            print(f"{colors.bright_green}🚀 Starting WebUI...{colors.reset}")
            webui_thread = threading.Thread(target=start_webui, daemon=True)
            webui_thread.start()
            # Wait a bit for WebUI to start
            time.sleep(3)
        
        print(f"{colors.bright_cyan}[ Main Menu - Extreme Version ]{colors.reset}")
        print(f"{colors.yellow}1. Language: {colors.green}{config['language']}{colors.reset}")
        print(f"{colors.yellow}2. Model: {colors.green}{config['model']}{colors.reset}")
        print(f"{colors.yellow}3. Set API Key{colors.reset}")
        print(f"{colors.yellow}4. Extreme Settings{colors.reset}")
        print(f"{colors.yellow}5. WebUI Settings ({'✅ Active' if config.get('webui_enabled') else '❌ Inactive'}){colors.reset}")
        print(f"{colors.yellow}6. Start Chat Session (128K Context){colors.reset}")
        print(f"{colors.yellow}7. Manage Conversations{colors.reset}")
        print(f"{colors.yellow}8. System Information{colors.reset}")
        print(f"{colors.yellow}9. Exit{colors.reset}")
        
        if config.get("webui_enabled"):
            print(f"\n{colors.bright_green}🌐 WebUI Active: http://localhost:{config.get('webui_port', 5000)}{colors.reset}")
            print(f"{colors.bright_green}🚀 Real-time Streaming Active!{colors.reset}")
            print(f"{colors.bright_green}💾 128K Context Window Active!{colors.reset}")
            print(f"{colors.bright_green}📊 64K Input/Output Tokens Active!{colors.reset}")
            print(f"{colors.bright_green}⚡ Smart Context Management Active!{colors.reset}")
        
        try:
            choice = input(f"\n{colors.red}[>] Select (1-9): {colors.reset}")
            
            if choice == "1":
                select_language()
            elif choice == "2":
                select_model()
            elif choice == "3":
                set_api_key()
            elif choice == "4":
                advanced_settings()
            elif choice == "5":
                toggle_webui()
            elif choice == "6":
                if check_api_key():
                    chat_session()
            elif choice == "7":
                manage_conversations()
            elif choice == "8":
                system_info()
            elif choice == "9":
                print(f"{colors.bright_cyan}✓ Exiting...{colors.reset}")
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

def main():
    # Check and install dependencies
    try:
        import requests
        import pyfiglet
        from langdetect import detect
        from flask import Flask
        from flask_cors import CORS
    except ImportError:
        print(f"{colors.bright_yellow}⚠️ Installing dependencies...{colors.reset}")
        deps = ["requests", "pyfiglet", "langdetect", "flask", "flask-cors"]
        os.system(f"pip install {' '.join(deps)} --quiet")

    # Create necessary directories
    if not os.path.exists(CONFIG_FILE):
        save_config(create_default_config())
    
    if not os.path.exists("public"):
        os.makedirs("public")
        print(f"{colors.bright_green}✓ Created public directory for WebUI{colors.reset}")

    # Check for WebUI files
    webui_files = ['index.html', 'style.css', 'script.js']
    missing_files = [f for f in webui_files if not os.path.exists(f"public/{f}")]
    
    if missing_files:
        print(f"{colors.bright_yellow}⚠️ Missing WebUI files: {', '.join(missing_files)}{colors.reset}")
        print(f"{colors.yellow}Please add the WebUI files to the public directory.{colors.reset}")
        time.sleep(2)

    try:
        while True:
            main_menu()
    except KeyboardInterrupt:
        print(f"\n{colors.red}✗ Cancelled! Exiting...{colors.reset}")
        sys.exit(1)
    except Exception as e:
        print(f"\n{colors.red}✗ Fatal error: {e}{colors.reset}")
        sys.exit(1)

if __name__ == "__main__":
    main()