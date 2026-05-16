// Central site configuration. Edit this file to update firm-wide details.
// Anything marked TODO should be replaced with real copy before launch.

export const PORTAL_URL = (
  import.meta.env.VITE_PORTAL_URL || 'https://app.carahulgupta.in'
).replace(/\/$/, '');

export const PORTAL_LINKS = {
  staff: `${PORTAL_URL}/login?portal=staff`,
  affiliate: `${PORTAL_URL}/login?portal=affiliate`,
  client: `${PORTAL_URL}/login?portal=client`,
  partner: `${PORTAL_URL}/login?portal=partner`,
};

export const SITE = {
  firmName: 'CA Rahul Gupta & Associates',
  firmShort: 'CA Rahul Gupta',
  tagline: 'Chartered Accountants',
  domain: 'carahulgupta.in',
  /** Footer copyright range start (firm inception year). */
  copyrightSince: 2016,

  // TODO: replace with final copy
  heroTitle: 'Your trusted partner in tax, audit & advisory.',
  heroSubtitle:
    'A modern Chartered Accountancy practice helping individuals, startups, and SMEs stay compliant, save tax, and grow with confidence.',

  // TODO: replace with final stats
  stats: [
    { label: 'Years of practice', value: '10+' },
    { label: 'Active clients', value: '100+' },
    { label: 'Returns filed yearly', value: '500+' },
  ],

  // Office details
  contact: {
    phone: '+91 90414 71715',
    email: 'office@carahulgupta.in',
    email2: 'rahul@cagupta.in',
    addressLine1: '3069, Third Floor, Ajanta Enclaves, Sector-51D',
    addressLine2: 'Chandigarh – 160047',
    otherOffices: ['Jalandhar', 'Mohali', 'Gurugram'],
    workingHours: 'Mon – Fri · 10:00 AM – 6:00 PM',
    mapUrl: 'https://maps.google.com/?q=CA+Rahul+Gupta',
  },

  socials: {
    linkedin: 'https://www.linkedin.com/in/',
    twitter: 'https://twitter.com/',
    instagram: 'https://www.instagram.com/',
  },
};
