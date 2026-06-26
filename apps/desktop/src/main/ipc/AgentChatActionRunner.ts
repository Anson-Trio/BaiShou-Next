import { AgentChatActionCoreRunner } from '@baishou/ai'
import type { ActionDeps } from '@baishou/ai'
import { ElectronStreamEmitter } from './electron-stream-emitter'
import {
  getAgentManagers,
  toolRegistry,
  createDiarySearcher,
  createWebSearchResultFetcher,
  createFetchSearchPage,
  buildStreamConfig,
  resolveStreamDialogueSelection
} from './agent-helpers'
import { AgentChatService } from './AgentChatService'

function buildActionDeps(event: Electron.IpcMainInvokeEvent, sessionId: string): ActionDeps {
  const { realSessionRepo, realSnapshotRepo, sessionManager } = getAgentManagers()
  return {
    emitter: new ElectronStreamEmitter(event),
    sessionId,
    realSessionRepo,
    realSnapshotRepo,
    toolRegistry,
    diarySearcher: createDiarySearcher(),
    webSearchResultFetcher: createWebSearchResultFetcher(),
    fetchSearchPage: createFetchSearchPage(),
    sessionManager
  }
}

export class AgentChatActionRunner {
  public static async regenerate(
    event: Electron.IpcMainInvokeEvent,
    sessionId: string,
    messageId?: string,
    searchMode?: boolean,
    requestedProviderId?: string,
    requestedModelId?: string
  ) {
    const assistantContextWindow = await AgentChatService.getAssistantContextWindow(sessionId)
    const resolved = await resolveStreamDialogueSelection({
      sessionId,
      requestedProviderId,
      requestedModelId
    })
    const { provider, systemModels, userConfig } = await buildStreamConfig(
      resolved.providerId,
      resolved.modelId,
      searchMode,
      assistantContextWindow
    )

    return AgentChatActionCoreRunner.regenerate(
      buildActionDeps(event, sessionId),
      {
        provider,
        modelId: resolved.modelId,
        systemModels,
        userConfig
      },
      messageId
    )
  }

  public static async editMessage(
    event: Electron.IpcMainInvokeEvent,
    sessionId: string,
    messageId: string,
    newText: string,
    requestedProviderId?: string,
    requestedModelId?: string,
    attachments?: unknown[],
    searchMode?: boolean
  ) {
    const assistantContextWindow = await AgentChatService.getAssistantContextWindow(sessionId)
    const resolved = await resolveStreamDialogueSelection({
      sessionId,
      requestedProviderId,
      requestedModelId
    })
    const { provider, systemModels, userConfig } = await buildStreamConfig(
      resolved.providerId,
      resolved.modelId,
      searchMode,
      assistantContextWindow
    )

    return AgentChatActionCoreRunner.editMessage(
      buildActionDeps(event, sessionId),
      {
        provider,
        modelId: resolved.modelId,
        systemModels,
        userConfig,
        attachments
      },
      messageId,
      newText
    )
  }

  public static async resend(
    event: Electron.IpcMainInvokeEvent,
    sessionId: string,
    messageId: string,
    searchMode?: boolean,
    requestedProviderId?: string,
    requestedModelId?: string
  ) {
    const assistantContextWindow = await AgentChatService.getAssistantContextWindow(sessionId)
    const resolved = await resolveStreamDialogueSelection({
      sessionId,
      requestedProviderId,
      requestedModelId
    })
    const { provider, systemModels, userConfig } = await buildStreamConfig(
      resolved.providerId,
      resolved.modelId,
      searchMode,
      assistantContextWindow
    )

    return AgentChatActionCoreRunner.resend(
      buildActionDeps(event, sessionId),
      {
        provider,
        modelId: resolved.modelId,
        systemModels,
        userConfig
      },
      messageId
    )
  }
}
