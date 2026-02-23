# AI Coach Assistant - Frontend Build Specification

> Build spec for implementing the AI Coach Assistant chat feature in the `sports2-frontend/v2/` React + TypeScript codebase. This document is code-heavy and follows the patterns already established in the frontend.

---

## Table of Contents

1. [Overview](#1-overview)
2. [File Structure](#2-file-structure)
3. [TypeScript Types](#3-typescript-types)
4. [API Client Module](#4-api-client-module)
5. [SSE Streaming Implementation](#5-sse-streaming-implementation)
6. [Zustand Store](#6-zustand-store)
7. [Hooks](#7-hooks)
8. [Component Specifications](#8-component-specifications)
9. [Routing](#9-routing)
10. [UI/UX Guidelines](#10-uiux-guidelines)
11. [Tool Name Friendly Labels](#11-tool-name-friendly-labels)
12. [Backend API Reference](#12-backend-api-reference)

---

## 1. Overview

The AI Coach Assistant provides collegiate baseball coaches with an AI-powered chat interface backed by real team data. The feature connects to a backend that streams responses via Server-Sent Events (SSE) and executes MCP (Model Context Protocol) tools to query live player stats, game data, scouting reports, and more.

### What the frontend implements

| Capability | Description |
|---|---|
| **Chat interface** | Full conversation UI with SSE streaming, tool-call indicators, markdown rendering |
| **Conversation management** | Create, list, load, archive, rename, delete conversations |
| **Prompt templates** | Pre-built prompts organized by category with variable substitution |
| **Insight generation** | On-demand AI-generated reports (non-streaming) with pin/save |
| **BYOK API key settings** | Users can bring their own OpenRouter API key |
| **Usage tracking** | Token counts and cost tracking per team |

### Backend base URL

All AI endpoints live under `/api/v1/ai/`. The axios `api` client already has `baseURL` set to `/api/v1`, so all requests use paths like `/ai/conversations`.

---

## 2. File Structure

```
src/
├── lib/
│   └── ai-api.ts                      # API client module (all AI endpoints)
├── features/
│   └── ai-coach/
│       ├── index.tsx                   # Main page layout (sidebar + chat)
│       ├── components/
│       │   ├── chat-panel.tsx          # Message list + input area
│       │   ├── message-bubble.tsx      # Individual message rendering
│       │   ├── conversation-list.tsx   # Sidebar conversation list
│       │   ├── prompt-gallery.tsx      # Quick-action prompt template cards
│       │   ├── insight-card.tsx        # Single insight display card
│       │   ├── insights-panel.tsx      # List/grid of saved insights
│       │   ├── tool-indicator.tsx      # "Searching players..." animated badge
│       │   ├── usage-summary.tsx       # Token/cost dashboard
│       │   └── api-key-settings.tsx    # BYOK key management form
│       ├── hooks/
│       │   ├── use-chat.ts            # Core chat hook (SSE streaming + state)
│       │   ├── use-conversations.ts   # Conversation CRUD operations
│       │   └── use-insights.ts        # Insight generation and listing
│       └── types.ts                   # All TypeScript types for AI feature
└── stores/
    └── ai-store.ts                    # Zustand store for cross-component state
```

---

## 3. TypeScript Types

**File: `src/features/ai-coach/types.ts`**

```typescript
// ============================================
// Core Entities
// ============================================

export interface AiConversation {
  id: string               // UUID
  team_id: number
  user_id: number
  title: string | null
  model: string            // e.g. 'claude-sonnet-4-6', 'claude-haiku-4-5'
  system_prompt: string | null
  is_archived: boolean
  total_tokens: number
  message_count: number
  created_at: string       // ISO 8601
  updated_at: string       // ISO 8601
}

export interface AiMessage {
  id: string               // UUID
  conversation_id: string
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result'
  content: string | null
  tool_name: string | null
  tool_input: Record<string, unknown> | null
  tool_result: Record<string, unknown> | null
  tokens_used: number | null
  created_at: string
}

export interface AiInsight {
  id: string               // UUID
  team_id: number
  user_id: number | null
  category: InsightCategory
  title: string
  content: string          // Markdown text
  data_snapshot: Record<string, unknown> | null
  prompt_used: string | null
  is_pinned: boolean
  created_at: string
  updated_at: string
}

export type InsightCategory =
  | 'player_performance'
  | 'pitching_analysis'
  | 'recruiting'
  | 'lineup'
  | 'scouting'
  | 'game_recap'
  | 'weekly_digest'

// ============================================
// Prompt Templates
// ============================================

export interface PromptTemplate {
  id: string               // e.g. 'player_report', 'lineup_builder'
  label: string
  description: string
  prompt: string           // May contain {variable} placeholders
  variables: string[]      // e.g. ['player'], [] for no variables
}

export interface PromptTemplates {
  player_performance: PromptTemplate[]
  game_prep: PromptTemplate[]
  recruiting: PromptTemplate[]
  season_analysis: PromptTemplate[]
}

// ============================================
// API Keys
// ============================================

export interface ApiKeyStatus {
  has_key: boolean
  provider?: string        // 'anthropic'
  is_active?: boolean
  created_at?: string
}

export interface ApiKeyTestResult {
  valid: boolean
  error?: string
}

// ============================================
// Usage
// ============================================

export interface UsageSummary {
  total_requests: string   // Returned as strings from SQL aggregation
  total_tokens: string
  total_cost_usd: string
  month_tokens: string
  month_cost_usd: string
}

export interface AiUsageLog {
  id: string
  model: string            // OpenRouter model ID, e.g. 'anthropic/claude-sonnet-4'
  input_tokens: number
  output_tokens: number
  total_tokens: number
  cost_usd: string         // Decimal string, e.g. '0.0234'
  key_source: 'platform' | 'byok'
  created_at: string
}

// ============================================
// SSE Event Payloads
// ============================================

export interface SSEMessageStart {
  conversation_id: string
}

export interface SSEContentDelta {
  text: string
}

export interface SSEToolUse {
  tool: string             // MCP tool name, e.g. 'search_players'
  status: 'calling'
}

export interface SSEToolResult {
  tool: string
  status: 'complete'
}

export interface SSEMessageEnd {
  tokens: {
    input: number
    output: number
    cost_usd: number
  }
}

export interface SSEError {
  error: string
}

// ============================================
// Pagination (matches backend format)
// ============================================

export interface Pagination {
  page: number
  limit: number
  total: number
  pages: number
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: Pagination
}

// ============================================
// SSE Callback Handlers
// ============================================

export interface SSECallbacks {
  onMessageStart?: (data: SSEMessageStart) => void
  onContentDelta?: (data: SSEContentDelta) => void
  onToolUse?: (data: SSEToolUse) => void
  onToolResult?: (data: SSEToolResult) => void
  onMessageEnd?: (data: SSEMessageEnd) => void
  onError?: (error: string) => void
}
```

---

## 4. API Client Module

**File: `src/lib/ai-api.ts`**

This follows the exact same pattern as `players-api.ts`, `games-api.ts`, etc.

```typescript
/**
 * AI Coach API - conversations, messages (SSE), insights, prompts, API keys, usage.
 */

import api from './api'
import csrfService from './csrf'
import type {
  AiConversation,
  AiMessage,
  AiInsight,
  PromptTemplates,
  ApiKeyStatus,
  ApiKeyTestResult,
  UsageSummary,
  AiUsageLog,
  Pagination,
  SSECallbacks,
  InsightCategory,
} from '@/features/ai-coach/types'

// ============================================
// Helper (same as other API modules)
// ============================================

function getData<T>(res: { success?: boolean; data?: T; [k: string]: unknown }): T | undefined {
  return res?.success !== false && res?.data !== undefined ? (res.data as T) : undefined
}

const defaultPagination: Pagination = { page: 1, limit: 20, total: 0, pages: 0 }

// ============================================
// API Module
// ============================================

export const aiApi = {

  // ------------------------------------------
  // Conversations
  // ------------------------------------------

  createConversation: async (params?: {
    title?: string
    model?: string             // 'claude-sonnet-4-6' | 'claude-haiku-4-5'
    system_prompt?: string
  }): Promise<AiConversation | undefined> => {
    const r = await api.post<{ success?: boolean; data?: AiConversation }>(
      '/ai/conversations',
      params ?? {}
    )
    return getData(r.data as { success?: boolean; data?: AiConversation })
  },

  listConversations: async (params?: {
    page?: number
    limit?: number
    archived?: boolean
  }): Promise<{ data: AiConversation[]; pagination: Pagination }> => {
    const r = await api.get<{
      success?: boolean
      data?: AiConversation[]
      pagination?: Pagination
    }>('/ai/conversations', { params })
    const data = getData(r.data as { success?: boolean; data?: AiConversation[] })
    const pagination = (r.data as { pagination?: Pagination })?.pagination ?? defaultPagination
    return { data: data ?? [], pagination }
  },

  getConversation: async (id: string): Promise<
    (AiConversation & { messages: AiMessage[] }) | undefined
  > => {
    const r = await api.get<{
      success?: boolean
      data?: AiConversation & { messages: AiMessage[] }
    }>(`/ai/conversations/${id}`)
    return getData(r.data as { success?: boolean; data?: AiConversation & { messages: AiMessage[] } })
  },

  updateConversation: async (id: string, data: {
    title?: string
    is_archived?: boolean
  }): Promise<AiConversation | undefined> => {
    const r = await api.patch<{ success?: boolean; data?: AiConversation }>(
      `/ai/conversations/${id}`,
      data
    )
    return getData(r.data as { success?: boolean; data?: AiConversation })
  },

  deleteConversation: async (id: string): Promise<void> => {
    await api.delete(`/ai/conversations/${id}`)
  },

  // ------------------------------------------
  // Messages (SSE Streaming) — uses fetch(), NOT axios
  // ------------------------------------------

  /**
   * Send a message and stream the AI response via SSE.
   *
   * Returns an AbortController so the caller can cancel the stream.
   *
   * IMPORTANT: This uses fetch() instead of the axios client because
   * axios does not support streaming ReadableStream responses.
   * We must manually include credentials and the CSRF token.
   */
  sendMessage: (
    conversationId: string,
    content: string,
    callbacks: SSECallbacks
  ): AbortController => {
    const controller = new AbortController()
    const baseUrl = import.meta.env.VITE_API_URL || '/api/v1'

    // Fire and forget — the async work happens inside
    ;(async () => {
      try {
        // Get CSRF token (required for POST requests)
        const csrfToken = await csrfService.ensureCsrfToken()

        const response = await fetch(
          `${baseUrl}/ai/conversations/${conversationId}/messages`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
            },
            credentials: 'include',       // Send httpOnly JWT cookie
            signal: controller.signal,
            body: JSON.stringify({ content }),
          }
        )

        if (!response.ok) {
          // Non-SSE error response (e.g. 400, 401, 500)
          const errorBody = await response.json().catch(() => null)
          const message = errorBody?.error || `Request failed with status ${response.status}`
          callbacks.onError?.(message)
          return
        }

        // Parse the SSE stream
        await parseSSE(response, {
          onEvent: (event, data) => {
            try {
              const parsed = JSON.parse(data)
              switch (event) {
                case 'message_start':
                  callbacks.onMessageStart?.(parsed)
                  break
                case 'content_delta':
                  callbacks.onContentDelta?.(parsed)
                  break
                case 'tool_use':
                  callbacks.onToolUse?.(parsed)
                  break
                case 'tool_result':
                  callbacks.onToolResult?.(parsed)
                  break
                case 'message_end':
                  callbacks.onMessageEnd?.(parsed)
                  break
                case 'error':
                  callbacks.onError?.(parsed.error)
                  break
              }
            } catch {
              // Skip malformed JSON lines
            }
          },
        })
      } catch (err: unknown) {
        if ((err as Error).name === 'AbortError') {
          // User cancelled — not an error
          return
        }
        callbacks.onError?.((err as Error).message || 'Stream failed')
      }
    })()

    return controller
  },

  // ------------------------------------------
  // Insights
  // ------------------------------------------

  generateInsight: async (data: {
    category: InsightCategory
    prompt?: string
    player_id?: number
    game_id?: number
  }): Promise<{ insight: AiInsight; tokens: { input: number; output: number; cost_usd: number } } | undefined> => {
    const r = await api.post<{
      success?: boolean
      data?: AiInsight
      tokens?: { input: number; output: number; cost_usd: number }
    }>('/ai/insights/generate', data)
    if (r.data?.success === false) return undefined
    return {
      insight: r.data?.data as AiInsight,
      tokens: r.data?.tokens as { input: number; output: number; cost_usd: number },
    }
  },

  listInsights: async (params?: {
    category?: InsightCategory
    pinned?: boolean
    page?: number
    limit?: number
  }): Promise<{ data: AiInsight[]; pagination: Pagination }> => {
    const r = await api.get<{
      success?: boolean
      data?: AiInsight[]
      pagination?: Pagination
    }>('/ai/insights', { params })
    const data = getData(r.data as { success?: boolean; data?: AiInsight[] })
    const pagination = (r.data as { pagination?: Pagination })?.pagination ?? defaultPagination
    return { data: data ?? [], pagination }
  },

  getInsight: async (id: string): Promise<AiInsight | undefined> => {
    const r = await api.get<{ success?: boolean; data?: AiInsight }>(`/ai/insights/${id}`)
    return getData(r.data as { success?: boolean; data?: AiInsight })
  },

  updateInsight: async (id: string, data: {
    is_pinned?: boolean
  }): Promise<AiInsight | undefined> => {
    const r = await api.patch<{ success?: boolean; data?: AiInsight }>(
      `/ai/insights/${id}`,
      data
    )
    return getData(r.data as { success?: boolean; data?: AiInsight })
  },

  deleteInsight: async (id: string): Promise<void> => {
    await api.delete(`/ai/insights/${id}`)
  },

  // ------------------------------------------
  // Prompt Templates
  // ------------------------------------------

  getPrompts: async (): Promise<PromptTemplates | undefined> => {
    const r = await api.get<{ success?: boolean; data?: PromptTemplates }>('/ai/prompts')
    return getData(r.data as { success?: boolean; data?: PromptTemplates })
  },

  // ------------------------------------------
  // API Keys (BYOK)
  // ------------------------------------------

  saveApiKey: async (apiKey: string, provider = 'anthropic'): Promise<ApiKeyStatus | undefined> => {
    const r = await api.post<{ success?: boolean; data?: ApiKeyStatus }>(
      '/ai/api-keys',
      { api_key: apiKey, provider }
    )
    return getData(r.data as { success?: boolean; data?: ApiKeyStatus })
  },

  getApiKeyStatus: async (): Promise<ApiKeyStatus | undefined> => {
    const r = await api.get<{ success?: boolean; data?: ApiKeyStatus }>('/ai/api-keys')
    return getData(r.data as { success?: boolean; data?: ApiKeyStatus })
  },

  removeApiKey: async (): Promise<void> => {
    await api.delete('/ai/api-keys')
  },

  testApiKey: async (apiKey: string): Promise<ApiKeyTestResult | undefined> => {
    const r = await api.post<{ success?: boolean; data?: ApiKeyTestResult }>(
      '/ai/api-keys/test',
      { api_key: apiKey }
    )
    return getData(r.data as { success?: boolean; data?: ApiKeyTestResult })
  },

  // ------------------------------------------
  // Usage
  // ------------------------------------------

  getUsage: async (): Promise<UsageSummary | undefined> => {
    const r = await api.get<{ success?: boolean; data?: UsageSummary }>('/ai/usage')
    return getData(r.data as { success?: boolean; data?: UsageSummary })
  },

  getUsageDetail: async (params?: {
    page?: number
    limit?: number
  }): Promise<{ data: AiUsageLog[]; pagination: Pagination }> => {
    const r = await api.get<{
      success?: boolean
      data?: AiUsageLog[]
      pagination?: Pagination
    }>('/ai/usage/detail', { params })
    const data = getData(r.data as { success?: boolean; data?: AiUsageLog[] })
    const pagination = (r.data as { pagination?: Pagination })?.pagination ?? defaultPagination
    return { data: data ?? [], pagination }
  },
}

// ============================================
// SSE Parser (used internally by sendMessage)
// ============================================

/**
 * Parse a Server-Sent Events stream from a fetch Response.
 *
 * SSE format:
 *   event: content_delta
 *   data: {"text":"Hello"}
 *
 *   event: tool_use
 *   data: {"tool":"search_players","status":"calling"}
 *
 * Each event is two lines (event + data) separated by a blank line.
 */
async function parseSSE(
  response: Response,
  handlers: { onEvent: (event: string, data: string) => void }
): Promise<void> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // Split on newlines and process complete lines
    const lines = buffer.split('\n')
    buffer = lines.pop() || '' // Keep the last incomplete line in the buffer

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim()
      } else if (line.startsWith('data: ')) {
        const data = line.slice(6)
        if (currentEvent) {
          handlers.onEvent(currentEvent, data)
          currentEvent = ''
        }
      }
      // Blank lines are event separators — no action needed since we
      // dispatch on 'data:' lines immediately after capturing 'event:'.
    }
  }

  // Process any remaining buffer content
  if (buffer.trim()) {
    const remainingLines = buffer.split('\n')
    for (const line of remainingLines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim()
      } else if (line.startsWith('data: ')) {
        const data = line.slice(6)
        if (currentEvent) {
          handlers.onEvent(currentEvent, data)
          currentEvent = ''
        }
      }
    }
  }
}

export default aiApi
```

---

## 5. SSE Streaming Implementation

This is the trickiest piece of the frontend. Here is everything a developer needs to know.

### Why not `EventSource`?

The browser `EventSource` Web API only supports **GET** requests. Our SSE endpoint is `POST /ai/conversations/:id/messages` with a JSON body (`{ content: "..." }`). You **must** use `fetch()` with a `ReadableStream` reader.

### Why not axios?

Axios buffers the entire response before resolving. It does not support incremental streaming of `ReadableStream`. We use `fetch()` directly for this one endpoint only.

### Authentication for fetch

Since we bypass the axios interceptors, we must manually handle:

1. **Cookies (JWT):** Set `credentials: 'include'` on the fetch request.
2. **CSRF token:** Call `csrfService.ensureCsrfToken()` and set the `X-CSRF-Token` header.

```typescript
import csrfService from '@/lib/csrf'

const csrfToken = await csrfService.ensureCsrfToken()

const response = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken,
  },
  credentials: 'include',
  signal: abortController.signal,
  body: JSON.stringify({ content: userMessage }),
})
```

### Abort handling

Every call to `aiApi.sendMessage()` returns an `AbortController`. Use it to:

- **Cancel on navigation:** Call `controller.abort()` in a `useEffect` cleanup.
- **Cancel on new message:** Abort the previous stream before starting a new one.
- **Cancel on user action:** "Stop generating" button calls `controller.abort()`.

```typescript
// In a React component or hook:
const abortRef = useRef<AbortController | null>(null)

// On send:
abortRef.current?.abort()   // Cancel any in-flight stream
abortRef.current = aiApi.sendMessage(conversationId, content, callbacks)

// On unmount:
useEffect(() => {
  return () => { abortRef.current?.abort() }
}, [])
```

### SSE event sequence

A typical message exchange produces events in this order:

```
1. message_start   → { conversation_id: "uuid" }
2. content_delta   → { text: "Based on " }          (0..N times)
3. content_delta   → { text: "the stats..." }
4. tool_use        → { tool: "search_players", status: "calling" }
5. tool_result     → { tool: "search_players", status: "complete" }
   (steps 4-5 may repeat for multiple tool calls)
6. content_delta   → { text: "Looking at the data..." }  (more text after tools)
7. message_end     → { tokens: { input: 1523, output: 847, cost_usd: 0.017 } }
```

**Important:** The backend does NOT stream token-by-token. It sends the full text chunk from each LLM API call as a single `content_delta`. If you want a typewriter effect, you must implement client-side character-by-character rendering (see the `useChat` hook below).

---

## 6. Zustand Store

**File: `src/stores/ai-store.ts`**

This follows the pattern from `auth-store.ts`. It holds cross-component state that multiple AI coach components share.

```typescript
import { create } from 'zustand'
import type { AiConversation, PromptTemplates } from '@/features/ai-coach/types'

interface AiState {
  // State
  conversations: AiConversation[]
  activeConversationId: string | null
  prompts: PromptTemplates | null
  sidebarOpen: boolean

  // Actions
  setConversations: (convos: AiConversation[]) => void
  setActiveConversation: (id: string | null) => void
  addConversation: (convo: AiConversation) => void
  updateConversation: (id: string, updates: Partial<AiConversation>) => void
  removeConversation: (id: string) => void
  setPrompts: (prompts: PromptTemplates) => void
  setSidebarOpen: (open: boolean) => void
}

export const useAiStore = create<AiState>()((set) => ({
  conversations: [],
  activeConversationId: null,
  prompts: null,
  sidebarOpen: true,

  setConversations: (conversations) => set({ conversations }),

  setActiveConversation: (id) => set({ activeConversationId: id }),

  addConversation: (convo) =>
    set((state) => ({
      conversations: [convo, ...state.conversations],
    })),

  updateConversation: (id, updates) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),

  removeConversation: (id) =>
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== id),
      activeConversationId:
        state.activeConversationId === id ? null : state.activeConversationId,
    })),

  setPrompts: (prompts) => set({ prompts }),

  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
}))
```

---

## 7. Hooks

### 7.1 `useChat` — Core chat hook with SSE streaming

**File: `src/features/ai-coach/hooks/use-chat.ts`**

This is the most critical hook. It manages the message list, streaming state, tool indicators, and the SSE connection.

```typescript
import { useState, useRef, useCallback, useEffect } from 'react'
import { aiApi } from '@/lib/ai-api'
import { useAiStore } from '@/stores/ai-store'
import type { AiMessage, SSEMessageEnd } from '../types'

interface UseChatReturn {
  messages: AiMessage[]
  isStreaming: boolean
  streamingText: string
  activeTools: string[]
  error: string | null
  tokenInfo: SSEMessageEnd['tokens'] | null
  sendMessage: (content: string) => Promise<void>
  cancelStream: () => void
  loadConversation: (conversationId: string) => Promise<void>
  clearMessages: () => void
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<AiMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [activeTools, setActiveTools] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tokenInfo, setTokenInfo] = useState<SSEMessageEnd['tokens'] | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const { activeConversationId, updateConversation } = useAiStore()

  // Cleanup on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  /**
   * Load an existing conversation's messages from the server.
   */
  const loadConversation = useCallback(async (conversationId: string) => {
    setError(null)
    try {
      const convo = await aiApi.getConversation(conversationId)
      if (convo?.messages) {
        setMessages(convo.messages)
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to load conversation')
    }
  }, [])

  /**
   * Send a user message and stream the AI response.
   */
  const sendMessage = useCallback(async (content: string) => {
    if (!activeConversationId || isStreaming) return

    setError(null)
    setTokenInfo(null)

    // 1. Optimistically add the user message to local state
    const userMessage: AiMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: activeConversationId,
      role: 'user',
      content,
      tool_name: null,
      tool_input: null,
      tool_result: null,
      tokens_used: null,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMessage])
    setIsStreaming(true)
    setStreamingText('')
    setActiveTools([])

    // 2. Cancel any existing stream
    abortRef.current?.abort()

    // 3. Start SSE stream
    let accumulatedText = ''

    abortRef.current = aiApi.sendMessage(activeConversationId, content, {
      onMessageStart: () => {
        // Stream has started — nothing to do yet
      },

      onContentDelta: (data) => {
        accumulatedText += data.text
        setStreamingText(accumulatedText)
      },

      onToolUse: (data) => {
        setActiveTools((prev) => [...prev, data.tool])
      },

      onToolResult: (data) => {
        setActiveTools((prev) => prev.filter((t) => t !== data.tool))

        // Add tool_call + tool_result as collapsed messages
        setMessages((prev) => [
          ...prev,
          {
            id: `tool-call-${Date.now()}`,
            conversation_id: activeConversationId,
            role: 'tool_call' as const,
            content: null,
            tool_name: data.tool,
            tool_input: null,
            tool_result: null,
            tokens_used: null,
            created_at: new Date().toISOString(),
          },
          {
            id: `tool-result-${Date.now()}`,
            conversation_id: activeConversationId,
            role: 'tool_result' as const,
            content: null,
            tool_name: data.tool,
            tool_input: null,
            tool_result: null,
            tokens_used: null,
            created_at: new Date().toISOString(),
          },
        ])
      },

      onMessageEnd: (data) => {
        // Finalize: add the complete assistant message
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            conversation_id: activeConversationId,
            role: 'assistant',
            content: accumulatedText,
            tool_name: null,
            tool_input: null,
            tool_result: null,
            tokens_used: data.tokens.output,
            created_at: new Date().toISOString(),
          },
        ])
        setStreamingText('')
        setIsStreaming(false)
        setActiveTools([])
        setTokenInfo(data.tokens)

        // Auto-title: if the conversation had no title, the backend
        // sets it from the first user message. Update the store.
        updateConversation(activeConversationId, {
          updated_at: new Date().toISOString(),
        })
      },

      onError: (errorMsg) => {
        setError(errorMsg)
        setIsStreaming(false)
        setStreamingText('')
        setActiveTools([])
      },
    })
  }, [activeConversationId, isStreaming, updateConversation])

  const cancelStream = useCallback(() => {
    abortRef.current?.abort()
    setIsStreaming(false)
    // Keep whatever text was accumulated so far
    if (streamingText) {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-cancelled-${Date.now()}`,
          conversation_id: activeConversationId || '',
          role: 'assistant',
          content: streamingText + '\n\n*(Response cancelled)*',
          tool_name: null,
          tool_input: null,
          tool_result: null,
          tokens_used: null,
          created_at: new Date().toISOString(),
        },
      ])
      setStreamingText('')
    }
    setActiveTools([])
  }, [activeConversationId, streamingText])

  const clearMessages = useCallback(() => {
    setMessages([])
    setStreamingText('')
    setError(null)
    setTokenInfo(null)
  }, [])

  return {
    messages,
    isStreaming,
    streamingText,
    activeTools,
    error,
    tokenInfo,
    sendMessage,
    cancelStream,
    loadConversation,
    clearMessages,
  }
}
```

### 7.2 `useConversations` — Conversation CRUD

**File: `src/features/ai-coach/hooks/use-conversations.ts`**

```typescript
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { aiApi } from '@/lib/ai-api'
import { useAiStore } from '@/stores/ai-store'
import type { Pagination } from '../types'

export function useConversations() {
  const {
    conversations,
    setConversations,
    activeConversationId,
    setActiveConversation,
    addConversation,
    removeConversation,
    updateConversation,
  } = useAiStore()

  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, limit: 20, total: 0, pages: 0,
  })

  const fetchConversations = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const result = await aiApi.listConversations({ page, limit: 20 })
      setConversations(result.data)
      setPagination(result.pagination)
    } catch {
      toast.error('Failed to load conversations')
    } finally {
      setLoading(false)
    }
  }, [setConversations])

  // Load conversations on mount
  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  const createConversation = useCallback(async (params?: {
    title?: string
    model?: string
    system_prompt?: string
  }) => {
    try {
      const convo = await aiApi.createConversation(params)
      if (convo) {
        addConversation(convo)
        setActiveConversation(convo.id)
        return convo
      }
    } catch {
      toast.error('Failed to create conversation')
    }
    return null
  }, [addConversation, setActiveConversation])

  const archiveConversation = useCallback(async (id: string) => {
    try {
      await aiApi.updateConversation(id, { is_archived: true })
      removeConversation(id)
      toast.success('Conversation archived')
    } catch {
      toast.error('Failed to archive conversation')
    }
  }, [removeConversation])

  const renameConversation = useCallback(async (id: string, title: string) => {
    try {
      await aiApi.updateConversation(id, { title })
      updateConversation(id, { title })
    } catch {
      toast.error('Failed to rename conversation')
    }
  }, [updateConversation])

  const deleteConversation = useCallback(async (id: string) => {
    try {
      await aiApi.deleteConversation(id)
      removeConversation(id)
      toast.success('Conversation deleted')
    } catch {
      toast.error('Failed to delete conversation')
    }
  }, [removeConversation])

  return {
    conversations,
    activeConversationId,
    loading,
    pagination,
    setActiveConversation,
    fetchConversations,
    createConversation,
    archiveConversation,
    renameConversation,
    deleteConversation,
  }
}
```

### 7.3 `useInsights` — Insight generation and listing

**File: `src/features/ai-coach/hooks/use-insights.ts`**

```typescript
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { aiApi } from '@/lib/ai-api'
import type { AiInsight, InsightCategory, Pagination } from '../types'

