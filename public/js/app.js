'use strict';

const S = { topics: [], activeTopic: null, historyPage: 1, searchTimer: null };

document.addEventListener('DOMContentLoaded', () => {
  setDefaults();
  loadStats();
  loadTodayReports();
});

function setDefaults() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('today-title').textContent =
    '今日日报 · ' + new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
  const toEl = document.getElementById('h-to');
  if (toEl) toEl.value = today;
  const fromEl = document.getElementById('h-from');
  if (fromEl) { const d = new Date(); d.setDate(d.getDate() - 30); fromEl.value = d.toISOString().split('T')[0]; }
}

// ── 导航 ────────────────────────────────────────────────────────
function showPage(name, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  el.classList.add('active');
  if (name === 'history') { loadTopics().then(() => loadHistory()); }
  if (name === 'config')  { loadConfig(); }
}

// ── 统计 ─────────────────────────────────────────────────────────
async function loadStats() {
  const data = await api('/api/stats');
  document.getElementById('s-today').textContent = data.today ?? '—';
  document.getElementById('s-total').textContent = data.total ?? '—';
}

// ── 今日 ─────────────────────────────────────────────────────────
async function loadTodayReports() {
  const data = await api('/api/reports/today');
  document.getElementById('today-sub').textContent = `${data.date} · 共 ${data.data.length} 条`;
  renderReportGroups(data.data, 'today-content');
}

async function triggerFetch() {
  const btn = document.getElementById('fetch-btn');
  btn.textContent = '抓取中…'; btn.disabled = true;
  setStatus('amber', '正在抓取，请稍候（含详情页解析，约需 1-3 分钟）…');
  await api('/api/fetch', 'POST');
  setTimeout(async () => {
    await loadTodayReports();
    await loadStats();
    setStatus('green', '抓取完成');
    btn.textContent = '立即抓取'; btn.disabled = false;
    showToast('✅ 抓取完成，数据已更新');
  }, 5000);
}

function setStatus(color, msg) {
  let bar = document.getElementById('today-status');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'today-status';
    bar.className = 'status-bar';
    document.getElementById('today-content').before(bar);
  }
  bar.innerHTML = `<div class="dot dot-${color}"></div><span>${msg}</span>`;
}

// ── 历史 ─────────────────────────────────────────────────────────
async function loadTopics() {
  S.topics = await api('/api/topics');
  renderTopicChips();
}

function renderTopicChips() {
  const chips = document.getElementById('topic-chips');
  if (!chips) return;
  chips.innerHTML =
    `<span class="chip ${!S.activeTopic ? 'active' : ''}" onclick="setTopicFilter(null,this)">全部</span>` +
    S.topics.map(t =>
      `<span class="chip ${S.activeTopic === t.name ? 'active' : ''}" onclick="setTopicFilter('${t.name}',this)">${t.name}</span>`
    ).join('');
}

