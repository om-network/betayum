import { headers } from 'next/headers';
import { canAccessFrameworkEditor, getFrameworkEditorUser } from './framework-auth';

export function formatEnumValue(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export async function isAuthorized(): Promise<boolean> {
  const user = await getFrameworkEditorUser({ headers: await headers() });
  return canAccessFrameworkEditor(user);
}
