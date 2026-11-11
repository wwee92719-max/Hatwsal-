import { useEffect, useRef, useState } from 'react';
import { Headset, MessageCircle, Phone } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import {
  complaintContacts,
  inquiryContacts,
  toWhatsAppUrl,
  type SupportContact,
} from '@/data/supportContacts';

type MenuKind = 'call' | 'chat';

type Props = {
  from?: string;
  role?: 'client' | 'driver';
};

export function SupportTopBar({ from, role }: Props) {
  const { addSupportRequest } = useApp();
  const [open, setOpen] = useState<MenuKind | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent | TouchEvent) => {
      if (!barRef.current?.contains(event.target as Node)) setOpen(null);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('touchstart', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('touchstart', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const toggle = (kind: MenuKind) => setOpen((current) => (current === kind ? null : kind));

  const pick = (contact: SupportContact, type: MenuKind) => {
    if (from && role) {
      addSupportRequest({
        from,
        role,
        type,
        message: `${type === 'chat' ? 'دردشة' : 'اتصال'} مع ${contact.label} (${contact.phone})`,
      });
    }
    setOpen(null);
  };

  return (
    <div ref={barRef} className="relative z-40 bg-navy-900 shadow-md">
      <div className="mx-auto flex max-w-md items-center justify-between px-4 py-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-white/70">
          <Headset size={14} />
          الدعم الفني
        </span>
        <div className="flex items-center gap-2">
          <div className="relative">
            <BarIconButton
              label="اتصال بالدعم"
              active={open === 'call'}
              onClick={() => toggle('call')}
              icon={<Phone size={16} />}
            />
            {open === 'call' && (
              <SupportMenu title="اتصال مباشر" contacts={inquiryContacts} kind="call" onPick={pick} />
            )}
          </div>
          <div className="relative">
            <BarIconButton
              label="دردشة واتساب"
              active={open === 'chat'}
              onClick={() => toggle('chat')}
              icon={<MessageCircle size={16} />}
            />
            {open === 'chat' && (
              <SupportMenu title="واتساب" contacts={complaintContacts} kind="chat" onPick={pick} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BarIconButton({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={active}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-full transition-all active:scale-90 ${
        active ? 'bg-brand-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'
      }`}
    >
      {icon}
    </button>
  );
}

function SupportMenu({
  title,
  contacts,
  kind,
  onPick,
}: {
  title: string;
  contacts: SupportContact[];
  kind: MenuKind;
  onPick: (contact: SupportContact, type: MenuKind) => void;
}) {
  return (
    <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl bg-white p-2 shadow-xl animate-scale-in">
      <p className="px-3 pb-1 pt-2 text-xs font-bold text-navy-500">{title}</p>
      {contacts.map((contact) => (
        <a
          key={contact.id}
          href={kind === 'call' ? `tel:${contact.phone}` : toWhatsAppUrl(contact.phone)}
          target={kind === 'chat' ? '_blank' : undefined}
          rel="noopener noreferrer"
          onClick={() => onPick(contact, kind)}
          className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-gray-50"
        >
          <span className="text-sm font-semibold text-navy-800">{contact.label}</span>
          <span dir="ltr" className="text-xs font-semibold text-navy-500">
            {contact.phone}
          </span>
        </a>
      ))}
    </div>
  );
}
