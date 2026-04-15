import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock IntersectionObserver globally for all tests
const mockIntersectionObserver = vi.fn(() => ({
  observe: vi.fn(),
  disconnect: vi.fn(),
  unobserve: vi.fn(),
}));
vi.stubGlobal('IntersectionObserver', mockIntersectionObserver);
