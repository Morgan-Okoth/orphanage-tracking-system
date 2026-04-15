'use client';

import { Card, CardContent, Typography, Box, SvgIconProps } from '@mui/material';
import { ElementType } from 'react';

interface StatisticsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ElementType<SvgIconProps>;
  color?: string;
}

export default function StatisticsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = '#1976d2',
}: StatisticsCardProps) {
  return (
    <Card sx={{ height: '100%', borderLeft: `4px solid ${color}` }}>
      <CardContent>
        <Box display="flex" alignItems="flex-start" justifyContent="space-between">
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {title}
            </Typography>
            <Typography variant="h4" fontWeight={700} color={color}>
              {value}
            </Typography>
            {subtitle && (
              <Typography variant="caption" color="text.secondary" mt={0.5} display="block">
                {subtitle}
              </Typography>
            )}
          </Box>
          {Icon && (
            <Box
              sx={{
                bgcolor: `${color}18`,
                borderRadius: 2,
                p: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon sx={{ color, fontSize: 32 }} />
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
