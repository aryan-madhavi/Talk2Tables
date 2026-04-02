// src/lib/chatService.ts
// Chat & Workspaces API — /api/v1/chat/*

import { getAccessToken } from './authService';

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
  chat_id:          string;
  connection_id:    string;
  messages:         MessageOut[];
  total:            number;
  has_more:         boolean;
  next_before_seq:  number | null;
}

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getIdToken(): Promise<string> {
  const token = getAccessToken();
  if (!token) throw new Error('Not signed in');
  return token;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getIdToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(body.detail ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return {} as T;
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

/** GET /api/v1/chat/workspaces/{conn}/{chat}/messages — paginated */
export async function getMessages(
  connectionId: string,
  chatId:       string,
  options?: { limit?: number; beforeSeq?: number },
): Promise<MessagesResponse> {
  const params = new URLSearchParams();
  if (options?.limit)     params.set('limit',      String(options.limit));
  if (options?.beforeSeq) params.set('before_seq', String(options.beforeSeq));
  const qs = params.toString() ? `?${params}` : '';
  return apiFetch<MessagesResponse>(
    `/chat/workspaces/${connectionId}/chats/${chatId}/messages${qs}`,
  );
}

/** GET /api/v1/chat/recent — last 5 recent chats across all workspaces */
export async function getRecentChats(): Promise<{ chats: ChatOut[]; total: number }> {
  return apiFetch<{ chats: ChatOut[]; total: number }>('/chat/recent');
}

/** POST /api/v1/chat/workspaces/{conn}/chats/{chat}/messages/{msg}/favourite */
export async function favouriteMessage(
  connectionId: string, chatId: string, msgId: string,
): Promise<void> {
  await apiFetch<unknown>(
    `/chat/workspaces/${connectionId}/chats/${chatId}/messages/${msgId}/favourite`,
    { method: 'POST' },
  );
}

/** DELETE /api/v1/chat/workspaces/{conn}/chats/{chat}/messages/{msg}/favourite */
export async function unfavouriteMessage(
  connectionId: string, chatId: string, msgId: string,
): Promise<void> {
  await apiFetch<unknown>(
    `/chat/workspaces/${connectionId}/chats/${chatId}/messages/${msgId}/favourite`,
    { method: 'DELETE' },
  );
}
