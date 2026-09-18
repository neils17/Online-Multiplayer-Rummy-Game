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
              Normally you need two sequences, including one pure sequence. An
              all-natural sets hand is a special valid win without sequences.
              Aces can be low or high, but cannot wrap around.
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
              Create and edit groups in either mode. Expert mode removes only
              the automatic Arrange button.
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
              Printed jokers keep their picture and display their new value.
            </p>
            <p>
              You may immediately discard a card taken from either pile. A card
              drawn from the closed deck is yours as soon as it is revealed; you
              may drag it straight to the discard pile.
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
              Without a pure sequence AND a separate second sequence (pure or
              with jokers), the penalty is always 80. Once both are present, all
              valid melds are exempt and only unmatched cards count, capped at
              80.
            </p>
            <h3>Natural hand bonus · 2×</h3>
            <p>
              A hand made entirely of natural sets OR entirely of natural
              sequences doubles the opponent’s normal penalty, after the
              80-point cap (up to 160). All-natural sets are a special valid win
              without sequences. Jokers may count as their own rank and suit,
              but cannot replace missing cards for this bonus.
            </p>
            <h3>The match</h3>
            <p>
              First drop: 20. Later drop: 40. Invalid declaration: 80. The match
              ends when either total reaches your chosen limit of 101–151. The
              lower total wins.
            </p>
            <p>
              Choose one deck with one printed joker or two decks with two. A
              drop is blocked if its penalty would lose the match. Both players
              must press Next round or Play again to continue; the dealer is
              automatically ready. Discards never return to the closed deck. If
              it runs out, drawing from it ends the round without points.
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
