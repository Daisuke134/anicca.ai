#!/bin/bash
# Browser-use Python環境セットアップスクリプト

echo "🐍 Setting up Python environment for Browser-use..."

# Python 3.11+の確認
python_version=$(python3 --version 2>&1 | awk '{print $2}')
echo "Python version: $python_version"

# 仮想環境の作成
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# 仮想環境をアクティベート
source venv/bin/activate

# 必要なパッケージをインストール
echo "Installing Python packages..."
pip install --upgrade pip
pip install browser-use
pip install langchain-google-genai
pip install python-dotenv

# Playwrightのブラウザをインストール
echo "Installing Playwright browsers..."
playwright install chromium --with-deps

echo "✅ Python environment setup complete!"
echo ""
echo "To use Browser-use, make sure to:"
echo "1. Activate the virtual environment: source venv/bin/activate"
echo "2. Run the Electron app: npm run electron-dev"