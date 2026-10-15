import { MAX_PHOTOS, MAX_BYTES, canStorePhoto, cropGeometry, photoFilename, IntervalSession } from './core.js';
import { CameraSource, captureJpeg, downloadPhoto, canSharePhoto, sharePhoto, cameraError } from './camera.js';
import { MockSource } from './mock.js';
import { openPhotoStore } from './storage.js?v=0.2.1';
import { defaults, normalizePreferences } from './preferences.js';
import { initializeMotion, enterScreen, animateSheet, pulse, motionScreen } from './motion.js';
const $ = id => document.getElementById(id);
let prefs = { ...defaults }, preferencesSaved = true;
try { prefs = normalizePreferences(JSON.parse(localStorage.getItem('bookscan-preferences'))); } catch { /* Defaults also cover disabled storage. */ }
let mode = 'camera', screen = 'cover', opening = false, manualBusy = false, store = null, photos = [], wakeLock = null, wakeGeneration = 0, openGeneration = 0, noticeTimer, lastCountdown = '';
let cameraAvailable = false;
const mock = new MockSource($('mock'));
const camera = new CameraSource($('camera'), message => {
  cameraAvailable = false;
  if (session.active) session.stop('interrupted');
  showNotice(message, true); render();
});
const session = new IntervalSession({ capture: takePhoto, onChange: render, onError: error => showNotice(cameraError(error), true) });
const settings = {
  interval: { title: '撮影間隔', description: 'ページをめくる速さに合わせて。', values: [[5,'5秒'],[10,'10秒'],[30,'30秒'],[60,'60秒']] },
  orientation: { title: '保存する向き', description: '端末を回しても、写真の縦横比は固定されます。', values: [['portrait','縦 3:4'],['landscape','横 4:3']] },
  delay: { title: '最初の待ち時間', description: '開始ボタンを押してから、最初の一枚を撮るまで。', values: [[0,'すぐに'],[5,'5秒'],[10,'10秒']] },
  total: { title: '撮影枚数', description: '指定した枚数で、自動的に停止します。', values: [[3,'3枚'],[10,'10枚'],[30,'30枚'],[50,'50枚']] }
};
function showNotice(message, error = false) {
  clearTimeout(noticeTimer); $('notice').textContent = message; $('notice').hidden = !message; $('notice').classList.toggle('error', error);
  if (message && !error) noticeTimer = setTimeout(() => { $('notice').hidden = true; }, 4500);
}
function savePreferences() {
  try { localStorage.setItem('bookscan-preferences', JSON.stringify(prefs)); preferencesSaved = true; }
  catch { preferencesSaved = false; }
  document.querySelector('.sheet-footnote').textContent = preferencesSaved ? '設定はこの端末に記憶されます' : 'このブラウザでは設定を記憶できません';
}
function isReady() { return mode === 'mock' ? mock.running : cameraAvailable && camera.ready; }
function isBusy() { return session.active || session.pending || manualBusy || opening; }
function source() { return mode === 'mock' ? $('mock') : $('camera'); }
function render() {
  const state = session.snapshot, ready = isReady(), pending = state.pending || manualBusy;
  $('settings').disabled = pending || opening;
  $('start').disabled = !state.active && (!ready || !store || pending || opening || photos.length >= MAX_PHOTOS);
  $('start').setAttribute('aria-label', state.active ? '撮影を停止' : '連続撮影を開始');
  $('start').classList.toggle('stop', state.active);
  $('start-label').textContent = state.active ? '停止' : pending ? '保存中' : '連続撮影';
  $('single').disabled = isBusy() || !ready || !store || photos.length >= MAX_PHOTOS;
  $('flip-camera').disabled = isBusy() || mode === 'mock';
  $('camera-power').disabled = opening || pending;
  $('camera-power').textContent = opening ? '接続中…' : 'カメラを開く';
  $('try-mock').disabled = opening || pending;
  $('camera-help').textContent = opening ? 'カメラの利用を許可してください' : '「カメラを開く」で撮影を準備します';
  $('camera').hidden = mode !== 'camera' || !ready;
  $('mock').hidden = mode !== 'mock' || !ready;
  $('empty-camera').hidden = ready;
  $('grid').hidden = !ready || !prefs.grid;
  $('toggle-grid').setAttribute('aria-pressed', String(prefs.grid));
  $('mode-tag').hidden = !ready || mode !== 'mock';
  $('source-label').textContent = opening ? 'CONNECTING' : ready ? (mode === 'mock' ? 'MOCK CAMERA' : 'LIVE CAMERA') : 'STANDBY';
  $('status-dot').classList.toggle('live', ready);
  $('viewfinder').classList.toggle('landscape', prefs.orientation === 'landscape');
  $('frame-label').textContent = prefs.orientation === 'portrait' ? '3:4 / PORTRAIT' : '4:3 / LANDSCAPE';
  $('interval-value').textContent = `${prefs.interval}秒`;
  $('orientation-value').textContent = prefs.orientation === 'portrait' ? '縦 3:4' : '横 4:3';
  $('delay-value').textContent = prefs.delay ? `${prefs.delay}秒` : 'すぐに';
  $('total-button').textContent = `${prefs.total}枚で停止`;
  $('dimensions').textContent = 'JPEG / AUTO CAPTURE';
  if (ready) {
    const s = source(), g = cropGeometry(s.videoWidth ?? s.width, s.videoHeight ?? s.height, prefs.orientation);
    $('dimensions').textContent = `${g.width} × ${g.height} / JPEG`;
  }
  $('countdown').hidden = !state.active || state.pending;
  const count = String(Math.max(1, Math.ceil(state.remainingMs / 1000)));
  if (count !== lastCountdown && state.active && !state.pending) { $('countdown').textContent = count; pulse($('countdown')); lastCountdown = count; }
  $('shot-count').textContent = `${String(state.count).padStart(2,'0')} / ${state.total || prefs.total}`;
  const labels = { complete: `${state.count}枚の撮影が完了`, stopped: '撮影を停止しました', hidden: '画面を離れたため停止', error: '撮影エラー・停止中', interrupted: 'カメラ中断・停止中' };
  $('session-status').textContent = pending ? '写真を保存中…' : state.active ? `${state.count} / ${state.total} 枚 · 自動撮影中` : labels[state.reason] || (ready ? '準備完了' : 'カメラを準備してください');
  document.querySelectorAll('[data-sheet]').forEach(button => { button.disabled = pending || opening; });
  document.querySelectorAll('[data-mode]').forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.mode === mode)); button.disabled = pending || opening; });
  document.querySelectorAll('.photo-actions button,.detail-actions button').forEach(button => { button.disabled = isBusy(); });
  if (!state.active) releaseWakeLock();
}
async function takePhoto() {
  if (document.hidden || screen !== 'camera') throw new Error('撮影画面が表示されていないため、撮影を停止しました。');
  if (!isReady()) throw new Error('映像を利用できません。カメラを開き直してください。');
  if (!store) throw new Error('保存領域を利用できません。');
  const photoMode = mode, photoOrientation = prefs.orientation;
  const result = await captureJpeg(source(), photoOrientation);
  if (!canStorePhoto(photos, result.blob.size)) throw new Error('保存上限（100枚 / 100MB）です。必要な写真を書き出してからアプリ内の写真を削除してください。');
  const date = new Date(), id = crypto.randomUUID();
  const item = { ...result, id, createdAt: date.toISOString(), mode: photoMode, orientation: photoOrientation, filename: photoFilename(date, id, photoMode) };
  await store.put(item);
  photos.unshift({ ...item, url: URL.createObjectURL(item.blob) });
  renderGallery();
  $('flash').classList.remove('fire'); void $('flash').offsetWidth; $('flash').classList.add('fire');
  pulse($('open-gallery'));
}
function photoActions(item, target, includeDelete = true) {
  function action(label, cls, callback) { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.className = cls; button.disabled = isBusy(); button.onclick = callback; target.append(button); }
  action('保存 · JPEG','save', () => { downloadPhoto(item); showNotice('JPEGの書き出しを開始しました。端末側で保存先を確認してください。'); });
  if (includeDelete) action('削除','delete', async () => {
    if (!confirm('この写真をアプリ内から削除しますか？書き出したファイルは残ります。')) return;
    try { await store.remove(item.id); photos = photos.filter(p => p.id !== item.id); URL.revokeObjectURL(item.url); renderGallery(); render(); }
    catch(error) { showNotice(cameraError(error), true); }
  });
  if (canSharePhoto(item)) action('写真に保存 / 共有','share', () => sharePhoto(item).catch(error => { if (error.name !== 'AbortError') showNotice('共有できませんでした。「保存 · JPEG」をお試しください。', true); }));
}
function renderGallery() {
  $('gallery').replaceChildren(); $('gallery-empty').hidden = photos.length > 0;
  $('gallery-count').textContent = photos.length; $('thumbnail-count').textContent = photos.length;
  $('latest-photo').hidden = !photos.length;
  if (photos.length) $('latest-photo').src = photos[0].url; else $('latest-photo').removeAttribute('src');
  const bytes = photos.reduce((sum,p) => sum + p.blob.size,0);
  $('storage-status').textContent = `${photos.length} / ${MAX_PHOTOS} 枚 · ${(bytes/1024/1024).toFixed(1)} / ${MAX_BYTES/1024/1024} MB`;
  for (const item of photos) {
    const card = document.createElement('article'); card.className = 'photo-card'; card.dataset.photoId = item.id;
    const open = document.createElement('button'); open.type = 'button'; open.className = 'photo-open'; open.setAttribute('aria-label', `${item.mode === 'mock' ? 'モック' : '実写'}写真を拡大`);
    const img = new Image(); img.src = item.url; img.alt = item.mode === 'mock' ? 'モックで撮影したテスト画像' : 'カメラで撮影した写真'; img.loading = 'lazy';
    const badge = document.createElement('span'); badge.className = 'photo-badge'; badge.textContent = item.mode === 'mock' ? 'MOCK' : 'PHOTO';
    open.append(img,badge); open.onclick = () => {
      $('large-photo').src = item.url;
      $('photo-info').textContent = `${item.width} × ${item.height} · ${new Date(item.createdAt).toLocaleString('ja-JP')} · JPEG`;
      $('detail-actions').replaceChildren(); photoActions(item,$('detail-actions'),false); $('photo-dialog').showModal();
    };
    const body = document.createElement('div'); body.className = 'photo-body';
    const meta = document.createElement('div'); meta.className = 'photo-meta';
    for (const text of [new Date(item.createdAt).toLocaleTimeString('ja-JP',{hour12:false}),`${item.width} × ${item.height}`]) { const span = document.createElement('span'); span.textContent = text; meta.append(span); }
    const actions = document.createElement('div'); actions.className = 'photo-actions'; photoActions(item,actions);
    body.append(meta,actions); card.append(open,body); $('gallery').append(card);
  }
}
async function openCamera() {
  if (screen !== 'camera') return;
  const generation = ++openGeneration; opening = true; showNotice(''); render();
  try { await camera.start(prefs.facing); if (generation !== openGeneration) return; cameraAvailable = true; }
  catch(error) { if (generation === openGeneration && error.name !== 'AbortError') showNotice(cameraError(error),true); }
  finally { if (generation === openGeneration) { opening = false; render(); } }
}
function closeSources(reason='stopped') {
  ++openGeneration; opening = false;
  if (session.active) session.stop(reason);
  camera.stop(); cameraAvailable = false; mock.stop(); render();
}
function navigate(next, { activate = false } = {}) {
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  if (next !== 'camera') closeSources();
  screen = next; document.body.dataset.screen = screen;
  for (const name of ['cover','camera','gallery']) $(name === 'cover' ? name : `${name}-screen`).hidden = name !== screen;
  const target = $(screen === 'cover' ? screen : `${screen}-screen`);
  showNotice(''); enterScreen(target); motionScreen(screen);
  // Permission request stays inside the user's tap, before any transition promise.
  if (screen === 'camera' && activate) { if (mode === 'mock') mock.start(); else if (!isReady()) openCamera(); }
  target.tabIndex = -1;
  target.focus({preventScroll:true});
  render();
}
function selectMode(next) {
  if (session.pending || manualBusy || opening) return;
  closeSources(); mode = next;
  $('menu-dialog').close();
  if (screen !== 'camera') navigate('camera');
  if (mode === 'mock') { mock.start(); showNotice('モック画像で撮影・保存を試せます。'); render(); }
  else openCamera();
}
function openSettings(key) {
  if (session.pending || manualBusy || opening) return;
  if (session.active) { session.stop(); showNotice('設定変更のため撮影を停止しました。'); }
  const config = settings[key];
  $('sheet-title').textContent = config.title; $('sheet-description').textContent = config.description;
  const options = $('sheet-options'); options.replaceChildren(); options.setAttribute('role','group'); options.setAttribute('aria-label',config.title);
  for (const [value,label] of config.values) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.setAttribute('aria-pressed', String(prefs[key] === value));
    button.onclick = () => {
      if (isBusy()) return;
      prefs[key] = value; savePreferences();
      if (key === 'total') { session.total = 0; session.count = 0; }
      for (const peer of options.children) peer.setAttribute('aria-pressed', String(peer === button));
      pulse(button); render();
    };
    options.append(button);
  }
  $('settings-dialog').showModal(); animateSheet($('settings-dialog'));
}
async function acquireWakeLock() {
  if (!navigator.wakeLock) { $('wake-status').textContent = '消灯防止に未対応です'; return; }
  const generation = ++wakeGeneration;
  try {
    const lock = await navigator.wakeLock.request('screen');
    if (generation !== wakeGeneration || !session.active || document.hidden) { await lock.release(); return; }
    wakeLock = lock; $('wake-status').textContent = '画面の消灯防止：有効';
    lock.addEventListener('release', () => { if (wakeLock === lock) { wakeLock = null; $('wake-status').textContent = '画面の消灯防止：解除'; } });
  } catch { $('wake-status').textContent = '撮影中は画面を点灯したままにしてください'; }
}
function releaseWakeLock() { ++wakeGeneration; if (wakeLock) { const lock = wakeLock; wakeLock = null; lock.release().catch(()=>{}); } $('wake-status').textContent = '画面の消灯防止：待機中'; }
$('enter-camera').onclick = () => navigate('camera',{activate:true});
$('camera-power').onclick = () => mode === 'mock' ? (mock.start(),render()) : openCamera();
$('try-mock').onclick = () => selectMode('mock');
$('flip-camera').onclick = () => { if (isBusy()) return; prefs.facing = prefs.facing === 'environment' ? 'user' : 'environment'; savePreferences(); openCamera(); };
$('toggle-grid').onclick = () => { prefs.grid = !prefs.grid; savePreferences(); render(); };
$('open-menu').onclick = () => { if (session.active) { session.stop(); showNotice('撮影を停止しました。'); } $('menu-dialog').showModal(); animateSheet($('menu-dialog')); };
$('go-home').onclick = () => navigate('cover');
$('open-gallery').onclick = $('menu-gallery').onclick = () => navigate('gallery');
$('back-camera').onclick = () => navigate('camera',{activate:true});
$('close-photo').onclick = () => $('photo-dialog').close();
for (const button of document.querySelectorAll('[data-mode]')) button.onclick = () => selectMode(button.dataset.mode);
for (const button of document.querySelectorAll('[data-sheet]')) button.onclick = () => openSettings(button.dataset.sheet);
for (const button of document.querySelectorAll('[data-close-dialog]')) button.onclick = () => button.closest('dialog').close();
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', event => { if (event.target !== dialog) return; const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); });
$('start').onclick = () => {
  if (session.active) { session.stop(); return; }
  try {
    if (prefs.total > MAX_PHOTOS - photos.length) throw new Error('保存できる枚数が足りません。撮影枚数を減らすか、必要な写真を書き出してから削除してください。');
    showNotice(''); lastCountdown = '';
    session.start({intervalMs:prefs.interval*1000,delayMs:prefs.delay*1000,total:prefs.total}); acquireWakeLock();
  } catch(error) { showNotice(cameraError(error),true); }
};
$('single').onclick = async () => {
  if (isBusy()) return;
  manualBusy = true; showNotice(''); render();
  try { await takePhoto(); showNotice('1枚撮影しました。左下の写真から保存できます。'); }
  catch(error) { showNotice(cameraError(error),true); }
  finally { manualBusy = false; render(); }
};
document.addEventListener('visibilitychange', () => { if (document.hidden) closeSources('hidden'); });
window.addEventListener('pagehide', () => closeSources('hidden'));
$('camera').addEventListener('resize',render);
initializeMotion();
render();
try {
  store = await openPhotoStore();
  photos = (await store.all()).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(item=>({...item,url:URL.createObjectURL(item.blob)})); renderGallery();
} catch(error) { store = null; $('storage-status').textContent = '保存領域を利用できません'; showNotice(`写真の保存領域を開けません。Safariの通常のタブで開き直してください。${error.message || ''}`,true); }
render();
const params = new URLSearchParams(location.search);
if (params.get('mode') === 'mock') { mode = 'mock'; navigate('camera',{activate:true}); }
