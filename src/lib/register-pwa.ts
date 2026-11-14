const previewLabel = /^(?:id-preview|preview)(?:-[a-z0-9]+)?--.+$/;
const previewDomain = /\.(?:lovable\.app|gpt-eng\.com|gptengineer\.run)$/;
const devDomain = /^project--.+-dev\.(?:lovable\.app|gpt-eng\.com|gptengineer\.run)$/;

function isAppServiceWorker(worker: ServiceWorker | null | undefined, scriptUrl: string) {
  return worker?.scriptURL === scriptUrl;
}

export async function registerVocabularyPwa() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const hostname = window.location.hostname.toLowerCase();
  const scriptUrl = new URL("/sw.js", window.location.origin).href;
  const preview = previewLabel.test(hostname.split(".")[0] ?? "") && previewDomain.test(hostname);
  const excludedDomain =
    hostname === "lovableproject.com" ||
    hostname.endsWith(".lovableproject.com") ||
    hostname === "lovableproject-dev.com" ||
    hostname.endsWith(".lovableproject-dev.com") ||
    hostname === "beta.lovable.dev" ||
    hostname.endsWith(".beta.lovable.dev");
  const allowed =
    import.meta.env.PROD &&
    window.self === window.top &&
    !preview &&
    !devDomain.test(hostname) &&
    !excludedDomain;

  if (!allowed) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(registrations.map((registration) => {
      const matching = [registration.active, registration.waiting, registration.installing]
        .some((worker) => isAppServiceWorker(worker, scriptUrl));
      return matching ? registration.unregister() : Promise.resolve(false);
    }));
    return;
  }

  await navigator.serviceWorker.register(scriptUrl, { scope: "/" });
}