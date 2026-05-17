import { useEffect } from 'react';
import Hero from '../components/sections/Hero.jsx';
import ServicesGrid from '../components/sections/ServicesGrid.jsx';
import WhyUs from '../components/sections/WhyUs.jsx';
import FaqAccordion from '../components/sections/FaqAccordion.jsx';
import CtaBanner from '../components/sections/CtaBanner.jsx';
import useSeo from '../hooks/useSeo.js';
import { SITE } from '../config/site.config.js';

const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'AccountingService',
  name: SITE.firmName,
  url: `https://${SITE.domain}`,
  logo: `https://${SITE.domain}/cropped_logo.png`,
  image: `https://${SITE.domain}/cropped_logo.png`,
  description:
    'CA Rahul Gupta & Associates is a Chandigarh-based Chartered Accountancy firm offering ITR filing, GST compliance, audit, ROC compliance, bookkeeping, and business advisory services to individuals, startups, and SMEs across India.',
  telephone: SITE.contact.phone,
  email: SITE.contact.email,
  address: {
    '@type': 'PostalAddress',
    streetAddress: SITE.contact.addressLine1,
    addressLocality: 'Chandigarh',
    addressRegion: 'Chandigarh',
    postalCode: '160047',
    addressCountry: 'IN',
  },
  geo: {
    '@type': 'GeoCoordinates',
    latitude: 30.7333,
    longitude: 76.7794,
  },
  openingHoursSpecification: {
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    opens: '10:00',
    closes: '18:00',
  },
  sameAs: [
    SITE.socials.linkedin,
    SITE.socials.twitter,
    SITE.socials.instagram,
  ].filter(u => u && !u.endsWith('/')),
  priceRange: '₹₹',
  areaServed: ['Chandigarh', 'Mohali', 'Jalandhar', 'Gurugram', 'India'],
};

export default function Home() {
  useSeo({
    title: 'Chartered Accountant in Chandigarh | ITR, GST, Audit & Advisory',
    description:
      'CA Rahul Gupta & Associates — Chandigarh CA firm offering ITR filing, GST compliance, audit, ROC, bookkeeping and tax advisory to individuals, startups and SMEs. 10+ years, 100+ clients.',
  });

  useEffect(() => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id   = 'jsonld-home';
    script.text = JSON.stringify(JSON_LD);
    document.head.appendChild(script);
    return () => { document.getElementById('jsonld-home')?.remove(); };
  }, []);

  return (
    <>
      <Hero />
      <ServicesGrid />
      <WhyUs />
      <FaqAccordion />
      <CtaBanner />
    </>
  );
}
