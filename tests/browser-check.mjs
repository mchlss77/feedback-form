/*
 * Наскрізна перевірка форми в headless Chrome через DevTools Protocol.
 * Без npm-залежностей: потрібні Node 22+ (вбудований WebSocket) і Google Chrome.
 *
 * Запуск:   node tests/browser-check.mjs
 * Опції:    CHROME_PATH=/шлях/до/chrome  SCREENSHOT_DIR=./screenshots  JSON=1
 * Для Tailwind CDN потрібен інтернет.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE_URL = pathToFileURL(path.join(ROOT, 'index.html')).href;
const SHOTS = process.env.SCREENSHOT_DIR ? path.resolve(process.env.SCREENSHOT_DIR) : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------
 * Запуск Chrome і клієнт CDP
 * ------------------------------------------------------------------ */

const profile = mkdtempSync(path.join(tmpdir(), 'equilock-chrome-'));
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--remote-debugging-port=0',
    '--user-data-dir=' + profile,
    '--no-first-run',
    '--no-default-browser-check',
    '--allow-file-access-from-files',
    'about:blank',
  ],
  { stdio: 'ignore' }
);

function cleanup() {
  try { chrome.kill(); } catch {}
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}

const portFile = path.join(profile, 'DevToolsActivePort');
for (let i = 0; i < 150 && !existsSync(portFile); i++) await sleep(100);
if (!existsSync(portFile)) {
  cleanup();
  throw new Error('Chrome не запустився: ' + CHROME);
}
await sleep(100);
const port = readFileSync(portFile, 'utf8').split('\n')[0];
const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let seq = 0;
const pending = new Map();
const listeners = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  } else if (msg.method) {
    listeners.forEach((fn) => fn(msg));
  }
};
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

// Помилки JS, console.error/warn і діалоги (alert) під час тестів
const jsErrors = [];
const consoleWarnings = [];
const dialogs = [];
listeners.push((m) => {
  if (m.method === 'Runtime.exceptionThrown') {
    jsErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  }
  if (m.method === 'Runtime.consoleAPICalled') {
    const text = m.params.args.map((a) => a.value ?? a.description).join(' ');
    if (m.params.type === 'error') jsErrors.push(text);
    if (m.params.type === 'warning') consoleWarnings.push(text);
  }
  if (m.method === 'Page.javascriptDialogOpening') {
    dialogs.push(m.params.message);
    send('Page.handleJavaScriptDialog', { accept: true });
  }
});

await send('Page.enable');
await send('Runtime.enable');
// Без цього headless-сторінка не має фокусу і focus/blur не спрацьовують
await send('Emulation.setFocusEmulationEnabled', { enabled: true });

/* ------------------------------------------------------------------
 * Хелпери
 * ------------------------------------------------------------------ */

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || expression);
  return r.result.value;
}

async function viewport(width, height = 800, mobile = false) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
}

async function fresh() {
  const loaded = new Promise((res) => {
    const fn = (m) => {
      if (m.method === 'Page.loadEventFired') {
        listeners.splice(listeners.indexOf(fn), 1);
        res();
      }
    };
    listeners.push(fn);
  });
  await send('Page.navigate', { url: PAGE_URL });
  await loaded;
  // Чекаємо, поки Tailwind CDN згенерує стилі
  for (let i = 0; i < 100; i++) {
    const bg = await evaluate("getComputedStyle(document.getElementById('submit-btn')).backgroundColor");
    if (bg && bg !== 'rgba(0, 0, 0, 0)') return;
    await sleep(100);
  }
  throw new Error('Tailwind не завантажився (немає інтернету?)');
}

const KEYS = {
  Tab: { code: 'Tab', windowsVirtualKeyCode: 9 },
  Enter: { code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
  Escape: { code: 'Escape', windowsVirtualKeyCode: 27 },
};
async function press(key, shift = false) {
  const base = { key, modifiers: shift ? 8 : 0, ...KEYS[key] };
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base, text: undefined });
  await sleep(30);
}

async function type(text) {
  await send('Input.insertText', { text });
  await sleep(20);
}

