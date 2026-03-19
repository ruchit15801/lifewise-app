import { getApiUrl } from '@/lib/query-client';

export async function uploadAvatar(token: string, uri: string): Promise<string> {
  const baseUrl = getApiUrl();
  const url = new URL('/api/avatar', baseUrl).toString();
  const form = new FormData();
  form.append('avatar', {
    uri,
    name: 'avatar.jpg',
    type: 'image/jpeg',
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

