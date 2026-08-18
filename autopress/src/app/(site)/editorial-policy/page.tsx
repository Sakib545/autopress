import { PolicyPage, policyMetadata } from '@/components/site/policy-page';

export const generateMetadata = () => policyMetadata('editorial-policy');
export default function Page() {
  return <PolicyPage slug="editorial-policy" />;
}
