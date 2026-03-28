export const getApiUrl = (path: string) => {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
  // If it's an absolute URL already, or if we want to use rewrites (relative path)
  if (!baseUrl || path.startsWith('http')) {
    return path;
  }
  
  // Ensure we don't have double slashes
  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  return `${cleanBase}${cleanPath}`;
};

export const getSocketUrl = () => {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
  if (baseUrl) {
    // Return the base URL but without /api suffix if it exists, as socket.io usually mounts on root
    return baseUrl.replace(/\/api$/, '');
  }
  return typeof window !== 'undefined' ? window.location.origin : '';
};

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

