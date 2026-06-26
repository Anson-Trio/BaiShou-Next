import { useEffect, useState, useCallback, useRef } from 'react'
import type { AgentGateReply, AgentGateRequest } from '@baishou/shared'

export interface ToolExecution {
  name: string
  startTime: number
  durationMs: number
}

export interface UseAgentStreamResult {
  text: string
  reasoning: string
  isStreaming: boolean
  isCompressing: boolean
  compressionPhase: 'auto' | 'manual'
  compressionText: string
  compressionReasoning: string
  compressionTriggerMessageId: string | null
  activeTool: { name: string; args: any } | null
  completedTools: ToolExecution[]
  error: string | null
  pendingAgentGate: AgentGateRequest | null
  isAgentGateReplying: boolean
  saveUserMessage: (
    sessionId: string,
    text: string,
    attachments?: any[]
  ) => Promise<{ userMessageId: string; attachments?: any[] } | { error: string }>
  startChat: (
    sessionId: string,
    text: string,
    providerId?: string,
    modelId?: string,
    attachments?: any[],
    searchMode?: boolean,
    userMsgId?: string
  ) => Promise<void>
  editChat: (
    sessionId: string,
    messageId: string,
    text: string,
    providerId?: string,
    modelId?: string,
    attachments?: any[],
    searchMode?: boolean
  ) => Promise<void>
  resendChat: (
    sessionId: string,
    messageId: string,
    searchMode?: boolean,
    providerId?: string,
    modelId?: string
  ) => Promise<void>
  stopChat: () => void
  reset: () => void
  beginStreaming: (sessionId: string) => void
  replyAgentGate: (input: {
    requestId: string
    reply: AgentGateReply
    message?: string
    selectedOptionIds?: string[]
  }) => Promise<void>
}

interface SessionStreamState {
  text: string
  reasoning: string
  isStreaming: boolean
  isCompressing: boolean
  compressionPhase: 'auto' | 'manual'
  compressionText: string
  compressionReasoning: string
  compressionTriggerMessageId: string | null
  activeTool: { name: string; args: any } | null
  completedTools: ToolExecution[]
  error: string | null
  pendingAgentGate: AgentGateRequest | null
  isAgentGateReplying: boolean
  activeToolStartTime?: number
}

// ── 全局多会话流状态存储 ──
const sessionStates: Record<string, SessionStreamState> = {}
const sessionListeners: Record<string, Set<() => void>> = {}
const COMPRESSION_DELTA_RENDER_INTERVAL_MS = 80
const compressionDeltaNotifyTimers: Record<string, ReturnType<typeof setTimeout> | undefined> = {}

function getOrCreateSessionState(sessionId: string): SessionStreamState {
  if (!sessionStates[sessionId]) {
    sessionStates[sessionId] = {
      text: '',
      reasoning: '',
      isStreaming: false,
      isCompressing: false,
      compressionPhase: 'auto',
      compressionText: '',
      compressionReasoning: '',
      compressionTriggerMessageId: null,
      activeTool: null,
      completedTools: [],
      error: null,
      pendingAgentGate: null,
      isAgentGateReplying: false
    }
  }
  return sessionStates[sessionId]
}

function notifySessionListeners(sessionId: string) {
  if (sessionListeners[sessionId]) {
    sessionListeners[sessionId].forEach((listener) => listener())
  }
}

/** IPC 返回后兜底结束流式状态，避免 stream-finish 丢失导致输入框一直 loading */
export function finishStreamingSession(sessionId: string, error?: string | null): void {
  if (!sessionId) return
  updateSessionState(sessionId, (state) => {
    state.isStreaming = false
    state.activeTool = null
    if (error) state.error = error
  })
}

