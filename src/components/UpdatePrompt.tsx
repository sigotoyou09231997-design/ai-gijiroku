import { RefreshCw } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * ホーム画面に追加して使っているとき、新しい版に気付けるようにする。
 * Service Worker がキャッシュを持つぶん、放っておくと古い版のまま開き続けてしまう。
 */
export default function UpdatePrompt() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <button
        type="button"
        className="flex items-center gap-2 rounded-full bg-self px-4 py-2.5 text-sm font-semibold text-white shadow-lift"
        onClick={() => void updateServiceWorker(true)}
      >
        <RefreshCw size={15} aria-hidden />
        新しい版があります。タップで更新
      </button>
    </div>
  );
}
