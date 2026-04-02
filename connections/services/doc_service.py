# connections/services/doc_service.py
"""
Business documentation upload service (Local version).

Upload flow:
    1. Save raw file → Local Storage: ./storage/business_docs/{conn_id}/{doc_id}/original.*
    2. Extract text   → pdfplumber / python-docx / plain read
    3. Ollama call    → generate per-table summaries JSON
    4. Save summaries  → Local: ./storage/business_docs/{conn_id}/{doc_id}/summaries.json
    5. Rebuild merged  → Local: ./storage/business_docs/{conn_id}/_all_summaries.json
    6. Save metadata   → MongoDB: business_docs collection
    7. Invalidate      → Redis: delete docs:summaries:{conn_id}
"""
from __future__ import annotations

import io
import json
import logging
import uuid
import os
import shutil
from datetime import datetime, timezone
from typing import Any, Optional

from auth.core.mongo import get_database

logger = logging.getLogger(__name__)

COLLECTION = "business_docs"
_MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB
_MAX_TEXT_FOR_LLM = 15000  # chars sent to LLM

_STORAGE_ROOT = "./storage/business_docs"

_ALLOWED_EXTENSIONS = {
    "pdf", "docx", "txt", "md", "csv", "xlsx",
}

# ── Local Storage helpers ──────────────────────────────────────────────────

def _ensure_dir(path: str):
    os.makedirs(os.path.dirname(path), exist_ok=True)

def _get_local_path(relative_path: str) -> str:
    return os.path.join(_STORAGE_ROOT, relative_path)

def _save_local_file(rel_path: str, data: bytes):
    full_path = _get_local_path(rel_path)
    _ensure_dir(full_path)
    with open(full_path, "wb") as f:
        f.write(data)
    logger.debug(f"[DocService] Saved local file: {full_path} ({len(data)} bytes)")

def _read_local_file(rel_path: str) -> bytes:
    full_path = _get_local_path(rel_path)
    if not os.path.exists(full_path):
        raise FileNotFoundError(f"Local file not found: {full_path}")
    with open(full_path, "rb") as f:
        return f.read()

def _delete_local_file(rel_path: str):
    full_path = _get_local_path(rel_path)
    if os.path.exists(full_path):
        os.remove(full_path)
        logger.debug(f"[DocService] Deleted local file: {full_path}")

def _local_file_exists(rel_path: str) -> bool:
    return os.path.exists(_get_local_path(rel_path))


# ── Text extraction ───────────────────────────────────────────────────────────

def _extract_text(file_bytes: bytes, file_type: str) -> str:
    """Extract plain text from uploaded file bytes."""
    file_type = file_type.lower()
    try:
        if file_type == "pdf":
            import pdfplumber
            text_parts = []
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text: text_parts.append(page_text)
            return "\n\n".join(text_parts)

        elif file_type == "docx":
            from docx import Document
            doc = Document(io.BytesIO(file_bytes))
            return "\n".join(p.text for p in doc.paragraphs if p.text.strip())

        elif file_type in ("txt", "md"):
            return file_bytes.decode("utf-8", errors="replace")

        elif file_type == "csv":
            import pandas as pd
            df = pd.read_csv(io.BytesIO(file_bytes), nrows=500)
            return df.to_string(index=False)

        elif file_type == "xlsx":
            import pandas as pd
            dfs = pd.read_excel(io.BytesIO(file_bytes), sheet_name=None, nrows=500)
            parts = []
            for sheet_name, df in dfs.items():
                parts.append(f"=== Sheet: {sheet_name} ===\n{df.to_string(index=False)}")
            return "\n\n".join(parts)
    except Exception as exc:
        logger.error(f"[DocService] Extraction error for {file_type}: {exc}")
        return ""
    return ""


# ── Ollama summarization ─────────────────────────────────────────────────────

async def _run_ollama_summarization(
    extracted_text: str,
    table_list: list[dict],
    existing_summaries: dict | None = None,
) -> dict:
    """
    Call local Ollama to generate per-table summaries.
    """
    from ai_agent.providers import get_llm
    from langchain_core.messages import HumanMessage, SystemMessage

    system_prompt = "You are a database documentation analyst. Extract business context for tables from the provided text. Return ONLY valid JSON."
    
    prompt = f"""
TABLES IN DATABASE:
{json.dumps(table_list)}

DOCUMENTATION TEXT:
{extracted_text[:_MAX_TEXT_FOR_LLM]}

Return ONLY valid JSON with this structure:
{{
  "tables": [
    {{
      "table_schema": "public",
      "table_name": "employees",
      "description": "Brief summary",
      "business_context": "Detailed rules",
      "column_descriptions": {{ "col": "desc" }}
    }}
  ]
}}
"""
    try:
        llm = get_llm()
        response = await llm.ainvoke([SystemMessage(content=system_prompt), HumanMessage(content=prompt)])
        raw = response.content.strip()

        if "```json" in raw:
            raw = raw.split("```json")[1].split("```")[0].strip()
        elif "```" in raw:
            raw = raw.split("```")[1].split("```")[0].strip()

        parsed = json.loads(raw)
        tables = parsed.get("tables", [])

        result = {}
        for t in tables:
            schema = t.get("table_schema", "public")
            name = t.get("table_name", "")
            if not name: continue
            key = f"{schema}__{name}"
            result[key] = {
                "table_schema": schema,
                "table_name": name,
                "description": t.get("description", ""),
                "business_context": t.get("business_context", ""),
                "column_descriptions": t.get("column_descriptions", {}),
            }
        return result
    except Exception as exc:
        logger.error(f"[DocService] Ollama summarization failed: {exc}")
        return {}


