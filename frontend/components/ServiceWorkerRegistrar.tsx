'use client';

import { useServiceWorker } from '../lib/hooks/useOfflineDraft';

/** Thin client component that registers the SW — keeps layout as a Server Component */
export default function ServiceWorkerRegistrar() {
  useServiceWorker();
  return null;
}
