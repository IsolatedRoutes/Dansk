import { useState } from "react";
import { renderInlineMarkdown } from "./markdown";
import { Icon } from "./icons";
import { CenteredOverlay, rowCheck, smallBtn } from "./ui";

// The "Analyze sentence" answer: a mistake note when there is one, then the
// few things this text shows about Danish (the first open, the rest folded),
// then a quiet line when the structure works like English. No headings: the
// parts are told apart by type and spacing. Each idea has its own tick.
export function SentenceResult({ result, selected, setSelected, onClose, onAdd }) {
  const [open, setOpen] = useState({ 0: true });
  const setSel = (i, patch) => setSelected({ ...selected, [i]: { ...selected[i], ...patch } });
  const muted = { fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 };
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
        const usual = (point.examples || [])[0];
        return (
          <div key={i} style={{ borderTop: i === 0 && !result.correctionNote ? "none" : "1px solid var(--line)", padding: "10px 0" }}>
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
                {point.rule && <div style={{ fontFamily: "var(--sans)", fontSize: 14, lineHeight: 1.55, marginBottom: 10 }}>{renderInlineMarkdown(point.rule)}</div>}
                <label style={rowCheck}>
                  <input type="checkbox" checked={!!sel.main} onChange={(e) => setSel(i, { main: e.target.checked })} style={{ accentColor: "#8C6FA0" }} />
                  <span style={{ fontFamily: "var(--sans)", fontSize: 13.5, lineHeight: 1.5 }}>
                    <b style={{ color: "var(--terracotta)" }}>{renderInlineMarkdown(point.mainExample.da)}</b>
                    {point.literal && <span style={{ display: "block", ...muted }}>word for word: {point.literal}</span>}
                    <span style={{ display: "block", color: "var(--sage)", fontStyle: "italic" }}>{point.mainExample.en}</span>
                  </span>
                </label>
                <div style={{ fontFamily: "var(--sans)", fontSize: 13.5, lineHeight: 1.55, margin: "4px 0 10px" }}>{renderInlineMarkdown(point.explanation)}</div>
                {usual && (
                  <label style={rowCheck}>
                    <input
                      type="checkbox"
                      checked={!!(sel.examples && sel.examples[0])}
                      onChange={(e) => setSel(i, { examples: { ...(sel.examples || {}), 0: e.target.checked } })}
                      style={{ accentColor: "#8C6FA0" }}
                    />
                    <span style={{ fontFamily: "var(--sans)", fontSize: 13.5, lineHeight: 1.5 }}>
                      <span style={{ color: "var(--terracotta)" }}>{renderInlineMarkdown(usual.da)}</span> — <span style={{ color: "var(--sage)", fontStyle: "italic" }}>{usual.en}</span>
                    </span>
                  </label>
                )}
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
