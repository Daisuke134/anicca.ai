"""Common OAuth 2.1 request handlers used by both legacy and modern auth providers."""

import logging
import os
import time
from datetime import datetime, timedelta
from urllib.parse import urlencode, parse_qs

import aiohttp
import jwt
from jwt import PyJWKClient
from starlette.requests import Request
from starlette.responses import JSONResponse, RedirectResponse
from google.oauth2.credentials import Credentials

from auth.oauth21_session_store import store_token_session
from auth.google_auth import get_credential_store
from auth.scopes import get_current_scopes
from auth.oauth_config import get_oauth_config, is_stateless_mode
from auth.oauth_error_handling import (
    OAuthError, OAuthValidationError, OAuthConfigurationError,
    create_oauth_error_response, validate_token_request,
    validate_registration_request, get_development_cors_headers,
    log_security_event
)

logger = logging.getLogger(__name__)


async def handle_oauth_authorize(request: Request):
    """Common handler for OAuth authorization proxy."""
    origin = request.headers.get("origin")

    if request.method == "OPTIONS":
        cors_headers = get_development_cors_headers(origin)
        return JSONResponse(content={}, headers=cors_headers)

    # Get query parameters
    params = dict(request.query_params)

    # Add our client ID if not provided
    client_id = os.getenv("GOOGLE_OAUTH_CLIENT_ID")
    if "client_id" not in params and client_id:
        params["client_id"] = client_id

    # Ensure response_type is code
    params["response_type"] = "code"

    # Merge client scopes with scopes for enabled tools only
    client_scopes = params.get("scope", "").split() if params.get("scope") else []
    # Include scopes for enabled tools only (not all tools)
    enabled_tool_scopes = get_current_scopes()
    all_scopes = set(client_scopes) | set(enabled_tool_scopes)
    params["scope"] = " ".join(sorted(all_scopes))
    logger.info(f"OAuth 2.1 authorization: Requesting scopes: {params['scope']}")

    # Build Google authorization URL
    google_auth_url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)

    # Return redirect with development CORS headers if needed
    cors_headers = get_development_cors_headers(origin)
    return RedirectResponse(
        url=google_auth_url,
        status_code=302,
        headers=cors_headers
    )


