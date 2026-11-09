/*
 * Юніт-тести валідаторів. Запуск: node --test (або npm test)
 * Кейси взято з docs/tests.md (№) і docs/validation-rules.md (§).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../assets/js/validators.js');

const MSG = {
  nameEmpty: "Введіть ім'я.",
  nameShort: "Ім'я має містити щонайменше 2 символи.",
  nameLong: "Ім'я не може бути довшим за 50 символів.",
  nameChars: "Ім'я може містити лише літери (кирилиця або латиниця), апостроф, дефіс і пробіл.",
  emailEmpty: 'Введіть email.',
  emailBad: 'Введіть коректний email, наприклад name@example.com.',
  phoneEmpty: 'Введіть номер телефону.',
  phoneLetters: 'Номер не може містити літер. Формат: +380XXXXXXXXX, наприклад +380501234567.',
  phoneChars:
    'Дозволені лише цифри, «+» на початку, пробіли, дужки та дефіси. Формат: +380XXXXXXXXX, наприклад +380501234567.',
  phoneFew: 'Замало цифр. Формат: +380XXXXXXXXX, наприклад +380501234567.',
  phoneMany: 'Забагато цифр. Формат: +380XXXXXXXXX, наприклад +380501234567.',
  phonePrefix: 'Номер має починатися з +380, 380 або 0. Формат: +380XXXXXXXXX, наприклад +380501234567.',
  messageEmpty: 'Введіть повідомлення.',
  messageShort: 'Повідомлення має містити щонайменше 10 символів.',
  messageLong: 'Повідомлення не може бути довшим за 1000 символів.',
  agreement: 'Потрібна згода на обробку персональних даних.',
};

// Перевіряє один кейс: валідність, текст помилки, нормалізоване значення
function check(fn, input, expected) {
  const result = V[fn](input);
  assert.equal(result.valid, expected.valid, fn + '(' + JSON.stringify(input) + ').valid');
  if (expected.message !== undefined) assert.equal(result.message, expected.message);
  if (expected.value !== undefined) assert.equal(result.value, expected.value);
  if (expected.changed !== undefined) assert.equal(result.changed, expected.changed);
}

function cases(title, fn, list) {
  test(title, async (t) => {
    for (const [id, input, expected] of list) {
      await t.test(id + ': ' + JSON.stringify(input).slice(0, 60), () => check(fn, input, expected));
    }
  });
}

/* ---------------- Ім'я ---------------- */
cases("Ім'я", 'validateName', [
  ['§1', 'Олена', { valid: true, value: 'Олена' }],
  ['§1 / №31', "О'Ніл", { valid: true }],
  ['№31', 'О’Ніл', { valid: true }],
  ['№31', 'Мʼякота', { valid: true }],
  ['§1 / №31', 'Анна-Марія', { valid: true }],
  ['§1 / №30', 'John Smith', { valid: true }],
  ['§1', 'Їжак', { valid: true }],
  ['№29', 'Ґанна Їжакевич', { valid: true }],
  ['№32', 'Ivan Петренко', { valid: true }],
  ['№1', 'Олена Коваль', { valid: true }],
  ['§1 / №9', '', { valid: false, message: MSG.nameEmpty }],
  ['§1 / №10', 'Я', { valid: false, message: MSG.nameShort }],
  ['§1 / №33', 'Іван2', { valid: false, message: MSG.nameChars }],
  ['§1', '-Іван', { valid: false, message: MSG.nameChars }],
  ['§1 / №28', 'Іван😀', { valid: false, message: MSG.nameChars }],
  ['§1 / №34', '<script>alert(1)</script>', { valid: false, message: MSG.nameChars }],
  ['№22', '  Іван  ', { valid: true, value: 'Іван' }],
  ['№22', 'Іван   Петренко', { valid: true, value: 'Іван Петренко' }],
  ['№23', '     ', { valid: false, message: MSG.nameEmpty }],
  ['№26 (50 літер)', 'А'.repeat(50), { valid: true }],
  ['№26 (51 літера)', 'А'.repeat(51), { valid: false, message: MSG.nameLong }],
]);

/* ---------------- Email ---------------- */
cases('Email', 'validateEmail', [
  ['§1 / №1', 'name@example.com', { valid: true }],
  ['§1', 'user@mail.ua', { valid: true }],
  ['§1', 'a.b+c@sub.domain.org', { valid: true }],
  ['№1', 'olena@example.com', { valid: true }],
  ['trim', '  olena@example.com  ', { valid: true, value: 'olena@example.com' }],
  ['empty', '', { valid: false, message: MSG.emailEmpty }],
  ['§1 / №13', 'a@b.c', { valid: false, message: MSG.emailBad }],
  ['§1', 'a b@c.com', { valid: false, message: MSG.emailBad }],
  ['§1', '@x.com', { valid: false, message: MSG.emailBad }],
  ['§1', 'x@.com', { valid: false, message: MSG.emailBad }],
  ['§1 / №12', 'name@example', { valid: false, message: MSG.emailBad }],
  ['№11', 'olena.example.com', { valid: false, message: MSG.emailBad }],
  ['§4', 'hello name@example.com', { valid: false, message: MSG.emailBad }],
  ['§4', 'a@b.com @@@', { valid: false, message: MSG.emailBad }],
]);

