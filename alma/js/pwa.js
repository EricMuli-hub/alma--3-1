'use strict';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(error => {
    console.error('Alma offline support could not be registered.', error);
  });
}

let installPrompt;
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  let button = document.querySelector('.pwa-install');
  if (!button) {
    button = document.createElement('button');
    button.className = 'pwa-install';
    button.type = 'button';
    button.textContent = 'Install Alma';
    document.body.append(button);
    button.addEventListener('click', async () => {
      if (!installPrompt) return;
      const prompt = installPrompt;
      installPrompt = null;
      button.hidden = true;
      await prompt.prompt();
    });
  }
  button.hidden = false;
});

window.addEventListener('appinstalled', () => {
  const button = document.querySelector('.pwa-install');
  if (button) button.remove();
  installPrompt = null;
});
