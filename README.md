# IdeaTrail

AI 引導式的專案發想系統。不是直接請 LLM「幫我想 10 個題目」，而是先判斷「這個團隊現在適合用哪種方式思考」，再用對應的引導流程，一步步把模糊的意圖收斂成具體的專案方向——並完整記錄這個點子是怎麼被想出來的。

## 為什麼做這個

團隊在啟動新專案（畢專、Side Project、黑客松）時，最常卡住的不是「技術做不出來」，而是「根本不知道要做什麼」。直接問 ChatGPT 只會拿到同質化的答案；憑感覺套用某個發想法，又不知道自己的情況適不適合。

IdeaTrail 把「怎麼想專案」本身做成系統。一場發想分四步：

1. **開始設定**：團隊條件與額度來源。已經有痛點的團隊在這裡寫下來，直接跳到第 3 步
2. **痛點發想**：還沒有痛點的團隊，用幾個具體的回想問題（一天裡的某個時刻、土法煉鋼的做法、等待、重複的事）把困擾挖出來，整理進痛點庫
3. **專案發想**：從痛點庫挑一個痛點，選一種發想方法把它變成專案想法
4. **專案收斂**：從想法庫挑一個想法，一頁一頁收斂成「要不要做、先做什麼」：
   1. **選題**：從想法庫帶過來，或在這裡換
   2. **需求分析**：正方 agent 論證需求是真的、反方 agent 找它不成立的地方，最後由使用者判定。兩種模式可以混著用：**對話**一人一句（60 字內）、像聊天一樣快速交鋒，使用者也可以選正方或反方加入，送出一句話後由對面的 agent 回應；**分析**每輪各寫一段完整論述加重點。每按一次雙方各發言一次，可以指定要聚焦的方向
   3. **MVP 範圍**：agent 先列候選功能，使用者新增、刪除，再拖進 MoSCoW 四格（Must / Should / Could / Won't）
   4. **效益 × 成本**：agent 估每個功能的效益與成本當作起始位置，使用者在矩陣上拖動調整；Must 特別標示，成本再高也不會被排除，優先順序清單裡自成一組
   5. **競品搜尋**：依定好的功能搜 GitHub（直接打 GitHub API，任何 provider 都能用；設 `GITHUB_TOKEN` 可放寬額度）與網路（只有 `anthropic` provider），比對哪些功能別人已經做了。放在功能確定之後，因為「有沒有人做過」要先知道「這個」是哪些功能才答得出來
   6. **可行性**：agent 綜合前面每一頁評估技術可行性與投入效益，使用者做最後決定（開始做／調整方向／先放下）

   每一頁 agent 只給理由，判斷（需求成不成立、功能放哪一格、矩陣位置、做不做）都是使用者的，兩邊分開存

另外有兩個跨場次的資料庫，都可以切換「關聯圖」和「表格」兩種檢視：

- **痛點庫**：所有找到或寫下的痛點。關聯圖依來源結構連線（同一輪痛點發想、同一場、有想法整合了兩者），點的大小是用它發想出的想法數；表格列出對象、情境、現在怎麼應付、來源與想法數
- **想法庫**：所有想法。關聯圖依來源結構連線（整合自、同一輪、同一個痛點），點的大小是使用者設定的專案規模；表格列出每個想法的來源痛點、方法與規模

兩張關聯圖都可以切換成 AI 判斷的語意關聯（按下才分析，結果會存起來）。

- **Method Selector**：分析團隊條件（人數、時間、技術背景、是否已有明確問題），推薦最適合的發想方法並說明理由，而不是要求使用者自己先懂各種框架
- **Framework Agent**：每種發想法（SCAMPER、痛點導向、逆向思考、類比法、使用者旅程……）都是一套多階段的提問流程，不是換一句 Prompt
- **Idea Synthesizer**：跨方法比對、去重、組合多個候選想法，產生新的候選方向
- **可追溯的歷程**：記錄用了哪個方法、問了哪些問題、想法如何演化——這個過程本身就是可展示、可驗證的成果

## 系統架構

```
frontend/   React 19 + Vite + TailwindCSS 4 的工作台（Workspace）介面
backend/    FastAPI + SQLAlchemy，管理 Agent 流程狀態、儲存發想歷程
```

### Agents（`backend/app/agents`）

