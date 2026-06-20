"""Test suite for the Urdu OCR MCP server."""

import asyncio
import importlib
import json
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))


def _reload_server():
    """Force a fresh import of the server module."""
    for mod in list(sys.modules.keys()):
        if 'server' in mod:
            del sys.modules[mod]
    return importlib.import_module('server')


def _b64_image():
    from PIL import Image
    img = Image.new("RGB", (1, 1), color="red")
    buf = __import__('io').BytesIO()
    img.save(buf, format="PNG")
    return __import__('base64').b64encode(buf.getvalue()).decode()


def _b64_pdf():
    pdf = b"%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj"
    return __import__('base64').b64encode(pdf).decode()


def _get_text(result):
    """Extract text from MCP tool call result (tuple of (content_list, meta))."""
    content_list = result[0] if isinstance(result, tuple) else result
    item = content_list[0]
    return item.text if hasattr(item, 'text') else str(item)


def _make_mock(return_data):
    async def mock(method, url, **kwargs):
        return return_data
    return mock


async def run_test(name, fn):
    try:
        if asyncio.iscoroutinefunction(fn):
            await fn()
        else:
            fn()
        print(f"PASS: {name}")
        return True
    except Exception as e:
        print(f"FAIL: {name} \u2014 {e}")
        import traceback; traceback.print_exc()
        return False


async def test_import_and_registration():
    # Force fresh import to get latest tool definitions
    for mod in list(sys.modules.keys()):
        if 'server' in mod:
            del sys.modules[mod]
    
    import server
    tools = await server.mcp.list_tools()
    assert len(tools) == 41, f"Expected 41 tools, got {len(tools)}"
    tn = {t.name for t in tools}
    for expected in [
        {"ocr_single", "ocr_batch", "ocr_with_enhance", "ocr_direct_tensor"},
        {"pdf_info", "pdf_extract", "pdf_reconstruct", "pdf_ocr", "cancel_pdf_task", "get_task_progress"},
        {"export_json", "export_txt", "export_csv", "export_docx", "export_searchable_pdf"},
        {"export_pdf_json", "export_pdf_txt", "export_pdf_csv", "export_pdf_docx"},
        {"spell_check", "spell_analyze", "spell_suggest", "spell_batch", "spell_romanize",
         "spell_add_user_word", "spell_remove_user_word", "spell_list_user_dict",
         "spell_analytics", "spell_info"},
        {"analyze_document", "summarize_text", "recommend_enhancements", "detect_table",
         "get_processing_history", "clear_processing_history"},
        {"health_check", "get_stats", "switch_device", "get_cache_stats", "clear_cache", "get_config"},
    ]:
        assert expected.issubset(tn), f"Missing tools from {expected}"
    
    resources = await server.mcp.list_resources()
    assert {str(r.uri) for r in resources} == {"urdu-ocr://health", "urdu-ocr://config", "urdu-ocr://spell-info"}
    
    prompts = await server.mcp.list_prompts()
    expected_prompt_names = {
        "ocr_workflow", "spell_check_workflow", "pdf_ocr_workflow",
        "document_quality_audit", "export_pipeline", "pdf_to_structured_data",
        "spelling_audit_report", "large_document_batch", "system_health_check",
        "bilingual_comparative", "pdf_reconstruction", "research_document",
        "real_time_monitoring", "content_management", "performance_optimization",
    }
    assert {p.name for p in prompts} == expected_prompt_names, f"Expected {expected_prompt_names}, got {{p.name for p in prompts}}"


async def test_ocr_single():
    server = _reload_server()
    
    image_b64 = _b64_image()
    
    async def check(method, url, **kwargs):
        assert "/ocr/single" in url
        return {"detected_lines": 2}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("ocr_single", {
            "description": "Test", "file_data": {"filename": "t.png", "data_b64": image_b64},
            "conf_threshold": 0.2, "img_size": 1280,
        })
    data = json.loads(_get_text(result))
    assert data["detected_lines"] == 2


async def test_ocr_batch():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        assert "/ocr" in url
        assert len(kwargs["files"]) == 2
        return {"total_files": 2}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("ocr_batch", {
            "files_description": "T", "file_data_list": [
                {"filename": "d1.jpg", "data_b64": _b64_image()},
                {"filename": "d2.pdf", "data_b64": _b64_pdf()},
            ],
        })
    data = json.loads(_get_text(result))
    assert data["total_files"] == 2


