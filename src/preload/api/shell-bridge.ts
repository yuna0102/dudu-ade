import type { RepoIconPickResult } from '../../shared/repo-icon-pick-failure-copy'
import { ipcRenderer } from 'electron'
import type {
  ShellOpenExternalEditorRequest,
  ShellOpenExternalEditorResult,
  ShellOpenLocalPathResult
} from '../../shared/shell-open-types'
import type { ExecutionHostId } from '../../shared/execution-host'
import type { ShellPathExistence } from '../../shared/path-existence-batch'
import type { PreloadApi } from '../api-types'
import type {
  BoardMarkdownRead,
  BoardMarkdownWrite,
  RecentMarkdown,
  TerminalAgentModel,
  TerminalHandoff,
  TranscriptAssetRequest,
  TranscriptAssets
} from '../../shared/dudu-ade-terminal-models'

export const shellApi = {
  openPath: (path: string, ownerHostId: ExecutionHostId): Promise<void> =>
    ipcRenderer.invoke('shell:openPath', path, ownerHostId),

  openInFileManager: (
    path: string,
    ownerHostId: ExecutionHostId
  ): Promise<ShellOpenLocalPathResult> =>
    ipcRenderer.invoke('shell:openInFileManager', path, ownerHostId),

  openInExternalEditor: (
    request: ShellOpenExternalEditorRequest
  ): Promise<ShellOpenExternalEditorResult> =>
    ipcRenderer.invoke('shell:openInExternalEditor', request),

  openUrl: (url: string): Promise<void> => ipcRenderer.invoke('shell:openUrl', url),

  openFilePath: (path: string, ownerHostId: ExecutionHostId): Promise<boolean> =>
    ipcRenderer.invoke('shell:openFilePath', path, ownerHostId),

  openFileUri: (uri: string, ownerHostId: ExecutionHostId): Promise<void> =>
    ipcRenderer.invoke('shell:openFileUri', uri, ownerHostId),

  pathsExist: (paths: string[]): Promise<ShellPathExistence[]> =>
    ipcRenderer.invoke('shell:pathsExist', paths),
  pathExists: (path: string, options?: { wakeWslDistro?: boolean }): Promise<boolean> =>
    ipcRenderer.invoke('shell:pathExists', path, options),

  pickAttachment: (): Promise<string | null> => ipcRenderer.invoke('shell:pickAttachment'),

  pickAttachments: (): Promise<string[]> => ipcRenderer.invoke('shell:pickAttachments'),

  pickImage: (): Promise<string | null> => ipcRenderer.invoke('shell:pickImage'),

  pickRepoIconImage: (): Promise<RepoIconPickResult> =>
    ipcRenderer.invoke('shell:pickRepoIconImage'),

  pickAudio: (): Promise<string | null> => ipcRenderer.invoke('shell:pickAudio'),

  pickDirectory: (args: { defaultPath?: string }): Promise<string | null> =>
    ipcRenderer.invoke('shell:pickDirectory', args),

  copyFile: (args: { srcPath: string; destPath: string }): Promise<void> =>
    ipcRenderer.invoke('shell:copyFile', args),

  duduAdeTerminalAgentModels: (): Promise<Record<string, TerminalAgentModel>> =>
    ipcRenderer.invoke('duduAde:terminalAgentModels'),

  duduAdeTerminalHandoffs: (): Promise<TerminalHandoff[]> =>
    ipcRenderer.invoke('duduAde:terminalHandoffs'),

  duduAdeRecordHandoff: (from: string, to: string): Promise<void> =>
    ipcRenderer.invoke('duduAde:recordHandoff', from, to),

  duduAdeTranscriptAssets: (request: TranscriptAssetRequest): Promise<TranscriptAssets> =>
    ipcRenderer.invoke('duduAde:transcriptAssets', request),

  duduAdeArtifactPageUrl: (
    path: string,
    formAllow?: { hash: string; ports: number[] }
  ): Promise<string | null> => ipcRenderer.invoke('duduAde:artifactPageUrl', path, formAllow),

  onDuduAdeFormSaved: (
    listener: (event: { page: string; verdict: 'saved' | 'failed' }) => void
  ): (() => void) => {
    const handler = (
      _event: unknown,
      payload: { page: string; verdict: 'saved' | 'failed' }
    ): void => listener(payload)
    ipcRenderer.on('duduAde:formSaved', handler)
    return () => ipcRenderer.removeListener('duduAde:formSaved', handler)
  },

  duduAdeArtifactFormInfo: (
    path: string,
    formAllow?: { hash: string; ports: number[] }
  ): Promise<{ hash: string; ports: number[]; allowed: boolean } | null> =>
    ipcRenderer.invoke('duduAde:artifactFormInfo', path, formAllow),

  duduAdeArtifactTwin: (path: string): Promise<{ artifactUrl: string; name: string } | null> =>
    ipcRenderer.invoke('duduAde:artifactTwin', path),

  duduAdeReadOutIndex: (): Promise<{ outRoot: string; text: string }> =>
    ipcRenderer.invoke('duduAde:readOutIndex'),

  duduAdeReadBoardRestore: (): Promise<string | null> =>
    ipcRenderer.invoke('duduAde:readBoardRestore'),

  duduAdeReadBoardLayout: (): Promise<string | null> =>
    ipcRenderer.invoke('duduAde:readBoardLayout'),

  duduAdeWriteBoardLayout: (text: string): Promise<boolean> =>
    ipcRenderer.invoke('duduAde:writeBoardLayout', text),

  duduAdeDeskSessionNames: (): Promise<Record<string, string>> =>
    ipcRenderer.invoke('duduAde:deskSessionNames'),

  duduAdePickMarkdown: (): Promise<string | null> => ipcRenderer.invoke('duduAde:pickMarkdown'),

  duduAdeRecentMarkdown: (): Promise<RecentMarkdown[]> =>
    ipcRenderer.invoke('duduAde:recentMarkdown'),

  duduAdeAdoptMarkdown: (path: string): Promise<boolean> =>
    ipcRenderer.invoke('duduAde:adoptMarkdown', path),

  duduAdeCreateMarkdown: (name: string): Promise<string | null> =>
    ipcRenderer.invoke('duduAde:createMarkdown', name),

  duduAdeReadMarkdown: (path: string): Promise<BoardMarkdownRead> =>
    ipcRenderer.invoke('duduAde:readMarkdown', path),

  duduAdeWriteMarkdown: (args: {
    path: string
    content: string
    expectedMtime: number
  }): Promise<BoardMarkdownWrite> => ipcRenderer.invoke('duduAde:writeMarkdown', args)
} satisfies PreloadApi['shell']
