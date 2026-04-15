'use client';

import { useState } from 'react';
import Image, { ImageProps } from 'next/image';
import { Skeleton, Box } from '@mui/material';

interface LazyImageProps extends Omit<ImageProps, 'onLoad'> {
  skeletonHeight?: number;
}

export default function LazyImage({ skeletonHeight = 200, alt, ...props }: LazyImageProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <Box position="relative">
      {!loaded && (
        <Skeleton
          variant="rectangular"
          width={typeof props.width === 'number' ? props.width : '100%'}
          height={skeletonHeight}
          sx={{ borderRadius: 1 }}
        />
      )}
      <Image
        alt={alt}
        {...props}
        style={{ ...props.style, display: loaded ? 'block' : 'none' }}
        onLoad={() => setLoaded(true)}
      />
    </Box>
  );
}
