/*
 * EQUILOCK — чисті функції валідації (без DOM).
 * Працюють у браузері (window.EquilockValidators) і в Node (require).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.EquilockValidators = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------
   * Константи та регулярні вирази
   * ------------------------------------------------------------------ */

  // Літери кирилиці (включно з українськими) та латиниці
  const LETTERS = 'A-Za-zА-Яа-яЁёЄєІіЇїҐґ';
  // Слова з літер, розділені одним пробілом, апострофом або дефісом
  const NAME_RE = new RegExp('^[' + LETTERS + ']+(?:[ \'’ʼ-][' + LETTERS + ']+)*$');
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const PHONE_RE = /^\+380\d{9}$/;
  // Будь-яка літера (латиниця або кирилиця) — для підказки про літери в телефоні
  const HAS_LETTER_RE = new RegExp('[' + LETTERS + ']');

  const LIMITS = Object.freeze({
    NAME_MIN: 2,
    NAME_MAX: 50,
    MESSAGE_MIN: 10,
    MESSAGE_MAX: 1000,
  });

  const PHONE_FORMAT_HINT = 'Формат: +380XXXXXXXXX, наприклад +380501234567.';

  /* ------------------------------------------------------------------
   * Допоміжні функції
   * ------------------------------------------------------------------ */

  // Прибирає пробіли на краях і стискає повторні пробіли всередині
  function normalizeSpaces(value) {
    return String(value).trim().replace(/\s+/g, ' ');
  }

  // Довжина рядка в символах (емодзі рахується як 1, а не 2)
  function charLength(value) {
    return Array.from(String(value)).length;
  }

  /* ------------------------------------------------------------------
   * Валідатори. Кожен повертає { valid, message, value? }
   * ------------------------------------------------------------------ */

  function validateName(raw) {
    const value = normalizeSpaces(raw);
    const length = charLength(value);
    if (value === '') {
      return { valid: false, message: "Введіть ім'я." };
    }
    if (length < LIMITS.NAME_MIN) {
      return { valid: false, message: "Ім'я має містити щонайменше 2 символи." };
    }
    if (length > LIMITS.NAME_MAX) {
      return { valid: false, message: "Ім'я не може бути довшим за 50 символів." };
    }
    if (!NAME_RE.test(value)) {
      return {
        valid: false,
        message: "Ім'я може містити лише літери (кирилиця або латиниця), апостроф, дефіс і пробіл.",
      };
    }
    return { valid: true, message: '', value: value };
  }

  function validateEmail(raw) {
    const value = String(raw).trim();
    if (value === '') {
      return { valid: false, message: 'Введіть email.' };
    }
    if (!EMAIL_RE.test(value)) {
      return { valid: false, message: 'Введіть коректний email, наприклад name@example.com.' };
    }
    return { valid: true, message: '', value: value };
  }

  /*
   * Телефон: приймаємо +380XXXXXXXXX, 380XXXXXXXXX, 0XXXXXXXXX,
   * а також ці ж номери з пробілами, дужками та дефісами.
   * value — номер у форматі +380XXXXXXXXX,
   * changed — чи змінився формат (для пояснення під полем).
   */
  function validatePhone(raw) {
    const value = String(raw).trim();
    if (value === '') {
      return { valid: false, message: 'Введіть номер телефону.' };
    }
    if (HAS_LETTER_RE.test(value)) {
      return { valid: false, message: 'Номер не може містити літер. ' + PHONE_FORMAT_HINT };
    }

    // Прибираємо дозволені роздільники: пробіли, дужки, дефіси
    const compact = value.replace(/[\s()-]/g, '');
    if (!/^\+?\d+$/.test(compact)) {
      return {
        valid: false,
        message: 'Дозволені лише цифри, «+» на початку, пробіли, дужки та дефіси. ' + PHONE_FORMAT_HINT,
      };
    }

    let normalized = null;
    if (PHONE_RE.test(compact)) {
      normalized = compact;
    } else if (/^380\d{9}$/.test(compact)) {
      normalized = '+' + compact;
    } else if (/^0\d{9}$/.test(compact)) {
      normalized = '+38' + compact;
    }

    if (normalized === null) {
      return { valid: false, message: phoneLengthMessage(compact) + ' ' + PHONE_FORMAT_HINT };
    }

    return { valid: true, message: '', value: normalized, changed: normalized !== value };
  }

  /*
   * Пояснення, що не так з кількістю цифр.
   * Текст не містить точної кількості, щоб не змінюватися на кожне натискання
   * клавіші (інакше screen reader зачитує його знову і знову через aria-live).
   */
  function phoneLengthMessage(compact) {
    const digits = compact.replace(/\D/g, '');
    let expected = null;
    if (/^\+?380/.test(compact)) {
      expected = 12; // 380 + 9 цифр
    } else if (digits.charAt(0) === '0' && compact.charAt(0) !== '+') {
      expected = 10; // 0 + 9 цифр
    }
    if (expected === null) return 'Номер має починатися з +380, 380 або 0.';
    if (digits.length < expected) return 'Замало цифр.';
    return 'Забагато цифр.';
  }

  function validateMessage(raw) {
    const value = String(raw).trim();
    const length = charLength(value);
    if (value === '') {
      return { valid: false, message: 'Введіть повідомлення.' };
    }
    if (length < LIMITS.MESSAGE_MIN) {
      // Без поточної кількості — її показує лічильник над полем
      return { valid: false, message: 'Повідомлення має містити щонайменше 10 символів.' };
    }
    if (length > LIMITS.MESSAGE_MAX) {
      return { valid: false, message: 'Повідомлення не може бути довшим за 1000 символів.' };
    }
    return { valid: true, message: '', value: value };
  }

  function validateAgreement(checked) {
    if (checked !== true) {
      return { valid: false, message: 'Потрібна згода на обробку персональних даних.' };
    }
    return { valid: true, message: '' };
  }

  return Object.freeze({
    NAME_RE: NAME_RE,
    EMAIL_RE: EMAIL_RE,
    PHONE_RE: PHONE_RE,
    LIMITS: LIMITS,
    normalizeSpaces: normalizeSpaces,
    charLength: charLength,
    validateName: validateName,
    validateEmail: validateEmail,
    validatePhone: validatePhone,
    validateMessage: validateMessage,
    validateAgreement: validateAgreement,
  });
});