async function mouse(type, x, y) {
  await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
}
async function click(x, y) {
  await mouse('mousePressed', x, y);
  await mouse('mouseReleased', x, y);
  await sleep(50);
}
async function center(selector) {
  return evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
}

// Очистити поле, сфокусувати, «надрукувати» текст
async function fill(id, text) {
  await evaluate(`(() => { const el = document.getElementById('${id}'); el.value = ''; el.focus(); })()`);
  if (text) await type(text);
}
async function fillAndBlur(id, text) {
  await fill(id, text);
  await evaluate(`document.getElementById('${id}').blur()`);
  await sleep(20);
}

const state = (id) =>
  evaluate(`(() => { const el = document.getElementById('${id}');
    const msg = document.getElementById('${id}-error');
    return { value: el.type === 'checkbox' ? el.checked : el.value,
             invalid: el.getAttribute('aria-invalid'),
             message: msg.textContent,
             active: document.activeElement && document.activeElement.id }; })()`);

const activeId = () => evaluate('document.activeElement && document.activeElement.id');
const modalOpen = () => evaluate("!document.getElementById('success-modal').classList.contains('hidden')");

async function fillValid(overrides = {}) {
  const v = {
    name: 'Олена Коваль',
    email: 'olena@example.com',
    phone: '+380501234567',
    message: 'Не отримала USDT після закриття угоди',
    ...overrides,
  };
  for (const id of ['name', 'email', 'phone', 'message']) await fillAndBlur(id, v[id]);
  if (overrides.agreement !== false) {
    await evaluate("(() => { const c = document.getElementById('agreement'); if (!c.checked) c.click(); })()");
  }
}

async function submitByKeyboard() {
  await evaluate("document.getElementById('submit-btn').focus()");
  await press('Enter');
}

async function submitAndWaitModal() {
  await submitByKeyboard();
  for (let i = 0; i < 30 && !(await modalOpen()); i++) await sleep(50);
  return modalOpen();
}

async function screenshot(name, fullPage = true) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: fullPage });
  writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(data, 'base64'));
}

/* ------------------------------------------------------------------
 * Збір результатів
 * ------------------------------------------------------------------ */

const results = [];
async function check(id, title, fn) {
  try {
    const { pass, actual } = await fn();
    results.push({ id, title, pass: !!pass, actual });
  } catch (e) {
    results.push({ id, title, pass: false, actual: 'Виняток: ' + e.message });
  }
}
const short = (s) => JSON.stringify(s);

/* ------------------------------------------------------------------
 * Тести з docs/tests.md
 * ------------------------------------------------------------------ */

await viewport(1280, 900);
await fresh();

await check('7', 'Без валідації при завантаженні', async () => {
  const r = await evaluate(`({
    invalid: document.querySelectorAll('[aria-invalid]').length,
    messages: [...document.querySelectorAll('.field-message')].map(p => p.textContent).join('') })`);
  return { pass: r.invalid === 0 && r.messages === '', actual: 'aria-invalid: ' + r.invalid + ', тексти помилок: ' + short(r.messages) };
});

await check('9', "Порожнє ім'я", async () => {
  await fillAndBlur('name', '');
  const s = await state('name');
  return { pass: s.invalid === 'true' && s.message === "Введіть ім'я.", actual: s.message + ' aria-invalid=' + s.invalid };
});

await check('21', 'Оновлення на input', async () => {
  await fill('name', 'Ол');
  const s = await state('name');
  return { pass: s.invalid === 'false' && s.message === '', actual: 'без blur: aria-invalid=' + s.invalid };
});

