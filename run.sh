#!/bin/bash

# WormGPT Run Script
echo "==================================="
echo "WormGPT DeepSeek Pro"
echo "Professional AI Chatbot"
echo "==================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Auto activate venv
if [ -z "$VIRTUAL_ENV" ]; then
    if [ -d ".venv" ]; then
        echo -e "${CYAN}Activating virtual environment...${NC}"
        source .venv/bin/activate
    else
        echo -e "${RED}Virtual environment not found!${NC}"
        echo -e "${YELLOW}Run ./install.sh first${NC}"
        exit 1
    fi
fi

# Check dependencies
if [ ! -f "requirements.txt" ]; then
    echo -e "${RED}requirements.txt not found!${NC}"
    exit 1
fi

# Load config for port info
if [ -f "wormgpt_config.json" ]; then
    PORT=$(python3 -c "import json; f=open('wormgpt_config.json'); d=json.load(f); print(d.get('webui_port', 5000)); f.close()")
    WEBUI_ENABLED=$(python3 -c "import json; f=open('wormgpt_config.json'); d=json.load(f); print(d.get('webui_enabled', False)); f.close()")
    
    echo -e "${CYAN}Configuration loaded${NC}"
    echo -e "${YELLOW}WebUI Port: ${PORT}${NC}"
    echo -e "${YELLOW}WebUI Enabled: ${WEBUI_ENABLED}${NC}"
    echo -e "${GREEN}Conversation Memory: Active${NC}"
    echo -e "${GREEN}Code Highlighting: Active${NC}"
    
    if [ "$WEBUI_ENABLED" = "True" ] || [ "$WEBUI_ENABLED" = "true" ]; then
        echo -e "${GREEN}WebUI available at: http://localhost:${PORT}${NC}"
    fi
fi

echo ""
echo -e "${YELLOW}Starting WormGPT...${NC}"
echo -e "${GREEN}Features enabled:${NC}"
echo -e "  • Conversation memory (separate JSON files)"
echo -e "  • Code block highlighting"
echo -e "  • Real-time streaming"
echo -e "  • Professional WebUI"
echo ""

# Run the application
python3 ai.py