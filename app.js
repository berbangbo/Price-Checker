const els = {
  search: document.querySelector('#search-input'), clear: document.querySelector('#clear-search'),
  categories: document.querySelector('#category-list'), products: document.querySelector('#product-list'),
  count: document.querySelector('#result-count'), heading: document.querySelector('#results-heading'), status: document.querySelector('#data-status'),
  dialog: document.querySelector('#import-dialog'), openImport: document.querySelector('#open-import'), file: document.querySelector('#file-input'),
  mappingPanel: document.querySelector('#mapping-panel'), mappingFields: document.querySelector('#mapping-fields'), importButton: document.querySelector('#import-data'),
  importMessage: document.querySelector('#import-message'), rules: document.querySelector('#category-rules'), exportButton: document.querySelector('#export-data'),
  scanButton: document.querySelector('#scan-barcode'), scanDialog: document.querySelector('#scanner-dialog'), closeScanner: document.querySelector('#close-scanner'), scannerMessage: document.querySelector('#scanner-message'), torch: document.querySelector('#toggle-torch'), capturePhoto: document.querySelector('#capture-photo'), photoInput: document.querySelector('#photo-input'),
};
const adminEls = {
  button: document.querySelector('#admin-button'), dialog: document.querySelector('#admin-dialog'), close: document.querySelector('#close-admin'),
  loginForm: document.querySelector('#admin-login-form'), email: document.querySelector('#admin-email'), password: document.querySelector('#admin-password'),
  signedIn: document.querySelector('#admin-signed-in'), user: document.querySelector('#admin-user'), logout: document.querySelector('#admin-logout'), message: document.querySelector('#admin-message'),
  editor: document.querySelector('#price-editor-dialog'), closeEditor: document.querySelector('#close-price-editor'), editorForm: document.querySelector('#price-editor-form'),
  productName: document.querySelector('#edit-product-name'), productDetail: document.querySelector('#edit-product-detail'), unit: document.querySelector('#edit-unit'),
  price: document.querySelector('#edit-price'), reason: document.querySelector('#edit-reason'), expires: document.querySelector('#edit-expires'), reset: document.querySelector('#reset-price'), editorMessage: document.querySelector('#price-editor-message')
};
const DEFAULT_CATEGORY_RULES = `โค้ก,เป๊ปซี่,น้ำดื่ม,น้ำอัดลม,ชา,กาแฟ,นม,โซดา,เบียร์,โออิชิ,อิชิตัน = เครื่องดื่ม
เลย์,ขนม,มันฝรั่ง,คุกกี้,เยลลี่,ลูกอม,หมากฝรั่ง,เวเฟอร์,ช็อกโกแลต = ขนม
มาม่า,ไวไว,บะหมี่,วุ้นเส้น,ปลากระป๋อง,ซอส,น้ำปลา = อาหารแห้ง
บุหรี่,กรองทิพย์,มาร์ลโบโร,ยาเส้น = บุหรี่
แชมพู,สบู่,ครีม,โฟม,โรลออน,ยาสีฟัน,ผ้าอนามัย = ของใช้ส่วนตัว
ผงซักฟอก,น้ำยาล้างจาน,น้ำยาปรับผ้านุ่ม,ทิชชู่,ถุงขยะ = ของใช้ในบ้าน`;
const fields = [
  ['sku', 'SKU / รหัสสินค้า', ['sku', 'รหัสสินค้า', 'product code', 'item code', 'plu']],
  ['name', 'ชื่อสินค้า', ['ชื่อสินค้า', 'product name', 'item name', 'description', 'name']],
  ['price', 'ราคาขาย', ['ราคาขาย', 'selling price', 'sale price', 'price']],
  ['unit', 'Unit / หน่วย', ['unit', 'หน่วย', 'uom']],
  ['barcode', 'บาร์โค้ด', ['barcode', 'บาร์โค้ด', 'ean']],
  ['category', 'หมวดจาก POS (ถ้ามี)', ['category', 'หมวดหมู่', 'department', 'group']],
];
let products = [], baseProducts = [], activeCategory = 'ทั้งหมด', workbookRows = [], headers = [];
let scanner = null, torchOn = false;
let adminSession = null, editingProduct = null, editingOffer = null;
let priceOverrides = new Map();
const normalize = value => String(value ?? '').trim().toLocaleLowerCase('th');
const keyify = value => normalize(value).replace(/[\s\-_/().]/g, '');
const barcodeKey = value => String(value ?? '').replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
const money = value => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
const overrideKey = (product, offer) => `${product.barcode ? `barcode:${barcodeKey(product.barcode)}` : `sku:${product.sku}`}|unit:${normalize(offer.unit || '')}`;

