// Utility to wrap fetch with Authorization header
export default async function authFetch(url, token, options = {}) {
  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`,
  };
  return fetch(url, { ...options, headers });
}
