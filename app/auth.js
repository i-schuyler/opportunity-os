import { getMockSession, signInWithEmail } from '../lib/auth-scaffold.js';

const form = document.getElementById('auth-form');
const messageNode = document.getElementById('auth-message');

const existingSession = getMockSession();
if (existingSession) {
  window.location.replace('./dashboard.html');
}

if (form) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const email = String(formData.get('email') || '');
    const session = signInWithEmail(email);

    if (!session && messageNode) {
      messageNode.textContent = 'Enter a valid email to continue.';
      return;
    }

    window.location.assign('./dashboard.html');
  });
}
