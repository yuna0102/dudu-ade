# Dudu ADE 보드 업그레이드 재개 메모 (1103)

브랜치 `dudu-ade`, 이전 작업 커밋 68f2e7d6 위에 이어서 작업했습니다. 타입체크(`pnpm tc`)와 관련 단위 테스트(36개 파일, 200개)는 통과한 상태로 커밋했습니다.

## 1. 요청 항목별 상태

| 항목                                                                                                                       | 상태                  | 비고                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 카테고리(프레임, 만들기, 이름과 색 변경, 접기, 끌어 넣기와 빼기, 카테고리별 정렬)                                          | 완료                  | 자동 분류는 탭 이름(customTitle), 없으면 워크스페이스 이름                                                                                       |
| 사용자 수정 저장 및 복원                                                                                                   | 완료                  | localStorage `dudu-ade:boards:v2`                                                                                                                |
| 카드 상태 표시(작업 중, 확인 필요, 대기)                                                                                   | 완료                  | AgentStateDot 재사용, 탭 단위 상태                                                                                                               |
| 현황판 겸 미니맵                                                                                                           | 완료                  | 오른쪽 아래, 항목 누르면 카드로 이동 및 강조, 미니맵 누르면 그 위치로 이동                                                                       |
| 보드 탭(여러 보드 저장, 전환, 이름 변경, 삭제)                                                                             | 완료                  | 첫 보드만 모든 터미널 자동 추가, 새 보드는 빈 보드(추가 메뉴로 터미널 올림)                                                                      |
| 레이아웃 프리셋(격자, 카테고리별 열, 한 줄)                                                                                | 완료                  | 카테고리 묶음을 유지한 채 배치                                                                                                                   |
| 메모류 카드(스티커, 텍스트, 체크리스트, 칸반)                                                                              | 완료                  |                                                                                                                                                  |
| 웹 타일                                                                                                                    | 완료(실행 확인 안 함) | sandbox iframe, Orca 브라우저 창 재사용은 안 함                                                                                                  |
| Git 카드                                                                                                                   | 완료(실행 확인 안 함) | window.api.git.status 15초마다                                                                                                                   |
| 자산 독(항상 보드 오른쪽, 접기, 너비 조절, 썸네일, 필터, 검색, 새 배지, 핀, 크게 보기, 보드로 끌어 놓기, 출처 카드로 이동) | 완료                  | 기존 "자산" 전용 화면 유지                                                                                                                       |
| 크게 보기에서 PDF                                                                                                          | 완료                  | 기존 PdfViewer 지연 로드                                                                                                                         |
| 터미널별 모델 뱃지(Opus, Sonnet, Haiku, Fable 색 구분, effort)                                                             | 완료                  | 카드 머리줄, 현황판, 카테고리 헤더 분포                                                                                                          |
| 사이드바 터미널 행 모델 뱃지                                                                                               | 안 함                 | 다음 할 일                                                                                                                                       |
| 잉크/마크업, 코드 노드, 다이어그램, 팀/핸드오프                                                                            | 안 함                 |                                                                                                                                                  |
| 앱 빌드와 서명                                                                                                             | 완료                  | `dist/mac-arm64/Dudu ADE.app`(ad-hoc 서명, 검증 통과), 서명한 앱으로 `dist/dudu-ade-macos-arm64.dmg` 재생성. 설치는 헤드가 사용자와 정한 뒤 진행 |

## 2. 모델 뱃지 동작 방식