export function useInsights() {
  const [insights, setInsights] = useState<AiInsight[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, limit: 20, total: 0, pages: 0,
  })

  const fetchInsights = useCallback(async (params?: {
    category?: InsightCategory
    pinned?: boolean
    page?: number
  }) => {
    setLoading(true)
    try {
      const result = await aiApi.listInsights(params)
      setInsights(result.data)
      setPagination(result.pagination)
    } catch {
      toast.error('Failed to load insights')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchInsights()
  }, [fetchInsights])

  const generateInsight = useCallback(async (params: {
    category: InsightCategory
    prompt?: string
    player_id?: number
    game_id?: number
  }) => {
    setGenerating(true)
    try {
      const result = await aiApi.generateInsight(params)
      if (result?.insight) {
        setInsights((prev) => [result.insight, ...prev])
        toast.success('Insight generated')
        return result
      }
    } catch (err) {
      toast.error((err as Error).message || 'Failed to generate insight')
    } finally {
      setGenerating(false)
    }
    return null
  }, [])

  const togglePin = useCallback(async (id: string, currentlyPinned: boolean) => {
    try {
      await aiApi.updateInsight(id, { is_pinned: !currentlyPinned })
      setInsights((prev) =>
        prev.map((i) => (i.id === id ? { ...i, is_pinned: !currentlyPinned } : i))
      )
    } catch {
      toast.error('Failed to update insight')
    }
  }, [])

  const deleteInsight = useCallback(async (id: string) => {
    try {
      await aiApi.deleteInsight(id)
      setInsights((prev) => prev.filter((i) => i.id !== id))
      toast.success('Insight deleted')
    } catch {
      toast.error('Failed to delete insight')
    }
  }, [])

  return {
    insights,
    loading,
    generating,
    pagination,
    fetchInsights,
    generateInsight,
    togglePin,
    deleteInsight,
  }
}
```

---

## 8. Component Specifications

### 8.1 Main Page — `index.tsx`

**Layout:** Two-column on desktop (sidebar + chat area), single-column on mobile with toggle.

```
+------------------+-------------------------------------------+
| Conversation     |                                           |
| List (sidebar)   |   Chat Panel                              |
|                  |   (or Prompt Gallery if no active convo)   |
| [+ New Chat]     |                                           |
|                  |                                           |
| - Conversation 1 |   [messages scroll area]                  |
| - Conversation 2 |                                           |
| - Conversation 3 |                                           |
|                  |   [input area]                            |
+------------------+-------------------------------------------+
```

**shadcn/ui components:** `ResizablePanel` (or manual flex layout), `Button`, `Sheet` (for mobile sidebar).

**Implementation notes:**
- Use `useConversations()` to load/manage conversations
- Use `useChat()` for the active conversation
- When `activeConversationId` is null, show `PromptGallery` instead of `ChatPanel`
- When a prompt template is selected, auto-create a conversation and send the prompt
- Wrap in the `<Main>` layout component like other features do

```typescript
// Pseudocode structure
import { Main } from '@/components/layout/main'
import { useConversations } from './hooks/use-conversations'
import { useChat } from './hooks/use-chat'
import { ConversationList } from './components/conversation-list'
import { ChatPanel } from './components/chat-panel'
import { PromptGallery } from './components/prompt-gallery'

