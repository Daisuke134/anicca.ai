const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🐍 Checking Python environment...');

const projectRoot = path.join(__dirname, '..');
const venvPath = path.join(projectRoot, 'venv');
const pythonPath = path.join(venvPath, 'bin', 'python3');
const requirementsPath = path.join(projectRoot, 'requirements.txt');

try {
  // Check if venv exists
  if (!fs.existsSync(venvPath)) {
    console.log('📦 Creating virtual environment...');
    execSync('python3 -m venv venv', { cwd: projectRoot, stdio: 'inherit' });
  }

  // Check if browser-use is installed
  let browserUseInstalled = false;
  try {
    execSync(`${pythonPath} -c "import browser_use"`, { cwd: projectRoot });
    browserUseInstalled = true;
    console.log('✅ browser-use is already installed');
  } catch (error) {
    console.log('📥 Installing Python dependencies...');
  }

  if (!browserUseInstalled) {
    // Activate venv and install requirements
    console.log('🔧 Installing browser-use and dependencies...');
    
    // Upgrade pip first
    execSync(`${pythonPath} -m pip install --upgrade pip`, { cwd: projectRoot, stdio: 'inherit' });
    
    // First install setuptools to avoid build issues
    execSync(`${pythonPath} -m pip install setuptools>=69.0.0`, { cwd: projectRoot, stdio: 'inherit' });
    
    // Install browser-use without problematic dependencies
    console.log('📦 Installing browser-use (this may take a few minutes)...');
    try {
      // Try installing browser-use with --no-deps first to avoid psycopg2-binary issue
      execSync(`${pythonPath} -m pip install browser-use --no-deps`, { cwd: projectRoot, stdio: 'inherit' });
      
      // Then install essential dependencies manually
      execSync(`${pythonPath} -m pip install langchain-core langchain-community langchain-openai pydantic playwright httpx lxml markdownify psutil patchright pyperclip posthog uuid7`, { cwd: projectRoot, stdio: 'inherit' });
      execSync(`${pythonPath} -m pip install langchain-google-genai>=2.0.0 google-generativeai>=0.8.0 python-dotenv>=1.0.0`, { cwd: projectRoot, stdio: 'inherit' });
    } catch (error) {
      console.log('⚠️  Some optional dependencies failed, but continuing...');
    }
    
    // Install playwright browsers (browser-useが期待する場所に)
    console.log('🌐 Installing Playwright browsers...');
    // まずplaywrightのパスを設定
    const playwrightPath = path.join(venvPath, 'lib/python3.13/site-packages/playwright');
    execSync(`${pythonPath} -m playwright install chromium`, { 
      cwd: projectRoot, 
      stdio: 'inherit',
      env: {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: path.join(playwrightPath, 'driver/package/.local-browsers')
      }
    });
  }

  // Verify installation
  try {
    execSync(`${pythonPath} -c "import browser_use; print('✅ browser-use verified')"`, { cwd: projectRoot, stdio: 'inherit' });
  } catch (error) {
    console.error('❌ Failed to verify browser-use installation');
    process.exit(1);
  }

  console.log('✅ Python environment ready!');
} catch (error) {
  console.error('❌ Error setting up Python environment:', error.message);
  process.exit(1);
}