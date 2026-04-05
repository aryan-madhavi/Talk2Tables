# connections/services/doc_service.py
"""
Business documentation upload service.

Upload flow:
    1. Save raw file → Firebase Storage: business_docs/{conn_id}/{doc_id}/original.*
    2. Extract text   → pdfplumber / python-docx / plain read
    3. Gemini call     → generate per-table summaries JSON
    4. Save summaries  → Storage: business_docs/{conn_id}/{doc_id}/summaries.json
    5. Rebuild merged  → Storage: business_docs/{conn_id}/_all_summaries.json
    6. Save metadata   → Firestore: business_docs/{doc_id} (thin pointer)
    7. Invalidate      → Redis: delete docs:summaries:{conn_id}

Query-time flow (called by schema_tools.py):
    get_all_summaries(connection_id)
      → Redis HIT: return cached dict
      → Redis MISS: download _all_summaries.json from Storage, cache, return
"""
from __future__ import annotations

import io
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)

COLLECTION = "database_connections"
DOC_SUB_COL = "business_docs"
_MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB
_MAX_TEXT_FOR_LLM = 15000  # chars sent to Gemini (≈4K tokens)

_ALLOWED_EXTENSIONS = {
    "pdf", "docx", "txt", "md", "csv", "xlsx",
}