/* ---------------- Телефон ---------------- */
const NORMAL = '+380501234567';
cases('Телефон', 'validatePhone', [
  ['§5 / №36', '0501234567', { valid: true, value: NORMAL, changed: true }],
  ['§5 / №37', '+380 50 123 45 67', { valid: true, value: NORMAL, changed: true }],
  ['§5 / №38', '(050) 123-45-67', { valid: true, value: NORMAL, changed: true }],
  ['§5', '380501234567', { valid: true, value: NORMAL, changed: true }],
  ['§5 / №1', '+380501234567', { valid: true, value: NORMAL, changed: false }],
  ['trim', '  +380501234567  ', { valid: true, value: NORMAL, changed: false }],
  ['§5 / №15', '+3805012345678', { valid: false, message: MSG.phoneMany }],
  ['§5 / №16', '+38050abc4567', { valid: false, message: MSG.phoneLetters }],
  ['§5 / №14', '050123', { valid: false, message: MSG.phoneFew }],
  ['§5', '050+1234567', { valid: false, message: MSG.phoneChars }],
  ['§5', '', { valid: false, message: MSG.phoneEmpty }],
  ['префікс', '+38050123', { valid: false, message: MSG.phoneFew }],
  ['префікс', '05012345678', { valid: false, message: MSG.phoneMany }],
  ['префікс', '+0501234567', { valid: false, message: MSG.phonePrefix }],
  ['префікс', '1234567890', { valid: false, message: MSG.phonePrefix }],
  ['кирилиця', '+38050абв4567', { valid: false, message: MSG.phoneLetters }],
  ['§4', 'abc+380501234567', { valid: false, message: MSG.phoneLetters }],
  ['§4', '+3805012345678999', { valid: false, message: MSG.phoneMany }],
  ['§4', 'tel: +380501234567 !!!', { valid: false, message: MSG.phoneLetters }],
]);

/* ---------------- Повідомлення ---------------- */
cases('Повідомлення', 'validateMessage', [
  ['§1', 'Привіт, все ок', { valid: true }],
  ['№1', 'Не отримала USDT після закриття угоди', { valid: true }],
  ['§1', 'коротко', { valid: false, message: MSG.messageShort }],
  ['№17', 'Привіт', { valid: false, message: MSG.messageShort }],
  ['№24 / §1', ' '.repeat(15), { valid: false, message: MSG.messageEmpty }],
  ['empty', '', { valid: false, message: MSG.messageEmpty }],
  ['№27', 'Дякую за допомогу 🙏🔥', { valid: true }],
  ['емодзі = 1 символ', '😀'.repeat(9), { valid: false, message: MSG.messageShort }],
  ['№35', '<script>alert(1)</script>', { valid: true, value: '<script>alert(1)</script>' }],
  ['№25 (1000)', 'а'.repeat(1000), { valid: true }],
  ['№25 (1001)', 'а'.repeat(1001), { valid: false, message: MSG.messageLong }],
]);

/* ---------------- Згода ---------------- */
cases('Згода', 'validateAgreement', [
  ['№1', true, { valid: true }],
  ['№18', false, { valid: false, message: MSG.agreement }],
  ['не boolean', 'on', { valid: false, message: MSG.agreement }],
]);

/* ---------------- RegEx: роль ^ і $ (docs/validation-rules.md §4) ---------------- */
test('§4: без ^ і $ RegEx пропускає сміття навколо значення', () => {
  const phoneNoAnchors = new RegExp(V.PHONE_RE.source.replace(/^\^|\$$/g, ''));
  const emailNoAnchors = new RegExp(V.EMAIL_RE.source.replace(/^\^|\$$/g, ''));

  for (const s of ['abc+380501234567', '+3805012345678999', 'tel: +380501234567 !!!']) {
    assert.equal(V.PHONE_RE.test(s), false, 'з якорями: ' + s);
    assert.equal(phoneNoAnchors.test(s), true, 'без якорів: ' + s);
  }
  for (const s of ['hello name@example.com', 'a@b.com @@@']) {
    assert.equal(V.EMAIL_RE.test(s), false, 'з якорями: ' + s);
    assert.equal(emailNoAnchors.test(s), true, 'без якорів: ' + s);
  }
});
