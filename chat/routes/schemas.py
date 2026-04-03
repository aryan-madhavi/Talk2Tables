# chat/routes/schemas.py
"""Pydantic response schemas for the chat/workspace browser endpoints."""
from __future__ import annotations

from typing import Any, Optional
from pydantic import BaseModel


class WorkspaceOut(BaseModel):
    connection_id:   str
    connection_name: str = ""
    created_at:      str


class ChatOut(BaseModel):
    chat_id:       str
    title:         str
    connection_id: str = ""
    msg_count:     int = 0
    created_at:    str
    updated_at:    str


class MessageOut(BaseModel):
    msg_id:  str   # doc ID: u_0001 (user) or a_0001 (assistant)
    seq:     int
    role:    str   # "user" | "assistant"
    content: str   # user text OR assistant summary

    # ── AI response fields (assistant messages only) ───────────────────────
    title:               Optional[str]            = None
    sql_query:           Optional[str]            = None
    query_type:          Optional[str]            = None   # SELECT | INSERT | UPDATE | DELETE
    status:              Optional[str]            = None   # "success" | "error"
    summary:             Optional[str]            = None
    total_records:       Optional[int]            = None
    numerical_insights:  Optional[dict[str, Any]] = None
    narrative_insights:  Optional[dict[str, Any]] = None
    data:                Optional[list[Any]]      = None
    error_message:       Optional[str]            = None
    favourited:          bool                     = False

    created_at: str


class WorkspaceListResponse(BaseModel):
    workspaces: list[WorkspaceOut]
    total:      int


class ChatListResponse(BaseModel):
    connection_id: str
    chats:         list[ChatOut]
    total:         int


class MessagesResponse(BaseModel):
    chat_id:          str
    connection_id:    str
    messages:         list[MessageOut]
    total:            int          # count in this page
    has_more:         bool         # True if older messages exist
    next_before_seq:  int | None   # pass as ?before_seq= to fetch the previous page
