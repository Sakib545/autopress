import { PolicyPage, policyMetadata } from '@/components/site/policy-page';

export const generateMetadata = () => policyMetadata('corrections-policy');
export default function Page() {
  return <PolicyPage slug="corrections-policy" />;
}