async def test_ocr_with_enhance():
    server = _reload_server()
    
    captured = {}
    async def check(method, url, **kwargs):
        captured["data"] = kwargs.get("data", {})
        return {"detected_lines": 1}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("ocr_with_enhance", {
            "description": "T", "file_data": {"filename": "t.jpg", "data_b64": _b64_image()},
            "auto_contrast": True, "sharpen": True, "brightness": 1.5,
        })
    assert captured["data"]["auto_contrast"] is True


async def test_ocr_direct_tensor():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        return {"detected_lines": 5}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("ocr_direct_tensor", {
            "description": "T", "file_data": {"filename": "t.png", "data_b64": _b64_image()},
        })
    data = json.loads(_get_text(result))
    assert data["detected_lines"] == 5


async def test_pdf_info():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        return {"total_pages": 5}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("pdf_info", {"description": "T", "file_data": {"filename": "d.pdf", "data_b64": _b64_pdf()}})
    data = json.loads(_get_text(result))
    assert data["total_pages"] == 5


async def test_pdf_extract():
    server = _reload_server()
    
    captured = {}
    async def check(method, url, **kwargs):
        captured["data"] = kwargs.get("data", {})
        return {"total_pages_extracted": 2}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("pdf_extract", {
            "description": "T", "file_data": {"filename": "d.pdf", "data_b64": _b64_pdf()},
            "from_page": 1, "to_page": 5, "dpi": 400,
        })
    assert captured["data"]["dpi"] == 400


async def test_pdf_reconstruct():
    server = _reload_server()
    
    captured = {}
    async def check(method, url, **kwargs):
        captured["data"] = kwargs.get("data", {})
        return {"filename": "output.pdf"}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("pdf_reconstruct", {
            "description": "T", "file_data": {"filename": "d.pdf", "data_b64": _b64_pdf()},
            "from_page": 1, "to_page": 3,
        })
    assert captured["data"]["from_page"] == 1


async def test_pdf_ocr_advanced():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        form = kwargs.get("data", {})
        assert form["conf_threshold"] == 0.3
        return {"total_pages_processed": 5}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("pdf_ocr", {
            "description": "T", "file_data": {"filename": "d.pdf", "data_b64": _b64_pdf()},
            "from_page": 1, "to_page": 5, "conf_threshold": 0.3, "img_size": 1920, "device": "cuda", "det_type": "mllm",
        })
    data = json.loads(_get_text(result))
    assert data["total_pages_processed"] == 5


async def test_cancel_pdf_task():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        return {"status": "cancelled"}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("cancel_pdf_task", {"task_id": "task_123"})
    data = json.loads(_get_text(result))
    assert data["status"] == "cancelled"


async def test_get_task_progress():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        return {"percentage": 25.0}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("get_task_progress", {"task_id": "task_456"})
    data = json.loads(_get_text(result))
    assert data["percentage"] == 25.0


async def test_export_json():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        return {"format": "json"}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("export_json", {"ocr_result": {"full_text": "H"}})
    data = json.loads(_get_text(result))
    assert data["format"] == "json"


async def test_export_txt():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        return {"format": "txt", "data": "Hello"}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("export_txt", {"ocr_result": {"full_text": "H"}})
    data = json.loads(_get_text(result))
    assert data["format"] == "txt"


async def test_export_csv():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        return {"format": "csv"}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("export_csv", {"ocr_result": {"lines": [{"text": "h"}]}})
    data = json.loads(_get_text(result))
    assert data["format"] == "csv"


async def test_export_docx():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        return {"format": "docx", "data_b64": "b"}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("export_docx", {"ocr_result": {"full_text": "H"}})
    data = json.loads(_get_text(result))
    assert data["format"] == "docx"


async def test_export_searchable_pdf():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        return {"format": "pdf", "data_b64": "cGFmaw=="}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("export_searchable_pdf", {"ocr_result": {"full_text": "S"}})
    data = json.loads(_get_text(result))
    assert data["format"] == "pdf"


async def test_export_pdf_json():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        return {"format": "json"}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("export_pdf_json", {"pdf_ocr_result": {"pages": []}})
    data = json.loads(_get_text(result))
    assert data["format"] == "json"


async def test_export_pdf_txt():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        return {"format": "txt"}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("export_pdf_txt", {"pdf_ocr_result": {"pages": []}})
    data = json.loads(_get_text(result))
    assert data["format"] == "txt"


async def test_export_pdf_csv():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        return {"format": "csv"}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("export_pdf_csv", {"pdf_ocr_result": {"pages": []}})
    data = json.loads(_get_text(result))
    assert data["format"] == "csv"


async def test_export_pdf_docx():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        return {"format": "docx", "data_b64": "b"}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("export_pdf_docx", {"pdf_ocr_result": {"pages": []}})
    data = json.loads(_get_text(result))
    assert data["format"] == "docx"


