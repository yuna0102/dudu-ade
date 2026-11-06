import type { RepoIconPickResult } from '../../shared/repo-icon-pick-failure-copy'
import type { ExecutionHostId } from '../../shared/execution-host'
import type { ShellPathExistence } from '../../shared/path-existence-batch'
import type {
  BoardMarkdownRead,
  BoardMarkdownWrite,
  RecentMarkdown,
  TerminalAgentModel,
  TerminalHandoff,
  TranscriptAssetRequest,
  TranscriptAssets
} from '../../shared/dudu-ade-terminal-models'
import type {
  ShellOpenExternalEditorRequest,
  ShellOpenExternalEditorResult,
  ShellOpenLocalPathResult
} from '../../shared/shell-open-types'

export type {
  ShellOpenExternalEditorRequest,
  ShellOpenExternalEditorResult,
  ShellOpenLocalPathResult
} from '../../shared/shell-open-types'

export type ShellApi = {
  /** Every OS open names the path's owner; main refuses anything not owned by this computer. */
  openPath: (path: string, ownerHostId: ExecutionHostId) => Promise<void>
  openInFileManager: (
    path: string,
    ownerHostId: ExecutionHostId
  ) => Promise<ShellOpenLocalPathResult>
  openInExternalEditor: (
    request: ShellOpenExternalEditorRequest
  ) => Promise<ShellOpenExternalEditorResult>
  openUrl: (url: string) => Promise<void>
  openFilePath: (path: string, ownerHostId: ExecutionHostId) => Promise<boolean>
  openFileUri: (uri: string, ownerHostId: ExecutionHostId) => Promise<void>
  pathsExist?: (paths: string[]) => Promise<ShellPathExistence[]>
  /** `wakeWslDistro`: a click, a user act that may start a stopped WSL distro. */
  pathExists: (path: string, options?: { wakeWslDistro?: boolean }) => Promise<boolean>
  pickAttachment: () => Promise<string | null>
  pickAttachments: () => Promise<string[]>
  pickImage: () => Promise<string | null>
  pickRepoIconImage: () => Promise<RepoIconPickResult>
  pickAudio: () => Promise<string | null>
  pickDirectory: (args: { defaultPath?: string }) => Promise<string | null>
  copyFile: (args: { srcPath: string; destPath: string }) => Promise<void>
  /** Dudu ADE desktop only: model per pane key (`tabId:leafId`) of running Claude Code sessions. */
  duduAdeTerminalAgentModels?: () => Promise<Record<string, TerminalAgentModel>>
  /** Dudu ADE desktop only: recent terminal-to-terminal sends for board arrows. */
  duduAdeTerminalHandoffs?: () => Promise<TerminalHandoff[]>
  /** Dudu ADE desktop only: a send that does not pass through terminal.send (a board message to a chat). */
  duduAdeRecordHandoff?: (from: string, to: string) => Promise<void>
  /** Dudu ADE desktop only: files and artifact links from the panes' conversation logs. */
  duduAdeTranscriptAssets?: (request: TranscriptAssetRequest) => Promise<TranscriptAssets>
  /** Dudu ADE desktop only: board artifact and Markdown cards; main decides which paths they may touch. */
  duduAdeArtifactPageUrl?: (
    path: string,
    formAllow?: { hash: string; ports: number[] }
  ) => Promise<string | null>
  /** A page's content hash and the local ports its forms post to, and whether the user's allowance still holds for it. */
  /** A preview's form post came back: saved (saved=1 from its allowed port) or failed. Returns the way to stop listening. */
  onDuduAdeFormSaved?: (
    listener: (event: { page: string; verdict: 'saved' | 'failed' }) => void
  ) => () => void
  duduAdeArtifactFormInfo?: (
    path: string,
    formAllow?: { hash: string; ports: number[] }
  ) => Promise<{ hash: string; ports: number[]; allowed: boolean } | null>
  duduAdeReadOutIndex?: () => Promise<{ outRoot: string; text: string }>
  /** A published page with the same name and content as this local copy; only a suggestion for the user to confirm. */
  duduAdeArtifactTwin?: (path: string) => Promise<{ artifactUrl: string; name: string } | null>
  /** Dudu ADE desktop only: the one-time board restore file's text; main reads one fixed path. */
  duduAdeReadBoardRestore?: () => Promise<string | null>
  duduAdeReadBoardLayout?: () => Promise<string | null>
  /** Saves the board layout text; main picks the file and keeps ten dated backups. */
  duduAdeWriteBoardLayout?: (text: string) => Promise<boolean>
  /** Dudu ADE desktop only: conversation id to role name, from the desk's own file. */
  duduAdeDeskSessionNames?: () => Promise<Record<string, string>>
  duduAdePickMarkdown?: () => Promise<string | null>
  duduAdeRecentMarkdown?: () => Promise<RecentMarkdown[]>
  duduAdeAdoptMarkdown?: (path: string) => Promise<boolean>
  duduAdeCreateMarkdown?: (name: string) => Promise<string | null>
  duduAdeReadMarkdown?: (path: string) => Promise<BoardMarkdownRead>
  duduAdeWriteMarkdown?: (args: {
    path: string
    content: string
    expectedMtime: number
  }) => Promise<BoardMarkdownWrite>
}
