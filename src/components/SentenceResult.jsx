import { useState } from "react";
import { renderInlineMarkdown } from "./markdown";
import { Icon } from "./icons";
import { CenteredOverlay, rowCheck, smallBtn } from "./ui";

// The "Analyze sentence" answer: first how the sentence works, then any
// mistake, then a few short ideas (the first one open, the rest folded away).
export function SentenceResult({ result, selected, setSelected, onClose, onAdd }) {
  const [open, setOpen] = useState({ 0: true });
  const [more, setMore] = useState({});
  const setSel = (i, patch) => setSelected({ ...selected, [i]: { ...selected[i], ...patch } });
  return (
    <CenteredOverlay onClose={onClose} maxWidth={460}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
        <button aria-label="Close" onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", padding: 4, color: "var(--muted)" }}>
          <Icon.X size={18} />
        </button>
      </div>

      {result.sentenceExplanation && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: "var(--sans)", fontSize: 14.5, lineHeight: 1.6 }}>{renderInlineMarkdown(result.sentenceExplanation)}</div>
        </div>
      )}

      {result.correctionNote && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#FBECE6", border: "1px solid var(--rust)", borderRadius: 8, padding: "9px 11px", marginBottom: 14 }}>
          <Icon.HelpCircle size={15} color="var(--rust)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontFamily: "var(--sans)", fontSize: 13, lineHeight: 1.45, color: "var(--rust)" }}>{renderInlineMarkdown(result.correctionNote)}</span>
        </div>
      )}

      {result.grammarPoints.map((point, i) => {
        const isOpen = !!open[i];
        const sel = selected[i] || {};
        const extra = point.examples || [];
        return (
          <div key={i} style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="checkbox"
                aria-label={"Save " + point.grammarName}
                checked={!!(sel.grammar || sel.main)}
                onChange={(e) => setSel(i, { grammar: e.target.checked, main: e.target.checked })}
                style={{ accentColor: "#8C6FA0", width: 17, height: 17, flexShrink: 0 }}
              />
              <button
                onClick={() => setOpen({ ...open, [i]: !isOpen })}
                aria-expanded={isOpen}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flex: 1, border: "none", background: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
              >
                <span style={{ fontFamily: "var(--serif)", fontSize: 16, color: "var(--ink)" }}>{point.grammarName}</span>
                <Icon.ChevronDown size={16} style={{ color: "var(--muted)", transform: isOpen ? "rotate(180deg)" : "none", flexShrink: 0 }} />
              </button>
            </div>
            {isOpen && (
              <div style={{ marginTop: 8, paddingLeft: 27 }}>
                <div style={{ fontFamily: "var(--sans)", fontSize: 13.5, lineHeight: 1.55, marginBottom: 10 }}>{renderInlineMarkdown(point.explanation)}</div>
                <label style={rowCheck}>
                  <input type="checkbox" checked={!!sel.main} onChange={(e) => setSel(i, { main: e.target.checked })} style={{ accentColor: "#8C6FA0" }} />
                  <span style={{ fontFamily: "var(--sans)", fontSize: 13.5 }}>
                    <b style={{ color: "var(--terracotta)" }}>{renderInlineMarkdown(point.mainExample.da)}</b> — <span style={{ color: "var(--sage)" }}>{point.mainExample.en}</span>
                  </span>
                </label>
                {extra.length > 0 && !more[i] && (
                  <button onClick={() => setMore({ ...more, [i]: true })} style={{ border: "none", background: "none", color: "var(--muted)", fontFamily: "var(--sans)", fontSize: 12.5, padding: "0 0 6px", cursor: "pointer", textDecoration: "underline" }}>
                    Another example
                  </button>
                )}
                {more[i] &&
                  extra.map((ex, j) => (
                    <label key={j} style={rowCheck}>
                      <input
                        type="checkbox"
                        checked={!!(sel.examples && sel.examples[j])}
                        onChange={(e) => setSel(i, { examples: { ...(sel.examples || {}), [j]: e.target.checked } })}
                        style={{ accentColor: "#8C6FA0" }}
                      />
                      <span style={{ fontFamily: "var(--sans)", fontSize: 13.5 }}>
                        <span style={{ color: "var(--terracotta)" }}>{renderInlineMarkdown(ex.da)}</span> — <span style={{ color: "var(--sage)" }}>{ex.en}</span>
                      </span>
                    </label>
                  ))}
              </div>
            )}
          </div>
        );
      })}

      <button onClick={onAdd} style={{ ...smallBtn("var(--rust)"), width: "100%", padding: "10px", fontSize: 14, marginTop: 10 }}>
        Add selected to deck
      </button>
    </CenteredOverlay>
  );
}
