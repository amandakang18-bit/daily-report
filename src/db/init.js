'use strict';
const { createClient } = require('@libsql/client');

// 从环境变量读取 Turso 连接信息
// 本地开发时自动退回到本地文件
function getDb() {
  if (process.env.TURSO_URL) {
    return createClient({
      url:       process.env.TURSO_URL,
      authToken: process.env.TURSO_TOKEN,
    });
  }
  // 本地开发：用本地 SQLite 文件（需要安装 @libsql/client）
  const path = require('path');
  const fs   = require('fs');
  const dir  = path.join(__dirname, '../../data');
  fs.mkdirSync(dir, { recursive: true });
  return createClient({ url: 'file:' + path.join(dir, 'reports.db') });
}

async function initDb() {
  const db = getDb();

  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS reports (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT NOT NULL,
      org        TEXT,
      source     TEXT,
      url        TEXT,
      topic      TEXT,
      summary    TEXT,
      summary_ai INTEGER DEFAULT 0,
      tags       TEXT,
      pub_date   TEXT,
      fetched_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS sources (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      name     TEXT NOT NULL,
      url      TEXT NOT NULL,
      type     TEXT NOT NULL,
      selector TEXT,
      topic    TEXT,
      active   INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS keywords (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT UNIQUE NOT NULL,
      topic   TEXT
    );
    CREATE TABLE IF NOT EXISTS topics (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name  TEXT UNIQUE NOT NULL,
      color TEXT DEFAULT 'blue'
    );
    CREATE INDEX IF NOT EXISTS idx_reports_date  ON reports(pub_date);
    CREATE INDEX IF NOT EXISTS idx_reports_topic ON reports(topic);
  `);

  // 主题
  const topicData = [
    ['组织管理','blue'],
    ['人才管理','teal'],
    ['其他','gray'],
  ];
  for (const [name, color] of topicData) {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO topics(name,color) VALUES(?,?)',
      args: [name, color],
    });
  }

  // 关键词
  const kwData = [
    ['液态组织','组织管理'],['流态组织','组织管理'],['敏捷组织','组织管理'],
    ['扁平化','组织管理'],['自组织','组织管理'],['去中心化','组织管理'],
    ['平台型组织','组织管理'],['网络型组织','组织管理'],['AI原生组织','组织管理'],
    ['组织变革','组织管理'],['组织设计','组织管理'],['组织架构','组织管理'],
    ['组织发展','组织管理'],['OD','组织管理'],
    ['AI原生人才','人才管理'],['AI Native','人才管理'],
    ['人才管理','人才管理'],['人才发展','人才管理'],['人才培养','人才管理'],
    ['绩效管理','人才管理'],['员工体验','人才管理'],['人力资源','人才管理'],
    ['HRBP','人才管理'],['薪酬设计','人才管理'],['薪酬','人才管理'],
    ['继任计划','人才管理'],['技能重塑','人才管理'],['超级个体','人才管理'],
    ['一人公司','人才管理'],['零工经济','人才管理'],['灵活用工','人才管理'],
    ['雇主品牌','人才管理'],['人机协作','人才管理'],['数字员工','人才管理'],
    ['未来工作','人才管理'],['工作再设计','人才管理'],['领导力','人才管理'],
    ['企业文化','人才管理'],['心理安全','人才管理'],['DEI','人才管理'],
    ['AI替代','人才管理'],['AI赋能','人才管理'],['AI Agent','人才管理'],
  ];
  for (const [keyword, topic] of kwData) {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO keywords(keyword,topic) VALUES(?,?)',
      args: [keyword, topic],
    });
  }

  // 来源
  const srcData = [
    ['三个皮匠·人力资源报告','https://www.sgpjbg.com/baogaolist-00018-0-0-0-0-0-0-9-0-0.html','html','.baogao-item .baogao-title a, .report-list .title a, .item-title a, h3 a, .list-title a','人才管理'],
    ['三个皮匠·AI科技报告','https://www.sgpjbg.com/baogaolist-00001-0-0-0-0-0-0-0-0-0.html','html','.baogao-item .baogao-title a, .report-list .title a, .item-title a, h3 a, .list-title a','其他'],
    ['甲子光年·洞见','https://www.jazzyear.com/article_list.html?type=2','html','a[href*="article_info"]','其他'],
    ['甲子光年·研究报告','https://www.jazzyear.com/report_list.html','html','a[href*="report_info"], .report-item a, .article-title a','其他'],
    ['HRflag·新闻资讯','https://news.hrflag.com/','html','a[href*="news"], .news-title a, .article-list a, h3 a, h4 a','人才管理'],
    ['HRflag·研究报告','https://reports.hrflag.com/','html','a[href*="Report/detail"], a[href*="report"], .report-title a, h3 a','人才管理'],
  ];
  for (const [name, url, type, selector, topic] of srcData) {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO sources(name,url,type,selector,topic) VALUES(?,?,?,?,?)',
      args: [name, url, type, selector, topic],
    });
  }

  console.log('✅ 数据库初始化完成');
  return db;
}

module.exports = { getDb, initDb };
if (require.main === module) initDb().catch(console.error);