const fieldCases = [
  ['10', "Ім'я з 1 символу", 'name', 'Я', "Ім'я має містити щонайменше 2 символи."],
  ['11', 'Email без @', 'email', 'olena.example.com', 'Введіть коректний email, наприклад name@example.com.'],
  ['12', 'Email без доменної зони', 'email', 'olena@example', 'Введіть коректний email, наприклад name@example.com.'],
  ['13', 'Email з 1 символом у зоні', 'email', 'a@b.c', 'Введіть коректний email, наприклад name@example.com.'],
  ['14', 'Телефон закороткий', 'phone', '050123', 'Замало цифр. Формат: +380XXXXXXXXX, наприклад +380501234567.'],
  ['15', 'Телефон задовгий', 'phone', '+3805012345678', 'Забагато цифр. Формат: +380XXXXXXXXX, наприклад +380501234567.'],
  ['16', 'Телефон з літерами', 'phone', '+38050abc4567', 'Номер не може містити літер. Формат: +380XXXXXXXXX, наприклад +380501234567.'],
  ['17', 'Коротке повідомлення', 'message', 'Привіт', 'Повідомлення має містити щонайменше 10 символів.'],
  ['23', "Ім'я лише з пробілів", 'name', '     ', "Введіть ім'я."],
  ['24', 'Повідомлення лише з пробілів', 'message', ' '.repeat(15), 'Введіть повідомлення.'],
  ['28', 'Емодзі в імені', 'name', 'Іван😀', "Ім'я може містити лише літери (кирилиця або латиниця), апостроф, дефіс і пробіл."],
  ['33', "Цифри в імені", 'name', 'Іван2', "Ім'я може містити лише літери (кирилиця або латиниця), апостроф, дефіс і пробіл."],
  ['34', 'XSS в імені', 'name', '<script>alert(1)</script>', "Ім'я може містити лише літери (кирилиця або латиниця), апостроф, дефіс і пробіл."],
];
for (const [id, title, field, input, expected] of fieldCases) {
  await check(id, title, async () => {
    await fillAndBlur(field, input);
    const s = await state(field);
    return { pass: s.invalid === 'true' && s.message === expected && dialogs.length === 0, actual: s.message };
  });
}

const validCases = [
  ['27', 'Емодзі в повідомленні', 'message', 'Дякую за допомогу 🙏🔥'],
  ['29', 'Кирилиця', 'name', 'Ґанна Їжакевич'],
  ['30', 'Латиниця', 'name', 'John Smith'],
  ['31', 'Апостроф і дефіс', 'name', "О'Ніл"],
  ['31', 'Апостроф і дефіс', 'name', 'Анна-Марія'],
  ['32', 'Змішане ім\'я', 'name', 'Ivan Петренко'],
];
for (const [id, title, field, input] of validCases) {
  await check(id, title + ' (' + input + ')', async () => {
    await fillAndBlur(field, input);
    const s = await state(field);
    return { pass: s.invalid === 'false', actual: 'aria-invalid=' + s.invalid + ' ' + s.message };
  });
}

await check('22', "Ім'я з пробілами на краях", async () => {
  await fillAndBlur('name', '  Іван  ');
  const s = await state('name');
  return { pass: s.value === 'Іван' && s.invalid === 'false', actual: 'значення ' + short(s.value) };
});

for (const [id, input] of [['36', '0501234567'], ['37', '+380 50 123 45 67'], ['38', '(050) 123-45-67']]) {
  await check(id, 'Нормалізація телефону ' + input, async () => {
    await fillAndBlur('phone', input);
    const s = await state('phone');
    return {
      pass: s.value === '+380501234567' && s.invalid === 'false' && s.message.includes('+380501234567'),
      actual: short(s.value) + ', ' + s.message,
    };
  });
}

await check('25', 'Дуже довгий текст', async () => {
  await fill('message', 'а'.repeat(5000));
  await evaluate("document.getElementById('message').blur()");
  const s = await state('message');
  const counter = await evaluate("document.getElementById('message-counter').textContent");
  return { pass: s.value.length === 1000 && s.invalid === 'false' && counter === '1000 / 1000', actual: 'довжина ' + s.value.length + ', лічильник ' + short(counter) };
});

await check('25a', 'Лічильник збігається з maxlength для емодзі', async () => {
  await fill('message', '😀'.repeat(600));
  const r = await evaluate(`({ len: document.getElementById('message').value.length,
    counter: document.getElementById('message-counter').textContent })`);
  // maxlength рахує UTF-16, тож 500 емодзі = 1000 одиниць — лічильник має показати межу
  return { pass: r.counter === r.len + ' / 1000', actual: 'value.length=' + r.len + ', лічильник ' + short(r.counter) };
});