export function AiCoach() {
  const conversations = useConversations()
  const chat = useChat()

  // When active conversation changes, load its messages
  useEffect(() => {
    if (conversations.activeConversationId) {
      chat.loadConversation(conversations.activeConversationId)
    } else {
      chat.clearMessages()
    }
  }, [conversations.activeConversationId])

  return (
    <Main>
      <div className="flex h-[calc(100vh-theme(spacing.16))]">
        {/* Sidebar */}
        <ConversationList {...conversations} />

        {/* Main area */}
        <div className="flex-1">
          {conversations.activeConversationId ? (
            <ChatPanel {...chat} />
          ) : (
            <PromptGallery
              onSelectPrompt={async (prompt) => {
                const convo = await conversations.createConversation()
                if (convo) chat.sendMessage(prompt)
              }}
            />
          )}
        </div>
      </div>
    </Main>
  )
}
```

---

### 8.2 Chat Panel — `chat-panel.tsx`

**What it renders:**
- Scrollable message area (top) with auto-scroll to bottom on new messages
- Streaming text area (shows partial response during streaming)
- Active tool indicators (during tool execution)
- Fixed input area (bottom) with textarea and send/stop button

**Props:**
```typescript
interface ChatPanelProps {
  messages: AiMessage[]
  isStreaming: boolean
  streamingText: string
  activeTools: string[]
  error: string | null
  sendMessage: (content: string) => Promise<void>
  cancelStream: () => void
}
```

**Key interactions:**
- Enter to send (Shift+Enter for newline)
- "Stop" button appears during streaming, calls `cancelStream()`
- Auto-scrolls to bottom as new content arrives
- Input is disabled while streaming
- Error banner appears at top of message area when `error` is set

**shadcn/ui components:** `ScrollArea`, `Button`, `Textarea`, `Skeleton`, `Alert`

**Implementation notes:**
```typescript
// Keyboard handler for the textarea
const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (input.trim() && !isStreaming) {
      sendMessage(input.trim())
      setInput('')
    }
  }
  if (e.key === 'Escape' && isStreaming) {
    cancelStream()
  }
}

