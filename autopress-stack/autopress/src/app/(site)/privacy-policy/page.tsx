import { PolicyPage, policyMetadata } from '@/components/site/policy-page';

export const revalidate = 86400;
export const generateMetadata = () => policyMetadata('privacy-policy');
export default function Page() {
  return <PolicyPage slug="privacy-policy" />;
}