- 방법 1(훅 데이터의 model): Orca 에 필드는 있으나 Dudu ADE 는 훅 쓰기를 막아 두어 훅 데이터가 들어오지 않으므로 쓰지 않았습니다.
- 방법 2(사용): 메인 프로세스 `src/main/dudu-ade/terminal-agent-models.ts` 가 `ps -axww` 로 claude 프로세스를 찾고, `ps eww` 로 그 프로세스의 `ORCA_PANE_KEY`(탭id:리프id), `CLAUDE_CONFIG_DIR` 를 읽습니다. `<설정 폴더>/sessions/<pid>.json` 에서 sessionId, cwd 를 얻고 `<설정 폴더>/projects/<cwd 의 영숫자 외 문자를 - 로>/<sessionId>.jsonl` 끝 256KB 만 읽어 마지막 assistant 줄의 `"model"` 값만 정규식으로 뽑습니다. 대화 내용은 파싱하거나 보관하지 않습니다. 수정 시각과 크기가 같으면 다시 읽지 않습니다. 렌더러가 5초마다 IPC `duduAde:terminalAgentModels` 로 묻습니다.
- 방법 3: effort 는 실행 인자 `--effort <값>` 에서만 읽습니다(턴마다 바뀌는 effort 는 반영 안 됨).
- 한계: node 로 실행한 claude, 공백이 든 CLAUDE_CONFIG_DIR, 200자 넘는 cwd(폴더 이름 잘림), Windows 는 지원 안 함. 실제 앱에서 뱃지가 뜨는지는 실행 테스트를 못 해 확인 전입니다(수동으로 Figma 창 pid 의 경로를 따라가 claude-opus-5-5 를 읽는 것만 확인).

## 3. 바꾼 파일과 설계 결정

- 저장 구조: v1(`dudu-ade:board:v1`, 보드 1개)을 v2(`dudu-ade:boards:v2`, 보드 여러 개)로 처음 실행 때 자동 이전합니다. v1 키는 지우지 않아 이전 빌드로 돌아가도 기존 보드가 남습니다. 이전 직후 한 번 카테고리별로 자동 배치합니다(arrangePending).
- 카드는 `cards: Record<키, 위치>` 하나로 통일했습니다. 키는 터미널(작업공간::탭::리프), `asset:<id>`, `note:<id>`.
- 카테고리 프레임 영역은 멤버 카드의 외곽에서 계산하고, 비어 있으면 anchor 위치에 표시합니다. 카드 머리줄을 끌어 놓은 지점이 들어간 프레임(가장 작은 것)에 소속되고, 어느 프레임 밖이면 미분류(null)가 됩니다. null 은 자동 분류가 다시 넣지 않습니다.
- 주요 파일(모두 `src/renderer/src/components/dudu-ade/`): board-layout-state.ts(형태, 배치 계산), board-sync.ts(자동 분류와 배치), board-workspaces-storage.ts(저장, 이전), dudu-ade-store.ts 와 dudu-ade-store-types.ts, InfiniteBoard.tsx, use-board-view-model.ts, BoardToolbar.tsx, BoardWorkspaceTabs.tsx, BoardCategoryFrame.tsx, BoardMissionMap.tsx, BoardNoteCard.tsx, BoardAgentBadges.tsx, board-agent-labels.ts, AssetDock.tsx, AssetLightbox.tsx
- 그 밖: `src/main/dudu-ade/terminal-agent-models.ts`, `src/shared/dudu-ade-terminal-models.ts`, preload `shell-bridge.ts`, `shell-api.ts`(선택 필드 duduAdeTerminalAgentModels), `register-core-handlers.ts`(+테스트 목)

## 4. 다음에 할 일(순서)

1. (완료) 빌드, 서명, DMG 재생성
2. 사이드바 터미널 행에 모델 뱃지(가능하면)
3. 헤드에게 보고: 설치 시 보드 저장 데이터 자동 이전, 실행 확인 못 한 항목(웹 타일 iframe, Git 카드, 모델 뱃지, PDF 크게 보기)
4. 시간이 남으면 잉크/마크업, 코드 노드, 다이어그램

## 5. 알려진 문제

- 카테고리가 커지면 프레임끼리 겹칠 수 있습니다. 레이아웃 프리셋으로 다시 정리합니다.
- 상태는 탭 단위입니다. 한 탭에 창이 여러 개면(Loopit 데스크 6칸) 같은 상태가 표시됩니다.
- 현황판은 보드에 올라온 터미널만 보여 줍니다.
- 웹 타일은 localhost 페이지가 iframe 을 막으면(X-Frame-Options) 비어 보입니다. claude.ai 링크는 앱 안에서 표시할 수 없어 브라우저로 엽니다.
- `pnpm lint` 전체 게이트(현지화 카탈로그 등)는 돌리지 않았고 oxlint 만 통과시켰습니다.

## 6. 빌드와 서명

