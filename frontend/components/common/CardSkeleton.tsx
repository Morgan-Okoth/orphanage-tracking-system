import { Card, CardContent, Skeleton, Stack } from '@mui/material';

interface Props {
  rows?: number;
  height?: number;
}

export default function CardSkeleton({ rows = 3, height = 80 }: Props) {
  return (
    <Stack spacing={1.5}>
      {Array.from({ length: rows }).map((_, i) => (
        <Card key={i} variant="outlined">
          <CardContent>
            <Skeleton variant="text" width="60%" height={24} />
            <Skeleton variant="text" width="40%" height={20} sx={{ mt: 0.5 }} />
            <Skeleton variant="rectangular" height={height - 60} sx={{ mt: 1, borderRadius: 1 }} />
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}
