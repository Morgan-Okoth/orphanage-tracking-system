import FavoriteIcon from '@mui/icons-material/Favorite';
import SchoolIcon from '@mui/icons-material/School';
import GroupsIcon from '@mui/icons-material/Groups';
import VolunteerActivismIcon from '@mui/icons-material/VolunteerActivism';
import PublicIcon from '@mui/icons-material/Public';
import HandshakeIcon from '@mui/icons-material/Handshake';
import type { SvgIconComponent } from '@mui/icons-material';

export interface LandingFeature {
  title: string;
  description: string;
  icon: SvgIconComponent;
}

export interface LandingMetric {
  label: string;
  value: string;
}

export interface LandingHighlight {
  title: string;
  description: string;
}

export const landingFeatures: LandingFeature[] = [
  {
    title: 'Child-centered care',
    description:
      'We support children and families with practical care, stability, and dignity-led assistance.',
    icon: FavoriteIcon,
  },
  {
    title: 'Education and wellbeing',
    description:
      'Our programs focus on education access, welfare support, and long-term opportunity for growth.',
    icon: SchoolIcon,
  },
  {
    title: 'Community partnership',
    description:
      'We work with supporters, volunteers, and partners to build sustainable impact together.',
    icon: GroupsIcon,
  },
];

export const supportHighlights: LandingFeature[] = [
  {
    title: 'Donate',
    description: 'Support ongoing programs and urgent care needs for children and families.',
    icon: VolunteerActivismIcon,
  },
  {
    title: 'Public updates',
    description: 'Follow our public reports and transparency updates as part of our accountability.',
    icon: PublicIcon,
  },
  {
    title: 'Partner with us',
    description: 'Collaborate with us through sponsorships, outreach programs, and local initiatives.',
    icon: HandshakeIcon,
  },
];

export const landingMetrics: LandingMetric[] = [
  { label: 'Mission', value: 'Care' },
  { label: 'Approach', value: 'Compassion' },
  { label: 'Commitment', value: 'Accountability' },
];

export const organizationHighlights: LandingHighlight[] = [
  {
    title: 'Who we are',
    description:
      'Bethel Rays of Hope is an organization committed to improving the lives of vulnerable children and families.',
  },
  {
    title: 'What we do',
    description:
      'We provide targeted support programs and responsible stewardship of resources for lasting community impact.',
  },
  {
    title: 'How you can help',
    description:
      'Contribute through donations, advocacy, and partnerships that directly strengthen our mission.',
  },
  {
    title: 'Our promise',
    description:
      'We remain transparent, privacy-conscious, and responsible in every public communication and report.',
  },
];
