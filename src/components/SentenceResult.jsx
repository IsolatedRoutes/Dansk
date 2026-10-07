import { useState } from "react";
import { renderInlineMarkdown } from "./markdown";
import { Icon } from "./icons";
import { CenteredOverlay, smallBtn } from "./ui";

// The "Analyze sentence" answer: a mistake note when there is one, then one or
// two short ideas (the first open), each with a tick, and a quiet line when the
// structure works like English. No headings and no repeated sentence: parts are
// told apart by type and spacing. "More" holds the extra examples.
export function SentenceResult({ result, selected, setSelected, onClose, onAdd }) {
  const [open, setOpen] = useState({ 0: true });
  const [more, setMore] = useState({});
  const muted = { fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 };
  const setSel = (i, patch) => setSelected({ ...selected, [i]: { ...selected[i], ...patch } });
  return (
    <CenteredOverlay onClose={onClose} maxWidth={460}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
        <button aria-label="Close" onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", padding: 4, color: "var(--muted)" }}>
          <Icon.X size={18} />
        </button>
      </div>

      {result.correctionNote && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#FBECE6", border: "1px solid var(--rust)", borderRadius: 8, padding: "9px 11px", marginBottom: 10 }}>
          <Icon.HelpCircle size={15} color="var(--rust)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontFamily: "var(--sans)", fontSize: 13, lineHeight: 1.45, color: "var(--rust)" }}>{renderInlineMarkdown(result.correctionNote)}</span>
        </div>
      )}

      {result.grammarPoints.map((point, i) => {
        const isOpen = !!open[i];
        const sel = selected[i] || {};
        return (
          <div key={i} style={{ borderTop: i === 0 && !result.correctionNote ? "none" : "1px solid var(--line)", padding: "10px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="checkbox"
                aria-label={"Save " + point.title}
                checked={!!sel.grammar}
                onChange={(e) => setSel(i, { grammar: e.target.checked })}
                style={{ accentColor: "#8C6FA0", width: 17, height: 17, flexShrink: 0 }}
              />
              <button
                onClick={() => setOpen({ ...open, [i]: !isOpen })}
                aria-expanded={isOpen}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flex: 1, border: "none", background: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
              >
                <span style={{ fontFamily: "var(--serif)", fontSize: 17, color: "var(--terracotta)" }}>{point.title}</span>
                <Icon.ChevronDown size={16} style={{ color: "var(--muted)", transform: isOpen ? "rotate(180deg)" : "none", flexShrink: 0 }} />
              </button>
            </div>
            {isOpen && (
              <div style={{ marginTop: 8, paddingLeft: 27 }}>
                {point.literal && <div style={{ ...muted, marginBottom: 6 }}>word for word: {point.literal}</div>}
                <div style={{ fontFamily: "var(--sans)", fontSize: 14, lineHeight: 1.6 }}>{renderInlineMarkdown(point.explanation)}</div>
                {point.more && !more[i] && (
                  <button onClick={() => setMore({ ...more, [i]: true })} style={{ border: "none", background: "none", color: "var(--muted)", fontFamily: "var(--sans)", fontSize: 12.5, padding: "8px 0 0", cursor: "pointer", textDecoration: "underline" }}>
                    More
                  </button>
                )}
                {point.more && more[i] && <div style={{ ...muted, color: "var(--ink)", marginTop: 8, whiteSpace: "pre-line" }}>{renderInlineMarkdown(point.more)}</div>}
              </div>
            )}
          </div>
        );
      })}

      {result.sameAsEnglish && <div style={{ ...muted, borderTop: "1px solid var(--line)", paddingTop: 10 }}>{renderInlineMarkdown(result.sameAsEnglish)}</div>}

      <button onClick={onAdd} style={{ ...smallBtn("var(--rust)"), width: "100%", padding: "10px", fontSize: 14, marginTop: 14 }}>
        Add selected to deck
      </button>
    </CenteredOverlay>
  );
}
