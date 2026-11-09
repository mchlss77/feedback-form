# Промпт-паспорт

Історія роботи з ШІ над формою зворотного зв'язку EQUILOCK. Після кожного нового промпту додається рядок у таблицю, а повний текст промпту — у розділ «Повні тексти промптів».

| Етап | Промпт | Відповідь ШІ | Що змінено | Результат |
|---|---|---|---|---|
| 1 | Створити форму зворотного зв'язку EQUILOCK (HTML + Tailwind CDN + Vanilla JS, без бекенду): поля ім'я/email/телефон/повідомлення/згода, ARIA, mobile-first, валідація на blur/input/submit, нормалізація телефону до +380XXXXXXXXX, модалка-імітація з пасткою фокусу, захист від подвійного submit, документація (spec, validation-rules, tests), промпт-паспорт, `git init`. Повний текст — [Промпт 1](#промпт-1). | Створено структуру проєкту й усі файли. JS: валідатори `validateName/Email/Phone/Message/Agreement`, `showError/showSuccess/clearError`, нормалізація телефону, модалка з `inert`, пасткою фокусу та закриттям по Esc/фону/кнопці. Валідатори перевірено на прикладах з ТЗ (JavaScriptCore). | Початкова версія. Додатково до ТЗ: лічильник символів повідомлення, `maxlength` для полів, обрізання зайвих пробілів в імені/email на blur, затримка 600 мс для імітації запиту, `window.EquilockValidation` для тестів з консолі. | `index.html`, `assets/css/styles.css`, `assets/js/validation.js`, `README.md`, `.gitignore`, `docs/spec.md`, `docs/validation-rules.md`, `docs/tests.md`, `prompts.md`; git-репозиторій з гілкою `main`. |
| 2 | Самостійно протестувати валідацію (винести RegEx і функції для запуску в Node, прогнати кейси з tests.md і validation-rules.md, заповнити «Фактичний результат» і «Статус»), перевірити JS-помилки, доступність і адаптивність на 320px, зробити code review у `docs/audit.md` і виправити критичні та середні пункти. Повний текст — [Промпт 2](#промпт-2). | Валідатори винесено в `validators.js` (UMD) і покрито юніт-тестами (74/74). Написано `tests/browser-check.mjs` — перевірка в headless Chrome через DevTools Protocol без залежностей. До виправлень 46/50, після — 50/50. Критичних проблем не знайдено; 7 середніх і 4 низькі виправлено, 5 залишено з обґрунтуванням. | Контраст: рамки `slate-500`, success `green-600` замість `green-500` з ТЗ, суцільний focus ring, placeholder `slate-500` з «напр.». Модалка не закривається при виділенні тексту з відпусканням на фоні. Стабільні тексти помилок без лічильників («Замало/Забагато цифр»). Лічильник рахує як `maxlength`. `aria-labelledby` у форми. Прибрано `overflow-x: hidden`. Додано `package.json` зі скриптами тестів. | `assets/js/validators.js`, `tests/validators.test.js`, `tests/browser-check.mjs`, `docs/audit.md`, `package.json`; оновлено `index.html`, `styles.css`, `validation.js`, `README.md`, `docs/spec.md`, `docs/validation-rules.md`, `docs/tests.md` (заповнені результати 50/50). |
| 3 | Виконати `git add .`, `git commit -m "feat: add responsive feedback form with RegEx validation and success modal"`, `git remote add origin https://github.com/mchlss77/feedback-form.git`, `git push -u origin main`. Повний текст — [Промпт 3](#промпт-3). | Перед комітом дописано цей рядок у промпт-паспорт; виконано команди в зазначеному порядку. | Код не змінювався. | Перший коміт у гілці `main`, віддалений репозиторій `origin` → GitHub `mchlss77/feedback-form`, гілка `main` відстежує `origin/main`. |
| 4 | Змінити підзаголовок форми на «Маєте питання щодо escrow-угоди? Напишіть нам», додати в README посилання на сайт https://feedback-form-one-woad.vercel.app/, коміт "chore: update subtitle and add live link", git push. Повний текст — [Промпт 4](#промпт-4). | Оновлено текст підзаголовка, посилання на демо додано під описом у README, ASCII-схему в `docs/spec.md` синхронізовано з новим текстом. | `index.html` (підзаголовок), `README.md` (рядок «Демо»), `docs/spec.md` (ASCII-схема). | Коміт `chore: update subtitle and add live link` надіслано в `origin/main`. |

## Повні тексти промптів

### Промпт 1

> Ти Senior Frontend Engineer. Зроби в поточній папці форму зворотного зв'язку для EQUILOCK (escrow-платформа P2P/OTC угод USDT/UAH). Стек: HTML, Tailwind CDN, Vanilla JS, без бекенду.
>
> Файли: index.html, assets/css/styles.css, assets/js/validation.js, README.md, .gitignore, docs/spec.md, docs/validation-rules.md, docs/tests.md, prompts.md.
>
> Поля (всі обов'язкові):
> - Ім'я: text, мін. 2 символи, кирилиця/латиниця, апостроф, дефіс, пробіл
> - Email: type=email, RegEx ^[^\s@]+@[^\s@]+\.[^\s@]{2,}$
> - Телефон: type=tel, RegEx ^\+380\d{9}$
> - Повідомлення: textarea, мін. 10 символів
> - Чекбокс згоди
> - Кнопка «Надіслати»
>
> HTML: семантика, унікальні id/name, \<label for\>, під полем \<p\> для помилки з aria-live, aria-describedby, aria-invalid.
> Tailwind: mobile-first, 1 стовпець, від md ім'я+email у 2 стовпці; поля мін. 44px, text-base; стримані focus ring/hover/transition; без горизонтального скролу на 320px.
> JS (коментарі українською): validateName/Email/Phone/Message/Agreement; showError (border-red-500 + текст, aria-invalid=true), showSuccess (border-green-500, aria-invalid=false), clearError. Валідація не при завантаженні: blur – перевірка поля, input – оновлення вже торкнутого поля, submit – addEventListener + preventDefault, перевірка всіх полів, фокус на перше невалідне.
> Телефон: 0XXXXXXXXX або номер з пробілами/дужками/дефісами на blur перетворювати на +380XXXXXXXXX з поясненням під полем; літери, зайві/відсутні цифри – помилка з підказкою формату. Введення не блокувати.
> Успіх: form.reset(), очистити стани, модалка (fixed inset-0, затемнений фон, картка по центру) з текстом «Це імітація надсилання: дані пройшли клієнтську валідацію, але нікуди не відправляються». Закриття: кнопка «Закрити», Esc, клік по фону (не по картці). Фокус у модалці, Tab не виходить за неї, після закриття фокус на «Надіслати». Захист від подвійного submit.
>
> Документи:
> - docs/spec.md – мета форми, поля, тексти помилок, стани normal/focus/error/success, поведінка на мобільних, ASCII-схема форми
> - docs/validation-rules.md – таблиця правил з валідними/невалідними прикладами, поелементне пояснення RegEx телефону та email, що буде без ^ і $, таблиця edge cases телефону (0501234567, "+380 50 123 45 67", "(050) 123-45-67", +3805012345678, +38050abc4567, 050123)
> - docs/tests.md – таблиця: № | Тестовий випадок | Вхідні дані | Очікуваний результат | Фактичний результат | Статус (останні 2 колонки порожні). Happy path, негативні випадки (порожнє ім'я, 1 символ, поганий email, поганий телефон, коротке повідомлення, без чекбокса), edge cases (пробіли, дуже довгий текст, емодзі, кирилиця/латиниця, цифри, \<script\>alert(1)\</script\>, подвійний Submit)
> - prompts.md – промпт-паспорт: Етап | Промпт | Відповідь ШІ | Що змінено | Результат. Запиши цей промпт і після кожного мого наступного промпту дописуй рядок.
>
> Наприкінці виконай git init і git branch -M main.

### Промпт 2

> 1) Протестуй валідацію сам: винеси RegEx і функції перевірки так, щоб їх можна було запустити через node, проганяй усі випадки з docs/tests.md і docs/validation-rules.md, заповни колонки «Фактичний результат» і «Статус». Якщо щось не проходить – виправ.
> 2) Перевір код на JS-помилки, доступність (label, aria, фокус, контраст, клавіатура, модалка) і адаптивність на 320px.
> 3) Зроби code review: docs/audit.md, таблиця Проблема | Рівень | Причина | Рекомендоване виправлення. Виправ критичні та середні пункти і познач їх у таблиці.

### Промпт 3

> Виконай: git add ., git commit -m "feat: add responsive feedback form with RegEx validation and success modal", git remote add origin https://github.com/mchlss77/feedback-form.git, git push -u origin main.

### Промпт 4

> Зміни підзаголовок форми на «Маєте питання щодо escrow-угоди? Напишіть нам», додай у README посилання на сайт: <https://feedback-form-one-woad.vercel.app/>. Коміт "chore: update subtitle and add live link", git push.