// Auto-scroll ref
const scrollRef = useRef<HTMLDivElement>(null)
useEffect(() => {
  scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
}, [messages, streamingText])
```

---

### 8.3 Message Bubble — `message-bubble.tsx`

**What it renders differently based on role:**

| Role | Alignment | Background | Content |
|------|-----------|------------|---------|
| `user` | Right-aligned | Primary color bg (`bg-primary text-primary-foreground`) | Plain text |
| `assistant` | Left-aligned | Muted bg (`bg-muted`) | Markdown rendered |
| `tool_call` | Left-aligned, inline | None (collapsed badge) | Tool name badge |
| `tool_result` | Left-aligned, inline | None (collapsed badge) | "Complete" badge |

**Props:**
```typescript
interface MessageBubbleProps {
  message: AiMessage
  isLast?: boolean
}
```

**Key details:**
- Assistant messages should render markdown. Use `react-markdown` with `remark-gfm` for tables:
  ```bash
  npm install react-markdown remark-gfm
  ```
- Tool call/result messages render as small collapsible `Badge` elements. They default to collapsed and can be expanded to show raw JSON.
- Show token badge on assistant messages when `tokens_used` is set.

**shadcn/ui components:** `Badge`, `Collapsible`

```typescript
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// For assistant messages:
<div className="prose prose-sm dark:prose-invert max-w-none">
  <ReactMarkdown remarkPlugins={[remarkGfm]}>
    {message.content || ''}
  </ReactMarkdown>
