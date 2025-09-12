# ruff: noqa
"""
FastMCP CLI entrypoint for Google Workspace MCP Server.
This file imports all tool modules to register them with the server instance.
Includes full initialization bootstrap that main.py provides.
"""
import logging
import os
import sys
from dotenv import load_dotenv

from auth.oauth_config import reload_oauth_config, is_stateless_mode
from core.log_formatter import EnhancedLogFormatter, configure_file_logging
from core.utils import check_credentials_directory_permissions
from core.server import server, set_transport_mode, configure_server_for_http
from core.tool_registry import set_enabled_tools as set_enabled_tool_names, wrap_server_tool_method, filter_server_tools
from auth.scopes import set_enabled_tools

# Import OAuth 2.1 route handlers
from auth.oauth_common_handlers import (
    handle_oauth_authorize,
    handle_proxy_token_exchange,
    handle_oauth_protected_resource,
    handle_oauth_authorization_server,
    handle_oauth_client_config,
    handle_oauth_register,
)
from fastapi.responses import JSONResponse
from starlette.requests import Request

# Load environment variables
dotenv_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
load_dotenv(dotenv_path=dotenv_path)

# Suppress googleapiclient discovery cache warning
logging.getLogger('googleapiclient.discovery_cache').setLevel(logging.ERROR)

# Reload OAuth configuration after env vars loaded
reload_oauth_config()

# Configure basic logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configure file logging based on stateless mode
configure_file_logging()

def configure_safe_logging():
    """Configure safe Unicode handling for logging."""
    class SafeEnhancedFormatter(EnhancedLogFormatter):
        """Enhanced ASCII formatter with additional Windows safety."""
        def format(self, record):
            try:
                return super().format(record)
            except UnicodeEncodeError:
                # Fallback to ASCII-safe formatting
                service_prefix = self._get_ascii_prefix(record.name, record.levelname)
                safe_msg = str(record.getMessage()).encode('ascii', errors='replace').decode('ascii')
                return f"{service_prefix} {safe_msg}"

    # Replace all console handlers' formatters with safe enhanced ones
    for handler in logging.root.handlers:
        # Only apply to console/stream handlers, keep file handlers as-is
        if isinstance(handler, logging.StreamHandler) and handler.stream.name in ['<stderr>', '<stdout>']:
            safe_formatter = SafeEnhancedFormatter(use_colors=True)
            handler.setFormatter(safe_formatter)

# Configure safe logging
configure_safe_logging()

# Check credentials directory permissions (skip in stateless mode)
if not is_stateless_mode():
    try:
        logger.info("🔍 Checking credentials directory permissions...")
        check_credentials_directory_permissions()
        logger.info("✅ Credentials directory permissions verified")
    except (PermissionError, OSError) as e:
        logger.error(f"❌ Credentials directory permission check failed: {e}")
        logger.error("   Please ensure the service has write permissions to create/access the credentials directory")
        sys.exit(1)
else:
    logger.info("🔍 Skipping credentials directory check (stateless mode)")

# Set transport mode for HTTP (FastMCP CLI defaults to streamable-http)
set_transport_mode('streamable-http')
configure_server_for_http()

# Import all tool modules to register their @server.tool() decorators
import gmail.gmail_tools
import gdrive.drive_tools
import gcalendar.calendar_tools
import gdocs.docs_tools
import gsheets.sheets_tools
import gchat.chat_tools
import gforms.forms_tools
import gslides.slides_tools
import gtasks.tasks_tools
import gsearch.search_tools

# Configure tool registration
wrap_server_tool_method(server)

# Enable all tools and services by default
all_services = ['gmail', 'drive', 'calendar', 'docs', 'sheets', 'chat', 'forms', 'slides', 'tasks', 'search']
set_enabled_tools(all_services)  # Set enabled services for scopes
set_enabled_tool_names(None)  # Don't filter individual tools - enable all

# Filter tools based on configuration
filter_server_tools(server)

# Add OAuth 2.1 routes for stateless authentication
@server.custom_route("/.well-known/oauth-protected-resource", methods=["GET", "OPTIONS"])
async def oauth_protected_resource(request: Request):
    return await handle_oauth_protected_resource(request)

@server.custom_route("/.well-known/oauth-authorization-server", methods=["GET", "OPTIONS"])
async def oauth_authorization_server(request: Request):
    return await handle_oauth_authorization_server(request)

@server.custom_route("/.well-known/oauth-client", methods=["GET", "OPTIONS"])
async def oauth_client_config(request: Request):
    return await handle_oauth_client_config(request)

@server.custom_route("/oauth2/authorize", methods=["GET", "OPTIONS"])
async def oauth_authorize(request: Request):
    return await handle_oauth_authorize(request)

@server.custom_route("/oauth2/token", methods=["POST", "OPTIONS"])
async def oauth_token(request: Request):
    return await handle_proxy_token_exchange(request)

@server.custom_route("/oauth2/register", methods=["POST", "OPTIONS"])
async def oauth_register(request: Request):
    return await handle_oauth_register(request)

# Export server instance for FastMCP CLI (looks for 'mcp', 'server', or 'app')
mcp = server
app = server