function applyOverrides(shouldRender = true) {
  products = baseProducts.map(product => ({ ...product, offers: product.offers.map(offer => {
    const override = priceOverrides.get(overrideKey(product, offer));
    return override ? { ...offer, price: Number(override.price), isOverride: true, override } : { ...offer, isOverride: false };
  }) }));
  if (shouldRender) render();
}
async function refreshOverrides() {
  if (!window.priceCheckerBackend) return;
  try { const rows = await window.priceCheckerBackend.getOverrides(); priceOverrides = new Map(rows.map(row => [row.product_key, row])); applyOverrides(); }
  catch (error) { console.warn('Could not load price overrides', error); }
}
function updateAdminUi() {
  const signedIn = Boolean(adminSession);
  adminEls.loginForm.hidden = signedIn; adminEls.signedIn.hidden = !signedIn;
  adminEls.user.textContent = signedIn ? `เข้าสู่ระบบแล้ว: ${adminSession.user.email}` : '';
  adminEls.button.textContent = signedIn ? '✏️' : '🔐'; render();
}
async function setupBackend() {
  if (!window.priceCheckerBackend) return;
  adminSession = await window.priceCheckerBackend.session(); updateAdminUi(); await refreshOverrides();
  window.priceCheckerBackend.subscribe(refreshOverrides);
  window.priceCheckerBackend.client.auth.onAuthStateChange((_event, session) => { adminSession = session; updateAdminUi(); });
}