async def handle_proxy_token_exchange(request: Request):
    """Common handler for OAuth token exchange proxy with comprehensive error handling."""
    origin = request.headers.get("origin")

    if request.method == "OPTIONS":
        cors_headers = get_development_cors_headers(origin)
        return JSONResponse(content={}, headers=cors_headers)
    try:
        # Get form data with validation
        try:
            body = await request.body()
            content_type = request.headers.get("content-type", "application/x-www-form-urlencoded")
        except Exception as e:
            raise OAuthValidationError(f"Failed to read request body: {e}")

        # Parse and validate form data
        if content_type and "application/x-www-form-urlencoded" in content_type:
            try:
                form_data = parse_qs(body.decode('utf-8'))
            except Exception as e:
                raise OAuthValidationError(f"Invalid form data: {e}")

            # Convert to single values and validate
            request_data = {k: v[0] if v else '' for k, v in form_data.items()}
            validate_token_request(request_data)

            # Check if client_id is missing (public client)
            if 'client_id' not in form_data or not form_data['client_id'][0]:
                client_id = os.getenv("GOOGLE_OAUTH_CLIENT_ID")
                if client_id:
                    form_data['client_id'] = [client_id]
                    logger.debug("Added missing client_id to token request")

            # Check if client_secret is missing (public client using PKCE)
            if 'client_secret' not in form_data:
                client_secret = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET")
                if client_secret:
                    form_data['client_secret'] = [client_secret]
                    logger.debug("Added missing client_secret to token request")

            # Reconstruct body with added credentials
            body = urlencode(form_data, doseq=True).encode('utf-8')

        # Forward request to Google
        async with aiohttp.ClientSession() as session:
            headers = {"Content-Type": content_type}

            async with session.post("https://oauth2.googleapis.com/token", data=body, headers=headers) as response:
                response_data = await response.json()

                # Log for debugging
                if response.status != 200:
                    logger.error(f"Token exchange failed: {response.status} - {response_data}")
                else:
                    logger.info("Token exchange successful")

                    # Store the token session for credential bridging
                    if "access_token" in response_data:
                        try:
                            # Extract user email from ID token if present
                            if "id_token" in response_data:
                                # Verify ID token using Google's public keys for security
                                try:
                                    # Get Google's public keys for verification
                                    jwks_client = PyJWKClient("https://www.googleapis.com/oauth2/v3/certs")

                                    # Get signing key from JWT header
                                    signing_key = jwks_client.get_signing_key_from_jwt(response_data["id_token"])

                                    # Verify and decode the ID token
                                    id_token_claims = jwt.decode(
                                        response_data["id_token"],
                                        signing_key.key,
                                        algorithms=["RS256"],
                                        audience=os.getenv("GOOGLE_OAUTH_CLIENT_ID"),
                                        issuer="https://accounts.google.com"
                                    )
                                    user_email = id_token_claims.get("email")
                                    email_verified = id_token_claims.get("email_verified")

                                    if not email_verified:
                                        logger.error(f"Email address for user {user_email} is not verified by Google. Aborting session creation.")
                                        return JSONResponse(content={"error": "Email address not verified"}, status_code=403)
                                    elif user_email:
                                        # Try to get FastMCP session ID from request context for binding
                                        mcp_session_id = None
                                        try:
                                            # Check if this is a streamable HTTP request with session
                                            if hasattr(request, 'state') and hasattr(request.state, 'session_id'):
                                                mcp_session_id = request.state.session_id
                                                logger.info(f"Found MCP session ID for binding: {mcp_session_id}")
                                        except Exception as e:
                                            logger.debug(f"Could not get MCP session ID: {e}")

                                        # Store the token session with MCP session binding
                                        session_id = store_token_session(response_data, user_email, mcp_session_id)
                                        logger.info(f"Stored OAuth session for {user_email} (session: {session_id}, mcp: {mcp_session_id})")

                                        # Also create and store Google credentials
                                        expiry = None
                                        if "expires_in" in response_data:
                                            # Google auth library expects timezone-naive datetime
                                            expiry = datetime.utcnow() + timedelta(seconds=response_data["expires_in"])

                                        credentials = Credentials(
                                            token=response_data["access_token"],
                                            refresh_token=response_data.get("refresh_token"),
                                            token_uri="https://oauth2.googleapis.com/token",
                                            client_id=os.getenv("GOOGLE_OAUTH_CLIENT_ID"),
                                            client_secret=os.getenv("GOOGLE_OAUTH_CLIENT_SECRET"),
                                            scopes=response_data.get("scope", "").split() if response_data.get("scope") else None,
                                            expiry=expiry
                                        )

                                        # Save credentials to file for legacy auth (skip in stateless mode)
                                        if not is_stateless_mode():
                                            store = get_credential_store()
                                            if not store.store_credential(user_email, credentials):
                                                logger.error(f"Failed to save Google credentials for {user_email}")
                                            else:
                                                logger.info(f"Saved Google credentials for {user_email}")
                                        else:
                                            logger.info(f"Skipping credential file save in stateless mode for {user_email}")
                                except jwt.ExpiredSignatureError:
                                    logger.error("ID token has expired - cannot extract user email")
                                except jwt.InvalidTokenError as e:
                                    logger.error(f"Invalid ID token - cannot extract user email: {e}")
                                except Exception as e:
                                    logger.error(f"Failed to verify ID token - cannot extract user email: {e}")

                        except Exception as e:
                            logger.error(f"Failed to store OAuth session: {e}")

                # Add development CORS headers
                cors_headers = get_development_cors_headers(origin)
                response_headers = {
                    "Content-Type": "application/json",
                    "Cache-Control": "no-store"
                }
                response_headers.update(cors_headers)

                return JSONResponse(
                    status_code=response.status,
                    content=response_data,
                    headers=response_headers
                )

    except OAuthError as e:
        log_security_event("oauth_token_exchange_error", {
            "error_code": e.error_code,
            "description": e.description
        }, request)
        return create_oauth_error_response(e, origin)
    except Exception as e:
        logger.error(f"Unexpected error in token proxy: {e}", exc_info=True)
        log_security_event("oauth_token_exchange_unexpected_error", {
            "error": str(e)
        }, request)
        error = OAuthConfigurationError("Internal server error")
        return create_oauth_error_response(error, origin)


async def handle_oauth_protected_resource(request: Request):
    """
    Handle OAuth protected resource metadata requests.
    """
    origin = request.headers.get("origin")

    # Handle preflight
    if request.method == "OPTIONS":
        cors_headers = get_development_cors_headers(origin)
        return JSONResponse(content={}, headers=cors_headers)

    config = get_oauth_config()
    base_url = config.get_oauth_base_url()

    # For streamable-http transport, the MCP server runs at /mcp
    # This is the actual resource being protected
    # As of August, /mcp is now the proper base - prior was /mcp/
    resource_url = f"{base_url}/mcp"

    # Build metadata response per RFC 9449
    metadata = {
        "resource": resource_url,  # The MCP server endpoint that needs protection
        "authorization_servers": [base_url],  # Our proxy acts as the auth server
        "bearer_methods_supported": ["header"],
        "scopes_supported": get_current_scopes(),
        "resource_documentation": "https://developers.google.com/workspace",
        "client_registration_required": True,
        "client_configuration_endpoint": f"{base_url}/.well-known/oauth-client",
    }
    # Log the response for debugging
    logger.debug(f"Returning protected resource metadata: {metadata}")

    # Add development CORS headers
    cors_headers = get_development_cors_headers(origin)
    response_headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=3600"
    }
    response_headers.update(cors_headers)

    return JSONResponse(
        content=metadata,
        headers=response_headers
    )


