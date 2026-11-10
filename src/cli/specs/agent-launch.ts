import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const AGENT_LAUNCH_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent', 'launch'],
    summary: 'Start an agent in an existing workspace, as a chat or a terminal',
    usage:
      'orca agent launch --agent <id> [--worktree <selector>] [--prompt <text>] [--model <id>] [--effort <level>] [--surface chat|terminal] [--resume <conversationId>] [--focus] [--retry-launch <operationId>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'agent',
      'worktree',
      'prompt',
      'model',
      'effort',
      'surface',
      'resume',
      'focus',
      'retry-launch'
    ],
    notes: [
      'Starts the agent the way a new agent tab does: as a chat when your Chat | CLI choice for the agent is Chat and the agent and host support it, otherwise as a terminal. The result says which (`outcome.kind`) and why (`receipt.detail`).',
      '--surface chat|terminal picks for this launch instead of your setting. --surface terminal always runs the agent CLI; --surface chat is refused when Orca can establish before starting anything that this agent cannot open as a chat there. If support cannot be checked, the launch can fall back to a terminal. If chat becomes unavailable after creating a workspace, Orca keeps the workspace, setup and default tabs, then opens a terminal; the receipt explains the fallback.',
      '--resume <conversationId> with --surface chat opens that existing conversation as a chat with its history. It is refused, never opened as a terminal, when the conversation is running in a terminal or already open in a chat.',
      '--worktree defaults to the native folder workspace or worktree containing the current directory. For a new checkout with its agent, use `orca worktree create --agent`.',
      '--model takes a provider model id and --effort a reasoning effort for that model; --effort requires --model. They apply to either surface.',
      'The tab opens without switching focus; pass --focus to switch to it.',
      'If the launch reply is lost, re-issue the same command from the same directory on the same host with --retry-launch <operationId> from the error. Never retry as a fresh launch; older hosts require inspecting the workspace first.'
    ],
    examples: [
      'orca agent launch --agent codex --json',
      'orca agent launch --agent codex --model gpt-6-astra --effort high --prompt "Write the design doc" --json',
      'orca agent launch --agent claude --worktree path:/projects/myapp --focus',
      'orca agent launch --agent claude --worktree path:/projects/myapp --surface chat --resume 2991ceba-4aef-4f58-a390-08db31bc71eb'
    ]
  },
  {
    path: ['chat', 'send'],
    summary: 'Send a message to an open chat session',
    usage: 'orca chat send --session <sessionId> --text <text> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'session', 'text'],
    notes: [
      'A chat cannot be reached with `orca terminal send`. A message sent while it is working waits as its next message.',
      '`orca agent launch --json` reports the sessionId as outcome.sessionId.'
    ],
    examples: ['orca chat send --session claude_1 --text "Review the draft"']
  }
]
