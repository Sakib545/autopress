import { PolicyPage, policyMetadata } from '@/components/site/policy-page';

export const generateMetadata = () => policyMetadata('affiliate-disclosure');
export default function Page() {
  return <PolicyPage slug="affiliate-disclosure" />;
}
