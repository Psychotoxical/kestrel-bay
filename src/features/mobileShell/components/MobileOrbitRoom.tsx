import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Check, ChevronRight, Copy, HelpCircle, LogOut, RefreshCw, Settings2, Share2, Shuffle, Users, X } from 'lucide-react';
import QueuePanel from '@/features/queue';
import {
  OrbitDiagnosticsPopover,
  OrbitParticipantsPopover,
  OrbitSettingsPopover,
  buildOrbitShareLink,
  useHelpModalStore,
  useOrbitSessionControls,
  useOrbitStore,
} from '@/features/orbit';
import { useAuthStore } from '@/store/authStore';
import { serverShareBaseUrl } from '@/lib/server/serverEndpoint';
import { formatTrackTime } from '@/lib/format/formatDuration';
import ConfirmModal from '@/ui/ConfirmModal';
import MobileSheet from '@/features/mobileShell/components/MobileSheet';
import MobileMoreMenu, { type MobileMoreMenuAction } from '@/features/mobileShell/components/MobileMoreMenu';

type Sheet = 'participants' | 'settings' | 'share' | 'diagnostics' | null;

/**
 * The Orbit tab during a session: the "room". On the desktop the queue sits on
 * the right of every page; on the phone it hid behind player bar → player →
 * Queue, so the session queue is here, under a head with everything the
 * desktop session bar offers (participants, invite, catch up, settings, help,
 * diagnostics, leave / end) in touch-sized form. The bar's popovers open as
 * sheets.
 */
export default function MobileOrbitRoom() {
  const { t } = useTranslation();
  const controls = useOrbitSessionControls();
  const sessionId = useOrbitStore(s => s.sessionId);
  const serverId = useOrbitStore(s => s.serverId);
  const server = useAuthStore(s => s.servers.find(candidate => candidate.id === serverId));
  const [sheet, setSheet] = useState<Sheet>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [copied, setCopied] = useState(false);
  const { state, role } = controls;
  if (!state) return null;
  const isHost = role === 'host';
  const closeSheet = () => setSheet(null);
  const link = sessionId && server ? buildOrbitShareLink(serverShareBaseUrl(server), sessionId) : null;

  const invite = async () => {
    // The iOS share sheet (Messages, mail, …) when the web view offers it; the copy panel otherwise.
    if (link && typeof navigator.share === 'function') {
      try {
        await navigator.share({ text: link });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    setSheet('share');
  };

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard refused: the link stays visible to copy by hand */ }
  };

  const exit = () => {
    if (controls.exitNeedsConfirm) setConfirmLeave(true);
    else void controls.performExit();
  };

  const menu: MobileMoreMenuAction[] = [
    ...(isHost ? [{ id: 'settings', label: t('orbit.settingsTitle'), icon: <Settings2 size={18} />, onSelect: () => setSheet('settings') }] : []),
    { id: 'participants', label: t('orbit.participantsTooltip'), icon: <Users size={18} />, onSelect: () => setSheet('participants') },
    { id: 'help', label: t('orbit.helpTooltip'), icon: <HelpCircle size={18} />, onSelect: () => useHelpModalStore.getState().open() },
    { id: 'diagnostics', label: t('orbit.diag.title'), icon: <Activity size={18} />, onSelect: () => setSheet('diagnostics') },
    {
      id: 'exit',
      label: isHost ? t('orbit.endTooltip') : t('orbit.leaveTooltip'),
      icon: isHost ? <X size={18} /> : <LogOut size={18} />,
      danger: true,
      onSelect: exit,
    },
  ];

  return (
    <div className="mobile-orbit-room">
      <header className="mobile-orbit-room__head">
        <div className="mobile-orbit-room__title-row">
          <span className="mobile-orbit-room__dot" aria-hidden="true" />
          <h2 className="mobile-orbit-room__name">{state.name}</h2>
          <MobileMoreMenu items={menu} />
        </div>
        <button type="button" className="mobile-orbit-room__people" onClick={() => setSheet('participants')}>
          <Users size={16} aria-hidden="true" />
          <span>
            {t('orbit.hostLabel', { name: state.host })}
            {' · '}
            <span aria-label={t('orbit.participantsTooltip')}>{controls.participantCount}/{state.maxUsers}</span>
          </span>
          <ChevronRight size={16} className="mobile-orbit-room__chevron" aria-hidden="true" />
        </button>
        {controls.autoShuffleOn && controls.untilShuffleMs !== null && (
          <p className="mobile-orbit-room__shuffle">
            <Shuffle size={14} aria-hidden="true" />
            {t('orbit.shuffleLabel')}
            <strong>{formatTrackTime(Math.round(controls.untilShuffleMs / 1000))}</strong>
          </p>
        )}
        {isHost && (
          <button type="button" className="btn btn-primary mobile-orbit-room__primary" onClick={() => { void invite(); }}>
            <Share2 size={17} aria-hidden="true" />
            {t('orbit.shareTooltip')}
          </button>
        )}
        {!isHost && controls.showCatchUp && (
          <button type="button" className="btn btn-primary mobile-orbit-room__primary" onClick={() => { void controls.catchUp(); }}>
            <RefreshCw size={17} aria-hidden="true" />
            {t('orbit.catchUpLabel')}
          </button>
        )}
      </header>

      <QueuePanel touch hideOrbitHead touchPlaybackModes />

      {sheet === 'participants' && (
        <MobileSheet title={t('orbit.participantsTooltip')} onClose={closeSheet} className="mobile-sheet--orbit">
          <OrbitParticipantsPopover onClose={closeSheet} />
        </MobileSheet>
      )}
      {sheet === 'settings' && (
        <MobileSheet title={t('orbit.settingsTitle')} onClose={closeSheet} className="mobile-sheet--orbit">
          <OrbitSettingsPopover onClose={closeSheet} />
        </MobileSheet>
      )}
      {/* Without the iOS share sheet: the link itself and a big copy button. */}
      {sheet === 'share' && link && (
        <MobileSheet title={t('orbit.shareTooltip')} onClose={closeSheet} className="mobile-sheet--orbit-form">
          <section className="mobile-orbit-form__field">
            <h3 className="mobile-orbit-form__label">{t('orbit.labelLink')}</h3>
            <code className="mobile-orbit-share__link">{link}</code>
          </section>
          <button type="button" className="btn btn-primary mobile-orbit-form__submit" onClick={() => { void copyLink(); }}>
            {copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
            {copied ? t('orbit.tooltipCopied') : t('orbit.ariaCopyLink')}
          </button>
        </MobileSheet>
      )}
      {sheet === 'diagnostics' && (
        <MobileSheet title={t('orbit.diag.title')} onClose={closeSheet} className="mobile-sheet--tall mobile-sheet--orbit">
          <OrbitDiagnosticsPopover onClose={closeSheet} />
        </MobileSheet>
      )}

      <ConfirmModal
        open={confirmLeave}
        title={isHost ? t('orbit.confirmEndTitle') : t('orbit.confirmLeaveTitle')}
        message={isHost
          ? t('orbit.confirmEndBody', { name: state.name })
          : t('orbit.confirmLeaveBody', { name: state.name, host: state.host })}
        confirmLabel={isHost ? t('orbit.confirmEndConfirm') : t('orbit.confirmLeaveConfirm')}
        cancelLabel={t('orbit.confirmCancel')}
        danger={isHost}
        onConfirm={() => { setConfirmLeave(false); void controls.performExit(); }}
        onCancel={() => setConfirmLeave(false)}
      />
    </div>
  );
}
