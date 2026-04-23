'use strict';
const express = require('express');
const path    = require('path');
const cron    = require('node-cron');
const { initDb, getDb } = require('./db/init');
const { runCrawler }    = require('./crawler/index');
const { exportExcel, exportPDF } = require('./export/index');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// 启动时初始化数据库
initDb().catch(console.error);

// ── 辅助：构建 WHERE 条件 ────────────────────────────────────────
function buildWhere(q, topic, date_from, date_to) {
  const conds = ['1=1'], args = [];
  if (q) {
    conds.push('(title LIKE ? OR org LIKE ? OR source LIKE ? OR tags LIKE ?)');
    args.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (topic)     { conds.push('topic=?');       args.push(topic); }
  if (date_from) { conds.push('pub_date >= ?');  args.push(date_from); }
  if (date_to)   { conds.push('pub_date <= ?');  args.push(date_to); }
  return { where: conds.join(' AND '), args };
}

// ── Reports ──────────────────────────────────────────────────────
app.get('/api/reports', async (req, res) => {
  const { q='', topic='', date_from='', date_to='', page=1, limit=100 } = req.query;
  const { where, args } = buildWhere(q, topic, date_from, date_to);
  const db = getDb();
  const rows  = await db.execute({ sql: `SELECT * FROM reports WHERE ${where} ORDER BY pub_date DESC, id DESC LIMIT ? OFFSET ?`, args: [...args, +limit, (+page-1)*+limit] });
  const count = await db.execute({ sql: `SELECT COUNT(*) as c FROM reports WHERE ${where}`, args });
  res.json({ data: rows.rows, total: count.rows[0]?.c ?? 0 });
});

app.get('/api/reports/today', async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const db    = getDb();
  const rows  = await db.execute({ sql: 'SELECT * FROM reports WHERE pub_date=? ORDER BY id DESC', args: [today] });
  res.json({ data: rows.rows, date: today });
});

app.get('/api/stats', async (req, res) => {
  const db = getDb();
  const [total, today, byTopic, recentDays] = await Promise.all([
    db.execute('SELECT COUNT(*) as c FROM reports'),
    db.execute({ sql: "SELECT COUNT(*) as c FROM reports WHERE pub_date=date('now','localtime')", args: [] }),
    db.execute('SELECT topic, COUNT(*) as c FROM reports GROUP BY topic ORDER BY c DESC'),
    db.execute("SELECT pub_date, COUNT(*) as c FROM reports WHERE pub_date >= date('now','-30 days','localtime') GROUP BY pub_date ORDER BY pub_date DESC"),
  ]);
  res.json({
    total:      total.rows[0]?.c ?? 0,
    today:      today.rows[0]?.c ?? 0,
    byTopic:    byTopic.rows,
    recentDays: recentDays.rows,
  });
});

// ── Sources ──────────────────────────────────────────────────────
app.get('/api/sources', async (req, res) => {
  const db = getDb();
  const r  = await db.execute('SELECT * FROM sources ORDER BY id');
  res.json(r.rows);
});
app.post('/api/sources', async (req, res) => {
  const { name, url, type, selector, topic } = req.body;
  if (!name || !url || !type) return res.status(400).json({ error: '缺少必填字段' });
  const db = getDb();
  const r  = await db.execute({ sql: 'INSERT INTO sources(name,url,type,selector,topic) VALUES(?,?,?,?,?)', args: [name, url, type, selector||null, topic||null] });
  res.json({ id: r.lastInsertRowid });
});
app.put('/api/sources/:id', async (req, res) => {
  const { name, url, type, selector, topic, active } = req.body;
  const db = getDb();
  await db.execute({ sql: 'UPDATE sources SET name=?,url=?,type=?,selector=?,topic=?,active=? WHERE id=?', args: [name, url, type, selector||null, topic||null, active??1, req.params.id] });
  res.json({ ok: true });
});
app.delete('/api/sources/:id', async (req, res) => {
  const db = getDb();
  await db.execute({ sql: 'DELETE FROM sources WHERE id=?', args: [req.params.id] });
  res.json({ ok: true });
});

// ── Keywords ─────────────────────────────────────────────────────
app.get('/api/keywords', async (req, res) => {
  const db = getDb();
  const r  = await db.execute('SELECT * FROM keywords ORDER BY id');
  res.json(r.rows);
});
app.post('/api/keywords', async (req, res) => {
  const { keyword, topic } = req.body;
  const db = getDb();
  const r  = await db.execute({ sql: 'INSERT OR IGNORE INTO keywords(keyword,topic) VALUES(?,?)', args: [keyword, topic||null] });
  res.json({ id: r.lastInsertRowid });
});
app.delete('/api/keywords/:id', async (req, res) => {
  const db = getDb();
  await db.execute({ sql: 'DELETE FROM keywords WHERE id=?', args: [req.params.id] });
  res.json({ ok: true });
});

// ── Topics ───────────────────────────────────────────────────────
app.get('/api/topics', async (req, res) => {
  const db = getDb();
  const r  = await db.execute('SELECT * FROM topics ORDER BY id');
  res.json(r.rows);
});
app.post('/api/topics', async (req, res) => {
  const { name, color } = req.body;
  const db = getDb();
  const r  = await db.execute({ sql: 'INSERT OR IGNORE INTO topics(name,color) VALUES(?,?)', args: [name, color||'gray'] });
  res.json({ id: r.lastInsertRowid });
});
app.delete('/api/topics/:id', async (req, res) => {
  const db = getDb();
  await db.execute({ sql: 'DELETE FROM topics WHERE id=?', args: [req.params.id] });
  res.json({ ok: true });
});

// ── Crawler trigger ───────────────────────────────────────────────
app.post('/api/fetch', (req, res) => {
  res.json({ ok: true, message: '抓取任务已启动' });
  runCrawler().catch(console.error);
});

// ── Export ───────────────────────────────────────────────────────
app.get('/api/export/:format', async (req, res) => {
  const { format }  = req.params;
  const { q='', topic='', date_from='', date_to='' } = req.query;
  const { where, args } = buildWhere(q, topic, date_from, date_to);
  const db   = getDb();
  const rows = await db.execute({ sql: `SELECT pub_date,org,title,source,topic,url,summary,tags FROM reports WHERE ${where} ORDER BY topic, pub_date DESC`, args });
  const dateTag = new Date().toISOString().split('T')[0];
  try {
    if (format === 'excel') {
      const file = await exportExcel(rows.rows, `日报_${dateTag}.xlsx`);
      res.download(file, path.basename(file));
    } else if (format === 'pdf') {
      const file = await exportPDF(rows.rows, `日报_${dateTag}.pdf`);
      res.download(file, path.basename(file));
    } else {
      res.status(400).json({ error: '不支持的格式' });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── Cron：每天 08:00 北京时间自动抓取 ──────────────────────────
cron.schedule('0 8 * * *', () => {
  console.log('[Cron] 每日自动抓取启动...');
  runCrawler().catch(console.error);
}, { timezone: 'Asia/Shanghai' });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 日报系统已启动：http://localhost:${PORT}`);
});
