import { cardAsset } from '@/components/game/card-face';
let ready: Promise<void> | undefined;
export function preloadDeck() {
  return (ready ||= Promise.all(
    [
      '/cards/rider-back.jpg',
      '/cards/jester-white.png',
      ...Array.from({ length: 52 }, (_, i) =>
        cardAsset({ id: '', r: (i % 13) + 1, s: Math.floor(i / 13) }),
      ),
    ].map(
      (src) =>
        new Promise<void>((resolve) => {
          const image = new Image();
          image.onload = () => {
            void image
              .decode()
              .catch(() => {})
              .then(resolve);
          };
          image.onerror = () => {
            ready = undefined;
            resolve();
          };
          image.src = src;
        }),
    ),
  ).then(() => undefined));
}