async def handle_oauth_authorization_server(request: Request):
    """
    Handle OAuth authorization server metadata.
    """
    origin = request.headers.get("origin")

    if request.method == "OPTIONS":
        cors_headers = get_development_cors_headers(origin)
        return JSONResponse(content={}, headers=cors_headers)

    config = get_oauth_config()

    # Get authorization server metadata from centralized config
    # Pass scopes directly to keep all metadata generation in one place
    metadata = config.get_authorization_server_metadata(scopes=get_current_scopes())

    logger.debug(f"Returning authorization server metadata: {metadata}")

    # Add development CORS headers
    cors_headers = get_development_cors_headers(origin)
    response_headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=3600"
    }
    response_headers.update(cors_headers)

    return JSONResponse(
        content=metadata,
        headers=response_headers
    )


async def handle_oauth_client_config(request: Request):
    """Common handler for OAuth client configuration."""
    origin = request.headers.get("origin")

    if request.method == "OPTIONS":
        cors_headers = get_development_cors_headers(origin)
        return JSONResponse(content={}, headers=cors_headers)

    client_id = os.getenv("GOOGLE_OAUTH_CLIENT_ID")
    if not client_id:
        cors_headers = get_development_cors_headers(origin)
        return JSONResponse(
            status_code=404,
            content={"error": "OAuth not configured"},
            headers=cors_headers
        )

    # Get OAuth configuration
    config = get_oauth_config()

    return JSONResponse(
        content={
            "client_id": client_id,
            "client_name": "Google Workspace MCP Server",
            "client_uri": config.base_url,
            "redirect_uris": [
                f"{config.base_url}/oauth2callback",
            ],
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "scope": " ".join(get_current_scopes()),
            "token_endpoint_auth_method": "client_secret_basic",
            "code_challenge_methods": config.supported_code_challenge_methods[:1]  # Primary method only
        },
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
            **get_development_cors_headers(origin)
        }
    )


async def handle_oauth_register(request: Request):
    """Common handler for OAuth dynamic client registration with comprehensive error handling."""
    origin = request.headers.get("origin")

    if request.method == "OPTIONS":
        cors_headers = get_development_cors_headers(origin)
        return JSONResponse(content={}, headers=cors_headers)

    config = get_oauth_config()

    if not config.is_configured():
        error = OAuthConfigurationError("OAuth client credentials not configured")
        return create_oauth_error_response(error, origin)

    try:
        # Parse and validate the registration request
        try:
            body = await request.json()
        except Exception as e:
            raise OAuthValidationError(f"Invalid JSON in registration request: {e}")

        validate_registration_request(body)
        logger.info("Dynamic client registration request received")

        # Extract redirect URIs from the request or use defaults
        redirect_uris = body.get("redirect_uris", [])
        if not redirect_uris:
            redirect_uris = config.get_redirect_uris()

        # Build the registration response with our pre-configured credentials
        response_data = {
            "client_id": config.client_id,
            "client_secret": config.client_secret,
            "client_name": body.get("client_name", "Google Workspace MCP Server"),
            "client_uri": body.get("client_uri", config.base_url),
            "redirect_uris": redirect_uris,
            "grant_types": body.get("grant_types", ["authorization_code", "refresh_token"]),
            "response_types": body.get("response_types", ["code"]),
            "scope": body.get("scope", " ".join(get_current_scopes())),
            "token_endpoint_auth_method": body.get("token_endpoint_auth_method", "client_secret_basic"),
            "code_challenge_methods": config.supported_code_challenge_methods,
            # Additional OAuth 2.1 fields
            "client_id_issued_at": int(time.time()),
            "registration_access_token": "not-required",  # We don't implement client management
            "registration_client_uri": f"{config.get_oauth_base_url()}/oauth2/register/{config.client_id}"
        }

        logger.info("Dynamic client registration successful - returning pre-configured Google credentials")

        return JSONResponse(
            status_code=201,
            content=response_data,
            headers={
                "Content-Type": "application/json",
                "Cache-Control": "no-store",
                **get_development_cors_headers(origin)
            }
        )

    except OAuthError as e:
        log_security_event("oauth_registration_error", {
            "error_code": e.error_code,
            "description": e.description
        }, request)
        return create_oauth_error_response(e, origin)
    except Exception as e:
        logger.error(f"Unexpected error in client registration: {e}", exc_info=True)
        log_security_event("oauth_registration_unexpected_error", {
            "error": str(e)
        }, request)
        error = OAuthConfigurationError("Internal server error")
        return create_oauth_error_response(error, origin)
