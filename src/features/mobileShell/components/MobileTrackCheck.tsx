import { Check } from 'lucide-react';

/** The round check at the start of a track row while a selection runs. */
export default function MobileTrackCheck({ selected }: { selected: boolean }) {
  return (
    <span className={`mobile-track__check${selected ? ' is-on' : ''}`} aria-hidden="true">
      {selected && <Check size={16} strokeWidth={3} />}
    </span>
  );
}
