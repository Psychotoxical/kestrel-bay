import { useTranslation } from 'react-i18next';
import { User } from 'lucide-react';
import { useOrbitAccountPickerStore } from '@/features/orbit';
import MobileSheet from '@/features/mobileShell/components/MobileSheet';

/**
 * Touch layout of the Orbit account picker (more than one account on the
 * invite's server): a sheet with one row per account. A tap picks it, Close
 * cancels. Driven by the same `useOrbitAccountPickerStore` request as the
 * desktop modal; its keyboard selection has no use on the phone.
 */
export default function MobileOrbitAccountSheet() {
  const { t } = useTranslation();
  const { isOpen, accounts, pick, cancel } = useOrbitAccountPickerStore();
  if (!isOpen) return null;

  return (
    <MobileSheet title={t('orbit.accountPickerTitle')} onClose={cancel} className="mobile-sheet--orbit-form">
      <p className="mobile-orbit-form__intro">{t('orbit.accountPickerSub', { url: accounts[0]?.url ?? '' })}</p>
      <div className="mobile-list-group">
        {accounts.map(account => (
          <button key={account.id} type="button" className="mobile-list-row" onClick={() => pick(account)}>
            <User className="mobile-list-row__icon" size={22} aria-hidden="true" />
            <span className="mobile-list-row__label">
              {account.username}
              {account.name && <span className="mobile-orbit-account__server"> · {account.name}</span>}
            </span>
          </button>
        ))}
      </div>
    </MobileSheet>
  );
}
