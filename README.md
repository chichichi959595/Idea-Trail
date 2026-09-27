# IdeaTrail

AI 引導式的專案發想系統。不是直接請 LLM「幫我想 10 個題目」，而是先判斷「這個團隊現在適合用哪種方式思考」，再用對應的引導流程，一步步把模糊的意圖收斂成具體的專案方向——並完整記錄這個點子是怎麼被想出來的。

## 為什麼做這個

團隊在啟動新專案（畢專、Side Project、黑客松）時，最常卡住的不是「技術做不出來」，而是「根本不知道要做什麼」。直接問 ChatGPT 只會拿到同質化的答案；憑感覺套用某個發想法，又不知道自己的情況適不適合。

IdeaTrail 把「怎麼想專案」本身做成系統：

- **Method Selector**：分析團隊條件（人數、時間、技術背景、是否已有明確問題），推薦最適合的發想方法並說明理由，而不是要求使用者自己先懂各種框架
- **Framework Agent**：每種發想法（SCAMPER、痛點導向、逆向思考、類比法、使用者旅程……）都是一套多階段的提問流程，不是換一句 Prompt
- **Idea Synthesizer**：跨方法比對、去重、組合多個候選想法，收斂成最終專案方向
- **可追溯的歷程**：記錄用了哪個方法、問了哪些問題、想法如何演化——這個過程本身就是可展示、可驗證的成果

## 系統架構

```
frontend/   React 19 + Vite + TailwindCSS 4 的工作台（Workspace）介面
backend/    FastAPI + SQLAlchemy，管理 Agent 流程狀態、儲存發想歷程
```

### Agents（`backend/app/agents`）

- `method_selector.py` — 根據使用者輸入推薦發想方法
- `synthesizer.py` — 整合多個 Framework Agent 的產出
- `framework/` — 各發想法的獨立引導流程：SCAMPER、Pain Point、Reverse Thinking、Analogy（Mash-up）、User Journey、How Might We、Random Input、Crazy 8s、Capability Mapping

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

- **收斂／推薦**：Method Selector、每次 Method Run 的收斂、想法整合。這是團隊真正帶走的東西。
- **引導步驟**：每一步的切題性檢查加一兩個想法片段，一次 Run 會跑六次以上。

`anthropic` 預設是 Opus 5 收斂、Sonnet 5 跑步驟。兩個 CLI provider 兩邊都維持原本的預設
（`claude` 是 sonnet）：往下降一階看起來理所當然，但實測 haiku 透過 CLI 反而**更慢**，
因為 harness 開銷佔了大頭、不會隨模型變小。想覆寫的話下拉選單兩邊都能各自選。
選到的組合會寫進 `MethodRun.model` 與 `MethodRun.step_model`，整輪 Run 固定不變。

### 串流

四個會讓人等的呼叫（推薦方法、回答步驟、收斂、整合想法）都有一個 `/stream` 版本，
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

預設監聽 `http://localhost:5173`（後端 CORS 已為此網址開放）。

## 待驗證的核心假設

**不同的 Ideation Framework，是否真的會導向不同類型的專案構想？** 如果 SCAMPER、痛點法、類比法最後都收斂到同質化的答案，代表系統本質上只是換皮的 Prompt Engineering。系統會記錄、比對不同方法的實際產出差異，作為驗證素材。

## 未來展望

- 支援多人協作發想（團隊成員各自回答，系統整合意見）
- 想法之間的合併功能，交給 Synthesizer Agent 產生整合版本
- 歷史工作台的瀏覽與續接（發想歷程目前寫得進資料庫，但還沒有介面讀得回來）
- 累積歷史發想案例，作為 Method Selector 推薦邏輯的訓練/驗證資料
- 若驗證「方法確實影響產出」成立，進一步研究不同領域團隊適合的方法分布
