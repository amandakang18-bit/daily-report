# 每日报告中心

本地运行的自动日报抓取系统。支持 RSS + HTML 双模式爬虫、SQLite 持久化、Excel/PDF 导出、每天 08:00 自动抓取。

---

## 快速启动

### 1. 安装依赖
```bash
cd daily-report
npm install
```

### 2. 启动服务
```bash
npm start
```

浏览器打开：http://localhost:3000

---

## 添加你的网站来源

进入「配置管理」→「抓取来源」→「+ 添加」，填入：

| 字段 | 说明 |
|------|------|
| 名称 | 显示名，如"国家发改委" |
| URL | RSS 地址或网页地址 |
| 类型 | `rss`（推荐）或 `html` |
| CSS 选择器 | HTML 模式专用，如 `a.news-title` |
| 默认主题 | 该来源的默认分类 |

### 常用 RSS 来源参考
```
国家发改委:   https://www.ndrc.gov.cn/rss.xml
中国人民银行: http://www.pbc.gov.cn/rss/index.xml
国家统计局:   https://www.stats.gov.cn/rss.xml
工信部:       https://www.miit.gov.cn/rss.xml
国家能源局:   http://www.nea.gov.cn/rss.xml
证监会:       http://www.csrc.gov.cn/rss.xml
财政部:       http://www.mof.gov.cn/rss.xml
商务部:       http://www.mofcom.gov.cn/rss.xml
```

---

## 目录结构

```
daily-report/
├── src/
│   ├── server.js          # Express 服务器 + Cron 定时任务
│   ├── crawler/index.js   # RSS + HTML 爬虫
│   ├── export/index.js    # Excel + PDF 导出
│   └── db/init.js         # SQLite 数据库
├── public/
│   ├── index.html         # 前端页面
│   ├── css/style.css
│   └── js/app.js
├── data/
│   ├── reports.db         # SQLite 数据库文件（自动生成）
│   ├── exports/           # 导出文件存放
│   └── fonts/             # 可放入 NotoSansSC-Regular.ttf 改善 PDF 中文
└── package.json
```

---

## PDF 中文字体

默认 PDF 不含中文字体，标题会显示为方框。解决方法：

1. 下载 [Noto Sans SC](https://fonts.google.com/noto/specimen/Noto+Sans+SC) 字体
2. 将 `NotoSansSC-Regular.ttf` 放入 `data/fonts/` 目录
3. 重启服务即可

---

## 定时任务

服务启动后自动注册 Cron，每天 **08:00（北京时间）** 自动抓取。
也可手动点击「立即抓取」或运行：
```bash
node src/crawler/index.js
```

---

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/reports` | 查询报告，支持 q/topic/date_from/date_to/page/limit |
| GET | `/api/reports/today` | 今日报告 |
| GET | `/api/stats` | 统计数据 |
| POST | `/api/fetch` | 触发抓取 |
| GET | `/api/export/excel` | 导出 Excel |
| GET | `/api/export/pdf` | 导出 PDF |
| CRUD | `/api/sources` | 来源管理 |
| CRUD | `/api/keywords` | 关键词管理 |
| CRUD | `/api/topics` | 主题管理 |
