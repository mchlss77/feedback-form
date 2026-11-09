# EQUILOCK — форма зворотного зв'язку

Форма зворотного зв'язку для **EQUILOCK** — escrow-платформи для P2P/OTC угод USDT/UAH.
Лише фронтенд: дані перевіряються в браузері й нікуди не відправляються.

## Стек

- HTML5 (семантична розмітка, ARIA)
- Tailwind CSS 3.4 через CDN
- Vanilla JavaScript (без залежностей і збирання)

## Запуск

Відкрийте `index.html` у браузері. Або запустіть локальний сервер:

```bash
python3 -m http.server 8000
# http://localhost:8000
```

Для роботи Tailwind CDN потрібен інтернет.

## Структура

```
.
├── index.html                 # розмітка форми та модального вікна
├── assets/
│   ├── css/styles.css         # доповнення до Tailwind (hover, focus ring, анімації)
│   └── js/
│       ├── validators.js      # RegEx і функції перевірки (без DOM, працюють і в Node)
│       └── validation.js      # події, стани полів, нормалізація телефону, модалка
├── tests/
│   ├── validators.test.js     # юніт-тести валідаторів (node --test)
│   └── browser-check.mjs      # наскрізна перевірка в headless Chrome
├── docs/
│   ├── spec.md                # специфікація форми
│   ├── validation-rules.md    # правила валідації, розбір RegEx, edge cases
│   ├── tests.md               # тест-кейси з результатами прогону
│   └── audit.md               # code review: проблеми та виправлення
├── package.json               # лише скрипти для тестів, залежностей немає
├── prompts.md                 # промпт-паспорт (історія промптів до ШІ)
└── README.md
```

## Можливості

- Поля: ім'я, email, телефон, повідомлення, згода на обробку даних — усі обов'язкові.
- Валідація: на `blur` — перевірка поля; на `input` — оновлення вже перевіреного поля; на `submit` — перевірка всіх полів і фокус на першому невалідному.
- Телефон `0501234567`, `(050) 123-45-67`, `+380 50 123 45 67` автоматично перетворюється на `+380501234567`.
- Доступність: `<label for>`, `aria-describedby`, `aria-invalid`, повідомлення з `aria-live`, пастка фокусу в модальному вікні.
- Захист від подвійного надсилання.
- Адаптивність: 1 колонка на мобільних, ім'я + email у 2 колонки від `md` (768px), без горизонтального скролу на 320px.

## Тести

Потрібен Node.js 22+. npm-залежностей немає.

```bash
npm test                  # юніт-тести валідаторів (= node --test)
npm run test:browser      # перевірка в headless Chrome (= node tests/browser-check.mjs)
```

Браузерна перевірка запускає встановлений Google Chrome (шлях можна змінити через `CHROME_PATH`) і проходить кейси з [docs/tests.md](docs/tests.md): клавіатура, фокус, модалка, ARIA, контраст, 320/768/1280px. `SCREENSHOT_DIR=screenshots` зберігає скриншоти. Для Tailwind CDN потрібен інтернет.

Валідатори можна викликати і з консолі браузера:

```js
EquilockValidators.validatePhone('(050) 123-45-67');
// { valid: true, message: '', value: '+380501234567', changed: true }
```

Результати прогону — у [docs/tests.md](docs/tests.md), знайдені проблеми — у [docs/audit.md](docs/audit.md).
