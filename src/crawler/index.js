'use strict';
const fetch     = require('node-fetch');
const RSSParser = require('rss-parser');
const cheerio   = require('cheerio');
const { getDb } = require('../db/init');

const parser = new RSSParser({ timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0 DailyReportBot/1.0' } });

const COMPANY_NAMES = [
  '华为','腾讯','阿里','阿里巴巴','字节','字节跳动','百度','京东','美团','滴滴',
  '小米','网易','拼多多','蚂蚁','快手','哔哩哔哩','B站','携程',
  'OPPO','vivo','荣耀','联想','海尔','格力','比亚迪','宁德时代',
  '招商银行','平安','麦肯锡','波士顿咨询','BCG','德勤','普华永道','埃森哲',
  'IBM','微软','谷歌','Google','Amazon','苹果','Apple','Meta','Salesforce','SAP',
];

const ORG_KWS = new Set(['液态组织','流态组织','敏捷组织','扁平化','自组织','去中心化',
  '平台型组织','网络型组织','ai原生组织','组织变革','组织设计','组织架构','组织发展','od']);
const TALENT_KWS = new Set(['ai原生人才','ai native','人才管理','人才发展','人才培养','绩效管理',
  '员工体验','人力资源','hrbp','薪酬设计','薪酬','继任计划','技能重塑','超级个体','一人公司',
  '零工经济','灵活用工','雇主品牌','人机协作','数字员工','未来工作','工作再设计',
  '领导力','企业文化','心理安全','dei','ai替代','ai赋能','ai agent']);

function classifyTopic(text, keywords) {
  const lower = text.toLowerCase();
  let orgScore = 0, talentScore = 0;
  const hitKws = [];
  for (const { keyword } of keywords) {
    if (lower.includes(keyword.toLowerCase())) {
      hitKws.push(keyword);
      if (ORG_KWS.has(keyword.toLowerCase())) orgScore++;
      else if (TALENT_KWS.has(keyword.toLowerCase())) talentScore++;
    }
  }
  let topic = '其他';
  if (orgScore > talentScore) topic = '组织管理';
  else if (talentScore > 0)   topic = '人才管理';
  else if (orgScore > 0)      topic = '组织管理';
  return { topic, hitKws };
}

function extractCompanyCases(text) {
  const lower = text.toLowerCase();
  return [...new Set(COMPANY_NAMES.filter(c => lower.includes(c.toLowerCase())))].slice(0, 3);
}

function truncate(str, max = 50) {
  if (!str) return '';
  const s = str.replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function guessDate(item) {
  const raw = item.pubDate || item.isoDate || '';
  if (!raw) return new Date().toISOString().split('T')[0];
  const d = new Date(raw);
  return isNaN(d) ? new Date().toISOString().split('T')[0] : d.toISOString().split('T')[0];
}

async function fetchDetail(url) {
  if (!url?.startsWith('http')) return { summary: '', bodyText: '' };
  try {
    const res = await fetch(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0 DailyReportBot/1.0' } });
    if (!res.ok) return { summary: '', bodyText: '' };
    const html = await res.text();
    const $ = cheerio.load(html);
    $('script,style,nav,footer,header').remove();
    let summary = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '';
    if (!summary) {
      for (const sel of ['.article-content p','.content p','article p','main p']) {
        const t = $(sel).first().text().trim();
        if (t && t.length > 20) { summary = t; break; }
      }
    }
    const bodyText = $('body').text().replace(/\s+/g, ' ').slice(0, 4000);
    return { summary: truncate(summary, 50), bodyText };
  } catch { return { summary: '', bodyText: '' }; }
}

async function fetchRSS(source, keywords) {
  try {
    const feed = await parser.parseURL(source.url);
    const results = [];
    for (const item of feed.items) {
      const title = (item.title || '').trim();
      const url   = item.link || item.guid || '';
      if (!title || !url) continue;
      const snippet = (item.contentSnippet || '').slice(0, 200);
      const { topic, hitKws } = classifyTopic(title + ' ' + snippet, keywords);
      let summary = truncate(item.contentSnippet || '', 50);
      let bodyText = title + ' ' + summary;
      if (!summary && url) {
        const d = await fetchDetail(url);
        summary = d.summary; bodyText = d.bodyText || bodyText;
        await new Promise(r => setTimeout(r, 400));
      }
      const cases = extractCompanyCases(bodyText);
      const tags  = [...new Set([...hitKws, ...cases.map(c => c + '案例')])].slice(0, 6).join(',');
      results.push({ title, org: source.name, source: source.name, url, topic, summary, summary_ai: 0, tags, pub_date: guessDate(item) });
    }
    return results;
  } catch (e) { console.warn(`[RSS] ${source.name} 失败: ${e.message}`); return []; }
}

async function fetchHTML(source, keywords) {
  try {
    const res = await fetch(source.url, { timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0 DailyReportBot/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $    = cheerio.load(html);
    const raw  = [];
    $(source.selector || 'a').each((_, el) => {
      const $el  = $(el);
      const title = $el.text().trim();
      let href    = $el.attr('href') || '';
      if (!title || title.length < 6) return;
      if (href && !href.startsWith('http')) {
        const base = new URL(source.url);
        href = href.startsWith('/') ? `${base.origin}${href}` : `${base.origin}/${href}`;
      }
      raw.push({ title, url: href });
    });
    const isTargeted = ['三个皮匠','甲子光年','HRflag'].some(n => source.name.includes(n));
    const kwList     = keywords.map(k => k.keyword);
    const seen       = new Set();
    const deduped    = (isTargeted
      ? raw.filter(i => { const t = i.title.toLowerCase(); return kwList.some(kw => t.includes(kw.toLowerCase())); })
      : raw
    ).filter(i => { if (seen.has(i.title)) return false; seen.add(i.title); return true; }).slice(0, 40);

    const results = [];
    for (const item of deduped) {
      const { topic, hitKws } = classifyTopic(item.title, keywords);
      let summary = '', bodyText = item.title;
      if (item.url) {
        const d = await fetchDetail(item.url);
        summary = d.summary; bodyText = d.bodyText || bodyText;
        await new Promise(r => setTimeout(r, 500));
      }
      const cases = extractCompanyCases(bodyText);
      const tags  = [...new Set([...hitKws, ...cases.map(c => c + '案例')])].slice(0, 6).join(',');
      results.push({ title: item.title, org: source.name, source: source.name, url: item.url, topic, summary, summary_ai: 0, tags, pub_date: new Date().toISOString().split('T')[0] });
    }
    return results;
  } catch (e) { console.warn(`[HTML] ${source.name} 失败: ${e.message}`); return []; }
}

async function runCrawler() {
  const db       = getDb();
  const sources  = (await db.execute('SELECT * FROM sources WHERE active=1')).rows;
  const keywords = (await db.execute('SELECT keyword, topic FROM keywords')).rows;

  for (const src of sources) {
    console.log(`[抓取] ${src.name} ...`);
    const items = src.type === 'rss' ? await fetchRSS(src, keywords) : await fetchHTML(src, keywords);
    let newCount = 0;
    for (const item of items) {
      try {
        await db.execute({
          sql: 'INSERT OR IGNORE INTO reports(title,org,source,url,topic,summary,summary_ai,tags,pub_date) VALUES(?,?,?,?,?,?,?,?,?)',
          args: [item.title, item.org, item.source, item.url, item.topic, item.summary, item.summary_ai, item.tags, item.pub_date],
        });
        newCount++;
      } catch {}
    }
    console.log(`  → ${items.length} 条，入库 ${newCount} 条`);
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('✅ 抓取完成');
}

module.exports = { runCrawler };
if (require.main === module) runCrawler().catch(console.error);
