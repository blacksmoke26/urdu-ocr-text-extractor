from mcp.server.fastmcp import FastMCP
import inspect

# Run signature
print("=== FastMCP.run signature ===")
print(inspect.signature(FastMCP.run))

# Check if 'version' param exists in __init__
print("\n=== FastMCP.__init__ params ===")
sig = inspect.signature(FastMCP.__init__)
for pname, pval in sig.parameters.items():
    print(f"  {pname}: default={pval.default}")

# Check resource return type
print("\n=== Resource template return ===")
mcp = FastMCP("test")
@mcp.resource("urdu-ocr://health")
async def res():
    return "hello"
# Resources are string-returning, which is what we do

# Check prompt decorator usage
print("\n=== Prompt usage ===")
@mcp.prompt()
def my_prompt():
    return [mcp.PromptMessage(role="user", content=mcp.PromptText(type="text", text="test"))]

print("Prompt created:", my_prompt)
