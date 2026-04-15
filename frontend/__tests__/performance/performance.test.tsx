/**
 * Performance Tests - Task 16.5
 *
 * Tests for:
 * - Page load behavior on 3G connection (Req 16.1)
 * - Image optimization and lazy loading (Req 16.2, 16.3)
 * - Offline functionality (Req 16.4)
 * - Responsive design on multiple screen sizes (Req 17.1)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, act, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { render } from '../test-utils';
import LazyImage from '../../components/common/LazyImage';
import LazySection from '../../components/common/LazySection';
import CardSkeleton from '../../components/common/CardSkeleton';
import { useConnectionSpeed } from '../../lib/hooks/useConnectionSpeed';
import { useIntersectionObserver } from '../../lib/hooks/useIntersectionObserver';
import { useOfflineDraft, useServiceWorker } from '../../lib/hooks/useOfflineDraft';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockNavigatorConnection(props: Record<string, unknown>) {
  Object.defineProperty(navigator, 'connection', {
    value: {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      ...props,
    },
    configurable: true,
    writable: true,
  });
}

function clearNavigatorConnection() {
  Object.defineProperty(navigator, 'connection', {
    value: undefined,
    configurable: true,
    writable: true,
  });
}

let observerCallback: IntersectionObserverCallback;
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();

function setupIntersectionObserver() {
  vi.stubGlobal(
    'IntersectionObserver',
    vi.fn((cb: IntersectionObserverCallback) => {
      observerCallback = cb;
      return { observe: mockObserve, disconnect: mockDisconnect, unobserve: vi.fn() };
    }),
  );
}

// ---------------------------------------------------------------------------
// 1. Page load behavior on 3G connection (Req 16.1)
// ---------------------------------------------------------------------------

describe('3G connection adaptive loading', () => {
  afterEach(() => {
    clearNavigatorConnection();
    vi.unstubAllGlobals();
  });

  it('detects 3G connection as medium speed', () => {
    mockNavigatorConnection({ effectiveType: '3g' });
    const { result } = renderHook(() => useConnectionSpeed());
    expect(result.current).toBe('medium');
  });

  it('detects slow-2g as slow speed', () => {
    mockNavigatorConnection({ effectiveType: 'slow-2g' });
    const { result } = renderHook(() => useConnectionSpeed());
    expect(result.current).toBe('slow');
  });

  it('detects 4g as fast speed', () => {
    mockNavigatorConnection({ effectiveType: '4g' });
    const { result } = renderHook(() => useConnectionSpeed());
    expect(result.current).toBe('fast');
  });

  it('treats saveData flag as slow regardless of effectiveType', () => {
    mockNavigatorConnection({ effectiveType: '4g', saveData: true });
    const { result } = renderHook(() => useConnectionSpeed());
    expect(result.current).toBe('slow');
  });

  it('returns unknown when Network Information API is unavailable', () => {
    clearNavigatorConnection();
    const { result } = renderHook(() => useConnectionSpeed());
    expect(result.current).toBe('unknown');
  });

  it('updates speed when connection changes', async () => {
    // Set up initial 3g connection
    let changeHandler: EventListener | undefined;
    const connectionObj = {
      effectiveType: '3g' as string,
      saveData: false,
      addEventListener: vi.fn((_type: string, handler: EventListener) => {
        changeHandler = handler;
      }),
      removeEventListener: vi.fn(),
    };

    Object.defineProperty(navigator, 'connection', {
      get: () => connectionObj,
      configurable: true,
    });

    const { result } = renderHook(() => useConnectionSpeed());
    expect(result.current).toBe('medium');

    // Simulate connection upgrade to 4g
    act(() => {
      connectionObj.effectiveType = '4g';
      changeHandler?.(new Event('change'));
    });

    expect(result.current).toBe('fast');
  });
});

// ---------------------------------------------------------------------------
// 2. Image optimization and lazy loading (Req 16.2, 16.3)
// ---------------------------------------------------------------------------

describe('LazyImage - image optimization and lazy loading', () => {
  beforeEach(() => {
    setupIntersectionObserver();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockObserve.mockReset();
    mockDisconnect.mockReset();
  });

  it('shows skeleton placeholder before image loads', () => {
    render(
      <LazyImage
        src="/test-image.jpg"
        alt="Test image"
        width={400}
        height={300}
        skeletonHeight={300}
      />,
    );
    // Skeleton should be visible (MUI Skeleton renders as a div with animation)
    const skeleton = document.querySelector('.MuiSkeleton-root');
    expect(skeleton).toBeInTheDocument();
  });

  it('hides image element before onLoad fires', () => {
    render(
      <LazyImage
        src="/test-image.jpg"
        alt="Test image"
        width={400}
        height={300}
      />,
    );
    // The img element should be hidden (display: none) before load
    const img = document.querySelector('img');
    expect(img).toBeInTheDocument();
    expect(img?.style.display).toBe('none');
  });

  it('shows image and hides skeleton after onLoad fires', async () => {
    render(
      <LazyImage
        src="/test-image.jpg"
        alt="Test image"
        width={400}
        height={300}
        skeletonHeight={300}
      />,
    );

    const img = document.querySelector('img') as HTMLImageElement;
    expect(img?.style.display).toBe('none');

    // Simulate image load
    act(() => {
      img.dispatchEvent(new Event('load'));
    });

    await waitFor(() => {
      expect(img.style.display).toBe('block');
    });

    const skeleton = document.querySelector('.MuiSkeleton-root');
    expect(skeleton).not.toBeInTheDocument();
  });

  it('uses provided skeletonHeight for placeholder dimensions', () => {
    render(
      <LazyImage
        src="/test-image.jpg"
        alt="Test image"
        width={400}
        height={300}
        skeletonHeight={250}
      />,
    );
    const skeleton = document.querySelector('.MuiSkeleton-root') as HTMLElement;
    expect(skeleton).toBeInTheDocument();
    // MUI applies height via inline style
    expect(skeleton.style.height).toBe('250px');
  });

  it('renders with alt text for accessibility', () => {
    render(
      <LazyImage
        src="/test-image.jpg"
        alt="Financial report chart"
        width={400}
        height={300}
      />,
    );
    const img = document.querySelector('img');
    expect(img).toHaveAttribute('alt', 'Financial report chart');
  });
});

// ---------------------------------------------------------------------------
// 3. LazySection - deferred rendering for low-bandwidth (Req 16.1, 16.3)
// ---------------------------------------------------------------------------

describe('LazySection - deferred content loading', () => {
  beforeEach(() => {
    setupIntersectionObserver();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockObserve.mockReset();
    mockDisconnect.mockReset();
  });

  it('renders skeleton before section enters viewport', () => {
    render(
      <LazySection skeletonHeight={400}>
        <div data-testid="heavy-content">Heavy content</div>
      </LazySection>,
    );
    expect(screen.queryByTestId('heavy-content')).not.toBeInTheDocument();
    const skeleton = document.querySelector('.MuiSkeleton-root');
    expect(skeleton).toBeInTheDocument();
  });

  it('renders content once section enters viewport', () => {
    render(
      <LazySection skeletonHeight={400}>
        <div data-testid="heavy-content">Heavy content</div>
      </LazySection>,
    );

    act(() => {
      observerCallback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    expect(screen.getByTestId('heavy-content')).toBeInTheDocument();
  });

  it('does not render content when not intersecting', () => {
    render(
      <LazySection>
        <div data-testid="content">Content</div>
      </LazySection>,
    );

    act(() => {
      observerCallback(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
  });

  it('disconnects observer after content becomes visible (freeze-once)', () => {
    render(
      <LazySection>
        <div>Content</div>
      </LazySection>,
    );

    act(() => {
      observerCallback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    expect(mockDisconnect).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 4. CardSkeleton - loading placeholder for lists (Req 16.1)
// ---------------------------------------------------------------------------

describe('CardSkeleton - loading state placeholder', () => {
  it('renders default 3 skeleton cards', () => {
    render(<CardSkeleton />);
    const skeletons = document.querySelectorAll('.MuiCard-root');
    expect(skeletons).toHaveLength(3);
  });

  it('renders the specified number of skeleton rows', () => {
    render(<CardSkeleton rows={5} />);
    const cards = document.querySelectorAll('.MuiCard-root');
    expect(cards).toHaveLength(5);
  });

  it('renders skeleton text and rectangular placeholders inside each card', () => {
    render(<CardSkeleton rows={1} />);
    const textSkeletons = document.querySelectorAll('.MuiSkeleton-text');
    const rectSkeletons = document.querySelectorAll('.MuiSkeleton-rectangular');
    expect(textSkeletons.length).toBeGreaterThanOrEqual(2);
    expect(rectSkeletons.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 5. Offline functionality - service worker registration (Req 17.3)
// ---------------------------------------------------------------------------

describe('Service worker registration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers service worker when supported', () => {
    const mockRegister = vi.fn().mockResolvedValue({});
    vi.stubGlobal('navigator', {
      ...navigator,
      serviceWorker: { register: mockRegister },
    });

    renderHook(() => useServiceWorker());

    expect(mockRegister).toHaveBeenCalledWith('/sw.js');
  });

  it('does not throw when service worker is not supported', () => {
    // Create a navigator-like object without the serviceWorker property at all
    // so that 'serviceWorker' in navigator returns false
    const navWithoutSW = Object.create(
      Object.getPrototypeOf(navigator),
      Object.getOwnPropertyDescriptors(navigator),
    );
    delete (navWithoutSW as Record<string, unknown>).serviceWorker;
    vi.stubGlobal('navigator', navWithoutSW);

    expect(() => renderHook(() => useServiceWorker())).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 6. Offline draft persistence (Req 17.3)
// ---------------------------------------------------------------------------

describe('Offline draft - IndexedDB persistence', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('saveDraft resolves without throwing when IDB unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const { result } = renderHook(() => useOfflineDraft<{ amount: number }>('form-key'));
    await expect(result.current.saveDraft({ amount: 5000 })).resolves.not.toThrow();
  });

  it('loadDraft returns null when IDB unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const { result } = renderHook(() => useOfflineDraft<{ amount: number }>('form-key'));
    const draft = await result.current.loadDraft();
    expect(draft).toBeNull();
  });

  it('clearDraft resolves without throwing when IDB unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const { result } = renderHook(() => useOfflineDraft<{ amount: number }>('form-key'));
    await expect(result.current.clearDraft()).resolves.not.toThrow();
  });

  it('returns stable function references across renders', () => {
    const { result, rerender } = renderHook(() => useOfflineDraft('stable-key'));
    const first = result.current;
    rerender();
    const second = result.current;
    expect(first.saveDraft).toBe(second.saveDraft);
    expect(first.loadDraft).toBe(second.loadDraft);
    expect(first.clearDraft).toBe(second.clearDraft);
  });
});

// ---------------------------------------------------------------------------
// 7. Responsive design - viewport meta and layout (Req 17.1)
// ---------------------------------------------------------------------------

describe('Responsive design - viewport and layout', () => {
  const SCREEN_SIZES = [
    { name: 'mobile-xs', width: 320 },
    { name: 'mobile', width: 375 },
    { name: 'tablet', width: 768 },
    { name: 'desktop', width: 1280 },
    { name: 'wide', width: 1920 },
    { name: 'ultrawide', width: 2560 },
  ];

  beforeEach(() => {
    setupIntersectionObserver();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockObserve.mockReset();
    mockDisconnect.mockReset();
  });

  SCREEN_SIZES.forEach(({ name, width }) => {
    it(`CardSkeleton renders correctly at ${name} (${width}px)`, () => {
      // Simulate viewport width
      Object.defineProperty(window, 'innerWidth', {
        value: width,
        configurable: true,
        writable: true,
      });

      const { container } = render(<CardSkeleton rows={2} />);
      expect(container.firstChild).toBeInTheDocument();
      // Component should render without errors at any viewport width
      const cards = container.querySelectorAll('.MuiCard-root');
      expect(cards).toHaveLength(2);
    });
  });

  it('LazySection renders at minimum supported width (320px)', () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 320,
      configurable: true,
      writable: true,
    });

    render(
      <LazySection skeletonHeight={200}>
        <div data-testid="responsive-content">Content</div>
      </LazySection>,
    );

    // Should render skeleton at minimum width without errors
    const skeleton = document.querySelector('.MuiSkeleton-root');
    expect(skeleton).toBeInTheDocument();
  });

  it('LazySection renders at maximum supported width (2560px)', () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 2560,
      configurable: true,
      writable: true,
    });

    render(
      <LazySection skeletonHeight={200}>
        <div data-testid="responsive-content">Content</div>
      </LazySection>,
    );

    const skeleton = document.querySelector('.MuiSkeleton-root');
    expect(skeleton).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 8. IntersectionObserver hook - core lazy loading primitive (Req 16.3)
// ---------------------------------------------------------------------------

describe('useIntersectionObserver - lazy loading primitive', () => {
  beforeEach(() => {
    setupIntersectionObserver();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockObserve.mockReset();
    mockDisconnect.mockReset();
  });

  it('starts with isVisible = false', () => {
    const { result } = renderHook(() => useIntersectionObserver());
    expect(result.current.isVisible).toBe(false);
  });

  it('sets isVisible to true when element intersects via LazySection', () => {
    // useIntersectionObserver requires a ref attached to a DOM element.
    // Test it through LazySection which wires the ref to a real Box element.
    render(
      <LazySection skeletonHeight={200}>
        <div data-testid="io-content">Content</div>
      </LazySection>,
    );

    act(() => {
      observerCallback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    expect(screen.getByTestId('io-content')).toBeInTheDocument();
  });

  it('stays visible after intersection (freezeOnceVisible default) via LazySection', () => {
    render(
      <LazySection skeletonHeight={200}>
        <div data-testid="io-frozen">Frozen content</div>
      </LazySection>,
    );

    act(() => {
      observerCallback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    // Content should remain visible even after a non-intersecting event
    act(() => {
      observerCallback(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    expect(screen.getByTestId('io-frozen')).toBeInTheDocument();
  });

  it('returns a ref object', () => {
    const { result } = renderHook(() => useIntersectionObserver());
    expect(result.current.ref).toBeDefined();
    expect(result.current.ref).toHaveProperty('current');
  });
});

// ---------------------------------------------------------------------------
// 9. Next.js config - image optimization settings (Req 16.3)
// ---------------------------------------------------------------------------

describe('Next.js image optimization configuration', () => {
  it('next.config.ts exports image optimization settings', async () => {
    // Dynamically import to verify the config shape
    const { default: nextConfig } = await import('../../next.config');

    expect(nextConfig.images).toBeDefined();
    expect(nextConfig.images?.formats).toContain('image/webp');
    expect(nextConfig.images?.minimumCacheTTL).toBeGreaterThanOrEqual(86400); // 24h
  });

  it('next.config.ts enables response compression', async () => {
    const { default: nextConfig } = await import('../../next.config');
    expect(nextConfig.compress).toBe(true);
  });

  it('next.config.ts configures static asset cache headers', async () => {
    const { default: nextConfig } = await import('../../next.config');
    const headers = await nextConfig.headers?.();
    expect(headers).toBeDefined();

    const staticHeader = headers?.find((h) => h.source.includes('_next/static'));
    expect(staticHeader).toBeDefined();

    const cacheControl = staticHeader?.headers.find((h) => h.key === 'Cache-Control');
    expect(cacheControl?.value).toContain('max-age=31536000');
    expect(cacheControl?.value).toContain('immutable');
  });

  it('next.config.ts includes responsive device sizes', async () => {
    const { default: nextConfig } = await import('../../next.config');
    const deviceSizes = nextConfig.images?.deviceSizes ?? [];

    // Must include minimum supported width (320px)
    expect(deviceSizes).toContain(320);
    // Must include common mobile width
    expect(deviceSizes.some((s) => s >= 640)).toBe(true);
    // Must include desktop width
    expect(deviceSizes.some((s) => s >= 1280)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 10. PWA manifest - offline installability (Req 17.3)
// ---------------------------------------------------------------------------

describe('PWA manifest configuration', () => {
  it('manifest.json has required PWA fields', async () => {
    const manifest = await import('../../public/manifest.json');

    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBeTruthy();
    expect(manifest.background_color).toBeTruthy();
  });

  it('manifest.json includes app icons', async () => {
    const manifest = await import('../../public/manifest.json');

    expect(manifest.icons).toBeDefined();
    expect(manifest.icons.length).toBeGreaterThan(0);

    // Should have at least a 192x192 icon
    const has192 = manifest.icons.some((icon) => icon.sizes === '192x192');
    expect(has192).toBe(true);
  });

  it('manifest.json includes app shortcuts for quick access', async () => {
    const manifest = await import('../../public/manifest.json');

    expect(manifest.shortcuts).toBeDefined();
    expect(manifest.shortcuts.length).toBeGreaterThan(0);
  });
});
