import React, { useState } from 'react';
import { Image, Linking, Text, View } from 'react-native';
import { Button, Muted } from './ui';
import { colors } from '../theme';
import { adMediaUrl, pickImage, proofUrl } from '../lib/media';
import { friendlyError } from '../lib/errors';
import type { PickedImage } from '../types';

/** Choose an image from the photo library, with a preview. */
export function ImagePickerField({ label, hint, value, onChange }: {
  label: string; hint?: string; value: PickedImage | undefined; onChange: (img: PickedImage | undefined) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const choose = async () => {
    setError(null);
    try {
      const img = await pickImage();
      if (img) onChange(img);
    } catch (e) { setError(friendlyError(e)); }
  };
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontWeight: '600', color: colors.ink, marginBottom: 6 }}>{label}</Text>
      {value ? (
        <Image source={{ uri: value.uri }} accessibilityLabel="Selected image" style={{ width: '100%', height: 160, borderRadius: 10, backgroundColor: colors.line, marginBottom: 8 }} resizeMode="cover" />
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label={value ? 'Change image' : 'Choose image'} variant="secondary" onPress={choose} />
        {value ? <Button label="Remove" variant="secondary" onPress={() => onChange(undefined)} /> : null}
      </View>
      {hint ? <Muted style={{ marginTop: 6 }}>{hint}</Muted> : null}
      {error ? <Text style={{ color: colors.danger, marginTop: 6 }}>{error}</Text> : null}
    </View>
  );
}

/** An advert or listing image from storage. Renders nothing when there is no image. */
export function AdImage({ path, height = 120 }: { path?: string | null; height?: number }) {
  const uri = adMediaUrl(path);
  const [failed, setFailed] = useState(false);
  if (!uri || failed) return null;
  return (
    <Image source={{ uri }} accessibilityLabel="Advert image" onError={() => setFailed(true)}
      style={{ width: '100%', height, borderRadius: 8, backgroundColor: colors.line, marginTop: 8 }} resizeMode="cover" />
  );
}

/** Staff-only: opens the payment proof through a short-lived link. */
export function ProofLink({ path }: { path?: string | null }) {
  const [error, setError] = useState<string | null>(null);
  if (!path) return <Muted>No proof of payment attached.</Muted>;
  const open = async () => {
    setError(null);
    try {
      const url = await proofUrl(path);
      if (url) await Linking.openURL(url);
    } catch (e) { setError(friendlyError(e)); }
  };
  return (
    <View>
      <Button label="View proof of payment" variant="secondary" onPress={open} />
      {error ? <Text style={{ color: colors.danger, marginTop: 6 }}>{error}</Text> : null}
    </View>
  );
}