function render() {
  const query = normalize(els.search.value);
  const categories = ['ทั้งหมด', ...[...new Set(products.map(p => p.category || 'ยังไม่จัดหมวด'))].sort((a, b) => a.localeCompare(b, 'th'))];
  els.categories.replaceChildren(...categories.map(category => {
    const button = document.createElement('button'); button.className = `category-button${category === activeCategory ? ' active' : ''}`; button.textContent = category;
    button.onclick = () => { activeCategory = category; render(); }; return button;
  }));
  const compactQuery = keyify(query);
  const scannedBarcode = barcodeKey(query);
  const matches = products.filter(p => (activeCategory === 'ทั้งหมด' || (p.category || 'ยังไม่จัดหมวด') === activeCategory) && (!query || p.search.includes(query) || (p.searchCompact || keyify(p.search)).includes(compactQuery) || (scannedBarcode && barcodeKey(p.barcode) === scannedBarcode)));
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
  if (adminSession) {
    const card = node.querySelector('.product-card');
    card.classList.add('admin-editable');
    list.querySelectorAll('.price-line').forEach((line, index) => {
      const offer = product.offers[index];
      if (offer.isOverride) line.classList.add('override-price');
      line.onclick = event => { event.stopPropagation(); openPriceEditor(product, offer); };
    });
    card.onclick = () => openPriceEditor(product, product.offers[0]);
  }
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
  return [...grouped.values()].map(product => {
    const searchable = [product.name, product.sku, product.barcode, product.category, ...product.offers.map(o => o.unit)].join(' ');
    return { ...product, offers: product.offers.sort((a, b) => a.price - b.price), search: normalize(searchable), searchCompact: keyify(searchable) };
  });
}
function save() { localStorage.setItem('price-finder-products', JSON.stringify(baseProducts)); localStorage.setItem('price-finder-updated', new Date().toISOString()); }
function setProducts(next, source) { baseProducts = next; applyOverrides(false); const date = localStorage.getItem('price-finder-updated'); els.status.textContent = `${products.length.toLocaleString('th-TH')} สินค้า${date ? ` · อัปเดต ${new Date(date).toLocaleDateString('th-TH')}` : source ? ` · ${source}` : ''}`; render(); }
async function loadData() {
  try {
    const response = await fetch('products.json', { cache: 'no-store' });
    const data = await response.json();
    setProducts(data.products || [], 'ข้อมูลจาก GitHub');
  }
  catch {
    const stored = localStorage.getItem('price-finder-products');
    if (stored) setProducts(JSON.parse(stored), 'ข้อมูลในเครื่องชั่วคราว');
    else setProducts([], 'ยังไม่มีข้อมูล');
  }
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
async function stopScanner() {
  if (!scanner) return;
  const active = scanner;
  scanner = null;
  try { await active.stop(); } catch { /* Scanner already stopped. */ }
  try { active.clear(); } catch { /* Scanner already cleared. */ }
  torchOn = false;
  els.torch.hidden = true;
}
async function completeScan(decodedText) {
  els.search.value = decodedText;
  els.clear.hidden = false;
  render();
  els.scannerMessage.textContent = `พบรหัส ${decodedText}`;
  await stopScanner();
  els.scanDialog.close();
}
async function startScanner() {
  if (!window.Html5Qrcode || !navigator.mediaDevices?.getUserMedia) {
    els.scanDialog.showModal();
    els.scannerMessage.textContent = 'อุปกรณ์นี้ยังเปิดกล้องสแกนไม่ได้ ให้พิมพ์เลขบาร์โค้ดแทน';
    return;
  }
  els.scanDialog.showModal();
  els.scannerMessage.textContent = 'อนุญาตให้ใช้กล้อง แล้วหันกล้องไปที่บาร์โค้ด';
  try {
    scanner = new Html5Qrcode('barcode-reader');
    const cameras = await Html5Qrcode.getCameras();
    const rearCamera = cameras.find(camera => /back|rear|environment/i.test(camera.label)) || cameras[cameras.length - 1];
    const cameraSource = rearCamera ? rearCamera.id : { facingMode: 'environment' };
    const formats = window.Html5QrcodeSupportedFormats;
    const retailFormats = formats ? [formats.EAN_13, formats.EAN_8, formats.UPC_A, formats.UPC_E, formats.CODE_128].filter(Boolean) : undefined;
    await scanner.start(cameraSource, { fps: 18, qrbox: { width: 300, height: 145 }, disableFlip: true, formatsToSupport: retailFormats, experimentalFeatures: { useBarCodeDetectorIfSupported: true } }, completeScan);
    const video = document.querySelector('#barcode-reader video');
    if (video) { video.setAttribute('playsinline', 'true'); video.setAttribute('webkit-playsinline', 'true'); }
    const capabilities = scanner.getRunningTrackCapabilities?.() || {};
    if (capabilities.focusMode?.includes?.('continuous')) {
      try { await scanner.applyVideoConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch { /* Browser chose its own focus mode. */ }
    }
    els.torch.hidden = !capabilities.torch;
    els.scannerMessage.textContent = 'วางเส้นบาร์โค้ดไว้ในกรอบ ระบบจะค้นหาให้อัตโนมัติ';
  } catch (error) {
    const detail = [error?.name, error?.message].filter(Boolean).join(': ');
    els.scannerMessage.textContent = `เปิดกล้องไม่ได้${detail ? ` (${detail})` : ''}`;
    await stopScanner();
  }
}
function numeric(value) { return Number(String(value ?? '').replace(/[^0-9.\-]/g, '')); }
function selectedMap() { return Object.fromEntries([...els.mappingFields.querySelectorAll('select')].map(select => [select.dataset.field, select.value])); }
async function importRows() {
  const map = selectedMap();
  if (!map.name || !map.price) { els.importMessage.textContent = 'ต้องเลือกอย่างน้อย “ชื่อสินค้า” และ “ราคาขาย”'; return; }
  els.importButton.disabled = true;
  els.importMessage.textContent = `กำลังจัดข้อมูล ${workbookRows.length.toLocaleString('th-TH')} แถว…`;
  await new Promise(resolve => setTimeout(resolve, 30));
  try {
    const rules = parseRules(els.rules.value);
    const rows = workbookRows.map(source => {
      const name = String(source[map.name] ?? '').trim();
      const match = rules.find(rule => rule.keywords.some(keyword => normalize(name).includes(keyword)));
      return { sku: String(source[map.sku] ?? '').trim(), name, price: numeric(source[map.price]), unit: String(source[map.unit] ?? '').trim(), barcode: String(source[map.barcode] ?? '').trim(), category: String(source[map.category] ?? '').trim() || match?.category || 'ยังไม่จัดหมวด' };
    });
    const next = cleanProducts(rows);
    if (!next.length) throw new Error('ไม่พบรายการสินค้าที่มีราคา ตรวจการจับคู่คอลัมน์อีกครั้ง');
    const saved = saveImported(next);
    els.importMessage.textContent = saved ? `นำเข้าสำเร็จ ${next.length.toLocaleString('th-TH')} สินค้า` : `นำเข้าสำเร็จ ${next.length.toLocaleString('th-TH')} สินค้า (เก็บชั่วคราว ให้ดาวน์โหลด products.json ก่อนรีเฟรช)`;
    setTimeout(() => els.dialog.close(), 400);
  } catch (error) {
    els.importMessage.textContent = `นำเข้าไม่สำเร็จ: ${error.message || 'กรุณาลองใหม่'}`;
  } finally {
    els.importButton.disabled = false;
  }
}
function saveImported(next) {
  baseProducts = next;
  let saved = true;
  try { save(); }
  catch { saved = false; }
  setProducts(baseProducts, saved ? 'ข้อมูลใหม่' : 'ข้อมูลชั่วคราว');
  return saved;
}
function openPriceEditor(product, offer) {
  if (!adminSession) return;
  editingProduct = product; editingOffer = offer;
  adminEls.productName.textContent = product.name || 'สินค้า';
  adminEls.productDetail.textContent = [product.sku, product.barcode].filter(Boolean).join(' · ');
  adminEls.unit.replaceChildren(...product.offers.map(item => {
    const option = document.createElement('option'); option.value = overrideKey(product, item); option.textContent = item.unit || 'หน่วย';
    option.selected = item === offer; return option;
  }));
  const existing = priceOverrides.get(overrideKey(product, offer));
  adminEls.price.value = offer.price;
  adminEls.reason.value = existing?.reason || '';
  adminEls.expires.value = existing?.expires_at ? existing.expires_at.slice(0, 10) : '';
  adminEls.editorMessage.textContent = '';
  adminEls.editor.showModal();
}
function chosenOffer() { return editingProduct?.offers.find(offer => overrideKey(editingProduct, offer) === adminEls.unit.value); }
adminEls.unit.onchange = () => {
  editingOffer = chosenOffer(); const existing = priceOverrides.get(adminEls.unit.value);
  adminEls.price.value = editingOffer?.price ?? ''; adminEls.reason.value = existing?.reason || ''; adminEls.expires.value = existing?.expires_at ? existing.expires_at.slice(0, 10) : '';
};
adminEls.button.onclick = () => { adminEls.message.textContent = ''; adminEls.dialog.showModal(); };
adminEls.close.onclick = () => adminEls.dialog.close();
adminEls.loginForm.onsubmit = async event => {
  event.preventDefault(); if (!window.priceCheckerBackend) { adminEls.message.textContent = 'ยังเชื่อมฐานข้อมูลไม่สำเร็จ'; return; }
  adminEls.message.textContent = 'กำลังเข้าสู่ระบบ…';
  try { await window.priceCheckerBackend.signIn(adminEls.email.value.trim(), adminEls.password.value); adminEls.password.value = ''; adminEls.message.textContent = ''; adminEls.dialog.close(); }
  catch (error) { adminEls.message.textContent = `เข้าสู่ระบบไม่ได้: ${error.message}`; }
};
adminEls.logout.onclick = async () => { await window.priceCheckerBackend?.signOut(); adminEls.dialog.close(); };
adminEls.closeEditor.onclick = () => adminEls.editor.close();
adminEls.editorForm.onsubmit = async event => {
  event.preventDefault(); const offer = chosenOffer(); if (!offer || !editingProduct) return;
  const price = Number(adminEls.price.value); if (!Number.isFinite(price) || price < 0) { adminEls.editorMessage.textContent = 'กรุณาใส่ราคาที่ถูกต้อง'; return; }
  adminEls.editorMessage.textContent = 'กำลังบันทึก…';
  try {
    await window.priceCheckerBackend.saveOverride({ product_key: overrideKey(editingProduct, offer), sku: editingProduct.sku || null, barcode: editingProduct.barcode || null, unit: offer.unit || null, price, reason: adminEls.reason.value.trim() || null, expires_at: adminEls.expires.value ? `${adminEls.expires.value}T23:59:59+07:00` : null });
    await refreshOverrides(); adminEls.editor.close();
  } catch (error) { adminEls.editorMessage.textContent = `บันทึกไม่ได้: ${error.message}`; }
};
adminEls.reset.onclick = async () => {
  if (!editingProduct || !window.confirm('ลบราคาแก้ไข แล้วกลับไปใช้ราคา POS?')) return;
  try { await window.priceCheckerBackend.deleteOverride(adminEls.unit.value); await refreshOverrides(); adminEls.editor.close(); }
  catch (error) { adminEls.editorMessage.textContent = `ลบไม่ได้: ${error.message}`; }
};
els.openImport.onclick = () => els.dialog.showModal();
els.search.oninput = () => { els.clear.hidden = !els.search.value; render(); }; els.clear.onclick = () => { els.search.value = ''; els.clear.hidden = true; render(); };
document.querySelector('#all-categories').onclick = () => { activeCategory = 'ทั้งหมด'; render(); };
els.file.onchange = async event => {
  const file = event.target.files[0]; if (!file || !window.XLSX) { els.importMessage.textContent = 'เปิดตัวอ่าน Excel ไม่สำเร็จ ลองเชื่อมต่ออินเทอร์เน็ตแล้วเปิดใหม่'; return; }
  try { const buffer = await file.arrayBuffer(); const workbook = XLSX.read(buffer, { type: 'array', raw: false }); const sheet = workbook.Sheets[workbook.SheetNames[0]]; workbookRows = XLSX.utils.sheet_to_json(sheet, { defval: '' }); headers = Object.keys(workbookRows[0] || {}); if (!headers.length) throw new Error('ไม่พบแถวหัวตาราง'); renderMapping(); els.mappingPanel.hidden = false; els.importMessage.textContent = `พบ ${workbookRows.length.toLocaleString('th-TH')} แถวในชีต ${workbook.SheetNames[0]}`; }
  catch (error) { els.importMessage.textContent = `อ่านไฟล์ไม่ได้: ${error.message}`; }
};
els.importButton.onclick = importRows;
els.exportButton.onclick = () => { const blob = new Blob([JSON.stringify({ updatedAt: new Date().toISOString(), products: baseProducts }, null, 2)], { type: 'application/json' }); const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'products.json' }); link.click(); URL.revokeObjectURL(link.href); };
els.scanButton.onclick = startScanner;
els.closeScanner.onclick = async () => { await stopScanner(); els.scanDialog.close(); };
els.scanDialog.addEventListener('cancel', async event => { event.preventDefault(); await stopScanner(); els.scanDialog.close(); });
els.torch.onclick = async () => {
  if (!scanner?.applyVideoConstraints) return;
  try {
    torchOn = !torchOn;
    await scanner.applyVideoConstraints({ advanced: [{ torch: torchOn }] });
    els.torch.textContent = torchOn ? '🔦 ปิดไฟฉาย' : '🔦 เปิดไฟฉาย';
  } catch { els.scannerMessage.textContent = 'เครื่องนี้เปิดไฟฉายผ่านเว็บไม่ได้'; }
};
els.capturePhoto.onclick = () => els.photoInput.click();
els.photoInput.onchange = async event => {
  const file = event.target.files[0];
  if (!file || !window.Html5Qrcode) return;
  els.scannerMessage.textContent = 'กำลังอ่านบาร์โค้ดจากภาพ…';
  await stopScanner();
  try {
    scanner = new Html5Qrcode('barcode-reader');
    const decodedText = await scanner.scanFile(file, true);
    await completeScan(decodedText);
  } catch {
    els.scannerMessage.textContent = 'อ่านบาร์โค้ดจากภาพไม่สำเร็จ ลองถ่ายใกล้ขึ้นและให้บาร์โค้ดเต็มกรอบ';
    await stopScanner();
  } finally { event.target.value = ''; }
};
els.rules.value = DEFAULT_CATEGORY_RULES;
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
loadData();
setupBackend();
