import { arrangeHand } from './arrange';
import type { Card } from './game';
self.onmessage = (
  event: MessageEvent<{
    hand: Card[];
    wild: number;
    picked: string | null;
    forPoints?: boolean;
  }>,
) => {
  try {
    const { hand, wild, picked } = event.data;
    self.postMessage({
      groups: arrangeHand(hand, wild, picked, event.data.forPoints).map(
        (group) => group.map((c) => c.id),
      ),
    });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error ? error.message : 'Could not arrange this hand.',
    });
  }
};
