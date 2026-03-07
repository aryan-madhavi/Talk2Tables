# query/routes/schemas.py
"""Pydantic request/response models for query endpoints."""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class QueryRequest(BaseModel):
    """POST /api/v1/query"""
    connection_id: str = Field(
        ...,
        description="Firestore document ID from database_connections collection."
    )
    chat_input: str = Field(
        ..., min_length=1, max_length=2000,
        description="User's natural language query (English or Hindi)."
    )
    chat_id: Optional[str] = Field(
        default=None,
        description="Existing chat UUID to continue. Pass null/omit to start a new conversation."
    )

    class Config:
        json_schema_extra = {
            "example": {
                "connection_id": "abc123-uuid",
                "chat_input":    "Show sensors overdue for calibration in the next 30 days",
                "chat_id":       None,
            }
        }


class NumericalInsights(BaseModel):
    total_records: int = 0
    aggregations:  dict[str, Any] = {}


class QueryResult(BaseModel):
    """Structured result returned on successful query execution."""
    sql_query:           str
    summary:             str
    total_records:       int = 0
    numerical_insights:  NumericalInsights
    data:                list[dict[str, Any]]


class QueryResponse(BaseModel):
    """Unified response model for POST /api/v1/query.

    data is a list so the frontend can do response.data[0].sql_query etc.
    On success:  data = [{ sql_query, summary, total_records, numerical_insights, data }]
    On error:    data = [{ error_message }]
    """
    response_type:  str           # "results" | "error"
    chat_id:        str
    data:           list[dict[str, Any]]


class SchemaTable(BaseModel):
    table:   str
    schema:  Optional[str] = None
    columns: int = 0


class SchemaResponse(BaseModel):
    connection_id: str
    tables:        list[SchemaTable]
    table_count:   int