- `method_selector.py` — 根據使用者輸入推薦發想方法
- `synthesizer.py` — 整合多個 Framework Agent 的產出
- `linker.py` — 判斷痛點庫、想法庫裡哪些項目內容相關（關聯圖的「AI 語意」連線）
- `convergence.py` — 專案收斂各頁的 agent：正反方辯論、功能發想、效益／成本估計、競品比對、可行性評估
- `framework/` — 各發想法的獨立引導流程：SCAMPER、Pain Point、Reverse Thinking、Analogy（Mash-up）、User Journey、How Might We、Random Input、Crazy 8s、Capability Mapping，以及多人接龍（`mode = "relay"`，見下方）。痛點發想（`pain_discovery.py`，`stage = "discovery"`）也走同一套步驟機制，但不會被推薦成發想方法，產出的是痛點而不是想法

### LLM Providers（`backend/app/providers`）

三條路線，同一個介面。差別是額度從哪裡來，以及要等多久：

| provider | 額度來源 | 速度 |
| --- | --- | --- |
| `anthropic` | `ANTHROPIC_API_KEY`（實際計費） | 快，通常幾秒 |
| `claude` | 本機 Claude Code CLI（Claude Pro/Max 訂閱） | 慢，通常 10~60 秒 |
| `codex` | 本機 Codex CLI（ChatGPT Plus/Pro 訂閱） | 慢，通常數十秒 |

兩個 CLI provider 慢**不是模型慢**，而是 CLI 本身是 agent harness：它會在你的 prompt
外面再包自己的系統提示與內部迭代，為了一段幾百 token 的答案產生數千個 token，而延遲
幾乎完全等於輸出 token 數。實測同一個 prompt，CLI 路線的 output token 是 API 路線的
3~10 倍。方法選擇頁會在這兩張卡片上標「較慢」並說明原因。

CLI provider 使用前請確認對應 CLI 已在本機登入（`claude auth status` /
`codex login status`）；`anthropic` provider 需要後端環境裡有 `ANTHROPIC_API_KEY`：

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

`anthropic` provider 的模型清單是 `claude-opus-5`／`claude-sonnet-5`／
`claude-haiku-4-5`，預設 `claude-opus-5`。因為這是發想系統、模型的思考深度會直接影響
產出品質，所以三條路線都**保留 extended thinking**——Opus/Sonnet 走 adaptive thinking，
Haiku 4.5 走舊的固定 budget 形式。

三者都可以再挑模型，而且**一個 provider 有兩個模型選項**，因為兩種呼叫的難度差一個量級：

- **深度推理／推薦**：Method Selector、每次 Method Run 的彙整、想法整合。這是團隊真正帶走的東西。
- **引導步驟**：每一步的切題性檢查加一兩個想法片段，一次 Run 會跑六次以上。

`anthropic` 預設是 Opus 5 跑深度推理、Sonnet 5 跑步驟。兩個 CLI provider 兩邊都維持原本的預設
（`claude` 是 sonnet）：往下降一階看起來理所當然，但實測 haiku 透過 CLI 反而**更慢**，
因為 harness 開銷佔了大頭、不會隨模型變小。想覆寫的話下拉選單兩邊都能各自選。
選到的組合會寫進 `MethodRun.model` 與 `MethodRun.step_model`，整輪 Run 固定不變。

### 串流

四個會讓人等的呼叫（推薦方法、回答步驟、彙整、整合想法）都有一個 `/stream` 版本，
用 SSE 把模型的推理邊產生邊送出來。對發想系統來說那段推理本身就是值得讀的內容，
不只是進度條，所以 `anthropic` provider 的請求刻意帶 `display: "summarized"`。

同一份邏輯只寫一次：每個端點的工作是一個 async generator，
plain POST 把它抽乾成 JSON、`/stream` 把它轉成 SSE，兩邊不可能走鐘。
不支援串流的 provider（兩個 CLI）走同一個端點也能用，只會送出單一個 `result` 事件，
前端不需要知道自己接的是哪一種。

一個要注意的邊界：驗證（stale step_index、找不到 run）在串流開始前就做完，所以還是
真正的 409／404；但第一個 byte 送出去之後狀態碼已經定了，後面才失敗只能變成一個
`error` 事件包在 200 裡面，前端把它當致命錯誤處理。

### 呼叫紀錄