await check('26', "Дуже довге ім'я", async () => {
  await fillAndBlur('name', 'А'.repeat(100));
  const s = await state('name');
  return { pass: s.value.length === 50 && s.invalid === 'false', actual: 'довжина ' + s.value.length };
});

await check('19', 'Порожня форма', async () => {
  await fresh();
  await submitByKeyboard();
  const r = await evaluate(`({ invalid: document.querySelectorAll('[aria-invalid="true"]').length,
    active: document.activeElement.id,
    modal: !document.getElementById('success-modal').classList.contains('hidden') })`);
  return { pass: r.invalid === 5 && r.active === 'name' && !r.modal, actual: 'невалідних ' + r.invalid + ', фокус на #' + r.active + ', модалка ' + r.modal };
});

await check('20', 'Фокус на першому невалідному', async () => {
  await fresh();
  await fillValid({ phone: '' });
  await submitByKeyboard();
  const a = await activeId();
  return { pass: a === 'phone', actual: 'фокус на #' + a };
});

await check('18', 'Без згоди', async () => {
  await fresh();
  await fillValid({ agreement: false });
  await submitByKeyboard();
  const s = await state('agreement');
  const wrap = await evaluate("document.querySelector('[data-highlight-for=agreement]').className");
  return {
    pass: s.invalid === 'true' && s.active === 'agreement' && wrap.includes('border-red-500'),
    actual: s.message + ' фокус на #' + s.active,
  };
});

await check('18a', 'Клік по тексту згоди перемикає чекбокс', async () => {
  await fresh();
  const c = await center('label[for=agreement] span');
  await click(c.x, c.y);
  const s = await state('agreement');
  return { pass: s.value === true && s.invalid === 'false', actual: 'checked=' + s.value };
});

let scriptsBefore = 0;
await check('1', 'Успішне надсилання', async () => {
  await fresh();
  scriptsBefore = await evaluate("document.querySelectorAll('script').length");
  await fillValid();
  await evaluate(`window.__modalOpens = 0;
    new MutationObserver(() => { if (!document.getElementById('success-modal').classList.contains('hidden')) window.__modalOpens++; })
      .observe(document.getElementById('success-modal'), { attributes: true, attributeFilter: ['class'] });`);
  await submitByKeyboard();
  const busy = await evaluate(`({ d: document.getElementById('submit-btn').disabled, t: document.getElementById('submit-btn').textContent.trim() })`);
  await sleep(800);
  const r = await evaluate(`({
    modal: !document.getElementById('success-modal').classList.contains('hidden'),
    text: document.getElementById('modal-text').textContent.trim().replace(/\\s+/g, ' '),
    active: document.activeElement.id,
    values: ['name','email','phone','message'].map(id => document.getElementById(id).value).join(''),
    invalid: document.querySelectorAll('[aria-invalid]').length })`);
  const textOk = r.text === 'Це імітація надсилання: дані пройшли клієнтську валідацію, але нікуди не відправляються.';
  return {
    pass: busy.d && busy.t === 'Надсилання…' && r.modal && textOk && r.active === 'modal-close' && r.values === '' && r.invalid === 0,
    actual: `кнопка disabled=${busy.d} «${busy.t}»; модалка ${r.modal}; фокус #${r.active}; форма очищена ${r.values === ''}; станів ${r.invalid}`,
  };
});

await check('6', 'Пастка фокусу', async () => {
  const seen = [];
  for (const shift of [false, false, false, true, true, true]) {
    await press('Tab', shift);
    seen.push(await evaluate("document.getElementById('success-modal').contains(document.activeElement)"));
  }
  return { pass: seen.every(Boolean), actual: 'фокус у модалці після 6 натискань: ' + seen.every(Boolean) };
});

await check('3', 'Закриття Esc', async () => {
  await press('Escape');
  const r = await evaluate(`({ open: !document.getElementById('success-modal').classList.contains('hidden'),
    active: document.activeElement.id, disabled: document.getElementById('submit-btn').disabled,
    text: document.getElementById('submit-btn').textContent.trim() })`);
  return { pass: !r.open && r.active === 'submit-btn' && !r.disabled && r.text === 'Надіслати', actual: `закрито ${!r.open}, фокус #${r.active}, кнопка активна ${!r.disabled}` };
});