function applyStreamFinishPayload(payload: any): void {
  const sId = typeof payload === 'object' ? payload?.sessionId : null
  if (!sId) {
    if (payload?.error) {
      for (const id of Object.keys(sessionStates)) {
        if (sessionStates[id]?.isStreaming) {
          updateSessionState(id, (state) => {
            state.isStreaming = false
            state.error = payload.error
            state.activeTool = null
          })
        }
      }
    }
    return
  }
  console.log('[Renderer Stream] stream-finish:', sId, 'payload:', JSON.stringify(payload))
  updateSessionState(sId, (state) => {
    state.isStreaming = false
    if (payload?.error) {
      state.error = payload.error
    }
    state.activeTool = null
  })

  if (payload?.messageId) {
    window.dispatchEvent(
      new CustomEvent('baishou:assistant-message-usage', {
        detail: {
          sessionId: sId,
          messageId: payload.messageId,
          inputTokens: payload.inputTokens,
          outputTokens: payload.outputTokens,
          cacheReadInputTokens: payload.cacheReadInputTokens,
          cacheWriteInputTokens: payload.cacheWriteInputTokens,
          costMicros: payload.costMicros
        }
      })
    )
  }
}

function ensureAgentStreamListenersRegistered(): void {
  if (typeof window === 'undefined' || !window.electron?.ipcRenderer) return
  if ((window as any).__baishou_stream_registered) return
  ;(window as any).__baishou_stream_registered = true

  window.electron.ipcRenderer.on('agent:stream-chunk', (_, payload: any) => {
    const sId = typeof payload === 'object' ? payload?.sessionId : null
    const chunk = typeof payload === 'object' ? payload?.chunk : payload
    if (!sId) return
    updateSessionState(sId, (state) => {
      state.text += chunk
    })
  })

  window.electron.ipcRenderer.on('agent:reasoning-chunk', (_, payload: any) => {
    const sId = typeof payload === 'object' ? payload?.sessionId : null
    const chunk = typeof payload === 'object' ? payload?.chunk : payload
    if (!sId) return
    updateSessionState(sId, (state) => {
      state.reasoning += chunk
    })
  })

  window.electron.ipcRenderer.on('agent:tool-start', (_, payload: any) => {
    const sId = typeof payload === 'object' ? payload?.sessionId : null
    if (!sId) return
    const name = typeof payload === 'object' ? payload?.name : payload?.name
    const args = typeof payload === 'object' ? payload?.args : payload?.args
    updateSessionState(sId, (state) => {
      state.activeToolStartTime = Date.now()
      state.activeTool = { name, args }
    })
  })

  window.electron.ipcRenderer.on('agent:tool-result', (_, payload: any) => {
    const sId = typeof payload === 'object' ? payload?.sessionId : null
    if (!sId) return
    const name = typeof payload === 'object' ? payload?.name : payload?.name
    updateSessionState(sId, (state) => {
      const start = state.activeToolStartTime || Date.now()
      const durationMs = Date.now() - start
      state.completedTools.push({ name, startTime: start, durationMs })
      state.activeTool = null
    })
  })

  window.electron.ipcRenderer.on('agent:stream-finish', (_, payload: any) => {
    applyStreamFinishPayload(payload)
  })

  window.electron.ipcRenderer.on('agent:compression-event', (_, event: any) => {
    const sId = event?.sessionId
    if (!sId || !event?.type) return

    if (event.type === 'reasoning-delta' || event.type === 'delta') {
      updateSessionState(
        sId,
        (state) => {
          if (event.type === 'reasoning-delta') {
            state.compressionReasoning += event.chunk ?? ''
          } else {
            state.compressionText += event.chunk ?? ''
          }
        },
        { notify: false }
      )
      scheduleCompressionDeltaNotify(sId)
    } else {
      updateSessionState(sId, (state) => {
        if (event.type === 'start') {
          state.isCompressing = true
          state.compressionPhase = event.phase === 'manual' ? 'manual' : 'auto'
          state.compressionText = ''
          state.compressionReasoning = ''
          state.compressionTriggerMessageId =
            typeof event.triggerUserMessageId === 'string' ? event.triggerUserMessageId : null
        } else if (event.type === 'finish') {
          state.isCompressing = false
          if (!event.ok) {
            state.compressionText = ''
            state.compressionReasoning = ''
            state.compressionTriggerMessageId = null
          }
        }
      })
    }

    if (event.type === 'finish' && event.ok) {
      window.dispatchEvent(
        new CustomEvent('baishou:compression-finished', {
          detail: { sessionId: sId }
        })
      )
    }
  })

  window.addEventListener('baishou:compression-stream-reset', (e: Event) => {
    const detail = (e as CustomEvent<{ sessionId?: string }>).detail
    const sId = detail?.sessionId
    if (!sId) return
    updateSessionState(sId, (state) => {
      state.compressionText = ''
      state.compressionReasoning = ''
      state.compressionTriggerMessageId = null
    })
  })

  const onAgentGateAsked = (_: unknown, request: AgentGateRequest) => {
    if (!request?.sessionId) return
    updateSessionState(request.sessionId, (state) => {
      state.pendingAgentGate = request
      state.isAgentGateReplying = false
    })
  }

  const onAgentGateReplied = (_: unknown, payload: { sessionId?: string; requestId?: string }) => {
    const sId = payload?.sessionId
    if (!sId) return
    updateSessionState(sId, (state) => {
      if (state.pendingAgentGate?.id === payload.requestId) {
        state.pendingAgentGate = null
        state.isAgentGateReplying = false
      }
    })
  }

  window.api?.agentGate?.onAsked((request) => onAgentGateAsked(null, request))
  window.api?.agentGate?.onReplied((payload) => onAgentGateReplied(null, payload))
}

