import { useEffect } from 'react';

import { SecuredStorage, SecuredStorageKey } from '@/services/securedStorage/securedStorage';

const STORAGE_CREDENTIAL_KEYS = [
  SecuredStorageKey.awsAccessToken,
  SecuredStorageKey.awsAccountId,
  SecuredStorageKey.awsConnectionString,
  SecuredStorageKey.awsSecretKey,
];

export function useRemoveStorageCredentials() {
  useEffect(() => {
    Promise.all(STORAGE_CREDENTIAL_KEYS.map((key) => SecuredStorage.removeItem(key))).catch(
      (error) => console.error('useRemoveStorageCredentials: Failed to remove credentials', error),
    );
  }, []);
}