</div>
```

---

### 8.4 Conversation List — `conversation-list.tsx`

**What it renders:**
- "New Chat" button at top (with `+` icon)
- Scrollable list of conversations sorted by `updated_at` desc
- Each item shows: title (or "New conversation"), relative date, model badge
- Active conversation highlighted
- Right-click or `...` menu with: Rename, Archive, Delete

**Props:**
```typescript
interface ConversationListProps {
  conversations: AiConversation[]
  activeConversationId: string | null
  loading: boolean
  setActiveConversation: (id: string | null) => void
  createConversation: () => Promise<AiConversation | null>
  archiveConversation: (id: string) => Promise<void>
  renameConversation: (id: string, title: string) => Promise<void>
  deleteConversation: (id: string) => Promise<void>
}
```

**shadcn/ui components:** `Button`, `Badge`, `ScrollArea`, `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `Skeleton`

**Width:** Fixed at `w-72` on desktop. On mobile, use a `Sheet` (slide-in drawer).

---

### 8.5 Prompt Gallery — `prompt-gallery.tsx`

**What it renders:**
- Shown when no conversation is active (empty/welcome state)
- Header: "What can I help with?" or "AI Coach Assistant"
- Category tabs: Player Performance, Game Prep, Recruiting, Season Analysis
- Grid of prompt cards within each tab
- Each card: label, description, "Use" button
- Templates with `variables` (e.g. `['player']`) show an input dialog when clicked

