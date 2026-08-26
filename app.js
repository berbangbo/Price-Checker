const els = {
  search: document.querySelector('#search-input'), clear: document.querySelector('#clear-search'),
  categories: document.querySelector('#category-list'), products: document.querySelector('#product-list'),
  count: document.querySelector('#result-count'), heading: document.querySelector('#results-heading'), status: document.querySelector('#data-status'),
  dialog: document.querySelector('#import-dialog'), openImport: document.querySelector('#open-import'), file: document.querySelector('#file-input'),
  mappingPanel: document.querySelector('#mapping-panel'), mappingFields: document.querySelector('#mapping-fields'), importButton: document.querySelector('#import-data'),
  importMessage: document.querySelector('#import-message'), rules: document.querySelector('#category-rules'), exportButton: document.querySelector('#export-data'),
};
const fields = [
  ['sku', 'SKU / รหัสสินค้า', ['sku', 'รหัสสินค้า', 'product code', 'item code', 'plu']],
  ['name', 'ชื่อสินค้า', ['ชื่อสินค้า', 'product name', 'item name', 'description', 'name']],
  ['price', 'ราคาขาย', ['ราคาขาย', 'selling price', 'sale price', 'price']],
  ['unit', 'Unit / หน่วย', ['unit', 'หน่วย', 'uom']],
  ['barcode', 'บาร์โค้ด', ['barcode', 'บาร์โค้ด', 'ean']],
  ['category', 'หมวดจาก POS (ถ้ามี)', ['category', 'หมวดหมู่', 'department', 'group']],
];
let products = [], activeCategory = 'ทั้งหมด', workbookRows = [], headers = [];
const normalize = value => String(value ?? '').trim().toLocaleLowerCase('th');
const keyify = value => normalize(value).replace(/[\s\-_/().]/g, '');
const money = value => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);

