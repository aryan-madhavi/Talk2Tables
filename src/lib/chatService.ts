// src/lib/chatService.ts
// Chat & Workspaces API — /api/v1/chat/*

import { auth } from './firebaseConfig';

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace('/auth', '') ??
  'http://localhost:8000/api/v1';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorkspaceOut {
  connection_id:   string;
  connection_name: string;
  created_at:      string;
}

export interface WorkspaceListResponse {
  workspaces: WorkspaceOut[];
  total:      number;
}

export interface ChatOut {
  chat_id:       string;
  title:         string;
  connection_id: string;
  msg_count:     number;
  created_at:    string;
  updated_at:    string;
}

export interface ChatListResponse {
  connection_id: string;
  chats:         ChatOut[];
  total:         number;
}

export interface MessageOut {
  msg_id:               string;
  seq:                  number;
  role:                 'user' | 'assistant';
  content:              string;
  sql_query:            string | null;
  summary:              string | null;
  total_records:        number | null;
  numerical_insights:   Record<string, unknown> | null;
  data:                 Record<string, unknown>[] | null;
  error_message:        string | null;
  created_at:           string;
}

export interface MessagesResponse {
  chat_id:       string;
  connection_id: string;
  messages:      MessageOut[];
  total:         number;
}

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getIdToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return user.getIdToken();
}

async function apiFetch<T>(path: string): Promise<T> {
  const token = await getIdToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(body.detail ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── API calls ─────────────────────────────────────────────────────────────────

/** GET /api/v1/chat/workspaces — all workspaces for current user */
export async function listWorkspaces(): Promise<WorkspaceListResponse> {
  return apiFetch<WorkspaceListResponse>('/chat/workspaces');
}

/** GET /api/v1/chat/workspaces/{connection_id}/chats — chats in a workspace */
export async function listChats(connectionId: string): Promise<ChatListResponse> {
  return apiFetch<ChatListResponse>(`/chat/workspaces/${connectionId}/chats`);
}

/** GET /api/v1/chat/workspaces/{connection_id}/chats/{chat_id}/messages */
export async function getMessages(connectionId: string, chatId: string): Promise<MessagesResponse> {
  return apiFetch<MessagesResponse>(`/chat/workspaces/${connectionId}/chats/${chatId}/messages`);
}

/** GET /api/v1/chat/recent — last 5 recent chats across all workspaces */
export async function getRecentChats(): Promise<ChatOut[]> {
  return apiFetch<ChatOut[]>('/chat/recent');
}
