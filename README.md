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

呼叫本機已登入的 CLI 工具，吃既有的訂閱額度，**不使用** API Key：

- `claude` — 透過本機的 Claude Code CLI（Claude Pro/Max 訂閱）
- `codex` — 透過本機的 Codex CLI（ChatGPT Plus/Pro 訂閱）

使用前請確認對應 CLI 已在本機登入（`claude auth status` / `codex login status`）。

兩者都可以再挑模型：方法選擇頁的來源方塊右半邊就是模型下拉選單，選到的模型會一路帶到
Method Selector、該次 Method Run 的每一步，以及想法整合。`GET /providers/health`
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
