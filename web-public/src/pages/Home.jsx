import Hero from '../components/sections/Hero.jsx';
import ServicesGrid from '../components/sections/ServicesGrid.jsx';
import WhyUs from '../components/sections/WhyUs.jsx';
import FaqAccordion from '../components/sections/FaqAccordion.jsx';
import CtaBanner from '../components/sections/CtaBanner.jsx';

export default function Home() {
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