await check('35', 'XSS у повідомленні', async () => {
  await fillValid({ message: '<script>alert(1)</script>' });
  const opened = await submitAndWaitModal();
  const scripts = await evaluate("document.querySelectorAll('script').length");
  await press('Escape');
  return { pass: opened && dialogs.length === 0 && scripts === scriptsBefore, actual: `надіслано ${opened}, alert ${dialogs.length}, нових <script> ${scripts - scriptsBefore}` };
});

await check('39', 'Подвійний Submit', async () => {
  await fresh();
  await fillValid();
  await evaluate(`window.__modalOpens = 0;
    new MutationObserver(() => { if (!document.getElementById('success-modal').classList.contains('hidden')) window.__modalOpens++; })
      .observe(document.getElementById('success-modal'), { attributes: true, attributeFilter: ['class'] });`);
  await evaluate("document.getElementById('submit-btn').focus()");
  await press('Enter');
  await press('Enter');
  await evaluate("document.getElementById('feedback-form').requestSubmit()");
  await sleep(1500);
  const opens = await evaluate('window.__modalOpens');
  return { pass: opens === 1, actual: 'модалка відкривалася ' + opens + ' раз(и)' };
});

await check('2', 'Закриття кнопкою «Закрити»', async () => {
  await press('Enter'); // фокус уже на «Закрити»
  const r = await evaluate(`({ open: !document.getElementById('success-modal').classList.contains('hidden'), active: document.activeElement.id })`);
  return { pass: !r.open && r.active === 'submit-btn', actual: `закрито ${!r.open}, фокус #${r.active}` };
});

await check('40', 'Повторне надсилання', async () => {
  await fillValid();
  const opened = await submitAndWaitModal();
  return { pass: opened, actual: 'модалка ' + opened };
});

await check('5', 'Клік по картці модалки', async () => {
  const c = await center('#modal-text');
  await click(c.x, c.y);
  const open = await modalOpen();
  return { pass: open, actual: 'модалка відкрита ' + open };
});

await check('5a', 'Виділення тексту з картки з відпусканням на фоні не закриває', async () => {
  const c = await center('#modal-text');
  await mouse('mousePressed', c.x, c.y);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5, button: 'left' });
  await mouse('mouseReleased', 5, 5);
  await sleep(50);
  const open = await modalOpen();
  return { pass: open, actual: 'модалка відкрита ' + open };
});

await check('4', 'Закриття кліком по фону', async () => {
  if (!(await modalOpen())) { await fillValid(); await submitAndWaitModal(); }
  await click(5, 5);
  const r = await evaluate(`({ open: !document.getElementById('success-modal').classList.contains('hidden'), active: document.activeElement.id })`);
  return { pass: !r.open && r.active === 'submit-btn', actual: `закрито ${!r.open}, фокус #${r.active}` };
});

/* ------------------------------------------------------------------
 * Доступність: розмітка, клавіатура, контраст
 * ------------------------------------------------------------------ */

await fresh();

await check('a11y-1', 'label, aria-describedby, aria-live, унікальні id', async () => {
  const r = await evaluate(`(() => {
    const problems = [];
    const ids = [...document.querySelectorAll('[id]')].map(e => e.id);
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dup.length) problems.push('дублікати id: ' + dup);
    document.querySelectorAll('input, textarea').forEach(el => {
      if (!document.querySelector('label[for="' + el.id + '"]')) problems.push('немає label для #' + el.id);
      if (!el.name) problems.push('немає name у #' + el.id);
      const d = (el.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
      if (!d.includes(el.id + '-error')) problems.push('#' + el.id + ' не посилається на свою помилку');
      d.forEach(x => { if (!document.getElementById(x)) problems.push('aria-describedby → немає #' + x); });
      const err = document.getElementById(el.id + '-error');
      if (!err || err.getAttribute('aria-live') !== 'polite') problems.push('#' + el.id + '-error без aria-live');
    });
    const m = document.getElementById('success-modal');
    if (m.getAttribute('role') !== 'dialog' || m.getAttribute('aria-modal') !== 'true') problems.push('модалка без role=dialog/aria-modal');
    if (!document.getElementById(m.getAttribute('aria-labelledby'))) problems.push('модалка без заголовка');
    const f = document.getElementById('feedback-form');
    if (!f.getAttribute('aria-labelledby') && !f.getAttribute('aria-label')) problems.push('форма без доступної назви');
    if (document.documentElement.lang !== 'uk') problems.push('lang != uk');
    return problems;
  })()`);
  return { pass: r.length === 0, actual: r.length ? r.join('; ') : 'усе на місці' };
});