# ── _all_summaries.json management ────────────────────────────────────────────

def _all_summaries_rel_path(connection_id: str) -> str:
    return f"{connection_id}/_all_summaries.json"

async def _rebuild_all_summaries(connection_id: str) -> dict:
    db = get_database()
    cursor = db[COLLECTION].find({"connection_id": connection_id, "is_active": True})
    
    merged: dict = {}
    async for doc_data in cursor:
        sum_path = doc_data.get("summaries_path")
        if not sum_path or not _local_file_exists(sum_path): continue
        
        try:
            raw = _read_local_file(sum_path)
            doc_summaries = json.loads(raw.decode("utf-8"))
            for key, summary in doc_summaries.items():
                if key in merged:
                    merged[key]["business_context"] += " " + summary.get("business_context", "")
                    merged[key]["column_descriptions"].update(summary.get("column_descriptions", {}))
                else:
                    merged[key] = summary
        except Exception as exc:
            logger.warning(f"[DocService] Error rebuilding for {doc_data.get('doc_id')}: {exc}")

    _save_local_file(_all_summaries_rel_path(connection_id), json.dumps(merged).encode("utf-8"))

    # Update Cache
    from core.redis_client import redis_set
    from core.cache_keys import key_doc_summary_index, key_doc_table_summary, TTL_DOC_SUMMARIES
    index = {k: v.get("description", "") for k, v in merged.items()}
    await redis_set(key_doc_summary_index(connection_id), index, TTL_DOC_SUMMARIES)
    
    return merged


# ── Public API ────────────────────────────────────────────────────────────────

async def upload_doc(
    connection_id: str,
    file_bytes: bytes,
    filename: str,
    uploaded_by: str,
) -> dict:
    doc_id = str(uuid.uuid4())
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    
    # 1. Save raw
    rel_original = f"{connection_id}/{doc_id}/original.{ext}"
    _save_local_file(rel_original, file_bytes)
    
    # 2. Extract & Summarize
    text = _extract_text(file_bytes, ext)
    
    # Get table list from MongoDB schema_cache
    db = get_database()
    schema_doc = await db["schema_cache"].find_one({"connection_id": connection_id, "doc_id": "_tables"})
    table_list = schema_doc.get("tables", []) if schema_doc else []
    
    doc_summaries = await _run_ollama_summarization(text, table_list)
    
    # 3. Save summaries
    rel_summaries = f"{connection_id}/{doc_id}/summaries.json"
    _save_local_file(rel_summaries, json.dumps(doc_summaries).encode("utf-8"))
    
    # 4. Save Metadata
    doc_meta = {
        "doc_id":          doc_id,
        "connection_id":   connection_id,
        "filename":        filename,
        "file_type":       ext,
        "file_size_bytes": len(file_bytes),
        "storage_path":    rel_original,
        "summaries_path":  rel_summaries,
        "table_count":     len(doc_summaries),
        "tables_matched":  list(doc_summaries.keys()),
        "uploaded_by":     uploaded_by,
        "uploaded_at":     datetime.now(timezone.utc).isoformat(),
        "is_active":       True,
    }
    await db[COLLECTION].insert_one(doc_meta)
    
    await _rebuild_all_summaries(connection_id)
    if "_id" in doc_meta: doc_meta.pop("_id")
    return doc_meta

async def list_docs(connection_id: str) -> list[dict]:
    db = get_database()
    cursor = db[COLLECTION].find({"connection_id": connection_id, "is_active": True}).sort("uploaded_at", -1)
    return [{k: v for k, v in d.items() if k != "_id"} async for d in cursor]

async def delete_doc(connection_id: str, doc_id: str) -> bool:
    db = get_database()
    res = await db[COLLECTION].find_one_and_update(
        {"connection_id": connection_id, "doc_id": doc_id},
        {"$set": {"is_active": False}},
        return_document=True
    )
    if res:
        await _rebuild_all_summaries(connection_id)
        return True
    return False

def get_summary_index_sync(connection_id: str) -> dict:
    # Synchronous wrapper for schema_tools.py
    import asyncio
    try:
        path = _get_local_path(_all_summaries_rel_path(connection_id))
        if os.path.exists(path):
            with open(path, "r") as f:
                merged = json.load(f)
                return {k: v.get("description", "") for k, v in merged.items()}
    except: pass
    return {}

def get_table_summary_sync(connection_id: str, schema: str, table: str) -> dict | None:
    key = f"{schema}__{table}"
    try:
        path = _get_local_path(_all_summaries_rel_path(connection_id))
        if os.path.exists(path):
            with open(path, "r") as f:
                merged = json.load(f)
                return merged.get(key)
    except: pass
    return None
