import { PolicyPage, policyMetadata } from '@/components/site/policy-page';

export const revalidate = 86400;
export const generateMetadata = () => policyMetadata('editorial-policy');
export default function Page() {
  return <PolicyPage slug="editorial-policy" />;
}
