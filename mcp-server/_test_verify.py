import asyncio, sys
sys.path.insert(0, 'D:/Arena/ocr/End-To-End-Urdu-OCR-WebApp/mcp-server')

async def main():
    import server
    
    tools = await server.mcp.list_tools()
    expected = [
        'ocr_single', 'ocr_batch', 'ocr_with_enhance', 'ocr_direct_tensor',
        'pdf_info', 'pdf_extract', 'pdf_reconstruct', 'pdf_ocr', 'cancel_pdf_task',
        'export_json', 'export_txt', 'export_csv', 'export_docx', 'export_searchable_pdf',
        'export_pdf_json', 'export_pdf_txt', 'export_pdf_csv', 'export_pdf_docx',
        'spell_check', 'spell_analyze', 'spell_suggest', 'spell_batch', 'spell_romanize',
        'spell_add_user_word', 'spell_remove_user_word', 'spell_list_user_dict', 'spell_analytics',
        'analyze_document', 'summarize_text', 'recommend_enhancements', 'detect_table',
        'get_processing_history', 'clear_processing_history',
        'health_check', 'get_stats', 'switch_device', 'get_cache_stats', 'clear_cache', 'get_config',
    ]
    
    actual = set(t.name for t in tools)
    
    # We expect 41 from the list above + spell_info = 42
    extra = actual - set(expected)
    missing = set(expected) - actual
    
    print(f"Total tools: {len(actual)}")
    if extra:
        print(f"\nExtra (not in expected list): {sorted(extra)}")
    if missing:
        print(f"\nMissing (in expected but not found): {sorted(missing)}")
    
    # Check spell_info is a tool
    has_spell_info = 'spell_info' in actual
    print(f"\nspell_info is a tool: {has_spell_info}")
    
    # List all unique param names for tools with complex signatures
    for t in sorted(tools, key=lambda x: x.name):
        params = [p.name for p in (t.inputSchema.get('properties', {}).keys() if hasattr(t, 'inputSchema') and isinstance(t.inputSchema, dict) else [])]

asyncio.run(main())
