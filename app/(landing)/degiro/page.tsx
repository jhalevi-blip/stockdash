import BrokerLanding from '@/app/(landing)/_components/BrokerLanding';
import { degiroEn, buildBrokerMetadata, brokerFaqJsonLd } from '@/lib/landing/brokerConfigs';

export const metadata = buildBrokerMetadata(degiroEn);

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(brokerFaqJsonLd(degiroEn)) }} />
      <BrokerLanding config={degiroEn} />
    </>
  );
}
