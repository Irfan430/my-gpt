#!/bin/bash

echo "==========================================="
echo "WormGPT DeepSeek Pro - Installation Script"
echo "==========================================="
echo ""

python_version=$(python3 --version 2>&1 | awk '{print $2}')
echo "Python version: $python_version"

echo "Creating virtual environment..."
python3 -m venv .venv

echo "Activating virtual environment..."
source .venv/bin/activate

echo "Upgrading pip..."
pip install --upgrade pip

echo "Installing dependencies..."
pip install -r requirements.txt

echo "Creating necessary directories..."
mkdir -p conversations
mkdir -p public

chmod +x run.sh

echo ""
echo "==========================================="
echo "Installation completed successfully!"
echo "==========================================="
echo ""
echo "To start WormGPT:"
echo "1. Activate virtual environment: source .venv/bin/activate"
echo "2. Run: ./run.sh"
echo "3. Or: python ai.py"
echo ""
echo "First, set your DeepSeek API key in the main menu."