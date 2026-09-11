'use client';
export function RulesPages({
  page,
  setPage,
}: {
  page: number;
  setPage: (page: number) => void;
}) {
  return (
    <>
      <nav className="panel-tabs" aria-label="Rules sections">
        {['Playing', 'Jokers', 'Scoring'].map((label, i) => (
          <button
            key={label}
            className={page === i ? 'chosen' : ''}
            onClick={() => setPage(i)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="rules-page">
        {page === 0 && (
          <>
            <h3>Your turn</h3>
            <p>
              Draw from the closed deck or the top discard, then discard one
              card. Drag to the discard pile or double-click / double-tap a card
              in your hand. Double-tapping never declares.
            </p>
            <h3>A winning hand</h3>
            <p>
              Arrange 13 cards into sets and sequences of at least three cards.
              You normally need two sequences, including one pure sequence. Aces
              can be low or high, but cannot wrap around.
            </p>
            <p>
              Sets use 3–4 equal ranks in different suits. A pure sequence uses
              consecutive cards in one suit without replacements.
            </p>
            <h3>Declare</h3>
            <p>
              With 14 cards on your turn, press Declare. The game checks every
              arrangement and chooses a legal spare card. An incorrect
              declaration costs 80 points.
            </p>
            <p>
              Arrange and groups are available in standard mode. Expert mode
              gives you one hand to reorder yourself.
            </p>
          </>
        )}
        {page === 1 && (
          <>
            <h3>Wild cards</h3>
            <p>
              Printed jokers and cards matching the wild indicator’s rank can
              replace missing cards. A wild-rank card may also be used as its
              own rank and suit in a pure sequence or natural set.
            </p>
            <h3>The opening discard</h3>
            <p>
              A joker dealt face up at the start stays wild. The first player
              may take it and keep it as a joker.
            </p>
            <h3>Dropping a joker</h3>
            <p>
              Discarding a joker from your hand uses your normal discard. It
              permanently loses wild status for this round and shows a{' '}
              <strong>Was Joker</strong> indicator.
            </p>
            <p>
              A wild-rank card keeps its face. A discarded printed joker takes
              the exact rank and suit of the displayed wild indicator. Either
              player may pick it up later, but can only use its face value.
            </p>
            <p>
              You cannot immediately return a card taken from the discard pile.
              A card drawn from the closed deck is yours as soon as it is
              revealed; you may drag it straight to the discard pile.
            </p>
          </>
        )}
        {page === 2 && (
          <>
            <h3>Penalty points</h3>
            <p>
              The winner scores 0. The loser scores unmatched card values,
              capped at 80. A, J, Q and K count as 10; wild jokers count as 0.
            </p>
            <p>
              Without a pure sequence, all cards count. Without two sequences,
              only pure sequences are exempt.
            </p>
            <h3>Natural hand bonus · 2×</h3>
            <p>
              A hand made entirely of natural sets or entirely of natural
              sequences doubles the opponent’s normal penalty, after the
              80-point cap (up to 160). An all-natural sets hand is a special
              valid win without sequences.
            </p>
            <h3>The match</h3>
            <p>
              First drop: 20. Later drop: 40. Invalid declaration: 80. The match
              ends when either total reaches your chosen limit of 101–151. The
              lower total wins.
            </p>
            <p>
              Two decks plus two printed jokers. Play for points, with no
              stakes.
            </p>
          </>
        )}
      </div>
      <p className="art-credit">
        Card artwork:{' '}
        <a
          href="https://github.com/letele/playing-cards"
          target="_blank"
          rel="noreferrer"
        >
          Letele / Adrian Kennard
        </a>{' '}
        · CC0.
      </p>
    </>
  );
}
