import MobileSheet from '@/features/mobileShell/components/MobileSheet';
import { useMobileActionSheetStore } from '@/features/mobileShell/store/mobileActionSheetStore';

/** Renders the question asked through `useMobileActionSheetStore`. Mounted once by the touch shell. */
export default function MobileActionSheet() {
  const isOpen = useMobileActionSheetStore(s => s.isOpen);
  const title = useMobileActionSheetStore(s => s.title);
  const message = useMobileActionSheetStore(s => s.message);
  const actions = useMobileActionSheetStore(s => s.actions);
  const choose = useMobileActionSheetStore(s => s.choose);
  if (!isOpen) return null;

  return (
    <MobileSheet title={title} onClose={() => choose(null)} className="mobile-sheet--actions">
      {message && <p className="mobile-action-sheet__message">{message}</p>}
      <div className="mobile-action-sheet__actions">
        {actions.map(action => (
          <button
            key={action.id}
            type="button"
            className={`mobile-action-sheet__btn${action.primary ? ' is-primary' : ''}${action.danger ? ' is-danger' : ''}`}
            onClick={() => choose(action.id)}
          >
            {action.label}
          </button>
        ))}
      </div>
    </MobileSheet>
  );
}