**Props:**
```typescript
interface PromptGalleryProps {
  onSelectPrompt: (prompt: string) => Promise<void>
}
```

**Key interactions:**
1. On mount, fetch prompts via `aiApi.getPrompts()` (or read from store if cached).
2. When a template with no variables is clicked, call `onSelectPrompt(template.prompt)` directly.
3. When a template has variables (e.g. `{player}`), open a `Dialog` with input fields for each variable. On submit, replace `{variable}` placeholders and call `onSelectPrompt()`.

**shadcn/ui components:** `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `Button`, `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `Input`, `Label`

```typescript
// Variable substitution
function substituteVariables(prompt: string, values: Record<string, string>): string {
  let result = prompt
  for (const [key, value] of Object.entries(values)) {
    result = result.replaceAll(`{${key}}`, value)
  }
  return result
}
```

**Category → tab label mapping:**
```typescript
const CATEGORY_LABELS: Record<string, string> = {
  player_performance: 'Player Performance',
  game_prep: 'Game Prep',
  recruiting: 'Recruiting',
  season_analysis: 'Season Analysis',
}
```

---

### 8.6 Tool Indicator — `tool-indicator.tsx`

**What it renders:**
- Appears inline in the chat area during active tool calls
- Animated spinner/pulse + friendly tool label
- Multiple tools can be active simultaneously (list them vertically)

**Props:**
```typescript
interface ToolIndicatorProps {
  activeTools: string[]     // Array of tool names currently executing
}
```

**Implementation:**
```typescript
import { Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { TOOL_LABELS } from '../constants'

export function ToolIndicator({ activeTools }: ToolIndicatorProps) {
  if (activeTools.length === 0) return null

  return (
    <div className="flex flex-col gap-1.5 px-4 py-2">
      {activeTools.map((tool) => (
        <div key={tool} className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          <span>{TOOL_LABELS[tool] || tool}...</span>
        </div>
      ))}
    </div>
  )
}
```

---

### 8.7 Insights Panel — `insights-panel.tsx`

**What it renders:**
- Header with "Generate Insight" button
- Filter row: category dropdown, "Pinned only" toggle
- Grid/list of `InsightCard` components
- Pagination at bottom

**Uses:** `useInsights()` hook.

**shadcn/ui components:** `Button`, `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`, `Switch`, `Skeleton`

**"Generate Insight" flow:**
1. Click button opens a `Dialog`
2. Select category from dropdown (the 7 InsightCategory values)
3. Optional: enter custom prompt (otherwise uses backend default)
4. Optional: select player (for `player_performance` category)
5. Submit calls `generateInsight()` which shows a loading state (can take 10-30 seconds)

