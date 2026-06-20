from mcp.server.fastmcp import FastMCP
from mcp.types import ResourceContents

# Check prompt types
print("Prompt:", hasattr(FastMCP, "Prompt"))
from mcp.server.fastmcp.prompts import Prompt as MCP_Prompt, PromptMessage
print("Prompts module has Prompt:", MCP_Prompt)
print("Prompts module has PromptMessage:", PromptMessage)

# Check how to construct PromptMessage
pm = PromptMessage(role="user", content=mcp.types.TextContent(type="text", text="test"))
print("Created prompt message:", pm)

# Check ResourceContents 
rc = ResourceContents(uri="urdu-ocr://health", name="Health", mime_type="application/json", text="{}")
print("ResourceContents:", rc)
