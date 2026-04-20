// Adapter: Contact の AuthContext(session ベース) を Taskchart が期待する
// { user, loading, accessToken, profile } 形に変換する。
// Taskchart から移植した hooks/components は `useAuth()` をこの形で参照する。
import { useAuth as useContactAuth } from '../../hooks/useAuth';

export const useAuth = () => {
  const { user, session, loading, profile } = useContactAuth();
  return {
    user,
    loading,
    accessToken: session?.access_token ?? null,
    profile,
  };
};