```
export PATH=~/projects/_tools/dudu-ade-bin:$(brew --prefix node@24)/bin:$PATH ORCA_PNPM_GLOBAL_VIRTUAL_STORE=0 CSC_IDENTITY_AUTO_DISCOVERY=false
cd ~/projects/_tools/orca && pnpm tc
node config/scripts/run-vitest.mjs run --config config/vitest.config.ts src/renderer/src/components/dudu-ade src/main/dudu-ade src/main/ipc/register-core-handlers src/preload
pnpm build:mac
codesign --force --deep --sign - --entitlements resources/build/entitlements.mac.plist "dist/mac-arm64/Dudu ADE.app"
# DMG 를 다시 만들 때: hdiutil create -volname "Dudu ADE" -srcfolder "dist/mac-arm64/Dudu ADE.app" -ov -format UDZO dist/dudu-ade-macos-arm64.dmg
```

## 7. 지켜야 할 규칙

- `/Applications/Dudu ADE.app`, `/Applications/Orca.app` 과 두 앱의 데이터 폴더는 읽기만 합니다. 끄거나 실행하거나 설치하지 않습니다(설치하면 사용자의 에이전트 창이 꺼짐). 빌드한 앱 실행 테스트도 하지 않습니다.
- `~/.claude-yuna` 는 열거나 읽지 않습니다(앱 코드가 CLAUDE_CONFIG_DIR 을 따르는 것은 괜찮지만 그 폴더로 시험하지 않음).
- push 하지 않습니다. 커밋은 `git commit --no-verify`.
- 화면 문구는 한국어, 엠대시와 가운뎃점 금지, "손님" 금지.
- 디스크 여유 10GB 아래로 떨어질 것 같으면 멈추고 보고합니다.

## 7. 1104 보드 추가 작업 (빌드, 설치, 커밋 전)

| 항목                      | 상태                  | 비고                                                                                                                                                                                                                                                                                                                    |
| ------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 카드 가장자리 크기 조절   | 완료                  | 아래 가장자리(세로만), 오른쪽 가장자리(가로만), 모서리(둘 다). 손잡이 두께는 줌에 반비례(최소 8px, 모서리 16px). 최대 크기 제한 없음                                                                                                                                                                                    |
| 카드 연결선               | 완료                  | 카드 오른쪽 보라 점을 다른 카드로 끌어 화살표 생성, 선 클릭으로 선택(이름 입력, 삭제 버튼, Delete 키, Esc 해제). 보드별 `links` 필드, 예전 저장 데이터는 읽을 때 빈 배열                                                                                                                                                |
| 터미널 간 전송 애니메이션 | 완료(실행 확인 안 함) | CLI `terminal send` 가 `ORCA_TERMINAL_HANDLE` 을 `fromTerminal` 로 실어 보내고, 메인이 30초 동안 메모리에 보관(`main/dudu-ade/terminal-handoffs.ts`), 보드가 1초마다 IPC `duduAde:terminalHandoffs` 로 읽어 4초 동안 표시. 연결선이 있으면 그 선에 흐르는 점선과 점, 없으면 회색 임시 점선                              |
| 산출물 칩                 | 완료(실행 확인 안 함) | 자산의 출처 터미널 카드 오른쪽 바깥에 최근 5개 칩, 나머지는 +N(누르면 자산 독). 누르면 크게 보기, 끌어서 보드에 놓으면 일반 자산 카드. 저장 필드 없음(자산 카드가 있으면 칩에서 빠지는 방식)                                                                                                                            |
| 채팅 세션 카드            | 완료(실행 확인 안 함) | `unifiedTabsByWorktree` 의 agent-session 탭을 카드로(키 `작업공간::탭::chat`). 본문은 `agentSession.conversationOutline` 으로 최근 4턴 글 미리보기(5초마다), 상태와 모델은 로컬 채팅 상태 피드. "채팅 UI에서 계속하기" 로 터미널이 닫히면 `cli-chat-resume-run.ts` 에서 카드 키를 이어 붙여 위치, 카테고리, 연결선 유지 |
| 카드 안 클릭 정확도       | 완료(실행 확인 안 함) | 원인: xterm 이 축소된 화면 크기를 축소 전 셀 크기로 나눠 셀을 계산. 카드 본문에서 마우스 이벤트를 실제 크기 좌표로 다시 보냄(`use-unscaled-terminal-mouse.ts`)                                                                                                                                                          |