await check('a11y-2', 'Порядок Tab', async () => {
  await evaluate('document.activeElement.blur(); window.scrollTo(0,0)');
  const order = [];
  for (let i = 0; i < 6; i++) { await press('Tab'); order.push(await activeId()); }
  const expected = ['name', 'email', 'phone', 'message', 'agreement', 'submit-btn'];
  return { pass: short(order) === short(expected), actual: order.join(' → ') };
});

await check('a11y-3', 'Контраст тексту ≥ 4.5:1, меж полів і focus ring ≥ 3:1 (WCAG 1.4.3, 1.4.11)', async () => {
  // Готуємо стани: помилка в імені, успіх у email, примітка в телефоні; повідомлення — normal
  await fresh();
  await fillAndBlur('name', 'Я');
  await fillAndBlur('email', 'olena@example.com');
  await fillAndBlur('phone', '0501234567');
  await sleep(300); // дочекатися завершення transition-colors (150 мс)
  const r = await evaluate(`(() => {
    const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null;
      const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
    const over = (c, bg) => ({ r: c.r * c.a + bg.r * (1 - c.a), g: c.g * c.a + bg.g * (1 - c.a), b: c.b * c.a + bg.b * (1 - c.a) });
    const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const white = { r: 255, g: 255, b: 255, a: 1 };
    const rows = [];
    const text = (label, el, pseudo, min = 4.5) => { const c = parse(getComputedStyle(el, pseudo).color);
      rows.push({ label, ratio: ratio(over(c, white), white), min }); };
    const border = (label, el, min = 3) => { const c = parse(getComputedStyle(el).borderTopColor);
      rows.push({ label, ratio: ratio(over(c, white), white), min }); };
    const $ = (s) => document.querySelector(s);
    text('підпис поля', $('label[for=name]'));
    text('підказка телефону', $('#phone-hint'));
    text('placeholder', $('#message'), '::placeholder');
    text('текст помилки', $('#name-error'));
    text('примітка (успіх)', $('#phone-error'));
    text('лічильник', $('#message-counter'));
    text('опис під заголовком', $('section p.text-slate-500'));
    const btn = $('#submit-btn'); const bc = parse(getComputedStyle(btn).backgroundColor);
    rows.push({ label: 'текст кнопки', ratio: ratio(parse(getComputedStyle(btn).color), bc), min: 4.5 });
    border('межа поля (normal)', $('#message'));
    border('межа поля (error)', $('#name'));
    border('межа поля (success)', $('#email'));
    // focus ring: друга тінь у box-shadow (ring), колір з урахуванням прозорості
    const ringOf = (el) => { el.focus(); const s = getComputedStyle(el).boxShadow;
      const colors = s.match(/rgba?\\([^)]+\\)/g) || []; const c = colors.map(parse).find(c => c.a > 0 && !(c.r === 255 && c.g === 255 && c.b === 255));
      return c ? ratio(over(c, white), white) : 0; };
    rows.push({ label: 'focus ring (normal)', ratio: ringOf($('#message')), min: 3 });
    rows.push({ label: 'focus ring (error)', ratio: ringOf($('#name')), min: 3 });
    rows.push({ label: 'focus ring (success)', ratio: ringOf($('#email')), min: 3 });
    return rows.map(r => ({ ...r, ratio: Math.round(r.ratio * 100) / 100 }));
  })()`);
  const bad = r.filter((x) => x.ratio < x.min);
  return {
    pass: bad.length === 0,
    actual: (bad.length ? 'НЕ ПРОХОДИТЬ: ' + bad.map((x) => `${x.label} ${x.ratio}:1 (треба ${x.min})`).join('; ') + ' | ' : '') +
      'усі: ' + r.map((x) => `${x.label} ${x.ratio}`).join(', '),
  };
});

