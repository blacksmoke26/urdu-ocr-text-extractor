"""Check what MCP SDK version we have."""
import mcp
print("MCP package version:", getattr(mcp, '__version__', 'unknown'))
import mcp.server.fastmcp
print("Server dir:", [x for x in dir(mcp.server.fastmcp) if not x.startswith('_')])