한계

- 카드를 끄는 도중에는 연결선과 칩이 따라오지 않고 놓은 뒤 붙습니다(드래그 중 위치가 카드 안에만 있음).
- 터미널 미리보기는 실제 창의 줄 수만큼만 그립니다. 카드를 실제 창보다 길게 늘리면 아래가 빈 공간이 됩니다(실제 창 크기를 바꾸지 않는 설계).
- 전송 애니메이션은 Dudu ADE 터미널 안에서 직접 `orca terminal send` 를 쓸 때만 보입니다. desk.py 는 ORCA_* 값을 지우고 CLI 를 부르므로 보낸 쪽을 알 수 없습니다. SendMessage(Claude 세션끼리)는 이 경로를 타지 않습니다.
- 채팅 카드는 이 컴퓨터의 채팅만 보입니다. 카드 본문은 읽기 전용 글 미리보기이고 실제 채팅 화면(NativeChatView)은 쓰지 않았습니다(같은 세션을 두 곳에 띄우면 입력창, 초안, 시각 자료 소유권이 겹침).
- 드래그 선택은 보정하지 않아 줌 상태에서 선택 범위가 조금 어긋날 수 있습니다.
- lint-staged 의 추가 oxlint 설정(js-plugins, react-doctor)과 ast-grep 은 돌리지 않았습니다.

## 8. 1105 보드 추가 작업 6~17 (빌드, 설치, 커밋 전)

