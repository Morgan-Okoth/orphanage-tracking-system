import { Box, Typography, Divider, Grid, Card, CardContent, Button, Stack } from '@mui/material';
import Link from 'next/link';
import ShieldIcon from '@mui/icons-material/Shield';
import PeopleIcon from '@mui/icons-material/People';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import VolunteerActivismIcon from '@mui/icons-material/VolunteerActivism';
import ProtectedRoute from '../../../components/auth/ProtectedRoute';
import { UserRole } from '../../../lib/types/user';

const cards = [
  {
    title: 'Govern Users',
    copy: 'Approve registrations, assign internal roles, and deactivate accounts without exposing role self-selection publicly.',
    href: '/admin/users',
    icon: <PeopleIcon color="primary" />,
  },
  {
    title: 'Review Pending Accounts',
    copy: 'Keep beneficiary onboarding and internal staffing under direct oversight.',
    href: '/admin/users/pending',
    icon: <ShieldIcon color="primary" />,
  },
  {
    title: 'Oversee Audit Work',
    copy: 'Move straight into anomaly reports and verification flows when oversight is needed.',
    href: '/auditor',
    icon: <VerifiedUserIcon color="primary" />,
  },
  {
    title: 'Shape Donor Journey',
    copy: 'Manage the public donation destination and verify that public transparency pages support trust.',
    href: '/donate',
    icon: <VolunteerActivismIcon color="primary" />,
  },
];

export default function SuperadminDashboardPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPERADMIN]}>
      <Box>
        <Typography variant="h5" fontWeight={700} mb={1}>
          Superadmin Dashboard
        </Typography>
        <Typography variant="body1" color="text.secondary" mb={3}>
          Governance, internal access control, donor experience, and oversight tools in one place.
        </Typography>
        <Divider sx={{ mb: 3 }} />
        <Grid container spacing={2}>
          {cards.map((card) => (
            <Grid item xs={12} md={6} key={card.title}>
              <Card variant="outlined" sx={{ height: '100%' }}>
                <CardContent>
                  <Stack direction="row" spacing={1.5} alignItems="center" mb={1}>
                    {card.icon}
                    <Typography variant="h6">{card.title}</Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary" mb={3}>
                    {card.copy}
                  </Typography>
                  <Button component={Link} href={card.href} variant="contained">
                    Open
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>
    </ProtectedRoute>
  );
}
