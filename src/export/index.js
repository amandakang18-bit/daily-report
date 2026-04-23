'use strict';
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

const EXPORT_DIR = path.join(__dirname, '../../data/exports');
fs.mkdirSync(EXPORT_DIR, { recursive: true });

// ---- Excel ----
async function exportExcel(reports, filename) {
  const wb = new ExcelJS.Workbook();
  wb.creator = '日报系统';
  wb.created = new Date();

  // 汇总 sheet
  const ws = wb.addWorksheet('日报汇总');
  ws.columns = [
    { header: '发布时间', key: 'pub_date', width: 14 },
    { header: '发布机构', key: 'org',      width: 20 },
    { header: '报告标题', key: 'title',    width: 60 },
    { header: '网站来源', key: 'source',   width: 20 },
    { header: '主题分类', key: 'topic',    width: 14 },
    { header: '原文链接', key: 'url',      width: 50 },
  ];

  // header style
  ws.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF185FA5' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  ws.getRow(1).height = 22;

  const topicColors = {
    '宏观经济':'FFE6F1FB','产业政策':'FFE1F5EE','金融市场':'FFFAEEDA',
    '科技创新':'FFEEEDFE','能源环境':'FFFAECE7','国际贸易':'FFEAF3DE'
  };

  reports.forEach((r, i) => {
    const row = ws.addRow(r);
    row.height = 18;
    const color = topicColors[r.topic] || 'FFFFFFFF';
    row.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? color : 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } } };
    });
    // clickable link
    if (r.url) {
      ws.getCell(`F${i + 2}`).value = { text: r.url, hyperlink: r.url };
      ws.getCell(`F${i + 2}`).font = { color: { argb: 'FF185FA5' }, underline: true };
    }
  });

  // per-topic sheets
  const topics = [...new Set(reports.map(r => r.topic))];
  for (const topic of topics) {
    const tw = wb.addWorksheet(topic);
    tw.columns = ws.columns;
    tw.getRow(1).values = ['发布时间','发布机构','报告标题','网站来源','主题分类','原文链接'];
    tw.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF185FA5' } };
    });
    reports.filter(r => r.topic === topic).forEach(r => tw.addRow(r));
  }

  const filePath = path.join(EXPORT_DIR, filename);
  await wb.xlsx.writeFile(filePath);
  return filePath;
}

// ---- PDF ----
async function exportPDF(reports, filename) {
  return new Promise((resolve, reject) => {
    const filePath = path.join(EXPORT_DIR, filename);
    const doc = new PDFDocument({ margin: 50, size: 'A4', info: { Title: '每日报告汇总' } });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // fonts — use built-in Helvetica; Chinese chars fallback to boxes without CJK font
    // To support Chinese properly, user should place a CJK font in data/fonts/
    const fontPath = path.join(__dirname, '../../data/fonts/NotoSansSC-Regular.ttf');
    if (fs.existsSync(fontPath)) {
      doc.registerFont('CJK', fontPath);
      doc.font('CJK');
    }

    const pageW = doc.page.width - 100;

    // title
    doc.fontSize(18).fillColor('#185FA5').text('每日报告汇总', { align: 'center' });
    doc.fontSize(11).fillColor('#888').text(`生成时间：${new Date().toLocaleString('zh-CN')}  共 ${reports.length} 条`, { align: 'center' });
    doc.moveDown(1);

    // group by topic
    const byTopic = {};
    reports.forEach(r => { (byTopic[r.topic] = byTopic[r.topic] || []).push(r); });

    for (const [topic, items] of Object.entries(byTopic)) {
      doc.fontSize(13).fillColor('#185FA5').text(`▌ ${topic}`, { continued: false });
      doc.moveTo(50, doc.y).lineTo(50 + pageW, doc.y).strokeColor('#B5D4F4').lineWidth(0.5).stroke();
      doc.moveDown(0.3);

      items.forEach((r, i) => {
        if (doc.y > 720) doc.addPage();
        doc.fontSize(10).fillColor('#333').text(`${r.pub_date}  ${r.org}`, { continued: false });
        doc.fontSize(11).fillColor('#111').text(r.title, { continued: false, link: r.url || null, underline: !!r.url });
        doc.fontSize(9).fillColor('#888').text(`来源：${r.source}   ${r.url || ''}`, { continued: false });
        if (i < items.length - 1) {
          doc.moveTo(50, doc.y + 4).lineTo(50 + pageW, doc.y + 4).strokeColor('#EEE').lineWidth(0.3).stroke();
          doc.moveDown(0.6);
        }
      });
      doc.moveDown(1);
    }

    doc.end();
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
}

module.exports = { exportExcel, exportPDF };
