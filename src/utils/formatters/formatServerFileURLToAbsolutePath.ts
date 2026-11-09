import { STORAGE_URL } from '@/constants/auth';

const ABSOLUTE_URL_PATTERN = /^https?:\/\//;

export function formatServerFileURLToAbsolutePath(fileURL: string) {
  if (ABSOLUTE_URL_PATTERN.test(fileURL)) {
    return fileURL;
  }

  const absolutePath = `${STORAGE_URL}${fileURL}`;

  return absolutePath;
}
