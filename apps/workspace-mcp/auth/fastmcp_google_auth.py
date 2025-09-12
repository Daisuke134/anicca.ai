"""
Google Workspace Authentication Provider for FastMCP

This module implements OAuth 2.1 authentication for Google Workspace using FastMCP's
built-in authentication patterns. It acts as a Resource Server (RS) that trusts
Google as the Authorization Server (AS).

Key features:
- JWT token verification using Google's public keys
- Discovery metadata endpoints for MCP protocol compliance
- CORS proxy endpoints to work around Google's CORS limitations
- Session bridging to Google credentials for API access
"""

import logging
from typing import Dict, Any, Optional, List

from starlette.routing import Route

from fastmcp.server.auth.auth import AuthProvider
from fastmcp.server.auth.providers.jwt import JWTVerifier
from mcp.server.auth.provider import AccessToken

logger = logging.getLogger(__name__)


class GoogleWorkspaceAuthProvider(AuthProvider):
    """
    Authentication provider for Google Workspace integration.
    
    This provider implements the Remote Authentication pattern where:
    - Google acts as the Authorization Server (AS)
    - This MCP server acts as a Resource Server (RS)
    - Tokens are verified using Google's public keys
    """
    
    def __init__(self):
        """Initialize the Google Workspace auth provider."""
        super().__init__()
        
        # Get configuration from OAuth config
        from auth.oauth_config import get_oauth_config
        config = get_oauth_config()
        
        self.client_id = config.client_id
        self.client_secret = config.client_secret
        self.base_url = config.get_oauth_base_url()
        self.port = config.port
        
        if not self.client_id:
            logger.warning("GOOGLE_OAUTH_CLIENT_ID not set - OAuth 2.1 authentication will not work")
            return
            
        # Initialize JWT verifier for Google tokens
        self.jwt_verifier = JWTVerifier(
            jwks_uri="https://www.googleapis.com/oauth2/v3/certs",
            issuer="https://accounts.google.com",
            audience=self.client_id,
            algorithm="RS256"
        )
        
        # Session bridging now handled by OAuth21SessionStore
        
    async def verify_token(self, token: str) -> Optional[AccessToken]:
        """
        Verify a bearer token issued by Google.
        
        Args:
            token: The bearer token to verify
            
        Returns:
            AccessToken object if valid, None otherwise
        """
        if not self.client_id:
            return None
            
        try:
            # Use FastMCP's JWT verifier
            access_token = await self.jwt_verifier.verify_token(token)
            
            if access_token:
                # Store session info in OAuth21SessionStore for credential bridging
                user_email = access_token.claims.get("email")
                if user_email:
                    from auth.oauth21_session_store import get_oauth21_session_store
                    store = get_oauth21_session_store()
                    session_id = f"google_{access_token.claims.get('sub', 'unknown')}"
                    
                    # Try to get FastMCP session ID for binding
                    mcp_session_id = None
                    try:
                        from fastmcp.server.dependencies import get_context
                        ctx = get_context()
                        if ctx and hasattr(ctx, 'session_id'):
                            mcp_session_id = ctx.session_id
                            logger.debug(f"Binding MCP session {mcp_session_id} to user {user_email}")
                    except Exception:
                        pass
                    
                    store.store_session(
                        user_email=user_email,
                        access_token=token,
                        scopes=access_token.scopes or [],
                        session_id=session_id,
                        mcp_session_id=mcp_session_id
                    )
                
                logger.debug(f"Successfully verified Google token for user: {user_email}")
                
            return access_token
            
        except Exception as e:
            logger.error(f"Failed to verify Google token: {e}")
            return None
    
    def customize_auth_routes(self, routes: List[Route]) -> List[Route]:
        """
        NOTE: This method is not currently used. All OAuth 2.1 routes are implemented 
        directly in core/server.py using @server.custom_route decorators.
        
        This method exists for compatibility with FastMCP's AuthProvider interface
        but the routes it would define are handled elsewhere.
        """
        # Routes are implemented directly in core/server.py
        return routes
    
    def get_session_info(self, session_id: str) -> Optional[Dict[str, Any]]:
        """
        Get session information for credential bridging from OAuth21SessionStore.
        
        Args:
            session_id: The session identifier
            
        Returns:
            Session information if found
        """
        from auth.oauth21_session_store import get_oauth21_session_store
        store = get_oauth21_session_store()
        
        # Try to get user by session_id (assuming it's the MCP session ID)
        user_email = store.get_user_by_mcp_session(session_id)
        if user_email:
            credentials = store.get_credentials(user_email)
            if credentials:
                return {
                    "access_token": credentials.token,
                    "user_email": user_email,
                    "scopes": credentials.scopes or []
                }
        return None
    
    def create_session_from_token(self, token: str, user_email: str) -> str:
        """
        Create a session from an access token for credential bridging using OAuth21SessionStore.
        
        Args:
            token: The access token
            user_email: The user's email address
            
        Returns:
            Session ID
        """
        from auth.oauth21_session_store import get_oauth21_session_store
        store = get_oauth21_session_store()
        session_id = f"google_{user_email}"
        
        store.store_session(
            user_email=user_email,
            access_token=token,
            session_id=session_id
        )
        return session_id