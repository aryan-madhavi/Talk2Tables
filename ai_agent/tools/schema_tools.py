# ai_agent/tools/schema_tools.py
"""
LangChain tools for schema inspection.

Tools returned are factory-created closures bound to a specific connection string,
mirroring n8n's PG_GET_DbSchemaAndTablesList and PG_GET_TableDefinition tools.

Tools:
    get_schema_list       — list all {table_schema, table_name} in the database
    get_table_definition  — columns, types, nullable, defaults, FK relationships
"""
from __future__ import annotations

import logging
from typing import Any

from langchain_core.tools import tool
from sqlalchemy import create_engine, inspect, text

logger = logging.getLogger(__name__)

# Dialect hints for detecting schema from connection string
_DIALECT_HINTS: dict[str, str] = {
    "mysql":      "mysql",
    "mariadb":    "mariadb",
    "postgresql": "postgresql",
    "postgres":   "postgresql",
    "sqlite":     "sqlite",
    "mssql":      "mssql",
    "oracle":     "oracle",
}


def detect_dialect(connection_string: str) -> str:
    """Detect SQL dialect from SQLAlchemy connection URL."""
    cs = connection_string.lower()
    for prefix, dialect in _DIALECT_HINTS.items():
        if cs.startswith(prefix):
            return dialect
    logger.warning(f"[SchemaTools] Unknown dialect in connection string. Defaulting to 'mysql'.")
    return "mysql"


def _get_engine(connection_string: str):
    return create_engine(connection_string, pool_pre_ping=True, echo=False)


def make_schema_tools(connection_string: str) -> list:
    """
    Return [get_schema_list, get_table_definition] LangChain tools
    bound to the given connection string.

    Args:
        connection_string: SQLAlchemy URL for the target database.
    """

    @tool
    def get_schema_list() -> str:
        """
        Get the list of all tables and their schemas in the connected database.
        Call this FIRST before constructing any SQL query.
        Returns a JSON array of objects with keys: table_schema, table_name.
        """
        try:
            engine    = _get_engine(connection_string)
            inspector = inspect(engine)
            tables    = inspector.get_table_names()

            # Try to get schema names per table
            results = []
            try:
                # get_sorted_table_and_fkc_names is not always available; use get_table_names with schema
                schema_names = inspector.get_schema_names()
                # Filter out system schemas
                _SYSTEM_SCHEMAS = {
                    "information_schema", "pg_catalog",       # PostgreSQL
                    "mysql", "performance_schema", "sys",      # MySQL
                    "SYSTEM", "SYS", "DBSNMP",                 # Oracle
                }
                user_schemas = [s for s in schema_names if s not in _SYSTEM_SCHEMAS]
            except Exception:
                user_schemas = [None]

            for schema in user_schemas:
                try:
                    schema_tables = inspector.get_table_names(schema=schema)
                except Exception:
                    schema_tables = tables

                for tbl in schema_tables:
                    results.append({
                        "table_schema": schema or "default",
                        "table_name":   tbl,
                    })

            if not results:
                return "No tables found in the connected database."

            import json
            return json.dumps(results, indent=2)

        except Exception as exc:
            logger.error(f"[get_schema_list] Failed: {exc}")
            return f"Error listing tables: {exc}"

    @tool
    def get_table_definition(table_name: str, schema_name: str) -> str:
        """
        Get the full column definitions for a specific table, including data types,
        nullable flags, default values, and foreign key relationships.
        Call this before querying any table to know its exact columns.

        Args:
            table_name:  Name of the table to inspect.
            schema_name: Schema the table belongs to (e.g. 'public', 'mydb').
        """
        try:
            engine    = _get_engine(connection_string)
            inspector = inspect(engine)

            schema_arg = schema_name if schema_name and schema_name != "default" else None

            # Columns
            try:
                columns = inspector.get_columns(table_name, schema=schema_arg)
            except Exception as exc:
                return f"Error fetching columns for {schema_name}.{table_name}: {exc}"

            # Primary keys
            try:
                pk_info   = inspector.get_pk_constraint(table_name, schema=schema_arg)
                pk_cols   = set(pk_info.get("constrained_columns", []))
            except Exception:
                pk_cols = set()

            # Foreign keys
            try:
                fk_map: dict[str, str] = {}
                for fk in inspector.get_foreign_keys(table_name, schema=schema_arg):
                    for local_col, ref_col in zip(
                        fk["constrained_columns"], fk["referred_columns"]
                    ):
                        ref_schema = fk.get("referred_schema") or schema_arg or ""
                        fk_map[local_col] = f"{ref_schema}.{fk['referred_table']}.{ref_col}"
            except Exception:
                fk_map = {}

            result_rows = []
            for col in columns:
                col_name = col["name"]
                result_rows.append({
                    "column_name":      col_name,
                    "data_type":        str(col.get("type", "UNKNOWN")),
                    "is_nullable":      "YES" if col.get("nullable", True) else "NO",
                    "column_default":   str(col.get("default", "")) if col.get("default") is not None else None,
                    "constraint_type":  "PRIMARY KEY" if col_name in pk_cols else None,
                    "referenced_table": fk_map.get(col_name),
                })

            if not result_rows:
                return f"No columns found for table {schema_name}.{table_name}"

            import json
            return json.dumps(result_rows, indent=2)

        except Exception as exc:
            logger.error(f"[get_table_definition] Failed for {schema_name}.{table_name}: {exc}")
            return f"Error fetching table definition: {exc}"

    return [get_schema_list, get_table_definition]
