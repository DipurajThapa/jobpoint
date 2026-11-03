/* ==========================================================================
   APP LAYER. Handles installing, updating and the version display.
   The build fills in the version and release notes.
   ========================================================================== */
(function () {
  const VERSION = '__VERSION__';
  const NOTES = __NOTES__;
  const $ = id => document.getElementById(id);
  const STORE_VERSION = 'usha-version';
  const HOUR = 3600000;
  const isPage = __STANDALONE__;
  const isFile = isPage || location.protocol === 'file:';
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let installEvent = null;
  let registration = null;
  let applying = false;
  let dismissed = '';

  const status = text => { $('appStatus').textContent = text; };

  function showVersion() {
    $('appVersion').textContent = 'You are using version ' + VERSION + '.';
    if (isFile) return;
    try {
      const previous = localStorage.getItem(STORE_VERSION);
      if (previous && previous !== VERSION) window.UshaApp.showToast('Usha is updated to version ' + VERSION + '. ' + NOTES);
      localStorage.setItem(STORE_VERSION, VERSION);
    } catch (e) { /* storage may be unavailable */ }
  }

  function showInstallHelp() {
    const once = ' Do this once only. Updates arrive inside the same app, so you never need to install it again.';
    const text = $('installText');
    const button = $('installApp');
    button.hidden = !installEvent || standalone();
    if (isPage) {
      $('installBlock').hidden = true;
      return;
    }
    if (isFile) text.textContent = 'This copy runs from a file, so it cannot install or update. Open it from your app link instead.';
    else if (standalone()) text.textContent = 'Usha is installed. Updates arrive inside this app, so you never need to install it again.';
    else if (installEvent) text.textContent = 'Install Usha on this device.' + once;
    else if (isIos) text.textContent = 'In Safari, tap Share and then Add to Home Screen.' + once;
    else text.textContent = 'Open your browser menu and choose the install option. If the app is already installed, open it from your home screen instead.' + once;
  }

  function info(worker) {
    return new Promise(resolve => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolve({ version: 'new', notes: '' }), 1500);
      channel.port1.onmessage = e => { clearTimeout(timer); resolve(e.data); };
      worker.postMessage({ type: 'GET_INFO' }, [channel.port2]);
    });
  }

  function apply(worker) {
    applying = true;
    worker.postMessage({ type: 'APPLY_UPDATE' });
  }

  async function offerUpdate(worker) {
    /* With nothing on screen to lose, the update applies without a question. */
    if (!window.UshaApp.hasWork()) { apply(worker); return; }
    const details = await info(worker);
    if (dismissed === details.version) return;
    $('updateText').textContent = 'Version ' + details.version + ' is ready. ' + details.notes + ' Updating restarts Usha and clears the form, so please copy your draft first.';
    $('updateNow').onclick = () => { $('updateBar').hidden = true; apply(worker); };
    $('updateLater').onclick = () => {
      dismissed = details.version;
      $('updateBar').hidden = true;
      status('The update will apply the next time you open Usha.');
    };
    $('updateBar').hidden = false;
    status('Version ' + details.version + ' is ready to install.');
  }

  function watch(worker) {
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
    });
  }

  async function checkForUpdate(manual) {
    if (!navigator.onLine) {
      if (manual) status('You are offline, so Usha cannot check for updates.');
      return;
    }
    if (!registration) return;
    if (manual) status('Checking for updates.');
    try {
      await registration.update();
      if (!manual) return;
      if (registration.installing) status('Downloading the new version.');
      else if (registration.waiting) offerUpdate(registration.waiting);
      else status('You have the latest version.');
    } catch (e) {
      if (manual) status('Usha could not reach the update server. Please try again later.');
    }
  }

  async function start() {
    if (isFile || !('serviceWorker' in navigator)) {
      $('checkUpdate').hidden = true;
      if (isPage) {
        $('appSummary').textContent = 'Version and backup';
        $('appStatus').hidden = true;
      } else if (isFile) status('Updates are available only in the installed app.');
      return;
    }
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (applying) { applying = false; location.reload(); }
    });
    try {
      /* The file name and scope never change, so every version updates the same app. */
      registration = await navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' });
    } catch (e) {
      /* Opening offline can reject this call even though the app is installed. */
      registration = await navigator.serviceWorker.getRegistration().catch(() => null);
      if (!registration) {
        status('Offline use is not available in this browser.');
        return;
      }
    }
    if (registration.waiting && navigator.serviceWorker.controller) offerUpdate(registration.waiting);
    if (registration.installing) watch(registration.installing);
    registration.addEventListener('updatefound', () => watch(registration.installing));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(false); });
    setInterval(() => checkForUpdate(false), HOUR);
    if (navigator.serviceWorker.controller) checkForUpdate(false);
    else status('Usha is ready to work offline.');
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    installEvent = e;
    showInstallHelp();
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    showInstallHelp();
    window.UshaApp.showToast('Usha is installed. Please use the app icon from now on.');
  });
  $('installApp').addEventListener('click', async () => {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice;
    installEvent = null;
    showInstallHelp();
  });
  $('checkUpdate').addEventListener('click', () => checkForUpdate(true));

  showVersion();
  showInstallHelp();
  start();
})();
