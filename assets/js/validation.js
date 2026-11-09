/*
 * EQUILOCK — поведінка форми зворотного зв'язку (DOM).
 * Правила перевірки — у validators.js (window.EquilockValidators).
 * Без бекенду: після успішної перевірки показуємо модалку-імітацію.
 */
'use strict';

(function () {
  const V = window.EquilockValidators;
  const form = document.getElementById('feedback-form');
  if (!V || !form) return;

  // Класи станів рамки та тексту під полем
  const BORDER_NEUTRAL = 'border-slate-500';
  const BORDER_ERROR = 'border-red-500';
  const BORDER_SUCCESS = 'border-green-600';
  const TEXT_ERROR = 'text-red-600';
  const TEXT_SUCCESS = 'text-green-700';

  /* ------------------------------------------------------------------
   * Відображення станів поля
   * ------------------------------------------------------------------ */

  // Елемент, якому міняємо колір рамки (для чекбокса — обгортка)
  function getHighlightTarget(field) {
    if (field.type === 'checkbox') {
      return document.querySelector('[data-highlight-for="' + field.id + '"]') || field;
    }
    return field;
  }

  function setBorder(field, borderClass) {
    const target = getHighlightTarget(field);
    // У чекбокса нейтральний стан — прозора рамка обгортки
    const neutral = field.type === 'checkbox' ? 'border-transparent' : BORDER_NEUTRAL;
    target.classList.remove(neutral, BORDER_ERROR, BORDER_SUCCESS);
    target.classList.add(borderClass || neutral);
  }

  // Оновлюємо текст лише коли він змінився: інакше aria-live зачитує його повторно
  function setMessage(field, text, colorClass) {
    const el = document.getElementById(field.id + '-error');
    el.classList.remove(TEXT_ERROR, TEXT_SUCCESS);
    if (colorClass) el.classList.add(colorClass);
    if (el.textContent !== text) el.textContent = text; // лише textContent — дані не стають HTML
  }

  // Помилка: червона рамка, текст помилки, aria-invalid="true"
  function showError(field, message) {
    setBorder(field, BORDER_ERROR);
    field.setAttribute('aria-invalid', 'true');
    setMessage(field, message, TEXT_ERROR);
  }

  // Успіх: зелена рамка, aria-invalid="false", необов'язкова примітка (напр. про формат телефону)
  function showSuccess(field, note) {
    setBorder(field, BORDER_SUCCESS);
    field.setAttribute('aria-invalid', 'false');
    setMessage(field, note || '', TEXT_SUCCESS);
  }

  // Повернення до нейтрального стану
  function clearError(field) {
    setBorder(field, null);
    field.removeAttribute('aria-invalid');
    setMessage(field, '', null);
  }

  /* ------------------------------------------------------------------
   * Зв'язок з DOM
   * ------------------------------------------------------------------ */

  const fields = {
    name: form.elements.name,
    email: form.elements.email,
    phone: form.elements.phone,
    message: form.elements.message,
    agreement: form.elements.agreement,
  };
  // Порядок полів — для фокусу на першому невалідному
  const fieldOrder = ['name', 'email', 'phone', 'message', 'agreement'];

  const submitBtn = document.getElementById('submit-btn');
  const submitLabel = submitBtn.textContent.trim();
  const counter = document.getElementById('message-counter');
  const modal = document.getElementById('success-modal');
  const modalClose = document.getElementById('modal-close');
  const main = document.getElementById('main');

  // Поля, які користувач уже «торкнувся» (покинув хоча б раз)
  const touched = new Set();
  let isSubmitting = false;

  /*
   * Перевірка одного поля.
   * mode: 'blur' | 'input' | 'submit'.
   * Нормалізація (обрізання пробілів, формат телефону) — лише на blur і submit,
   * щоб не заважати користувачу під час введення.
   */
  function checkField(key, mode) {
    const field = fields[key];
    const rewrite = mode !== 'input';
    let result;

    switch (key) {
      case 'name':
        result = V.validateName(field.value);
        break;
      case 'email':
        result = V.validateEmail(field.value);
        break;
      case 'phone':
        result = V.validatePhone(field.value);
        if (result.valid && result.changed) {
          result.message = rewrite
            ? 'Номер перетворено у формат +380XXXXXXXXX: ' + result.value + '.'
            : 'Після виходу з поля номер буде перетворено у формат +380XXXXXXXXX.';
        }
        break;
      case 'message':
        result = V.validateMessage(field.value);
        break;
      case 'agreement':
        result = V.validateAgreement(field.checked);
        break;
      default:
        return true;
    }

    // Записуємо нормалізоване значення (без пробілів на краях, телефон у +380…)
    if (rewrite && result.valid && result.value !== undefined && key !== 'message') {
      field.value = result.value;
    }

    if (result.valid) {
      showSuccess(field, result.message);
    } else {
      showError(field, result.message);
    }
    return result.valid;
  }

  // Лічильник рахує так само, як maxlength (UTF-16), щоб «1000 / 1000» збігалося з межею поля
  function updateCounter() {
    if (!counter) return;
    counter.textContent = fields.message.value.length + ' / ' + fields.message.maxLength;
  }

  ['name', 'email', 'phone', 'message'].forEach(function (key) {
    const field = fields[key];

    // blur — позначаємо поле «торкнутим» і перевіряємо
    field.addEventListener('blur', function () {
      if (isSubmitting) return;
      touched.add(key);
      checkField(key, 'blur');
    });

    // input — оновлюємо стан лише вже торкнутого поля
    field.addEventListener('input', function () {
      if (key === 'message') updateCounter();
      if (touched.has(key)) checkField(key, 'input');
    });
  });

  // Чекбокс: зміна стану — це вже взаємодія
  fields.agreement.addEventListener('change', function () {
    touched.add('agreement');
    checkField('agreement', 'blur');
  });

  /* ------------------------------------------------------------------
   * Надсилання
   * ------------------------------------------------------------------ */

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    // Захист від подвійного submit
    if (isSubmitting) return;

    let firstInvalid = null;
    fieldOrder.forEach(function (key) {
      touched.add(key);
      const ok = checkField(key, 'submit');
      if (!ok && !firstInvalid) firstInvalid = fields[key];
    });

    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    isSubmitting = true;
    submitBtn.disabled = true;
    submitBtn.setAttribute('aria-busy', 'true');
    submitBtn.textContent = 'Надсилання…';

    // Імітація мережевого запиту
    window.setTimeout(function () {
      form.reset();
      touched.clear();
      fieldOrder.forEach(function (key) {
        clearError(fields[key]);
      });
      updateCounter();
      openModal();
    }, 600);
  });

  /* ------------------------------------------------------------------
   * Модальне вікно
   * ------------------------------------------------------------------ */

  function getFocusable() {
    return Array.from(
      modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter(function (el) {
      return !el.disabled;
    });
  }

  function openModal() {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.classList.add('overflow-hidden');
    // Решта сторінки недоступна, поки відкрита модалка
    if (main) main.inert = true;
    document.addEventListener('keydown', onModalKeydown);
    modalClose.focus();
  }

  function closeModal() {
    if (modal.classList.contains('hidden')) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.body.classList.remove('overflow-hidden');
    if (main) main.inert = false;
    document.removeEventListener('keydown', onModalKeydown);

    // Знімаємо блокування кнопки лише після закриття модалки
    isSubmitting = false;
    submitBtn.disabled = false;
    submitBtn.removeAttribute('aria-busy');
    submitBtn.textContent = submitLabel;
    submitBtn.focus();
  }

  // Esc закриває; Tab/Shift+Tab циклічно переходять між елементами модалки
  function onModalKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = getFocusable();
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || !modal.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !modal.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  modalClose.addEventListener('click', closeModal);

  /*
   * Клік по затемненому фону закриває, клік по картці — ні.
   * Закриваємо, лише якщо натискання почалося теж на фоні:
   * інакше виділення тексту в картці з відпусканням миші на фоні закрило б модалку.
   */
  let pressStartedOnBackdrop = false;
  modal.addEventListener('pointerdown', function (event) {
    pressStartedOnBackdrop = event.target === modal;
  });
  modal.addEventListener('click', function (event) {
    if (event.target === modal && pressStartedOnBackdrop) closeModal();
    pressStartedOnBackdrop = false;
  });
})();
