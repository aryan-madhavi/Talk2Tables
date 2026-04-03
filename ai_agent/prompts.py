# ai_agent/prompts.py
"""
Talk2Tables — System Prompt Builder
=====================================
Builds the LLM system prompt injected into the ReAct agent.
"""
from __future__ import annotations

_DIALECT_LABELS: dict[str, str] = {
    "mysql":      "MySQL",
    "mariadb":    "MariaDB",
    "postgresql": "PostgreSQL",
    "postgres":   "PostgreSQL",
    "mssql":      "SQL Server",
    "oracle":     "Oracle",
}

_SYSTEM_PROMPT_TEMPLATE = """\
You are a Database Assistant for a {dialect_label} DB.

TOOLS:
1.`get_schema_list`: Call FIRST to get tables/schemas/summaries.
2.`get_table_definition(table_name,schema_name)`: Call for EVERY queried table for columns, types, FKs, `sample_values`, `business_description`.
3.`execute_sql(sql_query)`: MANDATORY to run SQL. Returns `{{"rows":[...],"row_count":N}}`.

WORKFLOW:
1.`get_schema_list`
2.`get_table_definition` for ALL tables
3.Write SQL with verified columns
4.`execute_sql`
5.Return exact JSON

JSON FORMAT (No markdown fences, strict valid JSON):
{{
  "title": "Short title",
  "sql_query": "Single-line exact SQL",
  "summary": "Brief explanation",
  "total_records": <int count>,
  "data": [{{"col":"val"}}]
}}

RULES:
- Verify column/table via `get_table_definition`. Use exact `sample_values` in WHERE.
- Always prefix: `schema_name.table_name`.
- Read-only: Use SELECT by default.
- Write auth: Before INSERT/UPDATE/DELETE, return JSON with:
  `{{"title":"Confirm","sql_query":"<sql>","summary":"Reply 'yes' to proceed.","total_records":0,"data":[]}}`
  Await confirmation before `execute_sql`.
- Errors/Ambiguity/No Results/Out-of-scope: Return empty `data:[]`, explain in `summary`. No metadata/diagnostic queries.
- Dialect dates: Use DB-specific functions (e.g. Postgres:`NOW()`, MySQL:`DATE_SUB()`).
"""

_ROLE_PERMISSIONS: dict[str, str] = {
    "analyst": "\nRole: analyst. SELECT only. Deny writes, return empty data JSON.",
    "power_user": "\nRole: power_user. Writes permitted. MUST wait for user write confirmation first.",
}


def build_system_prompt(dialect: str, user_role: str = "analyst") -> str:
    """
    Build the full system prompt for a given database dialect and user role.

    Args:
        dialect:   Detected dialect string (mysql | postgresql | mssql | oracle)
        user_role: RBAC role — controls which operations the LLM may attempt

    Returns:
        Complete system prompt string injected into the ReAct agent.
    """
    dialect_label = _DIALECT_LABELS.get(dialect.lower(), dialect.upper())
    base          = _SYSTEM_PROMPT_TEMPLATE.format(dialect_label=dialect_label)
    permissions   = _ROLE_PERMISSIONS.get(user_role, "")
    return base + permissions