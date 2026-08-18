import { PolicyPage, policyMetadata } from '@/components/site/policy-page';

export const generateMetadata = () => policyMetadata('contact');
export default function Page() {
  return <PolicyPage slug="contact" />;
}
