# Frontend — AI 專案發想引導系統

Vite + React 19 + TypeScript + Tailwind v4 的單頁前端，搭配 `../backend` 的 FastAPI 服務。

## 開發

```bash
pnpm install
pnpm dev      # http://localhost:5173
```

後端要同時跑在 `http://127.0.0.1:8000`（見 `../backend`），API base URL 寫在 `src/api.ts`。

## 指令

| 指令 | 用途 |
| --- | --- |
| `pnpm dev` | 開發伺服器 |
| `pnpm build` | `tsc -b` 型別檢查 + 打包 |
| `pnpm lint` | oxlint |
| `pnpm preview` | 預覽打包結果 |

## 結構

```
src/
  api.ts               所有後端呼叫
  types.ts             API 回傳型別（不含方法目錄，見下）
  useMethodCatalog.ts  從 GET /methods 取得方法目錄
  components/
    ui.tsx                共用 Swiss International 排版元件
    NewSessionForm.tsx    01 基本資訊收集
    MethodSelectorView.tsx 02 方法推薦與選擇
    FrameworkRunView.tsx  03 逐步發想
    IdeaBoard.tsx         04 想法牆
    ProposalDetail.tsx    05 單一想法的完整歷程
```

### 方法目錄不在前端

發想方法的名稱、描述、教學、每步限時秒數，全部由後端的 `FrameworkAgent`
類別定義，透過 `GET /methods` 提供。前端**刻意不保留第二份**，以免同一個方法
在 prompt 裡和畫面上被描述成兩種樣子。要改文案請改
`backend/app/agents/framework/<method>.py`。
