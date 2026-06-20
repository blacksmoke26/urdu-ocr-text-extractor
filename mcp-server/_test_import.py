import asyncio, sys
sys.path.insert(0, 'D:/Arena/ocr/End-To-End-Urdu-OCR-WebApp/mcp-server')

async def main():
    import server
    print('Import OK')
    
    tools = await server.mcp.list_tools()
    print(f'\n{len(tools)} tools registered:')
    for t in sorted(tools, key=lambda x: x.name):
        desc = t.description[:90] + '...' if t.description and len(t.description) > 90 else (t.description or '')
        print(f'  - {t.name}')
    
    res = await server.mcp.list_resources()
    print(f'\n{len(res)} resources:')
    for r in res:
        print(f'  - {r.uri}: {r.name}')
    
    prompts = await server.mcp.list_prompts()
    print(f'\n{len(prompts)} prompts:')
    for p in prompts:
        desc = p.description[:90] + '...' if p.description and len(p.description) > 90 else (p.description or '')
        print(f'  - {p.name}')

asyncio.run(main())
