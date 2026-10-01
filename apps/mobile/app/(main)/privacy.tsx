import InfoPage from '../../components/InfoPage';

// Generic placeholder copy -- have an actual lawyer review this before
// Al Paninos takes real orders/payments from the public.
const SECTIONS = [
  {
    heading: 'Information We Collect',
    body: 'When you create an account or place an order, we collect your name, email address, phone number, and delivery address. We also keep a record of your order history to make reordering easier.',
  },
  {
    heading: 'How We Use Your Information',
    body: 'We use your information to process orders, send order status updates by email or push notification (based on your preferences), and improve our menu and service.',
  },
  {
    heading: 'Sharing Your Information',
    body: 'We do not sell your personal information. We share only what is necessary with payment processors and delivery partners to fulfill your order.',
  },
  {
    heading: 'Data Security',
    body: 'We take reasonable measures to protect your information, including encrypted storage and access controls limited to staff who need it to run the restaurant.',
  },
  {
    heading: 'Your Choices',
    body: 'You can update or delete your account information at any time from your profile, and can turn order updates off under More › Notifications.',
  },
  {
    heading: 'Contact Us',
    body: 'Questions about this policy? Reach us from the Customer Support page.',
  },
];

export default function PrivacyScreen() {
  return (
    <InfoPage
      title="Privacy Policy"
      icon="shield-checkmark"
      intro="What we collect when you order, what we use it for, and the choices you have."
      sections={SECTIONS}
    />
  );
}
