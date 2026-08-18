import { PolicyPage, policyMetadata } from '@/components/site/policy-page';

export const generateMetadata = () => policyMetadata('ai-content-policy');
export default function Page() {
  return <PolicyPage slug="ai-content-policy" />;
}
