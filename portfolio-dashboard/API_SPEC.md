# 持仓看板 — 后端 API 规范

> 供后端开发者（openclaw）对照实现。
> 前端通过环境变量 `VITE_API_BASE_URL` 指定后端地址，默认 `http://localhost:8080`。
> 所有接口路径均以 `/api` 为前缀。

---

## 目录

1. [通用约定](#通用约定)
2. [数据库表结构](#数据库表结构)
3. [接口列表](#接口列表)
   - [Dashboard](#1-dashboard)
   - [Holdings 持仓](#2-holdings-持仓)
   - [Trades 交易记录](#3-trades-交易记录)
   - [Closed Positions 已清仓](#4-closed-positions-已清仓)
   - [Settings 设置](#5-settings-设置)
4. [初始化数据导入](#初始化数据导入)
5. [行情接入建议](#行情接入建议)

---

## 通用约定

### 请求 / 响应格式

- Content-Type: `application/json`
- 日期格式: `YYYY-MM-DD`（字符串）
- 时间格式: `HH:mm:ss`（字符串）
- 所有金额: 人民币元，保留2位小数（ETF/基金价格保留3位）
- 所有比率/百分比: **小数形式**，例如 `0.0652` 表示 6.52%
- 仓位占比: 小数形式，例如 `0.1744` 表示 17.44%

### 成功响应

```json
{ "data": ... }
```

或直接返回对象/数组（两种形式均可，前端已兼容）

### 错误响应

```json
{
  "error": "错误描述",
  "message": "用户可读的错误信息"
}
```

HTTP 状态码：400（参数错误）、404（资源不存在）、500（服务器错误）

### CORS

必须允许前端域名（开发时为 `http://localhost:3000`）的跨域请求。

---

## 数据库表结构

### 表 `holdings`（当前持仓）

```sql
CREATE TABLE holdings (
  code              VARCHAR(20)      PRIMARY KEY,  -- 证券代码
  name              VARCHAR(100)     NOT NULL,      -- 名称
  type              VARCHAR(10)      NOT NULL DEFAULT 'stock', -- 'stock' | 'fund'
  value             DECIMAL(15,2)    NOT NULL DEFAULT 0, -- 持有金额
  today_pnl         DECIMAL(15,2)    NOT NULL DEFAULT 0,
  today_pnl_rate    DECIMAL(10,6)    NOT NULL DEFAULT 0,
  holding_pnl       DECIMAL(15,2)    NOT NULL DEFAULT 0,
  holding_pnl_rate  DECIMAL(10,6)    NOT NULL DEFAULT 0,
  total_pnl         DECIMAL(15,2)    NOT NULL DEFAULT 0,
  weekly_pnl        DECIMAL(15,2)    NOT NULL DEFAULT 0,
  monthly_pnl       DECIMAL(15,2)    NOT NULL DEFAULT 0,
  yearly_pnl        DECIMAL(15,2)    NOT NULL DEFAULT 0,
  position_ratio    DECIMAL(10,6)    NOT NULL DEFAULT 0,
  quantity          DECIMAL(18,4)    NOT NULL DEFAULT 0,
  holding_days      INT,
  latest_change     DECIMAL(10,6)    NOT NULL DEFAULT 0,
  latest_price      DECIMAL(15,4)    NOT NULL DEFAULT 0,
  cost_per_unit     DECIMAL(15,4)    NOT NULL DEFAULT 0,
  break_even_change DECIMAL(10,6),
  month_return      DECIMAL(10,6),
  three_month_return DECIMAL(10,6),
  six_month_return  DECIMAL(10,6),
  year_return       DECIMAL(10,6),
  updated_at        TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 表 `trades`（交易记录）

```sql
CREATE TABLE trades (
  id            SERIAL          PRIMARY KEY,
  trade_date    DATE            NOT NULL,
  trade_time    TIME,
  code          VARCHAR(20)     NOT NULL,
  name          VARCHAR(100)    NOT NULL,
  type          VARCHAR(20)     NOT NULL,  -- 买入/卖出/申购/赎回/红利再投/分红/除权除息/修改持仓/其他
  quantity      DECIMAL(18,4)   NOT NULL DEFAULT 0,
  price         DECIMAL(15,4),
  amount        DECIMAL(15,2)   NOT NULL DEFAULT 0, -- 发生金额（负=买，正=卖）
  deal_amount   DECIMAL(15,2)   NOT NULL DEFAULT 0, -- 成交金额（绝对值）
  fee           DECIMAL(12,2)   NOT NULL DEFAULT 0,
  note          TEXT,
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_trades_date ON trades(trade_date DESC);
CREATE INDEX idx_trades_code ON trades(code);
CREATE INDEX idx_trades_type ON trades(type);
```

### 表 `closed_positions`（已清仓）

```sql
CREATE TABLE closed_positions (
  id            SERIAL        PRIMARY KEY,
  close_date    DATE          NOT NULL,
  code          VARCHAR(20)   NOT NULL,
  name          VARCHAR(100)  NOT NULL,
  total_pnl     DECIMAL(15,2) NOT NULL DEFAULT 0,
  pnl_rate      DECIMAL(10,6) NOT NULL DEFAULT 0,
  market_pnl    DECIMAL(10,6) NOT NULL DEFAULT 0,  -- 同期大盘涨幅
  outperform    DECIMAL(10,6) NOT NULL DEFAULT 0,  -- 跑赢大盘
  buy_avg       DECIMAL(15,4) NOT NULL DEFAULT 0,
  sell_avg      DECIMAL(15,4) NOT NULL DEFAULT 0,
  days_ago      INT           NOT NULL DEFAULT 0,
  holding_days  INT           NOT NULL DEFAULT 0,
  trade_fee     DECIMAL(12,2) NOT NULL DEFAULT 0,
  build_date    DATE,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_closed_date ON closed_positions(close_date DESC);
CREATE INDEX idx_closed_code ON closed_positions(code);
```

### 表 `settings`（系统配置）

```sql
CREATE TABLE settings (
  key         VARCHAR(50)   PRIMARY KEY,
  value       TEXT          NOT NULL,
  updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 初始化默认设置
INSERT INTO settings VALUES ('year_target_rate', '0.30', NOW());
INSERT INTO settings VALUES ('year_start_value', '0', NOW());  -- 由首次持仓快照或手动设置
```

---

## 接口列表

### 1. Dashboard

#### `GET /api/dashboard/summary`

返回看板所需的汇总数据。后端需计算以下字段：

**响应体**

```json
{
  "totalValue": 2654321.50,
  "stockValue": 1050000.00,
  "fundValue":  1580000.00,
  "stockCount": 12,
  "fundCount":  22,
  "todayPnL":      48291.00,
  "todayPnLRate":  0.01851,
  "holdingPnL":    198432.00,
  "holdingPnLRate": 0.0809,
  "totalPnL":      212800.00,
  "yearStartValue": 2300000.00,
  "yearPnL":       354321.50,
  "yearReturnRate": 0.154,
  "yearTargetRate": 0.30,
  "yearTargetPnL":  690000.00,
  "yearGapRate":    0.146,
  "yearGapAmount":  335678.50,
  "dayOfYear":      84,
  "totalDaysInYear": 365,
  "expectedReturnRate": 0.069,
  "updatedAt": "2026-03-25T15:30:00+08:00"
}
```

**字段说明**

| 字段 | 说明 |
|------|------|
| `totalValue` | holdings 表所有 `value` 之和 |
| `stockValue` | type='stock' 的 `value` 之和 |
| `fundValue` | type='fund' 的 `value` 之和 |
| `todayPnL` | 所有 `today_pnl` 之和 |
| `todayPnLRate` | `todayPnL / (totalValue - todayPnL)` |
| `holdingPnL` | 所有 `holding_pnl` 之和 |
| `holdingPnLRate` | `holdingPnL / (totalValue - holdingPnL)` |
| `totalPnL` | 所有 `total_pnl` 之和 |
| `yearStartValue` | settings 中 `year_start_value` |
| `yearPnL` | `totalValue - yearStartValue` |
| `yearReturnRate` | `yearPnL / yearStartValue` |
| `yearTargetRate` | settings 中 `year_target_rate`（如 0.30） |
| `yearTargetPnL` | `yearStartValue * yearTargetRate` |
| `yearGapRate` | `yearTargetRate - yearReturnRate`（若已超目标则为负） |
| `yearGapAmount` | `yearTargetPnL - yearPnL` |
| `dayOfYear` | 今天是本年第几天 |
| `totalDaysInYear` | 本年总天数（365 或 366） |
| `expectedReturnRate` | `yearTargetRate * (dayOfYear / totalDaysInYear)` |

---

### 2. Holdings 持仓

#### `GET /api/holdings`

返回所有当前持仓，按 `value` 降序排列。

**响应体（数组）**

```json
[
  {
    "code": "159915",
    "name": "创业板ETF",
    "type": "fund",
    "value": 462980.00,
    "todayPnL": 10520.00,
    "todayPnLRate": 0.0232,
    "holdingPnL": 82233.00,
    "holdingPnLRate": 0.2159,
    "totalPnL": 82233.00,
    "weeklyPnL": 0,
    "monthlyPnL": 0,
    "yearlyPnL": 0,
    "positionRatio": 0.1744,
    "quantity": 140000,
    "holdingDays": null,
    "latestChange": 0.0217,
    "latestPrice": 3.307,
    "costPerUnit": 2.720,
    "breakEvenChange": null,
    "monthReturn": null,
    "threeMonthReturn": null,
    "sixMonthReturn": null,
    "yearReturn": null,
    "updatedAt": "2026-03-25T15:30:00+08:00"
  }
]
```

---

#### `PUT /api/holdings/:code/price`

手动更新某只标的的最新价，后端重新计算相关字段。

**请求体**

```json
{ "price": 3.350 }
```

**后端计算逻辑**

```
value           = quantity * price
holdingPnL      = value - quantity * cost_per_unit
holdingPnLRate  = holdingPnL / (quantity * cost_per_unit)
todayPnL        ≈ (price - prev_close_price) * quantity  [若无行情则不变]
positionRatio   = value / total_portfolio_value
```

**响应体**：更新后的 Holding 对象

---

#### `POST /api/holdings/refresh`

触发行情数据拉取，批量更新所有持仓的最新价。

**响应体**

```json
{ "updated": 34 }
```

> **行情数据来源建议**：东方财富 / 同花顺 API、AKShare 库（免费）、或用户自行配置的行情接口。
> 刷新频率建议：交易日 09:30–15:00 每分钟可拉取一次，收盘后按需。

---

#### `POST /api/holdings/import`

初始化时批量导入持仓数据（来自 Excel seed 文件）。

**请求体**

```json
{
  "holdings": [ ...Holding[] ]
}
```

**响应体**

```json
{ "imported": 34 }
```

---

### 3. Trades 交易记录

#### `GET /api/trades`

分页查询交易记录，支持多维过滤。

**查询参数**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `page` | int | 1 | 页码（从1开始） |
| `pageSize` | int | 20 | 每页条数 |
| `code` | string | — | 按代码模糊匹配 |
| `type` | string | — | 精确匹配交易类别 |
| `startDate` | date | — | 成交日期 ≥ |
| `endDate` | date | — | 成交日期 ≤ |

**响应体**

```json
{
  "total": 880,
  "page": 1,
  "pageSize": 20,
  "items": [
    {
      "id": 1,
      "tradeDate": "2026-03-25",
      "tradeTime": "14:07:22",
      "code": "159915",
      "name": "创业板ETF",
      "type": "买入",
      "quantity": 10000,
      "price": 3.21,
      "amount": -32105.00,
      "dealAmount": 32100.00,
      "fee": 5.00,
      "note": null,
      "createdAt": "2026-03-25T14:07:22+08:00",
      "updatedAt": "2026-03-25T14:07:22+08:00"
    }
  ]
}
```

默认按 `trade_date DESC, id DESC` 排序。

---

#### `POST /api/trades`

新增一条交易记录。

**请求体**（所有字段同 Trade 对象，不含 id/createdAt/updatedAt）

```json
{
  "tradeDate": "2026-03-25",
  "tradeTime": "14:07:22",
  "code": "159915",
  "name": "创业板ETF",
  "type": "买入",
  "quantity": 10000,
  "price": 3.21,
  "amount": -32105.00,
  "dealAmount": 32100.00,
  "fee": 5.00,
  "note": "加仓"
}
```

**响应体**：新创建的 Trade 对象（含 id）

> **持仓联动**（可选，推荐实现）：新增交易时，自动根据交易类型更新 holdings 表的数量和成本。

---

#### `PUT /api/trades/:id`

更新指定交易记录（支持部分更新）。

**请求体**：Trade 的任意字段子集

**响应体**：更新后的 Trade 对象

---

#### `DELETE /api/trades/:id`

删除指定交易记录。

**响应体**

```json
{ "success": true }
```

---

#### `POST /api/trades/import`

批量导入交易记录（初始化时使用）。

**请求体**

```json
{
  "trades": [ ...Trade[] ]
}
```

**响应体**

```json
{ "imported": 880 }
```

---

### 4. Closed Positions 已清仓

#### `GET /api/closed-positions`

分页查询已清仓记录。

**查询参数**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `page` | int | 1 | — |
| `pageSize` | int | 25 | — |
| `code` | string | — | 模糊匹配代码或名称 |
| `startDate` | date | — | 清仓日期 ≥ |
| `endDate` | date | — | 清仓日期 ≤ |

**响应体**

```json
{
  "total": 106,
  "page": 1,
  "pageSize": 25,
  "items": [
    {
      "id": 1,
      "closeDate": "2025-08-27",
      "code": "588840",
      "name": "50科创",
      "totalPnL": 337.00,
      "pnLRate": 0.0294,
      "marketPnL": 0.0091,
      "outperform": 0.0203,
      "buyAvg": 1.234,
      "sellAvg": 1.271,
      "daysAgo": 210,
      "holdingDays": 5,
      "tradeFee": 10.50,
      "buildDate": "2025-08-22"
    }
  ]
}
```

默认按 `close_date DESC` 排序。

---

#### `POST /api/closed-positions/import`

批量导入已清仓记录（初始化时使用）。

**请求体**

```json
{
  "positions": [ ...ClosedPosition[] ]
}
```

**响应体**

```json
{ "imported": 106 }
```

---

### 5. Settings 设置

#### `GET /api/settings`

返回所有系统配置。

**响应体**

```json
{
  "year_target_rate": "0.30",
  "year_start_value": "2300000"
}
```

---

#### `PUT /api/settings`

批量更新配置（支持部分更新）。

**请求体**

```json
{
  "year_target_rate": "0.30",
  "year_start_value": "2300000"
}
```

**响应体**：更新后的完整 settings 对象

---

## 初始化数据导入

项目 `seed-data/` 目录下包含从 Excel 提取的完整 JSON 数据，可用于数据库初始化。

### 初始化步骤

1. 启动数据库，执行建表 SQL
2. 调用 `POST /api/settings` 设置年初资产和年度目标
3. 调用 `POST /api/holdings/import` 导入当前持仓（34条）
4. 调用 `POST /api/trades/import` 导入交易记录（880条）
5. 调用 `POST /api/closed-positions/import` 导入已清仓记录（106条）

### seed-data 文件说明

```
seed-data/
├── holdings.json          # 34条当前持仓
├── trades.json            # 880条交易记录
├── closed_positions.json  # 106条已清仓
└── settings.json          # 初始配置（年度目标等）
```

---

## 行情接入建议

### 方案一：AKShare（推荐）

```python
import akshare as ak

# A股实时行情
df = ak.stock_zh_a_spot_em()

# ETF实时行情
df = ak.fund_etf_spot_em()
```

AKShare 免费开源，支持 A股、ETF、基金等各类数据。

### 方案二：东方财富接口

可参考公开 API（非官方），适合个人使用。

### 刷新策略

- 交易日 09:25–15:05：每 30–60 秒刷新一次
- 非交易时间：不刷新或仅在开盘时刷新一次收盘价
- 前端"刷新行情"按钮触发一次性即时刷新

---

## 前端环境变量

复制 `.env.example` 为 `.env.local` 并填写：

```bash
VITE_API_BASE_URL=http://<your-vm-ip>:<port>
VITE_YEAR_TARGET=0.30
```

---

*最后更新：2026-03-25*
