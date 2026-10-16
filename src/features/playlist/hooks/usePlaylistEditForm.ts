import React, { useRef, useState } from 'react';
import type { SubsonicPlaylist } from '@/lib/api/subsonicTypes';
import type { CoverArtId } from '@/cover/types';
import { playlistDisplayName } from '@/lib/format/playlistClassification';

export interface PlaylistEditSave {
  name: string;
  comment: string;
  isPublic: boolean;
  coverFile: File | null;
  coverRemoved: boolean;
}

/** Props of the edit dialog in both layouts (desktop modal, touch sheet). */
export interface PlaylistEditProps {
  playlist: SubsonicPlaylist;
  customCoverId: string | null;
  coverQuadIds: (CoverArtId | null)[];
  onClose: () => void;
  onSave: (opts: PlaylistEditSave) => Promise<void>;
}

/** Form state of the playlist edit dialog, shared by the desktop modal and the touch sheet. */
export function usePlaylistEditForm(
  playlist: SubsonicPlaylist,
  customCoverId: string | null,
  onSave: (opts: PlaylistEditSave) => Promise<void>,
) {
  const [name, setName] = useState(playlistDisplayName(playlist));
  const [comment, setComment] = useState(playlist.comment ?? '');
  const [isPublic, setIsPublic] = useState(playlist.public ?? false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverRemoved, setCoverRemoved] = useState(false);
  const [saving, setSaving] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const hasExistingCover = Boolean(!coverRemoved && (coverPreview || customCoverId));

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
    setSaving(true);
    try {
      await onSave({ name, comment, isPublic, coverFile, coverRemoved });
    } finally {
      setSaving(false);
    }
  };

  return {
    name, setName,
    comment, setComment,
    isPublic, setIsPublic,
    coverPreview, coverRemoved, hasExistingCover,
    saving, canSave: !saving && name.trim().length > 0,
    coverInputRef, pickCover, handleFileChange, handleRemoveCover, handleSave,
  };
}
