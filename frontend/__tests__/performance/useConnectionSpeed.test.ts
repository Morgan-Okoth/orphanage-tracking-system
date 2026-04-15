import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConnectionSpeed } from '../../lib/hooks/useConnectionSpeed';

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

afterEach(() => {
  // Reset connection
  Object.defineProperty(navigator, 'connection', {
    value: undefined,
    configurable: true,
    writable: true,
  });
});

describe('useConnectionSpeed', () => {
  it('returns unknown when no connection API', () => {
    Object.defineProperty(navigator, 'connection', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    const { result } = renderHook(() => useConnectionSpeed());
    expect(result.current).toBe('unknown');
  });

  it('returns slow for 2g connection', () => {
    mockNavigatorConnection({ effectiveType: '2g' });
    const { result } = renderHook(() => useConnectionSpeed());
    expect(result.current).toBe('slow');
  });

  it('returns slow for slow-2g connection', () => {
    mockNavigatorConnection({ effectiveType: 'slow-2g' });
    const { result } = renderHook(() => useConnectionSpeed());
    expect(result.current).toBe('slow');
  });

  it('returns medium for 3g connection', () => {
    mockNavigatorConnection({ effectiveType: '3g' });
    const { result } = renderHook(() => useConnectionSpeed());
    expect(result.current).toBe('medium');
  });

  it('returns fast for 4g connection', () => {
    mockNavigatorConnection({ effectiveType: '4g' });
    const { result } = renderHook(() => useConnectionSpeed());
    expect(result.current).toBe('fast');
  });

  it('returns slow when saveData is true', () => {
    mockNavigatorConnection({ effectiveType: '4g', saveData: true });
    const { result } = renderHook(() => useConnectionSpeed());
    expect(result.current).toBe('slow');
  });
});
