export function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal__panel">
        <h2 className="modal__title">How to play Caravan</h2>
        <ul className="rules">
          <li>Each side builds <b>3 caravans</b>. A caravan is a single suit, ascending or descending.</li>
          <li>Play a number card to an empty caravan, or onto one whose suit matches or whose direction continues.</li>
          <li>Next card must be a different rank than the previous card in that caravan.</li>
          <li><b>Jack</b> removes a card (and any cards attached to it) from any caravan.</li>
          <li><b>Queen</b> flips a caravan's direction and resets its suit to her suit.</li>
          <li><b>King</b> doubles the value of the card it is attached to (stacks with more Kings).</li>
          <li><b>Joker</b> on an Ace clears every other non-face card of that suit; on 2–10 it clears every other card of that value.</li>
          <li>A caravan is <b>sold</b> when its total is between <b>21</b> and <b>26</b>. Highest sold pile wins its pair.</li>
          <li>Win <b>2 of 3</b> caravan pairs to take the game.</li>
        </ul>
        <div className="controls">
          <button type="button" className="btn" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
