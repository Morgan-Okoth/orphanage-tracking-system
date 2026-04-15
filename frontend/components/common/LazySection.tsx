'use client';

import { Box, Skeleton } from '@mui/material';
import { useIntersectionObserver } from '../../lib/hooks/useIntersectionObserver';

interface Props {
  children: React.ReactNode;
  skeletonHeight?: number;
  rootMargin?: string;
}

/**
 * Defers rendering children until the section scrolls into view.
 * Reduces initial JS execution on low-bandwidth devices.
 */
export default function LazySection({ children, skeletonHeight = 300, rootMargin = '200px' }: Props) {
  const { ref, isVisible } = useIntersectionObserver({ rootMargin, freezeOnceVisible: true });

  return (
    <Box ref={ref}>
      {isVisible ? children : <Skeleton variant="rectangular" height={skeletonHeight} sx={{ borderRadius: 1 }} />}
    </Box>
  );
}
