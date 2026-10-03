import { CheckBadgeIcon, Icon, StarIcon } from "./icons";
import { CenteredOverlay } from "./ui";
import { INFO_PAGES } from "../data/infoPages";

const LEGEND_ICONS = {
  star: <StarIcon size={17} filled={false} color="#C9C4B6" />,
  check: <CheckBadgeIcon size={17} filled />,
  bulb: <Icon.Lightbulb size={17} color="#A8A395" />,
  question: <Icon.HelpCircle size={17} color="#A8A395" />,
  tap: <Icon.RotateCcw size={15} color="#A8A395" />,
  speaker: <Icon.Volume2 size={17} color="#C0714D" />,
};

export function InfoSheet({ pageId, onClose }) {
  const page = INFO_PAGES.find((p) => p.id === pageId);
  if (!page) return null;
  return (
    <CenteredOverlay onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontFamily: "var(--serif)", fontSize: 20 }}>{page.title}</div>
        <button onClick={onClose} aria-label="Close" style={{ border: "none", background: "none", color: "var(--muted)", cursor: "pointer", padding: 4, display: "flex" }}>
          <Icon.X size={16} />
        </button>
      </div>
      <div style={{ fontFamily: "var(--sans)", fontSize: 14, lineHeight: 1.55, color: "var(--ink)" }}>
        {(page.paragraphs || []).map((text, i) => (
          <p key={i} style={{ margin: "0 0 12px" }}>
            {text}
          </p>
        ))}
        {(page.sections || []).map(([title, text, legend]) => (
          <details key={title} style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600, listStyle: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              {title}
              <span style={{ flexShrink: 0, display: "flex" }}><Icon.ChevronDown size={14} color="var(--muted)" /></span>
            </summary>
            <div style={{ color: "var(--muted)", marginTop: 6 }}>{text}</div>
            {legend && (
              <div style={{ marginTop: 12 }}>
                {legend.map(([icon, name, desc]) => (
                  <div key={icon} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
                    <span style={{ width: 22, flexShrink: 0, display: "flex", justifyContent: "center", paddingTop: 2 }}>{LEGEND_ICONS[icon]}</span>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--ink)" }}>{name}</div>
                      <div style={{ color: "var(--muted)" }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </details>
        ))}
        {(page.questions || []).map(([q, a]) => (
          <details key={q} style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600, listStyle: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              {q}
              <span style={{ flexShrink: 0, display: "flex" }}><Icon.ChevronDown size={14} color="var(--muted)" /></span>
            </summary>
            <div style={{ color: "var(--muted)", marginTop: 6 }}>{a}</div>
          </details>
        ))}
      </div>
    </CenteredOverlay>
  );
}
