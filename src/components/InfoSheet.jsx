import { CheckBadgeIcon, Icon, StarIcon } from "./icons";
import { CenteredOverlay } from "./ui";
import { INFO_PAGES } from "../data/infoPages";

const LEGEND_ICONS = {
  star: <StarIcon size={17} filled={false} color="#C9C4B6" />,
  check: <CheckBadgeIcon size={17} filled />,
  bulb: <Icon.Lightbulb size={17} color="#A8A395" />,
  question: <Icon.HelpCircle size={17} color="#A8A395" />,
  tap: <Icon.RotateCcw size={15} color="#A8A395" />,
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
        {page.legend && (
          <div style={{ marginBottom: 6 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>{page.legendTitle}</div>
            {page.legend.map(([icon, title, text]) => (
              <div key={icon} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
                <span style={{ width: 22, flexShrink: 0, display: "flex", justifyContent: "center", paddingTop: 2 }}>{LEGEND_ICONS[icon]}</span>
                <div>
                  <div style={{ fontWeight: 600 }}>{title}</div>
                  <div style={{ color: "var(--muted)" }}>{text}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {(page.sections || []).map(([title, text]) => (
          <details key={title} style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600, listStyle: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              {title}
              <Icon.ChevronDown size={14} color="var(--muted)" />
            </summary>
            <div style={{ color: "var(--muted)", marginTop: 6 }}>{text}</div>
          </details>
        ))}
        {(page.questions || []).map(([q, a]) => (
          <div key={q} style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 600, marginBottom: 3 }}>{q}</div>
            <div style={{ color: "var(--muted)" }}>{a}</div>
          </div>
        ))}
      </div>
    </CenteredOverlay>
  );
}
