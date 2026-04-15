'use client';

import { Box, Typography, LinearProgress, Tooltip } from '@mui/material';
import { MonthlyStatistic } from '../../lib/api/public';

interface FundingChartProps {
  data: MonthlyStatistic[];
}

function formatKES(amount: number): string {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function FundingChart({ data }: FundingChartProps) {
  if (!data || data.length === 0) {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" minHeight={200}>
        <Typography color="text.secondary">No monthly data available</Typography>
      </Box>
    );
  }

  const maxValue = Math.max(...data.flatMap((d) => [d.totalReceived, d.totalDisbursed]));

  return (
    <Box>
      {/* Legend */}
      <Box display="flex" gap={3} mb={2}>
        <Box display="flex" alignItems="center" gap={1}>
          <Box sx={{ width: 16, height: 16, bgcolor: '#1976d2', borderRadius: 0.5 }} />
          <Typography variant="caption">Received</Typography>
        </Box>
        <Box display="flex" alignItems="center" gap={1}>
          <Box sx={{ width: 16, height: 16, bgcolor: '#2e7d32', borderRadius: 0.5 }} />
          <Typography variant="caption">Disbursed</Typography>
        </Box>
      </Box>

      {/* Bars */}
      <Box display="flex" flexDirection="column" gap={2}>
        {data.map((item) => {
          const receivedPct = maxValue > 0 ? (item.totalReceived / maxValue) * 100 : 0;
          const disbursedPct = maxValue > 0 ? (item.totalDisbursed / maxValue) * 100 : 0;
          const label = item.month.length === 7
            ? new Date(`${item.month}-01`).toLocaleDateString('en-KE', { month: 'short', year: 'numeric' })
            : item.month;

          return (
            <Box key={item.month}>
              <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                {label}
              </Typography>
              <Tooltip title={`Received: ${formatKES(item.totalReceived)}`} placement="top">
                <Box mb={0.5}>
                  <LinearProgress
                    variant="determinate"
                    value={receivedPct}
                    sx={{
                      height: 12,
                      borderRadius: 1,
                      bgcolor: '#e3f2fd',
                      '& .MuiLinearProgress-bar': { bgcolor: '#1976d2', borderRadius: 1 },
                    }}
                  />
                </Box>
              </Tooltip>
              <Tooltip title={`Disbursed: ${formatKES(item.totalDisbursed)}`} placement="top">
                <Box>
                  <LinearProgress
                    variant="determinate"
                    value={disbursedPct}
                    sx={{
                      height: 12,
                      borderRadius: 1,
                      bgcolor: '#e8f5e9',
                      '& .MuiLinearProgress-bar': { bgcolor: '#2e7d32', borderRadius: 1 },
                    }}
                  />
                </Box>
              </Tooltip>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
