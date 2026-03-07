# ai_agent/tools/__init__.py
"""
Tool registry — returns the complete tool list for a given connection.
"""
from __future__ import annotations

from .schema_tools import make_schema_tools, detect_dialect
from .query_tools import make_query_tools


def get_tools(connection_string: str, user_role: str) -> list:
    """
    Build and return all LangChain tools bound to the given DB connection.

    Returns a list of 3 tools (matching the n8n tool set):
        - get_schema_list
        - get_table_definition
        - execute_sql

    Args:
        connection_string: SQLAlchemy URL for the target database.
        user_role:         RBAC role for write-operation enforcement.
    """
    schema_tools = make_schema_tools(connection_string)
    query_tools  = make_query_tools(connection_string, user_role)
    return schema_tools + query_tools


__all__ = ["get_tools", "detect_dialect"]
