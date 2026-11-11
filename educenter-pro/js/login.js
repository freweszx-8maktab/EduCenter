import { init, call, login, logout, getToken, setToken } from './api.js';
import './theme.js';
import { icon, esc } from './ui.js';

const $ = (id) => document.getElementById(id);
const form = $('login-form');
const alertBox = $('login-alert');

$('aside-points').innerHTML = [
  'Расписание, отмены и переносы занятий',
  'Посещаемость и оценки по предметам',
  'Домашние задания и отправка работ',
  'EduCoins, рейтинг и награды',
].map((t) => `<li>${icon('check', 20).__raw}<span>${esc(t)}</span></li>`).join('');

// Demo credentials are intentionally not displayed on the public login screen.
$('toggle-pw').addEventListener('click', (e) => {
  const pw = $('password');
  const show = pw.type === 'password';
  pw.type = show ? 'text' : 'password';
  e.currentTarget.textContent = show ? 'Скрыть' : 'Показать';
});

function showError(msg) {
  alertBox.innerHTML = msg ? `<div class="alert alert--bad" style="margin-top:20px">${icon('alert', 18).__raw}<div>${esc(msg)}</div></div>` : '';
}
function fieldError(id, msg) {
  const el = $(`${id}-err`);
  el.hidden = !msg; el.textContent = msg || '';
  $(id).setAttribute('aria-invalid', msg ? 'true' : 'false');
}

const ready = init(); // the submit handler below is attached synchronously; it waits for this

// Already signed in? Skip the form.
ready.then(async () => {
  if (!getToken()) return;
  try { await call('me'); location.replace('student.html'); } catch (e) {
    if (e.code === 'FORBIDDEN') { try { await call('staff.me'); location.replace('teacher.html'); } catch { setToken(null); } } else setToken(null);
  }
});
const params = new URLSearchParams(location.search);
if (params.get('expired')) showError('Сессия завершена. Войдите снова.');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');
  const loginVal = $('login').value.trim();
  const pw = $('password').value;
  fieldError('login', loginVal ? '' : 'Введите логин');
  fieldError('password', pw ? '' : 'Введите пароль');
  if (!loginVal || !pw) return;

  const btn = $('submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Вход…';
  try {
    await ready;
    const { user } = await login(loginVal, pw);
    location.replace(user.role === 'student' ? 'student.html' : 'teacher.html'); // teachers and administrators share one cabinet
    return;
  } catch (err) {
    showError(err.message);
    $('password').value = '';
    $('password').focus();
  }
  btn.disabled = false;
  btn.textContent = 'Войти';
});
