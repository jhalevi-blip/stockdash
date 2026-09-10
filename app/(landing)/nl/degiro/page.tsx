import BrokerLanding from '@/app/(landing)/_components/BrokerLanding';
import { degiroNl, buildBrokerMetadata, brokerFaqJsonLd } from '@/lib/landing/brokerConfigs';

export const metadata = buildBrokerMetadata(degiroNl);

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(brokerFaqJsonLd(degiroNl)) }} />
      <BrokerLanding config={degiroNl} />
    </>
  );
}
