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

initDb().catch(console.error);

function buildWhere(q, topic, date_from, date_to) {
  const conds = ['1=1'], args = [];
  let i = 1;
  if (q) {
    conds.push(`(title ILIKE $${i} OR org ILIKE $${i+1} OR source ILIKE $${i+2} OR tags ILIKE $${i+3})`);
    args.push(`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`); i+=4;
  }
  if (topic)     { conds.push(`topic=$${i}`);       args.push(topic); i++; }
  if (date_from) { conds.push(`pub_date>=$${i}`);   args.push(date_from); i++; }
  if (date_to)   { conds.push(`pub_date<=$${i}`);   args.push(date_to); i++; }
  return { where: conds.join(' AND '), args, nextI: i };
}

app.get('/api/reports', async (req, res) => {
  const { q='', topic='', date_from='', date_to='', page=1, limit=100 } = req.query;
  const { where, args, nextI } = buildWhere(q, topic, date_from, date_to);
  const db = getDb();
  const rows  = await db.query(`SELECT * FROM reports WHERE ${where} ORDER BY pub_date DESC, id DESC LIMIT $${nextI} OFFSET $${nextI+1}`, [...args, +limit, (+page-1)*+limit]);
  const count = await db.query(`SELECT COUNT(*) as c FROM reports WHERE ${where}`, args);
  res.json({ data: rows.rows, total: parseInt(count.rows[0]?.c ?? 0) });
});

app.get('/api/reports/today', async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const db = getDb();
  const rows = await db.query('SELECT * FROM reports WHERE pub_date=$1 ORDER BY id DESC', [today]);
  res.json({ data: rows.rows, date: today });
});

app.get('/api/stats', async (req, res) => {
  const db = getDb();
  const [total, today, byTopic, recentDays] = await Promise.all([
    db.query('SELECT COUNT(*) as c FROM reports'),
    db.query("SELECT COUNT(*) as c FROM reports WHERE pub_date=CURRENT_DATE::text"),
    db.query('SELECT topic, COUNT(*) as c FROM reports GROUP BY topic ORDER BY c DESC'),
    db.query("SELECT pub_date, COUNT(*) as c FROM reports WHERE pub_date >= (CURRENT_DATE - interval '30 days')::text GROUP BY pub_date ORDER BY pub_date DESC"),
  ]);
  res.json({ total: parseInt(total.rows[0]?.c??0), today: parseInt(today.rows[0]?.c??0), byTopic: byTopic.rows, recentDays: recentDays.rows });
});

app.get('/api/sources', async (req, res) => { const r = await getDb().query('SELECT * FROM sources ORDER BY id'); res.json(r.rows); });
app.post('/api/sources', async (req, res) => {
  const { name, url, type, selector, topic } = req.body;
  if (!name||!url||!type) return res.status(400).json({error:'缺少必填字段'});
  const r = await getDb().query('INSERT INTO sources(name,url,type,selector,topic) VALUES($1,$2,$3,$4,$5) RETURNING id',[name,url,type,selector||null,topic||null]);
  res.json({id:r.rows[0].id});
});
app.put('/api/sources/:id', async (req, res) => {
  const {name,url,type,selector,topic,active}=req.body;
  await getDb().query('UPDATE sources SET name=$1,url=$2,type=$3,selector=$4,topic=$5,active=$6 WHERE id=$7',[name,url,type,selector||null,topic||null,active??1,req.params.id]);
  res.json({ok:true});
});
app.delete('/api/sources/:id', async (req, res) => { await getDb().query('DELETE FROM sources WHERE id=$1',[req.params.id]); res.json({ok:true}); });

app.get('/api/keywords', async (req, res) => { const r = await getDb().query('SELECT * FROM keywords ORDER BY id'); res.json(r.rows); });
app.post('/api/keywords', async (req, res) => {
  const {keyword,topic}=req.body;
  const r = await getDb().query('INSERT INTO keywords(keyword,topic) VALUES($1,$2) ON CONFLICT(keyword) DO NOTHING RETURNING id',[keyword,topic||null]);
  res.json({id:r.rows[0]?.id});
});
app.delete('/api/keywords/:id', async (req, res) => { await getDb().query('DELETE FROM keywords WHERE id=$1',[req.params.id]); res.json({ok:true}); });

app.get('/api/topics', async (req, res) => { const r = await getDb().query('SELECT * FROM topics ORDER BY id'); res.json(r.rows); });
app.post('/api/topics', async (req, res) => {
  const {name,color}=req.body;
  const r = await getDb().query('INSERT INTO topics(name,color) VALUES($1,$2) ON CONFLICT(name) DO NOTHING RETURNING id',[name,color||'gray']);
  res.json({id:r.rows[0]?.id});
});
app.delete('/api/topics/:id', async (req, res) => { await getDb().query('DELETE FROM topics WHERE id=$1',[req.params.id]); res.json({ok:true}); });

app.post('/api/fetch', (req, res) => {
  res.json({ok:true,message:'抓取任务已启动'});
  runCrawler().catch(console.error);
});

app.get('/api/export/:format', async (req, res) => {
  const {format}=req.params;
  const {q='',topic='',date_from='',date_to=''}=req.query;
  const {where,args}=buildWhere(q,topic,date_from,date_to);
  const rows = await getDb().query(`SELECT pub_date,org,title,source,topic,url,summary,tags FROM reports WHERE ${where} ORDER BY topic, pub_date DESC`,args);
  const dateTag = new Date().toISOString().split('T')[0];
  try {
    if (format==='excel') { const file=await exportExcel(rows.rows,`日报_${dateTag}.xlsx`); res.download(file,path.basename(file)); }
    else if (format==='pdf') { const file=await exportPDF(rows.rows,`日报_${dateTag}.pdf`); res.download(file,path.basename(file)); }
    else res.status(400).json({error:'不支持的格式'});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.post('/api/fetch', (req, res) => {
  res.json({ ok: true, message: '抓取任务已启动' });
  runCrawler().catch(console.error);
});

cron.schedule('0 8 * * *', () => { runCrawler().catch(console.error); }, {timezone:'Asia/Shanghai'});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 日报系统已启动：http://localhost:${PORT}`));