function setTopicFilter(name, el) {
  S.activeTopic = name; S.historyPage = 1;
  document.querySelectorAll('#topic-chips .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  loadHistory();
}

function debounceSearch() {
  clearTimeout(S.searchTimer);
  S.searchTimer = setTimeout(loadHistory, 350);
}

async function loadHistory() {
  S.historyPage = S.historyPage || 1;
  const q     = document.getElementById('h-search')?.value || '';
  const from  = document.getElementById('h-from')?.value || '';
  const to    = document.getElementById('h-to')?.value || '';
  const topic = S.activeTopic || '';
  const params = new URLSearchParams({ q, date_from: from, date_to: to, topic, page: S.historyPage, limit: 80 });
  const data = await api('/api/reports?' + params);
  renderReportGroups(data.data, 'history-content');
  renderPagination(data.total, 80, S.historyPage, 'h-pagination', p => { S.historyPage = p; loadHistory(); });
}

// ── 渲染报告组 ───────────────────────────────────────────────────
function topicClass(topic) {
  if (topic === '组织管理') return 'org';
  if (topic === '人才管理') return 'talent';
  return 'other';
}

function tagClass(tag) {
  if (tag.endsWith('案例')) return 'tag-case';
  if (['液态组织','流态组织','敏捷组织','扁平化','自组织','去中心化',
       '平台型组织','网络型组织','AI原生组织','组织变革','组织设计',
       '组织架构','组织发展','OD'].includes(tag)) return 'tag-org';
  return 'tag-talent';
}

function renderReportGroups(rows, containerId) {
  const el = document.getElementById(containerId);
  if (!rows || !rows.length) { el.innerHTML = '<div class="empty-state">暂无数据</div>'; return; }

  const grouped = {};
  const ORDER = ['组织管理', '人才管理', '其他'];
  rows.forEach(r => {
    const t = r.topic || '其他';
    (grouped[t] = grouped[t] || []).push(r);
  });

  el.innerHTML = ORDER.filter(t => grouped[t]?.length).map(topic => {
    const items = grouped[topic];
    const tc = topicClass(topic);
    return `<div class="report-group">
      <div class="report-table">
        <div class="group-header">
          <span class="badge badge-${tc}">${topic}</span>
          <span class="group-count">${items.length} 条</span>
        </div>
        ${items.map(r => {
          const tags = (r.tags || '').split(',').filter(Boolean);
          const tagsHtml = tags.map(t => `<span class="tag ${tagClass(t)}">${esc(t)}</span>`).join('');
          const summaryHtml = r.summary
            ? `<div class="r-summary">${esc(r.summary)}</div>`
            : '';
          return `<div class="report-row">
            <div class="r-date">${r.pub_date || ''}</div>
            <div>
              <div class="r-title"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a></div>
              ${summaryHtml}
              <div class="r-meta">
                <span class="r-org">${esc(r.org || '')} · ${esc(r.source || '')}</span>
                ${tags.length ? `<span class="r-div">·</span>${tagsHtml}` : ''}
              </div>
            </div>
            <a class="r-link" href="${esc(r.url)}" target="_blank" rel="noopener">原文 →</a>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');
}

// ── 导出 ─────────────────────────────────────────────────────────
function exportData(format) {
  const q     = document.getElementById('h-search')?.value || '';
  const from  = document.getElementById('h-from')?.value || '';
  const to    = document.getElementById('h-to')?.value || '';
  const topic = S.activeTopic || '';
  const params = new URLSearchParams({ q, date_from: from, date_to: to, topic });
  window.open('/api/export/' + format + '?' + params, '_blank');
}

// ── 配置 ─────────────────────────────────────────────────────────
async function loadConfig() {
  const [sources, keywords, topics] = await Promise.all([
    api('/api/sources'), api('/api/keywords'), api('/api/topics'),
  ]);

  document.getElementById('sources-list').innerHTML = sources.map(s => `
    <div class="config-row">
      <div>
        <div class="config-row-name">${esc(s.name)} <span class="type-badge">${s.type.toUpperCase()}</span>${s.active ? '' : ' <span class="type-badge">停用</span>'}</div>
        <div class="config-row-sub">${esc(s.url)}</div>
      </div>
      <div class="config-row-actions">
        <button class="btn-sm" onclick="toggleSource(${s.id},${s.active ? 0 : 1})">${s.active ? '停用' : '启用'}</button>
        <button class="btn-danger" onclick="deleteItem('sources',${s.id})">删除</button>
      </div>
    </div>`).join('') || '<div style="padding:12px 16px;font-size:12px;color:var(--text3)">暂无来源</div>';

  document.getElementById('keywords-list').innerHTML = keywords.map(k => `
    <div class="config-row">
      <div>
        <div class="config-row-name">${esc(k.keyword)}</div>
        <div class="config-row-sub">${k.topic ? '→ ' + esc(k.topic) : ''}</div>
      </div>
      <button class="btn-danger" onclick="deleteItem('keywords',${k.id})">删除</button>
    </div>`).join('') || '<div style="padding:12px 16px;font-size:12px;color:var(--text3)">暂无关键词</div>';

  document.getElementById('topics-list').innerHTML =
    `<div style="display:flex;flex-wrap:wrap;gap:8px;padding:14px 16px">` +
    topics.map(t => `<span class="badge badge-${topicClass(t.name)}" style="padding:5px 12px;font-size:12.5px">
      ${esc(t.name)}
      <button onclick="deleteItem('topics',${t.id})" style="background:none;border:none;cursor:pointer;margin-left:5px;opacity:.5;font-size:13px">×</button>
    </span>`).join('') + '</div>';
}

async function toggleSource(id, active) {
  const src = (await api('/api/sources')).find(s => s.id === id);
  if (!src) return;
  await api('/api/sources/' + id, 'PUT', { ...src, active });
  loadConfig();
}

async function deleteItem(type, id) {
  if (!confirm('确认删除？')) return;
  await api('/' + 'api/' + type + '/' + id, 'DELETE');
  loadConfig(); showToast('已删除');
}

// ── Modals ───────────────────────────────────────────────────────
function openAddSource() {
  document.getElementById('modal-title').textContent = '添加抓取来源';
  document.getElementById('modal-body').innerHTML = `
    <div class="form-row"><label>名称 *</label><input id="f-name" placeholder="如：三个皮匠·新报告"></div>
    <div class="form-row"><label>URL *</label><input id="f-url" placeholder="https://..."></div>
    <div class="form-row"><label>类型 *</label>
      <select id="f-type"><option value="rss">RSS Feed</option><option value="html">HTML 抓取</option></select></div>
    <div class="form-row"><label>CSS 选择器（HTML 模式）</label><input id="f-selector" placeholder="a.title, h3 a"></div>
    <div class="form-row"><label>默认主题</label>
      <select id="f-topic"><option value="组织管理">组织管理</option><option value="人才管理">人才管理</option><option value="其他">其他</option></select></div>`;
  document.getElementById('modal-confirm').onclick = async () => {
    const name = document.getElementById('f-name').value.trim();
    const url  = document.getElementById('f-url').value.trim();
    const type = document.getElementById('f-type').value;
    if (!name || !url) { showToast('请填写名称和 URL'); return; }
    await api('/api/sources', 'POST', { name, url, type,
      selector: document.getElementById('f-selector').value.trim(),
      topic: document.getElementById('f-topic').value });
    closeModal(); loadConfig(); showToast('✅ 来源已添加');
  };
  showModal();
}

function openAddKeyword() {
  document.getElementById('modal-title').textContent = '添加关键词';
  document.getElementById('modal-body').innerHTML = `
    <div class="form-row"><label>关键词 *</label><input id="f-kw" placeholder="如：人才盘点"></div>
    <div class="form-row"><label>关联主题</label>
      <select id="f-ktopic"><option value="组织管理">组织管理</option><option value="人才管理">人才管理</option><option value="其他">其他</option></select></div>`;
  document.getElementById('modal-confirm').onclick = async () => {
    const keyword = document.getElementById('f-kw').value.trim();
    if (!keyword) { showToast('请填写关键词'); return; }
    await api('/api/keywords', 'POST', { keyword, topic: document.getElementById('f-ktopic').value });
    closeModal(); loadConfig(); showToast('✅ 关键词已添加');
  };
  showModal();
}

function openAddTopic() {
  document.getElementById('modal-title').textContent = '添加主题';
  document.getElementById('modal-body').innerHTML = `
    <div class="form-row"><label>主题名称 *</label><input id="f-tn" placeholder="如：组织文化"></div>`;
  document.getElementById('modal-confirm').onclick = async () => {
    const name = document.getElementById('f-tn').value.trim();
    if (!name) { showToast('请填写主题名称'); return; }
    await api('/api/topics', 'POST', { name, color: 'gray' });
    closeModal(); loadConfig(); showToast('✅ 主题已添加');
  };
  showModal();
}

function showModal()  { document.getElementById('modal-overlay').classList.remove('hidden'); }
function closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); }

// ── 分页 ─────────────────────────────────────────────────────────
function renderPagination(total, limit, current, elId, cb) {
  const pages = Math.ceil(total / limit);
  const el = document.getElementById(elId);
  if (pages <= 1) { el.innerHTML = ''; return; }
  let html = '';
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - current) <= 2)
      html += `<button class="page-btn ${i === current ? 'active' : ''}" onclick="(${cb.toString()})(${i})">${i}</button>`;
    else if (Math.abs(i - current) === 3)
      html += '<span style="padding:0 4px;color:var(--text3)">…</span>';
  }
  el.innerHTML = html;
}

// ── utils ────────────────────────────────────────────────────────
async function api(url, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  return res.json().catch(() => ({}));
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3000);
}
