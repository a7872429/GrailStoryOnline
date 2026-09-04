# 傳說紀行｜雙人連線版

這是《傳說紀行》的完整網頁遊戲原始碼。GitHub 用來保存程式碼；Cloudflare Workers 與 D1 負責線上房間、雙方同步及牌局資料。

> 不能只開啟 GitHub Pages。GitHub Pages 沒有伺服器與資料庫，雙人房間功能會失效。

## 第一次部署（不需要 VS Code）

### 一、把檔案放到 GitHub

1. 登入 [GitHub](https://github.com/)，右上角按 `+` → `New repository`。
2. Repository name 可填 `legend-chronicle`，選擇 Public 或 Private，按 `Create repository`。
3. 在空白儲存庫頁面按 `uploading an existing file`。
4. 將本壓縮檔解壓縮，把資料夾內所有檔案拖入上傳區（必須包含 `.github` 資料夾）。
5. 下方按 `Commit changes`。

如果 macOS 看不到 `.github`：在 Finder 按 `Command + Shift + .` 顯示隱藏檔案。

### 二、建立 Cloudflare D1 資料庫

1. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com/)。
2. 左側進入 `Workers & Pages` → `D1 SQL database` → `Create database`。
3. 名稱填 `legend-chronicle-db`，完成後複製頁面上的 `Database ID`。

### 三、建立 Cloudflare API Token

1. Cloudflare 右上角個人圖示 → `My Profile` → `API Tokens`。
2. 按 `Create Token`，可使用 `Edit Cloudflare Workers` 範本。
3. Token 至少需要 `Workers Scripts / Edit` 及 `D1 / Edit`。
4. 建立後立即複製 Token，並在帳號首頁複製 `Account ID`。

### 四、設定 GitHub Secrets

進入 GitHub 儲存庫 → `Settings` → `Secrets and variables` → `Actions` → `New repository secret`：

| Secret 名稱 | 填入內容 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID |
| `CLOUDFLARE_D1_DATABASE_ID` | D1 Database ID |

可選：在 `Variables` 建立 `CLOUDFLARE_WORKER_NAME`，值填 `legend-chronicle`。

### 五、執行部署

1. GitHub 儲存庫上方進入 `Actions`。
2. 左側選 `部署傳說紀行到 Cloudflare`。
3. 按 `Run workflow` → `Run workflow`。
4. 等待綠色勾勾；展開最後步驟即可看到 `workers.dev` 遊戲網址。

往後只要更新 `main` 分支，系統就會自動重新部署。

## 常見問題

- **Actions 找不到：** 確認 `.github/workflows/deploy-cloudflare.yml` 有上傳。
- **Authentication error：** 檢查 Token、Account ID 及 Workers Scripts、D1 編輯權限。
- **Database not found：** Secret 要填 Database ID，不是資料庫名稱。
- **沒有 workers.dev 網址：** 先在 Workers & Pages 啟用 `workers.dev` 子網域。
- **舊房間無法使用：** 更新後雙方關閉舊分頁並建立新房間。

## 本機需求（進階）

- Node.js 22.13 以上
- `npm ci`
- `npm run build`

本專案內含角色圖片與遊戲資料，未另外授權他人再利用。
