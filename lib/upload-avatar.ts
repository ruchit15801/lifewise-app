import { Platform } from 'react-native';
import { getApiUrl } from '@/lib/query-client';

export async function uploadAvatar(token: string, uri: string): Promise<string> {
  const baseUrl = getApiUrl();
  const url = new URL('/api/avatar', baseUrl).toString();
  const form = new FormData();
  
  // Clean URI for React Native FormData
  const cleanUri = uri.startsWith('file://') ? uri.replace('file://', '') : uri;
  const fileName = uri.split('/').pop() || 'avatar.jpg';
  const fileType = fileName.endsWith('.png') ? 'image/png' : 'image/jpeg';

  form.append('avatar', {
    uri: cleanUri,
    name: fileName,
    type: fileType,
  } as any);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || 'Upload failed');
  }
  return json.url as string;
}