- 17 원인: 실제 창의 크기 변경(`pty:resize`, `onExternalPtyResize`)은 크기 변경 알림을 보내지 않아 미리보기가 옛 열 수로 새 화면을 그렸습니다. `main/ipc/terminal-preview.ts` 에서 데이터가 올 때마다 PTY 크기를 비교해 다르면 재동기화합니다.
- 6: 사용자가 크기를 바꾼 카드만 `fitPty`, 손을 뗄 때만 PTY 크기를 가져옵니다(`gridClaimToken`). 크기를 가진 동안에는 뷰어 소유라 실제 창은 PTY 크기를 바꾸지 못합니다.
- 7: `BoardSurfaceToggle.tsx`, 채팅에서 터미널은 기존 포크라 채팅 탭이 남습니다(보드에서는 숨김).
- 8, 9, 10: 카드 본문은 잠김과 포커스 두 상태, `use-board-terminal-focus.ts`, `board-terminal-focus.ts`.
- 11: `terminalFontSize` 앱 전체 설정에 저장, 포커스된 터미널 카드에서만.
- 12: `BoardAssetPanel.tsx`, `board-asset-panels.ts`, 저장 필드 `assetPanels`. 3번 칩은 제거했습니다.
- 13: 카테고리에 `rect` 추가. `use-board-tools.ts`, `board-areas.ts`. 상자 선택은 Shift+드래그(일반 드래그는 팬 유지), 중첩 미지원.
- 14: `board-auto-layout.ts`, `use-board-auto-layout.ts`. 저장 필드 `autoPush`, 카드 `pinned`.
- 15: `BoardCardLabel.tsx`, `board-card-label.ts`.
- 16: 연결선은 값 전달이 아니라 두 창의 상호작용 규칙입니다. `BoardLinkEditor.tsx`, `board-link-send.ts`, `use-board-link-rules.ts`. 링크 필드 rule, twoWay, trigger, appliedFingerprint. 적용은 양쪽 창에 안내 메시지를 보내고, 작업이 끝날 때 트리거는 보내는 쪽에 한 줄 알림을 넣습니다(안내 때문에 끝난 작업은 세지 않음, 쿨다운 60초). 특정 문구 트리거는 미구현.
- 실행 확인은 하나도 하지 못했습니다.
- 8 추가: 보드가 뒤의 작업 화면을 덮기만 해서 뒤 터미널이 포커스를 유지했고 붙여넣기와 키 입력이 그쪽으로 갔습니다. `use-board-focus-guard.ts` 가 보드가 열린 동안 뒤 입력칸의 포커스를 뺍니다.
- 17 추가: 재동기화는 목표 크기당 한 번만 합니다. 스냅샷이 그 크기에 못 미쳐도 쓰기마다 재동기화가 반복되지 않습니다.
- 18: 여러 카드 선택과 함께 이동. `board-selection.ts`, `use-board-tools.ts`, `use-board-tool-keys.ts`. 도구에 이동(H) 추가, 선택 도구의 빈 곳 드래그는 상자 선택, Space 또는 H 로 팬. 실행 확인 안 함.
- 19: 휠 팬. deltaMode 를 픽셀로 환산, Shift 는 좌우, 메모와 자산 본문, 자산 패널은 실제로 스크롤할 곳이 있을 때만 휠을 받습니다. 포커스된 터미널은 휠을 계속 받습니다.
- 20: rows 상한 1000, 미리보기 격자 상한을 뷰포트 상수로 통일(rows 200 제한 제거). 보드 카드만 재생 5000줄, 보관 20000줄. 실제 창은 설정의 스크롤백을 따릅니다.
- 21: 아티팩트, MD 문서 카드. 메모 종류 artifact, markdown 으로 추가해 선택, 이동, 연결선, 영역, 핀이 그대로 적용됩니다. 경로 검증은 메인(`main/dudu-ade/board-markdown.ts`, `board-markdown-paths.ts`). 실행 확인 안 함.
- 22: 채팅 전환이 탭 전체를 닫던 문제 수정. 탭에 다른 창이 있으면 `terminal.close` 로 원본 창 하나만 닫습니다(`cli-chat-resume-close-terminal.ts`). 다른 작업이 도는 창이면 닫지 않고 안내합니다. 채팅 카드는 읽기 실패 시 "불러오는 중"에 머물지 않습니다.
- 23: 창 이름으로 카드 이어받기(`board-identity.ts`), 복원 시드(`board-restore.ts`, 메인 `board-restore.ts`), 배치 저장과 되돌리기(`board-layout-seed.ts`, `use-board-layout-files.ts`, 메인 `board-layout-file.ts`). 저장 필드 names, seenAt, restoredFrom, restoredProgress, 카드 placed. 실행 확인 안 함.
- 24: 레이아웃 파일 version 2(windows 포함), 자동 저장(`board-layout-autosave.ts`), 이름 기반 규칙 판단(`board-link-rule.ts`), 역할 이름은 desk.json 의 대화번호 기준(`main/dudu-ade/desk-session-names.ts`), 변환기 `scripts/dudu-ade/board-to-layout.mjs`. 저장 폴더 격리: 설치 앱만 실제 폴더를 쓰고 개발과 e2e 는 userData 안을 씁니다. 자동 동기화가 오래된 보드로 복원을 덮던 경합도 수정.

## 9. 진행 현황 (1106 기준)

| 구분                                                                         | 상태                                                  |
| ---------------------------------------------------------------------------- | ----------------------------------------------------- |
| 보드 기본(무한 캔버스, 카드, 영역, 연결선, 메모, 자산 패널)                  | 구현, 설치 앱에서 사용 중                             |
| 채팅 카드 실제 대화, 터미널/채팅 전환, 창 이름 기준 복원, 레이아웃 자동 저장 | 구현, 커밋 d18b359a 까지                              |
| HTML 미리보기 보안(sandbox, 폼 저장 허용, 내용 해시 고정), UTF-8             | 구현, 최신 빌드 반영                                  |
| 영역 색상과 이름 편집, 대기 창 알림 아이콘                                   | 구현, 최신 빌드 반영(알림 아이콘은 설치 후 확인)      |
| 최신 빌드(d18b359a) 실제 설치 확인                                           | 미완료(사용자 설치 대기)                              |
| 삭제된 아티팩트 링크는 로컬 파일로 열기                                      | 미구현(앱 기획 요청, INDEX.md 의 삭제 표시 기준 제안) |
| 오픈소스 공개 준비(맥 전용 경로 정리)                                        | 계획 없음                                             |

설치 후 확인 목록: 모든 창 카드 표시, 폼 저장 허용 흐름, 알림 아이콘, 영역 색상, 한글 표시, 채팅 카드 유지.
