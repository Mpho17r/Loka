import { supabase } from './supabase';
import { SUPABASE_URL } from './config';
import type { PickedImage } from '../types';
import { EXT, MAX_IMAGE_BYTES, base64ToBytes, checkImage } from './imageCheck';

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
