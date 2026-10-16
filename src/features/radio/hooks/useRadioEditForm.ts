import React, { useRef, useState } from 'react';
import type { InternetRadioStation } from '@/lib/api/subsonicTypes';
import type { ServerSelectOption } from '@/ui/ServerSelect';

export interface RadioEditSave {
  serverId: string;
  name: string;
  streamUrl: string;
  homepageUrl: string;
  coverFile: File | null;
  coverRemoved: boolean;
}

/** Props of the station dialog in both layouts (desktop modal, touch sheet). */
export interface RadioEditProps {
  station: InternetRadioStation | null; // null = create new
  initialServerId: string;
  serverOptions: ServerSelectOption[];
  onClose: () => void;
  onSave: (opts: RadioEditSave) => Promise<void>;
}

/** Form state of the station dialog, shared by the desktop modal and the touch sheet. */
export function useRadioEditForm({ station, initialServerId, serverOptions, onSave }: RadioEditProps) {
  const [name, setName] = useState(station?.name ?? '');
  const [streamUrl, setStreamUrl] = useState(station?.streamUrl ?? '');
  const [homepageUrl, setHomepageUrl] = useState(station?.homepageUrl ?? '');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverRemoved, setCoverRemoved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [requestedServerId, setRequestedServerId] = useState(initialServerId);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const serverId = serverOptions.some(server => server.id === requestedServerId)
    ? requestedServerId
    : serverOptions[0]?.id ?? '';

  const hasExistingCover = Boolean(!coverRemoved && (coverPreview || station?.coverArt));
  const canSave = !saving && Boolean(serverId) && name.trim().length > 0 && streamUrl.trim().length > 0;

  const pickCover = () => coverInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCoverFile(file);
    setCoverRemoved(false);
    const reader = new FileReader();
    reader.onload = ev => setCoverPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleRemoveCover = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCoverFile(null);
    setCoverPreview(null);
    setCoverRemoved(true);
  };

  const handleSave = async () => {
    if (!serverId || !name.trim() || !streamUrl.trim()) return;
    setSaving(true);
    try {
      await onSave({ serverId, name, streamUrl, homepageUrl, coverFile, coverRemoved });
    } finally {
      setSaving(false);
    }
  };

  return {
    name, setName,
    streamUrl, setStreamUrl,
    homepageUrl, setHomepageUrl,
    serverId, setRequestedServerId,
    coverPreview, coverRemoved, hasExistingCover,
    saving, canSave,
    coverInputRef, pickCover, handleFileChange, handleRemoveCover, handleSave,
  };
}
