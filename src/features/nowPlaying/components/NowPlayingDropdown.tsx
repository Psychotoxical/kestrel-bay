import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { PlayCircle, Pause, User, Radio, RefreshCw } from 'lucide-react';
import { nowPlayingPresence } from '@/features/nowPlaying/api/nowPlayingPresence';
import PresenceCover from '@/features/nowPlaying/components/PresenceCover';
import { formatNowPlayingClock, useNowPlayingFeed } from '@/features/nowPlaying/hooks/useNowPlayingFeed';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { appendServerQuery } from '@/lib/navigation/detailServerScope';

export default function NowPlayingDropdown() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const {
    visible, visibleGroups, multiServerScope, loading, spinning, handleRefresh, livePositionSec,
  } = useNowPlayingFeed(isOpen);
  const formatClock = formatNowPlayingClock;
  const triggerWrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const PANEL_WIDTH = 340;

  const updatePanelPos = useCallback(() => {
    const el = triggerWrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    const top = r.bottom + 10;
    const maxLeft = window.innerWidth - PANEL_WIDTH - margin;
    const left = Math.max(margin, Math.min(r.right - PANEL_WIDTH, maxLeft));
    setPanelPos({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePanelPos();
    const onWin = () => updatePanelPos();
    window.addEventListener('resize', onWin);
    window.addEventListener('scroll', onWin, true);
    return () => {
      window.removeEventListener('resize', onWin);
      window.removeEventListener('scroll', onWin, true);
    };
  }, [isOpen, updatePanelPos]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerWrapRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="now-playing-dropdown" ref={triggerWrapRef} style={{ position: 'relative' }}>
      <button
        className="btn btn-surface now-playing-dropdown__trigger"
        onClick={() => setIsOpen(!isOpen)}
        data-tooltip={t('nowPlaying.tooltip')}
        data-tooltip-pos="bottom"
        style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}
      >
        <span
          className={`now-playing-dropdown__live-icon${visible.length > 0 ? ' now-playing-dropdown__live-icon--active' : ''}`}
        >
          <Radio size={18} />
        </span>
        <span className="now-playing-dropdown__label">Live</span>
        {visible.length > 0 && (
          <span style={{
            background: 'var(--accent)',
            color: 'var(--text-on-accent)',
            fontSize: '10px',
            fontWeight: 'bold',
            padding: '2px 6px',
            borderRadius: '10px'
          }}>
            {visible.length}
          </span>
        )}
      </button>

      {isOpen && createPortal(
        <div
          ref={panelRef}
          className="nav-library-dropdown-panel animate-fade-in"
          style={{
            position: 'fixed',
            top: panelPos.top,
            left: panelPos.left,
            width: `${PANEL_WIDTH}px`,
            maxHeight: '400px',
            overflowY: 'auto',
            padding: '1rem',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>{t('nowPlaying.title')}</h3>
            <button
              onClick={handleRefresh}
              className="btn btn-ghost"
              style={{ width: '28px', height: '28px', padding: 0, justifyContent: 'center' }}
            >
              <RefreshCw size={14} className={spinning ? 'animate-spin' : ''} />
            </button>
          </div>

          {loading && visible.length === 0 ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              {t('nowPlaying.loading')}
            </div>
          ) : visible.length === 0 ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              {t('nowPlaying.nobody')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {visibleGroups.map(group => (
                <section key={group.serverId} className="nav-library-server-group" aria-label={group.serverLabel}>
                  {multiServerScope ? (
                    <div className="nav-library-server-group-heading">{group.serverLabel}</div>
                  ) : null}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {group.rows.map((stream, idx) => {
                const presence = nowPlayingPresence(stream);
                const presenceLabel = t(`nowPlaying.presence.${presence}`);
                return (
                <div
                   key={`${stream.serverId ?? 'unknown'}:${stream.username}:${stream.playerId}:${stream.id}:${idx}`}
                   onClick={() => {
                     if (!stream.albumId) return;
                     setIsOpen(false);
                     const search = appendServerQuery(undefined, stream.serverId);
                     navigate(`/album/${stream.albumId}${search ? `?${search}` : ''}`);
                   }}
                  style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', background: 'var(--bg-hover)', padding: '0.5rem', borderRadius: '8px', cursor: stream.albumId ? 'pointer' : 'default' }}
                >
                  <div style={{ width: '48px', height: '48px', flexShrink: 0, borderRadius: '6px', overflow: 'hidden', background: 'var(--card-placeholder-bg)' }}>
                    {stream.albumId ? (
                      <PresenceCover stream={stream} />
                    ) : (
                      <PlayCircle size={24} style={{ margin: '12px', color: 'var(--text-muted)' }} />
                    )}
                  </div>
                  <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                      <span
                        className={`now-playing-led now-playing-led--${presence}`}
                        role="img"
                        aria-label={presenceLabel}
                        data-tooltip={presenceLabel}
                        data-tooltip-pos="bottom"
                      />
                      <span className="truncate" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{stream.title}</span>
                    </div>
                    <div className="truncate" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{stream.artist}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
                        <User size={10} style={{ flexShrink: 0 }} />
                        <span className="truncate">{stream.username} ({stream.playerName || 'Web'})</span>
                      </div>
                      {(() => {
                        const posSec = livePositionSec(stream);
                        if (posSec === undefined || stream.duration <= 0) return null;
                        const playing = stream.state === 'playing';
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, marginTop: '1px' }}>
                            {stream.state === 'paused' && <Pause size={10} style={{ flexShrink: 0 }} />}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ height: '3px', borderRadius: '2px', background: 'var(--border-subtle)', overflow: 'hidden' }}>
                                <div style={{
                                  width: `${Math.min(100, Math.max(0, (posSec / stream.duration) * 100))}%`,
                                  height: '100%',
                                  background: playing ? 'var(--accent)' : 'var(--text-muted)',
                                  transition: playing ? 'width 1s linear' : 'none',
                                }} />
                              </div>
                            </div>
                            <span style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                              {/* ~2ch reserve inside the current-time box (9:59→10:00), not empty gap before the bar. */}
                              <span style={{ display: 'inline-block', minWidth: '6ch', textAlign: 'right' }}>
                                {formatClock(posSec)}
                              </span>
                              {' / '}
                              {formatClock(stream.duration)}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
                );
              })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
