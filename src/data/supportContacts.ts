export type SupportContact = {
  id: string;
  label: string;
  phone: string;
};

export const inquiryContacts: SupportContact[] = [
  { id: 'inquiry-1', label: 'خط الاستفسارات', phone: '01033061493' },
  { id: 'inquiry-2', label: 'خط الاستفسارات الإضافي', phone: '01080345340' },
];

export const complaintContacts: SupportContact[] = [
  { id: 'complaint-1', label: 'خط الشكاوى', phone: '01131146679' },
  { id: 'complaint-2', label: 'خط الشكاوى الثاني', phone: '01131146681' },
];

export function toWhatsAppUrl(phone: string): string {
  return `https://wa.me/20${phone.replace(/^0/, '')}`;
}
