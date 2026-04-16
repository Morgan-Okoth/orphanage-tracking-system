'use client';

import { useState } from 'react';
import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Divider,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import AssignmentIcon from '@mui/icons-material/Assignment';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import PeopleIcon from '@mui/icons-material/People';
import LogoutIcon from '@mui/icons-material/Logout';
import FlagIcon from '@mui/icons-material/Flag';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import BarChartIcon from '@mui/icons-material/BarChart';
import HistoryIcon from '@mui/icons-material/History';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import ShieldIcon from '@mui/icons-material/Shield';
import VolunteerActivismIcon from '@mui/icons-material/VolunteerActivism';
import Link from 'next/link';
import { useAuth } from '../../lib/contexts/AuthContext';
import { UserRole } from '../../lib/types/user';
import ProtectedRoute from '../../components/auth/ProtectedRoute';
import { getRoleLabel } from '../../lib/utils/roleRoutes';

const DRAWER_WIDTH = 220;

interface NavLink {
  href: string;
  label: string;
  icon: React.ReactNode;
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();

  const studentLinks: NavLink[] = [
    { href: '/student', label: 'Dashboard', icon: <DashboardIcon /> },
    { href: '/student/requests/new', label: 'New Request', icon: <AddCircleOutlineIcon /> },
  ];

  const adminLinks: NavLink[] = [
    { href: '/admin', label: 'Dashboard', icon: <DashboardIcon /> },
    { href: '/admin/requests', label: 'All Requests', icon: <AssignmentIcon /> },
    { href: '/admin/users', label: 'Users', icon: <PeopleIcon /> },
    { href: '/admin/users/pending', label: 'Pending Approvals', icon: <PendingActionsIcon /> },
  ];

  const auditorLinks: NavLink[] = [
    { href: '/auditor', label: 'Dashboard', icon: <DashboardIcon /> },
    { href: '/auditor/verify', label: 'Verify Requests', icon: <VerifiedUserIcon /> },
    { href: '/auditor/reports', label: 'Anomaly Reports', icon: <BarChartIcon /> },
    { href: '/auditor/audit', label: 'Audit Logs', icon: <HistoryIcon /> },
    { href: '/auditor/flagged', label: 'Flagged Cases', icon: <FlagIcon /> },
  ];

  const superadminLinks: NavLink[] = [
    { href: '/superadmin', label: 'Overview', icon: <ShieldIcon /> },
    { href: '/admin/requests', label: 'Operations Queue', icon: <AssignmentIcon /> },
    { href: '/admin/users', label: 'User Governance', icon: <PeopleIcon /> },
    { href: '/admin/users/pending', label: 'Pending Approvals', icon: <PendingActionsIcon /> },
    { href: '/auditor/reports', label: 'Audit Reports', icon: <BarChartIcon /> },
    { href: '/donate', label: 'Donor Journey', icon: <VolunteerActivismIcon /> },
  ];

  const links =
    user?.role === UserRole.STUDENT
      ? studentLinks
      : user?.role === UserRole.ADMIN_LEVEL_2
        ? auditorLinks
        : user?.role === UserRole.SUPERADMIN
          ? superadminLinks
          : adminLinks;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar>
        <Box>
          <Typography variant="h6" noWrap fontWeight={700}>
            FTS
          </Typography>
          {user && (
            <Typography variant="caption" color="text.secondary">
              {getRoleLabel(user.role)}
            </Typography>
          )}
        </Box>
      </Toolbar>
      <Divider />
      <List sx={{ flex: 1 }} role="navigation" aria-label="Main navigation">
        {links.map(({ href, label, icon }) => (
          <ListItem key={href} disablePadding>
            <ListItemButton
              component={Link}
              href={href}
              onClick={onNavigate}
              sx={{ minHeight: 48 }} // 48px touch target
            >
              <ListItemIcon sx={{ minWidth: 36 }} aria-hidden="true">{icon}</ListItemIcon>
              <ListItemText primary={label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      <Divider />
      <List>
        <ListItem disablePadding>
          <ListItemButton
            onClick={() => { logout(); onNavigate?.(); }}
            sx={{ minHeight: 48 }}
            aria-label="Logout"
          >
            <ListItemIcon sx={{ minWidth: 36 }} aria-hidden="true">
              <LogoutIcon />
            </ListItemIcon>
            <ListItemText primary="Logout" />
          </ListItemButton>
        </ListItem>
      </List>
    </Box>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleDrawerToggle = () => setMobileOpen((prev) => !prev);

  const drawerContent = <SidebarNav onNavigate={isMobile ? () => setMobileOpen(false) : undefined} />;

  return (
    <ProtectedRoute>
      <Box sx={{ display: 'flex', minHeight: '100vh' }}>
        {/* Desktop: permanent drawer */}
        {!isMobile && (
          <Drawer
            variant="permanent"
            sx={{
              width: DRAWER_WIDTH,
              flexShrink: 0,
              '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
            }}
          >
            {drawerContent}
          </Drawer>
        )}

        {/* Mobile: temporary drawer */}
        {isMobile && (
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={handleDrawerToggle}
            ModalProps={{ keepMounted: true }}
            sx={{
              '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
            }}
          >
            {drawerContent}
          </Drawer>
        )}

        <Box component="main" sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <AppBar
            position="static"
            elevation={0}
            sx={{
              background: 'linear-gradient(135deg, #1565c0 0%, #1976d2 60%, #42a5f5 100%)',
              color: 'common.white',
            }}
          >
            <Toolbar>
              {isMobile && (
                <IconButton
                  edge="start"
                  color="inherit"
                  aria-label="Open navigation menu"
                  onClick={handleDrawerToggle}
                  sx={{ mr: 1 }}
                >
                  <MenuIcon />
                </IconButton>
              )}
              <Typography variant="subtitle1" sx={{ flex: 1 }} component="h1">
                Financial Transparency System
              </Typography>
            </Toolbar>
          </AppBar>
          <Box
            sx={{
              p: { xs: 2, sm: 3 },
              flex: 1,
              bgcolor: '#f6f9ff',
              backgroundImage:
                'radial-gradient(circle at 10% 5%, rgba(25,118,210,0.08) 0%, rgba(25,118,210,0) 30%)',
            }}
            role="main"
            aria-label="Main content"
          >
            {children}
          </Box>
        </Box>
      </Box>
    </ProtectedRoute>
  );
}