async def test_spell_check():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        body = kwargs.get("json") or kwargs.get("json_body") or {}
        assert body.get("text") == "\u062a\u06c1\u0630\u06cc\u0628"
        return {"corrected": "\u062a\u06c1\u0630\u06cc\u0628"}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("spell_check", {"text": "\u062a\u06c1\u0630\u06cc\u0628", "mode": "hybrid"})
    data = json.loads(_get_text(result))
    assert data["corrected"] == "\u062a\u06c1\u0630\u06cc\u0628"


async def test_spell_analyze():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        return {"errors": []}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("spell_analyze", {"text": "\u062a\u06c1\u0630\u06cc\u0628"})
    data = json.loads(_get_text(result))
    assert "errors" in data


async def test_spell_suggest():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        return {"total_words_with_errors": 1}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("spell_suggest", {"text": "\u062a\u06c1\u0630\u06cc\u0628", "n": 5})
    data = json.loads(_get_text(result))
    assert data["total_words_with_errors"] == 1


async def test_spell_batch():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        body = kwargs.get("json") or {}
        return {"aggregate_stats": {"total_texts": 2}}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("spell_batch", {
            "texts": ["\u062a\u06c1\u0630\u06cc\u0628"], "mode": "aggressive",
        })
    data = json.loads(_get_text(result))
    assert data["aggregate_stats"]["total_texts"] == 2


async def test_spell_romanize():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        return {"romanized": "tazhib"}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("spell_romanize", {"text": "\u062a\u06c1\u0630\u06cc\u0628"})
    data = json.loads(_get_text(result))
    assert data["romanized"] == "tazhib"


async def test_spell_add_user_word():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        return {"added": "\u062a\u06c1\u0630\u06cc\u0628"}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("spell_add_user_word", {"word": "\u062a\u06c1\u0630\u06cc\u0628"})
    data = json.loads(_get_text(result))
    assert data["added"] == "\u062a\u06c1\u0630\u06cc\u0628"


async def test_spell_remove_user_word():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        return {"removed": "\u0645\u062a\u0646", "success": True}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("spell_remove_user_word", {"word": "\u0645\u062a\u0646"})
    data = json.loads(_get_text(result))
    assert data["removed"] == "\u0645\u062a\u0646"


async def test_spell_list_user_dict():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        return {"words": [], "total": 0}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("spell_list_user_dict", {})
    data = json.loads(_get_text(result))
    assert data["total"] == 0


async def test_spell_analytics():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        return {"correction_rate": 0.15}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("spell_analytics", {"text": "\u062a\u06c1\u0630\u06cc\u0628"})
    data = json.loads(_get_text(result))
    assert "correction_rate" in data


async def test_spell_info():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        return {"dictionary": {"words_count": 50000}}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("spell_info", {})
    data = json.loads(_get_text(result))
    assert data["dictionary"]["words_count"] == 50000


async def test_analyze_document():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        return {"language_detection": {"urdu": 0.95}}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("analyze_document", {"text": "\u062a\u06c1\u0630\u06cc\u0628"})
    data = json.loads(_get_text(result))
    assert "language_detection" in data


async def test_summarize_text():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        return {"summary": "Key points"}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("summarize_text", {"text": "Long text"})
    data = json.loads(_get_text(result))
    assert "summary" in data


async def test_recommend_enhancements():
    import importlib; importlib.reload(sys.modules['server'])
    import server
    
    async def check(method, url, **kwargs):
        return {"enhancement": "auto_contrast"}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("recommend_enhancements", {
            "contrast": 20.0, "sharpness": 30.0, "brightness": 30.0, "noise_level": 0.15,
        })
    data = json.loads(_get_text(result))
    assert data["enhancement"] == "auto_contrast"


async def test_detect_table():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        return {"is_table": True}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("detect_table", {"lines": "A\tB\n1\t2"})
    data = json.loads(_get_text(result))
    assert data["is_table"] is True


async def test_get_processing_history():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        return {"stats": {}}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("get_processing_history", {"limit": 10})
    data = json.loads(_get_text(result))
    assert "stats" in data


async def test_clear_processing_history():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        return {"status": "ok"}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("clear_processing_history", {})
    data = json.loads(_get_text(result))
    assert data["status"] == "ok"


async def test_health_check():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        return {"status": "healthy"}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("health_check", {})
    data = json.loads(_get_text(result))
    assert data["status"] == "healthy"


async def test_get_stats():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        return {"uptime_seconds": 3600}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("get_stats", {})
    data = json.loads(_get_text(result))
    assert "uptime_seconds" in data


