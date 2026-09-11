import BrokerLanding from '@/app/(landing)/_components/BrokerLanding';
import { saxoEn, buildBrokerMetadata, brokerFaqJsonLd } from '@/lib/landing/brokerConfigs';

export const metadata = buildBrokerMetadata(saxoEn);

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(brokerFaqJsonLd(saxoEn)) }} />
      <BrokerLanding config={saxoEn} />
    </>
  );
}
