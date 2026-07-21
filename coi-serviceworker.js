/*! coi-serviceworker v0.1.7 - Guido Guidotti | MIT License */
if (typeof window === 'undefined') {
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

  self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'deregister') {
      self.registration
        .unregister()
        .then(() => self.clients.matchAll())
        .then((clients) => {
          clients.forEach((client) => client.navigate(client.url));
        });
    }
  });

  self.addEventListener('fetch', (event) => {
    const r = event.request;
    if (r.cache === 'only-if-cached' && r.mode !== 'same-origin') {
      return;
    }

    const request = (r.mode === 'no-cors' && r.redirect === 'follow')
      ? new Request(r, { mode: 'cors' })
      : r;

    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 0) {
            return response;
          }

          const newHeaders = new Headers(response.headers);
          newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
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
      quiet: false,
      ...window.coi,
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
    }
  })();
}
