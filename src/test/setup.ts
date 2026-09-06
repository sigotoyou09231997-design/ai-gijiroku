// テストの共通の下ごしらえ。
// vite.config.ts の test.globals を true にしてあるので、
// @testing-library/react が各テストのあとに自分で片付けてくれる。

// jsdom には IndexedDB が無い。Dexie を使う画面を描くだけで落ちてしまうので、代わりを入れる。
import "fake-indexeddb/auto";

// jsdom には無いが、画面側が触るもの。無いままだと描画テストが落ちる。
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}