`llm_calls` 除了 `duration_ms` 另外記 `api_duration_ms`、`input_tokens`、
`output_tokens`、`thinking_tokens`。這幾欄不是裝飾：**這幾條路線的延遲幾乎完全等於
output token 數**，少了它們，log 只能記錄某一通很慢、永遠答不出為什麼慢
（而且很容易錯怪到 prompt 長度上）。`input_tokens` 是 fresh + cache read + cache write
的總和 —— 單看 `input_tokens` 會因為幾乎全部命中快取而只有個位數，嚴重低估實際送出的量。

`GET /providers/health`
會回傳每個 provider 的可用模型清單與預設值 —— Claude 用 CLI 支援的別名
（sonnet／opus／haiku／fable），Codex 則直接讀本機 `~/.codex/models_cache.json`
（登入帳號實際能用的清單）與 `config.toml` 指定的預設模型。
不在清單裡的模型會在呼叫 CLI 前就被擋下（400），不會跑到一半才失敗。

## 開始使用

### 後端

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload
```

預設監聽 `http://127.0.0.1:8000`，啟動時會自動建立 SQLite 資料表（`workbench.sqlite3`）。

### 前端

```bash
cd frontend
pnpm install
pnpm dev
```

預設監聽 `http://localhost:5173`。前端透過 Vite proxy 的 `/api` 呼叫後端，整個 app 只有一個 origin。

### 多人接龍（團隊一起想）

現場的人用手機掃 QR code 加入，每人手上一條鏈、同時往右傳（使用者 → 場景 → 卡點），
跑完在筆電上一次公布所有的鏈。設計見 `發散/多人接龍.md`；目前是第 1 階段：
寫死三段題目、不呼叫任何模型，做到公布牆為止。

主持人的電腦照常開後端，前端改用 `dev:team` 啟動，讓區網裡的手機連得進來：

```bash
cd frontend
pnpm dev:team        # = vite --host
```

多人接龍是方法目錄裡的其中一個方法：Method Selector 會在「還沒有方向」時把它排進參考順序；
團隊人數填 1 人時，它根本不會出現在推薦裡（`FrameworkAgent.min_team_size`）。
2 人就能開始，題目會縮成兩層（使用者 → 卡在哪裡），3 人以上是完整的三層。
想用的話也可以在「手動選擇其他方法」裡直接挑。按「開始發想」之後，「發想中」那一頁就是主持畫面，
QR code 會自動帶入這台電腦的區網 IP。

**不在同一個 Wi-Fi**（或教室 Wi-Fi 擋裝置互連）時，另開一個終端機開 ngrok，
主持畫面會自動偵測到並多出「ngrok」選項：

```bash
ngrok http 5173
```

- 只需要一條隧道指向前端；後端走同一個 origin，不用處理 CORS 或第二個會變的網址
- 免費版網址每次重啟都會換，所以 QR code 是開場時即時產生的
- 免費版第一次打開會先跳一頁 ngrok 警告，按「Visit Site」之後就不會再出現；
  之後的 API 請求都帶 `ngrok-skip-browser-warning`，不會再被攔
- 區網通常更快更穩，ngrok 當備案；兩條路上場前都先試過

**安全邊界**：隧道一開，app 就在公開網路上，而其他功能都沒有登入。所以後端只讓
「這台電腦自己」使用一般功能，從區網或 ngrok 進來的請求只能碰到 `/relay/{code}/…`
這幾個手機用的端點（而且每支手機只看得到自己手上那張紙），其他一律 403
——包括會花額度的 LLM 呼叫。判斷依據是整條 `X-Forwarded-For`，見 `backend/app/access.py`。

## 待驗證的核心假設

**不同的 Ideation Framework，是否真的會導向不同類型的專案構想？** 如果 SCAMPER、痛點法、類比法最後都收斂到同質化的答案，代表系統本質上只是換皮的 Prompt Engineering。系統會記錄、比對不同方法的實際產出差異，作為驗證素材。

## 未來展望

- 支援多人協作發想（團隊成員各自回答，系統整合意見）
- 想法之間的合併功能，交給 Synthesizer Agent 產生整合版本
- 歷史工作台的瀏覽與續接（發想歷程目前寫得進資料庫，但還沒有介面讀得回來）
- 累積歷史發想案例，作為 Method Selector 推薦邏輯的訓練/驗證資料
- 若驗證「方法確實影響產出」成立，進一步研究不同領域團隊適合的方法分布
