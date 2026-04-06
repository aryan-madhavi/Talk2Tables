# connections/routes/doc_routes.py
"""
Business Documentation endpoints.

All routes require db_manager or admin role.

Endpoints:
    POST   /api/v1/connections/{id}/docs           — upload documentation file
    GET    /api/v1/connections/{id}/docs            — list uploaded docs
    DELETE /api/v1/connections/{id}/docs/{doc_id}   — soft-delete a document
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status

from auth.routes.dependencies import require_db_manager

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/connections",
    tags=["Business Documentation"],
)

_MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB

_ALLOWED_EXTENSIONS = {
    "pdf", "docx", "txt", "md", "csv", "xlsx",
}


# ── POST /api/v1/connections/{id}/docs ────────────────────────────────────────

@router.post(
    "/{connection_id}/docs",
    status_code=status.HTTP_201_CREATED,
    summary="Upload business documentation for a database connection",
    description=(
        "Upload a PDF, DOCX, TXT, MD, CSV, or XLSX file containing business "
        "documentation about the database (data dictionaries, business rules, "
        "table descriptions, column meanings). The file is stored in Firebase "
        "Storage and processed by Gemini to generate per-table business context "
        "that enriches the AI agent's understanding of the database schema. "
        "Max file size: 100 MB. Requires db_manager or admin role."
    ),
)
async def upload_doc_route(
    connection_id: str,
    file: UploadFile = File(..., description="Documentation file (PDF, DOCX, TXT, MD, CSV, XLSX)"),
    current_user: dict = Depends(require_db_manager),
):
    # Validate file extension
    filename = file.filename or "unknown"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '.{ext}'. Allowed: {', '.join(sorted(_ALLOWED_EXTENSIONS))}",
        )

    # Read file bytes
    file_bytes = await file.read()

    # Validate size
    if len(file_bytes) > _MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large ({len(file_bytes) / 1024 / 1024:.1f} MB). Maximum: 100 MB.",
        )

    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty file uploaded.",
        )

    # Verify connection exists
    from connections.services.connection_service import get_connection_by_id
    connection = await get_connection_by_id(connection_id)
    if not connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Connection '{connection_id}' not found.",
        )

    logger.info(
        f"[POST /connections/{connection_id}/docs] "
        f"file={filename} size={len(file_bytes)} by={current_user['firebase_uid']}"
    )

    try:
        from connections.services.doc_service import upload_doc
        result = await upload_doc(
            connection_id=connection_id,
            file_bytes=file_bytes,
            filename=filename,
            uploaded_by=current_user["firebase_uid"],
        )
        return result
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        )


# ── GET /api/v1/connections/{id}/docs ─────────────────────────────────────────

@router.get(
    "/{connection_id}/docs",
    summary="List uploaded business documentation for a connection",
    description=(
        "Returns metadata for all active documentation files uploaded for "
        "this connection, including matched table counts and upload timestamps. "
        "Requires db_manager or admin role."
    ),
)
async def list_docs_route(
    connection_id: str,
    current_user: dict = Depends(require_db_manager),
):
    from connections.services.doc_service import list_docs
    docs = await list_docs(connection_id)
    return {"docs": docs, "total": len(docs)}


# ── DELETE /api/v1/connections/{id}/docs/{doc_id} ─────────────────────────────

@router.delete(
    "/{connection_id}/docs/{doc_id}",
    summary="Delete a business documentation file",
    description=(
        "Soft-deletes the documentation file and removes its contribution to "
        "table summaries. The merged summaries are rebuilt after deletion. "
        "Requires db_manager or admin role."
    ),
)
async def delete_doc_route(
    connection_id: str,
    doc_id: str,
    current_user: dict = Depends(require_db_manager),
):
    logger.info(
        f"[DELETE /connections/{connection_id}/docs/{doc_id}] "
        f"by={current_user['firebase_uid']}"
    )

    from connections.services.doc_service import delete_doc
    deleted = await delete_doc(connection_id, doc_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document '{doc_id}' not found.",
        )

    return {"message": f"Document '{doc_id}' deleted. Table summaries rebuilt."}


# ── GET /api/v1/connections/{id}/docs/{doc_id}/download ───────────────────────

@router.get(
    "/{connection_id}/docs/{doc_id}/download",
    summary="Download a business documentation file",
    description="Returns the raw bytes of the documentation file.",
)
async def download_doc_route(
    connection_id: str,
    doc_id: str,
    current_user: dict = Depends(require_db_manager),
):
    from fastapi.responses import Response
    from connections.services.doc_service import download_doc
    try:
        result = await download_doc(connection_id, doc_id)
        return Response(
            content=result["file_bytes"],
            media_type=result["content_type"],
            headers={"Content-Disposition": f'attachment; filename="{result["filename"]}"'}
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )

