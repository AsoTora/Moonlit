import { renderHook, waitFor } from '@testing-library/react-native';

import { useRemoveStorageCredentials } from '@/hooks/core/useRemoveStorageCredentials';
import { SecuredStorage, SecuredStorageKey } from '@/services/securedStorage/securedStorage';

jest.mock('@/services/securedStorage/securedStorage', () => ({
  ...jest.requireActual('@/services/securedStorage/securedStorage'),
  SecuredStorage: {
    removeItem: jest.fn(),
  },
}));

describe('useRemoveStorageCredentials', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('removes every stored storage credential', async () => {
    (SecuredStorage.removeItem as jest.Mock).mockResolvedValue(undefined);

    await renderHook(() => useRemoveStorageCredentials());

    await waitFor(() => {
      expect(SecuredStorage.removeItem).toHaveBeenCalledTimes(4);
    });
    expect((SecuredStorage.removeItem as jest.Mock).mock.calls.flat()).toEqual([
      SecuredStorageKey.awsAccessToken,
      SecuredStorageKey.awsAccountId,
      SecuredStorageKey.awsConnectionString,
      SecuredStorageKey.awsSecretKey,
    ]);
  });

  it('logs and continues when the keychain fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (SecuredStorage.removeItem as jest.Mock).mockRejectedValue(new Error('keychain'));

    await renderHook(() => useRemoveStorageCredentials());

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        'useRemoveStorageCredentials: Failed to remove credentials',
        expect.any(Error),
      );
    });
    consoleError.mockRestore();
  });
});