function render() {
  const query = normalize(els.search.value);
  const categories = ['ทั้งหมด', ...[...new Set(products.map(p => p.category || 'ยังไม่จัดหมวด'))].sort((a, b) => a.localeCompare(b, 'th'))];
  els.categories.replaceChildren(...categories.map(category => {
    const button = document.createElement('button'); button.className = `category-button${category === activeCategory ? ' active' : ''}`; button.textContent = category;
    button.onclick = () => { activeCategory = category; render(); }; return button;
  }));
  const matches = products.filter(p => (activeCategory === 'ทั้งหมด' || (p.category || 'ยังไม่จัดหมวด') === activeCategory) && (!query || p.search.includes(query)));
  els.heading.textContent = query ? 'ผลการค้นหา' : activeCategory === 'ทั้งหมด' ? 'สินค้าทั้งหมด' : activeCategory;
  els.count.textContent = `${matches.length.toLocaleString('th-TH')} รายการ`;
  els.products.replaceChildren(...matches.slice(0, 150).map(productCard));
  if (!matches.length) els.products.innerHTML = '<p class="empty">ไม่พบสินค้าที่ค้นหา</p>';
}
function productCard(product) {
  const node = document.querySelector('#product-template').content.cloneNode(true);
  node.querySelector('h3').textContent = product.name || 'ไม่มีชื่อสินค้า';
  node.querySelector('.product-meta').textContent = [product.sku, product.barcode].filter(Boolean).join(' · ');
  const list = node.querySelector('.price-list');
  product.offers.forEach(offer => { const line = document.createElement('div'); line.className = 'price-line'; line.innerHTML = `<span class="unit">${escapeHtml(offer.unit || 'หน่วย')}</span>฿${money(offer.price)}`; list.append(line); });
  return node;
}
function escapeHtml(value) { const span = document.createElement('span'); span.textContent = value; return span.innerHTML; }
function cleanProducts(records) {
  const grouped = new Map();
  for (const row of records) {
    if (!row.name || Number.isNaN(row.price)) continue;
    const identity = row.sku || `${row.name}|${row.barcode || ''}`;
    if (!grouped.has(identity)) grouped.set(identity, { ...row, offers: [], search: '' });
    const product = grouped.get(identity); product.offers.push({ unit: row.unit, price: row.price });
  }
  return [...grouped.values()].map(product => ({ ...product, offers: product.offers.sort((a, b) => a.price - b.price), search: normalize([product.name, product.sku, product.barcode, product.category, ...product.offers.map(o => o.unit)].join(' ')) }));
}
function save() { localStorage.setItem('price-finder-products', JSON.stringify(products)); localStorage.setItem('price-finder-updated', new Date().toISOString()); }
function setProducts(next, source) { products = next; const date = localStorage.getItem('price-finder-updated'); els.status.textContent = `${products.length.toLocaleString('th-TH')} สินค้า${date ? ` · อัปเดต ${new Date(date).toLocaleDateString('th-TH')}` : source ? ` · ${source}` : ''}`; render(); }
async function loadData() {
  const stored = localStorage.getItem('price-finder-products');
  if (stored) { setProducts(JSON.parse(stored), 'ข้อมูลในเครื่อง'); return; }
  try { const response = await fetch('products.json'); const data = await response.json(); setProducts(data.products || [], 'ข้อมูลเริ่มต้น'); }
  catch { setProducts([], 'ยังไม่มีข้อมูล'); }
}
function detectHeader(candidates) { return headers.find(header => candidates.some(candidate => keyify(header).includes(keyify(candidate)))) || ''; }
function renderMapping() {
  els.mappingFields.replaceChildren(...fields.map(([key, label, candidates]) => {
    const labelNode = document.createElement('label'); labelNode.textContent = label;
    const select = document.createElement('select'); select.dataset.field = key; select.innerHTML = `<option value="">— ไม่ใช้ —</option>${headers.map(header => `<option value="${escapeHtml(header)}"${header === detectHeader(candidates) ? ' selected' : ''}>${escapeHtml(header)}</option>`).join('')}`;
    labelNode.append(select); return labelNode;
  }));
}
function parseRules(text) {
  return text.split(/\r?\n/).map(line => line.split('=').map(part => part.trim())).filter(parts => parts.length === 2 && parts[0] && parts[1]).map(([keywords, category]) => ({ keywords: keywords.split(',').map(normalize), category }));
}
function numeric(value) { return Number(String(value ?? '').replace(/[^0-9.\-]/g, '')); }
function selectedMap() { return Object.fromEntries([...els.mappingFields.querySelectorAll('select')].map(select => [select.dataset.field, select.value])); }
function importRows() {
  const map = selectedMap();
  if (!map.name || !map.price) { els.importMessage.textContent = 'ต้องเลือกอย่างน้อย “ชื่อสินค้า” และ “ราคาขาย”'; return; }
  const rules = parseRules(els.rules.value);
  const rows = workbookRows.map(source => {
    const name = String(source[map.name] ?? '').trim();
    const match = rules.find(rule => rule.keywords.some(keyword => normalize(name).includes(keyword)));
    return { sku: String(source[map.sku] ?? '').trim(), name, price: numeric(source[map.price]), unit: String(source[map.unit] ?? '').trim(), barcode: String(source[map.barcode] ?? '').trim(), category: String(source[map.category] ?? '').trim() || match?.category || 'ยังไม่จัดหมวด' };
  });
  const next = cleanProducts(rows); if (!next.length) { els.importMessage.textContent = 'ไม่พบรายการสินค้าที่มีราคา ตรวจการจับคู่คอลัมน์อีกครั้ง'; return; }
  saveImported(next); els.importMessage.textContent = `นำเข้าสำเร็จ ${next.length.toLocaleString('th-TH')} สินค้า`; els.dialog.close();
}
function saveImported(next) { products = next; save(); setProducts(products, 'ข้อมูลใหม่'); }
els.openImport.onclick = () => els.dialog.showModal();
els.search.oninput = () => { els.clear.hidden = !els.search.value; render(); }; els.clear.onclick = () => { els.search.value = ''; els.clear.hidden = true; render(); };
document.querySelector('#all-categories').onclick = () => { activeCategory = 'ทั้งหมด'; render(); };
els.file.onchange = async event => {
  const file = event.target.files[0]; if (!file || !window.XLSX) { els.importMessage.textContent = 'เปิดตัวอ่าน Excel ไม่สำเร็จ ลองเชื่อมต่ออินเทอร์เน็ตแล้วเปิดใหม่'; return; }
  try { const buffer = await file.arrayBuffer(); const workbook = XLSX.read(buffer, { type: 'array', raw: false }); const sheet = workbook.Sheets[workbook.SheetNames[0]]; workbookRows = XLSX.utils.sheet_to_json(sheet, { defval: '' }); headers = Object.keys(workbookRows[0] || {}); if (!headers.length) throw new Error('ไม่พบแถวหัวตาราง'); renderMapping(); els.mappingPanel.hidden = false; els.importMessage.textContent = `พบ ${workbookRows.length.toLocaleString('th-TH')} แถวในชีต ${workbook.SheetNames[0]}`; }
  catch (error) { els.importMessage.textContent = `อ่านไฟล์ไม่ได้: ${error.message}`; }
};
els.importButton.onclick = importRows;
els.exportButton.onclick = () => { const blob = new Blob([JSON.stringify({ updatedAt: new Date().toISOString(), products }, null, 2)], { type: 'application/json' }); const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'products.json' }); link.click(); URL.revokeObjectURL(link.href); };
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
loadData();
