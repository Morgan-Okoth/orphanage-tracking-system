import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, act } from '@testing-library/react';
import { render } from '../test-utils';
import LazySection from '../../components/common/LazySection';

// Mock IntersectionObserver
let observerCallback: IntersectionObserverCallback;
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();

beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    vi.fn((cb: IntersectionObserverCallback) => {
      observerCallback = cb;
      return { observe: mockObserve, disconnect: mockDisconnect };
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  mockObserve.mockReset();
  mockDisconnect.mockReset();
});

describe('LazySection', () => {
  it('renders skeleton before intersection', () => {
    render(
      <LazySection skeletonHeight={300}>
        <div data-testid="content">Loaded content</div>
      </LazySection>,
    );
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
  });

  it('renders children after intersection', async () => {
    render(
      <LazySection skeletonHeight={300}>
        <div data-testid="content">Loaded content</div>
      </LazySection>,
    );

    // Simulate intersection
    act(() => {
      observerCallback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });

    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('disconnects observer after becoming visible', async () => {
    render(
      <LazySection>
        <div>Content</div>
      </LazySection>,
    );

    act(() => {
      observerCallback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });

    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('does not render children when not intersecting', () => {
    render(
      <LazySection>
        <div data-testid="content">Content</div>
      </LazySection>,
    );

    act(() => {
      observerCallback([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
    });

    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
  });
});