---

### 8.8 Insight Card — `insight-card.tsx`

**What it renders:**
- Card with: category badge (colored), title, creation date
- Pin toggle icon (top right)
- Click to expand and show full markdown content
- Delete action in expanded view or context menu

**Props:**
```typescript
interface InsightCardProps {
  insight: AiInsight
  onTogglePin: (id: string, isPinned: boolean) => void
  onDelete: (id: string) => void
}
```

**Category badge colors:**
```typescript
const CATEGORY_COLORS: Record<InsightCategory, string> = {
  player_performance: 'bg-blue-100 text-blue-800',
  pitching_analysis: 'bg-green-100 text-green-800',
  recruiting: 'bg-purple-100 text-purple-800',
  lineup: 'bg-orange-100 text-orange-800',
  scouting: 'bg-yellow-100 text-yellow-800',
  game_recap: 'bg-red-100 text-red-800',
  weekly_digest: 'bg-gray-100 text-gray-800',
}
```

**shadcn/ui components:** `Card`, `CardHeader`, `CardTitle`, `CardContent`, `Badge`, `Button`, `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent`

---

### 8.9 API Key Settings — `api-key-settings.tsx`

**What it renders:**
- On mount, calls `aiApi.getApiKeyStatus()` to check current state
- If no key: form with input field, "Test Key" and "Save Key" buttons
- If key exists: status display (provider, active, date), "Remove Key" button
- Test result shown inline (success/failure message)

**Props:** None (self-contained component).

**shadcn/ui components:** `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `Input`, `Button`, `Alert`, `AlertTitle`, `AlertDescription`, `Label`

**Flow:**
1. User pastes their OpenRouter API key into the input
2. Clicks "Test Key" - calls `aiApi.testApiKey(key)` - shows result
3. If valid, clicks "Save Key" - calls `aiApi.saveApiKey(key)`
4. On save, the key status updates to show "Key active"
5. "Remove Key" calls `aiApi.removeApiKey()` and resets to the input form

**Important UX:** Explain that the key is an **OpenRouter** key (not a direct Anthropic key). Link to https://openrouter.ai/keys for where to get one. The backend encrypts the key at rest.

---

### 8.10 Usage Summary — `usage-summary.tsx`

**What it renders:**
- Summary cards at top: Total Requests, Total Tokens, Total Cost, Month Tokens, Month Cost
- Detailed usage table below with per-request logs (paginated)

**Props:** None (self-contained component, fetches its own data).

**On mount:**
1. Call `aiApi.getUsage()` for summary stats
2. Call `aiApi.getUsageDetail()` for the log table

**shadcn/ui components:** `Card`, `CardHeader`, `CardTitle`, `CardContent`, `Table`, `TableHeader`, `TableRow`, `TableHead`, `TableBody`, `TableCell`, `Badge`, `Skeleton`

**Table columns:**

| Column | Field | Format |
|--------|-------|--------|
| Date | `created_at` | Relative or short date |
| Model | `model` | Badge, e.g. "claude-sonnet-4" |
| Input Tokens | `input_tokens` | Number with comma separator |
| Output Tokens | `output_tokens` | Number with comma separator |
| Total Tokens | `total_tokens` | Number with comma separator |
| Cost | `cost_usd` | `$0.0234` |
| Source | `key_source` | Badge: "Platform" or "BYOK" |

---

## 9. Routing

Add these routes using TanStack Router (following existing patterns):

```
/ai-coach              → Main AI chat page (ConversationList + ChatPanel/PromptGallery)
/ai-coach/insights     → Insights gallery (InsightsPanel)
/ai-coach/settings     → API key settings + Usage summary
```

**Tab-based navigation within the feature** (like the dashboard uses `TopNav`):

```typescript
const aiCoachNav = [
  { title: 'Chat', href: '/ai-coach', isActive: true },
  { title: 'Insights', href: '/ai-coach/insights', isActive: false },
  { title: 'Settings', href: '/ai-coach/settings', isActive: false },
]
```

The settings page should contain both `ApiKeySettings` and `UsageSummary` stacked vertically.

---

## 10. UI/UX Guidelines

### Streaming feel
The backend sends `content_delta` events as complete chunks (not token-by-token). To create a typewriter effect, you can optionally render `streamingText` with a character animation. However, this is optional -- displaying each chunk as it arrives is already smooth enough.

### Tool visibility
Tool calls should be **visible but not dominant**. Use small inline indicators (the `ToolIndicator` component) that appear between the user message and the accumulating assistant response. After completion, tool calls collapse into small badges.

### Markdown rendering
Assistant responses frequently contain:
- **Tables** (stat comparisons)
- **Bold text** and headers
- **Lists** (recommendations)
- **Code blocks** (rare, but possible for data)

Use `react-markdown` with `remark-gfm` plugin. Apply Tailwind typography styles (`prose` class).

### Error states

| Error | When | UI |
|-------|------|----|
| No API key configured | `sendMessage` returns error | Alert banner with link to settings page |
| Rate limited | 429 from backend | Toast + disable input briefly |
| Network failure | fetch fails | Error banner in chat panel with "Retry" button |
| Invalid API key | BYOK test fails | Inline error under input in settings |
| Stream aborted | User navigates away | Silently cleanup, no error shown |

### Empty states
- **No conversations:** Show `PromptGallery` prominently with a welcome message
- **No insights:** Show empty state card with "Generate your first insight" CTA
- **No usage data:** Show zeroed-out summary cards

### Mobile responsiveness
- **Chat:** Full-screen conversation. Sidebar toggles via hamburger/sheet.
- **Prompt Gallery:** Single-column card layout
- **Settings:** Stack cards vertically

### Keyboard shortcuts

| Key | Action | Context |
|-----|--------|---------|
| Enter | Send message | Chat input focused |
| Shift+Enter | New line | Chat input focused |
| Escape | Cancel streaming | While AI is responding |

### Loading states
- **Conversation list loading:** Show 4-5 `Skeleton` elements matching conversation item height
- **Chat loading:** Show `Skeleton` blocks for messages
- **Streaming in progress:** Show pulsing cursor at end of streaming text
- **Insight generating:** Show full-page loading spinner in dialog (generation takes 10-30 seconds)

---

## 11. Tool Name Friendly Labels

**File: Create a constants file at `src/features/ai-coach/constants.ts`**

```typescript
/**
 * Maps backend MCP tool names to user-friendly labels
 * shown in ToolIndicator during tool execution.
 */
