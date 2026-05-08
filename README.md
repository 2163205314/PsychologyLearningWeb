# 心理学考研学习平台

基于 Flask 的心理学考研学习网站，涵盖普通心理学、实验心理学、现代心理与教育统计学、心理与教育测量四大核心科目，支持 Markdown 渲染、LaTeX 数学公式和图表展示。

## 功能特性

- **四门核心科目**：普通心理学、实验心理学、现代心理与教育统计学、心理与教育测量
- **树形目录导航**：左侧固定侧边栏，支持折叠展开，快速定位章节
- **Markdown 渲染**：正文以 Markdown 格式存储，前端实时渲染为富文本
- **LaTeX 公式**：基于 KaTeX 渲染数学公式，支持行内 `$...$` 和块级 `$$...$$`
- **全文搜索**：顶部全局搜索框，跨书本检索章节标题和正文内容
- **书本内搜索**：目录侧边栏支持按标题过滤章节
- **上下翻页**：章节底部提供上一篇 / 下一篇快捷导航
- **面包屑导航**：显示当前章节在书本中的层级位置
- **响应式布局**：适配桌面端和移动端

## 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Python 3 + Flask 3.x |
| 数据库 | SQLite3（树形邻接表，`parent_id` 自引用） |
| 前端 | 原生 HTML / CSS / JavaScript |
| Markdown 渲染 | marked.js 12.x |
| 公式渲染 | KaTeX 0.16.9 |
| 图表 | Chart.js 4.4.1 |

## 项目结构

```
PsychologyLearningWeb/
├── app.py                    # Flask 主应用（路由 + API）
├── requirements.txt          # Python 依赖
├── data/
│   └── psychology_learning.db  # SQLite 数据库
├── utils/
│   └── __init__.py           # 数据库工具层
├── static/
│   ├── css/
│   │   └── style.css         # 全局样式
│   ├── js/
│   │   ├── app.js            # 前端交互逻辑
│   │   └── lib/              # 第三方库
│   │       ├── marked.min.js
│   │       ├── katex.min.js
│   │       ├── katex.min.css
│   │       ├── auto-render.min.js
│   │       └── chart.umd.min.js
│   └── fonts/                # KaTeX 字体文件
└── templates/
    ├── base.html             # 基础布局
    ├── index.html            # 首页
    ├── book.html             # 书本目录页
    ├── section.html          # 章节内容页
    └── 404.html              # 404 页面
```

## 数据库设计

采用树形邻接表模型，两张表：

**books** — 书本信息

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| title | TEXT | 书名 |
| short_name | TEXT | 简称（唯一） |
| sort_order | INTEGER | 排序 |

**sections** — 章节内容

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| book_id | INTEGER | 所属书本 |
| parent_id | INTEGER | 父章节 ID（自引用） |
| heading_level | INTEGER | 标题级别（1-4） |
| heading_text | TEXT | 标题文本 |
| content | TEXT | 正文内容（Markdown） |
| sort_order | INTEGER | 排序 |

## 快速开始

### 环境要求

- Python 3.8+
- pip

### 安装与运行

```bash
# 克隆项目
git clone https://github.com/你的用户名/psychology-learning-web.git
cd PsychologyLearningWeb

# 安装依赖
pip install -r requirements.txt

# 启动服务
python app.py
```

浏览器访问 `http://127.0.0.1:5000` 即可使用。

## API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/books` | GET | 获取所有书本列表 |
| `/api/book/<id>/tree` | GET | 获取书本的完整目录树 |
| `/api/section/<id>` | GET | 获取章节详情（含面包屑、上下篇） |
| `/api/search?q=<关键词>` | GET | 全文搜索章节 |

## 数据来源

内容来源于心理学考研核心教材，经整理后以 Markdown 格式存储于 SQLite 数据库中，共计 3,500+ 章节节点。