function scheduleCompressionDeltaNotify(sessionId: string) {
  if (compressionDeltaNotifyTimers[sessionId]) return

  compressionDeltaNotifyTimers[sessionId] = setTimeout(() => {
    compressionDeltaNotifyTimers[sessionId] = undefined
    notifySessionListeners(sessionId)
  }, COMPRESSION_DELTA_RENDER_INTERVAL_MS)
}

function updateSessionState(
  sessionId: string,
  updater: (state: SessionStreamState) => void,
  options?: { notify?: boolean }
) {
  const state = getOrCreateSessionState(sessionId)
  updater(state)
  if (options?.notify === false) {
    return
  }
  notifySessionListeners(sessionId)
}

export function useAgentStream(currentSessionId?: string): UseAgentStreamResult {
  ensureAgentStreamListenersRegistered()
  const [, setVersion] = useState(0)
  const sessionIdRef = useRef(currentSessionId)

  useEffect(() => {
    sessionIdRef.current = currentSessionId
  }, [currentSessionId])

  // 订阅当前活动会话的更新，并在其变化时强制 React 重新渲染
  useEffect(() => {
    if (!currentSessionId) return

    if (!sessionListeners[currentSessionId]) {
      sessionListeners[currentSessionId] = new Set()
    }

    const forceUpdate = () => setVersion((v) => v + 1)
    sessionListeners[currentSessionId].add(forceUpdate)

    return () => {
      if (sessionListeners[currentSessionId]) {
        sessionListeners[currentSessionId].delete(forceUpdate)
      }
    }
  }, [currentSessionId])

  const saveUserMessage = useCallback(
    async (
      sessionId: string,
      userText: string,
      attachments?: any[]
    ): Promise<{ userMessageId: string; attachments?: any[] } | { error: string }> => {
      const result = await window.electron.ipcRenderer.invoke('agent:save-user-message', {
        sessionId,
        text: userText,
        attachments
      })
      return result
    },
    []
  )

  const beginStreaming = useCallback((sessionId: string) => {
    updateSessionState(sessionId, (state) => {
      state.isStreaming = true
      state.error = null
      state.activeTool = null
      state.completedTools = []
      state.text = ''
      state.reasoning = ''
      state.activeToolStartTime = undefined
    })
  }, [])

  const startChat = useCallback(
    async (
      sessionId: string,
      userText: string,
      providerId?: string,
      modelId?: string,
      attachments?: any[],
      searchMode?: boolean,
      userMsgId?: string
    ): Promise<void> => {
      beginStreaming(sessionId)

      await window.electron.ipcRenderer.invoke('agent:chat', {
        sessionId,
        text: userText,
        providerId,
        modelId,
        attachments,
        searchMode,
        userMsgId
      })
    },
    [beginStreaming]
  )

  const editChat = useCallback(
    async (
      sessionId: string,
      messageId: string,
      userText: string,
      providerId?: string,
      modelId?: string,
      attachments?: any[],
      searchMode?: boolean
    ) => {
      beginStreaming(sessionId)

      await window.electron.ipcRenderer.invoke(
        'agent:edit-message',
        sessionId,
        messageId,
        userText,
        providerId,
        modelId,
        attachments,
        searchMode
      )
    },
    [beginStreaming]
  )

  const resendChat = useCallback(
    async (
      sessionId: string,
      messageId: string,
      searchMode?: boolean,
      providerId?: string,
      modelId?: string
    ) => {
      updateSessionState(sessionId, (state) => {
        state.isStreaming = true
        state.error = null
        state.activeTool = null
        state.completedTools = []
        state.text = ''
        state.reasoning = ''
        state.activeToolStartTime = undefined
      })

      await window.electron.ipcRenderer.invoke(
        'agent:resend',
        sessionId,
        messageId,
        searchMode,
        providerId,
        modelId
      )
    },
    []
  )

  const stopChat = useCallback(() => {
    if (typeof window !== 'undefined' && window.electron) {
      window.electron.ipcRenderer.invoke('agent:stop-stream').catch(console.error)
    }
    if (currentSessionId) {
      updateSessionState(currentSessionId, (state) => {
        state.isStreaming = false
        state.activeTool = null
      })
    }
  }, [currentSessionId])

  const replyAgentGate = useCallback(
    async (input: {
      requestId: string
      reply: AgentGateReply
      message?: string
      selectedOptionIds?: string[]
    }) => {
      if (!currentSessionId) return
      updateSessionState(currentSessionId, (state) => {
        state.isAgentGateReplying = true
      })
      try {
        await window.api.agentGate.reply(input)
        updateSessionState(currentSessionId, (state) => {
          if (state.pendingAgentGate?.id === input.requestId) {
            state.pendingAgentGate = null
          }
          state.isAgentGateReplying = false
        })
      } catch (error) {
        console.error('[useAgentStream] agent gate reply failed:', error)
        updateSessionState(currentSessionId, (state) => {
          state.isAgentGateReplying = false
        })
        throw error
      }
    },
    [currentSessionId]
  )

  const reset = useCallback(() => {
    if (!currentSessionId) return
    updateSessionState(currentSessionId, (state) => {
      state.text = ''
      state.reasoning = ''
      state.error = null
      state.isStreaming = false
      state.isCompressing = false
      state.compressionText = ''
      state.compressionReasoning = ''
      state.compressionTriggerMessageId = null
      state.activeTool = null
      state.completedTools = []
      state.activeToolStartTime = undefined
      state.pendingAgentGate = null
      state.isAgentGateReplying = false
    })
  }, [currentSessionId])

  const activeState = currentSessionId
    ? getOrCreateSessionState(currentSessionId)
    : {
        text: '',
        reasoning: '',
        isStreaming: false,
        isCompressing: false,
        compressionPhase: 'auto' as const,
        compressionText: '',
        compressionReasoning: '',
        compressionTriggerMessageId: null,
        activeTool: null,
        completedTools: [],
        error: null,
        pendingAgentGate: null,
        isAgentGateReplying: false
      }

  return {
    text: activeState.text,
    reasoning: activeState.reasoning,
    isStreaming: activeState.isStreaming,
    isCompressing: activeState.isCompressing,
    compressionPhase: activeState.compressionPhase,
    compressionText: activeState.compressionText,
    compressionReasoning: activeState.compressionReasoning,
    compressionTriggerMessageId: activeState.compressionTriggerMessageId,
    activeTool: activeState.activeTool,
    completedTools: activeState.completedTools,
    error: activeState.error,
    pendingAgentGate: activeState.pendingAgentGate,
    isAgentGateReplying: activeState.isAgentGateReplying,
    saveUserMessage,
    startChat,
    editChat,
    resendChat,
    stopChat,
    reset,
    beginStreaming,
    replyAgentGate
  }
}