export const TOOL_LABELS: Record<string, string> = {
  search_players: 'Searching players',
  get_player_stats: 'Looking up stats',
  get_player_splits: 'Analyzing splits',
  get_player_trend: 'Checking trends',
  compare_players: 'Comparing players',
  get_game_boxscore: 'Loading box score',
  get_play_by_play: 'Reading play-by-play',
  get_team_record: 'Getting team record',
  get_team_stats: 'Loading team stats',
  get_season_leaders: 'Finding leaders',
  get_scouting_reports: 'Pulling scouting reports',
  get_prospect_pipeline: 'Checking pipeline',
  get_recruiting_board: 'Loading recruiting board',
  get_depth_chart: 'Getting depth chart',
  get_schedule: 'Checking schedule',
  get_roster: 'Loading roster',
  get_daily_reports: 'Reading reports',
  get_matchup_analysis: 'Analyzing matchup',
}

/**
 * Insight category display labels and colors.
 */
export const INSIGHT_CATEGORY_LABELS: Record<string, string> = {
  player_performance: 'Player Performance',
  pitching_analysis: 'Pitching Analysis',
  recruiting: 'Recruiting',
  lineup: 'Lineup',
  scouting: 'Scouting',
  game_recap: 'Game Recap',
  weekly_digest: 'Weekly Digest',
}

export const INSIGHT_CATEGORY_COLORS: Record<string, string> = {
  player_performance: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  pitching_analysis: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  recruiting: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  lineup: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  scouting: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  game_recap: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  weekly_digest: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
}

/**
 * Prompt template category labels for tab headers.
 */
export const PROMPT_CATEGORY_LABELS: Record<string, string> = {
  player_performance: 'Player Performance',
  game_prep: 'Game Prep',
  recruiting: 'Recruiting',
  season_analysis: 'Season Analysis',
}

/**
 * Available AI models the user can select.
 */
export const AI_MODELS = [
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4 (Default)', description: 'Best balance of speed and quality' },
  { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', description: 'Fastest, lower cost' },
] as const
```

---

## 12. Backend API Reference

All endpoints require authentication (JWT via httpOnly cookie). All state-changing methods (POST, PATCH, DELETE) require CSRF token in `X-CSRF-Token` header.

Base path: `/api/v1/ai`

### Conversations

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| `POST` | `/conversations` | `{ model?, system_prompt?, title? }` | `{ success, data: AiConversation }` |
| `GET` | `/conversations` | Query: `page?, limit?, archived?` | `{ success, data: AiConversation[], pagination }` |
| `GET` | `/conversations/:id` | - | `{ success, data: AiConversation & { messages: AiMessage[] } }` |
| `PATCH` | `/conversations/:id` | `{ title?, is_archived? }` | `{ success, data: AiConversation }` |
| `DELETE` | `/conversations/:id` | - | `{ success, data: { message } }` |

### Messages (SSE)

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| `POST` | `/conversations/:id/messages` | `{ content }` | SSE stream (see event format below) |

**SSE events emitted:**
```
event: message_start     data: { "conversation_id": "uuid" }
event: content_delta     data: { "text": "chunk of text" }
event: tool_use          data: { "tool": "search_players", "status": "calling" }
event: tool_result       data: { "tool": "search_players", "status": "complete" }
event: message_end       data: { "tokens": { "input": 1234, "output": 567, "cost_usd": 0.017 } }
event: error             data: { "error": "message" }
```

**Validation:**
- `content` must be a string, 1-10000 characters
- `:id` must be a valid UUID

### Insights

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| `POST` | `/insights/generate` | `{ category, prompt?, player_id?, game_id? }` | `{ success, data: AiInsight, tokens }` |
| `GET` | `/insights` | Query: `category?, pinned?, page?, limit?` | `{ success, data: AiInsight[], pagination }` |
| `GET` | `/insights/:id` | - | `{ success, data: AiInsight }` |
| `PATCH` | `/insights/:id` | `{ is_pinned? }` | `{ success, data: AiInsight }` |
| `DELETE` | `/insights/:id` | - | `{ success, data: { message } }` |

**Valid categories:** `player_performance`, `pitching_analysis`, `recruiting`, `lineup`, `scouting`, `game_recap`, `weekly_digest`

### Prompt Templates

| Method | Endpoint | Response |
|--------|----------|----------|
| `GET` | `/prompts` | `{ success, data: PromptTemplates }` |

Returns a static object with keys: `player_performance`, `game_prep`, `recruiting`, `season_analysis`. Each key contains an array of `PromptTemplate` objects.

### API Keys (BYOK)

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| `POST` | `/api-keys` | `{ api_key, provider? }` | `{ success, data: { has_key, provider, created_at } }` |
| `GET` | `/api-keys` | - | `{ success, data: { has_key, provider?, is_active?, created_at? } }` |
| `DELETE` | `/api-keys` | - | `{ success, data: { message } }` |
| `POST` | `/api-keys/test` | `{ api_key }` | `{ success, data: { valid, error? } }` |

**Notes:**
- `api_key` minimum 10 characters
- `provider` defaults to `'anthropic'` (currently the only supported value)
- The test endpoint hits OpenRouter with a minimal request to validate the key

### Usage

| Method | Endpoint | Response |
|--------|----------|----------|
| `GET` | `/usage` | `{ success, data: UsageSummary }` |
| `GET` | `/usage/detail` | Query: `page?, limit?` → `{ success, data: AiUsageLog[], pagination }` |

**UsageSummary fields are strings** (from SQL aggregation): `total_requests`, `total_tokens`, `total_cost_usd`, `month_tokens`, `month_cost_usd`. Parse with `parseFloat()` or `Number()` for display.

---

## Dependencies to Install

```bash
npm install react-markdown remark-gfm
```

All other dependencies (zustand, sonner, axios, shadcn/ui components, lucide-react) are already in the project.

---

## Checklist

- [ ] Create `src/features/ai-coach/types.ts`
- [ ] Create `src/features/ai-coach/constants.ts`
- [ ] Create `src/lib/ai-api.ts`
- [ ] Create `src/stores/ai-store.ts`
- [ ] Create hooks: `use-chat.ts`, `use-conversations.ts`, `use-insights.ts`
- [ ] Create components: `chat-panel`, `message-bubble`, `conversation-list`, `prompt-gallery`, `tool-indicator`, `insight-card`, `insights-panel`, `api-key-settings`, `usage-summary`
- [ ] Create `index.tsx` main page
- [ ] Add routes to TanStack Router config
- [ ] Add navigation link to sidebar/app shell
- [ ] Install `react-markdown` and `remark-gfm`
- [ ] Test SSE streaming end-to-end
- [ ] Test CSRF token handling on fetch-based SSE endpoint
- [ ] Test mobile responsive layout
- [ ] Test abort/cancel stream behavior