/* ------------------------------------------------------------------
 * Адаптивність
 * ------------------------------------------------------------------ */

async function layoutAt(width) {
  await viewport(width, 800, width < 768);
  await fresh();
  await submitByKeyboard(); // показати всі помилки — найдовші тексти
  return evaluate(`(() => {
    const vw = document.documentElement.clientWidth;
    const over = [...document.querySelectorAll('body *')].filter(el => {
      const r = el.getBoundingClientRect(); return r.width && (r.right > vw + 0.5 || r.left < -0.5);
    }).map(el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : ''));
    const top = (id) => Math.round(document.getElementById(id).getBoundingClientRect().top);
    const h = (sel) => Math.round(document.querySelector(sel).getBoundingClientRect().height);
    return { vw, scrollW: document.documentElement.scrollWidth, bodyScrollW: document.body.scrollWidth, over,
      sameRow: top('name') === top('email'),
      heights: { name: h('#name'), email: h('#email'), phone: h('#phone'), message: h('#message'),
                 agreement: h('label[for=agreement]'), submit: h('#submit-btn') },
      fontSize: getComputedStyle(document.getElementById('name')).fontSize };
  })()`);
}

await check('8', 'Адаптивність 320 / 768 / 1280', async () => {
  const l320 = await layoutAt(320);
  await screenshot('320-errors');
  const l768 = await layoutAt(768);
  const l1280 = await layoutAt(1280);
  await screenshot('1280-errors');
  const noScroll = l320.scrollW <= 320 && l320.bodyScrollW <= 320 && l320.over.length === 0;
  const pass = noScroll && !l320.sameRow && l768.sameRow && l1280.sameRow;
  return {
    pass,
    actual: `320px: scrollWidth ${l320.scrollW}, елементів за межами ${l320.over.length}${l320.over.length ? ' (' + l320.over.slice(0, 5).join(', ') + ')' : ''}, 1 колонка ${!l320.sameRow}; 768px: 2 колонки ${l768.sameRow}; 1280px: 2 колонки ${l1280.sameRow}`,
  };
});

await check('8a', 'Розміри полів ≥ 44px, шрифт 16px (320px)', async () => {
  const l = await layoutAt(320);
  const small = Object.entries(l.heights).filter(([, v]) => v < 44);
  return { pass: small.length === 0 && l.fontSize === '16px', actual: Object.entries(l.heights).map(([k, v]) => k + ' ' + v).join(', ') + ', font ' + l.fontSize };
});

await check('8b', 'Модалка на 320px', async () => {
  await viewport(320, 640, true);
  await fresh();
  await fillValid();
  await submitAndWaitModal();
  await sleep(400); // дочекатися завершення анімацій
  await screenshot('320-modal', false);
  const r = await evaluate(`(() => { const c = document.getElementById('modal-card').getBoundingClientRect();
    return { left: c.left, right: c.right, vw: document.documentElement.clientWidth,
      borders: [...new Set(['name','email','phone','message'].map(id => getComputedStyle(document.getElementById(id)).borderTopColor))] }; })()`);
  const neutral = r.borders.length === 1 && r.borders[0] === 'rgb(100, 116, 139)'; // slate-500
  return { pass: r.left >= 0 && r.right <= r.vw && neutral,
    actual: `картка ${Math.round(r.left)}–${Math.round(r.right)} з ${r.vw}px; рамки полів після reset ${r.borders.join(', ')}` };
});

await check('js', 'Помилки JavaScript у консолі', async () => ({
  pass: jsErrors.length === 0,
  actual: jsErrors.length ? jsErrors.join(' | ') : 'немає' + (consoleWarnings.length ? '; попередження: ' + [...new Set(consoleWarnings)].join(' | ') : ''),
}));

/* ------------------------------------------------------------------
 * Звіт
 * ------------------------------------------------------------------ */

ws.close();
cleanup();

if (process.env.JSON) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const r of results) console.log(`${r.pass ? '✅' : '❌'} ${r.id.padEnd(7)} ${r.title}: ${r.actual}`);
}
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} пройдено`);
process.exit(failed ? 1 : 0);