_MIME_TYPES = {
    "pdf":  "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "txt":  "text/plain",
    "md":   "text/markdown",
    "csv":  "text/csv",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


# ── Firebase Storage helpers ──────────────────────────────────────────────────

def _get_bucket():
    """Return the Firebase Storage bucket. Auto-derived from project ID."""
    from firebase_admin import storage
    try:
        return storage.bucket()
    except Exception as exc:
        raise RuntimeError(
            "Firebase Storage bucket not available. "
            "Ensure FIREBASE_PROJECT_ID is set in .env and "
            "Firebase Storage is enabled in your Firebase Console."
        ) from exc


def _upload_to_storage(path: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    blob = _get_bucket().blob(path)
    blob.upload_from_string(data, content_type=content_type)
    logger.debug(f"[DocService] Uploaded to Storage: {path} ({len(data)} bytes)")
    return path


def _download_from_storage(path: str) -> bytes:
    blob = _get_bucket().blob(path)
    return blob.download_as_bytes()


def _delete_from_storage(path: str) -> None:
    try:
        _get_bucket().blob(path).delete()
        logger.debug(f"[DocService] Deleted from Storage: {path}")
    except Exception as exc:
        logger.warning(f"[DocService] Storage delete failed (non-fatal): {path} — {exc}")


def _storage_exists(path: str) -> bool:
    try:
        return _get_bucket().blob(path).exists()
    except Exception:
        return False


# ── Text extraction ───────────────────────────────────────────────────────────

def _extract_text(file_bytes: bytes, file_type: str) -> str:
    """Extract plain text from uploaded file bytes. Supports PDF, DOCX, TXT, MD, CSV, XLSX."""
    file_type = file_type.lower()

    if file_type == "pdf":
        import pdfplumber
        text_parts = []
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
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

    else:
        raise ValueError(f"Unsupported file type: {file_type}")


# ── Gemini summarization ─────────────────────────────────────────────────────

def _build_summarization_prompt(
    extracted_text: str,
    table_list: list[dict],
    existing_summaries: dict | None = None,
) -> str:
    """Build the Gemini prompt for per-table summary extraction."""
    existing_section = ""
    if existing_summaries:
        existing_section = f"""
EXISTING TABLE CONTEXT (merge with new information — do NOT discard existing info):
{json.dumps(existing_summaries, indent=2)}
"""

    return f"""\
You are a database documentation analyst.

Given the following database documentation text and the list of actual tables
in the database, extract business context for each table.

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
      "description": "Brief 1-2 sentence summary for table listing",
      "business_context": "Detailed paragraph: what this table stores, business rules, important status codes, relationships to other tables",
      "column_descriptions": {{
        "status": "Employment status: A=Active, T=Terminated, L=On Leave",
        "salary": "Annual CTC in INR, updated during appraisal cycle"
      }}
    }}
  ]
}}

Rules:
- Only include tables that are mentioned or clearly relevant in the documentation
- column_descriptions: only include columns with business meaning explained in the docs
- description: keep under 120 chars, factual
- business_context: include status codes, business rules, data meanings, relationships
- If you cannot find info for a table, skip it entirely
- If EXISTING CONTEXT is provided for a table, merge it with new information (keep existing + add new)
{existing_section}"""


async def _run_gemini_summarization(
    extracted_text: str,
    table_list: list[dict],
    existing_summaries: dict | None = None,
) -> dict:
    """
    Call Gemini to generate per-table summaries from documentation text.
    Returns dict keyed by '{schema}__{table}' → summary object.
    """
    prompt = _build_summarization_prompt(extracted_text, table_list, existing_summaries)

    try:
        import os
        from langchain_google_genai import ChatGoogleGenerativeAI

        api_key = os.environ.get("GEMINI_API_KEY", "")
        if not api_key:
            logger.warning("[DocService] GEMINI_API_KEY not set — skipping summarization")
            return {}

        model_name = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
        
        # Initialize LangChain's Gemini wrapper
        llm = ChatGoogleGenerativeAI(
            model=model_name,
            temperature=0.1,
            google_api_key=api_key,
        )

        response = await llm.ainvoke(prompt)
        raw = response.content.strip()

        # Clean JSON if it's wrapped in a code block
        if raw.startswith("```json"):
            raw = raw[7:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

        parsed = json.loads(raw)
        tables = parsed.get("tables", [])

        result = {}
        for t in tables:
            schema = t.get("table_schema", "public")
            name = t.get("table_name", "")
            if not name:
                continue
            key = f"{schema}__{name}"
            result[key] = {
                "table_schema": schema,
                "table_name": name,
                "description": t.get("description", ""),
                "business_context": t.get("business_context", ""),
                "column_descriptions": t.get("column_descriptions", {}),
            }

        logger.info(f"[DocService] Gemini extracted summaries for {len(result)} tables")
        return result

    except Exception as exc:
        logger.error(f"[DocService] Gemini summarization failed: {exc}", exc_info=True)
        return {}


# ── _all_summaries.json management ────────────────────────────────────────────

def _all_summaries_path(connection_id: str) -> str:
    return f"business_docs/{connection_id}/_all_summaries.json"


def _load_all_summaries_from_storage(connection_id: str) -> dict:
    """Load _all_summaries.json from Storage. Returns {} if not found."""
    path = _all_summaries_path(connection_id)
    try:
        if not _storage_exists(path):
            return {}
        data = _download_from_storage(path)
        return json.loads(data.decode("utf-8"))
    except Exception as exc:
        logger.warning(f"[DocService] Failed to load _all_summaries.json: {exc}")
        return {}


def _save_all_summaries_to_storage(connection_id: str, summaries: dict) -> None:
    """Overwrite _all_summaries.json in Storage."""
    path = _all_summaries_path(connection_id)
    data = json.dumps(summaries, indent=2, default=str).encode("utf-8")
    _upload_to_storage(path, data, content_type="application/json")
    logger.info(f"[DocService] Saved _all_summaries.json ({len(summaries)} tables) | conn={connection_id}")


async def _rebuild_all_summaries(connection_id: str) -> dict:
    """
    Rebuild _all_summaries.json by merging all individual doc summaries.
    Downloads each active doc's summaries.json from Storage, merges them
    (later uploads take priority for conflicts), saves merged result.
    """
    from auth.core.firebase import get_firestore_client

    db = get_firestore_client()
    docs_ref = (
        db.collection(COLLECTION)
          .document(connection_id)
          .collection(DOC_SUB_COL)
    )

    merged: dict = {}
    for doc in docs_ref.stream():
        doc_data = doc.to_dict()
        if not doc_data.get("is_active", True):
            continue

        summaries_path = doc_data.get("summaries_path", "")
        if not summaries_path:
            continue

        try:
            if _storage_exists(summaries_path):
                raw = _download_from_storage(summaries_path)
                doc_summaries = json.loads(raw.decode("utf-8"))
                # Merge: for overlapping tables, combine context
                for key, summary in doc_summaries.items():
                    if key in merged:
                        # Merge column_descriptions
                        existing_cols = merged[key].get("column_descriptions", {})
                        new_cols = summary.get("column_descriptions", {})
                        existing_cols.update(new_cols)
                        # Merge business_context (append new info)
                        existing_ctx = merged[key].get("business_context", "")
                        new_ctx = summary.get("business_context", "")
                        if new_ctx and new_ctx not in existing_ctx:
                            merged[key]["business_context"] = f"{existing_ctx} {new_ctx}".strip()
                        merged[key]["column_descriptions"] = existing_cols
                        # Use latest description
                        if summary.get("description"):
                            merged[key]["description"] = summary["description"]
                        # Track source docs
                        sources = merged[key].get("source_doc_ids", [])
                        sources.append(doc_data.get("doc_id", ""))
                        merged[key]["source_doc_ids"] = sources
                    else:
                        summary["source_doc_ids"] = [doc_data.get("doc_id", "")]
                        merged[key] = summary
        except Exception as exc:
            logger.warning(f"[DocService] Error reading summaries for doc {doc.id}: {exc}")

    _save_all_summaries_to_storage(connection_id, merged)

    # Invalidate / Pre-populate Redis cache
    try:
        from core.redis_client import redis_set
        from core.cache_keys import key_doc_summary_index, key_doc_table_summary, TTL_DOC_SUMMARIES
        
        # Write the new index
        index = {k: v.get("description", "") for k, v in merged.items()}
        await redis_set(key_doc_summary_index(connection_id), index, TTL_DOC_SUMMARIES)

        # Write the granular table keys
        for key, summary in merged.items():
            if "__" in key:
                schema, table = key.split("__", 1)
                await redis_set(
                    key_doc_table_summary(connection_id, schema, table),
                    summary,
                    TTL_DOC_SUMMARIES
                )
    except Exception as exc:
        logger.warning(f"[DocService] Cache prepopulate failed: {exc}")

    return merged


# ── Fetch table list (for Gemini prompt) ──────────────────────────────────────

def _get_table_list_for_connection(connection_id: str) -> list[dict]:
    """
    Get the list of tables for a connection from schema cache.
    Falls back to empty list if cache is not available.
    """
    from auth.core.firebase import get_firestore_client

    db = get_firestore_client()
    ref = (
        db.collection(COLLECTION)
          .document(connection_id)
          .collection("schema_cache")
          .document("_tables")
    )
    doc = ref.get()
    if doc.exists:
        data = doc.to_dict()
        return data.get("tables", [])
    return []


# ── Public API ────────────────────────────────────────────────────────────────

async def upload_doc(
    connection_id: str,
    file_bytes: bytes,
    filename: str,
    uploaded_by: str,
) -> dict:
    """
    Upload a business documentation file for a database connection.

    Flow:
        1. Validate file type and size
        2. Save raw file to Firebase Storage
        3. Extract text from file
        4. Get table list from schema cache
        5. Load existing summaries (for merge)
        6. Call Gemini to generate per-table summaries
        7. Save per-doc summaries.json to Storage
        8. Rebuild _all_summaries.json (merges all docs)
        9. Save metadata to Firestore
        10. Invalidate Redis cache

    Returns:
        Dict with doc metadata including tables_matched.
    """
    # ── 1. Validate ───────────────────────────────────────────────────────
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in _ALLOWED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file type '.{ext}'. Allowed: {', '.join(sorted(_ALLOWED_EXTENSIONS))}"
        )
    if len(file_bytes) > _MAX_FILE_SIZE:
        raise ValueError(f"File too large ({len(file_bytes) / 1024 / 1024:.1f} MB). Max: 100 MB.")

    doc_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    # ── 2. Save raw file to Storage ───────────────────────────────────────
    storage_path = f"business_docs/{connection_id}/{doc_id}/original.{ext}"
    _upload_to_storage(storage_path, file_bytes, content_type=_MIME_TYPES.get(ext, "application/octet-stream"))
    logger.info(f"[DocService] Raw file saved: {storage_path} ({len(file_bytes)} bytes)")

    # ── 3. Extract text ───────────────────────────────────────────────────
    try:
        extracted_text = _extract_text(file_bytes, ext)
    except Exception as exc:
        logger.error(f"[DocService] Text extraction failed for {filename}: {exc}")
        extracted_text = ""

    if not extracted_text.strip():
        logger.warning(f"[DocService] No text extracted from {filename}")

    # ── 4. Get table list ─────────────────────────────────────────────────
    table_list = _get_table_list_for_connection(connection_id)

    # ── 5. Load existing summaries for merge ──────────────────────────────
    existing_summaries = _load_all_summaries_from_storage(connection_id) or None

    # ── 6. Gemini summarization ───────────────────────────────────────────
    tables_matched = []
    doc_summaries = {}
    if extracted_text.strip() and table_list:
        doc_summaries = await _run_gemini_summarization(
            extracted_text, table_list, existing_summaries
        )
        tables_matched = [
            f"{s.get('table_schema', 'public')}.{s.get('table_name', '')}"
            for s in doc_summaries.values()
        ]
    elif extracted_text.strip() and not table_list:
        logger.warning(
            f"[DocService] No schema cache for connection {connection_id} — "
            "summaries will be generated on next schema refresh"
        )

    # ── 7. Save per-doc summaries.json ────────────────────────────────────
    summaries_path = f"business_docs/{connection_id}/{doc_id}/summaries.json"
    summaries_data = json.dumps(doc_summaries, indent=2, default=str).encode("utf-8")
    _upload_to_storage(summaries_path, summaries_data, content_type="application/json")

    # ── 8. Rebuild _all_summaries.json ────────────────────────────────────
    # First save metadata so rebuild picks it up
    from auth.core.firebase import get_firestore_client

    db = get_firestore_client()
    doc_meta = {
        "doc_id":          doc_id,
        "filename":        filename,
        "file_type":       ext,
        "file_size_bytes": len(file_bytes),
        "storage_path":    storage_path,
        "summaries_path":  summaries_path,
        "table_count":     len(tables_matched),
        "tables_matched":  tables_matched,
        "uploaded_by":     uploaded_by,
        "uploaded_at":     now,
        "is_active":       True,
    }

    db.collection(COLLECTION).document(connection_id).collection(DOC_SUB_COL).document(doc_id).set(doc_meta)
    logger.info(f"[DocService] Metadata saved | doc_id={doc_id} tables_matched={len(tables_matched)}")

    # Rebuild merged summaries
    await _rebuild_all_summaries(connection_id)

    return doc_meta


async def list_docs(connection_id: str) -> list[dict]:
    """List all active business docs for a connection (metadata only)."""
    from auth.core.firebase import get_firestore_client

    db = get_firestore_client()
    docs = (
        db.collection(COLLECTION)
          .document(connection_id)
          .collection(DOC_SUB_COL)
          .stream()
    )

    results = []
    for doc in docs:
        data = doc.to_dict()
        if data.get("is_active", True):
            # Strip storage internals — frontend doesn't need them
            results.append({
                "doc_id":          data.get("doc_id", doc.id),
                "filename":        data.get("filename", ""),
                "file_type":       data.get("file_type", ""),
                "file_size_bytes": data.get("file_size_bytes", 0),
                "table_count":     data.get("table_count", 0),
                "tables_matched":  data.get("tables_matched", []),
                "uploaded_by":     data.get("uploaded_by", ""),
                "uploaded_at":     data.get("uploaded_at", ""),
            })

    results.sort(key=lambda x: x.get("uploaded_at", ""), reverse=True)
    return results


async def delete_doc(connection_id: str, doc_id: str) -> bool:
    """
    Soft-delete a business doc. Removes files from Storage, rebuilds merged summaries.
    """
    from auth.core.firebase import get_firestore_client

    db = get_firestore_client()
    ref = (
        db.collection(COLLECTION)
          .document(connection_id)
          .collection(DOC_SUB_COL)
          .document(doc_id)
    )

    doc = ref.get()
    if not doc.exists:
        return False

    data = doc.to_dict()

    # Delete files from Storage
    _delete_from_storage(data.get("storage_path", ""))
    _delete_from_storage(data.get("summaries_path", ""))

    # Soft-delete in Firestore
    ref.update({"is_active": False})
    logger.info(f"[DocService] Soft-deleted doc | doc_id={doc_id} conn={connection_id}")

    # Rebuild _all_summaries.json without this doc
    await _rebuild_all_summaries(connection_id)

    return True


async def get_all_summaries(connection_id: str) -> dict:
    """
    Get all merged table summaries for a connection.
    Used by schema_tools.py to enrich get_schema_list and get_table_definition.

    Cache priority: Redis → Firebase Storage → empty dict
    """
    from core.cache_keys import key_doc_summaries, TTL_DOC_SUMMARIES
    from core.redis_client import redis_get, redis_set

    # 1. Redis cache
    cache_key = key_doc_summaries(connection_id)
    cached = await redis_get(cache_key)
    if cached is not None:
        return cached

    # 2. Firebase Storage
    summaries = _load_all_summaries_from_storage(connection_id)

    # 3. Cache in Redis (even empty dict to avoid repeated Storage reads)
    if summaries is not None:
        await redis_set(cache_key, summaries, TTL_DOC_SUMMARIES)

    return summaries or {}


def get_summary_index_sync(connection_id: str) -> dict:
    """
    Returns a lightweight index mapping schema__table -> description.
    """
    from core.cache_keys import key_doc_summary_index, TTL_DOC_SUMMARIES

    try:
        from ai_agent.tools.schema_tools import _redis_get_sync, _redis_set_sync
        cache_key = key_doc_summary_index(connection_id)
        cached = _redis_get_sync(cache_key)
        if cached is not None:
            return cached
    except Exception:
        cache_key = None

    summaries = _load_all_summaries_from_storage(connection_id) or {}
    
    # Build index
    index = {k: v.get("description", "") for k, v in summaries.items()}

    if cache_key:
        try:
            _redis_set_sync(cache_key, index, TTL_DOC_SUMMARIES)
        except Exception:
            pass

    return index

def get_table_summary_sync(connection_id: str, schema: str, table: str) -> dict | None:
    """
    Returns the heavy business context and column definitions for ONE table.
    """
    from core.cache_keys import key_doc_table_summary, TTL_DOC_SUMMARIES

    key = f"{schema}__{table}"

    try:
        from ai_agent.tools.schema_tools import _redis_get_sync, _redis_set_sync
        cache_key = key_doc_table_summary(connection_id, schema, table)
        cached = _redis_get_sync(cache_key)
        if cached is not None:
            return cached
    except Exception:
        cache_key = None

    summaries = _load_all_summaries_from_storage(connection_id) or {}
    table_summary = summaries.get(key)

    if cache_key and table_summary:
        try:
            _redis_set_sync(cache_key, table_summary, TTL_DOC_SUMMARIES)
        except Exception:
            pass

    return table_summary


async def reprocess_docs(connection_id: str) -> dict:
    """
    Re-process all active docs for a connection.
    Called after schema refresh to pick up new tables.

    Flow:
        1. Get fresh table list from schema cache
        2. Load existing merged summaries
        3. For each active doc: download from Storage → re-extract text
        4. Run Gemini with combined text + updated table list
        5. Rebuild _all_summaries.json
    """
    from auth.core.firebase import get_firestore_client

    logger.info(f"[DocService] Reprocessing docs | conn={connection_id}")

    # 1. Get fresh table list
    table_list = _get_table_list_for_connection(connection_id)
    if not table_list:
        logger.warning(f"[DocService] No schema cache for conn={connection_id}, skipping reprocess")
        return {}

    # 2. Get existing summaries
    existing_summaries = _load_all_summaries_from_storage(connection_id)

    # 3. Collect all doc texts
    db = get_firestore_client()
    docs_ref = (
        db.collection(COLLECTION)
          .document(connection_id)
          .collection(DOC_SUB_COL)
    )

    combined_text_parts = []
    doc_count = 0
    for doc in docs_ref.stream():
        data = doc.to_dict()
        if not data.get("is_active", True):
            continue

        storage_path = data.get("storage_path", "")
        file_type = data.get("file_type", "")
        if not storage_path or not file_type:
            continue

        try:
            file_bytes = _download_from_storage(storage_path)
            text = _extract_text(file_bytes, file_type)
            if text.strip():
                combined_text_parts.append(f"--- From: {data.get('filename', 'unknown')} ---\n{text}")
                doc_count += 1
        except Exception as exc:
            logger.warning(f"[DocService] Failed to re-extract doc {doc.id}: {exc}")

    if not combined_text_parts:
        logger.info(f"[DocService] No doc text to process for conn={connection_id}")
        return existing_summaries or {}

    combined_text = "\n\n".join(combined_text_parts)
    logger.info(f"[DocService] Re-extracted {doc_count} docs ({len(combined_text)} chars) | conn={connection_id}")

    # 4. Run Gemini
    new_summaries = await _run_gemini_summarization(combined_text, table_list, existing_summaries)

    if new_summaries:
        # 5. Rebuild — save directly since we already have the merged result
        _save_all_summaries_to_storage(connection_id, new_summaries)

        # Update individual doc summaries.json references
        # (not strictly necessary but keeps things consistent)

        # Invalidate / Pre-populate Redis cache
        try:
            from core.redis_client import redis_set
            from core.cache_keys import key_doc_summary_index, key_doc_table_summary, TTL_DOC_SUMMARIES
            
            # Write the new index
            index = {k: v.get("description", "") for k, v in new_summaries.items()}
            await redis_set(key_doc_summary_index(connection_id), index, TTL_DOC_SUMMARIES)

            # Write the granular table keys
            for key, summary in new_summaries.items():
                if "__" in key:
                    schema, table = key.split("__", 1)
                    await redis_set(
                        key_doc_table_summary(connection_id, schema, table),
                        summary,
                        TTL_DOC_SUMMARIES
                    )
        except Exception as exc:
            logger.warning(f"[DocService] Cache prepopulate failed: {exc}")

        # Update table_count on all active doc metadata
        for doc in docs_ref.stream():
            data = doc.to_dict()
            if data.get("is_active", True):
                matched = [
                    f"{s.get('table_schema', 'public')}.{s.get('table_name', '')}"
                    for s in new_summaries.values()
                ]
                doc.reference.update({
                    "table_count": len(matched),
                    "tables_matched": matched,
                })

    logger.info(f"[DocService] Reprocess complete | conn={connection_id} tables={len(new_summaries)}")
    return new_summaries
