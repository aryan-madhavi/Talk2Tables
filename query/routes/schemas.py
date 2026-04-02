# query/routes/schemas.py
"""Pydantic request/response models for query endpoints."""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class QueryRequest(BaseModel):
    """POST /api/v1/query"""
    connection_id: str = Field(
        ...,
        description="Connection ID."
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
    """Unified response model for POST /api/v1/query."""
    response_type:  str           # "results" | "error"
    chat_id:        str
    data:           list[dict[str, Any]]


class SchemaTable(BaseModel):
    table:       str
    schema_name: Optional[str] = Field(default=None, alias="schema")
    columns:     int = 0
    description: Optional[str] = None

    model_config = {"populate_by_name": True}


class SchemaResponse(BaseModel):
    """Response for GET /api/v1/schema/{connection_id}"""
    connection_id: str
    schemas:       dict[str, list[str]]
    tables:        list[SchemaTable]
    table_count:   int
    cached:        bool = False
    cached_at:     Optional[str] = None
    stale:         bool = False


class ColumnInfo(BaseModel):
    column_name:          str
    data_type:            str
    nullable:             bool = True
    primary_key:          bool = False
    default:              Optional[str] = None
    references:           Optional[str] = None
    sample_values:        Optional[list[str]] = None
    business_description: Optional[str] = None

    # For backward compatibility with some frontend components
    @property
    def name(self) -> str: return self.column_name
    @property
    def type(self) -> str: return self.data_type
    @property
    def pk(self) -> bool: return self.primary_key


class TableSchemaResponse(BaseModel):
    connection_id:    str
    schema_name:      str = Field(alias="schema")
    table_name:       str = Field(alias="table")
    business_context: Optional[str] = None
    columns:          list[ColumnInfo]
    cached:           bool = False
    cached_at:        Optional[str] = None

    model_config = {"populate_by_name": True}