async def test_switch_device():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        return {"status": "ok"}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("switch_device", {"device": "cuda"})
    data = json.loads(_get_text(result))
    assert data["status"] == "ok"


async def test_get_cache_stats():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        return {"cache": {}}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("get_cache_stats", {})
    data = json.loads(_get_text(result))
    assert "cache" in data


async def test_clear_cache():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        return {"status": "ok"}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("clear_cache", {})
    data = json.loads(_get_text(result))
    assert data["status"] == "ok"


async def test_get_config():
    server = _reload_server()
    
    async def check(method, url, **kwargs):
        return {"server": {"host": "localhost"}}
    
    with patch.object(server, '_request', new=check):
        result = await server.mcp.call_tool("get_config", {})
    data = json.loads(_get_text(result))
    assert data["server"]["host"] == "localhost"


def test_api_base_config():
    for mod in list(sys.modules.keys()):
        if 'server' in mod:
            del sys.modules[mod]
    import server
    assert server.API_BASE == "http://localhost:8000/api/v2"


async def test_resources():
    for mod in list(sys.modules.keys()):
        if 'server' in mod:
            del sys.modules[mod]
    import server
    
    async def mock(method, url, **kwargs):
        return {"status": "healthy"}
    
    with patch.object(server, '_request', new=mock):
        for uri in ["urdu-ocr://health", "urdu-ocr://config", "urdu-ocr://spell-info"]:
            result = await server.mcp.read_resource(uri)
            assert isinstance(result, list), f"Resource {uri} did not return a list"


async def test_prompts():
    for mod in list(sys.modules.keys()):
        if 'server' in mod:
            del sys.modules[mod]
    import server
    
    prompts = await server.mcp.list_prompts()
    for p in prompts:
        resolved = await server.mcp.get_prompt(p.name)
        assert len(resolved.messages) > 0, f"Prompt {p.name} has no messages"


async def run_all():
    tests = [
        ("Import & Registration", test_import_and_registration),
        ("OCR Single", test_ocr_single),
        ("OCR Batch", test_ocr_batch),
        ("OCR With Enhance", test_ocr_with_enhance),
        ("OCR Direct Tensor", test_ocr_direct_tensor),
        ("PDF Info", test_pdf_info),
        ("PDF Extract", test_pdf_extract),
        ("PDF Reconstruct", test_pdf_reconstruct),
        ("PDF OCR Advanced", test_pdf_ocr_advanced),
        ("Cancel PDF Task", test_cancel_pdf_task),
        ("Get Task Progress", test_get_task_progress),
        ("Export JSON", test_export_json),
        ("Export TXT", test_export_txt),
        ("Export CSV", test_export_csv),
        ("Export DOCX", test_export_docx),
        ("Export Searchable PDF", test_export_searchable_pdf),
        ("Export PDF JSON", test_export_pdf_json),
        ("Export PDF TXT", test_export_pdf_txt),
        ("Export PDF CSV", test_export_pdf_csv),
        ("Export PDF DOCX", test_export_pdf_docx),
        ("Spell Check", test_spell_check),
        ("Spell Analyze", test_spell_analyze),
        ("Spell Suggest", test_spell_suggest),
        ("Spell Batch", test_spell_batch),
        ("Spell Romanize", test_spell_romanize),
        ("Spell Add User Word", test_spell_add_user_word),
        ("Spell Remove User Word", test_spell_remove_user_word),
        ("Spell List User Dict", test_spell_list_user_dict),
        ("Spell Analytics", test_spell_analytics),
        ("Spell Info", test_spell_info),
        ("Analyze Document", test_analyze_document),
        ("Summarize Text", test_summarize_text),
        ("Recommend Enhancements", test_recommend_enhancements),
        ("Detect Table", test_detect_table),
        ("Get Processing History", test_get_processing_history),
        ("Clear Processing History", test_clear_processing_history),
        ("Health Check", test_health_check),
        ("Get Stats", test_get_stats),
        ("Switch Device", test_switch_device),
        ("Get Cache Stats", test_get_cache_stats),
        ("Clear Cache", test_clear_cache),
        ("Get Config", test_get_config),
        ("API Base Config", test_api_base_config),
        ("Resources", test_resources),
        ("Prompts", test_prompts),
    ]
    
    passed = failed = 0
    for name, fn in tests:
        ok = await run_test(name, fn)
        if ok:
            passed += 1
        else:
            failed += 1
    
    print(f"\n{'='*60}")
    print(f"Results: {passed} passed, {failed} failed out of {len(tests)} tests")
    return failed == 0


if __name__ == "__main__":
    success = asyncio.run(run_all())
    sys.exit(1 if not success else 0)
