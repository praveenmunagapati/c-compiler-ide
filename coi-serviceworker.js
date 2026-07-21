/*! coi-serviceworker v0.1.7 - Guido Guidotti | MIT License */
let coepCredentialless = true;

if (typeof window === 'undefined') {
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

  self.addEventListener('message', (event) => {
    if (event.data) {
      if (event.data.type === 'deregister') {
        self.registration
          .unregister()
          .then(() => self.clients.matchAll())
          .then((clients) => {
            clients.forEach((client) => client.navigate(client.url));
          });
      } else if (event.data.type === 'coepCredentialless') {
        coepCredentialless = event.data.value;
      }
    }
  });

  self.addEventListener('fetch', function (event) {
    const r = event.request;
    if (r.cache === 'only-if-cached' && r.mode !== 'same-origin') {
      return;
    }

    const request = (coepCredentialless && r.mode === 'no-cors')
      ? new Request(r, { credentials: 'omit' })
      : r;

    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 0 || response.type === 'opaque') {
            return response;
          }

          const newHeaders = new Headers(response.headers);
          newHeaders.set(
            'Cross-Origin-Embedder-Policy',
            coepCredentialless ? 'credentialless' : 'require-corp'
          );

          if (!coepCredentialless) {
            newHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin');
          }

          newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');

          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          });
        })
        .catch((e) => console.error(e))
    );
  });
} else {
  (() => {
    const coi = {
      shouldRegister: () => true,
      shouldDeregister: () => false,
      coepCredentialless: () => true,
      doCoop: () => true,
      doCoep: () => true,
      quiet: false,
      ...window.coi
    };

    const n = navigator;
    if (coi.shouldDeregister() && n.serviceWorker && n.serviceWorker.controller) {
      n.serviceWorker.controller.postMessage({ type: 'deregister' });
    }

    if (coi.shouldRegister() && n.serviceWorker) {
      n.serviceWorker.register(window.document.currentScript.src).then(
        (registration) => {
          !coi.quiet && console.log('COI ServiceWorker registered', registration.scope);

          registration.addEventListener('updatefound', () => {
            !coi.quiet && console.log('COI ServiceWorker update found');
            const installingWorker = registration.installing;
            installingWorker.addEventListener('statechange', () => {
              if (installingWorker.state === 'installed') {
                if (n.serviceWorker.controller) {
                  !coi.quiet && console.log('COI ServiceWorker updated - reloading');
                  window.location.reload();
                } else {
                  !coi.quiet && console.log('COI ServiceWorker installed - reloading');
                  window.location.reload();
                }
              }
            });
          });
        },
        (err) => {
          !coi.quiet && console.error('COI ServiceWorker failed to register: ', err);
        }
      );

      if (n.serviceWorker.controller) {
        n.serviceWorker.controller.postMessage({
          type: 'coepCredentialless',
          value: coi.coepCredentialless()
        });
      }
    }
  })();
}
