import { PolicyPage, policyMetadata } from '@/components/site/policy-page';

export const revalidate = 86400;
export const generateMetadata = () => policyMetadata('contact');
export default function Page() {
  return <PolicyPage slug="contact" />;
}
