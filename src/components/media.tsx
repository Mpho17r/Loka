import React, { useState } from 'react';
import { Image, Linking, Text, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Button, Muted, StatusPill } from './ui';
import { colors } from '../theme';
import { adMediaUrl, pickImage, pickVideo, proofUrl } from '../lib/media';
import { friendlyError } from '../lib/errors';
import type { AdFormat, MediaScan, PickedImage, PickedVideo } from '../types';

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

/** Choose a short video (MP4 or MOV, 30 seconds, 25 MB at most), with a preview that plays silently. */
export function VideoPickerField({ label, hint, value, onChange }: {
  label: string; hint?: string; value: PickedVideo | undefined; onChange: (v: PickedVideo | undefined) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const choose = async () => {
    setError(null);
    try {
      const v = await pickVideo();
      if (v) onChange(v);
    } catch (e) { setError(friendlyError(e)); }
  };
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontWeight: '600', color: colors.ink, marginBottom: 6 }}>{label}</Text>
      {value ? <VideoBox uri={value.uri} height={180} controls /> : null}
      {value ? <Muted style={{ marginVertical: 6 }}>{Math.round(value.durationMs / 1000)} seconds · {(value.bytes / 1048576).toFixed(1)} MB</Muted> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label={value ? 'Change video' : 'Choose video'} variant="secondary" onPress={choose} />
        {value ? <Button label="Remove" variant="secondary" onPress={() => onChange(undefined)} /> : null}
      </View>
      {hint ? <Muted style={{ marginTop: 6 }}>{hint}</Muted> : null}
      {error ? <Text style={{ color: colors.danger, marginTop: 6 }}>{error}</Text> : null}
    </View>
  );
}

function VideoBox({ uri, height, controls, autoplay }: { uri: string; height: number; controls?: boolean; autoplay?: boolean }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    if (autoplay) p.play();
  });
  return (
    <View pointerEvents={controls ? 'auto' : 'none'} style={{ marginTop: 8 }}>
      <VideoView player={player} nativeControls={!!controls} contentFit="cover" fullscreenOptions={{ enable: !!controls }}
        style={{ width: '100%', height, borderRadius: 8, backgroundColor: colors.line }} />
    </View>
  );
}

/** An advert's picture or video. Videos in the feed play silently on a loop; elsewhere they have controls. */
export function AdMedia({ path, format, height = 140, feed }: { path?: string | null; format: AdFormat; height?: number; feed?: boolean }) {
  const uri = adMediaUrl(path);
  if (!uri) return null;
  if (format === 'video') return <VideoBox uri={uri} height={height} controls={!feed} autoplay={!!feed} />;
  return <AdImage path={path} height={height} />;
}

const SCAN_LABEL: Record<MediaScan['status'], string> = {
  pending: 'Media check: waiting', passed: 'Media check: passed', flagged: 'Media check: FLAGGED', error: 'Media check: could not run',
};

/** The automatic media check result, with the reasons it gave. */
export function ScanBadge({ scan }: { scan?: MediaScan }) {
  if (!scan) return null;
  const tone = scan.status === 'passed' ? 'good' : scan.status === 'flagged' ? 'bad' : 'warn';
  return (
    <View style={{ marginVertical: 4 }}>
      <StatusPill label={SCAN_LABEL[scan.status]} tone={tone} />
      {scan.reasons.length > 0 ? <Muted style={{ marginTop: 4 }}>{scan.status === 'passed' ? 'Notes' : 'Reason'}: {scan.reasons.join(', ').replace(/_/g, ' ')}</Muted> : null}
      {scan.clearedReason ? <Muted>Cleared by HQ: {scan.clearedReason}</Muted> : null}
    </View>
  );
}
