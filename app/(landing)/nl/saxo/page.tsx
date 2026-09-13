import BrokerLanding from '@/app/(landing)/_components/BrokerLanding';
import { saxoNl, buildBrokerMetadata, brokerFaqJsonLd } from '@/lib/landing/brokerConfigs';

export const metadata = buildBrokerMetadata(saxoNl);

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(brokerFaqJsonLd(saxoNl)) }} />
      <BrokerLanding config={saxoNl} />
    </>
  );
}
