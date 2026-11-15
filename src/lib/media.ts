import { supabase } from './supabase';
import { SUPABASE_URL } from './config';
import type { PickedImage, PickedVideo } from '../types';
import { EXT, MAX_IMAGE_BYTES, VIDEO_EXT, base64ToBytes, checkImage, checkVideo } from './imageCheck';

export { MAX_IMAGE_BYTES, checkImage, base64ToBytes };

/** Opens the photo library. Returns null if the person cancelled. Throws a readable message if access is refused. */
export async function pickImage(): Promise<PickedImage | null> {
  const ImagePicker = await import('expo-image-picker');
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Loka needs access to your photos to attach an image.');
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], base64: true, quality: 0.8, allowsMultipleSelection: false,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  const mime = a.mimeType ?? 'image/jpeg';
  const base64 = a.base64 ?? '';
  const img: PickedImage = { uri: a.uri, mime, base64, bytes: Math.floor((base64.length * 3) / 4) };
  const problem = checkImage(img);
  if (problem) throw new Error(problem);
  return img;
}

/** Opens the video library (30 seconds at most). Returns null if cancelled. */
export async function pickVideo(): Promise<PickedVideo | null> {
  const ImagePicker = await import('expo-image-picker');
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Loka needs access to your photos and videos to attach a video.');
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'], allowsMultipleSelection: false, videoMaxDuration: 30,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  const v: PickedVideo = { uri: a.uri, mime: a.mimeType ?? 'video/mp4', bytes: a.fileSize ?? 0, durationMs: a.duration ?? 0 };
  const problem = checkVideo(v);
  if (problem) throw new Error(problem);
  return v;
}

/** Uploads a video from its file address into <bucket>/<userId>/... Returns the object path. */
export async function uploadVideo(userId: string, v: PickedVideo): Promise<string> {
  if (!supabase) throw new Error('Uploads need the live back end.');
  const problem = checkVideo(v);
  if (problem) throw new Error(problem);
  const rand = Array.from({ length: 16 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
  const path = `${userId}/${Date.now()}-${rand}.${VIDEO_EXT[v.mime]}`;
  const body = await (await fetch(v.uri)).arrayBuffer();
  if (body.byteLength > 25 * 1024 * 1024) throw new Error('The video is larger than 25 MB. Choose a shorter one.');
  const { error } = await supabase.storage.from('ad-media').upload(path, body, { contentType: v.mime, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

/** Uploads into <bucket>/<userId>/<random>.<ext> (storage policies only allow your own folder). Returns the object path. */
export async function uploadImage(bucket: 'ad-media' | 'payment-proofs', userId: string, img: PickedImage): Promise<string> {
  if (!supabase) throw new Error('Uploads need the live back end.');
  const problem = checkImage(img);
  if (problem) throw new Error(problem);
  const rand = Array.from({ length: 16 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
  const path = `${userId}/${Date.now()}-${rand}.${EXT[img.mime]}`;
  const { error } = await supabase.storage.from(bucket).upload(path, base64ToBytes(img.base64), { contentType: img.mime, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

/** Public address of an advert image. Local file addresses (demo mode) are returned unchanged. */
export function adMediaUrl(path: string | undefined | null): string | undefined {
  if (!path) return undefined;
  if (/^(file|content|data|https?):/.test(path)) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/ad-media/${path}`;
}

/** Short-lived link for staff to view a payment proof. */
export async function proofUrl(path: string): Promise<string | undefined> {
  if (/^(file|content|data|https?):/.test(path)) return path;
  if (!supabase) return undefined;
  const { data, error } = await supabase.storage.from('payment-proofs').createSignedUrl(path, 300);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
